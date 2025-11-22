import { SoundTransformation } from "../../../packages/amplib-sound-transformation/src";
import { LoopMetadata } from "./types";

export class AudioEngine {
  audioContext: AudioContext;
  tracks: {
    transformation: SoundTransformation;
    metadata: LoopMetadata;
    source: AudioBufferSourceNode;
  }[] = [];
  globalBpm: number = 120;
  globalPitch: number = 0;
  isPlaying: boolean = false;

  constructor() {
    this.audioContext = new AudioContext();
  }

  async addTrack(audioBuffer: AudioBuffer, metadata: LoopMetadata) {
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.loop = true;

    const transformation = new SoundTransformation({
      audioContext: this.audioContext,
    });

    const processorUrl = new URL(
      "../../../packages/amplib-sound-transformation/src/processors/PhaseVocoderProcessor.ts",
      import.meta.url
    );

    await transformation.initialize({
      audioBuffer: source,
      processorJSPath: processorUrl.toString(),
      bpm: metadata.bpm,
    });

    const track = { transformation, metadata, source };
    this.tracks.push(track);

    this.syncTrack(track);

    source.start();

    return track;
  }

  syncTrack(track: {
    transformation: SoundTransformation;
    metadata: LoopMetadata;
  }) {
    track.transformation.adjustSpeedToBPM(this.globalBpm);

    const semitones = this.globalPitch - track.metadata.pitch;
    track.transformation.adjustPitchBySemitones(semitones);
  }

  setGlobalBpm(bpm: number) {
    this.globalBpm = bpm;
    this.tracks.forEach((track) => this.syncTrack(track));
  }

  setGlobalPitch(pitch: number) {
    this.globalPitch = pitch;
    this.tracks.forEach((track) => this.syncTrack(track));
  }

  togglePlay() {
    if (this.isPlaying) {
      this.audioContext.suspend();
      this.isPlaying = false;
    } else {
      this.audioContext.resume();
      this.isPlaying = true;
    }
    return this.isPlaying;
  }
}
