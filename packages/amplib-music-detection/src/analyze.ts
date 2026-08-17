import { Note, type Notation } from "@amplib/music-theory";

/**
 * Offline analysis of tempo and key, as pure functions over PCM.
 *
 * Nothing here touches Web Audio. `DetectTone` and `DetectBPM` are built on
 * `AnalyserNode`, which ties them to a browser and — for the offline paths —
 * to `ScriptProcessor`, the only way to sample an analyzer as an
 * `OfflineAudioContext` renders, and deprecated for years. Taking samples
 * directly costs one small FFT and buys analysis that runs identically in a
 * page, in a worker, and in Node.
 *
 * Everything takes planar Float32 samples in [-1, 1] and a sample rate, and
 * returns plain data.
 */

// ---- FFT -----------------------------------------------------
// Iterative in-place radix-2. Small enough not to be worth a dependency, and
// a dependency here would have to be bundled into every consumer anyway.

function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i];
      re[i] = re[j];
      re[j] = t;
      t = im[i];
      im[i] = im[j];
      im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const ar = re[i + k];
        const ai = im[i + k];
        const br = re[i + k + half] * cr - im[i + k + half] * ci;
        const bi = re[i + k + half] * ci + im[i + k + half] * cr;
        re[i + k] = ar + br;
        im[i + k] = ai + bi;
        re[i + k + half] = ar - br;
        im[i + k + half] = ai - bi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** Sum channels to mono without changing level. */
export function toMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length;
  const out = new Float32Array(n);
  for (const ch of channels)
    for (let i = 0; i < n; i++) out[i] += ch[i] / channels.length;
  return out;
}

// ---- onset envelope ------------------------------------------

export interface OnsetEnvelope {
  /** Onset strength per frame, normalized to a 0–1 peak. */
  values: Float32Array;
  /** Frames per second. */
  rate: number;
}

/**
 * Spectral flux: the frame-to-frame rise in magnitude, summed over bins.
 *
 * Rises only — a note ending is not an onset — and on log magnitude, so a
 * quiet hat in a loud bar still registers. This is the measurement the old
 * `DetectBPM` was missing: it looked for peaks in raw amplitude, which finds
 * nothing at all in material that never spikes, and is why sustained chords
 * returned a tempo of 0.
 */
export function onsetEnvelope(
  samples: Float32Array,
  sampleRate: number,
  { fftSize = 1024, hop = 256 }: { fftSize?: number; hop?: number } = {}
): OnsetEnvelope {
  const frames = Math.max(0, Math.floor((samples.length - fftSize) / hop) + 1);
  const values = new Float32Array(Math.max(0, frames - 1));
  if (frames < 2) return { values, rate: sampleRate / hop };

  const win = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++)
    win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / fftSize));

  const bins = fftSize >> 1;
  let prev = new Float32Array(bins);
  let curr = new Float32Array(bins);
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);

  for (let f = 0; f < frames; f++) {
    const off = f * hop;
    for (let i = 0; i < fftSize; i++) {
      re[i] = samples[off + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let b = 0; b < bins; b++)
      curr[b] = Math.log1p(1000 * Math.hypot(re[b], im[b]));

    if (f > 0) {
      let flux = 0;
      for (let b = 0; b < bins; b++) {
        const d = curr[b] - prev[b];
        if (d > 0) flux += d;
      }
      values[f - 1] = flux;
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }

  // Subtract a local mean so a swell does not read as a continuous onset,
  // then normalize. Without this a long crescendo outscores every drum hit.
  const w = Math.max(1, Math.round(0.1 * (sampleRate / hop)));
  const out = new Float32Array(values.length);
  let peak = 0;
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - w); j <= Math.min(values.length - 1, i + w); j++) {
      sum += values[j];
      count++;
    }
    const v = values[i] - sum / count;
    out[i] = v > 0 ? v : 0;
    if (out[i] > peak) peak = out[i];
  }
  if (peak > 0) for (let i = 0; i < out.length; i++) out[i] /= peak;
  return { values: out, rate: sampleRate / hop };
}

// ---- tempo ---------------------------------------------------

/**
 * Tempo is octave-ambiguous by nature — half time and double time explain the
 * same onsets equally well — so every candidate is weighted by how likely its
 * tempo is in the first place. A log-normal around 120 BPM is the usual
 * choice and the one listeners tend to agree with.
 */
