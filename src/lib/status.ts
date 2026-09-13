/* Engine status bridge — one subscription at the Bench, read anywhere.
   Keeps the 60 Hz meter/playhead data out of React state churn (§22.5).
   Also owns the dev self-test console hook + failure state (P-14). */

import { useSyncExternalStore } from "react";
import type { EngineStatus } from "./engine";
import { engine } from "./engine";

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
  parity: { ok: boolean; maxAbsDiff: number; dbfs: number; liveHash: string; offlineHash: string; bitIdentical: boolean } | null;
  determinism: { ok: boolean; hashA: string; hashB: string; bitIdentical: boolean } | null;
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

async function runBothSelfTests(): Promise<void> {
  setSelfTest({ running: true, error: null });
  try {
    const parity = await engine.selfTestRenderParity();
    const determinism = await engine.selfTestDeterminism();
    setSelfTest({ running: false, parity, determinism });
    // eslint-disable-next-line no-console
    console.log(
      `[selftest] renderparity: ${parity.ok ? "PASS" : "FAIL"} · max|Δ|=${parity.maxAbsDiff.toExponential(3)} (${parity.dbfs === Number.NEGATIVE_INFINITY ? "−inf" : parity.dbfs.toFixed(1)} dBFS) · bit-identical=${parity.bitIdentical}\n[selftest] determinism: ${determinism.ok ? "PASS" : "FAIL"} · ${determinism.hashA.slice(0, 16)}… vs ${determinism.hashB.slice(0, 16)}…`
    );
  } catch (e) {
    setSelfTest({ running: false, error: e instanceof Error ? e.message : "self-test crashed" });
  }
}

export function installSelfTests() {
  if (typeof window === "undefined") return;
  const w = window as unknown as { app?: { selftest?: unknown } };
  w.app = w.app ?? {};
  w.app.selftest = {
    renderparity: () => void runBothSelfTests(),
    determinism: () => void runBothSelfTests(),
  };
}
