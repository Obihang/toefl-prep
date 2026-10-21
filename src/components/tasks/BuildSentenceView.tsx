import React, { useState, useEffect } from 'react';
import { BuildSentenceTask, BuildSentenceItem } from '../../data/curatedQuestions';
import { RotateCcw, CheckCircle2, ArrowRight, HelpCircle } from 'lucide-react';
import { convertToScaledScore, convertScaledToBand6, savePracticeRecord } from '../../utils/scoreTracker';
import { auth } from '../../firebase';
import { saveMistake } from '../../utils/mistakes';

interface Props {
  task: BuildSentenceTask;
  onNextTask?: () => void;
}

interface ItemState {
  builtWords: string[];
  remainingWords: string[];
  isCorrect?: boolean;
  checked: boolean;
}

function shuffleWords(words: string[], answer?: string): string[] {
  if (!Array.isArray(words) || words.length <= 1) return [...(words || [])];
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  const targetClean = answer ? clean(answer) : '';

  let shuffled = [...words];
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
    clean(shuffled.join(' ')).startsWith(targetClean.slice(0, 15))
  );

  if (targetClean && clean(shuffled.join(' ')) === targetClean && shuffled.length > 1) {
    const mid = Math.floor(shuffled.length / 2);
    [shuffled[0], shuffled[mid]] = [shuffled[mid], shuffled[0]];
  }

  return shuffled;
}

