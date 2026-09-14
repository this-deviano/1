# Factory headroom — maintainer decision memo (TASK-054, SB-007-C)

**Decision owner: the maintainer.** This memo documents a decision, it does not make it, and it
implements nothing. Per R-9/SB-007-C §4, changing the factory default mix is a musical decision
that belongs to the person who will listen to it.

Date: 2026-09-13 · Branches: `fix/m1-debt-clearance` (this session) · Ruling: R-9 (guard) ·
Finding: FND-01 (SB-007-B)

---

## 1. The numbers, as measured

| quantity | value | source |
| --- | --- | --- |
| reference-export **sample peak** | `1.208632` = **+1.65 dBFS** | `docs/evidence/sb007c/forensics.json` |
| samples at/over full scale | **250 per channel** (500 total) | same |
| samples *strictly over* full scale | 250 per channel | same |
| master bus gain `MASTER_GAIN` | `0.9` = **−0.92 dB** (post-compressor) | `src/lib/engine.ts` |
| compressor | threshold **−6 dB**, ratio **4:1**, attack **3 ms**, release 120 ms | `src/lib/engine.ts` |
| live bus | identical graph to the export (TASK-015 correction) | `buildMasterGraph()` |

Two consequences that are easy to miss:

1. **This is not only an export problem.** The live bus runs the same `comp → master(0.9)`
   chain, so the *monitored* output also reaches +1.65 dBFS sample peak. A float value above
   1.0 clips on any integer DAC, so the factory Song clips while you listen to it, not just in
   the file.
2. **`MASTER_GAIN` sits *after* the compressor**, so any change to it scales the output
   **exactly** — the shape the compressor produces is unchanged, only the level moves. That makes
   the math below exact rather than approximate.

## 2. Options

### (a) Lower the default `MASTER_GAIN` so the default mix leaves ≥ 3 dB headroom

Because the gain is post-compressor, the arithmetic is a strict scalar:

```
required attenuation = measuredPeakDbfs − (−3.0) = 1.64588 − (−3.0) = 4.64588 dB
gain factor          = 10^(−4.64588/20)          = 0.58577
new MASTER_GAIN      = 0.9 × 0.58577             = 0.52719   (−5.56 dB)
new sample peak      = 1.208632 × 0.58577        = 0.70787   = −3.0000 dBFS  ✓
```

Adjacent targets, same math, for comparison:

| target sample peak | attenuation | new `MASTER_GAIN` | resulting peak |
| --- | --- | --- | --- |
| ≤ 0 dBFS (no clip only) | 1.64588 dB | `0.74467` (−2.56 dB) | `1.00000` |
| ≤ −1 dBFS | 2.64588 dB | `0.66357` (−3.56 dB) | `0.89125` (matches R-9's −1.0 target) |
| ≤ −3 dBFS (recommended) | 4.64588 dB | `0.52719` (−5.56 dB) | `0.70787` |

Cost: the factory Song gets ~4.6 dB quieter. With `MASTER_GAIN` still a code constant, this also
lowers the live bus by the same amount — audible, and the point.

### (b) Rely on the R-9 guard only

Change nothing. Every export whose sample peak exceeds 0 dBFS raises the inline choice panel
(Export as-is / Scale to −1.0 dB / Scale to −0.3 dB, Esc cancels), and `as-is` stays byte-identical
(P-15). Nothing is ever normalized silently.

What this does **not** fix: the live bus. A default project still clips while it plays, and the
first-minute experience (P-02) is a clipped one. The guard makes the *export* honest; it does not
make the *default* good.

### (c) L-Limit on the master at M6

The real fix: a limiter Unit on the master bus, model-backed, with the parameter set the
Workshop Collection will ship. This is M6 work (Unit + Desk device panel), and it is the only
option that lets a default template be both loud and unclipped under user gains without a global
level assumption.

## 3. Recommendation

**(a) now, (b) retained, (c) as the M6 destination.**

- P-01 (sound first) and P-22 (minimal default template) both argue that a factory default must
  not clip. A default that clips on both the live bus and the export is a bad first minute (P-02).
- The R-9 guard stays regardless: it is the safety net for user-raised track gains and future
  arrangements, and it is the only absolute-level instrument in the harness.
- A limiter is the correct long-term answer; a static gain is the correct *default* answer until
  the Desk exists.

This is a recommendation, not a change. The value to use — 0.527, or "no clip only" 0.745, or a
different number entirely — is the maintainer's.

## 4. Projection-Law check (required by TASK-054)

**Is master gain model-visible state (a Desk master fader) or a code constant?**

It is a **code constant**: `MASTER_GAIN = 0.9` in `src/lib/engine.ts`, exported as `MASTER_GAIN_DB`
and printed read-only on the Desk master strip (`src/ui/surfaces/Desk.tsx`). No Song field backs it,
and the master strip's fader position is display-only.

**Filed as a candidate orphan.** TASK-000's projection audit (row A-3) recorded this as
"OK — not user-reachable"; that ruling predates FND-01, and FND-01 is precisely the evidence that a
gain the user cannot see, backed by no model field, can be audibly wrong. Under the Projection Law
(ADR-0001) every level that shapes the mix should be traceable to Song state; a master bus gain is
the most musical level there is. Recommendation: the M2 Desk spec should make the master fader a
**model-backed, undoable Song field** that the engine reads, with the constant retained only as
the factory default value. This memo does not implement that.

---

*Memo written by the agent from measured numbers; the decision is the maintainer's (P-15).*
