import {
  BitCrusher,
  Filter,
  FeedbackDelay,
  Gain,
  NoiseSynth,
  MembraneSynth,
  Synth,
} from "tone";
import { Mixer } from "./Mixer";
import { StepsSlot } from "./Steps";
import { Time } from "tone/build/esm/core/type/Units";

type DrumKitKey = "open" | "closed" | "snare" | "kick";

// Drums class interface simplified to match
export interface DrumsParams {
  volume: number;
  settings: (
    | ConfigurableHatParams
    | ConfigurableKickParams
    | ConfigurableSnareParams
  )[];
}

type DrumTypeSettings =
  | {
      type: Extract<DrumKitKey, "snare">;
      settings: ConfigurableSnareParams;
    }
  | {
      type: Extract<DrumKitKey, "kick">;
      settings: ConfigurableKickParams;
    }
  | {
      type: Extract<DrumKitKey, "closed" | "open">;
      settings: ConfigurableHatParams;
    };

// Base settings interfaces
interface DrumSettingsFilter {
  frequency: number;
  Q: number;
}

interface DrumSettingsDelay {
  wet: number;
  feedback: number;
  delayTime: Time;
}

interface DrumSettingsBitCrush {
  wet: number;
  bits: number;
}

// Configuration interfaces (effects only)
interface DrumParams {
  volume: number;
  settings: {
    highpass: DrumSettingsFilter;
    lowpass: DrumSettingsFilter;
    crush: DrumSettingsBitCrush;
    delay: DrumSettingsDelay;
  };
}

export type ConfigurableHatParams = DrumParams & {
  type: Extract<DrumKitKey, "closed" | "open">;
};
export type ConfigurableSnareParams = DrumParams & {
  type: Extract<DrumKitKey, "snare">;
};
export type ConfigurableKickParams = DrumParams & {
  type: Extract<DrumKitKey, "kick">;
};

const DEFAULT_HAT_SETTINGS: DrumParams = {
  volume: 0.185,
  settings: {
    highpass: { frequency: 0, Q: 1 },
    lowpass: { frequency: 12000, Q: 1 },
    crush: { wet: 0, bits: 8 },
    delay: { wet: 0, feedback: 0.3, delayTime: "16n" },
  },
};

const DEFAULT_SNARE_SETTINGS: ConfigurableSnareParams = {
  type: "snare",
  volume: 0.5,
  settings: {
    highpass: { frequency: 0, Q: 1 },
    lowpass: { frequency: 12000, Q: 1 },
    crush: { wet: 0, bits: 8 },
    delay: { wet: 0, feedback: 0.3, delayTime: "16n" },
  },
};

const DEFAULT_KICK_SETTINGS: ConfigurableKickParams = {
  type: "kick",
  volume: 0.75,
  settings: {
    highpass: { frequency: 0, Q: 1 },
    lowpass: { frequency: 12000, Q: 1 },
    crush: { wet: 0, bits: 8 },
    delay: { wet: 0, feedback: 0.3, delayTime: "8n" },
  },
};

export class ConfigurableHat {
  type: Extract<DrumKitKey, "closed" | "open">;
  closed: boolean;
  node: NoiseSynth;
  output: Gain;
  highpass: Filter;
  lowpass: Filter;
  crush: BitCrusher;
  delay: FeedbackDelay;
  params: ConfigurableHatParams;

  static initialSettings(type: Extract<DrumKitKey, "closed" | "open">) {
    return { type, ...DEFAULT_HAT_SETTINGS };
  }

  constructor(params: ConfigurableHatParams) {
    this.type = params.type;
    this.params = params;
    this.node = new NoiseSynth();
    this.output = new Gain(params.volume);

    // Set fixed envelope and noise settings
    this.node.noise.type = "white";
    this.node.envelope.attack = 0.0001;
    this.node.envelope.decay = params.type === "closed" ? 0.17 : 0.27;
    this.node.envelope.sustain = params.type === "closed" ? 0 : 0.1;
    this.node.envelope.release = params.type === "closed" ? 0.05 : 0.5;

    // Initialize effects
    this.highpass = new Filter({
      type: "highpass",
      ...params.settings.highpass,
    });
    this.lowpass = new Filter({
      type: "lowpass",
      ...params.settings.lowpass,
    });
    this.crush = new BitCrusher(params.settings.crush);
    this.delay = new FeedbackDelay(params.settings.delay);

    // Connect effects chain
    this.node.connect(this.highpass);
    this.highpass.connect(this.lowpass);
    this.lowpass.connect(this.crush);
    this.crush.connect(this.delay);
    this.delay.connect(this.output);
  }

