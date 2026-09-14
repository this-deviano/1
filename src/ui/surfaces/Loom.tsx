/* Loom — the arrangement timeline (§8.1).
   Ruler 24px, loop brace, marker lane, 200px track headers, 72px lanes,
   square clip bodies with material glyphs, ember playhead, drag & duplicate. */

import { useEffect, useMemo, useRef, useState } from "react";
import { BAR, STEP_TICKS, ticksToBarBeat } from "../../lib/model";
import { getState, setState, useStore } from "../../lib/store";
import { getStatus } from "../../lib/status";
import { engine } from "../../lib/engine";
import type { Clip, ClipPlacementT } from "./types";
import {
  cmdAddMarker,
  cmdDeletePlacement,
  cmdDetachCopy,
  cmdDuplicatePlacement,
  cmdMovePlacement,
  cmdNewClip,
  cmdSetPlacementGain,
  cmdSetPlacementTranspose,
  cmdToggleArm,
  cmdToggleMute,
  cmdToggleSolo,
} from "../../lib/actions";

const HEADER_W = 200;
const LANE_H = 72;
const RULER_H = 24;
const MARKER_H = 20;

/* Playhead tick at ~20 Hz repaints — data, not motion (§6.7). */
export function usePlayheadTick(): number {
  const [tick, setTick] = useState(() => getStatus().playheadTick);
  useEffect(() => {
    const id = window.setInterval(() => setTick(getStatus().playheadTick), 50);
    return () => window.clearInterval(id);
  }, []);
  return tick;
}

