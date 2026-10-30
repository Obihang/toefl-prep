import { isHighQualityTask } from './questionValidator';
import {
  normalizeTaskData,
  normalizeQuestionBankItem,
  validateNormalizedTask,
  normalizeDifficultyLabel,
  normalizeTopicLabel,
  canonicalizeTaskType as normalizerCanonicalizeTaskType,
} from './taskNormalizer';
import { db, auth, ensureAuthenticated } from '../firebase';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
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
import { TASK_DEFINITIONS, getSectionForTaskType } from '../types/taskTypes';
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
export const CURRENT_BANK_SCHEMA_VERSION = 202610;
export const TOEFL_2026_PURGE_V17 = 'toefl_bank_purged_2026_v17';
export const TOEFL_2026_PURGE_V16 = TOEFL_2026_PURGE_V17;
export const TOEFL_2026_PURGE_V15 = TOEFL_2026_PURGE_V17;
export const TOEFL_2026_PURGE_V14 = TOEFL_2026_PURGE_V17;
export const TOEFL_2026_PURGE_V13 = TOEFL_2026_PURGE_V17;
export const TOEFL_2026_PURGE_V12 = TOEFL_2026_PURGE_V17;
export const TOEFL_2026_PURGE_V11 = TOEFL_2026_PURGE_V17;
export const TOEFL_2026_PURGE_V10 = TOEFL_2026_PURGE_V17;
export const TOEFL_2026_PURGE_V9 = TOEFL_2026_PURGE_V17;
export const TOEFL_2026_PURGE_V8 = TOEFL_2026_PURGE_V17;
export const TOEFL_2026_PURGE_V7 = TOEFL_2026_PURGE_V17;
export const TOEFL_2026_PURGE_V6 = TOEFL_2026_PURGE_V17;
export const TOEFL_2026_PURGE_V5 = TOEFL_2026_PURGE_V17;
export const TOEFL_2026_PURGE_V4 = TOEFL_2026_PURGE_V17;
export const TOEFL_2026_PURGE_V3 = TOEFL_2026_PURGE_V17;
export const TOEFL_2026_PURGE_V2 = TOEFL_2026_PURGE_V17;
export const STATIC_SHARDS_SYNC_KEY = 'toefl_static_shards_synced_v27';

export function canonicalizeTaskType(taskType: string): string {
  return normalizerCanonicalizeTaskType(taskType);
}

/**
 * Generates a normalized, synchronous content signature for deduplicating questions
 * across static shards, IndexedDB, and Firestore.
 */
export function getQuestionContentSignature(taskType: string, data: any): string {
  const canonicalType = canonicalizeTaskType(taskType);
  const content = data?.content || data || {};
  const mainText =
    content.passage ||
    content.text ||
    content.script ||
    content.situation ||
    content.professorPrompt ||
    (Array.isArray(content.turns)
      ? content.turns.map((t: any) => t?.text || '').join(' ')
      : '') ||
    (Array.isArray(content.sentences) ? content.sentences.join(' ') : '') ||
    (Array.isArray(content.questions)
      ? content.questions.map((q: any) => q?.question || q?.q || q?.prompt || '').join(' ')
      : '') ||
    (Array.isArray(content.items)
      ? content.items.map((i: any) => i?.answer || i?.context || '').join(' ')
      : '') ||
    JSON.stringify(content);

  const normalizedText = String(mainText)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 300);

  return `${canonicalType}:::${normalizedText}`;
}

/**
 * Checks whether a question item matches a selected proficiency level filter.
 */
export function matchesLevelFilter(q: any, selectedLevel?: string): boolean {
  if (
    !selectedLevel ||
    selectedLevel === 'all' ||
    selectedLevel === 'All Levels' ||
    selectedLevel === 'any'
  ) {
    return true;
  }
  const target = normalizeDifficultyLabel(selectedLevel);
  const rawItemLevel =
    q?.level || q?.difficulty || q?.content?.level || q?.content?.difficulty;
  const itemLevel = normalizeDifficultyLabel(rawItemLevel);
  return itemLevel === target;
}

/**
 * Checks whether a question item matches a selected academic topic filter.
 */
export function matchesTopicFilter(q: any, selectedTopic?: string): boolean {
  if (
    !selectedTopic ||
    selectedTopic === 'all' ||
    selectedTopic === 'All Topics' ||
    selectedTopic === 'any' ||
    selectedTopic === 'general'
  ) {
    return true;
  }
  const target = normalizeTopicLabel(selectedTopic);
  const contentObj = q?.content || q;
  const rawItemTopic =
    q?.topic ||
    q?.category ||
    q?.subject ||
    contentObj?.topic ||
    contentObj?.category ||
    contentObj?.subject;
  const itemTopic = normalizeTopicLabel(rawItemTopic, contentObj);
  return itemTopic === target;
}

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
 * Clears all stored questions from local IndexedDB and resets in-memory cache.
 */
