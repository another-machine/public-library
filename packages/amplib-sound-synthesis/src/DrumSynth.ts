export interface DrumSynthParams {
  audioContext: AudioContext;
  /** Where the drum bus connects — typically a layer sum or a bus GainNode. */
  destination: AudioNode;
}

/**
 * Sample-free percussive voices.
 *
 * Every hit builds its own nodes, schedules them, and lets them fall out of
 * scope once stopped. That is the right shape here and the wrong shape for a
 * pitched voice: drums are short and sparse, so the allocation never stacks
 * up, and each hit wants its own envelope from silence rather than a
 * retrigger crossfade.
 */
export class DrumSynth {
  readonly audioContext: AudioContext;

  private readonly bus: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly echoDelay: DelayNode;
  private readonly echoFeedback: GainNode;
  private readonly echoDamp: BiquadFilterNode;
  private readonly echoWet: GainNode;
  private readonly noiseBuffer: AudioBuffer;

  constructor({ audioContext, destination }: DrumSynthParams) {
    this.audioContext = audioContext;
    this.bus = audioContext.createGain();
    this.bus.gain.value = 0.7;

    // Character chain: bus → lowpass → out, with a damped echo tap alongside.
    // Both are neutral by default — filter wide open, echo fully dry.
    this.filter = audioContext.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 12000;
    this.filter.Q.value = 0.7;
    this.bus.connect(this.filter);
    this.filter.connect(destination);

    this.echoDelay = audioContext.createDelay(1);
    this.echoDelay.delayTime.value = 0.22;
    this.echoFeedback = audioContext.createGain();
    this.echoFeedback.gain.value = 0.35;
    this.echoDamp = audioContext.createBiquadFilter();
    this.echoDamp.type = "lowpass";
    this.echoDamp.frequency.value = 3500;
    this.echoWet = audioContext.createGain();
    this.echoWet.gain.value = 0;
    this.filter.connect(this.echoDelay);
    this.echoDelay.connect(this.echoDamp);
    // Damping sits inside the feedback loop, so each repeat is darker than the
    // one before it rather than every repeat being equally bright.
    this.echoDamp.connect(this.echoFeedback);
    this.echoFeedback.connect(this.echoDelay);
    this.echoDamp.connect(this.echoWet);
    this.echoWet.connect(destination);

    // One half-second noise buffer, reused by every noise-based voice. The
    // snare and hats read it at different filter settings, so they do not need
    // separate noise, and generating it per hit is pure waste.
    const length = Math.floor(audioContext.sampleRate * 0.5);
    this.noiseBuffer = audioContext.createBuffer(
      1,
      length,
      audioContext.sampleRate
    );
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }

  setVolume(value: number): void {
    this.bus.gain.setTargetAtTime(
      Math.max(0, Math.min(1, value)),
      this.audioContext.currentTime,
      0.02
    );
  }

  setFilter({ frequency, q }: { frequency: number; q: number }): void {
    const now = this.audioContext.currentTime;
    this.filter.frequency.setTargetAtTime(Math.max(100, frequency), now, 0.03);
    this.filter.Q.setTargetAtTime(Math.max(0.1, Math.min(12, q)), now, 0.03);
  }

  setEcho({
    timeMs,
    feedback,
    wet,
  }: {
    timeMs: number;
    feedback: number;
    wet: number;
  }): void {
    const now = this.audioContext.currentTime;
    this.echoDelay.delayTime.setTargetAtTime(
      Math.max(0.01, Math.min(1, timeMs / 1000)),
      now,
      0.05
    );
    // Capped below 1 so the loop always decays. At 1 it self-oscillates and
    // gets louder forever.
    this.echoFeedback.gain.setTargetAtTime(
      Math.max(0, Math.min(0.9, feedback)),
      now,
      0.03
    );
    this.echoWet.gain.setTargetAtTime(Math.max(0, Math.min(1, wet)), now, 0.03);
  }

  /** Sine with a 150 → 45 Hz pitch drop over 50 ms. */
  kick(time: number, velocity = 1): void {
    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(150, time);
    oscillator.frequency.exponentialRampToValueAtTime(45, time + 0.05);
    gain.gain.setValueAtTime(velocity, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
    oscillator.connect(gain);
    gain.connect(this.bus);
    oscillator.start(time);
    oscillator.stop(time + 0.36);
  }

  /** A 200 Hz body under a high-passed noise snap. */
  snare(time: number, velocity = 1): void {
    const bodyOscillator = this.audioContext.createOscillator();
    const bodyGain = this.audioContext.createGain();
    bodyOscillator.type = "sine";
    bodyOscillator.frequency.value = 200;
    bodyGain.gain.setValueAtTime(velocity * 0.6, time);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
    bodyOscillator.connect(bodyGain);
    bodyGain.connect(this.bus);
    bodyOscillator.start(time);
    bodyOscillator.stop(time + 0.09);

    this.noiseHit({
      time,
      velocity: velocity * 0.5,
      decay: 0.12,
      type: "highpass",
      frequency: 1500,
      q: 0.7,
    });
  }

  hihatClosed(time: number, velocity = 1): void {
    this.noiseHit({
      time,
      velocity: velocity * 0.3,
      decay: 0.05,
      type: "highpass",
      frequency: 8000,
      q: 0.5,
    });
  }

  hihatOpen(time: number, velocity = 1): void {
    this.noiseHit({
      time,
      velocity: velocity * 0.25,
      decay: 0.3,
      type: "highpass",
      frequency: 6000,
      q: 0.3,
    });
  }

  rim(time: number, velocity = 1): void {
    this.noiseHit({
      time,
      velocity: velocity * 0.45,
      decay: 0.025,
      type: "bandpass",
      frequency: 1200,
      q: 2.5,
    });
  }

  /** Filtered noise burst — the snap in the snare, and all three of the metals. */
  private noiseHit({
    time,
    velocity,
    decay,
    type,
    frequency,
    q,
  }: {
    time: number;
    velocity: number;
    decay: number;
    type: BiquadFilterType;
    frequency: number;
    q: number;
  }): void {
    const source = this.audioContext.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.audioContext.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = this.audioContext.createGain();
    gain.gain.setValueAtTime(velocity, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + decay);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.bus);
    source.start(time);
    source.stop(time + decay + 0.01);
  }

  disconnect(): void {
    this.bus.disconnect();
    this.filter.disconnect();
    this.echoDelay.disconnect();
    this.echoDamp.disconnect();
    this.echoFeedback.disconnect();
    this.echoWet.disconnect();
  }
}
