import { db, auth } from '../firebase';
import { collection, addDoc, getDocs, query, orderBy, where, deleteDoc, updateDoc, doc, serverTimestamp, getDoc } from 'firebase/firestore';

export interface VocabularyWord {
  id: string;
  userId: string;
  word: string;
  definition: string;
  context?: string;
  taskType?: string;
  leitnerBox: number; // 1 to 5
  nextReviewDate: any;
  createdAt: any;
}

const LEITNER_INTERVALS = [1, 2, 4, 8, 16]; // Days for boxes 1 to 5

export async function saveVocabularyWord(word: string, definition: string, context?: string, taskType?: string) {
  if (!auth.currentUser) throw new Error('User not authenticated');
  
  const cleanWord = word.trim().toLowerCase();
  const existing = await getVocabularyWords();
  if (existing.some(w => w.word.trim().toLowerCase() === cleanWord)) {
    return; // No duplicates
  }

  const nextReviewDate = new Date(); // Due immediately
  await addDoc(collection(db, 'vocabulary'), {
    userId: auth.currentUser.uid,
    word: word.trim(),
    definition,
    context: context || '',
    taskType: taskType || 'general',
    leitnerBox: 1,
    nextReviewDate,
    createdAt: serverTimestamp(),
  });
}

export async function updateVocabularyWordReview(wordId: string, correct: boolean) {
  if (!auth.currentUser) throw new Error('User not authenticated');
  
  const wordRef = doc(db, 'vocabulary', wordId);
  const snap = await getDoc(wordRef);
  if (!snap.exists()) return;
  const data = snap.data();
  
  let currentBox = data.leitnerBox || 1;
  if (correct) {
    currentBox = Math.min(5, currentBox + 1);
  } else {
    currentBox = 1;
  }

  const intervalDays = LEITNER_INTERVALS[currentBox - 1] || 1;
  const nextReviewDate = new Date(Date.now() + intervalDays * 86400000);

  await updateDoc(wordRef, {
    leitnerBox: currentBox,
    nextReviewDate,
  });
}

export async function getVocabularyWords(): Promise<VocabularyWord[]> {
  if (!auth.currentUser) return [];
  
  const q = query(
    collection(db, 'vocabulary'),
    where('userId', '==', auth.currentUser.uid),
    orderBy('createdAt', 'desc')
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VocabularyWord));
}

export async function deleteVocabularyWord(wordId: string) {
  if (!auth.currentUser) throw new Error('User not authenticated');
  await deleteDoc(doc(db, 'vocabulary', wordId));
}
