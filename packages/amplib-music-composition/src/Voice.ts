import { Instrument } from "./Instrument";
import { ExpressionQuality } from "./Movement";

// Articulation
export type ArticulationStyle =
  | "staccato"
  | "legato"
  | "portato"
  | "marcato"
  | "tenuto"
  | "glissando"
  | "tremolo"
  | "flutter"
  | "punctuated"
  | "fluid";

// Harmonic function
type HarmonicFunction =
  | "root"
  | "third"
  | "fifth"
  | "seventh"
  | "ninth"
  | "eleventh"
  | "thirteenth"
  | "bass"
  | "tension"
  | "color"
  | "leading"
  | "pedal"
  | "cluster";

// Dynamic level
type DynamicLevel =
  | "pianissimo"
  | "piano"
  | "mezzo-piano"
  | "mezzo-forte"
  | "forte"
  | "fortissimo"
  | "crescendo"
  | "diminuendo"
  | "sforzando"
  | "subito";

// Rhythmic placement
type RhythmicPlacement =
  | "on-beat"
  | "off-beat"
  | "anticipatory"
  | "delayed"
  | "syncopated"
  | "steady"
  | "irregular"
  | "polyrhythmic";

// Tonal tendencies
type TonalTendency =
  | "tonal"
  | "modal"
  | "atonal"
  | "chromatic"
  | "dissonant"
  | "consonant"
  | "stable"
  | "unstable"
  | "resolving"
  | "suspending";

// Voice archetypes for predefined voice types
type VoiceArchetype =
  | "melodic-lead" // Primary melodic voice
  | "harmonic-support" // Chord/harmony provider
  | "rhythmic-driver" // Rhythm section element
  | "textural-ambient" // Background texture
  | "bass-foundation"; // Low frequency foundation

export class Voice {
  instrument: Instrument;
  prominence: number; // unit range 0-1
  rhythmicActivity: number; // unit range 0-1
  articulationTendency: ArticulationStyle[];
  expressionTendency: ExpressionQuality[];
  harmonicFunction: HarmonicFunction[];
  dynamicRange: [DynamicLevel, DynamicLevel]; // From-to range
  rhythmicPlacement: RhythmicPlacement[];
  tonalTendency: TonalTendency[];
  independence: number; // unit range 0-1
}

type RandomFunction = () => number;

export class VoiceGenerator {
  random: RandomFunction;

  constructor({ random }: { random: RandomFunction }) {
    this.random = random;
  }

  /**
   * Creates a new voice with random but musically coherent parameters
   */
  createRandomVoice(instrument: Instrument): Voice {
    const voice = new Voice();
    voice.instrument = instrument;
    voice.prominence = this.random();
    voice.rhythmicActivity = this.random();
    voice.articulationTendency = this.getRandomSubset(
      this.getAllArticulationStyles(),
      1 + Math.floor(this.random() * 3)
    );
    voice.expressionTendency = this.getRandomSubset(
      this.getAllExpressionQualities(),
      1 + Math.floor(this.random() * 2)
    );
    voice.harmonicFunction = this.getRandomSubset(
      this.getAllHarmonicFunctions(),
      1 + Math.floor(this.random() * 3)
    );
    voice.dynamicRange = this.getRandomDynamicRange();
    voice.rhythmicPlacement = this.getRandomSubset(
      this.getAllRhythmicPlacements(),
      1 + Math.floor(this.random() * 2)
    );
    voice.tonalTendency = this.getRandomSubset(
      this.getAllTonalTendencies(),
      1 + Math.floor(this.random() * 2)
    );
    voice.independence = this.random();

    return voice;
  }

  /**
   * Creates a voice with parameters that are complementary to the given voice
   */
  createComplementaryVoice(
    instrument: Instrument,
    referenceVoice: Voice
  ): Voice {
    const voice = new Voice();
    voice.instrument = instrument;

    // Create contrast in prominence
    voice.prominence = this.complementValue(referenceVoice.prominence);

    // Similar rhythmic activity but slightly different
    voice.rhythmicActivity = this.offsetValue(
      referenceVoice.rhythmicActivity,
      0.3
    );

    // Choose different articulations
    voice.articulationTendency = this.getContrastingSubset(
      this.getAllArticulationStyles(),
      referenceVoice.articulationTendency,
      1 + Math.floor(this.random() * 2)
    );

    // Choose related but different expression
    voice.expressionTendency = this.getContrastingSubset(
      this.getAllExpressionQualities(),
      referenceVoice.expressionTendency,
      1 + Math.floor(this.random() * 2)
    );

    // Choose complementary harmonic functions
    voice.harmonicFunction = this.getComplementaryHarmonicFunctions(
      referenceVoice.harmonicFunction
    );

    // Choose contrasting dynamic range
    voice.dynamicRange = this.getContrastingDynamicRange(
      referenceVoice.dynamicRange
    );

    // Choose rhythmic placements that work with reference voice
    voice.rhythmicPlacement = this.getComplementaryRhythmicPlacements(
      referenceVoice.rhythmicPlacement
    );

    // Similar tonal tendencies for harmonic coherence
    voice.tonalTendency = this.getOverlappingSubset(
      this.getAllTonalTendencies(),
      referenceVoice.tonalTendency,
      1 + Math.floor(this.random() * 2),
      0.5 // 50% overlap
    );

    // Independence level based on role
    voice.independence =
      referenceVoice.independence > 0.5
        ? this.random() * 0.5 // More dependent if reference is independent
        : 0.5 + this.random() * 0.5; // More independent if reference is dependent

    return voice;
  }

