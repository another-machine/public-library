import { Instrument } from "./Instrument";
import { Voice, VoiceArchetype } from "./Voice";

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
