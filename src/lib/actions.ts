/* Commands and actions (§9 grammar). One layer both the keymap and the
   palette call — P-11: every command reachable by pointer, key, palette. */

import type { Clip, Note, Placement, Song, Track } from "./model";
import { BAR, STEP_TICKS, TPQ, uid } from "./model";
import {
  allPlacements,
  createClip,
  createTrack,
  getState,
  hydrateSession,
  mutate,
  restoreSong,
  setState,
  undo as storeUndo,
  redo as storeRedo,
} from "./store";
import type { ClipPlacement } from "./store";
import { engine, wavBlob, wavBlobScaled, samplePeakOf, scaleFactorToTarget, EXPORT_TARGET_DBFS } from "./engine";
import type { PeakPolicy } from "./engine";
import { saveSong, loadSong, clearSong, crateClip, FACTORY_CRATE } from "./factory";
import { cmdToggleCycle, cmdToggleMetronome, normalizeLegacySong } from "./store";
import {
  writeSong,
  readSong,
  readHistory,
  writeHistorySnapshot,
  migrateFromLocalStorage,
  usageEstimate,
  opfsAvailable,
  writeMedia,
  sha256Hex,
} from "./opfs";
import { micCapture, pcmWavFloat32 } from "./mic";
import { toast } from "../ui/primitives";

/* ---------- transport ---------- */

export async function cmdPlayStop() {
  await engine.togglePlay();
}

/* Record pass (TASK-007 extends TASK-002). An armed AUDIO track turns on
   microphone capture; an armed MIDI track keeps the existing performance
   capture. Both can run in the same pass. Stopping lands the takes (cmdFinishTake). */
export async function cmdRecord() {
  if (engine.recording) {
    engine.stop();
    return;
  }
  const st = getState();
  const armedAudio = st.song.tracks.filter((t) => t.arm && t.kind === "audio");
  const armedMidi = st.song.tracks.filter((t) => t.arm && t.kind === "midi");
  if (armedAudio.length === 0 && armedMidi.length === 0) {
    toast("Arm a track first — click the circle on its header.", "signal");
    return;
  }

  if (armedAudio.length > 0) {
    const opened = await micCapture.open();
    if (!opened.ok) {
      setState({ micError: opened.error ?? "LR-0007: microphone unavailable.", micArmed: false });
      if (armedMidi.length === 0) return; // nothing else to capture — the panel carries the retry
      toast("Recording MIDI only — microphone unavailable (LR-0007).", "signal");
    } else {
      const ctx = await engine.ensure();
      const attached = await micCapture.attach(ctx);
      if (!attached.ok) {
        setState({ micError: attached.error ?? "LR-0007: capture graph failed.", micArmed: false });
      } else {
        micCapture.reset();
        micCapture.monitor(getState().monitor);
        setState({ micError: null, micArmed: true });
      }
    }
  }

  await engine.record();
  const parts = [armedMidi.length ? `${armedMidi.length} MIDI` : "", armedAudio.length ? `${armedAudio.length} audio` : ""]
    .filter(Boolean)
    .join(" + ");
  toast(`Recording ${parts} — 4-beat count-in, then play. Space stops.`, "ok");
}

/* Input monitoring is opt-in and warns about feedback on enable (TASK-007). */
export function cmdToggleMonitor(): void {
  const next = !getState().monitor;
  setState({ monitor: next });
  micCapture.monitor(next);
  toast(
    next ? "Input monitoring ON — use headphones; speakers will feed back." : "Input monitoring OFF.",
    next ? "signal" : "ember"
  );
}

/** Clear an LR-0007/0008 panel (retry is a fresh cmdRecord). */
export function cmdDismissMicError(): void {
  setState({ micError: null });
}

export function cmdReturnZero() {
  engine.returnToZero();
}

export function cmdCycle() {
  cmdToggleCycle(); // TASK-013 ruling: cycle is Song truth — model field first, engine follows
}

export function cmdMetronome() {
  cmdToggleMetronome(); // TASK-013 ruling: metronome is a persisted preference, not Song material
}

export function cmdSetTempo(qpm: number) {
  const q = Math.max(40, Math.min(240, Math.round(qpm * 10) / 10));
  mutate((s) => {
    s.qpm = q;
  });
}

/* ---------- surface & navigation ---------- */

export function cmdSetSurface(surface: string) {
  setState({ surface });
}

export function cycleSurface(dir: 1 | -1) {
  const order: string[] = ["loom", "lattice", "ivory", "desk", "scope"];
  const cur = order.indexOf(getState().surface);
  const next = order[(cur + dir + order.length) % order.length];
  setState({ surface: next });
}

