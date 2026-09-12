# ADR-0002 — Browser preview layer

## Status

Accepted — prototype-only, time-boxed, exit criteria below.

## Context

freeBuff runtime is browser-only; the §22.1 normative stack (Rust/Tauri/WebGL2 surface engine) is unreachable in this environment. M0–M1 UX verification value is high now. Per AG-10, the deviation is being filed, not silently absorbed.

## Decision

1. The web layer is a PROJECTION: all musical truth lives in the Song model as plain serializable data. WebAudio nodes are derived renderings with zero authority. Any state that exists only inside a WebAudio node is a bug (undo and the schema cannot see it).
2. Normative target stack is unchanged. A feature whose semantics cannot be expressed at the model layer may not ship, even in the preview.
3. Persistence: migrate localStorage → OPFS (crash-safe writes, content-addressed media) BEFORE any recorded-audio feature. localStorage is capped ~5MB and fails silently under quota; recorded audio will hit both.
4. Plugin hosting (CLAP/VST3) is impossible here — accepted; it is the reason this layer is a prototype, not the product.

## Exit criteria

Preview layer goes bugfix-only at M5-prep, when the Tauri shell begins. No feature may exist only in the preview layer at that point. Porting must be mechanical model-migration, not re-implementation.

## Consequences

Genesis deviations resolved: §22.1 (stack), §11 (Song bundle → OPFS stand-in until desktop). Risks: prototype-lock-in, mitigated by exit criteria and rule 1.
