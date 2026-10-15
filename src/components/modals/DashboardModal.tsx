import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  User,
  Settings,
  Clock,
  FileText,
  LayoutDashboard,
  Calendar,
  BookOpen,
  AlertCircle,
  Key,
  CheckCircle2,
  Loader2,
  Trash2,
  Target,
  Trophy,
  Flame,
  TrendingUp,
  Compass,
  ArrowRight,
  Sparkles,
  Zap,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { SettingsModal } from './SettingsModal';
import {
  getPracticeHistory,
  getUserStats,
  getCompletedDays,
  getWeakAreas,
  calculateToeflEstimate,
  convertScaledToBand6,
} from '../../utils/scoreTracker';
import { getVocabularyWords, saveVocabularyWord, deleteVocabularyWord, VocabularyWord } from '../../utils/vocabulary';
import { MistakeNotebook } from '../tasks/MistakeNotebook';
import {
  getStoredApiKey,
  setStoredApiKey,
  getStoredProvider,
  setStoredProvider,
  getStoredBaseUrl,
  setStoredBaseUrl,
  getStoredModel,
  setStoredModel,
  PROVIDERS,
  ApiProvider,
} from '../../utils/apiKey';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  openHistory: () => void;
  openRubrics: () => void;
  defaultTab?: 'dashboard' | 'goals' | 'settings' | 'vocabulary' | 'mistakes';
}

