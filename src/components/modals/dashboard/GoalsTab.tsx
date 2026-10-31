import React from 'react';
import { Target, Trophy, Zap, TrendingUp, Calendar, Flame, CheckCircle2, Settings } from 'lucide-react';
import { TASK_DEFINITIONS } from '../../../types/taskTypes';

interface GoalsTabProps {
  targetScoreNum: number;
  convertScaledToBand6: (score: number) => number;
  toeflEstimate: { overallScore: number; cefrCode: string; readingScore: number; listeningScore: number; speakingScore: number; writingScore: number };
  readinessPct: number;
  scoreGap: number;
  daysUntilTest: number | null;
  testDateInput: string;
  weeklyGoalInput: number;
  weeklyCompleted: number;
  completedDays: string[];
  sectionTargetScore: number;
  loadingQuestionCounts: boolean;
  questionCounts: Record<string, number>;
  goalsSavedSuccess: boolean;
  targetScoreInput: string;
  setTargetScoreInput: (val: string) => void;
  setTestDateInput: (val: string) => void;
  setWeeklyGoalInput: (val: number) => void;
  handleSaveGoals: (e: React.FormEvent) => void;
  mockExamSetsCount?: number;
  examBankTotal?: number;
  coachBankTotal?: number;
}

export const GoalsTab: React.FC<GoalsTabProps> = ({
  targetScoreNum,
  convertScaledToBand6,
  toeflEstimate,
  readinessPct,
  scoreGap,
  daysUntilTest,
  testDateInput,
  weeklyGoalInput,
  weeklyCompleted,
  completedDays,
  sectionTargetScore,
  loadingQuestionCounts,
  questionCounts,
  goalsSavedSuccess,
  targetScoreInput,
  setTargetScoreInput,
  setTestDateInput,
  setWeeklyGoalInput,
  handleSaveGoals,
  mockExamSetsCount = 3,
  examBankTotal,
  coachBankTotal,
}) => {
  return (
    <div className="space-y-6">
      
      {/* Target Score & Readiness Hero Banner */}
      <div className="bg-gradient-to-br from-teal-900 via-teal-800 to-slate-900 text-white rounded-2xl p-6 shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-700/60 text-teal-200 text-xs font-semibold uppercase tracking-wider">
              <Target className="w-3.5 h-3.5" />
              <span>TOEFL iBT Target Benchmark</span>
            </div>
            <div className="flex items-baseline gap-3">
              <h3 className="text-4xl font-extrabold tracking-tight text-white">{targetScoreNum}</h3>
              <span className="text-xl text-teal-200/80 font-medium">/ 120 points</span>
            </div>
            <p className="text-xs text-teal-200/90 max-w-md">
              Corresponds to TOEFL Band <strong>{convertScaledToBand6(targetScoreNum).toFixed(1)} / 6.0</strong> (
              {targetScoreNum >= 100 ? 'C1 Advanced / Graduate Level' : targetScoreNum >= 80 ? 'B2 Upper-Intermediate / University Entrance' : 'B1 Intermediate'}
              ).
            </p>
          </div>

          {/* Readiness Gauge */}
          <div className="bg-white/10 backdrop-blur-xs border border-white/15 rounded-2xl p-4 w-full md:w-64 space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-teal-200">Current Projected Score</span>
              <span className="text-white text-base font-bold">{toeflEstimate.overallScore} / 120</span>
            </div>
            
            <div className="h-2.5 bg-black/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 rounded-full transition-all duration-700"
                style={{ width: `${readinessPct}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-teal-100">
              <span>{readinessPct}% Target Readiness</span>
              <span className="font-semibold uppercase tracking-wider">{toeflEstimate.cefrCode} Level</span>
            </div>
          </div>
        </div>

        {/* Status Notice */}
        <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-teal-100">
          <div className="flex items-center gap-2">
            {scoreGap <= 0 ? (
              <>
                <Trophy className="w-4 h-4 text-amber-300" />
                <span className="font-semibold text-amber-200">Goal Reached! You currently meet your target benchmark.</span>
              </>
            ) : scoreGap <= 6 ? (
              <>
                <Zap className="w-4 h-4 text-amber-300" />
                <span>Within striking distance: Only <strong className="text-white font-bold">{scoreGap} points</strong> to your target goal!</span>
              </>
            ) : (
              <>
                <TrendingUp className="w-4 h-4 text-teal-300" />
                <span>Work toward your goal: <strong className="text-white font-bold">{scoreGap} points</strong> needed to reach {targetScoreNum}.</span>
              </>
            )}
          </div>
          <span className="text-[11px] text-teal-300/80">Based on authentic ETS scoring curves</span>
        </div>
      </div>

      {/* Goal Pillars Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* 1. Exam Date Countdown */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Exam Countdown</span>
            <Calendar className="w-4 h-4 text-teal-700" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {daysUntilTest !== null
              ? daysUntilTest > 0
                ? `${daysUntilTest} Days`
                : daysUntilTest === 0
                ? 'Exam Today! 🎯'
                : 'Exam Date Passed'
              : 'Not Scheduled'}
          </div>
          <p className="text-xs text-slate-500">
            {testDateInput ? (
              <>Test Date: <strong className="text-slate-700 font-semibold">{new Date(testDateInput).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</strong></>
            ) : (
              'Set your target test date below'
            )}
          </p>
          <div className="text-[11px] text-teal-800 bg-teal-50 px-2 py-1 rounded-md font-medium">
            {daysUntilTest && daysUntilTest > 0
              ? `Pace: ~${Math.max(2, Math.ceil((weeklyGoalInput * 2) / Math.max(1, daysUntilTest / 7)))} tasks / day recommended`
              : 'Keep a steady 4-day weekly habit'}
          </div>
        </div>

        {/* 2. Weekly Practice Habit */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Weekly Habit</span>
            <Target className="w-4 h-4 text-teal-700" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {weeklyCompleted} / {weeklyGoalInput} Tasks
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${weeklyCompleted >= weeklyGoalInput ? 'bg-emerald-500' : 'bg-teal-700'}`}
              style={{ width: `${Math.min(100, (weeklyCompleted / (weeklyGoalInput || 1)) * 100)}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[11px] text-slate-400">
            <span>Resets every Sunday</span>
            <span className="font-semibold text-slate-600">
              {weeklyCompleted >= weeklyGoalInput ? 'Weekly Goal Met! 🎉' : `${weeklyGoalInput - weeklyCompleted} left this week`}
            </span>
          </div>
        </div>

        {/* 3. Consistency Streak */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Study Streak</span>
            <Flame className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600 flex items-center gap-1.5">
            <span>{completedDays.length}</span>
            <span className="text-sm font-normal text-slate-500">active days</span>
          </div>
          <p className="text-xs text-slate-500">
            Consistent daily practice builds automatic grammar and acoustic pattern recall.
          </p>
          <div className="text-[11px] text-amber-800 bg-amber-50 px-2 py-1 rounded-md font-medium">
            {completedDays.length >= 7 ? '🔥 7+ Day Master Scholar Streak' : 'Target: 5 active days per week'}
          </div>
        </div>
      </div>

      {/* Section-by-Section Score Target Breakdown */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-2xs">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h4 className="font-bold text-slate-900 text-sm">Section Target Parity (Target: {sectionTargetScore}/30 each)</h4>
            <p className="text-xs text-slate-500">Even performance across all four test sections is required for top university cutoffs.</p>
          </div>
          <span className="text-xs font-semibold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200">
            Parity Goal: {sectionTargetScore} pts / section
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          
          {/* Reading */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-slate-800">Reading</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${toeflEstimate.readingScore >= sectionTargetScore ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {toeflEstimate.readingScore >= sectionTargetScore ? 'Met ✅' : `+${sectionTargetScore - toeflEstimate.readingScore} needed`}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xl font-bold text-slate-900">{toeflEstimate.readingScore}</span>
              <span className="text-xs text-slate-400">Target: {sectionTargetScore}/30</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-tight">C-Test completion &amp; academic passage analysis</p>
          </div>

          {/* Listening */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-slate-800">Listening</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${toeflEstimate.listeningScore >= sectionTargetScore ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {toeflEstimate.listeningScore >= sectionTargetScore ? 'Met ✅' : `+${sectionTargetScore - toeflEstimate.listeningScore} needed`}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xl font-bold text-slate-900">{toeflEstimate.listeningScore}</span>
              <span className="text-xs text-slate-400">Target: {sectionTargetScore}/30</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-tight">Campus conversations &amp; lecture comprehension</p>
          </div>

          {/* Speaking */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-slate-800">Speaking</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${toeflEstimate.speakingScore >= sectionTargetScore ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {toeflEstimate.speakingScore >= sectionTargetScore ? 'Met ✅' : `+${sectionTargetScore - toeflEstimate.speakingScore} needed`}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xl font-bold text-slate-900">{toeflEstimate.speakingScore}</span>
              <span className="text-xs text-slate-400">Target: {sectionTargetScore}/30</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-tight">Repeat accuracy &amp; structured 45s interview answers</p>
          </div>

          {/* Writing */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-slate-800">Writing</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${toeflEstimate.writingScore >= sectionTargetScore ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {toeflEstimate.writingScore >= sectionTargetScore ? 'Met ✅' : `+${sectionTargetScore - toeflEstimate.writingScore} needed`}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xl font-bold text-slate-900">{toeflEstimate.writingScore}</span>
              <span className="text-xs text-slate-400">Target: {sectionTargetScore}/30</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-tight">Sentence syntax &amp; academic forum contributions</p>
          </div>
        </div>
      </div>

      {/* Edit & Customize Goals Form */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-teal-100 text-teal-800 rounded-lg">
              <Settings className="w-4 h-4" />
            </div>
            <h4 className="font-bold text-slate-900 text-sm">Configure Study Targets</h4>
          </div>
          {goalsSavedSuccess && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-semibold bg-emerald-100 px-3 py-1 rounded-full animate-in fade-in">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Goals saved successfully!</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSaveGoals} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Target Score Input with Presets */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Target TOEFL Score (0–120)</label>
              <input
                type="number"
                min="0"
                max="120"
                value={targetScoreInput}
                onChange={(e) => setTargetScoreInput(e.target.value)}
                className="w-full text-sm bg-white border border-slate-300 rounded-lg px-3 py-2 focus:border-teal-600 outline-hidden font-bold text-slate-900"
              />
              <div className="flex items-center gap-1 pt-1 flex-wrap">
                {['80', '90', '100', '110'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setTargetScoreInput(preset)}
                    className={`px-2 py-0.5 text-[10px] font-semibold rounded-md border cursor-pointer transition-colors ${
                      targetScoreInput === preset
                        ? 'bg-teal-800 text-white border-teal-800'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {preset} pts
                  </button>
                ))}
              </div>
            </div>

            {/* Test Date Picker */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Target Test Date</label>
              <input
                type="date"
                value={testDateInput}
                onChange={(e) => setTestDateInput(e.target.value)}
                className="w-full text-sm bg-white border border-slate-300 rounded-lg px-3 py-2 focus:border-teal-600 outline-hidden font-medium text-slate-900"
              />
              <p className="text-[11px] text-slate-400">Updates live exam countdown &amp; study pacing</p>
            </div>

            {/* Weekly Session Goal */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Weekly Practice Goal (Tasks/Week)</label>
              <input
                type="number"
                min="1"
                max="100"
                value={weeklyGoalInput}
                onChange={(e) => setWeeklyGoalInput(parseInt(e.target.value, 10) || 5)}
                className="w-full text-sm bg-white border border-slate-300 rounded-lg px-3 py-2 focus:border-teal-600 outline-hidden font-medium text-slate-900"
              />
              <div className="flex items-center gap-1 pt-1 flex-wrap">
                {[5, 7, 10, 14].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setWeeklyGoalInput(n)}
                    className={`px-2 py-0.5 text-[10px] font-semibold rounded-md border cursor-pointer transition-colors ${
                      weeklyGoalInput === n
                        ? 'bg-teal-800 text-white border-teal-800'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {n} / wk
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-5 py-2 bg-teal-800 hover:bg-teal-900 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-300" />
              <span>Save Study Goals</span>
            </button>
          </div>
        </form>
      </div>

      {/* Saved Questions Database Statistics */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-2xs mt-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Target className="w-4 h-4 text-teal-700" />
              Saved Questions Database Statistics (Total Bank)
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Isolated database partitions for Exam Mode Bank, Coach Mode Bank, and Full Mock Exam Sets.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200 shrink-0">
              🎯 Exam Mode Bank: {examBankTotal ?? Object.values(questionCounts).reduce((a, b) => a + b, 0)} Questions
            </span>
            {typeof coachBankTotal === 'number' && (
              <span className="text-xs font-semibold text-indigo-800 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-200 shrink-0">
                🎓 Coach Mode Bank: {coachBankTotal} Questions
              </span>
            )}
            <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 shrink-0">
              📚 Full Mock Exam Sets: {mockExamSetsCount} Sets
            </span>
          </div>
        </div>

        {loadingQuestionCounts ? (
          <div className="text-xs text-slate-400 py-4 text-center">Loading database question counts per question type...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {TASK_DEFINITIONS.map((def) => {
              const count = questionCounts[def.id] ?? 0;
              return (
                <div key={def.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between shadow-2xs">
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-slate-800">{def.name}</div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-teal-100 text-teal-800">
                      {def.section}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-teal-900 font-mono bg-white px-3 py-1 rounded-lg border border-teal-200 shadow-2xs shrink-0">
                    {count}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};
