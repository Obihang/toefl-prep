import { pickSingleVoice, inferGender, pickBrowserVoiceForGender, parseDialogueLine, detectSpeakerGender } from '../../utils/voices';
import React, { useState, useEffect, useRef } from 'react';
import { markUserAiRequest } from '../../utils/userActivity';
import { SpeakingInterviewTask, InterviewQuestionItem } from '../../data/curatedQuestions';
import { Volume2, Mic, MicOff, Play, Pause, Sparkles, AlertCircle, ArrowRight, Clock, Loader2, Headphones, RefreshCw, RotateCcw, Award, BookOpen, CheckCircle2, ChevronDown, ChevronUp, Zap, HardDrive } from 'lucide-react';
import { OfflineTranscriberModal } from '../shared/OfflineTranscriberModal';
import { checkModelCachedStatus, getWhisperModelChoice } from '../../utils/localWhisperStt';
import { speakScriptLine, stopSpeaking, createVoiceSession, VoiceSession, playChime, transcribeAudioBlob, prefetchSpeechAudio, playAudioBlob, stripSpeakerAndFormatting } from '../../utils/audioSpeech';
import { calculateSpeakingMetrics, SpeakingMetrics } from '../../utils/speakingMetrics';
import { savePracticeRecord } from '../../utils/scoreTracker';
import { getApiHeaders, hasAnyStoredApiKey } from '../../utils/apiKey';
import { safeFetchJson } from '../../utils/apiHelper';
import { evaluateLocally } from '../../utils/localEvaluator';
import { MicrophoneTestWidget } from '../shared/MicrophoneTestWidget';

interface Props {
  task: SpeakingInterviewTask;
  onNextTask?: () => void;
  onComplete?: (result: number) => void;
  onOpenApiKeySettings?: () => void;
}


