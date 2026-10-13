import React, { useState } from 'react';
import { ReadingPassageTask } from '../../data/curatedQuestions';
import { CheckCircle2, RotateCcw, ArrowRight, HelpCircle, Highlighter, AlertCircle } from 'lucide-react';
import { convertToScaledScore, convertScaledToBand6, savePracticeRecord } from '../../utils/scoreTracker';
import { auth } from '../../firebase';
import { saveMistake } from '../../utils/mistakes';

interface Props {
  task: ReadingPassageTask;
  onNextTask?: () => void;
}

export const ReadingPassageView: React.FC<Props> = ({ task, onNextTask }) => {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [isHighlightMode, setIsHighlightMode] = useState(false);

  const handleSelect = (qIdx: number, optIdx: number) => {
    if (submitted) return;
    setSelectedAnswers((prev) => ({ ...prev, [qIdx]: optIdx }));
  };

  const calculateScore = () => {
    let correct = 0;
    task.questions.forEach((q, i) => {
      if (selectedAnswers[i] === q.answer) correct++;
    });
    return correct;
  };

  const handleSubmit = () => {
    setSubmitted(true);
    const correctCount = calculateScore();
    const total = task.questions.length;
    const scaledScore = convertToScaledScore(correctCount, total);

    if (auth.currentUser) {
      task.questions.forEach((q, i) => {
        if (selectedAnswers[i] !== q.answer) {
          saveMistake(
            task.title,
            'reading-passage',
            q.options[selectedAnswers[i]] ?? 'No answer',
            q.options[q.answer],
            q.why
          );
        }
      });
    }

    savePracticeRecord({
      taskType: 'reading-passage',
      taskTitle: task.title,
      section: 'Reading',
      score: correctCount,
      maxScore: total,
      scaledScore30: scaledScore,
      timeSpentSeconds: 180,
      feedbackSummary: `Scored ${correctCount}/${total} on passage comprehension (${Math.round((correctCount / total) * 100)}%)`,
    });
  };

  const handleReset = () => {
    setSelectedAnswers({});
    setSubmitted(false);
  };

  const score = submitted ? calculateScore() : 0;
  const total = task.questions.length;
  const allAnswered = task.questions.every((_, i) => selectedAnswers[i] !== undefined);

  const missedIndices = React.useMemo(() => {
    if (!submitted) return [];
    return task.questions
      .map((q, i) => (selectedAnswers[i] !== q.answer ? i : -1))
      .filter((i) => i !== -1);
  }, [submitted, selectedAnswers, task.questions]);

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">{task.title}</h2>
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
            <span>Reading Section</span>
            <span aria-hidden="true">·</span>
            <span>Academic Passage</span>
            <span aria-hidden="true">·</span>
            <span>{task.questions.length} Questions</span>
            <span aria-hidden="true">·</span>
            <span className="capitalize">{task.level}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsHighlightMode(!isHighlightMode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              isHighlightMode
                ? 'bg-amber-100 text-amber-900 border-amber-300'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Highlighter className="w-3.5 h-3.5" />
            {isHighlightMode ? 'Highlighting Active' : 'Text Highlighter'}
          </button>
        </div>
      </div>

      {/* Two-Column Official Layout on Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Passage */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 shadow-xs lg:sticky lg:top-4 max-h-[75vh] overflow-y-auto">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Reading Passage</span>
            <span className="text-xs text-slate-400">
              {task.passage.split(/\s+/).length} words
            </span>
          </div>
          <div
            className={`prose prose-slate max-w-none text-slate-800 leading-relaxed text-sm sm:text-base font-normal selection:bg-amber-200 ${
              isHighlightMode ? 'cursor-text' : ''
            }`}
          >
            <p className="whitespace-pre-line">{task.passage}</p>
          </div>
        </div>

        {/* Right Column: Comprehension Questions */}
        <div className="lg:col-span-5 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Comprehension Questions</span>
            <span className="text-xs text-slate-500 font-mono">
              {Object.keys(selectedAnswers).length}/{total} Answered
            </span>
          </div>

          {task.questions.map((q, qIdx) => {
            const userChoice = selectedAnswers[qIdx];
            const isCorrect = userChoice === q.answer;

            return (
              <div
                key={qIdx}
                id={`question-${qIdx}`}
                className={`bg-white border rounded-xl p-5 shadow-xs transition-colors ${
                  submitted
                    ? isCorrect
                      ? 'border-emerald-200 bg-emerald-50/20'
                      : 'border-rose-200 bg-rose-50/20'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex items-start gap-2.5 mb-3.5">
                  <span className="flex items-center justify-center w-6 h-6 rounded-md bg-slate-100 text-slate-700 text-xs font-semibold shrink-0">
                    {qIdx + 1}
                  </span>
                  <p className="text-sm font-semibold text-slate-900 leading-snug">{q.q}</p>
                </div>

                <div className="space-y-2">
                  {q.options.map((opt, optIdx) => {
                    const isSelected = userChoice === optIdx;
                    const isRightOption = q.answer === optIdx;

                    let optionClasses =
                      'border-slate-200 bg-slate-50/50 hover:bg-slate-100/70 text-slate-800';

                    if (submitted) {
                      if (isRightOption) {
                        optionClasses = 'border-emerald-500 bg-emerald-50 text-emerald-900 font-medium';
                      } else if (isSelected && !isRightOption) {
                        optionClasses = 'border-rose-400 bg-rose-50 text-rose-900';
                      } else {
                        optionClasses = 'border-slate-200 bg-white text-slate-400 opacity-60';
                      }
                    } else if (isSelected) {
                      optionClasses =
                        'border-teal-600 bg-teal-50/60 text-teal-950 ring-1 ring-teal-600 font-medium';
                    }

                    return (
                      <label
                        key={optIdx}
                        onClick={() => handleSelect(qIdx, optIdx)}
                        className={`flex items-start gap-3 p-3 rounded-lg border text-xs sm:text-sm cursor-pointer transition-all ${optionClasses}`}
                      >
                        <input
                          type="radio"
                          name={`q-${qIdx}`}
                          checked={isSelected}
                          disabled={submitted}
                          onChange={() => handleSelect(qIdx, optIdx)}
                          className="mt-0.5 text-teal-700 focus:ring-teal-500 shrink-0"
                        />
                        <span className="leading-snug">{opt}</span>
                      </label>
                    );
                  })}
                </div>

                {submitted && (
                  <div className="mt-3.5 pt-3 border-t border-slate-200/80 text-xs leading-relaxed">
                    <div className="flex items-start gap-1.5 text-slate-700">
                      <HelpCircle className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <strong className={isCorrect ? 'text-emerald-700' : 'text-slate-800'}>
                          {isCorrect ? 'Correct!' : 'Official Explanation:'}
                        </strong>{' '}
                        <span>{q.why}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            {!submitted ? (
              <button
                onClick={handleSubmit}
                disabled={!allAnswered}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 disabled:hover:bg-teal-700 rounded-lg shadow-xs transition-colors whitespace-nowrap"
              >
                <CheckCircle2 className="w-4 h-4" />
                Submit Answers
              </button>
            ) : (
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-4 h-4" />
                  Retake
                </button>
                {submitted && missedIndices.length > 0 && (
                  <button
                    onClick={() => {
                      const firstMissed = document.getElementById(`question-${missedIndices[0]}`);
                      firstMissed?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <AlertCircle className="w-4 h-4" />
                    Review Mistakes
                  </button>
                )}
                {onNextTask && (
                  <button
                    onClick={onNextTask}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    Next Passage
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {submitted && (
              <div className="flex items-center gap-3 text-xs sm:text-sm bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-lg">
                <span>
                  Score: <strong className="font-mono text-slate-900">{score}</strong>/{total}
                </span>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <span>
                  Est. Scaled: <strong className="font-mono text-teal-800">Band {convertScaledToBand6(convertToScaledScore(score, total)).toFixed(1)} / 6.0</strong> <span className="font-mono text-slate-500 text-xs">({convertToScaledScore(score, total)}/30)</span>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
