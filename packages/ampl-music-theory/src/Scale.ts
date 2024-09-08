import { Interval } from "./Interval";
import { ModeParams, Mode } from "./Mode";
import { Notation, NotationAlternate, Note } from "./Note";

export const OCTAVES: number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8];
export const STEPS: number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

export interface ScaleParams {
  /**
   * The root of the scale. Can be alternative format (flat instead of sharp).
   */
  root: Notation | NotationAlternate;
  /**
   * The scale mode, can provide vanity modes (major, minor).
   */
  mode: ModeParams["type"];
}

export class Scale {
  /**
   * Array of 7 intervals in the scale
   */
  intervals: Interval[];
  /**
   * Common label for the scale's key.
   */
  label: string;
  /**
   * Library of all notes
   */
  library = Scale.buildLibrary();
  /**
   * Scale's mode. Can be a vanity mode (minor, major)
   */
  mode: Mode;
  /**
   * Array of playable note ids in the scale
   */
  noteIds: string[];
  /**
   * Notation or alternative notation for the root of the scale.
   */
  root: Notation | NotationAlternate;
  /**
   * Index of the root
   */
  rootOffset: number;

  constructor(params: ScaleParams) {
    this.root = params.root;
    this.label = "";
    this.intervals = [];
    this.noteIds = [];
    this.update(params);
  }

  update({ root, mode }: ScaleParams) {
    this.mode = new Mode({ type: mode });
    this.root = root;
    this.rootOffset = Note.notationIndex(root);
    this.label = `${root} ${this.mode.name}`;

    this.intervals = this.mode.steps.map(
      (step, index) =>
        new Interval(index, this.rootOffset + step, this.mode.intervals[index])
    );

    this.noteIds = [];
    const lastOctave = OCTAVES[OCTAVES.length - 1];
    OCTAVES.forEach((mainOctave) => {
      this.intervals.forEach(({ notation, octave }) => {
        const relOctave = octave + mainOctave;
        if (relOctave <= lastOctave) {
          this.noteIds.push(
            Note.noteIdFromNotationAndOctave(notation, relOctave)
          );
        }
      });
    });
  }

  static buildLibrary() {
    return OCTAVES.reduce<{ [noteId: string]: Note }>((library, octave) => {
      STEPS.forEach((step) => {
        const note = new Note({ octave, step });
        library[note.id] = note;
      });
      return library;
    }, {});
  }

  /**
   * Array of playable notes in the scale.
   */
  get notes(): Note[] {
    return this.noteIds.map((noteId) => this.library[noteId]);
  }
}
