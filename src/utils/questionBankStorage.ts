import { isHighQualityTask } from './questionValidator';
import { normalizeTaskData } from './taskNormalizer';
import { db, auth } from '../firebase';
import { collection, doc, setDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { getScholarUsername } from './apiKey';

const DB_NAME = 'TOEFL_STUDIO_DB';
const DB_VERSION = 2;

export async function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event: any) => {
      const dbInstance = event.target.result;
      if (!dbInstance.objectStoreNames.contains('toefl_question_bank')) {
        dbInstance.createObjectStore('toefl_question_bank', { keyPath: 'id' });
      }
      if (!dbInstance.objectStoreNames.contains('toefl_audio_cache')) {
        dbInstance.createObjectStore('toefl_audio_cache', { keyPath: 'cacheKey' });
      }
    };
  });
}

/**
 * Purge low-quality stub questions from IndexedDB and localStorage on startup
 */
export async function purgeLowQualityCache(): Promise<number> {
  let purgedCount = 0;
  try {
    const dbInstance = await openIndexedDB();
    const tx = dbInstance.transaction('toefl_question_bank', 'readwrite');
    const store = tx.objectStore('toefl_question_bank');
    const request = store.getAll();

    request.onsuccess = () => {
      const allItems = request.result || [];
      for (const item of allItems) {
        if (!isHighQualityTask(item.content, item.taskType)) {
          store.delete(item.id);
          purgedCount++;
        }
      }
    };
  } catch (err) {
    console.warn('Failed to purge IndexedDB low quality cache:', err);
  }

  // Also purge localStorage prefetched queue if any
  try {
    const rawQueue = localStorage.getItem('toefl_prefetched_queue_v1');
    if (rawQueue) {
      const queue = JSON.parse(rawQueue);
      let changed = false;
      for (const [k, items] of Object.entries(queue)) {
        if (Array.isArray(items)) {
          const validItems = items.filter((item: any) => isHighQualityTask(item, k));
          if (validItems.length !== items.length) {
            queue[k] = validItems;
            changed = true;
          }
        }
      }
      if (changed) {
        localStorage.setItem('toefl_prefetched_queue_v1', JSON.stringify(queue));
      }
    }
  } catch {}

  return purgedCount;
}

/**
 * Save valid high-quality question to IndexedDB and Firestore
 */
