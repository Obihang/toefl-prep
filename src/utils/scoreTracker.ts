import { db, auth } from '../firebase';
import { collection, addDoc, doc, getDoc, getDocs, updateDoc, setDoc, query, where, serverTimestamp } from 'firebase/firestore';

export interface PracticeRecord {
  id: string;
  taskType: string;
  taskTitle: string;
  section: 'Reading' | 'Listening' | 'Speaking' | 'Writing';
  date: string;
  score: number;
  maxScore: number;
  rawScore?: number;
  rawMaxScore?: number;
  scaledScore30: number;
  bandScore6?: number; // Official updated TOEFL 1.0 - 6.0 band scale
  timeSpentSeconds: number;
  studentResponse?: string;
  feedbackSummary?: string;
  grammarErrors?: Array<{ original: string; corrected: string; explanation: string; type?: string }>;
  modelAnswer?: string;
}

export type ScoreEntry = PracticeRecord;

export function band6ToScaled30(band6: number): number {
  const b = Math.round((Number(band6) || 1) * 2) / 2;
  if (b >= 6.0) return 30;
  if (b >= 5.5) return 28;
  if (b >= 5.0) return 25;
  if (b >= 4.5) return 22;
  if (b >= 4.0) return 19;
  if (b >= 3.5) return 16;
  if (b >= 3.0) return 13;
  if (b >= 2.5) return 10;
  if (b >= 2.0) return 7;
  if (b >= 1.5) return 4;
  return 2;
}

export function sanitizePracticeRecord(raw: any): { record: PracticeRecord; changed: boolean } {
  const origScore = Number(raw?.score ?? 0);
  const origMax = Number(raw?.maxScore ?? 30);
  let scaled30: number;

  if (typeof raw?.scaledScore30 === 'number' && !isNaN(raw.scaledScore30) && raw.scaledScore30 >= 0 && raw.scaledScore30 <= 30) {
    scaled30 = Math.round(raw.scaledScore30);
  } else if (typeof raw?.bandScore6 === 'number' && !isNaN(raw.bandScore6) && raw.bandScore6 >= 1 && raw.bandScore6 <= 6) {
    scaled30 = band6ToScaled30(raw.bandScore6);
  } else if (origScore > origMax && origScore <= 30) {
    // Corrupted entry where scaled30 was stored in score alongside raw maxScore (e.g. 30/1, 28/10)
    scaled30 = Math.round(origScore);
  } else if (origMax > 0 && origMax !== 30 && origScore <= origMax) {
    scaled30 = convertToScaledScore(origScore, origMax);
  } else {
    scaled30 = Math.min(30, Math.max(0, Math.round(origScore)));
  }

  const section = (raw?.section || 'Reading') as 'Reading' | 'Listening' | 'Speaking' | 'Writing';
  const bandScore6 =
    typeof raw?.bandScore6 === 'number' && !isNaN(raw.bandScore6) && raw.bandScore6 >= 1 && raw.bandScore6 <= 6
      ? raw.bandScore6
      : convertScaledToBand6(scaled30, section);

  const changed =
    raw?.score !== scaled30 ||
    raw?.maxScore !== 30 ||
    raw?.scaledScore30 !== scaled30 ||
    raw?.bandScore6 !== bandScore6;

  const record: PracticeRecord = {
    ...raw,
    id: raw?.id || 'rec-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    taskType: raw?.taskType || 'academic-discussion',
    taskTitle: raw?.taskTitle || raw?.taskType || 'Practice Task',
    section,
    date: raw?.date || new Date().toISOString(),
    rawScore: raw?.rawScore ?? (origMax !== 30 && origScore <= origMax ? origScore : undefined),
    rawMaxScore: raw?.rawMaxScore ?? (origMax !== 30 ? origMax : undefined),
    score: scaled30,
    maxScore: 30,
    scaledScore30: scaled30,
    bandScore6,
    timeSpentSeconds: Number(raw?.timeSpentSeconds || 60),
    studentResponse: typeof raw?.studentResponse === 'string' ? raw.studentResponse : undefined,
    feedbackSummary: typeof raw?.feedbackSummary === 'string' ? raw.feedbackSummary : (typeof raw?.feedback === 'string' ? raw.feedback : undefined),
    grammarErrors: Array.isArray(raw?.grammarErrors) ? raw.grammarErrors : undefined,
    modelAnswer: typeof raw?.modelAnswer === 'string' ? raw.modelAnswer : undefined,
  };

  return { record, changed };
}

