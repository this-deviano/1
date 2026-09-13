/* Dev/verification console API — `window.app` (installed by the Bench).
   This is the same seam as `app.selftest.*` (SB-003 §4): programmatic access to
   the real model + engine so the headless harness in tests/preview/ can observe
   the app instead of re-implementing it. It exposes NO new authority — every
   function reads or calls an existing command, and the two writers
   (history.restore, freshState) call the same code paths the UI does.

   Genesis §24: this is the seed of the test pyramid, not a sandbox-only artifact. */

import type { Song } from "./model";
import { getState, undoStats } from "./store";
import { engine, PREROLL_S } from "./engine";
import { getStatus } from "./status";
import { cmdPersistHistory, cmdRestoreSnapshot, cmdToggleStep } from "./actions";
import { selfTestDeterminismRuns } from "./selftest";
import { readHistory, readMedia, sha256Hex, usageEstimate, opfsAvailable } from "./opfs";
import { micCapture } from "./mic";
import { analyzeWav } from "./forensics";

export interface WavProbe {
  bytes: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  frames: number;
  durationS: number;
  peak: number;
  nonZeroSamples: number;
  sha256: string;
}

/** Parse a 32-bit-float WAV written by our own encoder and report honest numbers. */
async function probeWav(bytes: ArrayBuffer): Promise<WavProbe> {
  const view = new DataView(bytes);
  const channels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const bitsPerSample = view.getUint16(34, true);
  const dataBytes = view.getUint32(40, true);
  const frames = Math.floor(dataBytes / 4 / Math.max(1, channels));
  const data = new Float32Array(bytes, 44, frames * channels);
  let peak = 0;
  let nonZeroSamples = 0;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]);
    if (a > peak) peak = a;
    if (data[i] !== 0) nonZeroSamples += 1;
  }
  return {
    bytes: bytes.byteLength,
    channels,
    sampleRate,
    bitsPerSample,
    frames,
    durationS: frames / sampleRate,
    peak,
    nonZeroSamples,
    sha256: await sha256Hex(new Uint8Array(bytes)),
  };
}

/** Clear every luthier.* localStorage key and the OPFS root (P-02 fresh state). */
async function freshState(): Promise<void> {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("luthier.")) localStorage.removeItem(key);
  }
  if (opfsAvailable()) {
    const dir = await navigator.storage.getDirectory();
    for (const name of ["song.json", "song.json.tmp", "manifest.json"] as const) {
      await dir.removeEntry(name).catch(() => undefined);
    }
    await dir.removeEntry("history", { recursive: true }).catch(() => undefined);
    await dir.removeEntry("media", { recursive: true }).catch(() => undefined);
  }
}

