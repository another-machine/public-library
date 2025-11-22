import { SoundTransformation } from "../../../packages/amplib-sound-transformation/src";
import { LoopMetadata } from "./types";

export class AudioEngine {
  audioContext: AudioContext;
  tracks: {
    transformation: SoundTransformation;
    metadata: LoopMetadata;
    source: AudioBufferSourceNode;
    originalBuffer: AudioBuffer;
    speedMultiplier: number;
    octaveShift: number;
    gainNode: GainNode;
    analyserNode: AnalyserNode;
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

    const gainNode = this.audioContext.createGain();
    const analyserNode = this.audioContext.createAnalyser();
    analyserNode.fftSize = 256;

    gainNode.connect(analyserNode);
    analyserNode.connect(this.audioContext.destination);

    if (transformation.phaseVocoderNode) {
      transformation.phaseVocoderNode.disconnect();
      transformation.phaseVocoderNode.connect(gainNode);
    }

    const track = {
      transformation,
      metadata,
      source,
      originalBuffer: audioBuffer,
      speedMultiplier: 1,
      octaveShift: 0,
      gainNode,
      analyserNode,
    };
    this.tracks.push(track);

    this.syncTrack(track);

    if (this.isPlaying) {
      source.start();
    }

    return track;
  }

  syncTrack(track: {
    transformation: SoundTransformation;
    metadata: LoopMetadata;
    speedMultiplier: number;
    octaveShift: number;
  }) {
    track.transformation.adjustSpeedToBPM(
      this.globalBpm * track.speedMultiplier
    );

    let semitones = this.globalPitch - track.metadata.pitch;
    semitones += track.octaveShift * 12;

    track.transformation.adjustPitchBySemitones(semitones);
  }

  setTrackSpeedMultiplier(track: any, multiplier: number) {
    track.speedMultiplier = multiplier;
    this.syncTrack(track);
  }

  setTrackOctaveShift(track: any, shift: number) {
    track.octaveShift = shift;
    this.syncTrack(track);
  }

  setTrackVolume(track: any, volume: number) {
    track.gainNode.gain.value = volume;
  }

  setGlobalBpm(bpm: number) {
    this.globalBpm = bpm;
    this.tracks.forEach((track) => this.syncTrack(track));
  }

  setGlobalPitch(pitch: number) {
    this.globalPitch = pitch;
    this.tracks.forEach((track) => this.syncTrack(track));
  }

  play() {
    if (this.isPlaying) this.stop();

    this.audioContext.resume();

    this.tracks.forEach((track) => {
      // Create new source
      const newSource = this.audioContext.createBufferSource();
      newSource.buffer = track.originalBuffer;
      newSource.loop = true;

      // Disconnect old source if it exists (it might be stopped already)
      try {
        track.source.disconnect();
      } catch (e) {}

      // Connect new source to the phase vocoder
      if (track.transformation.phaseVocoderNode) {
        newSource.connect(track.transformation.phaseVocoderNode);
      }

      track.source = newSource;
      track.transformation.audioBuffer = newSource;

      // Re-sync to apply speed/pitch to the new source/processor state
      this.syncTrack(track);

      newSource.start(0);
    });

    this.isPlaying = true;
  }

  stop() {
    this.tracks.forEach((track) => {
      try {
        track.source.stop();
      } catch (e) {
        // Ignore errors if already stopped
      }
    });
    this.isPlaying = false;
  }

  togglePlay() {
    if (this.isPlaying) {
      this.stop();
    } else {
      this.play();
    }
    return this.isPlaying;
  }
}