export function getCurrentUserId(): string {
  if (typeof window === 'undefined') return 'anonymous';
  try {
    if (auth?.currentUser?.uid) {
      return auth.currentUser.uid;
    }
  } catch {}
  let localId = localStorage.getItem('local_device_id');
  if (!localId) {
    localId = 'anon-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('local_device_id', localId);
  }
  return localId;
}

const getStorageKey = () => `toefl_prep_history_${getCurrentUserId()}`;

export function getPracticeHistory(): PracticeRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const key = getStorageKey();
    const raw = localStorage.getItem(key) || localStorage.getItem('toefl_score_history');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    let anyRepaired = false;
    const sanitized = parsed.map((item) => {
      const { record, changed } = sanitizePracticeRecord(item);
      if (changed) anyRepaired = true;
      return record;
    });

    if (anyRepaired) {
      try {
        localStorage.setItem(key, JSON.stringify(sanitized));
        localStorage.setItem('toefl_score_history', JSON.stringify(sanitized));
      } catch {}
    }

    return sanitized;
  } catch {
    return [];
  }
}

export async function savePracticeRecord(record: Omit<PracticeRecord, 'id' | 'date'>): Promise<PracticeRecord> {
  const { record: fullRecord } = sanitizePracticeRecord({
    ...record,
    rawScore: record.rawScore ?? record.score,
    rawMaxScore: record.rawMaxScore ?? record.maxScore,
    id: 'rec-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    date: new Date().toISOString(),
  });

  try {
    const history = getPracticeHistory();
    history.unshift(fullRecord);
    const trimmed = history.slice(0, 100);
    localStorage.setItem(getStorageKey(), JSON.stringify(trimmed));
    localStorage.setItem('toefl_score_history', JSON.stringify(trimmed));

    if (auth.currentUser) {
      await saveTaskCompletion(fullRecord.taskType, fullRecord);
    }
  } catch (e) {
    console.error('Failed to save score record', e);
  }

  return fullRecord;
}

export const saveScoreEntry = savePracticeRecord;

export async function saveTaskCompletion(taskType: string, fullRecord?: PracticeRecord) {
  const userId = getCurrentUserId();
  const today = new Date().toISOString().split('T')[0];

  // 1. Save Completion (with optional saved response & evaluation details)
  try {
    const payload: Record<string, any> = {
      userId,
      taskType,
      completedAt: serverTimestamp(),
    };
    if (fullRecord) {
      payload.taskTitle = fullRecord.taskTitle;
      payload.section = fullRecord.section;
      payload.scaledScore30 = fullRecord.scaledScore30;
      payload.bandScore6 = fullRecord.bandScore6 ?? null;
      if (fullRecord.studentResponse) payload.studentResponse = fullRecord.studentResponse;
      if (fullRecord.feedbackSummary) payload.feedbackSummary = fullRecord.feedbackSummary;
      if (Array.isArray(fullRecord.grammarErrors) && fullRecord.grammarErrors.length > 0) {
        payload.grammarErrors = fullRecord.grammarErrors.slice(0, 20);
      }
      if (fullRecord.modelAnswer) payload.modelAnswer = fullRecord.modelAnswer;
    }
    await addDoc(collection(db, 'completions'), payload);
  } catch (err) {
    console.error('Failed to save completion record:', err);
  }

  // 2. Update Stats (Streak)
  try {
    const statsRef = doc(db, 'userStats', userId);
    const statsSnap = await getDoc(statsRef);
    
    let currentStreak = 1;
    let lastCompletedDate = today;

    if (statsSnap.exists()) {
      const data = statsSnap.data();
      const lastDate = new Date(data.lastCompletedDate);
      const todayDate = new Date(today);
      
      const diffTime = Math.abs(todayDate.getTime() - lastDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) {
        currentStreak = (data.currentStreak || 0) + 1;
      } else if (diffDays > 1) {
        currentStreak = 1;
      } else {
        currentStreak = data.currentStreak || 1;
      }
      lastCompletedDate = today;
    }

    await setDoc(statsRef, { userId, currentStreak, lastCompletedDate }, { merge: true });
  } catch (err) {
    console.error('Failed to update userStats:', err);
  }
  
  // 3. Save Day in Subcollection
  try {
    await setDoc(doc(db, 'userStats', userId, 'completedDays', today), { date: today, userId });
  } catch (err) {
    console.error('Failed to save completedDay:', err);
  }
}

