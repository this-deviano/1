# HV-EARS — ears on the render (M1 exit kit)

Human-verifiable item. No automated check can stand in for it: the whole point is that a
person listens. Fill in `RESULT` and `VERDICT` below with your own hand.

Companion: `docs/runbooks/first-light-human.md` §1. Authority: `docs/amendments/AMM-004.md`.

## Steps (export path)

1. Launch: `bun run dev`, open the printed URL in a fresh tab, land on the Bench.
2. Press **Space** — drums (TR-808 kit) + keys must be audible immediately.
3. Press **M** for the metronome, **L** for the loop, play a few bars.
4. Rail → **Export** → renders `WAV (32-bit float)`. The file lands in your browser's
   **Downloads** folder, named after the Song (`<song name>.wav`). **Listen to the exported
   file, not just the live bus** — the export is the ears-on-the-render artifact.

## Listen-fors

- **Count-in trimmed** — a recorded take must not open with the 4-beat count-in.
- **No clicks / pops** — no discontinuities at clip edges, transport start/stop, or export.
- **Sane level** — no clipping, no near-silence, no obvious gain jump between the live bus
  and the export. The live bus and the export are one construction since the SB-004
  `MASTER_GAIN` correction (`ee0667c`); if they sound different, that is a defect.
- **Latency badge** in the Rail shows a non-zero value (proxy: 10 ms @ 44.1 kHz).

## Caveat — the ≈0.92 dB hot note

**Exports produced before the SB-004 `MASTER_GAIN` fix (`ee0667c`) are ≈0.92 dB hot;
exports produced after it are not.** This caveat applies **only** to pre-fix exports. A file
you export today from this build is post-fix and must not be judged against it. If you are
comparing against an older exported file, re-export first.

## Proxy reference (automated — stands in only under AMM-004 Path B)

| proxy | value | source |
| ----- | ----- | ------ |
| console-clean boot | 0 errors / 0 warnings over 10 s | `docs/evidence/sb005/hv-1-console.json` |
| AudioContext after first gesture | `running`, 44.1 kHz, 10 ms | `docs/evidence/sb005/hv-2-audiocontext.json` |
| parity (live vs offline bus) | max&#124;Δ&#124; 4.768e-7 = −126.4 dBFS vs a −96 dBFS floor | `docs/evidence/sb005/parity.json` |
| determinism (two renders) | −125.4 dBFS vs the −120 dBFS cap, amended-green | `docs/evidence/sb005/determinism.json` |

Every one of those is a **PROXY**: headless Chromium, scripted transport, no listener. They
can show that the bus is correct and audible; they cannot say that it sounds like an instrument.

## Pass criteria

Counting-in trimmed, no clicks or pops, sane level, live bus and export agree by ear, latency
badge non-zero. Any of these failing is a defect: file it in `TASKS.md` with the rule it breaks
and leave `MILESTONE` at `M1-EXIT-PENDING`.

## RESULT

_(maintainer — one or two lines: what you listened to, on what, and what you heard)_

## VERDICT

_(maintainer — PASS / FAIL, and if FAIL, the rule broken)_

VERIFIED-BY / DATE:
