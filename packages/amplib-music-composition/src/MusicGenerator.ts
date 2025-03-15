import { MovementParams, ExpressionQuality } from "./Movement";
import { Ensemble } from "./Ensemble";
import { Voice, VoiceArchetype } from "./Voice";

// Types for musical elements
export type NoteDuration =
  | "whole"
  | "half"
  | "quarter"
  | "eighth"
  | "sixteenth"
  | "thirtysecond"
  | "dotted_whole"
  | "dotted_half"
  | "dotted_quarter"
  | "dotted_eighth"
  | "dotted_sixteenth"
  | "triplet_half"
  | "triplet_quarter"
  | "triplet_eighth"
  | "triplet_sixteenth";

export type NoteName =
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

export type Meter = {
  beats: number;
  beatUnit: number; // 4 = quarter, 8 = eighth, etc.
};

export type ScaleType =
  | "major"
  | "natural_minor"
  | "harmonic_minor"
  | "melodic_minor"
  | "pentatonic_major"
  | "pentatonic_minor"
  | "dorian"
  | "phrygian"
  | "lydian"
  | "mixolydian"
  | "locrian";

export type Note = {
  pitch: number; // MIDI note number (0-127) or -1 for rest
  duration: NoteDuration;
  velocity: number; // 0-127 for MIDI
  isRest: boolean;
};

export type Measure = {
  notes: Note[];
  meter: Meter;
};

export type Phrase = {
  measures: Measure[];
  startingDynamics: number; // 0-1
  endingDynamics: number; // 0-1
  tensionProfile: number[]; // 0-1 values indicating tension per measure
};

export type Section = {
  phrases: Phrase[];
  key: string; // e.g., "C major", "A minor"
  tempo: number; // BPM
};

export type MusicalPiece = {
  sections: Section[];
  ensemble: Ensemble;
};

// Constants for scales
const SCALES: Record<ScaleType, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  natural_minor: [0, 2, 3, 5, 7, 8, 10],
  harmonic_minor: [0, 2, 3, 5, 7, 8, 11],
  melodic_minor: [0, 2, 3, 5, 7, 9, 11], // Ascending melodic minor
  pentatonic_major: [0, 2, 4, 7, 9],
  pentatonic_minor: [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
};

// Convert note duration to relative length (in quarter notes)
export const DURATION_VALUES: Record<NoteDuration, number> = {
  whole: 4.0,
  half: 2.0,
  quarter: 1.0,
  eighth: 0.5,
  sixteenth: 0.25,
  thirtysecond: 0.125,
  dotted_whole: 6.0,
  dotted_half: 3.0,
  dotted_quarter: 1.5,
  dotted_eighth: 0.75,
  dotted_sixteenth: 0.375,
  triplet_half: (2.0 / 3.0) * 2,
  triplet_quarter: 2.0 / 3.0,
  triplet_eighth: (2.0 / 3.0) * 0.5,
  triplet_sixteenth: (2.0 / 3.0) * 0.25,
};

// Emotion to musical characteristics mapping
const EMOTION_CHARACTERISTICS: Record<
  ExpressionQuality,
  {
    preferredScales: ScaleType[];
    tempoRange: [number, number]; // [min, max] in BPM
    preferredMeters: Meter[];
    rhythmicDensity: number; // 0-1
    harmonyComplexity: number; // 0-1
    melodicIntervalRange: [number, number]; // [min, max] semitone range
    restFrequency: number; // 0-1
  }