export function cmdSetSnap() {
  const order: Array<"off" | "grid" | "adaptive"> = ["off", "grid", "adaptive"];
  const cur = order.indexOf(getState().snap);
  setState({ snap: order[(cur + 1) % order.length] });
}

export function cmdToggleTheme() {
  const t = getState().theme === "day" ? "night" : "day";
  setState({ theme: t });
  document.documentElement.setAttribute("data-theme", t);
}

export function cmdToggleFollow() {
  setState({ follow: !getState().follow });
}

/* ---------- tracks ---------- */

export function cmdAddTrack(kind: Track["kind"]) {
  const st = getState();
  const n = st.song.tracks.filter((t) => t.kind === kind).length + 1;
  const name = kind === "audio" ? `Audio ${n}` : kind === "midi" ? `Instrument ${n}` : kind === "bus" ? `Bus ${n}` : "Master";
  const instrument = kind === "midi" ? "poly" : "poly";
  const t = createTrack(kind, name, st.song.tracks.length % 16 === 0 ? "#4E6E7E" : nextColor(st.song), instrument);
  mutate((s) => {
    s.tracks.push(t);
  });
  setState({ selectedTrack: t.id });
  toast(`Added ${name}.`, "ok");
}

function nextColor(song: Song): string {
  const palette = ["#4E6E7E", "#5C6B4A", "#C1551F", "#8A6B48", "#A84E32", "#5E7258"];
  return palette[song.tracks.length % palette.length];
}

export function cmdToggleArm(trackId: string) {
  mutate((s) => {
    const t = s.tracks.find((x) => x.id === trackId);
    if (t) t.arm = !t.arm;
  });
}

export function cmdToggleMute(trackId: string) {
  mutate((s) => {
    const t = s.tracks.find((x) => x.id === trackId);
    if (t) t.mute = !t.mute;
  });
}

export function cmdToggleSolo(trackId: string) {
  mutate((s) => {
    const t = s.tracks.find((x) => x.id === trackId);
    if (t) t.solo = !t.solo;
  });
}

export function cmdRenameTrack(trackId: string, name: string) {
  mutate((s) => {
    const t = s.tracks.find((x) => x.id === trackId);
    if (t) t.name = name;
  });
}

export function cmdDeleteTrack(trackId: string) {
  const st = getState();
  if (st.song.tracks.length <= 1) {
    toast("The Song keeps at least one track.", "signal");
    return;
  }
  mutate((s) => {
    s.tracks = s.tracks.filter((t) => t.id !== trackId);
    const gone = s.placements.filter((p) => p.track === trackId).map((p) => p.id);
    s.placements = s.placements.filter((p) => p.track !== trackId);
    // orphaned clips stay in the library (nothing is lost — P-06)
    void gone;
  });
  if (getState().selectedTrack === trackId) setState({ selectedTrack: null });
}

export function cmdSetTrackGain(trackId: string, db: number) {
  mutate((s) => {
    const t = s.tracks.find((x) => x.id === trackId);
    if (t) t.gain = db;
  });
}

export function cmdSetTrackPan(trackId: string, pan: number) {
  mutate((s) => {
    const t = s.tracks.find((x) => x.id === trackId);
    if (t) t.pan = pan;
  });
}

export function cmdAddDevice(trackId: string, deviceId: string) {
  mutate((s) => {
    const t = s.tracks.find((x) => x.id === trackId);
    if (!t) return;
    if (t.units.some((u) => u.type === deviceId)) {
      toast("That unit is already on this track.", "signal");
      return;
    }
    t.units.push({ type: deviceId, params: defaultParams(deviceId), enabled: true });
  });
  toast("Unit added to inserts.", "ok");
}

function defaultParams(deviceId: string): Record<string, number> {
  // mirrors DEVICES defaults without importing (avoid cycles)
  const table: Record<string, Record<string, number>> = {
    "l-equal": { lowGain: 0, lowFreq: 120, midGain: 0, midFreq: 1000, highGain: 0, highFreq: 8000 },
    "l-comp": { threshold: -18, ratio: 4, attack: 10, release: 200, makeup: 0 },
    "l-delay": { time: 4, feedback: 30, mix: 25 },
    "l-tape": { drive: 20, mix: 100 },
    "l-util": { gain: 0 },
  };
  return { ...(table[deviceId] ?? {}) };
}

export function cmdSetParam(trackId: string, unitType: string, param: string, value: number) {
  mutate((s) => {
    const t = s.tracks.find((x) => x.id === trackId);
    const u = t?.units.find((x) => x.type === unitType);
    if (u) u.params[param] = value;
  });
}

