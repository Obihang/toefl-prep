import { db, auth } from '../firebase';
import { collection, addDoc, getDocs, query, orderBy, where, deleteDoc, updateDoc, doc, serverTimestamp, getDoc } from 'firebase/firestore';

export interface Mistake {
  id: string;
  userId: string;
  questionId: string;
  taskType: string;
  userAnswer: string;
  correctAnswer: string;
  explanation: string;
  correctStreak?: number;
  createdAt: any;
}

export async function saveMistake(
  questionId: string, 
  taskType: string, 
  userAnswer: string, 
  correctAnswer: string, 
  explanation: string
) {
  if (!auth.currentUser) throw new Error('User not authenticated');
  
  await addDoc(collection(db, 'mistakes'), {
    userId: auth.currentUser.uid,
    questionId,
    taskType,
    userAnswer,
    correctAnswer,
    explanation,
    correctStreak: 0,
    createdAt: serverTimestamp(),
  });
}

export async function getMistakes(): Promise<Mistake[]> {
  if (!auth.currentUser) return [];
  
  const q = query(
    collection(db, 'mistakes'),
    where('userId', '==', auth.currentUser.uid),
    orderBy('createdAt', 'desc')
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Mistake));
}

export async function updateMistakeReview(mistakeId: string, correct: boolean) {
  if (!auth.currentUser) throw new Error('User not authenticated');
  const ref = doc(db, 'mistakes', mistakeId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  const currentStreak = correct ? (data.correctStreak || 0) + 1 : 0;

  if (currentStreak >= 2) {
    await deleteDoc(ref);
  } else {
    await updateDoc(ref, { correctStreak: currentStreak });
  }
}

export async function deleteMistake(mistakeId: string) {
  if (!auth.currentUser) throw new Error('User not authenticated');
  await deleteDoc(doc(db, 'mistakes', mistakeId));
}
