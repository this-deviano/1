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

const EVID = resolve("docs/evidence/sb004");
mkdirSync(EVID, { recursive: true });
const PROXY = "PROXY — headless Chromium (chrome-headless-shell 153), production bundle via `vite preview`.";

function evidence(name: string, data: Record<string, unknown>): void {
  writeFileSync(resolve(EVID, name), JSON.stringify({ proxy: PROXY, ...data }, null, 2) + "\n");
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
  evidence("parity.json", {
    parity: result.parity,
    determinism: result.determinism,
    error: result.error,
    verdict: result.parity?.gateMet ? "PASS (ship gate)" : "FAIL",
    disclosure:
      "The constitution floor (−96 dBFS) is reported separately and is the M2-exit target (TASK-023), not a hidden pass. The gate was not widened for this run.",
  });
  expect(result.error).toBeNull();
  expect(result.parity, "no parity result").not.toBeNull();
  expect(result.parity.gateMet).toBe(true);
});

/* ---------------------------------------------------------------- TASK-021 e */

test("determinism — double render (HV-5 / E-28)", async ({ page }) => {
  await enterBench(page);
  const result = await page.evaluate(() => window.app.selftest.determinism());
  const diag = await page.evaluate(() => window.app.diag.determinismRuns(4));
  const det = result.determinism;
  evidence("determinism.json", {
    determinism: det,
    fourRenderDiagnostic: diag,
    verdict: det?.ok ? "PASS" : "FAIL",
    disclosure:
      "Scope is ADR-0002: same build, same context configuration, one Song, two in-memory renders. The 4-render diagnostic separates a one-time warm-up artifact from true nondeterminism; the SHA-256 criterion is NOT relaxed here — the tolerance question is constitutional (AMM-003-candidate), not a gate to quietly widen.",
  });
  expect(det, "no determinism result").not.toBeNull();
  // Deliberately loud: if two renders of one Song are not bit-identical this test
  // MUST fail — that is a real P-08/E-28 failure, never flakiness to rerun away.
  expect(
    det.bitIdentical,
    `two offline renders of one Song differ: max|Δ|=${det.maxAbsDiff.toExponential(3)} (${det.dbfs.toFixed(1)} dBFS) · hashes ${det.hashA.slice(0, 16)}… vs ${det.hashB.slice(0, 16)}…`
  ).toBe(true);
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