  /**
   * Creates a voice with parameters that are for a specific archetype
   */
  createArchetypeVoice(
    instrument: Instrument,
    archetype: VoiceArchetype
  ): Voice {
    const voice = new Voice();
    voice.instrument = instrument;

    switch (archetype) {
      case "melodic-lead":
        voice.prominence = 0.8 + this.random() * 0.2;
        voice.rhythmicActivity = 0.6 + this.random() * 0.4;
        voice.articulationTendency = ["legato", "marcato", "fluid"];
        voice.expressionTendency = ["confident", "playful", "agitated"];
        voice.harmonicFunction = ["color", "tension", "leading"];
        voice.dynamicRange = ["mezzo-forte", "fortissimo"];
        voice.rhythmicPlacement = ["on-beat", "off-beat", "anticipatory"];
        voice.tonalTendency = ["tonal", "modal", "stable"];
        voice.independence = 0.8 + this.random() * 0.2;
        break;

      case "harmonic-support":
        voice.prominence = 0.3 + this.random() * 0.3;
        voice.rhythmicActivity = 0.2 + this.random() * 0.3;
        voice.articulationTendency = ["legato", "tenuto", "portato"];
        voice.expressionTendency = ["calm", "solemn", "contemplative"];
        voice.harmonicFunction = ["root", "third", "fifth", "seventh"];
        voice.dynamicRange = ["piano", "mezzo-forte"];
        voice.rhythmicPlacement = ["on-beat", "steady"];
        voice.tonalTendency = ["tonal", "consonant", "stable"];
        voice.independence = 0.2 + this.random() * 0.3;
        break;

      case "rhythmic-driver":
        voice.prominence = 0.4 + this.random() * 0.4;
        voice.rhythmicActivity = 0.7 + this.random() * 0.3;
        voice.articulationTendency = ["staccato", "marcato", "punctuated"];
        voice.expressionTendency = ["urgent", "confident", "playful"];
        voice.harmonicFunction = ["root", "bass", "pedal"];
        voice.dynamicRange = ["mezzo-piano", "forte"];
        voice.rhythmicPlacement = [
          "on-beat",
          "off-beat",
          "syncopated",
          "polyrhythmic",
        ];
        voice.tonalTendency = ["tonal", "stable"];
        voice.independence = 0.5 + this.random() * 0.3;
        break;

      case "textural-ambient":
        voice.prominence = 0.1 + this.random() * 0.3;
        voice.rhythmicActivity = 0.1 + this.random() * 0.2;
        voice.articulationTendency = ["legato", "fluid", "tremolo"];

        voice.expressionTendency = ["calm", "contemplative", "delicate"];
        voice.harmonicFunction = ["color", "pedal", "cluster"];
        voice.dynamicRange = ["pianissimo", "mezzo-piano"];
        voice.rhythmicPlacement = ["steady", "irregular"];
        voice.tonalTendency = ["modal", "atonal", "consonant", "resolving"];
        voice.independence = 0.3 + this.random() * 0.3;
        break;

      case "bass-foundation":
        voice.prominence = 0.6 + this.random() * 0.2;
        voice.rhythmicActivity = 0.3 + this.random() * 0.4;
        voice.articulationTendency = ["staccato", "legato", "tenuto"];
        voice.expressionTendency = ["confident", "solemn"];
        voice.harmonicFunction = ["root", "bass", "fifth"];
        voice.dynamicRange = ["mezzo-piano", "forte"];
        voice.rhythmicPlacement = ["on-beat", "steady", "syncopated"];
        voice.tonalTendency = ["tonal", "stable", "consonant"];
        voice.independence = 0.4 + this.random() * 0.3;
        break;
    }

    return voice;
  }

