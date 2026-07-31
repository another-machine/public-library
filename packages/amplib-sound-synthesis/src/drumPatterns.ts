/**
 * Omnichord-style beat patterns.
 *
 * Sixteen steps for 4/4, twelve for 3/4 — `steps` is the loop length, not a
 * fixed grid, so a waltz is not padded out to sixteen with silence. Values
 * are velocities from 0 to 1; 0 means the voice does not fire on that step.
 *
 * Origin: another-machine/avva, src/audio/drums/patterns.ts
 */


export type DrumPattern = {
  label: string;
  steps: number;
  kick:   number[];
  snare:  number[];
  hihatC: number[];
  hihatO: number[];
  rim:    number[];
};

export const PATTERN_NAMES = [
  "rock",
  "bossanova",
  "waltz",
  "march",
  "slow-rock",
  "cha-cha",
  "samba",
  "ballad",
] as const;

export type PatternName = typeof PATTERN_NAMES[number];

// prettier-ignore
export const PATTERNS: Record<PatternName, DrumPattern> = {
  "rock": {
    label: "Rock",
    steps: 16,
    //          1     +     2     +     3     +     4     +
    kick:   [1.0, 0, 0, 0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 0, 0, 0],
    snare:  [0,   0, 0, 0, 1.0, 0, 0, 0, 0, 0, 0, 0, 1.0, 0, 0, 0],
    hihatC: [1.0, 0, 0.6, 0, 1.0, 0, 0.6, 0, 1.0, 0, 0.6, 0, 1.0, 0, 0.6, 0],
    hihatO: [0,   0, 0,   0, 0,   0, 0,   0, 0,   0, 0,   0, 0,   0, 0,   0],
    rim:    [0,   0, 0,   0, 0,   0, 0,   0, 0,   0, 0,   0, 0,   0, 0,   0],
  },

  "bossanova": {
    label: "Bossa Nova",
    steps: 16,
    //          1     +     2     +     3     +     4     +
    kick:   [1.0, 0, 0, 0.6, 0, 0, 1.0, 0, 0, 0.6, 0, 0, 0, 0, 0.6, 0],
    snare:  [0,   0, 0, 0,   0, 0, 0,   0, 0, 0,   0, 0, 0, 0, 0,   0],
    hihatC: [0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6],
    hihatO: [0,   0, 0, 0,   0, 0, 0,   0, 0, 0,   0, 0, 0, 0, 0,   0],
    rim:    [0,   0, 0, 0,   1.0, 0, 0, 0, 0, 0,   0, 0, 1.0, 0, 0, 0],
  },

  "waltz": {
    label: "Waltz",
    steps: 12, // 3/4 time — 3 beats × 4 16th-note subdivisions
    //          1     +     2     +     3     +
    kick:   [1.0, 0, 0, 0, 0,   0, 0, 0, 0,   0, 0, 0],
    snare:  [0,   0, 0, 0, 1.0, 0, 0, 0, 1.0, 0, 0, 0],
    hihatC: [0.8, 0, 0.5, 0, 0.8, 0, 0.5, 0, 0.8, 0, 0.5, 0],
    hihatO: [0,   0, 0,   0, 0,   0, 0,   0, 0,   0, 0,   0],
    rim:    [0,   0, 0,   0, 0,   0, 0,   0, 0,   0, 0,   0],
  },

  "march": {
    label: "March",
    steps: 16,
    //          1     +     2     +     3     +     4     +
    kick:   [1.0, 0, 0, 0, 1.0, 0, 0, 0, 1.0, 0, 0, 0, 1.0, 0, 0, 0],
    snare:  [0,   0, 1.0, 0, 0, 0, 1.0, 0, 0, 0, 1.0, 0, 0, 0, 1.0, 0],
    hihatC: [1.0, 0, 0,   0, 1.0, 0, 0, 0, 1.0, 0, 0, 0, 1.0, 0, 0, 0],
    hihatO: [0,   0, 0,   0, 0,   0, 0, 0, 0,   0, 0, 0, 0,   0, 0, 0],
    rim:    [0,   0, 0,   0, 0,   0, 0, 0, 0,   0, 0, 0, 0,   0, 0, 0],
  },

  "slow-rock": {
    label: "Slow Rock",
    steps: 16,
    //          1     +     2     +     3     +     4     +
    kick:   [1.0, 0, 0, 0, 0, 0, 0.6, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    snare:  [0,   0, 0, 0, 0, 0, 0,   0, 1.0, 0, 0, 0, 0, 0, 0, 0],
    hihatC: [0.7, 0, 0, 0, 0.7, 0, 0, 0, 0.7, 0, 0, 0, 0.7, 0, 0, 0],
    hihatO: [0,   0, 0, 0, 0,   0, 0, 0, 0,   0, 0, 0, 0,   0, 0, 0],
    rim:    [0,   0, 0, 0, 0,   0, 0, 0, 0,   0, 0, 0, 0,   0, 0, 0],
  },

  "cha-cha": {
    label: "Cha-Cha",
    steps: 16,
    //          1     +     2     +     3     +     4     +
    kick:   [1.0, 0, 0, 0, 1.0, 0, 0, 0, 0,   0, 0, 0, 0,   0, 0, 0],
    snare:  [0,   0, 0, 0, 0,   0, 0, 0, 1.0, 0, 0, 0, 1.0, 0, 0, 0],
    hihatC: [0.8, 0, 0.6, 1.0, 0, 0.6, 1.0, 0, 0.8, 0, 0.6, 1.0, 0, 0.6, 1.0, 0],
    hihatO: [0,   0, 0,   0,   0, 0,   0,   0, 0,   0, 0,   0,   0, 0,   0,   0],
    rim:    [0,   0, 0,   0.6, 0, 0,   0.6, 0, 0,   0, 0,   0.6, 0, 0,   0.6, 0],
  },

  "samba": {
    label: "Samba",
    steps: 16,
    //          1     +     2     +     3     +     4     +
    kick:   [1.0, 0, 0, 0.6, 0, 0, 0.6, 0, 1.0, 0, 0, 0.6, 0, 0, 0.6, 0],
    snare:  [0,   0, 0, 0,   0, 0, 0,   0, 0,   0, 0, 0,   0, 0, 0,   0],
    hihatC: [1.0, 1.0, 0, 1.0, 1.0, 0, 1.0, 1.0, 1.0, 1.0, 0, 1.0, 1.0, 0, 1.0, 1.0],
    hihatO: [0,   0,   0, 0,   0,   0, 0,   0,   0,   0,   0, 0,   0,   0, 0,   0],
    rim:    [0,   0,   1.0, 0, 0,   1.0, 0, 0,   0,   0,   1.0, 0, 0,   1.0, 0, 0],
  },

  "ballad": {
    label: "Ballad",
    steps: 16,
    //          1     +     2     +     3     +     4     +
    kick:   [1.0, 0, 0, 0, 0, 0, 0, 0, 0,   0, 0, 0, 0, 0, 0, 0],
    snare:  [0,   0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, 0, 0, 0, 0, 0],
    hihatC: [0.5, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0, 0, 0],
    hihatO: [0,   0, 0, 0, 0, 0, 0, 0, 0,   0, 0, 0, 0, 0, 0, 0],
    rim:    [0,   0, 0, 0, 0.4, 0, 0, 0, 0, 0, 0, 0, 0.4, 0, 0, 0],
  },
};
