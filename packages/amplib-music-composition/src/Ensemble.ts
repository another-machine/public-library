import { ExpressionQuality } from "./Movement";

// Envelope-based (mappable to ADSR)
export type InstrumentEnvelopeStyle =
  | "plucked" // fast attack, quick decay, minimal sustain
  | "sustained" // moderate attack, strong sustain, slow release
  | "percussive" // immediate attack, minimal sustain
  | "swelling" // slow attack, increasing intensity
  | "decaying"; // prominent decay phase, natural falloff

// Modulation characteristics (mappable to LFO/modulation)
export type InstrumentModulationCharacteristic =
  | "vibrato" // periodic pitch variation
  | "tremolo" // periodic amplitude variation
  | "pulsing" // rhythmic intensity changes
  | "breathing" // organic, irregular amplitude envelope
  | "steady"; // minimal variation over time

// Physical excitation (mappable to synthesis technique)
export type InstrumentPhysicalExcitation =
  | "blown" // air column excitation, turbulence
  | "bowed" // friction-based excitation, stick-slip
  | "struck" // impact excitation, initial transient
  | "scraped" // irregular friction excitation
  | "resonant" // strong modal behavior, emphasized formants
  | "filtered"; // frequency-selective presence

// Frequency range
export type InstrumentRange = "sub-bass" | "bass" | "mid" | "treble";

// Instrument roles
export type InstrumentRole = "melodic" | "harmonic" | "rhythmic" | "textural";

// Spectral profile
export type InstrumentSpectralProfile =
  | "warm" // emphasized lower-mids, rolled-off highs
  | "bright" // emphasized upper harmonics, presence
  | "dark" // de-emphasized highs, stronger fundamentals
  | "rich" // dense harmonic content, full spectrum
  | "pure" // minimal harmonics, sine-like
  | "noisy" // high noise-to-signal ratio, chaotic
  | "inharmonic"; // non-integer-related partials

// Texture-based (mappable to noise/grain components)
export type InstrumentTexturalStyle =
  | "smooth" // low noise floor, few upper harmonics
  | "rough" // controlled noise component, irregular harmonics
  | "grainy" // granular synthesis, amplitude fluctuations
  | "crystalline"; // pristine highs, sparse harmonic structure

// Articulation
export type ArticulationStyle =
  | "staccato" // short, detached
  | "legato" // connected, smooth
  | "accented" // emphasized notes
  | "gliding" // continuous pitch transitions
  | "trembling" // rapid variations
  | "flowing"; // natural, expressive phrasing

// Harmonic function
export type HarmonicFunction =
  | "root" // fundamental/tonic
  | "bass" // lowest voice
  | "chord" // harmonic support
  | "extension" // harmonic color
  | "tension" // dissonance
  | "pedal" // sustained note
  | "color"; // timbral or textural element

// Dynamic level
export type DynamicRange = {
  min: number; // 0 (silent) to 1 (maximum volume)
  max: number; // 0 to 1
};

// Rhythmic characteristics
export type RhythmicCharacteristic =
  | "driving" // on-beat, steady
  | "syncopated" // off-beat emphasis
  | "reactive" // responds to other voices
  | "polyrhythmic"; // independent rhythmic structure

// Voice archetypes
export type VoiceArchetype =
  | "lead" // primary melodic focus
  | "accompaniment" // supporting harmony
  | "bass" // foundational low end
  | "rhythm" // rhythmic foundation
  | "pad" // sustained textural element
  | "ornament"; // decorative musical element

// Instrument-related constants
export const envelopeStyles: InstrumentEnvelopeStyle[] = [
  "plucked",
  "sustained",
  "percussive",
  "swelling",
  "decaying",
];

export const modulationCharacteristics: InstrumentModulationCharacteristic[] = [
  "vibrato",
  "tremolo",
  "pulsing",
  "breathing",
  "steady",
];

export const physicalExcitations: InstrumentPhysicalExcitation[] = [
  "blown",
  "bowed",
  "struck",
  "scraped",
  "resonant",
  "filtered",
];

export const ranges: InstrumentRange[] = ["sub-bass", "bass", "mid", "treble"];

export const roles: InstrumentRole[] = [
  "melodic",
  "harmonic",
  "rhythmic",
  "textural",
];

export const spectralProfiles: InstrumentSpectralProfile[] = [
  "warm",
  "bright",
  "dark",
  "rich",
  "pure",
  "noisy",
  "inharmonic",
];

