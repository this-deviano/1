/* TASK-047 (SB-007-B) — automated audio forensics.
   TASK-050 (SB-007-C) — criteria repair per ruling R-8 (FND-02/03/04).

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
   there and reports those deltas against the file's own local statistics — the
   file is judged against itself, not against a furniture value.

   SB-007-C repair, in one paragraph: the first run of this instrument (SB-007-B)
   went red on three criteria and the maintainer ruled all three were the
   INSTRUMENT being wrong, not the audio (R-8). Whole-file DC is meaningless on
   non-stationary music (FND-02), so DC is now gated only inside windows that are
   genuinely silent — where a constant bias is the only signal that can exist. A
   count of interior-p99.9 exceedances over-rejects by chance (FND-03), so the
   count is now judged against the Poisson distribution it actually follows, and
   a single boundary must additionally be impossible under its own neighbourhood.
   The fake capture device cannot exercise onset/trim (FND-04), so those
   assertions moved off it. The three criteria were RE-DERIVED, not loosened, and
   the repair is validated on the SAME audio evidence (R-8d) — the numbers that
   failed for instrument reasons must pass for principled reasons, on record.

   E-013 (criteria provenance): EVERY gated threshold below carries a comment
   citing its derivation (statistical or physical) and the ruling that authorized
   it. Any change to a threshold after a red result requires a WORKLOG entry
   citing that ruling, which makes threshold-shopping structurally visible. */

/** AudioWorklet render quantum — where engine-side block seams land. */
export const LATTICE_BLOCK = 128;
/** Silence floor for onset/silence measurement (SB-007-B §1) and for the DC gate
    window RMS (R-8a). −60 dBFS. */
export const SILENCE_DBFS = -60;
/** Full-scale magnitude; |x| >= this counts as a clipped sample. */
export const FULL_SCALE = 1.0;
/** Report floor: below this magnitude a dBFS figure is reported as `null`
    rather than -Infinity, because JSON cannot carry Infinity and a silent
    channel's honest DC figure is "nothing measurable", not "some number". */
export const DBFS_FLOOR = 1e-9;

const SILENCE_AMP = Math.pow(10, SILENCE_DBFS / 20);

/* ---------- gate provenance (E-013) ----------
   Thresholds that a FAIL/FIX decision depends on. Each names its derivation.
   Ratified by R-8 (SB-007-C); see WORKLOG for the before/after validation. */

/** Percentile that defines an "outlier" boundary delta (SB-007-B §2). */
export const LATTICE_P999 = 0.999;
/** Count gate: the exceedance rate expected by chance under the null hypothesis
    that boundary samples behave like interior samples (R-8b-i). The interior
    p99.9 leaves 0.1 % of samples above it, so λ = LATTICE_NULL_RATE × N. */
export const LATTICE_NULL_RATE = 0.001;
/** Count gate: we reject the null only above the Poisson 99.9 % quantile for that
    λ (R-8b-i). At 99.9 % the false-positive rate is bounded at 0.1 % per file —
    the briefed single-percentile test had an ~24 % false-positive rate at the
    observed boundary count (FND-03). */
export const LATTICE_POISSON_CONFIDENCE = 0.999;
/** Local gate: a boundary is locally guilty only above this multiple of the
    interior p99.9 measured inside its own ±1 s neighbourhood (R-8b-ii). */
export const LATTICE_LOCAL_FACTOR = 20;
/** Local gate: half-width of that neighbourhood, in seconds (R-8b-ii). */
export const LATTICE_LOCAL_WINDOW_S = 1;
/** Local gate absolute floor (R-8b-ii). Derivation, corpus-measured at SB-007-C:
    the corpus's interior p99.9 is 0.05941 (reference export) and 0 (fake-tone
    take); its largest legitimate boundary delta is 0.06885. A sample-to-sample
    step of 0.25 is −12 dBFS — 3.6× the corpus's largest legitimate transition,
    and steeper than any musical attack's adjacent-sample slope — so a boundary
    below it cannot be an engine seam, and one above it is then judged against
    its own neighbourhood. The floor exists so the local test cannot degenerate
    when the local p99.9 is 0 in sparse or silent material (FND-03). */
