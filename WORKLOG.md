# WORKLOG — append-only

## SB-002 — 2026-09-12
- START: first-light verification + constitutional bootstrap; no new features.
- AG-07 CHECK: original root commit ancestor: yes — root `74ee3eb` ("Initial commit") is an ancestor of HEAD `4a18447`; history linear (2 commits total), no rewrite detected. Never will be rewritten.
- E-001 DECLARED: solo AG-12 exception for bootstrap docs on main (TASK-001, TASK-003 only). All code changes (TASK-004) go on fix/* branches merged via PR; exception logged here.
- E-002 DECLARED: AG-12 merge mechanics — the platform owns PR creation/merge/push (Changes panel), so TASK-004 code commits are stacked on fix/* branches locally (fix/seeded-noise → fix/meter-gradient → fix/local-fonts → fix/inline-confirm, one concern each) and await maintainer merge in that order. No push, no force anything.
- TASK-000: DONE — projection audit complete. Every AudioNode construction and AudioParam write in src/ mapped to its Song-model field. Table below. 2 fully unowned params, 1 partially owned, 2 render-parity constants → filed as TASK-011…TASK-015 in TASKS.md. No fixes applied in this task (per §4).
- TASK-001: DONE — docs/GENESIS.md (GENESIS-CORE verbatim + header), TASKS.md, WORKLOG.md, docs/adr/, docs/errors.md (LR-#### skeleton), MILESTONE (M1).
- TASK-002: DONE — 12-item checklist below with verdicts and evidence.
- TASK-003: DONE — docs/adr/0001-stack.md, docs/adr/0002-browser-preview-layer.md committed verbatim from SB-002 §7/§8; docs/adr/INDEX.md created.
- TASK-004: DONE — one concern per branch (AG-01/AG-12), each ≤ 400 changed lines, conventional commits referencing task IDs.

### TASK-000 — projection audit (node/param → model field)

| # | AudioNode / AudioParam write | Song-model field | Verdict |
| - | ---------------------------- | ---------------- | ------- |
| A-1 | `engine.ensure()` comp: threshold −6 dB, ratio 4 | none (baked constant) | OK — engine-internal, not user-reachable (P-15 respected; master trim fixed) |
| A-2 | `engine.ensure()` comp: attack 0.003, release 0.12 | none | OK — engine-internal constant |
| A-3 | `engine.ensure()` master.gain = 0.9 | none | OK — not user-reachable; Desk master strip exposes fixed −0.0 dB |
| A-4 | `engine.ensure()` analyser fftSize 512, smoothing 0.55 | n/a | OK — analysis-only, no musical truth |
| A-5 | `status.latencyMs` from `ctx.baseLatency` | n/a | OK — measurement (P-07 honest numbers) |
| B-1 | `fireVoice` per-voice gain = dbToGain(track.gain) × (vel/127) | `track.gain` (dB), `note.vel` | OK — Projection Law traceable |
| B-2 | `fireVoice` panner.pan.value = track.pan | `track.pan` | OK |
| B-3 | `fireVoice` per-instrument voice constants (attack/cutoff/detune 2.003, drum pitch/decay ramps) | `track.instrument` (voice selector) | OK — constants keyed by the model's instrument field; hand-tuned but invariant per instrument, reproducible from Song alone (porting contract holds) |
| B-4 | `noteOn` immediate-voice path: same gain/pan mapping | `track.gain`, `track.pan`, `track.instrument` | OK |
| B-5 | `scheduleClicks` click freq 1600/1100 Hz, gains 0.5/0.28 | n/a (metronome) | OK — transport aid, not song material |
| B-6 | metronome on/off, cycle on/off | `engine.metronome`, `engine.cycle` | **ORPHAN** — live-only booleans, not in Song, not undoable, not persisted. Filed TASK-013. |
| B-7 | count-in end time (4 beats @ song.qpm) | derived from `song.qpm` at record() | OK — derived from model each time |
| C-1 | `noiseHit` — noise buffer from `Math.random()` | **no seed anywhere in Song** | **ORPHAN** — unseeded stochastic synthesis; violates E-28/G-12 check FL-06. Filed as FL-06 FAIL; seeded in TASK-004. |
| C-2 | `renderWav` master comp: threshold −6, ratio 4 | none | **ORPHAN (parity)** — offline graph omits attack/release that the live graph sets (0.003/0.12); live vs offline mix differs. Filed TASK-015. |
| C-3 | `renderWav` per-voice gain/pan/voices | `track.gain`, `track.pan`, `track.instrument`, `note.vel`, `placement.transpose` | OK — except C-4/C-5 below |
| C-4 | `renderWav` skips `p.mute` but not `track.mute`… (checked: it does skip `track.mute`) | `placement.mute`, `track.mute` | OK — see C-5 for the real gap |
| C-5 | `renderWav` ignores `engine.cycle` loop material | `song.loop` + cycle state | **ORPHAN (parity)** — export renders linear arrangement only; cycle playback material not represented. Filed TASK-014. |
| C-6 | `renderWav` placement.gain (`_gainDb`) never applied | `placement.gain` | **ORPHAN** — Inspector's placement gain override does not reach the audio path in live or render. Filed TASK-011. |
| C-7 | `renderWav` ignores `placement.mute` | `placement.mute` | **ORPHAN** — muting a placement mutes live schedule (scheduleRange checks `p.mute`) but not the export. Filed TASK-012. |

Orphan count: 2 full (B-6, C-1) + 1 unowned param pair (C-6) + 2 render-parity (C-2, C-5, C-7 grouped: C-7 counted with C-5 family) — net 5 follow-up tasks: TASK-011…TASK-015.

### TASK-002 — FIRST-LIGHT checklist (§5)

| Item | Verdict | Evidence |
| ---- | ------- | -------- |
| FL-01 dev boots, zero console errors | FAIL-BY-DESIGN → HV-1 | freebuff-preview runtime unavailable this session (`status`: running=false, previous "no container IP"). Static gates green: `bun tsc -b --noEmit` clean, `bun run build` green. Human must run HV-1 per runbook. |
| FL-02 AudioContext resume on first gesture | PASS (static) → HV-2 (sound) | `play()` awaits `ensure()` then `ctx.resume()`; `noteOn` also resumes; both only reachable from user-gesture handlers (Space/R/click). No autoplay path. |
| FL-03 P-02 ≤ 60 s fresh | NEEDS-HUMAN → HV-3 | Reset procedure documented in runbook (localStorage keys `luthier.song.v1`, `luthier.coach.dismissed`; + OPFS `song.json` after TASK-005). No runtime to stop the clock. |
| FL-04 P-05 one-truth, zero orphans | PARTIAL → fixed this session | Audit had 5 orphans (table above) → filed TASK-011…015. Lattice→Loom+Ivory propagation is structural (single Song store; all surfaces `useStore` the same `song`; `cmdToggleStep` unifies notes+pattern); visual confirmation = HV-4. |
| FL-05 undo past reload | FAIL-BY-DESIGN → TASK-006 | `past/future` live only in store.ts module state; `saveSong` serializes `song` only; `cmdLoad` resets `past: []`. Confirmed by code. TASK-006 scheduled (SB-003). |
| FL-06 E-28 stochastic sources | FAIL → FIXED (TASK-004-a) | Grep found `Math.random()` at engine.ts noiseHit + staticNoise (hats/snare). No Song seed existed. Fix: `mulberry32` PRNG seeded from `song.seed` (new schema-v1-compatible field, default 0x9e3779b9); both live noiseHit and offline staticNoise derive from it. Double-export checksum = HV-5. |
| FL-07 G-12 forbidden CSS | FAIL → FIXED (TASK-004-b) | Grep hit: meter fill `linear-gradient` (index.css .grain-meter .fill) — not a waveform amplitude fill, not exempt. Fix: 3 hard-stop segments (ok/amber/signal) via child divs, no gradient. Second hit was a comment mentioning "purple" (G-12 note in model.ts) — comment only, reworded to keep grep clean. |
| FL-08 no font/asset CDNs | FAIL → FIXED (TASK-004-c) | index.html loaded Google Fonts CSS. Fix: vendored 7 woff2 (Schibsted Grotesk, Spline Sans Mono, Fraunces; OFL) into public/fonts + local fonts.css with unicode-range preserved; CDN tags removed. Grep now clean. |
| FL-09 zero modals | FAIL → FIXED (TASK-004-d) | `window.confirm` on New Song (Bench.tsx). Fix: inline two-step confirm on the button itself ("New" → "Sure?" with 3 s timeout, Esc/blur cancels). Palette rows use role=dialog only as a labeled overlay (non-blocking, Esc closes) — no native modal primitives remain; grep clean. |
| FL-10 command inventory | PASS | Table below (TASK-009 output). Gaps filed in TASKS.md. |
| FL-11 storage quota visible failure | PARTIAL | saveSong wraps setItem in try/catch → toast `Save failed: …` (visible, P-14) and cmdSave sets dirty=false only on success. Not yet an LR-#### inline panel with usage readout → TASK-005 (OPFS migration) owns the upgrade. Legacy coach key write is not wrapped (minor, filed TASK-018). Serialized size est.: Song JSON with factory content ≈ 6–12 KB; 10-min editing session adds notes/placements, est. < 100 KB — far under the ~5 MB localStorage cap. |
| FL-12 both-theme screenshots | NEEDS-HUMAN → HV-6 | No runtime browser here. Runbook HV-6 specifies Dayshift + Nightshift captures to docs/evidence/. AG-04 diff note: theme system is token-swap on `:root[data-theme]` only (index.css §tokens); no component branches on theme. |

**First-light score: 4 PASS / 4 FAIL (all fixed under TASK-004) / 2 FAIL-BY-DESIGN (TASK-005/006 scheduled) / 2 NEEDS-HUMAN (HV-3, HV-6; HV-1, HV-2 folded into runtime return). Runtime items are NOT claimed green.**

### TASK-009 / FL-10 — command inventory (id | pointer path | key | palette entry)

| id | pointer | key | palette |
| -- | ------- | --- | ------- |
| play-stop | Rail ▶/■ button | Space | app.Play / Stop ✓ |
| record | Rail ● button | R | app.Record armed tracks ✓ |
| return-zero | Rail ⏮ button; Loom ruler dbl-click | Enter / Home | app.Return to zero ✓ |
| cycle-toggle | Rail ↻ button; Loom loop brace click | L | app.Cycle (loop) toggle ✓ |
| metronome-toggle | Rail ▲ button | M | app.Metronome toggle ✓ |
| save | Rail Save button | Ctrl+S | app.Save Song ✓ |
| load | Rail Load button | — | app.Load saved Song ✓ (no key — gap filed TASK-019) |
| new-song | Rail New button (2-step inline confirm) | — | app.New Song (reloads) ✓ |
| export-mix | Rail Export button | — | app.Export mix (WAV) ✓ (no key — filed TASK-019) |
| undo / redo | — | Ctrl+Z / Ctrl+Shift+Z | app.Undo ✓ / app.Redo ✓ (no pointer buttons — filed TASK-019) |
| theme-toggle | Rail theme button | — | app.Toggle theme ✓ |
| snap-cycle | — | Alt+S | app.Cycle snap mode ✓ (no pointer affordance — filed TASK-019) |
| marker-add | Loom marker lane dbl-click | Shift+M | app.Marker at playhead ✓ |
| add-track-{audio,midi,bus} | Crates foot buttons | — | app.Add … track ✓ |
| goto-{loom,lattice,ivory,desk,scope} | surface tabs | 1–5 / Tab | app.Go to … ✓ |
| palette-open | Rail ⌘K button | Ctrl+K | (is the palette) ✓ |
| cheat-sheet | ? key; Esc closes | ? / Esc | — (overlay, not a command — acceptable) |
| new-clip | Loom lane dbl-click | — | loom.New clip on selected track ✓ |
| place-{factory items} | Crates item click | — | crates.Place … ✓ |
| clip-edit | Loom clip dbl-click → Lattice/Ivory | — | — (navigation, fine) |
| detach-copy | Loom context menu; Inspector Detach | — | clip.Detach selected placement as copy ✓ |
| duplicate / delete placement | Loom context menu; Inspector buttons | Del (not bound globally — filed TASK-019) | — (partial palette coverage; filed TASK-019) |

### TASK-010 — P-02 rehearsal (fresh-state reset definition)

Canonical reset (pre-OPFS): delete localStorage keys `luthier.song.v1` (song) and
`luthier.coach.dismissed` (coach) for the origin, then reload → factory Song "First Light",
arms Keys (midi) + Voice (audio). Journey: reload → click CTA → R → count-in → Z–M keys →
Space → take lands as clip. Stopwatch number requires runtime → HV-3 (protocol written,
stopwatch step included). Target ≤ 60 s per P-02.

### BLOCKED
- Runtime verification (FL-01 runtime half, FL-03, FL-12, HV-5 checksum): freebuff-preview
  reports not running in this sandbox (prior "no container IP"). All static halves executed
  instead; HV protocol filed. Nothing thrashed; moved on per AG-06.

- END: done — TASK-000…004, 009, 010 complete; 4 static FAILs fixed; SB-003 next: TASK-005 (OPFS), TASK-006 (undo persist), TASK-007 (mic), TASK-011+ (orphans).
