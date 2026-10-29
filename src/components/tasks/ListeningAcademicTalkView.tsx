import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  CheckCircle2,
  ArrowRight,
  Eye,
  EyeOff,
  HelpCircle,
  Headphones,
  GraduationCap,
  Loader2,
  Edit3,
  Keyboard,
} from 'lucide-react';
import {
  speakWithCloudTTS,
  stopSpeaking,
  prefetchSpeechAudio,
  stripSpeakerAndFormatting,
  fetchCloudTtsAudio,
  chunkTextForTTS,
} from '../../utils/audioSpeech';
import { convertToScaledScore, convertScaledToBand6, savePracticeRecord } from '../../utils/scoreTracker';
import { auth } from '../../firebase';
import { saveMistake } from '../../utils/mistakes';

interface QuestionItem {
  q: string;
  options: string[];
  answer: number;
  why?: string;
  explanation?: string;
  questionType?: string;
}

export interface ListeningAcademicTalkTask {
  id?: string;
  title: string;
  context?: string;
  topic?: string;
  speakerName?: string;
  speakerGender?: 'male' | 'female';
  script?: string;
  lecture?: string;
  text?: string;
  level?: string;
  difficulty?: string;
  questions: QuestionItem[];
}

interface Props {
  task: ListeningAcademicTalkTask;
  onNextTask?: () => void;
  onComplete?: (result: number) => void;
}

