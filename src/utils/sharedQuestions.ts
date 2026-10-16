import { db, auth } from '../firebase';
import { getSectionForTaskType } from '../types/taskTypes';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  increment,
  arrayUnion,
} from 'firebase/firestore';

const SEEN_STORAGE_KEY = 'toefl_seen_question_ids';

export function getSeenQuestionIds(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function markQuestionAsSeen(id: string) {
  try {
    const current = getSeenQuestionIds();
    if (!current.includes(id)) {
      const updated = [...current.slice(-200), id];
      localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(updated));
    }
  } catch {
    // Ignore storage errors
  }
}

// Generate a deterministic alphanumeric ID from taskType and main content
export async function generateQuestionDocId(taskType: string, taskData: any): Promise<string> {
  const mainText =
    taskData.passage ||
    taskData.text ||
    taskData.script ||
    taskData.situation ||
    taskData.professorPrompt ||
    (Array.isArray(taskData.sentences) ? taskData.sentences.join(' ') : '') ||
    (Array.isArray(taskData.questions) ? taskData.questions.map((q: any) => q.question).join(' ') : '') ||
    (Array.isArray(taskData.items) ? taskData.items.map((i: any) => i.answer || i.context).join(' ') : '') ||
    JSON.stringify(taskData);

  const cleanSample = `${taskType}:::${mainText.trim().toLowerCase()}`;

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(cleanSample));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      return `q_${hex.slice(0, 32)}`;
    } catch {
      // Fallback
    }
  }

  // FNV-1a 32-bit hash fallback
  let h = 0x811c9dc5;
  for (let i = 0; i < cleanSample.length; i++) {
    h ^= cleanSample.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `q_${(h >>> 0).toString(16)}`;
}

export async function saveSharedQuestion(params: {
  taskType: string;
  level: string;
  topic: string;
  data: any;
  createdByName: string;
  createdByUid: string;
}): Promise<string> {
  const { taskType, level, topic, data, createdByName, createdByUid } = params;
  const docId = await generateQuestionDocId(taskType, data);
  const docRef = doc(db, 'questions', docId);

  // Trim createdByName to 2-30 characters as required by security rules
  const trimmedName = (createdByName || 'Anonymous Scholar').trim().slice(0, 30);
  const safeName = trimmedName.length >= 2 ? trimmedName : 'Scholar';

  try {
    await setDoc(
      docRef,
      {
        taskType,
        level,
        topic,
        data,
        createdByName: safeName,
        createdByUid,
        createdAt: serverTimestamp(),
        rand: Math.random(),
        reportCount: 0,
        reportedBy: [],
      },
      { merge: false }
    );
  } catch (err: any) {
    console.info('Question already exists or duplicate docId in shared bank:', err?.message);
  }

  return docId;
}

export async function fetchRandomSharedQuestion(taskType: string): Promise<any | null> {
  const seenIds = getSeenQuestionIds();

  // 1. Retry up to 5 times with a new random start value
  for (let attempt = 0; attempt < 5; attempt++) {
    const randVal = Math.random();
    try {
      let q = query(
        collection(db, 'questions'),
        where('taskType', '==', taskType),
        where('reportCount', '<', 3),
        where('rand', '>=', randVal),
        orderBy('rand'),
        limit(1)
      );

      let snapshot = await getDocs(q);

      // Wrap around if empty
      if (snapshot.empty) {
        q = query(
          collection(db, 'questions'),
          where('taskType', '==', taskType),
          where('reportCount', '<', 3),
          where('rand', '>=', 0),
          orderBy('rand'),
          limit(1)
        );
        snapshot = await getDocs(q);
      }

      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0];
        if (!seenIds.includes(docSnap.id)) {
          markQuestionAsSeen(docSnap.id);
          const data = docSnap.data();
          return {
            ...data.data,
            level: data.level,
            topic: data.topic,
            createdByName: data.createdByName,
            createdByUid: data.createdByUid,
            questionDocId: docSnap.id,
            reportCount: data.reportCount || 0,
            reportedBy: data.reportedBy || [],
            isSharedBank: true,
          };
        }
      }
    } catch {
      // Continue retry
    }
  }

  // 2. Fall back to scanning 25 candidates starting from a random rand value, skipping seen IDs
  try {
    const randVal = Math.random();
    let q = query(
      collection(db, 'questions'),
      where('taskType', '==', taskType),
      where('reportCount', '<', 3),
      where('rand', '>=', randVal),
      orderBy('rand'),
      limit(25)
    );
    let snapshot = await getDocs(q);

    if (snapshot.empty || snapshot.docs.length < 5) {
      const q2 = query(
        collection(db, 'questions'),
        where('taskType', '==', taskType),
        where('reportCount', '<', 3),
        where('rand', '>=', 0),
        orderBy('rand'),
        limit(25)
      );
      snapshot = await getDocs(q2);
    }

    for (const docSnap of snapshot.docs) {
      if (!seenIds.includes(docSnap.id)) {
        markQuestionAsSeen(docSnap.id);
        const data = docSnap.data();
        return {
          ...data.data,
          level: data.level,
          topic: data.topic,
          createdByName: data.createdByName,
          createdByUid: data.createdByUid,
          questionDocId: docSnap.id,
          reportCount: data.reportCount || 0,
          reportedBy: data.reportedBy || [],
          isSharedBank: true,
        };
      }
    }
  } catch (err) {
    console.warn('Failed to scan shared questions bank:', err);
  }

  // 3. Return null only after that
  return null;
}

