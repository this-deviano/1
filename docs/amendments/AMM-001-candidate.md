# Amendment candidates (AG-05 path — proposals only, maintainer-ratified)

## AMM-001-candidate — Session-state undo exemptions (SB-003 §4 ruling)

- Ruling: metronome = persisted preference (not musical truth, not undoable);
  cycle = Song model field (persisted, survives reload, undoable).
- Consequence: metronome writes are excluded from the undo stack by design;
  cycle writes are NOT excluded.
- Open question for ratification: should session-preference writes (metronome,
  theme, snap mode) ever be undoable? Current answer: no — preferences are
  session-state, not Song material, and appear nowhere in past/future stacks.
- Filed per SB-003 §4 ("file a one-line docs/amendments/AMM-001-candidate note
  in WORKLOG; do not block on it"). Implementation: engine.cycle mirrors
  song.cycle; engine.metronome mirrors the persisted pref
  (luthier.metronome.v1). Neither lives in the Song undo path except cycle,
  which is Song schema.
