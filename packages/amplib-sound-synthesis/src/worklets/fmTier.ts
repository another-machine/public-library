/**
 * fm-tier — 5-voice stereo FM tier.
 *
 * Worklet source as a string. The package never resolves a worklet URL
 * itself — see WorkletHost. Same approach as clock-worker.ts.
 *
 * Origin: another-machine/avva, src/audio/worklets/fm-tier.js
 */

export const FM_TIER_WORKLET = /* js */ `
/**
 * src/audio/worklets/fm-tier.js
 *
 * AudioWorkletProcessor: 5-voice 2-operator FM synthesizer (one per tier).
 * Replaces 5×(carrier+modulator+modGain+outGain+panner) node-graph with a
 * single worklet that processes all voices at sample rate.
 *
 * Key features vs the node-graph FM:
 *   • Phase-accumulator oscillators with wavetable carrier lookup
 *   • 2× oversampling + 2-point averaging decimation
 *   • Nyquist-based FM index ceiling (principal harshness fix)
 *   • Per-sample exponential glide on all parameters — no AudioParam races
 *   • Equal-power stereo pan per voice
 *   • "detune" AudioParam (a-rate, cents) — wow/flutter LFOs connect here
 *
 * Message protocol (main → worklet):
 *   { type:"params", voices:Float32Array(50) }
 *     voices[v*10+0] = targetFreq Hz      voices[v*10+1] = freqTau s
 *     voices[v*10+2] = FM index           voices[v*10+3] = indexTau s
 *     voices[v*10+4] = modulator ratio    voices[v*10+5] = ratioTau s
 *     voices[v*10+6] = output gain        voices[v*10+7] = gainTau s
 *     voices[v*10+8] = pan −1..1          voices[v*10+9] = panTau s
 *   { type:"wave", vi:0..4, name:string }
 */

/* global sampleRate, registerProcessor, AudioWorkletProcessor */

const VOICES   = 5;
const WAVE_N   = 32;    // harmonic count — matches synth.ts _getOrBuildWave
const WAVE_SZ  = 2048;  // wavetable resolution
const TWO_PI   = 2 * Math.PI;
const QPAN     = Math.PI / 4; // equal-power angle scale: (pan+1)*QPAN → 0..π/2

// ── wavetable builders ────────────────────────────────────────────────────────

function buildSine() {
  const t = new Float32Array(WAVE_SZ);
  for (let n = 0; n < WAVE_SZ; n++) t[n] = Math.sin((TWO_PI * n) / WAVE_SZ);
  return t;
}

/** Build wavetable from Fourier coefficients. Normalizes to peak = 1.0. */
function buildFromHarmonics(real, imag) {
  const r  = real || new Float64Array(WAVE_N);
  const im = imag || new Float64Array(WAVE_N);
  const t  = new Float32Array(WAVE_SZ);
  for (let n = 0; n < WAVE_SZ; n++) {
    const ph = (TWO_PI * n) / WAVE_SZ;
    let s = r[0];
    for (let k = 1; k < WAVE_N; k++) s += r[k] * Math.cos(k * ph) - im[k] * Math.sin(k * ph);
    t[n] = s;
  }
  let peak = 0;
  for (let n = 0; n < WAVE_SZ; n++) { const a = Math.abs(t[n]); if (a > peak) peak = a; }
  if (peak > 1e-10) { const inv = 1 / peak; for (let n = 0; n < WAVE_SZ; n++) t[n] *= inv; }
  return t;
}

function h_triangle() {
  const im = new Float64Array(WAVE_N);
  for (let n = 1; n < WAVE_N; n += 2) {
    im[n] = (((n - 1) / 2) % 2 === 0 ? 1 : -1) * (8 / (Math.PI * Math.PI)) / (n * n);
  }
  return im;
}
function h_square() {
  const im = new Float64Array(WAVE_N);
  for (let n = 1; n < WAVE_N; n += 2) im[n] = (4 / Math.PI) / n;
  return im;
}
function h_sawtooth() {
  const im = new Float64Array(WAVE_N);
  for (let n = 1; n < WAVE_N; n++) im[n] = (n % 2 === 0 ? -1 : 1) * 2 / (Math.PI * n);
  return im;
}
function h_softsaw() {
  const im = new Float64Array(WAVE_N);
  for (let n = 1; n < WAVE_N; n++) im[n] = ((2 / Math.PI) * (n % 2 === 0 ? -1 : 1)) / (n * n);
  return im;
}
function h_softsquare() {
  const im = new Float64Array(WAVE_N);
  for (let n = 1; n < WAVE_N; n += 2) im[n] = (4 / Math.PI) / (n * n);
  return im;
}
function h_softtri() {
  const im = new Float64Array(WAVE_N);
  for (let n = 1; n < WAVE_N; n += 2)
    im[n] = (((n - 1) / 2) % 2 === 0 ? 1 : -1) * (8 / (Math.PI * Math.PI)) / (n * n * n * n);
  return im;
}
function h_pwm(duty) {
  const r = new Float64Array(WAVE_N);
  for (let n = 1; n < WAVE_N; n++) r[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
  return r;
}
function h_chip() {
  const im = new Float64Array(WAVE_N);
  for (let n = 1; n <= 9 && n < WAVE_N; n += 2) im[n] = (4 / Math.PI) / n;
  return im;
}
function h_organ() {
  const im = new Float64Array(WAVE_N);
  im[1]=1.0; im[2]=0.8; im[3]=0.5; im[4]=0.35; im[6]=0.15;
  return im;
}
function h_reed() {
  const im = new Float64Array(WAVE_N);
  const wts = [1.0, 0.75, 0.5, 0.28, 0.15, 0.08, 0.04];
  for (let k = 0; k < wts.length; k++) { const n = 2*k+1; if (n < WAVE_N) im[n] = wts[k]; }
  return im;
}
function h_vox() {
  const im = new Float64Array(WAVE_N);
  const v = [0.7,1.0,0.85,0.4,0.2,0.15,0.3,0.55,0.45,0.25,0.12];
  for (let k = 0; k < v.length; k++) im[k+1] = v[k];
  return im;
}
function h_bell() {
  const im = new Float64Array(WAVE_N);
  im[1]=1.0; im[3]=0.7; im[5]=0.18; im[6]=0.55; im[10]=0.35; im[14]=0.18;
  return im;
}
function h_brass() {
  const im = new Float64Array(WAVE_N);
  for (let n = 1; n < WAVE_N; n++) {
    const base = 1 / n;
    const formant = Math.exp(-Math.pow((n - 4) / 2.2, 2)) * 0.6;
    im[n] = (n % 2 === 0 ? -base : base) * (0.55 + formant);
  }
  return im;
}

function buildAllWaves() {
  return {
    sine:       buildSine(),
    triangle:   buildFromHarmonics(null, h_triangle()),
    square:     buildFromHarmonics(null, h_square()),
    sawtooth:   buildFromHarmonics(null, h_sawtooth()),
    softsaw:    buildFromHarmonics(null, h_softsaw()),
    softsquare: buildFromHarmonics(null, h_softsquare()),
    softtri:    buildFromHarmonics(null, h_softtri()),
    pwm:        buildFromHarmonics(h_pwm(0.25),  null),
    pulse12:    buildFromHarmonics(h_pwm(0.125), null),
    chip:       buildFromHarmonics(null, h_chip()),
    organ:      buildFromHarmonics(null, h_organ()),
    reed:       buildFromHarmonics(null, h_reed()),
    vox:        buildFromHarmonics(null, h_vox()),
    bell:       buildFromHarmonics(null, h_bell()),
    brass:      buildFromHarmonics(null, h_brass()),
  };
}

/** Linear-interpolated wavetable lookup. phase01 ∈ [0,1). */
function wtLookup(table, phase01) {
  const pos = ((phase01 % 1 + 1) % 1) * WAVE_SZ;
  const i0  = pos | 0;
  const frac = pos - i0;
  const i1  = i0 + 1 < WAVE_SZ ? i0 + 1 : 0;
  return table[i0] + frac * (table[i1] - table[i0]);
}

// ── Processor ─────────────────────────────────────────────────────────────────

class FMTierProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{
      name: "detune",
      defaultValue: 0,
      minValue: -200,
      maxValue: 200,
      automationRate: "a-rate",
    }];
  }

  constructor() {
    super();
    const sr = sampleRate;
    this._sr  = sr;
    this._nyq = sr / 2;

    // Current smoothed parameter values
    this._fc    = new Float64Array(VOICES).fill(220);
    this._idx   = new Float64Array(VOICES).fill(0.4);
    this._ratio = new Float64Array(VOICES).fill(1.0);
    this._gain  = new Float64Array(VOICES);
    this._pan   = new Float64Array(VOICES);

    // Exponential convergence: x += alpha*(target-x); alpha=1→snap, small→slow
    this._fcAlpha    = new Float64Array(VOICES).fill(1);
    this._idxAlpha   = new Float64Array(VOICES).fill(1);
    this._ratioAlpha = new Float64Array(VOICES).fill(1);
    this._gainAlpha  = new Float64Array(VOICES).fill(1);
    this._panAlpha   = new Float64Array(VOICES).fill(1);

    // Targets (updated from postMessage)
    this._fcTgt    = new Float64Array(VOICES).fill(220);
    this._idxTgt   = new Float64Array(VOICES).fill(0.4);
    this._ratioTgt = new Float64Array(VOICES).fill(1.0);
    this._gainTgt  = new Float64Array(VOICES);
    this._panTgt   = new Float64Array(VOICES);

    // Phase accumulators (0..1 normalized)
    this._carrPh = new Float64Array(VOICES);
    this._modPh  = new Float64Array(VOICES);

    // Wavetables
    this._waveMap   = buildAllWaves();
    // Per-voice active wavetable (direct reference, no string lookup per sample)
    this._voiceWave = new Array(VOICES).fill(this._waveMap.sine);

    this.port.onmessage = (e) => this._onMsg(e.data);
  }

  /** tau=0 → alpha=1 (instant snap); tau>0 → 1−exp(−1/(tau×sr)). */
  _tau2a(tau) {
    return tau <= 0 ? 1 : 1 - Math.exp(-1 / (tau * this._sr));
  }

  _onMsg(data) {
    if (data.type === "params") {
      const v = data.voices; // Float32Array(50)
      for (let vi = 0; vi < VOICES; vi++) {
        const o = vi * 10;
        const fc    = v[o + 0]; const fTau = v[o + 1];
        const idx   = v[o + 2]; const iTau = v[o + 3];
        const ratio = v[o + 4]; const rTau = v[o + 5];
        const gain  = v[o + 6]; const gTau = v[o + 7];
        const pan   = v[o + 8]; const pTau = v[o + 9];

        if (fc    >  0) this._fcTgt[vi]    = fc;
        if (idx   >= 0) this._idxTgt[vi]   = idx;
        if (ratio >  0) this._ratioTgt[vi] = ratio;
        if (gain  >= 0) this._gainTgt[vi]  = gain;
        this._panTgt[vi] = pan;

        this._fcAlpha[vi]    = this._tau2a(fTau);
        this._idxAlpha[vi]   = this._tau2a(iTau);
        this._ratioAlpha[vi] = this._tau2a(rTau);
        this._gainAlpha[vi]  = this._tau2a(gTau);
        this._panAlpha[vi]   = this._tau2a(pTau);
      }
    } else if (data.type === "wave") {
      const vi = data.vi;
      if (vi >= 0 && vi < VOICES) {
        this._voiceWave[vi] = this._waveMap[data.name] || this._waveMap.sine;
      }
    }
  }

  process(inputs, outputs, parameters) {
    const out = outputs[0];
    if (!out || !out[0]) return true;
    const outL = out[0];
    const outR = out.length > 1 ? out[1] : out[0];
    const n    = outL.length; // 128

    const detArr    = parameters.detune;
    const detConst  = detArr.length === 1;
    const nyq       = this._nyq;
    const invOsSR   = 0.5 / this._sr; // 1/(sr×2): period at 2× oversampled rate

    for (let i = 0; i < n; i++) {
      const dc = detConst ? detArr[0] : detArr[i];
      // Detune in cents → frequency ratio (skip pow for zero)
      const dRatio = dc === 0 ? 1.0 : Math.pow(2, dc / 1200);

      let sumL = 0;
      let sumR = 0;

      for (let v = 0; v < VOICES; v++) {
        // ── Per-sample exponential param smoothing ──────────────────────────
        this._fc[v]    += this._fcAlpha[v]    * (this._fcTgt[v]    - this._fc[v]);
        this._idx[v]   += this._idxAlpha[v]   * (this._idxTgt[v]   - this._idx[v]);
        this._ratio[v] += this._ratioAlpha[v] * (this._ratioTgt[v] - this._ratio[v]);
        this._gain[v]  += this._gainAlpha[v]  * (this._gainTgt[v]  - this._gain[v]);
        this._pan[v]   += this._panAlpha[v]   * (this._panTgt[v]   - this._pan[v]);

        const fc    = this._fc[v] * dRatio;
        const ratio = this._ratio[v];
        const fm    = fc * ratio;

        // ── Sideband ceiling: clamp index so highest sideband < Nyquist ────
        // Highest sideband ≈ fc + index×fm; ceiling = (nyq−fc)/fm
        const maxIdx     = fm > 0 ? Math.max(0, (nyq - fc) / fm) : 1e6;
        const clampedIdx = Math.min(this._idx[v], maxIdx);
        const modDepth   = clampedIdx * fm; // absolute FM deviation, Hz

        // ── 2× oversampling: generate 2 samples, average for 1 output ──────
        let osSum = 0;
        for (let os = 0; os < 2; os++) {
          // Modulator phase (pure sine modulator)
          this._modPh[v] += fm * invOsSR;
          if (this._modPh[v] >= 1) this._modPh[v] -= 1;
          else if (this._modPh[v] < 0) this._modPh[v] += 1;

          const modOut = Math.sin(this._modPh[v] * TWO_PI) * modDepth;

          // Carrier phase with FM
          this._carrPh[v] += (fc + modOut) * invOsSR;
          if (this._carrPh[v] >= 1) this._carrPh[v] -= 1;
          else if (this._carrPh[v] < 0) this._carrPh[v] += 1;

          osSum += wtLookup(this._voiceWave[v], this._carrPh[v]);
        }

        // Decimate (2-point average; index ceiling keeps content well below SR/4)
        const sample = osSum * 0.5 * this._gain[v];

        // ── Equal-power stereo pan ──────────────────────────────────────────
        const angle = (this._pan[v] + 1) * QPAN; // 0..π/2
        sumL += sample * Math.cos(angle);
        sumR += sample * Math.sin(angle);
      }

      outL[i] = sumL;
      outR[i] = sumR;
    }

    return true;
  }
}

registerProcessor("fm-tier", FMTierProcessor);
`;