> = {
  confident: {
    preferredScales: ["major", "lydian", "mixolydian"],
    tempoRange: [100, 140],
    preferredMeters: [
      { beats: 4, beatUnit: 4 },
      { beats: 3, beatUnit: 4 },
    ],
    rhythmicDensity: 0.7,
    harmonyComplexity: 0.6,
    melodicIntervalRange: [1, 7],
    restFrequency: 0.2,
  },
  playful: {
    preferredScales: ["major", "pentatonic_major", "lydian"],
    tempoRange: [120, 160],
    preferredMeters: [
      { beats: 6, beatUnit: 8 },
      { beats: 4, beatUnit: 4 },
    ],
    rhythmicDensity: 0.8,
    harmonyComplexity: 0.5,
    melodicIntervalRange: [2, 9],
    restFrequency: 0.3,
  },
  calm: {
    preferredScales: ["major", "pentatonic_major", "pentatonic_minor"],
    tempoRange: [60, 80],
    preferredMeters: [
      { beats: 4, beatUnit: 4 },
      { beats: 3, beatUnit: 4 },
    ],
    rhythmicDensity: 0.4,
    harmonyComplexity: 0.4,
    melodicIntervalRange: [1, 5],
    restFrequency: 0.4,
  },
  agitated: {
    preferredScales: ["harmonic_minor", "phrygian", "locrian"],
    tempoRange: [120, 180],
    preferredMeters: [
      { beats: 7, beatUnit: 8 },
      { beats: 5, beatUnit: 8 },
    ],
    rhythmicDensity: 0.9,
    harmonyComplexity: 0.8,
    melodicIntervalRange: [1, 11],
    restFrequency: 0.15,
  },
  urgent: {
    preferredScales: ["harmonic_minor", "melodic_minor", "phrygian"],
    tempoRange: [140, 200],
    preferredMeters: [
      { beats: 4, beatUnit: 4 },
      { beats: 2, beatUnit: 4 },
    ],
    rhythmicDensity: 0.85,
    harmonyComplexity: 0.7,
    melodicIntervalRange: [1, 8],
    restFrequency: 0.1,
  },
  solemn: {
    preferredScales: ["natural_minor", "dorian", "phrygian"],
    tempoRange: [40, 80],
    preferredMeters: [
      { beats: 4, beatUnit: 4 },
      { beats: 3, beatUnit: 4 },
    ],
    rhythmicDensity: 0.3,
    harmonyComplexity: 0.6,
    melodicIntervalRange: [1, 6],
    restFrequency: 0.25,
  },
  contemplative: {
    preferredScales: ["melodic_minor", "dorian", "natural_minor"],
    tempoRange: [60, 90],
    preferredMeters: [
      { beats: 4, beatUnit: 4 },
      { beats: 6, beatUnit: 8 },
    ],
    rhythmicDensity: 0.5,
    harmonyComplexity: 0.7,
    melodicIntervalRange: [1, 7],
    restFrequency: 0.35,
  },
  delicate: {
    preferredScales: ["pentatonic_minor", "major", "dorian"],
    tempoRange: [70, 110],
    preferredMeters: [
      { beats: 3, beatUnit: 4 },
      { beats: 6, beatUnit: 8 },
    ],
    rhythmicDensity: 0.4,
    harmonyComplexity: 0.5,
    melodicIntervalRange: [1, 5],
    restFrequency: 0.3,
  },
};

// Voice archetype to melodic/rhythmic characteristics
const VOICE_ARCHETYPE_CHARACTERISTICS: Record<
  VoiceArchetype,
  {
    preferredDurations: NoteDuration[];
    registerRange: [number, number]; // MIDI note range
    contourSmoothness: number; // 0-1 (0 = angular, 1 = smooth)
    restFrequency: number; // 0-1
    phraseLength: [number, number]; // [min, max] in measures
  }
