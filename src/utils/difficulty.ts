import { PracticeRecord } from './scoreTracker';

export type DifficultyLevel = 'beginner' | 'intermediate' | 'upper-intermediate' | 'advanced';

export const DIFFICULTY_ORDER: DifficultyLevel[] = [
  'beginner',
  'intermediate',
  'upper-intermediate',
  'advanced',
];

export function getRecommendedLevel(
  history: PracticeRecord[],
  currentLevel: DifficultyLevel = 'upper-intermediate',
  taskType?: string
): { level: DifficultyLevel; reason: string } {
  // Exclude mock test records from the adaptive difficulty calculation
  const nonMockRecords = history.filter(
    (h) =>
      !h.taskTitle?.toLowerCase().includes('mock') &&
      !h.taskType?.toLowerCase().includes('mock')
  );

  const records = taskType ? nonMockRecords.filter((h) => h.taskType === taskType) : nonMockRecords;

  const currentIndex = DIFFICULTY_ORDER.indexOf(currentLevel) >= 0
    ? DIFFICULTY_ORDER.indexOf(currentLevel)
    : DIFFICULTY_ORDER.indexOf('upper-intermediate');

  if (records.length < 3) {
    return {
      level: DIFFICULTY_ORDER[currentIndex],
      reason: 'Baseline level: Complete at least 3 practice tasks for adaptive progression',
    };
  }

  // Examine the 3 to 5 most recent practice results
  const sampleSize = Math.min(5, records.length);
  const recent = records.slice(0, sampleSize);
  const avgScore = recent.reduce((acc, r) => acc + r.scaledScore30, 0) / recent.length;

  // Move up one step if average >= 24 / 30 (>= 80%)
  if (avgScore >= 24 && currentIndex < DIFFICULTY_ORDER.length - 1) {
    const nextLevel = DIFFICULTY_ORDER[currentIndex + 1];
    return {
      level: nextLevel,
      reason: `Advanced 1 step to ${nextLevel} (recent avg ${Math.round(avgScore)}/30 ≥ 80%)`,
    };
  }

  // Move down one step if average < 16 / 30 (< 53%)
  if (avgScore < 16 && currentIndex > 0) {
    const prevLevel = DIFFICULTY_ORDER[currentIndex - 1];
    return {
      level: prevLevel,
      reason: `Adjusted 1 step to ${prevLevel} (recent avg ${Math.round(avgScore)}/30 < 53%)`,
    };
  }

  return {
    level: DIFFICULTY_ORDER[currentIndex],
    reason: `Steady performance at ${DIFFICULTY_ORDER[currentIndex]} (recent avg ${Math.round(avgScore)}/30)`,
  };
}
