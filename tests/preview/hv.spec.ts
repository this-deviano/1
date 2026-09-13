/* E-004 HV verification battery (TASK-021). Run: `bun run test:preview`.
   Every number here is a PROXY produced by headless Chromium against the
   production bundle. Ears (HV-2 sound), the final P-02 feel and real-hardware
   microphone behaviour remain human — see docs/runbooks/first-light-human.md. */

import { test, expect, chromium, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

declare global {
  interface Window {
    app: any;
  }
}

/* This battery writes its numbers to docs/evidence/sb005/. The SB-004 files stay
   untouched as the historical record, so old and new behaviour can be compared
   side by side in the ledger (TASK-035 requires the ledger's numbers to come
   from THIS run, not from earlier evidence files). */
const EVID = resolve("docs/evidence/sb005");
mkdirSync(EVID, { recursive: true });
const EVID5 = EVID;
const PROXY = "PROXY — headless Chromium (chrome-headless-shell 153), production bundle via `vite preview`.";

function evidence(name: string, data: Record<string, unknown>): void {
  writeFileSync(resolve(EVID, name), JSON.stringify({ proxy: PROXY, ...data }, null, 2) + "\n");
}

function evidence5(name: string, data: Record<string, unknown>): void {
  writeFileSync(resolve(EVID5, name), JSON.stringify({ proxy: PROXY, ...data }, null, 2) + "\n");
}

function kb(path: string): number {
  return Math.round(statSync(path).size / 1024);
}

async function enterBench(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: /launch the bench/i }).click();
  await page.waitForSelector(".bench");
}

/* ---------------------------------------------------------------- TASK-021 a */

test("HV-1 — boot is console-clean", async ({ page }) => {
  const noise: { kind: string; text: string }[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") noise.push({ kind: m.type(), text: m.text() });
  });
  page.on("pageerror", (e) => noise.push({ kind: "pageerror", text: e.message }));
  await enterBench(page);
  await page.waitForTimeout(10_000);
  evidence("hv-1-console.json", {
    window_ms: 10_000,
    observedErrorsOrWarnings: noise.length,
    entries: noise,
    verdict: noise.length === 0 ? "PASS" : "FAIL",
    disclosure: "Landing load + Bench entry, then a 10 s quiet window (runbook HV-1).",
  });
  expect(noise, `console output: ${JSON.stringify(noise, null, 2)}`).toEqual([]);
});

/* ---------------------------------------------------------------- TASK-021 b */

test("HV-2/FL-02 — AudioContext is running after the first gesture", async ({ page }) => {
  await enterBench(page);
  const before = await page.evaluate(() => window.app.engine().ctxState);
  await page.getByTitle("Play / Stop (Space)").click();
  await page.waitForTimeout(500);
  const engine = await page.evaluate(() => window.app.engine());
  evidence("hv-2-audiocontext.json", {
    contextBeforeGesture: before,
    contextAfterGesture: engine.ctxState,
    sampleRate: engine.sampleRate,
    latencyMs: engine.latencyMs,
    verdict: engine.ctxState === "running" ? "PASS" : "FAIL",
    disclosure: "Autoplay policy is relaxed for the harness; a real browser needs the same first gesture, which the UI provides.",
  });
  expect(engine.ctxState).toBe("running");
});

/* ---------------------------------------------------------------- TASK-021 c */

