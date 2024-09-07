import { Notation, NotationAlternate, Note } from "./Note";

export type IntervalName = "Augmented" | "Diminished" | "Major" | "Minor";
export type IntervalType = "aug" | "dim" | "maj" | "min";
export interface IntervalNote {
  /**
   * Notation for the note
   */
  notation: Notation;
  /**
   * Octave relative to the first interval's root octave.
   * 0 | 1 | 2
   */
  octave: number;
}

export class Interval {
  /**
   * Common representation of the interval
   */
  label: string;
  /**
   * Metadata
   */
  meta: {
    /**
     * Interval name
     */
    name: IntervalName;
    /**
     * Interval roman numeral syntax
     */
    numeral: string;
    /**
     * Interval type
     */
    type: IntervalType;
  };
  /**
   * Primary identifier of the interval root note
   */
  notation: Notation;
  /**
   * Optional secondary identifier of the interval root note
   */
  notationAlternate?: NotationAlternate;
  /**
   * Interval triad notes
   */
  notes: IntervalNote[];
  /**
   * Octave relative octave to first interval's root note.
   * 0 | 1
   */
  octave: number;
  /**
   * Interval step in the mode
   * 0 through 6
   */
  step: number;

  constructor(step: number, offset: number, type: IntervalType) {
    const index = offset % Note.notations.length;
    const octave = offset > Note.notations.length - 1 ? 1 : 0;
    const notation = Note.notations[index];
    const alternate = Note.notationsAlternate[index];
    this.label = `${notation} ${type}`;
    this.notation = notation;
    this.notationAlternate = alternate === notation ? undefined : alternate;
    this.notes = Interval.notesFromIndexOctaveAndType(index, octave, type);
    this.octave = octave;
    this.step = step;
    this.meta = {
      name: Interval.nameFromType(type),
      numeral: Interval.numeralFromType(step, type),
      type,
    };
  }

  static intervalsFromModeType(mode: "melodic" | "harmonic"): IntervalType[] {
    switch (mode) {
      case "melodic":
        return ["min", "min", "aug", "maj", "maj", "dim", "dim"];
      case "harmonic":
        return ["min", "dim", "aug", "min", "maj", "maj", "dim"];
    }
  }

  static intervalsFromOffset(offset: number): IntervalType[] {
    // this is ionian, each mode bumps up one offset.
    const base: IntervalType[] = [
      "maj",
      "min",
      "min",
      "maj",
      "maj",
      "min",
      "dim",
    ];
    const triads: IntervalType[] = [];
    for (let i = 0; i < base.length; i++) {
      triads.push(base[(i + offset) % base.length]);
    }
    return triads;
  }

  static nameFromType(type: IntervalType): IntervalName {
    switch (type) {
      case "maj":
        return "Major";
      case "min":
        return "Minor";
      case "aug":
        return "Augmented";
      case "dim":
        return "Diminished";
    }
  }

  static numeralFromType(step: number, type: IntervalType): string {
    const notation = ["i", "ii", "iii", "iv", "v", "vi", "vii"][step];
    switch (type) {
      case "maj":
        return notation.toUpperCase();
      case "min":
        return notation;
      case "aug":
        return `${notation.toUpperCase()}+`;
      case "dim":
        return `${notation}°`;
    }
  }

  static notesFromIndexOctaveAndType(
    offset: number,
    octave: number,
    type: IntervalType
  ): IntervalNote[] {
    // get the steps for this chord type
    const steps = {
      maj: [0, 4, 7],
      min: [0, 3, 7],
      dim: [0, 3, 6],
      aug: [0, 4, 8],
    }[type];
    const notes: IntervalNote[] = [];
    const roots = Note.notations;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const idx = (offset + step) % roots.length;
      // relative octave to base
      const relative = offset + step > roots.length - 1 ? octave + 1 : octave;
      // define the note
      notes.push({ notation: roots[idx], octave: relative });
    }
    return notes;
  }
}
