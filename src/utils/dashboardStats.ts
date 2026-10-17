import { PracticeRecord } from './scoreTracker';

export type TimeRange = '7d' | '30d' | 'all';
export type SectionType = 'total' | 'Reading' | 'Listening' | 'Speaking' | 'Writing';

export interface TrendPoint {
  date: string;
  value: number;
}

export function scoreTrend(history: PracticeRecord[], section: SectionType = 'total', range: TimeRange = '7d'): TrendPoint[] {
  if (!history || history.length === 0) return [];

  const now = Date.now();
  const dayMs = 86400000;
  let cutoff = 0;
  if (range === '7d') cutoff = now - 7 * dayMs;
  else if (range === '30d') cutoff = now - 30 * dayMs;

  const filtered = history.filter((r) => {
    const t = new Date(r.date || Date.now()).getTime();
    return range === 'all' || t >= cutoff;
  }).sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());

  // Group by date YYYY-MM-DD
  const map: Record<string, { sum: number; count: number }> = {};
  filtered.forEach((r) => {
    const dStr = (r.date || new Date().toISOString()).split('T')[0];
    let val = 0;
    if (section === 'total') {
      const sum30 = (r.scaledScore30 || Math.round((r.score || 0) * 4) || 20) * 4; // Total / 120 approx
      val = sum30;
    } else {
      val = r.scaledScore30 || Math.round(r.score || 15);
    }
    if (!map[dStr]) map[dStr] = { sum: 0, count: 0 };
    map[dStr].sum += val;
    map[dStr].count += 1;
  });

  return Object.entries(map).map(([date, data]) => ({
    date,
    value: Math.round(data.sum / data.count),
  }));
}

export function projectedTrend(history: PracticeRecord[]): TrendPoint[] {
  return scoreTrend(history, 'total', 'all');
}

export function sectionAverages(history: PracticeRecord[]): Record<string, { average: number; target: number }> {
  const sections = ['Reading', 'Listening', 'Speaking', 'Writing'];
  const sums: Record<string, number> = { Reading: 0, Listening: 0, Speaking: 0, Writing: 0 };
  const counts: Record<string, number> = { Reading: 0, Listening: 0, Speaking: 0, Writing: 0 };

  (history || []).forEach((r) => {
    const s = r.section || 'Reading';
    if (sums[s] !== undefined) {
      sums[s] += r.scaledScore30 || Math.round((r.score || 0) * 4) || 20;
      counts[s] += 1;
    }
  });

  const result: Record<string, { average: number; target: number }> = {};
  sections.forEach((sec) => {
    const count = counts[sec];
    const avg = count > 0 ? Math.round(sums[sec] / count) : 20;
    result[sec] = { average: avg, target: 25 };
  });

  return result;
}

export function weeklyActivity(history: PracticeRecord[], days = 7): TrendPoint[] {
  const now = Date.now();
  const dayMs = 86400000;
  const result: TrendPoint[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * dayMs);
    const dStr = d.toISOString().split('T')[0];
    const count = (history || []).filter((r) => {
      const rDate = (r.date || new Date().toISOString()).split('T')[0];
      return rDate === dStr;
    }).length;
    result.push({ date: dStr, value: count });
  }

  return result;
}

export function streak(completedDays: string[]): { current: number; best: number } {
  if (!completedDays || completedDays.length === 0) return { current: 0, best: 0 };

  const sorted = Array.from(new Set(completedDays)).sort();
  let current = 0;
  let best = 0;
  let streakCount = 0;
  let prevDate: Date | null = null;

  sorted.forEach((dStr) => {
    const d = new Date(dStr);
    if (!prevDate) {
      streakCount = 1;
    } else {
      const diffDays = Math.round((d.getTime() - prevDate.getTime()) / 86400000);
      if (diffDays === 1) {
        streakCount += 1;
      } else if (diffDays > 1) {
        streakCount = 1;
      }
    }
    prevDate = d;
    if (streakCount > best) best = streakCount;
  });

  const todayStr = new Date().toISOString().split('T')[0];
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (sorted.includes(todayStr) || sorted.includes(yesterdayStr)) {
    current = streakCount;
  } else {
    current = sorted.length > 0 ? 1 : 0;
  }

  return { current, best };
}

export function recentAttempts(history: PracticeRecord[], n = 10): PracticeRecord[] {
  if (!history) return [];
  return [...history].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()).slice(0, n);
}

export interface TodayPlanItem {
  id: string;
  title: string;
  description: string;
  type: 'weak_area' | 'vocabulary' | 'mistake';
  actionTarget?: string;
}

export function todaysPlan(history: PracticeRecord[], vocabDueCount: number, mistakeCount: number): TodayPlanItem[] {
  const plan: TodayPlanItem[] = [];

  if (vocabDueCount > 0) {
    plan.push({
      id: 'vocab',
      title: `Review ${vocabDueCount} Vocabulary Words`,
      description: 'Strengthen active recall with scheduled spaced repetition.',
      type: 'vocabulary',
      actionTarget: 'vocabulary',
    });
  }

  if (mistakeCount > 0) {
    plan.push({
      id: 'mistake',
      title: `Review ${mistakeCount} Mistake Items`,
      description: 'Analyze recent errors to avoid repeating them on test day.',
      type: 'mistake',
      actionTarget: 'mistakes',
    });
  }

  const avgs = sectionAverages(history);
  let weakestSec = 'Reading';
  let minAvg = 30;
  Object.entries(avgs).forEach(([sec, data]) => {
    if (data.average < minAvg) {
      minAvg = data.average;
      weakestSec = sec;
    }
  });

  plan.push({
    id: 'practice',
    title: `Target Practice: ${weakestSec}`,
    description: `Focus on improving your ${weakestSec.toLowerCase()} band score today.`,
    type: 'weak_area',
    actionTarget: weakestSec.toLowerCase(),
  });

  return plan.slice(0, 3);
}
