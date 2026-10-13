import React, { useState } from 'react';
import { WriteEmailTask } from '../../data/curatedQuestions';
import { Send, Sparkles, AlertCircle, ArrowRight } from 'lucide-react';
import { savePracticeRecord } from '../../utils/scoreTracker';
import { FeedbackComparison } from '../shared/FeedbackComparison';
import { auth } from '../../firebase';
import { saveMistake } from '../../utils/mistakes';
import { getApiHeaders } from '../../utils/apiKey';

interface Props {
  task: WriteEmailTask;
  onNextTask?: () => void;
}

export const WriteEmailView: React.FC<Props> = ({ task, onNextTask }) => {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState<any>(null);
  const [evalError, setEvalError] = useState<string | null>(null);

  const wordCount = body.trim() ? body.trim().split(/\s+/).filter(Boolean).length : 0;
  const isWithinTarget = wordCount >= 80 && wordCount <= 130;

  const handleEvaluate = async () => {
    if (wordCount < 40) {
      setEvalError('Please write at least 40 words before submitting for official TOEFL evaluation.');
      return;
    }

    setIsEvaluating(true);
    setEvalError(null);

    try {
      const res = await fetch('/api/evaluate-response', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({
          taskType: 'write-email',
          promptData: {
            title: task.title,
            situation: task.situation,
            recipient: task.recipient,
            goals: task.goals,
            suggestedWordCount: task.suggestedWordCount,
          },
          studentResponse: {
            subject,
            body,
            wordCount,
          },
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Evaluation service unavailable');
      }

      setEvalResult(json.data);

      if (json.data.corrections && auth.currentUser) {
        for (const correction of json.data.corrections) {
          await saveMistake(
            task.id,
            'write-email',
            correction.original,
            correction.corrected,
            correction.explanation
          );
        }
      }

      const scaled = json.data.scaledScore || 25;
      const band6 = json.data.bandScore6 ?? (scaled >= 29 ? 6.0 : scaled >= 26 ? 5.5 : scaled >= 23 ? 5.0 : scaled >= 20 ? 4.5 : scaled >= 17 ? 4.0 : 3.5);

      savePracticeRecord({
        taskType: 'write-email',
        taskTitle: task.title,
        section: 'Writing',
        score: scaled,
        maxScore: 30,
        scaledScore30: scaled,
        bandScore6: band6,
        timeSpentSeconds: 300,
        feedbackSummary: `Email Writing: Band ${band6.toFixed(1)}/6.0 · Raw Rubric: ${json.data.rawRubricScore ?? json.data.bandScore}/5.0 (${json.data.performanceLevel})`,
      });
    } catch (err: any) {
      setEvalError(err.message || 'Failed to connect to AI evaluator');
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">{task.title}</h2>
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
            <span>Writing Section</span>
            <span aria-hidden="true">·</span>
            <span>Write an Email</span>
            <span aria-hidden="true">·</span>
            <span>Target: {task.suggestedWordCount}</span>
            <span aria-hidden="true">·</span>
            <span className="capitalize">{task.level}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">Word Count:</span>
          <span
            className={`font-mono font-bold px-2 py-0.5 rounded ${
              isWithinTarget
                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                : wordCount > 0
                ? 'bg-amber-100 text-amber-900'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            {wordCount} words
          </span>
        </div>
      </div>

      {/* Situation & Required Goals */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 space-y-4 bg-slate-50 border border-slate-200 rounded-xl p-5">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
              Background Situation
            </span>
            <p className="text-sm text-slate-800 leading-relaxed font-normal">{task.situation}</p>
          </div>

          <div className="pt-3 border-t border-slate-200">
            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-2">
              Mandatory Objectives (Must Cover All 3):
            </span>
            <ul className="space-y-2">
              {task.goals.map((g, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-700 leading-snug">
                  <span className="flex items-center justify-center w-4 h-4 rounded-full bg-teal-100 text-teal-800 font-bold shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span>{g}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="pt-2 text-xs text-slate-500">
            Recipient: <strong className="text-slate-800">{task.recipient}</strong>
          </div>
        </div>

        {/* Email Client Composer */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3.5">
          <div className="space-y-2 pb-2 border-b border-slate-100 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-16 text-slate-400 font-medium">To:</span>
              <span className="font-medium text-slate-800">{task.recipient}</span>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="email-subject" className="w-16 text-slate-400 font-medium">
                Subject:
              </label>
              <input
                id="email-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g., Extension Request for Lab Paper (Marcus Vance)"
                className="flex-1 px-2.5 py-1 text-xs border border-slate-200 rounded-md bg-slate-50 focus:bg-white focus:border-teal-600 outline-hidden font-medium text-slate-900"
              />
            </div>
          </div>

          <textarea
            rows={10}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={`Dear ${task.recipient.split(',')[0]},\n\nI am writing to...`}
            className="w-full p-3.5 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-teal-600 focus:ring-2 focus:ring-teal-100 outline-hidden leading-relaxed font-normal"
          />

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <span className="text-xs text-slate-500">
              {wordCount < 80 ? `Needs ${80 - wordCount} more words to reach target (80-120 words)` : 'Target length achieved.'}
            </span>

            <button
              onClick={handleEvaluate}
              disabled={isEvaluating}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg shadow-xs transition-colors whitespace-nowrap"
            >
              {isEvaluating ? (
                <>
                  <Sparkles className="w-4 h-4 animate-spin" /> Evaluating...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" /> Evaluate with AI Rater
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {evalError && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-center gap-3 text-xs text-rose-800">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{evalError}</span>
        </div>
      )}

      {/* AI Evaluation Diagnostic Card */}
      {evalResult && (
        <div className="bg-white border border-teal-200 rounded-xl p-6 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-teal-700">Official ETS Rater Assessment</span>
                <span className="text-xs text-slate-400">·</span>
                <span className="text-xs font-medium text-slate-600">{evalResult.performanceLevel}</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mt-1">Email Writing Diagnostic Report</h3>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="bg-teal-50 border border-teal-200 px-3 py-1.5 rounded-lg text-center">
                <div className="text-[10px] text-teal-700 font-semibold uppercase tracking-wider">TOEFL Band (1-6)</div>
                <div className="text-base font-mono font-bold text-teal-900">
                  Band {(evalResult.bandScore6 ?? (evalResult.scaledScore >= 29 ? 6.0 : evalResult.scaledScore >= 26 ? 5.5 : evalResult.scaledScore >= 23 ? 5.0 : evalResult.scaledScore >= 20 ? 4.5 : 4.0)).toFixed(1)} / 6.0
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-center">
                <div className="text-[10px] text-slate-500 font-medium">Task Rubric</div>
                <div className="text-base font-mono font-bold text-slate-800">
                  {evalResult.rawRubricScore ?? evalResult.bandScore} / 5.0
                </div>
              </div>
              <div className="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-center">
                <div className="text-[10px] text-slate-300 font-medium">Scaled Score</div>
                <div className="text-base font-mono font-bold text-teal-400">
                  {evalResult.scaledScore} / 30
                </div>
              </div>
            </div>
          </div>

          <div className="text-sm text-slate-700 bg-slate-50 p-4 rounded-lg leading-relaxed">
            {evalResult.summary}
          </div>

          {/* Criteria Grid */}
          {evalResult.criteria && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {evalResult.criteria.map((crit: any, i: number) => (
                <div key={i} className="border border-slate-200 rounded-lg p-3.5 bg-white">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-900">{crit.name}</span>
                    <span className="text-xs font-mono font-bold text-teal-800">{crit.score}</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-snug">{crit.comment}</p>
                </div>
              ))}
            </div>
          )}

          {/* Feedback Comparison */}
          {evalResult && (
            <FeedbackComparison
              userResponse={body}
              exemplarResponse={evalResult.exemplar}
              corrections={evalResult.corrections || []}
            />
          )}
        </div>
      )}

      {onNextTask && (
        <div className="pt-2 flex justify-end">
          <button
            onClick={onNextTask}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Next Email Prompt
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