test("HV-4 — one-truth propagation: Lattice edit reaches model + Loom", async ({ page }) => {
  await enterBench(page);
  const baseline = await page.evaluate(() => {
    const song = window.app.song();
    const clip = song.clips.find((c: any) => c.pattern);
    return {
      clipId: clip.id,
      notes: clip.notes.length,
      onSteps: clip.pattern.rows.reduce((n: number, r: any) => n + r.steps.filter((s: any) => s.on).length, 0),
      loomSteps: document.querySelectorAll("[data-loom-step]").length,
    };
  });

  await page.getByRole("tab", { name: /lattice/i }).click();
  await page.waitForSelector(".lattice-step");

  // model → view latency for the surface being edited (mutation observed to class flip)
  const propagationMs = await page.evaluate(async () => {
    const btn = document.querySelector<HTMLButtonElement>(".lattice-step");
    if (!btn) return -1;
    const wasOn = btn.classList.contains("on");
    const t0 = performance.now();
    return await new Promise<number>((done) => {
      const obs = new MutationObserver(() => {
        if (btn.classList.contains("on") !== wasOn) {
          obs.disconnect();
          done(performance.now() - t0);
        }
      });
      obs.observe(btn, { attributes: true, attributeFilter: ["class"] });
      btn.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0, buttons: 1 })
      );
      setTimeout(() => {
        obs.disconnect();
        done(-1);
      }, 2000);
    });
  });

  const after = await page.evaluate(() => {
    const song = window.app.song();
    const clip = song.clips.find((c: any) => c.pattern);
    return {
      notes: clip.notes.length,
      onSteps: clip.pattern.rows.reduce((n: number, r: any) => n + r.steps.filter((s: any) => s.on).length, 0),
    };
  });

  await page.getByRole("tab", { name: /loom/i }).click();
  await page.waitForSelector("[data-loom-step]");
  const loomSteps = await page.locator("[data-loom-step]").count();

  evidence("hv-4-propagation.json", {
    propagationMs,
    budgetMs: 8,
    baseline,
    after,
    loomStepsBefore: baseline.loomSteps,
    loomStepsAfter: loomSteps,
    verdict: propagationMs >= 0 && propagationMs <= 8 && after.notes === baseline.notes - 1 && loomSteps === baseline.loomSteps - 1 ? "PASS" : "FAIL",
    disclosure:
      "Loom miniature and Ivory CANNOT be observed in the same frame as Lattice: the surface host renders exactly one surface at a time (tabbed surfaces), so the runbook's simultaneous-view check has no DOM to observe. What is measured is the real propagation chain — one store, pure projections: the edit flips the Lattice DOM in X ms, mutates the single Song, and the Loom miniature marker count changes by exactly one on the next visit. Ivory is the same pure projection of the same Song (ADR-0002 rule 1) and is asserted through the model.",
  });

  expect(propagationMs, "propagation over the 8 ms budget").toBeGreaterThanOrEqual(0);
  expect(propagationMs).toBeLessThanOrEqual(8);
  expect(after.notes).toBe(baseline.notes - 1);
  expect(loomSteps).toBe(baseline.loomSteps - 1);
});

/* ---------------------------------------------------------------- TASK-021 d */

test("parity guard — measured vs R-2 dual threshold", async ({ page }) => {
  await enterBench(page);
  const result = await page.evaluate(() => window.app.selftest.renderparity());
  evidence5("parity.json", {
    parity: result.parity,
    error: result.error,
    verdict: result.parity?.gateMet ? "PASS" : "FAIL",
    gate:
      "R-2-AMENDED (SB-005): ONE hard gate, the constitution floor −96 dBFS. The old −80 dBFS ship gate is dead — measurement showed the assumed preroll/envelope divergence it absorbed does not exist. Gates tighten on evidence; they never widen to pass.",
    disclosure: "Measured value and both hashes are always present (P-07); the verdict cannot be read alone.",
  });
  expect(result.error).toBeNull();
  expect(result.parity, "no parity result").not.toBeNull();
  expect(result.parity.gateMet).toBe(true);
});

/* ---------------------------------------------------------------- TASK-021 e */

test("determinism — double render (HV-5 / E-28 · AMM-003 Branch A)", async ({ page }) => {
  await enterBench(page);
  const result = await page.evaluate(() => window.app.selftest.determinism());
  const diag = await page.evaluate(() => window.app.diag.determinismRuns(4));
  const det = result.determinism;
  evidence5("determinism.json", {
    determinism: det,
    fourRenderDiagnostic: diag,
    verdict: det?.ok
      ? det.bitIdentical
        ? "PASS (bit-identical)"
        : "PASS (amended-green: platform WebAudio noise within cap)"
      : "FAIL",
    amendedRule:
      "AMM-003 Branch A, ratified SB-005 after the TASK-026 bisect. Preview-layer E-28 = byte-identical for app-controlled paths; for a render that passes through native WebAudio nodes, determinism = max|Δ| ≤ the per-browser cap. Root cause (measured, not inferred): the divergence is introduced by Chromium's render scheduling and GROWS WITH GRAPH SIZE — bit-stable at ≤16 voices, −150 dBFS @64, −84 dBFS @256, −65 dBFS @1024 in a synthetic ladder with no app state and no PRNG (docs/evidence/sb005/).",
    disclosure:
      "Scope is ADR-0002: same build, same context configuration, one Song, two in-memory renders. BOTH behaviours are recorded — bit-identity AND measured-vs-cap — and the measured value with both hashes is always present. The 4-render diagnostic separates warm-up from true nondeterminism.",
  });
  expect(det, "no determinism result").not.toBeNull();
  expect(det.hashA).toHaveLength(64);
  expect(det.hashB).toHaveLength(64);
  expect(det.ok).toBe(true);
  // The amended rule is not a blank cheque: if this run is NOT bit-identical it
  // must have passed via the cap, with the measured number inside it and shown.
  if (!det.bitIdentical) {
    expect(det.capMet, "not bit-identical and the cap was missed — this is a real E-28 failure").toBe(true);
    expect(det.amended).toBe(true);
    expect(det.maxAbsDiff).toBeLessThanOrEqual(det.capAbs);
    expect(det.dbfs).toBeLessThanOrEqual(det.capDbfs);
  }
});

