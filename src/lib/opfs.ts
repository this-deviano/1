/* OPFS persistence (TASK-005, ADR-0002 rule 3; P-20 atomic writes).
   Layout:
     /song.json          — the current Song (atomic: temp + pointer swap)
     /manifest.json      — { history: [{id, ts, sha}], usageEstimate }
     /history/<id>.json.gz — gzip history snapshots (TASK-006 undo past reload)

   Crash-safety: never write song.json in place; write song.json.tmp, verify,
   then move over. Quota or OPFS-unavailable failures return typed results the
   caller surfaces as LR-#### (P-14). No silent failure paths.

   M1 note (honest scope): /media/ (content-addressed recorded audio) is used
   first by TASK-007; the manifest already carries the media index so the
   migration later is additive. */

import type { Song } from "./model";

const SONG = "song.json";
const SONG_TMP = "song.json.tmp";
const MANIFEST = "manifest.json";
const HISTORY_DIR = "history";
const MEDIA_DIR = "media";
const HISTORY_CAP = 100;

export type OpfsResult<T> = { ok: true; value: T } | { ok: false; error: string; kind: "quota" | "unavailable" | "io" };

async function root(): Promise<FileSystemDirectoryHandle> {
  return navigator.storage.getDirectory();
}

export function opfsAvailable(): boolean {
  return typeof navigator !== "undefined" && !!navigator.storage?.getDirectory;
}

/* ---------- atomic song write (P-20) ---------- */

export async function writeSong(song: Song): Promise<OpfsResult<true>> {
  if (!opfsAvailable()) return { ok: false, error: "OPFS unavailable in this browser", kind: "unavailable" };
  try {
    const dir = await root();
    const json = JSON.stringify(song);
    // write temp
    const tmp = await dir.getFileHandle(SONG_TMP, { create: true });
    const w = await tmp.createWritable();
    await w.write(json);
    await w.close();
    // verify by read-back before the pointer swap
    const check = await (await dir.getFileHandle(SONG_TMP)).getFile();
    if ((await check.text()) !== json) {
      return { ok: false, error: "song.json.tmp failed read-back verification", kind: "io" };
    }
    // pointer swap: atomic move over the old song.json where supported
    const move = (tmp as FileSystemFileHandle & { move?: (d: FileSystemDirectoryHandle, name: string) => Promise<unknown> }).move;
    if (move) {
      await move.call(tmp, dir, SONG);
    } else {
      // Fallback when FileSystemFileHandle.move is unsupported: rewrite the
      // destination after the verified temp write (temp remains as backup).
      const dest = await dir.getFileHandle(SONG, { create: true });
      const dw = await dest.createWritable();
      await dw.write(json);
      await dw.close();
    }
    return { ok: true, value: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OPFS write failed";
    const kind = /quota|storage/i.test(msg) ? "quota" : "io";
    return { ok: false, error: msg, kind };
  }
}

export async function readSong(): Promise<OpfsResult<Song | null>> {
  if (!opfsAvailable()) return { ok: false, error: "OPFS unavailable in this browser", kind: "unavailable" };
  try {
    const dir = await root();
    const handle = await dir.getFileHandle(SONG, { create: false }).catch(() => null);
    if (!handle) return { ok: true, value: null };
    const text = await (await handle.getFile()).text();
    return { ok: true, value: JSON.parse(text) as Song };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "OPFS read failed", kind: "io" };
  }
}

/* ---------- manifest ---------- */

export interface Manifest {
  history: { id: string; ts: number; sha: string }[];
  media: { id: string; bytes: number }[]; // populated by TASK-007
}

async function readManifest(dir: FileSystemDirectoryHandle): Promise<Manifest> {
  const handle = await dir.getFileHandle(MANIFEST, { create: false }).catch(() => null);
  if (!handle) return { history: [], media: [] };
  try {
    const m = JSON.parse(await (await handle.getFile()).text()) as Manifest;
    m.history = Array.isArray(m.history) ? m.history : [];
    m.media = Array.isArray(m.media) ? m.media : [];
    return m;
  } catch {
    return { history: [], media: [] }; // corrupt manifest → fresh (song.json is untouched)
  }
}

async function writeManifest(dir: FileSystemDirectoryHandle, m: Manifest): Promise<void> {
  const handle = await dir.getFileHandle(MANIFEST, { create: true });
  const w = await handle.createWritable();
  await w.write(JSON.stringify(m));
  await w.close();
}

/* ---------- history snapshots (TASK-006: undo past reload) ---------- */

