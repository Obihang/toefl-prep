import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles, CheckCircle2, Award, BookOpen, AlertTriangle } from 'lucide-react';
import { BulletAnalysisItem } from '../../utils/localEvaluator';

interface Correction {
  original: string;
  corrected: string;
  explanation: string;
  type?: 'grammar' | 'spelling' | 'mechanics' | 'wording';
}

interface BenchmarkAnalysis {
  rhetoricalDevices: string[];
  transitionMarkers: string[];
  whyBand6: string;
}

interface SubScores {
  taskFulfillment: number;
  languageUse: number;
  topicDevelopment: number;
}

interface Props {
  userResponse: string;
  exemplarResponse: string;
  corrections: Correction[];
  topFixes?: string[];
  modelBand6Rewrite?: string;
  benchmarkAnalysis?: BenchmarkAnalysis;
  notice?: string;
  subScores?: SubScores;
  bulletAnalysis?: BulletAnalysisItem[];
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Word-boundary-aware inline highlighter showing red strikethrough error + green correction badge
export const HighlightedText: React.FC<{ text: string; corrections: Correction[] }> = ({ text, corrections }) => {
  const safeCorrections = Array.isArray(corrections) ? corrections.filter((c) => c && c.original) : [];
  if (!text || safeCorrections.length === 0) {
    return <>{text}</>;
  }

  // Sort by length descending so multi-word phrases match before single words
  const sortedCorrections = [...safeCorrections].sort((a, b) => b.original.length - a.original.length);

  const matches: { start: number; end: number; correction: Correction }[] = [];

  for (const corr of sortedCorrections) {
    const orig = corr.original.trim();
    if (!orig) continue;

    let regex: RegExp;
    if (orig === 'i') {
      // Case-sensitive standalone lowercase 'i' (avoid matching 'I' or 'i' inside words)
      regex = /\bi\b(?!['.])/g;
    } else {
      const escaped = escapeRegExp(orig);
      const prefix = /^\w/.test(orig) ? '\\b' : '';
      const suffix = /\w$/.test(orig) ? '\\b' : '';
      try {
        regex = new RegExp(`${prefix}${escaped}${suffix}`, 'gi');
      } catch {
        continue;
      }
    }

    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        correction: corr,
      });
      if (match.index === regex.lastIndex) {
        regex.lastIndex++;
      }
    }
  }

  // Sort by start position, then longest match first, and filter overlapping matches
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const nonOverlappingMatches: { start: number; end: number; correction: Correction }[] = [];
  let lastEnd = -1;
  for (const match of matches) {
    if (match.start >= lastEnd) {
      nonOverlappingMatches.push(match);
      lastEnd = match.end;
    }
  }

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  nonOverlappingMatches.forEach(({ start, end, correction }) => {
    if (start > lastIndex) {
      parts.push(text.substring(lastIndex, start));
    }
    const matchedText = text.substring(start, end);
    const isWording = correction.type === 'wording';
    parts.push(
      <span key={`${start}-${end}`} className="group relative inline-flex items-baseline flex-wrap gap-1 mx-0.5 align-baseline">
        <span
          className={`px-1.5 py-0.5 rounded text-xs font-semibold line-through cursor-help ${
            isWording
              ? 'bg-amber-100 text-amber-900 border border-amber-300'
              : 'bg-rose-100 text-rose-900 border border-rose-300'
          }`}
        >
          {matchedText}
        </span>
        <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 cursor-help">
          → {correction.corrected}
        </span>
        <span className="pointer-events-none absolute left-0 bottom-full z-20 mb-1.5 hidden w-72 rounded-xl border border-slate-200 bg-slate-900 p-3 text-xs text-white shadow-xl group-hover:block">
          <span className="block font-bold text-emerald-300 mb-1">
            Fix: &ldquo;{correction.corrected}&rdquo;
          </span>
          <span className="block text-slate-200 leading-snug">{correction.explanation}</span>
        </span>
      </span>
    );
    lastIndex = end;
  });

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return <>{parts}</>;
};

function getCategoryBadge(type?: Correction['type'], explanation?: string) {
  const expLower = String(explanation || '').toLowerCase();
  if (type === 'spelling' || expLower.includes('spelling')) {
    return {
      label: 'Spelling',
      className: 'bg-rose-100 text-rose-800 border-rose-300',
    };
  }
  if (type === 'mechanics' || expLower.includes('capitalization') || expLower.includes('punctuation')) {
    return {
      label: 'Capitalization / Mechanics',
      className: 'bg-purple-100 text-purple-800 border-purple-300',
    };
  }
  if (type === 'wording' || expLower.includes('better wording') || expLower.includes('register')) {
    return {
      label: 'Better Wording / Register',
      className: 'bg-amber-100 text-amber-900 border-amber-300',
    };
  }
  return {
    label: 'Grammar & Collocation',
    className: 'bg-rose-50 text-rose-800 border-rose-200',
  };
}

