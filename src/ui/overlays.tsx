/* Overlays — command palette (§9.6), cheat sheet (§6.8.9), coach (§7.5).
   Keyboard-first, dismissable, zero modals (P-04). */

import { useEffect, useMemo, useRef, useState } from "react";
import { getState, setState, useStore } from "../lib/store";
import {
  cmdAddCrateClip,
  cmdAddMarker,
  cmdAddTrack,
  cmdCycle,
  cmdDetachCopy,
  cmdExportMix,
  cmdLoad,
  cmdMetronome,
  cmdNewClip,
  cmdNewSong,
  cmdPlayStop,
  cmdRecord,
  cmdRedo,
  cmdReturnZero,
  cmdSave,
  cmdSetSnap,
  cmdSetSurface,
  cmdToggleTheme,
  cmdUndo,
} from "../lib/actions";
import { FACTORY_CRATE } from "../lib/factory";

interface Cmd {
  area: string;
  name: string;
  sc?: string;
  run: () => void;
}

export function buildCommands(): Cmd[] {
  const cmds: Cmd[] = [
    { area: "app", name: "Play / Stop", sc: "Space", run: () => void cmdPlayStop() },
    { area: "app", name: "Record armed tracks", sc: "R", run: () => void cmdRecord() },
    { area: "app", name: "Return to zero", sc: "Enter", run: cmdReturnZero },
    { area: "app", name: "Cycle (loop) toggle", sc: "L", run: cmdCycle },
    { area: "app", name: "Metronome toggle", sc: "M", run: cmdMetronome },
    { area: "app", name: "Save Song", sc: "Ctrl+S", run: cmdSave },
    { area: "app", name: "Load saved Song", run: cmdLoad },
    { area: "app", name: "New Song (reloads)", run: cmdNewSong },
    { area: "app", name: "Export mix (WAV)", run: () => void cmdExportMix() },
    { area: "app", name: "Undo", sc: "Ctrl+Z", run: cmdUndo },
    { area: "app", name: "Redo", sc: "Ctrl+Shift+Z", run: cmdRedo },
    { area: "app", name: "Toggle theme Day/Night", run: cmdToggleTheme },
    { area: "app", name: "Cycle snap mode", sc: "Alt+S", run: cmdSetSnap },
    { area: "app", name: "Marker at playhead", sc: "Shift+M", run: cmdAddMarker },
    { area: "app", name: "Add audio track", run: () => cmdAddTrack("audio") },
    { area: "app", name: "Add instrument track", run: () => cmdAddTrack("midi") },
    { area: "app", name: "Add bus track", run: () => cmdAddTrack("bus") },
    { area: "loom", name: "Go to Loom", sc: "1", run: () => cmdSetSurface("loom") },
    { area: "lattice", name: "Go to Lattice", sc: "2", run: () => cmdSetSurface("lattice") },
    { area: "ivory", name: "Go to Ivory", sc: "3", run: () => cmdSetSurface("ivory") },
    { area: "desk", name: "Go to Desk", sc: "4", run: () => cmdSetSurface("desk") },
    { area: "scope", name: "Go to Scope", sc: "5", run: () => cmdSetSurface("scope") },
    {
      area: "loom",
      name: "New clip on selected track",
      run: () => {
        const st = getState();
        const t = st.selectedTrack ?? st.song.tracks[0]?.id;
        if (t) cmdNewClip(t, st.song.loop?.start ?? 0);
      },
    },
    {
      area: "clip",
      name: "Detach selected placement as copy",
      run: () => {
        const id = getState().selectedPlacement;
        if (id) cmdDetachCopy(id);
      },
    },
  ];
  FACTORY_CRATE.forEach((item, i) => {
    if (item.kind === "pattern" || item.kind === "midi") {
      cmds.push({
        area: "crates",
        name: `Place ${item.name}`,
        run: () => {
          const st = getState();
          const t = st.selectedTrack ?? st.song.tracks[0]?.id;
          if (t) cmdAddCrateClip(i, t, st.song.loop?.start ?? 0);
        },
      });
    }
  });
  return cmds;
}

