/* Dev self-tests (SB-003 §4 parity guard + TASK-017 determinism).
   The guard renders the reference song through BOTH schedulers — live
   look-ahead semantics (OfflineAudioContext) and the offline fast-forward —
   then compares: |max abs diff| ≤ −96 dBFS (constitution) or bit-identical.
   Dev gate here is −80 dBFS to absorb the documented preroll/envelope
   residual. A FAILURE surfaces as LR-0006 in a red inline panel (P-14). */

import { engine, EXPORT_SR, PREROLL_S } from "./engine";
import type { Song } from "./model";
import { TPQ, SEED_DEFAULT } from "./model";
import { seedStream, STREAM_TAGS } from "./seed";
import { makeFactorySong } from "./factory";

async function digestBuffer(buf: AudioBuffer): Promise<string> {
  const data = buf.getChannelData(0);
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface ParityResult {
  ok: boolean;
  maxAbsDiff: number;
  dbfs: number; // MEASURED max|Δ| in dBFS (−Infinity when bit-identical)
  samples: number;
  liveHash: string;
  offlineHash: string;
  bitIdentical: boolean;
  /* R-2 dual threshold: what we ship against, and what the constitution says.
     Both numbers are always present so the verdict can never be read alone. */
  gateAbs: number;
  gateDbfs: number;
  floorAbs: number;
  floorDbfs: number;
  gateMet: boolean;
  floorMet: boolean;
}

export interface DeterminismResult {
  ok: boolean;
  hashA: string;
  hashB: string;
  bitIdentical: boolean;
  /* Measured divergence, so a FAIL is diagnosable instead of a bare red light
     (P-07). `ok` stays BIT-EXACT — the tolerance question is a constitution
     matter (AMM-003-candidate), never a silent gate widening. */
  maxAbsDiff: number;
  dbfs: number;
  samples: number;
}

/* R-2 dual threshold (SB-004).
   SHIP gate … −80 dBFS (1e-4): absorbs the documented preroll/envelope path
     divergence between the live-semantics leg and the offline fast-forward leg.
   FLOOR … −96 dBFS (1.5849e-5): the constitution's deterministic-render bar,
     and the M2-exit target (TASK-023: eliminate the divergence rather than
     widen the gate).
   The verdict ALWAYS carries the measured value and BOTH thresholds (P-07).
   Never widen a gate to make a test pass: if the floor is not met, `floorMet`
   says so and the console/panel report it loudly (LR-0006). */
export const PARITY_GATE_DBFS = -80;
export const PARITY_FLOOR_DBFS = -96;
const PARITY_GATE_ABS = 1e-4; // ≈ −80 dBFS
const PARITY_FLOOR_ABS = 1.5849e-5; // 10^(−96/20)

export async function selfTestRenderParity(): Promise<ParityResult> {
  const song: Song = engine.song ?? makeFactorySong();
  const sr = EXPORT_SR;
  const secPerTick = 60 / song.qpm / TPQ;
  const tail = 1.5;
  const lenTicks = song.placements.reduce((m, p) => {
    const clip = song.clips.find((c) => c.id === p.clip);
    if (!clip) return m;
    return Math.max(m, p.start + engine.effectiveClipLength(clip));
  }, song.cycle && song.loop ? song.loop.end : 0);
  const total = Math.max(1, lenTicks * secPerTick + tail);

  // leg 1 — LIVE scheduler semantics: transport math (startCtxTime = preroll,
  // per-window fire) on an OfflineAudioContext, via the same materialEvents.
  const ctxLive = new OfflineAudioContext(2, Math.ceil(total * sr), sr);
  const savedCtx = engine.ctx;
  const savedComp = engine.comp;
  const savedRng = engine.rngForTest();
  // The guard's live leg must be the SAME bus the user hears: comp → master → out.
  const { comp: compL, master: masterL } = engine.buildMasterGraph(ctxLive);
  compL.connect(masterL);
  masterL.connect(ctxLive.destination);
  engine.ctx = ctxLive as unknown as AudioContext;
  engine.comp = compL;
  engine.setTestRng(seedStream(song.seed ?? SEED_DEFAULT, STREAM_TAGS.NOISE));
  engine.startTick = 0;
  engine.startCtxTime = PREROLL_S;
  const liveEvents = engine.materialEvents(song, 0, lenTicks, secPerTick);
  for (const ev of liveEvents) {
    const t = engine.startCtxTime + (ev.time - engine.startTick * secPerTick);
    engine.fireVoice({ ...ev, time: t }, ctxLive, compL); // no clamp — offline leg starts at t=0
  }
  engine.ctx = savedCtx;
  engine.comp = savedComp;
  engine.setTestRng(savedRng);
  const bufLive = await ctxLive.startRendering();

  // leg 2 — OFFLINE fast-forward (production export path, unchanged)
  const bufOffline = await engine.renderBuffer(song, tail);

  const live = bufLive.getChannelData(0);
  const offline = bufOffline.getChannelData(0);
  const n = Math.min(live.length, offline.length);
  let maxDiff = 0;
  let bitIdentical = live.length === offline.length;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(live[i] - offline[i]);
    if (d > maxDiff) maxDiff = d;
    if (d !== 0) bitIdentical = false;
  }
  const dbfs = bitIdentical ? Number.NEGATIVE_INFINITY : 20 * Math.log10(Math.max(maxDiff, 1e-12));
  const liveHash = await digestBuffer(bufLive);
  const offlineHash = await digestBuffer(bufOffline);
  const gateMet = bitIdentical || maxDiff <= PARITY_GATE_ABS;
  const floorMet = bitIdentical || maxDiff <= PARITY_FLOOR_ABS;
  return {
    ok: gateMet, // the SHIP gate decides pass/fail; the floor is reported, not substituted
    gateMet,
    floorMet,
    maxAbsDiff: maxDiff,
    dbfs,
    samples: n,
    liveHash,
    offlineHash,
    bitIdentical,
    gateAbs: PARITY_GATE_ABS,
    gateDbfs: PARITY_GATE_DBFS,
    floorAbs: PARITY_FLOOR_ABS,
    floorDbfs: PARITY_FLOOR_DBFS,
  };
}

