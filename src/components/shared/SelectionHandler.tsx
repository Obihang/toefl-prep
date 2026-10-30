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

  const processSelection = useCallback((e?: MouseEvent) => {
    const target = e?.target as HTMLElement | undefined;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.closest('input') ||
        target.closest('textarea') ||
        target.closest('[data-no-select-vocab]') ||
        target.closest('button'))
    ) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      return;
    }

    const rawText = selection.toString().trim();
    if (!rawText) return;

    // Clean word per requirement: selectedWord = window.getSelection()?.toString().trim().replace(/[^a-zA-Z-]/g, '')
    const selectedWord = rawText.replace(/[^a-zA-Z-]/g, '').trim();
    if (selectedWord.length < 3) return;

    // Ensure it's not a huge paragraph selection (max 3 words)
    const words = rawText.split(/\s+/).filter(Boolean);
    if (words.length > 3) return;

    // Find surrounding context sentence
    let contextSentence = '';
    try {
      const anchorNode = selection.anchorNode;
      if (anchorNode && anchorNode.parentElement) {
        const parentBlock = anchorNode.parentElement.closest('p, div, li, span, blockquote, td, th');
        if (parentBlock) {
          contextSentence = (parentBlock.textContent || '').trim();
        }
      }
    } catch {}

    try {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0 && e) {
        setSelectionInfo({
          text: selectedWord,
          context: contextSentence || selectedWord,
          position: { x: e.clientX, y: e.clientY + 12 },
        });
      } else {
        setSelectionInfo({
          text: selectedWord,
          context: contextSentence || selectedWord,
          position: { x: rect.left + rect.width / 2, y: rect.bottom + 8 },
        });
      }
    } catch {
      if (e) {
        setSelectionInfo({
          text: selectedWord,
          context: contextSentence || selectedWord,
          position: { x: e.clientX, y: e.clientY + 12 },
        });
      }
    }
  }, []);

  const handleSelectionTrigger = useCallback((e: MouseEvent) => {
    // Delay slightly to allow the browser selection to settle, especially on double click
    setTimeout(() => {
      processSelection(e);
    }, 20);
  }, [processSelection]);

  useEffect(() => {
    document.addEventListener('mouseup', handleSelectionTrigger);
    document.addEventListener('dblclick', handleSelectionTrigger);
    return () => {
      document.removeEventListener('mouseup', handleSelectionTrigger);
      document.removeEventListener('dblclick', handleSelectionTrigger);
    };
  }, [handleSelectionTrigger]);

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
