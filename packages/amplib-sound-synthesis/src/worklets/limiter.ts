/**
 * lookahead-limiter — stereo lookahead limiter with LUFS metering.
 *
 * Worklet source as a string. The package never resolves a worklet URL
 * itself — see WorkletHost. Same approach as clock-worker.ts.
 *
 * Origin: another-machine/avva, src/audio/worklets/limiter.js
 */

export const LIMITER_WORKLET = /* js */ `
/**
 * src/audio/worklets/limiter.js
 *
 * Lookahead limiter + LUFS-ish short-term RMS metering.
 * Loaded via AudioContext.audioWorklet.addModule(); must be a plain JS module
 * with no imports (AudioWorklet global scope constraint).
 *
 * Algorithm:
 *   - 3 ms ring-buffer lookahead delays output so the gain envelope has time
 *     to snap before the loud sample reaches the output.
 *   - Instantaneous attack (gain snaps down when a new peak exceeds ceiling).
 *   - Exponential release (τ = 80 ms) — smooth recovery without pumping.
 *   - Ceiling: −1 dBFS (≈ 0.891 linear).
 *   - Posts { lufsShort, gr } over port at ~10 Hz.
 */

const CEIL_DB = -1;
const CEIL = Math.pow(10, CEIL_DB / 20); // ≈ 0.891
const RELEASE_TAU_S = 0.08;              // 80 ms release
const LOOKAHEAD_MS = 3;                 // 3 ms lookahead
const METER_INTERVAL_S = 0.1;           // post metrics every 100 ms
const METER_WINDOW_S = 0.4;             // 400 ms short-term RMS window

class LookaheadLimiter extends AudioWorkletProcessor {
  static get parameterDescriptors() { return []; }

  constructor() {
    super();
    this._initialized = false;
    this._gainEnv = 1.0;
    this._sqSumL = 0;
    this._sqSumR = 0;
    this._samplesSincePost = 0;
    this._meterPos = 0;
  }

  _init() {
    const sr = sampleRate;
    this._releaseCoeff = Math.exp(-1 / (RELEASE_TAU_S * sr));
    this._lookaheadSamples = Math.max(1, Math.ceil((LOOKAHEAD_MS / 1000) * sr));
    this._delayL = new Float32Array(this._lookaheadSamples);
    this._delayR = new Float32Array(this._lookaheadSamples);
    this._writePos = 0;
    this._meterSize = Math.max(1, Math.ceil(METER_WINDOW_S * sr));
    this._meterBufL = new Float32Array(this._meterSize);
    this._meterBufR = new Float32Array(this._meterSize);
    this._meterPos = 0;
    this._sqSumL = 0;
    this._sqSumR = 0;
    this._samplesSincePost = 0;
    this._postInterval = Math.max(1, Math.ceil(METER_INTERVAL_S * sr));
    this._initialized = true;
  }

  process(inputs, outputs) {
    if (!this._initialized) this._init();

    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input.length || !output || !output.length) return true;

    const inL = input[0] || new Float32Array(128);
    const inR = input[1] || inL;
    const outL = output[0];
    const outR = output[1] || output[0];

    const n = inL.length;
    const lhs = this._lookaheadSamples;
    const delL = this._delayL;
    const delR = this._delayR;
    const mBufL = this._meterBufL;
    const mBufR = this._meterBufR;
    const mSz = this._meterSize;
    const rc = this._releaseCoeff;

    let wp = this._writePos;
    let ge = this._gainEnv;
    let sqSumL = this._sqSumL;
    let sqSumR = this._sqSumR;
    let mPos = this._meterPos;
    let sincePost = this._samplesSincePost;

    for (let i = 0; i < n; i++) {
      // Oldest delayed sample (will be output this cycle)
      const dL = delL[wp];
      const dR = delR[wp];

      // Write new input into delay ring
      delL[wp] = inL[i];
      delR[wp] = inR[i];
      wp = (wp + 1) % lhs;

      // True-peak detect on the NEW input sample
      const peak = Math.max(Math.abs(inL[i]), Math.abs(inR[i]));
      const targetGain = peak > CEIL ? CEIL / Math.max(peak, 1e-9) : 1.0;

      // Gain envelope: instant attack, exponential release
      ge = targetGain < ge ? targetGain : ge * rc + targetGain * (1 - rc);

      // Apply gain to delayed sample
      const oL = dL * ge;
      const oR = dR * ge;
      outL[i] = oL;
      if (outR !== outL) outR[i] = oR;

      // Meter: running sum-of-squares over METER_WINDOW_S
      const oldL = mBufL[mPos];
      const oldR = mBufR[mPos];
      sqSumL = sqSumL - oldL * oldL + oL * oL;
      sqSumR = sqSumR - oldR * oldR + oR * oR;
      mBufL[mPos] = oL;
      mBufR[mPos] = oR;
      mPos = (mPos + 1) % mSz;
    }

    this._writePos = wp;
    this._gainEnv = ge;
    this._sqSumL = Math.max(0, sqSumL);
    this._sqSumR = Math.max(0, sqSumR);
    this._meterPos = mPos;

    this._samplesSincePost = sincePost + n;
    if (this._samplesSincePost >= this._postInterval) {
      this._samplesSincePost = 0;
      const rmsL = Math.sqrt(this._sqSumL / mSz);
      const rmsR = Math.sqrt(this._sqSumR / mSz);
      const rms = (rmsL + rmsR) * 0.5;
      const lufsShort = rms > 1e-9 ? 20 * Math.log10(rms) : -120;
      const gr = ge < 1 ? 20 * Math.log10(Math.max(ge, 1e-9)) : 0;
      this.port.postMessage({ lufsShort, gr });
    }

    return true;
  }
}

registerProcessor("lookahead-limiter", LookaheadLimiter);
`;