> = {
  lead: {
    preferredDurations: [
      "quarter",
      "eighth",
      "dotted_eighth",
      "sixteenth",
      "triplet_eighth",
    ],
    registerRange: [60, 96], // Middle C (60) to high C (96)
    contourSmoothness: 0.7,
    restFrequency: 0.2,
    phraseLength: [2, 8],
  },
  accompaniment: {
    preferredDurations: ["half", "quarter", "eighth", "dotted_quarter"],
    registerRange: [48, 76], // C below middle C to E above middle C
    contourSmoothness: 0.5,
    restFrequency: 0.15,
    phraseLength: [2, 4],
  },
  bass: {
    preferredDurations: ["whole", "half", "quarter", "dotted_half"],
    registerRange: [28, 59], // E1 to B3
    contourSmoothness: 0.6,
    restFrequency: 0.1,
    phraseLength: [1, 4],
  },
  rhythm: {
    preferredDurations: ["eighth", "sixteenth", "triplet_eighth", "quarter"],
    registerRange: [40, 72], // E2 to C5
    contourSmoothness: 0.3,
    restFrequency: 0.3,
    phraseLength: [1, 2],
  },
  pad: {
    preferredDurations: ["whole", "dotted_whole", "half", "dotted_half"],
    registerRange: [48, 84], // C3 to C6
    contourSmoothness: 0.9,
    restFrequency: 0.05,
    phraseLength: [2, 8],
  },
  ornament: {
    preferredDurations: [
      "eighth",
      "sixteenth",
      "triplet_sixteenth",
      "thirtysecond",
    ],
    registerRange: [60, 96], // Middle C (60) to high C (96)
    contourSmoothness: 0.4,
    restFrequency: 0.4,
    phraseLength: [1, 2],
  },
};

export class MusicGenerator {
  private selector: () => number;
  private movementParams: MovementParams;
  private ensemble: Ensemble;

  constructor(selector: () => number, movementParams: MovementParams) {
    this.selector = selector;
    this.movementParams = movementParams;

    // Generate the ensemble first
    this.ensemble = Ensemble.generateEnsemble({
      selector: selector,
      voiceCount: Math.floor(2 + selector() * 4), // 2-5 voices
    });
  }

  /**
   * Generate a complete musical piece based on the movement parameters
   */
  generateMusicalPiece(): MusicalPiece {
    const { tempo, mood, complexity, coherence, tensionCurve } =
      this.movementParams;

    // Select a key
    const rootNote = Math.floor(this.selector() * 12); // 0-11 for C through B
    const noteNames: NoteName[] = [
      "C",
      "C#",
      "D",
      "D#",
      "E",
      "F",
      "F#",
      "G",
      "G#",
      "A",
      "A#",
      "B",
    ];
    const rootNoteName = noteNames[rootNote];

    // Select a scale based on mood
    const scaleType = this.selectFromArray(
      EMOTION_CHARACTERISTICS[mood].preferredScales
    );
    const key = `${rootNoteName} ${scaleType.replace("_", " ")}`;

    // Calculate actual tempo from mood's range
    const tempoRange = EMOTION_CHARACTERISTICS[mood].tempoRange;
    const actualTempo =
      tempoRange[0] + (tempoRange[1] - tempoRange[0]) * this.selector();

    // Select a meter based on mood
    const meter = this.selectFromArray(
      EMOTION_CHARACTERISTICS[mood].preferredMeters
    );

    // Determine the structure of the piece
    const sectionCount = Math.floor(2 + this.selector() * 3); // 2-4 sections

    const sections: Section[] = [];

    // Generate each section
    for (let i = 0; i < sectionCount; i++) {
      // Set up the section
      const section: Section = {
        phrases: [],
        key: i === 0 ? key : this.getRelatedKey(key, this.selector()),
        tempo:
          i === 0
            ? actualTempo
            : this.getRelatedTempo(actualTempo, this.selector()),
      };

      // Determine number of phrases based on section
      const phraseCount = Math.floor(2 + this.selector() * 5); // 2-6 phrases per section

      // Generate phrases for this section
      for (let j = 0; j < phraseCount; j++) {
        const phrase = this.generatePhrase({
          key: section.key,
          meter,
          tensionProfile: this.generateTensionProfile(
            4,
            tensionCurve[i % tensionCurve.length]
          ),
          complexity,
          index: j,
          totalPhrases: phraseCount,
        });

        section.phrases.push(phrase);
      }

      sections.push(section);
    }

    return {
      sections,
      ensemble: this.ensemble,
    };
  }

