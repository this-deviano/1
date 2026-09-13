/* Undo-able song store (P-06 total undo, P-05 one source of truth).
   Plain useSyncExternalStore — no state libraries. */

import { useSyncExternalStore } from "react";
import type { Clip, InstrumentId, Note, Placement, Song, Track } from "./model";
import { engine } from "./engine";
import { toast } from "../ui/primitives";
import { MAX_UNDO_STEPS, SEED_DEFAULT, uid } from "./model";

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
  future: Song[]; // redo stack
  past: Song[]; // undo stack
  metronome: boolean; // persisted preference — NOT musical truth, not undoable, not in Song (SB-003 §4 ruling)
  metronomePrefError: string | null; // LR surface for pref-write failure (P-14)
  metronomeSource: "model" | "pref" | "session"; // provenance of the live metronome state
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
  future: [],
  past: [],
  metronome: loadMetronomePref(),
  metronomePrefError: null,
  metronomeSource: "pref",
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

/* Full-state undo (P-06). Cheap at Song sizes we support in the web MVP. */
export function mutate(fn: (s: Song) => void, label?: string) {
  void label;
  const next = structuredClone(state.song);
  fn(next);
  state = {
    ...state,
    song: next,
    past: [...state.past.slice(-MAX_UNDO_STEPS + 1), state.song],
    future: [],
    dirty: true,
  };
  emit();
}

export function undo(): boolean {
  if (state.past.length === 0) return false;
  const prev = state.past[state.past.length - 1];
  state = {
    ...state,
    song: prev,
    past: state.past.slice(0, -1),
    future: [state.song, ...state.future],
    dirty: true,
  };
  emit();
  return true;
}

export function redo(): boolean {
  if (state.future.length === 0) return false;
  const next = state.future[0];
  state = {
    ...state,
    song: next,
    past: [...state.past, state.song],
    future: state.future.slice(1),
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