function channelDiff(a: AudioBuffer, b: AudioBuffer): { maxDiff: number; samples: number } {
  const da = a.getChannelData(0);
  const db = b.getChannelData(0);
  const n = Math.min(da.length, db.length);
  let maxDiff = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(da[i] - db[i]);
    if (d > maxDiff) maxDiff = d;
  }
  return { maxDiff, samples: n };
}

export async function selfTestDeterminism(): Promise<DeterminismResult> {
  const song: Song = engine.song ?? makeFactorySong();
  const a = await engine.renderBuffer(song, 1.5);
  const b = await engine.renderBuffer(song, 1.5);
  const hashA = await digestBuffer(a);
  const hashB = await digestBuffer(b);
  const { maxDiff, samples } = channelDiff(a, b);
  const bitIdentical = hashA === hashB;
  return {
    ok: bitIdentical,
    hashA,
    hashB,
    bitIdentical,
    maxAbsDiff: maxDiff,
    dbfs: bitIdentical ? Number.NEGATIVE_INFINITY : 20 * Math.log10(Math.max(maxDiff, 1e-12)),
    samples,
  };
}

/** Diagnostic (TASK-021 harness), NOT a gate: render the same Song N times and
    report every hash plus each run's max|Δ| against run 0. Separates a one-time
    warm-up artifact from true nondeterminism, so the AMM-003 question can be
    answered with numbers instead of opinions (P-07). */
export async function selfTestDeterminismRuns(runs: number): Promise<{ hashes: string[]; maxDiffVsFirst: number[]; sameAsFirst: boolean[] }> {
  const song: Song = engine.song ?? makeFactorySong();
  const n = Math.max(2, Math.min(6, Math.floor(runs)));
  const bufs: AudioBuffer[] = [];
  for (let i = 0; i < n; i++) bufs.push(await engine.renderBuffer(song, 1.5));
  const hashes: string[] = [];
  for (const b of bufs) hashes.push(await digestBuffer(b));
  const maxDiffVsFirst = bufs.map((b) => channelDiff(bufs[0], b).maxDiff);
  return { hashes, maxDiffVsFirst, sameAsFirst: hashes.map((h) => h === hashes[0]) };
}