export const texturalStyles: InstrumentTexturalStyle[] = [
  "smooth",
  "rough",
  "grainy",
  "crystalline",
];

// Voice-related constants
export const expressionQualities: ExpressionQuality[] = [
  "confident",
  "playful",
  "calm",
  "agitated",
  "urgent",
  "solemn",
  "contemplative",
  "delicate",
];

export const articulationStyles: ArticulationStyle[] = [
  "staccato",
  "legato",
  "accented",
  "gliding",
  "trembling",
  "flowing",
];

export const harmonicFunctions: HarmonicFunction[] = [
  "root",
  "bass",
  "chord",
  "extension",
  "tension",
  "pedal",
  "color",
];

export const rhythmicCharacteristics: RhythmicCharacteristic[] = [
  "driving",
  "syncopated",
  "reactive",
  "polyrhythmic",
];

export const voiceArchetypes: VoiceArchetype[] = [
  "lead",
  "accompaniment",
  "bass",
  "rhythm",
  "pad",
  "ornament",
];

// ----- Instrument Class -----

export class Instrument {
  envelopeStyle: InstrumentEnvelopeStyle;
  modulationCharacteristic: InstrumentModulationCharacteristic;
  physicalExcitation: InstrumentPhysicalExcitation;
  range: InstrumentRange;
  role: InstrumentRole;
  spectralProfile: InstrumentSpectralProfile;
  texturalStyle: InstrumentTexturalStyle;

  constructor({
    envelopeStyle,
    modulationCharacteristic,
    physicalExcitation,
    range,
    role,
    spectralProfile,
    texturalStyle,
  }: {
    envelopeStyle: InstrumentEnvelopeStyle;
    modulationCharacteristic: InstrumentModulationCharacteristic;
    physicalExcitation: InstrumentPhysicalExcitation;
    range: InstrumentRange;
    role: InstrumentRole;
    spectralProfile: InstrumentSpectralProfile;
    texturalStyle: InstrumentTexturalStyle;
  }) {
    this.envelopeStyle = envelopeStyle;
    this.modulationCharacteristic = modulationCharacteristic;
    this.physicalExcitation = physicalExcitation;
    this.range = range;
    this.role = role;
    this.spectralProfile = spectralProfile;
    this.texturalStyle = texturalStyle;
  }

  /*
   * Generate an instrument via emotive selectors
   */
  static generateInstrument({ selector }: { selector(): number }): Instrument {
    return new Instrument({
      envelopeStyle:
        envelopeStyles[Math.floor(selector() * envelopeStyles.length)],
      modulationCharacteristic:
        modulationCharacteristics[
          Math.floor(selector() * modulationCharacteristics.length)
        ],
      physicalExcitation:
        physicalExcitations[
          Math.floor(selector() * physicalExcitations.length)
        ],
      range: ranges[Math.floor(selector() * ranges.length)],
      role: roles[Math.floor(selector() * roles.length)],
      spectralProfile:
        spectralProfiles[Math.floor(selector() * spectralProfiles.length)],
      texturalStyle:
        texturalStyles[Math.floor(selector() * texturalStyles.length)],
    });
  }

  /**
   * Generate an instrument that is complementary to a voice's requirements
   */
  static generateComplementaryInstrument({
    selector,
    voiceArchetype,
  }: {
    selector(): number;
    voiceArchetype: VoiceArchetype;
  }): Instrument {
    // Define preferred instrument characteristics for each voice archetype
    const archetypePreferences: Record<
      VoiceArchetype,
      {
        preferredRoles: InstrumentRole[];
        preferredRanges: InstrumentRange[];
        preferredEnvelopeStyles: InstrumentEnvelopeStyle[];
      }
    > = {
      lead: {
        preferredRoles: ["melodic"],
        preferredRanges: ["mid", "treble"],
        preferredEnvelopeStyles: ["sustained", "plucked"],
      },
      accompaniment: {
        preferredRoles: ["harmonic", "rhythmic"],
        preferredRanges: ["mid", "bass"],
        preferredEnvelopeStyles: ["sustained", "plucked"],
      },
      bass: {
        preferredRoles: ["harmonic", "rhythmic"],
        preferredRanges: ["bass", "sub-bass"],
        preferredEnvelopeStyles: ["sustained", "plucked"],
      },
      rhythm: {
        preferredRoles: ["rhythmic"],
        preferredRanges: ["mid", "bass"],
        preferredEnvelopeStyles: ["percussive", "plucked"],
      },
      pad: {
        preferredRoles: ["harmonic", "textural"],
        preferredRanges: ["mid", "treble"],
        preferredEnvelopeStyles: ["sustained", "swelling"],
      },
      ornament: {
        preferredRoles: ["melodic", "textural"],
        preferredRanges: ["mid", "treble"],
        preferredEnvelopeStyles: ["plucked", "percussive"],
      },
    };

    const preferences = archetypePreferences[voiceArchetype];

    // Select preferred characteristics with some randomness
    const role = weightedSelect(preferences.preferredRoles, selector);
    const range = weightedSelect(preferences.preferredRanges, selector);
    const envelopeStyle = weightedSelect(
      preferences.preferredEnvelopeStyles,
      selector
    );

    // Other characteristics are less constrained
    return new Instrument({
      role,
      range,
      envelopeStyle,
      modulationCharacteristic:
        modulationCharacteristics[
          Math.floor(selector() * modulationCharacteristics.length)
        ],
      physicalExcitation:
        physicalExcitations[
          Math.floor(selector() * physicalExcitations.length)
        ],
      spectralProfile:
        spectralProfiles[Math.floor(selector() * spectralProfiles.length)],
      texturalStyle:
        texturalStyles[Math.floor(selector() * texturalStyles.length)],
    });
  }
}

