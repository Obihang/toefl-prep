import React from 'react';
import {
  Sparkles,
  Award,
  CheckCircle2,
  AlertCircle,
  Volume2,
} from 'lucide-react';
import { HighlightedText } from '../../shared/FeedbackComparison';

export interface SpeakingEvaluationCardProps {
  evaluationResult: any;
  task?: any;
  isBenchmarkOpen?: boolean;
  onToggleBenchmark?: () => void;
}

const DEFAULT_TRANSITIONS = [
  'consequently', 'furthermore', 'moreover', 'however', 'in contrast',
  'specifically', 'therefore', 'nevertheless', 'on the other hand',
  'conversely', 'in addition', 'thus', 'as a result', 'for instance',
  'for example', 'ultimately', 'additionally', 'notably', 'similarly',
];

function highlightTransitions(content: string) {
  if (!content) return content;
  const regex = new RegExp(`\\b(${DEFAULT_TRANSITIONS.join('|')})\\b`, 'gi');
  const segments = content.split(regex);
  return segments.map((seg, idx) => {
    if (DEFAULT_TRANSITIONS.some((t) => t.toLowerCase() === seg.toLowerCase())) {
      return (
        <span
          key={idx}
          className="bg-teal-100 text-teal-900 font-semibold px-1 rounded-sm border-b border-teal-300"
          title="Academic Discourse Marker"
        >
          {seg}
        </span>
      );
    }
    return seg;
  });
}

