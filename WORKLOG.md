# WORKLOG — append-only

## SB-004 — 2026-09-13
- START: TASK-020 sync & merge-state (blocking) → log rulings → TASK-022/023/024 → TASK-007 mic → TASK-021 harness + battery → TASK-025 report.
- WORKSPACE STATE AT START: branch feat/opfs-persistence (stack tip, clean tree). `git fetch origin --prune` brought no new refs; `git ls-remote origin` confirms all ten refs at the exact briefed SHAs.
- GATES (run before every push from this session, AG-02): `bun tsc -b --noEmit` clean; `bun run build` green (pre-existing dynamic-import chunk warnings only, unchanged from SB-003).

### §3 RULINGS LOGGED (as instructed — log, do not re-litigate)
- **R-1** undo persistence: the 100 gzip snapshots ARE Genesis §11.6 `history/` (autosave, cap 100, Time Machine); the §10.2 cap governs the IN-SESSION stack. The TASK-006 "deviation" dissolves. Conformance implemented as TASK-022.
- **R-2** parity gate: dual threshold. Ship gate −80 dBFS disclosed; constitution floor −96 dBFS. Self-test ALWAYS prints measured value AND floor. Never widen a gate to make a test pass. Implemented as TASK-023. **Outcome changed by measurement** — see TASK-021(d).
- **R-3** seed streams: ratified — streams keyed by SOURCE tag, not render path. Untouched; "improving" it was explicitly out of scope.
- **E-004** headless harness: ratified as committed product code in `tests/preview/`, evidence JSON+PNG ≤200 KB in `docs/evidence/sb004/`, every automated number labeled PROXY. Executed (TASK-021).
- **E-005** merge discipline: maintainer-only merges; `--no-ff`; no squash. Honored — see TASK-020.

