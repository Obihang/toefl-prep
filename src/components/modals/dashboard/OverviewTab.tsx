import React from 'react';
import { Target, Trophy, Flame, CheckCircle2, ArrowRight, Play, Sparkles, Clock } from 'lucide-react';
import { PracticeRecord, getUserStats } from '../../../utils/scoreTracker';
import { streak, todaysPlan } from '../../../utils/dashboardStats';
import { ScoreTrendChart } from './charts/ScoreTrendChart';
import { SectionAveragesChart } from './charts/SectionAveragesChart';
import { WeeklyActivityChart } from './charts/WeeklyActivityChart';
import { StreakCalendarChart } from './charts/StreakCalendarChart';

interface OverviewTabProps {
  toeflEstimate: { overallScore: number; cefrCode: string; overallBand6: number };
  stats: any;
  history?: PracticeRecord[];
  completedDays?: string[];
  weakAreas?: Array<{ topic: string; errorCount: number; section: string }>;
  onOpenTask?: (taskType: string) => void;
  onOpenHistory?: () => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  toeflEstimate,
  stats,
  history = [],
  completedDays = [],
  weakAreas = [],
  onOpenTask,
  onOpenHistory,
}) => {
  const targetScore = stats?.targetScore || 100;
  const scoreGap = Math.max(0, targetScore - toeflEstimate.overallScore);
  const st = streak(completedDays);
  const weeklyCompleted = stats?.weeklyCompleted || 3;
  const weeklyGoal = parseInt(localStorage.getItem('WEEKLY_GOAL') || '5', 10);
  const plan = todaysPlan(history, 5, 2);

  const recentAttemptsList = [...history].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()).slice(0, 10);

  return (
    <div className="space-y-6">
      {/* 1. Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Projected Score */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <p className="text-xs font-semibold text-slate-500">Projected Score</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-extrabold text-teal-900">{toeflEstimate.overallScore}</p>
            <span className="text-xs text-slate-400">/ 120</span>
          </div>
          <span className="inline-block text-[10px] font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-full">
            {toeflEstimate.cefrCode} Level (Band {toeflEstimate.overallBand6.toFixed(1)})
          </span>
        </div>

        {/* Gap to Target */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <p className="text-xs font-semibold text-slate-500">Gap to Target ({targetScore})</p>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">
            {scoreGap === 0 ? 'Goal Met! 🎉' : `-${scoreGap} pts`}
          </p>
          <p className="text-[10px] text-slate-400">Target benchmark: {targetScore}</p>
        </div>

        {/* Current & Best Streak */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <p className="text-xs font-semibold text-slate-500">Streak</p>
          <div className="flex items-baseline gap-1 text-2xl font-extrabold text-amber-600">
            <Flame className="w-5 h-5 fill-amber-500 text-amber-500" />
            <span>{st.current}</span>
            <span className="text-xs font-normal text-slate-400">days (best: {st.best})</span>
          </div>
          <p className="text-[10px] text-slate-400">Keep your daily habit alive</p>
        </div>

        {/* Weekly Goal Progress */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <p className="text-xs font-semibold text-slate-500">Weekly Goal</p>
          <p className="text-2xl font-extrabold text-teal-900 mt-1">{weeklyCompleted} / {weeklyGoal}</p>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-2">
            <div
              className="h-full bg-teal-700 rounded-full"
              style={{ width: `${Math.min(100, (weeklyCompleted / (weeklyGoal || 1)) * 100)}%` }}
            />
          </div>
        </div>

        {/* Tests Completed */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <p className="text-xs font-semibold text-slate-500">Tests Completed</p>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">{stats?.completedTests || history.length || 0}</p>
          <p className="text-[10px] text-slate-400">Practice sessions logged</p>
        </div>
      </div>

      {/* 2. Today's Plan & Weak Areas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Plan */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-teal-700" />
              Today's Plan
            </h4>
            <span className="text-[10px] bg-teal-50 text-teal-800 px-2 py-0.5 rounded-full font-semibold">AI Recommended</span>
          </div>

          <div className="space-y-3">
            {plan.map((item) => (
              <div
                key={item.id}
                onClick={() => onOpenTask?.(item.actionTarget || 'reading')}
                className="p-3.5 bg-slate-50 hover:bg-teal-50/50 border border-slate-200 hover:border-teal-300 rounded-xl flex items-center justify-between gap-3 transition-colors cursor-pointer group"
              >
                <div className="space-y-0.5">
                  <h5 className="font-bold text-xs text-slate-900 group-hover:text-teal-900">{item.title}</h5>
                  <p className="text-[11px] text-slate-500 leading-tight">{item.description}</p>
                </div>
                <div className="p-2 bg-white rounded-lg border border-slate-200 text-teal-700 group-hover:bg-teal-700 group-hover:text-white transition-colors shrink-0">
                  <Play className="w-3.5 h-3.5 fill-current" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Weak Areas */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-slate-900 text-sm">Identified Weak Areas</h4>
            <span className="text-xs text-slate-400">{weakAreas.length} topics to review</span>
          </div>

          {weakAreas.length === 0 ? (
            <div className="h-32 flex flex-col items-center justify-center text-xs text-slate-400 text-center px-4">
              <Trophy className="w-8 h-8 text-amber-400 mb-1" />
              <span>No major weak areas detected yet! Complete more practice tests to receive targeted diagnostics.</span>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-48 overflow-y-auto">
              {weakAreas.map((w, idx) => (
                <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md">{w.section}</span>
                    <p className="font-bold text-xs text-slate-900 mt-1">{w.topic}</p>
                  </div>
                  <button
                    onClick={() => onOpenTask?.(w.section.toLowerCase())}
                    className="px-3 py-1.5 bg-teal-800 hover:bg-teal-900 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer shrink-0 flex items-center gap-1"
                  >
                    <span>Practice this</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. Charts: Score Trend & Section Averages */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ScoreTrendChart history={history} />
        <SectionAveragesChart history={history} />
      </div>

      {/* 4. Weekly Activity & Streak Calendar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WeeklyActivityChart history={history} />
        <StreakCalendarChart completedDays={completedDays} />
      </div>

      {/* 5. Recent Attempts */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-2xs">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-bold text-slate-900 text-sm">Recent Practice Attempts</h4>
            <p className="text-xs text-slate-500">Your latest logged test sessions</p>
          </div>
          {onOpenHistory && (
            <button
              onClick={onOpenHistory}
              className="text-xs font-bold text-teal-700 hover:text-teal-900 flex items-center gap-1 cursor-pointer"
            >
              <span>View Score History</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {recentAttemptsList.length === 0 ? (
          <div className="h-28 flex flex-col items-center justify-center text-xs text-slate-400">
            <Clock className="w-6 h-6 text-slate-300 mb-1" />
            <span>No practice attempts recorded yet. Start practicing to build your score history!</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-semibold">
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Section</th>
                  <th className="pb-2">Task</th>
                  <th className="pb-2 text-right">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recentAttemptsList.map((att, idx) => (
                  <tr key={att.id || idx} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-2.5 text-slate-500">{new Date(att.date || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="py-2.5 font-semibold text-slate-800">{att.section}</td>
                    <td className="py-2.5 text-slate-600 truncate max-w-xs">{att.taskTitle || att.taskType}</td>
                    <td className="py-2.5 text-right font-bold text-teal-900">{att.scaledScore30 || att.score} / {att.maxScore || 30}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
