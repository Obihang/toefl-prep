import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles, CheckCircle2, Award, BookOpen } from 'lucide-react';

interface Correction {
  original: string;
  corrected: string;
  explanation: string;
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
}

// Simple inline highlighter component
const HighlightedText: React.FC<{ text: string; corrections: Correction[] }> = ({ text, corrections }) => {
  // Sort by length to avoid partial matches on longer phrases
  const sortedCorrections = [...corrections].sort((a, b) => b.original.length - a.original.length);

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  
  const matches: { start: number; end: number; correction: Correction }[] = [];
  
  for (const corr of sortedCorrections) {
    let index = text.indexOf(corr.original, 0);
    // Find all occurrences
    while (index !== -1) {
      matches.push({ start: index, end: index + corr.original.length, correction: corr });
      index = text.indexOf(corr.original, index + corr.original.length);
    }
  }

  // Filter overlapping matches (keep only the longest one)
  matches.sort((a, b) => a.start - b.start);
  const nonOverlappingMatches = [];
  let lastEnd = -1;
  for (const match of matches) {
    if (match.start >= lastEnd) {
      nonOverlappingMatches.push(match);
      lastEnd = match.end;
    }
  }
  
  nonOverlappingMatches.forEach(({ start, end, correction }) => {
    parts.push(text.substring(lastIndex, start));
    parts.push(
      <span key={start} className="group relative inline-block cursor-help border-b-2 border-rose-300 bg-rose-50 text-rose-900">
        {text.substring(start, end)}
        <span className="absolute left-0 top-full z-10 hidden w-64 translate-y-2 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg group-hover:block">
          <p className="mb-1 font-semibold text-rose-700">Correction: "{correction.corrected}"</p>
          <p className="text-slate-600">{correction.explanation}</p>
        </span>
      </span>
    );
    lastIndex = end;
  });
  parts.push(text.substring(lastIndex));
  
  return <>{parts}</>;
};

export const FeedbackComparison: React.FC<Props> = ({
  userResponse,
  exemplarResponse,
  corrections,
  topFixes,
  modelBand6Rewrite,
  benchmarkAnalysis,
  notice,
  subScores,
}) => {
  const displayExemplar = modelBand6Rewrite || exemplarResponse;
  const [isBenchmarkOpen, setIsBenchmarkOpen] = useState(true);

  // Transition marker highlight in exemplar
  const defaultTransitions = [
    'consequently', 'furthermore', 'moreover', 'however', 'in contrast',
    'specifically', 'therefore', 'nevertheless', 'on the other hand',
    'conversely', 'in addition', 'thus', 'as a result'
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
    <div className="space-y-4">
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
            <div className="text-sm font-bold text-teal-900 mt-0.5">{subScores.taskFulfillment.toFixed(1)} / 6.0</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-center shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Language Use</span>
            <div className="text-sm font-bold text-teal-900 mt-0.5">{subScores.languageUse.toFixed(1)} / 6.0</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-center shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Topic Development</span>
            <div className="text-sm font-bold text-teal-900 mt-0.5">{subScores.topicDevelopment.toFixed(1)} / 6.0</div>
          </div>
        </div>
      )}

      {topFixes && topFixes.length > 0 && (
        <div className="bg-amber-50/70 border border-amber-200/90 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-600 text-[11px] font-bold text-white">
              ★
            </span>
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900">
              Top 2 Actionable Fixes (Priority For Next Band)
            </h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {topFixes.slice(0, 2).map((fix, idx) => (
              <div key={idx} className="bg-white border border-amber-200 rounded-lg p-3 text-xs text-slate-800 flex items-start gap-2.5 shadow-2xs">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800 font-bold text-xs mt-0.5">
                  {idx + 1}
                </span>
                <span className="leading-snug">{fix.replace(/^[0-9]+[.)]\s*/, '')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700">Your Response</h4>
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-900 whitespace-pre-line">
            <HighlightedText text={userResponse} corrections={corrections} />
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

      {/* Interactive Band 6.0 Benchmark Accordion */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
        <button
          type="button"
          onClick={() => setIsBenchmarkOpen(!isBenchmarkOpen)}
          className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between text-left transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-teal-700" />
            <span className="text-xs font-bold text-slate-800">
              Compare with Band 6.0 Benchmark: Rhetorical Devices &amp; Discourse Markers
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
                <span className="font-bold text-slate-900 block flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                  Key Rhetorical Devices
                </span>
                <ul className="list-disc list-inside space-y-1 text-slate-600">
                  {(benchmarkAnalysis?.rhetoricalDevices || [
                    'Nuanced concession acknowledging counterarguments before asserting position',
                    'Direct thesis statement with clear causal connectors',
                    'Specific academic exemplification avoiding generic assertions',
                  ]).map((dev, i) => (
                    <li key={i}>{dev}</li>
                  ))}
                </ul>
              </div>

              <div className="bg-teal-50/60 p-3 rounded-lg border border-teal-200 space-y-1.5">
                <span className="font-bold text-teal-950 block flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-teal-700" />
                  Why This Achieves Band 6.0
                </span>
                <p className="text-teal-900 leading-relaxed">
                  {benchmarkAnalysis?.whyBand6 ||
                    'Demonstrates syntactic variety by alternating compound and complex sentences, utilizes domain-specific vocabulary, and maintains seamless cohesion across all discourse units without grammatical ambiguity.'}
                </p>
              </div>
            </div>

            <div className="pt-1 text-[11px] text-slate-500 flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 bg-teal-100 border border-teal-300 rounded-xs"></span>
              <span>Highlighted words indicate high-scoring discourse transitions that signal clear organizational logic to ETS scoring raters.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