### TASK-020 — sync & merge-state (BLOCKING)
- **MERGE STATE: NOT MERGED.** `origin/main` is still `ff21132` (SB-004's claimed value). The session therefore followed §2.2's NOT-MERGED path.
- **Linearity VERIFIED, not assumed:** `git log --graph --oneline main..feat/opfs-persistence` is a single 13-commit chain, and `git merge-base --is-ancestor` returns ANCESTOR for all eight sibling branches. One-concern-per-branch history intact.
- **NO LOSS.** All ten refs on origin at the exact briefed SHAs: main ff21132 · fix/seeded-noise 7d1755a · fix/meter-gradient fd3f8be · fix/local-fonts f3cc603 · fix/inline-confirm 3a78b7d · fix/orphan-gain 9cc0980 · fix/seed-streams abddf5e · fix/state-cycle b26410e · fix/orphan-render-parity 5c3e00c · feat/opfs-persistence 242991f. Nothing reconstructed, nothing rewritten (AG-07).
- **I did NOT merge (AG-12, E-005).** The maintainer's merge commands were supplied in the session message; executing them would contradict the briefing's own law, and the merge is not reversible-by-me once pushed. Branches were cut from the stack tip as §2.2 prescribes. If the maintainer wants the merge run locally, say so and it is one `git` invocation.
- FL greps re-run on the stack tip: `song.seed` set once at creation and never on load (PASS); `public/fonts/` carries the three OFL texts (PASS); `window.confirm` absent (PASS); `cmdRestoreSession` no longer clears the stack — it hydrates from snapshots (PASS after TASK-022); **meter notches: FAIL vs the briefed expectation** — see TASK-027 below.

### TASK-021 — harness + battery (E-004). `bun run test:preview`
Chromium: `chrome-headless-shell 153` installed via `bunx playwright install chromium` + `install-deps` (real launch verified before building on it). Production bundle via `vite preview`. 10 checks, **9 PASS / 1 FAIL**.

| check | result |
| ----- | ------ |
| HV-1 boot console-clean | **PASS** — 0 errors, 0 warnings over the full 10 s window |
| HV-2 / FL-02 AudioContext running after first gesture | **PASS** — state `running`, 44.1 kHz, latency reported |
| HV-4 one-truth propagation | **PASS** — 2.9 ms model→view vs the ≤8 ms budget (PB-11); model note count and the Loom miniature marker count both move by exactly one |
| parity (d) | **PASS** — max\|Δ\| 4.768e-7 = **−126.4 dBFS**, `gateMet` true, **`floorMet` TRUE** |
| determinism (e) / HV-5 | **FAIL** — see below |
| HV-6 both themes (f) | **PASS** — Dayshift + Nightshift PNGs, ≤200 KB each; `data-theme` asserted |
| P-02-PROXY (g) | **PASS** — **3,875 ms** from first gesture to clip committed (target ≤60 s) |
| storage / undo cap (h) | **PASS** — see TASK-022 |
| TASK-007 denial | **PASS** — real denial, LR-0007 panel, 0 page errors |
| TASK-007c record-armed both themes | **PASS** — armed, monitoring OFF |

**HV-5 FAILS, and it is not flakiness.** Five offline renders of one unchanged Song produced five distinct SHA-256 values (`sameAsFirst = [true,false,false,false]`), pairwise max|Δ| 4.17e-7…4.77e-7 ≈ −127 dBFS. Every render differs, so this is not a warm-up artifact. Our side is deterministic by construction (per-render seed reset, stable-sorted event mapping, one graph builder) and the INDEPENDENT parity residual is the same order — two unrelated comparisons landing on the same magnitude. Conclusion recorded as an inference, **not** as a root cause: **AMM-003-candidate** filed per AG-10; TASK-026 filed to bisect a minimal graph. The gate was not widened; `ok` stays bit-exact; the test stays red.

**(d) overturns R-2's premise.** R-2 assumed a documented −80 dBFS-class preroll/envelope divergence needing elimination to reach −96 dBFS. Measured: **−126.4 dBFS — already 30 dB below the constitution floor.** There is no divergence above the platform noise floor, so TASK-023 has no convergence work left; it keeps the dual-number display and re-measures. Honest numbers, no celebration.

### TASK-021 findings — two REAL defects, both invisible to the static half
1. **TASK-015 was an incomplete fix.** `renderBuffer()` destructured only `{ comp }` from `buildMasterGraph()` and wired it straight to the destination, so the export bus never applied `MASTER_GAIN` (0.9) while the live bus does. Exports were ≈0.92 dB hot — a P-15 (no hidden gain moves) violation. Worse, the parity guard's "live" leg had copied the same wiring, so the guard's two legs agreed with each other while both disagreed with production: a self-consistent measurement of the wrong pair. Both fixed (ee0667c); the guard now compares the bus the user actually hears.
2. **TASK-007b count-in leak.** Capture opens at arm time, so every audio take began with the 4-beat count-in. Now trimmed from the front, with duration and peak recomputed over the kept samples (audit row B-5: the count-in is a transport aid, not material).

### TASK-007 — microphone slice (HARNESS-VERIFIED)
- 4 of 4 boxes. getUserMedia with echoCancellation/noiseSuppression/autoGainControl **all false**; AudioWorklet 60 s ring buffer (Blob-inlined processor, no second build step); 4-beat count-in → stop → take → clip on the armed audio track; `media/<sha256>.wav` written content-addressed and indexed in the manifest (TASK-005 box 6).
- Evidence (fake device = synthetic tone): read-back sha256 **equals** the clip's pointer; mono, 32-bit float, 44.1 kHz; **peak 1.0, 777 non-zero samples**; duration **0.752 s** (count-in excluded, as specified); the placement references an audio track. Denial path: real headless denial (`NotFoundError`, no input device), LR-0007 panel rendered with retry, **0 page errors** — no crash, no stub.
- Monitoring DEFAULT OFF, asserted by the harness; enabling it warns about headphones.
- `Clip.media` is additive; schemaVersion stays 1 (documented in docs/spec/schema-changelog.md).

### TASK-022 / 023 / 024 — conformance
- **TASK-022 (4/4):** cap 10,000 entries OR 512 MB estimated serialized, FIFO — verified by driving **10,350 mutations → depth exactly 10,000** (50 MB retained; the byte cap was not reached, and that is disclosed rather than implied). Bookkeeping was O(n)-per-mutation, so the whole 10,350-op run took 1.4 s. Restore pushes (300 → 301) at depth 300, observed *below* the cap so the push is actually visible rather than masked by eviction. §11.6 snapshot store independently capped at exactly 100.
- **TASK-023:** dual-threshold display in both the console line and the LR-0006 panel; `app.selftest.*` now returns the full result (measured + gate + floor) so the harness records numbers instead of scraping text.
- **TASK-024:** enumeration found exactly ONE guard in the whole app. **Zero deletions** — every reversible action already relied on undo alone, so there was nothing to delete. The one guard is on the one irreversible action and is retained, but it was moved from the Rail button into `cmdNewSong()`, closing a real hole: the palette's "New Song (reloads)" row bypassed the guard and destroyed the saved Song on a single click.

### TASK-025 — M1 exit
- MILESTONE **stays `M1`**. M1-EXIT-PENDING was NOT set, and this is the honest call: (1) a hard automated check (HV-5 / determinism) is RED and its disposition is a maintainer ruling (AMM-003), not something I may decide; (2) the irreducibly human items are still outstanding — hearing the sound, the real-hardware mic, and the final P-02 feel against the 3,875 ms proxy. Setting the flag would have meant claiming an exit I cannot demonstrate.

### AG-01 notes
- Commits: cca4170 (undo) · 67612c9 (confirm guard) · 015b734 (parity dual) · 4221d07 (mic) · ee0667c (engine correction) · 48521fb (harness) · 67e40a9 (worklet shape) · ledger. Every code commit is well under the 400-line ceiling; no over-budget commit exists this session.
- **Disclosed deviation:** the engine correction (ee0667c) and the worklet-shape fix (67e40a9) landed as extra commits on `test/preview-harness` rather than on their own branches. They were discovered *by* the harness, after the mic and parity branches were already committed and pushed, and AG-07 forbids rewriting history to relocate them. Disclosed rather than tidied away.
- **Disclosed limitation:** the 10-minute-equivalent storage session is **300 commands** (scale factor disclosed in the evidence), and a true quota-exhaustion path was NOT forced. Both are labeled in `storage-undo-cap.json`.

### E-002 log (standing)
All SB-004 code work on `fix/*`, `feat/*`, `test/*`, `docs/*` branches off the stack tip. Main untouched (AG-12). Zero force-pushes, zero history rewrites, zero rebases.

### BLOCKED / OPEN
- **HV-5 determinism** — blocked on an AMM-003 ruling, not on code.
- Human-only, unchanged: hearing the render (HV-2 ears), real-hardware mic, final P-02 feel, and the maintainer's own HV pass before ratifying M1 exit.

- END: TASK-020…025 executed; TASK-021 harness delivered 9/10 with the failure root-flagged; two real defects corrected; three rulings logged; milestone deliberately held at M1.

## SB-003 — 2026-09-13
- START: remote sync (TASK-016) first; then orphan triage (§4), E-003 verification, font licenses (§7), then TASK-005/006/017 as capacity allows.
- WORKSPACE STATE AT START: branch fix/inline-confirm (stack tip), clean tree, all 5 heads present (ff21132 + 7d1755a/fd3f8be/f3cc603/26ad378). No reset; nothing lost.
- GATES (re-run by me on stack tip before any push): bun tsc -b --noEmit clean; bun run build green (pre-existing chunk warnings only).

### TASK-016 — remote sync result
- `origin/main..main` listed ONLY ff21132 (E-001 doc-class) → pushed per §2. Fix stack was NOT merged by maintainer (origin/main was 4a18447); pushed all four fix branches.
- On origin now: main@ff21132, fix/seeded-noise, fix/meter-gradient, fix/local-fonts, fix/inline-confirm, then SB-003 work: fix/orphan-gain@9cc0980, fix/seed-streams@abddf5e, fix/state-cycle@b26410e, fix/orphan-render-parity@5c3e00c, feat/opfs-persistence@8cd4e0e.
- FL greps on main: FL-06/07/08 not applicable to docs-only main (fixes live on the stack, unmerged); FL-09 `window.confirm` absent from main (it was introduced and fixed on the stack); no official maintainer verdicts possible — stack awaits merge.
- DISCLOSED PROCESS NOTE: the WORKLOG-start commit (3a78b7d, docs-only) landed on fix/inline-confirm, the checked-out stack tip, not on main. docs/GENESIS.md itself is untouched and uncommitted-upon. Maintainer may cherry-pick it when merging.
- NO LOSS: nothing was reconstructed; every pre-existing commit is on origin.

### E-002 log (standing)
All code work this session on fix/* or feat/* branches, pushed immediately after gates passed. Main untouched (AG-12). Zero force-pushes.

### E-003 verification (seed rule vs 7d1755a)
1. seed persisted, generated once: PASS — `song.seed` in schema (model.ts), set only at creation (factory.ts / store.ts), never regenerated on load/save/export (factory loadSong backfills legacy songs only).
2. INDEPENDENT streams: FAIL as merged on 7d1755a — ONE shared sequential `mulberry32(seed)` stream (`this.rng`); sequence depended on voice call order; live and offline orders diverge. FIXED on fix/seed-streams (abddf5e): per-source derivation `mulberry32(splitmix32(seed ^ fnv1a(tag)))`, tags are SOURCES not paths (luthier/noise), so live/offline noise sequences are identical by construction — which is exactly what the parity guard requires.
3. No Math.random/getRandomValues in synthesis: PASS — repo grep clean (E-28 gate).

### §4 orphan triage results
- GAIN (TASK-011): REAL. pushNote carried `p.gain` but dropped it (`_gainDb`). Fixed both paths; offline gets it via the unified mapping. 9cc0980.
- MUTE (TASK-012): AUDIT CORRECTION — `renderWav` already skipped `p.mute` (observed at 4a18447 line 514, 7d1755a line 517, and tip). No defect; ledger row corrected in TASKS.md.
- PARITY (TASK-014/015 + C-2): structural fix landed — materialEvents() single mapping + two schedulers, shared BaseAudioContext voices, shared COMP_*/MASTER_GAIN constants, deleted renderDrum/renderTone/renderBlip/staticNoise duplicates. Offline additionally gained filter Q 0.8, tone attack curve, solo handling, placement.gain. d8b053c + 7093302.
- PARITY GUARD: shipped — app.selftest.renderparity() (dev gate −80 dBFS to absorb the documented preroll/envelope residual; constitution floor −96 dBFS stated in code); failure = LR-0006 red inline panel (P-14). Runtime verdict pending HV session — NOT claimed green.
- STATE ORPHAN (TASK-013): ruling applied — cycle → Song field (schema-additive, legacy-normalized, undoable), metronome → persisted pref (session-state, not undoable); AMM-001-candidate filed per AG-05. b26410e.
- NOISE orphan: closed pending merge — E-003 verification above; final closure after maintainer merges the stack.

### AG-01 notes
- d8b053c committed at 480 engine changed lines (480+252/228 churn, single concern) — over the 400 ceiling; remediated before push by splitting the self-test harness into src/lib/selftest.ts (7093302). The over-budget commit exists in branch history (never pushed at that size); the pushed stack is compliant. Logged, not hidden.
- feat/opfs-persistence 8cd4e0e: 328 changed lines, within budget.

### TASK-005 / TASK-006 (feat/opfs-persistence)
- Boxes ticked: atomic song.json (temp + read-back verify + move-or-fallback swap) · manifest.json (history + media index) · gzip history cap 100 · one-time read-only legacy migration (key preserved as backup) · usage readout in LR-0001 · undo-past-reload via cmdRestoreSession · beforeunload sync flush.
- HONEST LIMITS: OPFS writes are async — the unload flush is the synchronous legacy mirror (OPFS write may not complete on close); restore race window exists if the user edits within milliseconds of boot; `move()`-unsupported browsers use the in-place fallback (temp remains as backup); quota failures in history snapshots log to console with song.json as the durable copy.
- TASK-007 (mic) NOT started: per §0 the renderer-truth work preceded it, and the capture slice requires runtime verification the sandbox cannot provide; moving to SB-004 head of queue rather than landing unverified audio input code (AG-06, truth discipline).

### §7 font licenses
done — public/fonts/OFL-Fraunces.txt, OFL-SchibstedGrotesk.txt, OFL-SplineSansMono.txt (verbatim upstream texts; E-001 docs commit 5c3e00c).

### BLOCKED (unchanged)
- Runtime verification (HV-1..6, HV-5 checksum, live parity-guard verdict, P-02 number): no browser/mic in this sandbox. freebuff-preview runtime not exercised this session; nothing in SB-003 required it (per briefing §1).

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
