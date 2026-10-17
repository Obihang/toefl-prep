import React from 'react';

interface OverviewTabProps {
  toeflEstimate: { overallScore: number };
  stats: { targetScore?: number; completedTests?: number } | null;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ toeflEstimate, stats }) => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-slate-500">Overall Projected Score</p>
          <p className="text-2xl font-extrabold text-teal-900 mt-1">{toeflEstimate.overallScore} <span className="text-sm font-normal text-slate-500">/ 120</span></p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-slate-500">Target Score</p>
          <p className="text-2xl font-extrabold text-teal-900 mt-1">{stats?.targetScore || 100} <span className="text-sm font-normal text-slate-500">/ 120</span></p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-slate-500">Tests Completed</p>
          <p className="text-2xl font-extrabold text-teal-900 mt-1">{stats?.completedTests || 0}</p>
        </div>
      </div>
    </div>
  );
};
