import React from 'react';

interface StreakCalendarChartProps {
  completedDays: string[];
}

export const StreakCalendarChart: React.FC<StreakCalendarChartProps> = ({ completedDays }) => {
  const daysCount = 28;
  const now = Date.now();
  const dayMs = 86400000;
  const dates: { dateStr: string; active: boolean; label: string }[] = [];

  const activeSet = new Set(completedDays || []);

  for (let i = daysCount - 1; i >= 0; i--) {
    const d = new Date(now - i * dayMs);
    const dateStr = d.toISOString().split('T')[0];
    dates.push({
      dateStr,
      active: activeSet.has(dateStr),
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    });
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-2xs">
      <div>
        <h4 className="font-bold text-slate-900 text-sm">28-Day Activity Grid</h4>
        <p className="text-xs text-slate-500">Consistency heatmap over the past 4 weeks</p>
      </div>

      <div className="grid grid-cols-7 gap-2 pt-1">
        {dates.map((item, idx) => (
          <div
            key={idx}
            className={`aspect-square rounded-lg flex items-center justify-center text-[10px] font-bold transition-all ${
              item.active
                ? 'bg-emerald-500 text-white shadow-2xs ring-2 ring-emerald-600/20'
                : 'bg-slate-100 text-slate-400'
            }`}
            title={`${item.label}: ${item.active ? 'Practice completed' : 'Rest day'}`}
            aria-label={`${item.label}: ${item.active ? 'Active' : 'Inactive'}`}
          >
            {item.label.split(' ')[1]}
          </div>
        ))}
      </div>
    </div>
  );
};
