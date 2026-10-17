import React from 'react';
import { sectionAverages } from '../../../../utils/dashboardStats';
import { PracticeRecord } from '../../../../utils/scoreTracker';

interface SectionAveragesChartProps {
  history: PracticeRecord[];
}

export const SectionAveragesChart: React.FC<SectionAveragesChartProps> = ({ history }) => {
  const avgs = sectionAverages(history);
  const sections = Object.keys(avgs);

  const summaryText = sections.map((sec) => `${sec}: average ${avgs[sec].average}/30, target ${avgs[sec].target}/30`).join(', ');

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-2xs">
      <div>
        <h4 className="font-bold text-slate-900 text-sm">Section Performance vs Target</h4>
        <p className="text-xs text-slate-500">Average scores across Reading, Listening, Speaking, and Writing</p>
      </div>

      <span className="sr-only">Section averages: {summaryText}</span>

      <div className="space-y-3 pt-2">
        {sections.map((sec) => {
          const item = avgs[sec];
          const pct = Math.min(100, Math.round((item.average / 30) * 100));
          const targetPct = Math.min(100, Math.round((item.target / 30) * 100));
          const isMet = item.average >= item.target;

          return (
            <div key={sec} className="space-y-1">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-800">{sec}</span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-900 font-bold">{item.average} / 30</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${isMet ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                    {isMet ? 'Target Met ✅' : `Target: ${item.target}`}
                  </span>
                </div>
              </div>

              <div className="relative h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${isMet ? 'bg-emerald-500' : 'bg-teal-700'}`}
                  style={{ width: `${pct}%` }}
                  title={`${sec} Average: ${item.average}/30`}
                />
                {/* Target marker line */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-10"
                  style={{ left: `${targetPct}%` }}
                  title={`Target: ${item.target}/30`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
