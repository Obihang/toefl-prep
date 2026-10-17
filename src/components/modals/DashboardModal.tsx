import React, { useState, useEffect } from 'react';
import {
  X,
  LayoutDashboard,
  Target,
  Settings,
  BookOpen,
  AlertCircle,
} from 'lucide-react';
import { OverviewTab } from './dashboard/OverviewTab';
import { GoalsTab } from './dashboard/GoalsTab';
import { VocabularyTab } from './dashboard/VocabularyTab';
import { MistakesTab } from './dashboard/MistakesTab';
import { SettingsTab } from './dashboard/SettingsTab';
import {
  getUserStats,
  getCompletedDays,
  getPracticeHistory,
  calculateToeflEstimate,
  convertScaledToBand6,
} from '../../utils/scoreTracker';
import { getVocabularyWords, saveVocabularyWord, deleteVocabularyWord, VocabularyWord } from '../../utils/vocabulary';
import { getQuestionCountsPerSection } from '../../utils/sharedQuestions';

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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'goals' | 'settings' | 'vocabulary' | 'mistakes'>(defaultTab || 'dashboard');
  const [stats, setStats] = useState<any>(null);
  const [completedDays, setCompletedDays] = useState<string[]>([]);
  const [vocab, setVocab] = useState<VocabularyWord[]>([]);

  // Dedicated Goals State
  const [targetScoreInput, setTargetScoreInput] = useState('100');
  const [testDateInput, setTestDateInput] = useState('');
  const [weeklyGoalInput, setWeeklyGoalInput] = useState(5);
  const [goalsSavedSuccess, setGoalsSavedSuccess] = useState(false);

  // New Word Form
  const [newWord, setNewWord] = useState('');
  const [newDef, setNewDef] = useState('');

  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({
    Reading: 0,
    Listening: 0,
    Speaking: 0,
    Writing: 0,
    'Vocabulary & Grammar': 0,
  });
  const [loadingQuestionCounts, setLoadingQuestionCounts] = useState(false);

  useEffect(() => {
    if (defaultTab) {
      setActiveTab(defaultTab);
    }
  }, [defaultTab]);

  useEffect(() => {
    if (isOpen && activeTab === 'settings') {
      setLoadingQuestionCounts(true);
      getQuestionCountsPerSection().then((counts) => {
        setQuestionCounts(counts);
        setLoadingQuestionCounts(false);
      }).catch(() => setLoadingQuestionCounts(false));
    }
  }, [isOpen, activeTab]);

  useEffect(() => {
    if (isOpen) {
      setStats(getUserStats());
      getCompletedDays().then(setCompletedDays).catch(() => setCompletedDays([]));
      getVocabularyWords().then(setVocab).catch(() => setVocab([]));

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

  const targetScoreNum = parseInt(targetScoreInput, 10) || 100;
  const toeflEstimate = calculateToeflEstimate(getPracticeHistory());
  const readinessPct = Math.min(100, Math.round((toeflEstimate.overallScore / (targetScoreNum || 120)) * 100));
  const scoreGap = Math.max(0, targetScoreNum - toeflEstimate.overallScore);

  const daysUntilTest = testDateInput
    ? Math.ceil((new Date(testDateInput).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const weeklyCompleted = stats?.weeklyCompleted || 3;
  const sectionTargetScore = Math.round(targetScoreNum / 4);

  const handleSaveGoals = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('toefl_target_score', targetScoreInput);
    localStorage.setItem('toefl_test_date', testDateInput);
    localStorage.setItem('WEEKLY_GOAL', weeklyGoalInput.toString());
    setGoalsSavedSuccess(true);
    setTimeout(() => setGoalsSavedSuccess(false), 3000);
  };

  const handleAddVocab = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWord.trim() || !newDef.trim()) return;
    await saveVocabularyWord(newWord.trim(), newDef.trim());
    setNewWord('');
    setNewDef('');
    const updated = await getVocabularyWords();
    setVocab(updated);
  };

  const handleDeleteVocab = async (id: string) => {
    await deleteVocabularyWord(id);
    const updated = await getVocabularyWords();
    setVocab(updated);
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
          
          <button
            onClick={() => setActiveTab('goals')}
            className={`py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'goals'
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Target className="w-4 h-4 text-teal-600" />
            <span>Study Goals</span>
            <span className="text-[10px] bg-teal-100 text-teal-800 font-bold px-1.5 py-0.5 rounded-full">
              {targetScoreNum}
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
            <Settings className="w-4 h-4" /> Settings
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
          {activeTab === 'dashboard' && <OverviewTab toeflEstimate={toeflEstimate} stats={stats} />}
          {activeTab === 'goals' && (
            <GoalsTab
              targetScoreNum={targetScoreNum}
              convertScaledToBand6={convertScaledToBand6}
              toeflEstimate={toeflEstimate}
              readinessPct={readinessPct}
              scoreGap={scoreGap}
              daysUntilTest={daysUntilTest}
              testDateInput={testDateInput}
              weeklyGoalInput={weeklyGoalInput}
              weeklyCompleted={weeklyCompleted}
              completedDays={completedDays}
              sectionTargetScore={sectionTargetScore}
              loadingQuestionCounts={loadingQuestionCounts}
              questionCounts={questionCounts}
              goalsSavedSuccess={goalsSavedSuccess}
              targetScoreInput={targetScoreInput}
              setTargetScoreInput={setTargetScoreInput}
              setTestDateInput={setTestDateInput}
              setWeeklyGoalInput={setWeeklyGoalInput}
              handleSaveGoals={handleSaveGoals}
            />
          )}
          {activeTab === 'settings' && <SettingsTab />}
          {activeTab === 'vocabulary' && (
            <VocabularyTab
              vocab={vocab}
              newWord={newWord}
              newDef={newDef}
              setNewWord={setNewWord}
              setNewDef={setNewDef}
              handleAddVocab={handleAddVocab}
              handleDeleteVocab={handleDeleteVocab}
            />
          )}
          {activeTab === 'mistakes' && <MistakesTab />}
        </div>
      </div>
    </div>
  );
};
