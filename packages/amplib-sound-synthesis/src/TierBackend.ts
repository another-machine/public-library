import { FMVoice } from "./FMVoice";
import { cancelParam } from "./pitch";

/**
 * Both backends are fixed at five voices because the fm-tier worklet's
 * parameter buffer is laid out for five. Changing this means changing the
 * worklet's stride too.
 */
export const TIER_VOICE_COUNT = 5;

/**
 * One five-voice FM tier, behind an interface with two implementations.
 *
 * The point is that a caller's update loop is engine-agnostic: write params
 * through the setters, call flush once a frame, and it does not matter whether
 * the voices are a node graph or a worklet. That also makes the two directly
 * A/B-able, which is the only honest way to tell whether the worklet actually
 * sounds better or just different.
 */
export interface TierBackend {
  readonly voiceCount: number;
  /** Wire the voice outputs into a bus. Call once, after construction. */
  connect(bus: GainNode): void;
  /**
   * AudioParams a wow/flutter LFO can drive — one per carrier in node mode,
   * a single shared param in worklet mode.
   */
  detuneTargets(): AudioParam[];
  glideTo(voice: number, frequency: number, tau: number): void;
  setIndex(voice: number, index: number, tau: number): void;
  setRatio(voice: number, ratio: number, tau: number): void;
  setGain(voice: number, gain: number, tau: number): void;
  /**
   * `now` is AudioContext.currentTime. NodeTierBackend needs it to cancel
   * automation; WorkletTierBackend ignores it and smooths per-sample.
   */
  setPan(voice: number, pan: number, tau: number, now: number): void;
  setCarrierWave(voice: number, name: string): void;
  /** Push buffered params to the worklet. A no-op on the node backend. */
  flush(): void;
}

export interface NodeTierBackendParams {
  audioContext: AudioContext;
  /** Starting modulator ratio for every voice. */
  ratio: number;
  /**
   * Sets a carrier's waveform by name. Supplied by the caller so a shared
   * PeriodicWave cache can be reused rather than rebuilt per voice.
   */
  applyWave: (oscillator: OscillatorNode, name: string) => void;
}

interface NodeVoice {
  voice: FMVoice;
  panner: StereoPannerNode;
}

/**
 * The node-graph tier: an FMVoice and a StereoPannerNode per voice. Safe
 * default, and the reference the worklet backend gets compared against.
 */
export class NodeTierBackend implements TierBackend {
  readonly voiceCount = TIER_VOICE_COUNT;
  private readonly voices: NodeVoice[];
  private readonly applyWave: (
    oscillator: OscillatorNode,
    name: string
  ) => void;

  constructor({ audioContext, ratio, applyWave }: NodeTierBackendParams) {
    this.applyWave = applyWave;
    this.voices = Array.from({ length: TIER_VOICE_COUNT }, () => {
      const panner = audioContext.createStereoPanner();
      panner.pan.value = 0;
      const voice = new FMVoice({
        audioContext,
        destination: panner,
        ratio,
        index: 0.4,
      });
      return { voice, panner };
    });
  }

  connect(bus: GainNode): void {
    for (const { panner } of this.voices) panner.connect(bus);
  }

  detuneTargets(): AudioParam[] {
    return this.voices.map(({ voice }) => voice.carrier.detune);
  }

  glideTo(voice: number, frequency: number, tau: number): void {
    this.voices[voice].voice.glideTo(frequency, tau);
  }

  setIndex(voice: number, index: number, tau: number): void {
    this.voices[voice].voice.setIndex(index, tau);
  }

  setRatio(voice: number, ratio: number, tau: number): void {
    this.voices[voice].voice.setRatio(ratio, tau);
  }

  setGain(voice: number, gain: number, tau: number): void {
    this.voices[voice].voice.setGain(gain, tau);
  }

