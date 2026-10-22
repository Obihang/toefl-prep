import { db, auth } from '../firebase';
import { getSectionForTaskType } from '../types/taskTypes';
import { getAuthHeaders, getScholarUsername } from './apiKey';
import { parseDialogueLine, DialogueVoiceManager } from './voices';
import { stripSpeakerAndFormatting } from './audioSpeech';
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
  audioClips?: Array<{ speaker: string; url: string }> | null;
  source?: string;
  generatedBy?: string;
  createdAt?: any;
  createdBy: string;
  useCount: number;
}

const BLOB_DOMAIN_SUFFIX = 'blob.vercel-storage.com';
function isValidBlobUrl(url: any): boolean {
  if (typeof url !== 'string') return false;
  return url.startsWith('https://') && url.includes(BLOB_DOMAIN_SUFFIX);
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
  audioClips?: Array<{ speaker: string; url: string }> | null;
  source?: string;
  generatedBy?: string;
}): Promise<string | null> {
  const { taskType, level, topic, content, audioUrl = null, audioClips = null, source = 'ai', generatedBy = getScholarUsername() } = params;
  const contentHash = await computeContentHash(taskType, content);

  const cleanAudioUrl = isValidBlobUrl(audioUrl) ? audioUrl : null;
  const cleanAudioClips = Array.isArray(audioClips)
    ? audioClips.filter((c) => isValidBlobUrl(c.url)).slice(0, 10)
    : null;

  const enrichedContent = {
    ...content,
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
      taskType,
      level,
      topic,
      content: enrichedContent,
      contentHash,
      audioUrl: cleanAudioUrl,
      audioClips: cleanAudioClips && cleanAudioClips.length > 0 ? cleanAudioClips : null,
      source,
      generatedBy: enrichedContent.generatedBy,
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

    // 1. Try querying by taskType and level
    let q = query(
      collection(db, 'questions'),
      where('taskType', '==', taskType),
      where('level', '==', level),
      limit(35)
    );

    let snapshot = await getDocs(q);

    // 2. If empty, try querying just by taskType (any level)
    if (snapshot.empty) {
      const qAnyLevel = query(
        collection(db, 'questions'),
        where('taskType', '==', taskType),
        limit(35)
      );
      snapshot = await getDocs(qAnyLevel);
    }

    if (snapshot.empty) return null;

    const docs = snapshot.docs;

    // First try to find an unseen question
    for (const docSnap of docs) {
      if (!seenIds.includes(docSnap.id)) {
        const data = docSnap.data();

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
          audioClips: data.audioClips || null,
          isSharedBank: true,
        };
      }
    }

    // If all questions have been seen, cycle back to any random question in the bank for this taskType!
    if (docs.length > 0) {
      const randomIndex = Math.floor(Math.random() * docs.length);
      const docSnap = docs[randomIndex];
      const data = docSnap.data();

      updateDoc(doc(db, 'questions', docSnap.id), {
        useCount: increment(1),
      }).catch(() => {});

      return {
        ...data.content,
        id: docSnap.id,
        questionDocId: docSnap.id,
        taskType: data.taskType,
        level: data.level,
        topic: data.topic,
        audioUrl: data.audioUrl || null,
        audioClips: data.audioClips || null,
        isSharedBank: true,
      };
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
              const headers = { 'Content-Type': 'application/json', ...authHdrs };

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
            level,
            topic,
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

export async function getQuestionCountsPerTaskType(): Promise<Record<string, number>> {
  try {
    const { getQuestionBankStats } = await import('./questionBankStorage');
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
