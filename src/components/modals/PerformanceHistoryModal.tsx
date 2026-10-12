import React, { useState, useEffect } from 'react';
import { X, Trash2, Award, BarChart3, TrendingUp, Calendar } from 'lucide-react';
import {
  getPracticeHistory,
  clearPracticeHistory,
  calculateToeflEstimate,
  PracticeRecord,
} from '../../utils/scoreTracker';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const PerformanceHistoryModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [history, setHistory] = useState<PracticeRecord[]>([]);

  useEffect(() => {
    if (isOpen) {
      setHistory(getPracticeHistory());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const stats = calculateToeflEstimate(history);

  const handleClear = () => {
    if (confirm('Are you sure you want to clear your TOEFL practice history?')) {
      clearPracticeHistory();
      setHistory([]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto shadow-2xl border border-slate-200 p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">TOEFL Practice History & Analytics</h2>
              <p className="text-xs text-slate-500">Track your diagnostic scaled scores and section progress</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Score Scale Header & Info */}
        <div className="bg-gradient-to-r from-teal-50 to-blue-50 border border-teal-200/80 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-teal-800 text-white">
              ETS 1.0 – 6.0 Scale
            </span>
            <span className="text-xs text-slate-700">
              Official section scores reported in <strong>0.5-band increments (1.0 to 6.0)</strong>, directly mapped to CEFR levels.
            </span>
          </div>
          <span className="text-[11px] text-slate-500 font-mono whitespace-nowrap">
            Dual Reporting: Band 1.0–6.0 & 0–120
          </span>
        </div>

        {/* Scaled Score Overview Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-slate-900 text-white rounded-xl p-3.5 text-center col-span-2 sm:col-span-1">
            <div className="text-[11px] text-slate-300 uppercase font-medium tracking-wider">Estimated Band</div>
            <div className="text-2xl font-mono font-bold text-teal-400 mt-0.5">{stats.overallBand6.toFixed(1)} / 6.0</div>
            <div className="text-[10px] text-slate-400 font-mono">({stats.overallScore} / 120 Scaled)</div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
            <div className="text-[11px] text-slate-500 font-medium">Reading</div>
            <div className="text-xl font-mono font-bold text-slate-900 mt-0.5">Band {stats.readingBand6.toFixed(1)}</div>
            <div className="text-[10px] text-slate-400">{stats.readingScore}/30 Scaled</div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
            <div className="text-[11px] text-slate-500 font-medium">Listening</div>
            <div className="text-xl font-mono font-bold text-slate-900 mt-0.5">Band {stats.listeningBand6.toFixed(1)}</div>
            <div className="text-[10px] text-slate-400">{stats.listeningScore}/30 Scaled</div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
            <div className="text-[11px] text-slate-500 font-medium">Speaking</div>
            <div className="text-xl font-mono font-bold text-slate-900 mt-0.5">Band {stats.speakingBand6.toFixed(1)}</div>
            <div className="text-[10px] text-slate-400">{stats.speakingScore}/30 Scaled</div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
            <div className="text-[11px] text-slate-500 font-medium">Writing</div>
            <div className="text-xl font-mono font-bold text-slate-900 mt-0.5">Band {stats.writingBand6.toFixed(1)}</div>
            <div className="text-[10px] text-slate-400">{stats.writingScore}/30 Scaled</div>
          </div>
        </div>

        {/* CEFR Level Banner */}
        <div className="flex items-center justify-between bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 text-xs">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-teal-700" />
            <span className="text-teal-900">
              Current CEFR Assessment: <strong className="font-semibold">{stats.cefrLevel}</strong>
            </span>
          </div>
          <span className="text-teal-700 font-mono">
            {stats.totalCompleted} exercises completed
          </span>
        </div>

        {/* History Table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Recent Activity ({history.length})
            </h3>
            {history.length > 0 && (
              <button
                onClick={handleClear}
                className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-800 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear History
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
              No completed exercises yet. Select a task above and complete it to see your score analysis here!
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Section</th>
                    <th className="py-2.5 px-3">Task Title</th>
                    <th className="py-2.5 px-3 text-center">Band (1-6)</th>
                    <th className="py-2.5 px-3 text-right">Scaled (0-30)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {history.map((rec) => {
                    const band = rec.bandScore6 ?? (rec.scaledScore30 >= 29 ? 6.0 : rec.scaledScore30 >= 26 ? 5.5 : rec.scaledScore30 >= 23 ? 5.0 : rec.scaledScore30 >= 20 ? 4.5 : rec.scaledScore30 >= 17 ? 4.0 : rec.scaledScore30 >= 14 ? 3.5 : rec.scaledScore30 >= 11 ? 3.0 : 2.5);
                    return (
                      <tr key={rec.id} className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 text-slate-400 font-mono whitespace-nowrap">
                          {new Date(rec.date).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-2 px-3">
                          <span className="font-medium text-slate-900">{rec.section}</span>
                        </td>
                        <td className="py-2 px-3 text-slate-800 truncate max-w-xs">{rec.taskTitle}</td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-teal-700">
                          Band {band.toFixed(1)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-medium text-slate-600">
                          {rec.scaledScore30}/30
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
