import { Note, Scale } from "../../amplib-music-theory/src/index";
import { FMVoice } from "./FMVoice";

interface Envelope {
  attack: number;
  release: number;
  volume: number;
}

interface EnvelopeModifier {
  attack?: number;
  release?: number;
  volume?: number;
}

export interface FMSynthSettings {
  envelope: Envelope;
  carrier: { type: OscillatorType };
  modulation: { type: OscillatorType };
  /** Modulator frequency as a multiple of the carrier. 1 is harmonic. */
  ratio: number;
  /** Modulation index. Higher is brighter and buzzier. */
  index: number;
}

export interface ChromaticWallParams {
  audioContext: AudioContext;
  volume: number;
  mainChance: number;
  twinkleChance: number;
  /**
   * Voices held open for plucking. Notes steal the least recently used voice,
   * so this is the ceiling on how many can overlap before the oldest gets cut
   * off. The default comfortably covers the longest release at typical tick
   * rates.
   */
  voiceCount?: number;
}

/**
 * A drifting wall of notes drawn from a scale, thickened by a sparser layer of
 * high twinkles.
 *
 * Notes are played by a fixed pool of FMVoice objects rather than by building
 * an oscillator pair per note. The audible difference is in the timbre: this
 * used to run its modulator at a fixed 14.3 Hz into `carrier.detune`, which at
 * ±10 cents is a slow vibrato rather than frequency modulation. FMVoice runs
 * the modulator at a ratio of the carrier and into `carrier.frequency`, which
 * puts real sidebands in the tone. Set `index` to 0 on either synth to get
 * back a plain oscillator.
 */
export class ChromaticWall {
  audioContext: AudioContext;
  volume: number;
  mainChance: number;
  twinkleChance: number;
  triadNoteIndices = [0, 1, 2];

  synthMain: FMSynthSettings = {
    envelope: { attack: 0.01, release: 0.8, volume: 0.4 },
    carrier: { type: "triangle" },
    modulation: { type: "sine" },
    ratio: 1,
    index: 1.2,
  };

  synthTwinkle: FMSynthSettings = {
    envelope: { attack: 0.001, release: 0.2, volume: 0.1 },
    carrier: { type: "sine" },
    modulation: { type: "sawtooth" },
    ratio: 2,
    index: 0.8,
  };

  stepPosition = 0;
  on = false;
  channelOutput: GainNode;
  effectHighpassFilter: BiquadFilterNode;
  effectLowpassFilter: BiquadFilterNode;

  private readonly voices: { voice: FMVoice; panner: StereoPannerNode }[];
  private nextVoice = 0;

  constructor({
    audioContext,
    volume,
    mainChance,
    twinkleChance,
    voiceCount = 16,
  }: ChromaticWallParams) {
    this.audioContext = audioContext;
    this.volume = volume;
    this.mainChance = mainChance;
    this.twinkleChance = twinkleChance;

    this.channelOutput = audioContext.createGain();
    this.effectHighpassFilter = audioContext.createBiquadFilter();
    this.effectLowpassFilter = audioContext.createBiquadFilter();
    this.effectLowpassFilter.connect(this.effectHighpassFilter);
    this.effectHighpassFilter.connect(this.channelOutput);
    this.channelOutput.connect(audioContext.destination);

    this.channelOutput.gain.value = this.volume;

    this.effectLowpassFilter.type = "lowpass";
    this.effectLowpassFilter.frequency.value = 22050;
    this.effectLowpassFilter.Q.value = 1;
    this.effectHighpassFilter.type = "highpass";
    this.effectHighpassFilter.frequency.value = 0;
    this.effectHighpassFilter.Q.value = 1;

    this.voices = Array.from({ length: voiceCount }, () => {
      const panner = audioContext.createStereoPanner();
      panner.connect(this.effectLowpassFilter);
      const voice = new FMVoice({
        audioContext,
        destination: panner,
        ratio: this.synthMain.ratio,
        index: this.synthMain.index,
        carrierType: this.synthMain.carrier.type,
        modulatorType: this.synthMain.modulation.type,
      });
      return { voice, panner };
    });
  }

  static modifiedEnvelope(envelope: Envelope, modifiers: EnvelopeModifier) {
    const defaultToOne = (item?: number) => (item === undefined ? 1 : item);

    return {
      attack: envelope.attack * defaultToOne(modifiers.attack),
      release: envelope.release * defaultToOne(modifiers.release),
      volume: envelope.volume * defaultToOne(modifiers.volume),
    };
  }

