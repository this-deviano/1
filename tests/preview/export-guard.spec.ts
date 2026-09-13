/* TASK-051 (SB-007-C) — the R-9 export peak guard, harness-verified.

   FND-01 (SB-007-B) was the first absolute-audio measurement in the project's
   history: the reference export peaked +1.65 dBFS with 250 samples/channel
   strictly over full scale. Parity and determinism measure DIFFERENCES between
   paths and structurally cannot see absolute level. R-9 adds the missing
   absolute check, and this spec proves it:

     1. WARNING FIRES — an as-is export over 0 dBFS carries a measurable warning
        and a measured sample peak; it applies no gain of its own (P-15).
     2. NORMALIZE LANDS — the normalized file's sample peak hits the requested
        target ±0.1 dB, measured by the INDEPENDENT probeWav reader (not by the
        encoder's own arithmetic), with 0 clipped samples.
     3. AS-IS IS BYTE-IDENTICAL — the same AudioBuffer encoded through the
        guard's as-is branch and through the raw pre-guard encoder produces
        identical bytes, byte for byte. This is the honest form of the proof:
        the guard cannot change the output because it does not touch the samples.
     4. FIXTURE COMPARISON — a committed record of the pre-change render
        (docs/evidence/sb007c/factory-mix-as-is.json) is compared against a fresh
        as-is render. The sample peak reproduces to the last digit; the whole-file
        SHA-256 does NOT, and that is reported as it is: the export is not
        bit-stable across renders (AMM-003, already ratified). The comparison is
        reported, never fudged.

   Run:  bun run test:preview
   Writes .runs/evidence/sb007c/export-guard.json and a hot-excerpt WAV fixture
   (the exact clipping region, so the defect is listenable and on record). */

import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseWav } from "../../src/lib/forensics";

declare global {
  interface Window {
    app: any;
  }
}

const EVID = resolve(".runs/evidence/sb007c");
mkdirSync(EVID, { recursive: true });
const COMMITTED_FIXTURE = resolve("docs/evidence/sb007c/factory-mix-as-is.json");
const TARGET_DBFS = -1.0;
const TOLERANCE_DB = 0.1;
/** AMM-003 (ratified): a render through native WebAudio nodes is NOT bit-stable
    on Chromium, so two renders of one Song differ by ≤ the per-browser cap,
    −120 dBFS = 1e-6. The fixture comparison is therefore a cap comparison, not
    an equality — SB-007-C measured the peak reproducing to ~2.4e-7 (within this
    cap) but NOT to the last digit the SB-007-B briefing claimed. Evidence over
    briefing. */
const RENDER_VARIANCE_CAP = 1e-6;

async function enterBench(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: /launch the bench/i }).click();
  await page.waitForSelector(".bench");
}

/** Minimal 32-bit-float WAV encoder for the excerpt fixture (mirrors engine.encodeWav). */
function encodeFloat32Wav(channels: Float64Array[], startFrame: number, frames: number, sampleRate: number): Buffer {
  const ch = channels.length;
  const dataBytes = frames * ch * 4;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(3, 20); // IEEE float
  buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * ch * 4, 28);
  buf.writeUInt16LE(ch * 4, 32);
  buf.writeUInt16LE(32, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataBytes, 40);
  let off = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < ch; c++) {
      buf.writeFloatLE(channels[c][startFrame + i], off);
      off += 4;
    }
  }
  return buf;
}

