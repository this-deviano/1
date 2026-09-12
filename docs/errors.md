# Luthier Error Registry (LR-####)

Inline errors carry an LR-#### id, never a modal (P-04, P-14). Append-only.

| ID | Raised by | Surface | Meaning | Recovery |
| -- | --------- | ------- | ------- | -------- |
| LR-0001 | autosave/song write | status bar inline panel | Song write failed (quota/serialization) — see storage readout | free space / reduce size / export JSON |
| LR-0002 | WAV export | toast (inline, signal) | Offline render failed | adjust song, retry |
| LR-0003 | record arm check | toast (inline, signal) | No MIDI track armed | arm a track (circle on its header) |
| LR-0004 | OPFS migration (planned, TASK-005) | inline panel | Legacy localStorage import failed; song continues fresh | retry / export backup |