  setPan(voice: number, pan: number, tau: number, now: number): void {
    if (!Number.isFinite(pan)) return;
    const clamped = Math.max(-1, Math.min(1, pan));
    cancelParam(this.voices[voice].panner.pan, now);
    this.voices[voice].panner.pan.setTargetAtTime(clamped, now, tau);
  }

  setCarrierWave(voice: number, name: string): void {
    this.applyWave(this.voices[voice].voice.carrier, name);
  }

  flush(): void {
    // Nothing buffered — every write went straight to an AudioParam.
  }
}

const PARAMS_PER_VOICE = 10;
const PARAM_BUFFER_SIZE = TIER_VOICE_COUNT * PARAMS_PER_VOICE;

/**
 * The worklet tier: one fm-tier AudioWorkletNode carrying all five voices.
 *
 * Parameter writes accumulate in a Float32Array and go across in a single
 * postMessage per flush, i.e. once a frame. Posting per setter instead would
 * put dozens of messages a frame on the control bus, and that backs up long
 * before the audio thread does.
 *
 * Requires the fm-tier module to be loaded first — see loadFMTierWorklet.
 */
export class WorkletTierBackend implements TierBackend {
  readonly voiceCount = TIER_VOICE_COUNT;
  private readonly node: AudioWorkletNode;
  /** [freq, freqTau, index, indexTau, ratio, ratioTau, gain, gainTau, pan, panTau] × 5 */
  private readonly buffer: Float32Array;

  constructor({ audioContext }: { audioContext: AudioContext }) {
    this.node = new AudioWorkletNode(audioContext, "fm-tier", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: "explicit",
    });
    this.buffer = new Float32Array(PARAM_BUFFER_SIZE);
    for (let voice = 0; voice < TIER_VOICE_COUNT; voice++) {
      const offset = voice * PARAMS_PER_VOICE;
      this.buffer[offset + 0] = 220; // frequency
      this.buffer[offset + 2] = 0.4; // index
      this.buffer[offset + 4] = 1; // ratio
    }
  }

  connect(bus: GainNode): void {
    this.node.connect(bus);
  }

  /**
   * A single "detune" param shared by all five voices. Wow and flutter both
   * connect to it and sum, exactly as they do across the five separate
   * carriers in node mode.
   */
  detuneTargets(): AudioParam[] {
    const param = this.node.parameters.get("detune");
    return param ? [param] : [];
  }

  glideTo(voice: number, frequency: number, tau: number): void {
    const offset = voice * PARAMS_PER_VOICE;
    this.buffer[offset + 0] = frequency;
    this.buffer[offset + 1] = tau;
  }

  setIndex(voice: number, index: number, tau: number): void {
    const offset = voice * PARAMS_PER_VOICE;
    this.buffer[offset + 2] = index;
    this.buffer[offset + 3] = tau;
  }

  setRatio(voice: number, ratio: number, tau: number): void {
    const offset = voice * PARAMS_PER_VOICE;
    this.buffer[offset + 4] = ratio;
    this.buffer[offset + 5] = tau;
  }

  setGain(voice: number, gain: number, tau: number): void {
    const offset = voice * PARAMS_PER_VOICE;
    this.buffer[offset + 6] = gain;
    this.buffer[offset + 7] = tau;
  }

  setPan(voice: number, pan: number, tau: number, _now: number): void {
    const offset = voice * PARAMS_PER_VOICE;
    this.buffer[offset + 8] = pan;
    this.buffer[offset + 9] = tau;
  }

  setCarrierWave(voice: number, name: string): void {
    // `vi` is the worklet's wire format, not a stray abbreviation — fm-tier
    // reads data.vi. Renaming it here fails silently: no error, waveforms
    // just stop changing.
    this.node.port.postMessage({ type: "wave", vi: voice, name });
  }

  flush(): void {
    // Structured clone of 200 bytes, cheaper than allocating a fresh array.
    this.node.port.postMessage({ type: "params", voices: this.buffer });
  }
}
