/* E-004 headless verification harness (TASK-021) — the preview layer's runtime
   instrument. Genesis §24: committed product code, not a sandbox-only artifact.

   One command for the maintainer:
     bun run test:preview        (builds, serves dist/, runs every HV check)

   Chromium flags make the microphone deterministic:
     --use-fake-device-for-media-stream  → a synthetic tone instead of hardware
     --use-fake-ui-for-media-stream      → auto-grant (the DENIAL path is a
                                           separate real-browser test in the spec,
                                           launched without the fake-UI flag)
   Every number this harness produces is a PROXY and is labeled as such in its
   evidence file (docs/evidence/sb004/). Ears remain human. */

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/preview",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4319",
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
        "--mute-audio",
      ],
    },
  },
  webServer: {
    command: "bun run build && bun run preview",
    url: "http://127.0.0.1:4319",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
