# MERGE PLAN — M1 exit ratification (maintainer-only)

Written by the agent, executed by **nobody but the maintainer**. Per E-007 FINAL the agent
never merges and never pushes `main`; it prepared this branch and stops here. The branch under
ratification is `ratify/m1-exit` → `main`.

## What is on this branch

- `MILESTONE` reads `M2` — **staged**. It takes effect the moment this branch reaches `main`.
  *That merge IS the ratification*; there is no separate ceremony and no second commit to make.
- `docs/amendments/AMM-004.md` — the ratification-paths ruling (verbatim).
- `TASKS.md` — HV-DEFERRED rows for ears / real-mic / P-02 feel / themes (AMM-004 Path B).
- `docs/evidence/kit/hv-*.md` — the worksheets you fill in on Path A. They also exist on
  `chore/sb007-closeout`; commit your results on this branch so the ratification commit cites them.

## 1. Open the pull request

Either instrument is fine; both produce the same PR into `main`:

- **Changes panel** (Freebuff): select `ratify/m1-exit` and open a pull request into `main`.
- **GitHub UI**: `https://github.com/this-deviano/1/compare/main...ratify/m1-exit`

Check before merging: the diff is **docs + `MILESTONE` only**. No source file changes. If you
see anything under `src/`, stop and ask — that is not this branch's concern.

## 2. Merge message — Path A (full HV pass)

Use this as the merge commit message if you ran the kit and filled in
`docs/evidence/kit/hv-*.md`:

```
ratify: M1 exit — full HV pass; results docs/evidence/kit/
```

## 3. Merge message — Path B (proxy election)

Use this if you elect to ratify on the automated proxy evidence. It records the deferral
honestly and names the debt:

```
ratify: M1 exit — proxy election per AMM-004 Path B; HV-DEFERRED: ears, real-mic, P-02 feel, themes; triggers: first runtime session; hard gate: 1.0
```

## 4. Post-merge verification

```sh
git fetch origin
git show origin/main:MILESTONE     # must print exactly: M2
```

If it prints `M1` or `M1-EXIT-PENDING`, the merge did not land — re-check the PR's base branch
(it must be `main`) and that the merge actually completed.

## 5. After `origin/main` reads M2

M1 exit is ratified and M2 begins. SB-007 proper (L-Equal / M2-001) self-gates on
`MILESTONE=M2`; paste that briefing unchanged and it flows straight into the M2 slice.

---

**Path B is legitimate, and the record stays clean — but read what it says.** Every number so
far is a proxy. "M1 ratified" on Path B says *I trust the measurements*, not *I heard it work*.
That is the maintainer's call and the maintainer's alone. But before 1.0 ever ships, somebody
has to listen to this thing — the HV-DEFERRED rows exist so that when the moment comes, the
sentence still means something.
