import { pickSingleVoice, inferGender, pickBrowserVoiceForGender, parseDialogueLine, detectSpeakerGender } from '../../utils/voices';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { markUserAiRequest } from '../../utils/userActivity';
import { ListenRepeatTask } from '../../data/curatedQuestions';
import { Volume2, Mic, MicOff, Check, RefreshCw, ArrowRight, AlertCircle, Loader2, Headphones, Pause, RotateCcw, Play, HardDrive, Settings } from 'lucide-react';
import { OfflineTranscriberModal } from '../shared/OfflineTranscriberModal';
import { checkModelCachedStatus, getWhisperModelChoice } from '../../utils/localWhisperStt';
import { speakScriptLine, stopSpeaking, createVoiceSession, VoiceSession, calculateSentenceMatch, transcribeAudioBlob, prefetchSpeechAudio, stripSpeakerAndFormatting } from '../../utils/audioSpeech';
import { calculateSpeakingMetrics } from '../../utils/speakingMetrics';
import { convertToScaledScore, convertScaledToBand6, savePracticeRecord } from '../../utils/scoreTracker';
import { db } from '../../firebase';
import { getAuthHeaders, getApiHeaders } from '../../utils/apiKey';
import { updateDoc, doc } from 'firebase/firestore';

interface Props {
  task: ListenRepeatTask;
  onNextTask?: () => void;
}

import { SpeakingMetrics } from '../../utils/speakingMetrics';

interface SentenceState {
  userInput: string;
  isRecording: boolean;
  scorePercent?: number;
  bandScore?: number;
  wordBreakdown?: Array<{ word: string; status: 'matched' | 'missed' | 'extra' }>;
  metrics?: SpeakingMetrics;
  checked: boolean;
  fillerWordsCount?: number;
  fillerWordsList?: string[];
}

