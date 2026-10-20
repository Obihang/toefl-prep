import React, { useState } from 'react';

interface Correction {
  original: string;
  corrected: string;
  explanation: string;
}

interface Props {
  userResponse: string;
  exemplarResponse: string;
  corrections: Correction[];
  topFixes?: string[];
  modelBand6Rewrite?: string;
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

export const FeedbackComparison: React.FC<Props> = ({ userResponse, exemplarResponse, corrections, topFixes, modelBand6Rewrite }) => {
  const displayExemplar = modelBand6Rewrite || exemplarResponse;

  return (
    <div className="space-y-4">
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
          <h4 className="text-xs font-semibold uppercase tracking-wider text-teal-800">Model Band 6.0 Rewrite (ETS Exemplar)</h4>
          <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-4 text-sm leading-relaxed text-teal-950 whitespace-pre-line">
            {displayExemplar}
          </div>
        </div>
      </div>
    </div>
  );
};
