import { isHighQualityTask } from './questionValidator';
import { db, auth } from '../firebase';
import { collection, doc, setDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';

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
}): Promise<string | null> {
  const { taskType, level, topic, content, audioUrl = null, audioClips = null } = params;
  
  if (!isHighQualityTask(content, taskType)) {
    console.warn(`Rejected low-quality question for taskType ${taskType} during save.`);
    return null;
  }

  const questionId = content.id || `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

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
      content,
      audioUrl,
      audioClips,
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
        content,
        audioUrl,
        audioClips,
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

/**
 * Load static curated shard for taskType from public/question-bank/<taskType>.json
 */
export async function loadCuratedShard(taskType: string): Promise<any[]> {
  try {
    const res = await fetch(`/question-bank/${taskType}.json`);
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json)) {
        return json.filter((item) => isHighQualityTask(item, taskType));
      }
    }
  } catch (err) {
    console.warn(`Failed to fetch curated shard for ${taskType}:`, err);
  }
  return [];
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
 * Export all questions as JSON
 */
export async function exportQuestionBankJson(): Promise<string> {
  const items: any[] = [];
  try {
    const dbInstance = await openIndexedDB();
    const tx = dbInstance.transaction('toefl_question_bank', 'readonly');
    const store = tx.objectStore('toefl_question_bank');
    const req = store.getAll();
    await new Promise((resolve) => {
      req.onsuccess = () => {
        if (Array.isArray(req.result)) items.push(...req.result);
        resolve(null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {}

  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), questions: items }, null, 2);
}
