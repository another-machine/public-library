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

    const primaryVoice = Voice.generateVoice({ selector });
    voices.push(primaryVoice);

    for (let i = 1; i < voiceCount; i++) {
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
    referenceVoiceIndex = 0,
    instrument,
    preferredArchetype,
  }: {
    selector(): number;
    referenceVoiceIndex?: number;
    instrument?: Instrument;
    preferredArchetype?: VoiceArchetype;
  }): Voice {
    if (this.voices.length === 0) {
      const newVoice = Voice.generateVoice({ selector, instrument });
      this.voices.push(newVoice);
      return newVoice;
    }

    const safeIndex = Math.min(referenceVoiceIndex, this.voices.length - 1);

    const newVoice = Voice.generateComplementaryVoice({
      selector,
      referenceVoice: this.voices[safeIndex],
      instrument,
      preferredArchetype,
    });

    this.voices.push(newVoice);

    return newVoice;
  }

  /**
   * Describe the ensemble's overall character
   */
  describeEnsemble(): string {
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

    const avgProminence =
      this.voices.reduce((sum, voice) => sum + voice.prominence, 0) /
      this.voices.length;

    const avgRhythmicActivity =
      this.voices.reduce((sum, voice) => sum + voice.rhythmicActivity, 0) /
      this.voices.length;

    const expressionQualities = this.voices.map(
      (voice) => voice.expressionQuality
    );
    const uniqueQualities = [...new Set(expressionQualities)];

    let description = `Ensemble with ${this.voices.length} voices:\n`;

    description += `- Voice composition: `;
    const archetypes = Object.entries(archetypeCounts)
      .filter(([_, count]) => count > 0)
      .map(([type, count]) => `${count} ${type}${count > 1 ? "s" : ""}`)
      .join(", ");
    description += archetypes + "\n";

    description += `- Overall character: `;
    if (avgProminence > 0.7) description += "bold and prominent, ";
    else if (avgProminence < 0.4) description += "subtle and restrained, ";
    else description += "balanced prominence, ";

    if (avgRhythmicActivity > 0.7) description += "highly rhythmic";
    else if (avgRhythmicActivity < 0.3) description += "rhythmically sparse";
    else description += "moderately rhythmic";
    description += "\n";

    description += `- Expressive qualities: ${uniqueQualities.join(", ")}`;

    return description;
  }
}