export function cmdToggleUnit(trackId: string, unitType: string) {
  mutate((s) => {
    const t = s.tracks.find((x) => x.id === trackId);
    const u = t?.units.find((x) => x.type === unitType);
    if (u) u.enabled = !u.enabled;
  });
}

export function cmdRemoveUnit(trackId: string, unitType: string) {
  mutate((s) => {
    const t = s.tracks.find((x) => x.id === trackId);
    if (t) t.units = t.units.filter((u) => u.type !== unitType);
  });
}

/* ---------- clips & placements (§5) ---------- */

export function cmdAddCrateClip(itemIndex: number, trackId: string, startTick: number) {
  const st = getState();
  const item = FACTORY_CRATE[itemIndex];
  if (!item) return;
  const track = st.song.tracks.find((t) => t.id === trackId) ?? st.song.tracks[0];
  if (item.kind === "device") {
    cmdAddDevice(track.id, item.payload ?? "l-util");
    return;
  }
  if (item.kind === "track") {
    cmdAddTrack((item.payload as Track["kind"]) ?? "midi");
    return;
  }
  const clip = crateClip(item, track.color);
  if (!clip) return;
  // avoid stacking on an existing placement: nudge to the next free slot (P-03)
  const clipLenTicks = clip.pattern ? clip.pattern.length * STEP_TICKS : BAR;
  let start = snapToStep(startTick);
  const occupied = st.song.placements
    .filter((p) => p.track === track.id)
    .map((p) => [p.start, p.start + clipLength(st.song, p.clip)] as const);
  let guard = 0;
  while (occupied.some(([a, b]) => start < b && start + clipLenTicks > a) && guard < 64) {
    start += clipLenTicks;
    guard += 1;
  }
  mutate((s) => {
    s.clips.push(clip);
    s.placements.push({ id: uid("plc"), clip: clip.id, track: track.id, start, gain: 0, transpose: 0, mute: false });
  });
  toast(`Placed ${item.name}.`, "ok");
}

export function cmdNewClip(trackId: string, startTick: number, kind: Clip["kind"] = "midi") {
  const st = getState();
  const track = st.song.tracks.find((t) => t.id === trackId);
  if (!track) return;
  const clip = createClip(kind, `${track.name} ${st.song.clips.length + 1}`, track.color);
  const start = snapToStep(startTick);
  mutate((s) => {
    s.clips.push(clip);
    s.placements.push({ id: uid("plc"), clip: clip.id, track: track.id, start, gain: 0, transpose: 0, mute: false });
  });
  setState({ selectedPlacement: st.song.placements[st.song.placements.length - 1]?.id ?? null });
  if (kind === "midi") setState({ surface: "ivory" });
  return clip.id;
}

export function cmdDeletePlacement(placementId: string) {
  mutate((s) => {
    s.placements = s.placements.filter((p) => p.id !== placementId);
  });
  if (getState().selectedPlacement === placementId) setState({ selectedPlacement: null });
}

export function cmdMovePlacement(placementId: string, newStart: number, newTrack?: string) {
  mutate((s) => {
    const p = s.placements.find((x) => x.id === placementId);
    if (p) {
      p.start = Math.max(0, snapToStep(newStart));
      if (newTrack) p.track = newTrack;
    }
  });
}

export function cmdDuplicatePlacement(placementId: string) {
  const st = getState();
  const p = st.song.placements.find((x) => x.id === placementId);
  if (!p) return;
  const clipLen = clipLength(st.song, p.clip);
  const copy: Placement = { ...p, id: uid("plc"), start: p.start + clipLen };
  mutate((s) => {
    s.placements.push(copy);
  });
  setState({ selectedPlacement: copy.id });
}

export function cmdDetachCopy(placementId: string) {
  // §5.4 Detach as Copy: break the ref, deep-copy material
  const st = getState();
  const p = st.song.placements.find((x) => x.id === placementId);
  if (!p) return;
  const src = st.song.clips.find((c) => c.id === p.clip);
  if (!src) return;
  const copy: Clip = structuredClone(src);
  copy.id = uid("clp");
  copy.name = `${src.name} (copy)`;
  mutate((s) => {
    s.clips.push(copy);
    const pl = s.placements.find((x) => x.id === placementId);
    if (pl) pl.clip = copy.id;
  });
  toast("Detached. This placement no longer follows its source.", "ember");
}

