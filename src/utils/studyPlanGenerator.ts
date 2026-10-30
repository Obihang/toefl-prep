import { PracticeRecord, getCurrentUserId, convertScaledToBand6 } from './scoreTracker';
import { getMistakesList } from './mistakesTracker';

export type SectionName = 'Reading' | 'Listening' | 'Speaking' | 'Writing';

export interface StudyPlanTask {
  id: string;
  title: string;
  description: string;
  targetSection: SectionName | 'Vocabulary' | 'Mistakes';
  taskType: string;
  isCompleted: boolean;
  type: 'practice' | 'review';
}

export interface WeakestAreaInfo {
  section: SectionName;
  avgScaled: number;
  avgBand: number;
  tip: string;
  hasHistory: boolean;
  allAverages: Record<SectionName, number>;
}

export interface DailyStudyPlan {
  date: string;
  userId: string;
  weakestSection: WeakestAreaInfo;
  tasks: StudyPlanTask[];
  urgent: boolean;
  daysUntilTest: number | null;
}

export interface StudyGoals {
  targetScore?: number | string;
  testDate?: string;
  weeklyGoal?: number;
}

const SECTION_DEFAULT_TASKS: Record<SectionName, { taskType: string; name: string }> = {
  Reading: { taskType: 'reading-passage', name: 'Reading Passage' },
  Listening: { taskType: 'listening-dialogue', name: 'Listening Dialogue' },
  Speaking: { taskType: 'speaking-interview', name: 'Speaking Interview' },
  Writing: { taskType: 'academic-discussion', name: 'Academic Discussion' },
};

const SECTION_TIPS: Record<SectionName, (avg: number) => string> = {
  Speaking: (avg) =>
    `Speaking is currently your lowest section (Avg: ${avg.toFixed(1)}/30). Focus on clear topic development, minimizing hesitation pauses, and using natural transition words.`,
  Writing: (avg) =>
    `Writing is currently your lowest section (Avg: ${avg.toFixed(1)}/30). Focus on integrating precise academic vocabulary, varying syntactic structures, and addressing peer viewpoints.`,
  Listening: (avg) =>
    `Listening is currently your lowest section (Avg: ${avg.toFixed(1)}/30). Focus on tracking speaker stance, discourse transition markers, and identifying key lecture takeaways.`,
  Reading: (avg) =>
    `Reading is currently your lowest section (Avg: ${avg.toFixed(1)}/30). Practice active skimming, decoding vocabulary in context, and locating paragraph transition anchors.`,
};

/**
 * Calculates the average scaled score for each TOEFL section over the last 14 days
 * and identifies the section with the lowest average.
 */
export function determineWeakestArea(history: PracticeRecord[] = []): WeakestAreaInfo {
  const sections: SectionName[] = ['Reading', 'Listening', 'Speaking', 'Writing'];
  const now = Date.now();
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

  // Filter for records in the last 14 days
  const recentHistory = history.filter((r) => {
    const time = new Date(r.date || 0).getTime();
    return time >= now - fourteenDaysMs;
  });

  // Use recent history if available, otherwise fall back to all history
  const targetHistory = recentHistory.length > 0 ? recentHistory : history;

  const sums: Record<SectionName, number> = { Reading: 0, Listening: 0, Speaking: 0, Writing: 0 };
  const counts: Record<SectionName, number> = { Reading: 0, Listening: 0, Speaking: 0, Writing: 0 };

  targetHistory.forEach((r) => {
    const sec = r.section as SectionName;
    if (sums[sec] !== undefined) {
      const scaled = r.scaledScore30 || Math.round((r.score || 0) * 4) || 20;
      sums[sec] += scaled;
      counts[sec] += 1;
    }
  });

  const allAverages: Record<SectionName, number> = {
    Reading: counts.Reading > 0 ? Math.round((sums.Reading / counts.Reading) * 10) / 10 : 0,
    Listening: counts.Listening > 0 ? Math.round((sums.Listening / counts.Listening) * 10) / 10 : 0,
    Speaking: counts.Speaking > 0 ? Math.round((sums.Speaking / counts.Speaking) * 10) / 10 : 0,
    Writing: counts.Writing > 0 ? Math.round((sums.Writing / counts.Writing) * 10) / 10 : 0,
  };

  const hasHistory = targetHistory.length > 0;

  if (!hasHistory) {
    return {
      section: 'Reading',
      avgScaled: 20.0,
      avgBand: 4.0,
      tip: 'Start your TOEFL preparation by completing a Reading Passage diagnostic to establish your baseline score.',
      hasHistory: false,
      allAverages: { Reading: 20, Listening: 20, Speaking: 20, Writing: 20 },
    };
  }

  // Find lowest average; prioritize sections with 0 attempts as needing practice first
  let lowestSec: SectionName = 'Reading';
  let lowestVal = 999;

  for (const sec of sections) {
    const avg = allAverages[sec];
    if (avg < lowestVal) {
      lowestVal = avg;
      lowestSec = sec;
    }
  }

  const avgScaled = allAverages[lowestSec];
  const avgBand = convertScaledToBand6(Math.round(avgScaled));
  const tip = SECTION_TIPS[lowestSec](avgScaled);

  return {
    section: lowestSec,
    avgScaled,
    avgBand,
    tip,
    hasHistory: true,
    allAverages,
  };
}

const getPlanCacheKey = (userId: string) => `toefl_daily_plan_${userId}`;

/**
 * Retrieves the cached daily study plan for the given user, if valid for today.
 */