// ----- Voice Archetype Templates -----

// Define archetype templates for voice generation
interface ArchetypeTemplate {
  prominenceRange: { min: number; max: number };
  rhythmicActivityRange: { min: number; max: number };
  independenceRange: { min: number; max: number };
  preferredRhythmicCharacteristics: RhythmicCharacteristic[];
  preferredArticulations: ArticulationStyle[];
  preferredExpressionQualities: ExpressionQuality[];
  preferredHarmonicFunctions: HarmonicFunction[];
  dynamicRange: { min: number; max: number };
}

// Define template for each archetype
export const archetypeTemplates: Record<VoiceArchetype, ArchetypeTemplate> = {
  lead: {
    prominenceRange: { min: 0.7, max: 1.0 },
    rhythmicActivityRange: { min: 0.5, max: 0.9 },
    independenceRange: { min: 0.7, max: 1.0 },
    preferredRhythmicCharacteristics: ["driving", "syncopated", "reactive"],
    preferredArticulations: ["legato", "accented", "flowing"],
    preferredExpressionQualities: ["confident", "playful", "agitated"],
    preferredHarmonicFunctions: ["root", "tension", "color"],
    dynamicRange: { min: 0.5, max: 1.0 },
  },

  accompaniment: {
    prominenceRange: { min: 0.3, max: 0.6 },
    rhythmicActivityRange: { min: 0.3, max: 0.7 },
    independenceRange: { min: 0.2, max: 0.5 },
    preferredRhythmicCharacteristics: ["driving", "reactive"],
    preferredArticulations: ["legato", "staccato", "flowing"],
    preferredExpressionQualities: ["calm", "solemn", "contemplative"],
    preferredHarmonicFunctions: ["chord", "extension", "pedal"],
    dynamicRange: { min: 0.2, max: 0.7 },
  },

  bass: {
    prominenceRange: { min: 0.5, max: 0.8 },
    rhythmicActivityRange: { min: 0.3, max: 0.7 },
    independenceRange: { min: 0.6, max: 0.9 },
    preferredRhythmicCharacteristics: ["driving", "syncopated"],
    preferredArticulations: ["staccato", "legato", "accented"],
    preferredExpressionQualities: ["confident", "solemn"],
    preferredHarmonicFunctions: ["root", "bass"],
    dynamicRange: { min: 0.4, max: 0.9 },
  },

  rhythm: {
    prominenceRange: { min: 0.4, max: 0.7 },
    rhythmicActivityRange: { min: 0.7, max: 1.0 },
    independenceRange: { min: 0.5, max: 0.8 },
    preferredRhythmicCharacteristics: ["driving", "syncopated", "polyrhythmic"],
    preferredArticulations: ["staccato", "accented"],
    preferredExpressionQualities: ["confident", "urgent", "playful"],
    preferredHarmonicFunctions: ["root", "bass", "pedal"],
    dynamicRange: { min: 0.3, max: 0.8 },
  },

  pad: {
    prominenceRange: { min: 0.1, max: 0.5 },
    rhythmicActivityRange: { min: 0.1, max: 0.3 },
    independenceRange: { min: 0.1, max: 0.4 },
    preferredRhythmicCharacteristics: ["driving", "reactive"],
    preferredArticulations: ["legato", "flowing"],
    preferredExpressionQualities: ["calm", "contemplative", "delicate"],
    preferredHarmonicFunctions: ["chord", "pedal", "color"],
    dynamicRange: { min: 0.1, max: 0.6 },
  },

  ornament: {
    prominenceRange: { min: 0.2, max: 0.6 },
    rhythmicActivityRange: { min: 0.6, max: 1.0 },
    independenceRange: { min: 0.7, max: 1.0 },
    preferredRhythmicCharacteristics: [
      "reactive",
      "syncopated",
      "polyrhythmic",
    ],
    preferredArticulations: ["staccato", "gliding", "trembling", "flowing"],
    preferredExpressionQualities: ["playful", "delicate", "agitated"],
    preferredHarmonicFunctions: ["extension", "color", "tension"],
    dynamicRange: { min: 0.2, max: 0.7 },
  },
};

