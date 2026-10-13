import React, { useState, useRef, useEffect } from 'react';
import { ListenRepeatTask } from '../../data/curatedQuestions';
import { Volume2, Mic, MicOff, Check, RefreshCw, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import { speakScriptLine, createVoiceSession, VoiceSession, calculateSentenceMatch } from '../../utils/audioSpeech';
import { convertToScaledScore, convertScaledToBand6, savePracticeRecord } from '../../utils/scoreTracker';

interface Props {
  task: ListenRepeatTask;
  onNextTask?: () => void;
}

interface SentenceState {
  userInput: string;
  isRecording: boolean;
  scorePercent?: number;
  wordBreakdown?: Array<{ word: string; status: 'matched' | 'missed' | 'extra' }>;
  checked: boolean;
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
  const [activeMicIdx, setActiveMicIdx] = useState<number | null>(null);
  const [micStatus, setMicStatus] = useState<'idle' | 'listening' | 'transcribing'>('idle');
  const [micError, setMicError] = useState<string | null>(null);

  const voiceSessionRef = useRef<VoiceSession | null>(null);

  useEffect(() => {
    return () => {
      if (voiceSessionRef.current) {
        voiceSessionRef.current.abort();
      }
    };
  }, []);

  const handlePlay = async (index: number) => {
    setActiveAudioIdx(index);
    await speakScriptLine(task.sentences[index], {
      rate: 0.9,
      onEnd: () => setActiveAudioIdx(null),
      onError: () => setActiveAudioIdx(null),
    });
  };

  const handleToggleMic = async (index: number) => {
    setMicError(null);

    // If currently recording this item, stop and finalize transcript
    if (activeMicIdx === index && voiceSessionRef.current) {
      setMicStatus('transcribing');
      try {
        const result = await voiceSessionRef.current.stop();
        const finalTranscript = typeof result === 'string' ? result : result?.transcript || '';
        if (finalTranscript) {
          setStates((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], userInput: finalTranscript };
            return next;
          });
        }
      } catch (err: any) {
        setMicError(err.message || 'Error processing speech recording');
      } finally {
        setActiveMicIdx(null);
        setMicStatus('idle');
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
    }

    const session = createVoiceSession({
      onTranscriptUpdate: (text) => {
        setStates((prev) => {
          const next = [...prev];
          next[index] = { ...next[index], userInput: text };
          return next;
        });
      },
      onStatusChange: (status, errorMsg) => {
        if (status === 'listening') {
          setMicStatus('listening');
        } else if (status === 'processing') {
          setMicStatus('transcribing');
        } else if (status === 'idle') {
          setMicStatus('idle');
        } else if (status === 'error') {
          setMicStatus('idle');
          setActiveMicIdx(null);
          if (errorMsg) {
            setMicError(errorMsg);
          }
        }
      },
    });

    voiceSessionRef.current = session;
    setActiveMicIdx(index);

    try {
      await session.start();
    } catch (err: any) {
      setActiveMicIdx(null);
      setMicStatus('idle');
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

    setStates((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        scorePercent: percentage,
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
      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">{task.title}</h2>
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
            <span>Speaking Section</span>
            <span aria-hidden="true">·</span>
            <span>Listen & Repeat</span>
            <span aria-hidden="true">·</span>
            <span>{task.sentences.length} Sentences</span>
            <span aria-hidden="true">·</span>
            <span className="capitalize">{task.level}</span>
          </div>
        </div>

        {completedCount > 0 && (
          <div className="flex items-center gap-2 text-xs bg-teal-50 border border-teal-200 text-teal-900 px-3 py-1.5 rounded-lg">
            <span>Completed: <strong className="font-mono">{completedCount}/{task.sentences.length}</strong></span>
            <span aria-hidden="true">·</span>
            <span>Est. TOEFL: <strong className="font-mono text-teal-800">Band {convertScaledToBand6(convertToScaledScore(avgAccuracy, 100)).toFixed(1)} / 6.0</strong> <span className="text-slate-500 font-mono text-[11px]">({convertToScaledScore(avgAccuracy, 100)}/30)</span></span>
          </div>
        )}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-700 leading-relaxed">
        <strong>Task Guidelines:</strong> Click <strong>Hear Sentence</strong> to listen to the prompt. Then repeat the
        sentence aloud by clicking the <strong>Mic</strong> button (or type your response if no microphone is available).
        Click <strong>Check</strong> to evaluate phonetic and lexical word accuracy.
        <span className="block mt-1.5 text-teal-700 font-medium">
          💡 Numbers and spoken times (e.g. <em>10:00</em> and <em>ten o'clock</em>, or <em>lab</em> and <em>laboratory</em>) are automatically recognized and matched.
        </span>
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

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePlay(idx)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                      isAudioPlaying
                        ? 'bg-teal-600 text-white border-teal-600 animate-pulse'
                        : 'bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100'
                    }`}
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    {isAudioPlaying ? 'Playing Audio...' : 'Hear Sentence'}
                  </button>
                </div>
              </div>

              {/* Input / Dictation Area */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={state.userInput}
                      disabled={state.checked || isTranscribingThis}
                      onChange={(e) =>
                        setStates((prev) => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], userInput: e.target.value };
                          return next;
                        })
                      }
                      placeholder={
                        isRecordingThis
                          ? 'Listening... speak clearly into your mic...'
                          : isTranscribingThis
                          ? 'Processing voice...'
                          : 'Click mic to speak, or type your repetition...'
                      }
                      className={`w-full px-3.5 py-2 text-sm rounded-lg text-slate-900 outline-hidden transition-colors ${
                        isRecordingThis
                          ? 'bg-rose-50/40 border border-rose-300 focus:ring-2 focus:ring-rose-200'
                          : 'bg-slate-50 border border-slate-300 focus:bg-white focus:border-teal-600 focus:ring-2 focus:ring-teal-100'
                      }`}
                    />
                  </div>

                  <button
                    onClick={() => handleToggleMic(idx)}
                    disabled={state.checked || (activeMicIdx !== null && activeMicIdx !== idx && micStatus !== 'idle')}
                    className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
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
                        <span>Transcribing...</span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-4 h-4 text-slate-600" />
                        <span>Speak</span>
                      </>
                    )}
                  </button>

                  {!state.checked ? (
                    <button
                      onClick={() => handleCheck(idx)}
                      disabled={!state.userInput.trim() || isRecordingThis || isTranscribingThis}
                      className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Check
                    </button>
                  ) : (
                    <button
                      onClick={() => handleResetItem(idx)}
                      className="p-2 text-slate-600 hover:text-slate-900 rounded-lg border border-slate-200 hover:bg-slate-50"
                      title="Reset item"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  )}
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
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">
                        Accuracy Match: <strong className="font-mono text-slate-900 text-sm">{state.scorePercent}%</strong>
                      </span>
                      <span className="text-slate-500">
                        Target sentence: <span className="font-medium text-slate-800 italic">"{targetSentence}"</span>
                      </span>
                    </div>

                    {/* Word-by-word breakdown */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
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
                    </div>
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
