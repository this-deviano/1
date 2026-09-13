/* Dev self-tests (SB-003 §4 parity guard + TASK-017 determinism + TASK-031).

   PARITY — R-2-AMENDED (SB-005): ONE hard gate, the constitution floor
   −96 dBFS. The −80 dBFS ship gate is dead: it was calibrated for an assumed
   preroll/envelope divergence that measurement showed does not exist. Gates
   tighten on evidence; they never widen to pass.

   DETERMINISM — AMM-003 Branch A, ratified SB-005 after the TASK-026 bisect:
   the app-controlled leg (model→event mapping + PRNG streams, no WebAudio) is
   byte-identical; a render that passes through native WebAudio nodes is NOT
   bit-stable on Chromium, and the divergence grows with graph size. Criterion:
   bit-identical OR measured ≤ the per-browser cap, with the measured value,
   the cap and both hashes always displayed (P-07).

   A FAILURE surfaces as LR-0006 in a red inline panel (P-14), never a modal. */

import { engine, EXPORT_SR, PREROLL_S } from "./engine";
import type { Song } from "./model";
import { TPQ } from "./model";
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
  /* R-2-AMENDED (SB-005): ONE gate — the constitution floor. The old −80 dBFS
     "ship gate" is gone. The measured value and the gate are always present,
     so the verdict can never be read alone (P-07). */
  gateAbs: number;
  gateDbfs: number;
  gateMet: boolean;
}

export interface DeterminismResult {
  ok: boolean;
  hashA: string;
  hashB: string;
  bitIdentical: boolean;
  /* Measured divergence, so a FAIL is diagnosable instead of a bare red light
     (P-07). */
  maxAbsDiff: number;
  dbfs: number;
  samples: number;
  /* AMM-003 Branch A (ratified SB-005, TASK-026/031): the criterion for a
     native-WebAudio render is measured ≤ cap. `amended` is true when the run
     passed only via the cap — the ledger records BOTH behaviours, never one. */
  capAbs: number;
  capDbfs: number;
  capMet: boolean;
  amended: boolean;
}

/* PARITY gate — R-2-AMENDED (SB-005). The −80 dBFS ship gate is dead. This is
   the constitution's deterministic-render floor, and it is now the hard gate.
   Measured at SB-004: −126.43 dBFS → passes with ~30 dB margin. */
export const PARITY_GATE_DBFS = -96;
const PARITY_GATE_ABS = 1.5849e-5; // 10^(−96/20)

/* DETERMINISM cap — AMM-003 Branch A (ratified SB-005).
   The app-controlled leg is byte-identical; the residual seen through native
   WebAudio nodes is Chromium's, not ours (TASK-026 bisect). Default cap
   −120 dBFS, calibrated to the app's current reference render (−126.4 dBFS).
   MEASURED CAVEAT (docs/evidence/sb005/): the divergence GROWS with graph
   size — a synthetic ladder was bit-stable at ≤16 voices but −150/−84/−65 dBFS
   at 64/256/1024 voices. −120 dBFS is therefore not a universal constant; the
   self-test always displays the measured value next to it, and M2 must
   re-derive the cap if arrangements grow. Gates tighten on evidence. */
export const DETERMINISM_CAP_DBFS = -120;
const DETERMINISM_CAP_ABS = 1e-6; // 10^(−120/20)

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
  engine.setTestRng(engine.noiseStream(song.seed)); // E-006: ONE derivation, owned by the engine
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
  return {
    ok: gateMet, // R-2-AMENDED: the constitution floor is the gate
    gateMet,
    maxAbsDiff: maxDiff,
    dbfs,
    samples: n,
    liveHash,
    offlineHash,
    bitIdentical,
    gateAbs: PARITY_GATE_ABS,
    gateDbfs: PARITY_GATE_DBFS,
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
  /* AMM-003 Branch A: bit-identical is the app-controlled case; a native-node
     render passes when the measured divergence is at or below the cap. The
     measured value is ALWAYS reported, and `amended` records which rule
     produced the pass so the ledger can carry both behaviours. */
  const capMet = maxDiff <= DETERMINISM_CAP_ABS;
  return {
    ok: bitIdentical || capMet,
    hashA,
    hashB,
    bitIdentical,
    maxAbsDiff: maxDiff,
    dbfs: bitIdentical ? Number.NEGATIVE_INFINITY : 20 * Math.log10(Math.max(maxDiff, 1e-12)),
    samples,
    capAbs: DETERMINISM_CAP_ABS,
    capDbfs: DETERMINISM_CAP_DBFS,
    capMet,
    amended: !bitIdentical && capMet,
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