// ----- Helper Functions -----

// Helper function for weighted selection from an array
export function weightedSelect<T>(items: T[], selector: () => number): T {
  // Basic implementation - just select randomly
  // In a more advanced version, you could implement weighted probabilities
  return items[Math.floor(selector() * items.length)];
}

// Helper function to select a complementary archetype
export function selectComplementaryArchetype(
  referenceArchetype: VoiceArchetype,
  selector: () => number
): VoiceArchetype {
  // Define complementary relationships
  const complementaryMap: Record<VoiceArchetype, VoiceArchetype[]> = {
    lead: ["accompaniment", "bass", "rhythm"],
    accompaniment: ["lead", "rhythm", "ornament"],
    bass: ["lead", "rhythm", "pad"],
    rhythm: ["lead", "bass", "pad"],
    pad: ["lead", "rhythm", "ornament"],
    ornament: ["lead", "accompaniment", "pad"],
  };

  const options = complementaryMap[referenceArchetype];
  return options[Math.floor(selector() * options.length)];
}

// ----- Voice Class -----

export class Voice {
  instrument?: Instrument;
  archetype: VoiceArchetype;
  prominence: number;
  rhythmicActivity: number;
  rhythmicCharacteristic: RhythmicCharacteristic;
  primaryArticulation: ArticulationStyle;
  secondaryArticulation?: ArticulationStyle;
  expressionQuality: ExpressionQuality;
  primaryFunction: HarmonicFunction;
  secondaryFunction?: HarmonicFunction;
  dynamicRange: DynamicRange;
  independence: number;

  constructor({
    instrument,
    archetype,
    prominence,
    rhythmicActivity,
    rhythmicCharacteristic,
    primaryArticulation,
    secondaryArticulation,
    expressionQuality,
    primaryFunction,
    secondaryFunction,
    dynamicRange,
    independence,
  }: {
    instrument?: Instrument;
    archetype: VoiceArchetype;
    prominence: number;
    rhythmicActivity: number;
    rhythmicCharacteristic: RhythmicCharacteristic;
    primaryArticulation: ArticulationStyle;
    secondaryArticulation?: ArticulationStyle;
    expressionQuality: ExpressionQuality;
    primaryFunction: HarmonicFunction;
    secondaryFunction?: HarmonicFunction;
    dynamicRange: DynamicRange;
    independence: number;
  }) {
    this.instrument = instrument;
    this.archetype = archetype;
    this.prominence = prominence;
    this.rhythmicActivity = rhythmicActivity;
    this.rhythmicCharacteristic = rhythmicCharacteristic;
    this.primaryArticulation = primaryArticulation;
    this.secondaryArticulation = secondaryArticulation;
    this.expressionQuality = expressionQuality;
    this.primaryFunction = primaryFunction;
    this.secondaryFunction = secondaryFunction;
    this.dynamicRange = dynamicRange;
    this.independence = independence;
  }

