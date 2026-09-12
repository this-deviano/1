/* Undo-able song store (P-06 total undo, P-05 one source of truth).
   Plain useSyncExternalStore — no state libraries. */

import { useSyncExternalStore } from "react";
import type { Clip, InstrumentId, Note, Placement, Song, Track } from "./model";
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
}

let listeners: (() => void)[] = [];

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
};

function makeEmptySong(): Song {
  return {
    schemaVersion: 1,
    id: uid("song"),
    name: "Untitled Song",
    qpm: 120,
    seed: SEED_DEFAULT,
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
