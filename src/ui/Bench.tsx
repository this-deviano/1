/* The Bench (§7) — Rail (44px), Crates (280px), tabbed Surfaces,
   Inspector (260px), Status bar (24px). Overlays: command palette,
   cheat sheet, coach panel, toasts. Zero modal dialogs (P-04). */

import { useEffect, useMemo, useRef, useState } from "react";
import { getState, setState, useStore, syncEngineFromModel, pushMetronomePrefError } from "../lib/store";
import { useStatus, useSelfTest, installSelfTests } from "../lib/status";
import { engine } from "../lib/engine";
import { pushStatus } from "../lib/status";
import type { Song } from "../lib/model";
import { ticksToBarBeat, ticksToMinSec } from "../lib/model";
import { cmdAddCrateClip, cmdFlushTake, cmdPersistHistory, cmdRestoreSession } from "../lib/actions";
import { cmdLaunchBench } from "../lib/launch";

/* musical typing map — semitone offset from C3 */
const TYPING: Record<string, number> = {
  z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11, ",": 12,
};
import { FACTORY_CRATE, saveSong } from "../lib/factory";
import {
  cmdAddMarker,
  cmdAddTrack,
  cmdCycle,
  cmdExportMix,
  cmdLoad,
  cmdCancelNewSong,
  cmdMetronome,
  cmdNewSong,
  cmdPlayStop,
  cmdRecord,
  cmdRedo,
  cmdReturnZero,
  cmdSave,
  cmdSetSnap,
  cmdSetSurface,
  cmdSetTempo,
  cmdToggleFollow,
  cmdToggleTheme,
  cmdUndo,
  cycleSurface,
} from "../lib/actions";
import { Landing } from "./Landing";
import { ToastStack } from "./primitives";
import { Loom } from "./surfaces/Loom";
import { Lattice } from "./surfaces/Lattice";
import { Ivory } from "./surfaces/Ivory";
import { Desk } from "./surfaces/Desk";
import { Scope } from "./surfaces/Scope";
import { Palette, CheatSheet, Coach } from "./overlays";

const SURFACES: { id: string; name: string; key: string }[] = [
  { id: "loom", name: "Loom", key: "1" },
  { id: "lattice", name: "Lattice", key: "2" },
  { id: "ivory", name: "Ivory", key: "3" },
  { id: "desk", name: "Desk", key: "4" },
  { id: "scope", name: "Scope", key: "5" },
];

export function App() {
  const bench = useStore((s) => s.bench);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", getState().theme);
  }, []);
  useEffect(() => {
    if (bench) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        cmdLaunchBench();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bench]);
  return bench ? <Bench /> : <Landing />;
}