  /**
   * Generate a voice using an archetype-based approach
   */
  static generateVoice({
    selector,
    archetype,
    instrument,
  }: {
    selector(): number;
    archetype?: VoiceArchetype;
    instrument?: Instrument;
  }): Voice {
    // If no archetype is provided, randomly select one
    const selectedArchetype =
      archetype ||
      voiceArchetypes[Math.floor(selector() * voiceArchetypes.length)];

    // Get the archetype template
    const template = archetypeTemplates[selectedArchetype];

    // Base properties with controlled randomization based on the archetype template
    const prominence =
      template.prominenceRange.min +
      selector() *
        (template.prominenceRange.max - template.prominenceRange.min);

    const rhythmicActivity =
      template.rhythmicActivityRange.min +
      selector() *
        (template.rhythmicActivityRange.max -
          template.rhythmicActivityRange.min);

    const independence =
      template.independenceRange.min +
      selector() *
        (template.independenceRange.max - template.independenceRange.min);

    // Select from template's preferred characteristics with weighted probabilities
    const rhythmicCharacteristic = weightedSelect(
      template.preferredRhythmicCharacteristics,
      selector
    );

    const primaryArticulation = weightedSelect(
      template.preferredArticulations,
      selector
    );

    // 50% chance of having a secondary articulation
    const secondaryArticulation =
      selector() > 0.5
        ? weightedSelect(
            template.preferredArticulations.filter(
              (a) => a !== primaryArticulation
            ),
            selector
          )
        : undefined;

    const expressionQuality = weightedSelect(
      template.preferredExpressionQualities,
      selector
    );

    const primaryFunction = weightedSelect(
      template.preferredHarmonicFunctions,
      selector
    );

    // 70% chance of having a secondary function
    const secondaryFunction =
      selector() > 0.3
        ? weightedSelect(
            template.preferredHarmonicFunctions.filter(
              (f) => f !== primaryFunction
            ),
            selector
          )
        : undefined;

    // Create a dynamic range within the template's preferred range
    const dynamicMin =
      template.dynamicRange.min +
      selector() *
        (template.dynamicRange.max - template.dynamicRange.min) *
        0.4;

    const dynamicMax =
      template.dynamicRange.min +
      (template.dynamicRange.max - template.dynamicRange.min) *
        (0.6 + selector() * 0.4);

    // If no instrument is provided but we have an archetype, generate a complementary one
    const finalInstrument =
      instrument ||
      (selectedArchetype
        ? Instrument.generateComplementaryInstrument({
            selector,
            voiceArchetype: selectedArchetype,
          })
        : undefined);

    return new Voice({
      instrument: finalInstrument,
      archetype: selectedArchetype,
      prominence,
      rhythmicActivity,
      rhythmicCharacteristic,
      primaryArticulation,
      secondaryArticulation,
      expressionQuality,
      primaryFunction,
      secondaryFunction,
      dynamicRange: {
        min: Math.min(dynamicMin, dynamicMax - 0.1),
        max: dynamicMax,
      },
      independence,
    });
  }

  /**
   * Generate a voice that is complementary to an existing voice
   */
  static generateComplementaryVoice({
    selector,
    referenceVoice,
    instrument,
    preferredArchetype,
  }: {
    selector(): number;
    referenceVoice: Voice;
    instrument?: Instrument;
    preferredArchetype?: VoiceArchetype;
  }): Voice {
    // Select a complementary archetype if none is provided
    const archetype =
      preferredArchetype ||
      selectComplementaryArchetype(referenceVoice.archetype, selector);

    // Create a new voice with the complementary archetype
    const voice = Voice.generateVoice({
      selector,
      archetype,
      instrument,
    });

    // Adjust properties to ensure complementary relationship

    // If reference voice is prominent, make this one less prominent and vice versa
    if (referenceVoice.prominence > 0.6) {
      voice.prominence = 0.2 + selector() * 0.4; // 0.2-0.6
    } else if (referenceVoice.prominence < 0.4) {
      voice.prominence = 0.6 + selector() * 0.4; // 0.6-1.0
    }

    // Create rhythmic contrast or support based on reference
    if (referenceVoice.rhythmicActivity > 0.7) {
      // If reference is very active, new voice can be either supporting (similar)
      // or contrasting (less active)
      if (selector() > 0.7) {
        // Supporting - similar activity but different characteristic
        voice.rhythmicActivity = 0.6 + selector() * 0.4;
        // Ensure different characteristic
        const options = rhythmicCharacteristics.filter(
          (c) => c !== referenceVoice.rhythmicCharacteristic
        );
        voice.rhythmicCharacteristic =
          options[Math.floor(selector() * options.length)];
      } else {
        // Contrasting - less active
        voice.rhythmicActivity = 0.2 + selector() * 0.4;
      }
    } else if (referenceVoice.rhythmicActivity < 0.3) {
      // If reference is calm/steady, new voice likely provides rhythmic interest
      voice.rhythmicActivity = 0.5 + selector() * 0.5;
    }

    // Adjust harmonic function to be complementary
    if (
      referenceVoice.primaryFunction === "root" ||
      referenceVoice.primaryFunction === "bass"
    ) {
      voice.primaryFunction = ["chord", "extension", "color"][
        Math.floor(selector() * 3)
      ] as HarmonicFunction;
    } else if (referenceVoice.primaryFunction === "chord") {
      voice.primaryFunction = selector() > 0.5 ? "extension" : "color";
    }

    // Ensure different articulation for contrast
    if (voice.primaryArticulation === referenceVoice.primaryArticulation) {
      const options = articulationStyles.filter(
        (a) => a !== referenceVoice.primaryArticulation
      );
      voice.primaryArticulation =
        options[Math.floor(selector() * options.length)];
    }

    return voice;
  }
}

