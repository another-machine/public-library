import { weightedSelect } from "./utilities";
import { VoiceArchetype } from "./Voice";

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