function tempoPrior(bpm: number, center = 120, width = 0.9): number {
  const x = Math.log2(bpm / center) / width;
  return Math.exp(-0.5 * x * x);
}

/**
 * Loops come in 4, 8, 16 and 32 beats far more often than 12 or 20, and the
 * onsets often cannot tell those apart: a four-chord pad gives three onset
 * peaks in eight seconds, which fits a 12-beat grid as well as a 16-beat one.
 * This breaks those ties toward the lengths music uses. 1.12 and 1.06 are
 * small enough to lose to any real difference in the onsets.
 */
function lengthPrior(beats: number): number {
  if ((beats & (beats - 1)) === 0) return 1.12;
  if (beats % 4 === 0) return 1.06;
  return 1;
}

export interface TempoEstimate {
  bpm: number;
  /** 0–1. How much better the winner scored than the median candidate. */
  confidence: number;
  /** Where a beat falls, in samples. Beat phase, not the downbeat. */
  phase: number;
  /** Other plausible readings, best first — usually half and double time. */
  alternatives: { bpm: number; score: number }[];
}

/**
 * Estimate tempo by autocorrelating the onset envelope.
 *
 * Autocorrelation asks "how well does the onset pattern line up with itself
 * this far along", which is a question sustained material can still answer —
 * unlike "where are the amplitude peaks", which it cannot.
 */
export function detectTempo(
  samples: Float32Array,
  sampleRate: number,
  { minBPM = 60, maxBPM = 200 }: { minBPM?: number; maxBPM?: number } = {}
): TempoEstimate {
  const env = onsetEnvelope(samples, sampleRate);
  const n = env.values.length;
  const empty = { bpm: 0, confidence: 0, phase: 0, alternatives: [] };
  if (n < 8) return empty;

  const minLag = Math.max(1, Math.floor((60 / maxBPM) * env.rate));
  const maxLag = Math.min(n - 1, Math.ceil((60 / minBPM) * env.rate));
  if (maxLag <= minLag) return empty;

  const scored: { bpm: number; score: number }[] = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < n; i++) sum += env.values[i] * env.values[i + lag];
    const norm = sum / (n - lag);
    const bpm = (60 * env.rate) / lag;
    scored.push({ bpm, score: norm * tempoPrior(bpm) });
  }
  if (!scored.length) return empty;

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const median = scored[Math.floor(scored.length / 2)].score || 1e-9;
  // Drop alternatives within a sixth of the winner: those are its own peak.
  const alts: { bpm: number; score: number }[] = [];
  for (const c of scored) {
    if (alts.length >= 3) break;
    if (Math.abs(Math.log2(c.bpm / best.bpm)) < 0.15) continue;
    if (alts.some((a) => Math.abs(Math.log2(c.bpm / a.bpm)) < 0.15)) continue;
    alts.push(c);
  }
  // Where the beats of that tempo land. The same search detectLoopBeats does,
  // over one period rather than a whole loop, so a caller can put a mark on a
  // beat rather than only name a number.
  const periodFrames = (60 * env.rate) / best.bpm;
  const steps = Math.max(8, Math.min(256, Math.round(periodFrames)));
  const count = Math.max(1, Math.floor(n / periodFrames));
  let bestPhase = 0;
  let bestMean = -1;
  for (let sIdx = 0; sIdx < steps; sIdx++) {
    const p = (sIdx / steps) * periodFrames;
    let sum = 0;
    for (let k = 0; k < count; k++) {
      const i = Math.round(p + k * periodFrames);
      if (i < n) sum += env.values[i];
    }
    const mean = sum / count;
    if (mean > bestMean) {
      bestMean = mean;
      bestPhase = p;
    }
  }

  return {
    bpm: best.bpm,
    confidence: Math.max(0, Math.min(1, 1 - median / (best.score || 1e-9))),
    phase: Math.round((bestPhase / env.rate) * sampleRate),
    alternatives: alts,
  };
}

// ---- a loop's beat count -------------------------------------

export interface LoopBeats {
  /** Whole beats spanned by the buffer. */
  beats: number;
  /** The tempo that follows from `beats` and the buffer length. Exact. */
  bpm: number;
  confidence: number;
  /** Where beat 1 appears to fall, in samples. Beat phase, not the downbeat. */
  phase: number;
  alternatives: { beats: number; bpm: number; score: number }[];
}

/**
 * How many whole beats a loop spans.
 *
 * The answer is a small integer, which makes this an easier question than the
 * tempo: the buffer spans whole beats, so only integers need testing and the
 * tempo follows from the length. A tempo estimate 0.3% out still lands on the
 * right integer, and the error is gone rather than stored.
 *
 * Scoring is the mean onset strength on the beat grid, at the phase that fits
 * best, times the usual tempo prior. `phase` comes back with it because
 * finding the grid and finding where it sits are the same search.
 */
export function detectLoopBeats(
  samples: Float32Array,
  sampleRate: number,
  {
    minBPM = 60,
    maxBPM = 200,
    maxBeats = 64,
  }: { minBPM?: number; maxBPM?: number; maxBeats?: number } = {}
): LoopBeats {
  const env = onsetEnvelope(samples, sampleRate);
  const n = env.values.length;
  const seconds = samples.length / sampleRate;
  const empty = { beats: 0, bpm: 0, confidence: 0, phase: 0, alternatives: [] };
  if (n < 8 || seconds <= 0) return empty;

  const at = (x: number) => {
    // linear read, wrapped: a loop's grid runs off the end and back to the top
    const i = ((x % n) + n) % n;
    const a = Math.floor(i);
    const b = (a + 1) % n;
    const t = i - a;
    return env.values[a] * (1 - t) + env.values[b] * t;
  };

  const scored: { beats: number; bpm: number; score: number; phase: number }[] = [];
  for (let beats = 1; beats <= maxBeats; beats++) {
    const bpm = (beats * 60) / seconds;
    if (bpm < minBPM || bpm > maxBPM) continue;
    const period = n / beats;
    const steps = Math.max(8, Math.min(256, Math.round(period)));
    let bestPhase = 0;
    let bestMean = -1;
    for (let s = 0; s < steps; s++) {
      const p = (s / steps) * period;
      let sum = 0;
      for (let k = 0; k < beats; k++) sum += at(p + k * period);
      const mean = sum / beats;
      if (mean > bestMean) {
        bestMean = mean;
        bestPhase = p;
      }
    }
    scored.push({
      beats,
      bpm,
      score: bestMean * tempoPrior(bpm) * lengthPrior(beats),
      phase: (bestPhase / n) * samples.length,
    });
  }
  if (!scored.length) return empty;

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const median = scored[Math.floor(scored.length / 2)].score || 1e-9;
  return {
    beats: best.beats,
    bpm: best.bpm,
    confidence: Math.max(0, Math.min(1, 1 - median / (best.score || 1e-9))),
    phase: Math.round(best.phase),
    alternatives: scored.slice(1, 4).map(({ beats, bpm, score }) => ({
      beats,
      bpm,
      score,
    })),
  };
}

/**
 * Rate a key is analyzed at. Everything a key is made of sits under 3.5 kHz,
 * so the top two octaves of a 44.1 kHz file are cost with no information in
 * them. Dropping to 16 kHz is 2.8x fewer frames, and — because bin width is
 * rate over fftSize — it also *narrows* the bins from 5.4 Hz to 2.0 Hz at the
 * same transform size. Faster and finer at once.
 */
const KEY_RATE = 16000;

/**
 * Decimate by averaging, not by picking every nth sample. Plain subsampling
 * folds everything above the new Nyquist back down into the range the chroma
 * reads, which puts energy on pitch classes that were never played. A boxcar
 * average is a crude lowpass, and crude is enough when the content above the
 * cutoff is being discarded anyway.
 */
function decimate(
  samples: Float32Array,
  from: number,
  to: number
): Float32Array {
  if (from <= to) return samples;
  const step = from / to;
  const n = Math.floor(samples.length / step);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * step);
    const b = Math.min(samples.length, Math.floor((i + 1) * step));
    let sum = 0;
    for (let j = a; j < b; j++) sum += samples[j];
    out[i] = b > a ? sum / (b - a) : 0;
  }
  return out;
}

// ---- key -----------------------------------------------------

/**
 * How much each scale degree is used in music that is in a key. Correlating a
 * piece's own pitch-class histogram against all twenty-four rotations names
 * the key, and weighs the whole scale, so it works on a progression that never
 * plays the tonic chord.
 *
 * Temperley's profiles, fitted to the Kostka-Payne corpus, rather than the
 * Krumhansl-Schmuckler ones fitted to 1982 probe-tone listening experiments.
 * On a real 195-second track in F# minor, Krumhansl ranked F# *major* first
 * and the truth second; Temperley put F# minor first by 0.166 where Krumhansl
 * had it losing by 0.072. The parallel major/minor call is where the older
 * profiles are weakest, and it is the call this has to make.
 */
const PROFILE_MAJOR = [
  0.748, 0.06, 0.488, 0.082, 0.67, 0.46, 0.096, 0.715, 0.104, 0.366, 0.057,
  0.4,
];
const PROFILE_MINOR = [
  0.712, 0.084, 0.474, 0.618, 0.049, 0.46, 0.105, 0.747, 0.404, 0.067, 0.133,
  0.33,
];

function correlate(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? 0 : num / den;
}

export interface KeyEstimate {
  root: Notation;
  mode: "major" | "minor";
  /** 0–1, from the gap between the winning correlation and the runner-up. */
  confidence: number;
  /** Energy per pitch class, C first, normalized to a 1 peak. */
  chroma: number[];
  /** True when there is too little pitched content to name a key at all. */
  atonal: boolean;
  runnerUp: { root: Notation; mode: "major" | "minor" } | null;
}

/**
 * Twelve-bin pitch-class histogram from spectral peaks.
 *
 * Peaks only. Every bin would let a loud partial smear across the histogram,
 * and a bin quieter than the one beside it is a harmonic rather than a note.
 * `DetectTone` filters its bands the same way.
 */
