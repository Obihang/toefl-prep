/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { getPracticeHistory } from './utils/scoreTracker';
import { getRecommendedLevel, DifficultyLevel } from './utils/difficulty';
import { useAuth } from './context/AuthContext';
import {
  saveSharedQuestion,
  fetchRandomSharedQuestion,
  reportSharedQuestion,
} from './utils/sharedQuestions';
import { getApiHeaders, getStoredApiKey } from './utils/apiKey';
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
  ChevronLeft,
  ChevronRight,
  Settings,
  Sun,
  Moon,
  Flag,
  X,
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
import { SelectionHandler } from './components/shared/SelectionHandler';
import { ReadingPassageView } from './components/tasks/ReadingPassageView';
import { ListeningDialogueView } from './components/tasks/ListeningDialogueView';
import { ListenRepeatView } from './components/tasks/ListenRepeatView';
import { SpeakingInterviewView } from './components/tasks/SpeakingInterviewView';
import { BuildSentenceView } from './components/tasks/BuildSentenceView';
import { WriteEmailView } from './components/tasks/WriteEmailView';
import { AcademicDiscussionView } from './components/tasks/AcademicDiscussionView';
import { RubricGuideModal } from './components/modals/RubricGuideModal';
import { WeeklyGoalTracker } from './components/WeeklyGoalTracker';

import { TaskTypeId, TaskDefinition, TASK_DEFINITIONS } from './types/taskTypes';
import {
  PrefetchQueue,
  PrefetchedItem,
  loadPrefetchQueueFromStorage,
  savePrefetchQueueToStorage,
  getNextTaskToPrefetch,
  getPrefetchProgress,
  hasReadyTask,
  popPrefetchedTask,
  evaluateRateLimitPause,
  PREFETCH_GAP_MS,
} from './utils/prefetchManager';
import { markUserAiRequest, getLastUserAiRequestTime } from './utils/userActivity';

const DashboardModal = lazy(() => import('./components/modals/DashboardModal').then(m => ({ default: m.DashboardModal })));
const PerformanceHistoryModal = lazy(() => import('./components/modals/PerformanceHistoryModal').then(m => ({ default: m.PerformanceHistoryModal })));
const MockTestView = lazy(() => import('./components/tasks/MockTestView').then(m => ({ default: m.MockTestView })));

