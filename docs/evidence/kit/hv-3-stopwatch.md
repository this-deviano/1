# HV-3 — P-02 stopwatch (M1 exit kit)

Human-verifiable item: this is the only number in the M1 exit that is really yours. The
committed number is a **scripted headless upper bound**, not a human feel. Fill in `RESULT`
and `VERDICT` below with your own hand.

Companion: `docs/runbooks/first-light-human.md` §3. Authority: `docs/amendments/AMM-004.md`.

## Fresh-state reset (canonical, in this order)

1. DevTools → **Application → Local Storage** → delete **every `luthier.*` key**
   (`luthier.song.v1`, `luthier.metronome.v1`, `luthier.coach.dismissed`).
2. DevTools → **Application → Storage → Origin Private File System** → delete `song.json`,
   `song.json.tmp`, `manifest.json`, and the `history/` and `media/` directories.
   (Equivalent shortcut: Bench → **New Song** — the one two-step guard in the app. It clears
   all of the above and reloads; confirm within 3 s.)
3. **Reload.** You should see the factory Song "First Light".

## The journey (with a stopwatch)

1. **Start the stopwatch on reload.**
2. Click through to the Bench → press **R** → wait the 4-beat count-in → play the
   musical-typing row (**Z–M = C3–C4**) → press **Space** to stop.
3. **Stop the stopwatch when the take clip appears on the lane.**

**Target: ≤ 60 s** (P-02; the constitution floor).

## Proxy trend (the number moves run to run)

| run | elapsed ms | source |
| --- | ---------- | ------ |
| SB-004 | 3,875 | `docs/evidence/sb004/p-02-proxy.json` |
| SB-005 | 3,892 | SB-005 battery run |
| SB-006 close-out | **3,384** | `docs/evidence/sb005/p-02-proxy.json` |

The constitution floor is **60 s**. All three are **PROXY**: headless Chromium, scripted
keys, no human, and the microphone is Chromium's fake device. Scripted headless timing is
**not comparable to human feel** — record your own number and it is the real one.

## Pass criteria

Your stopwatch, from reload to the committed take clip, at or under **60,000 ms**, with the
journey completed (no dead ends, no crash, count-in observed). Over the floor is a defect:
file it in `TASKS.md` with the rule it breaks and leave `MILESTONE` at `M1-EXIT-PENDING`.

## RESULT

_(maintainer — actual ms, plus one line on what felt slow or fast)_

## VERDICT

_(maintainer — PASS / FAIL, and if FAIL, the rule broken)_

VERIFIED-BY / DATE:
