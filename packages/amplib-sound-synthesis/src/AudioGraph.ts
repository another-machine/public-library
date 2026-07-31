export interface AudioGraphParams {
  audioContext: AudioContext;
}

/**
 * The bus and routing topology for a layered synth. Voices connect into the
 * named bus GainNodes; everything downstream — slotting filters, the insert
 * point, the master chain, the limiter — is wired here.
 *
 *   subBus     (LP 90) ─────┐
 *   bassBus    (HP 45/LP800)┤
 *   midBus     (HP 140) ────┼──► layerSum ──► masterTrim ──► dimGain ──► tremoloSum
 *   trebleBus  (HP 500) ────┤                                                │
 *   pluckBus   (HP 300) ────┤                                          analysisTap
 *   ksBus      (HP 200) ────┤                                                │
 *   noiseBus   (HP 100) ────┤                                          headroomPad (−6 dB)
 *   shimmerBus (HP 1k) ─────┘                                                │
 *                                                   [insert, wired by the caller]
 *                                                                            │
 *                                                                      autoMakeup
 *                                                                            │
 *                                                        safetyComp or worklet limiter
 *                                                                            │
 *                                                                      masterPanner
 *                                                                            │
 *                                                          output ──► destination
 *
 * Each bus is high-passed at the bottom of its own range. Without that,
 * every layer contributes low end and the sum turns to mud long before any
 * single layer sounds too heavy on its own.
 */
export class AudioGraph {
  readonly audioContext: AudioContext;

  readonly subBus: GainNode;
  readonly bassBus: GainNode;
  readonly midBus: GainNode;
  readonly trebleBus: GainNode;
  readonly pluckBus: GainNode;
  readonly ksBus: GainNode;
  readonly noiseBus: GainNode;
  readonly shimmerBus: GainNode;

  readonly layerSum: GainNode;

  /** User-facing master gain. */
  readonly masterTrim: GainNode;

  /**
   * Separate from masterTrim so a per-frame brightness dim and the user's own
   * volume are never writing to the same AudioParam — two writers on one param
   * means whichever ran last wins and the other silently stops working.
   */
  readonly dimGain: GainNode;

  /** Tremolo LFOs connect here, so they get a dedicated AudioParam too. */
  readonly tremoloSum: GainNode;

  /** Post-gain, pre-insert tap. Analyzers connect here. */
  readonly analysisTap: GainNode;

  /** −6 dB before the insert chain, so saturation has room to work. */
  readonly headroomPad: GainNode;

  /** Post-insert makeup. Compensates headroomPad and any insert-induced gain. */
  readonly autoMakeup: GainNode;

  readonly masterPanner: StereoPannerNode;

  readonly output: GainNode;

  private readonly safetyComp: DynamicsCompressorNode;
  /** A sandwich around the limiter stage, so it can be swapped without rewiring. */
  private readonly limiterIn: GainNode;
  private readonly limiterOut: GainNode;
  private workletLimiter: AudioWorkletNode | null = null;

  /** True once the AudioWorklet lookahead limiter has replaced the compressor. */
  get workletActive(): boolean {
    return this.workletLimiter !== null;
  }

