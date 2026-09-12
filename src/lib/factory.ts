/* Factory Song (P-22), Crates content (§8.7), and Song persistence (§11).
   Offline-first (P-18): localStorage; export/import as JSON files. */

import type { Clip, LatticeRow, Note, Song, Track } from "./model";
import { SEED_DEFAULT, uid } from "./model";
import { TRACK_PALETTE } from "./model";

/* ---------- Crates ---------- */

export interface CrateItem {
  id: string;
  name: string;
  kind: "midi" | "pattern" | "device" | "track";
  desc: string;
  payload?: string; // device id or track kind for non-material items
}

export const FACTORY_CRATE: CrateItem[] = [
  { id: "f-808", name: "TR-808 Kit", kind: "pattern", desc: "Analog drum kit · 1 bar" },
  { id: "f-909", name: "TR-909 Kit", kind: "pattern", desc: "House drum kit · 1 bar" },
  { id: "f-keys", name: "Verse Keys", kind: "midi", desc: "Piano chords · 4 bars · C minor" },
  { id: "f-bass", name: "Root Bass", kind: "midi", desc: "Sub bass line · 2 bars" },
  { id: "f-arp", name: "Pluck Arp 118", kind: "midi", desc: "16th arpeggio · C minor" },
  { id: "d-equal", name: "L-Equal · Flat", kind: "device", payload: "l-equal", desc: "Workshop Collection EQ" },
  { id: "d-comp", name: "L-Comp · 4:1", kind: "device", payload: "l-comp", desc: "Workshop Collection compressor" },
  { id: "d-delay", name: "L-Delay · 1/4", kind: "device", payload: "l-delay", desc: "Workshop Collection delay" },
  { id: "d-tape", name: "L-Tape · Warm", kind: "device", payload: "l-tape", desc: "Workshop Collection saturation" },
  { id: "d-util", name: "L-Utility", kind: "device", payload: "l-util", desc: "Gain · phase · mono" },
];

/* ---------- note factories ---------- */

export function notesFromPattern(rows: { pitch: number; steps: number[]; vel?: number }[], stepTicks: number): Note[] {
  const out: Note[] = [];
  for (const r of rows) {
    for (const s of r.steps) {
      out.push({ id: uid("n"), tick: s * stepTicks, len: stepTicks, pitch: r.pitch, vel: r.vel ?? 100 });
    }
  }
  return out;
}

const DRUMS: Record<string, number> = { kick: 36, snare: 38, hat: 42, open: 46, clap: 39, ride: 51 };
const DRUM_LABEL: Record<string, string> = { kick: "Kick", snare: "Snare", hat: "Hat", open: "Open Hat", clap: "Clap", ride: "Ride" };
export { DRUMS, DRUM_LABEL };

function patternClip(name: string, rows: { pitch: number; steps: number[]; vel?: number }[], color: string): Clip {
  return {
    id: uid("clp"),
    kind: "pattern",
    name,
    length: 4 * 960,
    color,
    notes: notesFromPattern(rows, 960 / 4),
    pattern: {
      length: 16,
      rows: rows.map<LatticeRow>((r) => ({
        pitch: r.pitch,
        mute: false,
        steps: Array.from({ length: 16 }, (_, i) => ({
          on: r.steps.includes(i),
          vel: r.vel ?? (i === 0 ? 118 : 100),
        })),
      })),
    },
  };
}

function midiClip(name: string, notes: Note[], color: string): Clip {
  return { id: uid("clp"), kind: "midi", name, length: 4 * 960, color, notes, pattern: null };
}

export function patternRowsOf(clip: Clip): { label: string; pitch: number; steps: number[] }[] {
  if (!clip.pattern) {
    const pitches = [...new Set(clip.notes.map((n) => n.pitch))].sort((a, b) => b - a);
    return pitches.map((p) => ({
      label: p >= 35 && p <= 52 ? Object.entries(DRUMS).find(([, v]) => v === p)?.[0] ?? String(p) : String(p),
      pitch: p,
      steps: clip.notes.filter((n) => n.pitch === p).map((n) => Math.round(n.tick / (960 / 4))),
    }));
  }
  return clip.pattern.rows.map((r) => ({
    label: DRUM_LABEL[Object.entries(DRUMS).find(([, v]) => v === r.pitch)?.[0] ?? ""] ?? String(r.pitch),
    pitch: r.pitch,
    steps: r.steps.map((s, i) => (s.on ? i : -1)).filter((i) => i >= 0),
  }));
}

/* Kit content (honest geometry — 1 bar, 16 steps) */