/* ---------------------------------------------------------------- TASK-021 f */

test("HV-6 — both themes render Dayshift and Nightshift", async ({ page }) => {
  await enterBench(page);
  const day = resolve(EVID, "hv-6-dayshift.png");
  const night = resolve(EVID, "hv-6-nightshift.png");
  await page.getByRole("tab", { name: /lattice/i }).click();
  await page.screenshot({ path: day });
  await page.getByTitle("Theme (Dayshift/Nightshift)").click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: night });
  const theme = await page.evaluate(() => window.app.ui().theme);
  const css = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  evidence("hv-6-themes.json", {
    themeState: theme,
    dataThemeAttribute: css,
    dayshiftKB: kb(day),
    nightshiftKB: kb(night),
    verdict: theme === "night" && css === "night" ? "PASS" : "FAIL",
    disclosure: "Agreeing with AG-04: the theme system is a token swap on :root[data-theme]; no component branches on theme.",
  });
  expect(theme).toBe("night");
  expect(kb(day)).toBeLessThanOrEqual(200);
  expect(kb(night)).toBeLessThanOrEqual(200);
});

/* ---------------------------------------------------------------- TASK-021 g */

test("P-02-PROXY — fresh-state record journey, timed", async ({ page }) => {
  await enterBench(page);
  await page.evaluate(() => window.app.freshState());

  // The canonical fresh-state reset (runbook HV-3): clear luthier.* + OPFS, reload.
  const t0 = Date.now();
  await page.reload();
  await page.getByRole("button", { name: /launch the bench/i }).click(); // gesture 1
  await page.waitForSelector(".bench");
  await page.keyboard.press("r"); // gesture 2 — record (P-22 default arms Keys + Voice)
  await page.waitForTimeout(2600); // 4-beat count-in at 118 qpm ≈ 2.03 s + margin
  for (const key of ["z", "x", "c", "v"]) {
    await page.keyboard.press(key); // musical typing while recording
    await page.waitForTimeout(70);
  }
  await page.keyboard.press(" ");
  await page.waitForFunction(
    () => {
      const song = window.app.song();
      return song.clips.some((c: any) => c.name.startsWith("Take")) && song.clips.some((c: any) => c.kind === "audio");
    },
    null,
    { timeout: 20_000 }
  );
  const elapsedMs = Date.now() - t0;

  const outcome = await page.evaluate(async () => {
    const song = window.app.song();
    const midi = song.clips.find((c: any) => c.name.startsWith("Take"));
    const audio = song.clips.find((c: any) => c.kind === "audio");
    const ui = window.app.ui();
    const probe = audio?.media ? await window.app.storage.probeMedia(audio.media.sha) : null;
    const placement = audio ? song.placements.find((p: any) => p.clip === audio.id) : null;
    return { midiNotes: midi?.notes.length ?? 0, audio, probe, placementTrack: placement?.track ?? null, ui };
  });

  evidence("p-02-proxy.json", {
    elapsedMsFromFirstGestureToClipCommitted: elapsedMs,
    target_ms: 60_000,
    midiTakeNotes: outcome.midiNotes,
    audioClip: outcome.audio?.media ?? null,
    audioProbe: outcome.probe,
    placementTrack: outcome.placementTrack,
    micArmedAtEnd: outcome.ui.micArmed,
    lastTake: outcome.ui.lastTake,
    verdict:
      elapsedMs <= 60_000 && outcome.midiNotes > 0 && outcome.probe?.ok && outcome.probe.probe.nonZeroSamples > 0 && outcome.probe.probe.peak > 0
        ? "PASS"
        : "FAIL",
    disclosure:
      "PROXY: scripted keys, not a human, and the microphone is Chromium's fake device (a synthetic tone). The number is an upper-bound-ish proxy for P-02, not the human stopwatch (HV-3). Scripted headless timing is not comparable to human feel — the maintainer still owns the final stopwatch.",
  });

  expect(elapsedMs).toBeLessThanOrEqual(60_000);
  expect(outcome.midiNotes).toBeGreaterThan(0);
  expect(outcome.probe?.ok, "media file missing at media/<sha>.wav").toBe(true);
  expect(outcome.probe.probe.nonZeroSamples).toBeGreaterThan(0);
  expect(outcome.probe.probe.peak).toBeGreaterThan(0);
  expect(outcome.probe.probe.channels).toBe(1);
  // count-in excluded: capture opens at arm time, so the 4-beat count-in is
  // trimmed from the front before the WAV is written (TASK-007b).
  expect(outcome.probe.probe.durationS, "recorded duration should exclude the count-in").toBeGreaterThan(0.2);
  expect(outcome.probe.probe.durationS).toBeLessThan(2.0);
  expect(outcome.audio.media.durationS).toBeCloseTo(outcome.probe.probe.durationS, 3);
  expect(outcome.probe.probe.sha256).toBe(outcome.audio.media.sha);
  expect(outcome.placementTrack, "audio placement does not reference the armed audio track").toBeTruthy();
});