export function cmdSetPlacementGain(placementId: string, db: number) {
  mutate((s) => {
    const p = s.placements.find((x) => x.id === placementId);
    if (p) p.gain = Math.max(-24, Math.min(24, db));
  });
}

export function cmdSetPlacementTranspose(placementId: string, st: number) {
  mutate((s) => {
    const p = s.placements.find((x) => x.id === placementId);
    if (p) p.transpose = Math.max(-36, Math.min(36, st));
  });
}

export function cmdTogglePlacementMute(placementId: string) {
  mutate((s) => {
    const p = s.placements.find((x) => x.id === placementId);
    if (p) p.mute = !p.mute;
  });
}

function clipLength(song: Song, clipId: string): number {
  const c = song.clips.find((x) => x.id === clipId);
  if (!c) return BAR;
  if (c.pattern) return c.pattern.length * STEP_TICKS;
  return Math.max(BAR, c.notes.reduce((m, n) => Math.max(m, n.tick + n.len), 0));
}
export { clipLength };

export function snapToStep(tick: number): number {
  return Math.max(0, Math.round(tick / STEP_TICKS) * STEP_TICKS);
}

/* ---------- notes (Ivory) ---------- */

export function cmdAddNote(clipId: string, tick: number, pitch: number, vel = 100, len = STEP_TICKS) {
  mutate((s) => {
    const c = s.clips.find((x) => x.id === clipId);
    if (!c) return;
    c.notes.push({ id: uid("n"), tick: Math.max(0, tick), len, pitch: Math.max(0, Math.min(127, pitch)), vel });
    if (c.pattern) {
      // pattern material mirrors into the lattice grid
      const row = c.pattern.rows.find((r) => r.pitch === pitch);
      if (row) {
        const idx = Math.round(tick / STEP_TICKS);
        if (idx >= 0 && idx < row.steps.length) row.steps[idx] = { on: true, vel };
      }
    }
  });
}

export function cmdDeleteNote(clipId: string, noteId: string) {
  mutate((s) => {
    const c = s.clips.find((x) => x.id === clipId);
    if (c) c.notes = c.notes.filter((n) => n.id !== noteId);
  });
}

export function cmdMoveNote(clipId: string, noteId: string, tick: number, pitch: number) {
  mutate((s) => {
    const c = s.clips.find((x) => x.id === clipId);
    const n = c?.notes.find((x) => x.id === noteId);
    if (n) {
      n.tick = Math.max(0, tick);
      n.pitch = Math.max(0, Math.min(127, pitch));
    }
  });
}

export function cmdResizeNote(clipId: string, noteId: string, len: number) {
  mutate((s) => {
    const c = s.clips.find((x) => x.id === clipId);
    const n = c?.notes.find((x) => x.id === noteId);
    if (n) n.len = Math.max(20, len);
  });
}

export function cmdSetNoteVel(clipId: string, noteId: string, vel: number) {
  mutate((s) => {
    const c = s.clips.find((x) => x.id === clipId);
    const n = c?.notes.find((x) => x.id === noteId);
    if (n) n.vel = Math.max(1, Math.min(127, vel));
  });
}

export function cmdTransposeNotes(clipId: string, semis: number) {
  mutate((s) => {
    const c = s.clips.find((x) => x.id === clipId);
    if (!c) return;
    for (const n of c.notes) n.pitch = Math.max(0, Math.min(127, n.pitch + semis));
    if (c.pattern) {
      for (const r of c.pattern.rows) r.pitch = Math.max(0, Math.min(127, r.pitch + semis));
    }
  });
}

/* ---------- steps (Lattice) ---------- */

export function cmdToggleStep(clipId: string, rowPitch: number, stepIdx: number) {
  mutate((s) => {
    const c = s.clips.find((x) => x.id === clipId);
    if (!c) return;
    ensurePattern(c, 16);
    const row = c.pattern!.rows.find((r) => r.pitch === rowPitch);
    if (!row) return;
    const was = row.steps[stepIdx]?.on ?? false;
    row.steps[stepIdx] = { on: !was, vel: was ? row.steps[stepIdx].vel : 100 };
    // unify with notes material (§5: one truth)
    const tick = stepIdx * STEP_TICKS;
    const existing = c.notes.find((n) => n.pitch === rowPitch && Math.abs(n.tick - tick) < STEP_TICKS / 2);
    if (was) {
      if (existing) c.notes = c.notes.filter((n) => n.id !== existing.id);
    } else {
      if (!existing) c.notes.push({ id: uid("n"), tick, len: STEP_TICKS, pitch: rowPitch, vel: row.steps[stepIdx].vel });
    }
  });
}

