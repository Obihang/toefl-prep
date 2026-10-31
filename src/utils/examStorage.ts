import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { db, ensureAuthenticated } from '../firebase';
import { openIndexedDB } from './questionBankStorage';
import { callBackendGenerate } from '../services/geminiService';
import { normalizeTaskData } from './taskNormalizer';
import {
  CURATED_MOCK_EXAM_SETS,
  MockExamSet,
  MockExamReadingModule,
  MockExamListeningModule,
  MockExamWritingModule,
  MockExamSpeakingModule,
} from './mockExamSetsBank';

const IDB_STORE_MOCK_SETS = 'toefl_mock_sets';
const FIRESTORE_COLLECTION_MOCK_SETS = 'mock_exam_sets';
const MOCK_SET_SCORES_STORAGE_KEY = 'toefl_mock_set_scores_v1';

export interface MockSetAttemptReport {
  sectionScores: Record<'Reading' | 'Listening' | 'Writing' | 'Speaking', number>;
  readingTrack: 'higher' | 'standard';
  listeningTrack: 'higher' | 'standard';
  completedAt: number;
  totalScore120: number;
  overallBand6: number;
  cefrCode: string;
  cefrName: string;
}

export interface MockSetScoreSummary {
  setId: string;
  bestScore120: number;
  bestBand6: number;
  bestCefr: string;
  attemptsCount: number;
  lastReport: MockSetAttemptReport;
}

