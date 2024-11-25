import { Drums, DrumsParams } from "./Drums";
import { Mixer } from "./Mixer";
import { Steps, StepsParams } from "./Steps";
import { Synths, ConfigurableSynthParams, SynthsParams } from "./Synths";

type SequencerBaseProps = { key: string; steps: Steps };

interface SharedSequencerParams {
  key: string;
  steps: StepsParams;
}
interface DrumSequencerParams extends SharedSequencerParams {
  synths: DrumsParams;
  type: "DRUM";
}
interface SynthSequencerParams extends SharedSequencerParams {
  octave: number;
  synths: SynthsParams;
  type: "SYNTH";
}

export type SequencerParams = DrumSequencerParams | SynthSequencerParams;

class SequencerBase {
  key: string;
  steps: Steps;

  constructor({ key, steps }: SequencerBaseProps) {
    this.key = key;
    this.steps = steps;
  }

  initialize(_args: { volume: number; mixer: Mixer }) {}

  stop(_time: number) {}

  exportParamsShared(): SharedSequencerParams {
    return {
      key: this.key,
      steps: this.steps.exportParams(),
    };
  }
}

export class DrumSequencer extends SequencerBase {
  drums: Drums;
  type: "DRUM" = "DRUM";

  constructor({ key, steps, drums }: SequencerBaseProps & { drums: Drums }) {
    super({ key, steps });
    this.drums = drums;
  }

  initialize({
    volume,
    mixer,
    settings,
  }: {
    volume: number;
    mixer: Mixer;
    settings: DrumsParams["settings"];
  }) {
    this.drums.initialize({ volume, mixer, settings });
  }

  dispose() {
    this.drums.dispose();
  }

  isDrum(): this is DrumSequencer {
    return true;
  }

  isSynth(): this is SynthSequencer {
    return false;
  }

  exportParams(): DrumSequencerParams {
    return {
      ...this.exportParamsShared(),
      type: this.type,
      synths: this.drums.exportParams(),
    };
  }
}

export class SynthSequencer extends SequencerBase {
  octave: number;
  synths: Synths;
  type: "SYNTH" = "SYNTH";

  constructor({
    key,
    octave,
    steps,
    synths,
  }: SequencerBaseProps & { octave: number; synths: Synths }) {
    super({ key, steps });
    this.octave = octave;
    this.synths = synths;
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
    this.synths.initialize({ voices, volume, mixer, settings });
  }

  dispose() {
    this.synths.dispose();
  }

  stop(time: number) {
    this.synths.stop(time);
  }

  isDrum(): this is DrumSequencer {
    return false;
  }

  isSynth(): this is SynthSequencer {
    return true;
  }

  exportParams(): SynthSequencerParams {
    return {
      ...this.exportParamsShared(),
      type: this.type,
      octave: this.octave,
      synths: this.synths.exportParams(),
    };
  }
}

export type Sequencer = DrumSequencer | SynthSequencer;