export async function getUserStats() {
  const userId = getCurrentUserId();
  try {
    const statsSnap = await getDoc(doc(db, 'userStats', userId));
    return statsSnap.exists() ? statsSnap.data() : null;
  } catch (err) {
    console.warn('Failed to get userStats from Firestore (offline):', err);
    return null;
  }
}

export async function getCompletedDays() {
  const userId = getCurrentUserId();
  try {
    const q = query(collection(db, 'userStats', userId, 'completedDays'), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data().date);
  } catch (err) {
    console.warn('Failed to get completedDays from Firestore (offline):', err);
    return [];
  }
}

export function clearPracticeHistory() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(getStorageKey());
    localStorage.removeItem('toefl_score_history');
  }
}

export const resetPracticeHistory = clearPracticeHistory;

export {
  TOEFL_TEST_STRUCTURE_2026,
  TOEFL_CONCORDANCE_TABLE_2026,
  OFFICIAL_TASK_RUBRICS,
  convertScaledToBand6,
  percentageToBand6,
  convertOverall120ToBand6,
  getBandScoreRangeForSection,
  getCefrFromBand6,
  getTaskRawRubric,
  convertRawRubricToBand6,
} from './toeflScoring';
import { convertScaledToBand6, getCefrFromBand6 } from './toeflScoring';

export function convertToBandScore6(score: number, maxScore: number, section?: 'Reading' | 'Listening' | 'Writing' | 'Speaking'): number {
  const scaled = convertToScaledScore(score, maxScore);
  return convertScaledToBand6(scaled, section);
}

export interface ScoreEquivalency {
  cefr: string;
  toefl120Range: string;
  badgeText: string;
}

export function getScoreEquivalency(bandScore6: number): ScoreEquivalency {
  if (bandScore6 <= 0) {
    return { cefr: 'N/A', toefl120Range: '0/120', badgeText: 'No Data (0 / 120)' };
  }
  const band = Math.round(bandScore6 * 2) / 2;
  if (band >= 6.0) return { cefr: 'C2', toefl120Range: '~114–120/120', badgeText: 'Band 6.0 (CEFR C2 • ~114–120/120)' };
  if (band >= 5.5) return { cefr: 'C1', toefl120Range: '~107–113/120', badgeText: 'Band 5.5 (CEFR C1 • ~107–113/120)' };
  if (band >= 5.0) return { cefr: 'C1', toefl120Range: '~95–106/120', badgeText: 'Band 5.0 (CEFR C1 • ~95–106/120)' };
  if (band >= 4.5) return { cefr: 'B2', toefl120Range: '~84–94/120', badgeText: 'Band 4.5 (CEFR B2 • ~84–94/120)' };
  if (band >= 4.0) return { cefr: 'B2', toefl120Range: '~72–83/120', badgeText: 'Band 4.0 (CEFR B2 • ~72–83/120)' };
  if (band >= 3.5) return { cefr: 'B1', toefl120Range: '~57–71/120', badgeText: 'Band 3.5 (CEFR B1 • ~57–71/120)' };
  if (band >= 3.0) return { cefr: 'B1', toefl120Range: '~42–56/120', badgeText: 'Band 3.0 (CEFR B1 • ~42–56/120)' };
  if (band >= 2.0) return { cefr: 'A2', toefl120Range: '~25–41/120', badgeText: 'Band 2.0 (CEFR A2 • ~25–41/120)' };
  return { cefr: 'A1', toefl120Range: '~0–24/120', badgeText: 'Band 1.0 (CEFR A1 • ~0–24/120)' };
}