  /**
   * Generate a musical phrase of several measures
   */
  private generatePhrase({
    key,
    meter,
    tensionProfile,
    complexity,
    index,
    totalPhrases,
  }: {
    key: string;
    meter: Meter;
    tensionProfile: number[];
    complexity: number;
    index: number;
    totalPhrases: number;
  }): Phrase {
    const measureCount = tensionProfile.length;
    const measures: Measure[] = [];

    // Generate each measure
    for (let i = 0; i < measureCount; i++) {
      const measure = this.generateMeasure({
        key,
        meter,
        tension: tensionProfile[i],
        complexity,
        measureIndex: i,
        totalMeasures: measureCount,
      });

      measures.push(measure);
    }

    // Calculate dynamics
    const startingDynamics = 0.3 + this.selector() * 0.4; // 0.3-0.7
    const dynamicChange = (this.selector() - 0.5) * 0.6; // -0.3 to 0.3
    const endingDynamics = Math.max(
      0.1,
      Math.min(1.0, startingDynamics + dynamicChange)
    );

    return {
      measures,
      startingDynamics,
      endingDynamics,
      tensionProfile,
    };
  }

  /**
   * Generate a single measure of music
   */
  private generateMeasure({
    key,
    meter,
    tension,
    complexity,
    measureIndex,
    totalMeasures,
  }: {
    key: string;
    meter: Meter;
    tension: number;
    complexity: number;
    measureIndex: number;
    totalMeasures: number;
  }): Measure {
    // Parse the key to get root note and scale type
    const [rootName, ...scaleTypeParts] = key.split(" ");
    const scaleTypeStr = scaleTypeParts.join("_") as ScaleType;

    // Find the root note number
    const noteNames: NoteName[] = [
      "C",
      "C#",
      "D",
      "D#",
      "E",
      "F",
      "F#",
      "G",
      "G#",
      "A",
      "A#",
      "B",
    ];
    const rootNote = noteNames.indexOf(rootName as NoteName);

    // Calculate the total duration for a measure
    const totalDuration = meter.beats * (4 / meter.beatUnit);

    // Generate notes up to the total duration
    const notes: Note[] = [];
    let currentDuration = 0;

    // Generate notes for the measure
    while (currentDuration < totalDuration) {
      // Select a duration based on complexity and tension
      const availableDurations = Object.keys(DURATION_VALUES) as NoteDuration[];

      // Filter durations that won't overflow the measure
      const validDurations = availableDurations.filter(
        (d) => DURATION_VALUES[d] <= totalDuration - currentDuration
      );

      // If no valid durations, add a remainder rest and break
      if (validDurations.length === 0) {
        const remainingDuration = totalDuration - currentDuration;
        // Find the closest matching duration
        const closestDuration = this.findClosestDuration(remainingDuration);

        notes.push({
          pitch: -1, // Rest
          duration: closestDuration,
          velocity: 0,
          isRest: true,
        });

        break;
      }

      // Weight the durations based on complexity (higher complexity = more varied durations)
      let durationWeights = validDurations.map((d) => {
        // Shorter notes are more likely with higher tension or complexity
        const durationValue = DURATION_VALUES[d];
        const probabilityModifier = complexity * tension;

        // Short notes more likely with high complexity/tension
        if (durationValue <= 0.5) return 0.5 + probabilityModifier * 0.5;
        // Medium notes fairly common
        if (durationValue <= 1.0) return 0.7;
        // Long notes less likely with high complexity/tension
        return 0.7 - probabilityModifier * 0.5;
      });

      // Normalize the weights
      const totalWeight = durationWeights.reduce((a, b) => a + b, 0);
      durationWeights = durationWeights.map((w) => w / totalWeight);

      // Select a duration
      const durationIndex = this.weightedSelect(
        validDurations,
        durationWeights
      );
      const selectedDuration = validDurations[durationIndex];

      // Decide if it's a rest or a note
      const isRest = this.selector() < 0.1 + tension * 0.2; // 10-30% chance of rest based on tension

      if (isRest) {
        notes.push({
          pitch: -1,
          duration: selectedDuration,
          velocity: 0,
          isRest: true,
        });
      } else {
        // Generate a pitch based on the scale
        const scale = SCALES[scaleTypeStr];
        const octaveBase = 5; // Middle C octave

        // More tension means more chance of out-of-scale notes
        let pitchClass;
        if (this.selector() < 0.05 + tension * 0.2) {
          // Out of scale note
          pitchClass = Math.floor(this.selector() * 12);
        } else {
          // In-scale note
          const scalePosition = Math.floor(this.selector() * scale.length);
          pitchClass = scale[scalePosition];
        }

        // Calculate octave based on position in measure and tension
        const octaveShift = Math.floor(this.selector() * 3) - 1; // -1, 0, or 1
        const octave = octaveBase + octaveShift;

        // MIDI note number = 12 * octave + pitchClass + rootNote
        const midiNote = 12 * octave + pitchClass + rootNote;

        // Calculate velocity (volume) based on tension and position in measure
        const baseVelocity = 64 + Math.floor(tension * 32); // 64-96
        const rhythmicEmphasis = measureIndex % 2 === 0 ? 16 : 0; // Emphasize downbeats
        const velocity = Math.min(127, baseVelocity + rhythmicEmphasis);

        notes.push({
          pitch: midiNote,
          duration: selectedDuration,
          velocity,
          isRest: false,
        });
      }

      currentDuration += DURATION_VALUES[selectedDuration];
    }

    return {
      notes,
      meter,
    };
  }