export function cmdSetStepVel(clipId: string, rowPitch: number, stepIdx: number, vel: number) {
  mutate((s) => {
    const c = s.clips.find((x) => x.id === clipId);
    if (!c?.pattern) return;
    const row = c.pattern.rows.find((r) => r.pitch === rowPitch);
    if (row && row.steps[stepIdx]) row.steps[stepIdx].vel = Math.max(1, Math.min(127, vel));
    const tick = stepIdx * STEP_TICKS;
    const n = c.notes.find((x) => x.pitch === rowPitch && Math.abs(x.tick - tick) < STEP_TICKS / 2);
    if (n) n.vel = Math.max(1, Math.min(127, vel));
  });
}

function ensurePattern(c: Clip, length: number) {
  if (!c.pattern || c.pattern.rows.length === 0) {
    // derive rows from existing note pitches (drum-map friendly)
    const pitches = [...new Set(c.notes.map((n) => n.pitch))].sort((a, b) => a - b);
    const src = pitches.length > 0 ? pitches : [36, 38, 42];
    c.pattern = {
      length,
      rows: src.map((p) => ({
        pitch: p,
        mute: false,
        steps: Array.from({ length }, (_, i) => ({
          on: c.notes.some((n) => n.pitch === p && Math.abs(n.tick - i * STEP_TICKS) < STEP_TICKS / 2),
          vel: c.notes.find((n) => n.pitch === p && Math.abs(n.tick - i * STEP_TICKS) < STEP_TICKS / 2)?.vel ?? 100,
        })),
      })),
    };
  }
  if (c.pattern.length !== length) {
    for (const r of c.pattern.rows) {
      while (r.steps.length < length) r.steps.push({ on: false, vel: 100 });
      r.steps.length = length;
    }
    c.pattern.length = length;
  }
}
export { ensurePattern };

/* ---------- pattern length (§8.3) ---------- */

export function cmdSetPatternLength(clipId: string, steps: number) {
  const st = getState();
  const placements = st.song.placements.filter((p) => {
    const c = st.song.clips.find((x) => x.id === p.clip);
    return c?.id === clipId;
  });
  mutate((s) => {
    const c = s.clips.find((x) => x.id === clipId);
    if (!c) return;
    ensurePattern(c, steps);
  });
  if (placements.length > 8) {
    toast(`Pattern length changed — ${placements.length} placements follow (one Clip, many placements).`, "ember");
  }
}

/* ---------- song (TASK-005: OPFS-first, localStorage mirror/fallback) ---------- */

async function persistSong(song: Song): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await writeSong(song);
  if (res.ok) {
    // best-effort localStorage mirror stays as a crash net (legacy readers keep working)
    saveSong(song);
    return { ok: true };
  }
  if (res.kind === "unavailable") {
    // OPFS missing (older browser): legacy localStorage path is the store
    const legacy = saveSong(song);
    return legacy.ok ? { ok: true } : { ok: false, error: legacy.error ?? "storage write failed" };
  }
  return { ok: false, error: res.error };
}

export async function cmdSave(quiet = false) {
  const st = getState();
  const res = await persistSong(st.song);
  if (res.ok) {
    setState({ dirty: false });
    if (!quiet) toast("Song saved.", "ok");
  } else {
    const usage = await usageEstimate();
    const readout = usage.ok ? ` · ${(usage.value.usage / 1024).toFixed(0)} KB used of ${(usage.value.quota / 1048576).toFixed(0)} MB` : "";
    toast(`LR-0001: save failed — ${res.error}${readout}`, "signal");
  }
}

/** Autosave companion (TASK-006): gzip history snapshots, capped at 100. */
export async function cmdPersistHistory() {
  const st = getState();
  const res = await writeHistorySnapshot(st.song, st.past);
  if (!res.ok && res.kind !== "unavailable") {
    console.warn(`[luthier] history snapshot failed: ${res.error}`); // P-14: visible in console; song.json remains the durable copy
  }
}

export async function cmdLoad() {
  const fromOpfs = await readSong();
  const loaded = fromOpfs.ok && fromOpfs.value ? fromOpfs.value : fromOpfs.ok ? loadSong() : null;
  if (loaded) {
    const song = normalizeLegacySong(loaded);
    // R-1(c): Load is a restore — it PUSHES an undoable entry (the pre-load
    // Song stays reachable under Ctrl+Z). It never clears history.
    restoreSong(song);
    setState({ selectedPlacement: null, selectedTrack: song.tracks[0]?.id ?? null, dirty: false });
    engine.setSong(song);
    engine.cycle = song.cycle; // loaded Song carries the cycle field (TASK-013 ruling)
    toast("Song loaded — undo returns to your work.", "ok");
  } else {
    toast(fromOpfs.ok ? "No saved Song found." : `Load failed: ${fromOpfs.error}`, "signal");
  }
}

