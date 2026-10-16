export interface GameSummary {
  name: string;
  won: boolean;
  score: number;
  avgClarity: number; // 0..1
  peakLoudness: number; // 0..100
  avgLoudness: number; // 0..100
  bestStreak: number;
}
