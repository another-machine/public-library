// Abstract timbre descriptions with physical/digital implementation potential
export type InstrumentTimbre =
  // Texture-based (mappable to noise/grain components)
  | "smooth" // low noise floor, few upper harmonics
  | "rough" // controlled noise component, irregular harmonics
  | "grainy" // granular synthesis, amplitude fluctuations
  | "glassy" // strong upper harmonics, spectral purity
  | "fuzzy" // soft distortion, limited bandwidth
  | "crystalline" // pristine highs, sparse harmonic structure

  // Character-based (mappable to spectral balance)
  | "warm" // emphasized lower-mids, rolled-off highs
  | "bright" // emphasized upper harmonics, presence
  | "dark" // de-emphasized highs, stronger fundamentals
  | "hollow" // reduced mid frequencies, resonant
  | "rich" // dense harmonic content, full spectrum
  | "thin" // sparse harmonics, limited frequency range

  // Envelope-based (mappable to ADSR)
  | "plucked" // fast attack, quick decay, minimal sustain
  | "sustained" // moderate attack, strong sustain, slow release
  | "percussive" // immediate attack, minimal sustain
  | "swelling" // slow attack, increasing intensity
  | "decaying" // prominent decay phase, natural falloff

  // Spectral qualities (mappable to harmonic structure)
  | "harmonic" // integer-related overtone series
  | "inharmonic" // non-integer-related partials
  | "noisy" // high noise-to-signal ratio, chaotic
  | "pure" // minimal harmonics, sine-like
  | "metallic" // emphasized upper harmonics, long decay
  | "wooden" // emphasized odd harmonics, natural damping

  // Modulation characteristics (mappable to LFO/modulation)
  | "vibrato" // periodic pitch variation
  | "tremolo" // periodic amplitude variation
  | "pulsing" // rhythmic intensity changes
  | "breathing" // organic, irregular amplitude envelope
  | "steady" // minimal variation over time

  // Physical excitation (mappable to synthesis technique)
  | "blown" // air column excitation, turbulence
  | "bowed" // friction-based excitation, stick-slip
  | "struck" // impact excitation, initial transient
  | "scraped" // irregular friction excitation
  | "resonant" // strong modal behavior, emphasized formants
  | "filtered"; // frequency-selective presence;

// Expanded instrument range
export type InstrumentRange =
  | "sub-bass"
  | "bass"
  | "low-mid"
  | "mid"
  | "high-mid"
  | "treble"
  | "super-treble";

// Instrument roles
export type InstrumentRole =
  | "harmonic"
  | "melodic"
  | "rhythmic"
  | "textural"
  | "drone"
  | "ornamental"
  | "accentual"
  | "transitional"
  | "atmospheric";

export class Instrument {
  timbre: InstrumentTimbre[];
  range: InstrumentRange;
  role: InstrumentRole;

  constructor({
    timbre,
    range,
    role,
  }: {
    timbre: InstrumentTimbre[];
    range: InstrumentRange;
    role: InstrumentRole;
  }) {
    this.timbre = timbre;
    this.range = range;
    this.role = role;
  }
}
