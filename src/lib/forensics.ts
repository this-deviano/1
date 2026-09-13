/* TASK-047 (SB-007-B) — automated audio forensics.

   HV-DEFERRED-01 ("ears") is open debt: nobody has listened to the render. A
   machine cannot close that debt — but it CAN split the human question in two,
   "is it broken?" (measurable) and "is it good?" (not), and answer the first
   honestly so the maintainer's listening session is spent on the second.

   Contract (SB-007-B §1): float64, no clock reads, no randomness, pure functions
   only. Every number is reported as measured, with the measurement's own
   definition attached — a proxy that cannot be audited is a proxy that cannot be
   trusted (P-07).

   What it deliberately does NOT do: apply a global click/transient threshold.
   Music has transients; a naive detector flags legitimate attacks as defects.
   Engine bugs manifest at BLOCK BOUNDARIES (the AudioWorklet render quantum,
   128 samples) and at EDIT/TRIM splices, so the discontinuity scan looks ONLY
   there and reports those deltas against the file's own interior 99.9th
   percentile — the file is judged against itself, not against a furniture value.

   Thresholds are fixed constants, not parameters: a forensic instrument whose
   pass criteria can be dialled per call is an instrument that can be
   threshold-shopped (P-14). */

/** AudioWorklet render quantum — where engine-side block seams land. */
export const LATTICE_BLOCK = 128;
/** Silence floor for onset/silence measurement (SB-007-B §1). */
export const SILENCE_DBFS = -60;
/** Full-scale magnitude; |x| >= this counts as a clipped sample. */
export const FULL_SCALE = 1.0;
/** Report floor: below this magnitude a dBFS figure is reported as `null`
    rather than -Infinity, because JSON cannot carry Infinity and a silent
    channel's honest DC figure is "nothing measurable", not "some number". */
export const DBFS_FLOOR = 1e-9;

const SILENCE_AMP = Math.pow(10, SILENCE_DBFS / 20);

/* ---------- small shared maths (exported for direct testing) ---------- */

/** Amplitude → dBFS, or null when the magnitude is under the report floor. */
export function dbfs(x: number): number | null {
  const a = Math.abs(x);
  if (!(a > DBFS_FLOOR)) return null;
  return 20 * Math.log10(a);
}

/** Nearest-rank percentile over an ASCENDING-sorted array.
    idx = ceil(p * n) - 1, clamped. Cheapest definition that is fully
    specified; stated here because two people's "p99.9" are not the same number. */
export function percentileNearestRank(sortedAsc: Float64Array, p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  const idx = Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1));
  return sortedAsc[idx];
}

/* ---------- WAV truth (P-07: report what the file says, not what we assume) ---------- */

export interface WavHeaderTruth {
  container: string;
  chunkIds: string[];
  fmtTag: number;
  fmtTagName: string;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  /** Declared in the fmt chunk, and derived independently — compared below. */
  byteRateDeclared: number;
  byteRateDerived: number;
  blockAlignDeclared: number;
  blockAlignDerived: number;
  declaredFieldsConsistent: boolean;
  dataOffset: number;
  dataBytesDeclared: number;
  dataBytesAvailable: number;
  dataFitsFile: boolean;
  frames: number;
  durationS: number;
}

export interface ParsedWav {
  header: WavHeaderTruth;
  sampleRate: number;
  frames: number;
  /** float64 channel copies — all analysis below is float64, never float32. */
  channels: Float64Array[];
}

const FMT_NAMES: Record<number, string> = {
  1: "PCM",
  3: "IEEE float",
  0xfffe: "WAVE_FORMAT_EXTENSIBLE",
};

/** Walk RIFF chunks and decode the sample data.
    Chunk walking (rather than assuming a fixed 44-byte header) is what makes the
    header report a *truth* check: a LIST/fact chunk between `fmt ` and `data`
    would silently shift a fixed-offset reader and hand back garbage. */