  /**
   * Creates a collection of voices that work well together
   */
  createEnsemble(instruments: Instrument[], size: number = 4): Voice[] {
    if (size <= 0 || instruments.length === 0) {
      return [];
    }

    const voices: Voice[] = [];
    const archetypes: VoiceArchetype[] = this.getEnsembleArchetypes(size);

    for (let i = 0; i < size; i++) {
      // Get an instrument, cycling through the available ones if needed
      const instrument = instruments[i % instruments.length];

      // Create a voice with the appropriate archetype
      const voice = this.createArchetypeVoice(instrument, archetypes[i]);

      // Add some variation to prevent stereotypical voices
      this.addVariation(voice, 0.2);

      voices.push(voice);
    }

    return voices;
  }

  // Helper methods

  private complementValue(value: number): number {
    return 1 - value;
  }

  private offsetValue(value: number, maxOffset: number): number {
    const offset = (this.random() * 2 - 1) * maxOffset;
    return Math.max(0, Math.min(1, value + offset));
  }

  private getRandomSubset<T>(array: T[], count: number): T[] {
    const shuffled = [...array].sort(() => 0.5 - this.random());
    return shuffled.slice(0, count);
  }

  private getContrastingSubset<T>(
    array: T[],
    exclude: T[],
    count: number
  ): T[] {
    const available = array.filter((item) => !exclude.includes(item));
    return this.getRandomSubset(available, Math.min(count, available.length));
  }

  private getOverlappingSubset<T>(
    array: T[],
    reference: T[],
    count: number,
    overlapRatio: number
  ): T[] {
    const overlapCount = Math.floor(reference.length * overlapRatio);
    const newItemsCount = count - overlapCount;

    // Get some overlapping items from the reference
    const overlapItems = this.getRandomSubset(
      reference,
      Math.min(overlapCount, reference.length)
    );

    // Get some new items not in the reference
    const newItems = this.getContrastingSubset(
      array,
      reference,
      Math.max(0, newItemsCount)
    );

    return [...overlapItems, ...newItems];
  }

  private getRandomDynamicRange(): [DynamicLevel, DynamicLevel] {
    const allDynamics = this.getAllDynamicLevels();
    const idx1 = Math.floor(this.random() * (allDynamics.length - 1));
    const idx2 =
      idx1 + 1 + Math.floor(this.random() * (allDynamics.length - idx1 - 1));
    return [allDynamics[idx1], allDynamics[idx2]];
  }

  private getContrastingDynamicRange(
    reference: [DynamicLevel, DynamicLevel]
  ): [DynamicLevel, DynamicLevel] {
    const allDynamics = this.getAllDynamicLevels();
    const refIdx1 = allDynamics.indexOf(reference[0]);
    const refIdx2 = allDynamics.indexOf(reference[1]);

    // Aim for dynamic ranges that either overlap slightly or are completely different
    let idx1, idx2;

    if (this.random() < 0.5) {
      // Overlapping but different range
      if (refIdx1 > 0) {
        idx1 = Math.floor(this.random() * refIdx1);
      } else {
        idx1 =
          refIdx2 +
          1 +
          Math.floor(this.random() * (allDynamics.length - refIdx2 - 1));
      }
      idx2 = Math.min(allDynamics.length - 1, Math.max(refIdx1, idx1 + 1));
    } else {
      // Different range
      if (refIdx2 < allDynamics.length - 1) {
        idx1 = refIdx2 + 1;
        idx2 = Math.min(
          allDynamics.length - 1,
          idx1 + 1 + Math.floor(this.random() * 2)
        );
      } else {
        idx2 = refIdx1 - 1;
        idx1 = Math.max(0, idx2 - 1 - Math.floor(this.random() * 2));
      }
    }

    return [allDynamics[idx1], allDynamics[idx2]];
  }

  private getComplementaryHarmonicFunctions(
    reference: HarmonicFunction[]
  ): HarmonicFunction[] {
    const result: HarmonicFunction[] = [];

    // Create harmonic relationships based on reference functions
    if (reference.includes("root")) {
      result.push(
        ...this.getRandomSubset<HarmonicFunction>(
          ["third", "fifth", "seventh", "color"],
          2
        )
      );
    } else {
      result.push("root");
    }

    if (reference.includes("bass")) {
      result.push(
        ...this.getRandomSubset<HarmonicFunction>(
          ["third", "fifth", "color"],
          1
        )
      );
    } else if (this.random() > 0.5) {
      result.push("bass");
    }

    if (
      reference.some((f) =>
        ["tension", "seventh", "ninth", "eleventh", "thirteenth"].includes(f)
      )
    ) {
      result.push(
        ...this.getRandomSubset<HarmonicFunction>(["root", "third", "color"], 1)
      );
    } else {
      result.push(
        ...this.getRandomSubset<HarmonicFunction>(
          ["tension", "seventh", "ninth"],
          1
        )
      );
    }

    // Remove duplicates
    return Array.from(new Set(result));
  }

