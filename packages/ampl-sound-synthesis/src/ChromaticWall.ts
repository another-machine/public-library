import { Note, Scale } from "../../ampl-music-theory/src/index";

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

interface FMSynthSettings {
  envelope: Envelope;
  carrier: { type: OscillatorType };
  modulation: { type: OscillatorType };
  modulationDepth: number;
  modulationFrequency: number;
}

interface ChromaticWallParams {
  audioContext: AudioContext;
  volume: number;
  mainChance: number;
  twinkleChance: number;
}

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
    modulationDepth: 1,
    modulationFrequency: 14.3,
  };

  synthTwinkle: FMSynthSettings = {
    envelope: { attack: 0.001, release: 0.2, volume: 0.1 },
    carrier: { type: "sine" },
    modulation: { type: "sawtooth" },
    modulationDepth: 1,
    modulationFrequency: 14.3,
  };

  stepPosition = 0;
  on = false;
  channelOutput: GainNode;
  effectHighpassFilter: BiquadFilterNode;
  effectLowpassFilter: BiquadFilterNode;

  constructor({
    audioContext,
    volume,
    mainChance,
    twinkleChance,
  }: ChromaticWallParams) {
    this.audioContext = audioContext;
    this.volume = volume;
    this.mainChance = mainChance;
    this.twinkleChance = twinkleChance;
    this.channelOutput = this.audioContext.createGain();
    this.effectLowpassFilter = this.audioContext.createBiquadFilter();
    this.effectHighpassFilter = this.audioContext.createBiquadFilter();
    this.effectLowpassFilter.connect(this.effectHighpassFilter);
    this.effectHighpassFilter.connect(this.channelOutput);
    this.channelOutput.connect(this.audioContext.destination);

    this.channelOutput.gain.value = this.volume;

    this.effectLowpassFilter.type = "lowpass";
    this.effectLowpassFilter.frequency.value = 22050;
    this.effectLowpassFilter.Q.value = 1;
    this.effectHighpassFilter.type = "highpass";
    this.effectHighpassFilter.frequency.value = 0;
    this.effectHighpassFilter.Q.value = 1;
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

    const selectRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
    // synth
    if (Math.random() > this.mainChance) {
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
    // twinkle synth
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

  // TODO: Transform this into something that tracks playing notes, doesn't know when it is releasing
  triggerNote({
    hz,
    synth,
    envelopeModifier,
  }: {
    hz: number;
    synth: FMSynthSettings;
    envelopeModifier: EnvelopeModifier;
  }) {
    const { attack, release, volume } = ChromaticWall.modifiedEnvelope(
      synth.envelope,
      envelopeModifier
    );
    // Create oscillators
    const carrierOscillator = this.audioContext.createOscillator();
    carrierOscillator.type = synth.carrier.type;
    const modulationOscillator = this.audioContext.createOscillator();
    modulationOscillator.type = synth.modulation.type;

    const pan = this.audioContext.createStereoPanner();
    pan.pan.setValueAtTime(
      Math.random() * 2 - 1,
      this.audioContext.currentTime
    );

    // Set frequencies
    carrierOscillator.frequency.value = hz;
    modulationOscillator.frequency.value = synth.modulationFrequency;

    // Gain node for modulation depth
    const modulationDepthGain = this.audioContext.createGain();
    modulationDepthGain.gain.value = 10 * synth.modulationDepth;

    // Gain node for envelope
    const envelopeGain = this.audioContext.createGain();
    envelopeGain.gain.cancelScheduledValues(this.audioContext.currentTime);
    envelopeGain.gain.setValueAtTime(0, this.audioContext.currentTime);

    // Parameter automation to generate the envelope
    envelopeGain.gain.linearRampToValueAtTime(
      volume,
      this.audioContext.currentTime + attack
    );
    envelopeGain.gain.linearRampToValueAtTime(
      0,
      this.audioContext.currentTime + attack + release
    );

    // Connect the nodes
    modulationOscillator.connect(modulationDepthGain);
    // This is the FM thing
    modulationDepthGain.connect(carrierOscillator.detune);
    carrierOscillator.connect(envelopeGain);
    envelopeGain.connect(pan);
    pan.connect(this.effectLowpassFilter);

    carrierOscillator.onended = () => {
      carrierOscillator.disconnect();
      modulationOscillator.disconnect();
      modulationDepthGain.disconnect();
      envelopeGain.disconnect();
    };

    // Make sound
    modulationOscillator.start();
    carrierOscillator.start();

    // Schedule automatic oscillation stop
    modulationOscillator.stop(this.audioContext.currentTime + attack + release);
    carrierOscillator.stop(this.audioContext.currentTime + attack + release);
  }
}
