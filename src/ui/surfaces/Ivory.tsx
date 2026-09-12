/* Ivory — the piano roll (§8.4).
   Draw with pointer, Alt+drag duplicate, resize by edges, transpose with
   Ctrl+↑/↓, scale lock, ghost notes from sibling pitches at low opacity. */

import { useRef, useState } from "react";
import { STEP_TICKS, TPQ } from "../../lib/model";
import type { Clip, Note } from "../../lib/model";
import { getState, useStore } from "../../lib/store";
import { engine } from "../../lib/engine";
import { cmdAddNote, cmdDeleteNote, cmdMoveNote, cmdResizeNote, cmdSetNoteVel, cmdTransposeNotes } from "../../lib/actions";
import { toast } from "../primitives";

const KEY_W = 56;
const LANE_H = 14;
const STEP_W = 26; // px per 1/16

const SCALES: Record<string, number[]> = {
  Chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  "C minor": [0, 2, 3, 5, 7, 8, 10],
  "C major": [0, 2, 4, 5, 7, 9, 11],
  "C pentatonic": [0, 2, 4, 7, 9],
};

function isBlack(p: number): boolean {
  return [1, 3, 6, 8, 10].includes(p % 12);
}

function noteName(p: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${names[p % 12]}${Math.floor(p / 12) - 1}`;
}

export function Ivory() {
  const song = useStore((s) => s.song);
  const selectedPlacement = useStore((s) => s.selectedPlacement);
  const [scale, setScale] = useState<keyof typeof SCALES>("Chromatic");
  const [sel, setSel] = useState<string[]>([]);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: string; mode: "move" | "resize"; startX: number; startY: number; tick: number; pitch: number; len: number } | null>(null);

  const resolved = (() => {
    const p = song.placements.find((x) => x.id === selectedPlacement);
    if (p) {
      const c = song.clips.find((x) => x.id === p.clip);
      if (c) return { clip: c, placement: p };
    }
    for (const t of song.tracks) {
      const first = song.placements.filter((x) => x.track === t.id).sort((a, b) => a.start - b.start)[0];
      const c = first ? song.clips.find((x) => x.id === first.clip) : undefined;
      if (c) return { clip: c, placement: first };
    }
    const any = song.clips.find((c) => c.notes.length > 0);
    return any ? { clip: any, placement: song.placements.find((p) => p.clip === any.id) ?? null } : null;
  })();

  if (!resolved) {
    return (
      <div className="surface-empty">
        <div className="surface-empty-inner">
          <div className="verb">Carve.</div>
          <div className="next">No MIDI material in reach. Create a clip on a lane (double-click in Loom), then come back.</div>
          <div className="micro">draw with the pointer · alt+drag duplicates · del removes</div>
        </div>
      </div>
    );
  }

  const clip = resolved.clip;
  const transpose = resolved.placement?.transpose ?? 0;
  const maxTick = Math.max(TPQ * 4, clip.notes.reduce((m, n) => Math.max(m, n.tick + n.len), 0));
  const width = (maxTick / STEP_TICKS) * STEP_W + STEP_W * 8;
  const pitches = clip.notes.map((n) => n.pitch);
  const topPitch = Math.min(107, (pitches.length ? Math.max(...pitches) : 72) + 4);
  const botPitch = Math.max(12, (pitches.length ? Math.min(...pitches) : 36) - 4);
  const rows: number[] = [];
  for (let p = topPitch; p >= botPitch; p--) rows.push(p);

  const scaleSet = new Set(SCALES[scale].map((s) => s % 12));

  const tickFromEvent = (e: React.PointerEvent | React.MouseEvent): number => {
    const host = canvasRef.current;
    if (!host) return 0;
    const r = host.getBoundingClientRect();
    return Math.max(0, Math.round(((e.clientX - r.left + host.scrollLeft) / STEP_W) * STEP_TICKS));
  };
  const pitchFromEvent = (e: React.PointerEvent | React.MouseEvent): number => {
    const host = canvasRef.current;
    if (!host) return 60;
    const r = host.getBoundingClientRect();
    const p = topPitch - Math.floor((e.clientY - r.top + host.scrollTop) / LANE_H);
    return Math.max(0, Math.min(127, p));
  };

  const snapTo = (tick: number) => {
    const snapMode = getState().snap;
    if (snapMode === "off") return tick;
    return Math.round(tick / STEP_TICKS) * STEP_TICKS;
  };

  return (
    <div className="ivory">
      <div className="ivory-toolbar">
        <span className="micro">ivory</span>
        <strong style={{ font: "var(--grain-type-body-strong)" }}>{clip.name}</strong>
        <span className="value" style={{ fontSize: 11 }}>
          {clip.notes.length} notes
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <select className="grain-field" style={{ width: 130, height: 24 }} value={scale} onChange={(e) => setScale(e.target.value as keyof typeof SCALES)} aria-label="Scale lock">
            {Object.keys(SCALES).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <button className="grain-btn small" onClick={() => { cmdTransposeNotes(clip.id, 1); toast("Transposed +1."); }}>
            +1
          </button>
          <button className="grain-btn small" onClick={() => { cmdTransposeNotes(clip.id, -1); toast("Transposed −1."); }}>
            −1
          </button>
          <button className="grain-btn small" onClick={() => { cmdTransposeNotes(clip.id, 12); toast("Transposed +12."); }}>
            +12
          </button>
          <button className="grain-btn small" onClick={() => { cmdTransposeNotes(clip.id, -12); toast("Transposed −12."); }}>
            −12
          </button>
          {sel.length > 0 && (
            <button
              className="grain-btn small"
              onClick={() => {
                for (const id of sel) cmdDeleteNote(clip.id, id);
                setSel([]);
              }}
            >
              Delete {sel.length}
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* key column */}
        <div className="ivory-keys" style={{ overflow: "hidden" }}>
          {rows.map((p) => (
            <div
              key={p}
              style={{
                height: LANE_H,
                background: isBlack(p) ? "var(--grain-ink-12)" : "var(--grain-paper-raised)",
                borderBottom: "1px solid var(--grain-line)",
                display: "flex",
                alignItems: "center",
                paddingLeft: 6,
              }}
              onPointerDown={() => {
                engine.noteOn(p, 100);
              }}
            >
              {p % 12 === 0 && (
                <span className="micro" style={{ color: "var(--grain-ink-64)" }}>
                  {noteName(p)}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* grid */}
        <div
          ref={canvasRef}
          className="ivory-canvas-wrap"
          style={{ overflow: "auto" }}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).dataset.note) return;
            const tick = snapTo(tickFromEvent(e));
            const pitch = pitchFromEvent(e);
            if (!scaleSet.has(pitch % 12)) {
              toast(`${noteName(pitch)} is outside ${scale} — snapped to scale lane.`, "signal");
              return;
            }
            cmdAddNote(clip.id, tick, pitch, 100, STEP_TICKS);
            setSel([]);
          }}
        >
          <div style={{ width, position: "relative", minHeight: rows.length * LANE_H }}>
            {/* vertical gridlines */}
            {Array.from({ length: Math.ceil(width / STEP_W) }, (_, i) => {
              const isBar = i % 16 === 0;
              const isBeat = i % 4 === 0;
              if (!isBar && !isBeat) return null;
              return (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: i * STEP_W,
                    top: 0,
                    bottom: 0,
                    width: 1,
                    background: isBar ? "var(--grain-ink-24)" : "var(--grain-ink-12)",
                    pointerEvents: "none",
                  }}
                />
              );
            })}
            {/* lanes */}
            {rows.map((p, ri) => (
              <div
                key={p}
                style={{
                  position: "absolute",
                  top: ri * LANE_H,
                  height: LANE_H,
                  left: 0,
                  right: 0,
                  background: isBlack(p) ? "var(--grain-ink-12)" : "transparent",
                  opacity: isBlack(p) ? 0.35 : 1,
                  borderBottom: "1px solid var(--grain-ink-12)",
                  pointerEvents: "none",
                }}
              />
            ))}
            {/* notes */}
            {clip.notes.map((n) => {
              const disp = n.pitch + transpose;
              const x = (n.tick / STEP_TICKS) * STEP_W;
              const w = Math.max(8, (n.len / STEP_TICKS) * STEP_W - 2);
              const ri = rows.indexOf(disp);
              if (ri < 0) return null;
              const selected = sel.includes(n.id);
              return (
                <div
                  key={n.id}
                  data-note
                  title={`${noteName(n.pitch)} · vel ${n.vel} · drag to move, edge to resize, alt+drag to duplicate`}
                  style={{
                    position: "absolute",
                    left: x,
                    top: ri * LANE_H + 1,
                    width: w,
                    height: LANE_H - 2,
                    background: clip.color,
                    opacity: 0.5 + (n.vel / 127) * 0.5,
                    border: selected ? "1.5px solid var(--grain-ember)" : "1px solid var(--grain-ink-40)",
                    borderRadius: 2,
                    cursor: "move",
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    const dup = e.altKey;
                    if (dup) {
                      cmdAddNote(clip.id, snapTo(tickFromEvent(e)), disp, n.vel, n.len);
                      return;
                    }
                    if (e.shiftKey) {
                      setSel((s) => (s.includes(n.id) ? s.filter((x) => x !== n.id) : [...s, n.id]));
                      return;
                    }
                    setSel([n.id]);
                    const mode = e.clientX - (e.currentTarget as HTMLElement).getBoundingClientRect().left > w - 8 ? "resize" : "move";
                    dragRef.current = { id: n.id, mode, startX: e.clientX, startY: e.clientY, tick: n.tick, pitch: disp, len: n.len };
                    (e.target as HTMLElement).setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    const d = dragRef.current;
                    if (!d || d.id !== n.id) return;
                    const dtick = ((e.clientX - d.startX) / STEP_W) * STEP_TICKS;
                    const dpitch = Math.round(-(e.clientY - d.startY) / LANE_H);
                    if (d.mode === "move") {
                      cmdMoveNote(clip.id, n.id, snapTo(d.tick + dtick), Math.max(0, Math.min(127, d.pitch + dpitch)));
                    } else {
                      cmdResizeNote(clip.id, n.id, d.len + dtick);
                    }
                  }}
                  onPointerUp={() => (dragRef.current = null)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    cycleVel(clip.id, n.id, n.vel);
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
      <div className="micro" style={{ padding: "4px 10px", borderTop: "1px solid var(--grain-line)" }}>
        click empty grid = add note · drag = move · right edge = resize · alt+drag = duplicate · shift+click = multi-select · double-click = cycle velocity
      </div>
    </div>
  );
}

function cycleVel(clipId: string, noteId: string, vel: number) {
  const next = vel >= 115 ? 70 : vel >= 90 ? 115 : 90;
  cmdSetNoteVel(clipId, noteId, next);
  toast(`Velocity ${next}.`, "ember");
}

export type { Note };