  /**
   * Generate note patterns for each voice in the ensemble
   */
  generateVoiceParts(musicalPiece: MusicalPiece): Record<number, Note[][]> {
    const voiceParts: Record<number, Note[][]> = {};

    // Generate parts for each voice
    this.ensemble.voices.forEach((voice, voiceIndex) => {
      const sections: Note[][] = [];

      // Generate for each section
      musicalPiece.sections.forEach((section) => {
        const notes: Note[] = [];

        // Get the characteristics for this voice archetype
        const voiceCharacteristics =
          VOICE_ARCHETYPE_CHARACTERISTICS[voice.archetype];

        // Generate for each phrase
        section.phrases.forEach((phrase) => {
          // Get all the notes for all measures in this phrase
          phrase.measures.forEach((measure) => {
            this.generateVoiceMeasure({
              voice,
              measure,
              key: section.key,
              voiceCharacteristics,
            }).forEach((note) => notes.push(note));
          });
        });

        sections.push(notes);
      });

      voiceParts[voiceIndex] = sections;
    });

    return voiceParts;
  }

  /**
   * Generate notes for a specific voice and measure
   */
  private generateVoiceMeasure({
    voice,
    measure,
    key,
    voiceCharacteristics,
  }: {
    voice: Voice;
    measure: Measure;
    key: string;
    voiceCharacteristics: (typeof VOICE_ARCHETYPE_CHARACTERISTICS)[VoiceArchetype];
  }): Note[] {
    const notes: Note[] = [];

    // Calculate the total duration for the measure
    const totalDuration = measure.meter.beats * (4 / measure.meter.beatUnit);

    // Parse the key to get root note and scale type
    const [rootName, ...scaleTypeParts] = key.split(" ");
    const scaleTypeStr = scaleTypeParts.join("_") as ScaleType;

    // Find the root note number
    const noteNames: NoteName[] = [
      "C",
      "C#",
      "D",
      "D#",
      "E",
      "F",
      "F#",
      "G",
      "G#",
      "A",
      "A#",
      "B",
    ];
    const rootNote = noteNames.indexOf(rootName as NoteName);

    // Get the scale
    const scale = SCALES[scaleTypeStr] || [];

    // Generate notes based on voice archetype
    let currentDuration = 0;

    while (currentDuration < totalDuration) {
      // Select a duration from the preferred durations
      const validDurations = voiceCharacteristics.preferredDurations.filter(
        (d) => DURATION_VALUES[d] <= totalDuration - currentDuration
      );

      // If no valid durations, add rest and break
      if (validDurations.length === 0) {
        const remainingDuration = totalDuration - currentDuration;
        const closestDuration = this.findClosestDuration(remainingDuration);

        notes.push({
          pitch: -1,
          duration: closestDuration,
          velocity: 0,
          isRest: true,
        });

        break;
      }

      // Select duration
      const duration = this.selectFromArray(validDurations);

      // Decide if it's a rest
      const isRest = this.selector() < voiceCharacteristics.restFrequency;

      if (isRest) {
        notes.push({
          pitch: -1,
          duration,
          velocity: 0,
          isRest: true,
        });
      } else {
        // Generate a pitch based on voice register and scale
        const [minRegister, maxRegister] = voiceCharacteristics.registerRange;

        // Generate a pitch within the voice's register range
        const registerSpan = maxRegister - minRegister;
        const basePitch =
          minRegister + Math.floor(this.selector() * registerSpan);

        // Adjust to fit in the scale
        const octave = Math.floor(basePitch / 12);
        const pitchClass = basePitch % 12;

        // Find the closest note in the scale
        let closestScaleNote = scale[0];
        let minDistance = 12;

        scale.forEach((scaleNote) => {
          const distance = Math.min(
            Math.abs(scaleNote - pitchClass),
            Math.abs(scaleNote + 12 - pitchClass)
          );

          if (distance < minDistance) {
            minDistance = distance;
            closestScaleNote = scaleNote;
          }
        });

        // Ensure some harmony by staying in scale most of the time
        // Higher independence = more chromatic freedom
        let finalPitchClass;
        if (this.selector() > voice.independence) {
          finalPitchClass = closestScaleNote;
        } else {
          finalPitchClass = pitchClass;
        }

        // Calculate the MIDI note
        const midiNote = octave * 12 + ((finalPitchClass + rootNote) % 12);

        // Calculate velocity based on dynamic range
        const velocityBase = voice.dynamicRange.min * 127;
        const velocityRange =
          (voice.dynamicRange.max - voice.dynamicRange.min) * 127;
        const velocity = Math.floor(
          velocityBase + this.selector() * velocityRange
        );

        notes.push({
          pitch: midiNote,
          duration,
          velocity,
          isRest: false,
        });
      }

      currentDuration += DURATION_VALUES[duration];
    }

    return notes;
  }

