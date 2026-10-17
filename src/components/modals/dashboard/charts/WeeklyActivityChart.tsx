import React from 'react';
import { weeklyActivity } from '../../../../utils/dashboardStats';
import { PracticeRecord } from '../../../../utils/scoreTracker';

interface WeeklyActivityChartProps {
  history: PracticeRecord[];
}

export const WeeklyActivityChart: React.FC<WeeklyActivityChartProps> = ({ history }) => {
  const data = weeklyActivity(history, 7);
  const maxCount = Math.max(1, ...data.map((d) => d.value));

  const summaryText = data.map((d) => `${d.date}: ${d.value} tasks`).join(', ');

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-2xs">
      <div>
        <h4 className="font-bold text-slate-900 text-sm">Weekly Activity (Last 7 Days)</h4>
        <p className="text-xs text-slate-500">Practice tasks completed per day</p>
      </div>

      <span className="sr-only">Weekly activity: {summaryText}</span>

      <div className="flex items-end justify-between gap-2 h-32 pt-4 px-2">
        {data.map((d, idx) => {
          const heightPct = Math.max(8, Math.round((d.value / maxCount) * 100));
          const dayLabel = new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' });

          return (
            <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
              <span className="text-[10px] font-bold text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">
                {d.value}
              </span>
              <div
                className={`w-full max-w-[28px] rounded-t-lg transition-all duration-500 ${d.value > 0 ? 'bg-teal-700 group-hover:bg-teal-800' : 'bg-slate-100'}`}
                style={{ height: `${heightPct}%` }}
                title={`${d.date}: ${d.value} tasks`}
              />
              <span className="text-[10px] font-semibold text-slate-500">{dayLabel}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
