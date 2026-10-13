/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { getPracticeHistory } from './utils/scoreTracker';
import { getRecommendedLevel } from './utils/difficulty';
import { DashboardModal } from './components/modals/DashboardModal';
import { db, auth } from './firebase';
import { addDoc, collection } from 'firebase/firestore';
import {
  BookOpen,
  Headphones,
  Mic,
  PenTool,
  Sparkles,
  BarChart2,
  FileText,
  Clock,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ChevronRight,
  Settings,
  Sun,
  Moon,
} from 'lucide-react';

import {
  CURATED_COMPLETE_WORDS,
  CURATED_READING_PASSAGES,
  CURATED_LISTENING,
  CURATED_LISTEN_REPEAT,
  CURATED_SPEAKING_INTERVIEWS,
  CURATED_BUILD_SENTENCES,
  CURATED_WRITE_EMAILS,
  CURATED_ACADEMIC_DISCUSSIONS,
  CompleteWordsTask,
  ReadingPassageTask,
  ListeningTask,
  ListenRepeatTask,
  SpeakingInterviewTask,
  BuildSentenceTask,
  WriteEmailTask,
  AcademicDiscussionTask,
} from './data/curatedQuestions';

import { CompleteWordsView } from './components/tasks/CompleteWordsView';
import { ReadingPassageView } from './components/tasks/ReadingPassageView';
import { ListeningDialogueView } from './components/tasks/ListeningDialogueView';
import { ListenRepeatView } from './components/tasks/ListenRepeatView';
import { SpeakingInterviewView } from './components/tasks/SpeakingInterviewView';
import { BuildSentenceView } from './components/tasks/BuildSentenceView';
import { WriteEmailView } from './components/tasks/WriteEmailView';
import { AcademicDiscussionView } from './components/tasks/AcademicDiscussionView';
import { RubricGuideModal } from './components/modals/RubricGuideModal';
import { PerformanceHistoryModal } from './components/modals/PerformanceHistoryModal';
import { WeeklyGoalTracker } from './components/WeeklyGoalTracker';
import { MockTestView } from './components/tasks/MockTestView';

export type TaskTypeId =
  | 'complete-words'
  | 'reading-passage'
  | 'listening-dialogue'
  | 'listen-repeat'
  | 'speaking-interview'
  | 'build-sentence'
  | 'write-email'
  | 'academic-discussion';

export interface TaskDefinition {
  id: TaskTypeId;
  name: string;
  section: 'Reading' | 'Listening' | 'Speaking' | 'Writing';
  description: string;
}

const TASK_DEFINITIONS: TaskDefinition[] = [
  {
    id: 'complete-words',
    name: 'Complete the Words',
    section: 'Reading',
    description: 'C-Test: Academic paragraph with masked second halves of content words',
  },
  {
    id: 'reading-passage',
    name: 'Reading Passage',
    section: 'Reading',
    description: 'Academic text with 3 multiple-choice comprehension questions',
  },
  {
    id: 'listening-dialogue',
    name: 'Listening Audio',
    section: 'Listening',
    description: 'Campus conversation or lecture excerpt with audio simulation and questions',
  },
  {
    id: 'listen-repeat',
    name: 'Listen & Repeat',
    section: 'Speaking',
    description: 'Progressive sentences with speech synthesis and voice recognition accuracy',
  },
  {
    id: 'speaking-interview',
    name: 'Take an Interview',
    section: 'Speaking',
    description: '4 academic interview questions with official prep & speaking countdowns',
  },
  {
    id: 'build-sentence',
    name: 'Build a Sentence',
    section: 'Writing',
    description: 'Sentence scramble: tap tiles in correct sequence to form valid syntax',
  },
  {
    id: 'write-email',
    name: 'Write an Email',
    section: 'Writing',
    description: 'Campus scenario: achieve 3 goals with appropriate tone and word count',
  },
  {
    id: 'academic-discussion',
    name: 'Academic Discussion',
    section: 'Writing',
    description: 'Post in a university course forum engaging with professor & classmate views',
  },
];