  /**
   * Generate a tension profile for a phrase
   */
  private generateTensionProfile(
    measures: number,
    peakTension: number
  ): number[] {
    const profile: number[] = [];

    // Generate different shapes based on where the peak tension occurs
    const peakPosition = Math.floor(this.selector() * measures);

    for (let i = 0; i < measures; i++) {
      let tension;

      // Calculate distance from peak (normalized to 0-1)
      const distanceFromPeak = Math.abs(i - peakPosition) / measures;

      // Tension falls off based on distance from peak
      tension = peakTension * (1 - distanceFromPeak);

      // Add some small random variations
      tension += (this.selector() - 0.5) * 0.1;

      // Ensure within bounds
      tension = Math.max(0, Math.min(1, tension));

      profile.push(tension);
    }

    return profile;
  }

  /**
   * Find a related key based on a starting key
   */
  private getRelatedKey(key: string, selector: number): string {
    const [rootName, ...scaleTypeParts] = key.split(" ");
    const scaleTypeStr = scaleTypeParts.join("_") as ScaleType;

    // Find the root note number
    const noteNames: NoteName[] = [
      "C",
      "C#",
      "D",
      "D#",
      "E",
      "F",
      "F#",
      "G",
      "G#",
      "A",
      "A#",
      "B",
    ];
    const rootNote = noteNames.indexOf(rootName as NoteName);

    // Choose a relation - common options are:
    // - Relative major/minor (+3 half steps)
    // - Dominant (perfect fifth, +7 half steps)
    // - Subdominant (perfect fourth, +5 half steps)
    // - Parallel major/minor (same root, different scale)
    const relationTypes = [
      { interval: 0, name: "parallel" }, // Same root, different scale
      { interval: 3, name: "relative" }, // Relative major/minor
      { interval: 7, name: "dominant" }, // Perfect fifth
      { interval: 5, name: "subdominant" }, // Perfect fourth
    ];

    const relation = relationTypes[Math.floor(selector * relationTypes.length)];

    // New root note
    const newRootNote = (rootNote + relation.interval) % 12;
    const newRootName = noteNames[newRootNote];

    // New scale type
    let newScaleType: ScaleType;

    if (relation.name === "parallel") {
      // Flip between major and minor
      if (scaleTypeStr === "major") {
        newScaleType = "natural_minor";
      } else if (scaleTypeStr.includes("minor")) {
        newScaleType = "major";
      } else {
        // For modal scales, pick a related one
        const options: ScaleType[] = [
          "dorian",
          "phrygian",
          "lydian",
          "mixolydian",
        ];
        newScaleType = options[Math.floor(selector * options.length)];
      }
    } else if (relation.name === "relative") {
      // Relative key relationship
      if (scaleTypeStr === "major") {
        newScaleType = "natural_minor";
      } else if (scaleTypeStr === "natural_minor") {
        newScaleType = "major";
      } else {
        // Keep the same for other types
        newScaleType = scaleTypeStr;
      }
    } else {
      // Keep the same scale type for dominant and subdominant
      newScaleType = scaleTypeStr;
    }

    return `${newRootName} ${newScaleType.replace("_", " ")}`;
  }

