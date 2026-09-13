/* Luthier data model — GENESIS §11 (schema v1, STABLE field set per §37).
   All state is one immutable Song; every mutation goes through store.ts. */

export type TrackKind = "audio" | "midi" | "bus" | "master";
export type ClipKind = "midi" | "audio" | "pattern";
export type Surface = "loom" | "circuit" | "lattice" | "ivory" | "desk" | "scope";
export type SnapMode = "off" | "grid" | "adaptive";
export type TimeFormat = "bars" | "minsec";

export interface Note {
  id: string;
  tick: number; // start, in ticks (960 per quarter — §10.2)
  len: number; // length in ticks
  pitch: number; // 0..127
  vel: number; // 1..127
}

export interface Step {
  on: boolean;
  vel: number; // 1..127
}

export interface LatticeRow {
  pitch: number;
  steps: Step[]; // length = pattern length
  mute: boolean;
}

/* Recorded-audio material (TASK-007). The bytes live in OPFS as
   media/<sha>.wav — content-addressed, so identical takes deduplicate and the
   clip carries only a pointer (ADR-0002 rule 3). Additive, optional; synthesis
   clips have no media and legacy Songs simply never had an audio clip. */
export interface ClipMedia {
  sha: string; // sha256 of the WAV bytes — the content address
  bytes: number; // encoded WAV size
  durationS: number; // recorded material, count-in excluded (P-07)
  sampleRate: number;
  channels: number;
}

export interface Clip {
  id: string;
  kind: ClipKind;
  name: string;
  length: number; // ticks
  color: string;
  notes: Note[]; // midi material
  pattern: { length: number; rows: LatticeRow[] } | null; // pattern material
  media?: ClipMedia | null; // recorded audio pointer (additive — see schema-changelog)
}

export interface Placement {
  id: string;
  clip: string; // clip id — one material object, many placements (§5)
  track: string;
  start: number; // ticks
  gain: number; // dB offset, per-placement override (§5.3)
  transpose: number; // semitones, per-placement override
  mute: boolean;
}

export interface UnitState {
  type: string; // device id, e.g. "l-equal" (§13)
  params: Record<string, number>;
  enabled: boolean;
}

export type InstrumentId = "poly" | "drums" | "bass" | "pluck";

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  color: string;
  instrument: InstrumentId; // web-MVP voice mapping (additive, schema-compatible)
  gain: number; // dB
  pan: number; // -1..1
  mute: boolean;
  solo: boolean;
  arm: boolean;
  units: UnitState[];
  sends: { target: string; level: number }[];
}

export interface Marker {
  id: string;
  tick: number;
  name: string;
}

export interface TempoSeg {
  startTick: number;
  qpm: number;
}

export interface Song {
  schemaVersion: 1;
  id: string;
  name: string;
  qpm: number;
  seed: number; // synthesis PRNG seed — E-28 deterministic render (additive, schema-compatible)
  cycle: boolean; // cycle (loop) engaged — musical truth, must survive reload (TASK-013 ruling); additive, schema-compatible
  tracks: Track[];
  clips: Clip[];
  placements: Placement[];
  markers: Marker[];
  loop: { start: number; end: number } | null;
}

/* ---------- helpers ---------- */

export const TPQ = 960;
export const BAR = TPQ * 4;
export const STEPS_PER_BAR = 16;
export const STEP_TICKS = BAR / STEPS_PER_BAR;
/* §10.2 in-session undo caps (R-1(a), SB-004): 10,000 entries OR 512 MB
   estimated serialized, whichever comes first, FIFO eviction. This governs the
   IN-SESSION undo stack only — cross-reload history is the §11.6 autosave
   snapshot store (opfs.ts, cap 100, Time Machine semantics) and is NOT this cap. */
export const MAX_UNDO_STEPS = 10_000;
export const MAX_UNDO_BYTES = 512 * 1024 * 1024;
export const SEED_DEFAULT = 0x9e3779b9; // golden-ratio default seed (E-28)

/* mulberry32 — tiny seeded PRNG for synthesis noise (E-28). Unseeded entropy
   sources are banned in synthesis paths. */