  updateSettings(params: Exclude<ConfigurableHatParams, "type">) {
    this.params = params;
    this.highpass.set(params.settings.highpass);
    this.lowpass.set(params.settings.lowpass);
    this.crush.set(params.settings.crush);
    this.delay.set(params.settings.delay);
  }

  exportParams() {
    return this.params;
  }

  getGain() {
    return this.output.gain.value;
  }

  updateGain(value: number) {
    this.params.volume = value;
    return (this.output.gain.value = value);
  }

  play(velocity: number | null, time: number) {
    if (velocity === null) return;
    this.node.triggerAttackRelease("16n", time, velocity);
  }
}

export class ConfigurableSnare {
  type: Extract<DrumKitKey, "snare">;
  node1: Synth;
  node2: NoiseSynth;
  output: Gain;
  highpass: Filter;
  lowpass: Filter;
  crush: BitCrusher;
  delay: FeedbackDelay;
  params: ConfigurableSnareParams;

  static get initialSettings() {
    return DEFAULT_SNARE_SETTINGS;
  }

  constructor(params: ConfigurableSnareParams) {
    this.params = params;
    this.node1 = new Synth();
    this.node2 = new NoiseSynth();
    this.output = new Gain(params.volume);

    // Set fixed synth settings
    this.node1.oscillator.type = "sine";
    this.node1.oscillator.partials = [1, 4];
    this.node1.envelope.attack = 0.0001;
    this.node1.envelope.decay = 0.17;
    this.node1.envelope.sustain = 0;
    this.node1.envelope.release = 0.05;

    // Set fixed noise settings
    this.node2.noise.type = "brown";
    this.node2.noise.playbackRate = 3;
    this.node2.envelope.attack = 0.001;
    this.node2.envelope.decay = 0.13;
    this.node2.envelope.sustain = 0;
    this.node2.envelope.release = 0.03;

    // Initialize effects
    this.highpass = new Filter({
      type: "highpass",
      ...params.settings.highpass,
    });
    this.lowpass = new Filter({
      type: "lowpass",
      ...params.settings.lowpass,
    });
    this.crush = new BitCrusher(params.settings.crush);
    this.delay = new FeedbackDelay(params.settings.delay);

    // Create parallel paths for tone and noise
    const toneChain = new Gain(1);
    const noiseChain = new Gain(0.5);

    // Connect tone path
    this.node1.connect(toneChain);
    toneChain.connect(this.highpass);

    // Connect noise path
    this.node2.connect(noiseChain);
    noiseChain.connect(this.highpass);

    // Connect shared effects chain
    this.highpass.connect(this.lowpass);
    this.lowpass.connect(this.crush);
    this.crush.connect(this.delay);
    this.delay.connect(this.output);
  }

  updateSettings(params: Exclude<ConfigurableSnareParams, "type">) {
    this.params = params;
    this.highpass.set(params.settings.highpass);
    this.lowpass.set(params.settings.lowpass);
    this.crush.set(params.settings.crush);
    this.delay.set(params.settings.delay);
  }

  exportParams() {
    return this.params;
  }

  getGain() {
    return this.output.gain.value;
  }

  updateGain(value: number) {
    this.params.volume = value;
    return (this.output.gain.value = value);
  }

  play(velocity: number | null, time: number) {
    if (velocity === null) return;

    this.node1.triggerAttackRelease("B2", "16n", time, velocity * 0.7);
    this.node1.triggerAttackRelease("Eb3", "16n", time + 0.02, velocity * 0.5);
    this.node2.triggerAttackRelease("16n", time, velocity);
  }
}

export class ConfigurableKick {
  type: Extract<DrumKitKey, "kick">;
  node1: MembraneSynth;
  node2: NoiseSynth;
  output: Gain;
  highpass: Filter;
  lowpass: Filter;
  crush: BitCrusher;
  delay: FeedbackDelay;
  params: ConfigurableKickParams;

  static get initialSettings() {
    return DEFAULT_KICK_SETTINGS;
  }

