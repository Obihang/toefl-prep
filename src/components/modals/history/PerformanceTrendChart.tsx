import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import { PracticeRecord } from '../../../utils/scoreTracker';

interface PerformanceTrendChartProps {
  history: PracticeRecord[];
  activeSectionTab: 'All' | 'Reading' | 'Listening' | 'Speaking' | 'Writing';
  onSectionTabChange: (tab: 'All' | 'Reading' | 'Listening' | 'Speaking' | 'Writing') => void;
  targetScore: number;
}

const SECTION_COLORS: Record<string, string> = {
  Reading: '#2563eb',   // Blue
  Listening: '#d97706', // Amber
  Speaking: '#059669',  // Emerald
  Writing: '#7c3aed',   // Purple
};

export const PerformanceTrendChart: React.FC<PerformanceTrendChartProps> = ({
  history,
  activeSectionTab,
  onSectionTabChange,
  targetScore,
}) => {
  // Sort history chronologically from earliest to latest
  const sorted = [...history].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const chartData = sorted.map((item, idx) => {
    const d = new Date(item.date);
    const formattedDate = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const fullDateTime = d.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const band =
      item.bandScore6 ??
      (item.scaledScore30 >= 29
        ? 6.0
        : item.scaledScore30 >= 26
        ? 5.5
        : item.scaledScore30 >= 23
        ? 5.0
        : item.scaledScore30 >= 20
        ? 4.5
        : item.scaledScore30 >= 17
        ? 4.0
        : item.scaledScore30 >= 14
        ? 3.5
        : item.scaledScore30 >= 11
        ? 3.0
        : 2.5);

    return {
      index: idx + 1,
      date: formattedDate,
      fullDateTime,
      taskTitle: item.taskTitle,
      section: item.section,
      score: item.scaledScore30,
      band,
      Reading: item.section === 'Reading' ? item.scaledScore30 : undefined,
      Listening: item.section === 'Listening' ? item.scaledScore30 : undefined,
      Speaking: item.section === 'Speaking' ? item.scaledScore30 : undefined,
      Writing: item.section === 'Writing' ? item.scaledScore30 : undefined,
    };
  });

  const displayData =
    activeSectionTab === 'All'
      ? chartData
      : chartData.filter((d) => d.section === activeSectionTab);

  const sectionTarget = Math.round(targetScore / 4);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const color = SECTION_COLORS[data.section] || '#0d9488';
      return (
        <div className="bg-slate-900/95 backdrop-blur-xs text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs space-y-1.5 max-w-xs z-50">
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1">
            <span className="font-semibold text-slate-300">{data.fullDateTime}</span>
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase"
              style={{ backgroundColor: `${color}33`, color: color }}
            >
              {data.section}
            </span>
          </div>
          <div className="font-medium text-slate-100 truncate">{data.taskTitle}</div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-slate-400">Scaled Score:</span>
            <span className="font-mono font-bold text-teal-400 text-sm">
              {data.score} / 30
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Estimated Band:</span>
            <span className="font-mono font-semibold text-slate-200">
              Band {data.band?.toFixed(1) || 'N/A'}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-2">
          <span>Score Trend Over Time</span>
          <span className="text-slate-400 font-normal">({activeSectionTab})</span>
        </h3>
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-medium">
          {(['All', 'Reading', 'Listening', 'Speaking', 'Writing'] as const).map((sec) => (
            <button
              key={sec}
              onClick={() => onSectionTabChange(sec)}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                activeSectionTab === sec
                  ? 'bg-white text-teal-900 font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {sec}
            </button>
          ))}
        </div>
      </div>

      {displayData.length === 0 ? (
        <div className="h-56 flex flex-col items-center justify-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg p-6 space-y-1">
          <p className="font-medium text-slate-500">No practice records available for trend analysis.</p>
          <p className="text-[11px] text-slate-400">
            {activeSectionTab === 'All'
              ? 'Complete any practice exercises to view your scoring progress.'
              : `Complete ${activeSectionTab} tasks to visualize progress in this section.`}
          </p>
        </div>
      ) : (
        <div className="w-full h-64 min-w-0 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={displayData} margin={{ top: 10, right: 20, left: -15, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="date"
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#e2e8f0' }}
              />
              <YAxis
                domain={[0, 30]}
                ticks={[0, 5, 10, 15, 20, 25, 30]}
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#e2e8f0' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine
                y={sectionTarget}
                stroke="#0d9488"
                strokeDasharray="4 4"
                label={{
                  value: `Target (${sectionTarget})`,
                  position: 'insideTopRight',
                  fill: '#0d9488',
                  fontSize: 10,
                  fontWeight: 600,
                }}
              />
              {activeSectionTab === 'All' ? (
                <>
                  <Legend
                    verticalAlign="top"
                    height={36}
                    iconType="circle"
                    wrapperStyle={{ fontSize: '11px', fontWeight: 600 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="Reading"
                    name="Reading"
                    stroke={SECTION_COLORS.Reading}
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: SECTION_COLORS.Reading }}
                    activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="Listening"
                    name="Listening"
                    stroke={SECTION_COLORS.Listening}
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: SECTION_COLORS.Listening }}
                    activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="Speaking"
                    name="Speaking"
                    stroke={SECTION_COLORS.Speaking}
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: SECTION_COLORS.Speaking }}
                    activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="Writing"
                    name="Writing"
                    stroke={SECTION_COLORS.Writing}
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: SECTION_COLORS.Writing }}
                    activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
                    connectNulls
                  />
                </>
              ) : (
                <Line
                  type="monotone"
                  dataKey="score"
                  name={activeSectionTab}
                  stroke={SECTION_COLORS[activeSectionTab] || '#0d9488'}
                  strokeWidth={3}
                  dot={{
                    r: 4,
                    fill: SECTION_COLORS[activeSectionTab] || '#0d9488',
                  }}
                  activeDot={{ r: 7, stroke: '#fff', strokeWidth: 2 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};
