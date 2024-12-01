import { Mixer } from "./Mixer";
import { Notes } from "./Notes";
import { Synths, ConfigurableSynthParams } from "./Synths";

export interface KeyboardParams {
  octave: number;
  theme: number;
  main: { volume: number; settings: ConfigurableSynthParams };
  ghosts: {
    volume: number;
    settings: ConfigurableSynthParams;
    voices: number;
  };
}

export class Keyboard {
  notes: Notes;
  theme: number;
  octave: number;
  main: Synths;
  ghosts: Synths;
  currentOctave: number | null = null;
  currentStep: number | null = null;
  mainStep: number | null = null;
  ghostSteps: number[] = [];

  constructor({
    theme,
    notes,
    main,
    ghosts,
    octave,
  }: {
    theme: number;
    notes: Notes;
    main: Synths;
    ghosts: Synths;
    octave: number;
  }) {
    this.theme = theme;
    this.notes = notes;
    this.main = main;
    this.ghosts = ghosts;
    this.octave = octave;
  }

  initialize({
    mixer,
    main,
    ghosts,
  }: {
    mixer: Mixer;
  } & KeyboardParams) {
    this.main.initialize({ ...main, mixer, voices: 1 });
    this.ghosts.initialize({ ...ghosts, mixer });
  }

  dispose() {
    this.main.dispose();
    this.ghosts.dispose();
  }

  exportParams(): KeyboardParams {
    return {
      theme: this.theme,
      octave: this.octave,
      main: this.main.exportParams(),
      ghosts: this.ghosts.exportParams(),
    };
  }

  handleIntervalChange({ time }: { time: number }) {
    if (this.currentStep !== null) {
      const step = this.currentStep;
      const octave = this.currentOctave || 0;
      this.currentStep = null;
      this.currentOctave = null;
      this.handlePress({ step, octave, time });
    }
  }

  handlePress({
    step,
    octave,
    time,
  }: {
    step: number;
    octave: number;
    time: number;
  }) {
    if (step === this.currentStep && octave === this.currentOctave) {
      this.currentStep = null;
      this.currentOctave = null;
      this.mainStep = null;
      this.ghostSteps = [];
      this.main.stop(time);
      this.ghosts.stop(time);
    } else {
      const {
        notations: [note1, ...rest],
        steps: [mainStep, ...ghostSteps],
      } = this.notes.notesForKeyboard(
        step,
        this.ghosts.voices.length,
        this.octave + octave,
        octave
      );

      this.currentStep = step;
      this.currentOctave = octave;
      this.mainStep = mainStep;
      this.ghostSteps = ghostSteps;

      this.main.playNotes([note1], time);
      this.ghosts.playNotes(rest, time);
    }
  }

  handleRelease({
    step: _step,
    octave: _octave,
    time: _time,
  }: {
    step: number;
    octave: number;
    time: number;
  }) {
    // console.log("Keyboard Release", { step, octave, time });
  }
}
