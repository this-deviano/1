/* Engine status bridge — one subscription at the Bench, read anywhere.
   Keeps the 60 Hz meter/playhead data out of React state churn (§22.5). */

import { useSyncExternalStore } from "react";
import type { EngineStatus } from "./engine";

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
