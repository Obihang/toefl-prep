import { pickSingleVoice, inferGender, pickBrowserVoiceForGender, parseDialogueLine, detectSpeakerGender, assignTaskSpeakerVoices } from '../../utils/voices';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { markUserAiRequest } from '../../utils/userActivity';
import { SpeakingInterviewTask, InterviewQuestionItem } from '../../data/curatedQuestions';
import { Volume2, Mic, MicOff, Play, Pause, Sparkles, AlertCircle, ArrowRight, Clock, Loader2, Headphones, RefreshCw, RotateCcw, Award, BookOpen, CheckCircle2, ChevronDown, ChevronUp, Zap, HardDrive } from 'lucide-react';
import { OfflineTranscriberModal } from '../shared/OfflineTranscriberModal';
import { checkModelCachedStatus, getWhisperModelChoice } from '../../utils/localWhisperStt';
import { speakScriptLine, speakWithCloudTTS, chunkTextForTTS, fetchCloudTtsAudio, stopSpeaking, createVoiceSession, VoiceSession, playChime, transcribeAudioBlob, prefetchSpeechAudio, playAudioBlob, stripSpeakerAndFormatting, pickRandomVoice, inferGenderFromSpeaker } from '../../utils/audioSpeech';
import { calculateSpeakingMetrics, SpeakingMetrics } from '../../utils/speakingMetrics';
import { savePracticeRecord } from '../../utils/scoreTracker';
import { getApiHeaders, hasAnyStoredApiKey } from '../../utils/apiKey';
import { safeFetchJson } from '../../utils/apiHelper';
import { evaluateLocally, mergeAiAndLocalEvaluation } from '../../utils/localEvaluator';
import { MicrophoneTestWidget } from '../shared/MicrophoneTestWidget';
import { SpeakingControls } from '../views/speaking/SpeakingControls';
import { SpeakingEvaluationCard } from '../views/speaking/SpeakingEvaluationCard';

interface Props {
  task: SpeakingInterviewTask;
  onNextTask?: () => void;
  onComplete?: (result: any) => void;
  onOpenApiKeySettings?: () => void;
  localGraderLabel?: string;
  aiGraderLabel?: string;
  apiKeyPromptText?: string;
  keyboardShortcutHint?: string;
  activeCardHighlightClass?: string;
}


