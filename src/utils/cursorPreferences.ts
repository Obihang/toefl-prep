export type CursorObjectStyle = 'pen' | 'quill' | 'wand' | 'classic';

const STORAGE_KEY = 'toefl_cursor_object';

export function getCursorPreference(): CursorObjectStyle {
  if (typeof window === 'undefined') return 'pen';
  const val = localStorage.getItem(STORAGE_KEY);
  if (val === 'pen' || val === 'quill' || val === 'wand' || val === 'classic') {
    return val;
  }
  return 'pen'; // Default is Fountain Pen Nib
}

export function setCursorPreference(style: CursorObjectStyle): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, style);
  applyCursorPreference(style);
}

export function applyCursorPreference(style?: CursorObjectStyle): void {
  if (typeof document === 'undefined') return;
  const targetStyle = style || getCursorPreference();
  const root = document.documentElement;

  // Remove existing cursor classes
  root.classList.remove('cursor-obj-pen', 'cursor-obj-quill', 'cursor-obj-wand', 'cursor-obj-classic');
  root.classList.add(`cursor-obj-${targetStyle}`);
}