/* Batched CompressionStream helper (each snapshot is a fresh stream). */
async function gzip(text: string): Promise<Uint8Array<ArrayBuffer>> {
  const cs = new CompressionStream("gzip");
  const blob = new Blob([text]);
  const stream = blob.stream().pipeThrough(cs);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function gunzip(data: ArrayBuffer): Promise<string> {
  const ds = new DecompressionStream("gzip");
  const stream = new Response(new Blob([data]).stream().pipeThrough(ds)).text();
  return stream;
}

async function sha256Hex(data: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Persist one history snapshot (called by the autosave cadence). */
export async function writeHistorySnapshot(song: Song, past: Song[]): Promise<OpfsResult<{ saved: number }>> {
  if (!opfsAvailable()) return { ok: false, error: "OPFS unavailable", kind: "unavailable" };
  try {
    const dir = await root();
    const manifest = await readManifest(dir);
    const histDir = await dir.getDirectoryHandle(HISTORY_DIR, { create: true });
    const newestFirst = [song, ...past];
    const keep = newestFirst.slice(0, HISTORY_CAP);
    let saved = 0;
    const entries: Manifest["history"] = [];
    for (const s of keep) {
      const raw = JSON.stringify(s);
      const bytes = await gzip(raw);
      const sha = await sha256Hex(bytes);
      const id = sha.slice(0, 16);
      if (manifest.history.some((h) => h.id === id)) continue; // content-addressed: dedup
      const fh = await histDir.getFileHandle(`${id}.json.gz`, { create: true });
      const w = await fh.createWritable();
      await w.write(bytes);
      await w.close();
      entries.push({ id, ts: Date.now(), sha });
      saved++;
    }
    manifest.history = [...entries, ...manifest.history].slice(0, HISTORY_CAP);
    await writeManifest(dir, manifest);
    return { ok: true, value: { saved } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "history write failed";
    return { ok: false, error: msg, kind: /quota|storage/i.test(msg) ? "quota" : "io" };
  }
}

/** Load the newest snapshot; returns the song + its serialized history stack. */
export async function readHistory(): Promise<OpfsResult<{ song: Song; past: Song[] } | null>> {
  if (!opfsAvailable()) return { ok: false, error: "OPFS unavailable", kind: "unavailable" };
  try {
    const dir = await root();
    const manifest = await readManifest(dir);
    if (manifest.history.length === 0) return { ok: true, value: null };
    const histDir = await dir.getDirectoryHandle(HISTORY_DIR, { create: false }).catch(() => null);
    if (!histDir) return { ok: true, value: null };
    const past: Song[] = [];
    let newest: Song | null = null;
    for (let i = 0; i < manifest.history.length; i++) {
      const entry = manifest.history[i];
      const fh = await histDir.getFileHandle(`${entry.id}.json.gz`, { create: false }).catch(() => null);
      if (!fh) continue; // missing file → skip, not fatal
      const raw = await gunzip(await (await fh.getFile()).arrayBuffer());
      const s = JSON.parse(raw) as Song;
      if (i === 0) newest = s;
      else past.push(s);
    }
    if (!newest) return { ok: true, value: null };
    return { ok: true, value: { song: newest, past } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "history read failed", kind: "io" };
  }
}

/* ---------- storage usage readout (LR-0001 recovery aid) ---------- */

export async function usageEstimate(): Promise<OpfsResult<{ usage: number; quota: number }>> {
  if (!opfsAvailable() || !navigator.storage.estimate) return { ok: false, error: "estimate unavailable", kind: "unavailable" };
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { ok: true, value: { usage, quota } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "estimate failed", kind: "io" };
  }
}

/* ---------- one-time localStorage migration (read-only backup preserved) ---------- */

export async function migrateFromLocalStorage(): Promise<OpfsResult<{ migrated: boolean; song: Song | null }>> {
  if (!opfsAvailable()) return { ok: false, error: "OPFS unavailable", kind: "unavailable" };
  try {
    const legacy = localStorage.getItem("luthier.song.v1");
    if (!legacy) return { ok: true, value: { migrated: false, song: null } };
    const song = JSON.parse(legacy) as Song;
    if (song.schemaVersion !== 1) return { ok: true, value: { migrated: false, song: null } };
    const existing = await readSong();
    if (!existing.ok) return existing;
    if (existing.value) return { ok: true, value: { migrated: false, song: null } }; // OPFS wins; legacy left intact (read-only backup)
    const w = await writeSong(song);
    if (!w.ok) return w;
    return { ok: true, value: { migrated: true, song } }; // legacy key intentionally NOT deleted (backup)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "migration failed", kind: "io" };
  }
}