export function calculateToeflEstimate(history: PracticeRecord[]): {
  overallScore: number;
  overallBand6: number;
  readingScore: number;
  readingBand6: number;
  listeningScore: number;
  listeningBand6: number;
  speakingScore: number;
  speakingBand6: number;
  writingScore: number;
  writingBand6: number;
  cefrLevel: string;
  cefrCode: string;
  totalCompleted: number;
} {
  if (!history || history.length === 0) {
    return {
      overallScore: 0,
      overallBand6: 0,
      readingScore: 0,
      readingBand6: 0,
      listeningScore: 0,
      listeningBand6: 0,
      speakingScore: 0,
      speakingBand6: 0,
      writingScore: 0,
      writingBand6: 0,
      cefrLevel: 'N/A (Need Data)',
      cefrCode: 'N/A',
      totalCompleted: 0,
    };
  }

  const getSectionAvg = (sec: 'Reading' | 'Listening' | 'Speaking' | 'Writing') => {
    const records = history.filter((h) => h.section === sec);
    if (records.length === 0) return 0;
    const sum = records.reduce((acc, r) => acc + r.scaledScore30, 0);
    return Math.round(sum / records.length);
  };

  const readingScore = getSectionAvg('Reading');
  const listeningScore = getSectionAvg('Listening');
  const speakingScore = getSectionAvg('Speaking');
  const writingScore = getSectionAvg('Writing');

  const readingBand6 = convertScaledToBand6(readingScore, 'Reading');
  const listeningBand6 = convertScaledToBand6(listeningScore, 'Listening');
  const speakingBand6 = convertScaledToBand6(speakingScore, 'Speaking');
  const writingBand6 = convertScaledToBand6(writingScore, 'Writing');

  const rawAvg = (readingBand6 + listeningBand6 + speakingBand6 + writingBand6) / 4;
  const overallBand6 = Math.round(rawAvg * 2) / 2;
  const overallScore = readingScore + listeningScore + speakingScore + writingScore;
  const cefr = getCefrFromBand6(overallBand6);

  return {
    overallScore,
    overallBand6,
    readingScore,
    readingBand6,
    listeningScore,
    listeningBand6,
    speakingScore,
    speakingBand6,
    writingScore,
    writingBand6,
    cefrLevel: cefr.name,
    cefrCode: cefr.code,
    totalCompleted: history.length,
  };
}

export function convertToScaledScore(score: number, maxScore: number): number {
  if (maxScore <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, score / maxScore));
  if (ratio >= 0.95) return 30;
  if (ratio >= 0.9) return 28;
  if (ratio >= 0.8) return 25;
  if (ratio >= 0.7) return 22;
  if (ratio >= 0.6) return 19;
  if (ratio >= 0.5) return 16;
  if (ratio >= 0.4) return 13;
  return Math.max(8, Math.round(ratio * 30));
}

export function getWeakAreas(history: PracticeRecord[]): { section: string, avgScore: number }[] {
  if (!history || history.length === 0) return [];

  const sections = ['Reading', 'Listening', 'Speaking', 'Writing'];
  const weakAreas: { section: string, avgScore: number }[] = [];

  for (const section of sections) {
    const records = history.filter((r) => r.section === section);
    if (records.length >= 2) {
      const avg = records.reduce((acc, r) => acc + r.scaledScore30, 0) / records.length;
      if (avg < 20) {
        weakAreas.push({ section, avgScore: Math.round(avg) });
      }
    }
  }
  return weakAreas;
}
