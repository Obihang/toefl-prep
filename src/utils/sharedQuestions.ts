import { db } from '../firebase';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  increment,
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
  const randVal = Math.random();

  try {
    // Primary query: rand >= randVal, orderBy rand, reportCount < 3, limit 1
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

    if (snapshot.empty) return null;

    const firstDoc = snapshot.docs[0];
    if (!seenIds.includes(firstDoc.id)) {
      markQuestionAsSeen(firstDoc.id);
      const data = firstDoc.data();
      return {
        ...data.data,
        level: data.level,
        topic: data.topic,
        createdByName: data.createdByName,
        createdByUid: data.createdByUid,
        questionDocId: firstDoc.id,
        reportCount: data.reportCount || 0,
        isSharedBank: true,
      };
    }

    // If the single random item was already seen, query up to 10 candidates to find an unseen one
    const scanQ = query(
      collection(db, 'questions'),
      where('taskType', '==', taskType),
      where('reportCount', '<', 3),
      where('rand', '>=', 0),
      orderBy('rand'),
      limit(10)
    );
    const scanSnap = await getDocs(scanQ);
    for (const docSnap of scanSnap.docs) {
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
          isSharedBank: true,
        };
      }
    }

    return null;
  } catch (err) {
    console.warn('Failed to query shared questions bank:', err);
    return null;
  }
}

export async function reportSharedQuestion(questionDocId: string): Promise<void> {
  const docRef = doc(db, 'questions', questionDocId);
  await updateDoc(docRef, {
    reportCount: increment(1),
  });
}
