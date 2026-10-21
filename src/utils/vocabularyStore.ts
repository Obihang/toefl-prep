/**
 * Vocabulary Bookmarking Store for TOEFL Practice.
 * Persists bookmarked academic vocabulary words in localStorage under 'toefl_vocabulary_list'.
 */

export interface VocabularyItem {
  id: string;
  word: string;
  contextSentence?: string;
  definition?: string;
  section?: string;
  timestamp: number;
}

const VOCAB_KEY = 'toefl_vocabulary_list';

export function getVocabularyList(): VocabularyItem[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(VOCAB_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveVocabularyWord(
  word: string,
  contextSentence?: string,
  definition?: string,
  section?: string
): VocabularyItem {
  const cleanWord = word.trim().replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '');
  const id = cleanWord.toLowerCase();
  const list = getVocabularyList();

  const existingIdx = list.findIndex((item) => item.id === id);
  const newItem: VocabularyItem = {
    id,
    word: cleanWord,
    contextSentence: contextSentence?.trim(),
    definition: definition?.trim(),
    section: section || 'Practice',
    timestamp: Date.now(),
  };

  if (existingIdx >= 0) {
    list[existingIdx] = newItem;
  } else {
    list.unshift(newItem);
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(VOCAB_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('toefl_vocab_updated'));
  }

  return newItem;
}

export function removeVocabularyWord(word: string): void {
  const id = word.trim().toLowerCase().replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '');
  if (typeof localStorage === 'undefined') return;
  try {
    const list = getVocabularyList().filter((item) => item.id !== id);
    localStorage.setItem(VOCAB_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('toefl_vocab_updated'));
  } catch (e) {
    console.warn('Failed to remove vocabulary item:', e);
  }
}

export function isWordSaved(word: string): boolean {
  const id = word.trim().toLowerCase().replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '');
  if (typeof localStorage === 'undefined' || !id) return false;
  return getVocabularyList().some((item) => item.id === id);
}

export function clearVocabularyList(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(VOCAB_KEY);
  window.dispatchEvent(new CustomEvent('toefl_vocab_updated'));
}
