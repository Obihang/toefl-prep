import { isHighQualityTask } from './questionValidator';
import { normalizeTaskData } from './taskNormalizer';
import { db, auth } from '../firebase';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  limit,
  startAfter,
  getDocs,
  serverTimestamp,
  increment,
  arrayUnion,
  writeBatch,
  DocumentSnapshot,
} from 'firebase/firestore';
import { getAuthHeaders, getScholarUsername, getApiHeaders } from './apiKey';
import { parseDialogueLine, DialogueVoiceManager } from './voices';
import { stripSpeakerAndFormatting } from './audioSpeech';
import { getSectionForTaskType } from '../types/taskTypes';
import {
  LEVELS,
  ACADEMIC_TOPICS,
  AcademicTopic,
  Level,
  isValidLevel,
  isValidAcademicTopic,
} from '../constants/filters';
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
        id: questionId,
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

// -------------------------------------------------------------
// Shared Questions & Firestore Sync Logic (Consolidated)
// -------------------------------------------------------------

const LOCAL_SEEN_KEY = 'toefl_seen_question_ids';

export function getLocalSeenQuestionIds(): string[] {
  try {
    const raw = localStorage.getItem(LOCAL_SEEN_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function markLocalQuestionAsSeen(id: string) {
  try {
    const current = getLocalSeenQuestionIds();
    if (!current.includes(id)) {
      const updated = [...current.slice(-500), id];
      localStorage.setItem(LOCAL_SEEN_KEY, JSON.stringify(updated));
    }
  } catch {
    // Ignore storage errors
  }
}

// Generate a deterministic SHA-256 hash from question content
export async function computeContentHash(taskType: string, content: any): Promise<string> {
  const mainText =
    content.passage ||
    content.text ||
    content.script ||
    content.situation ||
    content.professorPrompt ||
    (Array.isArray(content.sentences) ? content.sentences.join(' ') : '') ||
    (Array.isArray(content.questions) ? content.questions.map((q: any) => q.question || q.q).join(' ') : '') ||
    (Array.isArray(content.items) ? content.items.map((i: any) => i.answer || i.context).join(' ') : '') ||
    JSON.stringify(content);

  const cleanSample = `${taskType}:::${mainText.trim().toLowerCase()}`;

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(cleanSample));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      return hex;
    } catch {
      // Fallback
    }
  }

  // Fast 32-bit FNV-1a hash fallback
  let h = 0x811c9dc5;
  for (let i = 0; i < cleanSample.length; i++) {
    h ^= cleanSample.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `hash_${(h >>> 0).toString(16)}`;
}

export interface SharedQuestionRecord {
  id?: string;
  taskType: string;
  level: string;
  topic: string;
  content: any;
  contentHash: string;
  audioUrl?: string | null;
  audioClips?: Array<{ speaker: string; url: string }> | null;
  source?: string;
  generatedBy?: string;
  createdAt?: any;
  createdBy: string;
  useCount: number;
  reportCount?: number;
}

const BLOB_DOMAIN_SUFFIX = 'blob.vercel-storage.com';
function isValidBlobUrl(url: any): boolean {
  if (typeof url !== 'string') return false;
  return url.startsWith('https://') && url.includes(BLOB_DOMAIN_SUFFIX);
}

/**
 * Deduplicate by contentHash and save a question to Firestore collection 'questions'.
 * Validates level against LEVELS and infers topic if missing, 'all' or 'general'.
 */
export async function saveQuestionToBank(params: {
  taskType: string;
  level: string;
  topic: string;
  content: any;
  audioUrl?: string | null;
  audioClips?: Array<{ speaker: string; url: string }> | null;
  source?: string;
  generatedBy?: string;
}): Promise<string | null> {
  const { taskType, content, audioUrl = null, audioClips = null, source = 'ai', generatedBy = getScholarUsername() } = params;

  // Validate & normalize level
  let validatedLevel: Level = 'intermediate';
  if (isValidLevel(params.level)) {
    validatedLevel = params.level;
  } else if (isValidLevel(content?.level)) {
    validatedLevel = content.level;
  }

  // Validate & infer topic (never save 'all' or 'general')
  let validatedTopic: AcademicTopic;
  if (isValidAcademicTopic(params.topic) && params.topic !== ('all' as any) && params.topic !== ('general' as any)) {
    validatedTopic = params.topic;
  } else {
    validatedTopic = inferTopic(content);
  }

  const contentHash = await computeContentHash(taskType, content);

  const cleanAudioUrl = isValidBlobUrl(audioUrl) ? audioUrl : null;
  const cleanAudioClips = Array.isArray(audioClips)
    ? audioClips.filter((c) => isValidBlobUrl(c.url)).slice(0, 10)
    : null;

  const enrichedContent = {
    ...content,
    level: validatedLevel,
    topic: validatedTopic,
    source,
    generatedBy: generatedBy || getScholarUsername(),
    createdAt: content.createdAt || Date.now(),
  };

  try {
    // 1. Check for existing duplicate by contentHash
    const q = query(
      collection(db, 'questions'),
      where('contentHash', '==', contentHash),
      limit(1)
    );
    const existingSnap = await getDocs(q);
    if (!existingSnap.empty) {
      return existingSnap.docs[0].id;
    }

    // 2. Generate new document
    const docId = `q_${contentHash.slice(0, 24)}`;
    const docRef = doc(db, 'questions', docId);

    const record: SharedQuestionRecord = {
      id: docId,
      taskType,
      level: validatedLevel,
      topic: validatedTopic,
      content: enrichedContent,
      contentHash,
      audioUrl: cleanAudioUrl,
      audioClips: cleanAudioClips && cleanAudioClips.length > 0 ? cleanAudioClips : null,
      source,
      generatedBy: enrichedContent.generatedBy,
      createdAt: serverTimestamp(),
      createdBy: auth?.currentUser?.uid || 'anonymous',
      useCount: 0,
      reportCount: 0,
    };

    await setDoc(docRef, record, { merge: false });
    return docId;
  } catch (err) {
    console.warn('Failed to save question to Firestore bank:', err);
    return null;
  }
}

/**
 * Get the list of seen question IDs for the current user from userProgress/{uid}
 */
export async function getUserSeenQuestionIds(uid?: string): Promise<string[]> {
  const effectiveUid = uid || auth?.currentUser?.uid;
  const localSeen = getLocalSeenQuestionIds();
  if (!effectiveUid) return localSeen;

  try {
    const userDocRef = doc(db, 'userProgress', effectiveUid);
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      const data = snap.data();
      const serverSeen: string[] = Array.isArray(data.seenQuestionIds) ? data.seenQuestionIds : [];
      return Array.from(new Set([...localSeen, ...serverSeen]));
    }
  } catch (err) {
    console.warn('Failed to fetch userProgress:', err);
  }
  return localSeen;
}