function Bench() {
  const surface = useStore((s) => s.surface);
  const song = useStore((s) => s.song);
  const dirty = useStore((s) => s.dirty);
  const follow = useStore((s) => s.follow);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const status = useStatus();

  // engine status → bridge (§22.5); takes flush on stop (§17.4)
  useEffect(() => {
    engine.onStatus = (s) => pushStatus(s);
    engine.onStop = () => cmdFlushTake();
    return () => {
      engine.onStatus = null;
      engine.onStop = null;
    };
  }, []);

  // backfill engine live-state from model + persisted pref (TASK-013 ruling)
  useEffect(() => {
    syncEngineFromModel();
  }, []);

  // P-14: a failed metronome-pref write surfaces once, inline, as LR-0005
  useEffect(() => {
    pushMetronomePrefError();
  }, []);

  // dev self-test console hook (app.selftest.*) — parity guard + determinism
  useEffect(() => {
    installSelfTests();
  }, []);

  useEffect(() => {
    engine.setSong(song);
  }, [song]);

  // autosave every 30 s when dirty (§10.2) — quietly, no toast; history snapshots ride along (TASK-006)
  useEffect(() => {
    const id = window.setInterval(() => {
      const st = getState();
      if (st.dirty) {
        void cmdSave(true);
        void cmdPersistHistory();
      }
    }, 30000);
    return () => window.clearInterval(id);
  }, []);

  // boot: restore session (OPFS song → history → legacy migration) — TASK-005/006
  useEffect(() => {
    void cmdRestoreSession();
  }, []);

  // P-20: never lose the last 30 s to a tab close — flush on unload
  useEffect(() => {
    const onUnload = () => {
      const st = getState();
      if (st.dirty) {
        // synchronous best-effort: legacy mirror (sync API) — OPFS is async-only
        saveSong(st.song);
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  // global keymap (Appendix B)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
      if (typing && !(e.ctrlKey || e.metaKey)) return;

      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((v) => !v); return; }
      if (ctrl && e.key.toLowerCase() === "s") { e.preventDefault(); cmdSave(); return; }
      if (ctrl && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); cmdUndo(); return; }
      if (ctrl && (e.key.toLowerCase() === "z" && e.shiftKey || e.key.toLowerCase() === "y")) { e.preventDefault(); cmdRedo(); return; }
      if (ctrl && e.key === ",") { e.preventDefault(); toastInfo("Settings live in the Rail — theme, tempo, density."); return; }
      if (ctrl) return;
      if (typing) return;

      if (e.altKey && e.key.toLowerCase() === "s") { e.preventDefault(); cmdSetSnap(); return; }
      if (e.shiftKey && e.key.toLowerCase() === "m") { cmdAddMarker(); return; }

      // musical typing (z–m row = C3..B3) — active while recording, so the
      // keymap outside recording stays exactly as Appendix B specifies
      if (!e.repeat && !e.altKey && !e.shiftKey && engine.recording) {
        const semi = TYPING[e.key.toLowerCase()];
        if (semi !== undefined) {
          engine.noteOn(48 + semi, 100);
          return;
        }
      }

      switch (e.key) {
        case " ":
          e.preventDefault();
          void cmdPlayStop();
          break;
        case "Enter":
          cmdReturnZero();
          break;
        case "r":
          void cmdRecord();
          break;
        case "l":
          cmdCycle();
          break;
        case "m":
          cmdMetronome();
          break;
        case "Tab":
          e.preventDefault();
          cycleSurface(e.shiftKey ? -1 : 1);
          break;
        case "?":
          setState({ cheat: !getState().cheat });
          break;
        case "Escape":
          setState({ cheat: false });
          cmdCancelNewSong();
          break;
        case "Home":
          cmdReturnZero();
          break;
        default:
          if (/^[1-5]$/.test(e.key)) cmdSetSurface(SURFACES[Number(e.key) - 1].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="bench">
      <Rail onPalette={() => setPaletteOpen(true)} />
      <div className="bench-body">
        <Crates />
        <div className="main-region">
          <div className="surface-tabs" role="tablist">
            {SURFACES.map((s) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={surface === s.id}
                className={`surface-tab ${surface === s.id ? "active" : ""}`}
                onClick={() => cmdSetSurface(s.id)}
              >
                {s.name}
                <span className="key">{s.key}</span>
              </button>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, paddingRight: 8 }}>
              <button className={`grain-btn small ${follow ? "toggle-on" : ""}`} onClick={cmdToggleFollow} title="Follow playhead">
                follow
              </button>
            </div>
          </div>
          <div className="surface-host">
            {surface === "loom" && <Loom />}
            {surface === "lattice" && <Lattice />}
            {surface === "ivory" && <Ivory />}
            {surface === "desk" && <Desk />}
            {surface === "scope" && <Scope />}
          </div>
        </div>
        <Inspector />
      </div>
      <StatusBar />
      <SelfTestPanel />
      {paletteOpen && <Palette onClose={() => setPaletteOpen(false)} />}
      <CheatSheet />
      <Coach />
      <ToastStack />
      <span className="sr-only" aria-live="polite">
        {status.running ? (status.recording ? "recording" : "playing") : "stopped"} {formatClock(status.playheadTick, song)}
      </span>
      <span style={{ display: "none" }}>{dirty ? "unsaved" : "saved"}</span>
    </div>
  );
}

function Rail({ onPalette }: { onPalette: () => void }) {
  const song = useStore((s) => s.song);
  const metronome = useStore((s) => s.metronome);
  const confirmNew = useStore((s) => s.confirmNewSong); // TASK-024: guard state lives in the action
  const status = useStatus();
  const [clockFmt, setClockFmt] = useState<"bars" | "minsec">("bars");

  return (
    <div className="rail">
      <div className="logo-mark" aria-hidden />
      <div className="wordmark" style={{ fontSize: 14 }}>
        LUTHIER
      </div>

      <div className="rail-group" style={{ marginLeft: 8 }}>
        <button className="grain-btn small" onClick={() => cmdSave()} title="Ctrl+S">
          Save
        </button>
        <button className="grain-btn small" onClick={cmdLoad} title="Load saved Song">
          Load
        </button>
        <button
          className={`grain-btn small ${confirmNew ? "toggle-on" : ""}`}
          onClick={cmdNewSong}
          title="New Song — irreversible; click again within 3 s to confirm"
        >
          {confirmNew ? "Sure?" : "New"}
        </button>
      </div>

      <div className="rail-group" style={{ marginLeft: 12 }}>
        <button className="transport-btn" title="Return to zero (Enter)" onClick={cmdReturnZero} aria-label="Return to zero">
          ⏮
        </button>
        <button
          className={`transport-btn ${status.running && !status.recording ? "play-on" : ""}`}
          title="Play / Stop (Space)"
          onClick={() => void cmdPlayStop()}
          aria-label="Play or stop"
        >
          {status.running && !status.recording ? "■" : "▶"}
        </button>
        <button
          className={`transport-btn ${status.recording ? "rec-on" : ""}`}
          title="Record armed tracks (R)"
          onClick={() => void cmdRecord()}
          aria-label="Record"
        >
          ●
        </button>
        <button className={`transport-btn ${song.cycle ? "loop-on" : ""}`} title="Cycle (L)" onClick={cmdCycle} aria-label="Cycle">
          ↻
        </button>
        <button className={`transport-btn ${metronome ? "loop-on" : ""}`} title="Metronome (M)" onClick={cmdMetronome} aria-label="Metronome">
          ▲
        </button>
      </div>

      <div style={{ position: "relative", marginLeft: 8 }}>
        <button
          className="rail-clock"
          onClick={() => setClockFmt((f) => (f === "bars" ? "minsec" : "bars"))}
          title="Click to switch clock format"
        >
          {clockFmt === "bars" ? ticksToBarBeat(status.playheadTick, song.qpm) : ticksToMinSec(status.playheadTick, song.qpm)}
        </button>
      </div>

      <TempoControl qpm={song.qpm} />

      <span className="latency-badge" title="Round-trap audio latency reported by the browser (E-21)">
        {status.latencyMs} ms
      </span>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
        <button className="grain-btn small" onClick={onPalette} title="Command palette (Ctrl+K)">
          ⌘K
        </button>
        <ThemeButton />
        <button className="grain-btn small" onClick={cmdExportMix} title="Export mix (WAV)">
          Export
        </button>
      </div>
    </div>
  );
}

function ThemeButton() {
  const theme = useStore((s) => s.theme);
  return (
    <button className="grain-btn small" onClick={cmdToggleTheme} title="Theme (Dayshift/Nightshift)">
      {theme === "day" ? "Day" : "Night"}
    </button>
  );
}

function TempoControl({ qpm }: { qpm: number }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(qpm);
  useEffect(() => setVal(qpm), [qpm]);
  return (
    <div style={{ position: "relative" }}>
      <button className="rail-clock" onClick={() => setOpen((o) => !o)} title="Tempo — click to open">
        {qpm.toFixed(1)} <span style={{ color: "var(--grain-ink-40)" }}>qpm</span>
      </button>
      {open && (
        <div className="step-shadow" style={{ position: "absolute", top: 34, left: 0, zIndex: 60, padding: 10, display: "flex", gap: 6, alignItems: "center" }}>
          <input
            className="grain-field"
            style={{ width: 80 }}
            type="number"
            min={40}
            max={240}
            step={0.1}
            value={val}
            onChange={(e) => setVal(Number(e.target.value))}
            aria-label="Tempo in QPM"
          />
          <button
            className="grain-btn small primary"
            onClick={() => {
              cmdSetTempo(val);
              setOpen(false);
            }}
          >
            Set
          </button>
        </div>
      )}
    </div>
  );
}

function Crates() {
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const song = useStore((s) => s.song);
  const selectedTrack = useStore((s) => s.selectedTrack);
  const items = FACTORY_CRATE.filter(
    (i) => i.name.toLowerCase().includes(query.toLowerCase()) || i.kind.includes(query.toLowerCase())
  );

  return (
    <div className={`crates ${collapsed ? "collapsed" : ""}`}>
      <div className="crates-head">
        {collapsed ? (
          <span className="micro" style={{ writingMode: "vertical-rl" }}>
            crates
          </span>
        ) : (
          <span className="micro">crates · factory</span>
        )}
        <button className="grain-btn small" onClick={() => setCollapsed((c) => !c)} aria-label="Toggle Crates">
          {collapsed ? "»" : "«"}
        </button>
      </div>
      {!collapsed && (
        <>
          <div className="crates-body">
            <input
              className="grain-field"
              placeholder="Search crates…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search Crates"
            />
            {items.map((item) => (
              <button
                key={item.id}
                className="crate-item"
                title={`${item.desc} — click to place on the selected track`}
                onClick={() => {
                  const trackId = selectedTrack ?? song.tracks[0]?.id;
                  if (!trackId) {
                    infoToast("Add a track first.");
                    return;
                  }
                  const at = getState().song.loop?.start ?? 0;
                  cmdAddCrateClip(FACTORY_CRATE.indexOf(item), trackId, at);
                }}
              >
                <span className="swatch" style={{ background: item.kind === "device" ? "var(--grain-ember)" : item.kind === "track" ? "var(--grain-ink-40)" : "var(--grain-moss)" }} />
                <span className="meta">
                  <span className="name">{item.name}</span>
                  <span className="kind">{item.kind}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="crates-foot">
            <button className="grain-btn small" onClick={() => cmdAddTrack("audio")}>
              + Audio
            </button>
            <button className="grain-btn small" onClick={() => cmdAddTrack("midi")}>
              + Instr
            </button>
            <button className="grain-btn small" onClick={() => cmdAddTrack("bus")}>
              + Bus
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Inspector() {
  const song = useStore((s) => s.song);
  const selectedTrackId = useStore((s) => s.selectedTrack);
  const selectedPlacement = useStore((s) => s.selectedPlacement);
  const track = song.tracks.find((t) => t.id === selectedTrackId);
  const placement = song.placements.find((p) => p.id === selectedPlacement);
  const clip = placement ? song.clips.find((c) => c.id === placement.clip) : null;

  return (
    <div className="inspector">
      <div className="inspector-head">
        <span className="micro">{clip ? `clip · ${clip.name}` : track ? `track · ${track.name}` : "inspector"}</span>
      </div>
      <div className="inspector-body">
        {!track && <span className="micro">select a track in Loom or Desk</span>}
        {track && (
          <>
            <label className="micro" htmlFor="insp-name">
              name
            </label>
            <input
              id="insp-name"
              className="grain-field"
              value={track.name}
              onChange={(e) => {
                const name = e.target.value;
                import("../lib/actions").then((m) => m.cmdRenameTrack(track.id, name));
              }}
            />
            <div className="micro">kind</div>
            <div className="value" style={{ fontSize: 12 }}>
              {track.kind} · {track.instrument}
            </div>
            <div className="micro">arm</div>
            <button className={`grain-btn small ${track.arm ? "toggle-on" : ""}`} onClick={() => import("../lib/actions").then((m) => m.cmdToggleArm(track.id))}>
              {track.arm ? "armed" : "disarmed"}
            </button>
          </>
        )}
        {placement && clip && (
          <>
            <div style={{ borderTop: "1px solid var(--grain-line)", paddingTop: 8 }} />
            <div className="micro">placement · overrides (§5.3)</div>
            <div className="value" style={{ fontSize: 12 }}>
              {ticksToBarBeat(placement.start, song.qpm)}
            </div>
            <label className="micro" htmlFor="insp-tr">
              transpose (st)
            </label>
            <input
              id="insp-tr"
              className="grain-field"
              type="number"
              min={-36}
              max={36}
              value={placement.transpose}
              onChange={(e) => import("../lib/actions").then((m) => m.cmdSetPlacementTranspose(placement.id, Number(e.target.value)))}
            />
            <label className="micro" htmlFor="insp-gn">
              gain (db)
            </label>
            <input
              id="insp-gn"
              className="grain-field"
              type="number"
              min={-24}
              max={24}
              value={placement.gain}
              onChange={(e) => import("../lib/actions").then((m) => m.cmdSetPlacementGain(placement.id, Number(e.target.value)))}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button className="grain-btn small" onClick={() => import("../lib/actions").then((m) => m.cmdDuplicatePlacement(placement.id))}>
                Duplicate
              </button>
              <button className="grain-btn small" onClick={() => import("../lib/actions").then((m) => m.cmdDetachCopy(placement.id))} title="§5.4">
                Detach
              </button>
              <button className="grain-btn small" onClick={() => import("../lib/actions").then((m) => m.cmdDeletePlacement(placement.id))}>
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatusBar() {
  const song = useStore((s) => s.song);
  const status = useStatus();
  const dirty = useStore((s) => s.dirty);
  const snap = useStore((s) => s.snap);
  return (
    <div className="status-bar">
      <span className="value">{status.recording ? "● rec" : status.running ? "▶ play" : "■ stop"}</span>
      <span className="value">{ticksToBarBeat(status.playheadTick, song.qpm)}</span>
      <span className="value">{song.qpm.toFixed(1)} qpm</span>
      <span className="value">{engine.ctx ? `${(engine.ctx.sampleRate / 1000).toFixed(1)} kHz` : "— kHz"}</span>
      <span className="value" title="Underruns (P-14)">
        xruns {status.underruns}
      </span>
      <span className="value">snap {snap}</span>
      <span style={{ marginLeft: "auto" }} className="value">
        {dirty ? "unsaved — ctrl+s" : "in session"} · {song.name}
      </span>
    </div>
  );
}

/* P-14 parity-guard failure surface: red inline panel, never a modal (P-04).
   Renders only when a self-test has FAILED (or crashed) — success stays quiet
   in the UI and logs to console. */
function SelfTestPanel() {
  const st = useSelfTest();
  if (st.running || (!st.parity && !st.determinism && !st.error)) return null;
  const parityFail = st.parity !== null && !st.parity.ok;
  const detFail = st.determinism !== null && !st.determinism.ok;
  if (!parityFail && !detFail && !st.error) return null;
  return (
    <div
      role="alert"
      className="step-shadow"
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: 40,
        zIndex: 120,
        padding: "10px 14px",
        background: "var(--grain-paper)",
        border: "1.5px solid var(--grain-signal)",
        color: "var(--grain-signal)",
        fontSize: 12,
        maxWidth: 560,
      }}
    >
      <div style={{ fontWeight: 600 }}>
        LR-0006 · render-parity guard FAILED — exports do not match the live render
      </div>
      {st.parity && (
        <div>
          measured max|Δ| {st.parity.maxAbsDiff.toExponential(3)} ({st.parity.dbfs === Number.NEGATIVE_INFINITY ? "−inf" : st.parity.dbfs.toFixed(1)} dBFS) · ship gate {st.parity.gateDbfs} dBFS {
            st.parity.gateMet ? "met" : "MISSED"
          } · constitution floor {st.parity.floorDbfs} dBFS {st.parity.floorMet ? "met" : "NOT met"} · bit-identical {String(st.parity.bitIdentical)}
        </div>
      )}
      {st.parity && (
        <div className="micro" style={{ color: "var(--grain-ink-64)" }}>
          live {st.parity.liveHash.slice(0, 16)}… · offline {st.parity.offlineHash.slice(0, 16)}… · M2 target: converge to the floor (TASK-023)
        </div>
      )}
      {st.determinism && !st.determinism.ok && (
        <div>
          determinism: {st.determinism.hashA.slice(0, 12)}… vs {st.determinism.hashB.slice(0, 12)}… (same-scope, ADR-0002)
        </div>
      )}
      {st.error && <div>self-test error: {st.error}</div>}
      <div className="micro" style={{ color: "var(--grain-ink-64)" }}>
        console: app.selftest.renderparity() · app.selftest.determinism()
      </div>
    </div>
  );
}

function formatClock(tick: number, song: Song): string {
  return `${ticksToBarBeat(tick, song.qpm)} · ${ticksToMinSec(tick, song.qpm)}`;
}

function infoToast(text: string) {
  import("../ui/primitives").then((m) => m.toast(text, "ember"));
}
function toastInfo(text: string) {
  infoToast(text);
}

/* clock format helpers stay exported for tests */
export { ticksToMinSec };
