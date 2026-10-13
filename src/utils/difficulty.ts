import { PracticeRecord } from './scoreTracker';

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

export function getRecommendedLevel(history: PracticeRecord[]): DifficultyLevel {
  if (history.length < 5) return 'intermediate';

  const recent = history.slice(0, 5);
  const avg = recent.reduce((acc, r) => acc + r.scaledScore30, 0) / recent.length;

  if (avg >= 24) return 'advanced';
  if (avg < 15) return 'beginner';
  return 'intermediate';
}
