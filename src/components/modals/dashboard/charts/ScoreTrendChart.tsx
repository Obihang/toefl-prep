import React, { useState } from 'react';
import { scoreTrend, SectionType, TimeRange } from '../../../../utils/dashboardStats';
import { PracticeRecord } from '../../../../utils/scoreTracker';

interface ScoreTrendChartProps {
  history: PracticeRecord[];
}

export const ScoreTrendChart: React.FC<ScoreTrendChartProps> = ({ history }) => {
  const [section, setSection] = useState<SectionType>('total');
  const [range, setRange] = useState<TimeRange>('7d');
  const [hoveredPoint, setHoveredPoint] = useState<{ date: string; value: number } | null>(null);

  const data = scoreTrend(history, section, range);

  const maxVal = section === 'total' ? 120 : 30;
  const chartHeight = 160;
  const chartWidth = 500;
  const padding = 30;

  const points = data.map((d, idx) => {
    const x = padding + (idx / Math.max(1, data.length - 1)) * (chartWidth - padding * 2);
    const y = chartHeight - padding - (d.value / maxVal) * (chartHeight - padding * 2);
    return { x, y, ...d };
  });

  const pathD = points.length > 0 ? points.reduce((acc, p, idx) => (idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`), '') : '';

  const summaryText = data.length === 0
    ? 'No score trend data available for this range.'
    : `Score trend for ${section} over ${range}: ${data.length} data points, latest score ${data[data.length - 1].value}.`;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-2xs">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h4 className="font-bold text-slate-900 text-sm">Score Progression Trend</h4>
          <p className="text-xs text-slate-500">Track score development over time</p>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={section}
            onChange={(e) => setSection(e.target.value as SectionType)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium outline-hidden"
            aria-label="Select score section"
          >
            <option value="total">Total Score (/120)</option>
            <option value="Reading">Reading (/30)</option>
            <option value="Listening">Listening (/30)</option>
            <option value="Speaking">Speaking (/30)</option>
            <option value="Writing">Writing (/30)</option>
          </select>

          <div className="flex bg-slate-100 p-0.5 rounded-lg">
            {(['7d', '30d', 'all'] as TimeRange[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer uppercase ${
                  range === r ? 'bg-white text-teal-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative w-full overflow-x-auto">
        <span className="sr-only">{summaryText}</span>
        {data.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-xs text-slate-400">
            No practice records found for this time range. Complete practice sessions to view your trend!
          </div>
        ) : (
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-40 overflow-visible" aria-label="Score trend line chart">
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
              const y = padding + ratio * (chartHeight - padding * 2);
              const val = Math.round(maxVal * (1 - ratio));
              return (
                <g key={i}>
                  <line x1={padding} y1={y} x2={chartWidth - padding} y2={y} stroke="#f1f5f9" strokeWidth="1" />
                  <text x={padding - 8} y={y + 3} fill="#94a3b8" fontSize="9" textAnchor="end">{val}</text>
                </g>
              );
            })}

            {/* Line Path */}
            <path d={pathD} fill="none" stroke="#0d9488" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

            {/* Points & Tooltips */}
            {points.map((p, idx) => (
              <g key={idx} className="cursor-pointer" onMouseEnter={() => setHoveredPoint(p)} onMouseLeave={() => setHoveredPoint(null)}>
                <circle cx={p.x} cy={p.y} r="4.5" fill="#ffffff" stroke="#0d9488" strokeWidth="2" />
                {hoveredPoint?.date === p.date && (
                  <g transform={`translate(${p.x}, ${p.y - 28})`}>
                    <rect x="-35" y="-18" width="70" height="20" rx="4" fill="#0f172a" opacity="0.9" />
                    <text x="0" y="-4" fill="#ffffff" fontSize="10" textAnchor="middle" fontWeight="bold">
                      {p.date}: {p.value}
                    </text>
                  </g>
                )}
              </g>
            ))}
          </svg>
        )}
      </div>
    </div>
  );
};