  start() {
    this.on = true;
    this.channelOutput.gain.linearRampToValueAtTime(
      this.volume,
      this.audioContext.currentTime + 1
    );
  }

  stop() {
    this.on = false;
    this.channelOutput.gain.linearRampToValueAtTime(
      0.0000001,
      this.audioContext.currentTime + 1
    );
  }

  tick({
    scale,
    stepFactor,
    highpassFactor,
    lowpassFactor,
    mainEnvelopeModifier,
    twinkleEnvelopeModifier,
  }: {
    scale: Scale;
    stepFactor: number;
    highpassFactor: number;
    lowpassFactor: number;
    mainEnvelopeModifier?: EnvelopeModifier;
    twinkleEnvelopeModifier?: EnvelopeModifier;
  }) {
    if (!this.on) {
      return;
    }
    this.effectHighpassFilter.frequency.linearRampToValueAtTime(
      Math.round(highpassFactor * 12000 + 100),
      this.audioContext.currentTime + 0.05
    );
    this.effectLowpassFilter.frequency.linearRampToValueAtTime(
      Math.round(lowpassFactor * 12000 + 100),
      this.audioContext.currentTime + 0.05
    );

    const step = Math.min(
      Math.floor(stepFactor * scale.intervals.length),
      scale.intervals.length - 1
    );
    const { notes } = scale.intervals[step];
    const { notation, octave } = notes[this.stepPosition % notes.length];

    const selectRandom = <T>(array: T[]): T =>
      array[Math.floor(Math.random() * array.length)];

    if (Math.random() > this.mainChance) {
      // Weighted low: the wall should sit mostly in the middle of its range,
      // with the higher offsets as occasional colour rather than an even spread.
      const octaveOffset =
        selectRandom([0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5]) + 1;
      this.triggerNote({
        hz: Note.octaveStepFrequencies[octave + octaveOffset][
          Note.notationIndex(notation)
        ],
        synth: this.synthMain,
        envelopeModifier: mainEnvelopeModifier || {},
      });
      this.stepPosition++;
    }

    if (Math.random() > this.twinkleChance) {
      const octaveOffset = Math.round(Math.random() * 2) + 4;
      this.triggerNote({
        hz: Note.octaveStepFrequencies[octave + octaveOffset][
          Note.notationIndex(notation)
        ],
        synth: this.synthTwinkle,
        envelopeModifier: twinkleEnvelopeModifier || {},
      });
    }
  }

  toggle() {
    if (this.on) {
      this.stop();
    } else {
      this.start();
    }
  }

  triggerNote({
    hz,
    synth,
    envelopeModifier,
  }: {
    hz: number;
    synth: FMSynthSettings;
    envelopeModifier: EnvelopeModifier;
  }) {
    if (!Number.isFinite(hz) || hz <= 0) return;

    const { attack, release, volume } = ChromaticWall.modifiedEnvelope(
      synth.envelope,
      envelopeModifier
    );

    const { voice, panner } = this.voices[this.nextVoice];
    this.nextVoice = (this.nextVoice + 1) % this.voices.length;

    panner.pan.setValueAtTime(
      Math.random() * 2 - 1,
      this.audioContext.currentTime
    );

    // The voice pool is shared, so the tone has to be set per note rather than
    // once at construction — a twinkle and a main note can land on the same
    // voice one after the other.
    voice.carrier.type = synth.carrier.type;
    voice.modulator.type = synth.modulation.type;
    voice.ratio = synth.ratio;
    voice.index = synth.index;

    // The old envelope was a pair of linear ramps hitting `volume` at `attack`
    // and zero at `attack + release`. pluck uses setTargetAtTime, which is
    // exponential and lands within a few percent of its target after three
    // time constants — hence the division. Close enough that the phrasing is
    // unchanged, and it decays like an instrument rather than a straight line.
    voice.pluck(hz, {
      peak: volume,
      attackTau: Math.max(0.001, attack / 3),
      ampDecayTau: Math.max(0.01, release / 3),
    });
  }

  disconnect(): void {
    for (const { voice, panner } of this.voices) {
      voice.disconnect();
      panner.disconnect();
    }
    this.effectLowpassFilter.disconnect();
    this.effectHighpassFilter.disconnect();
    this.channelOutput.disconnect();
  }
}
