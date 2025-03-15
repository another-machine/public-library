import { Movement, MovementParams, ExpressionQuality } from "./Movement";
import { Ensemble } from "./Ensemble";
import { MusicGenerator } from "./MusicGenerator";

/**
 * Main application for procedural music generation
 */
export class ProceduralMusicApp {
  /**
   * Generate a complete musical piece based on parameters
   */
  static generateMusic({
    seed = Math.random(),
    mood = "confident" as ExpressionQuality,
    complexity = 0.5,
    coherence = 0.7,
    sectionCount = 3,
    voiceCount = 4,
  }: {
    seed?: number;
    mood?: ExpressionQuality;
    complexity?: number;
    coherence?: number;
    sectionCount?: number;
    voiceCount?: number;
    outputFilename?: string;
  } = {}) {
    // Create a deterministic random number generator from the seed
    const seededRandom = this.createSeededRandom(seed);

    // Create movement parameters
    const movementParams: MovementParams = {
      tempo: 80 + seededRandom() * 60, // 80-140 BPM
      tempoVariation: 0.1 + seededRandom() * 0.3, // 10-40% variation
      tensionCurve: this.generateTensionCurve(sectionCount, seededRandom),
      density: 0.3 + seededRandom() * 0.5, // 30-80% density
      coherence,
      complexity,
      mood,
    };

    // Create the music generator
    const musicGenerator = new MusicGenerator(seededRandom, movementParams);

    // Generate the musical piece
    const musicalPiece = musicGenerator.generateMusicalPiece();

    // Generate voice parts
    const voiceParts = musicGenerator.generateVoiceParts(musicalPiece);

    const ensemble = Ensemble.generateEnsemble({
      selector: seededRandom,
      voiceCount,
    });

    return { musicalPiece, voiceParts, ensemble };
  }

  /**
   * Create a predictable random number generator from a seed
   */
  private static createSeededRandom(seed: number): () => number {
    // A simple seeded random number generator
    return function () {
      // Update the seed for the next call
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
  }

  /**
   * Generate a tension curve for the sections
   */
  private static generateTensionCurve(
    sectionCount: number,
    random: () => number
  ): number[] {
    const curve: number[] = [];

    // Choose a tension profile pattern
    const patternType = Math.floor(random() * 4);

    switch (patternType) {
      case 0: // Ascending tension (building)
        for (let i = 0; i < sectionCount; i++) {
          curve.push(0.2 + (i / (sectionCount - 1)) * 0.7);
        }
        break;

      case 1: // Descending tension (relaxing)
        for (let i = 0; i < sectionCount; i++) {
          curve.push(0.9 - (i / (sectionCount - 1)) * 0.7);
        }
        break;

      case 2: // Peak in the middle (arch form)
        for (let i = 0; i < sectionCount; i++) {
          const relativePeak = (i / (sectionCount - 1)) * 2;
          const tensionValue =
            relativePeak <= 1
              ? 0.3 + relativePeak * 0.6
              : 0.9 - (relativePeak - 1) * 0.6;
          curve.push(tensionValue);
        }
        break;

      case 3: // Cyclic (up and down)
        for (let i = 0; i < sectionCount; i++) {
          curve.push(0.4 + Math.sin((i / sectionCount) * Math.PI * 2) * 0.4);
        }
        break;
    }

    // Add small random variations
    return curve.map((value) => {
      const variation = (random() - 0.5) * 0.2;
      return Math.max(0.1, Math.min(0.9, value + variation));
    });
  }

  /**
   * Generate a piece with a specific structure
   */
  static generateStructuredPiece(
    structure: Array<{
      mood: ExpressionQuality;
      sectionLength: number; // In measures
      repeatCount?: number;
    }>,
    seed: number = Math.random()
  ) {
    // Create a deterministic random number generator from the seed
    const seededRandom = this.createSeededRandom(seed);

    // Expand the structure by handling repeats
    const expandedStructure = structure.flatMap((section) =>
      Array(section.repeatCount || 1).fill({
        mood: section.mood,
        sectionLength: section.sectionLength,
      })
    );

    // Generate a base mood for coherence
    const baseMood = expandedStructure[0].mood;

    // Create movement parameters with a composite tension curve
    const tensionCurve = expandedStructure.map((section) => {
      // Get base tension for this mood
      const moodCharacteristics = {
        confident: 0.6,
        playful: 0.5,
        calm: 0.3,
        agitated: 0.8,
        urgent: 0.7,
        solemn: 0.4,
        contemplative: 0.5,
        delicate: 0.4,
      };

      return moodCharacteristics[section.mood] || 0.5;
    });

    const movementParams: MovementParams = {
      tempo: 80 + seededRandom() * 60, // 80-140 BPM
      tempoVariation: 0.1 + seededRandom() * 0.2, // 10-30% variation
      tensionCurve,
      density: 0.3 + seededRandom() * 0.5, // 30-80% density
      coherence: 0.7,
      complexity: 0.5,
      mood: baseMood,
    };

    // Create the music generator
    const musicGenerator = new MusicGenerator(seededRandom, movementParams);

    // Generate the musical piece
    const musicalPiece = musicGenerator.generateMusicalPiece();

    // Override section moods
    expandedStructure.forEach((section, index) => {
      if (index < musicalPiece.sections.length) {
        // Adjust section parameters based on mood
        musicalPiece.sections[index].key = this.adjustKeyForMood(
          musicalPiece.sections[index].key,
          section.mood
        );
      }
    });

    // Generate voice parts
    const voiceParts = musicGenerator.generateVoiceParts(musicalPiece);

    // Generate MIDI file
    return voiceParts;
  }

  /**
   * Adjust a key to better match a mood
   */
  private static adjustKeyForMood(
    key: string,
    mood: ExpressionQuality
  ): string {
    const [root, scaleType] = key.split(" ");

    // Choose a scale type that fits the mood better
    let newScaleType: string;

    switch (mood) {
      case "confident":
      case "playful":
        newScaleType = "major";
        break;
      case "calm":
        newScaleType = scaleType === "minor" ? "minor" : "major";
        break;
      case "agitated":
      case "urgent":
        newScaleType = "harmonic minor";
        break;
      case "solemn":
      case "contemplative":
        newScaleType = "natural minor";
        break;
      case "delicate":
        newScaleType = "pentatonic minor";
        break;
      default:
        newScaleType = scaleType; // Keep existing
    }
    return newScaleType;
  }
}