/**
 * Mark a question as seen in userProgress/{uid} and local storage
 */
export async function markQuestionAsSeen(questionId: string, uid?: string): Promise<void> {
  markLocalQuestionAsSeen(questionId);
  const effectiveUid = uid || auth?.currentUser?.uid;
  if (!effectiveUid) return;

  try {
    const userDocRef = doc(db, 'userProgress', effectiveUid);
    await setDoc(
      userDocRef,
      {
        seenQuestionIds: arrayUnion(questionId),
        lastUpdated: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Failed to mark question in userProgress:', err);
  }
}

export type MatchTier = 'exact' | 'topic-only' | 'level-only' | 'any';

export interface UnseenQuestionResult {
  question: any;
  tier: MatchTier;
}

export interface TierQueryConfig {
  tier: MatchTier;
  level?: string;
  topic?: string;
}

/**
 * Pure helper defining the 4-tier querying plan for a given level and topic request.
 * (level+topic) -> (topic only) -> (level only) -> any
 */
export function getQueryTiers(level: string = 'all', topic: string = 'all'): TierQueryConfig[] {
  const isLevelConcrete = level && level !== 'all' && isValidLevel(level);
  const isTopicConcrete = topic && topic !== 'all' && isValidAcademicTopic(topic);

  if (isLevelConcrete && isTopicConcrete) {
    return [
      { tier: 'exact', level, topic },
      { tier: 'topic-only', topic },
      { tier: 'level-only', level },
      { tier: 'any' },
    ];
  } else if (isLevelConcrete) {
    return [
      { tier: 'exact', level },
      { tier: 'any' },
    ];
  } else if (isTopicConcrete) {
    return [
      { tier: 'exact', topic },
      { tier: 'any' },
    ];
  } else {
    return [{ tier: 'exact' }];
  }
}

/**
 * Pure function to select a question from an in-memory bank matching tier requirements.
 * Used for simulated tests and offline tier verification.
 */
export function selectQuestionFromBankTiers(
  bank: SharedQuestionRecord[],
  seenIds: string[],
  level: string = 'all',
  topic: string = 'all',
  taskType?: string
): UnseenQuestionResult | null {
  const tiers = getQueryTiers(level, topic);

  for (const tierConfig of tiers) {
    const matched = bank.filter((item) => {
      if (taskType && item.taskType !== taskType) return false;
      if ((item.reportCount || 0) >= 3) return false;
      const itemId = item.id || (item as any).questionDocId;
      if (itemId && seenIds.includes(itemId)) return false;

      if (tierConfig.level && item.level !== tierConfig.level) return false;
      if (tierConfig.topic && item.topic !== tierConfig.topic) return false;

      return true;
    });

    if (matched.length > 0) {
      return {
        question: matched[0],
        tier: tierConfig.tier,
      };
    }
  }

  return null;
}

/**
 * Fetch an unseen question from Firestore questions bank using tier querying:
 * (level+topic) -> (topic only) -> (level only) -> any.
 * Skips items with reportCount >= 3 and already seen questions.
 * Applies lazy backfill if document has outdated/missing topic or level.
 */
export async function fetchUnseenQuestion(
  taskType: string,
  level: string = 'all',
  topic: string = 'all'
): Promise<UnseenQuestionResult | null> {
  try {
    const currentUid = auth?.currentUser?.uid;
    const seenIds = await getUserSeenQuestionIds(currentUid);
    const tiers = getQueryTiers(level, topic);

    for (const tierConfig of tiers) {
      let q = query(collection(db, 'questions'), where('taskType', '==', taskType));
      if (tierConfig.level) {
        q = query(q, where('level', '==', tierConfig.level));
      }
      if (tierConfig.topic) {
        q = query(q, where('topic', '==', tierConfig.topic));
      }
      q = query(q, limit(35));

      const snapshot = await getDocs(q);
      if (snapshot.empty) continue;

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();

        // 1. Skip reported questions (reportCount >= 3)
        if ((data.reportCount || 0) >= 3) {
          continue;
        }

        // 2. Skip already seen questions
        if (seenIds.includes(docSnap.id)) {
          continue;
        }

        // 3. Lazy backfill check: if topic or level not in allowed lists, repair doc
        const isTopicValid = isValidAcademicTopic(data.topic);
        const isLevelValid = isValidLevel(data.level);

        let activeTopic = data.topic;
        let activeLevel = data.level;

        if (!isTopicValid || !isLevelValid) {
          const updates: Record<string, any> = {};
          if (!isTopicValid) {
            activeTopic = inferTopic(data.content || data);
            updates.topic = activeTopic;
          }
          if (!isLevelValid) {
            const candidateLevel = data.content?.level;
            activeLevel = isValidLevel(candidateLevel) ? candidateLevel : 'intermediate';
            updates.level = activeLevel;
          }
          updateDoc(doc(db, 'questions', docSnap.id), updates).catch((err) => {
            console.warn(`Lazy backfill update failed for ${docSnap.id}:`, err);
          });
        }

        // 4. Mark usage and update userProgress
        updateDoc(doc(db, 'questions', docSnap.id), {
          useCount: increment(1),
        }).catch(() => {});

        markQuestionAsSeen(docSnap.id, currentUid).catch(() => {});

        return {
          question: {
            ...data.content,
            id: docSnap.id,
            questionDocId: docSnap.id,
            taskType: data.taskType,
            level: activeLevel,
            topic: activeTopic,
            reportCount: data.reportCount || 0,
            audioUrl: data.audioUrl || null,
            audioClips: data.audioClips || null,
            isSharedBank: true,
          },
          tier: tierConfig.tier,
        };
      }
    }
  } catch (err) {
    console.warn('Error fetching unseen question from bank:', err);
  }

  return null;
}

/**
 * Fetch a random shared question passing filter options and attaching tier match information.
 */
export async function fetchRandomSharedQuestion(
  taskType: string,
  level: string = 'all',
  topic: string = 'all'
): Promise<any | null> {
  const result = await fetchUnseenQuestion(taskType, level, topic);
  if (!result) return null;
  return {
    ...result.question,
    matchTier: result.tier,
    tier: result.tier,
  };
}

/**
 * Get count of unseen questions currently available in bank for taskType, level, and topic.
 * Skips items with reportCount >= 3.
 */
export async function getUnseenQuestionCount(
  taskType: string,
  level: string = 'all',
  topic: string = 'all'
): Promise<number> {
  try {
    const seenIds = await getUserSeenQuestionIds();
    let q = query(collection(db, 'questions'), where('taskType', '==', taskType));
    if (level && level !== 'all' && isValidLevel(level)) {
      q = query(q, where('level', '==', level));
    }
    if (topic && topic !== 'all' && isValidAcademicTopic(topic)) {
      q = query(q, where('topic', '==', topic));
    }
    q = query(q, limit(40));
    const snap = await getDocs(q);
    let unseen = 0;
    snap.docs.forEach((d) => {
      const data = d.data();
      if ((data.reportCount || 0) < 3 && !seenIds.includes(d.id)) {
        unseen++;
      }
    });
    return unseen;
  } catch {
    return 0;
  }
}

// Background prefetch locking to ensure at most one prefetch runs at a time
let isBackgroundPrefetching = false;

export function isPrefetchActive(): boolean {
  return isBackgroundPrefetching;
}

/**
 * Check bank count and trigger background batch generation if unseen count < 5.
 * Never sends 'all' or 'general' to generator or bank; selects concrete level and topic with fewest questions.
 */
export async function triggerBackgroundPrefetchIfNeeded(
  taskType: string,
  level: string = 'all',
  topic: string = 'all',
  generateBatchFn: (tType: string, lvl: string, top: string) => Promise<any[]>
): Promise<void> {
  if (isBackgroundPrefetching) return;

  const count = await getUnseenQuestionCount(taskType, level, topic);
  if (count >= 5) return;

  // Determine concrete level (never 'all')
  const concreteLevel: Level = (level !== 'all' && isValidLevel(level)) ? level : 'intermediate';

  // Determine concrete topic (never 'all' or 'general'): pick topic with fewest unseen questions
  let concreteTopic: AcademicTopic = 'campus-life';
  if (topic !== 'all' && isValidAcademicTopic(topic)) {
    concreteTopic = topic;
  } else {
    try {
      let minCount = Infinity;
      for (const candTopic of ACADEMIC_TOPICS) {
        const unseenForTopic = await getUnseenQuestionCount(taskType, concreteLevel, candTopic);
        if (unseenForTopic < minCount) {
          minCount = unseenForTopic;
          concreteTopic = candTopic;
        }
      }
    } catch {
      concreteTopic = ACADEMIC_TOPICS[Math.floor(Math.random() * ACADEMIC_TOPICS.length)];
    }
  }

  isBackgroundPrefetching = true;
  window.dispatchEvent(new CustomEvent('toefl_prefetch_status', { detail: { isPrefetching: true } }));

  try {
    const items = await generateBatchFn(taskType, concreteLevel, concreteTopic);

    // Process items with max concurrency of 2
    const chunkLimit = 2;
    for (let i = 0; i < items.length; i += chunkLimit) {
      const chunk = items.slice(i, i + chunkLimit);
      await Promise.all(
        chunk.map(async (item) => {
          let audioUrl: string | null = null;
          let audioClips: Array<{ speaker: string; url: string }> | null = null;

          if (taskType === 'listening-dialogue' || taskType === 'listen-repeat') {
            try {
              const authHdrs = await getAuthHeaders();
              const headers = { ...getApiHeaders(), ...authHdrs };

              if (taskType === 'listening-dialogue' && Array.isArray(item.turns) && item.turns.length > 0) {
                audioClips = [];
                const voiceManager = new DialogueVoiceManager();
                for (let tIdx = 0; tIdx < item.turns.length; tIdx++) {
                  const turn = item.turns[tIdx];
                  const rawText = turn.text || '';
                  const parsed = parseDialogueLine(rawText);
                  if (!parsed.spokenText) continue;

                  const speaker = parsed.speakerName || turn.speaker || (tIdx % 2 === 0 ? 'Speaker A' : 'Speaker B');
                  const voiceName = voiceManager.getVoiceForSpeaker(speaker, parsed.speakerHint);

                  try {
                    const ttsRes = await fetch('/api/tts', {
                      method: 'POST',
                      headers,
                      body: JSON.stringify({ text: parsed.spokenText, voiceName, speaker }),
                    });
                    const ttsJson = await ttsRes.json();
                    if (ttsJson.success && isValidBlobUrl(ttsJson.audioUrl)) {
                      audioClips.push({ speaker, url: ttsJson.audioUrl });
                    }
                  } catch {}
                }
                if (audioClips.length > 0) {
                  audioClips = audioClips.slice(0, 10);
                  audioUrl = audioClips[0].url;
                }
              } else if (taskType === 'listen-repeat' && Array.isArray(item.sentences) && item.sentences.length > 0) {
                audioClips = [];
                for (const sentence of item.sentences) {
                  const cleanSentence = stripSpeakerAndFormatting(sentence || '');
                  if (!cleanSentence) continue;
                  try {
                    const ttsRes = await fetch('/api/tts', {
                      method: 'POST',
                      headers,
                      body: JSON.stringify({ text: cleanSentence, voiceName: 'en-US-JennyNeural', speaker: 'Narrator' }),
                    });
                    const ttsJson = await ttsRes.json();
                    if (ttsJson.success && isValidBlobUrl(ttsJson.audioUrl)) {
                      audioClips.push({ speaker: 'Narrator', url: ttsJson.audioUrl });
                    }
                  } catch {}
                }
                if (audioClips.length > 0) {
                  audioClips = audioClips.slice(0, 10);
                  audioUrl = audioClips[0].url;
                }
              } else {
                const textToSpeak = stripSpeakerAndFormatting(item.script || (Array.isArray(item.sentences) ? item.sentences.join(' ') : ''));
                if (textToSpeak) {
                  const ttsRes = await fetch('/api/tts', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                      text: textToSpeak,
                      voiceName: item.speakerGender === 'female' ? 'en-US-JennyNeural' : 'en-US-GuyNeural',
                      speaker: item.speakerName || 'Narrator',
                    }),
                  });
                  const ttsJson = await ttsRes.json();
                  if (ttsJson.success && isValidBlobUrl(ttsJson.audioUrl)) {
                    audioUrl = ttsJson.audioUrl;
                  }
                }
              }
            } catch (audioErr) {
              console.warn('Background audio pre-synthesis skipped:', audioErr);
            }
          }

          await saveQuestionToBank({
            taskType,
            level: concreteLevel,
            topic: concreteTopic,
            content: item,
            audioUrl,
            audioClips,
          });
        })
      );
    }
  } catch (err) {
    console.warn('Background question prefetch failed:', err);
  } finally {
    isBackgroundPrefetching = false;
    window.dispatchEvent(new CustomEvent('toefl_prefetch_status', { detail: { isPrefetching: false } }));
  }
}