export function parseWav(bytes: ArrayBuffer): ParsedWav {
  if (bytes.byteLength < 44) throw new Error(`parseWav: ${bytes.byteLength} bytes is shorter than a 44-byte WAV header`);
  const view = new DataView(bytes);
  const rid = (off: number) =>
    String.fromCharCode(view.getUint8(off), view.getUint8(off + 1), view.getUint8(off + 2), view.getUint8(off + 3));
  const riff = rid(0);
  const wave = rid(8);
  if (riff !== "RIFF" || wave !== "WAVE") {
    throw new Error(`parseWav: not RIFF/WAVE (found "${riff}"/"${wave}")`);
  }

  const chunkIds: string[] = [];
  let fmt: { tag: number; channels: number; sampleRate: number; byteRate: number; blockAlign: number; bits: number } | null = null;
  let dataOffset = -1;
  let dataBytesDeclared = 0;

  let off = 12;
  while (off + 8 <= bytes.byteLength) {
    const id = rid(off);
    const size = view.getUint32(off + 4, true);
    chunkIds.push(id);
    if (id === "fmt ") {
      if (off + 8 + 16 > bytes.byteLength) throw new Error("parseWav: truncated fmt chunk");
      fmt = {
        tag: view.getUint16(off + 8, true),
        channels: view.getUint16(off + 10, true),
        sampleRate: view.getUint32(off + 12, true),
        byteRate: view.getUint32(off + 16, true),
        blockAlign: view.getUint16(off + 20, true),
        bits: view.getUint16(off + 22, true),
      };
    } else if (id === "data") {
      dataOffset = off + 8;
      dataBytesDeclared = size;
      break;
    }
    off += 8 + size + (size & 1); // chunks are word-aligned
  }

  if (!fmt) throw new Error("parseWav: no fmt chunk");
  if (dataOffset < 0) throw new Error("parseWav: no data chunk");
  if (fmt.channels < 1) throw new Error(`parseWav: fmt declares ${fmt.channels} channels`);

  const bytesPerSample = fmt.bits / 8;
  const blockAlignDerived = fmt.channels * bytesPerSample;
  const dataBytesAvailable = Math.max(0, bytes.byteLength - dataOffset);
  const usableBytes = Math.min(dataBytesDeclared, dataBytesAvailable);
  const frames = Math.floor(usableBytes / blockAlignDerived);

  const channels: Float64Array[] = [];
  for (let c = 0; c < fmt.channels; c++) channels.push(new Float64Array(frames));

  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < fmt.channels; c++) {
      const p = dataOffset + (i * fmt.channels + c) * bytesPerSample;
      let v: number;
      if (fmt.tag === 3 && fmt.bits === 32) {
        v = view.getFloat32(p, true);
      } else if (fmt.tag === 1 && fmt.bits === 16) {
        v = view.getInt16(p, true) / 32768;
      } else if (fmt.tag === 1 && fmt.bits === 24) {
        const b0 = view.getUint8(p);
        const b1 = view.getUint8(p + 1);
        const b2 = view.getUint8(p + 2);
        const raw = (b2 << 16) | (b1 << 8) | b0;
        v = (raw & 0x800000 ? raw - 0x1000000 : raw) / 8388608;
      } else if (fmt.tag === 1 && fmt.bits === 32) {
        v = view.getInt32(p, true) / 2147483648;
      } else {
        throw new Error(`parseWav: unsupported sample format (fmt tag ${fmt.tag}, ${fmt.bits} bits)`);
      }
      channels[c][i] = v;
    }
  }

  const header: WavHeaderTruth = {
    container: "RIFF/WAVE",
    chunkIds,
    fmtTag: fmt.tag,
    fmtTagName: FMT_NAMES[fmt.tag] ?? `unknown(${fmt.tag})`,
    channels: fmt.channels,
    sampleRate: fmt.sampleRate,
    bitsPerSample: fmt.bits,
    byteRateDeclared: fmt.byteRate,
    byteRateDerived: fmt.sampleRate * blockAlignDerived,
    blockAlignDeclared: fmt.blockAlign,
    blockAlignDerived,
    declaredFieldsConsistent: fmt.byteRate === fmt.sampleRate * blockAlignDerived && fmt.blockAlign === blockAlignDerived,
    dataOffset,
    dataBytesDeclared,
    dataBytesAvailable,
    dataFitsFile: dataBytesDeclared <= dataBytesAvailable,
    frames,
    durationS: fmt.sampleRate > 0 ? frames / fmt.sampleRate : 0,
  };

  return { header, sampleRate: fmt.sampleRate, frames, channels };
}

/* ---------- per-channel forensics ---------- */

export interface LatticeScan {
  blockSize: number;
  editPoints: number[];
  boundaryCount: number;
  maxBoundaryDelta: number;
  maxBoundaryDeltaDbfs: number | null;
  interiorCount: number;
  interiorP999: number;
  interiorP999Dbfs: number | null;
  /** Sample indices whose delta exceeds the interior p99.9 — the suspects. */
  outlierBoundaries: number[];
  verdict: "WITHIN-INTERIOR-P999" | "OUTLIER";
}

/** Segments used for the DC diagnostic. Fixed, not a parameter. */
export const DC_SEGMENTS = 8;

