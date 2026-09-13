/* Undo-able song store (P-06 total undo, P-05 one source of truth).
   Plain useSyncExternalStore — no state libraries. */

import { useSyncExternalStore } from "react";
import type { Clip, InstrumentId, Note, Placement, Song, Track } from "./model";
import { engine } from "./engine";
import { toast } from "../ui/primitives";
import { MAX_UNDO_BYTES, MAX_UNDO_STEPS, SEED_DEFAULT, uid } from "./model";

export interface ClipPlacement extends Placement {
  clipObj: Clip;
}

export interface StoreState {
  song: Song;
  selectedTrack: string | null;
  selectedPlacement: string | null;
  surface: string;
  snap: "off" | "grid" | "adaptive";
  theme: "day" | "night";
  follow: boolean;
  dirty: boolean;
  bench: boolean;
  cheat: boolean;
  coachStep: number;
  confirmNewSong: boolean; // armed two-step guard for the one IRREVERSIBLE action (TASK-024)
  future: Song[]; // redo stack
  past: Song[]; // in-session undo stack (§10.2-capped, R-1(a))
  pastSizes: number[]; // estimated serialized bytes per past entry (parallel array)
  futureSizes: number[]; // estimated serialized bytes per future entry
  metronome: boolean; // persisted preference — NOT musical truth, not undoable, not in Song (SB-003 §4 ruling)
  metronomePrefError: string | null; // LR surface for pref-write failure (P-14)
  metronomeSource: "model" | "pref" | "session"; // provenance of the live metronome state
  micError: string | null; // LR-0007/0008 inline surface, never a modal (P-14)
  micArmed: boolean; // capture armed for the current record pass
  monitor: boolean; // input monitoring — DEFAULT OFF (TASK-007; headphone warning on enable)
  lastTake: { sha: string; bytes: number; durationS: number; peak: number } | null; // last recorded audio take (P-07)
}

let listeners: (() => void)[] = [];

const METRONOME_KEY = "luthier.metronome.v1";

function loadMetronomePref(): boolean {
  try {
    return localStorage.getItem(METRONOME_KEY) === "1"; // missing/corrupt = off (fail-safe)
  } catch {
    return false;
  }
}

function saveMetronomePref(on: boolean): boolean {
  try {
    localStorage.setItem(METRONOME_KEY, on ? "1" : "0");
    return true;
  } catch {
    return false; // caller surfaces as LR-#### (P-14)
  }
}

export { METRONOME_KEY, loadMetronomePref, saveMetronomePref };

let state: StoreState = {
  song: makeEmptySong(),
  selectedTrack: null,
  selectedPlacement: null,
  surface: "loom",
  snap: "grid",
  theme: "day",
  follow: false,
  dirty: false,
  bench: false,
  cheat: true,
  coachStep: 0,
  confirmNewSong: false,
  future: [],
  past: [],
  pastSizes: [],
  futureSizes: [],
  metronome: loadMetronomePref(),
  metronomePrefError: null,
  metronomeSource: "pref",
  micError: null,
  micArmed: false,
  monitor: false,
  lastTake: null,
};

function makeEmptySong(): Song {
  return {
    schemaVersion: 1,
    id: uid("song"),
    name: "Untitled Song",
    qpm: 120,
    seed: SEED_DEFAULT,
    cycle: false,
    tracks: [],
    clips: [],
    placements: [],
    markers: [],
    loop: { start: 0, end: 16 * 960 },
  };
}

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.push(l);
  return () => {
    listeners = listeners.filter((x) => x !== l);
  };
}

/* Estimated serialized size of one Song. JSON here is ASCII-dominated, so
   character count is a serviceable byte estimate; the label stays "estimated"
   (P-07). This is the number the §10.2 512 MB cap is measured against. */
export function estimateSerializedBytes(song: Song): number {
  try {
    return JSON.stringify(song).length;
  } catch {
    return 0;
  }
}

/* §10.2 in-session cap (R-1(a)): 10,000 entries OR 512 MB estimated serialized,
   whichever comes first; FIFO eviction of the oldest entries. */
function capStack(past: Song[], sizes: number[]): { past: Song[]; sizes: number[] } {
  let bytes = sizes.reduce((a, b) => a + b, 0);
  let drop = 0;
  while (drop < past.length && (past.length - drop > MAX_UNDO_STEPS || bytes > MAX_UNDO_BYTES)) {
    bytes -= sizes[drop] ?? 0;
    drop += 1;
  }
  if (drop === 0) return { past, sizes };
  return { past: past.slice(drop), sizes: sizes.slice(drop) };
}

function pushPast(past: Song[], sizes: number[], song: Song): { past: Song[]; sizes: number[] } {
  return capStack([...past, song], [...sizes, estimateSerializedBytes(song)]);
}

/* Full-state undo (P-06). Cheap at Song sizes we support in the web MVP. */
export function mutate(fn: (s: Song) => void, label?: string) {
  void label;
  const next = structuredClone(state.song);
  fn(next);
  commitSong(next);
}

/* The one commit path for every Song replacement: the previous Song becomes an
   undoable entry and the redo branch is discarded (standard undo semantics). */
function commitSong(next: Song) {
  const capped = pushPast(state.past, state.pastSizes, state.song);
  state = {
    ...state,
    song: next,
    past: capped.past,
    pastSizes: capped.sizes,
    future: [],
    futureSizes: [],
    dirty: true,
  };
  emit();
}

/* Restore a Song from OUTSIDE the in-session edit path — Load, or a §11.6
   Time Machine snapshot restore. R-1(c): restore PUSHES an undoable entry and
   NEVER clears the stack; the pre-restore Song stays reachable under Ctrl+Z.
   Cross-reload restore is snapshot-granular in the preview layer (R-1(b),
   AMM-002-candidate); op-granularity within a session is the normative target. */
