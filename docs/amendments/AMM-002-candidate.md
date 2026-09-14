# AMM-002-candidate — Undo granularity across reloads (SB-004 R-1)

- Ruling (R-1): the 100 gzip snapshots are Genesis **§11.6** `history/` — the
  autosave snapshot store (cap 100, prune oldest, Time Machine semantics).
  They were never the **§10.2** cap. §10.2 governs the **in-session** undo
  stack: 10,000 entries OR 512 MB estimated serialized, whichever first, FIFO.
- Consequence, ratified for the preview layer: cross-reload undo is
  **snapshot-granular** (one restored state per autosave snapshot); within a
  session undo is **op-granular** (one entry per mutation).
- Normative-target behavior (not the preview): **op-history persistence** —
  the op history itself (not a periodic snapshot of state) is persisted, so a
  reload keeps op-granular undo.
- Why the gap exists: ADR-0002 rule 1 (all musical truth in the serializable
  Song) makes a state snapshot the cheapest correct durable form, and §11.6
  already defines snapshots as the Time Machine. Persisting an op log would
  require every mutation to carry an invertible op descriptor, which the
  preview layer's `mutate(fn)` API does not produce (it clones whole state).
- Open question for maintainer ratification: at M2 exit, does op-history
  persistence land in the preview layer, or does it wait for the normative
  stack (ADR-0001) where the op log is the engine's native journal? Current
  answer: **wait for the normative stack** — adding an op-log to the preview
  layer would be feature work that cannot port mechanically (ADR-0002 exit
  criteria), so the preview keeps snapshot-granular cross-reload undo and
  states so plainly.
- Implementation (this session): `src/lib/store.ts` cap + `restoreSong()` /
  `hydrateSession()` push-and-never-clear semantics; `src/lib/actions.ts`
  `cmdRestoreSnapshot(index)`; telemetry via `undoStats()`.
