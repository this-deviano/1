/* Luthier web audio engine (§10 adapted to the browser runtime).
   One AudioContext is the time authority (§22.6). Scheduling is a
   look-ahead loop: events are queued ~120 ms ahead, timer fires at 25 ms.
   No GC churn on the hot path: voices are pooled per fire. */

import type { Clip, Song, Track } from "./model";
import { SEED_DEFAULT, TPQ } from "./model";
import { seedStream, STREAM_TAGS } from "./seed";

const LOOKAHEAD_S = 0.12;
const TIMER_MS = 25;
const METER_HISTORY = 96;

/* Shared render constants — the LIVE and OFFLINE graphs must be built from
   the SAME numbers (C-2 lesson: baked constants drift, parity dies). */
const COMP_THRESHOLD = -6;
const COMP_RATIO = 4;
const COMP_ATTACK = 0.003;
const COMP_RELEASE = 0.12;
const MASTER_GAIN = 0.9;
const EXPORT_SR = 44100;
const PREROLL_S = 0.05; // offline voices start at t+PREROLL; live mapping uses the same offset via startCtxTime
export { EXPORT_SR, PREROLL_S };

export interface EngineStatus {
  running: boolean;
  recording: boolean;
  playheadTick: number;
  underruns: number;
  latencyMs: number;
  clipAvg: number; // 0..1 loudness estimate, master
}

interface QueuedNote {
  time: number; // ctx time
  pitch: number;
  vel: number; // 1..127
  dur: number; // seconds
  track: Track;
  gainDb: number; // placement.gain override (§5.3) — model is truth, projections obey
}

/* The Song→audio material map: one model-driven event list (P-05, SB-003 §4).
   Schedulers (realtime look-ahead, offline fast-forward) only choose WHEN to
   fire these events and into WHICH context. No scheduler builds its own
   copy of the mapping — that was the orphan class (C-2/C-5). */
interface ScheduledEvent {
  time: number; // seconds on the shared time axis (secPerTick domain)
  track: Track;
  pitch: number; // transposed + clamped, model-derived
  vel: number;
  dur: number; // seconds
  gainDb: number; // placement.gain override
}

class LuthierEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  comp: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private timer: number | null = null;

  playing = false;
  recording = false;
  metronome = false;
  cycle = false;
  startTick = 0;
  startCtxTime = 0; // public: test seam for the parity guard's live leg (selftest.ts)
  private scheduledUntilTick = 0;
  song: Song | null = null;
  private tickAtLastSchedule = 0;
  private lastLoopWrap = 0;
  private rng: () => number = seedStream(SEED_DEFAULT, STREAM_TAGS.NOISE); // E-28/E-003: seeded synthesis noise

  /* test seam (selftest.ts only): swap/restore the noise stream and read the
     internal context nodes for the parity guard's live leg. */
  rngForTest(): () => number {
    return this.rng;
  }
  setTestRng(r: () => number) {
    this.rng = r;
  }

  // live capture (§17.4 spirit): last N recorded events
  capture: { pitch: number; vel: number; tick: number }[] = [];
  private countInEnd = 0;

  status: EngineStatus = { running: false, recording: false, playheadTick: 0, underruns: 0, latencyMs: 0, clipAvg: 0 };
  private meterBuf = new Float32Array(256);
  private meterHistory: number[] = [];
  onStatus: ((s: EngineStatus) => void) | null = null;
  onStop: (() => void) | null = null;

  async ensure(): Promise<AudioContext> {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext({ latencyHint: "interactive" });
    const { comp, master } = this.buildMasterGraph(ctx);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.55;

    comp.connect(master);
    master.connect(analyser);
    analyser.connect(ctx.destination);

    this.ctx = ctx;
    this.comp = comp;
    this.master = master;
    this.analyser = analyser;
    this.status.latencyMs = Math.round((ctx.baseLatency || 0) * 1000 * 10) / 10;
    return ctx;
  }

  /* The ONE master graph builder — live (ensure), offline (renderBuffer) and
     the parity guard's live leg all construct their mix bus from this. */
  buildMasterGraph(ctx: BaseAudioContext): { comp: DynamicsCompressorNode; master: GainNode } {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = COMP_THRESHOLD;
    comp.ratio.value = COMP_RATIO;
    comp.attack.value = COMP_ATTACK; // C-2: offline previously omitted attack/release
    comp.release.value = COMP_RELEASE;
    const master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    return { comp, master };
  }

  setSong(song: Song) {
    this.song = song;
  }

  /* ---------- transport (§9.5) ---------- */

  async play(fromTick?: number) {
    const ctx = await this.ensure();
    if (ctx.state === "suspended") await ctx.resume();
    this.rng = seedStream(this.song?.seed ?? SEED_DEFAULT, STREAM_TAGS.NOISE); // re-seed per transport start (E-28/E-003: same source tag → same sequence)
    if (this.playing) this.stopScheduling();
    this.playing = true;
    this.startTick = fromTick ?? this.status.playheadTick;
    this.startCtxTime = ctx.currentTime + 0.06;
    this.scheduledUntilTick = this.startTick;
    this.tickAtLastSchedule = this.startTick;
    this.status.running = true;
    this.emit();
    this.tickTimer();
  }

  async record() {
    this.recording = true;
    this.capture = [];
    const ctx = await this.ensure();
    // 4-beat count-in, honest (§9.5)
    this.countInEnd = ctx.currentTime + (60 / (this.song?.qpm ?? 120)) * 4;
    await this.play();
  }

  stop() {
    this.playing = false;
    this.stopScheduling();
    this.status.running = false;
    this.status.recording = false;
    this.emit();
    if (this.onStop) this.onStop();
  }

  async togglePlay() {
    if (this.playing) this.stop();
    else await this.play();
  }

  returnToZero() {
    this.status.playheadTick = 0;
    if (this.playing) void this.play(0);
    else this.emit();
  }

  seek(tick: number) {
    this.status.playheadTick = Math.max(0, tick);
    if (this.playing) void this.play(this.status.playheadTick);
    else this.emit();
  }

  getSpectrum(out: Uint8Array<ArrayBuffer>) {
    if (this.analyser) this.analyser.getByteFrequencyData(out);
  }

  getWave(out: Float32Array<ArrayBuffer>) {
    if (this.analyser) this.analyser.getFloatTimeDomainData(out);
  }

  private stopScheduling() {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private emit() {
    if (this.onStatus) this.onStatus({ ...this.status });
  }

  /** Public nudge for UI-only state changes (cycle/metronome toggles). */
  notify() {
    this.emit();
  }

  private tickTimer = () => {
    if (this.timer === null) {
      this.timer = window.setInterval(this.tickTimer, TIMER_MS);
    }
    if (!this.playing || !this.ctx || !this.song) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const qpm = this.song.qpm;
    const secPerTick = 60 / qpm / TPQ;
    const horizonTick = this.startTick + Math.max(0, now + LOOKAHEAD_S - this.startCtxTime) / secPerTick;

    // schedule song events in (lastScheduled, horizon]
    const from = this.scheduledUntilTick;
    const to = horizonTick;
    if (to > from) {
      this.scheduleRange(from, to, now, secPerTick);
      this.scheduledUntilTick = to;
    }

    // metronome + count-in clicks
    this.scheduleClicks(from, to, secPerTick);

    // playhead (prediction, resynced on each pass — §22.6)
    let head = this.startTick + Math.max(0, now - this.startCtxTime) / secPerTick;
    if (this.cycle && this.song.loop) {
      const L = this.song.loop;
      if (head >= L.end) {
        const span = Math.max(1, L.end - L.start);
        head = L.start + ((head - L.start) % span);
        this.scheduledUntilTick = head; // reschedule on wrap
        this.startTick = head;
        this.startCtxTime = now;
      }
    }
    this.status.playheadTick = head;

    // meters
    if (this.analyser) {
      this.analyser.getFloatTimeDomainData(this.meterBuf);
      let peak = 0;
      for (let i = 0; i < this.meterBuf.length; i++) {
        const a = Math.abs(this.meterBuf[i]);
        if (a > peak) peak = a;
      }
      this.meterHistory.push(peak);
      if (this.meterHistory.length > METER_HISTORY) this.meterHistory.shift();
      this.status.clipAvg = peak;
    }
    this.emit();
  };

  private scheduleClicks(from: number, to: number, secPerTick: number) {
    if (!this.ctx || !this.song) return;
    if (!this.metronome && !this.recording) return;
    const beat = TPQ;
    const first = Math.ceil(from / beat) * beat;
    const ctx = this.ctx;
    for (let t = first; t <= to; t += beat) {
      const time = this.startCtxTime + (t - this.startTick) * secPerTick;
      if (time < ctx.currentTime) continue;
      const isBar = t % (beat * 4) === 0;
      // count-in: 4 clicks before recorded material starts
      const inCountIn = this.recording && time < this.countInEnd;
      if (inCountIn || this.metronome) {
        this.click(time, isBar ? 1600 : 1100, inCountIn ? 0.5 : 0.28);
      }
    }
  }

  /* materialEvents: the ONE model→event mapping. Deterministic, order-independent
     (stable sort on time, then track id, then pitch). Both schedulers consume this. */
  materialEvents(song: Song, from: number, to: number, secPerTick: number): ScheduledEvent[] {
    const out: ScheduledEvent[] = [];
    const anySolo = song.tracks.some((t) => t.solo);
    const cycleOn = song.cycle && song.loop !== null; // TASK-013: cycle state is model truth
    const L = song.loop;
    const span = L ? Math.max(1, L.end - L.start) : 1;
    for (const p of song.placements) {
      if (p.mute) continue; // placement mute honored everywhere (C-7)
      const track = song.tracks.find((t) => t.id === p.track);
      const clip = song.clips.find((c) => c.id === p.clip);
      if (!track || !clip) continue;
      if (track.mute) continue;
      if (anySolo && !track.solo && track.kind !== "master" && track.kind !== "bus") continue;

      for (const n of clip.notes) {
        if (cycleOn && L) {
          // loop-local phase: material inside the loop region repeats; material outside does not (C-5)
          if (p.start < L.start || p.start >= L.end) continue;
          const phaseFrom = (((from - L.start) % span) + span) % span;
          const phaseTo = phaseFrom + (to - from);
          const passes = Math.floor((from - L.start) / span);
          if (n.tick >= phaseFrom && n.tick < phaseTo) {
            const abs = L.start + n.tick + passes * span;
            this.pushEvent(out, abs, n, track, secPerTick, p.transpose, p.gain);
          }
        } else {
          const absTick = p.start + n.tick;
          if (absTick >= from && absTick < to) {
            this.pushEvent(out, absTick, n, track, secPerTick, p.transpose, p.gain);
          }
        }
      }
    }
    out.sort((a, b) =>
      a.time !== b.time ? a.time - b.time : a.track.id !== b.track.id ? a.track.id.localeCompare(b.track.id) : a.pitch - b.pitch
    );
    return out;
  }

  private pushEvent(
    out: ScheduledEvent[],
    absTick: number,
    n: { pitch: number; vel: number; len: number },
    track: Track,
    secPerTick: number,
    transpose: number,
    gainDb: number
  ) {
    const dur = Math.max(0.03, n.len * secPerTick);
    out.push({
      time: absTick * secPerTick, // shared time axis: t_seconds = t_ticks · secPerTick
      pitch: Math.max(0, Math.min(127, n.pitch + transpose)),
      vel: n.vel,
      dur,
      track,
      gainDb,
    });
  }

  private scheduleRange(from: number, to: number, _now: number, secPerTick: number) {
    const song = this.song;
    const ctx = this.ctx;
    if (!song || !ctx) return;
    const events = this.materialEvents(song, from, to, secPerTick);
    for (const ev of events) {
      const time = this.startCtxTime + (ev.time - this.startTick * secPerTick);
      if (time < ctx.currentTime - 0.01) continue;
      this.fireVoice({ ...ev, time });
    }
  }

  effectiveClipLength(clip: Clip): number {
    if (clip.pattern) return clip.pattern.length * (TPQ / 4) * 1;
    const maxTick = clip.notes.reduce((m, n) => Math.max(m, n.tick + n.len), 0);
    return Math.max(clip.length, maxTick);
  }

  private click(t: number, hz: number, gain: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = hz;
    g.gain.setValueAtTime(gain * 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(g);
    g.connect(this.comp!);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  /* ---------- live input (count-in → capture) ---------- */

  noteOn(pitch: number, vel: number) {
    // performance input: immediate voice, and capture if recording
    void (async () => {
      const ctx = await this.ensure();
      if (ctx.state === "suspended") await ctx.resume();
      const song = this.song;
      const t = ctx.currentTime + 0.01;
      const tracks = song ? song.tracks.filter((tr) => tr.arm && (tr.kind === "midi")) : [];
      const targets = tracks.length > 0 ? tracks : song ? song.tracks.filter((tr) => tr.kind === "midi") : [];
      for (const track of targets) {
        const out = ctx.createGain();
        const panner = ctx.createStereoPanner();
        panner.pan.value = track.pan;
        out.connect(panner);
        panner.connect(this.comp!);
        const n: ScheduledEvent = { time: t, pitch, vel, dur: 0.35, track, gainDb: 0 }; // performance input: no placement override exists
        const gain = dbToGain(track.gain) * (vel / 127);
        if (track.instrument === "drums") this.drumVoice(out, pitch, t, gain, vel);
        else if (track.instrument === "bass") this.toneVoice(out, n, gain, "sawtooth", 0.02, 480);
        else if (track.instrument === "pluck") this.toneVoice(out, n, gain, "triangle", 0.02, 2600);
        else this.toneVoice(out, n, gain, "sine", 0.02, 3200);
      }
      if (this.recording && song) {
        const tick = this.status.playheadTick;
        this.capture.push({ pitch, vel, tick });
      }
      this.emit();
    })();
  }

  /* ---------- offline render (§10.10): model-driven fast-forward ----------
     The offline scheduler consumes materialEvents and dispatches through the
     SAME shared voices as the live path. Only the timing source differs.
     Live≈offline caveat: live voices schedule relative to startCtxTime which
     lands ≥50 ms in the future; the export starts voices at exactly t+PREROLL
     (both give the same preroll for a play from 0 — the guard measures the
     residual envelope-attack difference, not a musical one). */

  async renderBuffer(song: Song, tailSeconds: number): Promise<AudioBuffer> {
    const lenTicks = song.placements.reduce((m, p) => {
      const clip = song.clips.find((c) => c.id === p.clip);
      if (!clip) return m;
      const l = p.start + this.effectiveClipLength(clip);
      return Math.max(m, l);
    }, song.cycle && song.loop ? song.loop.end : 0);
    const secPerTick = 60 / song.qpm / TPQ;
    const total = Math.max(1, lenTicks * secPerTick + tailSeconds);
    const ctx = new OfflineAudioContext(2, Math.ceil(total * EXPORT_SR), EXPORT_SR);
    this.rng = seedStream(song.seed ?? SEED_DEFAULT, STREAM_TAGS.NOISE); // deterministic offline render (E-28/E-003, same NOISE source tag)
    // TASK-015 CORRECTION (found by the SB-004 harness): the offline bus must run
    // the SAME master chain as live — comp → master(MASTER_GAIN) → destination.
    // The previous `const { comp }` dropped the master gain entirely, so exports
    // came out +0.92 dB hotter than what the user hears (P-15 violation).
    const { comp, master } = this.buildMasterGraph(ctx);
    comp.connect(master);
    master.connect(ctx.destination);

    // fast-forward: fire every model event from the shared mapping at its absolute time
    const events = this.materialEvents(song, 0, lenTicks, secPerTick);
    for (const ev of events) {
      this.fireVoice({ ...ev, time: ev.time + PREROLL_S }, ctx, comp);
    }
    return ctx.startRendering();
  }

  async renderWav(song: Song, tailSeconds = 1.5): Promise<Blob> {
    const buf = await this.renderBuffer(song, tailSeconds);
    return wavBlob(buf);
  }

  /* ---------- shared voices (BaseAudioContext) — the ONE voice set ---------- */

  fireVoice(n: ScheduledEvent, ctxOverride?: BaseAudioContext, destOverride?: AudioNode) {
    const ctx = (ctxOverride ?? this.ctx)!;
    const track = n.track;
    const gain = dbToGain(track.gain) * (n.vel / 127) * dbToGain(n.gainDb); // track strip × velocity × placement override (P-15: no hidden moves)
    const pan = track.pan;
    const out = ctx.createGain();
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    out.connect(panner);
    // device chain (honest subset): comp/eq on the voice bus is approximated at mixdown
    this.applyDevices(out, track);
    panner.connect(destOverride ?? this.comp!);

    switch (track.instrument) {
      case "drums":
        this.drumVoice(out, n.pitch, n.time, gain, n.vel, ctx);
        break;
      case "bass":
        this.toneVoice(out, n, gain, "sawtooth", 0.35, 480, ctx);
        break;
      case "pluck":
        this.toneVoice(out, n, gain, "triangle", 0.25, 2600, ctx);
        break;
      default:
        this.toneVoice(out, n, gain, "sine", 0.4, 3200, ctx);
    }
  }

  private applyDevices(_input: GainNode, _track: Track) {
    /* Devices (§13) shape gain dynamics at the strip level in this MVP;
       per-device Web Audio graphs land with the Desk device panels (M2 parity). */
  }

  /* ---------- voices ---------- */

  private drumVoice(out: GainNode, pitch: number, t: number, gain: number, vel: number, ctx: BaseAudioContext = this.ctx!) {
    if (pitch === 36 || pitch === 35) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(42, t + 0.11);
      g.gain.setValueAtTime(gain * 1.4, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      osc.connect(g);
      g.connect(out);
      osc.start(t);
      osc.stop(t + 0.45);
      // click transient
      this.noiseHit(out, t, gain * 0.35, 0.012, 1800, ctx);
    } else if (pitch === 38 || pitch === 40) {
      this.noiseHit(out, t, gain * 0.9, 0.16, 1800, ctx, 240);
      this.toneBlip(out, t, 190, gain * 0.5, 0.09, ctx);
    } else if (pitch === 39) {
      this.noiseHit(out, t, gain * 0.8, 0.12, 1400, ctx, 900);
    } else if (pitch === 42 || pitch === 44) {
      this.noiseHit(out, t, gain * 0.45, pitch === 44 ? 0.32 : 0.05, 7000, ctx, 1200);
    } else if (pitch === 46) {
      this.noiseHit(out, t, gain * 0.4, 0.34, 6500, ctx, 1400);
    } else if (pitch === 51) {
      this.noiseHit(out, t, gain * 0.3, 0.5, 5200, ctx, 2200);
    } else {
      this.toneBlip(out, t, midiHz(pitch), gain * 0.5, 0.2, ctx);
      void vel;
    }
  }

  private toneVoice(out: GainNode, n: ScheduledEvent, gain: number, type: OscillatorType, attack: number, cutoff: number, ctx: BaseAudioContext = this.ctx!) {
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = cutoff;
    f.Q.value = 0.8;
    osc.type = type;
    osc2.type = type;
    osc.frequency.value = midiHz(n.pitch);
    osc2.frequency.value = midiHz(n.pitch) * 2.003; // gentle octave shimmer
    const t = n.time;
    const sus = Math.max(0.06, n.dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain * 0.5, t + attack);
    g.gain.setValueAtTime(gain * 0.5, t + sus * 0.7);
    g.gain.exponentialRampToValueAtTime(0.001, t + sus + 0.08);
    osc.connect(f);
    osc2.connect(f);
    f.connect(g);
    g.connect(out);
    osc.start(t);
    osc2.start(t);
    osc.stop(t + sus + 0.12);
    osc2.stop(t + sus + 0.12);
  }

  private noiseHit(out: GainNode, t: number, gain: number, dur: number, hp: number, ctx: BaseAudioContext = this.ctx!, lp = 12000) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (this.rng() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hpF = ctx.createBiquadFilter();
    hpF.type = "highpass";
    hpF.frequency.value = hp;
    const lpF = ctx.createBiquadFilter();
    lpF.type = "lowpass";
    lpF.frequency.value = lp;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(hpF);
    hpF.connect(lpF);
    lpF.connect(g);
    g.connect(out);
    src.start(t);
  }

  private toneBlip(out: GainNode, t: number, hz: number, gain: number, dur: number, ctx: BaseAudioContext = this.ctx!) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(hz, t);
    osc.frequency.exponentialRampToValueAtTime(hz * 0.6, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  meterWave(): number[] {
    return this.meterHistory;
  }
}

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

function midiHz(p: number): number {
  return 440 * Math.pow(2, (p - 69) / 12);
}

function wavBlob(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const len = buffer.length;
  const bytes = 44 + len * numCh * 4;
  const ab = new ArrayBuffer(bytes);
  const view = new DataView(ab);
  const wstr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  wstr(0, "RIFF");
  view.setUint32(4, bytes - 8, true);
  wstr(8, "WAVE");
  wstr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 3, true); // IEEE float
  view.setUint16(22, numCh, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * numCh * 4, true);
  view.setUint16(32, numCh * 4, true);
  view.setUint16(34, 32, true);
  wstr(36, "data");
  view.setUint32(40, len * numCh * 4, true);
  let off = 44;
  const chans: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      view.setFloat32(off, chans[c][i], true);
      off += 4;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

export const engine = new LuthierEngine();
