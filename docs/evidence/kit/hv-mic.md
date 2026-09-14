# HV-MIC — real-hardware microphone journey (M1 exit kit)

Human-verifiable item: the automated battery records through **Chromium's fake device**
(a synthetic tone), so it cannot speak for real hardware, real permission UI, or real
monitoring. Fill in `RESULT` and `VERDICT` below with your own hand.

Companion: `docs/runbooks/first-light-human.md` §2. Authority: `docs/amendments/AMM-004.md`.

## Steps

1. In the Bench, arm an **audio track** (press **R**, or the Rail record button).
2. The mic panel appears with **monitoring OFF by default** — read it before granting
   anything.
3. Wait for the browser permission prompt and **grant** it.
   - To see the denial path first, deny once: the app must render the inline **LR-0007**
     panel with a retry — no crash, no modal, page still usable. Then retry and grant.
4. Wait the **4-beat count-in**, play or speak, press **Space** to stop.
5. **Hear it back**: play the resulting clip from the timeline.

## Listen-fors / observe

- Monitoring is **off by default**, and the panel says so.
- Enabling monitoring (**"Mon off" → "Mon on"**) shows the **headphone warning** inline —
  monitoring through speakers will feed back.
- The clip lands on the armed audio track and plays back; duration and peak in the toast are
  **truthful**, and the count-in is trimmed from the take.
- The tab's recording indicator goes out when you stop (the device is always released).

## Proxy reference (automated — stands in only under AMM-004 Path B)

Chromium fake device (synthetic tone), from `docs/evidence/sb005/`:

| proxy | value |
| ----- | ----- |
| take size | 149,168 bytes |
| format | mono, 32-bit float, 44.1 kHz |
| duration (count-in excluded) | 0.845 s |
| peak / non-zero samples | 1.0 / 777 |
| content-addressed read-back | `sha256` **equals** the clip's OPFS `media/` pointer |
| denial path | real headless denial (`NotFoundError`) → LR-0007 + retry, 0 page errors |
| armed state | monitoring **OFF** asserted, both themes screenshotted |

All **PROXY**: synthetic input, no permission UI, no real monitoring. Fixtures:
`docs/evidence/sb005/p-02-proxy.json`, `mic-armed.json`, `mic-denial.json`.

## Pass criteria

Real grant works; denial shows LR-0007 with retry and no crash; monitoring defaults OFF and
warns about headphones; the take lands, plays back, and its duration/peak are truthful with
the count-in trimmed. Any failure is a defect: file it in `TASKS.md` with the rule it breaks
and leave `MILESTONE` at `M1-EXIT-PENDING`.

## RESULT

_(maintainer — one or two lines: device used, granted/denied, did the take land and play back)_

## VERDICT

_(maintainer — PASS / FAIL, and if FAIL, the rule broken)_

VERIFIED-BY / DATE:
