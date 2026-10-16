import { TaskTypeId, TASK_DEFINITIONS } from '../types/taskTypes';

export type PrefetchedItem = {
  id: string;
  level: string;
  topic: string;
  isPrefetched: true;
  modelUsed?: string;
  createdAt: number;
  [key: string]: any;
};

export type PrefetchQueue = Record<string, PrefetchedItem[]>;

const STORAGE_KEY = 'toefl_prefetched_queue_v3';
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

export const PREFETCH_GAP_MS = 12000;

export interface RateLimitPauseState {
  kind: 'per-minute' | 'per-day' | 'unknown';
  resumeAt: number;
  retryAfterSeconds: number;
}

export function evaluateRateLimitPause(
  errorOrResponse: any,
  now: number
): RateLimitPauseState {
  const errStr = JSON.stringify(errorOrResponse || '');
  const lower = errStr.toLowerCase();
  let kind: 'per-minute' | 'per-day' | 'unknown' = 'per-minute';
  let retryAfterSeconds = 60;

  if (lower.includes('perday') || lower.includes('daily') || lower.includes('day')) {
    kind = 'per-day';
    retryAfterSeconds = 3600;
  }

  const match = errStr.match(/(\d+)\s*s/);
  if (match) {
    retryAfterSeconds = Math.max(retryAfterSeconds, parseInt(match[1], 10));
  }

  const durationMs = kind === 'per-day' ? 3600 * 1000 : Math.max(60, retryAfterSeconds + 5) * 1000;
  return {
    kind,
    resumeAt: now + durationMs,
    retryAfterSeconds,
  };
}

export function loadPrefetchQueueFromStorage(): PrefetchQueue {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const now = Date.now();
    const cleanQueue: PrefetchQueue = {};
    for (const [key, items] of Object.entries(parsed)) {
      if (Array.isArray(items)) {
        const valid = items.filter(
          (item: any) => item && typeof item === 'object' && now - (item.createdAt || 0) < CACHE_TTL_MS
        );
        if (valid.length > 0) cleanQueue[key] = valid;
      }
    }
    return cleanQueue;
  } catch (err) {
    return {};
  }
}

export function savePrefetchQueueToStorage(queue: PrefetchQueue): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch (err) {}
}

export function getPrefetchProgress(
  queue: PrefetchQueue,
  level: string,
  topic: string
): { round: 1 | 'done'; filled: number; total: 8 } {
  let totalFilled = 0;
  for (const task of TASK_DEFINITIONS) {
    const items = queue[task.id] || [];
    const matching = items.filter((item) => item.level === level && item.topic === topic);
    totalFilled += Math.min(matching.length, 1);
  }
  if (totalFilled < 8) return { round: 1, filled: totalFilled, total: 8 };
  return { round: 'done', filled: 8, total: 8 };
}

export function getNextTaskToPrefetch(
  currentTaskType: TaskTypeId,
  queue: PrefetchQueue,
  level: string,
  topic: string,
  cooldowns: Record<string, number>,
  now: number
): TaskTypeId | null {
  const getCount = (taskId: TaskTypeId) => {
    const items = queue[taskId] || [];
    return items.filter((item) => item.level === level && item.topic === topic).length;
  };

  const isEligible = (taskId: TaskTypeId) => {
    return (cooldowns[taskId] || 0) <= now;
  };

  const tasks = TASK_DEFINITIONS;
  const orderedTasks = [
    tasks.find(t => t.id === currentTaskType)!,
    ...tasks.filter(t => t.id !== currentTaskType)
  ];

  for (const task of orderedTasks) {
    if (isEligible(task.id) && getCount(task.id) === 0) return task.id;
  }

  return null;
}

export function hasReadyTask(queue: PrefetchQueue, taskType: string, level?: string, topic?: string): boolean {
  const items = queue[taskType] || [];
  if (level && topic) {
    return items.some((item) => item.level === level && item.topic === topic);
  }
  return items.length > 0;
}

export function popPrefetchedTask(
  queue: PrefetchQueue,
  taskType: string,
  level: string,
  topic: string
): { item: PrefetchedItem | null; updatedQueue: PrefetchQueue } {
  const items = queue[taskType] || [];
  if (items.length === 0) return { item: null, updatedQueue: queue };

  const matching = items.filter((item) => item.level === level && item.topic === topic);
  const updatedQueue = { ...queue };

  if (matching.length === 0) {
    delete updatedQueue[taskType];
    savePrefetchQueueToStorage(updatedQueue);
    return { item: null, updatedQueue };
  }

  const [item, ...remaining] = matching;
  if (remaining.length > 0) {
    updatedQueue[taskType] = remaining;
  } else {
    delete updatedQueue[taskType];
  }
  savePrefetchQueueToStorage(updatedQueue);
  return { item, updatedQueue };
}