export const ListenRepeatView: React.FC<Props> = ({ task, onNextTask }) => {
  const [states, setStates] = useState<SentenceState[]>(() =>
    task.sentences.map(() => ({
      userInput: '',
      isRecording: false,
      checked: false,
    }))
  );
  const [activeAudioIdx, setActiveAudioIdx] = useState<number | null>(null);
  const [loadingAudioIdx, setLoadingAudioIdx] = useState<number | null>(null);
  const [activeMicIdx, setActiveMicIdx] = useState<number | null>(null);
  const [micStatus, setMicStatus] = useState<'idle' | 'listening' | 'transcribing'>('idle');
  const [autoStart, setAutoStart] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [transcribeSeconds, setTranscribeSeconds] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [audioBlobs, setAudioBlobs] = useState<Record<number, Blob>>({});
  const [transcribeErrors, setTranscribeErrors] = useState<Record<number, string | null>>({});
  const [audioErrors, setAudioErrors] = useState<Record<number, string | null>>({});

  const [isTranscriberModalOpen, setIsTranscriberModalOpen] = useState(false);
  const [isAnyModelCached, setIsAnyModelCached] = useState<boolean>(true);
  const [playingRecordingIdx, setPlayingRecordingIdx] = useState<number | null>(null);

  useEffect(() => {
    const checkCached = async () => {
      const active = getWhisperModelChoice();
      const isCached = await checkModelCachedStatus(active);
      setIsAnyModelCached(isCached);
    };
    checkCached();
  }, [isTranscriberModalOpen]);

  const activePlayingKeyRef = useRef<string | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const recordingAudioRef = useRef<HTMLAudioElement | null>(null);
  const playbackSessionIdRef = useRef<number>(0);
  const voiceSessionRef = useRef<VoiceSession | null>(null);

  const stopAllAudio = useCallback(() => {
    playbackSessionIdRef.current++;
    if (activeAudioRef.current) {
      try {
        activeAudioRef.current.pause();
        activeAudioRef.current.currentTime = 0;
        activeAudioRef.current.src = '';
      } catch {}
      activeAudioRef.current = null;
    }
    if (recordingAudioRef.current) {
      try {
        recordingAudioRef.current.pause();
        recordingAudioRef.current.currentTime = 0;
      } catch {}
      recordingAudioRef.current = null;
    }
    activePlayingKeyRef.current = null;
    setActiveAudioIdx(null);
    setLoadingAudioIdx(null);
    setPlayingRecordingIdx(null);
    stopSpeaking();
  }, []);

  useEffect(() => {
    return () => {
      stopAllAudio();
    };
  }, [task.id, stopAllAudio]);

  const speakerName = (task as any).speakerName || 'Sarah (student)';
  const speakerGender = (task as any).speakerGender || inferGender(speakerName);
  const speakerVoice = pickSingleVoice(`${task.title}|${speakerName}`, speakerGender);

  // Silent background pre-synthesis so clicking "Hear sentence" is INSTANT (0 ms delay)
  useEffect(() => {
    if (!task?.sentences || task.sentences.length === 0) return;
    task.sentences.forEach((sentence, idx) => {
      const sentenceVoice = pickSingleVoice(`${task.id || task.title}|${speakerName}|s_${idx}`, speakerGender);
      prefetchSpeechAudio(sentence, sentenceVoice).catch(() => {});
    });
  }, [task.id, task.title, speakerName, speakerGender]);

  useEffect(() => {
    return () => {
      if (voiceSessionRef.current) {
        voiceSessionRef.current.abort();
      }
    };
  }, []);

  // Live timer for recording duration
  useEffect(() => {
    let interval: any = null;
    if (micStatus === 'listening') {
      setRecordingSeconds(0);
      interval = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    } else {
      setRecordingSeconds(0);
    }
    return () => clearInterval(interval);
  }, [micStatus]);

  // Live timer for transcription duration
  useEffect(() => {
    let interval: any = null;
    if (micStatus === 'transcribing') {
      setTranscribeSeconds(0);
      interval = setInterval(() => setTranscribeSeconds((s) => s + 1), 1000);
    } else {
      setTranscribeSeconds(0);
    }
    return () => clearInterval(interval);
  }, [micStatus]);

  const handlePlay = async (index: number) => {
    const itemKey = `sentence_${index}`;
    const wasPlayingThis = activePlayingKeyRef.current === itemKey;
    stopAllAudio();
    if (wasPlayingThis) {
      return;
    }
    activePlayingKeyRef.current = itemKey;
    const currentSession = ++playbackSessionIdRef.current;

    setLoadingAudioIdx(index);
    setAudioErrors((prev) => ({ ...prev, [index]: null }));

    const rawSentence = task.sentences[index];
    const parsed = parseDialogueLine(rawSentence);
    const cleanSentence = parsed.spokenText || stripSpeakerAndFormatting(rawSentence);
    const effSpeaker = parsed.speakerName || speakerName;
    const effGender = detectSpeakerGender(effSpeaker, parsed.speakerHint || speakerGender);
    const audioClips = (task as any).audioClips;
    const audioUrl = (task as any).audioUrl;

    const savedClipUrl = Array.isArray(audioClips) && audioClips[index]?.url
      ? audioClips[index].url
      : (index === 0 ? audioUrl : null);

    if (savedClipUrl && savedClipUrl.startsWith('https://') && savedClipUrl.includes('blob.vercel-storage.com')) {
      setLoadingAudioIdx(null);
      setActiveAudioIdx(index);
      try {
        await new Promise<void>((resolve, reject) => {
          if (playbackSessionIdRef.current !== currentSession) {
            resolve();
            return;
          }
          const audio = new Audio(savedClipUrl);
          audio.loop = false;
          activeAudioRef.current = audio;
          const seedString = effSpeaker || cleanSentence.slice(0, 20);
          const hash = seedString.split('').reduce((acc: number, char: string) => char.charCodeAt(0) + acc, 0);
          const dynamicRate = 0.92 + ((hash % 100) / 100) * 0.14;
          audio.preservesPitch = false;
          audio.playbackRate = dynamicRate;
          audio.onended = () => {
            if (activeAudioRef.current === audio) activeAudioRef.current = null;
            if (activePlayingKeyRef.current === itemKey) activePlayingKeyRef.current = null;
            setActiveAudioIdx(null);
            resolve();
          };
          audio.onerror = () => {
            if (activeAudioRef.current === audio) activeAudioRef.current = null;
            if (activePlayingKeyRef.current === itemKey) activePlayingKeyRef.current = null;
            setActiveAudioIdx(null);
            reject(new Error('Saved audio playback error'));
          };
          audio.play().catch((err) => {
            if (activeAudioRef.current === audio) activeAudioRef.current = null;
            if (activePlayingKeyRef.current === itemKey) activePlayingKeyRef.current = null;
            setActiveAudioIdx(null);
            reject(err);
          });
        });
      } catch (err: any) {
        if (playbackSessionIdRef.current === currentSession) {
          activePlayingKeyRef.current = null;
          setActiveAudioIdx(null);
          setAudioErrors((prev) => ({ ...prev, [index]: err?.message || String(err) }));
        }
      }
      return;
    }

    // Try /api/tts with getAuthHeaders() and getApiHeaders()
    try {
      const authHdrs = await getAuthHeaders();
      const headers = { ...getApiHeaders(), ...authHdrs };
      const voiceName = pickSingleVoice(`${task.id || task.title}|${effSpeaker}|s_${index}`, effGender);
      const ttsRes = await fetch('/api/tts', {
        method: 'POST',
        headers,
        body: JSON.stringify({ text: cleanSentence, voiceName, speaker: effSpeaker }),
      });
      const ttsJson = await ttsRes.json();
      const audioSrc = ttsJson.audioUrl || (ttsJson.audioBase64 ? `data:audio/mpeg;base64,${ttsJson.audioBase64}` : null);

      if (playbackSessionIdRef.current !== currentSession) return;

      if (ttsRes.ok && ttsJson.success && audioSrc) {
        const newUrl = ttsJson.audioUrl;
        setLoadingAudioIdx(null);
        setActiveAudioIdx(index);

        const docId = (task as any).questionDocId || (task as any).id;
        if (docId && docId.startsWith('q_') && newUrl && newUrl.startsWith('https://') && newUrl.includes('blob.vercel-storage.com')) {
          try {
            if (!audioUrl) {
              await updateDoc(doc(db, 'questions', docId), { audioUrl: newUrl });
              (task as any).audioUrl = newUrl;
            }
            const currentClips = Array.isArray(task.audioClips) ? [...task.audioClips] : [];
            currentClips[index] = { speaker: speakerName, url: newUrl };
            const cappedClips = currentClips.slice(0, 10);
            await updateDoc(doc(db, 'questions', docId), { audioClips: cappedClips });
            (task as any).audioClips = cappedClips;
          } catch (e) {
            console.warn('Failed to save sentence audio:', e);
          }
        }

        await new Promise<void>((resolve, reject) => {
          if (playbackSessionIdRef.current !== currentSession) {
            resolve();
            return;
          }
          const audio = new Audio(audioSrc);
          audio.loop = false;
          activeAudioRef.current = audio;
          const isNeuralFallback = !ttsJson.modelUsed || ttsJson.modelUsed.includes('Neural Stream') || ttsJson.providerUsed === 'fallback';
          const seedString = effSpeaker || cleanSentence.slice(0, 20);
          const hash = seedString.split('').reduce((acc: number, char: string) => char.charCodeAt(0) + acc, 0);
          const dynamicRate = 0.92 + ((hash % 100) / 100) * 0.14;
          audio.preservesPitch = false;
          audio.playbackRate = isNeuralFallback ? dynamicRate : 1.0;
          audio.onended = () => {
            if (activeAudioRef.current === audio) activeAudioRef.current = null;
            if (activePlayingKeyRef.current === itemKey) activePlayingKeyRef.current = null;
            setActiveAudioIdx(null);
            resolve();
          };
          audio.onerror = () => {
            if (activeAudioRef.current === audio) activeAudioRef.current = null;
            if (activePlayingKeyRef.current === itemKey) activePlayingKeyRef.current = null;
            setActiveAudioIdx(null);
            reject(new Error('Generated audio playback error'));
          };
          audio.play().catch((err) => {
            if (activeAudioRef.current === audio) activeAudioRef.current = null;
            if (activePlayingKeyRef.current === itemKey) activePlayingKeyRef.current = null;
            setActiveAudioIdx(null);
            reject(err);
          });
        });
        return;
      }
    } catch (e) {
      console.warn('TTS fetch failed for ListenRepeat sentence, falling back to Web Speech:', e);
    }

    if (playbackSessionIdRef.current !== currentSession) return;

    const voiceName = pickSingleVoice(`${task.id || task.title}|${speakerName}|s_${index}`, speakerGender);
    const browserVoice = pickBrowserVoiceForGender(speakerGender);
    try {
      await speakScriptLine(cleanSentence, {
        rate: 0.9,
        voiceName,
        browserVoice,
        onStart: () => {
          if (playbackSessionIdRef.current === currentSession) {
            setLoadingAudioIdx(null);
            setActiveAudioIdx(index);
          }
        },
        onEnd: () => {
          if (playbackSessionIdRef.current === currentSession) {
            if (activePlayingKeyRef.current === itemKey) activePlayingKeyRef.current = null;
            setActiveAudioIdx(null);
            setLoadingAudioIdx(null);
          }
        },
        onError: (err) => {
          if (playbackSessionIdRef.current === currentSession) {
            if (activePlayingKeyRef.current === itemKey) activePlayingKeyRef.current = null;
            setActiveAudioIdx(null);
            setLoadingAudioIdx(null);
            setAudioErrors((prev) => ({ ...prev, [index]: err?.message || String(err) }));
          }
        },
      });
    } catch (err: any) {
      if (playbackSessionIdRef.current === currentSession) {
        if (activePlayingKeyRef.current === itemKey) activePlayingKeyRef.current = null;
        setActiveAudioIdx(null);
        setLoadingAudioIdx(null);
        setAudioErrors((prev) => ({ ...prev, [index]: err?.message || String(err) }));
      }
    }
  };

  const handleRestartSentence = async (index: number) => {
    stopSpeaking();
    setActiveAudioIdx(null);
    handlePlay(index);
  };

  const handlePlayUserRecording = (index: number) => {
    const itemKey = `user_rec_${index}`;
    const wasPlayingThis = activePlayingKeyRef.current === itemKey;
    stopAllAudio();
    if (wasPlayingThis) {
      return;
    }

    const blob = audioBlobs[index];
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.loop = false;
    activePlayingKeyRef.current = itemKey;
    recordingAudioRef.current = audio;
    setPlayingRecordingIdx(index);

    audio.onended = () => {
      if (recordingAudioRef.current === audio) {
        recordingAudioRef.current = null;
      }
      if (activePlayingKeyRef.current === itemKey) {
        activePlayingKeyRef.current = null;
      }
      setPlayingRecordingIdx(null);
      URL.revokeObjectURL(url);
    };

    audio.onerror = () => {
      if (recordingAudioRef.current === audio) {
        recordingAudioRef.current = null;
      }
      if (activePlayingKeyRef.current === itemKey) {
        activePlayingKeyRef.current = null;
      }
      setPlayingRecordingIdx(null);
      URL.revokeObjectURL(url);
    };

    audio.play().catch(() => {
      if (recordingAudioRef.current === audio) {
        recordingAudioRef.current = null;
      }
      if (activePlayingKeyRef.current === itemKey) {
        activePlayingKeyRef.current = null;
      }
      setPlayingRecordingIdx(null);
      URL.revokeObjectURL(url);
    });
  };

  const handleToggleMic = async (index: number) => {
    setMicError(null);
    markUserAiRequest();

    // If currently recording this item, stop and finalize transcript
    if (activeMicIdx === index && voiceSessionRef.current) {
      setMicStatus('transcribing');
      try {
        const result = await voiceSessionRef.current.stop();
        if (result.audioBlob) {
          setAudioBlobs((prev) => ({ ...prev, [index]: result.audioBlob! }));
        }
        if (result.error) {
          setTranscribeErrors((prev) => ({ ...prev, [index]: result.error! }));
        } else if (result.transcript) {
          setTranscribeErrors((prev) => ({ ...prev, [index]: null }));
          const { alignHomophonesAndPhonetics } = await import('../../utils/phoneticMatcher');
          const aligned = alignHomophonesAndPhonetics(result.transcript, task.sentences[index]);
          const metrics = result.metrics;
          setStates((prev) => {
            const next = [...prev];
            next[index] = {
              ...next[index],
              userInput: aligned,
              metrics: metrics || next[index].metrics,
              fillerWordsCount: metrics?.fillerCount ?? result.fillerWordsCount ?? 0,
              fillerWordsList: metrics?.fillerWords || result.fillerWordsList || [],
            };
            return next;
          });
        }
      } catch (err: any) {
        setMicError(err.message || 'Error processing speech recording');
      } finally {
        setActiveMicIdx(null);
        setMicStatus('idle');
        setAudioLevel(0);
        voiceSessionRef.current = null;
      }
      return;
    }

    // If currently recording another item, stop it first
    if (voiceSessionRef.current) {
      try {
        await voiceSessionRef.current.stop();
      } catch {}
      voiceSessionRef.current = null;
      setAudioLevel(0);
    }

    // Immediately clear old text and previous check score so item starts fresh
    setStates((prev) => {
      const next = [...prev];
      next[index] = {
        userInput: '',
        isRecording: true,
        checked: false,
        scorePercent: undefined,
        bandScore: undefined,
        wordBreakdown: undefined,
        metrics: undefined,
        fillerWordsCount: undefined,
        fillerWordsList: undefined,
      };
      return next;
    });

    const session = createVoiceSession({
      onTranscriptUpdate: (text) => {
        setStates((prev) => {
          const next = [...prev];
          next[index] = { ...next[index], userInput: text };
          return next;
        });
      },
      onAudioLevel: (lvl) => setAudioLevel(lvl),
      onQuietWarning: (warning) => setMicError(warning),
      onDeviceDisconnected: (msg) => setMicError(msg),
      onNotice: (notice) => setMicError(notice),
      onStatusChange: (status, errorMsg) => {
        if (status === 'listening' || status === 'waiting_for_voice') {
          setMicStatus('listening');
        } else if (status === 'processing') {
          setMicStatus('transcribing');
        } else if (status === 'idle') {
          setMicStatus('idle');
          setAudioLevel(0);
        } else if (status === 'error') {
          setMicStatus('idle');
          setActiveMicIdx(null);
          setAudioLevel(0);
          if (errorMsg) {
            setMicError(errorMsg);
          }
        }
      },
      autoStartThreshold: autoStart ? 5 : undefined,
    });

    voiceSessionRef.current = session;
    setActiveMicIdx(index);

    try {
      await session.start();
    } catch (err: any) {
      setActiveMicIdx(null);
      setMicStatus('idle');
      setAudioLevel(0);
      setMicError(err.message || 'Could not start microphone');
      voiceSessionRef.current = null;
    }
  };


  const handleCheck = (index: number) => {
    // If mic is running, stop it first
    if (activeMicIdx === index && voiceSessionRef.current) {
      voiceSessionRef.current.stop();
      setActiveMicIdx(null);
      setMicStatus('idle');
    }

    const target = task.sentences[index];
    const user = states[index].userInput;
    const { percentage, wordStatuses } = calculateSentenceMatch(target, user);
    const metrics = states[index].metrics;

    let itemBand = 1.0;
    if (percentage >= 92) itemBand = 6.0;
    else if (percentage >= 82) itemBand = 5.5;
    else if (percentage >= 72) itemBand = 5.0;
    else if (percentage >= 60) itemBand = 4.5;
    else if (percentage >= 48) itemBand = 4.0;
    else if (percentage >= 35) itemBand = 3.0;
    else if (percentage >= 20) itemBand = 2.0;
    else itemBand = 1.0;

    if (metrics?.wpm) {
      if (metrics.wpm < 85 || metrics.wpm > 180) itemBand = Math.max(1.0, itemBand - 0.5);
    }
    if (metrics?.pauseCount && metrics.pauseCount >= 3) {
      itemBand = Math.max(1.0, itemBand - 0.5);
    }

    // Apply Band deduction for vocalized filler words
    const fillerCount = states[index].fillerWordsCount ?? metrics?.fillerCount ?? 0;
    if (fillerCount >= 2) {
      itemBand = Math.max(1.0, itemBand - 0.5);
    } else if (fillerCount === 1) {
      itemBand = Math.max(1.0, itemBand - 0.25);
    }
    const bandScore = Math.round(itemBand * 2) / 2;

    setStates((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        scorePercent: percentage,
        bandScore,
        wordBreakdown: wordStatuses,
        checked: true,
      };
      return next;
    });

    // Check if all checked to save record
    const allChecked = states.every((s, i) => (i === index ? true : s.checked));
    if (allChecked) {
      const avgPercent = Math.round(
        states.reduce((acc, s, i) => acc + (i === index ? percentage : s.scorePercent || 0), 0) /
          task.sentences.length
      );
      savePracticeRecord({
        taskType: 'listen-repeat',
        taskTitle: task.title,
        section: 'Speaking',
        score: avgPercent,
        maxScore: 100,
        scaledScore30: convertToScaledScore(avgPercent, 100),
        timeSpentSeconds: 120,
        feedbackSummary: `Listen & Repeat: Average accuracy of ${avgPercent}% across 5 sentences`,
      });
    }
  };

  const handleResetItem = (index: number) => {
    if (activeMicIdx === index && voiceSessionRef.current) {
      voiceSessionRef.current.abort();
      setActiveMicIdx(null);
      setMicStatus('idle');
    }
    setStates((prev) => {
      const next = [...prev];
      next[index] = { userInput: '', isRecording: false, checked: false };
      return next;
    });
    setTranscribeErrors((prev) => ({ ...prev, [index]: null }));
  };

  const handleRetryTranscription = async (index: number) => {
    const blob = audioBlobs[index];
    if (!blob) return;
    setActiveMicIdx(index);
    setMicStatus('transcribing');
    setMicError(null);
    try {
      const targetSentence = task.sentences[index];
      const { transcript, words, durationMs } = await transcribeAudioBlob(blob, undefined, targetSentence);
      if (transcript.trim()) {
        const metrics = calculateSpeakingMetrics(words, transcript, (durationMs || 0) / 1000);
        setStates((prev) => {
          const next = [...prev];
          next[index] = { ...next[index], userInput: transcript.trim(), metrics };
          return next;
        });
        setTranscribeErrors((prev) => ({ ...prev, [index]: null }));
      }
    } catch (err: any) {
      const errCode = err?.message === 'TRANSCRIPTION_TIMEOUT' ? 'TRANSCRIPTION_TIMEOUT' : 'TRANSCRIPTION_FAILED';
      setTranscribeErrors((prev) => ({ ...prev, [index]: errCode }));
      setMicError(
        errCode === 'TRANSCRIPTION_TIMEOUT'
          ? 'Transcription timed out (20s). Audio is preserved. Click Retry transcription or type your repetition.'
          : 'Audio transcription failed. Audio is preserved. Click Retry transcription or type your repetition.'
      );
    } finally {
      setActiveMicIdx(null);
      setMicStatus('idle');
    }
  };

  const completedCount = states.filter((s) => s.checked).length;
  const avgAccuracy =
    completedCount > 0
      ? Math.round(
          states
            .filter((s) => s.checked)
            .reduce((acc, s) => acc + (s.scorePercent || 0), 0) / completedCount
        )
      : 0;

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
            <span>Listen & Repeat</span>
            <span aria-hidden="true">·</span>
            <span>{((task as any).source === 'ai') ? `✨ Generated by @${(task as any).generatedBy || 'Scholar'}` : '📚 Curated Bank'}</span>
            <span aria-hidden="true">·</span>
            <span>{task.sentences.length} Sentences</span>
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

          {completedCount > 0 && (
            <div className="flex items-center gap-2 text-xs bg-teal-50 border border-teal-200 text-teal-900 px-3 py-1.5 rounded-lg">
              <span>Completed: <strong className="font-mono">{completedCount}/{task.sentences.length}</strong></span>
              <span aria-hidden="true">·</span>
              <span>Est. TOEFL: <strong className="font-mono text-teal-800">Band {convertScaledToBand6(convertToScaledScore(avgAccuracy, 100)).toFixed(1)} / 6.0</strong> <span className="text-slate-500 font-mono text-[11px]">({convertToScaledScore(avgAccuracy, 100)}/30)</span></span>
            </div>
          )}
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

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-700 leading-relaxed">
        <strong>Task Guidelines:</strong> Click <strong>Hear Sentence</strong> to listen to the prompt. Then repeat the
        sentence aloud by clicking the <strong>Mic</strong> button (or type your response if no microphone is available).
        Click <strong>Check</strong> to evaluate phonetic and lexical word accuracy.
        <span className="block mt-1.5 text-teal-700 font-medium">
          💡 Numbers and spoken times (e.g. <em>10:00</em> and <em>ten o'clock</em>, or <em>lab</em> and <em>laboratory</em>) are automatically recognized and matched.
        </span>
      </div>

      {/* Headphone echo prevention hint */}
      <div className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 flex items-center gap-2">
        <Headphones className="w-4 h-4 text-teal-700 shrink-0" />
        <span>Tip: Use headphones or a headset to prevent microphone echo and ensure clean acoustic scoring.</span>
      </div>

      {micError && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-xs text-amber-900 animate-in fade-in">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong className="font-semibold block mb-0.5">Microphone Notice</strong>
            <span>{micError}</span>
          </div>
          <button
            onClick={() => setMicError(null)}
            className="text-amber-700 hover:text-amber-900 text-xs font-semibold px-2 py-1 rounded-md hover:bg-amber-100 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="space-y-4">
        {task.sentences.map((targetSentence, idx) => {
          const state = states[idx];
          const isAudioPlaying = activeAudioIdx === idx;
          const isRecordingThis = activeMicIdx === idx && micStatus === 'listening';
          const isTranscribingThis = activeMicIdx === idx && micStatus === 'transcribing';
          const wordCount = targetSentence.split(/\s+/).length;

          return (
            <div
              key={idx}
              className={`bg-white border rounded-xl p-5 shadow-xs transition-all ${
                state.checked
                  ? (state.scorePercent || 0) >= 75
                    ? 'border-emerald-200 bg-emerald-50/20'
                    : 'border-amber-200 bg-amber-50/20'
                  : isRecordingThis
                  ? 'border-rose-300 ring-2 ring-rose-100'
                  : 'border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Item {idx + 1} of {task.sentences.length} · {wordCount} Words
                </span>

                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handlePlay(idx)}
                      disabled={loadingAudioIdx === idx}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                        isAudioPlaying
                          ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 border-amber-500 font-semibold'
                          : loadingAudioIdx === idx
                          ? 'bg-teal-100 text-teal-800 border-teal-300 opacity-90'
                          : 'bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100'
                      }`}
                    >
                      {loadingAudioIdx === idx ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-700" />
                      ) : isAudioPlaying ? (
                        <Pause className="w-3.5 h-3.5 fill-current" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5" />
                      )}
                      {loadingAudioIdx === idx ? 'Loading...' : isAudioPlaying ? '⏹ Stop Audio' : 'Hear Sentence'}
                    </button>

                    <button
                      onClick={() => handleRestartSentence(idx)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                      title="Restart sentence audio from beginning"
                    >
                      <RotateCcw className="w-3 h-3 text-slate-500" />
                      <span>Restart</span>
                    </button>
                  </div>
                  {audioErrors[idx] && (
                    <div className="text-[11px] text-rose-600 font-mono text-right max-w-sm">
                      Audio failure: {audioErrors[idx]}
                    </div>
                  )}
                </div>
              </div>

              {/* Input / Dictation Area */}
              <div className="space-y-3">
                {/* Live input-level meter using AnalyserNode and recording timer */}
                {isRecordingThis && (
                  <div className="flex items-center justify-between gap-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-2.5 rounded-lg animate-in fade-in flex-wrap shadow-xs">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2.5 w-2.5 items-center justify-center shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600"></span>
                      </span>
                      <span className="font-bold text-rose-900">Recording Active</span>
                      <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded font-mono font-bold text-[11px]">
                        {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, '0')}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-600">Speak clearly. Click Stop when done.</span>
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



                <div className="space-y-3">
                  {/* Full-width text input line */}
                  <div className="w-full">
                    <input
                      type="text"
                      value={state.userInput}
                      disabled={isTranscribingThis}
                      onChange={(e) =>
                        setStates((prev) => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], userInput: e.target.value, checked: false };
                          return next;
                        })
                      }
                      placeholder={
                        isRecordingThis
                          ? 'Listening... speak clearly into your mic...'
                          : isTranscribingThis
                          ? `Processing voice... ${transcribeSeconds}s`
                          : 'Click mic to speak, or edit/type your repetition...'
                      }
                      className={`w-full px-3.5 py-2.5 text-sm rounded-lg text-slate-900 outline-hidden transition-colors ${
                        isRecordingThis
                          ? 'bg-rose-50/40 border border-rose-300 focus:ring-2 focus:ring-rose-200'
                          : 'bg-slate-50 border border-slate-300 focus:bg-white focus:border-teal-600 focus:ring-2 focus:ring-teal-100'
                      }`}
                    />
                  </div>

                  {/* Action buttons and controls on a separate line below */}
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        id={`autostart-${idx}`}
                        checked={autoStart}
                        onChange={(e) => setAutoStart(e.target.checked)}
                        className="rounded text-teal-600 focus:ring-teal-500"
                      />
                      <label htmlFor={`autostart-${idx}`}>Auto-start on sound</label>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => handleToggleMic(idx)}
                        disabled={isRecordingThis ? false : (activeMicIdx !== null && activeMicIdx !== idx && micStatus !== 'idle')}
                        className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                          isRecordingThis
                            ? 'bg-rose-600 border-rose-600 text-white shadow-xs animate-pulse hover:bg-rose-700'
                            : isTranscribingThis
                            ? 'bg-slate-100 border-slate-300 text-slate-600 cursor-wait'
                            : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400'
                        }`}
                        title={isRecordingThis ? 'Click to finish speaking' : 'Click mic and speak'}
                      >
                        {isRecordingThis ? (
                          <>
                            <MicOff className="w-4 h-4 text-white" />
                            <span>Stop</span>
                          </>
                        ) : isTranscribingThis ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                            <span>Transcribing... {transcribeSeconds}s</span>
                          </>
                        ) : (
                          <>
                            <Mic className="w-4 h-4 text-slate-600" />
                            <span>Speak</span>
                          </>
                        )}
                      </button>

                      {audioBlobs[idx] && (
                        <>
                          <button
                            type="button"
                            onClick={() => handlePlayUserRecording(idx)}
                            className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                              playingRecordingIdx === idx
                                ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                                : 'border-teal-300 bg-teal-50 text-teal-900 hover:bg-teal-100'
                            }`}
                            title={playingRecordingIdx === idx ? 'Click to stop playback' : 'Listen to your exact recorded voice'}
                          >
                            {playingRecordingIdx === idx ? (
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
                            onClick={() => handleRetryTranscription(idx)}
                            disabled={isRecordingThis || isTranscribingThis}
                            className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                              transcribeErrors[idx]
                                ? 'border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100 font-semibold'
                                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                            title="Retry transcription from saved recording"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isTranscribingThis ? 'animate-spin text-teal-600' : 'text-slate-600'}`} />
                            <span>Retry STT</span>
                          </button>
                        </>
                      )}

                      <button
                        onClick={() => handleCheck(idx)}
                        disabled={!state.userInput.trim() || isRecordingThis || isTranscribingThis}
                        className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                      >
                        <Check className="w-3.5 h-3.5" />
                        {state.checked ? 'Re-Check' : 'Check'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Real-time speaking status strip */}
                {isRecordingThis && (
                  <div className="flex items-center gap-2 text-xs text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">
                    <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping shrink-0" />
                    <span className="font-medium">
                      Microphone active · Speak clearly now. When finished, click <strong>Stop</strong> or <strong>Check</strong>.
                    </span>
                  </div>
                )}

                {/* Live Transcript / Word Accuracy Diff */}
                {state.checked && (
                  <div className="pt-3 border-t border-slate-200/80 space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-slate-500">
                          Accuracy Match: <strong className="font-mono text-slate-900 text-sm">{state.scorePercent}%</strong>
                        </span>
                        <span className="text-xs font-mono font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                          Band {(state.bandScore ?? 5.0).toFixed(1)}/6.0
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          (state.scorePercent ?? 0) >= 85
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : (state.scorePercent ?? 0) >= 65
                            ? 'bg-teal-100 text-teal-800 border border-teal-300'
                            : 'bg-amber-100 text-amber-800 border border-amber-300'
                        }`}>
                          {(state.scorePercent ?? 0) >= 85
                            ? 'Band 6.0 Exemplar Match'
                            : (state.scorePercent ?? 0) >= 65
                            ? 'Band 5.0 Competent Match'
                            : 'Needs Refinement'}
                        </span>
                        {state.metrics?.wpm ? (
                          <span className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-sm">
                            {state.metrics.wpm} WPM · {state.metrics.pauseCount ?? 0} pauses
                          </span>
                        ) : null}

                        {/* ALWAYS Display Filler Badge */}
                        {((state.fillerWordsCount ?? state.metrics?.fillerCount ?? 0) === 0) ? (
                          <span className="text-[10px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                            0 fillers ✓
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md flex items-center gap-1">
                            ⚠️ {(state.fillerWordsCount ?? state.metrics?.fillerCount ?? 0)} filler{(state.fillerWordsCount ?? state.metrics?.fillerCount ?? 0) > 1 ? 's' : ''} ({(state.fillerWordsList || state.metrics?.fillerWords || []).join(', ')})
                          </span>
                        )}
                      </div>
                      <span className="text-slate-500">
                        Band 6.0 Target: <span className="font-medium text-slate-800 italic">"{targetSentence}"</span>
                      </span>
                    </div>

                    {/* Word-by-word breakdown with filler chips */}
                    <div className="flex flex-wrap gap-1.5 pt-1 items-center">
                      {state.wordBreakdown?.map((wb, wIdx) => (
                        <span
                          key={wIdx}
                          className={`px-2 py-0.5 rounded text-xs font-mono font-medium ${
                            wb.status === 'matched'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-rose-100 text-rose-800 border border-rose-300 line-through'
                          }`}
                        >
                          {wb.word}
                        </span>
                      ))}

                      {/* Render detected filler chips */}
                      {(state.userInput.match(/\[(um|uh|er)\]|\b(um+|uh+|er+|erm+|ah+|hmm+|like|you know)\b/gi) || []).map((f, fIdx) => (
                        <span
                          key={`filler_${fIdx}`}
                          className="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1"
                          title="Vocalized filler word detected"
                        >
                          <span>(filler: {f.replace(/[\[\]]/g, '')})</span>
                        </span>
                      ))}
                    </div>

                    {/* Fluency Coaching Tip Banner */}
                    {(state.fillerWordsCount ?? state.metrics?.fillerCount ?? 0) >= 1 && (
                      <div className="mt-3 p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900 flex items-start gap-2.5 animate-in fade-in shadow-2xs">
                        <span className="text-base shrink-0">💡</span>
                        <div>
                          <strong className="font-bold block text-amber-950">Fluency Coaching Tip:</strong>
                          <span>
                            You used <strong>{(state.fillerWordsCount ?? state.metrics?.fillerCount ?? 0)} filler word(s)</strong> ({(state.fillerWordsList || state.metrics?.fillerWords || []).join(', ')}). We recommend using fewer filler words—on the TOEFL iBT Speaking section, frequent <em>"ums"</em> and <em>"uhs"</em> reduce your Delivery score. Try replacing <em>"um"</em> or <em>"uh"</em> with a brief silent pause while thinking of your next word!
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {onNextTask && (
        <div className="pt-2 flex justify-end">
          <button
            onClick={onNextTask}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Next Speaking Exercise
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