export interface ChannelForensics {
  index: number;
  dcOffset: number;
  dcDbfs: number | null;
  /** Mean per equal-count segment. A genuine DC *bias* is uniform: it shows up
      in every segment with the same sign and comparable magnitude. A residual
      left by truncated low-frequency voices is concentrated, and its segments
      disagree. One number cannot tell those apart — this can (P-07/P-14). */
  dcSegments: number[];
  dcSegmentMaxAbs: number;
  dcSegmentsMatchingOverallSign: number;
  /** max|segment mean| / |overall mean| — ≈1 for a uniform bias, ≫1 for a
      residual concentrated in one part of the render (null if overall is 0). */
  dcConcentration: number | null;
  truePeak: number;
  truePeakDbfs: number | null;
  /** Samples at or over full scale (|x| >= 1.0) — the briefed definition. */
  clippedSamples: number;
  /** Samples strictly over full scale (|x| > 1.0). Reported separately because
      the two are different diagnoses: a float file touching exactly 1.0 is a
      full-scale source, while a file *exceeding* 1.0 will clip on any integer
      DAC. Collapsing them into one number hides which one you have (P-07). */
  samplesOverFullScale: number;
  clippedFraction: number;
  lattice: LatticeScan;
}

export function scanLattice(
  x: Float64Array,
  opts?: { blockSize?: number; editPoints?: number[] }
): LatticeScan {
  const n = x.length;
  const blockSize = opts?.blockSize ?? LATTICE_BLOCK;
  const editPoints = (opts?.editPoints ?? []).filter((e) => e >= 1 && e < n);

  const isBoundary = new Uint8Array(n);
  for (let i = blockSize; i < n; i += blockSize) isBoundary[i] = 1;
  for (const e of editPoints) isBoundary[e] = 1;

  const boundaryIdx: number[] = [];
  const boundaryDelta: number[] = [];
  const interiorScratch = new Float64Array(n > 0 ? n - 1 : 0);
  let interiorCount = 0;

  for (let i = 1; i < n; i++) {
    const d = Math.abs(x[i] - x[i - 1]);
    if (isBoundary[i]) {
      boundaryIdx.push(i);
      boundaryDelta.push(d);
    } else {
      interiorScratch[interiorCount++] = d;
    }
  }

  const interior = interiorScratch.subarray(0, interiorCount).slice();
  interior.sort(); // Float64Array sort is numeric ascending
  const interiorP999 = percentileNearestRank(interior, 0.999);

  let maxBoundaryDelta = 0;
  const outlierBoundaries: number[] = [];
  for (let i = 0; i < boundaryDelta.length; i++) {
    if (boundaryDelta[i] > maxBoundaryDelta) maxBoundaryDelta = boundaryDelta[i];
    if (boundaryDelta[i] > interiorP999) outlierBoundaries.push(boundaryIdx[i]);
  }

  return {
    blockSize,
    editPoints,
    boundaryCount: boundaryDelta.length,
    maxBoundaryDelta,
    maxBoundaryDeltaDbfs: dbfs(maxBoundaryDelta),
    interiorCount,
    interiorP999,
    interiorP999Dbfs: dbfs(interiorP999),
    outlierBoundaries,
    verdict: outlierBoundaries.length === 0 ? "WITHIN-INTERIOR-P999" : "OUTLIER",
  };
}

export function channelForensics(
  x: Float64Array,
  index: number,
  opts?: { blockSize?: number; editPoints?: number[] }
): ChannelForensics {
  const n = x.length;
  let sum = 0;
  let peak = 0;
  let clipped = 0;
  let over = 0;
  for (let i = 0; i < n; i++) {
    const v = x[i];
    sum += v;
    const a = Math.abs(v);
    if (a > peak) peak = a;
    if (a >= FULL_SCALE) clipped++;
    if (a > FULL_SCALE) over++;
  }
  const dcOffset = n > 0 ? sum / n : 0;

  // DC diagnostic: equal-count segments, so the split never depends on a clock
  // or on a caller's window choice. The last segment absorbs the remainder.
  const dcSegments: number[] = [];
  if (n > 0) {
    const segLen = Math.floor(n / DC_SEGMENTS);
    if (segLen < 1) {
      dcSegments.push(dcOffset);
    } else {
      for (let s = 0; s < DC_SEGMENTS; s++) {
        const start = s * segLen;
        const end = s === DC_SEGMENTS - 1 ? n : start + segLen;
        let acc = 0;
        for (let i = start; i < end; i++) acc += x[i];
        dcSegments.push(acc / (end - start));
      }
    }
  }
  const dcSegmentMaxAbs = dcSegments.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const dcSegmentsMatchingOverallSign = dcSegments.filter((v) => v !== 0 && v > 0 === dcOffset > 0).length;

  return {
    index,
    dcOffset,
    dcDbfs: dbfs(dcOffset),
    dcSegments,
    dcSegmentMaxAbs,
    dcSegmentsMatchingOverallSign,
    dcConcentration: dcOffset === 0 ? null : dcSegmentMaxAbs / Math.abs(dcOffset),
    truePeak: peak,
    truePeakDbfs: dbfs(peak),
    clippedSamples: clipped,
    samplesOverFullScale: over,
    clippedFraction: n > 0 ? clipped / n : 0,
    lattice: scanLattice(x, opts),
  };
}