/** Boot-time session restore (TASK-006): OPFS song → history stack → legacy. */
export async function cmdRestoreSession(): Promise<void> {
  const migration = await migrateFromLocalStorage();
  if (migration.ok && migration.value.song) {
    const song = normalizeLegacySong(migration.value.song);
    hydrateSession(song, []);
    engine.setSong(song);
    engine.cycle = song.cycle;
    syncEngineFromModel();
    return;
  }
  const fromOpfs = await readSong();
  if (fromOpfs.ok && fromOpfs.value) {
    const song = normalizeLegacySong(fromOpfs.value);
    hydrateSession(song, []);
    engine.setSong(song);
    engine.cycle = song.cycle;
    syncEngineFromModel();
    return;
  }
  const hist = await readHistory();
  if (hist.ok && hist.value) {
    const song = normalizeLegacySong(hist.value.song);
    const past = hist.value.past.map(normalizeLegacySong);
    // undo survives reload (P-06) and the snapshot stack is APPENDED, never
    // substituted for, whatever is already on the in-session stack (R-1(c)).
    hydrateSession(song, past);
    engine.setSong(song);
    engine.cycle = song.cycle;
    syncEngineFromModel();
  }
}

/* Time Machine restore (R-1(b)/(c)): restore snapshot N and PUSH the
   pre-restore Song onto the undo stack — restore is a new history entry, never
   destructive. index 0 is the newest snapshot (readHistory order). */
export async function cmdRestoreSnapshot(index: number): Promise<{ ok: boolean; error?: string; snapshotCount: number }> {
  const hist = await readHistory();
  if (!hist.ok) return { ok: false, error: hist.error, snapshotCount: 0 };
  if (!hist.value) return { ok: false, error: "No history snapshots stored.", snapshotCount: 0 };
  const list = [hist.value.song, ...hist.value.past];
  const target = list[index];
  if (!target) return { ok: false, error: `Snapshot ${index} out of range (0..${list.length - 1}).`, snapshotCount: list.length };
  const song = normalizeLegacySong(target);
  restoreSong(song); // pushes the current Song onto the stack (R-1(c))
  engine.setSong(song);
  engine.cycle = song.cycle;
  toast(`Restored snapshot ${index + 1} of ${list.length} — undo returns to your work.`, "ember");
  return { ok: true, snapshotCount: list.length };
}

/* TASK-024 confirm audit: the app has exactly ONE destructive guard. New Song
   is IRREVERSIBLE — it deletes song.json, the manifest and the §11.6 history —
   so it keeps a two-step guard. The guard lives in the ACTION, not on a button,
   so no path (Rail, palette, console) can bypass it. Every reversible action
   carries no confirm at all: P-06 undo is the confirmation (no "are you sure"
   for reversible operations). */
const NEW_SONG_WINDOW_MS = 3000;
let pendingNewSongAt = 0;

export function cmdNewSong(): void {
  const now = Date.now();
  if (pendingNewSongAt !== 0 && now - pendingNewSongAt <= NEW_SONG_WINDOW_MS) {
    pendingNewSongAt = 0;
    setState({ confirmNewSong: false });
    performNewSong();
    return;
  }
  pendingNewSongAt = now;
  setState({ confirmNewSong: true });
  toast("New Song is irreversible — it clears the saved Song, manifest and history. Confirm within 3 s.", "signal");
  window.setTimeout(() => {
    if (pendingNewSongAt === now) {
      pendingNewSongAt = 0;
      setState({ confirmNewSong: false });
    }
  }, NEW_SONG_WINDOW_MS);
}

/** Disarm the New Song guard (Esc, or an explicit cancel affordance). */
export function cmdCancelNewSong(): void {
  pendingNewSongAt = 0;
  setState({ confirmNewSong: false });
}

function performNewSong() {
  // FND-05 (SB-007-E): drop the dirty flag BEFORE the wipe. The Bench's P-20
  // beforeunload flush re-writes the legacy mirror whenever dirty, so the
  // reload below would resurrect the very Song New Song is destroying — the
  // next boot would migrate it back via migrateFromLocalStorage.
  setState({ dirty: false });
  clearSong();
  if (opfsAvailable()) {
    void (async () => {
      const dir = await navigator.storage.getDirectory();
      for (const name of ["song.json", "song.json.tmp", "manifest.json"] as const) {
        await dir.removeEntry(name).catch(() => undefined);
      }
      await dir.removeEntry("history", { recursive: true }).catch(() => undefined);
      await dir.removeEntry("media", { recursive: true }).catch(() => undefined);
    })();
  }
  window.location.reload();
}

