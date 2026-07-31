import { cancelParam } from "./pitch";

export interface FMVoiceParams {
  audioContext: AudioContext;
  /** Where the voice's output gain connects. Usually a panner or a bus. */
  destination: AudioNode;
  /** Modulator frequency as a multiple of the carrier. 1 = same pitch. */
  ratio?: number;
  /** Modulation index. Higher is brighter and more inharmonic. */
  index?: number;
  carrierType?: OscillatorType;
  modulatorType?: OscillatorType;
}

export interface FMVoicePluckParams {
  peak?: number;
  ampDecayTau?: number;
  modDecayTau?: number;
  indexPeak?: number;
  attackTau?: number;
  /**
   * AudioContext time to play at. Defaults to now.
   *
   * Pass this to place a note on the audio clock instead of the wall clock.
   * Any lookahead scheduler — DrumMachine's, or your own — decides *ahead of
   * time* that a note belongs at a particular instant, and a voice that can
   * only ever start "now" cannot honour that. Driving one from setTimeout
   * instead puts the note wherever the timer happened to fire, which is how
   * a melody ends up drifting against a beat that is scheduled properly.
   */
  when?: number;
}

/**
 * A two-operator FM voice: modulator → modGain → carrier.frequency,
 * carrier → outGain → destination.
 *
 * The oscillators start in the constructor and never stop. A voice is a
 * persistent thing you glide and re-pluck, not a node-per-hit — starting an
 * OscillatorNode per note is what makes dense passages allocate, and the
 * retrigger crossfade in `pluck` only works if the carrier is already running.
 * For polyphony, hold a pool of these and round-robin them.
 */
export class FMVoice {
  ratio: number;
  index: number;

  readonly carrier: OscillatorNode;
  readonly modulator: OscillatorNode;
  readonly modGain: GainNode;
  readonly outGain: GainNode;

  private audioContext: AudioContext;
  private carrierFrequency: number;

  constructor({
    audioContext,
    destination,
    ratio = 1,
    index = 0,
    carrierType = "sine",
    modulatorType = "sine",
  }: FMVoiceParams) {
    this.audioContext = audioContext;
    this.ratio = ratio;
    this.index = index;
    this.carrierFrequency = 220;

    this.carrier = audioContext.createOscillator();
    this.modulator = audioContext.createOscillator();
    this.modGain = audioContext.createGain();
    this.outGain = audioContext.createGain();

    this.carrier.type = carrierType;
    this.modulator.type = modulatorType;

    this.carrier.frequency.value = this.carrierFrequency;
    const modulatorFrequency = this.carrierFrequency * this.ratio;
    this.modulator.frequency.value = modulatorFrequency;
    this.modGain.gain.value = this.index * modulatorFrequency;
    this.outGain.gain.value = 0;

    this.modulator.connect(this.modGain);
    this.modGain.connect(this.carrier.frequency);

    this.carrier.connect(this.outGain);
    this.outGain.connect(destination);

    this.modulator.start();
    this.carrier.start();
  }

  /** Glide carrier frequency over `tau` seconds. */
  glideTo(frequency: number, tau: number): void {
    if (!Number.isFinite(frequency) || frequency <= 0) return;
    this.carrierFrequency = frequency;
    const now = this.audioContext.currentTime;
    const modulatorFrequency = frequency * this.ratio;
    cancelParam(this.carrier.frequency, now);
    this.carrier.frequency.setTargetAtTime(frequency, now, tau);
    cancelParam(this.modulator.frequency, now);
    this.modulator.frequency.setTargetAtTime(modulatorFrequency, now, tau);
    cancelParam(this.modGain.gain, now);
    this.modGain.gain.setTargetAtTime(
      this.index * modulatorFrequency,
      now,
      tau
    );
  }