export const SpeakingEvaluationCard: React.FC<SpeakingEvaluationCardProps> = ({
  evaluationResult,
  task,
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

  const rawRubric = evaluationResult.rawRubricScore ?? evaluationResult.bandScore;
  const rawRubricDisplay =
    typeof rawRubric === 'number' && rawRubric <= 5
      ? rawRubric.toFixed(1)
      : String(rawRubric || '4.5');

  const questions: any[] = Array.isArray(task?.questions) ? task.questions : [];
  const submissionData: any[] = Array.isArray(evaluationResult.submissionData)
    ? evaluationResult.submissionData
    : [];

  const safeCorrections = Array.isArray(evaluationResult.corrections)
    ? evaluationResult.corrections
    : [];

  return (
    <div className="bg-white border border-teal-200 rounded-xl p-6 shadow-xs space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-teal-700">Official ETS Rater Assessment</span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs font-medium text-slate-600">{evaluationResult.performanceLevel || 'High-Intermediate'}</span>
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
              {rawRubricDisplay} / 5.0
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

      {/* SubScores */}
      {evaluationResult.subScores && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-center shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Task Fulfillment</span>
            <div className="text-sm font-bold text-teal-900 mt-0.5">{Number(evaluationResult.subScores.taskFulfillment || 0).toFixed(1)} / 6.0</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-center shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Language Use</span>
            <div className="text-sm font-bold text-teal-900 mt-0.5">{Number(evaluationResult.subScores.languageUse || 0).toFixed(1)} / 6.0</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-center shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Topic Development</span>
            <div className="text-sm font-bold text-teal-900 mt-0.5">{Number(evaluationResult.subScores.topicDevelopment || 0).toFixed(1)} / 6.0</div>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="text-sm text-slate-700 bg-slate-50 p-4 rounded-lg leading-relaxed">
        {evaluationResult.summary}
      </div>

      {/* Criteria Breakdown Grid */}
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

      {/* Top 2 Actionable Fixes */}
      {Array.isArray(evaluationResult.topFixes) && evaluationResult.topFixes.length > 0 && (
        <div className="bg-amber-50/70 border border-amber-200/90 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-600 text-[11px] font-bold text-white">
              ★
            </span>
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900">
              Top Actionable Fixes (Priority For Next Band)
            </h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
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

      {/* Side-by-Side 2-Column Review (Annotated Spoken Transcripts Q1-Q4 vs Band 6.0 Exemplar Responses Q1-Q4) */}
      <div className="space-y-4 pt-2">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Left Column: ANNOTATED SPOKEN TRANSCRIPTS (Q1-Q4) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2 pb-1 border-b border-slate-200">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Annotated Spoken Transcript Review — Q1 to Q4
              </h4>
              {safeCorrections.length > 0 && (
                <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                  {safeCorrections.length} Highlighted Fix{safeCorrections.length === 1 ? '' : 'es'}
                </span>
              )}
            </div>

            <div className="space-y-4">
              {questions.map((q, idx) => {
                const sub = submissionData[idx];
                const transcript = sub?.transcript || '';
                const qCorrections = sub?.corrections || safeCorrections;
                const fillerCount = sub?.fillerCount ?? 0;
                const wpm = sub?.wpm ?? 0;

                return (
                  <div key={idx} className="border border-slate-200 rounded-xl p-4 bg-white space-y-2.5 shadow-2xs">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                        Question {idx + 1}
                      </span>
                      <div className="flex items-center gap-2 flex-wrap text-[11px]">
                        {wpm > 0 && (
                          <span className="font-mono text-slate-600 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">
                            {wpm} WPM
                          </span>
                        )}
                        {fillerCount === 0 ? (
                          <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">
                            0 fillers ✓
                          </span>
                        ) : fillerCount <= 2 ? (
                          <span className="text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">
                            {fillerCount} natural filler{fillerCount > 1 ? 's' : ''} ✓
                          </span>
                        ) : (
                          <span className="text-amber-800 bg-amber-50 border border-amber-300 px-1.5 py-0.5 rounded font-bold">
                            ⚠️ {fillerCount} fillers
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-xs font-medium text-slate-600 italic">
                      "{q.question}"
                    </p>

                    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-xs leading-6 text-slate-900 whitespace-pre-line">
                      {transcript.trim() ? (
                        <HighlightedText text={transcript} corrections={qCorrections} />
                      ) : (
                        <span className="text-slate-400 italic">
                          (No spoken response recorded for Question {idx + 1})
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: BAND 6.0 MODEL EXEMPLAR RESPONSES (Q1-Q4) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2 pb-1 border-b border-teal-200">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-teal-800 flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-teal-600" />
                Band 6.0 Model Exemplar Responses — Q1 to Q4
              </h4>
              <span className="text-[10px] text-teal-700 font-medium bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                Target Benchmark
              </span>
            </div>

            <div className="space-y-4">
              {questions.map((q, idx) => {
                const sub = submissionData[idx];
                const modelAnswer =
                  sub?.modelAnswer ||
                  evaluationResult.questionModelAnswers?.[idx] ||
                  q.sampleAnswer ||
                  `In addressing ${q.question.toLowerCase().replace(/[?.]+$/, '')}, I believe this is a critical consideration in higher education. Having clear institutional guidelines and proactive community support ensures that all students can navigate their academic responsibilities effectively while developing essential lifelong skills.`;

                return (
                  <div key={idx} className="border border-teal-200 rounded-xl p-4 bg-teal-50/40 space-y-2.5 shadow-2xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-teal-900 bg-teal-100/80 px-2 py-0.5 rounded">
                        Q{idx + 1} Model Answer
                      </span>
                      <span className="text-[10px] font-semibold text-teal-700 bg-white border border-teal-200 px-2 py-0.5 rounded-full">
                        ~45s Response · Band 6.0
                      </span>
                    </div>

                    <p className="text-xs font-medium text-teal-900/80 italic">
                      "{q.question}"
                    </p>

                    <div className="rounded-lg border border-teal-200 bg-white/90 p-3 text-xs leading-relaxed text-teal-950 whitespace-pre-line">
                      {highlightTransitions(modelAnswer)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Grammar, Mechanics & Disfluency Breakdown */}
      {safeCorrections.length > 0 && (
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Grammar, Collocation &amp; Speech Disfluency Breakdown ({safeCorrections.length})
            </h4>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-medium">Red = Spoken Issue / Stutter</span>
              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">Green = Recommended Correction</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {safeCorrections.map((corr: any, idx: number) => (
              <div key={idx} className="p-3 bg-white border border-slate-200 rounded-lg text-xs space-y-1.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                    {corr.type === 'wording' ? 'Better Wording' : corr.explanation.includes('Disfluency') ? 'Speech Disfluency' : 'Grammar & Syntax'}
                  </span>
                </div>
                <div className="text-slate-700 pt-0.5">
                  <span className="text-rose-700 line-through mr-2 font-semibold">"{corr.original}"</span>
                  <strong className="text-emerald-800">→ "{corr.corrected}"</strong>
                </div>
                <p className="text-slate-500 text-[11px] leading-snug">{corr.explanation}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
