import { Ensemble } from "./Ensemble";
export type ExpressionQuality =
  | "confident"
  | "playful"
  | "calm"
  | "agitated"
  | "urgent"
  | "solemn"
  | "contemplative"
  | "delicate";

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
  private ensemble: Ensemble;
  private params: MovementParams;

  constructor({ params }: { params: MovementParams }) {
    this.params = params;
    this.ensemble = new Ensemble([]);
  }

  // Other methods would follow...
}
