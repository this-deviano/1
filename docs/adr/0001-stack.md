# ADR-0001 — Luthier technology stack

## Status

Accepted (Genesis §22.1, normative).

## Context

Luthier requires hard real-time audio discipline, out-of-process plugin sandboxing, and a WebGL2 surface engine that scales with object count. The reference stack was specified in Genesis §22.1 before any code existed.

## Decision

Normative target: Rust core (edition 2024, MSRV stable−2), Tauri 2 shell, Svelte 5 runes UI, custom WebGL2 surface engine, cpal/rtmidi device layer, event-sourced Song store over the Genesis §11 schema. This is the destination product.

## Consequences

- The browser preview layer (ADR-0002) is a projection and a prototype only.
- Porting from preview to normative must be model migration, not re-implementation — enforced by the Projection Law (SB-002 §3).
- CI budgets (PB-xx) and RT-discipline gates activate when the Tauri shell lands; the preview layer inherits their spirit, not their letter.

## Genesis-rule impact

Implements §22.1, §22.2. None waived.