/* ---------- onset / trim / silence ---------- */

export interface TrimForensics {
  thresholdDbfs: number;
  thresholdAmp: number;
  /** Where the caller says audible material was supposed to begin. */
  expectedMs: number;
  /** Measured onset across channels (per-frame peak), or null if never audible. */
  firstAudibleSample: number | null;
  firstAudibleMs: number | null;
  /** firstAudibleMs - expectedMs: the count-in/trim alignment error. */
  offsetMs: number | null;
  leadingSilenceMs: number;
  trailingSilenceMs: number;
  frames: number;
  sampleRate: number;
  durationS: number;
}

/** Onset is computed on the per-frame peak ACROSS channels, so a file that is
    silent in L and live in R is reported as starting when the file starts
    making sound — not when channel 0 happens to wake up. */
export function trimForensics(channels: Float64Array[], sampleRate: number, expectedMs: number): TrimForensics {
  const frames = channels.length > 0 ? channels[0].length : 0;
  const totalMs = sampleRate > 0 ? (frames / sampleRate) * 1000 : 0;

  let first: number | null = null;
  let last: number | null = null;
  for (let i = 0; i < frames; i++) {
    let p = 0;
    for (const ch of channels) {
      const a = ch[i] < 0 ? -ch[i] : ch[i];
      if (a > p) p = a;
    }
    if (p >= SILENCE_AMP) {
      if (first === null) first = i;
      last = i;
    }
  }

  const firstAudibleMs = first === null ? null : (first / sampleRate) * 1000;
  return {
    thresholdDbfs: SILENCE_DBFS,
    thresholdAmp: SILENCE_AMP,
    expectedMs,
    firstAudibleSample: first,
    firstAudibleMs,
    offsetMs: firstAudibleMs === null ? null : firstAudibleMs - expectedMs,
    leadingSilenceMs: first === null ? totalMs : (first / sampleRate) * 1000,
    trailingSilenceMs: last === null ? totalMs : ((frames - 1 - last) / sampleRate) * 1000,
    frames,
    sampleRate,
    durationS: sampleRate > 0 ? frames / sampleRate : 0,
  };
}

/* ---------- the report ---------- */

export interface ForensicReport {
  label: string;
  fileBytes: number;
  header: WavHeaderTruth;
  sampleRate: number;
  frames: number;
  durationS: number;
  channels: ChannelForensics[];
  trim: TrimForensics;
}

export interface ForensicsOptions {
  /** Expected onset position in ms. For a count-in-trimmed take this is 0; for
      an offline export it is the engine's PREROLL (the transport's own lead-in),
      because the export has no count-in to trim. */
  expectedTrimMs: number;
  blockSize?: number;
  /** Extra splice points in ms (clip edges, comp boundaries) to treat as
      lattice boundaries alongside the 128-sample quanta. */
  editPointsMs?: number[];
}

export function analyzeWav(label: string, bytes: ArrayBuffer, opts: ForensicsOptions): ForensicReport {
  const parsed = parseWav(bytes);
  const editPoints = [
    ...(opts.editPointsMs ?? []).map((ms) => Math.round((ms / 1000) * parsed.sampleRate)),
    // the trim splice itself is an edit point by definition
    ...(opts.expectedTrimMs > 0 ? [Math.round((opts.expectedTrimMs / 1000) * parsed.sampleRate)] : []),
  ];

  return {
    label,
    fileBytes: bytes.byteLength,
    header: parsed.header,
    sampleRate: parsed.sampleRate,
    frames: parsed.frames,
    durationS: parsed.header.durationS,
    channels: parsed.channels.map((x, i) => channelForensics(x, i, { blockSize: opts.blockSize, editPoints })),
    trim: trimForensics(parsed.channels, parsed.sampleRate, opts.expectedTrimMs),
  };
}