export async function reportSharedQuestion(questionDocId: string, userId?: string): Promise<boolean> {
  if (!userId) return false;
  const docRef = doc(db, 'questions', questionDocId);
  try {
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return false;
    const data = docSnap.data();
    const reportedBy = data.reportedBy || [];
    if (reportedBy.includes(userId)) {
      return false; // Already reported by this user
    }
    await updateDoc(docRef, {
      reportCount: increment(1),
      reportedBy: arrayUnion(userId),
    });
    return true;
  } catch (err) {
    console.error('Failed to report shared question:', err);
    return false;
  }
}

export interface SeedReport {
  created: number;
  skipped: number;
  updated: number;
  failed: number;
}

export async function seedDefaultQuestionsToFirestore(options?: { dryRun?: boolean }): Promise<SeedReport> {
  const report: SeedReport = { created: 0, skipped: 0, updated: 0, failed: 0 };
  const dryRun = Boolean(options?.dryRun);

  try {
    if (!auth?.currentUser) return report;

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
    CURATED_READING_PASSAGES?.forEach(p => seedList.push({ taskType: 'reading-passage', data: p }));
    CURATED_LISTENING?.forEach(l => seedList.push({ taskType: 'listening-dialogue', data: l }));
    CURATED_LISTEN_REPEAT?.forEach(l => seedList.push({ taskType: 'listen-repeat', data: l }));
    CURATED_SPEAKING_INTERVIEWS?.forEach(s => seedList.push({ taskType: 'speaking-interview', data: s }));
    CURATED_BUILD_SENTENCES?.forEach(b => seedList.push({ taskType: 'build-sentence', data: b }));
    CURATED_COMPLETE_WORDS?.forEach(c => seedList.push({ taskType: 'complete-words', data: c }));
    CURATED_WRITE_EMAILS?.forEach(w => seedList.push({ taskType: 'write-email', data: w }));
    CURATED_ACADEMIC_DISCUSSIONS?.forEach(a => seedList.push({ taskType: 'academic-discussion', data: a }));

    for (const item of seedList) {
      try {
        const docId = await generateQuestionDocId(item.taskType, item.data);
        const docRef = doc(db, 'questions', docId);
        const existingSnap = await getDoc(docRef);

        if (existingSnap.exists()) {
          report.skipped++;
          continue;
        }

        if (dryRun) {
          report.created++;
          continue;
        }

        await saveSharedQuestion({
          taskType: item.taskType,
          level: item.data.level || 'upper-intermediate',
          topic: item.data.topic || 'general',
          data: item.data,
          createdByName: 'TOEFL Master',
          createdByUid: auth.currentUser.uid,
        });
        report.created++;
      } catch {
        report.failed++;
      }
    }
  } catch (err) {
    console.info('Auto-seeding skipped or failed:', err);
  }

  return report;
}

export async function getQuestionCountsPerSection(): Promise<Record<string, number>> {
  await seedDefaultQuestionsToFirestore();

  const q = query(
    collection(db, 'questions'),
    where('reportCount', '<', 3)
  );

  const qSnap = await getDocs(q);

  const counts: Record<string, number> = {
    Reading: 0,
    Listening: 0,
    Speaking: 0,
    Writing: 0,
  };

  qSnap.forEach(docSnap => {
    const data = docSnap.data();
    const section = getSectionForTaskType(data.taskType || '');
    if (section && counts[section] !== undefined) {
      counts[section]++;
    }
  });

  return counts;
}

