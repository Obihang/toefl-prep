import React, { useState, useEffect, useRef } from 'react';
import { CompleteWordsTask } from '../../data/curatedQuestions';
import { CheckCircle2, RotateCcw, ArrowRight, Info, Keyboard, Volume2, VolumeX } from 'lucide-react';
import { convertToScaledScore, convertScaledToBand6, savePracticeRecord } from '../../utils/scoreTracker';
import { auth } from '../../firebase';
import { saveMistake } from '../../utils/mistakes';
import { playSpeech, stopSpeaking, isAudioPlaying } from '../../utils/audioSpeech';

interface Props {
  task: CompleteWordsTask;
  onNextTask?: () => void;
}

interface BlankItem {
  prefix: string;
  solution: string;
  userValue: string;
  isCorrect?: boolean;
}

export const CompleteWordsView: React.FC<Props> = ({ task, onNextTask }) => {
  const [blanks, setBlanks] = useState<BlankItem[]>([]);
  const [segments, setSegments] = useState<Array<{ type: 'text' | 'blank'; value: string; blankIndex?: number }>>([]);
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState<{ correct: number; total: number } | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  // Parse text formatted with [[missing_letters]]
  useEffect(() => {
    const parts = task.text.split(/\[\[(.+?)\]\]/);
    const newBlanks: BlankItem[] = [];
    const newSegments: Array<{ type: 'text' | 'blank'; value: string; blankIndex?: number }> = [];

    let blankCounter = 0;
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) {
        // Plain text segment
        newSegments.push({ type: 'text', value: parts[i] });
      } else {
        // Blank solution
        const solution = parts[i];
        const prevText = parts[i - 1] || '';
        const match = prevText.match(/([a-zA-Z]+)$/);
        const prefix = match ? match[1] : '';

        newBlanks.push({
          prefix,
          solution,
          userValue: '',
        });

        newSegments.push({
          type: 'blank',
          value: solution,
          blankIndex: blankCounter,
        });
        blankCounter++;
      }
    }

    setBlanks(newBlanks);
    setSegments(newSegments);
    setChecked(false);
    setScore(null);
    setFocusedIndex(null);
  }, [task]);

  const handleCheck = () => {
    let correctCount = 0;
    const evaluated = blanks.map((b) => {
      const isRight = b.userValue.trim().toLowerCase() === b.solution.toLowerCase();
      if (isRight) correctCount++;
      return { ...b, isCorrect: isRight };
    });

    setBlanks(evaluated);
    setChecked(true);
    setScore({ correct: correctCount, total: blanks.length });

    if (auth.currentUser) {
      evaluated.forEach((b) => {
        if (!b.isCorrect) {
          saveMistake(
            task.title,
            'complete-words',
            b.userValue || '(blank)',
            b.solution,
            `Complete the word: prefix "${b.prefix}", correct full word ends with "${b.solution}"`
          );
        }
      });
    }

    // Save record
    const scaledScore = convertToScaledScore(correctCount, blanks.length);
    savePracticeRecord({
      taskType: 'complete-words',
      taskTitle: task.title,
      section: 'Reading',
      score: correctCount,
      maxScore: blanks.length,
      scaledScore30: scaledScore,
      timeSpentSeconds: 60,
      feedbackSummary: `Complete the Words: scored ${correctCount}/${blanks.length} content words (${Math.round((correctCount / blanks.length) * 100)}%)`,
    });
  };

  // Keyboard shortcut Ctrl+Enter or Cmd+Enter to submit anywhere
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!checked) {
          handleCheck();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [blanks, checked]);

  const handleInputChange = (index: number, val: string) => {
    if (checked) return;
    const clean = val.replace(/[^a-zA-Z]/g, '');
    const maxLen = blanks[index].solution.length;
    const truncated = clean.slice(0, maxLen);

    const updated = [...blanks];
    updated[index].userValue = truncated;
    setBlanks(updated);

    // Auto-focus next input when current blank is filled
    if (truncated.length === maxLen && index < blanks.length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    // Ctrl + Enter (or Cmd + Enter) submits the answers
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleCheck();
      return;
    }

    // Pressing Enter advances to the next answer dash
    if (e.key === 'Enter') {
      e.preventDefault();
      const nextIndex = (index + 1) % blanks.length;
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    // Backspace jumps to previous blank if current is empty
    if (e.key === 'Backspace' && !blanks[index].userValue && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleReset = () => {
    setBlanks((prev) => prev.map((b) => ({ ...b, userValue: '', isCorrect: undefined })));
    setChecked(false);
    setScore(null);
    setFocusedIndex(null);
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">{task.title}</h2>
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 flex-wrap">
            <span>Reading Section</span>
            <span aria-hidden="true">·</span>
            <span>Complete the Words (C-Test)</span>
            <span aria-hidden="true">·</span>
            <span>{((task as any).source === 'ai') ? `✨ Generated by @${(task as any).generatedBy || 'Scholar'}` : '📚 Curated Bank'}</span>
            <span aria-hidden="true">·</span>
            <span>{blanks.length} Word Underlines</span>
            <span aria-hidden="true">·</span>
            <span className="capitalize">{task.level}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (isPlayingAudio || isAudioPlaying()) {
                stopSpeaking();
                setIsPlayingAudio(false);
              } else {
                setIsPlayingAudio(true);
                const readableText = task.text.replace(/\[\[(.+?)\]\]/g, '$1');
                playSpeech(readableText, {
                  voiceName: 'Kore',
                  onEnd: () => setIsPlayingAudio(false),
                  onError: () => setIsPlayingAudio(false),
                });
              }
            }}
            className="px-3 py-1.5 text-xs font-semibold bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 rounded-lg flex items-center gap-1.5 transition cursor-pointer"
          >
            {isPlayingAudio ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-teal-700" />}
            <span>{isPlayingAudio ? 'Stop' : 'Listen'}</span>
          </button>

          <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
            <Keyboard className="w-3.5 h-3.5 text-slate-400" />
            <span><strong className="font-semibold text-slate-800">Enter</strong>: Next dash</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span><strong className="font-semibold text-teal-800">Ctrl + Enter</strong>: Submit</span>
          </div>
        </div>
      </div>

      {/* Official Exam Format Context Note */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-700 leading-relaxed flex items-start gap-2.5">
        <Info className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
        <div>
          <strong>Navigation Guide:</strong> A vertical blinking cursor line indicates your active typing position.
          Press <strong>Enter</strong> to jump to the next word blank, and press <strong>Ctrl + Enter</strong> to check your answers.
        </div>
      </div>

      {/* Interactive C-Test Paragraph with Cursor and Discrete Slots */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs">
        <p className="text-base sm:text-lg leading-loose text-slate-800 font-normal">
          {segments.map((seg, idx) => {
            if (seg.type === 'text') {
              return <span key={idx}>{seg.value}</span>;
            }

            const bIndex = seg.blankIndex ?? 0;
            const blank = blanks[bIndex];
            if (!blank) return null;

            const targetLength = blank.solution.length;
            const isRight = blank.isCorrect === true;
            const isWrong = blank.isCorrect === false;
            const isFocused = focusedIndex === bIndex;
            const isFullyFilled = blank.userValue.length === targetLength;

            return (
              <span
                key={idx}
                onClick={() => inputRefs.current[bIndex]?.focus()}
                className="inline-flex items-baseline align-baseline relative cursor-text select-none group"
              >
                {/* Hidden input capturing exact keystrokes */}
                <input
                  ref={(el) => {
                    inputRefs.current[bIndex] = el;
                  }}
                  type="text"
                  maxLength={targetLength}
                  value={blank.userValue}
                  disabled={checked}
                  onFocus={() => setFocusedIndex(bIndex)}
                  onBlur={() => setFocusedIndex(null)}
                  onChange={(e) => handleInputChange(bIndex, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(bIndex, e)}
                  className="absolute inset-0 opacity-0 cursor-text z-10 w-full h-full pointer-events-auto"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-label={`Blank ${bIndex + 1} (${targetLength} letters)`}
                />

                {/* Visible discrete letter slots with high-contrast cursor */}
                <span
                  className={`inline-flex items-baseline border-b-2 transition-colors relative ${
                    checked
                      ? isRight
                        ? 'border-emerald-600 bg-emerald-50/70'
                        : 'border-rose-500 bg-rose-50/70'
                      : isFocused
                      ? 'border-teal-700 bg-teal-50/40'
                      : 'border-slate-900 bg-transparent'
                  }`}
                >
                  {Array.from({ length: targetLength }).map((_, charIdx) => {
                    const char = blank.userValue[charIdx];
                    const isCurrentSlot = isFocused && blank.userValue.length === charIdx;

                    return (
                      <span
                        key={charIdx}
                        className={`inline-flex items-center justify-center min-w-[15px] sm:min-w-[17px] h-6 px-[1px] font-mono text-base sm:text-lg font-bold transition-all relative ${
                          checked
                            ? isRight
                              ? 'text-emerald-900'
                              : 'text-rose-900'
                            : char
                            ? 'text-slate-950'
                            : 'text-slate-900 font-extrabold'
                        }`}
                      >
                        {/* Blinking Vertical Cursor Bar */}
                        {isCurrentSlot && !checked && (
                          <span
                            aria-hidden="true"
                            className="absolute -left-[1px] top-[2px] bottom-[2px] w-[2.5px] bg-teal-700 animate-pulse rounded-full z-20 shadow-xs"
                          />
                        )}

                        {char ? (
                          char
                        ) : (
                          // Bold, high-contrast, fully visible dash
                          <span className="text-slate-800 font-extrabold leading-none pb-0.5">_</span>
                        )}
                      </span>
                    );
                  })}

                  {/* Cursor at the end of word when full and focused */}
                  {isFocused && isFullyFilled && !checked && (
                    <span
                      aria-hidden="true"
                      className="absolute -right-[1px] top-[2px] bottom-[2px] w-[2.5px] bg-teal-700 animate-pulse rounded-full z-20 shadow-xs"
                    />
                  )}
                </span>

                {/* Correction badge when checked and incorrect */}
                {checked && isWrong && (
                  <span className="inline-flex items-center text-xs font-mono font-bold text-emerald-800 ml-1.5 bg-emerald-100/90 px-1.5 py-0.5 rounded border border-emerald-400">
                    {blank.solution}
                  </span>
                )}
              </span>
            );
          })}
        </p>
      </div>

      {/* Score and Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
        <div className="flex items-center gap-3">
          {!checked ? (
            <button
              onClick={handleCheck}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-lg shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Check Answers (Ctrl+Enter)
            </button>
          ) : (
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Try Again
            </button>
          )}

          {onNextTask && (
            <button
              onClick={onNextTask}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Next Practice Item
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {score && (
          <div className="flex items-center gap-4 text-sm bg-slate-50 border border-slate-200 px-4 py-2 rounded-lg">
            <span className="text-slate-600">
              Score: <strong className="text-slate-900 font-mono text-base">{score.correct}</strong> / {score.total}
            </span>
            <span aria-hidden="true" className="text-slate-300">|</span>
            <span className="text-slate-600">
              Accuracy: <strong className="text-teal-700 font-mono">{Math.round((score.correct / score.total) * 100)}%</strong>
            </span>
            <span aria-hidden="true" className="text-slate-300">|</span>
            <span className="text-slate-600">
              Est. TOEFL: <strong className="text-teal-800 font-mono">Band {convertScaledToBand6(convertToScaledScore(score.correct, score.total)).toFixed(1)} / 6.0</strong> <span className="text-slate-500 font-mono text-xs">({convertToScaledScore(score.correct, score.total)}/30)</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