/**
 * Report a shared question using writeBatch:
 * - sets questionReports/{questionDocId}__{uid}
 * - increments reportCount on questions/{questionDocId}
 */
export async function reportSharedQuestion(
  questionDocId: string,
  userId?: string,
  reason: string = 'User flagged question'
): Promise<boolean> {
  const currentUid = userId || auth?.currentUser?.uid;
  if (!currentUid) {
    throw new Error('You must be signed in to report a question.');
  }
  if (!questionDocId) {
    throw new Error('Question ID is missing.');
  }

  const batch = writeBatch(db);
  const reportDocId = `${questionDocId}__${currentUid}`;
  const reportRef = doc(db, 'questionReports', reportDocId);

  batch.set(reportRef, {
    questionId: questionDocId,
    uid: currentUid,
    reason: reason || 'User flagged question',
    createdAt: serverTimestamp(),
  });

  const questionRef = doc(db, 'questions', questionDocId);
  batch.update(questionRef, {
    reportCount: increment(1),
  });

  await batch.commit();
  return true;
}

/**
 * Repair Question Bank:
 * Loops through all questions (200 per page). If a question has an invalid
 * topic or level, applies rule-guarded updates with inferred values.
 */
export async function repairQuestionBank(
  onProgress?: (processed: number, fixed: number) => void
): Promise<{ totalProcessed: number; totalFixed: number }> {
  let totalProcessed = 0;
  let totalFixed = 0;
  let lastVisible: DocumentSnapshot | null = null;

  while (true) {
    let q = query(collection(db, 'questions'), limit(200));
    if (lastVisible) {
      q = query(collection(db, 'questions'), startAfter(lastVisible), limit(200));
    }

    const snap = await getDocs(q);
    if (snap.empty) break;

    for (const docSnap of snap.docs) {
      totalProcessed++;
      const data = docSnap.data();

      const isTopicValid = isValidAcademicTopic(data.topic);
      const isLevelValid = isValidLevel(data.level);

      if (!isTopicValid || !isLevelValid) {
        const updates: Record<string, any> = {};
        if (!isTopicValid) {
          updates.topic = inferTopic(data.content || data);
        }
        if (!isLevelValid) {
          const cand = data.content?.level;
          updates.level = isValidLevel(cand) ? cand : 'intermediate';
        }

        try {
          await updateDoc(doc(db, 'questions', docSnap.id), updates);
          totalFixed++;
        } catch (err) {
          console.warn(`Failed to repair doc ${docSnap.id}:`, err);
        }
      }
    }

    if (onProgress) {
      onProgress(totalProcessed, totalFixed);
    }

    if (snap.docs.length < 200) break;
    lastVisible = snap.docs[snap.docs.length - 1];
  }

  return { totalProcessed, totalFixed };
}