export const LATTICE_ABSOLUTE_FLOOR = 0.25;
/** DC gate geometry (R-8a): 50 ms windows at 50 % overlap. Long enough for a
    stable mean, short enough that a musical note cannot hide inside one. */
export const DC_SILENCE_WINDOW_MS = 50;
export const DC_SILENCE_HOP_MS = 25;

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

/* ---------- Poisson tail (R-8b-i), exact for the small λ this gate sees ------ */

/** P(X ≤ k) for X ~ Poisson(λ), summed term-by-term so no factorial overflows. */
export function poissonCdf(k: number, lambda: number): number {
  if (k < 0) return 0;
  if (!(lambda > 0)) return 1;
  let term = Math.exp(-lambda);
  let sum = term;
  for (let i = 1; i <= k; i++) {
    term *= lambda / i;
    sum += term;
    if (sum >= 1) return 1;
  }
  return Math.min(1, sum);
}

/** Smallest k with P(X ≤ k) ≥ p — the p-quantile, by inverting the CDF. */
export function poissonQuantile(lambda: number, p: number): number {
  if (!(lambda > 0)) return 0;
  let term = Math.exp(-lambda);
  let sum = term;
  let k = 0;
  while (sum < p && k < 100_000) {
    k += 1;
    term *= lambda / k;
    sum += term;
  }
  return k;
}

/* ---------- WAV truth (P-07: report what the file says, not what we assume) ---- */

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

/* ---------- silent-region DC (R-8a) ----------
   Whole-file DC on music is informational only: the mean of a non-stationary
   signal is the partial-cycle integral of its low-frequency content, not a bias
   (FND-02: the export's segment means alternate sign and 4/8 share the overall
   sign). A DC *bias* is the only signal that can exist inside genuine silence,
   so that is the only place this instrument gates it. */

export interface SilentDcScan {
  windowMs: number;
  hopMs: number;
  windowCount: number;
  silentWindowCount: number;
  /** false when the file has no window below −60 dBFS: the DC gate is vacuous. */
  informative: boolean;
  /** max |window mean| over silent windows — the ONLY DC figure gated (R-8a). */
  maxSilentAbsDc: number;
  maxSilentDcDbfs: number | null;
  /** Loudest silent-window RMS — how close the quietest windows sit to the floor. */
  maxSilentRmsDbfs: number | null;
  /** First few silent-window means, so the figure is auditable (P-07). */
  sampleSilentMeans: number[];
}

export function silentDc(x: Float64Array, sampleRate: number): SilentDcScan {
  const win = Math.max(1, Math.round((DC_SILENCE_WINDOW_MS / 1000) * sampleRate));
  const hop = Math.max(1, Math.round((DC_SILENCE_HOP_MS / 1000) * sampleRate));
  const n = x.length;
  let windowCount = 0;
  let silentWindowCount = 0;
  let maxSilentAbsDc = 0;
  let maxSilentRmsDbfs: number | null = null;
  const sampleSilentMeans: number[] = [];
  for (let s = 0; s + win <= n; s += hop) {
    windowCount += 1;
    let sum = 0;
    let sq = 0;
    for (let i = s; i < s + win; i++) {
      const v = x[i];
      sum += v;
      sq += v * v;
    }
    const mean = sum / win;
    const rms = Math.sqrt(sq / win);
    const rmsDbfs = 20 * Math.log10(Math.max(rms, DBFS_FLOOR));
    if (rmsDbfs < SILENCE_DBFS) {
      silentWindowCount += 1;
      const a = Math.abs(mean);
      if (a > maxSilentAbsDc) maxSilentAbsDc = a;
      if (maxSilentRmsDbfs === null || rmsDbfs > maxSilentRmsDbfs) maxSilentRmsDbfs = rmsDbfs;
      if (sampleSilentMeans.length < 8) sampleSilentMeans.push(mean);
    }
  }
  return {
    windowMs: DC_SILENCE_WINDOW_MS,
    hopMs: DC_SILENCE_HOP_MS,
    windowCount,
    silentWindowCount,
    informative: silentWindowCount > 0,
    maxSilentAbsDc,
    maxSilentDcDbfs: dbfs(maxSilentAbsDc),
    maxSilentRmsDbfs,
    sampleSilentMeans,
  };
}

