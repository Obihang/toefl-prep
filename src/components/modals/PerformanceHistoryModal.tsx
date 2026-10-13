import React, { useState, useEffect } from 'react';
import { X, Trash2, Award, BarChart3, TrendingUp, Calendar, Download, Upload, Target } from 'lucide-react';
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
  const [activeSectionTab, setActiveSectionTab] = useState<'All' | 'Reading' | 'Listening' | 'Speaking' | 'Writing'>('All');
  const [targetScore, setTargetScore] = useState(100);
  const [testDate, setTestDate] = useState<string>('');

  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setHistory(getPracticeHistory());
      const storedTarget = localStorage.getItem('toefl_target_score');
      if (storedTarget) setTargetScore(Number(storedTarget));
      const storedDate = localStorage.getItem('toefl_test_date');
      if (storedDate) {
        setTestDate(storedDate);
      } else {
        const defaultDate = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
        setTestDate(defaultDate);
      }
      setStatusMessage(null);
      setConfirmingClear(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const stats = calculateToeflEstimate(history);

  // Countdown days
  const daysToTest = testDate ? Math.ceil((new Date(testDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : 30;
  const scoreDiff = targetScore - stats.overallScore;
  const dailyWorkload = daysToTest > 0 ? Math.max(1, Math.ceil(Math.abs(scoreDiff) / (daysToTest * 0.5))) : 2;

  const showNotification = (text: string, type: 'success' | 'error') => {
    setStatusMessage({ text, type });
    setTimeout(() => {
      setStatusMessage(null);
    }, 4000);
  };

  const handleClear = () => {
    clearPracticeHistory();
    setHistory([]);
    setConfirmingClear(false);
    showNotification('Practice history cleared successfully.', 'success');
  };

  // Export JSON
  const handleExportJson = () => {
    if (history.length === 0) {
      showNotification('No history to export.', 'error');
      return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(history, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `toefl_practice_history_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showNotification('Exported JSON history successfully.', 'success');
  };

  // Export CSV
  const handleExportCsv = () => {
    if (history.length === 0) {
      showNotification('No history to export.', 'error');
      return;
    }
    const headers = ['ID', 'Date', 'Section', 'TaskType', 'TaskTitle', 'ScaledScore30', 'BandScore6', 'TimeSpentSeconds'];
    const rows = history.map(r => [
      r.id,
      r.date,
      r.section,
      r.taskType,
      `"${(r.taskTitle || '').replace(/"/g, '""')}"`,
      r.scaledScore30,
      r.bandScore6 || '',
      r.timeSpentSeconds
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `toefl_practice_history_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    showNotification('Exported CSV history successfully.', 'success');
  };

  // Import JSON
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], "UTF-8");
      fileReader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (Array.isArray(parsed)) {
            localStorage.setItem('toefl_prep_history_v1', JSON.stringify(parsed));
            setHistory(parsed);
            showNotification('History imported successfully!', 'success');
          } else {
            showNotification('Invalid JSON format: expected an array of records.', 'error');
          }
        } catch {
          showNotification('Failed to parse JSON file.', 'error');
        }
      };
    }
  };

  // Filtered history for chart & table
  const filteredHistory = activeSectionTab === 'All' 
    ? [...history].reverse() 
    : [...history].filter(h => h.section === activeSectionTab).reverse();

  // SVG Trend Chart generation
  const chartWidth = 600;
  const chartHeight = 160;
  const padding = 25;
  const points = filteredHistory.map((h, i, arr) => {
    const x = arr.length === 1 ? chartWidth / 2 : padding + (i / (arr.length - 1)) * (chartWidth - padding * 2);
    const y = chartHeight - padding - ((h.scaledScore30 / 30) * (chartHeight - padding * 2));
    return { x, y, score: h.scaledScore30, date: h.date, title: h.taskTitle };
  });

  const pathData = points.length > 1 
    ? points.reduce((acc, p, idx) => idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`, '')
    : points.length === 1 ? `M ${points[0].x - 10} ${points[0].y} L ${points[0].x + 10} ${points[0].y}` : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">TOEFL Analytics & Study Projection</h2>
              <p className="text-xs text-slate-500">Track score trends, countdown, and manage backup data</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Goal & Countdown Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 flex items-center gap-3">
            <Target className="w-8 h-8 text-teal-700 shrink-0" />
            <div>
              <div className="text-xs text-teal-700 font-semibold uppercase tracking-wider">Target Score</div>
              <div className="text-xl font-bold font-mono text-teal-950">{targetScore} / 120</div>
              <div className="text-[11px] text-teal-600">Current: {stats.overallScore} / 120</div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
            <Calendar className="w-8 h-8 text-blue-700 shrink-0" />
            <div>
              <div className="text-xs text-blue-700 font-semibold uppercase tracking-wider">Test Countdown</div>
              <div className="text-xl font-bold font-mono text-blue-950">{daysToTest > 0 ? `${daysToTest} Days` : 'Test Day!'}</div>
              <div className="text-[11px] text-blue-600">{testDate || 'No date set'}</div>
            </div>
          </div>

          <div className="bg-slate-900 text-white rounded-xl p-4 flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-teal-400 shrink-0" />
            <div>
              <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Daily Workload</div>
              <div className="text-xl font-bold font-mono text-teal-400">{dailyWorkload} tasks/day</div>
              <div className="text-[11px] text-slate-300">Suggested pacing to reach target</div>
            </div>
          </div>
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

        {/* Score Trend Chart Section */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Score Trend Over Time ({activeSectionTab})
            </h3>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-medium">
              {(['All', 'Reading', 'Listening', 'Speaking', 'Writing'] as const).map(sec => (
                <button
                  key={sec}
                  onClick={() => setActiveSectionTab(sec)}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    activeSectionTab === sec ? 'bg-white text-teal-900 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {sec}
                </button>
              ))}
            </div>
          </div>

          {points.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
              No practice records available for trend analysis.
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-40 overflow-visible">
                {/* Grid lines */}
                {[0, 10, 20, 30].map((score) => {
                  const y = chartHeight - padding - ((score / 30) * (chartHeight - padding * 2));
                  return (
                    <g key={score}>
                      <line x1={padding} y1={y} x2={chartWidth - padding} y2={y} stroke="#e2e8f0" strokeDasharray="4 4" />
                      <text x={padding - 8} y={y + 3} fontSize="10" fill="#94a3b8" textAnchor="end">{score}</text>
                    </g>
                  );
                })}

                {/* Trend Line */}
                {pathData && (
                  <path d={pathData} fill="none" stroke="#0d9488" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                )}

                {/* Data Points */}
                {points.map((p, idx) => (
                  <g key={idx} className="group cursor-pointer">
                    <circle cx={p.x} cy={p.y} r="4" className="fill-teal-700 hover:fill-teal-900 transition-all" />
                    <title>{`${p.title}\nScore: ${p.score}/30\nDate: ${new Date(p.date).toLocaleDateString()}`}</title>
                  </g>
                ))}
              </svg>
            </div>
          )}
        </div>

        {/* Data Backup & Export Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-600 font-medium">
            Data Management: Backup or restore your history & stats.
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleExportJson}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-teal-700" />
              <span>Export JSON</span>
            </button>
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-teal-700" />
              <span>Export CSV</span>
            </button>
            <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer">
              <Upload className="w-3.5 h-3.5 text-teal-700" />
              <span>Import JSON</span>
              <input type="file" accept=".json" onChange={handleImportJson} className="hidden" />
            </label>
          </div>
        </div>

        {statusMessage && (
          <div
            className={`p-3 rounded-lg text-xs font-semibold flex items-center justify-between ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            <span>{statusMessage.text}</span>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-slate-400 hover:text-slate-700 ml-2"
            >
              ×
            </button>
          </div>
        )}

        {/* History Table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Recent Activity ({history.length})
            </h3>
            {history.length > 0 && (
              <div className="flex items-center gap-2">
                {confirmingClear ? (
                  <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 px-2 py-1 rounded-md text-xs">
                    <span className="text-rose-800 text-[11px] font-medium">Clear all?</span>
                    <button
                      onClick={handleClear}
                      className="px-2 py-0.5 font-bold bg-rose-600 text-white rounded hover:bg-rose-700 transition-colors text-[11px]"
                    >
                      Yes, Clear
                    </button>
                    <button
                      onClick={() => setConfirmingClear(false)}
                      className="px-1.5 py-0.5 text-slate-600 hover:text-slate-900 transition-colors text-[11px]"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingClear(true)}
                    className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-800 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear History
                  </button>
                )}
              </div>
            )}
          </div>

          {history.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
              No completed exercises yet. Select a task above and complete it to see your score analysis here!
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
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
