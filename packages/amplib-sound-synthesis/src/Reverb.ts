import { cancelParam } from "./pitch";

/** Long enough for a hall, short of the point where the buffer cost bites. */
const MAX_SECONDS = 8;

export interface ReverbParams {
  audioContext: AudioContext;
  /** Where the wet signal goes. */
  destination: AudioNode;
  /** Tail length in seconds. */
  decaySeconds?: number;
  /**
   * Steepness of the decay curve.
   *
   * The impulse is noise shaped by `(1 - t)^power`. At 1 the tail fades
   * linearly and reads as a noise burst with an edge on it; higher powers
   * collapse the energy toward the front, which is what makes it read as a
   * room. 3 is a small warm space, 2 a larger and more diffuse one.
   */
  decayPower?: number;
  /** Wet level. This is a send — the caller keeps its own dry path. */
  wet?: number;
}

/**
 * Convolution reverb on a generated impulse, so nothing has to be fetched.
 *
 * A real recorded IR sounds better and costs a network request and a file to
 * host. Shaped noise gets most of the way there for a synth that just wants
 * some air around it, and it means the package stays self-contained the same
 * way the worklets do.
 *
 * The two channels get independent noise rather than a copy. That decorrelation
 * is the entire stereo width — the same noise in both channels would collapse
 * to a mono tail sitting in the middle of the image.
 */
export class Reverb {
  /** Connect the source into this. */
  readonly input: GainNode;

  private readonly audioContext: AudioContext;
  private readonly convolver: ConvolverNode;
  private readonly wetGain: GainNode;

  constructor({
    audioContext,
    destination,
    decaySeconds = 1.6,
    decayPower = 3,
    wet = 0.25,
  }: ReverbParams) {
    this.audioContext = audioContext;
    this.input = audioContext.createGain();

    this.convolver = audioContext.createConvolver();
    this.convolver.buffer = Reverb.impulse({
      audioContext,
      decaySeconds,
      decayPower,
    });

    this.wetGain = audioContext.createGain();
    this.wetGain.gain.value = wet;

    this.input.connect(this.convolver);
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(destination);
  }

  /**
   * Build the impulse response. Exposed because generating one is useful on
   * its own — for a ConvolverNode you are wiring by hand, or to swap a tail
   * without rebuilding the graph around it.
   */
  static impulse({
    audioContext,
    decaySeconds = 1.6,
    decayPower = 3,
  }: {
    audioContext: BaseAudioContext;
    decaySeconds?: number;
    decayPower?: number;
  }): AudioBuffer {
    const seconds = Math.min(MAX_SECONDS, Math.max(0.05, decaySeconds));
    const length = Math.max(1, Math.floor(audioContext.sampleRate * seconds));
    const buffer = audioContext.createBuffer(2, length, audioContext.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        data[i] =
          (Math.random() * 2 - 1) * Math.pow(1 - i / length, decayPower);
      }
    }
    return buffer;
  }

  /** Replace the tail. Rebuilds the impulse, so not a per-frame call. */
  setDecay(decaySeconds: number, decayPower = 3): void {
    this.convolver.buffer = Reverb.impulse({
      audioContext: this.audioContext,
      decaySeconds,
      decayPower,
    });
  }

  setWet(wet: number, tau = 0.05): void {
    const now = this.audioContext.currentTime;
    cancelParam(this.wetGain.gain, now);
    this.wetGain.gain.setTargetAtTime(Math.max(0, wet), now, tau);
  }

  get wet(): number {
    return this.wetGain.gain.value;
  }

  disconnect(): void {
    this.input.disconnect();
    this.convolver.disconnect();
    this.wetGain.disconnect();
  }
}