export function getCachedDailyPlan(userId: string = getCurrentUserId()): DailyStudyPlan | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getPlanCacheKey(userId));
    if (!raw) return null;
    const parsed: DailyStudyPlan = JSON.parse(raw);
    const today = new Date().toISOString().split('T')[0];
    if (parsed.date === today && Array.isArray(parsed.tasks) && parsed.tasks.length > 0) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Saves a daily study plan to localStorage.
 */
export function saveDailyPlan(plan: DailyStudyPlan): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(getPlanCacheKey(plan.userId), JSON.stringify(plan));
    window.dispatchEvent(new CustomEvent('toefl_daily_plan_updated', { detail: plan }));
  } catch (err) {
    console.warn('Failed to cache daily study plan:', err);
  }
}

/**
 * Toggles completion status of a task in the cached daily plan.
 */
export function toggleTaskCompletion(taskId: string, userId: string = getCurrentUserId()): DailyStudyPlan | null {
  const plan = getCachedDailyPlan(userId);
  if (!plan) return null;

  const updatedTasks = plan.tasks.map((t) =>
    t.id === taskId ? { ...t, isCompleted: !t.isCompleted } : t
  );

  const updatedPlan: DailyStudyPlan = {
    ...plan,
    tasks: updatedTasks,
  };

  saveDailyPlan(updatedPlan);
  return updatedPlan;
}

/**
 * Generates or retrieves the daily study plan based on user performance history,
 * saved mistakes, vocabulary list, and target test goals.
 */
export function generateDailyPlan(
  history: PracticeRecord[] = [],
  mistakes: any[] = [],
  vocab: any[] = [],
  studyGoals?: StudyGoals,
  userId: string = getCurrentUserId()
): DailyStudyPlan {
  // Check if we already generated a plan today
  const cached = getCachedDailyPlan(userId);
  if (cached) {
    return cached;
  }

  const today = new Date().toISOString().split('T')[0];

  // 1. Determine Weakest Area
  const weakestInfo = determineWeakestArea(history);
  const weakestSec = weakestInfo.section;

  // 2. Calculate Daily Workload based on testDate and targetScore
  const testDate = studyGoals?.testDate || (typeof localStorage !== 'undefined' ? localStorage.getItem('toefl_test_date') : null);
  let daysUntilTest: number | null = null;
  let isUrgent = false;

  if (testDate) {
    const diff = Math.ceil((new Date(testDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    daysUntilTest = isNaN(diff) ? null : diff;
    if (daysUntilTest !== null && daysUntilTest >= 0 && daysUntilTest < 14) {
      isUrgent = true;
    }
  }

  const tasks: StudyPlanTask[] = [];

  // 3. Task 1: Target Practice (Weak Area)
  const weakTaskMeta = SECTION_DEFAULT_TASKS[weakestSec];
  tasks.push({
    id: `plan-target-${weakestSec.toLowerCase()}`,
    title: `Target Practice: ${weakestSec}`,
    description: isUrgent
      ? `Sprint Mode (${daysUntilTest ?? 7} days to exam): Highest priority drill in your lowest section. Complete 1 ${weakTaskMeta.name}.`
      : `Your lowest scoring section (Avg: ${weakestInfo.avgScaled.toFixed(1)}). Complete 1 ${weakTaskMeta.name}.`,
    targetSection: weakestSec,
    taskType: weakTaskMeta.taskType,
    isCompleted: false,
    type: 'practice',
  });

  // 4. Task 2: Mixed Practice (balanced section)
  const otherSections: SectionName[] = (['Reading', 'Listening', 'Speaking', 'Writing'] as SectionName[]).filter(
    (s) => s !== weakestSec
  );
  // Deterministic seed per day so it doesn't randomly shuffle on re-renders within the day
  const dayHash = today.split('-').reduce((acc, part) => acc + parseInt(part, 10), 0);
  const mixedSec = otherSections[dayHash % otherSections.length];
  const mixedTaskMeta = SECTION_DEFAULT_TASKS[mixedSec];

  tasks.push({
    id: `plan-mixed-${mixedSec.toLowerCase()}`,
    title: `Mixed Practice: ${mixedSec}`,
    description: `Maintain cross-section agility with 1 ${mixedTaskMeta.name}.`,
    targetSection: mixedSec,
    taskType: mixedTaskMeta.taskType,
    isCompleted: false,
    type: 'practice',
  });

  // 5. Task 3: Mistake Review (if mistakes exist)
  // Check parameter first, then fall back to local mistakesTracker
  const effectiveMistakes = (mistakes && mistakes.length > 0) ? mistakes : getMistakesList();
  if (effectiveMistakes.length > 0) {
    tasks.push({
      id: 'plan-mistake-review',
      title: 'Review Mistakes',
      description: `Review ${Math.min(3, effectiveMistakes.length)} saved mistakes in your Notebook to eliminate recurring errors.`,
      targetSection: 'Mistakes',
      taskType: 'mistakes',
      isCompleted: false,
      type: 'review',
    });
  }

  // 6. Task 4: Vocab Review (if vocabulary exists)
  if (vocab && vocab.length > 0) {
    tasks.push({
      id: 'plan-vocab-review',
      title: 'Spaced Repetition',
      description: `Review ${Math.min(5, vocab.length)} vocabulary flashcards in your Word Bank.`,
      targetSection: 'Vocabulary',
      taskType: 'vocabulary',
      isCompleted: false,
      type: 'review',
    });
  }

  const dailyPlan: DailyStudyPlan = {
    date: today,
    userId,
    weakestSection: weakestInfo,
    tasks,
    urgent: isUrgent,
    daysUntilTest,
  };

  saveDailyPlan(dailyPlan);
  return dailyPlan;
}