export const ListeningAcademicTalkView: React.FC<Props> = ({
  task,
  onNextTask,
  onComplete,
}) => {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [listeningAudioFinished, setListeningAudioFinished] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [playCount, setPlayCount] = useState(0);
  const [activeQuestionIdx, setActiveQuestionIdx] = useState<number>(0);

  const playbackSessionRef = useRef(0);

  const scriptText = task.script || task.lecture || task.text || '';
  const cleanScript = stripSpeakerAndFormatting(scriptText);
  const speakerName = task.speakerName || 'Professor';
  const gender: 'male' | 'female' = task.speakerGender === 'female' ? 'female' : 'male';
  const voiceName = gender === 'female' ? 'en-US-AriaNeural' : 'en-US-ChristopherNeural';

  // Reset state on task change and pre-warm lecture audio chunk on mount
  useEffect(() => {
    setSelectedAnswers({});
    setSubmitted(false);
    setListeningAudioFinished(false);
    setShowTranscript(false);
    setIsPlaying(false);
    setIsLoadingAudio(false);
    setPlayCount(0);
    setActiveQuestionIdx(0);
    if (cleanScript) {
      prefetchSpeechAudio(cleanScript, voiceName, gender).catch(() => {});
    }
    return () => {
      stopSpeaking();
    };
  }, [task.id, task.title, cleanScript, voiceName, gender]);

  const handlePlayAudio = async () => {
    if (isPlaying) {
      playbackSessionRef.current++;
      stopSpeaking();
      setIsPlaying(false);
      setIsLoadingAudio(false);
      return;
    }

    const currentSession = ++playbackSessionRef.current;
    setIsLoadingAudio(true);

    try {
      const chunks = chunkTextForTTS(cleanScript);
      if (chunks.length > 0) {
        await fetchCloudTtsAudio(chunks[0], gender, voiceName);
      }

      if (playbackSessionRef.current !== currentSession) return;

      await speakWithCloudTTS(cleanScript, gender, {
        rate: 0.95,
        voice: voiceName,
        voiceName,
        gender,
        onStart: () => {
          if (playbackSessionRef.current === currentSession) {
            setIsLoadingAudio(false);
            setIsPlaying(true);
            setPlayCount((prev) => prev + 1);
          }
        },
        onEnd: () => {
          if (playbackSessionRef.current === currentSession) {
            setIsPlaying(false);
            setIsLoadingAudio(false);
            setListeningAudioFinished(true);
          }
        },
        onError: () => {
          if (playbackSessionRef.current === currentSession) {
            setIsPlaying(false);
            setIsLoadingAudio(false);
          }
        },
      });
    } catch {
      if (playbackSessionRef.current === currentSession) {
        setIsPlaying(false);
        setIsLoadingAudio(false);
      }
    }
  };

  const handleSelect = (qIdx: number, optIdx: number) => {
    if (submitted) return;
    setActiveQuestionIdx(qIdx);
    setSelectedAnswers((prev) => ({ ...prev, [qIdx]: optIdx }));
  };

  const calculateScore = useCallback(() => {
    let correct = 0;
    task.questions.forEach((q, i) => {
      if (selectedAnswers[i] === q.answer) correct++;
    });
    return correct;
  }, [task.questions, selectedAnswers]);

  const handleSubmit = useCallback(() => {
    if (submitted || Object.keys(selectedAnswers).length === 0) return;
    setSubmitted(true);
    setShowTranscript(true);

    const correctCount = calculateScore();
    const total = task.questions.length;
    const scaledScore = convertToScaledScore(correctCount, total);

    if (auth.currentUser) {
      task.questions.forEach((q, i) => {
        if (selectedAnswers[i] !== q.answer) {
          saveMistake(
            task.title,
            'listening-academic-talk',
            q.options[selectedAnswers[i]] ?? 'No answer',
            q.options[q.answer],
            q.why || q.explanation || 'Supported directly by the academic talk.'
          );
        }
      });
    }

    savePracticeRecord({
      taskType: 'listening-academic-talk',
      taskTitle: task.title,
      section: 'Listening',
      score: correctCount,
      maxScore: total,
      scaledScore30: scaledScore,
      timeSpentSeconds: 150,
      feedbackSummary: `Scored ${correctCount}/${total} on academic lecture listening (${Math.round((correctCount / total) * 100)}%)`,
    });

    onComplete?.(scaledScore);
  }, [submitted, selectedAnswers, calculateScore, task.questions, task.title, onComplete]);

  const handleReset = () => {
    setSelectedAnswers({});
    setSubmitted(false);
    setListeningAudioFinished(false);
    setShowTranscript(false);
    stopSpeaking();
    setIsPlaying(false);
    setActiveQuestionIdx(0);
  };

  const score = submitted ? calculateScore() : 0;
  const total = task.questions.length;
  const allAnswered = task.questions.every((_, i) => selectedAnswers[i] !== undefined);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'radio'))
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!submitted && Object.keys(selectedAnswers).length > 0) {
          handleSubmit();
        }
        return;
      }

      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
        if (submitted) return;
        if (allAnswered && activeQuestionIdx >= total - 1) {
          e.preventDefault();
          handleSubmit();
        } else if (selectedAnswers[activeQuestionIdx] !== undefined) {
          e.preventDefault();
          const nextIdx = Math.min(total - 1, activeQuestionIdx + 1);
          setActiveQuestionIdx(nextIdx);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [submitted, selectedAnswers, allAnswered, activeQuestionIdx, total, handleSubmit]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border bg-blue-50 text-blue-700 border-blue-200">
              <Headphones className="w-3.5 h-3.5" />
              Listening Section
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500 font-medium">Academic Talk</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">{task.title}</h2>
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 flex-wrap">
            <span>Official 2026 Academic Lecture (~2 mins)</span>
            <span aria-hidden="true">·</span>
            <span>Speaker: {speakerName} ({gender})</span>
            <span aria-hidden="true">·</span>
            <span>{task.questions.length} Questions</span>
            <span aria-hidden="true">·</span>
            <span className="capitalize">{task.level || 'Advanced'}</span>
            {task.topic && (
              <>
                <span aria-hidden="true">·</span>
                <span className="capitalize text-slate-600 font-medium">{task.topic}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
            <Keyboard className="w-3.5 h-3.5 text-slate-400" />
            <span>⌨️ <strong className="font-semibold text-slate-800">Enter</strong>: Next item</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span><strong className="font-semibold text-teal-800">Ctrl + Enter</strong>: Submit</span>
          </div>
        </div>
      </div>

      {/* Grid: Audio & Notes on Left, 4 Questions on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Academic Talk Audio Player & Notes */}
        <div className="lg:col-span-6 space-y-4 lg:sticky lg:top-4 max-h-[85vh] overflow-y-auto">
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl p-6 shadow-md">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-semibold text-teal-400 uppercase tracking-wider">
                  Academic Lecture Audio
                </div>
                <div className="text-sm font-medium text-slate-200">{speakerName}</div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-700/60 mb-5">
              <div className="flex items-center justify-between text-xs text-slate-300 mb-2">
                <span>Lecture Topic: <strong className="text-white">{task.title}</strong></span>
                <span className="capitalize text-slate-400">{gender} voice</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Listen to the professor explain this concept. Take notes as you listen just like during the actual TOEFL iBT test.
              </p>
            </div>

            <div className="flex items-center justify-between gap-3">
              <button
                onClick={handlePlayAudio}
                className={`flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition-all shadow-md cursor-pointer ${
                  isPlaying
                    ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 animate-pulse'
                    : 'bg-teal-500 hover:bg-teal-400 text-slate-950'
                }`}
              >
                {isLoadingAudio ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Loading...</span>
                  </>
                ) : isPlaying ? (
                  <>
                    <Pause className="w-4 h-4" />
                    <span>Pause Lecture</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>{playCount > 0 ? 'Replay Lecture' : 'Play Academic Talk'}</span>
                  </>
                )}
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowNotes(!showNotes)}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  {showNotes ? 'Hide Notepad' : 'Notepad'}
                </button>

                <button
                  onClick={() => setShowTranscript(!showTranscript)}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-slate-800/80 text-slate-200 hover:text-white hover:bg-slate-700 border border-slate-700/60 transition-colors cursor-pointer"
                >
                  {showTranscript ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showTranscript ? 'Hide Script' : 'Show Script'}
                </button>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-700/60 flex items-center gap-2 text-xs text-slate-400">
              <Volume2 className="w-4 h-4 text-teal-400" />
              <span>
                {isPlaying
                  ? `Lecture playing (${speakerName})...`
                  : playCount > 0
                  ? `Played ${playCount} time${playCount > 1 ? 's' : ''}`
                  : 'Ready to listen — click Play Academic Talk'}
              </span>
            </div>

            {/* Notepad for Test Taker */}
            {showNotes && (
              <div className="mt-4 pt-3 border-t border-slate-700/60">
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Your Scratchpad Notes (Optional):
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Jot down key points, cause-and-effect relationships, and terminology here while listening..."
                  rows={4}
                  className="w-full bg-slate-950/80 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-hidden focus:ring-1 focus:ring-teal-500"
                />
              </div>
            )}

            {/* Revealed Script */}
            {showTranscript && (
              <div className="mt-4 p-4 rounded-xl bg-slate-950/70 border border-slate-700 text-sm text-slate-200 leading-relaxed font-normal">
                <div className="text-[11px] font-semibold text-teal-400 uppercase tracking-wider mb-1">
                  Full Lecture Script:
                </div>
                &ldquo;{cleanScript}&rdquo;
              </div>
            )}
          </div>
        </div>

        {/* Right Column: 4 Comprehension Questions */}
        <div className="lg:col-span-6 space-y-5">
          {!listeningAudioFinished && !submitted ? (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <p className="text-sm text-slate-700 font-medium leading-relaxed">
                🎧 Listen to the audio track completely. The comprehension questions will appear automatically once the audio finishes.
              </p>
              <button
                type="button"
                onClick={() => setListeningAudioFinished(true)}
                className="text-xs font-semibold text-teal-700 hover:text-teal-900 underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                Skip Audio &amp; Show Questions
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Comprehension Questions</span>
                <span className="text-xs text-slate-500 font-mono">
                  {Object.keys(selectedAnswers).length}/{total} Answered
                </span>
              </div>

          {task.questions.map((q, qIdx) => {
            const userChoice = selectedAnswers[qIdx];
            const isCorrect = userChoice === q.answer;

            return (
              <div
                key={qIdx}
                className={`bg-white border rounded-xl p-5 shadow-xs transition-colors ${
                  submitted
                    ? isCorrect
                      ? 'border-emerald-200 bg-emerald-50/20'
                      : 'border-rose-200 bg-rose-50/20'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex items-start gap-2.5 mb-3.5">
                  <span className="flex items-center justify-center w-6 h-6 rounded-md bg-slate-100 text-slate-700 text-xs font-bold shrink-0">
                    {qIdx + 1}
                  </span>
                  <p className="text-sm font-semibold text-slate-900 leading-snug">{q.q}</p>
                </div>

                <div className="space-y-2">
                  {q.options.map((opt, optIdx) => {
                    const isSelected = userChoice === optIdx;
                    const isRightOption = q.answer === optIdx;

                    let optionClasses =
                      'border-slate-200 bg-slate-50/50 hover:bg-slate-100/70 text-slate-800';

                    if (submitted) {
                      if (isRightOption) {
                        optionClasses = 'border-emerald-500 bg-emerald-50 text-emerald-900 font-medium';
                      } else if (isSelected && !isRightOption) {
                        optionClasses = 'border-rose-400 bg-rose-50 text-rose-900';
                      } else {
                        optionClasses = 'border-slate-200 bg-white text-slate-400 opacity-60';
                      }
                    } else if (isSelected) {
                      optionClasses = 'border-teal-700 bg-teal-50/60 text-teal-900 font-medium ring-1 ring-teal-700';
                    }

                    return (
                      <label
                        key={optIdx}
                        onClick={() => handleSelect(qIdx, optIdx)}
                        className={`flex items-start gap-3 p-3 rounded-lg border text-xs sm:text-sm cursor-pointer transition-all ${optionClasses}`}
                      >
                        <input
                          type="radio"
                          name={`lat-question-${qIdx}`}
                          checked={isSelected}
                          onChange={() => handleSelect(qIdx, optIdx)}
                          disabled={submitted}
                          className="mt-0.5 text-teal-700 focus:ring-teal-700 shrink-0"
                        />
                        <span className="leading-snug">{opt}</span>
                      </label>
                    );
                  })}
                </div>

                {submitted && (
                  <div className="mt-3.5 pt-3 border-t border-slate-200/80 text-xs leading-relaxed">
                    <div className="flex items-start gap-1.5 text-slate-700">
                      <HelpCircle className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <strong className={isCorrect ? 'text-emerald-700' : 'text-slate-800'}>
                          {isCorrect ? 'Correct!' : 'Official Explanation:'}
                        </strong>{' '}
                        <span>{q.why || q.explanation || 'Supported directly by the academic talk.'}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            {!submitted ? (
              <button
                onClick={handleSubmit}
                disabled={!allAnswered}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 disabled:hover:bg-teal-700 rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                Submit Answers
              </button>
            ) : (
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  Retake
                </button>
                {onNextTask && (
                  <button
                    onClick={onNextTask}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors cursor-pointer"
                  >
                    Next Lecture
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {submitted && (
              <div className="flex items-center gap-3 text-xs sm:text-sm bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-lg">
                <span>
                  Score: <strong className="font-mono text-slate-900">{score}</strong>/{total}
                </span>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <span>
                  Est. Scaled: <strong className="font-mono text-teal-800">Band {convertScaledToBand6(convertToScaledScore(score, total)).toFixed(1)} / 6.0</strong>
                </span>
              </div>
            )}
          </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
