import React from 'react';
import {
  Sparkles,
  Award,
  BookOpen,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
} from 'lucide-react';

export interface SpeakingEvaluationCardProps {
  evaluationResult: any;
  task?: any;
  isBenchmarkOpen: boolean;
  onToggleBenchmark: () => void;
}

export const SpeakingEvaluationCard: React.FC<SpeakingEvaluationCardProps> = ({
  evaluationResult,
  task,
  isBenchmarkOpen,
  onToggleBenchmark,
}) => {
  if (!evaluationResult) return null;

  const bandScore =
    evaluationResult.bandScore6 ??
    (evaluationResult.scaledScore >= 29
      ? 6.0
      : evaluationResult.scaledScore >= 26
      ? 5.5
      : evaluationResult.scaledScore >= 23
      ? 5.0
      : evaluationResult.scaledScore >= 20
      ? 4.5
      : 4.0);

  const modelResponseText =
    evaluationResult.modelBand6Rewrite ||
    evaluationResult.exemplar ||
    (task as any)?.modelResponse ||
    (task as any)?.sampleAnswer;

  return (
    <div className="bg-white border border-teal-200 rounded-xl p-6 shadow-xs space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-teal-700">Official ETS Rater Assessment</span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs font-medium text-slate-600">{evaluationResult.performanceLevel}</span>
          </div>
          <h3 className="text-lg font-bold text-slate-900 mt-1">Speaking Interview Evaluation Report</h3>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="bg-teal-50 border border-teal-200 px-3 py-1.5 rounded-lg text-center">
            <div className="text-[10px] text-teal-700 font-semibold uppercase tracking-wider">TOEFL Band (1-6)</div>
            <div className="text-base font-mono font-bold text-teal-900">
              Band {bandScore.toFixed(1)} / 6.0
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-center">
            <div className="text-[10px] text-slate-500 font-medium">Task Rubric</div>
            <div className="text-base font-mono font-bold text-slate-800">
              {evaluationResult.rawRubricScore ?? evaluationResult.bandScore} / 4.0
            </div>
          </div>
          <div className="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-center">
            <div className="text-[10px] text-slate-300 font-medium">Scaled Score</div>
            <div className="text-base font-mono font-bold text-teal-400">
              {evaluationResult.scaledScore} / 30
            </div>
          </div>
        </div>
      </div>

      {evaluationResult.notice && (
        <div className="flex items-center gap-2 p-2.5 bg-blue-50/80 border border-blue-200 text-blue-900 rounded-lg text-xs font-medium">
          <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
          <span>{evaluationResult.notice}</span>
        </div>
      )}

      {evaluationResult.subScores && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-center shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Task Fulfillment</span>
            <div className="text-sm font-bold text-teal-900 mt-0.5">{evaluationResult.subScores.taskFulfillment.toFixed(1)} / 6.0</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-center shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Language Use</span>
            <div className="text-sm font-bold text-teal-900 mt-0.5">{evaluationResult.subScores.languageUse.toFixed(1)} / 6.0</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-center shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Topic Development</span>
            <div className="text-sm font-bold text-teal-900 mt-0.5">{evaluationResult.subScores.topicDevelopment.toFixed(1)} / 6.0</div>
          </div>
        </div>
      )}

      <div className="text-sm text-slate-700 bg-slate-50 p-4 rounded-lg leading-relaxed">
        {evaluationResult.summary}
      </div>

      {/* Criteria Grid */}
      {Array.isArray(evaluationResult.criteria) && evaluationResult.criteria.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {evaluationResult.criteria.map((crit: any, i: number) => (
            <div key={i} className="border border-slate-200 rounded-lg p-3.5 bg-white">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-900">{crit.name}</span>
                <span className="text-xs font-mono font-bold text-teal-800">
                  {crit.displayScore || (typeof crit.score === 'number' && crit.score <= 5 ? `${crit.score.toFixed(1)} / 5.0` : crit.score)}
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-snug">{crit.feedback || crit.comment}</p>
            </div>
          ))}
        </div>
      )}

      {/* Metrics per Question */}
      {Array.isArray(evaluationResult.submissionData) && evaluationResult.submissionData.length > 0 && (
        <div className="space-y-3 pt-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700">Speaking Analytics</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {evaluationResult.submissionData.map((sub: any, i: number) => (
              <div key={i} className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
                <div className="font-semibold text-slate-800 mb-1">Q{i + 1}: {String(sub.question || '').substring(0, 30)}...</div>
                <div className="flex gap-4 text-slate-600">
                  <div>Fillers: <span className="font-mono font-bold text-amber-700">{sub.fillerCount}</span></div>
                  <div>WPM: <span className="font-mono font-bold text-teal-700">{sub.wpm}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grammar & Language Corrections */}
      {Array.isArray(evaluationResult.corrections) && evaluationResult.corrections.length > 0 && (
        <div className="space-y-2.5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
            Key Language &amp; Syntax Improvements
          </h4>
          <div className="space-y-2">
            {evaluationResult.corrections.map((corr: any, i: number) => (
              <div key={i} className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-lg text-xs space-y-1">
                <div className="text-slate-700">
                  <span className="text-rose-700 line-through mr-2">"{corr.original}"</span>
                  <strong className="text-emerald-800">→ "{corr.corrected}"</strong>
                </div>
                <div className="text-slate-500 italic">{corr.explanation}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top 2 Actionable Fixes */}
      {Array.isArray(evaluationResult.topFixes) && evaluationResult.topFixes.length > 0 && (
        <div className="bg-amber-50/70 border border-amber-200/90 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-600 text-[11px] font-bold text-white">
              ★
            </span>
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900">
              Top 2 Actionable Fixes (Priority For Next Band)
            </h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {evaluationResult.topFixes.slice(0, 2).map((fix: string, idx: number) => (
              <div key={idx} className="bg-white border border-amber-200 rounded-lg p-3 text-xs text-slate-800 flex items-start gap-2.5 shadow-2xs">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800 font-bold text-xs mt-0.5">
                  {idx + 1}
                </span>
                <span className="leading-snug">{String(fix).replace(/^[0-9]+[.)]\s*/, '')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* High-Scoring Model Response / Model Band 6.0 Rewrite */}
      {Boolean(modelResponseText) && (
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-teal-800 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-teal-600" />
              Model Band 6.0 Exemplar (ETS Benchmark)
            </h4>
            <span className="text-[10px] text-teal-700 font-medium bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
              Target Exemplar
            </span>
          </div>
          <div className="bg-teal-50/50 border border-teal-200/70 p-4 rounded-lg text-xs sm:text-sm text-teal-950 leading-relaxed font-normal whitespace-pre-line">
            {modelResponseText}
          </div>
        </div>
      )}

      {/* Interactive Band 6.0 Benchmark Accordion */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
        <button
          type="button"
          onClick={onToggleBenchmark}
          className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between text-left transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-teal-700" />
            <span className="text-xs font-bold text-slate-800">
              Compare with Band 6.0 Benchmark: Rhetorical Devices &amp; Transitions
            </span>
          </div>
          {isBenchmarkOpen ? (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          )}
        </button>

        {isBenchmarkOpen && (
          <div className="p-4 space-y-3.5 text-xs text-slate-700 border-t border-slate-200 bg-white">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                  Key Rhetorical Devices
                </span>
                <ul className="list-disc list-inside space-y-1 text-slate-600">
                  {(evaluationResult.benchmarkAnalysis?.rhetoricalDevices || [
                    'Nuanced concession acknowledging counterarguments before asserting position',
                    'Direct thesis statement with clear causal connectors',
                    'Specific academic exemplification avoiding generic assertions',
                  ]).map((dev: string, i: number) => (
                    <li key={i}>{dev}</li>
                  ))}
                </ul>
              </div>

              <div className="bg-teal-50/60 p-3 rounded-lg border border-teal-200 space-y-1.5">
                <span className="font-bold text-teal-950 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-teal-700" />
                  Why This Achieves Band 6.0
                </span>
                <p className="text-teal-900 leading-relaxed">
                  {evaluationResult.benchmarkAnalysis?.whyBand6 ||
                    'Demonstrates continuous vocal fluency, sophisticated discourse connectors, balanced sentence rhythm, and immediate topic resolution without acoustic hesitation.'}
                </p>
              </div>
            </div>

            <div className="pt-1 text-[11px] text-slate-500 flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 bg-teal-100 border border-teal-300 rounded-xs"></span>
              <span>Evaluated against ETS TOEFL iBT Speaking Rubric standard descriptors.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
