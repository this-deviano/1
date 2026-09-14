/* Dev/verification console API — `window.app` (installed by the Bench).
   This is the same seam as `app.selftest.*` (SB-003 §4): programmatic access to
   the real model + engine so the headless harness in tests/preview/ can observe
   the app instead of re-implementing it. It exposes NO new authority — every
   function reads or calls an existing command, and the two writers
   (history.restore, freshState) call the same code paths the UI does.

   Genesis §24: this is the seed of the test pyramid, not a sandbox-only artifact. */

import type { Song } from "./model";
import { getState, setState, undoStats } from "./store";
import { engine, PREROLL_S, wavBlob, EXPORT_TARGET_DBFS } from "./engine";
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
  // FND-05 (SB-007-E): tombstone BEFORE the wipe. The Bench's P-20
  // beforeunload flush writes the legacy mirror whenever dirty, so a page
  // reload immediately after this reset would re-persist the wiped Song and
  // the next boot's migrateFromLocalStorage would resurrect it (the exact
  // resurrection P-02's fresh state forbids). dirty=false silences the flush.
  setState({ dirty: false });
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
  /** R-8c (TASK-050): `armedWindowMs` is the real capture-span from arming to the
      last take, measured inside the capture (not inferred by the harness). */
  mic: () => ({ live: micCapture.live, sampleRate: micCapture.sampleRate, armedWindowMs: micCapture.armedWindowMs }),
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
    renderReference: async (expectedTrimMs: number = PREROLL_S * 1000, opts?: { peakPolicy?: "as-is" | "normalize"; targetDbfs?: number }) => {
      try {
        const result = await engine.renderWav(getState().song, 1.5, opts ?? {});
        const report = analyzeWav("reference-song-export", await result.blob.arrayBuffer(), { expectedTrimMs });
        return {
          ok: true as const,
          report,
          guard: {
            policy: result.policy,
            targetDbfs: result.targetDbfs,
            samplePeak: result.samplePeak,
            measuredPeakDbfs: result.measuredPeakDbfs,
            overFullScale: result.overFullScale,
            scaledByDb: result.scaledByDb,
            warning: result.warning,
          },
        };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "offline render failed" };
      }
    },
    /** R-9 (TASK-051) — the peak guard measured end-to-end. Renders once per
        policy, re-reads both files through the INDEPENDENT probeWav reader, and
        proves the as-is path is structurally an identity transform by encoding
        ONE buffer both ways (E-006 spirit: the proof cannot drift from the code
        because it calls the code). */
    peakGuard: async (targetDbfs: number = EXPORT_TARGET_DBFS) => {
      try {
        const song = getState().song;
        const asIs = await engine.renderWav(song, 1.5, { peakPolicy: "as-is" });
        const normalized = await engine.renderWav(song, 1.5, { peakPolicy: "normalize", targetDbfs });
        const asIsProbe = await probeWav(await asIs.blob.arrayBuffer());
        const normalizedProbe = await probeWav(await normalized.blob.arrayBuffer());
        // structural identity: the SAME buffer through the guard's as-is branch
        // and through the raw pre-guard encoder. One buffer ⇒ exact byte compare.
        const buf = await engine.renderBuffer(song, 1.5);
        const guardBytes = new Uint8Array(await engine.encodeWithPeakGuard(buf, { peakPolicy: "as-is" }).blob.arrayBuffer());
        const directBytes = new Uint8Array(await wavBlob(buf).arrayBuffer());
        let identical = guardBytes.length === directBytes.length;
        if (identical) {
          for (let i = 0; i < guardBytes.length; i++) {
            if (guardBytes[i] !== directBytes[i]) {
              identical = false;
              break;
            }
          }
        }
        return {
          ok: true as const,
          asIs: {
            samplePeak: asIs.samplePeak,
            measuredPeakDbfs: asIs.measuredPeakDbfs,
            overFullScale: asIs.overFullScale,
            scaledByDb: asIs.scaledByDb,
            warning: asIs.warning,
            probe: asIsProbe,
          },
          normalize: {
            targetDbfs,
            scaledByDb: normalized.scaledByDb,
            requestedFromPeak: normalized.samplePeak,
            probe: normalizedProbe,
          },
          asIsIdentity: { identical, bytes: guardBytes.length, shaGuard: await sha256Hex(guardBytes), shaDirect: await sha256Hex(directBytes) },
        };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "peak-guard render failed" };
      }
    },
    /** R-9 evidence fixture seam: the as-is rendered WAV as base64, so the harness
        can carve a committed excerpt of the exact clipping region (P-07: the
        bytes on record are the bytes the guard would deliver untouched). */
    asIsWavBase64: async () => {
      try {
        const res = await engine.renderWav(getState().song, 1.5, { peakPolicy: "as-is" });
        const buf = new Uint8Array(await res.blob.arrayBuffer());
        const parts: string[] = [];
        for (let i = 0; i < buf.length; i += 0x8000) parts.push(String.fromCharCode(...buf.subarray(i, i + 0x8000)));
        return {
          ok: true as const,
          base64: btoa(parts.join("")),
          bytes: buf.length,
          sha256: await sha256Hex(buf),
          samplePeak: res.samplePeak,
          measuredPeakDbfs: res.measuredPeakDbfs,
        };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "as-is render failed" };
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
