export class SoundTransformation {
  audioContext: AudioContext;
  phaseVocoderNode: AudioWorkletNode;
  audioBuffer: AudioBufferSourceNode;
  pitchFactor = 1.0;
  speedFactor = 1.0;

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

  updatePitch(pitch: number) {
    const pitchFactorParam =
      this.phaseVocoderNode.parameters.get("pitchFactor")!;
    this.pitchFactor = pitch;
    pitchFactorParam.value = (this.pitchFactor * 1) / this.speedFactor;
  }

  updateSpeed(speed: number) {
    const pitchFactorParam =
      this.phaseVocoderNode.parameters.get("pitchFactor")!;
    this.speedFactor = speed;
    this.audioBuffer.playbackRate.value = speed;
    pitchFactorParam.value = (this.pitchFactor * 1) / this.speedFactor;
  }
}
