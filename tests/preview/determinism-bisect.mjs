/* TASK-026 determinism bisect (SB-005 §4) — measurement instrument, not a gate.

   Two ladders, N renders each, IN THE SAME PROCESS, hashing raw IEEE-754 float32
   bytes (FNV-1a 32-bit — strict: distinguishes -0/+0 and NaN payloads).

   LADDER A (node class): walks the exact node classes the app's offline path
   executes, so the first rung that varies names the culprit.
   LADDER B (graph size): the app renders ~9.6 s of material through hundreds of
   nodes; if variance appears only as node count grows, the cause is in how
   Chromium partitions the render, not in any single node.

   Run:  bun tests/preview/determinism-bisect.mjs
   Writes docs/evidence/sb005/determinism-bisect.json and prints tables. */

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const RUNS = 5;
const SR = 44100;
const SHORT = SR; // 1.0 s
const LONG = 423529; // the app's real render length (samples), from parity.json

const FLAGS = [
  "--use-fake-device-for-media-stream",
  "--use-fake-ui-for-media-stream",
  "--autoplay-policy=no-user-gesture-required",
  "--mute-audio",
];

/* Stringified into the page — must be self-contained. */
function pageBisect({ runs, sr, shortLen, longLen }) {
  function hashF32(arr) {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  }
  function maxDiff(a, b) {
    const n = Math.min(a.length, b.length);
    let m = 0;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(a[i] - b[i]);
      if (d > m) m = d;
    }
    return m;
  }
  const dbfs = (x) => (x === 0 ? -Infinity : 20 * Math.log10(x));

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function noiseArray(len) {
    const rnd = mulberry32(0x9e3779b9);
    const a = new Float32Array(len);
    for (let i = 0; i < len; i++) a[i] = (rnd() * 2 - 1) * (1 - i / len);
    return a;
  }
  function comp(ctx) {
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = -6;
    c.ratio.value = 4;
    c.attack.value = 0.003;
    c.release.value = 0.12;
    return c;
  }
  function master(ctx, src) {
    const c = comp(ctx);
    const g = ctx.createGain();
    g.gain.value = 0.9;
    c.connect(g);
    g.connect(ctx.destination);
    if (src) src.connect(c);
    return c;
  }
  // one app-shaped voice: oscillator pair -> biquad -> panner -> gain -> bus
  function oscVoice(ctx, bus, at, freq) {
    const o1 = ctx.createOscillator();
    o1.type = "triangle";
    o1.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = "triangle";
    o2.frequency.value = freq * 2.003;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 2600;
    f.Q.value = 0.8;
    const p = ctx.createStereoPanner();
    p.pan.value = 0.1;
    const g = ctx.createGain();
    g.gain.value = 0.12;
    o1.connect(f);
    o2.connect(f);
    f.connect(p);
    p.connect(g);
    g.connect(bus);
    o1.start(at);
    o2.start(at);
    o1.stop(at + 0.3);
    o2.stop(at + 0.3);
  }
  // one app-shaped noise voice: buffer -> highpass -> lowpass -> gain
  function noiseVoice(ctx, bus, at, dur) {
    const len = Math.max(1, Math.floor(sr * dur));
    const buf = ctx.createBuffer(1, len, sr);
    buf.copyToChannel(noiseArray(len), 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1800;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 12000;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    src.connect(hp);
    hp.connect(lp);
    lp.connect(g);
    g.connect(bus);
    src.start(at);
  }

  const LADDER_A = {
    "A0-silence": (ctx) => master(ctx, null),
    "A1-constant-gain": (ctx) => {
      const bus = master(ctx, null);
      const s = ctx.createConstantSource();
      s.offset.value = 0.5;
      const g = ctx.createGain();
      g.gain.value = 0.9;
      s.connect(g);
      g.connect(bus);
      s.start(0);
    },
    "A2-osc-gain": (ctx) => {
      const bus = master(ctx, null);
      const o = ctx.createOscillator();
      o.frequency.value = 440;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      o.connect(g);
      g.connect(bus);
      o.start(0);
    },
    "A3-osc-biquad-gain": (ctx) => {
      const bus = master(ctx, null);
      const o = ctx.createOscillator();
      o.frequency.value = 440;
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 3200;
      f.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      o.connect(f);
      f.connect(g);
      g.connect(bus);
      o.start(0);
    },
    "A4-two-osc-biquad-panner-gain": (ctx) => {
      const bus = master(ctx, null);
      oscVoice(ctx, bus, 0, 220);
    },
    "A5-buffer-hp-lp-gain": (ctx) => {
      const bus = master(ctx, null);
      noiseVoice(ctx, bus, 0, 0.16);
    },
    "A6-full-chain-osc": (ctx) => {
      const bus = master(ctx, null);
      const o = ctx.createOscillator();
      o.frequency.value = 220;
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 3200;
      const p = ctx.createStereoPanner();
      p.pan.value = -0.3;
      o.connect(f);
      f.connect(p);
      p.connect(bus);
      o.start(0);
    },
  };

  // LADDER B scales node count at the app's real render length.
  function manyVoices(count, kind, durS) {
    return (ctx) => {
      const bus = master(ctx, null);
      for (let i = 0; i < count; i++) {
        const at = (i / count) * durS;
        if (kind === "osc") oscVoice(ctx, bus, at, 110 + (i % 24) * 20);
        else noiseVoice(ctx, bus, at, 0.12);
      }
    };
  }
  const DUR = longLen / sr;
  const LADDER_B = {
    "B1-one-osc-9.6s": manyVoices(1, "osc", DUR),
    "B2-16-osc-9.6s": manyVoices(16, "osc", DUR),
    "B3-64-osc-9.6s": manyVoices(64, "osc", DUR),
    "B4-256-osc-9.6s": manyVoices(256, "osc", DUR),
    "B5-256-noise-9.6s": manyVoices(256, "noise", DUR),
    "B6-1024-osc-9.6s": manyVoices(1024, "osc", DUR),
  };

  async function runOne(builder, len) {
    const ctx = new OfflineAudioContext(2, len, sr);
    builder(ctx);
    const buf = await ctx.startRendering();
    return buf.getChannelData(0).slice(0);
  }

  async function ladder(entries, len) {
    const out = {};
    for (const [name, builder] of Object.entries(entries)) {
      const first = await runOne(builder, len);
      const hashes = [hashF32(first)];
      const diffs = [0];
      for (let i = 1; i < runs; i++) {
        const next = await runOne(builder, len);
        hashes.push(hashF32(next));
        diffs.push(maxDiff(first, next));
      }
      const distinct = new Set(hashes).size;
      let peak = 0;
      for (let i = 0; i < first.length; i++) {
        const a = Math.abs(first[i]);
        if (a > peak) peak = a;
      }
      const worst = diffs.reduce((m, d) => (d > m ? d : m), 0);
      out[name] = {
        hashes,
        distinct,
        stable: distinct === 1,
        maxDiff: worst,
        maxDbfs: dbfs(worst),
        peak,
      };
    }
    return out;
  }

  return (async () => ({
    ladderA: await ladder(LADDER_A, shortLen),
    ladderB: await ladder(LADDER_B, longLen),
  }))();
}

