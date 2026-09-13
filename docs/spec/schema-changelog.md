# Song schema changelog (schemaVersion 1 — additive only)

`schemaVersion` stays `1`. Every field below is **additive** and
**legacy-normalized on load**, so a Song written before the field existed loads
unchanged and is assigned the documented default. No field has ever been
removed, renamed, or re-typed (ADR-0002 rule 1: the Song is the portable
musical truth).

| Field | Added by | Default for legacy Songs | Meaning |
| ----- | -------- | ------------------------ | ------- |
| `Seed.seed` (`number`) | TASK-004-a (FL-06, E-28) | `0x9e3779b9` (`SEED_DEFAULT`) | Synthesis PRNG seed. Generated **once** at Song creation, persisted, never regenerated. Streams are derived per **source tag** (`src/lib/seed.ts`), never per render path (E-003, SB-003 R-3). |
| `Song.cycle` (`boolean`) | TASK-013 (SB-003 §4) | `false` | Cycle (loop) engaged. **Song model truth**: persisted, survives reload, undoable with every other musical field. The live metronome is a persisted *preference* (`luthier.metronome.v1`), not a Song field, and is therefore not undoable (AMM-001-candidate). |
| `Clip.media` (`{ sha, bytes, durationS, sampleRate } \| undefined`) | TASK-007 (SB-004 §4) | `undefined` | Content-addressed recorded audio: `media/<sha256>` in the OPFS root. Absent on all synthesis clips. Additive; a legacy Song simply has no audio clips. |

## Normalization points

- `factory.loadSong()` — backfills `seed` and `cycle` for Songs read from the
  legacy `luthier.song.v1` localStorage key.
- `store.normalizeLegacySong()` — same, for Songs arriving from OPFS or from the
  §11.6 history snapshots.

## Undo stack (§10.2) — not a Song field

The in-session undo stack is **session state**, deliberately not serialized into
the Song. R-1 caps it at 10,000 entries / 512 MB estimated serialized (FIFO).
Durability across reloads rides the §11.6 snapshot store
(`Song.cycle`/`seed` are inside each snapshot like any other field). See
`docs/amendments/AMM-002-candidate.md` for the granularity ruling.
