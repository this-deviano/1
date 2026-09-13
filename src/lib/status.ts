/* Engine status bridge — one subscription at the Bench, read anywhere.
   Keeps the 60 Hz meter/playhead data out of React state churn (§22.5).
   Also owns the dev self-test console hook + failure state (P-14). */

import { useSyncExternalStore } from "react";
import type { EngineStatus } from "./engine";
import { selfTestRenderParity, selfTestDeterminism } from "./selftest";
import type { DeterminismResult, ParityResult } from "./selftest";

let status: EngineStatus = {
  running: false,
  recording: false,
  playheadTick: 0,
  underruns: 0,
  latencyMs: 0,
  clipAvg: 0,
};

const listeners = new Set<() => void>();

export function pushStatus(s: EngineStatus) {
  status = s;
  for (const l of listeners) l();
}

export function getStatus(): EngineStatus {
  return status;
}

export function useStatus(): EngineStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status
  );
}

/* ---------- dev self-tests (SB-003 §4 parity guard, TASK-017; P-14) ----------
   Console: app.selftest.renderparity() / app.selftest.determinism().
   A parity-guard failure flips a module flag the Bench renders as a red
   inline panel; failures are never silent (P-14), never modals (P-04). */

export type SelfTestState = {
  running: boolean;
  parity: import("./selftest").ParityResult | null;
  determinism: import("./selftest").DeterminismResult | null;
  error: string | null;
};

let selfTest: SelfTestState = { running: false, parity: null, determinism: null, error: null };
const stListeners = new Set<() => void>();

export function useSelfTest(): SelfTestState {
  return useSyncExternalStore(
    (l) => {
      stListeners.add(l);
      return () => stListeners.delete(l);
    },
    () => selfTest
  );
}

function setSelfTest(patch: Partial<SelfTestState>) {
  selfTest = { ...selfTest, ...patch };
  for (const l of stListeners) l();
}

/** −inf (bit-identical) prints as such; the measured number is never hidden (R-2, P-07). */
function fmtDbfs(dbfs: number): string {
  return dbfs === Number.NEGATIVE_INFINITY ? "−inf" : dbfs.toFixed(1);
}

export interface SelfTestRunResult {
  parity: ParityResult | null;
  determinism: DeterminismResult | null;
  error: string | null;
}

/* R-2: the verdict ALWAYS carries the measured value and BOTH thresholds — the
   ship gate (−80 dBFS) and the constitution floor (−96 dBFS) — so neither the
   console line nor the returned object can be read as "passed" without them. */
async function runBothSelfTests(): Promise<SelfTestRunResult> {
  setSelfTest({ running: true, error: null });
  try {
    const parity = await selfTestRenderParity();
    const determinism = await selfTestDeterminism();
    setSelfTest({ running: false, parity, determinism });
    // eslint-disable-next-line no-console
    console.log(
      `[selftest] renderparity: ${parity.ok ? "PASS" : "FAIL"} · measured max|Δ|=${parity.maxAbsDiff.toExponential(3)} (${fmtDbfs(parity.dbfs)} dBFS) · ship gate ${parity.gateDbfs} dBFS ${parity.gateMet ? "met" : "MISSED"} · constitution floor ${parity.floorDbfs} dBFS ${parity.floorMet ? "met" : "NOT met"} · bit-identical=${parity.bitIdentical}\n[selftest] determinism: ${determinism.ok ? "PASS" : "FAIL"} · ${determinism.hashA.slice(0, 16)}… vs ${determinism.hashB.slice(0, 16)}…`
    );
    return { parity, determinism, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "self-test crashed";
    setSelfTest({ running: false, error: message });
    return { parity: null, determinism: null, error: message };
  }
}

export function installSelfTests() {
  if (typeof window === "undefined") return;
  const w = window as unknown as { app?: { selftest?: unknown } };
  w.app = w.app ?? {};
  w.app.selftest = {
    // Both return the full result (measured value + both thresholds) per R-2.
    renderparity: () => runBothSelfTests(),
    determinism: () => runBothSelfTests(),
  };
}