  constructor(params: ConfigurableKickParams) {
    this.params = params;
    this.node1 = new MembraneSynth();
    this.node2 = new NoiseSynth();
    this.output = new Gain(params.volume);

    // Set fixed envelope settings
    this.node1.envelope.attack = 0.001;
    this.node1.envelope.decay = 0.2;
    this.node1.envelope.sustain = 0;
    this.node1.envelope.release = 0.1;

    // Set fixed noise settings
    this.node2.noise.type = "brown";
    this.node2.envelope.attack = 0.001;
    this.node2.envelope.decay = 0.13;
    this.node2.envelope.sustain = 0;
    this.node2.envelope.release = 0.03;

    // Initialize effects
    this.highpass = new Filter({
      type: "highpass",
      ...params.settings.highpass,
    });
    this.lowpass = new Filter({
      type: "lowpass",
      ...params.settings.lowpass,
    });
    this.crush = new BitCrusher(params.settings.crush);
    this.delay = new FeedbackDelay(params.settings.delay);

    // Create parallel paths for membrane and noise
    const membraneChain = new Gain(1);
    const noiseChain = new Gain(0.2);

    // Connect membrane path
    this.node1.connect(membraneChain);
    membraneChain.connect(this.highpass);

    // Connect noise path
    this.node2.connect(noiseChain);
    noiseChain.connect(this.highpass);

    // Connect shared effects chain
    this.highpass.connect(this.lowpass);
    this.lowpass.connect(this.crush);
    this.crush.connect(this.delay);
    this.delay.connect(this.output);
  }

  updateSettings(params: Exclude<ConfigurableKickParams, "type">) {
    this.params = params;
    this.highpass.set(params.settings.highpass);
    this.lowpass.set(params.settings.lowpass);
    this.crush.set(params.settings.crush);
    this.delay.set(params.settings.delay);
  }

  getGain() {
    return this.output.gain.value;
  }

  updateGain(value: number) {
    this.params.volume = value;
    return (this.output.gain.value = value);
  }

  exportParams() {
    return this.params;
  }

  play(velocity: number | null, time: number) {
    if (velocity === null) return;

    this.node1.triggerAttackRelease("E0", "8n", time, velocity);
    this.node1.triggerAttackRelease("C0", "8n", time + 0.01, velocity * 0.8);
    this.node2.triggerAttackRelease("16n", time + 0.02, velocity * 0.5);
  }
}

export class Drums {
  output?: Gain;
  kit: (ConfigurableHat | ConfigurableSnare | ConfigurableKick)[];

  static velocitiesForStepsSlots(
    stepsSlotArray: StepsSlot[],
    maxValue: number
  ) {
    return stepsSlotArray.map((slot) => {
      if (!slot) return null;
      return ((slot - 1) / (maxValue - 1)) * 0.2 + 0.8;
    });
  }

  constructor() {}

  initialize({
    volume,
    mixer,
    settings,
  }: {
    volume: number;
    mixer: Mixer;
    settings: DrumsParams["settings"];
  }) {
    this.output = new Gain(volume);
    if (mixer.channel) this.output.connect(mixer.channel);
    this.kit = settings.map((setting) => {
      switch (setting.type) {
        case "closed":
        case "open":
          return new ConfigurableHat(setting);
        case "kick":
          return new ConfigurableKick(setting);
        case "snare":
          return new ConfigurableSnare(setting);
      }
    });

    for (let drum in this.kit) {
      if (mixer.channel && this.output)
        this.kit[drum].output.connect(this.output);
    }
  }

  updateSettings({ type, settings }: DrumTypeSettings) {
    this.kit[type].updateSettings(settings);
  }

  dispose() {
    Object.values(this.kit).forEach((item) => item.output.dispose());
  }

  exportParams(): DrumsParams {
    const settings = this.kit.map((a) => a.exportParams());
    return {
      volume: this.output?.gain.value || 0,
      settings,
    };
  }

  playVelocities(velocities: (number | null)[], time: number) {
    Object.values(this.kit).forEach((drum, i) =>
      drum.play(velocities[i], time)
    );
  }

  getGain() {
    return this.output?.gain.value || 0;
  }

  updateGain(gain: number) {
    if (this.output) {
      this.output.gain.value = gain;
    }
  }
}
