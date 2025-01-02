import { analyze } from "web-audio-beat-detector";

const SEMITONE_STEP = Math.pow(2, 1 / 12); // ≈ 1.059463

export class SoundTransformation {
  audioContext: AudioContext;
  phaseVocoderNode: AudioWorkletNode;
  audioBuffer: AudioBufferSourceNode;
  pitchFactor = 1.0;
  speedFactor = 1.0;
  bpm: number;

  constructor({ audioContext }: { audioContext: AudioContext }) {
    this.audioContext = audioContext;
  }

  async initialize({
    audioBuffer,
    processorJSPath,
    processorScriptTag,
  }: {
    audioBuffer: AudioBufferSourceNode;
    processorJSPath?: string;
    processorScriptTag?: HTMLScriptElement;
  }) {
    this.bpm = await analyze(audioBuffer.buffer as AudioBuffer);
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
    this.audioBuffer.connect(this.phaseVocoderNode);
    this.phaseVocoderNode.connect(this.audioContext.destination);
  }

  adjustSpeedToBPM(npm: number) {
    const speedRatio = npm / this.bpm;
    this.updateSpeed(speedRatio);
    return this.speedFactor;
  }

  adjustPitchBySemitones(semitones = 1) {
    let pitchFactor = this.pitchFactor;
    if (semitones > 0) {
      while (semitones > 0) {
        pitchFactor *= SEMITONE_STEP;
        semitones--;
      }
    } else {
      while (semitones < 0) {
        pitchFactor /= SEMITONE_STEP;
        semitones++;
      }
    }
    this.updatePitch(pitchFactor);
    return this.pitchFactor;
  }

  private updateSpeed(speed: number) {
    const pitchFactorParam =
      this.phaseVocoderNode.parameters.get("pitchFactor")!;
    this.speedFactor = speed;
    this.audioBuffer.playbackRate.value = speed;
    pitchFactorParam.value = (this.pitchFactor * 1) / this.speedFactor;
  }

  private updatePitch(pitch: number) {
    const pitchFactorParam =
      this.phaseVocoderNode.parameters.get("pitchFactor")!;
    this.pitchFactor = pitch;
    pitchFactorParam.value = (this.pitchFactor * 1) / this.speedFactor;
  }
}