export function Loom() {
  const song = useStore((s) => s.song);
  const selectedTrack = useStore((s) => s.selectedTrack);
  const selectedPlacement = useStore((s) => s.selectedPlacement);
  const snap = useStore((s) => s.snap);
  const head = usePlayheadTick();
  const [pxPerBar, setPxPerBar] = useState(96);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  void selectedTrack;

  const songEnd = useMemo(() => {
    let end = BAR * 16;
    for (const p of song.placements) {
      const c = song.clips.find((x) => x.id === p.clip);
      if (!c) continue;
      const len = clipLen(c);
      end = Math.max(end, p.start + len + BAR * 2);
    }
    return end;
  }, [song]);

  const width = (songEnd / BAR) * pxPerBar;
  const loop = song.loop;

  return (
    <div className="loom">
      <div className="loom-heads" style={{ width: HEADER_W }}>
        <div
          style={{
            height: RULER_H + MARKER_H,
            borderBottom: "1px solid var(--grain-line)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 8px",
          }}
        >
          <span className="micro">tracks</span>
          <span className="micro">{song.tracks.length}</span>
        </div>
        <div className="loom-heads-scroll">
          {song.tracks.map((t) => (
            <div
              key={t.id}
              className={`loom-head ${selectedTrack === t.id ? "selected" : ""}`}
              onClick={() => setState({ selectedTrack: t.id, selectedPlacement: null })}
            >
              <div className="loom-head-top">
                <button
                  className={`arm-dot ${t.arm ? "on" : ""}`}
                  aria-label={`Arm ${t.name}`}
                  title="Record-arm this track"
                  onClick={(e) => {
                    e.stopPropagation();
                    cmdToggleArm(t.id);
                  }}
                />
                <span className="loom-head-name">{t.name}</span>
              </div>
              <div className="loom-head-top">
                <span className="loom-head-kind">{t.kind}</span>
                <button
                  className={`mute-dot ${t.mute ? "muted" : ""}`}
                  aria-label={`Mute ${t.name}`}
                  title="Mute"
                  onClick={(e) => {
                    e.stopPropagation();
                    cmdToggleMute(t.id);
                  }}
                />
                <button
                  className="mute-dot"
                  style={t.solo ? { background: "var(--grain-ember)" } : undefined}
                  aria-label={`Solo ${t.name}`}
                  title="Solo"
                  onClick={(e) => {
                    e.stopPropagation();
                    cmdToggleSolo(t.id);
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        className="loom-body"
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setPxPerBar((p) => Math.max(24, Math.min(320, p * (e.deltaY < 0 ? 1.15 : 0.87))));
          }
        }}
      >
        <div ref={scrollRef} style={{ overflow: "auto", height: "100%" }}>
          <div style={{ width, position: "relative", minHeight: song.tracks.length * LANE_H + RULER_H + MARKER_H + 40 }}>
            <div style={{ position: "sticky", top: 0, zIndex: 5 }}>
              <Ruler width={width} pxPerBar={pxPerBar} />
              <MarkerLane width={width} pxPerBar={pxPerBar} />
            </div>

            {song.tracks.map((t) => {
              const placements = song.placements
                .filter((p) => p.track === t.id)
                .map((p) => {
                  const c = song.clips.find((x) => x.id === p.clip);
                  return c ? { p, c } : null;
                })
                .filter((x): x is { p: ClipPlacementT; c: Clip } => x !== null);
              return (
                <div
                  key={t.id}
                  style={{
                    height: LANE_H,
                    borderBottom: "1px solid var(--grain-line)",
                    position: "relative",
                    background: t.kind === "audio" ? "var(--grain-paper-sunken)" : "var(--grain-paper)",
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const data = e.dataTransfer.getData("text/plain");
                    if (!data.startsWith("move:")) return;
                    const id = data.slice(5);
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    const tick = ((e.clientX - rect.left) / pxPerBar) * BAR;
                    cmdMovePlacement(id, tick, t.id);
                  }}
                  onDoubleClick={(e) => {
                    if ((e.target as HTMLElement).closest("[data-clip]")) return;
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    const tick = ((e.clientX - rect.left) / pxPerBar) * BAR;
                    cmdNewClip(t.id, tick, "midi");
                  }}
                >
                  {placements.map(({ p, c }) => {
                    const len = clipLen(c);
                    const x = (p.start / BAR) * pxPerBar;
                    const w = Math.max(10, (len / BAR) * pxPerBar);
                    const over = p.transpose !== 0 || p.gain !== 0;
                    const sel = selectedPlacement === p.id;
                    return (
                      <div
                        key={p.id}
                        data-clip
                        title={`${c.name} · ${ticksToBarBeat(p.start, song.qpm)}${
                          over ? ` · overrides: transpose ${p.transpose > 0 ? "+" : ""}${p.transpose}${p.gain ? `, gain ${p.gain} dB` : ""}` : ""
                        } · double-click to edit`}
                        style={{
                          position: "absolute",
                          left: x,
                          top: 6,
                          bottom: 6,
                          width: w,
                          background: c.color,
                          opacity: p.mute ? 0.3 : 0.78,
                          border: sel ? "1.5px solid var(--grain-ember)" : "1px solid var(--grain-ink-24)",
                          cursor: "grab",
                          overflow: "hidden",
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setState({ selectedPlacement: p.id, selectedTrack: t.id });
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setState({ selectedPlacement: p.id, selectedTrack: t.id, surface: c.pattern ? "lattice" : "ivory" });
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          placementMenu(e.clientX, e.clientY, p.id);
                        }}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", `move:${p.id}`)}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 4px", background: "rgba(0,0,0,0.18)" }}>
                          <span style={{ width: 3, height: 12, background: "var(--grain-paper)", opacity: 0.8, flex: "none" }} />
                          <span style={{ fontSize: 10, fontWeight: 500, color: "var(--grain-paper)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {c.name}
                          </span>
                        </div>
                        <ClipBody clip={c} width={w} />
                        {over && (
                          <div
                            style={{
                              position: "absolute",
                              right: 0,
                              bottom: 0,
                              width: 0,
                              height: 0,
                              borderBottom: "10px solid var(--grain-ink-40)",
                              borderLeft: "10px solid transparent",
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: (head / BAR) * pxPerBar,
                width: 1,
                background: "var(--grain-ember)",
                zIndex: 4,
                pointerEvents: "none",
              }}
            />
            {loop && (
              <div
                title="Click to return to loop start"
                onClick={() => engine.seek(loop.start)}
                style={{
                  position: "absolute",
                  left: (loop.start / BAR) * pxPerBar,
                  width: ((loop.end - loop.start) / BAR) * pxPerBar,
                  top: RULER_H + MARKER_H,
                  bottom: 0,
                  background: "var(--grain-ember-tint)",
                  pointerEvents: "auto",
                  cursor: "pointer",
                }}
              />
            )}
          </div>
        </div>
      </div>
      <div className="micro" style={{ position: "absolute", right: 12, top: 6, zIndex: 6, pointerEvents: "none" }}>
        snap {snap} · ctrl+wheel zoom · double-click lane = new clip
      </div>
    </div>
  );
}

function placementMenu(x: number, y: number, placementId: string) {
  /* Non-modal context actions (P-04): duplicate, detach, nudge overrides, delete */
  const existing = document.getElementById("loom-ctx");
  if (existing) existing.remove();
  const menu = document.createElement("div");
  menu.id = "loom-ctx";
  menu.className = "step-shadow";
  menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:110;min-width:200px;padding:4px;`;
  const items: [string, () => void][] = [
    ["Duplicate (Alt+drag)", () => cmdDuplicatePlacement(placementId)],
    ["Detach as Copy (§5.4)", () => cmdDetachCopy(placementId)],
    ["Transpose +1", () => cmdSetPlacementTranspose(placementId, (getState().song.placements.find((p) => p.id === placementId)?.transpose ?? 0) + 1)],
    ["Transpose −1", () => cmdSetPlacementTranspose(placementId, (getState().song.placements.find((p) => p.id === placementId)?.transpose ?? 0) - 1)],
    ["Gain +1 dB", () => cmdSetPlacementGain(placementId, (getState().song.placements.find((p) => p.id === placementId)?.gain ?? 0) + 1)],
    ["Gain −1 dB", () => cmdSetPlacementGain(placementId, (getState().song.placements.find((p) => p.id === placementId)?.gain ?? 0) - 1)],
    ["Delete (Del)", () => cmdDeletePlacement(placementId)],
  ];
  for (const [label, fn] of items) {
    const row = document.createElement("button");
    row.textContent = label;
    row.style.cssText =
      "display:flex;width:100%;text-align:left;padding:6px 10px;font:500 12px 'Schibsted Grotesk',sans-serif;color:var(--grain-ink-88);border-radius:5px;";
    row.onmouseenter = () => (row.style.background = "var(--grain-paper-sunken)");
    row.onmouseleave = () => (row.style.background = "transparent");
    row.onclick = () => {
      fn();
      menu.remove();
    };
    menu.appendChild(row);
  }
  document.body.appendChild(menu);
  const dismiss = (ev: MouseEvent) => {
    if (!menu.contains(ev.target as Node)) menu.remove();
    window.removeEventListener("pointerdown", dismiss);
  };
  window.setTimeout(() => window.addEventListener("pointerdown", dismiss), 0);
}

function Ruler({ width, pxPerBar }: { width: number; pxPerBar: number }) {
  const bars = Math.ceil(width / pxPerBar);
  const loop = getState().song.loop;
  return (
    <div
      style={{
        height: RULER_H,
        width,
        position: "relative",
        borderBottom: "1px solid var(--grain-line)",
        cursor: "crosshair",
        background: "var(--grain-panel)",
      }}
      onDoubleClick={(e) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        engine.seek(((e.clientX - rect.left) / pxPerBar) * BAR);
      }}
      title="Double-click to move playhead"
    >
      {Array.from({ length: bars }, (_, i) => (
        <div key={i} style={{ position: "absolute", left: i * pxPerBar, top: 8, bottom: 0, width: 1, background: "var(--grain-ink-12)" }}>
          {i * pxPerBar > 18 && (
            <span className="micro" style={{ position: "absolute", left: 4, top: 2, color: "var(--grain-ink-64)" }}>
              {i + 1}
            </span>
          )}
        </div>
      ))}
      {loop && (
        <div
          style={{
            position: "absolute",
            left: (loop.start / BAR) * pxPerBar,
            width: Math.max(2, ((loop.end - loop.start) / BAR) * pxPerBar),
            top: 0,
            height: 6,
            background: "var(--grain-ember)",
            opacity: 0.8,
          }}
        />
      )}
    </div>
  );
}

function MarkerLane({ width, pxPerBar }: { width: number; pxPerBar: number }) {
  const song = useStore((s) => s.song);
  return (
    <div
      style={{
        height: MARKER_H,
        width,
        position: "relative",
        borderBottom: "1px solid var(--grain-line)",
        background: "var(--grain-panel)",
      }}
      onDoubleClick={() => cmdAddMarker()}
      title="Double-click: add marker at playhead (Shift+M)"
    >
      {song.markers.map((m) => (
        <div key={m.id} style={{ position: "absolute", left: (m.tick / BAR) * pxPerBar, top: 3, display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 1, height: MARKER_H - 6, background: "var(--grain-ember)" }} />
          <span className="micro" style={{ color: "var(--grain-ink-64)" }}>
            {m.name}
          </span>
        </div>
      ))}
    </div>
  );
}

function ClipBody({ clip, width }: { clip: Clip; width: number }) {
  if (clip.pattern) {
    const stepW = Math.max(2, (width - 8) / clip.pattern.length);
    return (
      <div style={{ position: "absolute", left: 4, right: 4, top: 22, bottom: 4, display: "flex", flexWrap: "wrap", gap: 2, alignContent: "flex-start" }}>
        {clip.pattern.rows.flatMap((r, ri) =>
          r.steps.map((s, si) =>
            s.on ? (
              <div key={`${ri}-${si}`} data-loom-step={`${ri}-${si}`} style={{ width: stepW, height: 3, background: "var(--grain-paper)", opacity: 0.7 + (s.vel / 127) * 0.3 }} />
            ) : null
          )
        )}
      </div>
    );
  }
  const buckets = Math.max(4, Math.floor(width / 6));
  const env = useMemo(() => {
    if (clip.notes.length === 0) return null;
    const arr: { min: number; max: number }[] = Array.from({ length: buckets }, () => ({ min: 128, max: -1 }));
    const maxTick = Math.max(1, clip.notes.reduce((m, n) => Math.max(m, n.tick + n.len), 0));
    for (const n of clip.notes) {
      const b0 = Math.floor((n.tick / maxTick) * buckets);
      const b1 = Math.floor(((n.tick + n.len) / maxTick) * buckets);
      for (let b = Math.max(0, b0); b <= Math.min(buckets - 1, b1); b++) {
        arr[b].min = Math.min(arr[b].min, n.pitch);
        arr[b].max = Math.max(arr[b].max, n.pitch);
      }
    }
    return arr;
  }, [clip.notes, buckets]);
  if (!env) return null;
  return (
    <div style={{ position: "absolute", left: 4, right: 4, top: 22, bottom: 4, display: "flex", alignItems: "flex-end", gap: 1 }}>
      {env.map((e, i) => {
        if (e.max < 0) return <div key={i} style={{ flex: 1 }} />;
        const span = Math.max(1, e.max - e.min);
        const h = Math.min(40, 6 + span * 2);
        return <div key={i} style={{ flex: 1, height: h, background: "var(--grain-paper)", opacity: 0.7 }} />;
      })}
    </div>
  );
}

export function clipLen(c: Clip): number {
  if (c.pattern) return c.pattern.length * STEP_TICKS;
  return Math.max(BAR, c.notes.reduce((m, n) => Math.max(m, n.tick + n.len), 0));
}