/* ---------------------------------------------------------------- TASK-021 h */

test("TASK-007b + storage — recording duration, undo cap, quota", async ({ page }) => {
  await enterBench(page);
  const target = await page.evaluate(() => {
    const song = window.app.song();
    const clip = song.clips.find((c: any) => c.pattern);
    return { clipId: clip.id, pitch: clip.pattern.rows[0].pitch, audioTrack: song.tracks.find((t: any) => t.kind === "audio")?.id ?? null };
  });

  // A scripted edit session through the real command path (300 ops ≈ a long
  // manual editing session scaled down; the count is disclosed, not claimed).
  const quick = await page.evaluate(
    ({ clipId, pitch }) => {
      const t0 = performance.now();
      for (let i = 0; i < 300; i++) window.app.edit.toggleStep(clipId, pitch, i % 16);
      return { ops: 300, ms: Math.round(performance.now() - t0) };
    },
    target
  );
  const afterQuick = await page.evaluate(async () => ({
    stats: window.app.undo.stats(),
    usage: await window.app.storage.usage(),
    manifest: await window.app.storage.manifest(),
    songBytes: window.app.songBytes(),
    history: await window.app.history.list(),
  }));

  // R-1(c) conformance, measured BELOW the cap so the push is observable:
  // force one §11.6 snapshot (autosave otherwise waits 30 s), then restore it.
  // Restore must PUSH the pre-restore Song, never clear the stack.
  const restore = await page.evaluate(async () => {
    await window.app.history.snapshot();
    const listed = await window.app.history.list();
    const before = window.app.undo.stats();
    const res = await window.app.history.restore(0);
    const after = window.app.undo.stats();
    const restored = window.app.song().name;
    return { res, listed, before, after, restored, snapshots: listed.count };
  });

  // R-1(a) conformance: push past the 10,000-entry cap and prove FIFO eviction.
  const capOps = await page.evaluate(
    ({ clipId, pitch }) => {
      const t0 = performance.now();
      for (let i = 0; i < 10_050; i++) window.app.edit.toggleStep(clipId, pitch, i % 16);
      return { extraOps: 10_050, ms: Math.round(performance.now() - t0), stats: window.app.undo.stats() };
    },
    target
  );

  evidence("storage-undo-cap.json", {
    quickSession: quick,
    afterQuickSession: afterQuick,
    capSession: capOps,
    restorePushesEntry: restore,
    verdict:
      capOps.stats.depth === capOps.stats.cap &&
      capOps.stats.depth === 10_000 &&
      restore.res.ok === true &&
      restore.after.depth === restore.before.depth + 1
        ? "PASS"
        : "FAIL",
    disclosure:
      "The '10-minute-equivalent' session is 300 commands (disclosed scale factor), not a literal ten minutes. The history snapshots only advance on the 30 s autosave cadence, so this run also proves the in-session cap is independent of the §11.6 snapshot cap (R-1(a) vs R-1(b)). Quota: reported as used/quota bytes; a true quota-exhaustion path was NOT forced.",
  });

  expect(afterQuick.stats.cap).toBe(10_000);
  expect(afterQuick.stats.depth).toBe(300);
  expect(restore.snapshots, "no §11.6 snapshot was written").toBeGreaterThan(0);
  expect(restore.res.ok, `restore failed: ${JSON.stringify(restore.res)}`).toBe(true);
  expect(restore.after.depth, "restore must PUSH an entry, not clear the stack").toBe(restore.before.depth + 1);
  expect(capOps.stats.depth).toBe(10_000);
});