export const DashboardModal: React.FC<Props> = ({
  isOpen,
  onClose,
  openHistory,
  openRubrics,
  defaultTab = 'dashboard',
}) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'goals' | 'settings' | 'vocabulary' | 'mistakes'>(defaultTab);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [completedDays, setCompletedDays] = useState<string[]>([]);
  const [vocab, setVocab] = useState<VocabularyWord[]>([]);
  const [provider, setProvider] = useState<ApiProvider>('gemini');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [baseUrlInput, setBaseUrlInput] = useState('');
  const [modelInput, setModelInput] = useState('');
  const [apiKeySaved, setApiKeySaved] = useState(false);

  // Dedicated Goals State
  const [targetScoreInput, setTargetScoreInput] = useState('100');
  const [testDateInput, setTestDateInput] = useState('');
  const [weeklyGoalInput, setWeeklyGoalInput] = useState(5);
  const [goalsSavedSuccess, setGoalsSavedSuccess] = useState(false);

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
      const currentProvider = getStoredProvider();
      setProvider(currentProvider);
      setApiKeyInput(getStoredApiKey() || '');
      setBaseUrlInput(getStoredBaseUrl());
      setModelInput(getStoredModel());
      setApiKeySaved(false);
      setTestKeyResult(null);

      // Load study goals from storage
      const storedTarget = localStorage.getItem('toefl_target_score') || '100';
      const storedDate = localStorage.getItem('toefl_test_date') || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
      const storedWeekly = parseInt(localStorage.getItem('WEEKLY_GOAL') || '5', 10);
      setTargetScoreInput(storedTarget);
      setTestDateInput(storedDate);
      setWeeklyGoalInput(isNaN(storedWeekly) ? 5 : storedWeekly);
      setGoalsSavedSuccess(false);
    }
  }, [isOpen]);

  const handleProviderSelect = (newProvider: ApiProvider) => {
    setProvider(newProvider);
    setStoredProvider(newProvider);
    const defBase = PROVIDERS[newProvider].defaultBaseUrl;
    const defModel = PROVIDERS[newProvider].defaultModel;
    setBaseUrlInput(defBase);
    setStoredBaseUrl(defBase);
    setModelInput(defModel);
    setStoredModel(defModel);
    setTestKeyResult(null);
  };

  const handleTestKey = async () => {
    setIsTestingKey(true);
    setTestKeyResult(null);
    try {
      const trimmedKey = apiKeyInput.trim();
      const trimmedBaseUrl = baseUrlInput.trim();
      const trimmedModel = modelInput.trim();

      if (!trimmedKey && provider !== 'custom') {
        throw new Error(`Please enter your ${PROVIDERS[provider]?.name || 'API'} key first.`);
      }

      const res = await fetch('/api/test-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-provider': provider,
          'x-api-key': trimmedKey,
          'x-api-base-url': trimmedBaseUrl,
          'x-api-model': trimmedModel,
          'x-gemini-api-key': trimmedKey,
        },
        body: JSON.stringify({
          provider,
          apiKey: trimmedKey,
          baseUrl: trimmedBaseUrl,
          model: trimmedModel,
        }),
      });

      if (res.status === 404) {
        throw new Error('The /api server is not responding.');
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('The /api server is not responding.');
      }

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || json.message || 'Key test failed');
      }

      setStoredProvider(provider);
      setStoredApiKey(trimmedKey);
      setStoredBaseUrl(trimmedBaseUrl);
      setStoredModel(trimmedModel);
      setApiKeySaved(true);
      window.dispatchEvent(new CustomEvent('apiKeyUpdated'));
      setTestKeyResult({ success: true, message: json.message || `Connected successfully to ${PROVIDERS[provider].name}` });
    } catch (err: any) {
      setTestKeyResult({ success: false, message: err.message || 'Connection error. Check key, URL, and model name.' });
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

  // Derived Goal Metrics
  const toeflEstimate = useMemo(() => {
    return calculateToeflEstimate(practiceHistory);
  }, [practiceHistory]);

  const daysUntilTest = useMemo(() => {
    if (!testDateInput) return null;
    const target = new Date(testDateInput).getTime();
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.ceil((target - now.getTime()) / (1000 * 60 * 60 * 24));
  }, [testDateInput]);

  const weeklyCompleted = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    return practiceHistory.filter((r) => new Date(r.date) >= startOfWeek).length;
  }, [practiceHistory]);

  const targetScoreNum = parseInt(targetScoreInput, 10) || 100;
  const sectionTargetScore = Math.round(targetScoreNum / 4);
  const readinessPct = Math.min(100, Math.max(0, Math.round((toeflEstimate.overallScore / targetScoreNum) * 100)));
  const scoreGap = targetScoreNum - toeflEstimate.overallScore;

  const handleSaveGoals = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const val = Math.max(0, Math.min(120, parseInt(targetScoreInput, 10) || 100));
    setTargetScoreInput(val.toString());
    localStorage.setItem('toefl_target_score', val.toString());
    if (testDateInput) {
      localStorage.setItem('toefl_test_date', testDateInput);
    }
    const weeklyVal = Math.max(1, weeklyGoalInput || 5);
    setWeeklyGoalInput(weeklyVal);
    localStorage.setItem('WEEKLY_GOAL', weeklyVal.toString());

    setStats((prev: any) => ({ ...prev, targetScore: val }));
    setGoalsSavedSuccess(true);
    setTimeout(() => setGoalsSavedSuccess(false), 3000);
  };

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
              <p className="text-xs text-slate-500">Track performance, manage study goals, and configure preferences</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs Bar */}
        <div className="flex border-b border-slate-100 px-6 bg-slate-50/30 gap-6 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'dashboard'
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" /> Overview &amp; Stats
          </button>
          
          {/* Dedicated Goals Tab */}
          <button
            onClick={() => setActiveTab('goals')}
            className={`py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'goals'
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Target className="w-4 h-4 text-teal-600" />
            <span>Study Goals &amp; Readiness</span>
            <span className="text-[10px] bg-teal-100 text-teal-800 font-bold px-1.5 py-0.5 rounded-full">
              {stats?.targetScore || 100}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'settings'
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Settings className="w-4 h-4" /> Settings &amp; API Key
          </button>
          
          <button
            onClick={() => setActiveTab('vocabulary')}
            className={`py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'vocabulary'
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <BookOpen className="w-4 h-4" /> Vocabulary Bank ({vocab.length})
          </button>
          
          <button
            onClick={() => setActiveTab('mistakes')}
            className={`py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
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
          
          {/* TAB 1: OVERVIEW & STATS */}
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

                <div 
                  onClick={() => setActiveTab('goals')}
                  className="bg-indigo-50 hover:bg-indigo-100/70 border border-indigo-100 rounded-2xl p-4 flex items-center gap-4 cursor-pointer transition-colors group"
                  title="Click to view full Goals section"
                >
                  <div className="p-3 bg-indigo-600 text-white rounded-xl group-hover:scale-105 transition-transform">
                    <Target className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-indigo-700 font-medium uppercase tracking-wider">Target TOEFL Score</p>
                      <ArrowRight className="w-3.5 h-3.5 text-indigo-400 group-hover:translate-x-1 transition-transform" />
                    </div>
                    <p className="text-2xl font-bold text-indigo-900">{stats?.targetScore || 100}</p>
                  </div>
                </div>
              </div>

              {/* Activity Chart */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <h3 className="font-semibold text-slate-900 text-sm mb-2">Study Consistency Trend</h3>
                <p className="text-[10px] text-slate-400 mb-4">Tasks completed per day over the last week</p>
                <div className="h-32 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis hide allowDecimals={false} />
                      <Tooltip cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }} />
                      <Line type="monotone" dataKey="sessions" stroke="#0d9488" strokeWidth={2} dot={{ r: 3 }} />
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
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button onClick={openHistory} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                  <span className="text-sm font-medium text-slate-700 flex items-center gap-2"><Clock className="w-4 h-4 text-teal-600"/> View Performance History</span>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </button>
                <button onClick={openRubrics} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                  <span className="text-sm font-medium text-slate-700 flex items-center gap-2"><FileText className="w-4 h-4 text-teal-600"/> View Scoring Rubrics</span>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: SEPARATE DEDICATED GOALS SECTION */}
          {activeTab === 'goals' && (
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

            </div>
          )}

          {/* TAB 3: SETTINGS & API KEY */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div className="space-y-3">
                <h3 className="font-semibold text-slate-900">Study Goals &amp; Preferences</h3>
                <button 
                  onClick={() => setIsSettingsOpen(true)}
                  className="w-full flex items-center justify-between p-4 border border-teal-200 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors cursor-pointer"
                >
                  <span className="text-sm font-medium text-teal-900">Configure Display Name, Voice Engine, Microphone &amp; Cursor Style</span>
                  <Settings className="w-4 h-4 text-teal-600" />
                </button>
              </div>

              <div className="space-y-4 pt-4 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <Key className="w-4 h-4 text-teal-700" />
                    AI Provider &amp; API Key
                  </h3>
                  <span className="text-[11px] font-medium text-teal-800 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200">
                    Works with Any API
                  </span>
                </div>

                {/* Provider Selector Buttons */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Choose AI Provider</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {(Object.keys(PROVIDERS) as ApiProvider[]).map((pKey) => {
                      const p = PROVIDERS[pKey];
                      const isSelected = provider === pKey;
                      return (
                        <button
                          key={pKey}
                          type="button"
                          onClick={() => handleProviderSelect(pKey)}
                          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'border-teal-600 bg-teal-50/80 text-teal-950 font-bold ring-2 ring-teal-600/20 shadow-xs'
                              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="text-xs font-semibold leading-tight">{p.name}</div>
                          <div className="text-[10px] text-slate-400 font-normal truncate mt-0.5">{p.defaultModel}</div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-slate-500 pt-0.5">
                    {PROVIDERS[provider]?.helpText}
                  </p>
                </div>

                {/* API Key Input */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700">
                      {PROVIDERS[provider]?.name} API Key
                    </label>
                    {PROVIDERS[provider]?.keyHelpUrl && (
                      <a
                        href={PROVIDERS[provider].keyHelpUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-teal-700 hover:text-teal-900 underline font-semibold"
                      >
                        Get Key &rarr;
                      </a>
                    )}
                  </div>
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => {
                      setApiKeyInput(e.target.value);
                      setApiKeySaved(false);
                      setTestKeyResult(null);
                    }}
                    placeholder={PROVIDERS[provider]?.placeholderKey || 'Paste API Key'}
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:border-teal-600 outline-hidden font-mono"
                  />
                </div>

                {/* Base URL (editable for non-gemini or custom) */}
                {provider !== 'gemini' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">API Base URL</label>
                      <input
                        type="text"
                        value={baseUrlInput}
                        onChange={(e) => {
                          setBaseUrlInput(e.target.value);
                          setApiKeySaved(false);
                        }}
                        placeholder="https://api.openai.com/v1"
                        className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:border-teal-600 outline-hidden font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">Model Name</label>
                      <input
                        type="text"
                        value={modelInput}
                        onChange={(e) => {
                          setModelInput(e.target.value);
                          setApiKeySaved(false);
                        }}
                        placeholder={PROVIDERS[provider]?.defaultModel || 'gpt-4o-mini'}
                        className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:border-teal-600 outline-hidden font-mono"
                      />
                    </div>
                  </div>
                )}

                {testKeyResult && (
                  <div
                    className={`p-3 rounded-lg text-xs font-semibold flex items-center gap-2 ${
                      testKeyResult.success
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}
                  >
                    {testKeyResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    <span>{testKeyResult.message}</span>
                  </div>
                )}

                <div className="flex gap-2 justify-end pt-1">
                  <button
                    onClick={handleTestKey}
                    disabled={isTestingKey || (!apiKeyInput.trim() && provider !== 'custom')}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
                  >
                    {isTestingKey && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>{isTestingKey ? 'Verifying...' : `Test & Save ${PROVIDERS[provider]?.name || 'Provider'}`}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: VOCABULARY BANK */}
          {activeTab === 'vocabulary' && (
            <div className="space-y-6">
              <form onSubmit={handleAddVocab} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <h3 className="font-semibold text-slate-900 text-sm">Add New Vocabulary Word</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={newWord}
                    onChange={(e) => setNewWord(e.target.value)}
                    placeholder="Word (e.g. Ubiquitous)"
                    className="text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 outline-hidden focus:border-teal-600"
                  />
                  <input
                    type="text"
                    value={newDef}
                    onChange={(e) => setNewDef(e.target.value)}
                    placeholder="Definition / Context"
                    className="text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 outline-hidden focus:border-teal-600"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-teal-800 hover:bg-teal-900 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    Save Word
                  </button>
                </div>
              </form>

              <div className="space-y-2">
                <h3 className="font-semibold text-slate-900 text-sm">Saved Words ({vocab.length})</h3>
                {vocab.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">No vocabulary saved yet. Save challenging words from practice questions!</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto">
                    {vocab.map((v) => (
                      <div key={v.id} className="p-3 border border-slate-200 rounded-xl flex items-start justify-between gap-2 bg-white">
                        <div>
                          <p className="font-bold text-sm text-slate-900">{v.word}</p>
                          <p className="text-xs text-slate-600">{v.definition}</p>
                        </div>
                        <button
                          onClick={() => handleDeleteVocab(v.id)}
                          className="text-slate-400 hover:text-rose-600 p-1 rounded-lg transition-colors cursor-pointer"
                          title="Delete word"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: MISTAKE NOTEBOOK */}
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
