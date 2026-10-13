import React, { useState, useMemo, useEffect } from 'react';
import { X, User, Settings, Clock, FileText, LayoutDashboard, Calendar, BookOpen, AlertCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { SettingsModal } from './SettingsModal';
import { getPracticeHistory, getUserStats, getCompletedDays, getWeakAreas } from '../../utils/scoreTracker';
import { getVocabularyWords, saveVocabularyWord, deleteVocabularyWord, VocabularyWord } from '../../utils/vocabulary';
import { MistakeNotebook } from '../tasks/MistakeNotebook';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  openHistory: () => void;
  openRubrics: () => void;
}

export const DashboardModal: React.FC<Props> = ({ isOpen, onClose, openHistory, openRubrics }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'settings' | 'vocabulary' | 'mistakes'>('dashboard');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [completedDays, setCompletedDays] = useState<string[]>([]);
  const [vocab, setVocab] = useState<VocabularyWord[]>([]);

  useEffect(() => {
    if (isOpen) {
      getUserStats().then(setStats);
      getCompletedDays().then(setCompletedDays);
      getVocabularyWords().then(setVocab);
    }
  }, [isOpen]);

  const chartData = useMemo(() => {
    const history = getPracticeHistory();
    const last7Days: { name: string; sessions: number }[] = [];
    const now = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('en-US', { weekday: 'short' });
      
      const count = history.filter(h => {
        const recordDate = new Date(h.date);
        return recordDate.toDateString() === d.toDateString();
      }).length;
      
      last7Days.push({ name: dateStr, sessions: count });
    }
    return last7Days;
  }, [isOpen]);

  const calendarGrid = useMemo(() => {
    const days = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split('T')[0]);
    }
    return days;
  }, []);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
        <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center">
                <LayoutDashboard className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Dashboard</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Sidebar Navigation */}
            <div className="md:col-span-1 space-y-2">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  activeTab === 'dashboard' ? 'bg-teal-50 text-teal-800' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <User className="w-4 h-4" />
                Profile
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  activeTab === 'settings' ? 'bg-teal-50 text-teal-800' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Settings className="w-4 h-4" />
                Settings
              </button>
              <button
                onClick={() => setActiveTab('vocabulary')}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  activeTab === 'vocabulary' ? 'bg-teal-50 text-teal-800' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                Vocabulary Bank
              </button>
              <button
                onClick={() => setActiveTab('mistakes')}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  activeTab === 'mistakes' ? 'bg-teal-50 text-teal-800' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <AlertCircle className="w-4 h-4" />
                Mistake Notebook
              </button>
            </div>

            {/* Content Area */}
            <div className="md:col-span-3">
              {activeTab === 'dashboard' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-teal-50 rounded-xl border border-teal-100 text-center">
                      <div className="text-3xl font-bold text-teal-800">{stats?.currentStreak || 0}</div>
                      <div className="text-sm text-teal-600 font-semibold">Day Streak</div>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <h3 className="font-semibold text-slate-900 text-sm mb-2 flex items-center gap-2"><Calendar className="w-4 h-4"/> Recent Activity</h3>
                      <div className="grid grid-cols-6 gap-1">
                        {calendarGrid.map(day => (
                          <div key={day} className={`w-6 h-6 rounded-sm ${completedDays.includes(day) ? 'bg-teal-500' : 'bg-slate-200'}`}></div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="h-48 w-full bg-slate-50 rounded-xl border border-slate-100 p-4">
                    <h3 className="font-semibold text-slate-900 mb-4 text-sm">Practice Sessions (Last 7 Days)</h3>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Line type="monotone" dataKey="sessions" stroke="#0d9488" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Weak Areas */}
                  <div className="bg-rose-50 rounded-xl border border-rose-100 p-4">
                    <h3 className="font-semibold text-rose-900 text-sm mb-2">Weak Areas Detected</h3>
                    {getWeakAreas(getPracticeHistory()).length > 0 ? (
                      <div className="space-y-2">
                        {getWeakAreas(getPracticeHistory()).map(area => (
                          <div key={area.section} className="flex justify-between text-sm text-rose-800">
                            <span>{area.section}</span>
                            <span className="font-bold">{area.avgScore}/30</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-rose-600">No major weak areas detected yet!</p>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 gap-3">
                    <button onClick={openHistory} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                      <span className="text-sm font-medium text-slate-700 flex items-center gap-2"><Clock className="w-4 h-4 text-teal-600"/> View Performance History</span>
                    </button>
                    <button onClick={openRubrics} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                      <span className="text-sm font-medium text-slate-700 flex items-center gap-2"><FileText className="w-4 h-4 text-teal-600"/> View Rubrics</span>
                    </button>
                  </div>
                </div>
              )}
              
              {activeTab === 'settings' && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-900">Application Settings</h3>
                  <button 
                    onClick={() => setIsSettingsOpen(true)}
                    className="w-full flex items-center justify-between p-4 border border-teal-200 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors"
                  >
                    <span className="text-sm font-medium text-teal-900">Manage API Keys</span>
                    <Settings className="w-4 h-4 text-teal-600" />
                  </button>
                </div>
              )}

              {activeTab === 'vocabulary' && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-900">Vocabulary Bank</h3>
                  
                  {/* Add Word Form */}
                  <div className="p-4 bg-slate-50 rounded-lg space-y-2">
                    <input type="text" placeholder="Word" id="new-word" className="w-full p-2 border rounded text-sm"/>
                    <input type="text" placeholder="Definition" id="new-definition" className="w-full p-2 border rounded text-sm"/>
                    <button 
                      onClick={async () => {
                        const w = (document.getElementById('new-word') as HTMLInputElement).value;
                        const d = (document.getElementById('new-definition') as HTMLInputElement).value;
                        if(w && d) {
                          await saveVocabularyWord(w, d);
                          getVocabularyWords().then(setVocab);
                          (document.getElementById('new-word') as HTMLInputElement).value = '';
                          (document.getElementById('new-definition') as HTMLInputElement).value = '';
                        }
                      }}
                      className="w-full bg-teal-600 text-white p-2 rounded text-sm font-semibold hover:bg-teal-700"
                    >
                      Save Word
                    </button>
                  </div>

                  {/* Words List */}
                  <div className="h-64 overflow-y-auto space-y-2">
                    {vocab.map((v) => (
                      <div key={v.id} className="p-3 border rounded flex justify-between items-start">
                        <div>
                          <p className="font-bold text-sm text-teal-800">{v.word}</p>
                          <p className="text-sm text-slate-600">{v.definition}</p>
                        </div>
                        <button onClick={() => deleteVocabularyWord(v.id).then(() => getVocabularyWords().then(setVocab))} className="text-red-500 hover:text-red-700">Delete</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'mistakes' && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-900">Mistake Notebook</h3>
                  <MistakeNotebook />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </>
  );
};
