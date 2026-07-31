import { Chord, ChordType } from "./Chord";
import { Notation, Note } from "./Note";

export interface ParsedChord {
  /** Deduped pitch classes, 0–11, in the order they were written. */
  pitchClasses: number[];
  /** Primary notation for each pitch class, in the same order. */
  notations: Notation[];
  /** The input, trimmed. */
  label: string;
  /**
   * The matching `Chord` when the notes form a recognised quality, otherwise
   * undefined. Most inputs are not: a `Chord` is always a triad or a seventh,
   * whereas this parser accepts any set of notes, including one or two.
   */
  chord?: Chord;
}

/**
 * Spellings outside `Notation` and `NotationAlternate`.
 *
 * Note carries the twelve sharps and the five common flats, which is every
 * name you need to describe a pitch. These four are the ones you only reach
 * for when the key signature demands them — Cb in G flat major, E# in F sharp
 * major. They are real names for real notes, so the parser accepts them, but
 * they do not deserve a place in the Notation union.
 */
const THEORETICAL_NOTATIONS: Record<string, number> = {
  Cb: 11,
  "B#": 0,
  Fb: 4,
  "E#": 5,
};

/** Semitones above the root for each chord quality. */
const CHORD_INTERVALS: Record<ChordType, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  aug: [0, 4, 8],
  dim: [0, 3, 6],
};

function pitchClassFromName(name: string): number | undefined {
  const index = Note.notationIndex(name as Notation);
  if (index !== -1) return index;
  return THEORETICAL_NOTATIONS[name];
}

/**
 * Find the `Chord` whose notes are exactly this set, if there is one.
 *
 * An augmented triad is symmetric under transposition — C, E and G# augmented
 * are the same three pitch classes — so the root is taken to be the first note
 * written rather than guessed.
 */
export function chordFromPitchClasses(
  pitchClasses: number[]
): Chord | undefined {
  const unique = Array.from(new Set(pitchClasses));
  for (const root of unique) {
    for (const type of Chord.types) {
      const intervals = CHORD_INTERVALS[type];
      if (intervals.length !== unique.length) continue;
      const expected = intervals.map((step) => (root + step) % 12);
      if (expected.every((pitchClass) => unique.includes(pitchClass))) {
        return new Chord(root, type);
      }
    }
  }
  return undefined;
}

/**
 * Parse concatenated note letters into pitch classes.
 *
 *   parseChord("CEG")  // [0, 4, 7], recognised as C major
 *   parseChord("ACBb") // [9, 0, 10], no chord
 *   parseChord("CG")   // [0, 7], no chord
 *
 * Each note is a letter A–G with an optional `#` or `b`. Quality suffixes are
 * deliberately not accepted: "Cm" and "C7" throw rather than parse, because
 * the notation here spells out every note it means. Construct a `Chord`
 * directly if you want to name a quality instead of spelling it.
 *
 * Duplicates collapse to their first occurrence, so order carries meaning —
 * the first note written is the root.
 */
export function parseChord(letters: string): ParsedChord {
  const trimmed = letters.trim();
  if (!trimmed) throw new Error(`Empty chord: "${letters}"`);

  const seen = new Set<number>();
  const pitchClasses: number[] = [];
  const notations: Notation[] = [];
  let position = 0;

  while (position < trimmed.length) {
    const letter = trimmed[position];
    if (!/[A-G]/.test(letter)) {
      throw new Error(
        `Unexpected character "${letter}" in chord "${letters}" (position ${position}). Use letters A–G with optional # or b.`
      );
    }

    let name = letter;
    position++;
    const accidental = trimmed[position];
    if (accidental === "#" || accidental === "b") {
      name += accidental;
      position++;
    }

    const pitchClass = pitchClassFromName(name);
    if (pitchClass === undefined) {
      throw new Error(`Unknown note "${name}" in chord "${letters}"`);
    }

    if (!seen.has(pitchClass)) {
      seen.add(pitchClass);
      pitchClasses.push(pitchClass);
      notations.push(Note.notations[pitchClass]);
    }
  }

  if (pitchClasses.length === 0) {
    throw new Error(`No notes in chord: "${letters}"`);
  }

  return {
    pitchClasses,
    notations,
    label: trimmed,
    chord: chordFromPitchClasses(pitchClasses),
  };
}
