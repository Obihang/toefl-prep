/**
 * Mistakes Bank Utility for TOEFL Zero-API Practice.
 * Persists wrong questions in localStorage under 'toefl_mistakes_bank'
 * so students can retry mistakes and track improvement offline.
 */

export interface MistakeRecord {
  questionId: string;
  section: string; // 'Reading' | 'Listening' | 'Complete Words' | 'Build Sentence'
  taskTitle?: string;
  promptText?: string;
  timestamp: number;
}

const MISTAKES_KEY = 'toefl_mistakes_bank';

export function getMistakesList(): MistakeRecord[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(MISTAKES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveQuestionMistake(questionId: string, section: string, taskTitle?: string, promptText?: string): void {
  if (typeof localStorage === 'undefined' || !questionId) return;
  try {
    const list = getMistakesList();
    const existingIdx = list.findIndex((m) => m.questionId === questionId);
    const newRecord: MistakeRecord = {
      questionId,
      section,
      taskTitle,
      promptText,
      timestamp: Date.now(),
    };
    if (existingIdx >= 0) {
      list[existingIdx] = newRecord;
    } else {
      list.unshift(newRecord);
    }
    localStorage.setItem(MISTAKES_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('toefl_mistakes_updated'));
  } catch (e) {
    console.warn('Failed to save mistake record:', e);
  }
}

export function removeQuestionMistake(questionId: string): void {
  if (typeof localStorage === 'undefined' || !questionId) return;
  try {
    const list = getMistakesList().filter((m) => m.questionId !== questionId);
    localStorage.setItem(MISTAKES_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('toefl_mistakes_updated'));
  } catch (e) {
    console.warn('Failed to remove mistake record:', e);
  }
}

export function isQuestionInMistakes(questionId: string): boolean {
  if (typeof localStorage === 'undefined' || !questionId) return false;
  return getMistakesList().some((m) => m.questionId === questionId);
}

export function clearAllMistakes(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(MISTAKES_KEY);
  window.dispatchEvent(new CustomEvent('toefl_mistakes_updated'));
}
