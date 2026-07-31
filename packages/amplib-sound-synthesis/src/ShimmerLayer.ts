import { pitchClassToFrequency } from "./pitch";

/** Slow AM rates, one per voice. Deliberately not harmonically related. */
const LFO_RATES = [0.08, 0.13];
/** Octaves above the root, one per voice. */
const OCTAVES_UP = [1, 2];

export interface ShimmerLayerParams {
  audioContext: AudioContext;
  bus: GainNode;
}

export interface ShimmerLayerUpdateParams {
  rootPitchClass: number;
  /** Base octave of the pads this sits above. */
  octave: number;
  /** Horizontal position 0 to 1, for a little pan drift. */
  position: number;
  /** Layer weight, 0 to 1. */
  weight: number;
  /** AudioContext.currentTime. */
  now: number;
  /** Smoothing time constant in seconds. */
  tau: number;
}

/**
 * Two sine voices an octave and two octaves above the root, each under a very
 * slow amplitude LFO.
 *
 * The two LFO rates are close but not equal, and each gets a small random
 * detune at construction. That is the whole trick: matched rates would beat
 * against each other in a fixed audible cycle, whereas slightly mismatched
 * ones drift in and out of phase and never quite repeat. It reads as glassy
 * rather than as two oscillators pulsing.
 */
export class ShimmerLayer {
  private readonly voices: {
    carrier: OscillatorNode;
    lfo: OscillatorNode;
    lfoDepth: GainNode;
    outGain: GainNode;
    panner: StereoPannerNode;
  }[];
  private readonly outGain: GainNode;
  private currentWeight = 0;

  constructor({ audioContext, bus }: ShimmerLayerParams) {
    this.outGain = audioContext.createGain();
    this.outGain.gain.value = 0;
    this.outGain.connect(bus);

    this.voices = LFO_RATES.map((rate, index) => {
      const carrier = audioContext.createOscillator();
      carrier.type = "sine";
      carrier.frequency.value = 880;

      const lfo = audioContext.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = rate + (Math.random() * 0.04 - 0.02);
      const lfoDepth = audioContext.createGain();
      lfoDepth.gain.value = 0.4;

      const outGain = audioContext.createGain();
      outGain.gain.value = 0.5;

      const panner = audioContext.createStereoPanner();
      panner.pan.value = index === 0 ? -0.4 : 0.4;

      lfo.connect(lfoDepth);
      lfoDepth.connect(outGain.gain);
      carrier.connect(panner);
      panner.connect(outGain);
      outGain.connect(this.outGain);

      carrier.start();
      lfo.start();

      return { carrier, lfo, lfoDepth, outGain, panner };
    });
  }

  update({
    rootPitchClass,
    octave,
    position,
    weight,
    now,
    tau,
  }: ShimmerLayerUpdateParams): void {
    this.currentWeight = weight;
    this.outGain.gain.setTargetAtTime(weight * 0.12, now, tau);

    for (let index = 0; index < this.voices.length; index++) {
      const { carrier, panner } = this.voices[index];
      const frequency = pitchClassToFrequency(
        rootPitchClass,
        octave + OCTAVES_UP[index]
      );
      if (Number.isFinite(frequency) && frequency > 0 && frequency < 20000) {
        carrier.frequency.setTargetAtTime(frequency, now, tau);
      }
      const basePan = index === 0 ? -0.4 : 0.4;
      panner.pan.setTargetAtTime(basePan + (position - 0.5) * 0.3, now, tau);
    }
  }

  get weight(): number {
    return this.currentWeight;
  }

  disconnect(): void {
    for (const { carrier, lfo, lfoDepth, outGain, panner } of this.voices) {
      carrier.stop();
      lfo.stop();
      carrier.disconnect();
      lfo.disconnect();
      lfoDepth.disconnect();
      outGain.disconnect();
      panner.disconnect();
    }
    this.outGain.disconnect();
  }
}
