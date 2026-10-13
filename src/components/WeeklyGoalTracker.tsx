import React, { useState, useEffect } from 'react';
import { getPracticeHistory } from '../utils/scoreTracker';
import { Target } from 'lucide-react';

interface WeeklyGoalTrackerProps {
  onOpenGoals?: () => void;
}

export function WeeklyGoalTracker({ onOpenGoals }: WeeklyGoalTrackerProps) {
  const [completed, setCompleted] = useState(0);
  const [target, setTarget] = useState(() => parseInt(localStorage.getItem('WEEKLY_GOAL') || '5', 10));

  useEffect(() => {
    const updateCount = () => {
      const history = getPracticeHistory();
      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
      startOfWeek.setHours(0, 0, 0, 0);

      const count = history.filter(r => new Date(r.date) >= startOfWeek).length;
      setCompleted(count);
      const stored = parseInt(localStorage.getItem('WEEKLY_GOAL') || '5', 10);
      if (!isNaN(stored)) setTarget(stored);
    };

    updateCount();
    const interval = setInterval(updateCount, 4000);
    return () => clearInterval(interval);
  }, []);

  const progress = Math.min((completed / (target || 1)) * 100, 100);

  return (
    <button
      onClick={onOpenGoals}
      type="button"
      title="View Study Goals & Weekly Progress in Dashboard"
      className="flex items-center gap-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer group text-left"
    >
      <Target className="w-3.5 h-3.5 text-teal-700 group-hover:scale-110 transition-transform" />
      <div className="flex flex-col gap-1 w-24">
        <div className="flex justify-between text-[10px] text-slate-600 font-medium">
          <span className="group-hover:text-teal-800">Weekly Goal</span>
          <span className="font-semibold">{completed} / {target}</span>
        </div>
        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-500 ${completed >= target ? 'bg-emerald-500' : 'bg-teal-700'}`} 
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </button>
  );
}
