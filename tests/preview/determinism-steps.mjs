/* TASK-026 determinism bisect — STEP 2/4/5 discriminators (SB-005 §4).

   Companion to determinism-bisect.mjs, which established that Chromium's
   OfflineAudioContext variance is GRAPH-SIZE dependent (bit-stable ≤16 voices;
   every render distinct by 64 voices; divergence grows to −64 dBFS at 1024).
   This instrument answers the remaining branch questions:

   STEP 2  frozen clock      — does Date.now/performance.now override stabilise?
   STEP 4  fresh page        — same-page double render vs one page per render
   STEP 5  pure-JS leg       — the app-controlled (model→event, PRNG) side, which
                              executes no WebAudio at all

   Run:  bun tests/preview/determinism-steps.mjs
   Writes docs/evidence/sb005/determinism-steps.json. */

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const RUNS = 4;
const SR = 44100;
const LEN = 423529; // the app's real render length, from parity.json
const VOICES = 64; // first rung of the size ladder that varies

const FLAGS = [
  "--use-fake-device-for-media-stream",
  "--use-fake-ui-for-media-stream",
  "--autoplay-policy=no-user-gesture-required",
  "--mute-audio",
];

/* One 64-voice app-shaped graph, rendered once; returns its strict byte hash. */
function renderBig({ voices, len, sr }) {
  function hashF32(arr) {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  }
  const ctx = new OfflineAudioContext(2, len, sr);
  const c = ctx.createDynamicsCompressor();
  c.threshold.value = -6;
  c.ratio.value = 4;
  c.attack.value = 0.003;
  c.release.value = 0.12;
  const m = ctx.createGain();
  m.gain.value = 0.9;
  c.connect(m);
  m.connect(ctx.destination);
  for (let i = 0; i < voices; i++) {
    const at = (i / voices) * (len / sr);
    const o1 = ctx.createOscillator();
    o1.type = "triangle";
    o1.frequency.value = 110 + (i % 24) * 20;
    const o2 = ctx.createOscillator();
    o2.type = "triangle";
    o2.frequency.value = (110 + (i % 24) * 20) * 2.003;
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
    g.connect(c);
    o1.start(at);
    o2.start(at);
    o1.stop(at + 0.3);
    o2.stop(at + 0.3);
  }
  return ctx.startRendering().then((buf) => hashF32(buf.getChannelData(0)));
}

/* The app-controlled leg: no WebAudio, pure JS. Deterministic by construction
   should actually hold here — that is the claim Step 5 tests. */
