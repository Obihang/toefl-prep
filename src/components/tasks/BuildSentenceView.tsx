import React, { useState, useEffect, useMemo } from 'react';
import { BuildSentenceTask } from '../../data/curatedQuestions';
import { RotateCcw, CheckCircle2, ArrowRight, HelpCircle, MessageSquare, User } from 'lucide-react';
import { convertToScaledScore, convertScaledToBand6, savePracticeRecord } from '../../utils/scoreTracker';
import { auth } from '../../firebase';
import { saveMistake } from '../../utils/mistakes';
import { normalizeBuildSentenceItem, NormalizedBuildSentenceItem, normalizeTileChunk } from '../../utils/taskNormalizer';

interface Props {
  task: BuildSentenceTask;
  onNextTask?: () => void;
}

interface ItemState {
  bankWords: string[];
  /** Each index 0..targetChunks.length-1 stores the bankWords index placed in that blank slot, or null if empty */
  slots: Array<number | null>;
  slotResults?: boolean[];
  isCorrect?: boolean;
  checked: boolean;
}

function shuffleBankWords(words: string[], targetChunks: string[]): string[] {
  const cleanWords = (words || []).map((w) => normalizeTileChunk(w)).filter(Boolean);
  if (cleanWords.length <= 1) return [...cleanWords];
  const targetClean = (targetChunks || []).map((c) => c.toLowerCase().trim()).join('|');

  const shuffled = [...cleanWords];
  let attempts = 0;
  do {
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    attempts++;
  } while (
    attempts < 15 &&
    targetClean &&
    shuffled.slice(0, targetChunks.length).map((c) => c.toLowerCase().trim()).join('|') === targetClean
  );

  if (
    targetClean &&
    shuffled.slice(0, targetChunks.length).map((c) => c.toLowerCase().trim()).join('|') === targetClean &&
    shuffled.length > 1
  ) {
    const mid = Math.floor(shuffled.length / 2);
    [shuffled[0], shuffled[mid]] = [shuffled[mid], shuffled[0]];
  }

  return shuffled;
}

