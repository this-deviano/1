# FIRST-LIGHT — Human-Verify Protocol (HV-1 … HV-6)

You are verifying runtime behavior the build agent cannot observe (no browser/mic in the sandbox).
For each item: follow the numbered click-path, record the observation, place captures in
`docs/evidence/` (screenshots, checksums, stopwatch numbers). Naming: `hv-1-console.txt`,
`hv-3-stopwatch.md`, `hv-4-dayshift.png`, `hv-4-nightshift.png`, `hv-5-checksum.txt`.

## HV-1 — dev server boots clean
1. `bun install && bun run dev` (or let the preview host run it).
2. Open http://localhost:5173 in a fresh tab, open DevTools → Console.
3. Click the landing CTA → Bench shell appears.
Observe: zero console errors or warnings during load and for 10 s after entering the Bench.
Capture: paste any console output verbatim into `docs/evidence/hv-1-console.txt`.

## HV-2 — first play makes sound
1. In the Bench, press Space (or click ▶ in the Rail).
2. Listen: drums (TR-808 kit) + keys should be audible immediately.
Observe: sound starts within ~150 ms of the press; no silent-dead transport; the latency badge in the Rail shows a non-zero value.
Capture: note yes/no + the latency badge value.

## HV-3 — P-02 stopwatch journey on fresh state
1. Reset to factory-fresh: DevTools → Application → Local Storage → delete keys
   `luthier.song.v1` and `luthier.coach.dismissed` for the origin → reload.
   (This is the canonical fresh-state reset; after TASK-005 the OPFS root
   `song.json` deletion joins this list.)
2. Start a stopwatch on reload.
3. Click through to the Bench → press R (record) → wait 4-beat count-in → play keys
   on the musical-typing row (Z–M = C3–C4) → press Space to stop.
Observe: a "Take 1" clip appears on the Keys lane; the whole journey from reload to hearing
your take should be ≤ 60 s.
Capture: the measured number into `docs/evidence/hv-3-stopwatch.md`.

## HV-4 — one-truth edit propagation (one frame)
1. In Loom, double-click the Drums lane clip (opens Lattice).
2. Toggle one step (e.g. Snare step 5).
Observe: the Loom miniature clip body updates in the same frame, and Ivory shows the note.
No reload, no delay.
Capture: `docs/evidence/hv-4-dayshift.png` (before/after pair accepted as two files).

## HV-5 — export determinism checksum
1. Rail → Export (WAV). Wait for the download.
2. Export again without touching anything.
3. In a terminal: `sha256sum out1.wav out2.wav` (names per your downloads).
Observe: identical hashes.
Capture: paste the sha256sum output into `docs/evidence/hv-5-checksum.txt`.

## HV-6 — both-theme screenshots
1. Rail → theme button: capture Dayshift.
2. Toggle to Nightshift: capture again (landing + Bench).
Observe: warm paper tones in both; no purple/indigo/violet; no blur.
Capture: `docs/evidence/hv-6-dayshift.png`, `docs/evidence/hv-6-nightshift.png`.

The session is not blocked on human return: file results when convenient.
