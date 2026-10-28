/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { getPracticeHistory } from './utils/scoreTracker';
import { getRecommendedLevel, DifficultyLevel } from './utils/difficulty';
import { useAuth } from './context/AuthContext';
import { stopSpeaking } from './utils/audioSpeech';
import {
  saveSharedQuestion,
  fetchRandomSharedQuestion,
  reportSharedQuestion,
  triggerBackgroundPrefetchIfNeeded,
} from './utils/questionBankStorage';
import {
  LEVELS,
  ACADEMIC_TOPICS,
  LEVEL_LABELS,
  TOPIC_LABELS,
  isValidLevel,
  isValidAcademicTopic,
  AcademicTopic,
} from './constants/filters';
import { getApiHeaders, getStoredApiKey, hasAnyStoredApiKey, hasAnyProviderKey, getScholarUsername } from './utils/apiKey';
import { safeFetchJson } from './utils/apiHelper';
import { normalizeTaskData } from './utils/taskNormalizer';

function getReportedByMe(): string[] {
  try {
    const raw = localStorage.getItem('toefl_reported_by_me');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function markReportedByMe(id: string) {
  try {
    const current = getReportedByMe();
    if (!current.includes(id)) {
      localStorage.setItem('toefl_reported_by_me', JSON.stringify([...current, id]));
    }
  } catch {}
}

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
  Volume2,
  Database,
  Activity,
  Target,
} from 'lucide-react';
import { SystemStatusModal } from './components/shared/SystemStatusModal';
import { preCacheSectionAudio } from './utils/audioPrewarmer';
import { GlobalReportButton } from './components/shared/GlobalReportButton';
import {
  syncCuratedQuestionBank,
  getQuestionBankStats,
  getLoadedCuratedTasks,
  getFilteredBankTasks,
  matchesLevelFilter,
  matchesTopicFilter,
  loadCuratedShard,
  saveVerifiedQuestion,
} from './utils/questionBankStorage';


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
import { DailyLifeView } from './components/tasks/DailyLifeView';
import { ListeningChooseResponseView } from './components/tasks/ListeningChooseResponseView';
import { ListeningDialogueView } from './components/tasks/ListeningDialogueView';
import { ListeningAnnouncementView } from './components/tasks/ListeningAnnouncementView';
import { ListeningAcademicTalkView } from './components/tasks/ListeningAcademicTalkView';
import { ListenRepeatView } from './components/tasks/ListenRepeatView';
import { SpeakingInterviewView } from './components/tasks/SpeakingInterviewView';
import { BuildSentenceView } from './components/tasks/BuildSentenceView';
import { WriteEmailView } from './components/tasks/WriteEmailView';
import { AcademicDiscussionView } from './components/tasks/AcademicDiscussionView';
import { RubricGuideModal } from './components/modals/RubricGuideModal';
import { WeeklyGoalTracker } from './components/WeeklyGoalTracker';
import { VoiceDiagnosticToast } from './components/shared/VoiceDiagnosticToast';
import { ReadingQuestionSkill, READING_SKILL_OPTIONS } from './types';

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
  const [currentTaskType, setCurrentTaskType] = useState<TaskTypeId>('complete-words');
  const [level, setLevel] = useState<string>('all');
  const [topic, setTopic] = useState<string>('all');
  const [readingSkillFocus, setReadingSkillFocus] = useState<ReadingQuestionSkill>('all');

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
  const [reportError, setReportError] = useState<string | null>(null);
  const [tierNotice, setTierNotice] = useState<string | null>(null);

  // Stop all playing audio whenever the user switches task types or enters/exits mock test mode
  useEffect(() => {
    stopSpeaking();
    return () => {
      stopSpeaking();
    };
  }, [currentTaskType, isMockTest]);

  // Curated question bank sync state across all 12 task types
  const [bankStats, setBankStats] = useState<{
    totalQuestions: number;
    totalCurated: number;
    countsPerTaskType: Record<string, number>;
  } | null>(null);

  // Always fetch and sync curated shard for current section and total bank into IndexedDB and cache
  useEffect(() => {
    let isMounted = true;
    const syncBank = async () => {
      await loadCuratedShard(currentTaskType);
      const stats = await syncCuratedQuestionBank();
      if (isMounted) {
        setBankStats({
          totalQuestions: stats.totalQuestions,
          totalCurated: stats.totalQuestions,
          countsPerTaskType: stats.counts,
        });
      }
    };
    syncBank();
    return () => {
      isMounted = false;
    };
  }, [currentTaskType]);

  // Active task payload per type
  const [customTasks, setCustomTasks] = useState<Record<string, any>>({});
  const [curatedIndices, setCuratedIndices] = useState<Record<string, number>>({
    'complete-words': 0,
    'daily-life': 0,
    'reading-academic': 0,
    'reading-passage': 0,
    'listening-choose-response': 0,
    'listening-dialogue': 0,
    'listening-announcement': 0,
    'listening-academic-talk': 0,
    'listen-repeat': 0,
    'speaking-interview': 0,
    'build-sentence': 0,
    'write-email': 0,
    'academic-discussion': 0,
  });

  // Background question pre-fetch queue for instant generation
  const [prefetchedQueue, setPrefetchedQueue] = useState<PrefetchQueue>(() => loadPrefetchQueueFromStorage());
  const prefetchedQueueRef = useRef<PrefetchQueue>(prefetchedQueue);
  useEffect(() => {
    prefetchedQueueRef.current = prefetchedQueue;
  }, [prefetchedQueue]);

  const [isPrefetching, setIsPrefetching] = useState(false);
  const isPrefetchingRef = React.useRef<Record<string, boolean>>({});
  const failedRecentlyRef = React.useRef<Record<string, number>>({});
  const quotaExhaustedUntilRef = React.useRef<number>(0);
  const [lastGenerationWasInstant, setLastGenerationWasInstant] = useState(false);
  const [rateLimitPauseState, setRateLimitPauseState] = useState<{ kind: 'per-minute' | 'per-day' | 'unknown'; resumeAt: number; retryAfterSeconds: number } | null>(null);
  const lastPrefetchTimeRef = useRef(0);
  const lastDebugLogTimeRef = useRef<Record<string, number>>({});
  const [sharedBankNotice, setSharedBankNotice] = useState<string | null>(null);

  // Audio Pre-Cache State
  const [isPreCachingAudio, setIsPreCachingAudio] = useState(false);
  const [preCacheStatus, setPreCacheStatus] = useState<string | null>(null);

  const activeSection = TASK_DEFINITIONS.find((t) => t.id === currentTaskType)?.section || 'Reading';
  const isAudioSection = activeSection === 'Listening' || activeSection === 'Speaking';

  const handlePreCacheAudio = async () => {
    if (!isAudioSection || isPreCachingAudio) return;
    setIsPreCachingAudio(true);
    setPreCacheStatus('Starting cache...');
    await preCacheSectionAudio(activeSection, (progress) => {
      setPreCacheStatus(progress.statusText);
    });
    setTimeout(() => {
      setIsPreCachingAudio(false);
    }, 4000);
  };

  // Modals
  const [isRubricsOpen, setIsRubricsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
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

  useEffect(() => {
    const handlePrefetchChange = () => {
      const saved = localStorage.getItem('toefl_enable_prefetching');
      setEnablePrefetching(saved === null ? true : saved === 'true');
    };
    window.addEventListener('prefetchSettingChanged', handlePrefetchChange);
    return () => window.removeEventListener('prefetchSettingChanged', handlePrefetchChange);
  }, []);

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

  // Next item in curated pool (drawing from loaded shard questions)
  const handleNextCurated = (type: TaskTypeId) => {
    const loadedPool = getLoadedCuratedTasks(type, level, topic);
    let max = loadedPool.length;
    if (max === 0) {
      if (type === 'complete-words') max = CURATED_COMPLETE_WORDS.length;
      if (type === 'reading-passage') max = CURATED_READING_PASSAGES.length;
      if (type === 'listening-dialogue') max = CURATED_LISTENING.length;
      if (type === 'listen-repeat') max = CURATED_LISTEN_REPEAT.length;
      if (type === 'speaking-interview') max = CURATED_SPEAKING_INTERVIEWS.length;
      if (type === 'build-sentence') max = CURATED_BUILD_SENTENCES.length;
      if (type === 'write-email') max = CURATED_WRITE_EMAILS.length;
      if (type === 'academic-discussion') max = CURATED_ACADEMIC_DISCUSSIONS.length;
    }

    // Clear custom task for this type so next curated item shows
    setCustomTasks((prev) => {
      const next = { ...prev };
      delete next[type];
      return next;
    });

    setCuratedIndices((prev) => {
      const current = prev[type] || 0;
      if (max <= 1) return { ...prev, [type]: 0 };
      let next;
      do {
        next = Math.floor(Math.random() * max);
      } while (next === current);
      return { ...prev, [type]: next };
    });
  };

  // Serve a random question: either from shared bank (using tier plan) or curated pool
  const handleNextQuestion = async (type: TaskTypeId) => {
    setReportedQuestionId(null);
    setReportError(null);

    // 100% of the time if either filter is not 'all', query shared bank first;
    // 60% probability if both are 'all'.
    const hasFilter = level !== 'all' || topic !== 'all';
    const shouldQueryBank = hasFilter || Math.random() < 0.6;

    if (shouldQueryBank) {
      try {
        const shared = await fetchRandomSharedQuestion(type, level, topic);
        if (shared) {
          if (shared.tier && shared.tier !== 'exact') {
            const lvlLabel = level !== 'all' && isValidLevel(level) ? LEVEL_LABELS[level] : level;
            const topLabel = topic !== 'all' && isValidAcademicTopic(topic) ? TOPIC_LABELS[topic] : topic;
            setTierNotice(`No exact match for ${lvlLabel} in ${topLabel}, showing a nearby question.`);

            // Trigger background prefetch so the bank learns
            triggerBackgroundPrefetchIfNeeded(type, level, topic, async (tType, lvl, top) => {
              const resp = await safeFetchJson('/api/generate-task', {
                method: 'POST',
                headers: getApiHeaders(),
                body: JSON.stringify({ taskType: tType, level: lvl, topic: top }),
              });
              return resp.success && resp.data ? [resp.data] : [];
            });
          } else {
            setTierNotice(null);
          }

          setCustomTasks((prev) => ({
            ...prev,
            [type]: normalizeTaskData(shared, type),
          }));
          return;
        }
      } catch (err) {
        console.warn('Shared question bank query failed, falling back to curated:', err);
      }
    }

    setTierNotice(null);
    handleNextCurated(type);
  };

  const handleReportQuestion = async (questionDocId: string) => {
    setReportError(null);
    if (!user) {
      setReportError('Please sign in to report questions.');
      return;
    }
    const alreadyReported = getReportedByMe().includes(questionDocId);
    if (alreadyReported) {
      return;
    }
    try {
      await reportSharedQuestion(questionDocId, user.uid);
      markReportedByMe(questionDocId);
      setReportedQuestionId(questionDocId);
      const currentTask = customTasks[currentTaskType];
      if (currentTask) {
        const nextReportCount = (currentTask.reportCount || 0) + 1;
        setCustomTasks((prev) => ({
          ...prev,
          [currentTaskType]: {
            ...prev[currentTaskType],
            reportCount: nextReportCount,
          },
        }));
        if (nextReportCount >= 3) {
          setTimeout(() => {
            handleNextQuestion(currentTaskType);
          }, 800);
        }
      }
    } catch (err: any) {
      console.error('Failed to report question:', err);
      setReportError(err?.message || 'Failed to submit report. Please try again.');
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
    if (activeBtn && typeof activeBtn.scrollIntoView === 'function') {
      activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
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
    const currentCount = prefetchedQueueRef.current[type]?.length || 0;
    if (!hasAnyProviderKey()) { logEarlyExit('no key'); return; }
    if (document.visibilityState !== 'visible') { logEarlyExit('tab hidden'); return; }
    if (inFlightLock.current || isPrefetchingRef.current[type]) { logEarlyExit('lock held'); return; }
    if (isGenerating) { logEarlyExit('cooldown'); return; }
    if (currentCount >= 2) { logEarlyExit('queue full'); return; }
    if (rateLimitPauseState && Date.now() < rateLimitPauseState.resumeAt) { logEarlyExit('quota pause'); return; }
    if (Date.now() < quotaExhaustedUntilRef.current) { logEarlyExit('quota pause'); return; }
    if (Date.now() - getLastUserAiRequestTime() < 20000 || Date.now() - lastPrefetchTimeRef.current < PREFETCH_GAP_MS) { logEarlyExit('cooldown'); return; }

    const concreteLevel = isValidLevel(lvl) ? lvl : 'intermediate';
    const concreteTopic = isValidAcademicTopic(top) ? top : 'science-tech';

    inFlightLock.current = true;
    isPrefetchingRef.current[type] = true;
    setIsPrefetching(true);
    lastPrefetchTimeRef.current = Date.now();

    try {
      const json = await safeFetchJson('/api/generate-task', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({
          taskType: type,
          level: concreteLevel,
          topic: concreteTopic,
        }),
      });

      if (json.success && !json.data.isFallback) {
        if (lvl !== levelRef.current || top !== topicRef.current) {
          return;
        }

        const prefetchedItem: PrefetchedItem = {
          ...json.data,
          level: concreteLevel,
          topic: concreteTopic,
          id: json.data.id || `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          isPrefetched: true,
          createdAt: Date.now(),
          source: 'ai',
          generatedBy: json.data.generatedBy || getScholarUsername(),
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
        failedRecentlyRef.current[type] = Date.now() + 30 * 1000;
      }
    } catch (err: any) {
      console.debug('Background prefetch notice:', err);
      const status = err.status || 500;
      const json = err.json || {};
      const errObj = json?.rateLimit || json?.data || json;
      const reason = String(json?.data?.fallbackReason || json?.error || err.message || '').toLowerCase();
      
      if (status === 429 || json?.data?.isQuotaExhausted || reason.includes('429') || reason.includes('quota') || reason.includes('resource_exhausted')) {
        const pause = evaluateRateLimitPause(errObj, Date.now());
        setRateLimitPauseState(pause);
        if (pause.kind === 'per-day') {
          quotaExhaustedUntilRef.current = Date.now() + 3600 * 1000;
        } else {
          quotaExhaustedUntilRef.current = pause.resumeAt;
        }
      } else if (status === 401 || reason.includes('invalid api key') || reason.includes('key')) {
        quotaExhaustedUntilRef.current = Date.now() + 30 * 1000;
      } else if (status === 503) {
        quotaExhaustedUntilRef.current = Date.now() + 30 * 1000;
      } else {
        failedRecentlyRef.current[type] = Date.now() + 30 * 1000;
      }
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
        const matching = items.filter((item) => matchesLevelFilter(item, level) && matchesTopicFilter(item, topic));
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
    // Ensure active customTask respects newly selected filter
    setCustomTasks((prev) => {
      const current = prev[currentTaskType];
      if (!current) return prev;
      if (matchesLevelFilter(current, level) && matchesTopicFilter(current, topic)) {
        return prev;
      }
      const copy = { ...prev };
      delete copy[currentTaskType];
      return copy;
    });
  }, [level, topic, currentTaskType]);

  // Sequential prefetch lock
  const inFlightLock = React.useRef(false);
  const isBackgroundPrefetchLoopActiveRef = React.useRef(false);
  const [prefetchProgress, setPrefetchProgress] = useState({ done: false, filled: 0, total: 12 });
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
    if (!enablePrefetching || !hasAnyProviderKey()) return;

    let isCancelled = false;
    let idleTimeout: any = null;

    const runLoop = async () => {
      if (
        isCancelled ||
        isBackgroundPrefetchLoopActiveRef.current ||
        inFlightLock.current ||
        isGenerating ||
        document.visibilityState !== 'visible'
      ) {
        return;
      }
      if (Date.now() < quotaExhaustedUntilRef.current) return;

      const target = getNextTaskToPrefetch(
        currentTaskType,
        prefetchedQueueRef.current,
        level,
        topic,
        failedRecentlyRef.current,
        Date.now(),
        bankStats?.countsPerTaskType
      );
      if (!target) return;

      isBackgroundPrefetchLoopActiveRef.current = true;
      try {
        await prefetchTaskInBackground(target, level, topic);
      } finally {
        isBackgroundPrefetchLoopActiveRef.current = false;
      }
    };

    idleTimeout = setTimeout(runLoop, 2500);

    return () => {
      isCancelled = true;
      clearTimeout(idleTimeout);
    };
  }, [currentTaskType, level, topic, isGenerating, enablePrefetching]);

  useEffect(() => {
    setPrefetchProgress(getPrefetchProgress(prefetchedQueue, level, topic));
  }, [prefetchedQueue, level, topic]);

  useEffect(() => {
    const handleKeyReset = () => {
      quotaExhaustedUntilRef.current = 0;
      failedRecentlyRef.current = {};
    };
    window.addEventListener('apiKeyUpdated', handleKeyReset);
    return () => window.removeEventListener('apiKeyUpdated', handleKeyReset);
  }, []);

  // Generate fresh task: Instant swap if ready in background queue, or fetch on demand
  const handleGenerateNewAiTask = async () => {
    markUserAiRequest();
    const concreteLevel = isValidLevel(level) ? level : 'intermediate';
    const concreteTopic = isValidAcademicTopic(topic) ? topic : 'science-tech';

    // 1. Instant delivery if pre-fetched question is ready in the queue!
    if (hasReadyTask(prefetchedQueue, currentTaskType, concreteLevel, concreteTopic)) {
      const { item: readyTask, updatedQueue } = popPrefetchedTask(prefetchedQueue, currentTaskType, concreteLevel, concreteTopic);
      if (readyTask) {
        setPrefetchedQueue(updatedQueue);

        // Instantly activate
        setCustomTasks((prev) => ({
          ...prev,
          [currentTaskType]: normalizeTaskData(readyTask, currentTaskType),
        }));

        if (readyTask.modelUsed) {
          setLastModelUsed(readyTask.modelUsed);
        }

        setGenerationError(null);
        setLastGenerationWasInstant(true);
        setGenerationSuccess(true);
        setTimeout(() => setGenerationSuccess(false), 3000);

        saveVerifiedQuestion({
          taskType: currentTaskType,
          level: concreteLevel,
          topic: concreteTopic,
          content: readyTask,
          audioUrl: readyTask.audioUrl || null,
          audioClips: readyTask.audioClips || null,
          source: 'ai',
          generatedBy: displayName || getScholarUsername(),
        })
          .then(() => getQuestionBankStats().then(setBankStats))
          .catch(() => {});

        // Immediately replenish 1 standby question for the active task in the background
        if (enablePrefetching && hasAnyProviderKey()) {
          setTimeout(() => {
            prefetchTaskInBackground(currentTaskType, concreteLevel, concreteTopic);
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
      const json = await safeFetchJson('/api/generate-task', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({
          taskType: currentTaskType,
          level: concreteLevel,
          topic: concreteTopic,
          promptData: readingSkillFocus !== 'all' ? { questionSkillFocus: readingSkillFocus } : undefined,
        }),
      });

      if (!json.success) {
        throw new Error(json.error || 'Generation failed');
      }

      if (json.data.isFallback) {
        const reason = json.data.fallbackReason || 'model unavailable';
        const isQuota = Boolean(json.data.isQuotaExhausted) || reason.toLowerCase().includes('quota') || reason.toLowerCase().includes('429');
        if (isQuota) {
          const pause = evaluateRateLimitPause(json.data.rateLimit, Date.now()); setRateLimitPauseState(pause); quotaExhaustedUntilRef.current = pause.resumeAt;
        }
        setGenerationError(
          reason && !reason.toLowerCase().includes('unknown')
            ? `AI notice: ${reason}. Showing an authentic curated TOEFL question instead.`
            : "AI service rate limit reached or model busy. Practicing with an authentic ETS TOEFL curated question."
        );
        handleNextCurated(currentTaskType);
        setIsGenerating(false);
        return;
      }

      if (json.data.modelUsed) {
        setLastModelUsed(json.data.modelUsed);
      }

      const newTask: any = normalizeTaskData({
        ...json.data,
        level: concreteLevel,
        topic: concreteTopic,
        id: `ai-${Date.now()}`,
      }, currentTaskType);

      try {
        const docId = await saveVerifiedQuestion({
          taskType: currentTaskType,
          level: concreteLevel,
          topic: concreteTopic,
          content: newTask,
          source: 'ai',
          generatedBy: displayName || getScholarUsername(),
        });
        if (docId) {
          newTask.questionDocId = docId;
          newTask.createdByName = displayName || 'Anonymous Scholar';
          newTask.createdByUid = user?.uid || 'anonymous';
          newTask.isSharedBank = true;
          setSharedBankNotice('Added to the shared question bank');
          setTimeout(() => setSharedBankNotice(null), 4000);
          getQuestionBankStats().then(setBankStats).catch(() => {});
        }
      } catch (e: any) {
        console.warn('Failed to save to shared question bank:', e?.message || e);
      }

      setCustomTasks((prev) => ({
        ...prev,
        [currentTaskType]: newTask,
      }));
      setLastGenerationWasInstant(false);
      setGenerationSuccess(true);
      setTimeout(() => setGenerationSuccess(false), 3000);

      // Immediately pre-fetch the next question into queue if quota is healthy
      if (enablePrefetching && hasAnyProviderKey()) {
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
        rawMsg && !rawMsg.toLowerCase().includes('unknown')
          ? `AI notice: ${rawMsg}. Showing an authentic curated question instead.`
          : "AI service rate limit reached or model busy. Practicing with an authentic ETS TOEFL curated question."
      );
      handleNextCurated(currentTaskType);
    } finally {
      setIsGenerating(false);
    }
  };

  // Resolve current active task data (hide questions with reportCount >= 3)
  const activeTask = React.useMemo(() => {
    let task = null;
    if (customTasks[currentTaskType]) {
      const t = customTasks[currentTaskType];
      if (!t.reportCount || t.reportCount < 3) {
        task = t;
      }
    }

    if (!task) {
      const loadedTasks = getLoadedCuratedTasks(currentTaskType, level, topic);
      const idx = curatedIndices[currentTaskType] || 0;
      if (loadedTasks && loadedTasks.length > 0) {
        task = loadedTasks[idx % loadedTasks.length];
      } else {
        const allSectionTasks = getLoadedCuratedTasks(currentTaskType, 'all', 'all');
        const levelMatches = allSectionTasks.filter((t) => matchesLevelFilter(t, level));
        const topicMatches = allSectionTasks.filter((t) => matchesTopicFilter(t, topic));
        const closestPool =
          levelMatches.length > 0
            ? levelMatches
            : topicMatches.length > 0
            ? topicMatches
            : allSectionTasks;

        if (closestPool.length > 0) {
          task = closestPool[idx % closestPool.length];
        } else {
          switch (currentTaskType) {
            case 'complete-words':
              task = CURATED_COMPLETE_WORDS[idx % CURATED_COMPLETE_WORDS.length];
              break;
            case 'reading-passage':
            case 'reading-academic':
              task = CURATED_READING_PASSAGES[idx % CURATED_READING_PASSAGES.length];
              break;
            case 'listening-dialogue':
              task = CURATED_LISTENING[idx % CURATED_LISTENING.length];
              break;
            case 'listen-repeat':
              task = CURATED_LISTEN_REPEAT[idx % CURATED_LISTEN_REPEAT.length];
              break;
            case 'speaking-interview':
              task = CURATED_SPEAKING_INTERVIEWS[idx % CURATED_SPEAKING_INTERVIEWS.length];
              break;
            case 'build-sentence':
              task = CURATED_BUILD_SENTENCES[idx % CURATED_BUILD_SENTENCES.length];
              break;
            case 'write-email':
              task = CURATED_WRITE_EMAILS[idx % CURATED_WRITE_EMAILS.length];
              break;
            case 'academic-discussion':
            default:
              task = CURATED_ACADEMIC_DISCUSSIONS[idx % CURATED_ACADEMIC_DISCUSSIONS.length];
              break;
          }
        }
      }
    }

    return normalizeTaskData(task, currentTaskType);
  }, [customTasks, currentTaskType, level, topic, curatedIndices]);
  const currentTaskDef = TASK_DEFINITIONS.find((t) => t.id === currentTaskType)!;
  const adaptiveRec = getRecommendedLevel(getPracticeHistory(), level as DifficultyLevel, currentTaskType);

  return (
    <div className={`min-h-screen font-sans antialiased selection:bg-teal-200 selection:text-teal-950 flex flex-col motion-reduce:transition-none ${darkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-[#fafaf8] text-slate-900'}`}>
      <GlobalReportButton />
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

          {/* Zone 2: Clean text navigation links */}
          <nav className="hidden md:flex items-center gap-6 text-xs sm:text-sm font-medium text-slate-600">
            <button
              onClick={() => {
                setIsMockTest(false);
                setCurrentTaskType('complete-words');
              }}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                !isMockTest && activeSection === 'Reading' ? 'text-teal-800 font-semibold' : ''
              }`}
            >
              Reading
            </button>
            <button
              onClick={() => {
                setIsMockTest(false);
                setCurrentTaskType('listening-choose-response');
              }}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                !isMockTest && activeSection === 'Listening' ? 'text-teal-800 font-semibold' : ''
              }`}
            >
              Listening
            </button>
            <button
              onClick={() => {
                setIsMockTest(false);
                setCurrentTaskType('build-sentence');
              }}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                !isMockTest && activeSection === 'Writing' ? 'text-teal-800 font-semibold' : ''
              }`}
            >
              Writing
            </button>
            <button
              onClick={() => {
                setIsMockTest(false);
                setCurrentTaskType('listen-repeat');
              }}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                !isMockTest && activeSection === 'Speaking' ? 'text-teal-800 font-semibold' : ''
              }`}
            >
              Speaking
            </button>
            <button
              onClick={() => setIsRubricsOpen(true)}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 text-slate-500 cursor-pointer"
            >
              Scoring Rubrics
            </button>
            <button
              onClick={() => setIsMockTest(true)}
              className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isMockTest
                  ? 'text-rose-700 font-bold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Full Mock Test
            </button>
          </nav>

          {/* Zone 3: Right actions (Score History, Dashboard, System Status, Theme Toggle) */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => setIsHistoryOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </button>
            <button
              onClick={() => setIsStatusModalOpen(true)}
              aria-label="Live System Status"
              title="Live System Status (Network, Generation, Transcriber)"
              className="p-2 rounded-lg text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              <Activity className="w-4 h-4 text-teal-700" />
            </button>
            <button
              onClick={() => setDarkMode(prev => !prev)}
              aria-label="Toggle Dark Mode"
              className="p-2 rounded-lg text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
            </button>
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
                {activeSection}
              </span>
            </div>
          </div>

          {/* Section-Filtered Task Format Selector Bar */}
          <div className="p-1 bg-slate-200/80 rounded-xl flex items-center gap-1.5 flex-wrap">
            {TASK_DEFINITIONS.filter((td) => td.section === activeSection).map((td) => {
              const isActive =
                !isMockTest &&
                (currentTaskType === td.id ||
                  (td.id === 'reading-academic' && currentTaskType === 'reading-passage') ||
                  (td.id === 'listening-dialogue' && currentTaskType === 'listening-conversation') ||
                  (td.id === 'listening-academic-talk' && currentTaskType === 'listening-lecture'));
              const readyCount = (prefetchedQueue[td.id] || []).filter(
                (item) => matchesLevelFilter(item, level) && matchesTopicFilter(item, topic)
              ).length;
              const isReady = readyCount > 0;
              const cleanLabel = td.name.replace(/^[RLWS]\s*[·•.]\s*/i, '').trim();
              return (
                <button
                  key={td.id}
                  data-active={isActive ? 'true' : 'false'}
                  onClick={() => {
                    setIsMockTest(false);
                    setCurrentTaskType(td.id);
                    setGenerationError(null);
                  }}
                  className={`flex-1 sm:flex-initial px-4 py-2 text-xs font-medium rounded-lg transition-all whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5 ${
                    isActive
                      ? 'bg-white text-slate-950 font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  <span className="text-slate-400 font-normal text-[11px]">{td.section.slice(0, 1)} ·</span>
                  <span>{cleanLabel}</span>
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
        </section>

        {/* Generator Controls Strip */}
        <section
          aria-label="Practice Parameters"
          className="space-y-2"
        >
          <div
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
                  <option value="all">All Levels</option>
                  {LEVELS.map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {LEVEL_LABELS[lvl]}
                    </option>
                  ))}
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
                  <option value="all">All Topics</option>
                  {ACADEMIC_TOPICS.map((top) => (
                    <option key={top} value={top}>
                      {TOPIC_LABELS[top]}
                    </option>
                  ))}
                </select>
              </div>

              {(currentTaskType === 'reading-academic' || currentTaskType === 'daily-life' || currentTaskType === 'reading-passage') && (
                <div className="flex items-center gap-2">
                  <label htmlFor="select-skill-focus" className="text-xs text-teal-800 font-semibold flex items-center gap-1">
                    <Target className="w-3.5 h-3.5 text-teal-700" />
                    <span>Skill Focus:</span>
                  </label>
                  <select
                    id="select-skill-focus"
                    value={readingSkillFocus}
                    onChange={(e) => setReadingSkillFocus(e.target.value as ReadingQuestionSkill)}
                    className="text-xs bg-teal-50 border border-teal-200 text-teal-900 rounded-lg px-2.5 py-1.5 font-semibold outline-hidden focus:border-teal-700 cursor-pointer"
                  >
                    {READING_SKILL_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(() => {
                const loadedAllForSection = getLoadedCuratedTasks(currentTaskType, 'all', 'all');
                const sectionTotalCount = bankStats?.countsPerTaskType?.[currentTaskType] || loadedAllForSection.length || 10;
                const exactFilterMatches = getFilteredBankTasks(currentTaskType, level, topic);
                return (
                  <span className="text-[11px] text-slate-500 font-medium hidden sm:inline-flex items-center gap-1.5">
                    <Database className="w-3 h-3 text-teal-700 shrink-0" />
                    <span>
                      {exactFilterMatches.length > 0
                        ? `${exactFilterMatches.length}/${sectionTotalCount} in bank`
                        : `0 exact filter matches (showing closest from ${sectionTotalCount} in section)`}
                    </span>
                  </span>
                );
              })()}
            </div>

            <div className="flex items-center gap-2.5 w-full md:w-auto justify-end flex-wrap">
              {isAudioSection && (
                <button
                  type="button"
                  onClick={handlePreCacheAudio}
                  disabled={isPreCachingAudio}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-75 ${
                    preCacheStatus && preCacheStatus.includes('0ms ready')
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                      : 'bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 shadow-2xs'
                  }`}
                  title="Pre-cache high-fidelity voices for the current section into IndexedDB for 0ms offline playback"
                >
                  <Volume2 className={`w-3.5 h-3.5 ${isPreCachingAudio ? 'animate-pulse text-teal-600' : 'text-teal-700'}`} />
                  <span>
                    {isPreCachingAudio
                      ? preCacheStatus || 'Caching audio...'
                      : preCacheStatus && preCacheStatus.includes('0ms ready')
                      ? 'Audio Cached (0ms ⚡)'
                      : 'Pre-Cache Audio'}
                  </span>
                </button>
              )}

              <button
                onClick={() => handleNextQuestion(currentTaskType)}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="Load next question from shared question bank or curated pool"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                <span>Next Question</span>
              </button>

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
          </div>
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
          ) : (generationError.toLowerCase().includes('quota') ||
               generationError.toLowerCase().includes('rate limit') ||
               generationError.toLowerCase().includes('429') ||
               generationError.toLowerCase().includes('resource_exhausted')) ? (
            <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl space-y-2.5 text-amber-950 relative shadow-xs">
              <button
                onClick={() => setGenerationError(null)}
                className="absolute top-3 right-3 text-amber-600 hover:text-amber-800 p-1 rounded-md cursor-pointer transition-colors"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 font-bold text-sm text-amber-900 pr-6">
                <AlertCircle className="w-4.5 h-4.5 text-amber-600 shrink-0" />
                <span>API Quota Limit Reached (Fallback Models Attempted)</span>
              </div>
              <p className="text-xs text-amber-800 leading-relaxed">
                {generationError}
              </p>
              <div className="p-2.5 bg-white/80 rounded-lg border border-amber-200 text-xs space-y-1.5">
                <div className="font-semibold text-slate-700">Quick options:</div>
                <div className="text-slate-600">
                  1. <strong>Wait for reset:</strong> Free minute quotas reset in 1-2 minutes; daily quotas reset in 1 hour or at midnight UTC.
                </div>
                <div className="text-slate-600 flex items-center flex-wrap gap-2">
                  <span>2. <strong>Switch to another free API key:</strong></span>
                  <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-teal-700 font-bold underline hover:text-teal-900">OpenRouter (Free)</a>
                  <span>·</span>
                  <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="text-teal-700 font-bold underline hover:text-teal-900">Groq (Free)</a>
                  <span>·</span>
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-teal-700 font-bold underline hover:text-teal-900">Gemini (Free)</a>
                  <span>·</span>
                  <a href="https://build.nvidia.com" target="_blank" rel="noreferrer" className="text-teal-700 font-bold underline hover:text-teal-900">NVIDIA (Free)</a>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                <button
                  onClick={() => {
                    setGenerationError(null);
                    setRateLimitPauseState(null);
                    quotaExhaustedUntilRef.current = 0;
                    handleGenerateNewAiTask();
                  }}
                  className="px-3.5 py-1.5 bg-amber-700 hover:bg-amber-800 text-white font-semibold rounded-lg transition-colors cursor-pointer shadow-2xs flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Retry with AI Now
                </button>
                <button
                  onClick={() => {
                    setDashboardDefaultTab('settings');
                    setIsDashboardOpen(true);
                  }}
                  className="px-3.5 py-1.5 bg-teal-800 hover:bg-teal-900 text-white font-semibold rounded-lg transition-colors cursor-pointer shadow-2xs"
                >
                  Open API Settings
                </button>
                <button
                  onClick={() => setGenerationError(null)}
                  className="px-3 py-1.5 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 font-medium rounded-lg transition-colors cursor-pointer"
                >
                  Dismiss &amp; Use Curated Tasks
                </button>
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

        {tierNotice && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{tierNotice}</span>
            </div>
            <button
              onClick={() => setTierNotice(null)}
              className="text-amber-600 hover:text-amber-800 p-0.5 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
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
              {activeTask?.modelUsed && !activeTask.createdByName && !activeTask.questionDocId && (
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
              {activeTask?.questionDocId && (!activeTask.reportCount || activeTask.reportCount < 3) && (
                <div className="mb-6 flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="w-2 h-2 rounded-full bg-teal-600"></span>
                    <span>
                      {activeTask.createdByName ? (
                        <>Created by <strong className="text-slate-900 font-semibold">{activeTask.createdByName}</strong></>
                      ) : (
                        <strong className="text-slate-900 font-semibold">Shared Question Bank</strong>
                      )}
                    </span>
                    {activeTask.level && (
                      <span className="text-[11px] text-slate-400 capitalize">· {activeTask.level}</span>
                    )}
                    {activeTask.topic && (
                      <span className="text-[11px] text-slate-400">· {TOPIC_LABELS[activeTask.topic as AcademicTopic] || activeTask.topic}</span>
                    )}
                    {activeTask.modelUsed && (
                      <span className="text-[10px] text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md font-mono">
                        Generated with {activeTask.modelUsed}
                      </span>
                    )}
                  </div>
                  {activeTask.questionDocId && (
                    reportedQuestionId === activeTask.questionDocId || getReportedByMe().includes(activeTask.questionDocId) ? (
                      <span className="text-[11px] text-amber-700 font-medium flex items-center gap-1.5 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                        <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" /> Question reported
                      </span>
                    ) : (
                      <button
                        onClick={() => handleReportQuestion(activeTask.questionDocId)}
                        className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-rose-600 transition-colors px-2 py-1 rounded-md hover:bg-rose-50 cursor-pointer"
                        title="Report this question"
                      >
                        <Flag className="w-3.5 h-3.5" />
                        <span>Report question</span>
                        {typeof activeTask.reportCount === 'number' && activeTask.reportCount > 0 && (
                          <span className="text-[10px] text-slate-400 font-mono">({activeTask.reportCount})</span>
                        )}
                      </button>
                    )
                  )}
                </div>
              )}
              {reportError && (
                <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{reportError}</span>
                  </div>
                  <button onClick={() => setReportError(null)} className="text-rose-600 hover:text-rose-800 p-0.5 cursor-pointer">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {currentTaskType === 'complete-words' && (
                <CompleteWordsView
                  key={activeTask.id || (activeTask as any).title}
                  task={activeTask as CompleteWordsTask}
                  wordWrapperClassName="inline-flex items-baseline whitespace-nowrap"
                  blankInputClassName="text-base font-semibold"
                  onNextTask={() => handleNextQuestion('complete-words')}
                />
              )}

              {currentTaskType === 'daily-life' && (
                <DailyLifeView
                  key={activeTask.id || (activeTask as any).title}
                  task={activeTask as any}
                  skillFocus={readingSkillFocus}
                  leftColumnClassName="lg:sticky lg:top-6 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto"
                  rightColumnClassName="lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-2 scroll-smooth"
                  footerBarClassName="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-200"
                  onNextTask={() => handleNextQuestion('daily-life')}
                />
              )}

              {(currentTaskType === 'reading-academic' || currentTaskType === 'reading-passage') && (
                <ReadingPassageView
                  key={activeTask.id || (activeTask as any).title}
                  task={activeTask as ReadingPassageTask}
                  skillFocus={readingSkillFocus}
                  leftColumnClassName="lg:sticky lg:top-6 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto"
                  rightColumnClassName="lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-2 scroll-smooth"
                  footerBarClassName="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-200"
                  onNextTask={() => handleNextQuestion(currentTaskType)}
                />
              )}

              {currentTaskType === 'listening-choose-response' && (
                <ListeningChooseResponseView
                  key={activeTask.id || (activeTask as any).title}
                  task={activeTask as any}
                  onNextTask={() => handleNextQuestion('listening-choose-response')}
                />
              )}

              {(currentTaskType === 'listening-dialogue' || currentTaskType === 'listening-conversation') && (
                <ListeningDialogueView
                  key={activeTask.id || (activeTask as any).title}
                  task={activeTask as ListeningTask}
                  onNextTask={() => handleNextQuestion(currentTaskType)}
                />
              )}

              {currentTaskType === 'listening-announcement' && (
                <ListeningAnnouncementView
                  key={activeTask.id || (activeTask as any).title}
                  task={activeTask as any}
                  onNextTask={() => handleNextQuestion('listening-announcement')}
                />
              )}

              {(currentTaskType === 'listening-academic-talk' || currentTaskType === 'listening-lecture') && (
                <ListeningAcademicTalkView
                  key={activeTask.id || (activeTask as any).title}
                  task={activeTask as any}
                  onNextTask={() => handleNextQuestion(currentTaskType)}
                />
              )}

              {currentTaskType === 'build-sentence' && (
                <BuildSentenceView
                  key={activeTask.id || (activeTask as any).title}
                  task={activeTask as BuildSentenceTask}
                  onNextTask={() => handleNextQuestion(currentTaskType)}
                />
              )}

              {currentTaskType === 'write-email' && (
                <WriteEmailView
                  key={activeTask.id || (activeTask as any).title}
                  task={activeTask as WriteEmailTask}
                  onNextTask={() => handleNextQuestion(currentTaskType)}
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
                  onNextTask={() => handleNextQuestion(currentTaskType)}
                  onOpenApiKeySettings={() => {
                    setDashboardDefaultTab('settings');
                    setIsDashboardOpen(true);
                  }}
                />
              )}

              {currentTaskType === 'listen-repeat' && (
                <ListenRepeatView
                  key={activeTask.id || (activeTask as any).title}
                  task={activeTask as ListenRepeatTask}
                  onNextTask={() => handleNextQuestion(currentTaskType)}
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

      {/* Diagnostic Voice Fallback Toast */}
      <VoiceDiagnosticToast
        onOpenSettings={() => {
          setDashboardDefaultTab('settings');
          setIsDashboardOpen(true);
        }}
      />

      {/* Modals */}
      <RubricGuideModal isOpen={isRubricsOpen} onClose={() => setIsRubricsOpen(false)} />
      <SystemStatusModal isOpen={isStatusModalOpen} onClose={() => setIsStatusModalOpen(false)} />

      <Suspense fallback={null}>
        <PerformanceHistoryModal isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />
        <DashboardModal 
          isOpen={isDashboardOpen} 
          onClose={() => setIsDashboardOpen(false)} 
          defaultTab={dashboardDefaultTab}
          currentTaskType={currentTaskType}
          openHistory={() => { setIsDashboardOpen(false); setIsHistoryOpen(true); }}
          openRubrics={() => { setIsDashboardOpen(false); setIsRubricsOpen(true); }}
          onNavigateToTask={(target) => {
            setIsDashboardOpen(false);
            const lower = (target || '').toLowerCase();
            if (lower === 'speaking' || lower === 'speaking-interview') {
              setCurrentTaskType('speaking-interview');
            } else if (lower === 'listening' || lower === 'listening-dialogue') {
              setCurrentTaskType('listening-dialogue');
            } else if (lower === 'listen-repeat') {
              setCurrentTaskType('listen-repeat');
            } else if (lower === 'writing' || lower === 'academic-discussion') {
              setCurrentTaskType('academic-discussion');
            } else if (lower === 'write-email') {
              setCurrentTaskType('write-email');
            } else if (lower === 'build-sentence') {
              setCurrentTaskType('build-sentence');
            } else if (lower === 'reading' || lower === 'reading-passage') {
              setCurrentTaskType('reading-passage');
            } else if (lower === 'complete-words') {
              setCurrentTaskType('complete-words');
            }
          }}
        />
      </Suspense>
    </div>
  );
}
