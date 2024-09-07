import { Interval, IntervalNote } from "./Interval";
import { Notation, Note } from "./Note";

export type ChordType =
  | "maj"
  | "min"
  | "maj7"
  | "min7"
  | "dom7"
  | "aug"
  | "dim";

export type ChordTypeLabel = "" | "m" | "m7" | "M7" | "+" | "°" | "7";

export class Chord {
  key: string;
  label: string;
  typeLabel: string;
  notation: Notation;
  notes: IntervalNote[];
  type: ChordType;

  constructor(step: number, type: ChordType) {
    this.typeLabel = Chord.labelFromType(type);
    if (type === "maj7") {
      const notes = Interval.notesFromIndexOctaveAndType(step, 0, "maj");
      const min = Interval.notesFromIndexOctaveAndType(
        Note.notationIndex(notes[1].notation),
        notes[1].octave,
        "min"
      );
      this.initializeFromNotes(notes.concat(min[2]));
    } else if (type === "min7") {
      const notes = Interval.notesFromIndexOctaveAndType(step, 0, "min");
      const min = Interval.notesFromIndexOctaveAndType(
        Note.notationIndex(notes[1].notation),
        notes[1].octave,
        "min"
      );
      this.initializeFromNotes(notes.concat(min[2]));
    } else if (type === "dom7") {
      const notes = Interval.notesFromIndexOctaveAndType(step, 0, "maj");
      const dim = Interval.notesFromIndexOctaveAndType(
        Note.notationIndex(notes[1].notation),
        notes[1].octave,
        "dim"
      );
      this.initializeFromNotes(notes.concat(dim[2]));
    } else {
      this.initializeFromNotes(
        Interval.notesFromIndexOctaveAndType(step, 0, type)
      );
    }
  }

  initializeFromNotes(notes: IntervalNote[]) {
    this.label = notes[0].notation + this.typeLabel;
    this.notation = notes[0].notation;
    this.key = Chord.keyFromNotes(notes);
    this.notes = notes;
  }

  static keyFromNotes(notes: IntervalNote[]) {
    return notes
      .map(({ notation }) => notation)
      .sort()
      .join("-");
  }

  static labelFromType(type: ChordType): ChordTypeLabel {
    switch (type) {
      case "maj":
        return "";
      case "min":
        return "m";
      case "min7":
        return "m7";
      case "maj7":
        return "M7";
      case "aug":
        return "+";
      case "dim":
        return "°";
      case "dom7":
        return "7";
    }
  }

  static get types(): ChordType[] {
    return ["maj", "min", "maj7", "min7", "dom7", "aug", "dim"];
  }
}
