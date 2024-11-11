import {
  Synth,
  Gain,
  Panner,
  FeedbackDelay,
  Freeverb,
  SynthOptions,
  getTransport,
} from "tone";
import { Mixer } from "./Mixer";
import { Time } from "tone/build/esm/core/type/Units";
import { RecursivePartial } from "tone/build/esm/core/util/Interface";

export type SynthSettingsUpdate = RecursivePartial<SynthOptions>;

const INITIAL_OPTIONS: SynthSettingsOptions = {
  envelope: {
    attack: 0.001,
    decay: 0.2,
    sustain: 1,
    release: 0.8,
  },
  oscillator: {
    type: "square8" as SynthSettingsOscillatorType,
  },
  detune: 0,
  portamento: 0,
};

const INITIAL_SETTINGS: ConfigurableSynthParams = {
  a: { pan: -0.5, options: INITIAL_OPTIONS },
  b: { pan: 0.75, options: INITIAL_OPTIONS },
  delay: { wet: 0, feedback: 0.5, delayTime: "16n" },
  reverb: { wet: 0, roomSize: 0.5 },
};

type SynthSettingsEnvelopeCurve =
  | "linear"
  | "exponential"
  | "sine"
  | "cosine"
  | "bounce"
  | "ripple"
  | "step";

type SynthSettingsEnvelopeCurveBasic = "linear" | "exponential";

export type SynthSettingsOscillatorType =
  | "pulse"
  | "sine"
  | "square"
  | "sawtooth"
  | "triangle"
  | "amsine"
  | "amsquare"
  | "amsawtooth"
  | "amtriangle"
  | "fmsine"
  | "fmsquare"
  | "fmsawtooth"
  | "fmtriangle"
  | "fatsine"
  | "fatsquare"
  | "fatsawtooth"
  | "fattriangle";

export const oscillatorTypes: SynthSettingsOscillatorType[] = [
  "sine",
  "square",
  "sawtooth",
  "triangle",
  "amsine",
  "amsquare",
  "amsawtooth",
  "amtriangle",
  "fmsine",
  "fmsquare",
  "fmsawtooth",
  "fmtriangle",
  "fatsine",
  "fatsquare",
  "fatsawtooth",
  "fattriangle",
];

interface SynthSettingsEnvelope {
  attack: Time;
  decay: Time;
  sustain: number;
  release: Time;
  attackCurve?: SynthSettingsEnvelopeCurve;
  decayCurve?: SynthSettingsEnvelopeCurveBasic;
  releaseCurve?: SynthSettingsEnvelopeCurve;
}

interface SynthSettingsOptions {
  envelope: SynthSettingsEnvelope;
  oscillator: {
    type: SynthSettingsOscillatorType;
  };
  detune: number;
  portamento: number;
}
interface SynthSettingsSynth {
  pan: number;
  options: SynthSettingsOptions;
}
interface SynthSettingsReverb {
  wet: number;
  roomSize: number;
}
interface SynthSettingsDelay {
  wet: number;
  feedback: number;
  delayTime: Time;
}

export interface ConfigurableSynthParams {
  a: SynthSettingsSynth;
  b: SynthSettingsSynth;
  reverb: SynthSettingsReverb;
  delay: SynthSettingsDelay;
}

export class ConfigurableSynth {
  nodeA: Synth;
  nodeB: Synth;
  panA: Panner;
  panB: Panner;
  reverb: Freeverb;
  delay: FeedbackDelay;
  output: Gain;
  playing = false;

  constructor({
    gain,
    settings,
  }: {
    gain: number;
    settings: ConfigurableSynthParams;
  }) {
    this.output = new Gain(gain);
    this.nodeA = new Synth();
    this.nodeB = new Synth();
    this.panA = new Panner();
    this.panB = new Panner();
    this.delay = new FeedbackDelay();
    this.reverb = new Freeverb();
    this.nodeA.connect(this.panA);
    this.nodeB.connect(this.panB);
    this.panA.connect(this.delay);
    this.panB.connect(this.delay);
    this.delay.connect(this.reverb);
    this.reverb.connect(this.output);
    this.updateSettings(settings);
  }

  play(note: string | null, time: number) {
    if (note) {
      if (this.playing) {
        this.nodeA.setNote(note, time);
        this.nodeB.setNote(note, time);
      } else {
        this.nodeA.triggerAttack(note, time);
        this.nodeB.triggerAttack(note, time);
        this.playing = true;
      }
    } else {
      this.nodeA.triggerRelease(time);
      this.nodeB.triggerRelease(time);
      this.playing = false;
    }
  }

  stop(time: number) {
    this.playing = false;
    this.nodeA.triggerRelease(time);
    this.nodeB.triggerRelease(time);
  }

  dispose() {
    this.stop(getTransport().context.currentTime);
    this.nodeA.dispose();
    this.nodeB.dispose();
  }

  static randomOptions() {
    const type =
      oscillatorTypes[Math.floor(Math.random() * oscillatorTypes.length)];
    const partials = Math.ceil(Math.random() * 64);
    const object: Partial<SynthSettingsOptions> = {
      envelope: {
        attack: Math.random(),
        decay: Math.random(),
        sustain: Math.random(),
        release: Math.random(),
      },
      // detune: Math.random() > 0.9 ? Math.round(Math.random() * 200 - 100) : 0,
      // portamento: Math.random() > 0.5 ? Math.random() : 0,
      oscillator: { type: `${type}${partials}` as SynthSettingsOscillatorType },
    };
    return object;
  }

