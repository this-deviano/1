# HV-6 — both themes, GRAIN-vs-slop checklist (M1 exit kit)

Human-verifiable item: the harness can capture both themes and assert `data-theme`, but it
cannot judge whether they look like GRAIN. Fill in `RESULT` and `VERDICT` below with your own
hand.

Companion: `docs/runbooks/first-light-human.md` §4. Authority: `docs/amendments/AMM-004.md`.
Design law: `docs/GENESIS.md` §6 (GRAIN) and G-12.

## Steps

Rail → theme button. Capture **Dayshift**, toggle to **Nightshift**, capture again — landing
and Bench. Theme is a token swap on `:root[data-theme]`; Dayshift is the default.

## GRAIN-vs-slop checklist

| # | check | must be |
| - | ----- | ------- |
| 1 | gradients in functional UI | **none** (waveform amplitude fills are the only exemption) |
| 2 | glass / `backdrop-filter` | **absent** |
| 3 | purple / indigo / violet | **none anywhere** |
| 4 | blur shadows | **none** — hard-edged elevation, `step-shadow`, not soft glow |
| 5 | chamfer present | **present** — the signature `clip-path: var(--grain-chamfer)` on machined surfaces |
| 6 | type | **Schibsted Grotesk** (UI), **Spline Sans Mono** (values), **Fraunces** (display / verbs) — no Inter/Roboto/system-ui as identity faces |
| 7 | both themes warm | warm paper (Dayshift) and warm ember (Nightshift); neither is dark-mode-only, neither is navy |
| 8 | emoji / skeleton shimmer / stock illustration / chatbot | **none** |

## Proxy reference (automated — stands in only under AMM-004 Path B)

PNG proxies exist at `docs/evidence/sb005/hv-6-dayshift.png` and
`docs/evidence/sb005/hv-6-nightshift.png` (79 KB each, per
`docs/evidence/sb005/hv-6-themes.json`), plus the Desk meter and record-armed captures in the
same directory. All **PROXY**: they prove the theme token swap renders and that both variants
were captured, not that they read as GRAIN to a human eye.

## Pass criteria

All eight checks above hold in **both** themes. Any hit is a defect: file it in `TASKS.md`
with the rule it breaks (G-12 for the forbidden list, §6 for GRAIN) and leave `MILESTONE` at
`M1-EXIT-PENDING`.

## RESULT

_(maintainer — one line per theme: what you inspected, and any hit on the list)_

## VERDICT

_(maintainer — PASS / FAIL, and if FAIL, the rule broken)_

VERIFIED-BY / DATE:
