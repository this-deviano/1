# LUTHIER

*The instrument for making instruments.*

A digital audio workstation that unifies the pattern, arrangement, performance, and
console paradigms — built for the browser in this repository, with the GRAIN design
language: warm paper, ink, ember, machined precision. No glass, no gradients, no slop.

## What ships in this build (Genesis M0–M4 parity, web runtime)

- **The Bench** — Rail (transport, clock, tempo, latency badge), Crates (factory
  content), tabbed Surfaces, Inspector, Status bar.
- **Loom** — arrangement timeline: track lanes, clip placements, loop brace, markers,
  drag/duplicate/detach (§5 unified clip model).
- **Lattice** — step sequencer: paint, velocity cycle, playhead column, 16/32 steps.
- **Ivory** — piano roll: draw, move, resize, transpose, scale lock, note velocities.
- **Desk** — mix console: inserts from the Workshop Collection (L-Equal, L-Comp,
  L-Delay, L-Tape, L-Utility), pan, faders, meters, master strip.
- **Scope** — spectrum, waveform, peak history, honest readouts.
- **Engine** — Web Audio look-ahead scheduler, drum/poly/bass/pluck voices, metronome,
  4-beat count-in recording, take capture, offline WAV export.
- **Grammar** — Space/R/L/M transport, Ctrl+K palette, Ctrl+Z undo, musical typing
  while recording, `?` cheat sheet, 30 s autosave, localStorage persistence.

## Development

```sh
bun install
bun run dev       # dev server (Freebuff injects PORT)
bun tsc -b --noEmit   # typecheck
bun run build     # static production build to dist/
```

## Design law

`docs/GENESIS.md` is the constitution. §6 (GRAIN) and §2 (product principles) outrank
convenience: tokens only, no modal dialogs, nothing lost, honest numbers.
