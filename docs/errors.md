# Luthier Error Registry (LR-####)

Inline errors carry an LR-#### id, never a modal (P-04, P-14). Append-only.

| ID | Raised by | Surface | Meaning | Recovery |
| -- | --------- | ------- | ------- | -------- |
| LR-0001 | autosave/song write | status bar inline panel | Song write failed (quota/serialization) — see storage readout | free space / reduce size / export JSON |
| LR-0002 | WAV export | toast (inline, signal) | Offline render failed | adjust song, retry |
| LR-0003 | record arm check | toast (inline, signal) | No MIDI track armed | arm a track (circle on its header) |
| LR-0004 | OPFS migration (planned, TASK-005) | inline panel | Legacy localStorage import failed; song continues fresh | retry / export backup |
| LR-0005 | metronome preference write (TASK-013) | toast (inline, warn) | Metronome preference could not be persisted (quota) — session-only until next successful save | save elsewhere / retry |
| LR-0006 | render-parity / determinism self-test | red inline panel (fixed, bottom-center) | Live-semantics render and offline export diverge beyond the R-2 ship gate, or two renders of one Song differ | read the printed measured value + thresholds; do not ship the export |
| LR-0007 | microphone capture (TASK-007) | inline mic panel (left, non-modal) | getUserMedia denied/unavailable, AudioWorklet attach failed, or a take had no audio track to land on | allow microphone for the origin, arm an audio track, press R to retry |
| LR-0008 | recorded media write (TASK-007) | inline mic panel (left, non-modal) | Storing `media/<sha>.wav` failed on quota — the take is not durable | free space, then re-record; the Song itself is untouched |
