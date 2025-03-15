import { Voice } from "./Voice";
export type ExpressionQuality =
  | "agitated"
  | "calm"
  | "playful"
  | "solemn"
  | "urgent"
  | "hesitant"
  | "confident"
  | "delicate"
  | "aggressive"
  | "contemplative";

// Movement interface with your core class
export interface MovementParams {
  tempo: number; // Base tempo in BPM
  tempoVariation: number; // How much tempo can fluctuate
  tensionCurve: number[]; // Array describing tension over time
  density: number; // Overall textural density
  coherence: number; // How related voices should be unit range 0-1
  complexity: number; // Overall musical complexity
  mood: ExpressionQuality; // Dominant expressive quality
}

export class Movement {
  private voices: Voice[] = [];
  private params: MovementParams;

  constructor(params: MovementParams) {
    this.params = params;
  }

  addVoice(voice: Voice): void {
    this.voices.push(voice);
  }

  // Other methods would follow...
}
