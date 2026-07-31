/**
 * ks-string — 4-voice Karplus-Strong string.
 *
 * Worklet source as a string. The package never resolves a worklet URL
 * itself — see WorkletHost. Same approach as clock-worker.ts.
 *
 * Origin: another-machine/avva, src/audio/worklets/ks-string.js
 */

export const KS_STRING_WORKLET = /* js */ `
/**
 * src/audio/worklets/ks-string.js
 *
 * AudioWorkletProcessor: 4-voice Karplus-Strong string synthesizer.
 * Triggered by FLUX×CTR axis signals via postMessage from synth.ts.
 *
 * Message protocol:
 *   { type:"trigger", vi:0..3, freq:Hz, gain, damp, pan }
 *     vi   = voice slot (oldest silent voice is auto-stolen by host)
 *     freq = fundamental frequency in Hz
 *     gain = initial amplitude (linear)
 *     damp = per-sample decay factor (0.990=long sustain, 0.980=short)
 *     pan  = −1..1 stereo position
 *
 *   { type:"set-pan", vi, pan }
 *     Update pan of an already-playing voice.
 */

/* global sampleRate, registerProcessor, AudioWorkletProcessor */

const VOICES  = 4;
const BUF_SZ  = 8192; // max delay samples (supports ~6 Hz at 48kHz)

class KSStringProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    const sr = sampleRate;
    this._sr = sr;

    this._active  = new Uint8Array(VOICES);
    this._damp    = new Float64Array(VOICES).fill(0.995);
    this._gain    = new Float64Array(VOICES);
    this._pan     = new Float64Array(VOICES);
    this._prevOut = new Float64Array(VOICES);

    // Ring buffers, one per voice
    this._buf     = Array.from({ length: VOICES }, () => new Float32Array(BUF_SZ));
    this._wPtr    = new Int32Array(VOICES); // write pointer
    this._delayN  = new Float64Array(VOICES); // fractional delay length

    this.port.onmessage = (e) => this._onMsg(e.data);
  }

  _onMsg(data) {
    if (data.type === "trigger") {
      const { vi, freq, gain, damp, pan } = data;
      if (vi < 0 || vi >= VOICES || !(freq > 0)) return;

      const sr  = this._sr;
      const len = sr / freq;          // fractional delay length
      const N   = Math.min(Math.ceil(len) + 1, BUF_SZ - 1);

      const buf = this._buf[vi];
      // Fill delay buffer with bandlimited noise (simple LPF: running avg of 3)
      let s0 = 0, s1 = 0;
      for (let i = 0; i < N; i++) {
        const raw = (Math.random() * 2 - 1) * gain;
        const s2 = (s0 + s1 + raw) / 3;
        buf[i] = s2;
        s0 = s1; s1 = s2;
      }
      // Zero the rest
      for (let i = N; i < BUF_SZ; i++) buf[i] = 0;

      this._delayN[vi]  = len;
      this._wPtr[vi]    = N % BUF_SZ;
      this._damp[vi]    = Math.max(0.9, Math.min(0.9999, damp ?? 0.995));
      this._gain[vi]    = gain;
      this._pan[vi]     = Math.max(-1, Math.min(1, pan ?? 0));
      this._prevOut[vi] = 0;
      this._active[vi]  = 1;
    } else if (data.type === "set-pan") {
      const { vi, pan } = data;
      if (vi >= 0 && vi < VOICES) this._pan[vi] = Math.max(-1, Math.min(1, pan));
    }
  }

  process(inputs, outputs) {
    const out = outputs[0];
    if (!out || !out[0]) return true;
    const outL = out[0];
    const outR = out.length > 1 ? out[1] : out[0];
    const n    = outL.length;

    for (let i = 0; i < n; i++) {
      let sumL = 0, sumR = 0;

      for (let v = 0; v < VOICES; v++) {
        if (!this._active[v]) continue;

        const buf     = this._buf[v];
        const wPtr    = this._wPtr[v];
        const delayN  = this._delayN[v];
        const N       = BUF_SZ;

        // Fractional read position (wPtr is where we're writing next, so the
        // delay line starts at wPtr-1 and goes back delayN samples).
        const rPos  = ((wPtr - delayN % N + N) % N);
        const ri    = rPos | 0;
        const frac  = rPos - ri;
        const r1    = (ri + 1) % N;
        const s0    = buf[ri];
        const s1    = buf[r1];
        const sample = s0 + frac * (s1 - s0);

        // Averaging lowpass + damping (single-pole KS filter)
        const filtered = 0.5 * (sample + this._prevOut[v]) * this._damp[v];
        this._prevOut[v] = sample;

        buf[wPtr] = filtered;
        this._wPtr[v] = (wPtr + 1) % N;

        // Decay detection
        if (Math.abs(filtered) < 1e-7 && Math.abs(sample) < 1e-7) {
          this._active[v] = 0;
          continue;
        }

        // Equal-power pan
        const angle = (this._pan[v] + 1) * Math.PI * 0.25;
        sumL += sample * Math.cos(angle);
        sumR += sample * Math.sin(angle);
      }

      outL[i] = sumL;
      outR[i] = sumR;
    }

    return true;
  }
}

registerProcessor("ks-string", KSStringProcessor);
`;
