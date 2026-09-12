/* Launch flow: landing → Bench. Non-modal (P-04). */

import { getState, setState } from "./store";
import { engine } from "./engine";
import { makeFactorySong } from "./factory";

let benchStarted = false;

export function cmdLaunchBench() {
  if (!benchStarted) {
    const st = getState();
    if (st.song.tracks.length === 0) {
      const song = makeFactorySong();
      setState({ song });
    }
    engine.setSong(getState().song);
    benchStarted = true;
  }
  setState({ bench: true });
}