export async function saveVerifiedQuestion(params: {
  taskType: string;
  level: string;
  topic: string;
  content: any;
  audioUrl?: string | null;
  audioClips?: any[] | null;
  source?: 'ai' | 'curated';
  generatedBy?: string;
}): Promise<string | null> {
  const { taskType, level, topic, content, audioUrl = null, audioClips = null, source = 'ai', generatedBy = getScholarUsername() } = params;
  
  if (!isHighQualityTask(content, taskType)) {
    console.warn(`Rejected low-quality question for taskType ${taskType} during save.`);
    return null;
  }

  const questionId = content.id || `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const enrichedContent = {
    ...content,
    source,
    generatedBy: generatedBy || getScholarUsername(),
    createdAt: content.createdAt || Date.now(),
  };

  // Save to IndexedDB
  try {
    const dbInstance = await openIndexedDB();
    const tx = dbInstance.transaction('toefl_question_bank', 'readwrite');
    const store = tx.objectStore('toefl_question_bank');
    store.put({
      id: questionId,
      taskType,
      level,
      topic,
      content: enrichedContent,
      audioUrl,
      audioClips,
      source,
      generatedBy: enrichedContent.generatedBy,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.warn('Failed to save to local IndexedDB question bank:', err);
  }

  // Save to Firestore if authenticated
  try {
    if (auth?.currentUser) {
      const docRef = doc(db, 'questions', questionId);
      await setDoc(docRef, {
        taskType,
        level,
        topic,
        content: enrichedContent,
        audioUrl,
        audioClips,
        source,
        generatedBy: enrichedContent.generatedBy,
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser.uid,
        useCount: 0,
      }, { merge: true });
    }
  } catch (err) {
    console.warn('Failed to save verified question to Firestore:', err);
  }

  return questionId;
}

export const SHARD_FILES = [
  'academic-discussion',
  'build-sentence',
  'complete-words',
  'listening-dialogue',
  'listening-lecture',
  'listen-repeat',
  'reading-passage',
  'speaking-interview',
  'write-email',
];

// In-memory cache for fast synchronous access
const curatedMemoryCache: Record<string, any[]> = {};

/**
 * Load static curated shard for taskType from public/question-bank/<taskType>.json
 * with memory caching and cache-busting.
 */
export async function loadCuratedShard(taskType: string): Promise<any[]> {
  if (curatedMemoryCache[taskType] && curatedMemoryCache[taskType].length > 0) {
    return curatedMemoryCache[taskType];
  }

  try {
    const res = await fetch(`/question-bank/${taskType}.json?v=${Date.now()}`, { cache: 'no-cache' });
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json)) {
        const valid = json.filter((item) => isHighQualityTask(item, taskType));
        curatedMemoryCache[taskType] = valid;
        return valid;
      }
    }
  } catch (err) {
    console.warn(`Failed to fetch curated shard for ${taskType}:`, err);
  }
  return [];
}

/**
 * Synchronous getter for in-memory curated tasks with optional level/topic filtering
 */
export function getLoadedCuratedTasks(taskType: string, level?: string, topic?: string): any[] {
  const all = curatedMemoryCache[taskType] || [];
  if (all.length === 0) return [];

  let filtered = all;
  if (level && level !== 'all') {
    filtered = filtered.filter((t) => t.level === level);
  }
  if (topic && topic !== 'all') {
    filtered = filtered.filter((t) => t.topic === topic);
  }

  // If filter produces 0 items, fallback to all tasks so the user is never stuck
  return filtered.length > 0 ? filtered : all;
}

/**
 * Sync all curated question shards into IndexedDB and in-memory cache.
 * Always upserts by id so newly added curated questions appear immediately on startup.
 */
export async function syncCuratedQuestionBank(): Promise<{ totalQuestions: number; counts: Record<string, number> }> {
  const counts: Record<string, number> = {};
  let totalQuestions = 0;

  try {
    const dbInstance = await openIndexedDB();
    const tx = dbInstance.transaction('toefl_question_bank', 'readwrite');
    const store = tx.objectStore('toefl_question_bank');

    for (const shard of SHARD_FILES) {
      try {
        const res = await fetch(`/question-bank/${shard}.json?v=${Date.now()}`, { cache: 'no-cache' });
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json)) {
            const valid = json.filter((item) => isHighQualityTask(item, shard));
            curatedMemoryCache[shard] = valid;
            counts[shard] = valid.length;
            totalQuestions += valid.length;

            // Upsert each item into IndexedDB
            for (let idx = 0; idx < valid.length; idx++) {
              const item = valid[idx];
              const qId = item.id || `${shard}-curated-${idx + 1}`;
              store.put({
                id: qId,
                taskType: shard,
                level: item.level || 'intermediate',
                topic: item.topic || 'general',
                content: item,
                isCurated: true,
                updatedAt: Date.now(),
              });
            }
          }
        }
      } catch (shardErr) {
        console.warn(`Failed to sync shard ${shard}:`, shardErr);
      }
    }

    // Also fetch and merge validated questions from Firestore 'questions' collection if available
    try {
      if (db) {
        const qSnap = await getDocs(collection(db, 'questions'));
        if (!qSnap.empty) {
          qSnap.forEach((docSnap) => {
            const rawDoc = docSnap.data();
            const normalized = normalizeTaskData(rawDoc);
            const contentToCheck = normalized?.content || rawDoc;
            const targetTaskType = normalized?.taskType || rawDoc.taskType || rawDoc.type || 'academic-discussion';
            if (normalized && isHighQualityTask(contentToCheck, targetTaskType)) {
              const qId = docSnap.id;
              store.put({
                id: qId,
                taskType: targetTaskType,
                level: normalized.level || 'intermediate',
                topic: normalized.topic || 'general',
                content: contentToCheck,
                isCurated: false,
                updatedAt: Date.now(),
              });
              counts[targetTaskType] = (counts[targetTaskType] || 0) + 1;
              totalQuestions++;
            }
          });
        }
      }
    } catch (firestoreErr) {
      console.warn('Failed to sync questions from Firestore into local bank:', firestoreErr);
    }
  } catch (err) {
    console.warn('Failed to open IndexedDB during question bank sync:', err);
  }

  return { totalQuestions, counts };
}

/**
 * Get question bank counts across sections (combines curated shards + local IndexedDB)
 */
export async function getQuestionBankStats(): Promise<{
  totalQuestions: number;
  totalCurated: number;
  countsPerTaskType: Record<string, number>;
}> {
  const counts: Record<string, number> = {};
  SHARD_FILES.forEach((s) => {
    counts[s] = (curatedMemoryCache[s] || []).length;
  });

  let totalCurated = Object.values(counts).reduce((a, b) => a + b, 0);

  // If cache is cold, do a fast shard count
  if (totalCurated === 0) {
    const syncRes = await syncCuratedQuestionBank();
    return {
      totalQuestions: syncRes.totalQuestions,
      totalCurated: syncRes.totalQuestions,
      countsPerTaskType: syncRes.counts,
    };
  }

  // Also count any additional custom user-generated questions from IndexedDB
  try {
    const dbInstance = await openIndexedDB();
    const tx = dbInstance.transaction('toefl_question_bank', 'readonly');
    const store = tx.objectStore('toefl_question_bank');
    const req = store.getAll();
    await new Promise((resolve) => {
      req.onsuccess = () => {
        if (Array.isArray(req.result)) {
          for (const row of req.result) {
            if (row.taskType && !row.isCurated && counts[row.taskType] !== undefined) {
              counts[row.taskType]++;
            }
          }
        }
        resolve(null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {}

  const totalQuestions = Object.values(counts).reduce((a, b) => a + b, 0);
  return {
    totalQuestions,
    totalCurated,
    countsPerTaskType: counts,
  };
}

/**
 * Persistent Audio Cache in IndexedDB (toefl_audio_cache)
 */
export async function getCachedAudio(cacheKey: string): Promise<string | null> {
  try {
    const dbInstance = await openIndexedDB();
    return new Promise((resolve) => {
      const tx = dbInstance.transaction('toefl_audio_cache', 'readonly');
      const store = tx.objectStore('toefl_audio_cache');
      const req = store.get(cacheKey);
      req.onsuccess = () => {
        resolve(req.result?.audioUrl || null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function setCachedAudio(cacheKey: string, audioUrl: string): Promise<void> {
  try {
    const dbInstance = await openIndexedDB();
    const tx = dbInstance.transaction('toefl_audio_cache', 'readwrite');
    const store = tx.objectStore('toefl_audio_cache');
    store.put({ cacheKey, audioUrl, updatedAt: Date.now() });
  } catch (err) {
    console.warn('Failed to cache audio in IndexedDB:', err);
  }
}

/**
 * Export all questions as JSON (merging local IndexedDB stored questions with curated shards)
 */
export async function exportQuestionBankJson(): Promise<string> {
  const dbItems: any[] = [];
  try {
    const dbInstance = await openIndexedDB();
    const tx = dbInstance.transaction('toefl_question_bank', 'readonly');
    const store = tx.objectStore('toefl_question_bank');
    const req = store.getAll();
    await new Promise((resolve) => {
      req.onsuccess = () => {
        if (Array.isArray(req.result)) dbItems.push(...req.result);
        resolve(null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {}

  const curatedShards: Record<string, any[]> = {};
  const shardFiles = [
    'academic-discussion',
    'build-sentence',
    'complete-words',
    'listening-dialogue',
    'listening-lecture',
    'listen-repeat',
    'reading-passage',
    'speaking-interview',
    'write-email',
  ];

  for (const shard of shardFiles) {
    try {
      const res = await fetch(`/question-bank/${shard}.json`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          curatedShards[shard] = data;
        }
      }
    } catch {}
  }

  const exportPayload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    totalSavedInIndexedDb: dbItems.length,
    newlySeededQuestions: dbItems,
    curatedQuestionBank: curatedShards,
  };

  return JSON.stringify(exportPayload, null, 2);
}