export async function getQuestionCountsPerSection(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {
    Reading: 0,
    Listening: 0,
    Speaking: 0,
    Writing: 0,
  };

  try {
    const qSnap = await getDocs(collection(db, 'questions'));
    qSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const section = getSectionForTaskType(data.taskType || '');
      if (section && counts[section] !== undefined) {
        counts[section]++;
      }
    });
  } catch {
    // Return zeroes if offline or unseeded
  }

  return counts;
}

export async function getQuestionCountsPerTaskType(): Promise<Record<string, number>> {
  try {
    const stats = await getQuestionBankStats();
    return stats.countsPerTaskType;
  } catch {
    return {};
  }
}

export async function seedDefaultQuestionsToFirestore(): Promise<{ created: number; skipped: number; failed: number }> {
  const report = { created: 0, skipped: 0, failed: 0 };
  if (!auth?.currentUser) return report;

  try {
    const {
      CURATED_READING_PASSAGES,
      CURATED_LISTENING,
      CURATED_LISTEN_REPEAT,
      CURATED_SPEAKING_INTERVIEWS,
      CURATED_BUILD_SENTENCES,
      CURATED_COMPLETE_WORDS,
      CURATED_WRITE_EMAILS,
      CURATED_ACADEMIC_DISCUSSIONS,
    } = await import('../data/curatedQuestions');

    const seedList: Array<{ taskType: string; data: any }> = [];
    CURATED_READING_PASSAGES?.forEach((p) => seedList.push({ taskType: 'reading-passage', data: p }));
    CURATED_LISTENING?.forEach((l) => seedList.push({ taskType: 'listening-dialogue', data: l }));
    CURATED_LISTEN_REPEAT?.forEach((l) => seedList.push({ taskType: 'listen-repeat', data: l }));
    CURATED_SPEAKING_INTERVIEWS?.forEach((s) => seedList.push({ taskType: 'speaking-interview', data: s }));
    CURATED_BUILD_SENTENCES?.forEach((b) => seedList.push({ taskType: 'build-sentence', data: b }));
    CURATED_COMPLETE_WORDS?.forEach((c) => seedList.push({ taskType: 'complete-words', data: c }));
    CURATED_WRITE_EMAILS?.forEach((w) => seedList.push({ taskType: 'write-email', data: w }));
    CURATED_ACADEMIC_DISCUSSIONS?.forEach((a) => seedList.push({ taskType: 'academic-discussion', data: a }));

    for (const item of seedList) {
      try {
        const itemLevel = isValidLevel(item.data.level) ? item.data.level : 'upper-intermediate';
        const itemTopic = isValidAcademicTopic(item.data.topic) ? item.data.topic : inferTopic(item.data);

        const id = await saveQuestionToBank({
          taskType: item.taskType,
          level: itemLevel,
          topic: itemTopic,
          content: item.data,
        });
        if (id) report.created++;
        else report.skipped++;
      } catch {
        report.failed++;
      }
    }
  } catch (err) {
    console.info('Auto-seeding skipped or failed:', err);
  }

  return report;
}

export function generateQuestionDocId(taskType: string, taskData: any): Promise<string> {
  return computeContentHash(taskType, taskData).then((h) => `q_${h.slice(0, 24)}`);
}

export function saveSharedQuestion(params: any): Promise<string> {
  const itemLevel = isValidLevel(params.level) ? params.level : 'upper-intermediate';
  const itemTopic = isValidAcademicTopic(params.topic) ? params.topic : inferTopic(params.data);

  return saveQuestionToBank({
    taskType: params.taskType,
    level: itemLevel,
    topic: itemTopic,
    content: params.data,
    audioUrl: params.audioUrl,
  }).then((id) => id || `local_${Date.now()}`);
}
