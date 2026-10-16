import React, { useState, useEffect, useCallback } from 'react';
import { VocabularyPopover } from './VocabularyPopover';

interface Props {
  taskType: string;
}

export const SelectionHandler: React.FC<Props> = ({ taskType }) => {
  const [selectionInfo, setSelectionInfo] = useState<{
    text: string;
    context: string;
    position: { x: number; y: number };
  } | null>(null);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    // Do not trigger inside inputs, textareas, or blank input fields
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.closest('input') ||
      target.closest('textarea') ||
      target.closest('[data-no-select-vocab]')
    ) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      return;
    }

    const text = selection.toString().trim();
    if (!text) return;

    // Up to 3 words
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length > 3 || words.length === 0) {
      return;
    }

    // Find surrounding context sentence
    let contextSentence = '';
    try {
      const anchorNode = selection.anchorNode;
      if (anchorNode && anchorNode.parentElement) {
        const parentBlock = anchorNode.parentElement.closest('p, div, li, span');
        if (parentBlock) {
          contextSentence = parentBlock.textContent || '';
        }
      }
    } catch {}

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    setSelectionInfo({
      text,
      context: contextSentence || text,
      position: { x: rect.left + rect.width / 2, y: rect.bottom + 8 },
    });
  }, []);

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseUp]);

  if (!selectionInfo) return null;

  return (
    <VocabularyPopover
      selectedText={selectionInfo.text}
      contextSentence={selectionInfo.context}
      taskType={taskType}
      position={selectionInfo.position}
      onClose={() => setSelectionInfo(null)}
    />
  );
};