  private getComplementaryRhythmicPlacements(
    reference: RhythmicPlacement[]
  ): RhythmicPlacement[] {
    const result: RhythmicPlacement[] = [];

    // Create complementary rhythmic relationships
    if (reference.includes("on-beat")) {
      result.push(
        ...this.getRandomSubset<RhythmicPlacement>(
          ["off-beat", "syncopated", "anticipatory"],
          2
        )
      );
    } else {
      result.push("on-beat");
    }

    if (reference.includes("steady")) {
      result.push(
        ...this.getRandomSubset<RhythmicPlacement>(
          ["irregular", "syncopated"],
          1
        )
      );
    } else {
      result.push("steady");
    }

    if (reference.includes("polyrhythmic")) {
      result.push(
        ...this.getRandomSubset<RhythmicPlacement>(["on-beat", "steady"], 1)
      );
    } else if (this.random() > 0.7) {
      // Less frequently add polyrhythmic
      result.push("polyrhythmic");
    }

    // Remove duplicates
    return Array.from(new Set(result));
  }

  private addVariation(voice: Voice, amount: number): void {
    // Add subtle variations to numerical properties
    voice.prominence = this.offsetValue(voice.prominence, amount);
    voice.rhythmicActivity = this.offsetValue(voice.rhythmicActivity, amount);
    voice.independence = this.offsetValue(voice.independence, amount);

    // Occasionally add or remove an item from arrays
    if (this.random() < amount && voice.articulationTendency.length > 1) {
      voice.articulationTendency.pop();
    } else if (this.random() < amount) {
      const newArticulation = this.getContrastingSubset(
        this.getAllArticulationStyles(),
        voice.articulationTendency,
        1
      )[0];
      if (newArticulation) voice.articulationTendency.push(newArticulation);
    }

    // Similar variation for other array properties
    // (Code would repeat similar patterns for other properties)
  }

  private getEnsembleArchetypes(size: number): VoiceArchetype[] {
    // Determine appropriate archetypes based on ensemble size
    switch (size) {
      case 1:
        return ["melodic-lead"];
      case 2:
        return ["melodic-lead", "bass-foundation"];
      case 3:
        return ["melodic-lead", "harmonic-support", "bass-foundation"];
      case 4:
        return [
          "melodic-lead",
          "harmonic-support",
          "rhythmic-driver",
          "bass-foundation",
        ];
      default:
        // For larger ensembles, add more supporting roles
        const base: VoiceArchetype[] = [
          "melodic-lead",
          "harmonic-support",
          "rhythmic-driver",
          "bass-foundation",
          "textural-ambient",
        ];
        const result: VoiceArchetype[] = [...base];

        // Add additional voices with varied archetypes
        for (let i = base.length; i < size; i++) {
          result.push(base[i % base.length]);
        }

        return result;
    }
  }

  // Type definition helpers - return all possible values for each type

  private getAllArticulationStyles(): ArticulationStyle[] {
    return [
      "staccato",
      "legato",
      "portato",
      "marcato",
      "tenuto",
      "glissando",
      "tremolo",
      "flutter",
      "punctuated",
      "fluid",
    ];
  }

  private getAllExpressionQualities(): ExpressionQuality[] {
    return [
      "agitated",
      "calm",
      "playful",
      "solemn",
      "urgent",
      "hesitant",
      "confident",
      "delicate",
      "aggressive",
      "contemplative",
    ];
  }

  private getAllHarmonicFunctions(): HarmonicFunction[] {
    return [
      "root",
      "third",
      "fifth",
      "seventh",
      "ninth",
      "eleventh",
      "thirteenth",
      "bass",
      "tension",
      "color",
      "leading",
      "pedal",
      "cluster",
    ];
  }

  private getAllDynamicLevels(): DynamicLevel[] {
    return [
      "pianissimo",
      "piano",
      "mezzo-piano",
      "mezzo-forte",
      "forte",
      "fortissimo",
    ];
  }

  private getAllRhythmicPlacements(): RhythmicPlacement[] {
    return [
      "on-beat",
      "off-beat",
      "anticipatory",
      "delayed",
      "syncopated",
      "steady",
      "irregular",
      "polyrhythmic",
    ];
  }

  private getAllTonalTendencies(): TonalTendency[] {
    return [
      "tonal",
      "modal",
      "atonal",
      "chromatic",
      "dissonant",
      "consonant",
      "stable",
      "unstable",
      "resolving",
      "suspending",
    ];
  }
}
