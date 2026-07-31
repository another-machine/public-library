import { pitchClassToFrequency } from "./pitch";

/** High enough to stay pitched, low enough to keep the noise audible as noise. */
const BAND_Q = 28;
/** Resonators allocated up front, one per chord note. */
const BAND_COUNT = 5;
const NOISE_SECONDS = 4;

export interface NoiseLayerParams {
  audioContext: AudioContext;
  bus: GainNode;
}

export interface NoiseLayerUpdateParams {
  /** Active pitch classes, root first. */
  pitchClasses: number[];
  octave: number;
  /** Layer weight, 0 to 1. */
  weight: number;
  /** AudioContext.currentTime. */
  now: number;
  /** Smoothing time constant in seconds. */
  tau: number;
}

/**
 * Looped white noise through a bank of high-Q bandpass filters tuned to the
 * current chord — an airy textural wash instead of another pad.
 *
 * At Q 28 each band is narrow enough that the result still reads as pitched to
 * a chroma analyzer, which matters if something downstream is listening to
 * this output and trying to name the chord.
 */
export class NoiseLayer {
  private readonly noise: AudioBufferSourceNode;
  private readonly bands: { filter: BiquadFilterNode; gain: GainNode }[];
  private readonly outGain: GainNode;
  private currentWeight = 0;

  constructor({ audioContext, bus }: NoiseLayerParams) {
    const buffer = audioContext.createBuffer(
      1,
      Math.floor(NOISE_SECONDS * audioContext.sampleRate),
      audioContext.sampleRate
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.noise = audioContext.createBufferSource();
    this.noise.buffer = buffer;
    this.noise.loop = true;

    this.outGain = audioContext.createGain();
    this.outGain.gain.value = 0;
    this.outGain.connect(bus);

    this.bands = Array.from({ length: BAND_COUNT }, () => {
      const filter = audioContext.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 440;
      filter.Q.value = BAND_Q;
      const gain = audioContext.createGain();
      gain.gain.value = 0;
      this.noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.outGain);
      return { filter, gain };
    });

    this.noise.start();
  }

  update({
    pitchClasses,
    octave,
    weight,
    now,
    tau,
  }: NoiseLayerUpdateParams): void {
    this.currentWeight = weight;

    const activeCount = Math.min(pitchClasses.length, BAND_COUNT);
    // Uncorrelated bands sum in power, not amplitude, so hold total power
    // steady with 1/√n rather than 1/n — dividing by n would make a five-note
    // chord noticeably quieter than a three-note one.
    const compensation = activeCount > 0 ? 1 / Math.sqrt(activeCount) : 1;
    this.outGain.gain.setTargetAtTime(
      weight * 0.35 * compensation,
      now,
      tau
    );

    for (let index = 0; index < BAND_COUNT; index++) {
      const { filter, gain } = this.bands[index];
      if (index < activeCount) {
        const frequency = pitchClassToFrequency(pitchClasses[index], octave);
        if (Number.isFinite(frequency) && frequency > 20) {
          filter.frequency.setTargetAtTime(frequency, now, tau);
        }
        gain.gain.setTargetAtTime(1, now, tau);
      } else {
        gain.gain.setTargetAtTime(0, now, tau);
      }
    }
  }

  get weight(): number {
    return this.currentWeight;
  }

  disconnect(): void {
    this.noise.stop();
    this.noise.disconnect();
    for (const { filter, gain } of this.bands) {
      filter.disconnect();
      gain.disconnect();
    }
    this.outGain.disconnect();
  }
}