const browser = await chromium.launch({ args: FLAGS });
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("[pageerror]", e.message));
await page.goto("about:blank");
const results = await page.evaluate(
  ({ fn, runs, sr, shortLen, longLen }) => eval(`(${fn})`)({ runs, sr, shortLen, longLen }),
  { fn: pageBisect.toString(), runs: RUNS, sr: SR, shortLen: SHORT, longLen: LONG }
);
await browser.close();

function printTable(title, obj) {
  console.log(`\n${title}`);
  console.log(
    "graph".padEnd(30) + "stable".padEnd(8) + "distinct".padEnd(10) + "max|Δ|".padEnd(14) + "dBFS".padEnd(11) + "peak"
  );
  for (const [name, r] of Object.entries(obj)) {
    console.log(
      name.padEnd(30) +
        String(r.stable).padEnd(8) +
        String(r.distinct).padEnd(10) +
        r.maxDiff.toExponential(3).padEnd(14) +
        String(r.maxDbfs === -Infinity ? "-inf" : r.maxDbfs.toFixed(2)).padEnd(11) +
        r.peak.toFixed(4)
    );
  }
}

printTable(`LADDER A — node class (${RUNS} renders, 1.0 s)`, results.ladderA);
printTable(`LADDER B — graph size (${RUNS} renders, ${LONG} samples ≈ 9.6 s)`, results.ladderB);

const allStable = [...Object.values(results.ladderA), ...Object.values(results.ladderB)].every((r) => r.stable);
const evidence = {
  proxy:
    "PROXY — headless Chromium via playwright.launch, about:blank, OfflineAudioContext 2ch @44.1 kHz, " +
    "raw float32 bytes hashed with FNV-1a 32-bit.",
  runs: RUNS,
  sampleRate: SR,
  shortLen: SHORT,
  longLen: LONG,
  generatedBy: "tests/preview/determinism-bisect.mjs",
  results,
  verdict: allStable ? "ALL GRAPHS BIT-STABLE in-process" : "AT LEAST ONE GRAPH VARIES in-process",
};
const dir = resolve("docs/evidence/sb005");
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, "determinism-bisect.json"), JSON.stringify(evidence, null, 2) + "\n");
console.log(`\nverdict: ${evidence.verdict}`);
console.log("wrote docs/evidence/sb005/determinism-bisect.json\n");