  /** Glide modulation index — timbre brightness. */
  setIndex(index: number, tau: number): void {
    if (!Number.isFinite(index)) return;
    this.index = Math.max(0, index);
    const now = this.audioContext.currentTime;
    const modulatorFrequency = this.carrierFrequency * this.ratio;
    cancelParam(this.modGain.gain, now);
    this.modGain.gain.setTargetAtTime(
      this.index * modulatorFrequency,
      now,
      tau
    );
  }

  /** Glide modulator ratio — detunes sidebands for chorus and inharmonic tones. */
  setRatio(ratio: number, tau: number): void {
    if (!Number.isFinite(ratio) || ratio <= 0) return;
    this.ratio = ratio;
    const now = this.audioContext.currentTime;
    const modulatorFrequency = this.carrierFrequency * ratio;
    cancelParam(this.modulator.frequency, now);
    this.modulator.frequency.setTargetAtTime(modulatorFrequency, now, tau);
    cancelParam(this.modGain.gain, now);
    this.modGain.gain.setTargetAtTime(
      this.index * modulatorFrequency,
      now,
      tau
    );
  }

  /** Glide output amplitude. */
  setGain(gain: number, tau: number): void {
    if (!Number.isFinite(gain)) return;
    const now = this.audioContext.currentTime;
    cancelParam(this.outGain.gain, now);
    this.outGain.gain.setTargetAtTime(Math.max(0, gain), now, tau);
  }

  /**
   * Trigger a one-shot pluck. The modulation-depth envelope decays faster than
   * the amplitude envelope, which is the classic DX7 arc — bright on the
   * transient, mellow on the tail.
   *
   * The 3 ms crossfade at the top is not cosmetic. Re-plucking a voice whose
   * previous decay is still running means cancelScheduledValues plus
   * setValueAtTime(0) yanks a mid-decay amplitude straight to zero, and that
   * discontinuity clicks. Fading to silence first makes the frequency snap
   * inaudible.
   */
  pluck(frequency: number, params: FMVoicePluckParams = {}): void {
    if (!Number.isFinite(frequency) || frequency <= 0) return;

    const {
      peak = 0.12,
      ampDecayTau = 0.18,
      modDecayTau = ampDecayTau * 0.35,
      indexPeak = this.index * 4,
      attackTau = 0.003,
      when,
    } = params;

    const now = this.audioContext.currentTime;
    // A time already in the past would schedule nothing, so clamp it forward.
    const at = when !== undefined && when > now ? when : now;
    const crossfade = 0.003;
    const start = at + crossfade;
    const modulatorFrequency = frequency * this.ratio;
    this.carrierFrequency = frequency;

    // The fade-out is anchored at `at`, not at `now`. Anchoring it to now
    // would silence a still-ringing note the moment this call happens, which
    // for a note scheduled 100 ms out means an audible hole before it starts.
    cancelParam(this.outGain.gain, at);
    this.outGain.gain.setTargetAtTime(0, at, 0.001);

    this.carrier.frequency.cancelScheduledValues(at);
    this.modulator.frequency.cancelScheduledValues(at);
    this.carrier.frequency.setValueAtTime(frequency, start);
    this.modulator.frequency.setValueAtTime(modulatorFrequency, start);

    this.modGain.gain.cancelScheduledValues(at);
    this.modGain.gain.setValueAtTime(0, start);
    this.modGain.gain.setTargetAtTime(
      indexPeak * modulatorFrequency,
      start,
      attackTau
    );
    this.modGain.gain.setTargetAtTime(
      0,
      start + attackTau * 4,
      modDecayTau
    );

    this.outGain.gain.setValueAtTime(0, start);
    this.outGain.gain.setTargetAtTime(peak, start, attackTau);
    this.outGain.gain.setTargetAtTime(0, start + attackTau * 5, ampDecayTau);
  }

  disconnect(): void {
    this.outGain.disconnect();
    this.modGain.disconnect();
    this.carrier.disconnect();
    this.modulator.disconnect();
  }
}
