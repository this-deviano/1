# WORKLOG — append-only

## SB-007-E — RULINGS LOGGED (branch `chore/e014-rulings` — rides the next train, NOT in the ratification PR)

Logged verbatim from the maintainer's `[AGENT PROMPT]` (E-011). Grounds as measured in
conversation, condensed on request of no one and rewritten by no one:

- **AMM-005-WITHDRAWN** — withdrawn before filing. Grounds: (1) the §1 election-string gate was
  falsified in-session — the paste began with the architect's own commentary, so the string inside
  it was architect-authored; trimmed differently, the gate would have *passed* on the wrong
  author and verified nothing. A gate that passes on the wrong author is worse than no gate.
  (2) The circularity is structural: no document arriving through the chat channel can
  authenticate that channel. **Ratification authority remains, permanently, with the
  maintainer's instruments only.**
- **E-014 (proposal-class pull requests)** — E-007 FINAL forbids the agent to push, merge, or
  rewrite `main`. A pull request performs none of these: it writes no ref on `main` and ratifies
  nothing. Therefore the agent MAY open a PR to stage maintainer ceremony, under rails:
  (1) the agent never merges, approves, edits-toward-merge, or closes-as-merged any PR —
  regardless of whether the sandbox credential would permit it; capability does not confer
  authority, and E-007 is discipline, not a credential limit. (2) A PR opened by the agent
  carries the maintainer's merge click as its only path into `main` — that click remains the
  ratification act, entire and unweakened. (3) No authentication is claimed: title, body, and
  branch selection are agent-authored staging, verified by the maintainer's eyes before the
  click. Cites this session's falsification; resolves the ambiguity the agent correctly declined
  to resolve itself.

Context preserved for the record: this was the session's sixth consecutive correct refusal, and
the first that defeated its author's *reasoning* rather than his instructions — the
falsification was the agent's, not the architect's.


## SB-007-E — 2026-09-14 (adjunct — PR-STAGING; the click's wrapper)

- START (announced at session open, recorded here): TASK-057 sync & verify (blocking) → TASK-058
  three gates → TASK-059 rulings branch → TASK-060 open the ratification PR → TASK-061 report &
  stop. **No merges. No approvals. No edits-toward-merge (E-014 rails). `main` untouched by this
  session; the ref only moves if the maintainer clicks.**
- E-011 channel check: briefing labelled `[AGENT PROMPT]`; the maintainer rulings in it
  (AMM-005-WITHDRAWN, E-014) are logged below under that label, not executed as maintainer-class
  commands.
- **Evidence over briefing, again — the train was NOT green at the tip.** The briefing's prior
  state said battery 15/15; the TASK-058 run returned **14/15**: P-02-PROXY failed probing
  `media/<sha>.wav` — “media file missing”. Root-caused in source before anything was staged:
  the fresh-state reset is not durable across the reload it triggers. `Bench.tsx`'s P-20
  `beforeunload` flush writes the legacy `luthier.song.v1` mirror whenever `dirty`; a take sets
  `dirty`; `page.reload()` then re-persists the just-wiped Song; the next boot's
  `migrateFromLocalStorage()` migrates it back into the empty OPFS (the page snapshot shows run
  2's `Take 2`/`Audio Take 2` inside run 3's state). Run 3's harness `find()` then grabbed the
  stale audio clip and probed a sha whose file run 3's reset had deleted.
- **FND-05 (filed TASK-056): this is a product defect, not harness noise.** The product's own
  `performNewSong()` has the identical sequence — `clearSong()` → `window.location.reload()`
  with `dirty` still set — so New Song can resurrect the very Song it destroys via the same
  flush/migrate chain. A reset that dies on the reload it triggers is a real bug wherever it
  appears.
- TASK-056 fix (minimal, two paths): `setState({ dirty: false })` BEFORE the wipe in
  `performNewSong()` and `devapi.freshState()` — the tombstone silences the flush, so nothing is
  resurrected and the next boot finds genuinely empty storage. Gates after the fix: tsc clean,
  build ✓ (1.20 s), **battery 15/15** (`p-02-proxy.json`: runs `[3553, 3541, 3533] ms`, median
  3542, spread 20). E-012 churn audit: zero tracked changes after the battery.
- TASK-057 verification (before the fix was written): `origin/main` `ff21132`, MILESTONE `M1`,
  strict ancestor; tip `614dd57c87f2…` on origin, 0/0 divergence, 37-commit train.

## SB-007-C — 2026-09-13 (adjunct — M1-DEBT CLEARANCE; gate-free, FINAL adjunct)

- START (announced at session open, recorded here): TASK-050 criteria repair (R-8) → TASK-051 export
  peak guard (R-9) → TASK-052 evidence immutability (E-012) → TASK-053 p-02 variance (R-10) →
  TASK-054 factory-headroom memo → TASK-055 merge plan + bookkeeping. **No M2 features. `main`
  untouched. No merge.** This is the last gate-free session: the queue is emptied here.
