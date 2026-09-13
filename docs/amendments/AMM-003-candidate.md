# AMM-003-candidate — Determinism scope in the browser preview layer (AG-10)

Raised by: TASK-021 harness (SB-004), measured — not theorised.
Status: **proposal only**, maintainer-ratified (AG-05). The gate was NOT widened.

## What was measured (docs/evidence/sb004/determinism.json)

Five offline renders of one unchanged Song (`engine.renderBuffer`, same
`OfflineAudioContext` configuration, same process, same seed):

| run | sha256 (16) | max&#124;Δ&#124; vs run 0 |
| --- | ----------- | ------------------------- |
| 0 | `8d0b5940e6fadb8f` | 0 |
| 1 | `1b06efaac575aefe` | 4.172e-7 |
| 2 | `86d287725a936f06` | 4.172e-7 |
| 3 | `ec933ed5222f23f6` | 4.768e-7 |
| 4 | `0e2a7b7f3bd4a23e` | 4.768e-7 |

`sameAsFirst = [true, false, false, false]` — **every** render differs, so this is
not a one-time warm-up artifact. Divergence: **≈ −127.6 dBFS**.

## Why this is a constitution problem, not a bug report

- E-28 / P-08 say *deterministic offline render*. `app.selftest.determinism()`
  implements that the strictest available way: SHA-256 equality of two RNG
  buffers. On this platform that criterion is **unattainable**, and no amount of
  application code fixes it.
- The application side IS deterministic by construction: `renderBuffer()` re-seeds
  its stream from `song.seed` on every call (E-003), `materialEvents()` is a
  stable-sorted pure mapping of the Song, and both schedulers build the bus from
  one `buildMasterGraph()`. Nothing in our code can consume entropy across calls.
- Corroboration: the R-2 parity guard's independently-produced residual is the
  **same order** (4.77e-7, −126.4 dBFS, see `parity.json`). Two unrelated
  comparisons landing on the same magnitude is the signature of platform
  float noise, not of a scheduling divergence.

## Consequence for R-2 (important, and better than assumed)

R-2 assumed a "documented preroll/envelope path divergence" worth up to −80 dBFS
that would need eliminating to reach the −96 dBFS floor. **That divergence does
not exist at any scale above the platform noise floor.** The guard already
reports `floorMet: true` (−126.4 dBFS vs a −96 dBFS floor). The ship gate and the
constitution floor are therefore both satisfied today, by ~30 dB. R-2's
convergence task (TASK-023) has no remaining code work; it reduces to keeping the
dual-number display and re-measuring.

## Proposed resolution (for ratification, not applied)

1. Restate E-28 in the **preview layer** as: identical event sequence + divergence
   at or below the platform render-noise floor, with an explicit numeric floor
   (proposal: **−120 dBFS**, i.e. ~7 dB above the worst measured noise, chosen so
   a real regression cannot hide inside it).
2. Keep SHA-256 equality as the **normative-stack** target (ADR-0001: our own
   renderer, no browser FP variance) and as a *diagnostic* here, never as a gate
   that is known-unattainable.
3. A regression that changes the event sequence or the graph would exceed
   −120 dBFS by orders of magnitude, so the tolerance does not weaken the guard's
   ability to catch real bugs; only platform noise is absorbed.
4. Do NOT do this unilaterally: `ok` stays bit-exact, the harness test stays red,
   and HV-5 remains open until the maintainer rules.

## Explicitly not root-caused

The divergence is NOT isolated to a specific Chrome stage (DynamicsCompressor
lookahead, denormal handling and SIMD path selection are all candidate causes,
untested). Isolating it requires a minimal-graph bisect outside this session's
scope. Recorded here so the next session does not have to re-derive it.
