import {
  type ScaleParams,
  Scale,
  Mode,
  Note,
} from "../../../packages/amplib-music-theory/src";
import { StepsSlot } from "./Steps";

export const MODES = Mode.types;
export const ROOTS = Note.notationsUnique;

export type NotesParams = ScaleParams;

export class Notes {
  scale: Scale;
  currentInterval = 0;

  constructor({ root, mode }: NotesParams) {
    this.scale = new Scale({ root, mode });
  }

  get interval() {
    return this.scale.intervals[this.currentInterval];
  }

  exportParams(): NotesParams {
    return { root: this.scale.root, mode: this.scale.mode.type };
  }

  getMode() {
    return this.scale.mode;
  }

  setMode(mode: string) {
    if (Mode.stringIsModeType(mode))
      this.scale.update({ root: this.scale.root, mode });
  }

  getRoot() {
    return this.scale.root;
  }

  setRoot(root: string) {
    if (Note.stringIsNotation(root))
      this.scale.update({ root, mode: this.scale.mode.type });
  }

  currentModeSteps(): {
    stepsForScale: number[];
    stepsForInterval: number[];
    stepsForRoot: number[];
  } {
    return {
      stepsForScale: this.scale.intervals
        .flatMap((interval) => [
          Note.notationIndex(interval.notation),
          Note.notationIndex(interval.notation) + 12,
        ])
        .sort((a, b) => a - b),
      stepsForInterval: this.interval.notes
        .flatMap((note) => [
          Note.notationIndex(note.notation),
          Note.notationIndex(note.notation) + 12,
        ])
        .sort((a, b) => a - b),
      stepsForRoot: [
        Note.notationIndex(this.interval.notes[0].notation),
        Note.notationIndex(this.interval.notes[0].notation) + 12,
      ],
    };
  }

  notesForKeyboard(
    step: number,
    ghostCount: number,
    baseOctave: number,
    relativeOctave: number // 0, 1
  ): { notations: string[]; steps: number[] } {
    const stepToSearchFor = step + ((relativeOctave * 12) % 24);
    const possibleNotes = [
      ...this.interval.notes,
      ...this.interval.notes.map((a) => {
        return {
          ...a,
          octave: (a.octave + 1) % 2,
        };
      }),
    ];
    const options = possibleNotes
      .map((a) => {
        const step = Note.notationIndex(a.notation) + a.octave * 12;
        return {
          ...a,
          step,
          distance: Math.abs(stepToSearchFor - step),
        };
      })
      .sort((a, b) => {
        if (a.distance <= 1) {
          return 1;
        }
        if (b.distance <= 1) {
          return -1;
        }
        return a.distance - b.distance;
      });

    const ghostNotations: string[] = [];
    const ghostSteps: number[] = [];
    for (let i = 0; i < ghostCount; i++) {
      if (options[i]) {
        ghostNotations.push(
          `${options[i].notation}${options[i].octave + baseOctave}`
        );
        ghostSteps.push(
          Note.notationIndex(options[i].notation) + (options[i].octave ? 12 : 0)
        );
      }
    }

    return {
      notations: [
        Note.noteIdFromNotationAndOctave(Note.notations[step], baseOctave),
        ...ghostNotations,
      ],
      steps: [step + (relativeOctave ? 12 : 0), ...ghostSteps],
    };
  }

  notesForStepsSlots(
    stepsSlotArray: StepsSlot[],
    baseOctave: number,
    valueIsOctave: boolean
  ) {
    // We reverse the notes because upward getting higher is expected
    return stepsSlotArray.reverse().map((slot, i) => {
      if (!slot) {
        return null;
      }
      if (valueIsOctave) {
        const { notation, octave } = this.interval.notes[i % 3];
        return `${notation}${slot - 1 + octave + baseOctave}`;
      } else {
        const { notation, octave } = this.interval.notes[slot % 3];
        const octaveFactor = Math.floor(slot / 3);
        return `${notation}${octaveFactor + octave + baseOctave}`;
      }
    });
  }

  setInterval(interval: number) {
    this.currentInterval = interval % 7;
  }
}
