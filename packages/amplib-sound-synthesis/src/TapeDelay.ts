import { cancelParam } from "./pitch";

/** Ceiling on delayTime, so a caller cannot ask for more than the node holds. */
const MAX_SECONDS = 2;
/** Feedback above this runs away rather than decaying. */
const MAX_FEEDBACK = 0.95;

export interface TapeDelayParams {
  audioContext: AudioContext;
  /** Where the wet signal goes. */
  destination: AudioNode;
  timeMs?: number;
  /** 0 to 0.95. Higher repeats longer. */
  feedback?: number;
  /** Lowpass inside the feedback loop, in Hz. */
  dampingHz?: number;
  /** Wet level. This is a send — the caller keeps its own dry path. */
  wet?: number;
  /**
   * Alternate repeats across the stereo field.
   *
   * Two delay lines in series, the first feeding the left channel and the
   * second the right, so a repeat lands on one side and its successor on the
   * other. Mono is one line straight through.
   */
  pingPong?: boolean;
}

/**
 * A delay whose repeats get duller as they die.
 *
 * The damping filter sits *inside* the feedback loop, so each pass through is
 * filtered again and the tail darkens cumulatively. Putting the same filter on
 * the output instead would make every repeat equally dull, which reads as a
 * muffled delay rather than a decaying one.
 *
 * Wet-only by design. An insert wants to blend its own dry, a send wants no
 * dry at all, and a class that mixes dry internally can only serve the first.
 */
export class TapeDelay {
  /** Connect the source into this. */
  readonly input: GainNode;

  private readonly audioContext: AudioContext;
  private readonly delays: DelayNode[];
  private readonly damping: BiquadFilterNode;
  private readonly feedbackGain: GainNode;
  private readonly wetGain: GainNode;
  private readonly merger?: ChannelMergerNode;

  constructor({
    audioContext,
    destination,
    timeMs = 250,
    feedback = 0.3,
    dampingHz = 3200,
    wet = 0.3,
    pingPong = false,
  }: TapeDelayParams) {
    this.audioContext = audioContext;
    this.input = audioContext.createGain();

    this.damping = audioContext.createBiquadFilter();
    this.damping.type = "lowpass";
    this.damping.frequency.value = dampingHz;

    this.feedbackGain = audioContext.createGain();
    this.feedbackGain.gain.value = Math.min(MAX_FEEDBACK, Math.max(0, feedback));

    this.wetGain = audioContext.createGain();
    this.wetGain.gain.value = wet;
    this.wetGain.connect(destination);

    const seconds = Math.min(MAX_SECONDS, Math.max(0, timeMs / 1000));
    const makeDelay = () => {
      const delay = audioContext.createDelay(MAX_SECONDS);
      delay.delayTime.value = seconds;
      return delay;
    };

    if (pingPong) {
      const left = makeDelay();
      const right = makeDelay();
      this.delays = [left, right];
      this.merger = audioContext.createChannelMerger(2);

      this.input.connect(left);
      left.connect(this.merger, 0, 0);
      left.connect(right);
      right.connect(this.merger, 0, 1);
      // The loop closes from the second line back to the first, so the
      // alternation continues into the tail instead of only the first repeat.
      right.connect(this.damping);
      this.damping.connect(this.feedbackGain);
      this.feedbackGain.connect(left);

      this.merger.connect(this.wetGain);
    } else {
      const delay = makeDelay();
      this.delays = [delay];
      this.input.connect(delay);
      delay.connect(this.damping);
      this.damping.connect(this.feedbackGain);
      this.feedbackGain.connect(delay);
      delay.connect(this.wetGain);
    }
  }

  setTime(timeMs: number, tau = 0.05): void {
    const seconds = Math.min(MAX_SECONDS, Math.max(0, timeMs / 1000));
    const now = this.audioContext.currentTime;
    for (const delay of this.delays) {
      cancelParam(delay.delayTime, now);
      delay.delayTime.setTargetAtTime(seconds, now, tau);
    }
  }

  /** Clamped to 0.95 — at 1 the loop sustains instead of decaying. */
  setFeedback(feedback: number, tau = 0.05): void {
    const now = this.audioContext.currentTime;
    cancelParam(this.feedbackGain.gain, now);
    this.feedbackGain.gain.setTargetAtTime(
      Math.min(MAX_FEEDBACK, Math.max(0, feedback)),
      now,
      tau
    );
  }

  setDamping(dampingHz: number, tau = 0.05): void {
    const now = this.audioContext.currentTime;
    cancelParam(this.damping.frequency, now);
    this.damping.frequency.setTargetAtTime(dampingHz, now, tau);
  }

  setWet(wet: number, tau = 0.05): void {
    const now = this.audioContext.currentTime;
    cancelParam(this.wetGain.gain, now);
    this.wetGain.gain.setTargetAtTime(Math.max(0, wet), now, tau);
  }

  get wet(): number {
    return this.wetGain.gain.value;
  }

  /** Tap the wet output, for feeding a reverb the delayed signal too. */
  get output(): GainNode {
    return this.wetGain;
  }

  disconnect(): void {
    this.input.disconnect();
    for (const delay of this.delays) delay.disconnect();
    this.damping.disconnect();
    this.feedbackGain.disconnect();
    this.merger?.disconnect();
    this.wetGain.disconnect();
  }
}
