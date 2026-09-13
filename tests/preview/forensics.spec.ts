/* TASK-048 (SB-007-B) — the forensics battery.

   This is the machine half of HV-DEFERRED-01. It does NOT discharge that debt:
   nobody has listened to the render, and no script can hear. What it does is
   narrow the maintainer's question from "is it broken?" to "is it good?" — the
   machine answers the first, the maintainer keeps the second (AMM-004 §4).

   Journey (SB-007-B §2): export WAV of the reference song AND the fake-tone mic
   take → decode → forensics → assert. Both files go through the SAME pure module
   (`src/lib/forensics.ts`) and the SAME two app paths the product uses for real:
   `engine.renderWav` (the Rail's Export) and `readMedia` (the content-addressed
   take reader).

   Run:  bun run test:preview
   Writes docs/evidence/sb007b/forensics.json.

   A FAIL here is a REAL FINDING, not a bad session (P-14). File it with a
   hypothesis in TASKS.md — never soften the threshold to make it pass. */

import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

declare global {
  interface Window {
    app: any;
  }
}

const EVID = resolve("docs/evidence/sb007b");
mkdirSync(EVID, { recursive: true });

const PROXY =
  "PROXY — headless Chromium via playwright.launch, production bundle served by `vite preview`; " +
  "the microphone is Chromium's fake media device (a synthetic tone), not hardware. " +
  "The export is the app's own `engine.renderWav`; the take is the app's own trimmed WAV from OPFS media/.";

/* Thresholds from SB-007-B §2. They live here, in the instrument, so a failing
   file cannot be talked green by passing softer numbers into the module (P-14). */
const MAX_ABS_DC = 1e-4;
const MAX_CLIPPED = 0;
const MAX_TRIM_OFFSET_MS = 50;

async function enterBench(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: /launch the bench/i }).click();
  await page.waitForSelector(".bench");
}

/** The measured shape of one file: the numbers §4 of the briefing asks for. */
function numbers(report: any) {
  return {
    label: report.label,
    fileBytes: report.fileBytes,
    durationS: report.durationS,
    frames: report.frames,
    header: {
      fmtTag: report.header.fmtTag,
      fmtTagName: report.header.fmtTagName,
      channels: report.header.channels,
      sampleRate: report.header.sampleRate,
      bitsPerSample: report.header.bitsPerSample,
      blockAlignDeclared: report.header.blockAlignDeclared,
      blockAlignDerived: report.header.blockAlignDerived,
      byteRateDeclared: report.header.byteRateDeclared,
      byteRateDerived: report.header.byteRateDerived,
      declaredFieldsConsistent: report.header.declaredFieldsConsistent,
      dataBytesDeclared: report.header.dataBytesDeclared,
      dataBytesAvailable: report.header.dataBytesAvailable,
      dataFitsFile: report.header.dataFitsFile,
    },
    perChannel: report.channels.map((c: any) => ({
      index: c.index,
      dcOffset: c.dcOffset,
      dcDbfs: c.dcDbfs,
      dcSegments: c.dcSegments.map((v: number) => Number(v.toExponential(6))),
      dcSegmentMaxAbs: c.dcSegmentMaxAbs,
      dcSegmentsMatchingOverallSign: c.dcSegmentsMatchingOverallSign,
      dcConcentration: c.dcConcentration,
      truePeak: c.truePeak,
      truePeakDbfs: c.truePeakDbfs,
      clippedSamples: c.clippedSamples,
      samplesOverFullScale: c.samplesOverFullScale,
      maxBoundaryDelta: c.lattice.maxBoundaryDelta,
      maxBoundaryDeltaDbfs: c.lattice.maxBoundaryDeltaDbfs,
      interiorP999: c.lattice.interiorP999,
      interiorP999Dbfs: c.lattice.interiorP999Dbfs,
      boundaryCount: c.lattice.boundaryCount,
      outlierBoundaryCount: c.lattice.outlierBoundaries.length,
      outlierBoundaries: c.lattice.outlierBoundaries.slice(0, 16),
      /** Under the null hypothesis (boundary samples are an unbiased 0.78 %
          subset of the file), the briefed criterion flags ~0.1 % of them by
          chance. Without this baseline an outlier count is unreadable. */
      expectedOutliersByChance: c.lattice.boundaryCount * 0.001,
      latticeVerdict: c.lattice.verdict,
    })),
    trim: {
      thresholdDbfs: report.trim.thresholdDbfs,
      expectedMs: report.trim.expectedMs,
      firstAudibleMs: report.trim.firstAudibleMs,
      offsetMs: report.trim.offsetMs,
      leadingSilenceMs: report.trim.leadingSilenceMs,
      trailingSilenceMs: report.trim.trailingSilenceMs,
    },
  };
}