function kit808(): { pitch: number; steps: number[]; vel?: number }[] {
  return [
    { pitch: DRUMS.kick, steps: [0, 6, 10], vel: 118 },
    { pitch: DRUMS.snare, steps: [4, 12], vel: 108 },
    { pitch: DRUMS.hat, steps: [0, 2, 4, 6, 8, 10, 12, 14], vel: 72 },
    { pitch: DRUMS.open, steps: [14], vel: 84 },
  ];
}
function kit909(): { pitch: number; steps: number[]; vel?: number }[] {
  return [
    { pitch: DRUMS.kick, steps: [0, 4, 8, 12], vel: 120 },
    { pitch: DRUMS.clap, steps: [4, 12], vel: 96 },
    { pitch: DRUMS.hat, steps: [2, 6, 10, 14], vel: 78 },
  ];
}

export function crateClip(item: CrateItem, color: string): Clip | null {
  const step = 960 / 4;
  switch (item.id) {
    case "f-808":
      return patternClip("TR-808 Kit", kit808(), color);
    case "f-909":
      return patternClip("TR-909 Kit", kit909(), color);
    case "f-keys": {
      const bar = 960 * 4;
      const notes: Note[] = [];
      const chords: [number, number[]][] = [
        [0, [48, 60, 63, 67]],
        [bar, [44, 56, 60, 63]],
        [bar * 2, [46, 58, 62, 65]],
        [bar * 3, [43, 55, 59, 62]],
      ];
      for (const [t, pitches] of chords) {
        for (const p of pitches) {
          notes.push({ id: uid("n"), tick: t, len: bar - 60, pitch: p, vel: p >= 55 ? 96 : 88 });
        }
      }
      return midiClip("Verse keys", notes, color);
    }
    case "f-bass": {
      const bar = 960 * 4;
      const notes: Note[] = [
        { id: uid("n"), tick: 0, len: 720, pitch: 36, vel: 104 },
        { id: uid("n"), tick: 720, len: 240, pitch: 36, vel: 84 },
        { id: uid("n"), tick: bar, len: 720, pitch: 32, vel: 104 },
        { id: uid("n"), tick: 2 * bar, len: 960, pitch: 34, vel: 104 },
        { id: uid("n"), tick: 3 * bar, len: 720, pitch: 31, vel: 100 },
      ];
      return midiClip("Root bass", notes, color);
    }
    case "f-arp": {
      const notes: Note[] = [];
      const seq = [60, 63, 67, 70, 72, 70, 67, 63];
      for (let i = 0; i < 32; i++) {
        notes.push({ id: uid("n"), tick: i * step, len: step - 20, pitch: seq[i % seq.length], vel: 78 });
      }
      return midiClip("Pluck arp", notes, color);
    }
    default:
      return null;
  }
}

/* ---------- factory Song (P-22) ---------- */

export function makeFactorySong(): Song {
  const audio: Track = {
    id: uid("trk"),
    kind: "audio",
    name: "Voice",
    color: TRACK_PALETTE[0],
    instrument: "poly",
    gain: 0,
    pan: 0,
    mute: false,
    solo: false,
    arm: true,
    units: [],
    sends: [],
  };
  const keys: Track = {
    id: uid("trk"),
    kind: "midi",
    name: "Keys",
    color: TRACK_PALETTE[1],
    instrument: "poly",
    gain: -3,
    pan: 0,
    mute: false,
    solo: false,
    arm: true,
    units: [],
    sends: [],
  };
  const drums: Track = {
    id: uid("trk"),
    kind: "midi",
    name: "Drums",
    color: TRACK_PALETTE[2],
    instrument: "drums",
    gain: -2,
    pan: 0,
    mute: false,
    solo: false,
    arm: false,
    units: [],
    sends: [],
  };

  const keysClip = crateClip(FACTORY_CRATE[2], keys.color) as Clip;
  const drumClip = crateClip(FACTORY_CRATE[0], drums.color) as Clip;

  const placements = [
    { id: uid("plc"), clip: keysClip.id, track: keys.id, start: 0, gain: 0, transpose: 0, mute: false },
    { id: uid("plc"), clip: drumClip.id, track: drums.id, start: 0, gain: 0, transpose: 0, mute: false },
  ];

  return {
    schemaVersion: 1,
    id: uid("song"),
    name: "First Light",
    qpm: 118,
    seed: SEED_DEFAULT,
    tracks: [drums, keys, audio],
    clips: [drumClip, keysClip],
    placements,
    markers: [{ id: uid("mrk"), tick: 0, name: "Top" }],
    loop: { start: 0, end: 4 * 960 },
  };
}

/* ---------- persistence (§11.6 spirit: validated load, atomic-ish write) ---------- */

const KEY = "luthier.song.v1";

export function saveSong(song: Song): { ok: true } | { ok: false; error: string } {
  try {
    localStorage.setItem(KEY, JSON.stringify(song));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "storage write failed" };
  }
}

export function loadSong(): Song | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Song;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.tracks) || !Array.isArray(parsed.clips)) return null;
    parsed.seed = (parsed as { seed?: number }).seed ?? SEED_DEFAULT; // legacy songs predate seed (E-28)
    return parsed;
  } catch {
    return null;
  }
}

export function clearSong() {
  localStorage.removeItem(KEY);
}
