import { db, auth } from '../firebase';
import { collection, addDoc, getDocs, query, orderBy, where, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';

export interface VocabularyWord {
  id: string;
  userId: string;
  word: string;
  definition: string;
  context?: string;
  createdAt: any;
}

export async function saveVocabularyWord(word: string, definition: string, context?: string) {
  if (!auth.currentUser) throw new Error('User not authenticated');
  
  await addDoc(collection(db, 'vocabulary'), {
    userId: auth.currentUser.uid,
    word,
    definition,
    context,
    createdAt: serverTimestamp(),
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