export default function App() {
  const [currentTaskType, setCurrentTaskType] = useState<TaskTypeId>('academic-discussion');
  const [level, setLevel] = useState('upper-intermediate');
  const [topic, setTopic] = useState('science-tech');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationSuccess, setGenerationSuccess] = useState(false);
  const [isMockTest, setIsMockTest] = useState(false);

  // Active task payload per type
  const [customTasks, setCustomTasks] = useState<Record<string, any>>({});
  const [curatedIndices, setCuratedIndices] = useState<Record<string, number>>({
    'complete-words': 0,
    'reading-passage': 0,
    'listening-dialogue': 0,
    'listen-repeat': 0,
    'speaking-interview': 0,
    'build-sentence': 0,
    'write-email': 0,
    'academic-discussion': 0,
  });

  // Modals
  const [isRubricsOpen, setIsRubricsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);

  // Dark Mode
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('toefl_dark_mode') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('toefl_dark_mode', darkMode ? 'true' : 'false');
  }, [darkMode]);

  // Keyboard shortcuts: 'N' for next task, 'Space' to pause/resume exam timer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        handleNextCurated(currentTaskType);
      }
      if (e.key === ' ') {
        if (isExamMode) {
          e.preventDefault();
          setIsPaused((prev) => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExamMode, currentTaskType]);

  // Exam mode timer (optional simulation clock)
  const [isExamMode, setIsExamMode] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [examSecondsRemaining, setExamSecondsRemaining] = useState(1800); // 30 min timer

  useEffect(() => {
    const history = getPracticeHistory();
    const recommended = getRecommendedLevel(history);
    const map: Record<string, string> = {
      'beginner': 'intermediate',
      'intermediate': 'upper-intermediate',
      'advanced': 'advanced'
    };
    setLevel(map[recommended]);
  }, []);

  useEffect(() => {
    let interval: any = null;
    if (isExamMode && !isPaused && examSecondsRemaining > 0) {
      interval = setInterval(() => {
        setExamSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isExamMode, isPaused, examSecondsRemaining]);

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Next item in curated pool
  const handleNextCurated = (type: TaskTypeId) => {
    let max = 1;
    if (type === 'complete-words') max = CURATED_COMPLETE_WORDS.length;
    if (type === 'reading-passage') max = CURATED_READING_PASSAGES.length;
    if (type === 'listening-dialogue') max = CURATED_LISTENING.length;
    if (type === 'listen-repeat') max = CURATED_LISTEN_REPEAT.length;
    if (type === 'speaking-interview') max = CURATED_SPEAKING_INTERVIEWS.length;
    if (type === 'build-sentence') max = CURATED_BUILD_SENTENCES.length;
    if (type === 'write-email') max = CURATED_WRITE_EMAILS.length;
    if (type === 'academic-discussion') max = CURATED_ACADEMIC_DISCUSSIONS.length;

    // Clear custom task for this type so next curated item shows
    setCustomTasks((prev) => {
      const next = { ...prev };
      delete next[type];
      return next;
    });

    setCuratedIndices((prev) => {
      const current = prev[type];
      if (max <= 1) return { ...prev, [type]: 0 };
      let next;
      do {
        next = Math.floor(Math.random() * max);
      } while (next === current);
      return { ...prev, [type]: next };
    });
  };

  // Generate fresh task using Server-side Gemini API
  const handleGenerateNewAiTask = async () => {
    setIsGenerating(true);
    setGenerationError(null);
    setGenerationSuccess(false);

    try {
      const res = await fetch('/api/generate-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskType: currentTaskType,
          level,
          topic,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Generation failed');
      }

      const newTask = {
        ...json.data,
        level,
        topic,
        id: `ai-${Date.now()}`,
      };

      if (auth.currentUser) {
        try {
          await addDoc(collection(db, 'questions'), {
            userId: auth.currentUser.uid,
            taskType: currentTaskType,
            level,
            topic,
            data: newTask,
            createdAt: new Date().toISOString(),
          });
        } catch (e) {
          console.error('Failed to save to Firestore:', e);
        }
      }

      setCustomTasks((prev) => ({
        ...prev,
        [currentTaskType]: newTask,
      }));
      setGenerationSuccess(true);
      setTimeout(() => setGenerationSuccess(false), 3000);
    } catch (err: any) {
      console.error('AI generation error:', err);
      setGenerationError(
        'The AI is taking a moment to catch up. Here is a curated question from our bank while we work on your custom task.'
      );
      handleNextCurated(currentTaskType);
    } finally {
      setIsGenerating(false);
    }
  };

  // Resolve current active task data
  const getCurrentTaskData = () => {
    if (customTasks[currentTaskType]) {
      return customTasks[currentTaskType];
    }

    const idx = curatedIndices[currentTaskType] || 0;
    switch (currentTaskType) {
      case 'complete-words':
        return CURATED_COMPLETE_WORDS[idx % CURATED_COMPLETE_WORDS.length];
      case 'reading-passage':
        return CURATED_READING_PASSAGES[idx % CURATED_READING_PASSAGES.length];
      case 'listening-dialogue':
        return CURATED_LISTENING[idx % CURATED_LISTENING.length];
      case 'listen-repeat':
        return CURATED_LISTEN_REPEAT[idx % CURATED_LISTEN_REPEAT.length];
      case 'speaking-interview':
        return CURATED_SPEAKING_INTERVIEWS[idx % CURATED_SPEAKING_INTERVIEWS.length];
      case 'build-sentence':
        return CURATED_BUILD_SENTENCES[idx % CURATED_BUILD_SENTENCES.length];
      case 'write-email':
        return CURATED_WRITE_EMAILS[idx % CURATED_WRITE_EMAILS.length];
      case 'academic-discussion':
      default:
        return CURATED_ACADEMIC_DISCUSSIONS[idx % CURATED_ACADEMIC_DISCUSSIONS.length];
    }
  };

  const activeTask = getCurrentTaskData();
  const currentTaskDef = TASK_DEFINITIONS.find((t) => t.id === currentTaskType)!;

  return (
    <div className={`min-h-screen font-sans antialiased selection:bg-teal-200 selection:text-teal-950 flex flex-col motion-reduce:transition-none ${darkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-[#fafaf8] text-slate-900'}`}>
      {/* Top Bar Contract: 3 Zones (Wordmark - 4 Nav Links - 1 Action CTA) */}
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur-xs sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="/"
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 flex items-center gap-2"
          >
            <span className="w-8 h-8 rounded-lg bg-teal-800 text-white font-bold flex items-center justify-center text-sm shadow-xs">
              T
            </span>
            <span>TOEFL Prep Studio</span>
          </a>

          {/* Zone 2: 4-5 single-line clean text navigation links */}
          <nav className="hidden md:flex items-center gap-6 text-xs sm:text-sm font-medium text-slate-600">
            <button
              onClick={() => setCurrentTaskType('complete-words')}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                currentTaskDef.section === 'Reading' ? 'text-teal-800 font-semibold' : ''
              }`}
            >
              Reading
            </button>
            <button
              onClick={() => setCurrentTaskType('listening-dialogue')}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                currentTaskDef.section === 'Listening' ? 'text-teal-800 font-semibold' : ''
              }`}
            >
              Listening
            </button>
            <button
              onClick={() => setCurrentTaskType('speaking-interview')}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                currentTaskDef.section === 'Speaking' ? 'text-teal-800 font-semibold' : ''
              }`}
            >
              Speaking
            </button>
            <button
              onClick={() => setCurrentTaskType('academic-discussion')}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                currentTaskDef.section === 'Writing' ? 'text-teal-800 font-semibold' : ''
              }`}
            >
              Writing
            </button>
            <button
              onClick={() => setIsRubricsOpen(true)}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 text-slate-500"
            >
              Scoring Rubrics
            </button>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center gap-3 shrink-0">
            <WeeklyGoalTracker />
            <button
              onClick={() => setIsHistoryOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>Score History</span>
            </button>
            <button
              onClick={() => setIsDashboardOpen(true)}
              aria-label="Open Dashboard"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </button>
            <button
              onClick={() => setDarkMode(prev => !prev)}
              aria-label="Toggle Dark Mode"
              className="p-2 rounded-lg text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
            </button>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  setIsExamMode(!isExamMode);
                  if (!isExamMode) {
                    setExamSecondsRemaining(1800);
                    setIsPaused(false);
                  }
                }}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-l-lg shadow-xs transition-colors whitespace-nowrap shrink-0 ${
                  isExamMode
                    ? 'bg-rose-600 hover:bg-rose-700 text-white'
                    : 'bg-slate-900 hover:bg-slate-800 text-white'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>{isExamMode ? `Exam: ${formatTimer(examSecondsRemaining)}` : 'Timed Exam Mode'}</span>
              </button>
              {isExamMode && (
                <button
                  onClick={() => setIsPaused(!isPaused)}
                  className="px-2.5 py-1.5 text-xs font-semibold rounded-r-lg shadow-xs transition-colors whitespace-nowrap shrink-0 bg-slate-700 hover:bg-slate-600 text-white border-l border-slate-600"
                >
                  {isPaused ? 'Resume' : 'Pause'}
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full space-y-6">
        {/* Workspace Controls Deck: Task Type Segmented Bar */}
        <section aria-label="Task Selection Bar" className="space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="text-xs text-slate-500">
              Select task format from official 2026 TOEFL iBT test specifications:
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Current Section:</span>
              <span className="text-xs font-semibold text-teal-800 uppercase tracking-wider">
                {currentTaskDef.section}
              </span>
            </div>
          </div>

          {/* Segmented Task Selector Buttons */}
          <div className="p-1 bg-slate-200/80 rounded-xl overflow-x-auto flex items-center gap-1 scrollbar-none">
            <button
              onClick={() => {
                setIsMockTest(true);
                setCurrentTaskType('academic-discussion'); // Default
              }}
              className={`px-3 py-2 text-xs font-medium rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                isMockTest
                  ? 'bg-rose-100 text-rose-900 font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              Full Mock Test
            </button>
            {TASK_DEFINITIONS.map((td) => {
              const isActive = currentTaskType === td.id && !isMockTest;
              return (
                <button
                  key={td.id}
                  onClick={() => {
                    setIsMockTest(false);
                    setCurrentTaskType(td.id);
                    setGenerationError(null);
                  }}
                  className={`px-3 py-2 text-xs font-medium rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-white text-slate-950 font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  <span className="text-slate-400 mr-1.5 font-normal text-[11px]">{td.section.slice(0, 1)}·</span>
                  {td.name}
                </button>
              );
            })}
          </div>
        </section>

        {/* Generator Controls Strip */}
        <section
          aria-label="Practice Parameters"
          className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3 flex-wrap w-full md:w-auto">
            <div className="flex items-center gap-2">
              <label htmlFor="select-level" className="text-xs text-slate-500 font-medium">
                Proficiency Level:
              </label>
              <select
                id="select-level"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 text-slate-800 rounded-lg px-2.5 py-1.5 font-medium outline-hidden focus:border-teal-600"
              >
                <option value="intermediate">Intermediate (B1-B2 · 60-80)</option>
                <option value="upper-intermediate">Upper-Intermediate (B2-C1 · 80-100)</option>
                <option value="advanced">Advanced (C1 · 100-120)</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="select-topic" className="text-xs text-slate-500 font-medium">
                Academic Topic:
              </label>
              <select
                id="select-topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 text-slate-800 rounded-lg px-2.5 py-1.5 font-medium outline-hidden focus:border-teal-600"
              >
                <option value="science-tech">Science & Technology</option>
                <option value="campus-life">Campus Life & Academics</option>
                <option value="social-sciences">Social Sciences & History</option>
                <option value="environment">Ecology & Environment</option>
                <option value="business-economics">Business & Economics</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
            <button
              onClick={() => handleNextCurated(currentTaskType)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
              title="Load next pre-loaded question from question bank"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Next Question</span>
            </button>

            <button
              onClick={handleGenerateNewAiTask}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-800 hover:bg-teal-900 disabled:opacity-50 rounded-lg shadow-xs transition-colors whitespace-nowrap shrink-0"
              title="Generate a fresh customized TOEFL item using Gemini 3.8 Flash"
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-300" />
              <span>{isGenerating ? 'Generating Question...' : 'Generate New with AI'}</span>
            </button>
          </div>
        </section>

        {generationError && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{generationError}</span>
          </div>
        )}

        {generationSuccess && (
          <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 text-xs text-teal-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
            <span>Successfully generated with AI</span>
          </div>
        )}

        {/* Interactive Task Stage */}
        <section aria-label="Interactive Task Workspace" className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs">
          {isMockTest ? (
            <MockTestView />
          ) : (
            <>
              {currentTaskType === 'complete-words' && (
                <CompleteWordsView
                  task={activeTask as CompleteWordsTask}
                  onNextTask={() => handleNextCurated('complete-words')}
                />
              )}

              {currentTaskType === 'reading-passage' && (
                <ReadingPassageView
                  task={activeTask as ReadingPassageTask}
                  onNextTask={() => handleNextCurated('reading-passage')}
                />
              )}

              {currentTaskType === 'listening-dialogue' && (
                <ListeningDialogueView
                  task={activeTask as ListeningTask}
                  onNextTask={() => handleNextCurated('listening-dialogue')}
                />
              )}

              {currentTaskType === 'listen-repeat' && (
                <ListenRepeatView
                  task={activeTask as ListenRepeatTask}
                  onNextTask={() => handleNextCurated('listen-repeat')}
                />
              )}

              {currentTaskType === 'speaking-interview' && (
                <SpeakingInterviewView
                  task={activeTask as SpeakingInterviewTask}
                  onNextTask={() => handleNextCurated('speaking-interview')}
                />
              )}

              {currentTaskType === 'build-sentence' && (
                <BuildSentenceView
                  task={activeTask as BuildSentenceTask}
                  onNextTask={() => handleNextCurated('build-sentence')}
                />
              )}

              {currentTaskType === 'write-email' && (
                <WriteEmailView
                  task={activeTask as WriteEmailTask}
                  onNextTask={() => handleNextCurated('write-email')}
                />
              )}

              {currentTaskType === 'academic-discussion' && (
                <AcademicDiscussionView
                  task={activeTask as AcademicDiscussionTask}
                  onNextTask={() => handleNextCurated('academic-discussion')}
                />
              )}
            </>
          )}
        </section>
      </main>

      {/* Footer following anti-slop rules: quiet, clean links and copyright */}
      <footer className="border-t border-slate-200 bg-white mt-12 py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span>TOEFL Prep Studio</span>
            <span aria-hidden="true">·</span>
            <span>ETS-Format Practice Suite</span>
            <span aria-hidden="true">·</span>
            <span>Local Browser Simulation</span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsRubricsOpen(true)}
              className="hover:text-slate-900 transition-colors"
            >
              Scoring Rubric Reference
            </button>
            <button
              onClick={() => setIsHistoryOpen(true)}
              className="hover:text-slate-900 transition-colors"
            >
              View Analytics
            </button>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <RubricGuideModal isOpen={isRubricsOpen} onClose={() => setIsRubricsOpen(false)} />
      <PerformanceHistoryModal isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />
      <DashboardModal 
        isOpen={isDashboardOpen} 
        onClose={() => setIsDashboardOpen(false)} 
        openHistory={() => { setIsDashboardOpen(false); setIsHistoryOpen(true); }}
        openRubrics={() => { setIsDashboardOpen(false); setIsRubricsOpen(true); }}
      />
    </div>
  );
}