  private optionsFromNode(node: Synth): SynthSettingsOptions {
    return {
      envelope: {
        attack: node.envelope.attack,
        decay: node.envelope.decay,
        sustain: node.envelope.sustain,
        release: node.envelope.release,
      },
      detune: node.detune.value,
      portamento: node.portamento,
      oscillator: { type: node.oscillator.type as SynthSettingsOscillatorType },
    };
  }

  exportParams(): ConfigurableSynthParams {
    return {
      a: {
        pan: this.panA.pan.value,
        options: this.optionsFromNode(this.nodeA),
      },
      b: {
        pan: this.panB.pan.value,
        options: this.optionsFromNode(this.nodeB),
      },
      delay: {
        wet: this.delay.wet.value,
        feedback: this.delay.feedback.value,
        delayTime: this.delay.delayTime.value,
      },
      reverb: {
        wet: this.reverb.wet.value,
        roomSize: this.reverb.roomSize.value,
      },
    };
  }

  updateSettings(settings: ConfigurableSynthParams) {
    this.nodeA.set(settings.a.options);
    this.nodeB.set(settings.b.options);
    this.panA.pan.value = settings.a.pan;
    this.panB.pan.value = settings.b.pan;
    this.reverb.set(settings.reverb);
    this.delay.set(settings.delay);
  }
}

export interface SynthsParams {
  volume: number;
  settings: ConfigurableSynthParams;
  voices: number;
}
export class Synths {
  output?: Gain;
  voices: ConfigurableSynth[] = [];

  constructor() {}

  static get initialSettings() {
    return INITIAL_SETTINGS;
  }

  static initialSettingsWithOscillatorType(
    type: SynthSettingsOscillatorType,
    partials?: number
  ): ConfigurableSynthParams {
    return {
      ...Synths.initialSettings,
      a: {
        ...Synths.initialSettings.a,
        options: {
          ...Synths.initialSettings.a.options,
          oscillator: {
            type: (type + (partials || "")) as SynthSettingsOscillatorType,
          },
        },
      },
      b: {
        ...Synths.initialSettings.b,
        options: {
          ...Synths.initialSettings.b.options,
          oscillator: {
            type: (type + (partials || "")) as SynthSettingsOscillatorType,
          },
        },
      },
    };
  }

  initialize({
    voices,
    volume,
    mixer,
    settings,
  }: {
    voices: number;
    volume: number;
    mixer: Mixer;
    settings: ConfigurableSynthParams;
  }) {
    this.output = new Gain(volume);
    if (mixer.channel) this.output.connect(mixer.channel);

    for (let i = 0; i < voices; i++) {
      const synth = new ConfigurableSynth({
        gain: 1 / voices,
        settings,
      });
      this.voices.push(synth);
      synth.output.connect(this.output);
    }
  }

  dispose() {
    this.voices.forEach((synth) => synth.dispose());
  }

  exportParams(): SynthsParams {
    return {
      volume: this.output?.gain.value || 0,
      settings: this.voices[0].exportParams(),
      voices: this.voices.length,
    };
  }

  getGain() {
    return this.output?.gain.value || 0;
  }

  updateDelay(updates: { wet?: number; delayTime?: Time; feedback?: number }) {
    const delay = this.voices[0].delay;
    const value = {
      wet: delay.wet.value,
      delayTime: delay.delayTime.value,
      feedback: delay.feedback.value,
      ...updates,
    };
    this.voices.forEach((synth) => {
      synth.delay.wet.value = value.wet;
      synth.delay.delayTime.value = value.delayTime;
      synth.delay.feedback.value = value.feedback;
    });
  }

  updateGain(gain: number) {
    if (this.output) {
      this.output.gain.value = gain;
    }
  }

  updatePan(pan: number, a: boolean, b: boolean) {
    this.voices.forEach((synth) => {
      if (a) synth.panA.pan.value = pan;
      if (b) synth.panB.pan.value = pan;
    });
  }

  updateReverb(updates: { wet?: number; roomSize?: number }) {
    const reverb = this.voices[0].reverb;
    const value = {
      wet: reverb.wet.value,
      roomSize: reverb.roomSize.value,
      ...updates,
    };
    this.voices.forEach((synth) => {
      synth.reverb.wet.value = value.wet;
      synth.reverb.roomSize.value = value.roomSize;
    });
  }

  updateSynth(update: SynthSettingsUpdate, a: boolean, b: boolean) {
    this.voices.forEach((synth) => {
      if (a) synth.nodeA.set(update);
      if (b) synth.nodeB.set(update);
    });
  }

  randomizeNodes(a: boolean, b: boolean) {
    const optionsA = ConfigurableSynth.randomOptions();
    const optionsB = ConfigurableSynth.randomOptions();
    this.voices.forEach((synth) => {
      if (a) synth.nodeA.set(optionsA);
      if (b) synth.nodeB.set(optionsB);
    });
  }

  playNotes(notes: (string | null)[], time: number) {
    this.voices.forEach((synth, i) => synth.play(notes[i], time));
  }

  stop(time: number) {
    this.voices.forEach((synth) => synth.stop(time));
  }
}
