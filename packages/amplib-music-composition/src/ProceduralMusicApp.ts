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
    return musicGenerator.generate();
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
}