export const SpeakingInterviewView: React.FC<Props> = ({ task, onNextTask, onComplete, onOpenApiKeySettings }) => {
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [timerMode, setTimerMode] = useState<'idle' | 'prep' | 'speaking'>('idle');
  const [timeLeft, setTimeLeft] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [autoStart, setAutoStart] = useState(false);
  const [transcribeSeconds, setTranscribeSeconds] = useState(0);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalSeconds, setEvalSeconds] = useState(0);
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const [evaluationResult, setEvaluationResult] = useState<any>(null);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [isBenchmarkOpen, setIsBenchmarkOpen] = useState(true);
  const [audioBlobs, setAudioBlobs] = useState<Record<number, Blob>>({});
  const [transcribingQuestionIds, setTranscribingQuestionIds] = useState<Record<number, boolean>>({});
  const [transcriptionErrors, setTranscriptionErrors] = useState<Record<number, string | null>>({});
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  const [isTranscriberModalOpen, setIsTranscriberModalOpen] = useState(false);
  const [isAnyModelCached, setIsAnyModelCached] = useState<boolean>(true);

  useEffect(() => {
    const checkCached = async () => {
      const active = getWhisperModelChoice();
      const isCached = await checkModelCachedStatus(active);
      setIsAnyModelCached(isCached);
    };
    checkCached();
  }, [isTranscriberModalOpen]);

  const [playingRecordingQIndex, setPlayingRecordingQIndex] = useState<number | null>(null);
  const activePlayingKeyRef = useRef<string | null>(null);
  const questionAudioRef = useRef<HTMLAudioElement | null>(null);
  const recordingAudioRef = useRef<HTMLAudioElement | null>(null);

  const voiceSessionRef = useRef<VoiceSession | null>(null);
  const timerIntervalRef = useRef<any>(null);
  const pendingTranscriptionsRef = useRef<Record<number, Promise<void>>>({});

  const stopAllAudio = () => {
    if (recordingAudioRef.current) {
      try {
        recordingAudioRef.current.pause();
        recordingAudioRef.current.currentTime = 0;
      } catch {}
      recordingAudioRef.current = null;
    }
    if (questionAudioRef.current) {
      try {
        questionAudioRef.current.pause();
        questionAudioRef.current.currentTime = 0;
      } catch {}
      questionAudioRef.current = null;
    }
    activePlayingKeyRef.current = null;
    setIsPlayingAudio(false);
    setPlayingRecordingQIndex(null);
    stopSpeaking();
  };

  const currentQ: InterviewQuestionItem = task.questions[currentQIndex];

  const interviewerName = (task as any).interviewerName || 'Professor Lee';
  const interviewerGender = (task as any).interviewerGender || inferGender(interviewerName);
  const interviewerVoice = pickSingleVoice(`${task.title}|${interviewerName}`, interviewerGender);

  // Silent background pre-synthesis of interviewer questions
  useEffect(() => {
    if (!task?.questions) return;
    task.questions.forEach((q) => {
      prefetchSpeechAudio(q.question, interviewerVoice).catch(() => {});
    });
  }, [task.id, task.title, interviewerVoice]);

  // Stop audio/timers/voice session on unmount
  useEffect(() => {
    return () => {
      clearInterval(timerIntervalRef.current);
      if (voiceSessionRef.current) {
        voiceSessionRef.current.abort();
      }
      stopAllAudio();
    };
  }, []);

  // Stop audio when changing questions
  useEffect(() => {
    stopAllAudio();
  }, [currentQIndex, task.id]);

  // Live timer for recording duration
  useEffect(() => {
    let interval: any = null;
    if (isRecording) {
      setRecordingSeconds(0);
      interval = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    } else {
      setRecordingSeconds(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  // Live timer for transcription duration
  useEffect(() => {
    let interval: any = null;
    if (isTranscribing) {
      setTranscribeSeconds(0);
      interval = setInterval(() => setTranscribeSeconds((s) => s + 1), 1000);
    } else {
      setTranscribeSeconds(0);
    }
    return () => clearInterval(interval);
  }, [isTranscribing]);

  // Live timer for evaluation duration
  useEffect(() => {
    let interval: any = null;
    if (isEvaluating) {
      setEvalSeconds(0);
      interval = setInterval(() => setEvalSeconds((s) => s + 1), 1000);
    } else {
      setEvalSeconds(0);
    }
    return () => clearInterval(interval);
  }, [isEvaluating]);

  const playQuestionAudio = async (itemKey: string) => {
    stopAllAudio();
    activePlayingKeyRef.current = itemKey;
    setIsPlayingAudio(true);
    setAudioError(null);
    const parsed = parseDialogueLine(currentQ.question);
    const cleanQ = parsed.spokenText || stripSpeakerAndFormatting(currentQ.question);
    const effInterviewer = parsed.speakerName || interviewerName;
    const effGender = detectSpeakerGender(effInterviewer, parsed.speakerHint || interviewerGender);
    const voiceName = pickSingleVoice(`${task.title}|${effInterviewer}`, effGender);
    const browserVoice = pickBrowserVoiceForGender(effGender);
    try {
      await speakScriptLine(cleanQ, {
        rate: 0.95,
        voiceName,
        browserVoice,
        onEnd: () => {
          if (activePlayingKeyRef.current === itemKey) activePlayingKeyRef.current = null;
          setIsPlayingAudio(false);
        },
        onError: (err) => {
          if (activePlayingKeyRef.current === itemKey) activePlayingKeyRef.current = null;
          setIsPlayingAudio(false);
          setAudioError(err?.message || String(err));
        },
      });
    } catch (err: any) {
      if (activePlayingKeyRef.current === itemKey) activePlayingKeyRef.current = null;
      setIsPlayingAudio(false);
      setAudioError(err?.message || String(err));
    }
  };

  const handleHearQuestion = async () => {
    const itemKey = `question_${currentQIndex}`;
    const wasPlayingThis = activePlayingKeyRef.current === itemKey;
    stopAllAudio();
    if (wasPlayingThis) {
      return;
    }
    await playQuestionAudio(itemKey);
  };

  const handleRestartQuestionAudio = async () => {
    stopAllAudio();
    const itemKey = `question_${currentQIndex}`;
    await playQuestionAudio(itemKey);
  };

  // Background transcription per question
  const startBackgroundTranscriptionIfNeeded = (qIndex: number, blob: Blob | null, existingTranscript: string) => {
    if (existingTranscript.trim() || !blob) return;
    markUserAiRequest();

    setTranscribingQuestionIds((prev) => ({ ...prev, [qIndex]: true }));
    console.log(`[Audio Timing] Starting background transcription for question ${qIndex + 1}...`);
    const p = transcribeAudioBlob(blob)
      .then(({ transcript, words, durationMs }) => {
        if (transcript.trim()) {
          const metrics = calculateSpeakingMetrics(words, transcript, (durationMs || 0) / 1000, currentQ.responseTimeSeconds);
          setAnswers((prev) => ({
            ...prev,
            [qIndex]: transcript.trim(),
            [`metrics_${qIndex}`]: metrics,
          }));
          setTranscriptionErrors((prev) => ({ ...prev, [qIndex]: null }));
        }
        console.log(`[Audio Timing] Background transcription finished for question ${qIndex + 1} in ${durationMs || 'N/A'}ms`);
      })
      .catch((err) => {
        console.warn(`[Audio] Background transcription failed for question ${qIndex + 1}:`, err);
        const errCode = err?.message === 'TRANSCRIPTION_TIMEOUT' ? 'TRANSCRIPTION_TIMEOUT' : 'TRANSCRIPTION_FAILED';
        setTranscriptionErrors((prev) => ({ ...prev, [qIndex]: errCode }));
      })
      .finally(() => {
        setTranscribingQuestionIds((prev) => ({ ...prev, [qIndex]: false }));
        delete pendingTranscriptionsRef.current[qIndex];
      });

    pendingTranscriptionsRef.current[qIndex] = p;
  };

  const handleRetryTranscription = async (qIndex: number) => {
    const blob = audioBlobs[qIndex];
    if (!blob) return;
    setIsTranscribing(true);
    setMicNotice(null);
    try {
      const { transcript } = await transcribeAudioBlob(blob);
      if (transcript.trim()) {
        setAnswers((prev) => ({
          ...prev,
          [qIndex]: transcript.trim(),
        }));
        setTranscriptionErrors((prev) => ({ ...prev, [qIndex]: null }));
      }
    } catch (err: any) {
      const errCode = err?.message === 'TRANSCRIPTION_TIMEOUT' ? 'TRANSCRIPTION_TIMEOUT' : 'TRANSCRIPTION_FAILED';
      setTranscriptionErrors((prev) => ({ ...prev, [qIndex]: errCode }));
      setMicNotice(
        errCode === 'TRANSCRIPTION_TIMEOUT'
          ? 'Transcription timed out (20s). Audio is preserved. Click "Retry transcription" to try again.'
          : 'Audio transcription failed. Audio is preserved. Click "Retry transcription" to try again.'
      );
    } finally {
      setIsTranscribing(false);
    }
  };

  // Start Official TOEFL Test Simulation for current question
  const startSimulation = () => {
    clearInterval(timerIntervalRef.current);
    if (voiceSessionRef.current) {
      voiceSessionRef.current.abort();
      voiceSessionRef.current = null;
    }
    setIsRecording(false);
    setAudioLevel(0);
    setMicNotice(null);

    // 1. Preparation Phase
    setTimerMode('prep');
    setTimeLeft(currentQ.prepTimeSeconds);
    playChime(660, 250);

    let currentSeconds = currentQ.prepTimeSeconds;

    timerIntervalRef.current = setInterval(() => {
      currentSeconds--;
      setTimeLeft(currentSeconds);

      if (currentSeconds <= 0) {
        clearInterval(timerIntervalRef.current);
        startSpeakingPhase();
      }
    }, 1000);
  };

  const startSpeakingPhase = async () => {
    setTimerMode('speaking');
    setTimeLeft(currentQ.responseTimeSeconds);
    playChime(880, 400);

    const session = createVoiceSession({
      onTranscriptUpdate: (transcript) => {
        setAnswers((prev) => ({
          ...prev,
          [currentQIndex]: transcript,
        }));
      },
      onAudioLevel: (lvl) => setAudioLevel(lvl),
      onQuietWarning: (warning) => setMicNotice(warning),
      onDeviceDisconnected: (msg) => setMicNotice(msg),
      onNotice: (notice) => setMicNotice(notice),
      onStatusChange: (status, errorMsg) => {
        if (status === 'listening' || status === 'waiting_for_voice') setIsRecording(true);
        if (status === 'processing') setIsTranscribing(true);
        if (status === 'idle') {
          setIsRecording(false);
          setIsTranscribing(false);
          setAudioLevel(0);
        }
        if (status === 'error') {
          setIsRecording(false);
          setIsTranscribing(false);
          setAudioLevel(0);
          if (errorMsg) setMicNotice(errorMsg);
        }
      },
      autoStartThreshold: autoStart ? 5 : undefined,
    });

    voiceSessionRef.current = session;

    try {
      await session.start();
    } catch (err: any) {
      setIsRecording(false);
      setAudioLevel(0);
      setMicNotice(err.message || 'Could not start microphone');
    }

    let speakingSeconds = currentQ.responseTimeSeconds;
    timerIntervalRef.current = setInterval(async () => {
      speakingSeconds--;
      setTimeLeft(speakingSeconds);

      if (speakingSeconds <= 0) {
        clearInterval(timerIntervalRef.current);
        await stopSimulation();
      }
    }, 1000);
  };

  const stopSimulation = async () => {
    clearInterval(timerIntervalRef.current);
    if (voiceSessionRef.current) {
      setIsTranscribing(true);
      try {
        const result = await voiceSessionRef.current.stop();
        if (result.transcript) {
          setAnswers((prev) => ({
            ...prev,
            [currentQIndex]: result.transcript,
          }));
          setTranscriptionErrors((prev) => ({ ...prev, [currentQIndex]: null }));
        }
        if (result.error) {
          setTranscriptionErrors((prev) => ({ ...prev, [currentQIndex]: result.error! }));
        }
        if (result.audioBlob) {
          setAudioBlobs((prev) => ({
            ...prev,
            [currentQIndex]: result.audioBlob!,
          }));
          if (!result.error && !result.transcript) {
            startBackgroundTranscriptionIfNeeded(currentQIndex, result.audioBlob, result.transcript);
          }
        }
      } catch (err: any) {
        console.warn('Voice session stop error:', err);
      } finally {
        voiceSessionRef.current = null;
        setIsTranscribing(false);
        setAudioLevel(0);
      }
    }
    setIsRecording(false);
    setAudioLevel(0);
    setTimerMode('idle');
    playChime(440, 500);
  };

  const handlePlayUserRecording = (qIndex: number) => {
    const itemKey = `user_rec_${qIndex}`;
    const wasPlayingThis = activePlayingKeyRef.current === itemKey;
    stopAllAudio();
    if (wasPlayingThis) {
      return;
    }

    const blob = audioBlobs[qIndex];
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.loop = false;
    activePlayingKeyRef.current = itemKey;
    recordingAudioRef.current = audio;
    setPlayingRecordingQIndex(qIndex);

    audio.onended = () => {
      if (recordingAudioRef.current === audio) {
        recordingAudioRef.current = null;
      }
      if (activePlayingKeyRef.current === itemKey) {
        activePlayingKeyRef.current = null;
      }
      setPlayingRecordingQIndex(null);
      URL.revokeObjectURL(url);
    };

    audio.onerror = () => {
      if (recordingAudioRef.current === audio) {
        recordingAudioRef.current = null;
      }
      if (activePlayingKeyRef.current === itemKey) {
        activePlayingKeyRef.current = null;
      }
      setPlayingRecordingQIndex(null);
      URL.revokeObjectURL(url);
    };

    audio.play().catch(() => {
      if (recordingAudioRef.current === audio) {
        recordingAudioRef.current = null;
      }
      if (activePlayingKeyRef.current === itemKey) {
        activePlayingKeyRef.current = null;
      }
      setPlayingRecordingQIndex(null);
      URL.revokeObjectURL(url);
    });
  };

  const handleManualMicToggle = async () => {
    setMicNotice(null);

    if (isRecording && voiceSessionRef.current) {
      setIsTranscribing(true);
      try {
        const result = await voiceSessionRef.current.stop();
        if (result.transcript) {
          setAnswers((prev) => ({
            ...prev,
            [currentQIndex]: result.transcript,
          }));
          setTranscriptionErrors((prev) => ({ ...prev, [currentQIndex]: null }));
        }
        if (result.error) {
          setTranscriptionErrors((prev) => ({ ...prev, [currentQIndex]: result.error! }));
        }
        if (result.audioBlob) {
          setAudioBlobs((prev) => ({
            ...prev,
            [currentQIndex]: result.audioBlob!,
          }));
          if (!result.error && !result.transcript) {
            startBackgroundTranscriptionIfNeeded(currentQIndex, result.audioBlob, result.transcript);
          }
        }
      } catch (err: any) {
        setMicNotice(err.message || 'Failed to process voice recording');
      } finally {
        voiceSessionRef.current = null;
        setIsRecording(false);
        setIsTranscribing(false);
        setAudioLevel(0);
      }
      return;
    }

    // Clear old text and metrics so box starts fresh
    setAnswers((prev) => ({
      ...prev,
      [currentQIndex]: '',
      [`metrics_${currentQIndex}`]: undefined,
    }));

    const session = createVoiceSession({
      onTranscriptUpdate: (transcript) => {
        setAnswers((prev) => ({
          ...prev,
          [currentQIndex]: transcript,
        }));
      },
      onAudioLevel: (lvl) => setAudioLevel(lvl),
      onQuietWarning: (warning) => setMicNotice(warning),
      onDeviceDisconnected: (msg) => setMicNotice(msg),
      onNotice: (notice) => setMicNotice(notice),
      onStatusChange: (status, errorMsg) => {
        if (status === 'listening' || status === 'waiting_for_voice') setIsRecording(true);
        if (status === 'processing') setIsTranscribing(true);
        if (status === 'idle') {
          setIsRecording(false);
          setIsTranscribing(false);
          setAudioLevel(0);
        }
        if (status === 'error') {
          setIsRecording(false);
          setIsTranscribing(false);
          setAudioLevel(0);
          if (errorMsg) setMicNotice(errorMsg);
        }
      },
      autoStartThreshold: autoStart ? 5 : undefined,
    });

    voiceSessionRef.current = session;

    try {
      await session.start();
    } catch (err: any) {
      voiceSessionRef.current = null;
      setIsRecording(false);
      setAudioLevel(0);
      setMicNotice(err.message || 'Microphone could not be accessed. You can type your response.');
    }
  };

  const handleEvaluateAI = async () => {
    markUserAiRequest();
    // Wait for any running background transcriptions to finish first
    const pending = Object.values(pendingTranscriptionsRef.current);
    if (pending.length > 0) {
      setIsTranscribing(true);
      try {
        await Promise.all(pending);
      } catch {}
      setIsTranscribing(false);
    }

    const hasAnyAnswer = Object.values(answers).some((a) => a.trim().length > 0);
    if (!hasAnyAnswer) {
      setEvalError('Please provide a spoken or typed response to at least one question before requesting AI evaluation.');
      return;
    }

    setIsEvaluating(true);
    setEvalError(null);

    const submissionData = task.questions.map((q, i) => {
      const response = answers[i] || '';
      const fillerWords = ['um', 'uh', 'like', 'er', 'ah', 'actually', 'basically'];
      const words = response.toLowerCase().match(/\b\w+\b/g) || [];
      const metrics = (answers as any)[`metrics_${i}`] as SpeakingMetrics | undefined;
      const fillerCount = metrics?.fillerWordCount ?? words.filter(w => fillerWords.includes(w)).length;
      const wordCount = words.length;
      const timeInMinutes = (q.responseTimeSeconds || 45) / 60;
      const wpm = metrics?.wpm !== undefined ? metrics.wpm : (timeInMinutes > 0 ? Math.round(wordCount / timeInMinutes) : 0);
      
      return {
        question: q.question,
        studentResponse: response,
        fillerCount,
        wpm
      };
    });

    const evalStart = Date.now();
    console.log('[Audio Timing] Starting evaluation at', new Date().toISOString());

    let evalData: any = null;

    const combinedResponse = submissionData.map((s) => s.studentResponse).filter(Boolean).join('\n\n');
    const avgWpm = Math.round(
      submissionData.reduce((acc, s) => acc + (s.wpm || 120), 0) / (submissionData.length || 1)
    );
    const totalPauses = submissionData.reduce((acc, _, i) => {
      const m = (answers as any)[`metrics_${i}`] as SpeakingMetrics | undefined;
      return acc + (m?.pauseCount || 0);
    }, 0);
    const maxPause = Math.max(
      ...submissionData.map((_, i) => ((answers as any)[`metrics_${i}`] as SpeakingMetrics | undefined)?.longestPauseSeconds || 0),
      0
    );
    const totalFillers = submissionData.reduce((acc, s) => acc + (s.fillerCount || 0), 0);

    if (!hasAnyStoredApiKey()) {
      // 100% Zero-API Local Rubric Evaluation (Instant)
      evalData = evaluateLocally(
        'speaking-interview',
        {
          title: task.title,
          context: task.context,
          questions: task.questions.map((q) => q.question),
        },
        combinedResponse,
        {
          task,
          wpm: avgWpm,
          pauseCount: totalPauses,
          longestPause: maxPause,
          fillerCount: totalFillers,
        }
      );
    } else {
      try {
        const json = await safeFetchJson('/api/evaluate-response', {
          method: 'POST',
          headers: getApiHeaders(),
          body: JSON.stringify({
            taskType: 'speaking-interview',
            promptData: {
              title: task.title,
              context: task.context,
              questions: task.questions.map((q) => q.question),
            },
            studentResponse: submissionData,
          }),
        });

        if (json.success && json.data) {
          evalData = json.data;
        } else {
          evalData = evaluateLocally(
            'speaking-interview',
            {
              title: task.title,
              context: task.context,
              questions: task.questions.map((q) => q.question),
            },
            combinedResponse,
            { task, wpm: avgWpm, pauseCount: totalPauses, longestPause: maxPause, fillerCount: totalFillers }
          );
        }
      } catch (err: any) {
        console.warn('[SpeakingInterview] Network error, running local rubric evaluator:', err);
        evalData = evaluateLocally(
          'speaking-interview',
          {
            title: task.title,
            context: task.context,
            questions: task.questions.map((q) => q.question),
          },
          combinedResponse,
          { task, wpm: avgWpm, pauseCount: totalPauses, longestPause: maxPause, fillerCount: totalFillers }
        );
      }
    }

    if (evalData) {
      console.log(`[Audio Timing] transcript -> evaluation completed`);
      setEvaluationResult({ ...evalData, submissionData });

      const scaled = evalData.scaledScore || 24;
      const band6 = evalData.bandScore6 ?? (scaled >= 29 ? 6.0 : scaled >= 26 ? 5.5 : scaled >= 23 ? 5.0 : scaled >= 20 ? 4.5 : scaled >= 17 ? 4.0 : 3.5);

      savePracticeRecord({
        taskType: 'speaking-interview',
        taskTitle: task.title,
        section: 'Speaking',
        score: scaled,
        maxScore: 30,
        scaledScore30: scaled,
        bandScore6: band6,
        timeSpentSeconds: 240,
        feedbackSummary: `Speaking Interview: Band ${band6.toFixed(1)}/6.0 · Raw Rubric: ${evalData.rawRubricScore ?? evalData.bandScore}/4.0 (${evalData.performanceLevel})`,
      });

      onComplete?.(scaled);
    }
    setIsEvaluating(false);
  };


  const currentAnswer = answers[currentQIndex] || '';

  return (
    <div className="space-y-6">
      {/* Offline Transcriber Model Modal */}
      <OfflineTranscriberModal
        isOpen={isTranscriberModalOpen}
        onClose={() => setIsTranscriberModalOpen(false)}
        onModelChanged={() => {
          const active = getWhisperModelChoice();
          checkModelCachedStatus(active).then(setIsAnyModelCached);
        }}
      />

      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">{task.title}</h2>
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
            <span>Speaking Section</span>
            <span aria-hidden="true">·</span>
            <span>Take an Interview</span>
            <span aria-hidden="true">·</span>
            <span>4 Questions</span>
            <span aria-hidden="true">·</span>
            <span className="capitalize">{task.level}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setIsTranscriberModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <HardDrive className="w-3.5 h-3.5 text-teal-700" />
            <span>⚙️ Configure / Download Offline Transcriber</span>
          </button>

          {/* Question selector tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg">
            {task.questions.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  stopSimulation();
                  setCurrentQIndex(i);
                }}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  currentQIndex === i
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Q{i + 1}</span>
                {transcribingQuestionIds[i] ? (
                  <Loader2 className="w-3 h-3 animate-spin text-teal-600 shrink-0" />
                ) : answers[i]?.trim() ? (
                  <span className="text-teal-600">✓</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!isAnyModelCached && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-amber-900 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <strong className="font-bold block text-slate-900">Offline Whisper Speech Transcriber Not Downloaded Yet</strong>
              <span>Download model (~75MB / ~245MB) once to enable 100% offline speech recognition without API keys.</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsTranscriberModalOpen(true)}
            className="px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white font-bold rounded-lg transition-colors shrink-0 shadow-2xs"
          >
            Download Model (~75MB / ~245MB)
          </button>
        </div>
      )}

      {/* Headphone echo prevention hint */}
      <div className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 flex items-center gap-2">
        <Headphones className="w-4 h-4 text-teal-700 shrink-0" />
        <span>Tip: Use headphones or a headset to prevent microphone echo and avoid picking up system audio.</span>
      </div>

      {/* Microphone Test Widget */}
      <MicrophoneTestWidget compact />

      {micNotice && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-xs text-amber-900 animate-in fade-in">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong className="font-semibold block mb-0.5">Microphone Notice</strong>
            <span>{micNotice}</span>
          </div>
          <button
            onClick={() => setMicNotice(null)}
            className="text-amber-700 hover:text-amber-900 text-xs font-semibold px-2 py-1 rounded-md hover:bg-amber-100 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Question Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <span className="text-xs font-semibold text-teal-700 uppercase tracking-wider">
              Question {currentQIndex + 1} of {task.questions.length}
            </span>
            <h3 className="text-base sm:text-lg font-semibold text-slate-900 leading-snug">
              {currentQ.question}
            </h3>
          </div>

          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleHearQuestion}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                  isPlayingAudio
                    ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 border-amber-500 font-semibold'
                    : 'text-slate-700 bg-slate-50 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {isPlayingAudio ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Volume2 className="w-3.5 h-3.5 text-teal-700" />}
                {isPlayingAudio ? '⏹ Stop Audio' : 'Hear Question'}
              </button>

              <button
                onClick={handleRestartQuestionAudio}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors whitespace-nowrap"
                title="Restart question audio from beginning"
              >
                <RotateCcw className="w-3 h-3 text-slate-500" />
                <span>Restart</span>
              </button>
            </div>
            {audioError && (
              <div className="text-[11px] text-rose-600 font-mono text-right max-w-sm">
                Audio failure: {audioError}
              </div>
            )}
          </div>
        </div>

        {/* Timing simulation bar */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-xs text-slate-600">
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Prep: <strong className="font-mono text-slate-800">{currentQ.prepTimeSeconds}s</strong></span>
            </div>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <div>
              <span>Response: <strong className="font-mono text-slate-800">{currentQ.responseTimeSeconds}s</strong></span>
            </div>
          </div>

          {timerMode === 'idle' ? (
            <button
              onClick={startSimulation}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5" />
              Start Official Timed Response
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div
                className={`px-3 py-1 text-xs font-mono font-bold rounded-md ${
                  timerMode === 'prep'
                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                    : 'bg-rose-100 text-rose-900 border border-rose-300 animate-pulse'
                }`}
              >
                {timerMode === 'prep' ? `PREPARATION: ${timeLeft}s` : `RECORDING: ${timeLeft}s`}
              </div>

              <button
                onClick={stopSimulation}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
              >
                <Pause className="w-3 h-3" /> Stop
              </button>
            </div>
          )}
        </div>

        {/* Suggested Talking Points Accordion */}
        <div className="border border-slate-100 bg-slate-50/60 rounded-lg p-3 text-xs">
          <span className="font-semibold text-slate-700">Key Points to Address:</span>
          <ul className="list-disc list-inside mt-1 space-y-0.5 text-slate-600">
            {currentQ.suggestedPoints.map((pt, i) => (
              <li key={i}>{pt}</li>
            ))}
          </ul>
        </div>

        {/* Dictation / Input Box */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Your Spoken Response (Transcript):</span>
            <div className="flex items-center gap-2">
              {audioBlobs[currentQIndex] && (
                <>
                  <button
                    type="button"
                    onClick={() => handlePlayUserRecording(currentQIndex)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors shrink-0 cursor-pointer ${
                      playingRecordingQIndex === currentQIndex
                        ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                        : 'border-teal-300 bg-teal-50 text-teal-900 hover:bg-teal-100'
                    }`}
                    title={playingRecordingQIndex === currentQIndex ? 'Click to stop playback' : 'Listen to your exact recorded voice'}
                  >
                    {playingRecordingQIndex === currentQIndex ? (
                      <>
                        <Pause className="w-3.5 h-3.5 fill-current text-slate-950" />
                        <span>⏹ Stop Playback</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 text-teal-700 fill-teal-700" />
                        <span>▶ Hear My Recording</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRetryTranscription(currentQIndex)}
                    disabled={isTranscribing || isRecording}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      transcriptionErrors[currentQIndex]
                        ? 'border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100 font-semibold shadow-xs'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                    title="Retry transcribing this recorded answer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTranscribing ? 'animate-spin text-teal-600' : 'text-slate-600'}`} />
                    <span>Retry transcription</span>
                  </button>
                </>
              )}
              <button
                onClick={handleManualMicToggle}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                  isRecording
                    ? 'bg-rose-600 text-white border-rose-600 animate-pulse'
                    : isTranscribing
                    ? 'bg-slate-100 text-slate-600 border-slate-300'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {isRecording ? (
                  <>
                    <MicOff className="w-3.5 h-3.5" />
                    <span>Stop Speaking</span>
                  </>
                ) : isTranscribing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
                    <span>Transcribing... {transcribeSeconds}s</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-3.5 h-3.5 text-rose-500" />
                    <span>Dictate with Mic</span>
                  </>
                )}
              </button>
              
              <div className="flex items-center gap-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg px-2 py-1 bg-white">
                <input
                  type="checkbox"
                  id="autostart"
                  checked={autoStart}
                  onChange={(e) => setAutoStart(e.target.checked)}
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
                <label htmlFor="autostart">Auto-start on sound</label>
              </div>
            </div>
          </div>

          {/* Live input-level meter using AnalyserNode and recording timer */}
          {isRecording && (
            <div className="flex items-center justify-between gap-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-2.5 rounded-lg flex-wrap animate-in fade-in shadow-xs">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5 items-center justify-center shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600"></span>
                </span>
                <span className="font-bold text-rose-900">Recording Active</span>
                <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded font-mono font-bold text-[11px]">
                  {timerMode === 'speaking'
                    ? `${Math.floor((currentQ.responseTimeSeconds - timeLeft) / 60)}:${String((currentQ.responseTimeSeconds - timeLeft) % 60).padStart(2, '0')} / ${Math.floor(currentQ.responseTimeSeconds / 60)}:${String(currentQ.responseTimeSeconds % 60).padStart(2, '0')}`
                    : `${Math.floor(recordingSeconds / 60)}:${String(recordingSeconds % 60).padStart(2, '0')}`}
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-600">Capturing audio. Speak clearly into your mic.</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] font-semibold text-slate-700">Mic Pulse:</span>
                <div className="w-24 h-2.5 bg-slate-200 rounded-full overflow-hidden p-0.5 border border-slate-300">
                  <div
                    className={`h-full rounded-full transition-all duration-75 ${
                      audioLevel > 15 ? 'bg-emerald-500' : audioLevel > 5 ? 'bg-teal-500' : 'bg-slate-400'
                    }`}
                    style={{ width: `${Math.max(6, Math.min(100, audioLevel))}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono font-semibold text-slate-600 w-8 text-right">{audioLevel}%</span>
              </div>
            </div>
          )}

          <textarea
            rows={4}
            value={currentAnswer}
            disabled={isTranscribing}
            onChange={(e) =>
              setAnswers((prev) => ({
                ...prev,
                [currentQIndex]: e.target.value,
              }))
            }
            placeholder={
              isRecording
                ? 'Listening to your speech...'
                : isTranscribing
                ? `Processing & transcribing voice recording... ${transcribeSeconds}s`
                : 'Your spoken response will appear here as you speak. You can also edit or type manually...'
            }
            className={`w-full p-3.5 text-sm rounded-lg text-slate-900 outline-hidden leading-relaxed transition-colors ${
              isRecording
                ? 'bg-rose-50/40 border border-rose-300 focus:ring-2 focus:ring-rose-200'
                : 'bg-slate-50 border border-slate-300 focus:bg-white focus:border-teal-600 focus:ring-2 focus:ring-teal-100'
            }`}
          />
          
          {/* Post-answer metrics */}
          {currentAnswer.trim() && !isRecording && !isTranscribing && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3 text-xs bg-white border border-slate-200 p-3 rounded-lg text-slate-600">
                {(() => {
                  const metrics = (answers as any)[`metrics_${currentQIndex}`] as SpeakingMetrics | undefined;
                  const words = currentAnswer.toLowerCase().match(/\b\w+\b/g) || [];
                  const wordCount = words.length;
                  const timeInMinutes = (currentQ.responseTimeSeconds || 45) / 60;
                  const wpm = metrics?.wpm !== undefined ? metrics.wpm : (timeInMinutes > 0 ? Math.round(wordCount / timeInMinutes) : 0);

                  const detectedMatches = currentAnswer.match(/\[(um|uh)\]|\b(um+|uh+|er+|erm+|ah+|hmm+|like|you know)\b/gi) || [];
                  const fillerCount = metrics?.fillerCount ?? metrics?.fillerWordCount ?? detectedMatches.length;
                  const fillerList = metrics?.fillerWords || Array.from(new Set(detectedMatches.map((f) => f.replace(/[\[\]]/g, ''))));

                  return (
                    <>
                      <div>WPM: <span className="font-mono font-bold text-teal-700">{wpm}</span></div>
                      {metrics?.longestPauseSeconds ? (
                        <div>Longest Pause: <span className="font-mono font-bold text-slate-700">{metrics.longestPauseSeconds}s</span></div>
                      ) : null}

                      {/* ALWAYS Display Filler Badge */}
                      {fillerCount === 0 ? (
                        <div className="text-[11px] font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          0 fillers ✓
                        </div>
                      ) : (
                        <div className="text-[11px] font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                          ⚠️ {fillerCount} filler{fillerCount > 1 ? 's' : ''} ({fillerList.join(', ')})
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Fluency Coaching Tip Banner */}
              {(() => {
                const metrics = (answers as any)[`metrics_${currentQIndex}`] as SpeakingMetrics | undefined;
                const detectedMatches = currentAnswer.match(/\[(um|uh)\]|\b(um+|uh+|er+|erm+|ah+|hmm+|like|you know)\b/gi) || [];
                const fillerCount = metrics?.fillerCount ?? metrics?.fillerWordCount ?? detectedMatches.length;
                const fillerList = metrics?.fillerWords || Array.from(new Set(detectedMatches.map((f) => f.replace(/[\[\]]/g, ''))));

                if (fillerCount >= 1) {
                  return (
                    <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900 flex items-start gap-2.5 animate-in fade-in shadow-2xs">
                      <span className="text-base shrink-0">💡</span>
                      <div>
                        <strong className="font-bold block text-amber-950">Fluency Coaching Tip:</strong>
                        <span>
                          You used <strong>{fillerCount} filler word(s)</strong> ({fillerList.join(', ')}). We recommend using fewer filler words—on the TOEFL iBT Speaking section, frequent <em>"ums"</em> and <em>"uhs"</em> reduce your Delivery score. Try replacing <em>"um"</em> or <em>"uh"</em> with a brief silent pause while thinking of your next word!
                        </span>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Global Evaluation Trigger */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">TOEFL Speaking Diagnostic Evaluation</h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Submit your responses across the 4 interview questions to receive official ETS rubric scores, grammar corrections, and an exemplar response.
          </p>
        </div>

        <button
          onClick={handleEvaluateAI}
          disabled={isEvaluating}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {isEvaluating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Scoring your answer... {evalSeconds}s</span>
            </>
          ) : !hasAnyStoredApiKey() ? (
            <>
              <Zap className="w-4 h-4 text-amber-300" />
              <span>Evaluate Interview (Instant Local Grader)</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Get AI Rater Feedback</span>
            </>
          )}
        </button>
      </div>


      {evalError && (
        (evalError.toLowerCase().includes('no api key') ||
         evalError.toLowerCase().includes('invalid api key') ||
         evalError.toLowerCase().includes('api key not valid') ||
         evalError.toLowerCase().includes('add yours in dashboard') ||
         evalError.toLowerCase().includes('settings & api key')) ? (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-amber-900">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Add your free API key to use AI features</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
              {onOpenApiKeySettings && (
                <button
                  onClick={onOpenApiKeySettings}
                  className="px-3 py-1.5 bg-teal-800 hover:bg-teal-900 text-white font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Configure API Key
                </button>
              )}
              <span className="text-slate-500 font-medium">Supports Gemini, NVIDIA, Groq, OpenRouter, and custom keys</span>
            </div>
          </div>
        ) : (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-center gap-3 text-xs text-rose-800">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{evalError}</span>
          </div>
        )
      )}

      {/* AI Evaluation Diagnostic Card */}
      {evaluationResult && (
        <div className="bg-white border border-teal-200 rounded-xl p-6 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-teal-700">Official ETS Rater Assessment</span>
                <span className="text-xs text-slate-400">·</span>
                <span className="text-xs font-medium text-slate-600">{evaluationResult.performanceLevel}</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mt-1">Speaking Interview Evaluation Report</h3>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="bg-teal-50 border border-teal-200 px-3 py-1.5 rounded-lg text-center">
                <div className="text-[10px] text-teal-700 font-semibold uppercase tracking-wider">TOEFL Band (1-6)</div>
                <div className="text-base font-mono font-bold text-teal-900">
                  Band {(evaluationResult.bandScore6 ?? (evaluationResult.scaledScore >= 29 ? 6.0 : evaluationResult.scaledScore >= 26 ? 5.5 : evaluationResult.scaledScore >= 23 ? 5.0 : evaluationResult.scaledScore >= 20 ? 4.5 : 4.0)).toFixed(1)} / 6.0
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-center">
                <div className="text-[10px] text-slate-500 font-medium">Task Rubric</div>
                <div className="text-base font-mono font-bold text-slate-800">
                  {evaluationResult.rawRubricScore ?? evaluationResult.bandScore} / 4.0
                </div>
              </div>
              <div className="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-center">
                <div className="text-[10px] text-slate-300 font-medium">Scaled Score</div>
                <div className="text-base font-mono font-bold text-teal-400">
                  {evaluationResult.scaledScore} / 30
                </div>
              </div>
            </div>
          </div>

          {evaluationResult.notice && (
            <div className="flex items-center gap-2 p-2.5 bg-blue-50/80 border border-blue-200 text-blue-900 rounded-lg text-xs font-medium">
              <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
              <span>{evaluationResult.notice}</span>
            </div>
          )}

          {evaluationResult.subScores && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-center shadow-2xs">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Task Fulfillment</span>
                <div className="text-sm font-bold text-teal-900 mt-0.5">{evaluationResult.subScores.taskFulfillment.toFixed(1)} / 6.0</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-center shadow-2xs">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Language Use</span>
                <div className="text-sm font-bold text-teal-900 mt-0.5">{evaluationResult.subScores.languageUse.toFixed(1)} / 6.0</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-center shadow-2xs">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Topic Development</span>
                <div className="text-sm font-bold text-teal-900 mt-0.5">{evaluationResult.subScores.topicDevelopment.toFixed(1)} / 6.0</div>
              </div>
            </div>
          )}

          <div className="text-sm text-slate-700 bg-slate-50 p-4 rounded-lg leading-relaxed">
            {evaluationResult.summary}
          </div>

          {/* Criteria Grid */}
          {evaluationResult.criteria && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {evaluationResult.criteria.map((crit: any, i: number) => (
                <div key={i} className="border border-slate-200 rounded-lg p-3.5 bg-white">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-900">{crit.name}</span>
                    <span className="text-xs font-mono font-bold text-teal-800">{crit.score}</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-snug">{crit.comment}</p>
                </div>
              ))}
            </div>
          )}

          {/* Metrics per Question */}
          {evaluationResult.submissionData && (
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700">Speaking Analytics</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {evaluationResult.submissionData.map((sub: any, i: number) => (
                  <div key={i} className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
                    <div className="font-semibold text-slate-800 mb-1">Q{i+1}: {sub.question.substring(0, 30)}...</div>
                    <div className="flex gap-4 text-slate-600">
                      <div>Fillers: <span className="font-mono font-bold text-amber-700">{sub.fillerCount}</span></div>
                      <div>WPM: <span className="font-mono font-bold text-teal-700">{sub.wpm}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Grammar & Language Corrections */}
          {evaluationResult.corrections && evaluationResult.corrections.length > 0 && (
            <div className="space-y-2.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                Key Language &amp; Syntax Improvements
              </h4>
              <div className="space-y-2">
                {evaluationResult.corrections.map((corr: any, i: number) => (
                  <div key={i} className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-lg text-xs space-y-1">
                    <div className="text-slate-700">
                      <span className="text-rose-700 line-through mr-2">"{corr.original}"</span>
                      <strong className="text-emerald-800">→ "{corr.corrected}"</strong>
                    </div>
                    <div className="text-slate-500 italic">{corr.explanation}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top 2 Actionable Fixes */}
          {evaluationResult.topFixes && evaluationResult.topFixes.length > 0 && (
            <div className="bg-amber-50/70 border border-amber-200/90 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-600 text-[11px] font-bold text-white">
                  ★
                </span>
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                  Top 2 Actionable Fixes (Priority For Next Band)
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {evaluationResult.topFixes.slice(0, 2).map((fix: string, idx: number) => (
                  <div key={idx} className="bg-white border border-amber-200 rounded-lg p-3 text-xs text-slate-800 flex items-start gap-2.5 shadow-2xs">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800 font-bold text-xs mt-0.5">
                      {idx + 1}
                    </span>
                    <span className="leading-snug">{fix.replace(/^[0-9]+[.)]\s*/, '')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* High-Scoring Model Response / Model Band 6.0 Rewrite */}
          {Boolean(evaluationResult.modelBand6Rewrite || evaluationResult.exemplar || (task as any).modelResponse || (task as any).sampleAnswer) && (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-teal-800 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-teal-600" />
                  Model Band 6.0 Exemplar (ETS Benchmark)
                </h4>
                <span className="text-[10px] text-teal-700 font-medium bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                  Target Exemplar
                </span>
              </div>
              <div className="bg-teal-50/50 border border-teal-200/70 p-4 rounded-lg text-xs sm:text-sm text-teal-950 leading-relaxed font-normal whitespace-pre-line">
                {evaluationResult.modelBand6Rewrite || evaluationResult.exemplar || (task as any).modelResponse || (task as any).sampleAnswer}
              </div>
            </div>
          )}

          {/* Interactive Band 6.0 Benchmark Accordion */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
            <button
              type="button"
              onClick={() => setIsBenchmarkOpen(!isBenchmarkOpen)}
              className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-teal-700" />
                <span className="text-xs font-bold text-slate-800">
                  Compare with Band 6.0 Benchmark: Rhetorical Devices &amp; Transitions
                </span>
              </div>
              {isBenchmarkOpen ? (
                <ChevronUp className="w-4 h-4 text-slate-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-500" />
              )}
            </button>

            {isBenchmarkOpen && (
              <div className="p-4 space-y-3.5 text-xs text-slate-700 border-t border-slate-200 bg-white">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
                    <span className="font-bold text-slate-900 block flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                      Key Rhetorical Devices
                    </span>
                    <ul className="list-disc list-inside space-y-1 text-slate-600">
                      {(evaluationResult.benchmarkAnalysis?.rhetoricalDevices || [
                        'Nuanced concession acknowledging counterarguments before asserting position',
                        'Direct thesis statement with clear causal connectors',
                        'Specific academic exemplification avoiding generic assertions',
                      ]).map((dev: string, i: number) => (
                        <li key={i}>{dev}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-teal-50/60 p-3 rounded-lg border border-teal-200 space-y-1.5">
                    <span className="font-bold text-teal-950 block flex items-center gap-1.5">
                      <Award className="w-3.5 h-3.5 text-teal-700" />
                      Why This Achieves Band 6.0
                    </span>
                    <p className="text-teal-900 leading-relaxed">
                      {evaluationResult.benchmarkAnalysis?.whyBand6 ||
                        'Demonstrates continuous vocal fluency, sophisticated discourse connectors, balanced sentence rhythm, and immediate topic resolution without acoustic hesitation.'}
                    </p>
                  </div>
                </div>

                <div className="pt-1 text-[11px] text-slate-500 flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 bg-teal-100 border border-teal-300 rounded-xs"></span>
                  <span>Evaluated against ETS TOEFL iBT Speaking Rubric standard descriptors.</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {onNextTask && (
        <div className="pt-2 flex justify-end">
          <button
            onClick={onNextTask}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Next Interview Set
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