export const BuildSentenceView: React.FC<Props> = ({ task, onNextTask }) => {
  const [states, setStates] = useState<ItemState[]>(() =>
    (task.items || []).map((item) => ({
      builtWords: [],
      remainingWords: shuffleWords(item.words, item.answer),
      checked: false,
    }))
  );

  useEffect(() => {
    setStates(
      (task.items || []).map((item) => ({
        builtWords: [],
        remainingWords: shuffleWords(item.words, item.answer),
        checked: false,
      }))
    );
  }, [task.id, task.title]);

  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9'\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const handleAddWord = (itemIdx: number, word: string, wordIdx: number) => {
    if (states[itemIdx].checked) return;

    setStates((prev) => {
      const next = [...prev];
      const cur = next[itemIdx];
      const updatedRemaining = cur.remainingWords.filter((_, i) => i !== wordIdx);
      const updatedBuilt = [...cur.builtWords, word];
      next[itemIdx] = {
        ...cur,
        builtWords: updatedBuilt,
        remainingWords: updatedRemaining,
      };
      return next;
    });
  };

  const handleRemoveWord = (itemIdx: number, word: string, wordIdx: number) => {
    if (states[itemIdx].checked) return;

    setStates((prev) => {
      const next = [...prev];
      const cur = next[itemIdx];
      const updatedBuilt = cur.builtWords.filter((_, i) => i !== wordIdx);
      const updatedRemaining = [...cur.remainingWords, word];
      next[itemIdx] = {
        ...cur,
        builtWords: updatedBuilt,
        remainingWords: updatedRemaining,
      };
      return next;
    });
  };

  const handleResetItem = (itemIdx: number) => {
    setStates((prev) => {
      const next = [...prev];
      const original = task.items[itemIdx].words;
      next[itemIdx] = {
        builtWords: [],
        remainingWords: shuffleWords(original, task.items[itemIdx].answer),
        checked: false,
      };
      return next;
    });
  };

  const handleCheckItem = (itemIdx: number) => {
    const cur = states[itemIdx];
    const userBuilt = cur.builtWords.join(' ');
    const target = task.items[itemIdx].answer;

    const isMatch = normalize(userBuilt) === normalize(target);

    if (!isMatch && auth.currentUser) {
      saveMistake(
        task.title,
        'build-sentence',
        userBuilt,
        target,
        'Order the scrambled words correctly to form a grammatically valid sentence.'
      );
    }

    setStates((prev) => {
      const next = [...prev];
      next[itemIdx] = {
        ...next[itemIdx],
        isCorrect: isMatch,
        checked: true,
      };
      return next;
    });

    // Check if all are done
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
        maxScore: task.items.length,
        scaledScore30: convertToScaledScore(totalCorrect, task.items.length),
        timeSpentSeconds: 150,
        feedbackSummary: `Build a Sentence: scored ${totalCorrect}/${task.items.length} (${Math.round((totalCorrect / task.items.length) * 100)}%)`,
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
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
            <span>Writing Section</span>
            <span aria-hidden="true">·</span>
            <span>Build a Sentence</span>
            <span aria-hidden="true">·</span>
            <span>{task.items.length} Items</span>
            <span aria-hidden="true">·</span>
            <span className="capitalize">{task.level}</span>
          </div>
        </div>

        {completedCount > 0 && (
          <div className="flex items-center gap-2 text-xs bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-slate-700">
            <span>Completed: <strong className="font-mono">{completedCount}/{task.items.length}</strong></span>
            <span aria-hidden="true">·</span>
            <span>Score: <strong className="font-mono text-teal-800">{correctCount}/{completedCount}</strong></span>
            <span aria-hidden="true">·</span>
            <span>Est. TOEFL: <strong className="font-mono text-teal-800">Band {convertScaledToBand6(convertToScaledScore(correctCount, task.items.length)).toFixed(1)} / 6.0</strong></span>
          </div>
        )}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-700 leading-relaxed">
        <strong>Task Instructions:</strong> Click the scrambled word chips in the correct sequence to build a grammatically
        flawless sentence that responds to the context question. Tap a word in your sentence to return it to the bank.
      </div>

      <div className="space-y-5">
        {task.items.map((item: BuildSentenceItem, idx: number) => {
          const state = states[idx];
          const isFull = state.remainingWords.length === 0;

          return (
            <div
              key={idx}
              className={`bg-white border rounded-xl p-5 shadow-xs transition-colors ${
                state.checked
                  ? state.isCorrect
                    ? 'border-emerald-200 bg-emerald-50/20'
                    : 'border-rose-200 bg-rose-50/20'
                  : 'border-slate-200'
              }`}
            >
              <div className="flex items-start gap-2.5 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-md bg-slate-100 text-slate-700 text-xs font-semibold shrink-0">
                  {idx + 1}
                </span>
                <div>
                  <span className="text-xs text-slate-400 block uppercase font-medium">Context Prompt</span>
                  <p className="text-sm font-semibold text-slate-900 leading-snug">{item.context}</p>
                </div>
              </div>

              {/* Word Bank Chips */}
              <div className="space-y-3 pt-2">
                <div className="flex flex-wrap gap-2 min-h-[38px] p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  {state.remainingWords.length > 0 ? (
                    state.remainingWords.map((word, wIdx) => (
                      <button
                        key={wIdx}
                        disabled={state.checked}
                        onClick={() => handleAddWord(idx, word, wIdx)}
                        className="px-3 py-1.5 text-xs font-medium bg-white text-slate-800 border border-slate-300 hover:border-teal-600 hover:text-teal-900 rounded-md shadow-2xs transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-default"
                      >
                        {word}
                      </button>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400 italic py-1">All words placed into sentence</span>
                  )}
                </div>

                {/* Built Sentence Sandbox */}
                <div className="min-h-[52px] p-3 rounded-lg border border-dashed border-slate-300 bg-white flex flex-wrap items-center gap-2">
                  {state.builtWords.length > 0 ? (
                    state.builtWords.map((word, bIdx) => (
                      <button
                        key={bIdx}
                        disabled={state.checked}
                        onClick={() => handleRemoveWord(idx, word, bIdx)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md border shadow-2xs transition-all whitespace-nowrap shrink-0 ${
                          state.checked
                            ? state.isCorrect
                              ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                              : 'bg-rose-50 text-rose-900 border-rose-300'
                            : 'bg-teal-50 text-teal-900 border-teal-300 hover:bg-rose-50 hover:text-rose-900 hover:border-rose-300 cursor-pointer'
                        }`}
                        title={state.checked ? '' : 'Tap to return word to bank'}
                      >
                        {word}
                      </button>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400 italic">Tap word chips above to construct your sentence...</span>
                  )}
                </div>

                {/* Controls and Feedback */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    {!state.checked ? (
                      <>
                        <button
                          onClick={() => handleCheckItem(idx)}
                          disabled={!isFull}
                          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Check Sentence
                        </button>
                        <button
                          onClick={() => handleResetItem(idx)}
                          className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Reset
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleResetItem(idx)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
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
                      {state.isCorrect ? '✓ Correct Syntax' : '✗ Incorrect Word Order'}
                    </span>
                  )}
                </div>

                {/* Explanation on submit */}
                {state.checked && (
                  <div className="mt-3 pt-3 border-t border-slate-200/80 space-y-1.5 text-xs">
                    {!state.isCorrect && (
                      <div className="text-slate-800">
                        <strong className="text-emerald-800">Correct Target:</strong>{' '}
                        <span className="font-medium font-mono text-slate-900">{item.answer}</span>
                      </div>
                    )}
                    <div className="flex items-start gap-1.5 text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                      <HelpCircle className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <strong>Grammar Rule:</strong> {item.explanation}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {onNextTask && (
        <div className="pt-2 flex justify-end">
          <button
            onClick={onNextTask}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Next Syntax Challenge
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
