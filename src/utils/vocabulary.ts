import { db, auth } from '../firebase';
import { collection, addDoc, getDocs, query, orderBy, where, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';

export interface VocabularyWord {
  id: string;
  userId: string;
  word: string;
  definition: string;
  context?: string;
  leitnerBox: number; // 1 to 5
  nextReviewDate: Date;
  createdAt: any;
}

export async function saveVocabularyWord(word: string, definition: string, context?: string) {
  if (!auth.currentUser) throw new Error('User not authenticated');
  
  await addDoc(collection(db, 'vocabulary'), {
    userId: auth.currentUser.uid,
    word,
    definition,
    context,
    leitnerBox: 1,
    nextReviewDate: new Date(),
    createdAt: serverTimestamp(),
  });
}

export async function updateVocabularyWordReview(wordId: string, correct: boolean) {
  if (!auth.currentUser) throw new Error('User not authenticated');
  
  const wordRef = doc(db, 'vocabulary', wordId);
  // In a real app we'd fetch the current state first
  // Here we'll just mock the logic: move 1-5
  // If correct: box++, if wrong: box--
  // ...
  // For now, let's keep it simple as requested.
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