export function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function ticksToBarBeat(tick: number, qpm: number): string {
  const bar = Math.floor(tick / BAR) + 1;
  const beat = Math.floor((tick % BAR) / TPQ) + 1;
  const six = Math.floor(((tick % TPQ) / TPQ) * 4);
  return `${bar}.${beat}.${six}`;
}

export function ticksToMinSec(tick: number, qpm: number): string {
  const seconds = (tick / TPQ) * (60 / qpm);
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${m}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

export function snapTick(tick: number, mode: SnapMode, grid = STEP_TICKS): number {
  if (mode === "off") return tick;
  return Math.round(tick / grid) * grid;
}

export const uid = (() => {
  let n = 0;
  return (prefix: string): string => {
    n += 1;
    return `${prefix}_${Date.now().toString(36)}${n.toString(36)}`;
  };
})();

/* A curated 16-swatch track palette (§6.3.4) — warm hues only, per the G-12 forbidden-list. */
export const TRACK_PALETTE = [
  "#4E6E7E", "#5C6B4A", "#C1551F", "#8A6B48", "#A84E32", "#5E7258",
  "#7C6A55", "#6E5E4E", "#54735E", "#96652E", "#44584F", "#7A4E3E",
  "#5D6B7C", "#6B7052", "#9C5A44", "#3F5D52",
];

/* Device registry — the Workshop Collection (§13). Web-MVP subset, honest DSP. */
export interface DeviceDef {
  id: string;
  name: string;
  kind: "eq" | "comp" | "util" | "delay" | "drive";
  params: { id: string; name: string; min: number; max: number; def: number; step?: number; unit?: string }[];
}

export const DEVICES: DeviceDef[] = [
  {
    id: "l-equal",
    name: "L-Equal",
    kind: "eq",
    params: [
      { id: "lowGain", name: "Low", min: -18, max: 18, def: 0, unit: "dB" },
      { id: "lowFreq", name: "Low F", min: 40, max: 400, def: 120, unit: "Hz" },
      { id: "midGain", name: "Mid", min: -18, max: 18, def: 0, unit: "dB" },
      { id: "midFreq", name: "Mid F", min: 200, max: 5000, def: 1000, unit: "Hz" },
      { id: "highGain", name: "High", min: -18, max: 18, def: 0, unit: "dB" },
      { id: "highFreq", name: "High F", min: 2000, max: 16000, def: 8000, unit: "Hz" },
    ],
  },
  {
    id: "l-comp",
    name: "L-Comp",
    kind: "comp",
    params: [
      { id: "threshold", name: "Thr", min: -60, max: 0, def: -18, unit: "dB" },
      { id: "ratio", name: "Ratio", min: 1, max: 20, def: 4, step: 0.5, unit: ":1" },
      { id: "attack", name: "Atk", min: 1, max: 100, def: 10, unit: "ms" },
      { id: "release", name: "Rel", min: 20, max: 1000, def: 200, unit: "ms" },
      { id: "makeup", name: "Makeup", min: 0, max: 24, def: 0, unit: "dB" },
    ],
  },
  {
    id: "l-delay",
    name: "L-Delay",
    kind: "delay",
    params: [
      { id: "time", name: "Time", min: 1, max: 16, def: 4, step: 1, unit: "/16" },
      { id: "feedback", name: "Fb", min: 0, max: 90, def: 30, unit: "%" },
      { id: "mix", name: "Mix", min: 0, max: 100, def: 25, unit: "%" },
    ],
  },
  {
    id: "l-tape",
    name: "L-Tape",
    kind: "drive",
    params: [
      { id: "drive", name: "Drive", min: 0, max: 100, def: 20, unit: "%" },
      { id: "mix", name: "Mix", min: 0, max: 100, def: 100, unit: "%" },
    ],
  },
  {
    id: "l-util",
    name: "L-Utility",
    kind: "util",
    params: [{ id: "gain", name: "Gain", min: -24, max: 24, def: 0, unit: "dB" }],
  },
];

export function deviceDef(id: string): DeviceDef | undefined {
  return DEVICES.find((d) => d.id === id);
}
