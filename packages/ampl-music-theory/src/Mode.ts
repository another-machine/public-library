import { IntervalType, Interval } from "./Interval";

export type ModeType =
  | "ionian"
  | "dorian"
  | "phrygian"
  | "lydian"
  | "mixolydian"
  | "aeolian"
  | "locrian"
  | "melodic"
  | "harmonic";
export type ModeTypeVanity = "major" | "minor";

export interface ModeParams {
  type: ModeType | ModeTypeVanity;
}

export class Mode {
  intervals: IntervalType[];
  name: string;
  steps: number[];

  constructor({ type }: ModeParams) {
    this.name = Mode.nameFromType(type);
    this.steps = Mode.stepsFromType(type);
    this.intervals = Mode.intervalsFromType(type);
  }

  static intervalsFromType(type: ModeType | ModeTypeVanity) {
    switch (type) {
      case "major":
      case "ionian":
        return Interval.intervalsFromOffset(0);
      case "dorian":
        return Interval.intervalsFromOffset(1);
      case "phrygian":
        return Interval.intervalsFromOffset(2);
      case "lydian":
        return Interval.intervalsFromOffset(3);
      case "mixolydian":
        return Interval.intervalsFromOffset(4);
      case "minor":
      case "aeolian":
        return Interval.intervalsFromOffset(5);
      case "locrian":
        return Interval.intervalsFromOffset(6);
      case "melodic":
        return Interval.intervalsFromModeType("melodic");
      case "harmonic":
        return Interval.intervalsFromModeType("harmonic");
    }
  }

  static nameFromType(type: ModeType | ModeTypeVanity) {
    switch (type) {
      case "major":
      case "ionian":
        return "Ionian";
      case "dorian":
        return "Dorian";
      case "phrygian":
        return "Phrygian";
      case "lydian":
        return "Lydian";
      case "mixolydian":
        return "Mixolydian";
      case "minor":
      case "aeolian":
        return "Aeolian";
      case "locrian":
        return "Locrian";
      case "melodic":
        return "Melodic Minor";
      case "harmonic":
        return "Harmonic Minor";
    }
  }

  static stepsFromType(type: ModeType | ModeTypeVanity) {
    switch (type) {
      case "major":
      case "ionian":
        return Mode.stepsFromIncrements([2, 2, 1, 2, 2, 2, 1]);
      case "dorian":
        return Mode.stepsFromIncrements([2, 1, 2, 2, 2, 1, 2]);
      case "phrygian":
        return Mode.stepsFromIncrements([1, 2, 2, 2, 1, 2, 2]);
      case "lydian":
        return Mode.stepsFromIncrements([2, 2, 2, 1, 2, 2, 1]);
      case "mixolydian":
        return Mode.stepsFromIncrements([2, 2, 1, 2, 2, 1, 2]);
      case "minor":
      case "aeolian":
        return Mode.stepsFromIncrements([2, 1, 2, 2, 1, 2, 2]);
      case "locrian":
        return Mode.stepsFromIncrements([1, 2, 2, 1, 2, 2, 2]);
      case "melodic":
        return Mode.stepsFromIncrements([2, 1, 2, 2, 2, 2, 1]);
      case "harmonic":
        return Mode.stepsFromIncrements([2, 1, 2, 2, 1, 3, 1]);
    }
  }

  static stepsFromIncrements(increments: (1 | 2 | 3)[]): number[] {
    const steps: number[] = [0];
    let step = 0;
    for (let i = 0; i < increments.length - 1; i++) {
      step += increments[i];
      steps.push(step);
    }
    return steps;
  }
}
