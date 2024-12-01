import { Drums, DrumsParams } from "./Drums";
import { Mixer } from "./Mixer";
import { Steps, StepsParams } from "./Steps";
import { Synths, ConfigurableSynthParams, SynthsParams } from "./Synths";

type SequencerBaseProps = { theme: number; key: string; steps: Steps };

interface SharedSequencerParams {
  key: string;
  theme: number;
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

export type SequencerParams = { theme: number } & (
  | DrumSequencerParams
  | SynthSequencerParams
);

class SequencerBase {
  key: string;
  steps: Steps;
  theme: number;

  constructor({ key, steps, theme }: SequencerBaseProps) {
    this.key = key;
    this.steps = steps;
    this.theme = theme;
  }

  initialize(_args: { volume: number; mixer: Mixer }) {}

  stop(_time: number) {}

  exportParamsShared(): SharedSequencerParams {
    return {
      theme: this.theme,
      key: this.key,
      steps: this.steps.exportParams(),
    };
  }
}

export class DrumSequencer extends SequencerBase {
  drums: Drums;
  type: "DRUM" = "DRUM";

  constructor({
    key,
    steps,
    theme,
    drums,
  }: SequencerBaseProps & { drums: Drums }) {
    super({ key, steps, theme });
    this.drums = drums;
  }

  initialize({ mixer }: { mixer: Mixer }) {
    this.drums.initialize({ mixer });
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
    theme,
    synths,
  }: SequencerBaseProps & { octave: number; synths: Synths }) {
    super({ key, steps, theme });
    this.octave = octave;
    this.synths = synths;
  }

  initialize({ mixer }: { mixer: Mixer }) {
    this.synths.initialize({ mixer });
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