function pureJsLeg() {
  function hashBytes(bytes) {
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  }
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function splitmix32(a) {
    a = a | 0;
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  }
  function seedStream(songSeed, tag) {
    let h = 0x811c9dc5;
    for (let i = 0; i < tag.length; i++) {
      h ^= tag.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return mulberry32(splitmix32((songSeed ^ h) >>> 0));
  }
  const tag = "luthier/noise";
  const seed = 0x9e3779b9;
  // 1) the PRNG stream
  const rnd = seedStream(seed, tag);
  const draws = new Float32Array(20000);
  for (let i = 0; i < draws.length; i++) draws[i] = rnd();
  // 2) a model→event-shaped list (the materialEvents analog: pure, sorted, stable)
  const events = [];
  for (let p = 0; p < 12; p++) {
    for (let n = 0; n < 64; n++) {
      events.push({ t: (p * 960 + n * 60) * (60 / 120 / 960), pitch: 36 + ((n * 7) % 48), vel: 40 + ((n * 13) % 80) });
    }
  }
  events.sort((a, b) => (a.t !== b.t ? a.t - b.t : a.pitch - b.pitch));
  const enc = new TextEncoder();
  return {
    rngHash: hashBytes(new Uint8Array(draws.buffer, draws.byteOffset, draws.byteLength)),
    eventHash: hashBytes(enc.encode(JSON.stringify(events))),
    events: events.length,
  };
}

const browser = await chromium.launch({ args: FLAGS });

const pageArgs = { voices: VOICES, len: LEN, sr: SR };
const runOn = (page) => page.evaluate(({ fn, args }) => eval(`(${fn})`)(args), { fn: renderBig.toString(), args: pageArgs });

// ---- STEP 4a: same page, repeated ----
const pageA = await browser.newPage();
await pageA.goto("about:blank");
const samePage = [];
for (let i = 0; i < RUNS; i++) samePage.push(await runOn(pageA));
await pageA.close();

// ---- STEP 4b: a fresh page per render ----
const freshPage = [];
for (let i = 0; i < RUNS; i++) {
  const p = await browser.newPage();
  await p.goto("about:blank");
  freshPage.push(await runOn(p));
  await p.close();
}

// ---- STEP 2: frozen clock ----
const clockPage = await browser.newPage();
await clockPage.goto("about:blank");
const clockOverride = await clockPage.evaluate(() => {
  const okDate = (() => {
    try {
      const real = Date.now;
      Date.now = () => 1700000000000;
      return Date.now() === 1700000000000 && real !== undefined;
    } catch {
      return false;
    }
  })();
  const okPerf = (() => {
    try {
      performance.now = () => 12345.678;
      return performance.now() === 12345.678;
    } catch {
      return false;
    }
  })();
  return { dateFrozen: okDate, perfFrozen: okPerf };
});
const frozenClock = [];
for (let i = 0; i < RUNS; i++) frozenClock.push(await runOn(clockPage));
await clockPage.close();

// ---- STEP 5: pure-JS leg ----
const jsPage = await browser.newPage();
await jsPage.goto("about:blank");
const pure = [];
for (let i = 0; i < RUNS; i++) {
  pure.push(await jsPage.evaluate(({ fn }) => eval(`(${fn})`)(), { fn: pureJsLeg.toString() }));
}
await jsPage.close();

await browser.close();

const distinct = (a) => new Set(a).size;
const result = {
  samePage,
  freshPage,
  frozenClock,
  clockOverride,
  pureJs: pure,
  summary: {
    samePageStable: distinct(samePage) === 1,
    freshPageStable: distinct(freshPage) === 1,
    frozenClockStable: distinct(frozenClock) === 1,
    pureJsRngStable: distinct(pure.map((p) => p.rngHash)) === 1,
    pureJsEventStable: distinct(pure.map((p) => p.eventHash)) === 1,
  },
};

console.log(`\nSTEP 4 — same page vs fresh page (${VOICES} voices, ${LEN} samples, ${RUNS} runs each)`);
console.log("  same page :", samePage.join(" "), `→ ${result.summary.samePageStable ? "STABLE" : "VARIES"}`);
console.log("  fresh page:", freshPage.join(" "), `→ ${result.summary.freshPageStable ? "STABLE" : "VARIES"}`);
console.log("\nSTEP 2 — frozen clock (Date.now + performance.now overridden)");
console.log("  overrides applied:", JSON.stringify(clockOverride));
console.log("  hashes:", frozenClock.join(" "), `→ ${result.summary.frozenClockStable ? "STABLE" : "VARIES"}`);
console.log("\nSTEP 5 — pure-JS leg (PRNG stream + model→event list)");
console.log("  rng hashes  :", pure.map((p) => p.rngHash).join(" "), `→ ${result.summary.pureJsRngStable ? "STABLE" : "VARIES"}`);
console.log("  event hashes:", pure.map((p) => p.eventHash).join(" "), `→ ${result.summary.pureJsEventStable ? "STABLE" : "VARIES"}`);

const evidence = {
  proxy:
    "PROXY — headless Chromium via playwright.launch, about:blank, OfflineAudioContext 2ch @44.1 kHz, " +
    "raw float32 bytes hashed with FNV-1a 32-bit.",
  runs: RUNS,
  voices: VOICES,
  sampleRate: SR,
  samples: LEN,
  generatedBy: "tests/preview/determinism-steps.mjs",
  result,
  verdict: {
    "STEP-2 frozen clock":
      result.summary.frozenClockStable ? "STABLE — clock is not the cause" : "VARIES — clock leakage possible",
    "STEP-4 in-process vs fresh":
      result.summary.samePageStable
        ? "STABLE both ways"
        : result.summary.freshPageStable
          ? "same-page VARIES, fresh-page STABLE — in-process state"
          : "VARIES both ways — not in-process state",
    "STEP-5 pure-JS leg":
      result.summary.pureJsRngStable && result.summary.pureJsEventStable
        ? "BIT-STABLE — the app-controlled leg is deterministic"
        : "VARIES — app-controlled leg is not deterministic",
  },
};
const dir = resolve(".runs/evidence/sb005"); // E-012: scratch only, never the committed record
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, "determinism-steps.json"), JSON.stringify(evidence, null, 2) + "\n");
console.log("\nwrote docs/evidence/sb005/determinism-steps.json\n");
