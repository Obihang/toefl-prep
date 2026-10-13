import { db, auth } from '../firebase';
import { collection, addDoc, getDocs, query, orderBy, where, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';

export interface Mistake {
  id: string;
  userId: string;
  questionId: string;
  taskType: string;
  userAnswer: string;
  correctAnswer: string;
  explanation: string;
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

export async function deleteMistake(mistakeId: string) {
  if (!auth.currentUser) throw new Error('User not authenticated');
  await deleteDoc(doc(db, 'mistakes', mistakeId));
}
