export interface SoundTransformationInitializeParams {
  audioBuffer: AudioBufferSourceNode;
  /**
   * The source's own tempo, in BPM. Required: `adjustSpeedToBPM` is a ratio
   * against it, so there is nothing to compute a ratio from without it.
   * Detection is a separate import — see `detectBPM`.
   */
  bpm: number;
  processorJSPath?: string;
  processorScriptTag?: HTMLScriptElement;
  /**
   * Where the transformed signal goes. Defaults to the context destination,
   * which suits one sound played alone. Mixing several means passing a
   * per-voice gain node and connecting that yourself.
   */
  destination?: AudioNode;
}

export class SoundTransformation {
  audioContext: AudioContext;
  phaseVocoderNode: AudioWorkletNode | null = null;
  audioBuffer: AudioBufferSourceNode | null = null;
  pitchFactor = 1.0;
  speedFactor = 1.0;
  bpm: number = 0;
  private destination: AudioNode | null = null;

  constructor({ audioContext }: { audioContext: AudioContext }) {
    this.audioContext = audioContext;
  }

  async initialize({
    audioBuffer,
    processorJSPath,
    processorScriptTag,
    bpm,
    destination,
  }: SoundTransformationInitializeParams) {
    if (!bpm) {
      throw new Error(
        "SoundTransformation.initialize requires bpm — use detectBPM(buffer) if you do not have one"
      );
    }
    this.bpm = bpm;
    this.audioBuffer = audioBuffer;
    if (processorScriptTag) {
      const workletCode = processorScriptTag.textContent || "";
      const blob = new Blob([workletCode], { type: "text/javascript" });
      const url = URL.createObjectURL(blob);
      await this.audioContext.audioWorklet.addModule(url);
    } else if (processorJSPath) {
      await this.audioContext.audioWorklet.addModule(processorJSPath);
    } else {
      throw new Error("Must provide a script tag or path to processor worklet");
    }
    this.phaseVocoderNode = new AudioWorkletNode(
      this.audioContext,
      "phase-vocoder-processor"
    );
    this.destination = destination ?? this.audioContext.destination;
    this.audioBuffer.connect(this.phaseVocoderNode);
    this.phaseVocoderNode.connect(this.destination);
  }

  /** The node carrying the transformed signal, once initialized. */
  get output(): AudioNode | null {
    return this.phaseVocoderNode;
  }

  /**
   * `when` schedules the change at a context time instead of applying it now.
   *
   * Immediate writes land on the next render quantum, which is up to 2.9 ms
   * away and not the same instant the caller thinks it happened. One voice
   * does not care. Several voices held against a clock do: the clock moves at
   * the caller's instant and the audio at the quantum boundary, and the gap
   * is charged to every change.
   */
  adjustSpeedToBPM(npm: number, when?: number) {
    const speedRatio = npm / this.bpm;
    this.updateSpeed(speedRatio, when);
    return this.speedFactor;
  }

  /**
   * Semitones, and fractions of one. 3.5 is three and a half semitones, not
   * four: this multiplied by a step per whole semitone in a loop, so 3.5 ran
   * the loop four times and any fractional part was silently rounded up.
   * Repeated multiplication also drifted — twelve steps landed near 1.9999997
   * rather than 2.
   */
  adjustPitchBySemitones(semitones = 1, when?: number) {
    this.updatePitch(Math.pow(2, semitones / 12), when);
    return this.pitchFactor;
  }

  /**
   * Release the graph. The source node is the caller's — stop it first if it
   * is still running.
   */
  dispose() {
    this.audioBuffer?.disconnect();
    this.phaseVocoderNode?.disconnect();
    this.phaseVocoderNode = null;
    this.audioBuffer = null;
    this.destination = null;
  }

  private updateSpeed(speed: number, when?: number) {
    const pitchFactorParam =
      this.phaseVocoderNode?.parameters.get("pitchFactor")!;
    this.speedFactor = speed;
    const compensated = (this.pitchFactor * 1) / this.speedFactor;
    if (when == null) {
      if (this.audioBuffer) this.audioBuffer.playbackRate.value = speed;
      pitchFactorParam.value = compensated;
      return;
    }
    this.audioBuffer?.playbackRate.setValueAtTime(speed, when);
    pitchFactorParam.setValueAtTime(compensated, when);
  }

  private updatePitch(pitch: number, when?: number) {
    const pitchFactorParam =
      this.phaseVocoderNode?.parameters.get("pitchFactor")!;
    this.pitchFactor = pitch;
    const compensated = (this.pitchFactor * 1) / this.speedFactor;
    if (when == null) pitchFactorParam.value = compensated;
    else pitchFactorParam.setValueAtTime(compensated, when);
  }
}
