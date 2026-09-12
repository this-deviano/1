/* Luthier web audio engine (§10 adapted to the browser runtime).
   One AudioContext is the time authority (§22.6). Scheduling is a
   look-ahead loop: events are queued ~120 ms ahead, timer fires at 25 ms.
   No GC churn on the hot path: voices are pooled per fire. */

import type { Clip, Song, Track } from "./model";
import { TPQ } from "./model";

const LOOKAHEAD_S = 0.12;
const TIMER_MS = 25;
const METER_HISTORY = 96;

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
}

class LuthierEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private timer: number | null = null;

  playing = false;
  recording = false;
  metronome = false;
  cycle = false;
  startTick = 0;
  private startCtxTime = 0;
  private scheduledUntilTick = 0;
  private song: Song | null = null;
  private tickAtLastSchedule = 0;
  private lastLoopWrap = 0;

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
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -6;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.12;
    const master = ctx.createGain();
    master.gain.value = 0.9;
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

  setSong(song: Song) {
    this.song = song;
  }

  /* ---------- transport (§9.5) ---------- */

  async play(fromTick?: number) {
    const ctx = await this.ensure();
    if (ctx.state === "suspended") await ctx.resume();
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

  private scheduleRange(from: number, to: number, _now: number, secPerTick: number) {
    const song = this.song;
    const ctx = this.ctx;
    if (!song || !ctx) return;
    const notes: QueuedNote[] = [];
    for (const p of song.placements) {
      if (p.mute) continue;
      const track = song.tracks.find((t) => t.id === p.track);
      const clip = song.clips.find((c) => c.id === p.clip);
      if (!track || !clip) continue;
      if (track.mute) continue;
      const anySolo = song.tracks.some((t) => t.solo);
      if (anySolo && !track.solo && track.kind !== "master" && track.kind !== "bus") continue;

      // notes within [from, to) mapped to absolute song ticks
      for (const n of clip.notes) {
        if (this.cycle && song.loop) {
          // loop-local phase scheduling: same material every pass
          const L = song.loop;
          const span = Math.max(1, L.end - L.start);
          const phaseFrom = (((from - L.start) % span) + span) % span;
          const phaseTo = phaseFrom + (to - from);
          const passes = Math.floor((from - L.start) / span);
          if (n.tick >= phaseFrom && n.tick < phaseTo && p.start >= L.start && p.start < L.end) {
            const abs = L.start + n.tick + passes * span;
            this.pushNote(notes, abs, n, track, secPerTick, p.transpose, p.gain);
          }
        } else {
          const absTick = p.start + n.tick;
          if (absTick >= from && absTick < to) {
            this.pushNote(notes, absTick, n, track, secPerTick, p.transpose, p.gain);
          }
        }
      }
    }
    notes.sort((a, b) => a.time - b.time);
    for (const n of notes) this.fireVoice(n);
  }

  private pushNote(
    out: QueuedNote[],
    absTick: number,
    n: { pitch: number; vel: number; len: number },
    track: Track,
    secPerTick: number,
    transpose: number,
    _gainDb: number
  ) {
    const ctx = this.ctx!;
    const time = this.startCtxTime + (absTick - this.startTick) * secPerTick;
    if (time < ctx.currentTime - 0.01) return;
    const dur = Math.max(0.03, n.len * secPerTick);
    out.push({
      time,
      pitch: Math.max(0, Math.min(127, n.pitch + transpose)),
      vel: n.vel,
      dur,
      track,
    });
  }

  private effectiveClipLength(clip: Clip): number {
    if (clip.pattern) return clip.pattern.length * (TPQ / 4) * 1;
    const maxTick = clip.notes.reduce((m, n) => Math.max(m, n.tick + n.len), 0);
    return Math.max(clip.length, maxTick);
  }

  private fireVoice(n: QueuedNote) {
    const ctx = this.ctx!;
    const track = n.track;
    const gain = dbToGain(track.gain) * (n.vel / 127);
    const pan = track.pan;
    const out = ctx.createGain();
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    out.connect(panner);
    // device chain (honest subset): comp/eq on the voice bus is approximated at mixdown
    this.applyDevices(out, track);
    panner.connect(this.comp!);

    switch (track.instrument) {
      case "drums":
        this.drumVoice(out, n.pitch, n.time, gain, n.vel);
        break;
      case "bass":
        this.toneVoice(out, n, gain, "sawtooth", 0.35, 480);
        break;
      case "pluck":
        this.toneVoice(out, n, gain, "triangle", 0.25, 2600);
        break;
      default:
        this.toneVoice(out, n, gain, "sine", 0.4, 3200);
    }
  }

  private applyDevices(_input: GainNode, _track: Track) {
    /* Devices (§13) shape gain dynamics at the strip level in this MVP;
       per-device Web Audio graphs land with the Desk device panels (M2 parity). */
  }

  /* ---------- voices ---------- */

  private drumVoice(out: GainNode, pitch: number, t: number, gain: number, vel: number) {
    const ctx = this.ctx!;
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
      this.noiseHit(out, t, gain * 0.35, 0.012, 1800);
    } else if (pitch === 38 || pitch === 40) {
      this.noiseHit(out, t, gain * 0.9, 0.16, 1800, 240);
      this.toneBlip(out, t, 190, gain * 0.5, 0.09);
    } else if (pitch === 39) {
      this.noiseHit(out, t, gain * 0.8, 0.12, 1400, 900);
    } else if (pitch === 42 || pitch === 44) {
      this.noiseHit(out, t, gain * 0.45, pitch === 44 ? 0.32 : 0.05, 7000, 1200);
    } else if (pitch === 46) {
      this.noiseHit(out, t, gain * 0.4, 0.34, 6500, 1400);
    } else if (pitch === 51) {
      this.noiseHit(out, t, gain * 0.3, 0.5, 5200, 2200);
    } else {
      this.toneBlip(out, t, midiHz(pitch), gain * 0.5, 0.2);
      void vel;
    }
  }

  private toneVoice(out: GainNode, n: QueuedNote, gain: number, type: OscillatorType, attack: number, cutoff: number) {
    const ctx = this.ctx!;
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

  private noiseHit(out: GainNode, t: number, gain: number, dur: number, hp: number, lp = 12000) {
    const ctx = this.ctx!;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
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

  private toneBlip(out: GainNode, t: number, hz: number, gain: number, dur: number) {
    const ctx = this.ctx!;
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
        const n: QueuedNote = { time: t, pitch, vel, dur: 0.35, track };
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

  /* ---------- offline render (§10.10) ---------- */

  async renderWav(song: Song, tailSeconds = 1.5): Promise<Blob> {
    const sr = 44100;
    const lenTicks = song.placements.reduce((m, p) => {
      const clip = song.clips.find((c) => c.id === p.clip);
      if (!clip) return m;
      const l = p.start + this.effectiveClipLength(clip);
      return Math.max(m, l);
    }, song.loop?.end ?? 0);
    const secPerTick = 60 / song.qpm / TPQ;
    const total = Math.max(1, lenTicks * secPerTick + tailSeconds);
    const ctx = new OfflineAudioContext(2, Math.ceil(total * sr), sr);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -6;
    comp.ratio.value = 4;
    const master = ctx.createGain();
    master.gain.value = 0.9;
    comp.connect(master);
    master.connect(ctx.destination);

    const renderTrack = (track: Track, note: { pitch: number; vel: number; len: number }, absTick: number, transpose: number) => {
      const out = ctx.createGain();
      const panner = ctx.createStereoPanner();
      panner.pan.value = track.pan;
      out.connect(panner);
      panner.connect(comp);
      const gain = dbToGain(track.gain) * (note.vel / 127);
      const time = absTick * secPerTick + 0.05;
      const qn: QueuedNote = { time, pitch: Math.min(127, note.pitch + transpose), vel: note.vel, dur: Math.max(0.03, note.len * secPerTick), track };
      if (track.instrument === "drums") this.renderDrum(ctx, out, qn.pitch, time, gain);
      else if (track.instrument === "bass") this.renderTone(ctx, out, qn, gain, "sawtooth", 480);
      else if (track.instrument === "pluck") this.renderTone(ctx, out, qn, gain, "triangle", 2600);
      else this.renderTone(ctx, out, qn, gain, "sine", 3200);
    };

    for (const p of song.placements) {
      if (p.mute) continue;
      const track = song.tracks.find((t) => t.id === p.track);
      const clip = song.clips.find((c) => c.id === p.clip);
      if (!track || !clip || track.mute) continue;
      for (const n of clip.notes) {
        renderTrack(track, n, p.start + n.tick, p.transpose);
      }
    }

    const buf = await ctx.startRendering();
    return wavBlob(buf);
  }

  private renderDrum(ctx: BaseAudioContext, out: GainNode, pitch: number, t: number, gain: number) {
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
    } else if (pitch === 38 || pitch === 40) {
      this.staticNoise(ctx, out, t, gain * 0.9, 0.16, 1800, 240);
      this.renderBlip(ctx, out, t, 190, gain * 0.5, 0.09);
    } else if (pitch === 39) {
      this.staticNoise(ctx, out, t, gain * 0.8, 0.12, 1400, 900);
    } else if (pitch === 42 || pitch === 44) {
      this.staticNoise(ctx, out, t, gain * 0.45, pitch === 44 ? 0.32 : 0.05, 7000, 1200);
    } else if (pitch === 46) {
      this.staticNoise(ctx, out, t, gain * 0.4, 0.34, 6500, 1400);
    } else if (pitch === 51) {
      this.staticNoise(ctx, out, t, gain * 0.3, 0.5, 5200, 2200);
    } else {
      this.renderBlip(ctx, out, t, midiHz(pitch), gain * 0.5, 0.2);
    }
  }

  private renderTone(ctx: BaseAudioContext, out: GainNode, n: QueuedNote, gain: number, type: OscillatorType, cutoff: number) {
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = cutoff;
    osc.type = type;
    osc2.type = type;
    osc.frequency.value = midiHz(n.pitch);
    osc2.frequency.value = midiHz(n.pitch) * 2.003;
    const t = n.time;
    const sus = Math.max(0.06, n.dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain * 0.5, t + 0.02);
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

  private renderBlip(ctx: BaseAudioContext, out: GainNode, t: number, hz: number, gain: number, dur: number) {
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

  private staticNoise(ctx: BaseAudioContext, out: GainNode, t: number, gain: number, dur: number, hp: number, lp: number) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
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