export const SpeakingInterviewView: React.FC<Props> = ({
  task,
  onNextTask,
  onComplete,
  onOpenApiKeySettings,
  keyboardShortcutHint = '⌨️ Enter: Stop Recording & Transcribe',
}) => {
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [step, setStep] = useState<'idle' | 'prep' | 'speaking' | 'done'>('idle');
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
  const [showMicTest, setShowMicTest] = useState(false);

  const blobsRef = useRef<Record<number, Blob>>({});
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const hasCompletedRef = useRef<boolean>(false);

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

  const draftStorageKey = `toefl_draft_speaking_interview_${task.id || task.title}`;

  // Reset completion guard & blobs on mount or task change, and restore saved draft transcripts
  useEffect(() => {
    hasCompletedRef.current = false;
    blobsRef.current = {};
    setStep('idle');
    setEvaluationResult(null);
    setEvalError(null);
    try {
      const rawDraft = localStorage.getItem(draftStorageKey);
      if (rawDraft) {
        const parsed = JSON.parse(rawDraft);
        if (parsed && typeof parsed === 'object') {
          setAnswers(parsed);
          return;
        }
      }
    } catch {}
    setAnswers({});
  }, [task.id, task.title]);

  useEffect(() => {
    try {
      localStorage.setItem(draftStorageKey, JSON.stringify(answers));
    } catch {}
  }, [draftStorageKey, answers]);

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

  const interviewerName = (task as any).interviewerName || 'Interviewer';
  const interviewerVoiceInfo = useMemo(() => {
    const explicitGender = (task as any).interviewerGender;
    const inferred =
      explicitGender === 'male' || explicitGender === 'female'
        ? explicitGender
        : inferGenderFromSpeaker(`${interviewerName} ${task.context || ''}`);
    return pickRandomVoice(inferred || undefined);
  }, [task.id, task.title, interviewerName]);

  const interviewerGender = interviewerVoiceInfo.gender;
  const interviewerVoice = interviewerVoiceInfo.voiceId;

  // Silent background pre-synthesis of interviewer questions using the SAME single interviewer voice
  useEffect(() => {
    if (!task?.questions || task.questions.length === 0) return;
    let cancelled = false;

    const firstQ = task.questions[0]?.question;
    if (firstQ) {
      const firstChunks = chunkTextForTTS(firstQ);
      if (firstChunks.length > 0) {
        fetchCloudTtsAudio(firstChunks[0], interviewerGender, interviewerVoice).catch(() => {});
      }
    }

    (async () => {
      for (const q of task.questions) {
        if (cancelled) break;
        await prefetchSpeechAudio(q.question, interviewerVoice, interviewerGender).catch(() => {});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [task.id, task.title, interviewerVoice, interviewerGender]);

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

  const playQuestionAudio = async (itemKey: string, qIdx: number = currentQIndex) => {
    stopAllAudio();
    activePlayingKeyRef.current = itemKey;
    setIsPlayingAudio(true);
    setAudioError(null);
    const targetQ = task.questions[qIdx] || currentQ;
    const parsed = parseDialogueLine(targetQ.question);
    const cleanQ = parsed.spokenText || stripSpeakerAndFormatting(targetQ.question);
    const effGender = interviewerGender;
    const voice = interviewerVoice;

    // Pre-warm next question's first chunk in parallel if available
    const nextQ = task.questions[qIdx + 1]?.question;
    if (nextQ) {
      const nextChunks = chunkTextForTTS(nextQ);
      if (nextChunks.length > 0) {
        fetchCloudTtsAudio(nextChunks[0], effGender, voice).catch(() => {});
      }
    }

    try {
      await speakWithCloudTTS(
        cleanQ,
        effGender,
        {
          rate: 0.95,
          voice,
          voiceName: voice,
          gender: effGender,
          onEnd: () => {
            if (activePlayingKeyRef.current === itemKey) activePlayingKeyRef.current = null;
            setIsPlayingAudio(false);
          },
          onError: (err) => {
            if (activePlayingKeyRef.current === itemKey) activePlayingKeyRef.current = null;
            setIsPlayingAudio(false);
            setAudioError(err?.message || String(err));
          },
        },
        voice
      );
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
    await playQuestionAudio(itemKey, currentQIndex);
  };

  const handleRestartQuestionAudio = async () => {
    stopAllAudio();
    const itemKey = `question_${currentQIndex}`;
    await playQuestionAudio(itemKey, currentQIndex);
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

  const stopCurrentRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
  };

  const stopSpeechRecognition = () => {
    if (voiceSessionRef.current) {
      stopSimulation();
    }
  };

  const advanceStep = () => {
    const isActivelyRecording =
      mediaRecorderRef.current?.state === 'recording' || Boolean(voiceSessionRef.current);

    if (currentQIndex >= 3) {
      stopCurrentRecording();
      stopSpeechRecognition();
      setStep('done');
      if (!isActivelyRecording && !hasCompletedRef.current) {
        hasCompletedRef.current = true;
        onComplete?.({ blobs: { ...blobsRef.current }, answers });
      }
      return;
    }

    stopCurrentRecording();
    stopSpeechRecognition();
    setCurrentQIndex((prev) => prev + 1);
  };

  // Start Official TOEFL Test Simulation for current question
  const startSimulation = (qIdx: number = currentQIndex) => {
    if (qIdx === 0) {
      hasCompletedRef.current = false;
    }
    clearInterval(timerIntervalRef.current);
    if (voiceSessionRef.current) {
      voiceSessionRef.current.abort();
      voiceSessionRef.current = null;
    }
    setIsRecording(false);
    setAudioLevel(0);
    setMicNotice(null);

    // 1. 2-Second Transition ("Get ready to speak...") before 45-second recording begins
    setStep('prep');
    setTimerMode('prep');
    setTimeLeft(2);
    playChime(660, 250);

    let currentSeconds = 2;

    timerIntervalRef.current = setInterval(() => {
      currentSeconds--;
      setTimeLeft(currentSeconds);

      if (currentSeconds <= 0) {
        clearInterval(timerIntervalRef.current);
        startSpeakingPhase(qIdx);
      }
    }, 1000);
  };

  const startSpeakingPhase = async (qIdx: number = currentQIndex) => {
    const targetQ = task.questions[qIdx] || currentQ;
    setStep('speaking');
    setTimerMode('speaking');
    setTimeLeft(targetQ.responseTimeSeconds);
    playChime(880, 400);

    const qIndex = qIdx;
    const session = createVoiceSession({
      onTranscriptUpdate: (transcript) => {
        setAnswers((prev) => ({
          ...prev,
          [qIndex]: transcript,
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

    let speakingSeconds = targetQ.responseTimeSeconds;
    timerIntervalRef.current = setInterval(async () => {
      speakingSeconds--;
      setTimeLeft(speakingSeconds);

      if (speakingSeconds <= 0) {
        clearInterval(timerIntervalRef.current);
        await stopSimulation(qIndex);
      }
    }, 1000);
  };

  const stopSimulation = async (explicitQIndex?: number) => {
    clearInterval(timerIntervalRef.current);
    const qIndex = explicitQIndex !== undefined ? explicitQIndex : currentQIndex;
    if (voiceSessionRef.current) {
      const activeSession = voiceSessionRef.current;
      voiceSessionRef.current = null;
      setIsTranscribing(true);
      try {
        const result = await activeSession.stop();
        if (result.transcript) {
          setAnswers((prev) => ({
            ...prev,
            [qIndex]: result.transcript,
          }));
          setTranscriptionErrors((prev) => ({ ...prev, [qIndex]: null }));
        }
        if (result.error) {
          setTranscriptionErrors((prev) => ({ ...prev, [qIndex]: result.error! }));
        }
        if (result.audioBlob) {
          blobsRef.current[qIndex] = result.audioBlob;
          setAudioBlobs((prev) => ({
            ...prev,
            [qIndex]: result.audioBlob!,
          }));
          if (!result.error && !result.transcript) {
            startBackgroundTranscriptionIfNeeded(qIndex, result.audioBlob, result.transcript);
          }
        }
      } catch (err: any) {
        console.warn('Voice session stop error:', err);
      } finally {
        setIsTranscribing(false);
        setAudioLevel(0);
      }
    }
    setIsRecording(false);
    setAudioLevel(0);
    setTimerMode('idle');
    playChime(440, 500);

    // If auto-sequence mode is enabled, automatically advance to the next question and play its prompt
    if (autoStart && qIndex + 1 < task.questions.length) {
      const nextIdx = qIndex + 1;
      setCurrentQIndex(nextIdx);
      setTimeout(() => {
        document.getElementById(`interview-question-${nextIdx}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
        playQuestionAudio(`question_${nextIdx}`, nextIdx).then(() => {
          startSimulation(nextIdx);
        }).catch(() => {});
      }, 600);
    } else if (qIndex >= task.questions.length - 1 && !hasCompletedRef.current) {
      hasCompletedRef.current = true;
      setStep('done');
      onComplete?.({ blobs: { ...blobsRef.current }, answers });
      if (autoStart) {
        setTimeout(() => {
          handleEvaluateAI(hasAnyStoredApiKey() ? 'ai' : 'local');
        }, 300);
      } else {
        setTimeout(() => {
          document.getElementById('interview-evaluation-result')?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
        }, 200);
      }
    }
  };

  const handlePlayUserRecording = (qIndex: number) => {
    const itemKey = `user_rec_${qIndex}`;
    const wasPlayingThis = activePlayingKeyRef.current === itemKey;
    stopAllAudio();
    if (wasPlayingThis) {
      return;
    }

    const blob = audioBlobs[qIndex] || blobsRef.current[qIndex];
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
    const qIndex = currentQIndex;

    if (isRecording && voiceSessionRef.current) {
      const activeSession = voiceSessionRef.current;
      voiceSessionRef.current = null;
      setIsTranscribing(true);
      try {
        const result = await activeSession.stop();
        if (result.transcript) {
          setAnswers((prev) => ({
            ...prev,
            [qIndex]: result.transcript,
          }));
          setTranscriptionErrors((prev) => ({ ...prev, [qIndex]: null }));
        }
        if (result.error) {
          setTranscriptionErrors((prev) => ({ ...prev, [qIndex]: result.error! }));
        }
        if (result.audioBlob) {
          blobsRef.current[qIndex] = result.audioBlob;
          setAudioBlobs((prev) => ({
            ...prev,
            [qIndex]: result.audioBlob!,
          }));
          if (!result.error && !result.transcript) {
            startBackgroundTranscriptionIfNeeded(qIndex, result.audioBlob, result.transcript);
          }
        }
      } catch (err: any) {
        setMicNotice(err.message || 'Failed to process voice recording');
      } finally {
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

  const handleEvaluateAI = async (mode: 'local' | 'ai' = hasAnyStoredApiKey() ? 'ai' : 'local') => {
    if (mode === 'ai') {
      markUserAiRequest();
    }
    if (voiceSessionRef.current) {
      await stopSimulation();
    }
    // Wait for any running background transcriptions to finish first
    const pending = Object.values(pendingTranscriptionsRef.current);
    if (pending.length > 0) {
      setIsTranscribing(true);
      try {
        await Promise.all(pending);
      } catch {}
      setIsTranscribing(false);
    }

    const hasAnyAnswer = Object.values(answers).some((a) => typeof a === 'string' && a.trim().length > 0);
    if (!hasAnyAnswer) {
      setEvalError('Please provide a spoken or typed response to at least one question before requesting evaluation.');
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

    console.log('[Audio Timing] Starting evaluation at', new Date().toISOString());

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

    const localBaseline = evaluateLocally(
      'speaking-interview',
      {
        title: task.title,
        context: task.context,
        questions: task.questions.map((q) => q.question),
      },
      submissionData,
      {
        task,
        submissionData,
        wpm: avgWpm,
        pauseCount: totalPauses,
        longestPause: maxPause,
        fillerCount: totalFillers,
      }
    );

    let evalData: any = null;

    if (mode === 'local' || !hasAnyStoredApiKey()) {
      // 100% Zero-API Local Rubric Evaluation (Instant)
      evalData = localBaseline;
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
          evalData = mergeAiAndLocalEvaluation(json.data, localBaseline);
        } else {
          evalData = localBaseline;
        }
      } catch (err: any) {
        console.warn('[SpeakingInterview] Network error, running local rubric evaluator:', err);
        evalData = localBaseline;
      }
    }

    if (evalData) {
      console.log(`[Audio Timing] transcript -> evaluation completed`);
      setEvaluationResult({ ...evalData, submissionData });

      const scaled = evalData.scaledScore || 24;
      const band6 = evalData.bandScore6 ?? (scaled >= 29 ? 6.0 : scaled >= 26 ? 5.5 : scaled >= 23 ? 5.0 : scaled >= 20 ? 4.5 : scaled >= 17 ? 4.0 : 3.5);

      const formattedTranscript = submissionData
        .map((s, idx) => `Q${idx + 1}: ${s.question}\nResponse: ${s.studentResponse?.trim() || '(No response recorded)'}`)
        .join('\n\n');

      savePracticeRecord({
        taskType: 'speaking-interview',
        taskTitle: task.title,
        section: 'Speaking',
        score: scaled,
        maxScore: 30,
        scaledScore30: scaled,
        bandScore6: band6,
        timeSpentSeconds: 240,
        studentResponse: formattedTranscript,
        feedbackSummary:
          evalData.summary ||
          `Speaking Interview: Band ${band6.toFixed(1)}/6.0 · Raw Rubric: ${evalData.rawRubricScore ?? evalData.bandScore}/4.0 (${evalData.performanceLevel})`,
        grammarErrors: Array.isArray(evalData.corrections)
          ? evalData.corrections
          : Array.isArray(evalData.grammarErrors)
          ? evalData.grammarErrors
          : [],
        modelAnswer: evalData.modelBand6Rewrite || evalData.exemplar || '',
      });

      if (!hasCompletedRef.current) {
        hasCompletedRef.current = true;
        onComplete?.(scaled);
      }
    }
    setIsEvaluating(false);
  };


  // Press Enter while recording to immediately stop recording and trigger transcription
  const stopSimulationRef = useRef(stopSimulation);
  stopSimulationRef.current = stopSimulation;
  const handleManualMicToggleRef = useRef(handleManualMicToggle);
  handleManualMicToggleRef.current = handleManualMicToggle;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && isRecording) {
        e.preventDefault();
        e.stopPropagation();
        if (timerMode === 'speaking') {
          stopSimulationRef.current(currentQIndex);
        } else {
          handleManualMicToggleRef.current();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isRecording, timerMode, currentQIndex]);

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
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 flex-wrap">
            <span>Speaking Section</span>
            <span aria-hidden="true">·</span>
            <span>Take an Interview</span>
            <span aria-hidden="true">·</span>
            <span>{((task as any).source === 'ai') ? `✨ Generated by @${(task as any).generatedBy || 'Scholar'}` : '📚 Curated Bank'}</span>
            <span aria-hidden="true">·</span>
            <span>4 Questions</span>
            <span aria-hidden="true">·</span>
            <span className="capitalize">{task.level}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg whitespace-nowrap">
            {keyboardShortcutHint}
          </span>

          <button
            type="button"
            onClick={() => setShowMicTest(prev => !prev)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Mic className="w-3.5 h-3.5 text-teal-700" />
            <span>{showMicTest ? 'Hide Mic Test' : '🎙 Test Mic'}</span>
          </button>

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

      {showMicTest && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <MicrophoneTestWidget compact={true} />
        </div>
      )}

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

      {/* Unified Top-Level Auto-Sequence & Auto-Start Mic Control Bar */}
      <div className="bg-teal-50/70 border border-teal-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <label
            htmlFor="speaking-interview-global-autostart"
            className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer select-none bg-white border border-teal-200 px-3 py-1.5 rounded-lg shadow-2xs"
          >
            <input
              type="checkbox"
              id="speaking-interview-global-autostart"
              checked={autoStart}
              onChange={(e) => setAutoStart(e.target.checked)}
              className="rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
            />
            <span>Auto-Flow (Q1 → Q{task.questions.length})</span>
          </label>
          <span className="text-[11px] text-slate-600">
            Plays question → 2s prep → records response → advances automatically through all {task.questions.length} questions.
          </span>
        </div>

        <button
          type="button"
          onClick={async () => {
            setAutoStart(true);
            stopSimulation(0);
            setCurrentQIndex(0);
            await playQuestionAudio('question_0', 0);
            startSimulation(0);
          }}
          disabled={timerMode !== 'idle' || isPlayingAudio}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-2xs"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Start Practice (Auto-Flow)</span>
        </button>
      </div>

      {/* Headphone echo prevention hint */}
      <div className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 flex items-center gap-2">
        <Headphones className="w-4 h-4 text-teal-700 shrink-0" />
        <span>Tip: Use headphones or a headset to prevent microphone echo and avoid picking up system audio.</span>
      </div>


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
        <SpeakingControls
          currentQIndex={currentQIndex}
          totalQuestions={task.questions.length}
          currentQ={currentQ}
          isPlayingAudio={isPlayingAudio}
          audioError={audioError}
          onHearQuestion={handleHearQuestion}
          onRestartQuestionAudio={handleRestartQuestionAudio}
          timerMode={timerMode}
          timeLeft={timeLeft}
          onStartSimulation={startSimulation}
          onStopSimulation={stopSimulation}
          hasRecording={Boolean(audioBlobs[currentQIndex])}
          isPlayingRecording={playingRecordingQIndex === currentQIndex}
          onPlayUserRecording={() => handlePlayUserRecording(currentQIndex)}
          onRetryTranscription={() => handleRetryTranscription(currentQIndex)}
          isTranscribing={isTranscribing}
          transcriptionError={transcriptionErrors[currentQIndex]}
          isRecording={isRecording}
          transcribeSeconds={transcribeSeconds}
          onManualMicToggle={handleManualMicToggle}
          autoStart={autoStart}
          onSetAutoStart={setAutoStart}
          audioLevel={audioLevel}
          recordingSeconds={recordingSeconds}
        />

        <div className="space-y-2">
          <textarea
            rows={4}
            value={currentAnswer}
            disabled={isTranscribing}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            autoComplete="off"
            data-gramm="false"
            data-gramm_editor="false"
            data-enable-grammarly="false"
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

                  const detectedMatches = currentAnswer.match(/\[(um|uh|er)\]|\b(um+|uh+|er+|erm+|ah+|hmm+|like|you know)\b/gi) || [];
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
                const detectedMatches = currentAnswer.match(/\[(um|uh|er)\]|\b(um+|uh+|er+|erm+|ah+|hmm+|like|you know)\b/gi) || [];
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
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-slate-900">TOEFL Speaking Diagnostic Evaluation</h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Submit your responses across the 4 interview questions to receive official ETS rubric scores, grammar corrections, and an exemplar response.
          </p>
          {!hasAnyStoredApiKey() && onOpenApiKeySettings && (
            <button
              type="button"
              onClick={onOpenApiKeySettings}
              className="text-[11px] text-teal-700 hover:text-teal-900 underline font-medium cursor-pointer"
            >
              Want deeper semantic AI grading? Add a free Groq/Gemini key in Settings
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {hasAnyStoredApiKey() ? (
            <>
              <button
                type="button"
                onClick={() => handleEvaluateAI('local')}
                disabled={isEvaluating}
                className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="Grade instantly in 0ms using deterministic local rubric and mechanics scanner"
              >
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span>⚡ Instant Local Grader</span>
              </button>
              <button
                type="button"
                onClick={() => handleEvaluateAI('ai')}
                disabled={isEvaluating}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isEvaluating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Scoring your answer... {evalSeconds}s</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-teal-200" />
                    <span>✨ Deep AI Grader</span>
                  </>
                )}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => handleEvaluateAI('local')}
              disabled={isEvaluating}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isEvaluating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Scoring your answer... {evalSeconds}s</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 text-amber-300" />
                  <span>Evaluate Interview (Instant Local Grader)</span>
                </>
              )}
            </button>
          )}
        </div>
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
      <div id="interview-evaluation-result">
        <SpeakingEvaluationCard
          evaluationResult={evaluationResult}
          task={task}
          isBenchmarkOpen={isBenchmarkOpen}
          onToggleBenchmark={() => setIsBenchmarkOpen(!isBenchmarkOpen)}
        />
      </div>

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
