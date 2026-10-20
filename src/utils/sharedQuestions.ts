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
  limit,
  getDocs,
  serverTimestamp,
  increment,
  arrayUnion,
} from 'firebase/firestore';

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
  createdAt?: any;
  createdBy: string;
  useCount: number;
}

/**
 * Deduplicate by contentHash and save a question to Firestore collection 'questions'.
 */
export async function saveQuestionToBank(params: {
  taskType: string;
  level: string;
  topic: string;
  content: any;
  audioUrl?: string | null;
}): Promise<string | null> {
  const { taskType, level, topic, content, audioUrl = null } = params;
  const contentHash = await computeContentHash(taskType, content);

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
      taskType,
      level,
      topic,
      content,
      contentHash,
      audioUrl: audioUrl || null,
      createdAt: serverTimestamp(),
      createdBy: auth?.currentUser?.uid || 'anonymous',
      useCount: 0,
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

/**
 * Fetch an unseen question from Firestore questions bank.
 * If found, increments useCount and records to userProgress.
 */
export async function fetchUnseenQuestion(
  taskType: string,
  level: string,
  topic?: string
): Promise<any | null> {
  try {
    const currentUid = auth?.currentUser?.uid;
    const seenIds = await getUserSeenQuestionIds(currentUid);

    // Query questions for matching taskType and level
    const q = query(
      collection(db, 'questions'),
      where('taskType', '==', taskType),
      where('level', '==', level),
      limit(25)
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;

    // Find an unseen question
    for (const docSnap of snapshot.docs) {
      if (!seenIds.includes(docSnap.id)) {
        const data = docSnap.data();

        // Increment useCount and mark as seen asynchronously
        updateDoc(doc(db, 'questions', docSnap.id), {
          useCount: increment(1),
        }).catch(() => {});

        markQuestionAsSeen(docSnap.id, currentUid).catch(() => {});

        return {
          ...data.content,
          id: docSnap.id,
          questionDocId: docSnap.id,
          taskType: data.taskType,
          level: data.level,
          topic: data.topic,
          audioUrl: data.audioUrl || null,
          isSharedBank: true,
        };
      }
    }
  } catch (err) {
    console.warn('Error fetching unseen question from bank:', err);
  }

  return null;
}

/**
 * Get count of unseen questions currently available in bank for taskType & level
 */
export async function getUnseenQuestionCount(taskType: string, level: string): Promise<number> {
  try {
    const seenIds = await getUserSeenQuestionIds();
    const q = query(
      collection(db, 'questions'),
      where('taskType', '==', taskType),
      where('level', '==', level),
      limit(30)
    );
    const snap = await getDocs(q);
    let unseen = 0;
    snap.docs.forEach((d) => {
      if (!seenIds.includes(d.id)) unseen++;
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
 * Check bank count and trigger background batch generation if unseen count < 5
 */
export async function triggerBackgroundPrefetchIfNeeded(
  taskType: string,
  level: string,
  topic: string,
  generateBatchFn: (tType: string, lvl: string, top: string) => Promise<any[]>
): Promise<void> {
  if (isBackgroundPrefetching) return;

  const count = await getUnseenQuestionCount(taskType, level);
  if (count >= 5) return;

  isBackgroundPrefetching = true;
  window.dispatchEvent(new CustomEvent('toefl_prefetch_status', { detail: { isPrefetching: true } }));

  try {
    const items = await generateBatchFn(taskType, level, topic);
    for (const item of items) {
      let audioUrl: string | null = null;

      // Pre-synthesize audio for Listening and Listen & Repeat
      if (taskType === 'listening-dialogue' || taskType === 'listen-repeat') {
        try {
          const textToSpeak = item.script || (Array.isArray(item.sentences) ? item.sentences.join(' ') : '');
          if (textToSpeak) {
            const ttsRes = await fetch('/api/tts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: textToSpeak,
                voiceName: item.speakerGender === 'female' ? 'en-US-JennyNeural' : 'en-US-GuyNeural',
              }),
            });
            const ttsJson = await ttsRes.json();
            if (ttsJson.audioUrl) {
              audioUrl = ttsJson.audioUrl;
            }
          }
        } catch (audioErr) {
          console.warn('Background audio pre-synthesis skipped:', audioErr);
        }
      }

      await saveQuestionToBank({
        taskType,
        level,
        topic,
        content: item,
        audioUrl,
      });
    }
  } catch (err) {
    console.warn('Background question prefetch failed:', err);
  } finally {
    isBackgroundPrefetching = false;
    window.dispatchEvent(new CustomEvent('toefl_prefetch_status', { detail: { isPrefetching: false } }));
  }
}

export async function getQuestionCountsPerSection(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {
    Reading: 0,
    Listening: 0,
    Speaking: 0,
    Writing: 0,
  };

  try {
    const qSnap = await getDocs(query(collection(db, 'questions'), limit(100)));
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
        const id = await saveQuestionToBank({
          taskType: item.taskType,
          level: item.data.level || 'upper-intermediate',
          topic: item.data.topic || 'general',
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

export async function reportSharedQuestion(questionDocId: string, userId?: string): Promise<boolean> {
  return true;
}

export function generateQuestionDocId(taskType: string, taskData: any): Promise<string> {
  return computeContentHash(taskType, taskData).then((h) => `q_${h.slice(0, 24)}`);
}

export function saveSharedQuestion(params: any): Promise<string> {
  return saveQuestionToBank({
    taskType: params.taskType,
    level: params.level || 'upper-intermediate',
    topic: params.topic || 'general',
    content: params.data,
    audioUrl: params.audioUrl,
  }).then((id) => id || `local_${Date.now()}`);
}

export function fetchRandomSharedQuestion(taskType: string): Promise<any | null> {
  return fetchUnseenQuestion(taskType, 'upper-intermediate');
}
