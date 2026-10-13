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
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Hydrates prefetch queue from sessionStorage
 */
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
        // Filter out expired items
        const valid = items.filter(
          (item: any) => item && typeof item === 'object' && now - (item.createdAt || 0) < CACHE_TTL_MS
        );
        if (valid.length > 0) {
          cleanQueue[key] = valid;
        }
      }
    }
    return cleanQueue;
  } catch (err) {
    console.debug('Failed to load prefetch queue from storage:', err);
    return {};
  }
}

/**
 * Persists prefetch queue to sessionStorage
 */
export function savePrefetchQueueToStorage(queue: PrefetchQueue): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.debug('Failed to save prefetch queue to storage:', err);
  }
}

/**
 * Determines the next task type to prefetch based on section rotation:
 * Rule: At first prefetch ONLY ONE question from each TOEFL section (Reading, Listening, Speaking, Writing),
 * and move to another section without prefetching more in the same section.
 * Only after all sections have at least one question ready can it cover remaining unpopulated tasks (strictly max 1 per task).
 */
export function getPrefetchProgress(
  queue: PrefetchQueue,
  level: string,
  topic: string
): { round: 1 | 2 | 'done'; filled: number; total: 16 } {
  let totalFilled = 0;
  for (const task of TASK_DEFINITIONS) {
    const items = queue[task.id] || [];
    const matching = items.filter((item) => item.level === level && item.topic === topic);
    totalFilled += Math.min(matching.length, 2);
  }
  
  if (totalFilled < 8) return { round: 1, filled: totalFilled, total: 16 };
  if (totalFilled < 16) return { round: 2, filled: totalFilled, total: 16 };
  return { round: 'done', filled: 16, total: 16 };
}

export function getNextTaskToPrefetch(
  currentTaskType: TaskTypeId,
  queue: PrefetchQueue,
  inFlight: Record<string, boolean>,
  failedRecently: Record<string, number>,
  currentLevel: string,
  currentTopic: string
): TaskTypeId | null {
  const now = Date.now();
  const getEligibleCount = (taskId: TaskTypeId) => {
    if (inFlight[taskId] || (failedRecently[taskId] && now - failedRecently[taskId] < 120000)) return -1;
    const items = queue[taskId] || [];
    return items.filter((item) => item.level === currentLevel && item.topic === currentTopic).length;
  };

  const sectionCounts: Record<string, number> = {};
  for (const task of TASK_DEFINITIONS) {
    const count = getEligibleCount(task.id);
    if (count === -1) continue;
    sectionCounts[task.section] = (sectionCounts[task.section] || 0) + count;
  }

  const sections = ['Reading', 'Listening', 'Speaking', 'Writing'] as const;
  const currentSection = TASK_DEFINITIONS.find(t => t.id === currentTaskType)?.section || 'Writing';
  const orderedSections = [currentSection, ...sections.filter(s => s !== currentSection)];

  let minCount = 2;
  for (const section of sections) {
    minCount = Math.min(minCount, sectionCounts[section] || 0);
  }

  if (minCount >= 2) return null;

  for (const section of orderedSections) {
    if ((sectionCounts[section] || 0) === minCount) {
      const tasks = TASK_DEFINITIONS.filter(t => t.section === section);
      for (const task of tasks) {
        if (getEligibleCount(task.id) === 0) return task.id;
      }
    }
  }

  return null;
}

/**
 * Gets total count of ready prefetched items across all tasks
 */
export function getTotalReadyCount(queue: PrefetchQueue): number {
  let count = 0;
  for (const items of Object.values(queue)) {
    if (Array.isArray(items)) {
      count += items.length;
    }
  }
  return count;
}

/**
 * Checks if a specific task has at least one prefetched item ready
 */
export function hasReadyTask(queue: PrefetchQueue, taskType: string): boolean {
  return (queue[taskType]?.length || 0) > 0;
}

/**
 * Pops the next prefetched item for a task and returns the remaining queue
 */
export function popPrefetchedTask(
  queue: PrefetchQueue,
  taskType: string
): { item: PrefetchedItem | null; updatedQueue: PrefetchQueue } {
  const items = queue[taskType] || [];
  if (items.length === 0) {
    return { item: null, updatedQueue: queue };
  }

  const [item, ...remaining] = items;
  const updatedQueue = { ...queue };
  if (remaining.length > 0) {
    updatedQueue[taskType] = remaining;
  } else {
    delete updatedQueue[taskType];
  }

  savePrefetchQueueToStorage(updatedQueue);
  return { item, updatedQueue };
}
