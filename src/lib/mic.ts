/* Microphone capture (TASK-007, M1 slice).
   - getUserMedia with the pro defaults the constitution asks for: echo
     cancellation, noise suppression and AGC all OFF. A DAW must record what the
     microphone heard, not what the browser's voice-call filter decided (P-05).
   - An AudioWorklet ring buffer collects the samples off the audio thread, so
     the capture path never allocates inside `process()` and a long take cannot
     grow without bound (the ring keeps the newest RING_SECONDS).
   - Failures are typed and returned, never swallowed (P-14): the caller renders
     LR-0007 inline with a retry affordance.
   Monitoring is a SEPARATE, DEFAULT-OFF concern: the source never reaches the
   destination unless the user turns it on, and turning it on warns about
   headphones. */

const WORKLET_NAME = "luthier-capture";
const RING_SECONDS = 60; // ring ceiling: longer takes evict the oldest material

/* The processor is inlined as a Blob module so the harness and the app share
   one source of truth without a second build step. */
const WORKLET_SRC = `
class LuthierCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(4096);
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) this.buf[this.n++] = ch[i];
    if (this.n >= this.buf.length) {
      this.port.postMessage(this.buf.slice(0));
      this.n = 0;
    }
    return true;
  }
}
registerProcessor("${WORKLET_NAME}", LuthierCapture);
`;

export interface MicResult {
  ok: boolean;
  error?: string;
}

export interface MicTake {
  samples: Float32Array; // mono, newest material last
  peak: number; // absolute peak actually observed (P-07 honest numbers)
  durationS: number;
}

export class MicCapture {
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private ctx: AudioContext | null = null;
  private monitorGain: GainNode | null = null;
  private chunks: Float32Array[] = [];
  private samplesHeld = 0;
  private peak = 0;
  sampleRate = 48000;
  /** True once open() has a live MediaStream (the recording indicator is on). */
  get live(): boolean {
    return this.stream !== null;
  }

  /** Permission + device acquisition. Denial is an LR-0007 outcome, not a throw. */
  async open(): Promise<MicResult> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return { ok: false, error: "LR-0007: getUserMedia is unavailable (a secure context is required)." };
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      return { ok: true };
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "Error";
      const detail = e instanceof Error ? e.message : String(e);
      const hint =
        name === "NotAllowedError"
          ? " Permission was denied — allow microphone access for this origin and retry."
          : name === "NotFoundError"
            ? " No input device was found."
            : "";
      return { ok: false, error: `LR-0007: microphone unavailable (${name}).${hint} ${detail}`.trim() };
    }
  }

  /** Wire the ring buffer into the engine's AudioContext (one graph, no extra context). */
  async attach(ctx: AudioContext): Promise<MicResult> {
    if (!this.stream) return { ok: false, error: "LR-0007: no microphone stream — open() first." };
    if (!ctx.audioWorklet) return { ok: false, error: "LR-0007: AudioWorklet is unavailable in this context." };
    try {
      const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: "application/javascript" }));
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      this.ctx = ctx;
      this.sampleRate = ctx.sampleRate;
      this.source = ctx.createMediaStreamSource(this.stream);
      // default 1-in/1-out shape; the output is simply left unconnected (a pure tap)
      this.node = new AudioWorkletNode(ctx, WORKLET_NAME);
      this.node.port.onmessage = (ev: MessageEvent) => this.push(ev.data as Float32Array);
      // Capture tap only. The source is NOT connected to destination here —
      // monitoring is opt-in via monitor() (TASK-007: default OFF).
      this.source.connect(this.node);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `LR-0007: capture graph failed (${e instanceof Error ? e.message : String(e)}).` };
    }
  }

  /** Ring buffer push: keep the newest RING_SECONDS of material. */
  private push(chunk: Float32Array) {
    if (!chunk || chunk.length === 0) return;
    this.chunks.push(chunk);
    this.samplesHeld += chunk.length;
    for (let i = 0; i < chunk.length; i++) {
      const a = Math.abs(chunk[i]);
      if (a > this.peak) this.peak = a;
    }
    const max = Math.floor(RING_SECONDS * this.sampleRate);
    while (this.samplesHeld > max && this.chunks.length > 1) {
      const dropped = this.chunks.shift();
      this.samplesHeld -= dropped ? dropped.length : 0;
    }
  }

  /** Start a fresh take (called at the top of a record pass). */
  reset() {
    this.chunks = [];
    this.samplesHeld = 0;
    this.peak = 0;
  }

  take(): MicTake {
    const out = new Float32Array(this.samplesHeld);
    let off = 0;
    for (const c of this.chunks) {
      out.set(c, off);
      off += c.length;
    }
    return { samples: out, peak: this.peak, durationS: this.samplesHeld / this.sampleRate };
  }

  /** Input monitoring — DEFAULT OFF (headphone warning is the caller's job). */
  monitor(on: boolean) {
    if (this.monitorGain) {
      try {
        this.monitorGain.disconnect();
      } catch {
        /* already detached */
      }
      this.monitorGain = null;
    }
    if (on && this.source && this.ctx) {
      this.monitorGain = this.ctx.createGain();
      this.monitorGain.gain.value = 0.8;
      this.source.connect(this.monitorGain);
      this.monitorGain.connect(this.ctx.destination);
    }
  }

  /** Release the device (clears the tab's recording indicator) and the graph. */
  close() {
    try {
      this.node?.port.close();
      this.node?.disconnect();
    } catch {
      /* node already gone */
    }
    try {
      this.source?.disconnect();
    } catch {
      /* source already gone */
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.node = null;
    this.source = null;
    this.monitorGain = null;
    this.ctx = null;
  }
}

export const micCapture = new MicCapture();

/* 32-bit float mono WAV. Same container the export path uses (engine.wavBlob)
   so a recorded take and an exported mix are byte-comparable formats. */
export function pcmWavFloat32(samples: Float32Array, sampleRate: number): Uint8Array<ArrayBuffer> {
  const len = samples.length;
  const bytes = 44 + len * 4;
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
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 32, true);
  wstr(36, "data");
  view.setUint32(40, len * 4, true);
  let off = 44;
  for (let i = 0; i < len; i++) {
    view.setFloat32(off, samples[i], true);
    off += 4;
  }
  return new Uint8Array(ab);
}
