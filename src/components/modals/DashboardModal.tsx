import React, { useState, useMemo, useEffect } from 'react';
import { X, User, Settings, Clock, FileText, LayoutDashboard, Calendar, BookOpen, AlertCircle, Key, CheckCircle2, Loader2, Trash2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { SettingsModal } from './SettingsModal';
import { getPracticeHistory, getUserStats, getCompletedDays, getWeakAreas } from '../../utils/scoreTracker';
import { getVocabularyWords, saveVocabularyWord, deleteVocabularyWord, VocabularyWord } from '../../utils/vocabulary';
import { MistakeNotebook } from '../tasks/MistakeNotebook';
import { getStoredApiKey, setStoredApiKey } from '../../utils/apiKey';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  openHistory: () => void;
  openRubrics: () => void;
  defaultTab?: 'dashboard' | 'settings' | 'vocabulary' | 'mistakes';
}

export const DashboardModal: React.FC<Props> = ({ isOpen, onClose, openHistory, openRubrics, defaultTab = 'dashboard' }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'settings' | 'vocabulary' | 'mistakes'>(defaultTab);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [completedDays, setCompletedDays] = useState<string[]>([]);
  const [vocab, setVocab] = useState<VocabularyWord[]>([]);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeySaved, setApiKeySaved] = useState(false);

  const [isTestingKey, setIsTestingKey] = useState(false);
  const [testKeyResult, setTestKeyResult] = useState<{ success?: boolean; message?: string } | null>(null);

  // New Word Form
  const [newWord, setNewWord] = useState('');
  const [newDef, setNewDef] = useState('');

  useEffect(() => {
    if (defaultTab) {
      setActiveTab(defaultTab);
    }
  }, [defaultTab]);

  useEffect(() => {
    if (isOpen) {
      setStats(getUserStats());
      getCompletedDays().then(setCompletedDays).catch(() => setCompletedDays([]));
      getVocabularyWords().then(setVocab).catch(() => setVocab([]));
      setApiKeyInput(getStoredApiKey() || '');
      setApiKeySaved(false);
      setTestKeyResult(null);
    }
  }, [isOpen]);

  const handleTestKey = async () => {
    setIsTestingKey(true);
    setTestKeyResult(null);
    try {
      const res = await fetch('/api/test-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gemini-api-key': apiKeyInput,
        },
        body: JSON.stringify({}),
      });

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('The /api server is not responding. Check the Vercel deployment.');
      }

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Test failed');
      }
      setTestKeyResult({ success: true, message: 'API key is valid and working!' });
    } catch (err: any) {
      setTestKeyResult({ success: false, message: err.message || 'Invalid API key or connection error' });
    } finally {
      setIsTestingKey(false);
    }
  };

  const practiceHistory = useMemo(() => {
    return getPracticeHistory();
  }, [isOpen]);

  const chartData = useMemo(() => {
    const last7: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      last7[key] = 0;
    }

    practiceHistory.forEach(item => {
      const dateKey = (item.date || '').split('T')[0];
      if (last7[dateKey] !== undefined) {
        last7[dateKey] += 1;
      }
    });

    return Object.entries(last7).map(([date, count]) => ({
      name: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
      sessions: count,
    }));
  }, [practiceHistory]);

  const handleAddVocab = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWord.trim() || !newDef.trim()) return;
    try {
      await saveVocabularyWord(newWord.trim(), newDef.trim());
      setVocab(await getVocabularyWords());
      setNewWord('');
      setNewDef('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteVocab = async (id: string) => {
    try {
      await deleteVocabularyWord(id);
      setVocab(await getVocabularyWords());
    } catch (err) {
      console.error(err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-100 rounded-xl text-teal-700">
              <LayoutDashboard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Scholar Dashboard</h2>
              <p className="text-xs text-slate-500">Track performance, manage vocabulary, and configure preferences</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 px-6 bg-slate-50/30 gap-6">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'dashboard'
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" /> Overview &amp; Stats
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'settings'
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Settings className="w-4 h-4" /> Settings &amp; API Key
          </button>
          <button
            onClick={() => setActiveTab('vocabulary')}
            className={`py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'vocabulary'
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <BookOpen className="w-4 h-4" /> Vocabulary Bank ({vocab.length})
          </button>
          <button
            onClick={() => setActiveTab('mistakes')}
            className={`py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'mistakes'
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <AlertCircle className="w-4 h-4" /> Mistake Notebook
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Stat Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-teal-50 border border-teal-100 rounded-2xl p-4 flex items-center gap-4">
                  <div className="p-3 bg-teal-600 text-white rounded-xl">
                    <Clock className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs text-teal-700 font-medium uppercase tracking-wider">Completed Sessions</p>
                    <p className="text-2xl font-bold text-teal-900">{stats?.totalCompleted || 0}</p>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center gap-4">
                  <div className="p-3 bg-amber-600 text-white rounded-xl">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs text-amber-700 font-medium uppercase tracking-wider">Streak Days</p>
                    <p className="text-2xl font-bold text-amber-900">{completedDays.length}</p>
                  </div>
                </div>

                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-center gap-4">
                  <div className="p-3 bg-indigo-600 text-white rounded-xl">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs text-indigo-700 font-medium uppercase tracking-wider">Target TOEFL Score</p>
                    <p className="text-2xl font-bold text-indigo-900">{stats?.targetScore || 100}</p>
                  </div>
                </div>
              </div>

              {/* Activity Chart */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <h3 className="font-semibold text-slate-900 text-sm mb-4">Practice Activity (Last 7 Days)</h3>
                <div className="h-48 w-full">
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
              </div>

              {/* Weak Areas */}
              <div className="bg-rose-50 rounded-xl border border-rose-100 p-4">
                <h3 className="font-semibold text-rose-900 text-sm mb-2">Weak Areas Detected</h3>
                {getWeakAreas(practiceHistory).length > 0 ? (
                  <div className="space-y-2">
                    {getWeakAreas(practiceHistory).map(area => (
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
            <div className="space-y-6">
              <div className="space-y-3">
                <h3 className="font-semibold text-slate-900">Study Goals &amp; Preferences</h3>
                <button 
                  onClick={() => setIsSettingsOpen(true)}
                  className="w-full flex items-center justify-between p-4 border border-teal-200 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors"
                >
                  <span className="text-sm font-medium text-teal-900">Configure Study Goals &amp; Test Date</span>
                  <Settings className="w-4 h-4 text-teal-600" />
                </button>
              </div>

              <div className="space-y-3 pt-4 border-t border-slate-200">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Key className="w-4 h-4 text-teal-700" />
                  Gemini API Key
                </h3>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={apiKeyInput}
                    onChange={(e) => {
                      setApiKeyInput(e.target.value);
                      setApiKeySaved(false);
                      setTestKeyResult(null);
                    }}
                    placeholder="AIzaSy..."
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:border-teal-600 outline-hidden font-mono"
                  />
                  <div className="p-3 bg-teal-50/60 border border-teal-200 rounded-xl space-y-1.5 text-xs text-teal-900">
                    <p className="font-semibold">Quick setup guide:</p>
                    <ol className="list-decimal list-inside space-y-1 text-slate-700">
                      <li>Create your free API key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-teal-700 underline font-medium">Google AI Studio</a>.</li>
                      <li>Copy your API key.</li>
                      <li>Paste it here and click <strong>Test Key</strong>.</li>
                    </ol>
                  </div>
                  <p className="text-xs text-slate-500 italic">
                    Stored only in this browser. It is sent with each request to this app's server only to call Gemini, and is not saved there.
                  </p>
                  
                  {testKeyResult && (
                    <div className={`p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${testKeyResult.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
                      {testKeyResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
                      <span>{testKeyResult.message}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setStoredApiKey(apiKeyInput);
                          setApiKeySaved(true);
                          setTimeout(() => setApiKeySaved(false), 2000);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-lg transition-colors"
                      >
                        Save API Key
                      </button>
                      <button
                        onClick={handleTestKey}
                        disabled={isTestingKey || !apiKeyInput.trim()}
                        className="px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-300 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {isTestingKey && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Test Key
                      </button>
                    </div>
                    {apiKeySaved && (
                      <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Saved!
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'vocabulary' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-slate-900">Vocabulary Bank</h3>
              
              {/* Add Word Form */}
              <form onSubmit={handleAddVocab} className="p-4 bg-slate-50 rounded-xl space-y-3 border border-slate-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input 
                    type="text" 
                    placeholder="New Word or Idiom" 
                    value={newWord} 
                    onChange={e => setNewWord(e.target.value)} 
                    className="w-full text-sm p-2.5 bg-white border border-slate-300 rounded-lg focus:border-teal-600 outline-hidden" 
                  />
                  <input 
                    type="text" 
                    placeholder="Definition / Context" 
                    value={newDef} 
                    onChange={e => setNewDef(e.target.value)} 
                    className="w-full text-sm p-2.5 bg-white border border-slate-300 rounded-lg focus:border-teal-600 outline-hidden" 
                  />
                </div>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-teal-800 text-white text-xs font-semibold rounded-lg hover:bg-teal-900 transition-colors"
                >
                  Add to Vocabulary Bank
                </button>
              </form>

              {/* Vocab List */}
              <div className="space-y-2">
                {vocab.length === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center">No saved vocabulary words yet. Add words you encounter during practice!</p>
                ) : (
                  vocab.map(item => (
                    <div key={item.id} className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
                      <div>
                        <p className="font-bold text-slate-900 text-sm">{item.word}</p>
                        <p className="text-xs text-slate-600">{item.definition}</p>
                      </div>
                      <button 
                        onClick={() => handleDeleteVocab(item.id)}
                        className="text-slate-400 hover:text-rose-600 p-1 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'mistakes' && (
            <MistakeNotebook />
          )}
        </div>

      </div>

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />
    </div>
  );
};