/* ---------------------------------------------------------------- TASK-007 a */

test("TASK-007a — microphone denial renders LR-0007 inline, no crash", async () => {
  // A real browser denial: launched WITHOUT --use-fake-ui-for-media-stream, so
  // the permission prompt has no one to answer and getUserMedia rejects.
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:4319", viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enterBench(page);
  await page.keyboard.press("r");
  await page.waitForTimeout(1500);
  const ui = await page.evaluate(() => window.app.ui());
  const panel = await page.locator(".mic-panel").innerText().catch(() => "");
  const panelVisible = await page.locator(".mic-panel").isVisible().catch(() => false);
  evidence("mic-denial.json", {
    micError: ui.micError,
    panelVisible,
    panelText: panel.replace(/\s+/g, " ").trim(),
    pageErrors: errors,
    verdict: Boolean(ui.micError?.includes("LR-0007")) && panelVisible && errors.length === 0 ? "PASS" : "FAIL",
    disclosure: "Denial is real (headless Chromium refuses the unanswerable permission prompt); the harness does not stub getUserMedia.",
  });
  expect(ui.micError, "no LR-0007 surfaced").toBeTruthy();
  expect(ui.micError).toContain("LR-0007");
  expect(panelVisible).toBe(true);
  expect(panel).toContain("LR-0007");
  expect(errors).toEqual([]);
  await browser.close();
});

/* ---------------------------------------------------------------- TASK-007 c */

test("TASK-007c — record-armed state, both themes", async ({ page }) => {
  await enterBench(page);
  await page.keyboard.press("r");
  await page.waitForTimeout(600); // count-in running, capture armed
  const day = resolve(EVID, "mic-armed-dayshift.png");
  const night = resolve(EVID, "mic-armed-nightshift.png");
  await page.screenshot({ path: day });
  await page.getByTitle("Theme (Dayshift/Nightshift)").click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: night });
  const ui = await page.evaluate(() => window.app.ui());
  const mic = await page.evaluate(() => window.app.mic());
  evidence("mic-armed.json", {
    micArmed: ui.micArmed,
    monitor: ui.monitor,
    captureLive: mic.live,
    sampleRate: mic.sampleRate,
    dayshiftKB: kb(day),
    nightshiftKB: kb(night),
    verdict: ui.micArmed && ui.monitor === false && mic.live ? "PASS" : "FAIL",
    disclosure: "Monitoring is asserted OFF by default (TASK-007). Device is Chromium's fake media stream.",
  });
  expect(ui.micArmed).toBe(true);
  expect(ui.monitor).toBe(false);
  expect(kb(day)).toBeLessThanOrEqual(200);
  expect(kb(night)).toBeLessThanOrEqual(200);
});

/* ---------------------------------------------------------------- TASK-032 */
/* R-4 interim, verified rather than claimed: the notches must sit at TRUE dB
   positions under the bar's actual mapping (−60 → 0 dBFS ⇒ −12 dB is 80 %,
   −6 dB is 90 %), each must be LABELLED, and the numeric peak readout and the
   peak-hold must both be present. */

