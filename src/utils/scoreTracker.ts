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
  scaledScore30: number;
  bandScore6?: number; // Official updated TOEFL 1.0 - 6.0 band scale
  timeSpentSeconds: number;
  feedbackSummary?: string;
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
    const raw = localStorage.getItem(getStorageKey());
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function savePracticeRecord(record: Omit<PracticeRecord, 'id' | 'date'>): Promise<PracticeRecord> {
  const scaledScore30 = record.scaledScore30;
  const bandScore6 = record.bandScore6 ?? convertScaledToBand6(scaledScore30);

  const fullRecord: PracticeRecord = {
    ...record,
    bandScore6,
    id: 'rec-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    date: new Date().toISOString(),
  };

  try {
    const history = getPracticeHistory();
    history.unshift(fullRecord);
    localStorage.setItem(getStorageKey(), JSON.stringify(history.slice(0, 100)));

    if (auth.currentUser) {
      await saveTaskCompletion(fullRecord.taskType);
    }
  } catch (e) {
    console.error('Failed to save score record', e);
  }

  return fullRecord;
}

export async function saveTaskCompletion(taskType: string) {
  const userId = getCurrentUserId();
  const today = new Date().toISOString().split('T')[0];

  // 1. Save Completion
  try {
    await addDoc(collection(db, 'completions'), {
      userId,
      taskType,
      completedAt: serverTimestamp(),
    });
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
  }
}

export const resetPracticeHistory = clearPracticeHistory;

// Convert 0-30 scaled score to the new TOEFL 1.0 - 6.0 band scale (0.5 increments)
export function convertScaledToBand6(scaledScore30: number): number {
  if (scaledScore30 >= 29) return 6.0;
  if (scaledScore30 >= 26) return 5.5;
  if (scaledScore30 >= 23) return 5.0;
  if (scaledScore30 >= 20) return 4.5;
  if (scaledScore30 >= 17) return 4.0;
  if (scaledScore30 >= 14) return 3.5;
  if (scaledScore30 >= 11) return 3.0;
  if (scaledScore30 >= 8) return 2.5;
  if (scaledScore30 >= 5) return 2.0;
  if (scaledScore30 >= 3) return 1.5;
  return 1.0;
}

export function convertToBandScore6(score: number, maxScore: number): number {
  const scaled = convertToScaledScore(score, maxScore);
  return convertScaledToBand6(scaled);
}

export function getCefrFromBand6(band6: number): {
  code: string;
  name: string;
  descriptor: string;
  colorClass: string;
} {
  if (band6 <= 0) {
    return {
      code: 'N/A',
      name: 'No Data / Absolute Zero',
      descriptor: 'Complete practice sessions to determine your active CEFR proficiency level.',
      colorClass: 'text-slate-500 bg-slate-100 border-slate-200',
    };
  }
  if (band6 >= 6.0) {
    return {
      code: 'C2',
      name: 'C2 Proficient / Mastery',
      descriptor: 'Near-native fluency, precision, and nuance across academic domains.',
      colorClass: 'text-purple-700 bg-purple-50 border-purple-200',
    };
  }
  if (band6 >= 5.0) {
    return {
      code: 'C1',
      name: 'C1 Advanced (High Fluency)',
      descriptor: 'Effective operational command; suitable for high-ranking graduate programs.',
      colorClass: 'text-teal-700 bg-teal-50 border-teal-200',
    };
  }
  if (band6 >= 4.0) {
    return {
      code: 'B2',
      name: 'B2 Upper-Intermediate',
      descriptor: 'Independent user; satisfies standard undergraduate and graduate entrance bar.',
      colorClass: 'text-blue-700 bg-blue-50 border-blue-200',
    };
  }
  if (band6 >= 3.0) {
    return {
      code: 'B1',
      name: 'B1 Intermediate',
      descriptor: 'Threshold proficiency; understands main points of familiar academic contexts.',
      colorClass: 'text-amber-700 bg-amber-50 border-amber-200',
    };
  }
  if (band6 >= 2.0) {
    return {
      code: 'A2',
      name: 'A2 Elementary / Waystage',
      descriptor: 'Basic command; handles simple, routine communications.',
      colorClass: 'text-orange-700 bg-orange-50 border-orange-200',
    };
  }
  return {
    code: 'A1',
    name: 'A1 Beginner / Breakthrough',
    descriptor: 'Introductory familiarity with English vocabulary and basic structures.',
    colorClass: 'text-rose-700 bg-rose-50 border-rose-200',
  };
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

  const readingBand6 = convertScaledToBand6(readingScore);
  const listeningBand6 = convertScaledToBand6(listeningScore);
  const speakingBand6 = convertScaledToBand6(speakingScore);
  const writingBand6 = convertScaledToBand6(writingScore);

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