export function Palette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cmds = useMemo(buildCommands, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return cmds.slice(0, 12);
    return cmds.filter((c) => `${c.area}.${c.name}`.toLowerCase().includes(needle)).slice(0, 12);
  }, [q, cmds]);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => setSel(0), [q]);

  return (
    <>
      <div className="overlay-scrim" onClick={onClose} />
      <div className="palette step-shadow" role="dialog" aria-label="Command palette">
        <input
          ref={inputRef}
          className="grain-field"
          placeholder="Type a command… (area.name)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { setSel((s) => Math.min(filtered.length - 1, s + 1)); e.preventDefault(); }
            if (e.key === "ArrowUp") { setSel((s) => Math.max(0, s - 1)); e.preventDefault(); }
            if (e.key === "Enter") { filtered[sel]?.run(); onClose(); }
            if (e.key === "Escape") onClose();
          }}
        />
        <div className="palette-list">
          {filtered.length === 0 && (
            <div className="palette-row" style={{ color: "var(--grain-ink-40)" }}>
              No commands match.
            </div>
          )}
          {filtered.map((c, i) => (
            <div
              key={`${c.area}.${c.name}`}
              className={`palette-row ${i === sel ? "sel" : ""}`}
              onPointerEnter={() => setSel(i)}
              onClick={() => {
                c.run();
                onClose();
              }}
            >
              <span className="area">{c.area}</span>
              <span>{c.name}</span>
              {c.sc && <span className="sc">{c.sc}</span>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

const CHEAT: [string, string][] = [
  ["Space", "Play / Stop"],
  ["R", "Record armed"],
  ["L / M", "Cycle / Metronome"],
  ["Enter", "Return to zero"],
  ["Tab", "Next surface"],
  ["1–5", "Loom · Lattice · Ivory · Desk · Scope"],
  ["Ctrl+K", "Command palette"],
  ["Ctrl+S", "Save"],
  ["Ctrl+Z", "Undo"],
  ["?", "Toggle this sheet"],
];

export function CheatSheet() {
  const open = useStore((s) => s.cheat);
  if (!open) return null;
  return (
    <div className="cheat-sheet step-shadow" role="complementary" aria-label="Keyboard cheat sheet">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="micro">cheat sheet · press ? to hide</span>
        <button className="grain-btn small" aria-label="Hide cheat sheet" onClick={() => setState({ cheat: false })}>
          ×
        </button>
      </div>
      <table>
        <tbody>
          {CHEAT.map(([k, v]) => (
            <tr key={k}>
              <td className="k">{k}</td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const COACH_STEPS: { title: string; body: string }[] = [
  { title: "Step 1 · Record", body: "Press R (or the red dot in the Rail). You'll hear a 4-beat count-in, then play — armed tracks capture your performance as MIDI." },
  { title: "Step 2 · Stop", body: "Press Space to stop. Your take lands as a clip on the armed track." },
  { title: "Step 3 · Loop it", body: "Press L to cycle the loop region, then Space again. Edit the clip in Lattice or Ivory — every placement updates." },
  { title: "Step 4 · Find everything", body: "Ctrl+K searches every command. That's the whole ceremony." },
];

export function Coach() {
  const step = useStore((s) => s.coachStep);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem("luthier.coach.dismissed") === "1");
  if (dismissed || step < 0 || step >= COACH_STEPS.length) return null;
  const s = COACH_STEPS[step];
  return (
    <div className="coach step-shadow" role="complementary" aria-label="Getting started coach">
      <div className="step-no">{String(step + 1).padStart(2, "0")}</div>
      <div style={{ font: "var(--grain-type-body-strong)", margin: "4px 0" }}>{s.title}</div>
      <div style={{ color: "var(--grain-ink-64)", fontSize: 12, lineHeight: "17px" }}>{s.body}</div>
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <button className="grain-btn small primary" onClick={() => setState({ coachStep: step + 1 })}>
          Next
        </button>
        <button
          className="grain-btn small"
          onClick={() => {
            localStorage.setItem("luthier.coach.dismissed", "1");
            setDismissed(true);
          }}
        >
          Dismiss forever (Esc)
        </button>
      </div>
    </div>
  );
}