function evaluate(report: any) {
  const absDc = report.channels.map((c: any) => Math.abs(c.dcOffset));
  const clipped = report.channels.reduce((n: number, c: any) => n + c.clippedSamples, 0);
  const outliers = report.channels.reduce((n: number, c: any) => n + c.lattice.outlierBoundaries.length, 0);
  const offset = report.trim.offsetMs;
  return {
    maxAbsDc: absDc.length > 0 ? Math.max(...absDc) : null,
    clippedSamples: clipped,
    latticeOutlierBoundaries: outliers,
    trimOffsetMs: offset,
    dcPass: absDc.every((v: number) => v <= MAX_ABS_DC),
    clipPass: clipped === MAX_CLIPPED,
    latticePass: outliers === 0,
    trimPass: offset !== null && Math.abs(offset) <= MAX_TRIM_OFFSET_MS,
  };
}

test("TASK-048 — forensics: reference-song export + fake-tone take (DC, clipping, lattice seams, trim)", async ({
  page,
}) => {
  // The canonical fresh-state reset, so the "reference song" is the factory Song
  // and not whatever a previous test in this file left behind (P-02 / runbook HV-3).
  await enterBench(page);
  await page.evaluate(() => window.app.freshState());
  await page.reload();
  await page.getByRole("button", { name: /launch the bench/i }).click();
  await page.waitForSelector(".bench");

  /* ---- (a) the export path: the Rail's Export, same call, no download ---- */
  const exportRes = await page.evaluate(() => window.app.forensics.renderReference());

  /* ---- (b) the take path: record on the fake device, then read it back ---- */
  await page.keyboard.press("r"); // record (P-22 default arms Keys + Voice)
  await page.waitForTimeout(2600); // 4-beat count-in at 118 qpm ≈ 2.03 s + margin
  for (const key of ["z", "x", "c", "v"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(70);
  }
  await page.keyboard.press(" "); // stop → cmdFinishTake trims the count-in and writes media/<sha>.wav
  await page.waitForFunction(
    () => window.app.song().clips.some((c: any) => c.kind === "audio"),
    null,
    { timeout: 20_000 }
  );

  const takeRes = await page.evaluate(async () => {
    const song = window.app.song();
    const audio = song.clips.find((c: any) => c.kind === "audio");
    if (!audio?.media) return { ok: false, error: "no audio clip with media" };
    // expected 0 ms: the count-in was trimmed from the front at capture time (TASK-007b)
    const res = await window.app.forensics.media(audio.media.sha, 0);
    // Parser cross-check: `storage.probeWav` is an INDEPENDENT reader of the same
    // bytes (written for TASK-021, not for this module). Two independent readers
    // agreeing on the header and the peak is what makes the decode trustworthy
    // rather than self-confirming (E-006 spirit).
    const independent = await window.app.storage.probeMedia(audio.media.sha);
    return { ...res, sha: audio.media.sha, modelDurationS: audio.media.durationS, independent };
  });

  expect(exportRes.ok, `export forensics failed: ${exportRes.error ?? ""}`).toBe(true);
  expect(takeRes.ok, `take forensics failed: ${takeRes.error ?? ""}`).toBe(true);

  const exportEval = evaluate(exportRes.report);
  const takeEval = evaluate(takeRes.report);

  /* ---- criteria check, collected rather than thrown on the first miss ---- */
  /* One assertion at the end so a single run reports EVERY unmet criterion for
     BOTH files. Failing fast here would hide the clipping and the lattice
     findings behind the DC one, and an opaque red is its own kind of silence
     (P-14). The criteria themselves are exactly as briefed — unfudged. */
  const failures: string[] = [];

  for (const [name, r, verdict] of [
    ["reference-song export", exportRes.report, exportEval],
    ["fake-tone take", takeRes.report, takeEval],
  ] as const) {
    // WAV header truth (P-07): our own encoders must not lie about their format.
    if (r.header.container !== "RIFF/WAVE") failures.push(`${name}: container is ${r.header.container}`);
    if (r.header.fmtTagName !== "IEEE float" || r.header.bitsPerSample !== 32) {
      failures.push(`${name}: format is ${r.header.fmtTagName}/${r.header.bitsPerSample}-bit, expected IEEE float/32`);
    }
    if (!r.header.declaredFieldsConsistent) failures.push(`${name}: fmt declares inconsistent byteRate/blockAlign`);
    if (!r.header.dataFitsFile) failures.push(`${name}: data chunk overruns the file`);
    if (r.header.sampleRate !== 44100) failures.push(`${name}: sample rate ${r.header.sampleRate}`);

    for (const c of r.channels) {
      if (Math.abs(c.dcOffset) > MAX_ABS_DC) {
        failures.push(
          `${name} ch${c.index}: |DC| ${Math.abs(c.dcOffset).toExponential(3)} exceeds ${MAX_ABS_DC} ` +
            `(DC ${c.dcDbfs} dBFS; segment means ${JSON.stringify(c.dcSegments.map((v: number) => Number(v.toExponential(2))))}, ` +
            `${c.dcSegmentsMatchingOverallSign}/${c.dcSegments.length} share the overall sign, concentration ${c.dcConcentration?.toFixed(2)})`
        );
      }
      if (c.clippedSamples !== MAX_CLIPPED) {
        failures.push(
          `${name} ch${c.index}: ${c.clippedSamples} sample(s) at or over full scale ` +
            `(${c.samplesOverFullScale} strictly over; true peak ${c.truePeak} = ${c.truePeakDbfs} dBFS)`
        );
      }
      if (c.lattice.verdict !== "WITHIN-INTERIOR-P999") {
        const expected = c.lattice.boundaryCount * 0.001;
        failures.push(
          `${name} ch${c.index}: ${c.lattice.outlierBoundaries.length} of ${c.lattice.boundaryCount} lattice boundaries ` +
            `exceed the interior p99.9 [first at ${JSON.stringify(c.lattice.outlierBoundaries.slice(0, 8))}]; ` +
            `max boundary delta ${c.lattice.maxBoundaryDelta} vs p99.9 ${c.lattice.interiorP999} ` +
            `(≈${expected.toFixed(2)} outliers are expected by chance at this boundary count)`
        );
      }
    }

    if (verdict.trimOffsetMs === null) {
      failures.push(`${name}: never reached ${r.trim.thresholdDbfs} dBFS — no onset to measure`);
    } else if (Math.abs(verdict.trimOffsetMs) > MAX_TRIM_OFFSET_MS) {
      failures.push(
        `${name}: onset ${r.trim.firstAudibleMs?.toFixed(1)} ms vs expected ${r.trim.expectedMs} ms ` +
          `(offset ${verdict.trimOffsetMs.toFixed(1)} ms > ±${MAX_TRIM_OFFSET_MS} ms)`
      );
    }
  }

  writeFileSync(
    resolve(EVID, "forensics.json"),
    JSON.stringify(
      {
        proxy: PROXY,
        thresholds: { maxAbsDc: MAX_ABS_DC, maxClipped: MAX_CLIPPED, maxTrimOffsetMs: MAX_TRIM_OFFSET_MS },
        referenceSongExport: numbers(exportRes.report),
        fakeToneMicTake: { ...numbers(takeRes.report), sha: takeRes.sha, modelDurationS: takeRes.modelDurationS },
        parserCrossCheck: {
          independentReader: "window.app.storage.probeMedia → probeWav (TASK-021)",
          independentProbe: takeRes.independent?.probe ?? takeRes.independent,
          agree: {
            channels: takeRes.report.header.channels === takeRes.independent?.probe?.channels,
            sampleRate: takeRes.report.sampleRate === takeRes.independent?.probe?.sampleRate,
            frames: takeRes.report.frames === takeRes.independent?.probe?.frames,
            truePeak: takeRes.report.channels[0].truePeak === takeRes.independent?.probe?.peak,
          },
        },
        evaluation: { export: exportEval, take: takeEval },
        criteriaNotMet: failures,
        verdict: failures.length === 0 ? "PASS" : "FAIL",
        disclosure:
          "PROXY, and a deliberately limited one. The take is Chromium's fake media device, which emits a " +
          "continuous synthetic tone: because the tone is present from the first captured sample, the trim " +
          "check on the take is WEAK — it shows the take does not begin mid-count-in, not that the 4-beat " +
          "trim is sample-aligned on real hardware. The trim check on the export is the meaningful one " +
          "(the offline render's own PREROLL lead-in). Neither file has been heard by anyone: HV-DEFERRED-01 " +
          "is narrowed, not cleared.",
      },
      null,
      2
    ) + "\n"
  );

  /* ---- structural facts that must hold regardless of the criteria ---- */

  expect(exportRes.report.header.channels).toBe(2); // the mix is stereo
  expect(takeRes.report.header.channels).toBe(1); // the capture is mono

  // The two readers must agree, or the forensics numbers describe nothing real.
  // probeWav (TASK-021) is an independent reader of the same bytes, written
  // before this module existed; exact agreement makes the decode self-verifying.
  const probe = takeRes.independent?.probe;
  expect(probe, "independent parser produced no probe").toBeTruthy();
  expect(takeRes.report.header.channels).toBe(probe.channels);
  expect(takeRes.report.sampleRate).toBe(probe.sampleRate);
  expect(takeRes.report.frames).toBe(probe.frames);
  expect(takeRes.report.channels[0].truePeak).toBe(probe.peak);

  /* ---- the briefed criteria (SB-007-B §2) ---- */

  expect(
    failures,
    `${failures.length} briefed criterion(s) not met — each one is a finding to file, not a threshold to move:\n` +
      failures.map((f, i) => `  ${i + 1}. ${f}`).join("\n")
  ).toEqual([]);
});