/* ---------- lattice scan + gate (R-8b) ---------- */

export interface LatticeGate {
  /** false when the interior p99.9 is 0 — sparse/silent material; the count
      gate is then vacuous and must report UNINFORMATIVE, not a silent pass
      (FND-03). */
  informative: boolean;
  interiorP999: number;
  boundaryCount: number;
  /** Boundary deltas above the interior p99.9 (the briefed "outlier" count). */
  exceedanceCount: number;
  /** λ = LATTICE_NULL_RATE × boundaryCount — the chance rate under the null. */
  poissonLambda: number;
  /** Poisson 99.9 % quantile for that λ — the count gate's allowance (R-8b-i). */
  poissonAllowed: number;
  countPass: boolean;
  /** Boundary deltas above LATTICE_ABSOLUTE_FLOOR — the only ones locally tested. */
  localCandidateCount: number;
  localGuilty: { index: number; delta: number; localP999: number; ratio: number }[];
  localPass: boolean;
  pass: boolean;
  verdict: "PASS" | "FAIL" | "UNINFORMATIVE";
}

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
  /** Legacy single-percentile verdict, kept informational (P-07). The
      authoritative verdict is `gate.verdict` (R-8b). */
  verdict: "WITHIN-INTERIOR-P999" | "OUTLIER";
  gate: LatticeGate;
}

/** p99.9 of interior deltas inside a ±LATTICE_LOCAL_WINDOW_S neighbourhood of
    `center`. Interior deltas arrive with ascending absolute indices, so the
    window is found by binary search and only candidates above the absolute
    floor ever pay for this (normally zero of them). */
function localWindowP999(
  interiorIdx: Int32Array,
  interiorDelta: Float64Array,
  interiorCount: number,
  center: number,
  sampleRate: number
): number {
  const half = Math.max(1, Math.round(LATTICE_LOCAL_WINDOW_S * sampleRate));
  const lo = center - half;
  const hi = center + half;
  let a = 0;
  let b = interiorCount;
  while (a < b) {
    const m = (a + b) >> 1;
    if (interiorIdx[m] < lo) a = m + 1;
    else b = m;
  }
  const start = a;
  let c = start;
  let d = interiorCount;
  while (c < d) {
    const m = (c + d) >> 1;
    if (interiorIdx[m] <= hi) c = m + 1;
    else d = m;
  }
  const end = c;
  const m = end - start;
  if (m <= 0) return 0;
  const w = new Float64Array(m);
  for (let i = 0; i < m; i++) w[i] = interiorDelta[start + i];
  w.sort();
  return percentileNearestRank(w, LATTICE_P999);
}