  /**
   * Calculate a related tempo based on a starting tempo
   */
  private getRelatedTempo(baseTempo: number, selector: number): number {
    // Choose a transformation:
    // 1. Slight variation (±10%)
    // 2. Double/half time
    // 3. Moderate change (±30%)

    const transformType = Math.floor(selector * 3);

    let newTempo;

    switch (transformType) {
      case 0: // Slight variation
        newTempo = baseTempo * (0.9 + selector * 0.2); // 90-110% of original
        break;
      case 1: // Double/half time
        newTempo = selector > 0.5 ? baseTempo * 2 : baseTempo / 2;
        break;
      case 2: // Moderate change
        newTempo = baseTempo * (0.7 + selector * 0.6); // 70-130% of original
        break;
    }

    // Ensure reasonable tempo range
    return Math.max(40, Math.min(240, newTempo));
  }

  /**
   * Find the closest standard duration to a given value
   */
  private findClosestDuration(targetDuration: number): NoteDuration {
    const durations = Object.entries(DURATION_VALUES);
    let closestDuration: [string, number] = durations[0];
    let minDifference = Math.abs(targetDuration - durations[0][1]);

    for (const [duration, value] of durations) {
      const difference = Math.abs(targetDuration - value);
      if (difference < minDifference) {
        minDifference = difference;
        closestDuration = [duration, value];
      }
    }

    return closestDuration[0] as NoteDuration;
  }

  /**
   * Select a random element from an array
   */
  private selectFromArray<T>(array: T[]): T {
    return array[Math.floor(this.selector() * array.length)];
  }

  /**
   * Weighted random selection from an array
   */
  private weightedSelect<T>(array: T[], weights: number[]): number {
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    const randomValue = this.selector() * totalWeight;

    let weightSum = 0;
    for (let i = 0; i < weights.length; i++) {
      weightSum += weights[i];
      if (randomValue <= weightSum) {
        return i;
      }
    }

    return array.length - 1;
  }
}
