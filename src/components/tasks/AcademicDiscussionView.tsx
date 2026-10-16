import React, { useState, useEffect } from 'react';
import { AcademicDiscussionTask } from '../../data/curatedQuestions';
import { MessageSquare, Sparkles, Send, AlertCircle, ArrowRight, User } from 'lucide-react';
import { savePracticeRecord } from '../../utils/scoreTracker';
import { FeedbackComparison } from '../shared/FeedbackComparison';
import { auth } from '../../firebase';
import { saveMistake } from '../../utils/mistakes';
import { getApiHeaders } from '../../utils/apiKey';
import { markUserAiRequest } from '../../utils/userActivity';

interface Props {
  task: AcademicDiscussionTask;
  onNextTask?: () => void;
  onComplete?: (result: number) => void;
  onOpenApiKeySettings?: () => void;
}

export const AcademicDiscussionView: React.FC<Props> = ({ task, onNextTask, onComplete, onOpenApiKeySettings }) => {
  const [response, setResponse] = useState('');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalSeconds, setEvalSeconds] = useState(0);
  const [evalResult, setEvalResult] = useState<any>(null);
  const [evalError, setEvalError] = useState<string | null>(null);

  useEffect(() => {
    let interval: any = null;
    if (isEvaluating) {
      setEvalSeconds(0);
      interval = setInterval(() => setEvalSeconds((s) => s + 1), 1000);
    } else {
      setEvalSeconds(0);
    }
    return () => clearInterval(interval);
  }, [isEvaluating]);


  React.useEffect(() => {
    setResponse('');
    setIsEvaluating(false);
    setEvalResult(null);
    setEvalError(null);
  }, [task.id, task.title]);

  const wordCount = response.trim() ? response.trim().split(/\s+/).filter(Boolean).length : 0;
  const isTargetMet = wordCount >= 100 && wordCount <= 150;

  const handleEvaluate = async () => {
    markUserAiRequest();
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
          taskType: 'academic-discussion',
          promptData: {
            title: task.title,
            professor: `${task.professorName}: ${task.professorPrompt}`,
            s1: `${task.s1.name}: ${task.s1.text}`,
            s2: `${task.s2.name}: ${task.s2.text}`,
            question: task.question,
          },
          studentResponse: {
            response,
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
            'academic-discussion',
            correction.original,
            correction.corrected,
            correction.explanation
          );
        }
      }

      const scaled = json.data.scaledScore || 26;
      const band6 = json.data.bandScore6 ?? (scaled >= 29 ? 6.0 : scaled >= 26 ? 5.5 : scaled >= 23 ? 5.0 : scaled >= 20 ? 4.5 : scaled >= 17 ? 4.0 : 3.5);

      savePracticeRecord({
        taskType: 'academic-discussion',
        taskTitle: task.title,
        section: 'Writing',
        score: scaled,
        maxScore: 30,
        scaledScore30: scaled,
        bandScore6: band6,
        timeSpentSeconds: 420,
        feedbackSummary: `Academic Discussion: Band ${band6.toFixed(1)}/6.0 · Raw Rubric: ${json.data.rawRubricScore ?? json.data.bandScore}/5.0 (${json.data.performanceLevel})`,
      });

      onComplete?.(scaled);
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
            <span>Writing for an Academic Discussion</span>
            <span aria-hidden="true">·</span>
            <span>Target: 100-130 words</span>
            <span aria-hidden="true">·</span>
            <span className="capitalize">{task.level}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">Word Count:</span>
          <span
            className={`font-mono font-bold px-2 py-0.5 rounded ${
              isTargetMet
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

      {/* Discussion Board Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Course Forum Feed */}
        <div className="lg:col-span-6 space-y-4">
          {/* Professor's Post */}
          <div className="bg-slate-900 text-white rounded-xl p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5 border-b border-slate-800 pb-2.5">
              <div className="w-7 h-7 rounded-full bg-teal-500 text-slate-950 font-bold flex items-center justify-center text-xs">
                {task.professorName.charAt(0)}
              </div>
              <div>
                <span className="text-xs font-semibold text-teal-400 block">{task.professorName}</span>
                <span className="text-[11px] text-slate-400">Course Instructor · Discussion Board Topic</span>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-normal whitespace-pre-line">
              {task.professorPrompt}
            </p>
          </div>

          {/* Peer Posts */}
          <div className="space-y-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              Classmate Contributions
            </span>

            {/* Student 1 */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 font-semibold flex items-center justify-center text-xs">
                  <User className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-bold text-slate-800">{task.s1.name}</span>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-normal">{task.s1.text}</p>
            </div>

            {/* Student 2 */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 font-semibold flex items-center justify-center text-xs">
                  <User className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-bold text-slate-800">{task.s2.name}</span>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-normal">{task.s2.text}</p>
            </div>
          </div>
        </div>

        {/* Right Column: Student Response Box */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 mb-1">
              <MessageSquare className="w-3.5 h-3.5 text-teal-700" />
              <span>Your Contribution to the Discussion</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">{task.question}</p>
          </div>

          <textarea
            rows={12}
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder="Write your response here. Express your perspective, respond directly to Claire or David, and provide reasons and examples..."
            className="w-full p-3.5 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-teal-600 focus:ring-2 focus:ring-teal-100 outline-hidden leading-relaxed font-normal"
          />

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <span className="text-xs text-slate-500">
              {wordCount < 100 ? `${100 - wordCount} more words to reach target (100-130 words)` : 'Optimal length reached.'}
            </span>

            <button
              onClick={handleEvaluate}
              disabled={isEvaluating}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg shadow-xs transition-colors whitespace-nowrap"
            >
              {isEvaluating ? (
                <>
                  <Sparkles className="w-4 h-4 animate-spin" /> Scoring your answer... {evalSeconds}s
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
        (evalError.toLowerCase().includes('no api key') ||
         evalError.toLowerCase().includes('invalid api key') ||
         evalError.toLowerCase().includes('api key not valid') ||
         evalError.toLowerCase().includes('add yours in dashboard') ||
         evalError.toLowerCase().includes('settings & api key')) ? (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-amber-900">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Add your free API key to use AI features</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
              {onOpenApiKeySettings && (
                <button
                  onClick={onOpenApiKeySettings}
                  className="px-3 py-1.5 bg-teal-800 hover:bg-teal-900 text-white font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Configure API Key
                </button>
              )}
              <span className="text-slate-500 font-medium">Supports Gemini, NVIDIA, Groq, OpenRouter, and custom keys</span>
            </div>
          </div>
        ) : (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-center gap-3 text-xs text-rose-800">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{evalError}</span>
          </div>
        )
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
              <h3 className="text-lg font-bold text-slate-900 mt-1">Academic Discussion Evaluation Report</h3>
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
              userResponse={response}
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
            Next Discussion Topic
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