export function scanLattice(
  x: Float64Array,
  opts?: { blockSize?: number; editPoints?: number[]; sampleRate?: number }
): LatticeScan {
  const n = x.length;
  const blockSize = opts?.blockSize ?? LATTICE_BLOCK;
  const sampleRate = opts?.sampleRate ?? 44100;
  const editPoints = (opts?.editPoints ?? []).filter((e) => e >= 1 && e < n);

  const isBoundary = new Uint8Array(n);
  for (let i = blockSize; i < n; i += blockSize) isBoundary[i] = 1;
  for (const e of editPoints) isBoundary[e] = 1;

  const boundaryIdx: number[] = [];
  const boundaryDelta: number[] = [];
  const interiorIdx = new Int32Array(n > 0 ? n - 1 : 0);
  const interiorDelta = new Float64Array(n > 0 ? n - 1 : 0);
  let interiorCount = 0;

  for (let i = 1; i < n; i++) {
    const d = Math.abs(x[i] - x[i - 1]);
    if (isBoundary[i]) {
      boundaryIdx.push(i);
      boundaryDelta.push(d);
    } else {
      interiorIdx[interiorCount] = i;
      interiorDelta[interiorCount] = d;
      interiorCount += 1;
    }
  }

  const interior = interiorDelta.subarray(0, interiorCount).slice();
  interior.sort(); // Float64Array sort is numeric ascending
  const interiorP999 = percentileNearestRank(interior, LATTICE_P999);

  let maxBoundaryDelta = 0;
  const outlierBoundaries: number[] = [];
  for (let i = 0; i < boundaryDelta.length; i++) {
    if (boundaryDelta[i] > maxBoundaryDelta) maxBoundaryDelta = boundaryDelta[i];
    if (boundaryDelta[i] > interiorP999) outlierBoundaries.push(boundaryIdx[i]);
  }

  /* R-8b-i — count gate. Under the null hypothesis (boundary samples are an
     unbiased subset of the file) the expected number of exceedances of the
     interior p99.9 is LATTICE_NULL_RATE × N_boundaries; reject the null only
     above the Poisson 99.9 % quantile for that λ. */
  const poissonLambda = LATTICE_NULL_RATE * boundaryDelta.length;
  const poissonAllowed = poissonQuantile(poissonLambda, LATTICE_POISSON_CONFIDENCE);
  const countPass = outlierBoundaries.length <= poissonAllowed;

  /* R-8b-ii — local gate. Floor first, so ordinary material pays nothing; a
     candidate must then exceed LATTICE_LOCAL_FACTOR × its own neighbourhood's
     p99.9. A boundary is guilty only if it is statistically impossible under
     the file's own local statistics, never merely louder than the global tail. */
  const informative = interiorP999 > 0;
  const localGuilty: LatticeGate["localGuilty"] = [];
  let localCandidateCount = 0;
  for (let i = 0; i < boundaryDelta.length; i++) {
    const d = boundaryDelta[i];
    if (d <= LATTICE_ABSOLUTE_FLOOR) continue;
    localCandidateCount += 1;
    const center = boundaryIdx[i];
    const localP999 = localWindowP999(interiorIdx, interiorDelta, interiorCount, center, sampleRate);
    if (d > LATTICE_LOCAL_FACTOR * localP999) {
      localGuilty.push({ index: center, delta: d, localP999, ratio: localP999 > 0 ? d / localP999 : Number.POSITIVE_INFINITY });
    }
  }
  const localPass = localGuilty.length === 0;
  const pass = informative && countPass && localPass;
  const gate: LatticeGate = {
    informative,
    interiorP999,
    boundaryCount: boundaryDelta.length,
    exceedanceCount: outlierBoundaries.length,
    poissonLambda,
    poissonAllowed,
    countPass,
    localCandidateCount,
    localGuilty,
    localPass,
    pass,
    verdict: !informative ? "UNINFORMATIVE" : pass ? "PASS" : "FAIL",
  };

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
    gate,
  };
}

/* ---------- per-channel forensics ---------- */

/** Segments used for the informational DC diagnostic. Fixed, not a parameter. */
export const DC_SEGMENTS = 8;

export interface ChannelForensics {
  index: number;
  /** Whole-file mean — INFORMATIONAL ONLY on non-stationary material (FND-02). */
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
  /** The GATED DC figure: silent-region only (R-8a). */
  dcSilent: SilentDcScan;
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

export function channelForensics(
  x: Float64Array,
  index: number,
  opts?: { blockSize?: number; editPoints?: number[]; sampleRate?: number }
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

  const sampleRate = opts?.sampleRate ?? 44100;

  return {
    index,
    dcOffset,
    dcDbfs: dbfs(dcOffset),
    dcSegments,
    dcSegmentMaxAbs,
    dcSegmentsMatchingOverallSign,
    dcConcentration: dcOffset === 0 ? null : dcSegmentMaxAbs / Math.abs(dcOffset),
    dcSilent: silentDc(x, sampleRate),
    truePeak: peak,
    truePeakDbfs: dbfs(peak),
    clippedSamples: clipped,
    samplesOverFullScale: over,
    clippedFraction: n > 0 ? clipped / n : 0,
    lattice: scanLattice(x, { ...opts, sampleRate }),
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
    channels: parsed.channels.map((x, i) => channelForensics(x, i, { blockSize: opts.blockSize, editPoints, sampleRate: parsed.sampleRate })),
    trim: trimForensics(parsed.channels, parsed.sampleRate, opts.expectedTrimMs),
  };
}