const api = {
  /** The live Song (deep copy so callers cannot mutate model truth). */
  song: (): Song => structuredClone(getState().song),
  /** Selected ids + surface, for scripted navigation assertions. */
  ui: () => ({
    surface: getState().surface,
    selectedTrack: getState().selectedTrack,
    selectedPlacement: getState().selectedPlacement,
    theme: getState().theme,
    bench: getState().bench,
    dirty: getState().dirty,
    micError: getState().micError,
    micArmed: getState().micArmed,
    monitor: getState().monitor,
    lastTake: getState().lastTake,
  }),
  /** Serialized size of the current Song (bytes, JSON) — storage evidence. */
  songBytes: (): number => JSON.stringify(getState().song).length,
  engine: () => ({
    ctxState: engine.ctx ? engine.ctx.state : "none",
    sampleRate: engine.ctx ? engine.ctx.sampleRate : 0,
    playing: engine.playing,
    recording: engine.recording,
    metronome: engine.metronome,
    cycle: engine.cycle,
    latencyMs: getStatus().latencyMs,
    underruns: getStatus().underruns,
    clipHold: getStatus().clipHold,
    // TASK-030: the last-100-events underrun ring, so a stall is diagnosable
    // from the harness instead of being a bare counter (P-07/P-14).
    xruns: engine.xruns(),
    playheadTick: getStatus().playheadTick,
  }),
  undo: { stats: () => undoStats() },
  history: {
    list: async () => {
      const hist = await readHistory();
      if (!hist.ok) return { ok: false as const, error: hist.error, count: 0, ids: [] as string[] };
      if (!hist.value) return { ok: true as const, count: 0, ids: [] as string[] };
      return {
        ok: true as const,
        count: 1 + hist.value.past.length,
        ids: [hist.value.song.id, ...hist.value.past.map((s) => s.id)],
      };
    },
    restore: (index: number) => cmdRestoreSnapshot(index),
    /** Force one §11.6 snapshot now (autosave otherwise waits 30 s). */
    snapshot: () => cmdPersistHistory(),
  },
  /** Non-gate diagnostic: N renders of one Song, every hash + divergence (AMM-003). */
  diag: { determinismRuns: (runs: number) => selfTestDeterminismRuns(runs) },
  storage: {
    usage: async () => {
      const res = await usageEstimate();
      return res.ok ? { ok: true as const, usage: res.value.usage, quota: res.value.quota } : { ok: false as const, error: res.error };
    },
    manifest: async () => {
      if (!opfsAvailable()) return { ok: false as const, error: "OPFS unavailable" };
      const dir = await navigator.storage.getDirectory();
      const handle = await dir.getFileHandle("manifest.json", { create: false }).catch(() => null);
      if (!handle) return { ok: true as const, history: 0, media: 0 };
      const m = JSON.parse(await (await handle.getFile()).text()) as { history?: unknown[]; media?: unknown[] };
      return { ok: true as const, history: m.history?.length ?? 0, media: m.media?.length ?? 0 };
    },
    probeMedia: async (sha: string) => {
      const res = await readMedia(sha);
      if (!res.ok) return { ok: false as const, error: res.error };
      return { ok: true as const, probe: await probeWav(res.value) };
    },
  },
  mic: () => ({ live: micCapture.live, sampleRate: micCapture.sampleRate }),
  /** Scripted edits — same command path the Lattice buttons use, no new authority. */
  edit: {
    toggleStep: (clipId: string, pitch: number, stepIdx: number) => cmdToggleStep(clipId, pitch, stepIdx),
  },
  /** TASK-047/048 — the pure forensics module applied to real bytes.
      Read-only by construction: the song path renders through the SAME
      `engine.renderWav` the Rail's Export command calls, and the media path
      reads through the SAME `readMedia` the harness already trusts. No new
      authority, and no write path anywhere near the model. */
  forensics: {
    renderReference: async (expectedTrimMs: number = PREROLL_S * 1000) => {
      try {
        const blob = await engine.renderWav(getState().song);
        const report = analyzeWav("reference-song-export", await blob.arrayBuffer(), { expectedTrimMs });
        return { ok: true as const, report };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "offline render failed" };
      }
    },
    media: async (sha: string, expectedTrimMs = 0) => {
      const res = await readMedia(sha);
      if (!res.ok) return { ok: false as const, error: res.error };
      const report = analyzeWav(`media/${sha.slice(0, 12)}.wav`, res.value, { expectedTrimMs });
      return { ok: true as const, report };
    },
  },
  freshState,
};

export type DevApi = typeof api;

export function installDevApi(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { app?: Record<string, unknown> };
  w.app = w.app ?? {};
  // app.selftest is installed separately (status.ts) — merge, never clobber.
  w.app.undo = api.undo;
  w.app.engine = api.engine;
  w.app.ui = api.ui;
  w.app.song = api.song;
  w.app.songBytes = api.songBytes;
  w.app.history = api.history;
  w.app.diag = api.diag;
  w.app.storage = api.storage;
  w.app.mic = api.mic;
  w.app.edit = api.edit;
  w.app.forensics = api.forensics;
  w.app.freshState = api.freshState;
}