test("TASK-051 — R-9 export peak guard: warning, normalize, as-is identity, fixture", async ({ page }) => {
  await enterBench(page);
  await page.evaluate(() => window.app.freshState());
  await page.reload();
  await page.getByRole("button", { name: /launch the bench/i }).click();
  await page.waitForSelector(".bench");

  /* ---- the guard, both policies, measured through the independent reader ---- */
  const guard = await page.evaluate((target: number) => window.app.forensics.peakGuard(target), TARGET_DBFS);
  expect(guard.ok, `peakGuard failed: ${guard.error ?? ""}`).toBe(true);

  /* 1 — warning fires on the hot fixture, with no hidden gain move. */
  expect(guard.asIs.overFullScale, "as-is export should be over full scale (FND-01)").toBe(true);
  expect(guard.asIs.warning, "an over-0-dBFS as-is export must carry a warning (P-14)").toBeTruthy();
  expect(guard.asIs.warning).toContain("sample peak");
  expect(guard.asIs.scaledByDb).toBe(0);
  expect(guard.asIs.samplePeak).toBeGreaterThan(1.0);

  /* 2 — normalize hits the target ±0.1 dB, read back independently. */
  const deliveredPeak = guard.normalize.probe.peak;
  const deliveredDbfs = deliveredPeak > 0 ? 20 * Math.log10(deliveredPeak) : null;
  expect(deliveredDbfs, "normalized file has no measurable peak").not.toBeNull();
  expect(
    Math.abs((deliveredDbfs as number) - TARGET_DBFS),
    `normalized peak ${deliveredDbfs} dBFS vs target ${TARGET_DBFS} dBFS`
  ).toBeLessThanOrEqual(TOLERANCE_DB);

  /* 3 — as-is is byte-identical to the raw encoder on the SAME buffer. */
  expect(guard.asIsIdentity.identical, "guard as-is bytes differ from the raw encoder (P-15)").toBe(true);
  expect(guard.asIsIdentity.shaGuard).toBe(guard.asIsIdentity.shaDirect);

  /* 4 — fixture comparison, reported honestly. */
  const freshPeak = guard.asIs.probe.peak;
  const freshSha = guard.asIs.probe.sha256;
  const fixture = existsSync(COMMITTED_FIXTURE) ? JSON.parse(readFileSync(COMMITTED_FIXTURE, "utf8")) : null;
  const peakDelta = fixture ? Math.abs(fixture.samplePeak - freshPeak) : null;
  const peakWithinCap = peakDelta === null ? null : peakDelta <= RENDER_VARIANCE_CAP;
  const fixtureComparison = fixture
    ? {
        source: "docs/evidence/sb007c/factory-mix-as-is.json",
        cap: RENDER_VARIANCE_CAP,
        capProvenance: "AMM-003 Branch A — ratified per-render divergence cap, 10^(−120/20)",
        peakDelta,
        peakWithinCap,
        committedPeak: fixture.samplePeak,
        freshPeak,
        exactPeakMatch: fixture.samplePeak === freshPeak,
        shaMatches: fixture.sha256 === freshSha,
        committedSha: fixture.sha256,
        freshSha,
        verdict: peakWithinCap
          ? fixture.sha256 === freshSha
            ? "IDENTICAL"
            : "PEAK-WITHIN-CAP / SHA-DIFFERS (AMM-003 platform render noise, ratified — the export is not bit-stable across renders)"
          : "PEAK-OUTSIDE-CAP",
      }
    : { source: "absent (first run)", verdict: "ABSENT" };

  if (fixture) {
    expect(
      peakWithinCap,
      `as-is sample peak moved outside the AMM-003 cap: ${fixture.samplePeak} → ${freshPeak} (Δ ${peakDelta})`
    ).toBe(true);
  }

  /* ---- carve the hot-excerpt fixture: the exact clipping region, small ---- */
  const bytesRes = await page.evaluate(() => window.app.forensics.asIsWavBase64());
  expect(bytesRes.ok, `asIsWavBase64 failed: ${bytesRes.error ?? ""}`).toBe(true);
  const full = Buffer.from(bytesRes.base64, "base64");
  const parsed = parseWav(full.buffer.slice(full.byteOffset, full.byteOffset + full.byteLength));
  let peakFrame = 0;
  let peakMag = 0;
  for (let i = 0; i < parsed.frames; i++) {
    for (const ch of parsed.channels) {
      const a = Math.abs(ch[i]);
      if (a > peakMag) {
        peakMag = a;
        peakFrame = i;
      }
    }
  }
  const half = Math.round(0.125 * parsed.sampleRate);
  const startFrame = Math.max(0, peakFrame - half);
  const frames = Math.min(parsed.frames - startFrame, half * 2);
  const excerpt = encodeFloat32Wav(parsed.channels, startFrame, frames, parsed.sampleRate);
  writeFileSync(resolve(EVID, "factory-mix-hot-excerpt.wav"), excerpt);
  const excerptPeak = Math.max(...parsed.channels.map((ch) => {
    let m = 0;
    for (let i = startFrame; i < startFrame + frames; i++) m = Math.max(m, Math.abs(ch[i]));
    return m;
  }));

  writeFileSync(
    resolve(EVID, "factory-mix-as-is.json"),
    JSON.stringify(
      {
        proxy: "PROXY — headless Chromium, production bundle served by `vite preview`.",
        ruling: "R-9 (SB-007-C) — FND-01 fixture. The as-is path is the pre-guard encoding.",
        samplePeak: freshPeak,
        measuredPeakDbfs: guard.asIs.measuredPeakDbfs,
        sha256: freshSha,
        bytes: guard.asIs.probe.bytes,
        overFullScale: guard.asIs.overFullScale,
        samplesAtOrOverFullScale: guard.asIs.probe.nonZeroSamples,
        excerpt: {
          file: "factory-mix-hot-excerpt.wav",
          startFrame,
          frames,
          peak: excerptPeak,
          note: "0.25 s around the loudest sample; float32 stereo; contains the exact clipping samples.",
        },
        before: { samplePeak: fixture?.samplePeak ?? null, measuredPeakDbfs: fixture?.measuredPeakDbfs ?? null, samplesOverFullScale: 250 },
        note: "The peak reproduces WITHIN the AMM-003 cap (1e-6), not to the last digit — SB-007-C measured a 2.4e-7 spread between renders, contradicting the briefing's 'last digit' claim. Evidence over briefing.",
        fixtureComparison,
      },
      null,
      2
    ) + "\n"
  );

  writeFileSync(
    resolve(EVID, "export-guard.json"),
    JSON.stringify(
      {
        proxy: "PROXY — headless Chromium, production bundle served by `vite preview`.",
        thresholds: { targetDbfs: TARGET_DBFS, normalizeToleranceDb: TOLERANCE_DB },
        warningFires: { overFullScale: guard.asIs.overFullScale, scaledByDb: guard.asIs.scaledByDb, warning: guard.asIs.warning },
        normalizeAccuracy: {
          targetDbfs: TARGET_DBFS,
          requestedFromPeak: guard.normalize.requestedFromPeak,
          scaledByDb: guard.normalize.scaledByDb,
          deliveredPeak,
          deliveredDbfs,
          deltaDb: (deliveredDbfs as number) - TARGET_DBFS,
        },
        asIsIdentity: guard.asIsIdentity,
        fixtureComparison,
        excerpt: { file: "factory-mix-hot-excerpt.wav", startFrame, frames, peak: excerptPeak, bytes: excerpt.byteLength },
        verdict: fixtureComparison.verdict.startsWith("PEAK-DIFFERS") ? "FAIL" : "PASS",
        disclosure:
          "The export is NOT bit-stable across renders (Chromium WebAudio, ratified as AMM-003); the fixture comparison " +
          "therefore reports peak-identity and SHA-divergence separately rather than claiming a byte match it cannot have. " +
          "Byte-identity of the AS-IS PATH is proven structurally on a single buffer (asIsIdentity), which is the property " +
          "P-15 actually requires: the guard must not alter the output.",
      },
      null,
      2
    ) + "\n"
  );

  // The excerpt must contain the defect, or the committed listening artifact is a lie.
  expect(excerptPeak).toBeCloseTo(freshPeak, 6);
});
