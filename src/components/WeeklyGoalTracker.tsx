import React, { useState, useEffect } from 'react';
import { getPracticeHistory } from '../utils/scoreTracker';
import { Target } from 'lucide-react';

interface WeeklyGoalTrackerProps {
  target: number;
}

export function WeeklyGoalTracker() {
  const [completed, setCompleted] = useState(0);
  const [target, setTarget] = useState(() => parseInt(localStorage.getItem('WEEKLY_GOAL') || '5'));
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const updateCount = () => {
      const history = getPracticeHistory();
      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
      startOfWeek.setHours(0, 0, 0, 0);

      const count = history.filter(r => new Date(r.date) >= startOfWeek).length;
      setCompleted(count);
    };

    updateCount();
    
    const interval = setInterval(updateCount, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleTargetChange = (newTarget: number) => {
    setTarget(newTarget);
    localStorage.setItem('WEEKLY_GOAL', newTarget.toString());
    setIsEditing(false);
  };

  const progress = Math.min((completed / target) * 100, 100);

  return (
    <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs">
      <Target className="w-3.5 h-3.5 text-teal-700" />
      <div className="flex flex-col gap-1 w-24">
        <div className="flex justify-between text-[10px] text-slate-500 font-medium cursor-pointer" onClick={() => setIsEditing(!isEditing)}>
          <span>Weekly Goal</span>
          {isEditing ? (
            <input
              type="number"
              value={target}
              onChange={(e) => handleTargetChange(parseInt(e.target.value) || 1)}
              className="w-8 border border-slate-300 rounded px-0.5 text-right"
              min="1"
            />
          ) : (
            <span>{completed} / {target}</span>
          )}
        </div>
        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-500 ${completed >= target ? 'bg-amber-500' : 'bg-teal-700'}`} 
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