test("TASK-032 / R-4 — meter: labelled dB notches, numeric peak readout, peak-hold", async ({ page }) => {
  await enterBench(page);
  await page.getByRole("tab", { name: /desk/i }).click();
  await page.waitForSelector(".desk");
  await page.getByTitle("Play / Stop (Space)").click(); // signal so the meter and hold are exercised
  await page.waitForTimeout(900);

  const meter = await page.evaluate(() => {
    const bar = document.querySelector(".grain-meter") as HTMLElement | null;
    if (!bar) return null;
    const readout = document.querySelector(".meter-peak") as HTMLElement | null;
    return {
      notches: Array.from(bar.querySelectorAll(".notch")).map((n) => ({
        bottom: (n as HTMLElement).style.bottom,
        label: n.textContent?.trim() ?? "",
      })),
      fillHeight: (bar.querySelector(".fill") as HTMLElement | null)?.style.height ?? null,
      holdPresent: Boolean(bar.querySelector(".hold")),
      holdBottom: (bar.querySelector(".hold") as HTMLElement | null)?.style.bottom ?? null,
      readout: readout?.textContent?.trim() ?? null,
      readoutFontVariant: readout ? getComputedStyle(readout).fontVariantNumeric : null,
      masterGainLabels: Array.from(document.querySelectorAll(".strip.master .value")).map((e) => e.textContent?.trim()),
      barWidthPx: Math.round(bar.getBoundingClientRect().width),
    };
  });

  const shot = resolve(EVID, "meter-desk-dayshift.png");
  await page.screenshot({ path: shot });

  evidence5("meter.json", {
    meter,
    expectedNotchBottom: { "−12": "80%", "−6": "90%" },
    screenshotKB: kb(shot),
    verdict:
      meter &&
      meter.notches.length === 2 &&
      meter.notches[0].label === "−12" &&
      meter.notches[1].label === "−6" &&
      meter.notches[0].bottom === "80%" &&
      meter.notches[1].bottom === "90%" &&
      meter.readoutFontVariant === "tabular-nums"
        ? "PASS"
        : "FAIL",
    disclosure:
      "Mapping is −60 dBFS (bottom) → 0 dBFS (top); the two M1 notches are at −12 and −6 dBFS, each carrying its own label. Under the previous LINEAR-amplitude bar the 78 %/90 % notches meant −2.2/−0.9 dBFS — not the loudness they appeared to mark. The full §6.8.3 scale is M2 scope (R-4).",
  });

  expect(meter, "no meter found").not.toBeNull();
  expect(meter!.notches.map((n) => n.label)).toEqual(["−12", "−6"]);
  expect(meter!.notches.map((n) => n.bottom)).toEqual(["80%", "90%"]);
  expect(meter!.readout, "no numeric peak readout").not.toBeNull();
  expect(meter!.readoutFontVariant).toBe("tabular-nums");
  // P-15: MASTER_GAIN = 0.9 is −0.92 dB and the strip must say so, not "−0.0 dB".
  expect(
    meter!.masterGainLabels.some((l) => l === "-0.9 dB"),
    `master gain readout was ${JSON.stringify(meter!.masterGainLabels)} (expected the true MASTER_GAIN value, not "-0.0 dB")`
  ).toBe(true);
});

/* ---------------------------------------------------------------- TASK-030 */

test("TASK-030 — underrun counter is live: a synthetic main-thread stall is counted and ringed", async ({ page }) => {
  await enterBench(page);
  await page.getByTitle("Play / Stop (Space)").click();
  await page.waitForTimeout(600); // let the transport steady so the stall is the only anomaly
  const before = await page.evaluate(() => window.app.engine().underruns);

  // Block the main thread well past the 120 ms look-ahead window. The scheduler
  // cannot fire, so material comes due with nothing queued ahead of it: the web
  // layer's realtime feed failed, which IS this layer's underrun.
  const stallMs = 500;
  await page.evaluate((ms) => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      /* deliberately spin — a stand-in for GC / layout / a heavy edit */
    }
  }, stallMs);
  await page.waitForTimeout(400);

  const after = await page.evaluate(() => window.app.engine());
  const ring = after.xruns.slice(-5);
  evidence5("underrun-stall.json", {
    underrunsBefore: before,
    underrunsAfter: after.underruns,
    delta: after.underruns - before,
    ringSize: after.xruns.length,
    lastEvents: ring,
    lookaheadMs: 120,
    timerBudgetMs: 25,
    stallMs,
    verdict: after.underruns > before && ring.some((r: any) => r.cause === "starvation") ? "PASS" : "FAIL",
    disclosure:
      "PROXY: a busy-loop stands in for a real main-thread stall (GC, layout, a heavy edit). The counter increments on look-ahead starvation, the ring names the cause and the moment, and nothing is auto-repaired — failure is loud (P-14) and no hidden moves are made (P-15).",
  });
  expect(after.underruns, "counter never incremented across a stall past the look-ahead window").toBeGreaterThan(before);
  expect(ring.some((r: any) => r.cause === "starvation"), `no starvation entry in the ring: ${JSON.stringify(ring)}`).toBe(true);
});

