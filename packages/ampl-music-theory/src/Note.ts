export type Notation =
  | "C"
  | "C#"
  | "D"
  | "D#"
  | "E"
  | "F"
  | "F#"
  | "G"
  | "G#"
  | "A"
  | "A#"
  | "B";
export type NotationAlternate =
  | "C"
  | "Db"
  | "D"
  | "Eb"
  | "E"
  | "F"
  | "Gb"
  | "G"
  | "Ab"
  | "A"
  | "Bb"
  | "B";

export class Note {
  /**
   * Frequency hz for this note
   */
  frequency: number;
  /**
   * A unique identifier for this note
   */
  id: string;
  /**
   * Global index of the note on a keyboard (
   * 0 through 107
   */
  index: number;
  /**
   * Primary notation for the note
   */
  notation: Notation;
  /**
   * Optional secondary notation for the note
   */
  notationAlternate?: NotationAlternate;
  /**
   * Global octave number for the note
   * 0 through 8
   */
  octave: number;
  /**
   * Index of the note within the octave
   * 0 through 11
   */
  octaveIndex: number;

  constructor({ octave, step }: { octave: number; step: number }) {
    const notation = Note.notations[step];
    const alternate = Note.notationsAlternate[step];

    this.frequency = Note.octaveStepFrequencies[octave][step];
    this.id = Note.noteIdFromNotationAndOctave(notation, octave);
    this.index = step + octave * 12;
    this.notation = notation;
    this.notationAlternate =
      alternate === this.notation ? undefined : alternate;
    this.octave = octave;
    this.octaveIndex = step;
  }

  static notationIndex(notation: Notation | NotationAlternate): number {
    const notationsIndex = Note.notations.indexOf(notation as Notation);
    if (notationsIndex !== -1) {
      return notationsIndex;
    }
    const notationsAlternateIndex = Note.notationsAlternate.indexOf(
      notation as NotationAlternate
    );
    if (notationsAlternateIndex !== -1) {
      return notationsAlternateIndex;
    }
    return -1;
  }

  static noteIdFromNotationAndOctave(notation: Notation, octave: number) {
    return `${notation}${octave}`;
  }

  static get notations(): Notation[] {
    return ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  }

  static get notationsAlternate(): NotationAlternate[] {
    return ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  }

  static get notationsUnique(): (Notation | NotationAlternate)[] {
    return Array.from(new Set([...Note.notations, ...Note.notationsAlternate]));
  }

  // prettier-ignore
  static get octaveStepFrequencies(): {
    [K in number]: { [K in number]: number }
  } { 
    return {
      0: { 0: 16.352, 1: 17.324, 2: 18.354, 3: 19.445, 4: 20.602, 5: 21.827, 6: 23.125, 7: 24.5, 8: 25.957, 9: 27.5, 10: 29.135, 11: 30.868, },
      1: { 0: 32.703, 1: 34.648, 2: 36.708, 3: 38.891, 4: 41.203, 5: 43.654, 6: 46.249, 7: 48.999, 8: 51.913, 9: 55, 10: 58.27, 11: 61.735, },
      2: { 0: 65.406, 1: 69.296, 2: 73.416, 3: 77.782, 4: 82.407, 5: 87.307, 6: 92.499, 7: 97.999, 8: 103.826, 9: 110, 10: 116.541, 11: 123.471,  },
      3: { 0: 130.813, 1: 138.591, 2: 146.832, 3: 155.563, 4: 164.814, 5: 174.614, 6: 184.997, 7: 195.998, 8: 207.652, 9: 220, 10: 233.082, 11: 246.942, },
      4: { 0: 261.626, 1: 277.183, 2: 293.665, 3: 311.127, 4: 329.628, 5: 349.228, 6: 369.994, 7: 391.995, 8: 415.305, 9: 440, 10: 466.164, 11: 493.883, },
      5: { 0: 523.251, 1: 554.365, 2: 587.33, 3: 622.254, 4: 659.255, 5: 698.456, 6: 739.989, 7: 783.991, 8: 830.609, 9: 880, 10: 932.328, 11: 987.767, },
      6: { 0: 1046.502, 1: 1108.731, 2: 1174.659, 3: 1244.508, 4: 1318.51, 5: 1396.913, 6: 1479.978, 7: 1567.982, 8: 1661.219, 9: 1760, 10: 1864.655, 11: 1975.533, },
      7: { 0: 2093.005, 1: 2217.461, 2: 2349.318, 3: 2489.016, 4: 2637.02, 5: 2793.826, 6: 2959.955, 7: 3135.963, 8: 3322.438, 9: 3520, 10: 3729.31, 11: 3951.066, },
      8: { 0: 4186.01, 1: 4434.92, 2: 4698.63, 3: 4978.03, 4: 5274.04, 5: 5587.65, 6: 5919.91, 7: 6271.93, 8: 6644.88, 9: 7040, 10: 7458.62, 11: 7902.13, },
    };
  }

  static stringIsNotation(
    string: string
  ): string is Notation | NotationAlternate {
    return (
      Note.notations.includes(string as Notation) ||
      Note.notationsAlternate.includes(string as NotationAlternate)
    );
  }
}
