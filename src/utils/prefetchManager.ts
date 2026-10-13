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
export function getNextTaskToPrefetch(
  currentTaskType: TaskTypeId,
  queue: PrefetchQueue,
  inFlight: Record<string, boolean>,
  failedRecently: Record<string, number>,
  currentLevel: string,
  currentTopic: string
): TaskTypeId | null {
  const now = Date.now();
  const currentDef = TASK_DEFINITIONS.find((t) => t.id === currentTaskType);
  const currentSection = currentDef?.section || 'Writing';

  // Filter tasks that are currently fetching or failed within the last 2 minutes
  const isAvailable = (id: string) => {
    if (inFlight[id]) return false;
    const lastFail = failedRecently[id] || 0;
    if (now - lastFail < 120000) return false;
    return true;
  };

  const getTaskCount = (id: string) => (queue[id] || []).length;

  // The 4 official TOEFL sections ordered starting with user's current section
  const allSections: Array<'Reading' | 'Listening' | 'Speaking' | 'Writing'> = [
    currentSection,
    ...(['Reading', 'Listening', 'Speaking', 'Writing'] as const).filter((s) => s !== currentSection),
  ];

  // Helper to check if a section already has any question ready or in-flight
  const getSectionReadyOrInFlightCount = (section: string) => {
    const tasks = TASK_DEFINITIONS.filter((t) => t.section === section);
    return tasks.reduce((acc, t) => {
      const count = getTaskCount(t.id);
      const isFetching = inFlight[t.id] ? 1 : 0;
      return acc + count + isFetching;
    }, 0);
  };

  // Phase 1: Ensure each section has at least 1 question.
  for (const section of allSections) {
    const countInSection = getSectionReadyOrInFlightCount(section);
    if (countInSection < 1) {
      const tasksInSection = TASK_DEFINITIONS.filter((t) => t.section === section);
      // Prioritize current type
      if (section === currentSection && isAvailable(currentTaskType) && getTaskCount(currentTaskType) === 0) {
        return currentTaskType;
      }
      for (const t of tasksInSection) {
        if (isAvailable(t.id) && getTaskCount(t.id) === 0) {
          return t.id;
        }
      }
    }
  }

  // Phase 2: Once each section has 1, ensure each section has 2.
  for (const section of allSections) {
    const countInSection = getSectionReadyOrInFlightCount(section);
    if (countInSection < 2) {
      const tasksInSection = TASK_DEFINITIONS.filter((t) => t.section === section);
      for (const t of tasksInSection) {
        if (isAvailable(t.id) && getTaskCount(t.id) < 2) {
          return t.id;
        }
      }
    }
  }

  // Max 2 questions per section.
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
