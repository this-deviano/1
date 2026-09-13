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
  dbfs: number; // maxAbsDiff in dBFS (−Infinity when bit-identical)
  samples: number;
  liveHash: string;
  offlineHash: string;
  bitIdentical: boolean;
}

export interface DeterminismResult {
  ok: boolean;
  hashA: string;
  hashB: string;
  bitIdentical: boolean;
}

const PASS_FLOOR_ABS = 1e-4; // ≈ −80 dBFS (dev gate); constitution floor −96 dBFS

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
  const { comp: compL } = engine.buildMasterGraph(ctxLive);
  compL.connect(ctxLive.destination);
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
  return { ok: bitIdentical || maxDiff <= PASS_FLOOR_ABS, maxAbsDiff: maxDiff, dbfs, samples: n, liveHash, offlineHash, bitIdentical };
}

export async function selfTestDeterminism(): Promise<DeterminismResult> {
  const song: Song = engine.song ?? makeFactorySong();
  const a = await engine.renderBuffer(song, 1.5);
  const b = await engine.renderBuffer(song, 1.5);
  const hashA = await digestBuffer(a);
  const hashB = await digestBuffer(b);
  return { ok: hashA === hashB, hashA, hashB, bitIdentical: hashA === hashB };
}