function capitalizeFirstChar(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const SPEAKER_PAIRS = [
  { s1: 'Maya (Student)', s2: 'Liam (Student)', s1Color: 'bg-indigo-100 text-indigo-800 border-indigo-200', s2Color: 'bg-teal-100 text-teal-800 border-teal-200' },
  { s1: 'Prof. Miller', s2: 'Elena (Student)', s1Color: 'bg-amber-100 text-amber-900 border-amber-200', s2Color: 'bg-teal-100 text-teal-800 border-teal-200' },
  { s1: 'Noah (Advisor)', s2: 'Chloe (Student)', s1Color: 'bg-sky-100 text-sky-800 border-sky-200', s2Color: 'bg-teal-100 text-teal-800 border-teal-200' },
  { s1: 'Sophia (TA)', s2: 'Marcus (Student)', s1Color: 'bg-purple-100 text-purple-800 border-purple-200', s2Color: 'bg-teal-100 text-teal-800 border-teal-200' },
  { s1: 'Lucas (Student)', s2: 'Dr. Patel', s1Color: 'bg-emerald-100 text-emerald-800 border-emerald-200', s2Color: 'bg-teal-100 text-teal-800 border-teal-200' },
];

export const BuildSentenceView: React.FC<Props> = ({ task, onNextTask }) => {
  const normalizedItems = useMemo<NormalizedBuildSentenceItem[]>(() => {
    const rawItems = Array.isArray(task?.items)
      ? task.items
      : Array.isArray((task as any)?.questions)
      ? (task as any).questions
      : [];
    return rawItems.map((item: any, idx: number) =>
      normalizeBuildSentenceItem(item, idx, task?.topic, task?.title)
    );
  }, [task]);

  const buildInitialStates = (items: NormalizedBuildSentenceItem[]): ItemState[] =>
    items.map((item) => ({
      bankWords: shuffleBankWords(item.words, item.targetChunks),
      slots: new Array(item.targetChunks.length).fill(null),
      checked: false,
    }));

  const [states, setStates] = useState<ItemState[]>(() => buildInitialStates(normalizedItems));

  useEffect(() => {
    setStates(buildInitialStates(normalizedItems));
  }, [task.id, task.title, normalizedItems]);

  const handleClickBankTile = (itemIdx: number, bankIdx: number) => {
    const cur = states[itemIdx];
    if (!cur || cur.checked) return;

    // If this bank tile is already placed in a slot, clicking it in the bank returns it from that slot
    const existingSlotIdx = cur.slots.indexOf(bankIdx);
    if (existingSlotIdx !== -1) {
      setStates((prev) => {
        const next = [...prev];
        const updatedSlots = [...next[itemIdx].slots];
        updatedSlots[existingSlotIdx] = null;
        next[itemIdx] = {
          ...next[itemIdx],
          slots: updatedSlots,
        };
        return next;
      });
      return;
    }

    // Otherwise, place this bank tile into the first empty blank slot (0 .. targetChunks.length - 1)
    const firstEmptySlot = cur.slots.findIndex((s) => s === null);
    if (firstEmptySlot === -1) {
      // All blank slots are already filled; any remaining distractor tile stays in the bank
      return;
    }

    setStates((prev) => {
      const next = [...prev];
      const updatedSlots = [...next[itemIdx].slots];
      updatedSlots[firstEmptySlot] = bankIdx;
      next[itemIdx] = {
        ...next[itemIdx],
        slots: updatedSlots,
      };
      return next;
    });
  };

  const handleClickSlot = (itemIdx: number, slotIdx: number) => {
    const cur = states[itemIdx];
    if (!cur || cur.checked) return;
    if (cur.slots[slotIdx] === null) return;

    setStates((prev) => {
      const next = [...prev];
      const updatedSlots = [...next[itemIdx].slots];
      updatedSlots[slotIdx] = null;
      next[itemIdx] = {
        ...next[itemIdx],
        slots: updatedSlots,
      };
      return next;
    });
  };

  const handleResetItem = (itemIdx: number) => {
    const item = normalizedItems[itemIdx];
    if (!item) return;
    setStates((prev) => {
      const next = [...prev];
      next[itemIdx] = {
        bankWords: shuffleBankWords(item.words, item.targetChunks),
        slots: new Array(item.targetChunks.length).fill(null),
        checked: false,
      };
      return next;
    });
  };

  const normalizeChunkForCompare = (s: string) =>
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9'\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const reconstructUserSentence = (item: NormalizedBuildSentenceItem, state: ItemState): string => {
    const filledWords = state.slots.map((bIdx, sIdx) => {
      const raw = bIdx !== null ? state.bankWords[bIdx] || '' : '_____';
      return sIdx === 0 && !item.framePrefix ? capitalizeFirstChar(raw) : raw;
    });
    const middle = filledWords.join(' ');
    const prefixPart = item.framePrefix ? `${item.framePrefix} ` : '';
    const suffixText = item.frameSuffix || '.';
    const needsSpaceBeforeSuffix = !/^[.!?]/.test(suffixText);
    return `${prefixPart}${middle}${needsSpaceBeforeSuffix ? ' ' : ''}${suffixText}`.replace(/\s+/g, ' ').trim();
  };

  const handleCheckItem = (itemIdx: number) => {
    const cur = states[itemIdx];
    const item = normalizedItems[itemIdx];
    if (!cur || !item) return;

    const slotResults = item.targetChunks.map((targetChunk, sIdx) => {
      const bIdx = cur.slots[sIdx];
      const userChunk = bIdx !== null ? cur.bankWords[bIdx] || '' : '';
      return normalizeChunkForCompare(userChunk) === normalizeChunkForCompare(targetChunk);
    });

    const isMatch = slotResults.every(Boolean);
    const userFullSentence = reconstructUserSentence(item, cur);

    if (!isMatch && auth.currentUser) {
      saveMistake(
        task.title,
        'build-sentence',
        userFullSentence,
        item.targetSentence,
        item.grammarRule
      );
    }

    setStates((prev) => {
      const next = [...prev];
      next[itemIdx] = {
        ...next[itemIdx],
        slotResults,
        isCorrect: isMatch,
        checked: true,
      };
      return next;
    });

    // Check if all items are completed
    const allDone = states.every((s, i) => (i === itemIdx ? true : s.checked));
    if (allDone) {
      const totalCorrect = states.reduce(
        (acc, s, i) => acc + (i === itemIdx ? (isMatch ? 1 : 0) : s.isCorrect ? 1 : 0),
        0
      );
      savePracticeRecord({
        taskType: 'build-sentence',
        taskTitle: task.title,
        section: 'Writing',
        score: totalCorrect,
        maxScore: normalizedItems.length,
        scaledScore30: convertToScaledScore(totalCorrect, normalizedItems.length),
        timeSpentSeconds: 150,
        feedbackSummary: `Build a Sentence: scored ${totalCorrect}/${normalizedItems.length} (${Math.round((totalCorrect / normalizedItems.length) * 100)}%)`,
      });
    }
  };

  const completedCount = states.filter((s) => s.checked).length;
  const correctCount = states.filter((s) => s.isCorrect).length;

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">{task.title}</h2>
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 flex-wrap">
            <span>Writing Section</span>
            <span aria-hidden="true">·</span>
            <span>Build a Sentence</span>
            <span aria-hidden="true">·</span>
            <span>
              {(task as any).source === 'ai'
                ? `✨ Generated by @${(task as any).generatedBy || 'Scholar'}`
                : '📚 Official 2026 ETS Format'}
            </span>
            <span aria-hidden="true">·</span>
            <span>{normalizedItems.length} Exchanges</span>
            <span aria-hidden="true">·</span>
            <span className="capitalize">{task.level}</span>
          </div>
        </div>

        {completedCount > 0 && (
          <div className="flex items-center gap-2 text-xs bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-slate-700">
            <span>
              Completed: <strong className="font-mono">{completedCount}/{normalizedItems.length}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Score: <strong className="font-mono text-teal-800">{correctCount}/{completedCount}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Est. TOEFL:{' '}
              <strong className="font-mono text-teal-800">
                Band {convertScaledToBand6(convertToScaledScore(correctCount, normalizedItems.length)).toFixed(1)} / 6.0
              </strong>
            </span>
          </div>
        )}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-700 leading-relaxed">
        <strong>Official 2026 Task Instructions:</strong> Read Speaker 1&apos;s conversational prompt, then click the lowercase word and phrase tiles in the correct order to fill the underlined blank slots (<code className="font-mono text-teal-800">_____</code>) in Speaker 2&apos;s response. Some items include an extra distractor tile that is not used. Click any filled blank slot to return its tile to the bank.
      </div>

      <div className="space-y-6">
        {normalizedItems.map((item: NormalizedBuildSentenceItem, idx: number) => {
          const state = states[idx] || {
            bankWords: item.words,
            slots: new Array(item.targetChunks.length).fill(null),
            checked: false,
          };
          const filledCount = state.slots.filter((s) => s !== null).length;
          const totalSlots = item.targetChunks.length;
          const allSlotsFilled = filledCount === totalSlots;
          const speakers = SPEAKER_PAIRS[idx % SPEAKER_PAIRS.length];
          const suffixText = item.frameSuffix || '.';
          const isPunctuationOnlySuffix = /^[.!?]+$/.test(suffixText);

          return (
            <div
              key={item.id || idx}
              className={`bg-white border rounded-xl p-5 shadow-xs transition-colors space-y-4 ${
                state.checked
                  ? state.isCorrect
                    ? 'border-emerald-200 bg-emerald-50/15'
                    : 'border-rose-200 bg-rose-50/15'
                  : 'border-slate-200'
              }`}
            >
              {/* Item Header Badge */}
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-md bg-teal-800 text-white text-xs font-bold shrink-0">
                    {idx + 1}
                  </span>
                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Conversational Exchange {idx + 1} of {normalizedItems.length}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span>
                    Blanks Filled: <strong className="font-mono text-slate-700">{filledCount}/{totalSlots}</strong>
                  </span>
                  {item.distractorChunks && item.distractorChunks.length > 0 && (
                    <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-medium">
                      +1 Distractor Tile
                    </span>
                  )}
                </div>
              </div>

              {/* Row 1: Speaker 1 Avatar + Speech Bubble */}
              <div className="flex items-start gap-3">
                <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold shrink-0 ${speakers.s1Color}`}>
                  <User className="w-3.5 h-3.5" />
                  <span>{speakers.s1}</span>
                </div>
                <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl rounded-tl-xs px-4 py-3 text-sm font-medium text-slate-900 leading-relaxed shadow-2xs">
                  {item.context}
                </div>
              </div>

              {/* Middle Row: Lowercase Word & Phrase Bank */}
              <div className="pl-0 sm:pl-6 space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span>Word &amp; Phrase Bank (Click tiles in order to fill blanks below)</span>
                  {allSlotsFilled && state.bankWords.length > totalSlots && !state.checked && (
                    <span className="text-amber-700 font-medium normal-case">
                      All {totalSlots} blanks filled (1 extra tile remains unused)
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 p-3 bg-slate-50/90 rounded-xl border border-slate-200 min-h-[48px] items-center">
                  {state.bankWords.map((tileText, bIdx) => {
                    const placedInSlotIdx = state.slots.indexOf(bIdx);
                    const isUsed = placedInSlotIdx !== -1;

                    return (
                      <button
                        key={bIdx}
                        type="button"
                        disabled={state.checked}
                        onClick={() => handleClickBankTile(idx, bIdx)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all whitespace-nowrap shrink-0 ${
                          isUsed
                            ? 'bg-slate-100 text-slate-400 border-dashed border-slate-300 opacity-50 cursor-pointer hover:opacity-75'
                            : state.checked
                            ? 'bg-white text-slate-500 border-slate-200 cursor-default'
                            : allSlotsFilled
                            ? 'bg-white text-slate-500 border-slate-200 opacity-75 cursor-not-allowed'
                            : 'bg-white text-slate-800 border-slate-300 hover:border-teal-600 hover:bg-teal-50/40 hover:text-teal-900 shadow-2xs cursor-pointer'
                        }`}
                        title={
                          state.checked
                            ? ''
                            : isUsed
                            ? `Placed in blank #${placedInSlotIdx + 1} (click to remove)`
                            : allSlotsFilled
                            ? 'All blank slots are filled. Click a filled blank below to swap.'
                            : 'Click to place in next empty blank slot'
                        }
                      >
                        {tileText}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row 2: Speaker 2 Avatar + Response Sentence Line with Individual Underlined Blank Slots */}
              <div className="flex items-start gap-3">
                <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold shrink-0 ${speakers.s2Color}`}>
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{speakers.s2}</span>
                </div>

                <div className="flex-1 bg-white border-2 border-slate-200 rounded-xl rounded-tl-xs px-4 py-3.5 shadow-2xs">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-2.5 text-sm leading-relaxed text-slate-900">
                    {/* Fixed Frame Prefix */}
                    {item.framePrefix && (
                      <span className="font-semibold text-slate-900">{item.framePrefix}</span>
                    )}

                    {/* Exact targetChunks.length Individual Underlined Blank Slots */}
                    {state.slots.map((placedBankIdx, slotIdx) => {
                      const hasTile = placedBankIdx !== null;
                      const rawTileText = hasTile ? state.bankWords[placedBankIdx] || '' : '';
                      const displayTileText =
                        hasTile && slotIdx === 0 && !item.framePrefix
                          ? capitalizeFirstChar(rawTileText)
                          : rawTileText;
                      const slotCorrect = state.slotResults ? state.slotResults[slotIdx] : undefined;

                      return (
                        <button
                          key={slotIdx}
                          type="button"
                          disabled={state.checked || !hasTile}
                          onClick={() => handleClickSlot(idx, slotIdx)}
                          className={`inline-flex items-center justify-center min-w-[76px] px-2.5 py-1 text-sm font-semibold border-b-2 transition-all rounded-t-md ${
                            !hasTile
                              ? 'border-slate-400 bg-slate-50/70 text-slate-400 cursor-default select-none'
                              : state.checked
                              ? slotCorrect
                                ? 'border-emerald-600 bg-emerald-50 text-emerald-900 cursor-default'
                                : 'border-rose-600 bg-rose-50 text-rose-900 cursor-default'
                              : 'border-teal-700 bg-teal-50/80 text-teal-950 hover:bg-rose-50 hover:border-rose-500 hover:text-rose-900 cursor-pointer'
                          }`}
                          title={
                            state.checked
                              ? slotCorrect
                                ? 'Correct slot'
                                : `Expected: "${
                                    slotIdx === 0 && !item.framePrefix
                                      ? capitalizeFirstChar(item.targetChunks[slotIdx])
                                      : item.targetChunks[slotIdx]
                                  }"`
                              : hasTile
                              ? 'Click to remove tile back to bank'
                              : `Blank slot ${slotIdx + 1}`
                          }
                        >
                          {hasTile ? (
                            <span>{displayTileText}</span>
                          ) : (
                            <span className="font-mono text-xs tracking-widest text-slate-400">_____</span>
                          )}
                        </button>
                      );
                    })}

                    {/* Fixed Frame Suffix / Terminal Punctuation */}
                    {suffixText && (
                      <span
                        className={`font-semibold text-slate-900 ${
                          isPunctuationOnlySuffix ? '-ml-1.5' : ''
                        }`}
                      >
                        {suffixText}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Controls & Evaluation Feedback */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  {!state.checked ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleCheckItem(idx)}
                        disabled={!allSlotsFilled}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Check Sentence
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResetItem(idx)}
                        className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Reset
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleResetItem(idx)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Try Again
                    </button>
                  )}
                </div>

                {state.checked && (
                  <span
                    className={`text-xs font-semibold ${
                      state.isCorrect ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {state.isCorrect
                      ? '✓ Correct Syntactic Sequence'
                      : `✗ ${state.slotResults?.filter(Boolean).length || 0}/${totalSlots} Blanks Correct`}
                  </span>
                )}
              </div>

              {/* Detailed Target & Grammar Explanation on Submit */}
              {state.checked && (
                <div className="mt-2 pt-3 border-t border-slate-200/80 space-y-2 text-xs">
                  <div className="text-slate-800 bg-emerald-50/60 border border-emerald-200/80 px-3 py-2 rounded-lg">
                    <strong className="text-emerald-900">Correct Target:</strong>{' '}
                    <span className="font-semibold text-slate-900">{item.targetSentence}</span>
                  </div>
                  {item.distractorChunks && item.distractorChunks.length > 0 && (
                    <div className="text-amber-900 bg-amber-50/70 border border-amber-200 px-3 py-1.5 rounded-lg">
                      <strong>Unused Distractor Tile:</strong>{' '}
                      <code className="font-mono font-semibold">{item.distractorChunks.join(', ')}</code>
                    </div>
                  )}
                  <div className="flex items-start gap-1.5 text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <HelpCircle className="w-3.5 h-3.5 text-teal-700 mt-0.5 shrink-0" />
                    <div>
                      <strong className="text-slate-800">Grammar Rule:</strong> {item.grammarRule}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {onNextTask && (
        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onNextTask}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Next Sentence Building Set
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