export function chromagram(
  samples: Float32Array,
  sampleRate: number,
  { fftSize = 8192, hop = 4096, minHz = 55, maxHz = 2200 } = {}
): number[] {
  const chroma = new Array(12).fill(0);
  const frames = Math.floor((samples.length - fftSize) / hop) + 1;
  if (frames < 1) return chroma;

  const win = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++)
    win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / fftSize));

  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  const binHz = sampleRate / fftSize;
  const loBin = Math.max(1, Math.floor(minHz / binHz));
  const hiBin = Math.min(fftSize >> 1, Math.ceil(maxHz / binHz));

  const frame = new Array(12);
  for (let f = 0; f < frames; f++) {
    const off = f * hop;
    for (let i = 0; i < fftSize; i++) {
      re[i] = samples[off + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    const mag = new Float32Array(hiBin + 2);
    for (let b = loBin - 1; b <= hiBin + 1 && b < fftSize >> 1; b++)
      if (b >= 0) mag[b] = Math.hypot(re[b], im[b]);

    frame.fill(0);
    for (let b = loBin; b <= hiBin; b++) {
      if (!(mag[b] > mag[b - 1] && mag[b] >= mag[b + 1])) continue;
      // parabolic interpolation, so a partial between bins lands on its note
      const d = mag[b - 1] - 2 * mag[b] + mag[b + 1];
      const off2 = d === 0 ? 0 : (0.5 * (mag[b - 1] - mag[b + 1])) / d;
      const hz = (b + (Math.abs(off2) < 0.5 ? off2 : 0)) * binHz;
      if (hz < minHz || hz > maxHz) continue;
      const semi = Math.round(12 * Math.log2(hz / 440));
      const pc = (((semi + 9) % 12) + 12) % 12; // A440 is pitch class 9
      frame[pc] += mag[b];
    }

    // Each frame contributes equally. Summing raw magnitude instead lets the
    // loud bars of a track write the histogram and the quiet ones write
    // nothing, and on a full mix the drums win outright: the same 195-second
    // track that names its key correctly this way was flat enough unnormalized
    // to read as having no key at all.
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += frame[i];
    if (sum > 0) for (let i = 0; i < 12; i++) chroma[i] += frame[i] / sum;
  }
  const peak = Math.max(...chroma);
  return peak > 0 ? chroma.map((v) => v / peak) : chroma;
}

/**
 * Name the key of a whole buffer.
 *
 * Returns `atonal: true` rather than a confident wrong answer when there is
 * no pitched content to work from — drums, noise, a single sustained tone.
 * A caller wiring this to a form should treat that as "leave it alone", and
 * for stega-mix it maps onto a mode of `none`.
 */
export function detectKey(
  original: Float32Array,
  originalRate: number
): KeyEstimate {
  const sampleRate = Math.min(originalRate, KEY_RATE);
  const samples = decimate(original, originalRate, sampleRate);
  const chroma = chromagram(samples, sampleRate);
  const total = chroma.reduce((s, v) => s + v, 0);
  const notations = Note.notations as Notation[];

  // Correlate first, and judge afterwards. Three statistics of the histogram
  // itself were tried as an "is there a key here" gate and none of them
  // separates a dense full mix from a drum loop, because a full mix plays all
  // twelve pitch classes too:
  //
  //   real track   drums   white noise
  //   1.38         1.45    1.41        peak over median
  //   0.165        0.140   0.111       mean per-frame concentration
  //
  // The correlation does separate, though not sharply: 0.71 for the track,
  // 0.65 for the drums, 0.42 for noise. So the gate is set low enough to
  // catch only material with no pitched content at all, and everything else
  // reports a key with a confidence beside it. A drum loop gets a low number
  // and a caller can leave the field alone; a real track no longer gets
  // thrown away, which is what a stricter gate did to a 195-second track in
  // F# minor that this had correctly identified.
  if (total <= 0) {
    return {
      root: notations[0],
      mode: "major",
      confidence: 0,
      chroma,
      atonal: true,
      runnerUp: null,
    };
  }

  const results: { root: Notation; mode: "major" | "minor"; score: number }[] =
    [];
  for (let r = 0; r < 12; r++) {
    const rotated = chroma.map((_, i) => chroma[(i + r) % 12]);
    results.push({ root: notations[r], mode: "major", score: correlate(rotated, PROFILE_MAJOR) });
    results.push({ root: notations[r], mode: "minor", score: correlate(rotated, PROFILE_MINOR) });
  }
  results.sort((a, b) => b.score - a.score);

  const rootIndex = (k: { root: Notation }) => notations.indexOf(k.root);
  const sameScale = (
    a: { root: Notation; mode: string },
    b: { root: Notation; mode: string }
  ) => {
    if (a.mode === b.mode) return rootIndex(a) === rootIndex(b);
    const major = a.mode === "major" ? a : b;
    const minor = a.mode === "major" ? b : a;
    return (rootIndex(minor) + 3) % 12 === rootIndex(major) % 12;
  };

  let best = results[0];
  if (best.score < 0.5) {
    return {
      root: notations[0],
      mode: "major",
      confidence: 0,
      chroma,
      atonal: true,
      runnerUp: null,
    };
  }
  const relative = results.find((r) => r !== best && sameScale(best, r));

  // A major key and its relative minor hold the same seven notes, so the
  // profiles score them within a few hundredths and the winner is close to
  // arbitrary. A loop usually opens on its tonic, so the opening quarter
  // decides between the two. Only this pair is reconsidered: every other
  // candidate has a different scale, which the profiles do separate.
  if (relative) {
    // The bass note of the opening chord. Both halves of that are load-bearing,
    // and each was measured wrong on its own:
    //
    // Opening, because a loop usually starts on its tonic. Bass over the whole
    // loop names every chord root about equally and settled 4 of 6 test loops,
    // against 5 of 6 for the opening alone.
    //
    // Bass, because a triad's root is not reliably its loudest partial. C-Eb-G
    // measured C:0.92 Eb:0.99 G:1.00 over 55-2200 Hz, so the full range picks
    // the fifth and names the relative major.
    //
    // A quarter of the loop is one chord of four; half a second is the floor,
    // below which there are too few FFT frames to read a pitch class from.
    const head = samples.subarray(
      0,
      Math.min(
        samples.length,
        Math.max(samples.length >> 2, Math.floor(sampleRate * 0.5))
      )
    );
    const bass = chromagram(head, sampleRate, { minHz: 40, maxHz: 250 });
    const cue = bass.some((v) => v > 0) ? bass : chromagram(head, sampleRate);
    if (cue.some((v) => v > 0) && cue[rootIndex(relative)] > cue[rootIndex(best)])
      best = relative;
  }

  // Confidence is the margin over the best candidate in a different scale.
  // Measuring it against the relative would report near-zero for every key.
  const outside = results.find((r) => !sameScale(best, r));
  const next = outside ?? results[1];
  return {
    root: best.root,
    mode: best.mode,
    confidence: Math.max(0, Math.min(1, (best.score - next.score) * 3)),
    chroma,
    atonal: false,
    runnerUp: { root: next.root, mode: next.mode },
  };
}
