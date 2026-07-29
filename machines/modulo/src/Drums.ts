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

abstract class ConfigurableDrum<P extends DrumParams> {
  output: Gain;
  highpass: Filter;
  lowpass: Filter;
  crush?: BitCrusher;
  delay?: FeedbackDelay;
  params: P;

  constructor(params: P) {
    this.params = params;
    this.output = new Gain(params.volume);
    this.highpass = new Filter({
      type: "highpass",
      ...params.settings.highpass,
    });
    this.lowpass = new Filter({
      type: "lowpass",
      ...params.settings.lowpass,
    });
    this.highpass.connect(this.lowpass);
    this.rewireEffects();
  }

  // The bit crusher (an audio worklet) and delay only exist and process audio
  // while their wet amount is non-zero — both are expensive on mobile.
  private rewireEffects() {
    this.lowpass.disconnect();
    this.crush?.disconnect();
    this.delay?.disconnect();
    let tail: Filter | BitCrusher | FeedbackDelay = this.lowpass;
    if (this.params.settings.crush.wet > 0) {
      if (!this.crush) this.crush = new BitCrusher(this.params.settings.crush);
      tail.connect(this.crush);
      tail = this.crush;
    }
    if (this.params.settings.delay.wet > 0) {
      if (!this.delay)
        this.delay = new FeedbackDelay(this.params.settings.delay);
      tail.connect(this.delay);
      tail = this.delay;
    }
    tail.connect(this.output);
  }

  updateSettings(params: DrumParams) {
    this.params = {
      ...this.params,
      ...params,
      settings: { ...this.params.settings, ...params.settings },
    } as P;
    this.highpass.set(this.params.settings.highpass);
    this.lowpass.set(this.params.settings.lowpass);
    this.crush?.set(this.params.settings.crush);
    this.delay?.set(this.params.settings.delay);
    this.rewireEffects();
  }

  exportParams(): P {
    return this.params;
  }

  getGain() {
    return this.output.gain.value;
  }

  updateGain(value: number) {
    this.params.volume = value;
    return (this.output.gain.value = value);
  }

  dispose() {
    this.disposeSources();
    this.highpass.dispose();
    this.lowpass.dispose();
    this.crush?.dispose();
    this.crush = undefined;
    this.delay?.dispose();
    this.delay = undefined;
    this.output.dispose();
  }

  protected abstract disposeSources(): void;
  abstract play(velocity: number | null, time: number): void;
}

export class ConfigurableHat extends ConfigurableDrum<ConfigurableHatParams> {
  type: Extract<DrumKitKey, "closed" | "open">;
  node: NoiseSynth;

  static initialSettings(type: Extract<DrumKitKey, "closed" | "open">) {
    return { type, ...DEFAULT_HAT_SETTINGS };
  }

  constructor(params: ConfigurableHatParams) {
    super(params);
    this.type = params.type;
    this.node = new NoiseSynth();

    // Set fixed envelope and noise settings
    this.node.noise.type = "white";
    this.node.envelope.attack = 0.0001;
    this.node.envelope.decay = params.type === "closed" ? 0.17 : 0.27;
    this.node.envelope.sustain = params.type === "closed" ? 0 : 0.1;
    this.node.envelope.release = params.type === "closed" ? 0.05 : 0.5;

    this.node.connect(this.highpass);
  }

  protected disposeSources() {
    this.node.dispose();
  }

  play(velocity: number | null, time: number) {
    if (velocity === null) return;
    this.node.triggerAttackRelease("16n", time, velocity);
  }
}

export class ConfigurableSnare extends ConfigurableDrum<ConfigurableSnareParams> {
  type: Extract<DrumKitKey, "snare">;
  node1: Synth;
  node2: NoiseSynth;
  private toneChain: Gain;
  private noiseChain: Gain;

  static get initialSettings() {
    return DEFAULT_SNARE_SETTINGS;
  }

  constructor(params: ConfigurableSnareParams) {
    super(params);
    this.type = params.type;
    this.node1 = new Synth();
    this.node2 = new NoiseSynth();

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

    // Create parallel paths for tone and noise
    this.toneChain = new Gain(1);
    this.noiseChain = new Gain(0.5);

    this.node1.connect(this.toneChain);
    this.toneChain.connect(this.highpass);
    this.node2.connect(this.noiseChain);
    this.noiseChain.connect(this.highpass);
  }

  protected disposeSources() {
    this.node1.dispose();
    this.node2.dispose();
    this.toneChain.dispose();
    this.noiseChain.dispose();
  }

  play(velocity: number | null, time: number) {
    if (velocity === null) return;

    this.node1.triggerAttackRelease("B2", "16n", time, velocity * 0.7);
    this.node1.triggerAttackRelease("Eb3", "16n", time + 0.02, velocity * 0.5);
    this.node2.triggerAttackRelease("16n", time, velocity);
  }
}

export class ConfigurableKick extends ConfigurableDrum<ConfigurableKickParams> {
  type: Extract<DrumKitKey, "kick">;
  node1: MembraneSynth;
  node2: NoiseSynth;
  private membraneChain: Gain;
  private noiseChain: Gain;

  static get initialSettings() {
    return DEFAULT_KICK_SETTINGS;
  }

  constructor(params: ConfigurableKickParams) {
    super(params);
    this.type = params.type;
    this.node1 = new MembraneSynth();
    this.node2 = new NoiseSynth();

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

    // Create parallel paths for membrane and noise
    this.membraneChain = new Gain(1);
    this.noiseChain = new Gain(0.2);

    this.node1.connect(this.membraneChain);
    this.membraneChain.connect(this.highpass);
    this.node2.connect(this.noiseChain);
    this.noiseChain.connect(this.highpass);
  }

  protected disposeSources() {
    this.node1.dispose();
    this.node2.dispose();
    this.membraneChain.dispose();
    this.noiseChain.dispose();
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
  kit: (ConfigurableHat | ConfigurableSnare | ConfigurableKick)[] = [];
  volume: number;
  // Mute lives outside `volume` so exports and the volume UI keep reporting
  // the channel's set level while the output is silenced.
  muted = false;

  static velocitiesForStepsSlots(
    stepsSlotArray: StepsSlot[],
    maxValue: number
  ) {
    return stepsSlotArray.map((slot) => {
      if (!slot) return null;
      return ((slot - 1) / (maxValue - 1)) * 0.2 + 0.8;
    });
  }

  constructor({ volume, settings }: DrumsParams) {
    this.volume = volume;
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
  }

  initialize({ mixer }: { mixer: Mixer }) {
    this.output = new Gain(this.muted ? 0 : this.volume);
    if (mixer.channel) this.output.connect(mixer.channel);

    this.kit.forEach((drum) => {
      if (mixer.channel && this.output) drum.output.connect(this.output);
    });
  }

  updateSettings({ type, settings }: DrumTypeSettings) {
    this.kit.find((drum) => drum.type === type)?.updateSettings(settings);
  }

  dispose() {
    this.kit.forEach((item) => item.dispose());
    this.output?.dispose();
    this.output = undefined;
  }

  exportParams(): DrumsParams {
    const settings = this.kit.map((a) => a.exportParams());
    return {
      volume: this.volume,
      settings,
    };
  }

  playVelocities(velocities: (number | null)[], time: number) {
    Object.values(this.kit).forEach((drum, i) =>
      drum.play(velocities[i], time)
    );
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

  updateGain(gain: number) {
    this.volume = gain;
    if (this.output) {
      this.output.gain.value = this.muted ? 0 : gain;
    }
  }
}