export async function clearAllLocalQuestions(): Promise<void> {
  for (const key of Object.keys(curatedMemoryCache)) {
    delete curatedMemoryCache[key];
  }
  try {
    const dbInstance = await openIndexedDB();
    await new Promise<void>((resolve, reject) => {
      const tx = dbInstance.transaction('toefl_question_bank', 'readwrite');
      const store = tx.objectStore('toefl_question_bank');
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Failed to clear local IndexedDB question bank:', err);
  }
}

let purgePromise: Promise<void> | null = null;

/**
 * One-time 2026 v2 migration that purges all legacy/corrupted questions from IndexedDB,
 * localStorage prefetch caches, and Firestore 'questions' collection before seeding the 80 clean items.
 */
export async function ensurePurged2026V2(): Promise<void> {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  if (localStorage.getItem(TOEFL_2026_PURGE_V2) === 'true') return;
  if (purgePromise) return purgePromise;

  purgePromise = (async () => {
    try {
      await clearAllLocalQuestions();
      localStorage.removeItem('toefl_prefetched_queue_v1');
      localStorage.removeItem('toefl_prefetch_queue_v3');
      localStorage.removeItem('toefl_seen_question_ids');

      if (db) {
        try {
          await ensureAuthenticated();
          const snap = await getDocs(collection(db, 'questions'));
          if (!snap.empty) {
            await Promise.all(
              snap.docs.map((d) =>
                deleteDoc(doc(db, 'questions', d.id)).catch(() => {})
              )
            );
          }
        } catch (fsErr) {
          console.warn('Firestore legacy question purge skipped or partial:', fsErr);
        }
      }

      localStorage.setItem(TOEFL_2026_PURGE_V2, 'true');
      localStorage.setItem(STATIC_SHARDS_SYNC_KEY, 'true');
    } catch (err) {
      console.warn('Error during TOEFL_2026_PURGE_V2 migration:', err);
    } finally {
      purgePromise = null;
    }
  })();

  return purgePromise;
}

export const ensurePurged2026V4 = ensurePurged2026V2;
export const ensurePurged2026V3 = ensurePurged2026V2;

/**
 * Purge low-quality stub questions from IndexedDB and localStorage on startup
 */
export async function purgeLowQualityCache(): Promise<number> {
  await ensurePurged2026V2();
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
      .filter((item) => {
        if (!item?.content) return true;
        const itemSchema = item.schemaVersion ?? item.content?.schemaVersion;
        if (itemSchema !== CURRENT_BANK_SCHEMA_VERSION) return true;
        const norm = normalizeQuestionBankItem(item.content, item.taskType);
        return !norm || !validateNormalizedTask(item.taskType, norm);
      })
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
  const canonicalType = canonicalizeTaskType(params.taskType);
  const {
    audioUrl = null,
    audioClips = null,
    source = 'ai',
    generatedBy = getScholarUsername(),
  } = params;

  const normalizedItem = normalizeQuestionBankItem(params.content, canonicalType);
  const content = normalizedItem?.content || normalizedItem;

  if (!content || !validateNormalizedTask(canonicalType, content) || !isHighQualityTask(content, canonicalType)) {
    console.warn(`Rejected invalid or low-quality question for taskType ${canonicalType} during save.`);
    return null;
  }

  const validLevel: Level = normalizeDifficultyLabel(params.level || content?.level);
  const validTopic: AcademicTopic = normalizeTopicLabel(params.topic || content?.topic, content);

  const contentHash = await computeContentHash(canonicalType, content);
  const questionId = content.id || `q_${contentHash.slice(0, 24)}`;
  const enrichedContent = {
    ...content,
    id: questionId,
    level: validLevel,
    difficulty: validLevel,
    topic: validTopic,
    source,
    schemaVersion: CURRENT_BANK_SCHEMA_VERSION,
    generatedBy: generatedBy || getScholarUsername(),
    createdAt: content.createdAt || Date.now(),
  };

  // Update in-memory cache immediately if not duplicate
  if (!curatedMemoryCache[canonicalType]) {
    curatedMemoryCache[canonicalType] = [];
  }
  const sig = getQuestionContentSignature(canonicalType, enrichedContent);
  const alreadyInMem = curatedMemoryCache[canonicalType].some(
    (item) =>
      (item.id || item._id) === questionId ||
      getQuestionContentSignature(canonicalType, item) === sig
  );
  if (!alreadyInMem) {
    curatedMemoryCache[canonicalType].push(enrichedContent);
  }

  // Save to IndexedDB
  try {
    const dbInstance = await openIndexedDB();
    const tx = dbInstance.transaction('toefl_question_bank', 'readwrite');
    const store = tx.objectStore('toefl_question_bank');
    store.put({
      id: questionId,
      taskType: canonicalType,
      level: validLevel,
      topic: validTopic,
      content: enrichedContent,
      contentHash,
      audioUrl,
      audioClips,
      source,
      schemaVersion: CURRENT_BANK_SCHEMA_VERSION,
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

  // Save to Firestore (with or without anonymous auth)
  try {
    await ensureAuthenticated();
    if (db) {
      const docRef = doc(db, 'questions', questionId);
      await setDoc(
        docRef,
        {
          id: questionId,
          taskType: canonicalType,
          level: validLevel,
          topic: validTopic,
          content: enrichedContent,
          contentHash,
          audioUrl: isValidBlobUrl(audioUrl) ? audioUrl : null,
          audioClips: Array.isArray(audioClips)
            ? audioClips.filter((c) => isValidBlobUrl(c?.url)).slice(0, 10)
            : null,
          source,
          schemaVersion: CURRENT_BANK_SCHEMA_VERSION,
          generatedBy: enrichedContent.generatedBy,
          createdAt: serverTimestamp(),
          createdBy: auth?.currentUser?.uid || 'anonymous',
          useCount: 0,
          reportCount: 0,
        },
        { merge: true }
      );
    }
  } catch (err) {
    console.warn('Failed to save verified question to Firestore:', err);
  }

  return questionId;
}

export const SHARD_FILES = [
  'complete-words',
  'daily-life',
  'reading-academic',
  'listening-choose-response',
  'listening-dialogue',
  'listening-announcement',
  'listening-academic-talk',
  'build-sentence',
  'write-email',
  'academic-discussion',
  'listen-repeat',
  'speaking-interview',
];

export const STATIC_SHARDS = SHARD_FILES;
export const ALL_TASK_TYPES = TASK_DEFINITIONS.map((t) => t.id);
const CANONICAL_TASK_IDS = ALL_TASK_TYPES;

// In-memory cache for fast synchronous access
const curatedMemoryCache: Record<string, any[]> = {};

/**
 * Load static curated shard for taskType from public/question-bank/<taskType>.json
 * and merge with any cached IndexedDB questions for that taskType.
 */
export async function loadCuratedShard(taskType: string): Promise<any[]> {
  await ensurePurged2026V2();
  const canonicalType = canonicalizeTaskType(taskType);
  const shardsToLoad = [canonicalType];
  if (canonicalType === 'reading-academic') {
    shardsToLoad.push('reading-passage');
  } else if (canonicalType === 'build-sentence') {
    shardsToLoad.push('writing-build-sentence');
  } else if (canonicalType === 'write-email') {
    shardsToLoad.push('writing-email');
  } else if (canonicalType === 'listen-repeat') {
    shardsToLoad.push('speaking-listen-repeat');
  } else if (canonicalType === 'listening-academic-talk') {
    shardsToLoad.push('listening-lecture');
  }

  if (!curatedMemoryCache[canonicalType]) {
    curatedMemoryCache[canonicalType] = [];
  }

  const existingList = curatedMemoryCache[canonicalType];
  const seenSigs = new Set<string>(
    existingList.map((item) => getQuestionContentSignature(canonicalType, item))
  );
  const seenIds = new Set<string>(
    existingList.map((item) => String(item.id || item._id || '')).filter(Boolean)
  );

  if (existingList.length === 0) {
    for (const shard of shardsToLoad) {
      try {
        const res = await fetch(`/question-bank/${shard}.json?v=${Date.now()}`, {
          cache: 'no-cache',
        });
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json)) {
            for (let idx = 0; idx < json.length; idx++) {
              const rawItem = json[idx];
              const qId = rawItem.id || `${shard}-curated-${idx + 1}`;
              const normalizedWrapper = normalizeQuestionBankItem(rawItem, canonicalType);
              const normalizedItem = normalizedWrapper?.content || normalizedWrapper;
              if (!normalizedItem || !validateNormalizedTask(canonicalType, normalizedItem)) {
                continue;
              }
              const enriched = {
                ...normalizedItem,
                id: qId,
                taskType: canonicalType,
                level: normalizeDifficultyLabel(rawItem.level || rawItem.difficulty),
                difficulty: normalizeDifficultyLabel(rawItem.level || rawItem.difficulty),
                topic: normalizeTopicLabel(rawItem.topic || rawItem.category, rawItem),
                schemaVersion: CURRENT_BANK_SCHEMA_VERSION,
              };
              const sig = getQuestionContentSignature(canonicalType, enriched);
              if (!seenSigs.has(sig) && !seenIds.has(qId)) {
                seenSigs.add(sig);
                seenIds.add(qId);
                existingList.push(enriched);
              }
            }
          }
        }
      } catch (err) {
        console.warn(`Failed to fetch curated shard for ${shard}:`, err);
      }
    }
  }

  // Also merge any validated questions from local IndexedDB for this taskType
  try {
    const dbInstance = await openIndexedDB();
    const tx = dbInstance.transaction('toefl_question_bank', 'readonly');
    const store = tx.objectStore('toefl_question_bank');
    const all = await new Promise<any[]>((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => resolve([]);
    });

    for (const row of all) {
      const rowSchema = row.schemaVersion ?? row.content?.schemaVersion;
      if (rowSchema !== CURRENT_BANK_SCHEMA_VERSION) continue;
      const rowType = canonicalizeTaskType(row.taskType);
      if (rowType === canonicalType && row.content) {
        const qId = String(row.content.id || row.id || '');
        const normalizedWrapper = normalizeQuestionBankItem(row.content, canonicalType);
        const normalizedContent = normalizedWrapper?.content || normalizedWrapper;
        if (!normalizedContent || !validateNormalizedTask(canonicalType, normalizedContent)) {
          continue;
        }
        const enriched = {
          ...normalizedContent,
          id: qId || row.id,
          taskType: canonicalType,
          level: normalizeDifficultyLabel(row.level || row.content.level),
          difficulty: normalizeDifficultyLabel(row.level || row.content.level),
          topic: normalizeTopicLabel(row.topic || row.content.topic, row.content),
          schemaVersion: CURRENT_BANK_SCHEMA_VERSION,
        };
        const sig = getQuestionContentSignature(canonicalType, enriched);
        if (!seenSigs.has(sig) && (!qId || !seenIds.has(qId))) {
          seenSigs.add(sig);
          if (qId) seenIds.add(qId);
          existingList.push(enriched);
        }
      }
    }
  } catch (idbErr) {
    console.warn(`Failed to load cached IDB questions for ${canonicalType}:`, idbErr);
  }

  return curatedMemoryCache[canonicalType] || [];
}

/**
 * Returns the exact list of questions in memory matching the selected level and topic
 * without falling back to the full unfiltered pool. Used for accurate filter count display.
 */
export function getFilteredBankTasks(
  taskType: string,
  level?: string,
  topic?: string
): any[] {
  const canonicalType = canonicalizeTaskType(taskType);
  const all = curatedMemoryCache[canonicalType] || [];
  if (all.length === 0) return [];

  return all.filter(
    (t) => matchesLevelFilter(t, level) && matchesTopicFilter(t, topic)
  );
}

/**
 * Synchronous getter for in-memory curated tasks with level/topic filtering
 * and graceful tier fallback so the user is never stuck with an empty screen.
 */
export function getLoadedCuratedTasks(
  taskType: string,
  level?: string,
  topic?: string
): any[] {
  const canonicalType = canonicalizeTaskType(taskType);
  const all = curatedMemoryCache[canonicalType] || [];
  if (all.length === 0) return [];

  // Tier 1: Exact level + topic match
  const exact = all.filter(
    (t) => matchesLevelFilter(t, level) && matchesTopicFilter(t, topic)
  );
  if (exact.length > 0) return exact;

  // Tier 2: Topic match only
  if (topic && topic !== 'all') {
    const byTopic = all.filter((t) => matchesTopicFilter(t, topic));
    if (byTopic.length > 0) return byTopic;
  }

  // Tier 3: Level match only
  if (level && level !== 'all') {
    const byLevel = all.filter((t) => matchesLevelFilter(t, level));
    if (byLevel.length > 0) return byLevel;
  }

  // Tier 4: Fallback to all tasks in section so the user is never stuck
  return all;
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
 * Deduplicates by content signature and ID across all sources so counts are 100% consistent.
 */
export async function syncCuratedQuestionBank(): Promise<QuestionBankSyncResult> {
  await ensurePurged2026V2();
  const counts: Record<string, number> = {};
  const tempCache: Record<string, any[]> = {};
  for (const tId of CANONICAL_TASK_IDS) {
    counts[tId] = 0;
    tempCache[tId] = [];
  }

  let totalQuestions = 0;
  let totalCurated = 0;
  const seenSignatures = new Set<string>();
  const seenIds = new Set<string>();

  const questionsToStore: Array<{
    id: string;
    taskType: string;
    level: string;
    topic: string;
    content: any;
    isCurated: boolean;
    schemaVersion: number;
    updatedAt: number;
  }> = [];

  // 1. Fetch all 12 curated shards completely into memory first BEFORE opening IDB transaction
  for (const shard of SHARD_FILES) {
    const canonicalType = canonicalizeTaskType(shard);
    if (!tempCache[canonicalType]) {
      tempCache[canonicalType] = [];
      counts[canonicalType] = 0;
    }

    try {
      const res = await fetch(`/question-bank/${shard}.json?v=${Date.now()}`, {
        cache: 'no-cache',
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json)) {
          for (let idx = 0; idx < json.length; idx++) {
            const rawItem = json[idx];
            const normalizedWrapper = normalizeQuestionBankItem(rawItem, canonicalType);
            const item = normalizedWrapper?.content || normalizedWrapper;
            if (!item || !validateNormalizedTask(canonicalType, item)) {
              continue;
            }
            const qId = String(rawItem.id || item.id || `${shard}-curated-${idx + 1}`);
            const validLevel = normalizeDifficultyLabel(rawItem.level || rawItem.difficulty || item.level);
            const validTopic = normalizeTopicLabel(rawItem.topic || rawItem.category || item.topic, item);
            const enrichedContent = {
              ...item,
              id: qId,
              taskType: canonicalType,
              level: validLevel,
              difficulty: validLevel,
              topic: validTopic,
              schemaVersion: CURRENT_BANK_SCHEMA_VERSION,
            };

            const sig = getQuestionContentSignature(canonicalType, enrichedContent);
            if (seenSignatures.has(sig) || seenIds.has(qId)) {
              continue;
            }
            seenSignatures.add(sig);
            seenIds.add(qId);

            tempCache[canonicalType].push(enrichedContent);
            counts[canonicalType] = (counts[canonicalType] || 0) + 1;
            totalQuestions++;
            totalCurated++;

            questionsToStore.push({
              id: qId,
              taskType: canonicalType,
              level: validLevel,
              topic: validTopic,
              content: enrichedContent,
              isCurated: true,
              schemaVersion: CURRENT_BANK_SCHEMA_VERSION,
              updatedAt: Date.now(),
            });
          }
        }
      }
    } catch (shardErr) {
      console.warn(`Failed to sync shard ${shard}:`, shardErr);
    }
  }

  // 2. Fetch and merge validated, deduplicated questions from Firestore (ONLY CURRENT_BANK_SCHEMA_VERSION)
  try {
    if (db) {
      const qSnap = await getDocs(collection(db, 'questions'));
      if (!qSnap.empty) {
        qSnap.forEach((docSnap) => {
          const rawDoc = docSnap.data();
          if ((rawDoc.reportCount || 0) >= 3) return;
          const docSchema = rawDoc.schemaVersion ?? rawDoc.content?.schemaVersion;
          if (docSchema !== CURRENT_BANK_SCHEMA_VERSION) return;

          const targetTaskType = canonicalizeTaskType(
            rawDoc.taskType || rawDoc.type || 'academic-discussion'
          );
          const normalizedWrapper = normalizeQuestionBankItem(rawDoc, targetTaskType);
          const contentToCheck = normalizedWrapper?.content || normalizedWrapper;

          if (
            contentToCheck &&
            targetTaskType &&
            counts[targetTaskType] !== undefined &&
            validateNormalizedTask(targetTaskType, contentToCheck) &&
            isHighQualityTask(contentToCheck, targetTaskType)
          ) {
            const qId = String(docSnap.id);
            const innerId = String(contentToCheck.id || '');
            const validLevel = normalizeDifficultyLabel(
              rawDoc.level || contentToCheck.level
            );
            const validTopic = normalizeTopicLabel(
              rawDoc.topic || contentToCheck.topic,
              contentToCheck
            );

            const enrichedContent = {
              ...contentToCheck,
              id: contentToCheck.id || qId,
              questionDocId: qId,
              taskType: targetTaskType,
              level: validLevel,
              difficulty: validLevel,
              topic: validTopic,
              schemaVersion: CURRENT_BANK_SCHEMA_VERSION,
            };

            const sig = getQuestionContentSignature(targetTaskType, enrichedContent);
            if (
              seenSignatures.has(sig) ||
              seenIds.has(qId) ||
              (innerId && seenIds.has(innerId))
            ) {
              return;
            }

            seenSignatures.add(sig);
            seenIds.add(qId);
            if (innerId) seenIds.add(innerId);

            tempCache[targetTaskType].push(enrichedContent);
            counts[targetTaskType] = (counts[targetTaskType] || 0) + 1;
            totalQuestions++;

            questionsToStore.push({
              id: qId,
              taskType: targetTaskType,
              level: validLevel,
              topic: validTopic,
              content: enrichedContent,
              isCurated: false,
              schemaVersion: CURRENT_BANK_SCHEMA_VERSION,
              updatedAt: Date.now(),
            });
          }
        });
      }
    }
  } catch (firestoreErr) {
    console.warn('Failed to sync questions from Firestore into local bank:', firestoreErr);
  }

  // 3. Preserve any locally generated AI questions in IndexedDB that match CURRENT_BANK_SCHEMA_VERSION
  try {
    const dbInstance = await openIndexedDB();
    const existingRows = await new Promise<any[]>((resolve) => {
      const tx = dbInstance.transaction('toefl_question_bank', 'readonly');
      const store = tx.objectStore('toefl_question_bank');
      const req = store.getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => resolve([]);
    });

    for (const row of existingRows) {
      const rowSchema = row.schemaVersion ?? row.content?.schemaVersion;
      if (rowSchema !== CURRENT_BANK_SCHEMA_VERSION) continue;
      const rowType = canonicalizeTaskType(row.taskType);
      const rawRowContent = row.content || row;
      const normalizedWrapper = normalizeQuestionBankItem(rawRowContent, rowType);
      const rowContent = normalizedWrapper?.content || normalizedWrapper;
      if (
        rowType &&
        counts[rowType] !== undefined &&
        rowContent &&
        validateNormalizedTask(rowType, rowContent) &&
        isHighQualityTask(rowContent, rowType)
      ) {
        const qId = String(row.id || rowContent.id || '');
        const validLevel = normalizeDifficultyLabel(row.level || rowContent.level);
        const validTopic = normalizeTopicLabel(row.topic || rowContent.topic, rowContent);
        const enrichedContent = {
          ...rowContent,
          id: rowContent.id || qId,
          taskType: rowType,
          level: validLevel,
          difficulty: validLevel,
          topic: validTopic,
          schemaVersion: CURRENT_BANK_SCHEMA_VERSION,
        };
        const sig = getQuestionContentSignature(rowType, enrichedContent);
        if (!seenSignatures.has(sig) && (!qId || !seenIds.has(qId))) {
          seenSignatures.add(sig);
          if (qId) seenIds.add(qId);
          tempCache[rowType].push(enrichedContent);
          counts[rowType] = (counts[rowType] || 0) + 1;
          totalQuestions++;
          questionsToStore.push({
            id: qId || `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            taskType: rowType,
            level: validLevel,
            topic: validTopic,
            content: enrichedContent,
            isCurated: Boolean(row.isCurated),
            schemaVersion: CURRENT_BANK_SCHEMA_VERSION,
            updatedAt: row.updatedAt || Date.now(),
          });
        }
      }
    }

    if (questionsToStore.length > 0) {
      const tx = dbInstance.transaction('toefl_question_bank', 'readwrite');
      const store = tx.objectStore('toefl_question_bank');
      store.clear();
      for (const q of questionsToStore) {
        store.put(q);
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    }
  } catch (idbErr) {
    console.warn('Failed to commit deduplicated questions to IndexedDB:', idbErr);
  }

  // Update in-memory cache atomically
  for (const tId of CANONICAL_TASK_IDS) {
    curatedMemoryCache[tId] = tempCache[tId] || [];
  }

  // Trigger background sync of any missing local/curated questions to Firestore
  syncLocalQuestionsToFirestore().catch((err) => {
    console.warn('Background Firestore question sync skipped:', err);
  });

  return {
    totalQuestions,
    totalCurated,
    counts,
    countsPerTaskType: counts,
  };
}

let isSyncingToFirestore = false;

/**
 * Syncs all deduplicated questions from in-memory cache and IndexedDB to the Firestore 'questions' collection
 * if they are not already present in Firestore.
 */
export async function syncLocalQuestionsToFirestore(): Promise<{
  synced: number;
  existing: number;
}> {
  if (isSyncingToFirestore || !db) {
    return { synced: 0, existing: 0 };
  }
  isSyncingToFirestore = true;

  let synced = 0;
  let existing = 0;

  try {
    await ensureAuthenticated();

    const existingIds = new Set<string>();
    const existingSigs = new Set<string>();
    const existingHashes = new Set<string>();

    const snap = await getDocs(collection(db, 'questions'));
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      const docSchema = d?.schemaVersion ?? d?.content?.schemaVersion;
      if (docSchema !== CURRENT_BANK_SCHEMA_VERSION) return;
      existing++;
      existingIds.add(docSnap.id);
      if (d?.contentHash) existingHashes.add(String(d.contentHash));
      const tType = canonicalizeTaskType(d?.taskType || d?.type || 'academic-discussion');
      const sig = getQuestionContentSignature(tType, d?.content || d);
      existingSigs.add(sig);
    });

    // Gather all candidate questions from memory and IndexedDB
    const candidates: Array<{
      id: string;
      taskType: string;
      level: Level;
      topic: AcademicTopic;
      content: any;
      source: string;
    }> = [];

    for (const tId of CANONICAL_TASK_IDS) {
      const list = curatedMemoryCache[tId] || [];
      for (const item of list) {
        if (!isHighQualityTask(item, tId)) continue;
        const qId = String(item.id || '');
        const validLevel = normalizeDifficultyLabel(item.level || item.difficulty);
        const validTopic = normalizeTopicLabel(item.topic || item.category, item);
        candidates.push({
          id: qId,
          taskType: tId,
          level: validLevel,
          topic: validTopic,
          content: item,
          source: item.source || 'curated',
        });
      }
    }

    const toWrite: Array<{ docId: string; record: SharedQuestionRecord }> = [];

    for (const cand of candidates) {
      const sig = getQuestionContentSignature(cand.taskType, cand.content);
      const contentHash = await computeContentHash(cand.taskType, cand.content);
      const docId =
        cand.id && cand.id.startsWith('q_')
          ? cand.id
          : `q_${contentHash.slice(0, 24)}`;

      if (
        existingIds.has(docId) ||
        (cand.id && existingIds.has(cand.id)) ||
        existingHashes.has(contentHash) ||
        existingSigs.has(sig)
      ) {
        continue;
      }

      existingIds.add(docId);
      existingHashes.add(contentHash);
      existingSigs.add(sig);

      const enrichedContent = {
        ...cand.content,
        id: cand.content.id || docId,
        level: cand.level,
        topic: cand.topic,
        source: cand.source,
        schemaVersion: CURRENT_BANK_SCHEMA_VERSION,
        generatedBy: cand.content.generatedBy || getScholarUsername(),
        createdAt: cand.content.createdAt || Date.now(),
      };

      const rawAudioUrl = cand.content.audioUrl || null;
      const rawAudioClips = cand.content.audioClips || null;
      const cleanAudioUrl = isValidBlobUrl(rawAudioUrl) ? rawAudioUrl : null;
      const cleanAudioClips = Array.isArray(rawAudioClips)
        ? rawAudioClips.filter((c: any) => isValidBlobUrl(c?.url)).slice(0, 10)
        : null;

      toWrite.push({
        docId,
        record: {
          id: docId,
          taskType: cand.taskType,
          level: cand.level,
          topic: cand.topic,
          content: enrichedContent,
          contentHash,
          audioUrl: cleanAudioUrl,
          audioClips: cleanAudioClips && cleanAudioClips.length > 0 ? cleanAudioClips : null,
          source: cand.source,
          schemaVersion: CURRENT_BANK_SCHEMA_VERSION,
          generatedBy: enrichedContent.generatedBy,
          createdAt: serverTimestamp(),
          createdBy: auth?.currentUser?.uid || 'anonymous',
          useCount: 0,
          reportCount: 0,
        },
      });
    }

    const BATCH_LIMIT = 100;
    for (let i = 0; i < toWrite.length; i += BATCH_LIMIT) {
      const slice = toWrite.slice(i, i + BATCH_LIMIT);
      const batch = writeBatch(db);
      for (const item of slice) {
        batch.set(doc(db, 'questions', item.docId), item.record, { merge: true });
      }
      await batch.commit();
      synced += slice.length;
    }
  } catch (err) {
    console.warn('Error in syncLocalQuestionsToFirestore:', err);
  } finally {
    isSyncingToFirestore = false;
  }

  return { synced, existing };
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
 * Re-Sync All Shards: Pulls all static JSON shards AND all global Firestore questions,
 * merges everything into IndexedDB and in-memory cache, and returns the updated stats.
 */
export async function reSyncAllShards(): Promise<QuestionBankSyncResult> {
  return syncCuratedQuestionBank();
}

/**
 * Get deduplicated question bank counts across all 8 canonical TOEFL sections.
 * Guarantees that totalQuestions === sum(Object.values(countsPerTaskType)).
 */
export async function getQuestionBankStats(): Promise<{
  totalQuestions: number;
  totalCurated: number;
  countsPerTaskType: Record<string, number>;
}> {
  const counts: Record<string, number> = {};
  for (const tId of CANONICAL_TASK_IDS) {
    counts[tId] = 0;
  }

  // 1. If in-memory cache is already populated across all 8 canonical task types, compute from deduplicated memory
  const memTotal = CANONICAL_TASK_IDS.reduce(
    (sum, tId) => sum + (curatedMemoryCache[tId]?.length || 0),
    0
  );

  // 2. Read all distinct questions from IndexedDB and deduplicate by signature
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
      const seenSigs = new Set<string>();
      const seenIds = new Set<string>();
      let curatedTotal = 0;

      for (const item of all) {
        const itemSchema = item.schemaVersion ?? item.content?.schemaVersion;
        if (itemSchema !== CURRENT_BANK_SCHEMA_VERSION) continue;
        const tType = canonicalizeTaskType(item.taskType);
        const contentObj = item.content || item;
        if (tType && counts[tType] !== undefined && contentObj) {
          const qId = String(item.id || contentObj.id || '');
          const sig = getQuestionContentSignature(tType, contentObj);
          if (seenSigs.has(sig) || (qId && seenIds.has(qId))) {
            continue;
          }
          seenSigs.add(sig);
          if (qId) seenIds.add(qId);
          counts[tType] = (counts[tType] || 0) + 1;
          if (item.isCurated) curatedTotal++;
        }
      }

      const totalQuestions = Object.values(counts).reduce((a, b) => a + b, 0);
      if (totalQuestions > 0) {
        return {
          totalQuestions,
          totalCurated: curatedTotal || totalQuestions,
          countsPerTaskType: counts,
        };
      }
    }
  } catch {}

  if (memTotal > 0) {
    for (const tId of CANONICAL_TASK_IDS) {
      counts[tId] = (curatedMemoryCache[tId] || []).length;
    }
    const totalQuestions = Object.values(counts).reduce((a, b) => a + b, 0);
    return {
      totalQuestions,
      totalCurated: totalQuestions,
      countsPerTaskType: counts,
    };
  }

  // If cache is cold and IDB empty, run full sync
  const syncRes = await syncCuratedQuestionBank();
  return {
    totalQuestions: syncRes.totalQuestions,
    totalCurated: syncRes.totalCurated,
    countsPerTaskType: syncRes.countsPerTaskType,
  };
}

export async function getTaskBankCounts(): Promise<Record<string, number>> {
  const stats = await getQuestionBankStats();
  return stats.countsPerTaskType;
}

export async function getGlobalBankCount(): Promise<number> {
  const stats = await getQuestionBankStats();
  return stats.totalQuestions;
}

export async function getSharedQuestions(
  taskType?: string,
  difficulty?: string,
  topic?: string
): Promise<any[]> {
  await getQuestionBankStats();
  const targetTypes = taskType ? [canonicalizeTaskType(taskType)] : CANONICAL_TASK_IDS;
  const results: any[] = [];
  const seenSigs = new Set<string>();

  for (const tId of targetTypes) {
    const items = curatedMemoryCache[tId] || [];
    for (const item of items) {
      if (!matchesLevelFilter(item, difficulty)) continue;
      if (!matchesTopicFilter(item, topic)) continue;
      const sig = getQuestionContentSignature(tId, item);
      if (seenSigs.has(sig)) continue;
      seenSigs.add(sig);
      results.push(item);
    }
  }

  return results;
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
  for (const shard of SHARD_FILES) {
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
  const canonicalType = canonicalizeTaskType(taskType);
  const mainText =
    content.passage ||
    content.text ||
    content.script ||
    content.situation ||
    content.professorPrompt ||
    (Array.isArray(content.sentences) ? content.sentences.join(' ') : '') ||
    (Array.isArray(content.questions)
      ? content.questions.map((q: any) => q.question || q.q).join(' ')
      : '') ||
    (Array.isArray(content.items)
      ? content.items.map((i: any) => i.answer || i.context).join(' ')
      : '') ||
    JSON.stringify(content);

  const cleanSample = `${canonicalType}:::${mainText.trim().toLowerCase()}`;

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
  schemaVersion?: number | string;
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
  const canonicalType = canonicalizeTaskType(params.taskType);
  const {
    audioUrl = null,
    audioClips = null,
    source = 'ai',
    generatedBy = getScholarUsername(),
  } = params;

  const normalizedWrapper = normalizeQuestionBankItem(params.content, canonicalType);
  const content = normalizedWrapper?.content || normalizedWrapper;
  if (!content || !validateNormalizedTask(canonicalType, content)) {
    return null;
  }

  const validatedLevel: Level = normalizeDifficultyLabel(params.level || content?.level);
  const validatedTopic: AcademicTopic = normalizeTopicLabel(
    params.topic || content?.topic,
    content
  );

  const contentHash = await computeContentHash(canonicalType, content);

  const cleanAudioUrl = isValidBlobUrl(audioUrl) ? audioUrl : null;
  const cleanAudioClips = Array.isArray(audioClips)
    ? audioClips.filter((c) => isValidBlobUrl(c.url)).slice(0, 10)
    : null;

  const docId = `q_${contentHash.slice(0, 24)}`;
  const enrichedContent = {
    ...content,
    id: content.id || docId,
    level: validatedLevel,
    difficulty: validatedLevel,
    topic: validatedTopic,
    source,
    schemaVersion: CURRENT_BANK_SCHEMA_VERSION,
    generatedBy: generatedBy || getScholarUsername(),
    createdAt: content.createdAt || Date.now(),
  };

  try {
    await ensureAuthenticated();

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
    const docRef = doc(db, 'questions', docId);

    const record: SharedQuestionRecord = {
      id: docId,
      taskType: canonicalType,
      level: validatedLevel,
      topic: validatedTopic,
      content: enrichedContent,
      contentHash,
      audioUrl: cleanAudioUrl,
      audioClips: cleanAudioClips && cleanAudioClips.length > 0 ? cleanAudioClips : null,
      source,
      schemaVersion: CURRENT_BANK_SCHEMA_VERSION,
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

export const saveQuestionToSharedBank = saveQuestionToBank;

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
      const serverSeen: string[] = Array.isArray(data.seenQuestionIds)
        ? data.seenQuestionIds
        : [];
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
  const normalizedLvl = level && level !== 'all' ? normalizeDifficultyLabel(level) : undefined;
  const normalizedTop =
    topic && topic !== 'all' && topic !== 'general' ? normalizeTopicLabel(topic) : undefined;

  const isLevelConcrete = Boolean(normalizedLvl && isValidLevel(normalizedLvl));
  const isTopicConcrete = Boolean(normalizedTop && isValidAcademicTopic(normalizedTop));

  if (isLevelConcrete && isTopicConcrete) {
    return [
      { tier: 'exact', level: normalizedLvl, topic: normalizedTop },
      { tier: 'topic-only', topic: normalizedTop },
      { tier: 'level-only', level: normalizedLvl },
      { tier: 'any' },
    ];
  } else if (isLevelConcrete) {
    return [{ tier: 'exact', level: normalizedLvl }, { tier: 'any' }];
  } else if (isTopicConcrete) {
    return [{ tier: 'exact', topic: normalizedTop }, { tier: 'any' }];
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
  const canonicalTarget = taskType ? canonicalizeTaskType(taskType) : undefined;

  for (const tierConfig of tiers) {
    const matched = bank.filter((item) => {
      if (canonicalTarget && canonicalizeTaskType(item.taskType) !== canonicalTarget) {
        return false;
      }
      if ((item.reportCount || 0) >= 3) return false;
      const itemId = item.id || (item as any).questionDocId;
      if (itemId && seenIds.includes(itemId)) return false;

      if (tierConfig.level && !matchesLevelFilter(item, tierConfig.level)) return false;
      if (tierConfig.topic && !matchesTopicFilter(item, tierConfig.topic)) return false;

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
  const canonicalType = canonicalizeTaskType(taskType);
  try {
    const currentUid = auth?.currentUser?.uid;
    const seenIds = await getUserSeenQuestionIds(currentUid);
    const tiers = getQueryTiers(level, topic);

    for (const tierConfig of tiers) {
      let q = query(collection(db, 'questions'), where('taskType', '==', canonicalType));
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

        // 0. Skip legacy pre-schemaVersion documents
        const docSchema = data.schemaVersion ?? data.content?.schemaVersion;
        if (docSchema !== CURRENT_BANK_SCHEMA_VERSION) {
          continue;
        }

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
            activeTopic = normalizeTopicLabel(data.topic, data.content || data);
            updates.topic = activeTopic;
          }
          if (!isLevelValid) {
            activeLevel = normalizeDifficultyLabel(data.level || data.content?.level);
            updates.level = activeLevel;
          }
          updateDoc(doc(db, 'questions', docSnap.id), updates).catch((err) => {
            console.warn(`Lazy backfill update failed for ${docSnap.id}:`, err);
          });
        }

        const normalizedWrapper = normalizeQuestionBankItem(data.content || data, canonicalType);
        const normalizedDataContent = normalizedWrapper?.content || normalizedWrapper;
        if (!normalizedDataContent || !validateNormalizedTask(canonicalType, normalizedDataContent)) {
          continue;
        }

        // 4. Mark usage and update userProgress
        updateDoc(doc(db, 'questions', docSnap.id), {
          useCount: increment(1),
        }).catch(() => {});

        markQuestionAsSeen(docSnap.id, currentUid).catch(() => {});

        return {
          question: {
            ...normalizedDataContent,
            id: docSnap.id,
            questionDocId: docSnap.id,
            taskType: canonicalType,
            level: activeLevel,
            difficulty: activeLevel,
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
  const canonicalType = canonicalizeTaskType(taskType);
  try {
    const seenIds = await getUserSeenQuestionIds();
    let q = query(collection(db, 'questions'), where('taskType', '==', canonicalType));
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
      const docSchema = data.schemaVersion ?? data.content?.schemaVersion;
      if (
        docSchema === CURRENT_BANK_SCHEMA_VERSION &&
        (data.reportCount || 0) < 3 &&
        !seenIds.includes(d.id)
      ) {
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

  const canonicalType = canonicalizeTaskType(taskType);
  const count = await getUnseenQuestionCount(canonicalType, level, topic);
  if (count >= 5) return;

  // Determine concrete level (never 'all')
  const concreteLevel: Level =
    level !== 'all' && isValidLevel(level) ? level : 'intermediate';

  // Determine concrete topic (never 'all' or 'general'): pick topic with fewest unseen questions
  let concreteTopic: AcademicTopic = 'campus-life';
  if (topic !== 'all' && isValidAcademicTopic(topic)) {
    concreteTopic = topic;
  } else {
    try {
      let minCount = Infinity;
      for (const candTopic of ACADEMIC_TOPICS) {
        const unseenForTopic = await getUnseenQuestionCount(
          canonicalType,
          concreteLevel,
          candTopic
        );
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
  window.dispatchEvent(
    new CustomEvent('toefl_prefetch_status', { detail: { isPrefetching: true } })
  );

  try {
    const items = await generateBatchFn(canonicalType, concreteLevel, concreteTopic);

    // Process items with max concurrency of 2
    const chunkLimit = 2;
    for (let i = 0; i < items.length; i += chunkLimit) {
      const chunk = items.slice(i, i + chunkLimit);
      await Promise.all(
        chunk.map(async (item) => {
          let audioUrl: string | null = null;
          let audioClips: Array<{ speaker: string; url: string }> | null = null;

          if (canonicalType === 'listening-dialogue' || canonicalType === 'listen-repeat') {
            try {
              const authHdrs = await getAuthHeaders();
              const headers = { ...getApiHeaders(), ...authHdrs };

              if (
                canonicalType === 'listening-dialogue' &&
                Array.isArray(item.turns) &&
                item.turns.length > 0
              ) {
                audioClips = [];
                const voiceManager = new DialogueVoiceManager();
                for (let tIdx = 0; tIdx < item.turns.length; tIdx++) {
                  const turn = item.turns[tIdx];
                  const rawText = turn.text || '';
                  const parsed = parseDialogueLine(rawText);
                  if (!parsed.spokenText) continue;

                  const speaker =
                    parsed.speakerName ||
                    turn.speaker ||
                    (tIdx % 2 === 0 ? 'Speaker A' : 'Speaker B');
                  const voiceName = voiceManager.getVoiceForSpeaker(
                    speaker,
                    parsed.speakerHint
                  );

                  try {
                    const ttsRes = await fetch('/api/tts', {
                      method: 'POST',
                      headers,
                      body: JSON.stringify({
                        text: parsed.spokenText,
                        voiceName,
                        speaker,
                      }),
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
              } else if (
                canonicalType === 'listen-repeat' &&
                Array.isArray(item.sentences) &&
                item.sentences.length > 0
              ) {
                audioClips = [];
                for (const sentence of item.sentences) {
                  const cleanSentence = stripSpeakerAndFormatting(sentence || '');
                  if (!cleanSentence) continue;
                  try {
                    const ttsRes = await fetch('/api/tts', {
                      method: 'POST',
                      headers,
                      body: JSON.stringify({
                        text: cleanSentence,
                        voiceName: 'en-US-JennyNeural',
                        speaker: 'Narrator',
                      }),
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
                const textToSpeak = stripSpeakerAndFormatting(
                  item.script ||
                    (Array.isArray(item.sentences) ? item.sentences.join(' ') : '')
                );
                if (textToSpeak) {
                  const ttsRes = await fetch('/api/tts', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                      text: textToSpeak,
                      voiceName:
                        item.speakerGender === 'female'
                          ? 'en-US-JennyNeural'
                          : 'en-US-GuyNeural',
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
            taskType: canonicalType,
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
    window.dispatchEvent(
      new CustomEvent('toefl_prefetch_status', { detail: { isPrefetching: false } })
    );
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
          updates.topic = normalizeTopicLabel(data.topic, data.content || data);
        }
        if (!isLevelValid) {
          updates.level = normalizeDifficultyLabel(data.level || data.content?.level);
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
    const stats = await getQuestionBankStats();
    for (const [taskType, count] of Object.entries(stats.countsPerTaskType)) {
      const section = getSectionForTaskType(taskType);
      if (section && counts[section] !== undefined) {
        counts[section] += count;
      }
    }
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

export async function seedDefaultQuestionsToFirestore(): Promise<{
  created: number;
  skipped: number;
  failed: number;
}> {
  const report = { created: 0, skipped: 0, failed: 0 };
  await ensureAuthenticated();

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
    CURATED_READING_PASSAGES?.forEach((p) =>
      seedList.push({ taskType: 'reading-passage', data: p })
    );
    CURATED_LISTENING?.forEach((l) =>
      seedList.push({ taskType: 'listening-dialogue', data: l })
    );
    CURATED_LISTEN_REPEAT?.forEach((l) =>
      seedList.push({ taskType: 'listen-repeat', data: l })
    );
    CURATED_SPEAKING_INTERVIEWS?.forEach((s) =>
      seedList.push({ taskType: 'speaking-interview', data: s })
    );
    CURATED_BUILD_SENTENCES?.forEach((b) =>
      seedList.push({ taskType: 'build-sentence', data: b })
    );
    CURATED_COMPLETE_WORDS?.forEach((c) =>
      seedList.push({ taskType: 'complete-words', data: c })
    );
    CURATED_WRITE_EMAILS?.forEach((w) =>
      seedList.push({ taskType: 'write-email', data: w })
    );
    CURATED_ACADEMIC_DISCUSSIONS?.forEach((a) =>
      seedList.push({ taskType: 'academic-discussion', data: a })
    );

    for (const item of seedList) {
      try {
        const itemLevel = normalizeDifficultyLabel(item.data.level);
        const itemTopic = normalizeTopicLabel(item.data.topic, item.data);

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
  const itemLevel = normalizeDifficultyLabel(params.level || params.data?.level);
  const itemTopic = normalizeTopicLabel(
    params.topic || params.data?.topic,
    params.data
  );

  return saveQuestionToBank({
    taskType: params.taskType,
    level: itemLevel,
    topic: itemTopic,
    content: params.data,
    audioUrl: params.audioUrl,
  }).then((id) => id || `local_${Date.now()}`);
}