/* ---------------------------------------------------------------- TASK-033 */
/* R-5 / HV-4 amended: single-surface DOM is correct (P-01), so the observable
   requirement is the stronger one — a surface that was switched away from and
   back must render from the MODEL, never from a stale cache. */

test("TASK-033 — remount-freshness: switch away → mutate → switch back renders the model", async ({ page }) => {
  await enterBench(page);

  const readModel = () =>
    page.evaluate(() => {
      const s = window.app.song();
      const onSteps = s.clips
        .filter((c: any) => c.pattern)
        .reduce((n: number, c: any) => n + c.pattern.rows.reduce((m: number, r: any) => m + r.steps.filter((x: any) => x.on).length, 0), 0);
      return { onSteps, tracks: s.tracks.filter((t: any) => t.kind !== "master").length };
    });
  const count = (sel: string) => page.locator(sel).count();
  const visit = async (tab: RegExp, selector: string) => {
    await page.getByRole("tab", { name: tab }).click();
    await page.waitForSelector(selector);
  };

  const clip = await page.evaluate(() => {
    const c = window.app.song().clips.find((x: any) => x.pattern);
    return { id: c.id, pitch: c.pattern.rows[0].pitch };
  });

  const baselineModel = await readModel();
  await visit(/loom/i, "[data-loom-step]");
  const baselineLoom = await count("[data-loom-step]");

  // Switch AWAY from Loom, mutate through the real command path, switch back.
  await visit(/desk/i, ".desk");
  await page.evaluate(({ clipId, pitch }) => window.app.edit.toggleStep(clipId, pitch, 3), { clipId: clip.id, pitch: clip.pitch });

  // (2) model-first assertion: the mutation is observable in the model BEFORE
  // any view makes a claim about it.
  const mutatedModel = await readModel();
  expect(mutatedModel.onSteps !== baselineModel.onSteps, "mutation not observable in the model").toBe(true);

  // (3) remount-freshness: the decisive probe.
  await visit(/loom/i, "[data-loom-step]");
  const remountedLoom = await count("[data-loom-step]");

  // Walk the remaining four surfaces and confirm each mounts and projects the
  // current model rather than a cache.
  const mounted: string[] = ["loom"];
  await visit(/lattice/i, ".lattice-step");
  mounted.push("lattice");
  const latticeOn = await count(".lattice-step.on");
  await visit(/ivory/i, ".ivory");
  mounted.push("ivory");
  await visit(/desk/i, ".desk");
  mounted.push("desk");
  const deskStrips = await count(".strip:not(.master)"); // master strip is a separate element, not a track
  await visit(/scope/i, ".scope");
  mounted.push("scope");
  const scopeCells = await count(".scope");

  evidence5("remount-freshness.json", {
    baseline: { model: baselineModel, loomDom: baselineLoom },
    mutatedModel,
    loomAfterRemount: remountedLoom,
    expectedLoomAfterRemount: mutatedModel.onSteps,
    latticeOnAfterRemount: latticeOn,
    deskStrips, expectedDeskStrips: mutatedModel.tracks,
    scopeCells,
    surfacesRemounted: mounted,
    verdict:
      remountedLoom === mutatedModel.onSteps && deskStrips === mutatedModel.tracks && mounted.length === 5 ? "PASS" : "FAIL",
    disclosure:
      "The host mounts exactly ONE surface at a time (P-01, R-5), so a switched-back surface is a fresh mount and not a cached DOM. The decisive probe is Loom: switch away → mutate via the model → switch back must show the NEW count. No stale-cache orphan was found. Ivory's canvas exposes no model-derived count selector, so it is covered by remount + consistency rather than a DOM count — stated here rather than implied.",
  });

  expect(remountedLoom, "Loom rendered a stale cache after remount instead of the model").toBe(mutatedModel.onSteps);
  expect(deskStrips).toBe(mutatedModel.tracks);
  expect(scopeCells).toBeGreaterThan(0);
  expect(mounted).toHaveLength(5);
});
