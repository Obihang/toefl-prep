import { isHighQualityTask } from './questionValidator';
import { normalizeTaskData } from './taskNormalizer';
import { db, auth } from '../firebase';
import { collection, doc, setDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { getScholarUsername } from './apiKey';
import { isValidLevel, isValidAcademicTopic, Level, AcademicTopic } from '../constants/filters';
import { inferTopic } from './inferTopic';

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
    const allItems: any[] = await new Promise((resolve, reject) => {
      const tx = dbInstance.transaction('toefl_question_bank', 'readonly');
      const store = tx.objectStore('toefl_question_bank');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    const idsToDelete = allItems
      .filter((item) => item?.content && !isHighQualityTask(item.content, item.taskType))
      .map((item) => item.id);

    if (idsToDelete.length > 0) {
      await new Promise<void>((resolve, reject) => {
        const tx = dbInstance.transaction('toefl_question_bank', 'readwrite');
        const store = tx.objectStore('toefl_question_bank');
        for (const id of idsToDelete) {
          store.delete(id);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      purgedCount = idsToDelete.length;
    }
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
  const { taskType, content, audioUrl = null, audioClips = null, source = 'ai', generatedBy = getScholarUsername() } = params;
  
  if (!isHighQualityTask(content, taskType)) {
    console.warn(`Rejected low-quality question for taskType ${taskType} during save.`);
    return null;
  }

  // Sanitize level and topic
  let validLevel: Level = 'intermediate';
  if (isValidLevel(params.level)) {
    validLevel = params.level;
  } else if (isValidLevel(content?.level)) {
    validLevel = content.level;
  }

  let validTopic: AcademicTopic;
  if (isValidAcademicTopic(params.topic) && params.topic !== ('all' as any) && params.topic !== ('general' as any)) {
    validTopic = params.topic;
  } else {
    validTopic = inferTopic(content);
  }

  const questionId = content.id || `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const enrichedContent = {
    ...content,
    level: validLevel,
    topic: validTopic,
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
      level: validLevel,
      topic: validTopic,
      content: enrichedContent,
      audioUrl,
      audioClips,
      source,
      generatedBy: enrichedContent.generatedBy,
      updatedAt: Date.now(),
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
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
        level: validLevel,
        topic: validTopic,
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
 * and merge with any cached IndexedDB questions for that taskType.
 */
export async function loadCuratedShard(taskType: string): Promise<any[]> {
  if (!curatedMemoryCache[taskType] || curatedMemoryCache[taskType].length === 0) {
    try {
      const res = await fetch(`/question-bank/${taskType}.json?v=${Date.now()}`, { cache: 'no-cache' });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json)) {
          const valid = json.filter((item) => isHighQualityTask(item, taskType));
          curatedMemoryCache[taskType] = [...valid];
        }
      }
    } catch (err) {
      console.warn(`Failed to fetch curated shard for ${taskType}:`, err);
    }
  }

  // Also merge any questions from local IndexedDB for this taskType
  try {
    const dbInstance = await openIndexedDB();
    const tx = dbInstance.transaction('toefl_question_bank', 'readonly');
    const store = tx.objectStore('toefl_question_bank');
    const all = await new Promise<any[]>((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => resolve([]);
    });

    if (!curatedMemoryCache[taskType]) {
      curatedMemoryCache[taskType] = [];
    }

    const currentList = curatedMemoryCache[taskType];
    for (const row of all) {
      if (row.taskType === taskType && row.content) {
        const qId = row.content.id || row.id;
        const exists = currentList.some((item) => (item.id || item._id) === qId);
        if (!exists) {
          currentList.push(row.content);
        }
      }
    }
  } catch (idbErr) {
    console.warn(`Failed to load cached IDB questions for ${taskType}:`, idbErr);
  }

  return curatedMemoryCache[taskType] || [];
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

export interface QuestionBankSyncResult {
  totalQuestions: number;
  totalCurated: number;
  counts: Record<string, number>;
  countsPerTaskType: Record<string, number>;
}

/**
 * Sync all curated question shards into IndexedDB and in-memory cache.
 * Pulls all static JSON shards AND all global questions from Firestore (without userId filtering).
 * Merges everything into the local IndexedDB ('toefl_question_bank') and memory cache.
 */
export async function syncCuratedQuestionBank(): Promise<QuestionBankSyncResult> {
  const counts: Record<string, number> = {};
  for (const s of SHARD_FILES) {
    counts[s] = 0;
  }
  let totalQuestions = 0;
  const questionsToStore: Array<{
    id: string;
    taskType: string;
    level: string;
    topic: string;
    content: any;
    isCurated: boolean;
    updatedAt: number;
  }> = [];

  // 1. Fetch all curated shards completely into memory first BEFORE opening IDB transaction
  for (const shard of SHARD_FILES) {
    try {
      const res = await fetch(`/question-bank/${shard}.json?v=${Date.now()}`, { cache: 'no-cache' });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json)) {
          const valid = json.filter((item) => isHighQualityTask(item, shard));
          curatedMemoryCache[shard] = [...valid];
          counts[shard] = valid.length;
          totalQuestions += valid.length;

          // Stage items for IndexedDB commit
          for (let idx = 0; idx < valid.length; idx++) {
            const item = valid[idx];
            const qId = item.id || `${shard}-curated-${idx + 1}`;
            questionsToStore.push({
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

  // 2. Fetch and merge validated questions from Firestore into local memory array BEFORE opening IDB transaction
  // The Question Bank is a global shared resource for all users; do NOT filter by userId!
  try {
    if (db) {
      const qSnap = await getDocs(collection(db, 'questions'));
      if (!qSnap.empty) {
        qSnap.forEach((docSnap) => {
          const rawDoc = docSnap.data();
          const normalized = normalizeTaskData(rawDoc);
          const contentToCheck = normalized?.content || rawDoc;
          const targetTaskType = normalized?.taskType || rawDoc.taskType || rawDoc.type || 'academic-discussion';
          if (contentToCheck && targetTaskType) {
            const qId = docSnap.id;
            const validLevel = normalized?.level || rawDoc.level || 'intermediate';
            const validTopic = normalized?.topic || rawDoc.topic || 'general';

            questionsToStore.push({
              id: qId,
              taskType: targetTaskType,
              level: validLevel,
              topic: validTopic,
              content: contentToCheck,
              isCurated: false,
              updatedAt: Date.now(),
            });

            // Also merge into memory cache
            if (!curatedMemoryCache[targetTaskType]) {
              curatedMemoryCache[targetTaskType] = [];
            }
            const exists = curatedMemoryCache[targetTaskType].some(
              (item) => item.id === qId || item.id === contentToCheck.id
            );
            if (!exists) {
              curatedMemoryCache[targetTaskType].push(contentToCheck);
            }

            counts[targetTaskType] = (counts[targetTaskType] || 0) + 1;
            totalQuestions++;
          }
        });
      }
    }
  } catch (firestoreErr) {
    console.warn('Failed to sync questions from Firestore into local bank:', firestoreErr);
  }

  // 3. AFTER all network requests are 100% complete, open the IndexedDB transaction and write in one synchronous batch
  if (questionsToStore.length > 0) {
    try {
      const dbInstance = await openIndexedDB();
      const tx = dbInstance.transaction('toefl_question_bank', 'readwrite');
      const store = tx.objectStore('toefl_question_bank');

      for (const q of questionsToStore) {
        store.put(q);
      }

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch (idbErr) {
      console.warn('Failed to commit questions to IndexedDB:', idbErr);
    }
  }

  return {
    totalQuestions,
    totalCurated: totalQuestions,
    counts,
    countsPerTaskType: counts,
  };
}

/**
 * Synchronizes global questions from Firestore without userId filtering,
 * commits them to IndexedDB 'toefl_question_bank', updates memory cache,
 * and returns the updated counts across all task types.
 */
export async function syncFirestoreGlobalCounts(): Promise<QuestionBankSyncResult> {
  return syncCuratedQuestionBank();
}

/**
 * Re-Sync All Shards: Pulls all 9 static JSON shards AND all global Firestore questions,
 * merges everything into IndexedDB and in-memory cache, and returns the updated stats.
 */
export async function reSyncAllShards(): Promise<QuestionBankSyncResult> {
  return syncCuratedQuestionBank();
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
  for (const s of SHARD_FILES) {
    counts[s] = (curatedMemoryCache[s] || []).length;
  }

  // Read all distinct questions from IndexedDB
  try {
    const dbInstance = await openIndexedDB();
    const tx = dbInstance.transaction('toefl_question_bank', 'readonly');
    const store = tx.objectStore('toefl_question_bank');
    const all = await new Promise<any[]>((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => resolve([]);
    });

    if (all.length > 0) {
      for (const s of SHARD_FILES) {
        counts[s] = 0;
      }
      let curatedTotal = 0;
      for (const item of all) {
        const tType = item.taskType;
        if (tType) {
          counts[tType] = (counts[tType] || 0) + 1;
          if (item.isCurated) curatedTotal++;
        }
      }
      const totalQuestions = Object.values(counts).reduce((a, b) => a + b, 0);
      return {
        totalQuestions,
        totalCurated: curatedTotal,
        countsPerTaskType: counts,
      };
    }
  } catch {}

  // If cache is cold and IDB empty, run full sync
  const totalInCache = Object.values(counts).reduce((a, b) => a + b, 0);
  if (totalInCache === 0) {
    const syncRes = await syncCuratedQuestionBank();
    return {
      totalQuestions: syncRes.totalQuestions,
      totalCurated: syncRes.totalQuestions,
      countsPerTaskType: syncRes.counts,
    };
  }

  const totalQuestions = Object.values(counts).reduce((a, b) => a + b, 0);
  return {
    totalQuestions,
    totalCurated: totalQuestions,
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
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
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
