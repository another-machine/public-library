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
    this.nodeA.connect(this.panA);
    this.nodeB.connect(this.panB);
    this.panA.connect(this.output);
    this.panB.connect(this.output);
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
    this.panA.dispose();
    this.panB.dispose();
    this.output.dispose();
  }

  static randomOptions() {
    const round = (number: number) => Math.round(number * 1000) / 1000;
    const type =
      oscillatorTypes[Math.floor(Math.random() * oscillatorTypes.length)];
    const partials = Math.ceil(Math.random() * 64);
    const object: Partial<SynthSettingsOptions> = {
      envelope: {
        attack: round(Math.random() * 0.2),
        decay: round(Math.random() * 0.4 + 0.2),
        sustain: round(Math.random()),
        release: round(Math.random() * 0.5 + 0.5),
      },
      detune: Math.round(Math.pow(Math.random(), 3) * 200 - 100),
      portamento: round(Math.pow(Math.random(), 3)),
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

  exportParams(): Pick<ConfigurableSynthParams, "a" | "b"> {
    return {
      a: {
        pan: this.panA.pan.value,
        options: this.optionsFromNode(this.nodeA),
      },
      b: {
        pan: this.panB.pan.value,
        options: this.optionsFromNode(this.nodeB),
      },
    };
  }

  updateSettings(settings: ConfigurableSynthParams) {
    this.nodeA.set(settings.a.options);
    this.nodeB.set(settings.b.options);
    this.panA.pan.value = settings.a.pan;
    this.panB.pan.value = settings.b.pan;
  }
}

export interface SynthsParams {
  volume: number;
  settings: ConfigurableSynthParams;
  voices: number;
}
export class Synths {
  output?: Gain;
  bus?: Gain;
  delay?: FeedbackDelay;
  reverb?: Freeverb;
  delaySettings: SynthSettingsDelay;
  reverbSettings: SynthSettingsReverb;
  voices: ConfigurableSynth[] = [];
  volume: number;
  // Mute lives outside `volume` so exports and the volume UI keep reporting
  // the channel's set level while the output is silenced.
  muted = false;

  constructor(
    {
      volume,
      settings,
    }: {
      volume: number;
      settings: ConfigurableSynthParams;
    },
    voices: number
  ) {
    this.volume = volume;
    this.delaySettings = { ...settings.delay };
    this.reverbSettings = { ...settings.reverb };
    for (let i = 0; i < voices; i++) {
      const synth = new ConfigurableSynth({
        gain: 1 / voices,
        settings,
      });
      this.voices.push(synth);
    }
  }

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

  initialize({ mixer }: { mixer: Mixer }) {
    this.output = new Gain(this.muted ? 0 : this.volume);
    if (mixer.channel) this.output.connect(mixer.channel);

    this.bus = new Gain(1);
    this.voices.forEach((synth) => {
      if (this.bus) synth.output.connect(this.bus);
    });
    this.rewireEffects();
  }

  // Effects only exist and process audio while their wet amount is non-zero.
  // Reverbs and delays are expensive on mobile even when silent, so the bus
  // wires straight through to the output whenever they are inactive.
  private rewireEffects() {
    if (!this.bus || !this.output) return;
    this.bus.disconnect();
    this.delay?.disconnect();
    this.reverb?.disconnect();
    let tail: Gain | FeedbackDelay | Freeverb = this.bus;
    if (this.delaySettings.wet > 0) {
      if (!this.delay) this.delay = new FeedbackDelay(this.delaySettings);
      tail.connect(this.delay);
      tail = this.delay;
    }
    if (this.reverbSettings.wet > 0) {
      if (!this.reverb) this.reverb = new Freeverb(this.reverbSettings);
      tail.connect(this.reverb);
      tail = this.reverb;
    }
    tail.connect(this.output);
  }

  dispose() {
    this.voices.forEach((synth) => synth.dispose());
    this.bus?.dispose();
    this.bus = undefined;
    this.delay?.dispose();
    this.delay = undefined;
    this.reverb?.dispose();
    this.reverb = undefined;
    this.output?.dispose();
    this.output = undefined;
  }

  exportParams(): SynthsParams {
    return {
      volume: this.getGain(),
      settings: {
        ...this.voices[0].exportParams(),
        delay: { ...this.delaySettings },
        reverb: { ...this.reverbSettings },
      },
      voices: this.voices.length,
    };
  }

  getGain() {
    return this.volume;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.output) {
      this.output.gain.value = muted ? 0 : this.volume;
    }
  }

  updateDelay(updates: { wet?: number; delayTime?: Time; feedback?: number }) {
    const wasActive = this.delaySettings.wet > 0;
    if (updates.wet !== undefined) this.delaySettings.wet = updates.wet;
    if (updates.feedback !== undefined)
      this.delaySettings.feedback = updates.feedback;
    if (updates.delayTime !== undefined)
      this.delaySettings.delayTime = updates.delayTime;
    this.delay?.set(this.delaySettings);
    if (wasActive !== this.delaySettings.wet > 0) this.rewireEffects();
  }

  updateGain(gain: number) {
    this.volume = gain;
    if (this.output) {
      this.output.gain.value = this.muted ? 0 : gain;
    }
  }

  updatePan(pan: number, a: boolean, b: boolean) {
    this.voices.forEach((synth) => {
      if (a) synth.panA.pan.value = pan;
      if (b) synth.panB.pan.value = pan;
    });
  }

  updateReverb(updates: { wet?: number; roomSize?: number }) {
    const wasActive = this.reverbSettings.wet > 0;
    if (updates.wet !== undefined) this.reverbSettings.wet = updates.wet;
    if (updates.roomSize !== undefined)
      this.reverbSettings.roomSize = updates.roomSize;
    this.reverb?.set(this.reverbSettings);
    if (wasActive !== this.reverbSettings.wet > 0) this.rewireEffects();
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
