/* Lattice — the pattern/step surface (§8.3).
   Rows = pitches (drum-mapped labels when applicable), 16 steps per bar,
   velocity cycle on Alt+click, paint on drag, live playhead column. */

import { useRef, useState } from "react";
import { DRUMS, DRUM_LABEL } from "../../lib/factory";
import { STEP_TICKS, ticksToBarBeat } from "../../lib/model";
import { getState, setState, useStore } from "../../lib/store";
import type { Clip } from "../../lib/model";
import { cmdSetStepVel, cmdToggleStep, cmdSetPatternLength } from "../../lib/actions";
import { usePlayheadTick } from "./Loom";
import { toast } from "../primitives";

export function activeEditClip(): { clip: Clip; placementId: string | null } | null {
  const st = getState();
  const p = st.song.placements.find((x) => x.id === st.selectedPlacement);
  if (p) {
    const c = st.song.clips.find((x) => x.id === p.clip);
    if (c) return { clip: c, placementId: p.id };
  }
  if (st.selectedTrack) {
    const first = st.song.placements
      .filter((x) => x.track === st.selectedTrack)
      .sort((a, b) => a.start - b.start)[0];
    const c = first ? st.song.clips.find((x) => x.id === first.clip) : undefined;
    if (c) return { clip: c, placementId: first.id };
  }
  const anyPattern = st.song.clips.find((c) => c.pattern);
  if (anyPattern) return { clip: anyPattern, placementId: null };
  return null;
}

export function Lattice() {
  const song = useStore((s) => s.song);
  const selectedPlacement = useStore((s) => s.selectedPlacement);
  const head = usePlayheadTick();
  const painting = useRef<"on" | "off" | null>(null);
  const [, bump] = useState(0);
  const resolved = activeEditClip();
  const loop = song.loop;

  if (!resolved) {
    return (
      <div className="surface-empty">
        <div className="surface-empty-inner">
          <div className="verb">Strike.</div>
          <div className="next">
            No clip in reach. Double-click a Loom lane to create one, or drag a kit from Crates
            onto a track.
          </div>
          <div className="micro">or press ctrl+k → “add clip”</div>
        </div>
      </div>
    );
  }

  const clip = resolved.clip;
  const pattern = clip.pattern;
  const steps = pattern?.length ?? 16;

  const rowPitches = pattern
    ? pattern.rows.map((r) => r.pitch)
    : [...new Set(clip.notes.map((n) => n.pitch))].sort((a, b) => a - b);

  const rowLabel = (p: number) => {
    const hit = Object.entries(DRUMS).find(([, v]) => v === p);
    return hit ? DRUM_LABEL[hit[0]] : noteName(p);
  };

  const isOn = (pitch: number, idx: number) => {
    if (pattern) {
      const row = pattern.rows.find((r) => r.pitch === pitch);
      return row?.steps[idx]?.on ?? false;
    }
    const tick = idx * STEP_TICKS;
    return clip.notes.some((n) => n.pitch === pitch && Math.abs(n.tick - tick) < STEP_TICKS / 2);
  };

  const velOf = (pitch: number, idx: number) => {
    if (pattern) {
      const row = pattern.rows.find((r) => r.pitch === pitch);
      return row?.steps[idx]?.vel ?? 100;
    }
    const tick = idx * STEP_TICKS;
    return clip.notes.find((n) => n.pitch === pitch && Math.abs(n.tick - tick) < STEP_TICKS / 2)?.vel ?? 100;
  };

  // loop-local playhead step (highlights the active column while cycling)
  let playStep = -1;
  if (loop && head >= loop.start && head < loop.end) {
    const local = head - loop.start;
    const phase = clip.pattern ? local : local - (resolved.placementId ? (song.placements.find((p) => p.id === resolved.placementId)?.start ?? 0) : 0);
    const mod = ((phase % (steps * STEP_TICKS)) + steps * STEP_TICKS) % (steps * STEP_TICKS);
    playStep = Math.floor(mod / STEP_TICKS);
  }

  return (
    <div className="lattice">
      <div className="ivory-toolbar">
        <span className="micro">lattice</span>
        <strong style={{ font: "var(--grain-type-body-strong)" }}>{clip.name}</strong>
        <span className="micro">{ticksToBarBeat(resolved.placementId ? (song.placements.find((p) => p.id === resolved.placementId)?.start ?? 0) : 0, song.qpm)}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          <span className="micro">steps</span>
          {[16, 32].map((n) => (
            <button
              key={n}
              className={`grain-btn small ${steps === n ? "toggle-on" : ""}`}
              onClick={() => {
                cmdSetPatternLength(clip.id, n);
                bump((x) => x + 1);
              }}
            >
              {n}
            </button>
          ))}
          <button className="grain-btn small" onClick={() => setState({ surface: "ivory" })}>
            Edit in Ivory
          </button>
        </div>
      </div>

      <div style={{ padding: 12, overflow: "auto" }}>
        <div className="lattice-grid" style={{ gridTemplateColumns: "112px 1fr" }}>
          {rowPitches.map((pitch) => (
            <div key={pitch} className="lattice-row" style={{ display: "contents" }}>
              <div className="lattice-rowhead">
                <div className="lattice-pad" style={{ background: clip.color, opacity: 0.85 }} />
                <span style={{ font: "var(--grain-type-small)" }}>{rowLabel(pitch)}</span>
              </div>
              <div
                className="lattice-steps"
                onPointerLeave={() => (painting.current = null)}
              >
                {Array.from({ length: steps }, (_, i) => {
                  const on = isOn(pitch, i);
                  const vel = velOf(pitch, i);
                  const groupEnd = (i + 1) % 4 === 0 && i < steps - 1;
                  return (
                    <span key={i} style={{ display: "inline-flex", alignItems: "center" }}>
                      <button
                        className={`lattice-step ${on ? "on" : ""} ${playStep === i ? "playhead" : ""}`}
                        title={`${rowLabel(pitch)} · step ${i + 1} · vel ${vel} · alt+click cycles velocity`}
                        onPointerDown={(e) => {
                          if (e.altKey) {
                            const next = vel >= 115 ? 70 : vel >= 90 ? 115 : 90;
                            cmdSetStepVel(clip.id, pitch, i, next);
                            toast(`Velocity ${next}.`, "ember");
                            return;
                          }
                          cmdToggleStep(clip.id, pitch, i);
                          painting.current = on ? "off" : "on";
                        }}
                        onPointerEnter={(e) => {
                          if (painting.current && e.buttons === 1) {
                            const want = painting.current === "on";
                            if (isOn(pitch, i) !== want) cmdToggleStep(clip.id, pitch, i);
                          }
                        }}
                      >
                        {on && (
                          <span
                            className="vel-band"
                            style={{ background: "var(--grain-paper)", opacity: 0.4 + (vel / 127) * 0.6 }}
                          />
                        )}
                      </button>
                      {groupEnd && <span className="group-gap" />}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function noteName(p: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${names[p % 12]}${Math.floor(p / 12) - 1}`;
}