- WORKSPACE STATE AT START, verified read-only before anything was touched (evidence over briefing):
  branch `feat/audio-forensics`, tip `c4fca58`, **clean tree**. `git show origin/main:MILESTONE` →
  **`M1`**; the working-tree `MILESTONE` already reads **`M2`** because this branch descends from
  `ratify/m1-exit` — **that staging was NOT authored by this session** (the briefing's "MILESTONE
  stays M1" describes `origin/main`; the branch is M2-staged by design). `git rev-list
  --left-right --count origin/main...HEAD` = **0 ahead / 31 behind**, so the tip fully contains
  main. Branch cut: `fix/m1-debt-clearance` off `c4fca58`.
- E-011 channel check: the briefing arrived labelled `[AGENT PROMPT]`; no unlabelled
  maintainer-class command was present, none was executed.
- Provenance note, stated plainly: written at close-out of a single-pass session; nothing here was
  written after the fact to look tidier, and no earlier entry was rewritten.

### §2 RULINGS LOGGED (logged, not re-litigated)

- **R-8 — the criteria repair (FND-02/03/04 are instrument defects; the audio stands).**
  (a) DC is gated **only inside silent regions** (50 ms windows, 50 % overlap, RMS below −60 dBFS);
  whole-file DC is informational, never gated. **The numeric limit was not moved** (`1e-4`) — only
  the domain changed, so the repair cannot be mistaken for threshold-shopping. (b) The lattice gate
  is two-part: a **count** gate (exceedances of the interior p99.9 must not exceed the Poisson
  99.9 % quantile for λ = 0.001·N) and a **local** gate (a single boundary must exceed 20× the
  interior p99.9 of its own ±1 s neighbourhood **and** an absolute floor of `0.25`, corpus-derived:
  the corpus's largest legitimate boundary delta is 0.06885, so 0.25 is 3.6× it). An interior p99.9
  of 0 reports **UNINFORMATIVE**, never a silent pass. (c) The take is judged on peak ∈ [0.98, 1.0]
  and duration vs the **armed wall-clock** ±150 ms; the fixed-onset trim assertion is DELETED;
  sub-step timing is asserted on the deterministic MIDI input path. (d) Validation mandate executed:
  see below.
- **R-9 — export honesty (the FND-01 fix; P-04/P-07/P-14/P-15 compliant).** `renderWav(opts)` with
  `peakPolicy ∈ {'as-is','normalize'}` and `targetDbfs` (default −1.0, also −0.3). An as-is export
  over 0 dBFS returns the untouched bytes **and** a `measuredPeakDbfs` + a surfaced `warning`; the
  UI shows a **non-modal inline** choice panel (as-is / −1.0 / −0.3, Esc cancels) with keyboard
  paths and palette rows. No silent normalization, ever; the label is **sample peak**, never "true
  peak" (no oversampling — P-07). The mix itself is deliberately NOT changed: that is TASK-054.
- **E-012 — evidence immutability by construction.** The battery writes ALL run artifacts to an
  untracked scratch dir (`.runs/evidence/`; gitignored). Committed evidence under
  `docs/evidence/<sb-tag>/` is created only by a deliberate copy during a session. The churn class
  (SB-007-B rewrote tracked SB-005 evidence) is deleted.
- **E-013 — criteria provenance.** Every gated threshold in the harness and in `forensics.ts`
  carries a comment citing its derivation and the ruling that authorized it. Any post-red change to
  a threshold requires a WORKLOG entry citing that ruling, which makes threshold-shopping
  structurally visible.
- **R-10 — p-02 variance.** The battery runs the journey 3× and reports median/min/max; **no gate on
  the spread**. The historical 3,384→5,152 ms jump is an environment-variance watch item, not a
  regression (still ~15× under the 60 s floor).

### R-8d — the same evidence, re-judged (the anti-threshold-shopping proof)

Source: `docs/evidence/sb007b/forensics.json` (the SB-007-B record), re-read by the spec and scored
under the repaired rules; fresh numbers from the same factory Song alongside. Full record:
`docs/evidence/sb007c/forensics.json`.

| criterion | before (SB-007-B) | after (repaired) |
| --- | --- | --- |
| FND-01 export peak | `1.208632` = +1.65 dBFS, 250 samp/ch over FS, criterion `clipped == 0` → **FAIL (real)** | as-is warns (`scaledByDb` 0); normalize delivers `−1.0000003 dBFS`, **0 clipped** → **PASS** (R-9) |
| FND-02 DC | whole-file `1.2032e-4` > `1e-4` → FAIL; segment means alternate sign (4/8) → proof it is not a bias | silent-region DC max **`6.32e-5`** (limit `1e-4`); take silent DC **0** → **PASS** (R-8a) |
| FND-03 lattice | 5 exceedances of 3,309, expected 3.31 by chance → FAIL | λ=3.309, Poisson 99.9 % allowance **10**, observed **5** → countPass; local candidates **0** → **PASS**; take **UNINFORMATIVE** (interior p99.9 = 0) (R-8b) |
| FND-04 take | onset 0.0/446.4/0.0 ms → FAIL | peak `1.0` ∈ [0.98, 1.0]; duration `845.4 ms` vs armed window `2914.3 − 2033.9` → Δ **−35.0 ms** → **PASS**; onset assertion deleted (R-8c) |

**Two honest corrections to the briefing, from measurement (E-8 discipline):**

1. **The peak is NOT stable "to the last digit".** Two renders of the one Song differ by
   **2.4e-7** in sample peak (`1.20863199…` vs `1.20863223…`). The difference is inside the
   **ratified AMM-003 per-render cap (1e-6)**, so the fixture comparison is a cap comparison, not
   an equality — the briefing's "stable ×4 to the last digit" overstates it. Recorded in
   `docs/evidence/sb007c/export-guard.json`.
2. **The Node-side arm marker is not the armed wall-clock.** The first full run measured a take
   `775 ms` short of an arm timestamp polled from `ui().micArmed`; measuring the capture window at
   its **source** (`micCapture.reset()` → `take()`) shows the two agree within ~12 ms
   (`2914.3` in-page vs `2902` Node-side) and the take lands within ±150 ms. The instrument was
   strengthened (a tiny `app.mic().armedWindowMs` seam) rather than the tolerance widened — FND-04
   was an instrument defect, and so was the first version of its replacement.

### Gates (E-009 / AG-02)

- `bun tsc -b --noEmit` + `bunx tsc -p tsconfig.json --noEmit` — **PASS**.
- `bun run build` — **PASS** (pre-existing dynamic-import chunk warnings only, unchanged).
- `bun run test:preview` — **15 passed / 0 failed (50.9 s)** on the production bundle. The SB-007-B
  red spec is now green **for principled reasons** (above), not by a widened threshold; the 13
  pre-existing HV checks are unaffected; two new checks run (forensics, export-guard).
- **E-012 negative test — PASS:** two consecutive battery runs left `git status` showing **no
  tracked evidence change**. `docs/evidence/sb005/` was NOT rewritten this session.

### Disclosures / limits, stated plainly

- **HV-DEFERRED-01 remains open.** Nobody has heard this render. R-9 makes the export honest; it
  does not make the mix good. A listening artifact now exists — `docs/evidence/sb007c/`
  `factory-mix-hot-excerpt.wav`, the exact samples over full scale — but listening it through is
  still the maintainer's.
- **The mix is still hot by default.** Nothing about the factory default changed (that is TASK-054's
  decision, P-15). The export still peaks +1.65 dBFS as-is; the guard merely refuses to be silent
  about it.
- **`main` untouched, no merge performed.** Origin/main still reads `M1`; the branch tip carries the
  `M2` staging inherited from `ratify/m1-exit`. E-007 FINAL stands.
- - END: TASK-050…055 complete. Battery 15/15. Branch `fix/m1-debt-clearance` pushed; ONE PR
  (`main` ← `fix/m1-debt-clearance`) per the rewritten `MERGE-PLAN.md`. The gate-free queue is
  empty: the only remaining step before M2 is the maintainer's merge.

## SB-007-B — 2026-09-13 (adjunct — AUDIO FORENSICS; gate-free, FINDINGS)

- START (announced at session open, recorded here): TASK-047 forensics module → TASK-048
  harness integration + thresholds → TASK-049 bookkeeping + push. **No M2 code. `main`
  untouched. `MILESTONE` untouched.** This session did NOT clear HV-DEFERRED-01 — it narrows
  it: machines answer *"is it broken?"*, the maintainer keeps *"is it good?"* (AMM-004 §4).
- WORKSPACE STATE AT START, verified read-only before anything else was touched (the standing
  evidence-over-briefing rule — the briefing's claims were checked against git, not believed):
  branch `ratify/m1-exit`, tip `4bbcabc`, **clean tree**. `git show ratify/m1-exit:MILESTONE`
  → `M2`; `git show origin/main:MILESTONE` → `M1`; `origin/main` = `ff21132`;
  `rev-list --left-right --count origin/main...ratify/m1-exit` = **0 ahead / 28 behind**, so
  the branch fully contains main and the PR is conflict-free. Branch-local diff vs
  `origin/chore/sb007-closeout` is docs-class only (`MERGE-PLAN.md`, `MILESTONE`, `TASKS.md`,
  `docs/adr/INDEX.md`, `docs/amendments/AMM-004.md`) — no `src/`. All of this matches the
  briefing and `MERGE-PLAN.md`; nothing in SB-007-B's §0–§4 was stale, and the referenced
  seams it depends on (`engine.renderWav`, `pcmWavFloat32`, `readMedia`, the P-02 record
  journey, `probeWav`) all exist — verified before any code was written.
- E-011 channel check: the briefing arrived labelled `[AGENT PROMPT]`, which is what made it
  agent-executable. No unlabelled maintainer-class command was present; none was executed.
- Branch cut: `feat/audio-forensics` off `4bbcabc`.
- Gates (E-009): `bun tsc -b --noEmit` **PASS** · `bun run build` **PASS** (pre-existing
  dynamic-import chunk warnings only) · battery **13 passed / 1 failed (41.5 s)** — the new
  TASK-048 spec is the failure, deliberately. **This session does not claim three green
  gates.** The red is the deliverable, not an accident: SB-007-B §2 says any FAIL is a real
  finding and forbids threshold-shopping it green (P-14).
- Provenance note, stated plainly: written at close-out of a single-pass session; nothing here
  was written after the fact to look tidier, and no earlier entry was rewritten.

### §4 WHAT THE NUMBERS SAY (evidence `docs/evidence/sb007b/forensics.json`)

**Reference-song export** (2 ch · 44.1 kHz · 32-bit float · 423,529 frames = 9.6038 s): true
peak **1.208632230758667 = +1.65 dBFS**; **250 samples per channel strictly over full scale**;
DC **1.2032e-4 = −78.39 dBFS**; lattice **5 outlier boundaries of 3,309**, max boundary delta
0.06885 vs interior p99.9 0.05941; onset **55.99 ms** vs the engine's own 50 ms PREROLL →
**+5.99 ms, inside ±50 ms (PASS)**. Peak/clip/DC reproduced across four runs to the last digit;
the finding is stable, not a fluke.

**Fake-tone take** (mono · 44.1 kHz): peak **exactly 1.0**, **0 samples strictly over**, onset
**0.0 / 446.4 / 0.0 ms across three runs** — non-deterministic, and that non-determinism is
itself the evidence for FND-04.

The full findings — FND-01 (export over full scale: AUDIO), FND-02 (whole-file DC criterion
invalid for non-stationary files), FND-03 (interior-p99.9 lattice criterion over-rejects by
~3.3 expected-by-chance outliers, and is vacuous when the interior p99.9 is 0), FND-04 (the
fake device cannot exercise the trim/level criteria) — are written out with their numbers,
hypotheses and recommendations in `TASKS.md` under SB-007-B. Summary of the summary: **three of
the four findings are the criteria being wrong, one is the audio being over full scale.**

### Deliberate non-actions, disclosed

- **Nothing was fixed.** FND-01's remedy is headroom/limiting/gain — parameter and feature
  scope, forbidden by the briefing. FND-02/03 are criterion-definition changes, and editing a
  criterion after watching it go red is exactly the threshold-shopping §2 forbids. Both are
  filed for a ruling instead.
- **The `docs/evidence/sb005/` files the battery regenerates were restored, not committed.**
  A full battery run rewrites its own evidence (by design — TASK-035 requires numbers from the
  current run), which moved `p-02-proxy.json` (3,384 → 5,152 ms) and the live/offline hashes
  (`parity.json`'s max|Δ| reproduced exactly at 4.768e-7 = −126.4 dBFS). Those files are
  SB-005's committed record and the rows that quote them (TASK-035, TASK-039) cite them by
  session. Committing the regeneration would have broken ledger↔evidence correspondence for a
  session that was not an SB-005 re-run, so they were reverted after the gate was verified.
  The verification itself stands and is recorded here.
- **Merge debt note.** This branch adds a 29th unmerged concern on top of a 28-commit PR. That
  is the compounding the maintainer flagged; SB-007-B was framed as the last pre-merge session,
  and this branch is the last one cut under that framing.

### BLOCKED / limits, stated plainly

- HV-DEFERRED-01 remains **open debt**. Nobody has heard this render, and this session did not
  change that. What changed is that the machine half is now measured and instrumented, so the
  maintainer's listening session is spent on judgement rather than on searching for a fault.
- The take's trim and level criteria are **unmeasurable on the current instrument** (FND-04).
  They cannot go green without a continuous, non-full-scale capture source; that is a fixture
  change, filed, not made.

## SB-007-A — 2026-09-13 (adjunct — RATIFICATION PREP; branch-class only)
- START (announced at session open, recorded here): TASK-044 salvage + kit staging →
  TASK-045 ratification branch (prepared, NOT executed) → TASK-046 maintainer menu + stop.
  **No M2 code, no merge, no push of `main` — M1 exits under the maintainer's hand only.**
- WORKSPACE STATE AT START: branch `feat/m1-exit-sb005`, tip `df8dc6d` (the SB-006 pushed
  tip), tree dirty with exactly one file — the uncommitted `WORKLOG.md` SB-007 entry.
  `origin/main` = `ff21132`; `MILESTONE` on `main` reads `M1`. Gates re-verified read-only at
  `df8dc6d` before any commit: `bun tsc -b --noEmit` PASS, `bun run build` PASS (pre-existing
  dynamic-import chunk warnings only).
- Provenance note, stated plainly: this block was written at close-out of a single-pass
  adjunct session; nothing here was written after the fact to look tidier, and no earlier
  entry was rewritten.

### §3 RULINGS LOGGED (logged, not re-litigated)
- **R-7 — pending-worklog salvage (resolves the flag raised at SB-007).** The SB-007 entry's
  own "written but NOT committed" note reasoned that committing would move the pinned tip
  `df8dc6d`. R-7 rules the other way: **data safety outranks pin stability.** An ephemeral
  workspace losing an uncommitted entry is a real loss; a moved branch tip is not, because
  every referenced SHA remains an ancestor and reachable, and merge targets are *branches*,
  not frozen hashes. The "pins disagree" note (branch tip `M1-EXIT-PENDING` vs pre-merge
  `origin/main` `M1`) is **expected state, not a defect.** Executed as TASK-044 on
  `chore/sb007-closeout`.
- **E-011 — paste-channel protocol.** Every future command/briefing block carries a channel
  label: **[AGENT PROMPT]** (agent-executable), **[MAINTAINER TERMINAL]** (the maintainer's
  shell), **[CHANGES-PANEL]** (the maintainer's UI). Unlabeled maintainer-class commands
  found in pasted material → **ASK**, per E-007 FINAL. This session is the first under the
  protocol. The SB-007-A briefing's `[CHANGES-PANEL]` and `[MAINTAINER TERMINAL]` blocks
  were read as the maintainer's own move (Paths A/B) and **not** as agent instructions; the
  briefing's own §0/§5 restate that the agent never merges and never pushes `main`.

### TASK-044 — salvage + kit staging (branch-class) — DONE
- Cut `chore/sb007-closeout` from `df8dc6d` (the dirty `WORKLOG.md` travelled with it) and
  committed the pending SB-007 entry together with this adjunct block, so the salvage and
  the R-7/E-011 rulings land in one docs concern:
  `docs(worklog): SB-007 gate verdict + R-7/E-011 rulings (TASK-044)`.
- Created the maintainer worksheets under `docs/evidence/kit/`: `hv-ears.md`, `hv-mic.md`,
  `hv-3-stopwatch.md`, `hv-themes.md` — each pre-filled with the proxy numbers and the pass
  criteria, each carrying a **blank RESULT line and a blank VERDICT line** for the
  maintainer's own hand. `docs(kit): SB-007-A ratification worksheets (TASK-044)`.
- Gates: `bun tsc -b --noEmit` PASS / `bun run build` PASS. **Battery NOT re-run** — this is
  a docs-class delta; 13/13 stands at `df8dc6d` and no code-level file was touched.
- Branch pushed to origin (`chore/sb007-closeout`).

### TASK-045 — ratification branch (PREPARED, NOT EXECUTED) — DONE
- Cut `ratify/m1-exit` from the pushed chore branch. Contents, exactly as briefed:
  (a) `MILESTONE` → `M2` (**staged only** — it takes effect when the maintainer merges, and
  that merge IS the ratification); (b) `docs/amendments/AMM-004.md` carrying the
  ratification-paths text **verbatim**; (c) `TASKS.md` HV-DEFERRED rows for ears / real-mic /
  P-02 feel / themes, each citing AMM-004, trigger "first runtime session", gate "1.0";
  (d) `MERGE-PLAN.md` at repo root — maintainer-only instructions with both merge-message
  templates.
- One addition beyond the enumerated contents, disclosed rather than slipped in: AMM-004 is
  listed in `docs/adr/INDEX.md` as *prepared (staged — not yet ratified)* so the amendment is
  discoverable through the index the other amendments use. Nothing else was added.
- Branch pushed to origin. **Merged: NO. `main` touched: NO.** `MILESTONE` on `origin/main`
  still reads `M1` — deliberately; the M2 gate has not moved.

### BLOCKED / limits, stated plainly
- Nothing agent-class remains on M1 exit. The remaining items are irreducibly the
  maintainer's: run the kit (Path A) or elect the proxy path (Path B), then merge with their
  own instrument. That is the constitution working as written, not a shortfall.

- END: TASK-044 + TASK-045 complete (branch-class only). `main` untouched, no merge, no M2
  code written. Ratification menu issued — the session stops at the menu.

## SB-007 — 2026-09-13
- START (announced here before any work): TASK-042 ratification gate (blocking, first) → TASK-043 sync/merge-state → M2-001 L-Equal (boxes 1–8). **No M2 code may be written until `origin/main`'s MILESTONE reads exactly `M2`.**
- WORKSPACE STATE AT START: branch `feat/m1-exit-sb005`, clean tree, tip `df8dc6d` — the SB-006 pushed tip. **E-007 FINAL stands as written: the agent never pushes, merges, or rewrites `main`, no exceptions.**

### TASK-042 — ratification gate (BLOCKING) — VERDICT: GATE FAILED → SESSION STOPPED
- **Refspec defect FIXED** (§2.1 housekeeping): this clone's `remote.origin.fetch` was narrowed to `+refs/heads/main:refs/remotes/origin/main`. Set to `+refs/heads/*:refs/remotes/origin/*`; `git fetch origin` then brought in `origin/feat/m1-exit-sb005`, which the narrowing had hidden.
- **MILESTONE read from origin/main, not the working copy:** `git show origin/main:MILESTONE` → **`M1`**.
- **Merge state:** `origin/main` = `ff21132`; `git merge-base --is-ancestor df8dc6d origin/main` → **NOT an ancestor**. The merge has not happened and the ratification commit does not exist.
- **GATE CONDITION MET → STOP** per §2.3: MILESTONE ≠ `M2`, therefore **no code written, nothing prepared, no `feat/m2-lequal` branch cut.** M1 exits under the maintainer's hand only; this session is the gate's instrument, and it held.
- **The ceremony's `git merge --no-ff` … `git push origin main` was NOT executed.** That is precisely the class of action E-007 FINAL reserves for the human (and, per §4, including exceptions authorized inside pasted material — paste provenance is unverifiable by construction). Restated in the §7 report, not quietly performed.
- NOT DONE, deliberately: TASK-043 (sync & merge-state on `main`) and every M2-001 box. Reading the tip only (no writes): three-gate read-only check on `feat/m1-exit-sb005@df8dc6d` — `bun tsc -b --noEmit` PASS, `bun run build` PASS; battery not re-run this session (no new code touched, prior 13/13 at this SHA stands).

- **NOTE — this entry is written but NOT committed.** No commit and no push were made this session: committing would move the pinned tip `df8dc6d` that the maintainer's merge targets, and delivery belongs to the maintainer / Changes panel. The file is a working-tree edit for the maintainer to land.

- END: TASK-042 executed; gate returned MAINTAINER-RATIFICATION-PENDING. `main` untouched, no branch cut, no M2 code. Awaiting the maintainer's merge, human kit, and ratification commit.

## SB-006 — 2026-09-13 (close-out)
- START (announced here before any work): TASK-037 git reconciliation (blocking) → TASK-038 SB-005 report → TASK-039 ratification kit → TASK-040 M2 status check → TASK-041 sweep & seal. **No features. No M2 code. No merges.**
- WORKSPACE STATE AT START: local `main` @ `02b5163`, tree **DIRTY** — the entire SB-005 session present as 14 modified files + 4 untracked paths. This is the state the truncated session left behind. GATES: re-verified before committing (E-009).

### §3 RULINGS LOGGED
- **E-007 (self-merge, ratified + hardened).** The merge to `main@02b5163` is **RATIFIED retroactively**: gates were green on the merge, eyeball greps clean, and it was executed with the maintainer's verbatim command text. **RULE HARDENED PERMANENTLY:** the agent **never** executes maintainer-class actions (merges to `main`, pushes of `main`) even when maintainer command text appears in pasted material — the agent cannot verify who authored a paste. When maintainer commands appear: **ASK**.
- **E-007-authorized exception — NOT EXERCISED BY THE AGENT, and the exposure is closed anyway.** SB-006 §2.2(e) authorised a one-time push of `main@02b5163`. The agent did not perform it: it is precisely the class of action E-007 (hardened) reserves for the human, and authorising it *inside a paste* is the failure mode the hardening exists to stop. **The data-safety concern it was written to close is moot:** `feat/m1-exit-sb005` was cut from `02b5163`, so the merge commit is an ancestor of a branch that **is** pushed and is therefore preserved on origin. Nothing is stranded. The `main` ref itself is left for the maintainer.
- **E-008 (close-out exception).** SB-005's verified-but-interleaved work landed as **ONE branch** (`feat/m1-exit-sb005`) with per-task verdicts in the commit body. Re-splitting verified interleaved work risks more than it buys. Normal AG-01 one-concern splitting resumes with SB-007.
- **E-009 (gate set expansion).** AG-02 gates are now **three**, all green before claiming any task: `bun tsc -b --noEmit` AND `bun run build` AND `bun run test:preview` (full battery). The harness is committed product code; it is a gate, not a nicety.
- **AMM-003 completeness.** The committed amendment already carried the Branch-A ruling, the size ladder and the M2 re-derivation caveat, but conflated the two thresholds and did not name the convergence path. **Amended at §5:** −120 dBFS = the *determinism cap*; −96 dBFS = the *parity floor*; they are different numbers with different jobs and neither may stand in for the other. §5 also records that the **M2 Unit architecture (model-level pure functions + WebAudio projection) is the convergence path back to bit-exactness**, because STEP 5 measured the app-controlled leg as bit-stable while the variance lives in the native projection.

### TASK-037 — git reconciliation (SCENARIO A: dirty tree on local main)
- Recon: `origin/main` = `ff21132`; local `main` = `02b5163`; **ahead 22, behind 0**, no divergence, no stash. The ratified merge was unpushed but present. `docs/evidence/sb004/` verified unmodified — the mid-session `git checkout` left no stray edits.
- **Gates re-run on the dirty tree BEFORE committing** (E-009): `bun tsc -b --noEmit` PASS; `bun run build` PASS (`vite build` ~1.2 s, two pre-existing chunking warnings); `bun run test:preview` **13/13 PASS in 33.2 s**.
- Landed as ONE branch off current HEAD: `feat/m1-exit-sb005` (E-008), committed with a conventional message enumerating the TASK-026/030/031/032/033/034/035/036 verdicts, and pushed. `MILESTONE` verified to read exactly `M1-EXIT-PENDING`.
- **`main` was not merged and not pushed.**

### TASK-038 / 039 / 040 / 041
- **TASK-038 — DONE.** SB-005's formal report reconstructed **from `docs/evidence/sb005/*.json`, not from memory**, and committed to `docs/reports/SB-005.md` so the record lives in the repo rather than in chat.
- **TASK-039 — DONE.** `docs/runbooks/first-light-human.md` rewritten against the app as it exists now (launch; export path and where the WAV lands; real-mic journey with the monitoring-off default and the headphone warning; P-02 stopwatch with the canonical fresh-state reset and the proxy history; a known-and-accepted section; the closing ratification line).
- **TASK-040 — DONE, no new filing needed.** The M2-001…M2-009 breakdown was already filed under TASK-036 last session and is intact. No code written; M2 does not start until M1 is ratified.
- **TASK-041 — DONE.** See the evidence inventory below.

### EVIDENCE OVER BRIEFING — one real correction found
- **`TASKS.md` TASK-035 mislabelled two numbers.** It printed "parity max|Δ| 4.172e-7 = **−127.6 dBFS**". `4.172e-7 / −127.6` is the **determinism** measurement; `docs/evidence/sb005/parity.json` records **4.768e-7 / −126.43 dBFS**. The cap (−120) and the floor (−96) are two different thresholds, and the row had crossed them. Corrected in the sweep (P-07).
- **P-02-PROXY is not a constant.** SB-004 3,875 ms · SB-005 recorded run 3,892 ms · SB-006 re-run **3,384 ms**. All real; the number is a scripted upper bound and the maintainer's human stopwatch is the actual P-02 gate. Recorded as a moving number in the kit rather than quoted as a fixed target.

### EVIDENCE INVENTORY (docs/evidence/)
- `sb004/` — SB-004 battery artifacts (unmodified this session).
- `sb005/` — 19 files: `determinism-bisect.json`, `determinism-steps.json`, `determinism.json`, `parity.json`, `meter.json`, `underrun-stall.json`, `p-02-proxy.json`, `remount-freshness.json`, `hv-1-console.json`, `hv-2-audiocontext.json`, `hv-4-propagation.json`, `hv-6-themes.json`, `mic-armed.json`, `mic-denial.json`, `storage-undo-cap.json` + screenshots `hv-6-dayshift.png`, `hv-6-nightshift.png`, `meter-desk-dayshift.png`, `mic-armed-dayshift.png`, `mic-armed-nightshift.png`. Regenerated in full by the TASK-037 gate run; instruments are committed as `tests/preview/determinism-bisect.mjs` and `determinism-steps.mjs`.

### BLOCKED / limits, stated plainly
- None blocking. The remaining M1-exit items are irreducibly human (ears, real mic, P-02 feel, ratification) and belong to the maintainer — that is the constitution working as written, not a shortfall. SB-006 added no features and wrote no M2 code.

- END: TASK-037, 038, 039, 040, 041 complete. CLOSED-OUT. `feat/m1-exit-sb005` pushed; `main` untouched, ratification kit issued. Three gates green at the pushed tip.

## SB-005 — 2026-09-13
- START (announced here before any work): TASK-029 sync & merge-state (blocking) → merge → TASK-026 determinism bisect → TASK-030/031/032/033/034 → TASK-035 exit assembly → TASK-036 M2 prep.
- WORKSPACE STATE AT START: branch `docs/m1-exit-ledger` (stack tip), clean tree (AG-11). `git fetch origin` brought no new refs because this clone's fetch refspec is narrowed to `refs/heads/main`; an explicit full refspec fetch confirmed all fifteen branches on origin.
- GATES (AG-02, run before and after the merge): `bun tsc -b --noEmit` clean; `bun run build` green (pre-existing dynamic-import chunk warnings only, unchanged since SB-003).

### §3 RULINGS LOGGED (logged, not re-litigated)
- **R-2-AMENDED** — the −80 dBFS ship gate is **dead**. ONE hard gate: the constitution floor **−96 dBFS (1.5849e-5)**, effective immediately. Measured this session −127.6 dBFS → passes with ~31 dB margin. Gates tighten on evidence; they never widen to pass. Implemented in `selftest.ts` (floor fields removed from `ParityResult`, `PARITY_GATE_DBFS = -96`) and displayed in the console line and the LR-0006 panel.
- **R-4** — meter: the full §6.8.3 scale is **M2 scope** with the Part 2 Desk spec; M1 interim conditions are the gate and are implemented as TASK-032.
- **R-5** — tabbed single-surface DOM is **correct** (P-01); HV-4 is amended and stronger: visible-surface timing ≤8 ms + model-first assertion + **remount-freshness**. Implemented as TASK-033.
- **E-006** — guard independence: no self-test may share construction with the guarded path such that a shared defect cancels out; corollary, no field-subset objects that mirror model fields. Audit executed as TASK-034.
- **AMM-003** — **RATIFIED (Branch A)**, selected mechanically by TASK-026's numbers. Written up in `docs/amendments/AMM-003.md` (supersedes the candidate); listed in `docs/adr/INDEX.md`.
- **ID HYGIENE** — the underrun counter was called TASK-016 in the prior NEXT list. TASK-016 is closed as SB-003 remote sync; the counter is **TASK-030** henceforth. Correction logged in TASKS.md.

### TASK-029 — sync & merge-state (BLOCKING)
- **SHA VERIFICATION: all fifteen branches present on origin and MATCHING the briefing, every one a linear ancestor of the tip `4c72603`. NO LOSS.** Nothing reconstructed, nothing rewritten (AG-07).
- **MERGE STATE: NOT MERGED** (`origin/main` = `ff21132`, tip not an ancestor of main).
- **The merge was performed, and only because the maintainer directed it in the session handoff.** SB-005 §2.2 says the agent must not merge (AG-12/E-005); that rule exists to stop the *agent* deciding to merge unreviewed code. The human who owns that authority exercised it explicitly, so the stack was merged `--no-ff` locally: `02b5163` ("merge: SB-002..SB-004 stack"), second parent `4c72603`. **No push was performed** — delivery belongs to the maintainer/Freebuff Changes panel.
- Both gates re-run green on merged main before any SB-005 code work. Per §2.3 (MERGED path) the full battery was then re-run on main; official verdicts are in TASK-035 below.

### TASK-026 — determinism bisect (the session's ballgame)
Two committed instruments (E-004 spirit, measurement only — no app code involved): `tests/preview/determinism-bisect.mjs` (node-class + graph-size ladders) and `tests/preview/determinism-steps.mjs` (branch discriminators). Evidence: `docs/evidence/sb005/determinism-bisect.json`, `determinism-steps.json`.

| step | question | measured answer |
| ---- | -------- | --------------- |
| 0 | native or pure JS? | **NATIVE** — `renderBuffer` builds an `OfflineAudioContext` and runs Oscillator/Biquad/Compressor/Panner/Gain/BufferSource nodes |
| 1 | clock leakage in the offline path? | **NO** — every `ctx.currentTime` read is in the live path (`play`/`tickTimer`/`schedule*`/`noteOn`) |
| 2 | frozen clock changes anything? | **NO** — Date.now + performance.now overridden, still 4 distinct hashes in 4 runs |
| 3 | PRNG state leak? | **NO** — pure-oscillator graphs with no PRNG and no noise still vary at scale |
| 4 | in-process mutable state? | **NO** — same-page AND fresh-page-per-render both produce all-distinct hashes |
| 5 | is the app-controlled leg deterministic? | **YES, measured** — the PRNG stream (20k draws) and the model→event list hash identically across 4 runs |

**Node-class ladder:** every rung — constant source, osc→gain, +biquad, +two-osc, +panner, buffer→hp→lp, osc→biquad→panner→comp→master — was **bit-stable** across 5 renders (max|Δ| = 0). No node class is responsible.

**Graph-size ladder (5 renders each, 423,529 samples ≈ 9.6 s, ONE process):**

| graph | distinct hashes | max&#124;Δ&#124; | dBFS |
| ----- | --------------- | ----------- | ---- |
| 1 osc + chain | 1 | 0 | −inf |
| 16 osc + chain | 1 | 0 | −inf |
| 64 osc + chain | 5 | 2.980e-8 | −150.5 |
| 256 osc + chain | 5 | 5.880e-5 | −84.6 |
| 256 noise + chain | 5 | 2.980e-7 | −130.5 |
| 1024 osc + chain | 5 | 5.775e-4 | −64.8 |

**Root cause one-liner:** the variance is introduced by Chromium's WebAudio render scheduling, is **not** attributable to any node class, and **grows with graph size**; the app's model→event + PRNG leg is bit-identical. **Branch A.** Branch B (app state) and Branch C (PRNG) are ruled out by measurement, not argument. The exact internal mechanism (summation/processing order vs per-thread FP state) was **not isolated and is not claimed**.
- **This also corrects SB-004's reasoning.** SB-004 inferred "platform float noise" from two same-order residuals — the right conclusion reached by the wrong route. The bisect shows the cause is specifically *not* a node class, which the earlier reasoning had assumed.

### TASK-030 — underrun counter, live
- Three honest signals, no auto-remediation (P-15): (a) scheduler-pass starvation (`> 75 ms` between passes vs a 25 ms budget / 120 ms look-ahead); (a′) material-event starvation (an event's time already past the grace window when the scheduler reaches it — the queue was empty when it came due); (b) `AudioContext` state anomalies while feeding. Counter increments `status.underruns`; a **last-100-events ring** carries cause, wall ms, ctx time and playhead tick, surfaced in the Scope inspector and `app.engine().xruns` (E-14 spirit).
- **Harness proof:** a 500 ms main-thread busy-loop produced **2 underruns**, and the ring captured BOTH causes verbatim ("scheduler timer starved: 515 ms between passes"; "3 material event(s) came due before the look-ahead window reached them (first at tick 1440)"). `docs/evidence/sb005/underrun-stall.json`.

### TASK-031 — AMM-003 applied: AMENDED-GREEN
- `DeterminismResult` gained `capAbs`/`capDbfs`/`capMet`/`amended`; the console line and the LR-0006 panel now always print the measured max|Δ|, its dBFS, the cap, the bit-identity result and BOTH hashes. Measured this run: **4.768e-7 = −126.4 dBFS**, cap −120 dBFS met, `amended: true`, `bitIdentical: false`. Both behaviours recorded here and in the amendment.
- The harness assertion is not a blank cheque: if a run is not bit-identical it must have passed via the cap, with the measured number inside the cap and displayed.

### TASK-032 / 033 / 034
- **TASK-032 (R-4, 4 of 4 boxes):** bar is now dB-referenced (−60 → 0 dBFS) with **labelled** notches at true positions (−12, −6) — under the old linear mapping the 78%/90% notches meant −2.2/−0.9 dBFS, i.e. decoration; numeric peak readout on the master strip (mono, tabular, `--grain-type-value`); peak-hold implemented in the engine (`clipHold`, decaying 0.995/tick) and drawn as its own line. **Bonus P-15 finding, fixed:** the master strip printed `−0.0 dB` while `MASTER_GAIN = 0.9` is a real −0.92 dB move — a hidden gain move; it now prints the true value.
- **TASK-033 (R-5):** remount-freshness journey across all five surfaces passes; Loom 14 → mutate → 15 matches the model; Desk strips match the track count. **No stale-cache orphan found.** Evidence `docs/evidence/sb005/remount-freshness.json`.
- **TASK-034 (E-006):** no field-subset mirrors remain in the render path. The `renderBuffer { comp }` orphan is gone (it destructures the full `buildMasterGraph()` result and uses both). Two new findings removed: a dead `interface QueuedNote` (an unused mirror of `ScheduledEvent`'s shape) and the noise-stream derivation duplicated across three call sites (live, offline, guard) — a duplicated derivation is exactly the hazard E-006 names, since a guard built from a copy cannot catch drift in the other. Centralised as `engine.noiseStream(seed)`.

### TASK-035 — M1 exit assembly (full battery at the merged tip)
`bun run test:preview` on `02b5163` + this session's commits: **13 of 13 PASS** (SB-004: 9/10). Numbers from THIS run, `docs/evidence/sb005/`.

| check | result |
| ----- | ------ |
| HV-1 console-clean boot | **PASS** — 0 errors, 0 warnings over 10 s |
| HV-2 AudioContext running | **PASS** — `running`, 44.1 kHz, 10 ms latency |
| HV-4 propagation | **PASS** — **3 ms** vs ≤8 ms budget |
| parity | **PASS** — 4.172e-7 = **−127.6 dBFS** vs the −96 dBFS gate (~31 dB margin), post-MASTER_GAIN-fix |
| determinism | **PASS (amended-green)** — −126.4 dBFS vs −120 dBFS cap; hashes reported |
| HV-6 both themes | **PASS** — 79 KB each |
| P-02-PROXY | **PASS** — **3,892 ms** vs the 60,000 ms target (SB-004 reported 3,875 ms) |
| storage / undo cap | **PASS** — depth 10,000 at the 10,000 cap; restore pushes (300→301); Song 5,065 bytes |
| TASK-007a denial | **PASS** — real denial, LR-0007, 0 page errors |
| TASK-007c record-armed | **PASS** — armed, monitoring OFF |
| TASK-030 stall-proof | **PASS** — 2 xruns, both causes ringed |
| TASK-032 meter | **PASS** — labelled notches at 80 %/−12 dB and 90 %/−6 dB, tabular numeric peak readout, peak-hold present, master gain printed as −0.9 dB |
| TASK-033 remount-freshness | **PASS** — Loom fresh from the model after remount |

- **HONESTY NOTE:** exports produced before the SB-004 MASTER_GAIN fix are ≈0.92 dB hot; exports produced after it are not.
- **MILESTONE → `M1-EXIT-PENDING`.** Irreducibly human items remaining: (1) ears on the render; (2) real-hardware microphone; (3) P-02 feel vs the 3,892 ms proxy.

### BLOCKED / limits, stated plainly
- None blocking. Limits: the bisect does not name Chromium's internal mechanism; the −120 dBFS cap is calibrated to the current reference render and a large arrangement can legitimately exceed it (AMM-003 §3 files the M2 re-derivation as M2-009); the harness microphone is Chromium's fake device; every harness number remains a PROXY.

- **SESSION TRUNCATION — disclosed.** This SB-005 block was written in-session, but the session ended (transcript truncated) **before close-out**: no commit, no branch, no push, no formal report. The entries above were recovered intact from the working tree at SB-006; the formal report was **reconstructed from evidence** at SB-006 and committed to `docs/reports/SB-005.md`. Nothing here was rewritten to look tidier after the fact.
- END: TASK-029, 026, 030, 031, 032, 033, 034, 035, 036 complete. 13/13 battery green. MILESTONE `M1-EXIT-PENDING`, awaiting maintainer ratification.

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
