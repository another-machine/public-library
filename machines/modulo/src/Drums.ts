import { Filter, Gain, MembraneSynth, NoiseSynth, Synth } from "tone";
import { Mixer } from "./Mixer";
import { StepsSlot } from "./Steps";

type DrumTypeKey = "SNARE" | "KICK" | "CLOSED_HAT" | "OPEN_HAT";

export interface DrumsParams {
  volume: number;
  pieces: DrumTypeKey[];
  kit: (
    | ConfigurableHatParams
    | ConfigurableSnareParams
    | ConfigurableKickParams
  )[];
}

type ConfigurableHatParams = {};
type ConfigurableSnareParams = {};
type ConfigurableKickParams = {};

export class ConfigurableHat {
  closed: boolean;
  node: NoiseSynth;
  output: Gain;

  constructor(gain: number, closed: boolean) {
    this.closed = closed;
    this.node = new NoiseSynth();
    this.output = new Gain(gain);
    this.node.connect(this.output);
    if (this.closed) {
      this.node.envelope.attack = 0.0001;
      this.node.envelope.decay = 0.17;
      this.node.envelope.sustain = 0;
      this.node.envelope.release = 0.05;
    } else {
      this.node.noise.type = "white";
      this.node.envelope.attack = 0.0001;
      this.node.envelope.decay = 0.27;
      this.node.envelope.sustain = 0.1;
      this.node.envelope.release = 0.5;
    }
  }

  exportParams() {
    return {};
  }

  play(velocity: number | null, time: number) {
    if (velocity === null) {
      return;
    }
    this.node.triggerAttackRelease("16n", time, velocity);
  }
}

export class ConfigurableSnare {
  node1: Synth;
  node2: NoiseSynth;
  output: Gain;

  constructor(gain: number) {
    this.node1 = new Synth();
    this.node2 = new NoiseSynth();
    this.output = new Gain(gain);
    const lowPass = new Filter({ frequency: 11000 });
    this.node1.connect(this.output);
    this.node2.connect(lowPass);
    lowPass.connect(this.output);

    this.node1.envelope.attack = 0.0001;
    this.node1.envelope.decay = 0.17;
    this.node1.envelope.sustain = 0;
    this.node1.envelope.release = 0.05;
    this.node1.oscillator.partials = [1, 4];

    this.node2.noise.type = "brown";
    this.node2.noise.playbackRate = 3;
    this.node2.envelope.attack = 0.001;
    this.node2.envelope.decay = 0.13;
    this.node2.envelope.sustain = 0;
    this.node2.envelope.release = 0.03;
  }

  exportParams() {
    return {};
  }

  play(velocity: number | null, time: number) {
    if (velocity === null) {
      return;
    }
    this.node1.triggerAttackRelease("B2", "16n", time, velocity);
    this.node1.triggerAttackRelease("Eb3", "16n", time + 0.02, velocity);
    this.node2.triggerAttackRelease("16n", time, velocity);
  }
}

export class ConfigurableKick {
  node1: MembraneSynth;
  node2: NoiseSynth;
  output: Gain;

  constructor(gain: number) {
    this.node1 = new MembraneSynth();
    this.node2 = new NoiseSynth();
    this.output = new Gain(gain);
    const kickNoise = new Gain(0.2);
    this.node1.connect(this.output);
    kickNoise.connect(this.output);
    this.node2.connect(kickNoise);

    this.node2.noise.type = "brown";
    this.node2.noise.playbackRate = 3;
    this.node2.envelope.attack = 0.001;
    this.node2.envelope.decay = 0.13;
    this.node2.envelope.sustain = 0;
    this.node2.envelope.release = 0.03;
  }

  exportParams() {
    return {};
  }

  play(velocity: number | null, time: number) {
    if (velocity === null) {
      return;
    }
    this.node1.triggerAttackRelease("C0", "8n", time, velocity);
    this.node1.triggerAttackRelease("E0", "8n", time + 0.01, velocity);
    this.node2.triggerAttackRelease("16n", time + 0.02, velocity);
  }
}

export class Drums {
  output?: Gain;

  static velocitiesForStepsSlots(
    stepsSlotArray: StepsSlot[],
    maxValue: number
  ) {
    return stepsSlotArray.map((slot) => {
      if (!slot) {
        return null;
      }
      return ((slot - 1) / (maxValue - 1)) * 0.2 + 0.8;
    });
  }

  pieces: DrumTypeKey[];
  kit: (ConfigurableKick | ConfigurableSnare | ConfigurableHat)[] = [];

  constructor({ pieces }: { pieces: DrumTypeKey[] }) {
    this.pieces = pieces;
  }

  initialize(volume: number, mixer: Mixer) {
    this.output = new Gain(volume);
    if (mixer.channel) this.output.connect(mixer.channel);
    const gain = 1 / this.pieces.length;
    const channel = mixer.channel;
    this.kit = this.pieces.map((piece) => {
      let drum;
      if (piece === "KICK") {
        drum = new ConfigurableKick(gain * 3);
      } else if (piece === "SNARE") {
        drum = new ConfigurableSnare(gain * 2);
      } else if (piece === "CLOSED_HAT") {
        drum = new ConfigurableHat(gain * 0.75, true);
      } else {
        // if (piece === "OPEN_HAT") {
        drum = new ConfigurableHat(gain * 0.75, false);
      }
      if (channel && this.output) drum.output.connect(this.output);
      return drum;
    });
  }

  dispose() {
    this.kit.forEach((item) => item.output.dispose());
  }

  exportParams(): DrumsParams {
    return {
      volume: this.output?.gain.value || 0,
      pieces: this.pieces,
      kit: this.kit.map((d) => d.exportParams()),
    };
  }

  playVelocities(velocities: (number | null)[], time: number) {
    this.kit.forEach((drum, i) => drum.play(velocities[i], time));
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
