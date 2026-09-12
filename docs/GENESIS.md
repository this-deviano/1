# GENESIS — Luthier Constitution

Condensed core. Superseded verbatim by LUT-GENESIS-001 when the maintainer commits the full text.

Identity: LUTHIER — open DAW unifying pattern (FL), arrangement (Cubase), performance (Ableton), console (Pro Tools) paradigms; easier than any of them; GRAIN design language; deterministic, undo-everything, offline-first. Preview layer per ADR-0002; normative stack per ADR-0001.

Product principles (P-rules, binding): P-01 sound first · P-02 record within 60s from first launch · P-03 no dead ends; empty states carry a verb · P-04 zero modal dialogs in core flow · P-05 one source of truth (Clip/placement model) · P-06 total undo, survives save · P-07 honest numbers (samples, ticks, dB) · P-08 deterministic offline render · P-09 warm themes, Dayshift default · P-10 density is a feature · P-11 every command: pointer + key + palette · P-12 search beats hierarchy · P-13 no accounts, no audio telemetry · P-14 failure is loud, never silent · P-15 mixer sacred: no hidden gain moves · P-16 shortcuts printed on affordances · P-17 performance budgets are release gates · P-18 offline-first · P-19 WCAG 2.2 AA from day one · P-20 atomic writes, never half-valid state · P-21 plugins are sandboxed guests · P-22 minimal default template · P-23 every parameter automatable + MIDI-mappable · P-24 respect the machine (idle CPU, no waste).

Design (G-rules, binding subset): tokens are the only source of design values (AG-03). Forbidden (G-12): purple/indigo/violet; gradients in functional UI (waveform amplitude fills exempt); backdrop-filter; blur shadows; radii >8px; Inter/Roboto/system-ui as identity faces; emoji anywhere in UI; skeleton shimmer loaders; dark-mode-only design; onboarding carousels; chatbot widgets; stock illustration. Errors are inline panels with LR-#### IDs, never modals. Empty states: one Fraunces verb, one exact next action, one micro legend.

Engine (E-rules, binding subset): E-21 latency badge always visible, never rounded beyond 0.1ms; E-28 deterministic render; randomness in synthesis only from Song-persisted seeds.

Milestones: M0 foundation (repo, CI, tokens, docs) · M1 sound and the first minute (device I/O, transport, record-arm, capture to clip, P-02 measured, underrun counter) · M2 graph and Desk (Units, latency truth, deterministic render). Preview-layer work maps to these by model semantics.

Definition of Done: behavior matches cited rules; type-gate and build-gate green; tests for new logic; tokens only; three-ways-deep commands; a11y (focus, contrast, reduced-motion); i18n-ready strings; LR-#### for errors; undo for every mutation; docs updated; no silent failure paths.

Amendments: never edit Genesis in place; proposals to docs/amendments/, maintainer-ratified. Full LUT-GENESIS-001 supersedes this core when the maintainer commits it.