export function restoreSong(song: Song) {
  commitSong(song);
}

/* Boot-time hydration (TASK-006): compose the session from a restored Song plus
   the Time Machine snapshot stack. Snapshot entries are APPENDED to whatever
   the stack already holds — hydration never discards an existing stack (R-1(c)). */
export function hydrateSession(song: Song, past: Song[]) {
  const seeded = past.reduce((acc, s) => pushPast(acc.past, acc.sizes, s), { past: state.past, sizes: state.pastSizes });
  const capped = pushPast(seeded.past, seeded.sizes, state.song);
  state = { ...state, song, past: capped.past, pastSizes: capped.sizes, future: [], futureSizes: [], dirty: false };
  emit();
}

/* Undo-stack telemetry (P-07 honest numbers; R-1(a) is verifiable from here). */
export function undoStats(): { depth: number; bytes: number; cap: number; byteCap: number } {
  return {
    depth: state.past.length,
    bytes: state.pastSizes.reduce((a, b) => a + b, 0),
    cap: MAX_UNDO_STEPS,
    byteCap: MAX_UNDO_BYTES,
  };
}

export function undo(): boolean {
  if (state.past.length === 0) return false;
  const prev = state.past[state.past.length - 1];
  state = {
    ...state,
    song: prev,
    past: state.past.slice(0, -1),
    pastSizes: state.pastSizes.slice(0, -1),
    future: [state.song, ...state.future],
    futureSizes: [estimateSerializedBytes(state.song), ...state.futureSizes],
    dirty: true,
  };
  emit();
  return true;
}

export function redo(): boolean {
  if (state.future.length === 0) return false;
  const next = state.future[0];
  const capped = pushPast(state.past, state.pastSizes, state.song);
  state = {
    ...state,
    song: next,
    past: capped.past,
    pastSizes: capped.sizes,
    future: state.future.slice(1),
    futureSizes: state.futureSizes.slice(1),
    dirty: true,
  };
  emit();
  return true;
}

export function getState(): StoreState {
  return state;
}

export function setState(patch: Partial<StoreState>) {
  state = { ...state, ...patch };
  emit();
}

/* Legacy Songs loaded from localStorage predate song.cycle; normalize once
   so every consumer can read a boolean. Model truth stays authoritative. */
export function normalizeLegacySong(song: Song): Song {
  if (typeof song.cycle === "boolean") return song;
  return { ...song, cycle: false };
}

/* Cycle (loop) engaged is Song model truth (TASK-013 ruling): persisted with
   the song, survives reload, undoable with every other musical field. The
   undo-exclusion question is tracked as an AMM-001 candidate (AG-05 path). */
export function cmdToggleCycle() {
  mutate((s) => {
    s.cycle = !s.cycle;
  });
  if (engine.song !== null) {
    engine.cycle = getState().song.cycle;
    engine.notify();
    toast(getState().song.cycle ? "Cycle on — loop region active." : "Cycle off.", "ember");
  }
}

/* Metronome is a persisted preference (not Song material, not undoable). */
export function cmdToggleMetronome() {
  const next = !state.metronome;
  if (saveMetronomePref(next)) {
    setState({ metronome: next, metronomePrefError: null, metronomeSource: "pref" });
  } else {
    setState({
      metronome: next,
      metronomePrefError: "LR-0005: metronome preference could not be saved (storage quota).",
      metronomeSource: "session",
    });
  }
  if (engine.song !== null) {
    engine.metronome = next;
    engine.notify();
    toast(next ? "Metronome on." : "Metronome off.", "ember");
  }
}

/* One-time hook: backfill the engine's live booleans from model + pref.
   Called by Bench once on mount (surface sync, no authority transfer). */
export function syncEngineFromModel() {
  const st = getState();
  engine.cycle = st.song.cycle;
  engine.metronome = st.metronome;
}

export function pushMetronomePrefError() {
  const err = state.metronomePrefError;
  if (!err) return;
  toast(err, "signal");
  setState({ metronomePrefError: null });
}

export function useStore<T>(selector: (s: StoreState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

/* ---------- domain helpers ---------- */

export function placementsFor(song: Song, trackId: string): ClipPlacement[] {
  const clips = new Map(song.clips.map((c) => [c.id, c]));
  return song.placements
    .filter((p) => p.track === trackId)
    .map((p) => ({ ...p, clipObj: clips.get(p.clip) as Clip }))
    .filter((p) => Boolean(p.clipObj))
    .sort((a, b) => a.start - b.start);
}

export function allPlacements(song: Song): ClipPlacement[] {
  const clips = new Map(song.clips.map((c) => [c.id, c]));
  return song.placements
    .map((p) => ({ ...p, clipObj: clips.get(p.clip) as Clip }))
    .filter((p) => Boolean(p.clipObj));
}

export function createClip(kind: Clip["kind"], name: string, color: string): Clip {
  return {
    id: uid("clp"),
    kind,
    name,
    length: 4 * 960,
    color,
    notes: [],
    pattern:
      kind === "pattern"
        ? { length: 16, rows: [] }
        : null,
  };
}

export function createTrack(
  kind: Track["kind"],
  name: string,
  color: string,
  instrument: InstrumentId = "poly"
): Track {
  return {
    id: uid("trk"),
    kind,
    name,
    color,
    instrument,
    gain: 0,
    pan: 0,
    mute: false,
    solo: false,
    arm: false,
    units: [],
    sends: [],
  };
}

/* Rebuild a beat order: unique per-track ordered list */
export function trackList(song: Song): Track[] {
  return song.tracks;
}
