import { PracticeRecord } from './scoreTracker';

export type DifficultyLevel = 'beginner' | 'intermediate' | 'upper-intermediate' | 'advanced';

export function getRecommendedLevel(history: PracticeRecord[], taskType?: string): { level: DifficultyLevel; reason?: string } {
  const records = taskType ? history.filter(h => h.taskType === taskType) : history;
  if (records.length < 3) return { level: 'upper-intermediate', reason: 'Default baseline level' };

  const recent = records.slice(0, 5);
  const avgRatio = recent.reduce((acc, r) => acc + (r.scaledScore30 / 30), 0) / recent.length;

  if (avgRatio >= 0.8) {
    return { level: 'advanced', reason: 'Moved up: Last 5 results averaged above 80%' };
  }
  if (avgRatio < 0.5) {
    return { level: 'beginner', reason: 'Moved down: Last 5 results averaged below 50%' };
  }
  return { level: 'upper-intermediate', reason: 'Stable performance (50% - 80% average)' };
}