// ----- Ensemble Class -----

export class Ensemble {
  voices: Voice[];

  constructor(voices: Voice[] = []) {
    this.voices = voices;
  }

  /**
   * Generate an ensemble with a specified number of voices
   */
  static generateEnsemble({
    selector,
    voiceCount = 3,
  }: {
    selector(): number;
    voiceCount?: number;
  }): Ensemble {
    const voices: Voice[] = [];

    // Generate the first (primary) voice
    const primaryVoice = Voice.generateVoice({ selector });
    voices.push(primaryVoice);

    // Generate complementary voices
    for (let i = 1; i < voiceCount; i++) {
      // Each new voice complements either the primary voice or the most recently added voice
      const referenceVoice =
        selector() > 0.3 ? primaryVoice : voices[voices.length - 1];

      const complementaryVoice = Voice.generateComplementaryVoice({
        selector,
        referenceVoice,
      });

      voices.push(complementaryVoice);
    }

    return new Ensemble(voices);
  }

  /**
   * Add a new complementary voice to the ensemble
   */
  addComplementaryVoice({
    selector,
    referenceVoiceIndex = 0, // Default to complementing the first voice
    instrument,
    preferredArchetype,
  }: {
    selector(): number;
    referenceVoiceIndex?: number;
    instrument?: Instrument;
    preferredArchetype?: VoiceArchetype;
  }): Voice {
    if (this.voices.length === 0) {
      // If there are no voices, create a new primary voice
      const newVoice = Voice.generateVoice({ selector, instrument });
      this.voices.push(newVoice);
      return newVoice;
    }

    // Ensure the reference index is valid
    const safeIndex = Math.min(referenceVoiceIndex, this.voices.length - 1);

    // Create a complementary voice
    const newVoice = Voice.generateComplementaryVoice({
      selector,
      referenceVoice: this.voices[safeIndex],
      instrument,
      preferredArchetype,
    });

    // Add to the ensemble
    this.voices.push(newVoice);

    return newVoice;
  }

  /**
   * Describe the ensemble's overall character
   */
  describeEnsemble(): string {
    // Count voice archetypes
    const archetypeCounts: Record<VoiceArchetype, number> = {
      lead: 0,
      accompaniment: 0,
      bass: 0,
      rhythm: 0,
      pad: 0,
      ornament: 0,
    };

    this.voices.forEach((voice) => {
      archetypeCounts[voice.archetype]++;
    });

    // Calculate average prominence
    const avgProminence =
      this.voices.reduce((sum, voice) => sum + voice.prominence, 0) /
      this.voices.length;

    // Calculate average rhythmic activity
    const avgRhythmicActivity =
      this.voices.reduce((sum, voice) => sum + voice.rhythmicActivity, 0) /
      this.voices.length;

    // Determine dominant expression qualities
    const expressionQualities = this.voices.map(
      (voice) => voice.expressionQuality
    );
    const uniqueQualities = [...new Set(expressionQualities)];

    // Format the description
    let description = `Ensemble with ${this.voices.length} voices:\n`;

    // List voice archetypes
    description += `- Voice composition: `;
    const archetypes = Object.entries(archetypeCounts)
      .filter(([_, count]) => count > 0)
      .map(([type, count]) => `${count} ${type}${count > 1 ? "s" : ""}`)
      .join(", ");
    description += archetypes + "\n";

    // Overall character
    description += `- Overall character: `;
    if (avgProminence > 0.7) description += "bold and prominent, ";
    else if (avgProminence < 0.4) description += "subtle and restrained, ";
    else description += "balanced prominence, ";

    if (avgRhythmicActivity > 0.7) description += "highly rhythmic";
    else if (avgRhythmicActivity < 0.3) description += "rhythmically sparse";
    else description += "moderately rhythmic";
    description += "\n";

    // Expression qualities
    description += `- Expressive qualities: ${uniqueQualities.join(", ")}`;

    return description;
  }
}
