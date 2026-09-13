# MERGE PLAN — M1 exit ratification, ONE PR (maintainer-only)

Written by the agent, executed by **nobody but the maintainer**. Per E-007 FINAL the agent
never merges and never pushes `main`; it prepared this branch and stops here.

**The branch under ratification is `fix/m1-debt-clearance` → `main`.** It is the linear tip of
the entire M1 train, so this is the only PR left to open.

## What this one PR contains

The M1 train is linear — `main` → (the local SB-002…SB-006 merge) → `chore/sb007-closeout` →
`ratify/m1-exit` → `feat/audio-forensics` → `fix/m1-debt-clearance` — so the tip already contains
every earlier concern. There is nothing left to stack:

| concern | what it delivers |
| --- | --- |
| SB-002…SB-006 (merged locally `02b5163`, never pushed) | the M1 code, tests, evidence and docs |
| `ratify/m1-exit` | `MILESTONE` staged to `M2`, AMM-004, HV-DEFERRED rows, worksheets |
| `feat/audio-forensics` (SB-007-B) | the forensics module + the FND-01…04 findings |
| `fix/m1-debt-clearance` (SB-007-C) | R-9 export peak guard, R-8 criteria repair, E-012 evidence immutability, R-10 p-02 variance, TASK-054 memo, this plan |

`MILESTONE` reads `M2` **staged** — it takes effect the moment this PR reaches `main`, and *that
merge IS the ratification*. There is no separate ceremony and no second commit.

## 1. Open the pull request

Either instrument; both produce the same PR into `main`:

- **Changes panel** (Freebuff): select `fix/m1-debt-clearance` and open a pull request into `main`.
- **GitHub UI**: `https://github.com/this-deviano/1/compare/main...fix/m1-debt-clearance`

**Expect a very large PR, and that is the intent.** `origin/main` is still `ff21132`: the entire
SB-002…SB-006 stack was merged locally (`02b5163`) but never pushed to `main` (E-007 deliberately
left the `main` ref to the maintainer). A small diff would mean the base branch is wrong.

## 2. Merge message (use this one)

```
ratify: M1 exit — proxy election per AMM-004 Path B; HV-DEFERRED: ears, real-mic, P-02 feel, themes; triggers: first runtime session; hard gate: 1.0. Includes M1-debt clearance: export peak guard (R-9), forensics criteria repair (R-8), evidence immutability (E-012).
```

Path A (a full human HV pass) would instead use:

```
ratify: M1 exit — full HV pass; results docs/evidence/kit/
```

## 3. Post-merge verification

```sh
git fetch origin
git show origin/main:MILESTONE     # must print exactly: M2
```

If it prints `M1` or `M1-EXIT-PENDING`, the merge did not land — re-check the PR's base branch
(it must be `main`) and that the merge completed.

## 4. Two-PR alternative (history purists only)

If you want the ratification to have its own commit rather than arriving inside one large merge:

1. Open PR **1**: `main` ← `ratify/m1-exit`, with the ratification message. Merge it. `main` now
   reads `M2` and M1 exit is ratified on its own commit.
2. Open PR **2**: `main` ← `fix/m1-debt-clearance`, with the debt-clearance message. Because
   `ratify/m1-exit` is an ancestor of this tip, PR 2 then diffs only the SB-007-B/C concerns.

Both routes land identical content. The one-PR route is the current plan because the train is
linear, conflict-free, and every intermediate branch remains reachable either way.

## 5. After `origin/main` reads M2

M1 exit is ratified and M2 begins. SB-007 proper (L-Equal / M2-001) self-gates on `MILESTONE=M2`;
paste that briefing unchanged and it flows straight into the M2 slice. There is no SB-007-D: the
gate-free queue is empty after this session.

---

**Path B is legitimate, and the record stays clean — but read what it says.** Every number is a
proxy. "M1 ratified" on Path B says *I trust the measurements*, not *I heard it work*. That is the
maintainer's call alone. Before 1.0 ships, somebody has to listen to this thing — the HV-DEFERRED
rows exist so that when the moment comes, the sentence still means something.

**One concrete listening artifact now exists:** `docs/evidence/sb007c/factory-mix-hot-excerpt.wav`
— 0.25 s of the factory mix around its loudest sample, float32 stereo, the exact samples that
exceed full scale (peak `1.208632` = +1.65 dBFS). It is the FND-01 defect, on record, small enough
to commit, and playable. Hear it before deciding TASK-054's headroom question.
