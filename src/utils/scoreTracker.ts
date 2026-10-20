import { db, auth } from '../firebase';
import { collection, addDoc, doc, getDoc, getDocs, updateDoc, setDoc, query, orderBy, serverTimestamp } from 'firebase/firestore';

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

const STORAGE_KEY = 'toefl_prep_history_v1';

export function getPracticeHistory(): PracticeRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 100)));

    if (auth.currentUser) {
      await saveTaskCompletion(fullRecord.taskType);
    }
  } catch (e) {
    console.error('Failed to save score record', e);
  }

  return fullRecord;
}

export async function saveTaskCompletion(taskType: string) {
  if (!auth.currentUser) return;
  const userId = auth.currentUser.uid;
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
  if (!auth.currentUser) return null;
  const statsSnap = await getDoc(doc(db, 'userStats', auth.currentUser.uid));
  return statsSnap.exists() ? statsSnap.data() : null;
}

export async function getCompletedDays() {
  if (!auth.currentUser) return [];
  const snapshot = await getDocs(collection(db, 'userStats', auth.currentUser.uid, 'completedDays'));
  return snapshot.docs.map(doc => doc.data().date);
}

export function clearPracticeHistory() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export const resetPracticeHistory = clearPracticeHistory;
// ... rest of the file

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

// Convert raw score / maxScore to 1.0 - 6.0 band
export function convertToBandScore6(score: number, maxScore: number): number {
  const scaled = convertToScaledScore(score, maxScore);
  return convertScaledToBand6(scaled);
}

// Map 1.0 - 6.0 band score to CEFR level description
export function getCefrFromBand6(band6: number): {
  code: string;
  name: string;
  descriptor: string;
  colorClass: string;
} {
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

export function calculateToeflEstimate(history: PracticeRecord[]): {
  overallScore: number;       // Legacy 0-120
  overallBand6: number;       // New 1.0 - 6.0 band
  readingScore: number;       // 0-30
  readingBand6: number;       // 1.0 - 6.0
  listeningScore: number;     // 0-30
  listeningBand6: number;     // 1.0 - 6.0
  speakingScore: number;      // 0-30
  speakingBand6: number;      // 1.0 - 6.0
  writingScore: number;       // 0-30
  writingBand6: number;       // 1.0 - 6.0
  cefrLevel: string;
  cefrCode: string;
  totalCompleted: number;
} {
  const getSectionAvg = (sec: 'Reading' | 'Listening' | 'Speaking' | 'Writing', fallback = 22) => {
    const records = history.filter((h) => h.section === sec);
    if (records.length === 0) return fallback;
    const sum = records.reduce((acc, r) => acc + r.scaledScore30, 0);
    return Math.round(sum / records.length);
  };

  const readingScore = getSectionAvg('Reading', 22);
  const listeningScore = getSectionAvg('Listening', 22);
  const speakingScore = getSectionAvg('Speaking', 21);
  const writingScore = getSectionAvg('Writing', 22);

  const readingBand6 = convertScaledToBand6(readingScore);
  const listeningBand6 = convertScaledToBand6(listeningScore);
  const speakingBand6 = convertScaledToBand6(speakingScore);
  const writingBand6 = convertScaledToBand6(writingScore);

  // Overall band score is the average of the 4 sections, rounded to nearest 0.5
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

// ... existing code ...
export function convertToScaledScore(score: number, maxScore: number): number {
  if (maxScore <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, score / maxScore));
  // Authentic TOEFL conversion curve
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
  if (history.length === 0) return [];

  const sections = ['Reading', 'Listening', 'Speaking', 'Writing'];
  const weakAreas: { section: string, avgScore: number }[] = [];

  for (const section of sections) {
    const records = history.filter((r) => r.section === section);
    if (records.length >= 3) {
      const avg = records.reduce((acc, r) => acc + r.scaledScore30, 0) / records.length;
      if (avg < 20) { // Below B1/B2 threshold
        weakAreas.push({ section, avgScore: Math.round(avg) });
      }
    }
  }
  return weakAreas;
}