export const FeedbackComparison: React.FC<Props> = ({
  userResponse,
  exemplarResponse,
  corrections,
  topFixes,
  modelBand6Rewrite,
  notice,
  subScores,
  bulletAnalysis,
}) => {
  const displayExemplar = modelBand6Rewrite || exemplarResponse;
  const safeCorrections = Array.isArray(corrections) ? corrections : [];
  const safeTopFixes = Array.isArray(topFixes) ? topFixes : [];
  const safeBullets = Array.isArray(bulletAnalysis) ? bulletAnalysis : [];

  const defaultTransitions = [
    'consequently', 'furthermore', 'moreover', 'however', 'in contrast',
    'specifically', 'therefore', 'nevertheless', 'on the other hand',
    'conversely', 'in addition', 'thus', 'as a result',
  ];

  const highlightExemplarTransitions = (content: string) => {
    if (!content) return content;
    const regex = new RegExp(`\\b(${defaultTransitions.join('|')})\\b`, 'gi');
    const segments = content.split(regex);
    return segments.map((seg, idx) => {
      if (defaultTransitions.some((t) => t.toLowerCase() === seg.toLowerCase())) {
        return (
          <span
            key={idx}
            className="bg-teal-100 text-teal-900 font-semibold px-1 rounded-sm border-b border-teal-300"
            title="Academic Transition Marker"
          >
            {seg}
          </span>
        );
      }
      return seg;
    });
  };

  return (
    <div className="space-y-5">
      {notice && (
        <div className="flex items-center gap-2 p-2.5 bg-blue-50/80 border border-blue-200 text-blue-900 rounded-lg text-xs font-medium">
          <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {subScores && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-center shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Task Fulfillment</span>
            <div className="text-sm font-bold text-teal-900 mt-0.5">{Number(subScores.taskFulfillment || 0).toFixed(1)} / 6.0</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-center shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Language Use</span>
            <div className="text-sm font-bold text-teal-900 mt-0.5">{Number(subScores.languageUse || 0).toFixed(1)} / 6.0</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-center shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Topic Development</span>
            <div className="text-sm font-bold text-teal-900 mt-0.5">{Number(subScores.topicDevelopment || 0).toFixed(1)} / 6.0</div>
          </div>
        </div>
      )}

      {/* Mandatory Bullet-Point / Objective Verification for Write an Email */}
      {safeBullets.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Mandatory Prompt Objectives Verification ({safeBullets.filter((b) => b.addressed).length}/{safeBullets.length} Complete)
            </h4>
            <span className="text-[11px] font-medium text-slate-500">
              ETS raters verify that all 3 communicative goals are specifically fulfilled
            </span>
          </div>
          <div className="space-y-2">
            {safeBullets.map((item, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                  item.addressed
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                    : 'bg-rose-50/80 border-rose-200 text-rose-950'
                }`}
              >
                {item.addressed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5">
                  <div className="font-semibold">
                    Objective #{idx + 1}: {item.goal}
                  </div>
                  <div className={item.addressed ? 'text-emerald-800' : 'text-rose-800 font-medium'}>
                    {item.feedback}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {safeTopFixes.length > 0 && (
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
            {safeTopFixes.slice(0, 2).map((fix, idx) => (
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Annotated Response Review (Errors &amp; Wording Highlights)
            </h4>
            {safeCorrections.length > 0 && (
              <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                {safeCorrections.length} Highlighted Fix{safeCorrections.length === 1 ? '' : 'es'}
              </span>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-900 whitespace-pre-line">
            <HighlightedText text={userResponse} corrections={safeCorrections} />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-teal-800 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-teal-600" />
              Band 6.0 Model Exemplar
            </h4>
            <span className="text-[10px] text-teal-700 font-medium bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
              Target Benchmark
            </span>
          </div>
          <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-4 text-sm leading-relaxed text-teal-950 whitespace-pre-line">
            {highlightExemplarTransitions(displayExemplar)}
          </div>
        </div>
      </div>

      {/* Detailed Grammar, Spelling, Capitalization & Better Wording Cards */}
      {safeCorrections.length > 0 && (
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Grammar, Spelling, Mechanics &amp; Better Wording Breakdown ({safeCorrections.length})
            </h4>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-medium">Red = Original Issue</span>
              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">Green = Recommended Fix</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {safeCorrections.map((corr, idx) => {
              const badge = getCategoryBadge(corr.type, corr.explanation);
              return (
                <div
                  key={idx}
                  className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${badge.className}`}>
                      {badge.label}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">#{idx + 1}</span>
                  </div>
                  <div className="flex items-baseline flex-wrap gap-1.5 text-xs pt-0.5">
                    <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-900 border border-rose-200 line-through font-semibold">
                      &ldquo;{corr.original}&rdquo;
                    </span>
                    <span className="text-slate-400 font-bold">→</span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold">
                      &ldquo;{corr.corrected}&rdquo;
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-snug">{corr.explanation}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
};