export default function App() {
  const { user, displayName } = useAuth();
  const [currentTaskType, setCurrentTaskType] = useState<TaskTypeId>('academic-discussion');
  const [level, setLevel] = useState<string>('upper-intermediate');
  const [topic, setTopic] = useState('science-tech');

  const levelRef = React.useRef(level);
  levelRef.current = level;
  const topicRef = React.useRef(topic);
  topicRef.current = topic;
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationSuccess, setGenerationSuccess] = useState(false);
  const [lastModelUsed, setLastModelUsed] = useState<string | null>(null);
  const [isMockTest, setIsMockTest] = useState(false);
  const [reportedQuestionId, setReportedQuestionId] = useState<string | null>(null);

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

  // Background question pre-fetch queue for instant generation
  const [prefetchedQueue, setPrefetchedQueue] = useState<PrefetchQueue>(() => loadPrefetchQueueFromStorage());
  const [isPrefetching, setIsPrefetching] = useState(false);
  const isPrefetchingRef = React.useRef<Record<string, boolean>>({});
  const failedRecentlyRef = React.useRef<Record<string, number>>({});
  const quotaExhaustedUntilRef = React.useRef<number>(0);
  const [lastGenerationWasInstant, setLastGenerationWasInstant] = useState(false);
  const [rateLimitPauseState, setRateLimitPauseState] = useState<{ kind: 'per-minute' | 'per-day' | 'unknown'; resumeAt: number; retryAfterSeconds: number } | null>(null);
  const lastPrefetchTimeRef = useRef(0);
  const lastDebugLogTimeRef = useRef<Record<string, number>>({});
  const [sharedBankNotice, setSharedBankNotice] = useState<string | null>(null);

  // Modals
  const [isRubricsOpen, setIsRubricsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [dashboardDefaultTab, setDashboardDefaultTab] = useState<'dashboard' | 'goals' | 'settings' | 'vocabulary' | 'mistakes'>('dashboard');

  // Dark Mode
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('toefl_dark_mode') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('toefl_dark_mode', darkMode ? 'true' : 'false');
  }, [darkMode]);

  // Listen for API key updates to reset any quota backoff timer
  useEffect(() => {
    const handleKeyChange = () => {
      quotaExhaustedUntilRef.current = 0;
      failedRecentlyRef.current = {};
      setGenerationError(null);
    };
    window.addEventListener('apiKeyUpdated', handleKeyChange);
    return () => window.removeEventListener('apiKeyUpdated', handleKeyChange);
  }, []);

  // Exam mode timer (optional simulation clock)
  const [isExamMode, setIsExamMode] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [examSecondsRemaining, setExamSecondsRemaining] = useState(1800); // 30 min timer
  
  // Settings
  const [enablePrefetching, setEnablePrefetching] = useState<boolean>(() => {
    const saved = localStorage.getItem('toefl_enable_prefetching');
    return saved === null ? true : saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('toefl_enable_prefetching', enablePrefetching ? 'true' : 'false');
  }, [enablePrefetching]);

  // Keyboard shortcuts: 'N' for next task, 'Space' to pause/resume exam timer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        handleNextQuestion(currentTaskType);
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

  useEffect(() => {
    const history = getPracticeHistory();
    const recommended = getRecommendedLevel(history, level as DifficultyLevel);
    setLevel(recommended.level);
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

  // Serve a random question: either from shared bank (using rand) or curated pool
  const handleNextQuestion = async (type: TaskTypeId) => {
    setReportedQuestionId(null);
    // Sometimes (60% probability) serve a random unseen question from the shared bank
    if (Math.random() < 0.6) {
      try {
        const shared = await fetchRandomSharedQuestion(type);
        if (shared) {
          setCustomTasks((prev) => ({
            ...prev,
            [type]: shared,
          }));
          return;
        }
        // When none is found in shared bank, fall back to AI generation
        await handleGenerateNewAiTask();
        return;
      } catch (err) {
        console.warn('Shared question bank query failed:', err);
      }
    }

    // Fall back to curated pool
    handleNextCurated(type);
  };

  const handleReportQuestion = async (questionDocId: string) => {
    if (!user) return;
    const currentTask = customTasks[currentTaskType];
    if (currentTask?.reportedBy?.includes(user.uid)) {
      return; // Already reported by this user
    }
    try {
      const success = await reportSharedQuestion(questionDocId, user.uid);
      if (success) {
        setReportedQuestionId(questionDocId);
        if (currentTask) {
          currentTask.reportedBy = [...(currentTask.reportedBy || []), user.uid];
          currentTask.reportCount = (currentTask.reportCount || 0) + 1;
        }
        if (currentTask && (currentTask.reportCount ?? 0) >= 3) {
          setTimeout(() => {
            handleNextQuestion(currentTaskType);
          }, 800);
        }
      }
    } catch (err) {
      console.error('Failed to report question:', err);
    }
  };

  // Horizontal Hover-to-Scroll Mechanism for Section / Task Bar
  const sectionBarRef = React.useRef<HTMLDivElement>(null);
  const hoverScrollAnimationRef = React.useRef<number | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkSectionScrollState = () => {
    const el = sectionBarRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 6);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 6);
  };

  useEffect(() => {
    checkSectionScrollState();
    const el = sectionBarRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkSectionScrollState, { passive: true });
    window.addEventListener('resize', checkSectionScrollState);
    return () => {
      el.removeEventListener('scroll', checkSectionScrollState);
      window.removeEventListener('resize', checkSectionScrollState);
      if (hoverScrollAnimationRef.current !== null) {
        cancelAnimationFrame(hoverScrollAnimationRef.current);
      }
    };
  }, []);

  // Auto-scroll active section into view when changed
  useEffect(() => {
    const container = sectionBarRef.current;
    if (!container) return;
    checkSectionScrollState();
    const activeBtn = container.querySelector('[data-active="true"]') as HTMLElement;
    if (activeBtn) {
      const containerRect = container.getBoundingClientRect();
      const btnRect = activeBtn.getBoundingClientRect();
      if (btnRect.left < containerRect.left || btnRect.right > containerRect.right) {
        activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [currentTaskType, isMockTest]);

  const stopHoverScroll = () => {
    if (hoverScrollAnimationRef.current !== null) {
      cancelAnimationFrame(hoverScrollAnimationRef.current);
      hoverScrollAnimationRef.current = null;
    }
  };

  const startContinuousScroll = (direction: 'left' | 'right', speed = 6) => {
    stopHoverScroll();
    const el = sectionBarRef.current;
    if (!el) return;

    const step = () => {
      if (!el) {
        stopHoverScroll();
        return;
      }
      if (direction === 'left') {
        if (el.scrollLeft > 0) {
          el.scrollLeft -= speed;
          hoverScrollAnimationRef.current = requestAnimationFrame(step);
          checkSectionScrollState();
        } else {
          stopHoverScroll();
        }
      } else {
        if (el.scrollLeft < el.scrollWidth - el.clientWidth - 1) {
          el.scrollLeft += speed;
          hoverScrollAnimationRef.current = requestAnimationFrame(step);
          checkSectionScrollState();
        } else {
          stopHoverScroll();
        }
      }
    };
    hoverScrollAnimationRef.current = requestAnimationFrame(step);
  };

  const lastWheelTimeRef = React.useRef(0);

  const handleBarMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    // Suppress hover-scroll if wheel was used in last 500ms
    if (Date.now() - lastWheelTimeRef.current < 500) return;
    
    const el = sectionBarRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    const threshold = Math.min(180, width * 0.28); // 28% edge zone or up to 180px

    if (x < threshold) {
      const factor = (threshold - x) / threshold;
      const speed = Math.max(2, Math.round(factor * 12));
      startContinuousScroll('left', speed);
    } else if (x > width - threshold) {
      const factor = (x - (width - threshold)) / threshold;
      const speed = Math.max(2, Math.round(factor * 12));
      startContinuousScroll('right', speed);
    } else {
      stopHoverScroll();
    }
  };

  // handleBarWheel removed in favor of useEffect listener
  const scrollBarBy = (amount: number) => {
    const el = sectionBarRef.current;
    if (!el) return;
    el.scrollBy({ left: amount, behavior: 'smooth' });
    setTimeout(checkSectionScrollState, 350);
  };

  const logEarlyExit = (reason: string) => {
    const now = Date.now();
    const last = lastDebugLogTimeRef.current[reason] || 0;
    if (now - last > 30000) {
      lastDebugLogTimeRef.current[reason] = now;
      console.debug(`Prefetch loop exited early: ${reason}`);
    }
  };

  // Background question pre-fetch worker for any task type
  const prefetchTaskInBackground = async (type: TaskTypeId, lvl: string, top: string) => {
    const key = getStoredApiKey().trim();
    const currentCount = prefetchedQueue[type]?.length || 0;
    if (!key) { logEarlyExit('no key'); return; }
    if (document.visibilityState !== 'visible') { logEarlyExit('tab hidden'); return; }
    if (inFlightLock.current || isPrefetchingRef.current[type]) { logEarlyExit('lock held'); return; }
    if (isGenerating) { logEarlyExit('cooldown'); return; }
    if (currentCount >= 2) { logEarlyExit('queue full'); return; }
    if (rateLimitPauseState && Date.now() < rateLimitPauseState.resumeAt) { logEarlyExit('quota pause'); return; }
    if (Date.now() < quotaExhaustedUntilRef.current) { logEarlyExit('quota pause'); return; }
    if (Date.now() - getLastUserAiRequestTime() < 20000 || Date.now() - lastPrefetchTimeRef.current < PREFETCH_GAP_MS) { logEarlyExit('cooldown'); return; }

    inFlightLock.current = true;
    isPrefetchingRef.current[type] = true;
    setIsPrefetching(true);
    lastPrefetchTimeRef.current = Date.now();

    try {
      const res = await fetch('/api/generate-task', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({
          taskType: type,
          level: lvl,
          topic: top,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success && !json.data.isFallback) {
        if (lvl !== levelRef.current || top !== topicRef.current) {
          return;
        }

        const prefetchedItem: PrefetchedItem = {
          ...json.data,
          level: lvl,
          topic: top,
          id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          isPrefetched: true,
          createdAt: Date.now(),
        };
        setPrefetchedQueue((prev) => {
          const currentItems = prev[type] || [];
          // Ensure we don't exceed 1 question per task type
          const nextItems = [...currentItems, prefetchedItem].slice(-1);
          const nextQueue: PrefetchQueue = {
            ...prev,
            [type]: nextItems,
          };
          savePrefetchQueueToStorage(nextQueue);
          return nextQueue;
        });
      } else {
        const status = res.status;
        const errObj = json?.rateLimit || json?.data || json;
        const reason = String(json?.data?.fallbackReason || json?.error || '').toLowerCase();
        
        if (status === 429 || json?.data?.isQuotaExhausted || reason.includes('429') || reason.includes('quota') || reason.includes('resource_exhausted')) {
          const pause = evaluateRateLimitPause(errObj, Date.now());
          setRateLimitPauseState(pause);
          if (pause.kind === 'per-day') {
            quotaExhaustedUntilRef.current = Date.now() + 3600 * 1000;
          } else {
            quotaExhaustedUntilRef.current = pause.resumeAt;
          }
        } else if (status === 503) {
          quotaExhaustedUntilRef.current = Date.now() + 60000;
        } else {
          failedRecentlyRef.current[type] = Date.now() + 5 * 60 * 1000;
        }
      }
    } catch (e) {
      console.debug('Background prefetch notice:', e);
      quotaExhaustedUntilRef.current = Date.now() + 60000;
    } finally {
      isPrefetchingRef.current[type] = false;
      inFlightLock.current = false;
      const anyStillFetching = Object.values(isPrefetchingRef.current).some(Boolean);
      setIsPrefetching(anyStillFetching);
    }
  };

  // Sync / filter queue when difficulty level or academic topic changes
  useEffect(() => {
    setPrefetchedQueue((prev) => {
      let changed = false;
      const next: PrefetchQueue = {};
      for (const [k, items] of Object.entries(prev)) {
        if (!Array.isArray(items)) continue;
        const matching = items.filter((item) => item.level === level && item.topic === topic);
        if (matching.length !== items.length) {
          changed = true;
        }
        if (matching.length > 0) {
          next[k] = matching;
        }
      }
      if (changed) {
        savePrefetchQueueToStorage(next);
        return next;
      }
      return prev;
    });
  }, [level, topic]);

  // New sequential prefetch loop
  const inFlightLock = React.useRef(false);
  const [prefetchProgress, setPrefetchProgress] = useState({ round: 1 as 1 | 'done', filled: 0, total: 8 });
  useEffect(() => {
    const el = sectionBarRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const scrollAmount = e.deltaX !== 0 ? e.deltaX : e.deltaY;
      el.scrollLeft += scrollAmount;
      checkSectionScrollState();
      lastWheelTimeRef.current = Date.now();
      stopHoverScroll();
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  useEffect(() => {
    if (!enablePrefetching || !getStoredApiKey().trim()) return;
    
    let isCancelled = false;
    let idleTimeout: any = null;
    let lastActivityTime = Date.now();

    const onUserActivity = () => { lastActivityTime = Date.now(); };
    window.addEventListener('mousemove', onUserActivity, { passive: true });
    window.addEventListener('keydown', onUserActivity, { passive: true });
    window.addEventListener('scroll', onUserActivity, { passive: true });

    const runLoop = async () => {
      if (isCancelled || inFlightLock.current || isGenerating || document.visibilityState !== 'visible') return;
      if (Date.now() < quotaExhaustedUntilRef.current) return;
      
      const timeSinceActivity = Date.now() - lastActivityTime;
      if (timeSinceActivity < 1500) {
        idleTimeout = setTimeout(runLoop, 1500 - timeSinceActivity);
        return;
      }

      const target = getNextTaskToPrefetch(currentTaskType, prefetchedQueue, level, topic, failedRecentlyRef.current, Date.now());
      if (!target) return;

      await prefetchTaskInBackground(target, level, topic);
      if (!isCancelled) {
        if (idleTimeout) clearTimeout(idleTimeout);
        idleTimeout = setTimeout(runLoop, 1500);
      }
    };

    const interval = setInterval(runLoop, 5000);
    runLoop();

    return () => {
      isCancelled = true;
      clearInterval(interval);
      clearTimeout(idleTimeout);
      window.removeEventListener('mousemove', onUserActivity);
      window.removeEventListener('keydown', onUserActivity);
      window.removeEventListener('scroll', onUserActivity);
    };
  }, [currentTaskType, level, topic, prefetchedQueue, isGenerating, enablePrefetching]);

  useEffect(() => {
    setPrefetchProgress(getPrefetchProgress(prefetchedQueue, level, topic));
  }, [prefetchedQueue, level, topic]);

  // Generate fresh task: Instant swap if ready in background queue, or fetch on demand
  const handleGenerateNewAiTask = async () => {
    markUserAiRequest();
    // 1. Instant delivery if pre-fetched question is ready in the queue!
    if (hasReadyTask(prefetchedQueue, currentTaskType, level, topic)) {
      const { item: readyTask, updatedQueue } = popPrefetchedTask(prefetchedQueue, currentTaskType, level, topic);
      if (readyTask) {
        setPrefetchedQueue(updatedQueue);

        // Instantly activate
        setCustomTasks((prev) => ({
          ...prev,
          [currentTaskType]: readyTask,
        }));

        if (readyTask.modelUsed) {
          setLastModelUsed(readyTask.modelUsed);
        }

        setGenerationError(null);
        setLastGenerationWasInstant(true);
        setGenerationSuccess(true);
        setTimeout(() => setGenerationSuccess(false), 3000);

        if (user) {
          saveSharedQuestion({
            taskType: currentTaskType,
            level,
            topic,
            data: readyTask,
            createdByName: displayName || 'Anonymous Scholar',
            createdByUid: user.uid,
          }).catch(() => {});
        }

        // Immediately replenish the next question in the background if empty
        if (enablePrefetching && getStoredApiKey().trim()) {
          setTimeout(() => {
            prefetchTaskInBackground(currentTaskType, level, topic);
          }, 300);
        }
        return;
      }
    }

    // 2. Standard fetch if queue was empty
    setIsGenerating(true);
    setGenerationError(null);
    setGenerationSuccess(false);
    setLastGenerationWasInstant(false);

    try {
      const apiKey = getStoredApiKey().trim();
      const res = await fetch('/api/generate-task', {
        method: 'POST',
        headers: getApiHeaders(),
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

      if (json.data.isFallback) {
        const reason = json.data.fallbackReason || 'model unavailable';
        const isQuota = Boolean(json.data.isQuotaExhausted) || reason.toLowerCase().includes('quota') || reason.toLowerCase().includes('429');
        if (isQuota) {
          const pause = evaluateRateLimitPause(json.data.rateLimit, Date.now()); setRateLimitPauseState(pause); quotaExhaustedUntilRef.current = pause.resumeAt;
        }
        setGenerationError(
          isQuota
            ? "Your key's free daily AI quota is used up. Practicing with an authentic ETS TOEFL curated question."
            : `AI notice: ${reason}. Showing an authentic curated TOEFL question instead.`
        );
        handleNextCurated(currentTaskType);
        setIsGenerating(false);
        return;
      }

      if (json.data.modelUsed) {
        setLastModelUsed(json.data.modelUsed);
      }

      const newTask: any = {
        ...json.data,
        level,
        topic,
        id: `ai-${Date.now()}`,
      };

      if (user) {
        try {
          const docId = await saveSharedQuestion({
            taskType: currentTaskType,
            level,
            topic,
            data: newTask,
            createdByName: displayName || 'Anonymous Scholar',
            createdByUid: user.uid,
          });
          newTask.questionDocId = docId;
          newTask.createdByName = displayName || 'Anonymous Scholar';
          newTask.createdByUid = user.uid;
          newTask.isSharedBank = true;
          setSharedBankNotice('Added to the shared question bank');
          setTimeout(() => setSharedBankNotice(null), 4000);
        } catch (e: any) {
          console.warn('Failed to save to shared question bank (rules, index or sign-in):', e?.message || e);
          setSharedBankNotice('Notice: Question generated successfully, but could not be saved to shared bank.');
          setTimeout(() => setSharedBankNotice(null), 5000);
        }
      }

      setCustomTasks((prev) => ({
        ...prev,
        [currentTaskType]: newTask,
      }));
      setLastGenerationWasInstant(false);
      setGenerationSuccess(true);
      setTimeout(() => setGenerationSuccess(false), 3000);

      // Immediately pre-fetch the next question into queue if quota is healthy
      if (enablePrefetching && getStoredApiKey().trim()) {
        setTimeout(() => {
          prefetchTaskInBackground(currentTaskType, level, topic);
        }, 300);
      }
    } catch (err: any) {
      console.warn('AI generation notice:', err?.message || err);
      const rawMsg = err.message || 'unknown error';
      const isQuota = rawMsg.toLowerCase().includes('quota') || rawMsg.toLowerCase().includes('429');
      if (isQuota) {
        const pause = evaluateRateLimitPause(err, Date.now()); setRateLimitPauseState(pause); quotaExhaustedUntilRef.current = pause.resumeAt;
      }
      setGenerationError(
        isQuota
          ? "Your key's free daily AI quota is used up. Practicing with an authentic ETS TOEFL curated question."
          : `AI notice: ${rawMsg.slice(0, 120)}. Showing an authentic curated question instead.`
      );
      handleNextCurated(currentTaskType);
    } finally {
      setIsGenerating(false);
    }
  };

  // Resolve current active task data (hide questions with reportCount >= 3)
  const getCurrentTaskData = () => {
    if (customTasks[currentTaskType]) {
      const task = customTasks[currentTaskType];
      if (!task.reportCount || task.reportCount < 3) {
        return task;
      }
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
  const adaptiveRec = getRecommendedLevel(getPracticeHistory(), level as DifficultyLevel, currentTaskType);

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
            <WeeklyGoalTracker onOpenGoals={() => {
              setDashboardDefaultTab('goals');
              setIsDashboardOpen(true);
            }} />
            <button
              onClick={() => setIsHistoryOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>Score History</span>
            </button>
            <button
              onClick={() => {
                setDashboardDefaultTab('dashboard');
                setIsDashboardOpen(true);
              }}
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

          {/* Segmented Task Selector Buttons with Hover-to-Scroll & Navigation Controls */}
          <div className="relative group">
            {/* Left Scroll Indicator / Button */}
            {canScrollLeft && (
              <div className="absolute left-0 top-0 bottom-0 z-10 flex items-center pr-4 pl-1 bg-gradient-to-r from-slate-200 via-slate-200/90 to-transparent pointer-events-auto rounded-l-xl">
                <button
                  type="button"
                  onClick={() => scrollBarBy(-200)}
                  onMouseEnter={() => startContinuousScroll('left', 8)}
                  onMouseLeave={stopHoverScroll}
                  className="w-6 h-6 rounded-full bg-white/95 hover:bg-white text-slate-700 shadow-xs flex items-center justify-center transition-all hover:scale-110 cursor-pointer border border-slate-300/60"
                  title="Scroll left (or hover near left edge)"
                  aria-label="Scroll sections left"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Scrollable Bar Track */}
            <div
              ref={sectionBarRef}
              onMouseMove={handleBarMouseMove}
              onMouseLeave={stopHoverScroll}
              className="p-1 bg-slate-200/80 rounded-xl overflow-x-auto flex items-center gap-1 scrollbar-none select-none cursor-grab active:cursor-grabbing scroll-smooth overscroll-none"
            >
              <button
                data-active={isMockTest ? 'true' : 'false'}
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
                const readyCount = (prefetchedQueue[td.id] || []).filter(item => item.level === level && item.topic === topic).length;
                const isReady = readyCount > 0;
                return (
                  <button
                    key={td.id}
                    data-active={isActive ? 'true' : 'false'}
                    onClick={() => {
                      setIsMockTest(false);
                      setCurrentTaskType(td.id);
                      setGenerationError(null);
                    }}
                    className={`px-3 py-2 text-xs font-medium rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-white text-slate-950 font-bold shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                    }`}
                  >
                    <span className="text-slate-400 mr-0.5 font-normal text-[11px]">{td.section.slice(0, 1)}·</span>
                    <span>{td.name}</span>
                    {isReady && (
                      <span
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800 bg-emerald-100 rounded-full"
                        title={`${readyCount} instant question${readyCount > 1 ? 's' : ''} pre-fetched and ready`}
                      >
                        <span>⚡</span>
                        {readyCount > 1 && <span>{readyCount}</span>}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Right Scroll Indicator / Button */}
            {canScrollRight && (
              <div className="absolute right-0 top-0 bottom-0 z-10 flex items-center pl-4 pr-1 bg-gradient-to-l from-slate-200 via-slate-200/90 to-transparent pointer-events-auto rounded-r-xl">
                <button
                  type="button"
                  onClick={() => scrollBarBy(200)}
                  onMouseEnter={() => startContinuousScroll('right', 8)}
                  onMouseLeave={stopHoverScroll}
                  className="w-6 h-6 rounded-full bg-white/95 hover:bg-white text-slate-700 shadow-xs flex items-center justify-center transition-all hover:scale-110 cursor-pointer border border-slate-300/60"
                  title="Scroll right (or hover near right edge)"
                  aria-label="Scroll sections right"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
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
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate (B1-B2 · 60-80)</option>
                <option value="upper-intermediate">Upper-Intermediate (B2-C1 · 80-100)</option>
                <option value="advanced">Advanced (C1 · 100-120)</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] px-2.5 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-800 font-medium" title={adaptiveRec.reason}>
                Adaptive Level: <strong className="capitalize">{adaptiveRec.level}</strong>
              </span>
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
              onClick={() => handleNextQuestion(currentTaskType)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Load next question from shared question bank or curated pool"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Next Question</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={handleGenerateNewAiTask}
                disabled={isGenerating}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 rounded-lg shadow-xs transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  hasReadyTask(prefetchedQueue, currentTaskType, level, topic)
                    ? 'bg-emerald-700 hover:bg-emerald-800 ring-2 ring-emerald-500/20'
                    : 'bg-teal-800 hover:bg-teal-900'
                }`}
                title={
                  hasReadyTask(prefetchedQueue, currentTaskType, level, topic)
                    ? 'Instant generation from background cache'
                    : 'Generate customized TOEFL item with AI'
                }
              >
                <Sparkles className="w-3.5 h-3.5 text-teal-300" />
                <span>
                  {isGenerating
                    ? 'Generating Question...'
                    : hasReadyTask(prefetchedQueue, currentTaskType, level, topic)
                    ? 'Generate New (Instant ⚡)'
                    : 'Generate New with AI'}
                </span>
              </button>
              {Boolean(getStoredApiKey().trim()) && enablePrefetching && prefetchProgress.round !== 'done' && (
                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full whitespace-nowrap">
                  Preparing questions ({prefetchProgress.filled}/8 ready)
                </span>
              )}
              {Boolean(getStoredApiKey().trim()) && enablePrefetching && prefetchProgress.round === 'done' && (
                <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full whitespace-nowrap">
                  Questions ready
                </span>
              )}
            </div>
          </div>
          {rateLimitPauseState && Date.now() < rateLimitPauseState.resumeAt && (() => {
            const remainingSec = Math.max(1, Math.ceil((rateLimitPauseState.resumeAt - Date.now()) / 1000));
            const remainingMin = Math.ceil(remainingSec / 60);
            const msg = rateLimitPauseState.kind === 'per-day'
              ? `Prefetch paused: daily quota reached, retrying in ${remainingMin}m`
              : `Prefetch paused: rate limited, retrying in ${remainingSec}s`;
            return (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg flex items-center gap-2 mt-2 w-full md:w-auto">
                <span>{msg}</span>
                <button
                  onClick={() => {
                    setRateLimitPauseState(null);
                    quotaExhaustedUntilRef.current = 0;
                  }}
                  className="font-semibold text-teal-800 hover:text-teal-950 underline cursor-pointer"
                >
                  Resume prefetch now
                </button>
              </div>
            );
          })()}
        </section>

        {generationError && (
          (generationError.toLowerCase().includes('no api key') ||
           generationError.toLowerCase().includes('invalid api key') ||
           generationError.toLowerCase().includes('api key not valid') ||
           generationError.toLowerCase().includes('add yours in dashboard') ||
           generationError.toLowerCase().includes('settings & api key')) ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-amber-900 relative">
              <button
                onClick={() => setGenerationError(null)}
                className="absolute top-3 right-3 text-amber-600 hover:text-amber-800 p-1 rounded-md cursor-pointer transition-colors"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 font-semibold text-sm pr-6">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Add your free API key to use AI features</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                <button
                  onClick={() => {
                    setDashboardDefaultTab('settings');
                    setIsDashboardOpen(true);
                  }}
                  className="px-3 py-1.5 bg-teal-800 hover:bg-teal-900 text-white font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Configure API Key
                </button>
                <span className="text-slate-500 font-medium">Supports Gemini, NVIDIA, Groq, OpenRouter, and custom keys</span>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-amber-900 relative">
              <button
                onClick={() => setGenerationError(null)}
                className="absolute top-3 right-3 text-amber-600 hover:text-amber-800 p-1 rounded-md cursor-pointer transition-colors"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 font-semibold text-sm pr-6">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{generationError}</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                <button
                  onClick={() => {
                    setDashboardDefaultTab('settings');
                    setIsDashboardOpen(true);
                  }}
                  className="px-3 py-1.5 bg-teal-800 hover:bg-teal-900 text-white font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Dashboard &gt; API Key
                </button>
                <button
                  onClick={() => setGenerationError(null)}
                  className="px-3 py-1.5 bg-white border border-amber-300 hover:bg-amber-100 text-amber-800 font-medium rounded-lg transition-colors cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )
        )}

        {sharedBankNotice && (
          <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 text-xs text-teal-800 flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
              <span>{sharedBankNotice}</span>
            </div>
          </div>
        )}

        {generationSuccess && (
          <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 text-xs text-teal-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
              <span>
                {lastGenerationWasInstant
                  ? '⚡ Question loaded instantly from background cache!'
                  : 'Successfully generated with AI'}
              </span>
            </div>
            {lastModelUsed && (
              <span className="text-[10px] bg-teal-100 text-teal-900 px-2 py-0.5 rounded-full font-mono">
                Generated with {lastModelUsed}
              </span>
            )}
          </div>
        )}

        {/* Global Select-to-Save Vocabulary Handler */}
        <SelectionHandler taskType={currentTaskType} />

        {/* Interactive Task Stage */}
        <section aria-label="Interactive Task Workspace" className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs">
          {isMockTest ? (
            <Suspense fallback={null}>
              <MockTestView />
            </Suspense>
          ) : (
            <>
              {activeTask?.modelUsed && !activeTask.createdByName && (
                <div className="mb-4 flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md font-mono">
                    Generated with {activeTask.modelUsed}
                  </span>
                  {activeTask?.isPrefetched && (
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md font-medium">
                      ⚡ Instant Delivery
                    </span>
                  )}
                </div>
              )}
              {activeTask?.createdByName && (!activeTask.reportCount || activeTask.reportCount < 3) && (
                <div className="mb-6 flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-teal-600"></span>
                    <span>Created by <strong className="text-slate-900 font-semibold">{activeTask.createdByName}</strong></span>
                    {activeTask.level && (
                      <span className="text-[11px] text-slate-400 capitalize">· {activeTask.level}</span>
                    )}
                    {activeTask.modelUsed && (
                      <span className="text-[10px] text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md font-mono">
                        Generated with {activeTask.modelUsed}
                      </span>
                    )}
                  </div>
                  {activeTask.questionDocId && (
                    reportedQuestionId === activeTask.questionDocId ? (
                      <span className="text-[11px] text-amber-700 font-medium flex items-center gap-1.5 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                        <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" /> Question reported
                      </span>
                    ) : (
                      <button
                        onClick={() => handleReportQuestion(activeTask.questionDocId)}
                        className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-rose-600 transition-colors px-2 py-1 rounded-md hover:bg-rose-50 cursor-pointer"
                        title="Report this question"
                      >
                        <Flag className="w-3.5 h-3.5" />
                        <span>Report this question</span>
                      </button>
                    )
                  )}
                </div>
              )}

              {currentTaskType === 'complete-words' && (
                <CompleteWordsView
                  key={activeTask.id || (activeTask as any).title}
                  task={activeTask as CompleteWordsTask}
                  onNextTask={() => handleNextQuestion('complete-words')}
                />
              )}

              {currentTaskType === 'reading-passage' && (
                <ReadingPassageView
                  key={activeTask.id || (activeTask as any).title}
                  task={activeTask as ReadingPassageTask}
                  onNextTask={() => handleNextQuestion('reading-passage')}
                />
              )}

              {currentTaskType === 'listening-dialogue' && (
                <ListeningDialogueView
                  key={activeTask.id || (activeTask as any).title}
                  task={activeTask as ListeningTask}
                  onNextTask={() => handleNextQuestion('listening-dialogue')}
                />
              )}

              {currentTaskType === 'listen-repeat' && (
                <ListenRepeatView
                  key={activeTask.id || (activeTask as any).title}
                  task={activeTask as ListenRepeatTask}
                  onNextTask={() => handleNextQuestion('listen-repeat')}
                />
              )}

              {currentTaskType === 'speaking-interview' && (
                <SpeakingInterviewView
                  key={activeTask.id || (activeTask as any).title}
                  task={activeTask as SpeakingInterviewTask}
                  onNextTask={() => handleNextQuestion('speaking-interview')}
                  onOpenApiKeySettings={() => {
                    setDashboardDefaultTab('settings');
                    setIsDashboardOpen(true);
                  }}
                />
              )}

              {currentTaskType === 'build-sentence' && (
                <BuildSentenceView
                  key={activeTask.id || (activeTask as any).title}
                  task={activeTask as BuildSentenceTask}
                  onNextTask={() => handleNextQuestion('build-sentence')}
                />
              )}

              {currentTaskType === 'write-email' && (
                <WriteEmailView
                  key={activeTask.id || (activeTask as any).title}
                  task={activeTask as WriteEmailTask}
                  onNextTask={() => handleNextQuestion('write-email')}
                  onOpenApiKeySettings={() => {
                    setDashboardDefaultTab('settings');
                    setIsDashboardOpen(true);
                  }}
                />
              )}

              {currentTaskType === 'academic-discussion' && (
                <AcademicDiscussionView
                  key={activeTask.id || (activeTask as any).title}
                  task={activeTask as AcademicDiscussionTask}
                  onNextTask={() => handleNextQuestion('academic-discussion')}
                  onOpenApiKeySettings={() => {
                    setDashboardDefaultTab('settings');
                    setIsDashboardOpen(true);
                  }}
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
      <Suspense fallback={null}>
        <PerformanceHistoryModal isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />
        <DashboardModal 
          isOpen={isDashboardOpen} 
          onClose={() => setIsDashboardOpen(false)} 
          defaultTab={dashboardDefaultTab}
          openHistory={() => { setIsDashboardOpen(false); setIsHistoryOpen(true); }}
          openRubrics={() => { setIsDashboardOpen(false); setIsRubricsOpen(true); }}
        />
      </Suspense>
    </div>
  );
}