  constructor({ audioContext }: AudioGraphParams) {
    this.audioContext = audioContext;

    this.layerSum = audioContext.createGain();
    this.layerSum.gain.value = 1;

    const makeBus = (highpass?: number, lowpass?: number): GainNode => {
      const bus = audioContext.createGain();
      bus.gain.value = 1;
      let tail: AudioNode = bus;
      if (highpass !== undefined) {
        const filter = audioContext.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.value = highpass;
        filter.Q.value = 0.5;
        tail.connect(filter);
        tail = filter;
      }
      if (lowpass !== undefined) {
        const filter = audioContext.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = lowpass;
        filter.Q.value = 0.5;
        tail.connect(filter);
        tail = filter;
      }
      tail.connect(this.layerSum);
      return bus;
    };

    this.subBus = makeBus(undefined, 90);
    this.bassBus = makeBus(45, 800);
    this.midBus = makeBus(140);
    this.trebleBus = makeBus(500);
    this.pluckBus = makeBus(300);
    this.ksBus = makeBus(200);
    this.noiseBus = makeBus(100);
    this.shimmerBus = makeBus(1000);

    this.masterTrim = audioContext.createGain();
    this.masterTrim.gain.value = 0.28;
    this.layerSum.connect(this.masterTrim);

    this.dimGain = audioContext.createGain();
    this.dimGain.gain.value = 1;
    this.masterTrim.connect(this.dimGain);

    this.tremoloSum = audioContext.createGain();
    this.tremoloSum.gain.value = 1;
    this.dimGain.connect(this.tremoloSum);

    this.analysisTap = audioContext.createGain();
    this.analysisTap.gain.value = 1;
    this.tremoloSum.connect(this.analysisTap);

    this.headroomPad = audioContext.createGain();
    this.headroomPad.gain.value = 0.501; // 10^(−6/20)
    this.analysisTap.connect(this.headroomPad);

    // Left unconnected on the input side: the caller wires
    // headroomPad → [insert chain] → autoMakeup, or straight through.
    this.autoMakeup = audioContext.createGain();
    this.autoMakeup.gain.value = 2; // +6 dB, undoing headroomPad

    this.limiterIn = audioContext.createGain();
    this.limiterIn.gain.value = 1;
    this.autoMakeup.connect(this.limiterIn);

    this.safetyComp = audioContext.createDynamicsCompressor();
    this.safetyComp.threshold.value = -3;
    this.safetyComp.ratio.value = 20;
    this.safetyComp.knee.value = 3;
    this.safetyComp.attack.value = 0.001;
    this.safetyComp.release.value = 0.1;
    this.limiterIn.connect(this.safetyComp);

    this.limiterOut = audioContext.createGain();
    this.limiterOut.gain.value = 1;
    this.safetyComp.connect(this.limiterOut);

    this.masterPanner = audioContext.createStereoPanner();
    this.limiterOut.connect(this.masterPanner);

    this.output = audioContext.createGain();
    this.output.gain.value = 1;
    this.masterPanner.connect(this.output);
    this.output.connect(audioContext.destination);
  }

  /**
   * Connect headroomPad straight to autoMakeup, for callers with no insert
   * chain. Skip this if you are wiring something in between.
   */
  bypassInsert(): void {
    this.headroomPad.connect(this.autoMakeup);
  }

  /** Replace the safety compressor with a lookahead limiter. Idempotent. */
  swapToWorkletLimiter(workletNode: AudioWorkletNode): void {
    if (this.workletLimiter) return;
    this.limiterIn.disconnect(this.safetyComp);
    this.safetyComp.disconnect(this.limiterOut);
    this.limiterIn.connect(workletNode);
    workletNode.connect(this.limiterOut);
    this.workletLimiter = workletNode;
  }

  setMasterGain(value: number): void {
    const target = Math.max(0, Math.min(2, value));
    this.masterTrim.gain.setTargetAtTime(
      target,
      this.audioContext.currentTime,
      0.02
    );
  }

  /**
   * Drive the dim from a 0..1 brightness value.
   *
   * Loudness tracks brightness with roughly a 0.6 exponent (the sones
   * approximation), and below 0.08 an extra linear fade takes over — without
   * it a nearly-black frame still plays at close to full volume, because the
   * power curve is steep near zero but never actually reaches it.
   *
   * `scale` above 1 is allowed on purpose, for a whiteout climax. The limiter
   * is what keeps that safe.
   */
  setBrightnessDim(brightness: number, now: number, extremesScale = 1): void {
    const ramp = Math.min(1, brightness / 0.08);
    const perceptual = Math.pow(Math.max(0, brightness), 0.6);
    const scale =
      Math.min(1, ramp * perceptual) * Math.max(0, extremesScale);
    this.dimGain.gain.setTargetAtTime(scale, now, 0.08);
  }

  /**
   * Recompute makeup gain when the insert chain's parameters change.
   *
   * Starts from the +6 dB that cancels headroomPad, then backs off for what
   * the insert added: measured at roughly 0.5 dB of output per dB of mid-boost
   * at full wet, plus about 0.6 dB more from saturation at amount 10 / wet 0.6.
   * The 0.55 and 0.9 coefficients hold the result within ±1 dB of the dry
   * baseline across the usable range.
   */
  updateAutoMakeup({
    saturationAmount,
    saturationWet,
    midBoostDb,
  }: {
    saturationAmount: number;
    saturationWet: number;
    midBoostDb: number;
  }): void {
    const makeupDb =
      6 -
      saturationWet * midBoostDb * 0.55 -
      saturationWet * Math.log10(Math.max(1, saturationAmount)) * 0.9;
    const clamped = Math.max(0, Math.min(6, makeupDb));
    this.autoMakeup.gain.setTargetAtTime(
      Math.pow(10, clamped / 20),
      this.audioContext.currentTime,
      0.1
    );
  }
}