function getAllMockSetsFromIDB(): Promise<MockExamSet[]> {
  return new Promise(async (resolve) => {
    try {
      const idb = await openIndexedDB();
      if (!idb.objectStoreNames.contains(IDB_STORE_MOCK_SETS)) {
        resolve([]);
        return;
      }
      const tx = idb.transaction(IDB_STORE_MOCK_SETS, 'readonly');
      const store = tx.objectStore(IDB_STORE_MOCK_SETS);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as MockExamSet[]) || []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

function putMockSetsToIDB(sets: MockExamSet[]): Promise<void> {
  if (!sets.length) return Promise.resolve();
  return new Promise(async (resolve) => {
    try {
      const idb = await openIndexedDB();
      if (!idb.objectStoreNames.contains(IDB_STORE_MOCK_SETS)) {
        resolve();
        return;
      }
      const tx = idb.transaction(IDB_STORE_MOCK_SETS, 'readwrite');
      const store = tx.objectStore(IDB_STORE_MOCK_SETS);
      for (const s of sets) {
        if (s && s.id) {
          store.put(s);
        }
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function sortMockExamSets(sets: MockExamSet[]): MockExamSet[] {
  const curatedOrder: Record<string, number> = {
    mock_set_1: 1,
    mock_set_2: 2,
    mock_set_3: 3,
  };
  return [...sets].sort((a, b) => {
    const orderA = curatedOrder[a.id] ?? 999;
    const orderB = curatedOrder[b.id] ?? 999;
    if (orderA !== orderB) return orderA - orderB;
    return (a.createdAt || 0) - (b.createdAt || 0);
  });
}

/**
 * Saves a single MockExamSet permanently to IndexedDB (`toefl_mock_sets`)
 * and Firestore (`mock_exam_sets` collection).
 */
export async function saveMockExamSetToDb(mockSet: MockExamSet): Promise<void> {
  await putMockSetsToIDB([mockSet]);

  if (db) {
    try {
      const uid = await ensureAuthenticated();
      if (uid) {
        await setDoc(
          doc(db, FIRESTORE_COLLECTION_MOCK_SETS, mockSet.id),
          {
            id: mockSet.id,
            title: mockSet.title,
            source: mockSet.source,
            createdAt: mockSet.createdAt || Date.now(),
            modules: JSON.parse(JSON.stringify(mockSet.modules)),
          },
          { merge: true }
        );
      }
    } catch (err) {
      console.warn('[examStorage] Failed to sync MockExamSet to Firestore:', err);
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('toefl_mock_sets_updated'));
  }
}

/**
 * Seeds the 3 built-in Official-Style Full Mock Exam Sets into IndexedDB & Firestore if missing,
 * merges with any AI-generated Full Mock Exam Sets in IndexedDB & Firestore, and returns all sets sorted.
 */
export async function syncAndGetMockExamSets(): Promise<MockExamSet[]> {
  const mergedMap = new Map<string, MockExamSet>();

  // 1. Always include the 3 curated sets as baseline
  for (const curated of CURATED_MOCK_EXAM_SETS) {
    mergedMap.set(curated.id, curated);
  }

  // 2. Load from IndexedDB
  try {
    const idbSets = await getAllMockSetsFromIDB();
    for (const s of idbSets) {
      if (s && s.id && s.modules) {
        // Keep curated sets fresh with latest code definitions while preserving AI sets
        if (!mergedMap.has(s.id)) {
          mergedMap.set(s.id, s);
        }
      }
    }
  } catch (err) {
    console.warn('[examStorage] Error reading IDB mock sets:', err);
  }

  // 3. Load from Firestore `mock_exam_sets` & seed missing curated sets
  if (db) {
    try {
      const snap = await getDocs(collection(db, FIRESTORE_COLLECTION_MOCK_SETS));
      const remoteIds = new Set<string>();
      snap.forEach((docSnap) => {
        const data = docSnap.data() as MockExamSet;
        if (data && data.id && data.modules) {
          remoteIds.add(data.id);
          if (!mergedMap.has(data.id)) {
            mergedMap.set(data.id, data);
          }
        }
      });

      // Seed any curated mock sets not yet in Firestore (non-blocking)
      const missingCurated = CURATED_MOCK_EXAM_SETS.filter((c) => !remoteIds.has(c.id));
      if (missingCurated.length > 0) {
        ensureAuthenticated()
          .then(async (uid) => {
            if (!uid || !db) return;
            for (const c of missingCurated) {
              try {
                await setDoc(
                  doc(db, FIRESTORE_COLLECTION_MOCK_SETS, c.id),
                  {
                    id: c.id,
                    title: c.title,
                    source: c.source,
                    createdAt: c.createdAt,
                    modules: JSON.parse(JSON.stringify(c.modules)),
                  },
                  { merge: true }
                );
              } catch {}
            }
          })
          .catch(() => {});
      }
    } catch (err) {
      console.warn('[examStorage] Error syncing Firestore mock_exam_sets:', err);
    }
  }

  const allSets = sortMockExamSets(Array.from(mergedMap.values()));
  await putMockSetsToIDB(allSets);
  return allSets;
}

/**
 * Returns the total number of Full Mock Exam Sets stored in the database.
 */
export async function getMockExamSetsCount(): Promise<number> {
  try {
    const sets = await syncAndGetMockExamSets();
    return sets.length;
  } catch {
    return CURATED_MOCK_EXAM_SETS.length;
  }
}

async function generateSingleTaskWithFallback<T>(
  taskTypeId: string,
  level: string,
  topic: string,
  fallbackTask: T,
  idPrefix: string
): Promise<T> {
  try {
    const resp = await callBackendGenerate(taskTypeId, level, topic, 'exam');
    if (resp && resp.success && resp.data && !resp.data.isFallback) {
      const normalized = normalizeTaskData(resp.data, taskTypeId) as any;
      normalized.id = `${idPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      return normalized as T;
    }
  } catch (err) {
    console.warn(`[examStorage] AI generation fallback for ${taskTypeId}:`, err);
  }
  const cloned = JSON.parse(JSON.stringify(fallbackTask));
  cloned.id = `${idPrefix}_fb_${Date.now()}`;
  return normalizeTaskData(cloned, taskTypeId) as T;
}

/**
 * Generates a complete, self-contained Full Mock Exam Set via AI across all modules:
 * - Reading Module 1 (Routing)
 * - Reading Module 2 Hard (Upper-Tier Adaptive)
 * - Reading Module 2 Easy (Standard-Tier Adaptive)
 * - Listening Module 1 (Routing)
 * - Listening Module 2 Hard (Upper-Tier Adaptive)
 * - Listening Module 2 Easy (Standard-Tier Adaptive)
 * - Writing (Build a Sentence, Write an Email, Academic Discussion)
 * - Speaking (Listen & Repeat, Take an Interview)
 * Saves the newly created set permanently to IndexedDB (`toefl_mock_sets`) and Firestore (`mock_exam_sets`).
 */
export async function generateAndSaveNewAiMockExamSet(
  nextSetNumber: number,
  onProgress?: (stageText: string, step: number, total: number) => void
): Promise<MockExamSet> {
  const totalSteps = 26;
  let currentStep = 0;
  const fallbackTemplate =
    CURATED_MOCK_EXAM_SETS[(nextSetNumber - 1) % CURATED_MOCK_EXAM_SETS.length] || CURATED_MOCK_EXAM_SETS[0];
  const setId = `mock_ai_${Date.now()}`;

  const bump = (msg: string) => {
    currentStep++;
    onProgress?.(msg, currentStep, totalSteps);
  };

  // 1. Reading Module 1 (Routing Stage)
  bump('Generating Reading Module 1 (Complete the Words)...');
  const rM1Cw = await generateSingleTaskWithFallback(
    'complete-words',
    'intermediate',
    'science-tech',
    fallbackTemplate.modules.readingModule1.completeWords,
    `${setId}_cw_m1`
  );
  bump('Generating Reading Module 1 (Read in Daily Life)...');
  const rM1Dl = await generateSingleTaskWithFallback(
    'daily-life',
    'intermediate',
    'campus-life',
    fallbackTemplate.modules.readingModule1.dailyLife,
    `${setId}_dl_m1`
  );
  bump('Generating Reading Module 1 (Academic Passage)...');
  const rM1Rp = await generateSingleTaskWithFallback(
    'reading-academic',
    'upper-intermediate',
    'natural-sciences',
    fallbackTemplate.modules.readingModule1.readingPassage,
    `${setId}_rp_m1`
  );

  const readingModule1: MockExamReadingModule = {
    completeWords: rM1Cw,
    dailyLife: rM1Dl,
    readingPassage: rM1Rp,
  };

  // 2. Reading Module 2 Hard (Higher-Tier Adaptive)
  bump('Generating Reading Module 2 Hard (Complete the Words)...');
  const rM2HCw = await generateSingleTaskWithFallback(
    'complete-words',
    'advanced',
    'natural-sciences',
    fallbackTemplate.modules.readingModule2Hard.completeWords,
    `${setId}_cw_m2h`
  );
  bump('Generating Reading Module 2 Hard (Read in Daily Life)...');
  const rM2HDl = await generateSingleTaskWithFallback(
    'daily-life',
    'advanced',
    'campus-life',
    fallbackTemplate.modules.readingModule2Hard.dailyLife,
    `${setId}_dl_m2h`
  );
  bump('Generating Reading Module 2 Hard (Academic Passage)...');
  const rM2HRp = await generateSingleTaskWithFallback(
    'reading-academic',
    'advanced',
    'social-sciences',
    fallbackTemplate.modules.readingModule2Hard.readingPassage,
    `${setId}_rp_m2h`
  );

  const readingModule2Hard: MockExamReadingModule = {
    completeWords: rM2HCw,
    dailyLife: rM2HDl,
    readingPassage: rM2HRp,
  };

  // 3. Reading Module 2 Easy (Standard-Tier Adaptive)
  bump('Generating Reading Module 2 Standard (Complete the Words)...');
  const rM2ECw = await generateSingleTaskWithFallback(
    'complete-words',
    'intermediate',
    'environment',
    fallbackTemplate.modules.readingModule2Easy.completeWords,
    `${setId}_cw_m2e`
  );
  bump('Generating Reading Module 2 Standard (Read in Daily Life)...');
  const rM2EDl = await generateSingleTaskWithFallback(
    'daily-life',
    'intermediate',
    'campus-life',
    fallbackTemplate.modules.readingModule2Easy.dailyLife,
    `${setId}_dl_m2e`
  );
  bump('Generating Reading Module 2 Standard (Academic Passage)...');
  const rM2ERp = await generateSingleTaskWithFallback(
    'reading-academic',
    'intermediate',
    'arts-humanities',
    fallbackTemplate.modules.readingModule2Easy.readingPassage,
    `${setId}_rp_m2e`
  );

  const readingModule2Easy: MockExamReadingModule = {
    completeWords: rM2ECw,
    dailyLife: rM2EDl,
    readingPassage: rM2ERp,
  };

  // 4. Listening Module 1 (Routing Stage)
  bump('Generating Listening Module 1 (Choose a Response)...');
  const lM1Cr = await generateSingleTaskWithFallback(
    'listening-choose-response',
    'intermediate',
    'campus-life',
    fallbackTemplate.modules.listeningModule1.chooseResponse,
    `${setId}_lcr_m1`
  );
  bump('Generating Listening Module 1 (Campus Conversation)...');
  const lM1Conv = await generateSingleTaskWithFallback(
    'listening-dialogue',
    'intermediate',
    'campus-life',
    fallbackTemplate.modules.listeningModule1.conversation,
    `${setId}_ld_m1`
  );
  bump('Generating Listening Module 1 (Campus Announcement)...');
  const lM1Ann = await generateSingleTaskWithFallback(
    'listening-announcement',
    'intermediate',
    'campus-life',
    fallbackTemplate.modules.listeningModule1.announcement,
    `${setId}_la_m1`
  );
  bump('Generating Listening Module 1 (Academic Talk)...');
  const lM1Talk = await generateSingleTaskWithFallback(
    'listening-academic-talk',
    'upper-intermediate',
    'natural-sciences',
    fallbackTemplate.modules.listeningModule1.academicTalk,
    `${setId}_lat_m1`
  );

  const listeningModule1: MockExamListeningModule = {
    chooseResponse: lM1Cr,
    conversation: lM1Conv,
    announcement: lM1Ann,
    academicTalk: lM1Talk,
  };

  // 5. Listening Module 2 Hard (Higher-Tier Adaptive)
  bump('Generating Listening Module 2 Hard (Choose a Response)...');
  const lM2HCr = await generateSingleTaskWithFallback(
    'listening-choose-response',
    'advanced',
    'campus-life',
    fallbackTemplate.modules.listeningModule2Hard.chooseResponse,
    `${setId}_lcr_m2h`
  );
  bump('Generating Listening Module 2 Hard (Campus Conversation)...');
  const lM2HConv = await generateSingleTaskWithFallback(
    'listening-dialogue',
    'advanced',
    'campus-life',
    fallbackTemplate.modules.listeningModule2Hard.conversation,
    `${setId}_ld_m2h`
  );
  bump('Generating Listening Module 2 Hard (Campus Announcement)...');
  const lM2HAnn = await generateSingleTaskWithFallback(
    'listening-announcement',
    'advanced',
    'campus-life',
    fallbackTemplate.modules.listeningModule2Hard.announcement,
    `${setId}_la_m2h`
  );
  bump('Generating Listening Module 2 Hard (Academic Talk)...');
  const lM2HTalk = await generateSingleTaskWithFallback(
    'listening-academic-talk',
    'advanced',
    'science-tech',
    fallbackTemplate.modules.listeningModule2Hard.academicTalk,
    `${setId}_lat_m2h`
  );

  const listeningModule2Hard: MockExamListeningModule = {
    chooseResponse: lM2HCr,
    conversation: lM2HConv,
    announcement: lM2HAnn,
    academicTalk: lM2HTalk,
  };

  // 6. Listening Module 2 Easy (Standard-Tier Adaptive)
  bump('Generating Listening Module 2 Standard (Choose a Response)...');
  const lM2ECr = await generateSingleTaskWithFallback(
    'listening-choose-response',
    'intermediate',
    'campus-life',
    fallbackTemplate.modules.listeningModule2Easy.chooseResponse,
    `${setId}_lcr_m2e`
  );
  bump('Generating Listening Module 2 Standard (Campus Conversation)...');
  const lM2EConv = await generateSingleTaskWithFallback(
    'listening-dialogue',
    'intermediate',
    'campus-life',
    fallbackTemplate.modules.listeningModule2Easy.conversation,
    `${setId}_ld_m2e`
  );
  bump('Generating Listening Module 2 Standard (Campus Announcement)...');
  const lM2EAnn = await generateSingleTaskWithFallback(
    'listening-announcement',
    'intermediate',
    'campus-life',
    fallbackTemplate.modules.listeningModule2Easy.announcement,
    `${setId}_la_m2e`
  );
  bump('Generating Listening Module 2 Standard (Academic Talk)...');
  const lM2ETalk = await generateSingleTaskWithFallback(
    'listening-academic-talk',
    'intermediate',
    'environment',
    fallbackTemplate.modules.listeningModule2Easy.academicTalk,
    `${setId}_lat_m2e`
  );

  const listeningModule2Easy: MockExamListeningModule = {
    chooseResponse: lM2ECr,
    conversation: lM2EConv,
    announcement: lM2EAnn,
    academicTalk: lM2ETalk,
  };

  // 7. Writing & Speaking Sections
  bump('Generating Writing & Speaking (Build a Sentence)...');
  const wBs = await generateSingleTaskWithFallback(
    'build-sentence',
    'upper-intermediate',
    'campus-life',
    fallbackTemplate.modules.writing.buildSentence,
    `${setId}_bs`
  );
  bump('Generating Writing & Speaking (Write an Email)...');
  const wEmail = await generateSingleTaskWithFallback(
    'write-email',
    'intermediate',
    'campus-life',
    fallbackTemplate.modules.writing.writeEmail,
    `${setId}_we`
  );
  bump('Generating Writing & Speaking (Academic Discussion)...');
  const wAd = await generateSingleTaskWithFallback(
    'academic-discussion',
    'advanced',
    'social-sciences',
    fallbackTemplate.modules.writing.academicDiscussion,
    `${setId}_ad`
  );

  const writing: MockExamWritingModule = {
    buildSentence: wBs,
    writeEmail: wEmail,
    academicDiscussion: wAd,
  };

  bump('Generating Writing & Speaking (Listen & Repeat)...');
  const sLr = await generateSingleTaskWithFallback(
    'listen-repeat',
    'intermediate',
    'campus-life',
    fallbackTemplate.modules.speaking.listenRepeat,
    `${setId}_lr`
  );
  bump('Generating Writing & Speaking (Take an Interview)...');
  const sSi = await generateSingleTaskWithFallback(
    'speaking-interview',
    'upper-intermediate',
    'social-sciences',
    fallbackTemplate.modules.speaking.speakingInterview,
    `${setId}_si`
  );

  const speaking: MockExamSpeakingModule = {
    listenRepeat: sLr,
    speakingInterview: sSi,
  };

  const newSet: MockExamSet = {
    id: setId,
    title: `Full-Length 2026 TOEFL iBT® Mock Exam #${nextSetNumber} (AI-Generated Set)`,
    source: 'ai_generated',
    createdAt: Date.now(),
    modules: {
      readingModule1,
      readingModule2Hard,
      readingModule2Easy,
      listeningModule1,
      listeningModule2Hard,
      listeningModule2Easy,
      writing,
      speaking,
    },
  };

  await saveMockExamSetToDb(newSet);
  return newSet;
}

/**
 * Retrieves saved score reports per Mock Exam Set ID from localStorage.
 */
export function getMockSetScores(): Record<string, MockSetScoreSummary> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(MOCK_SET_SCORES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Saves a completed Mock Exam Set score report to localStorage tied to `setId`.
 */
export function saveMockSetScore(
  setId: string,
  sectionScores: Record<'Reading' | 'Listening' | 'Writing' | 'Speaking', number>,
  readingTrack: 'higher' | 'standard',
  listeningTrack: 'higher' | 'standard',
  overallBand6: number,
  cefrCode: string,
  cefrName: string
): MockSetScoreSummary {
  const totalScore120 =
    (sectionScores.Reading || 0) +
    (sectionScores.Listening || 0) +
    (sectionScores.Writing || 0) +
    (sectionScores.Speaking || 0);

  const currentMap = getMockSetScores();
  const prev = currentMap[setId];

  const report: MockSetAttemptReport = {
    sectionScores: { ...sectionScores },
    readingTrack,
    listeningTrack,
    completedAt: Date.now(),
    totalScore120,
    overallBand6,
    cefrCode,
    cefrName,
  };

  const isNewBest = !prev || totalScore120 >= prev.bestScore120;

  const updated: MockSetScoreSummary = {
    setId,
    bestScore120: isNewBest ? totalScore120 : prev.bestScore120,
    bestBand6: isNewBest ? overallBand6 : prev.bestBand6,
    bestCefr: isNewBest ? cefrCode : prev.bestCefr,
    attemptsCount: (prev?.attemptsCount || 0) + 1,
    lastReport: report,
  };

  currentMap[setId] = updated;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(MOCK_SET_SCORES_STORAGE_KEY, JSON.stringify(currentMap));
    } catch {}
  }
  return updated;
}