/* R-9 (TASK-051) — the export flow with the peak guard.
   The mix is rendered ONCE. If its SAMPLE peak exceeds 0 dBFS, nothing is
   delivered and nothing is silently fixed: an inline, non-modal choice panel
   asks Export as-is / Scale to −1.0 dB / Scale to −0.3 dB (Esc cancels). The
   rendered buffer waits in module scope — it is megabytes and must not live in
   React state (P-04: no modal; P-15: no hidden gain move; P-07: the number the
   panel prints is the sample peak, measured, not a true-peak estimate). */
let pendingExport: { buffer: AudioBuffer; name: string; samplePeak: number } | null = null;

function deliverWav(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^a-z0-9-_ ]/gi, "") || "song"}.wav`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export async function cmdExportMix() {
  const st = getState();
  toast("Rendering mix…", "ember");
  try {
    const buffer = await engine.renderBuffer(st.song, 1.5);
    const samplePeak = samplePeakOf(buffer);
    if (samplePeak > 1.0) {
      pendingExport = { buffer, name: st.song.name, samplePeak };
      setState({ exportPrompt: { samplePeak, peakDbfs: 20 * Math.log10(samplePeak) } });
      toast("Export sample peak is over 0 dBFS — choose how to deliver it.", "signal");
      return;
    }
    deliverWav(wavBlob(buffer), st.song.name);
    toast("Mix exported (WAV, 32-bit float).", "ok");
  } catch (e) {
    toast(`Render failed: ${e instanceof Error ? e.message : "unknown"}`, "signal");
  }
}

/** Deliver the pending hot export: as-is, or scaled to a target sample peak (R-9). */
export function cmdExportChoice(policy: PeakPolicy, targetDbfs: number = EXPORT_TARGET_DBFS) {
  if (!pendingExport) return;
  const { buffer, name, samplePeak } = pendingExport;
  pendingExport = null;
  setState({ exportPrompt: null });
  if (policy === "normalize") {
    const factor = scaleFactorToTarget(samplePeak, targetDbfs);
    deliverWav(wavBlobScaled(buffer, factor), name);
    toast(`Mix exported — sample peak scaled to ${targetDbfs.toFixed(1)} dB (was +${(20 * Math.log10(samplePeak)).toFixed(2)} dB).`, "ok");
  } else {
    deliverWav(wavBlob(buffer), name);
    toast("Mix exported as-is — sample peak is over 0 dBFS. It will clip on an integer DAC.", "ember");
  }
}

/** Esc / Dismiss on the export choice panel — nothing is delivered. */
export function cmdCancelExport() {
  pendingExport = null;
  setState({ exportPrompt: null });
}

export function cmdAddMarker() {
  const tick = Math.round(getStatusTick() / BAR) * BAR;
  mutate((s) => {
    s.markers.push({ id: uid("mrk"), tick, name: `Marker ${s.markers.length + 1}` });
  });
  toast("Marker added at playhead.", "ok");
}

export function cmdSetLoopToStart4() {
  mutate((s) => {
    s.loop = { start: 0, end: 4 * BAR };
  });
}

/* ---------- capture: recorded performance → clip (§17.4, P-02) ---------- */

export function cmdFlushTake() {
  const cap = engine.capture;
  if (cap.length === 0) return;
  engine.capture = [];
  const st = getState();
  const track = st.song.tracks.find((t) => t.arm && t.kind === "midi") ?? st.song.tracks.find((t) => t.kind === "midi");
  if (!track) return;
  const first = cap.reduce((m, c) => Math.min(m, c.tick), Infinity);
  const start = snapToStep(Math.max(0, first - STEP_TICKS));
  const notes: Note[] = cap.map((c) => ({
    id: uid("n"),
    tick: Math.max(0, c.tick - start),
    len: STEP_TICKS,
    pitch: c.pitch,
    vel: c.vel,
  }));
  const endTick = notes.reduce((m, n) => Math.max(m, n.tick + n.len), 0);
  const takeNo = st.song.clips.filter((c) => c.name.startsWith("Take")).length + 1;
  const clip: Clip = {
    id: uid("clp"),
    kind: "midi",
    name: `Take ${takeNo}`,
    length: snapToStep(endTick + STEP_TICKS),
    color: track.color,
    notes,
    pattern: null,
  };
  mutate((s) => {
    s.clips.push(clip);
    s.placements.push({ id: uid("plc"), clip: clip.id, track: track.id, start, gain: 0, transpose: 0, mute: false });
  });
  toast(`Take captured — ${notes.length} note${notes.length === 1 ? "" : "s"} on ${track.name}.`, "ok");
}

/* Stop → take for the AUDIO path (TASK-007): the captured samples become a
   content-addressed WAV in OPFS media/, and a clip on the armed audio track
   points at it. Failures surface as LR-0007/LR-0008 and the device is always
   released — the tab's recording indicator must never stay lit (P-14). */
export async function cmdFinishTake(): Promise<void> {
  cmdFlushTake(); // MIDI performance capture (unchanged path)
  const took = micCapture.take();
  const wasArmed = getState().micArmed;
  micCapture.close();
  if (!wasArmed && took.samples.length === 0) return;
  setState({ micArmed: false, monitor: false });
  if (took.samples.length === 0) return;

  const st = getState();
  const track = st.song.tracks.find((t) => t.arm && t.kind === "audio") ?? st.song.tracks.find((t) => t.kind === "audio");
  if (!track) {
    setState({ micError: "LR-0007: the recorded take had no audio track to land on." });
    return;
  }

  // Capture starts at arm time, so the take opens with the 4-beat count-in. The
  // count-in is a transport aid, not song material (audit row B-5), so it is
  // trimmed from the front and the honest duration/peak are recomputed (P-07).
  const countInS = (60 / Math.max(1, st.song.qpm)) * 4;
  const trim = Math.round(countInS * micCapture.sampleRate);
  const samples = trim > 0 && trim < took.samples.length ? took.samples.subarray(trim) : took.samples;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  const durationS = samples.length / micCapture.sampleRate;
  const bytes = pcmWavFloat32(samples, micCapture.sampleRate);
  const sha = await sha256Hex(bytes);
  const written = await writeMedia(bytes, sha);
  if (!written.ok) {
    const id = written.kind === "quota" ? "LR-0008" : "LR-0007";
    setState({ micError: `${id}: recorded audio could not be stored — ${written.error}` });
    return;
  }

  // ticks are derived from the model's tempo, so the clip length is musical truth
  const ticks = Math.max(STEP_TICKS, Math.round(durationS * (st.song.qpm / 60) * TPQ));
  const takeNo = st.song.clips.filter((c) => c.kind === "audio").length + 1;
  const clip: Clip = {
    id: uid("clp"),
    kind: "audio",
    name: `Audio Take ${takeNo}`,
    length: ticks,
    color: track.color,
    notes: [],
    pattern: null,
    media: { sha, bytes: written.value.bytes, durationS, sampleRate: micCapture.sampleRate, channels: 1 },
  };
  const start = snapToStep(engine.startTick);
  mutate((s) => {
    s.clips.push(clip);
    s.placements.push({ id: uid("plc"), clip: clip.id, track: track.id, start, gain: 0, transpose: 0, mute: false });
  });
  setState({
    micError: null,
    lastTake: { sha, bytes: written.value.bytes, durationS, peak },
  });
  toast(
    `Audio take captured — ${durationS.toFixed(2)} s (count-in trimmed), peak ${peak.toFixed(3)} → media/${sha.slice(0, 12)}….`,
    "ok"
  );
}

/* ---------- undo / redo (P-06) ---------- */

export function cmdUndo() {
  if (storeUndo()) toast("Undo.", "ember");
}

export function cmdRedo() {
  if (storeRedo()) toast("Redo.", "ember");
}

/* ---------- helpers ---------- */

import { getStatus } from "./status";
function getStatusTick(): number {
  return getStatus().playheadTick;
}

import { syncEngineFromModel } from "./store";

export function selectedPlacementDetail(): { placement: ClipPlacement; track: Track; song: Song } | null {
  const st = getState();
  const p = st.song.placements.find((x) => x.id === st.selectedPlacement);
  const t = p ? st.song.tracks.find((x) => x.id === p.track) : null;
  if (!p || !t) return null;
  const clip = st.song.clips.find((c) => c.id === p.clip);
  if (!clip) return null;
  return { placement: { ...p, clipObj: clip }, track: t, song: st.song };
}

export function placementsOfSelectedTrack(): ClipPlacement[] {
  const st = getState();
  if (!st.selectedTrack) return [];
  return allPlacements(st.song).filter((p) => p.track === st.selectedTrack);
}

export type { Note, Placement };
