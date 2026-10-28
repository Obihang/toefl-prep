import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Volume2, CheckCircle2, ArrowRight, Eye, EyeOff, HelpCircle, Headphones, Loader2 } from 'lucide-react';
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

export interface ListeningChooseResponseTask {
  id?: string;
  title: string;
  audioPrompt?: string;
  promptAudioScript?: string;
  script?: string;
  spokenPrompt?: string;
  prompt?: string;
  speakerName?: string;
  speakerGender?: 'male' | 'female';
  options: string[];
  answer: number;
  correctAnswer?: number;
  why?: string;
  explanation?: string;
  category?: string;
  level?: string;
  difficulty?: string;
  topic?: string;
}

interface Props {
  task: ListeningChooseResponseTask;
  onNextTask?: () => void;
  onComplete?: (result: number) => void;
}

export const ListeningChooseResponseView: React.FC<Props> = ({
  task,
  onNextTask,
  onComplete,
}) => {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [playCount, setPlayCount] = useState(0);

  const playbackSessionRef = useRef(0);

  const promptText =
    task.audioPrompt ||
    task.promptAudioScript ||
    task.script ||
    task.spokenPrompt ||
    task.prompt ||
    '';
  const cleanPrompt = stripSpeakerAndFormatting(promptText);
  const speakerName = task.speakerName || 'Campus Speaker';
  const gender: 'male' | 'female' =
    task.speakerGender === 'female' ? 'female' : 'male';
  const voiceName =
    gender === 'female' ? 'en-US-AriaNeural' : 'en-US-ChristopherNeural';

  const correctAnswerIdx =
    typeof task.answer === 'number'
      ? task.answer
      : Number(task.correctAnswer ?? 0);
  const explanation =
    task.why ||
    task.explanation ||
    'Most natural and contextually appropriate response in this campus situation.';

  // Pre-warm TTS audio immediately on mount
  useEffect(() => {
    if (cleanPrompt) {
      prefetchSpeechAudio(cleanPrompt, voiceName, gender).catch(() => {});
    }
    return () => {
      stopSpeaking();
    };
  }, [cleanPrompt, voiceName, gender]);

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
      const chunks = chunkTextForTTS(cleanPrompt);
      if (chunks.length > 0) {
        await fetchCloudTtsAudio(chunks[0], gender, voiceName);
      }

      if (playbackSessionRef.current !== currentSession) return;

      await speakWithCloudTTS(cleanPrompt, gender, {
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

  const handleSelectOption = (idx: number) => {
    if (submitted) return;
    setSelectedIdx(idx);
  };

  const handleSubmit = () => {
    if (selectedIdx === null || submitted) return;
    setSubmitted(true);
    setShowTranscript(true);

    const isCorrect = selectedIdx === correctAnswerIdx;
    const scoreVal = isCorrect ? 1 : 0;
    const scaledScore = convertToScaledScore(scoreVal, 1);

    if (auth.currentUser && !isCorrect) {
      saveMistake(
        task.title,
        'listening-choose-response',
        task.options[selectedIdx] ?? 'No answer',
        task.options[correctAnswerIdx],
        explanation
      );
    }

    savePracticeRecord({
      taskType: 'listening-choose-response',
      taskTitle: task.title,
      section: 'Listening',
      score: scoreVal,
      maxScore: 1,
      scaledScore30: scaledScore,
      timeSpentSeconds: 30,
      feedbackSummary: isCorrect
        ? 'Correctly identified the appropriate spoken response (1/1)'
        : 'Selected incorrect conversational reply (0/1)',
    });

    onComplete?.(scaledScore);
  };

  const handleReset = () => {
    setSelectedIdx(null);
    setSubmitted(false);
    setShowTranscript(false);
    stopSpeaking();
    setIsPlaying(false);
  };

  const isCorrect = submitted && selectedIdx === correctAnswerIdx;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border bg-blue-50 text-blue-700 border-blue-200">
              <Headphones className="w-3.5 h-3.5" />
              Listening Section
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500 font-medium">
              Choose a Response
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            {task.title}
          </h2>
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 flex-wrap">
            <span>Official 2026 Short Campus Exchange</span>
            <span aria-hidden="true">·</span>
            <span>Speaker: {speakerName} ({gender})</span>
            <span aria-hidden="true">·</span>
            <span className="capitalize">{task.level || 'Intermediate'}</span>
            {task.category && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-slate-600 font-medium">{task.category}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Spoken Prompt Audio Card */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-6 sm:p-8 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-teal-400 uppercase tracking-wider">
              Spoken Prompt
            </span>
            <p className="text-sm text-slate-300">
              Listen to {speakerName}. In the official test, you only hear this exchange once or twice.
            </p>
          </div>

          <div className="flex items-center gap-3">
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
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Loading...</span>
                </>
              ) : isPlaying ? (
                <>
                  <Pause className="w-5 h-5" />
                  <span>Pause Audio</span>
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-current" />
                  <span>{playCount > 0 ? 'Replay Prompt' : 'Play Spoken Prompt'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Audio Wave / Status Indicator */}
        <div className="mt-5 pt-4 border-t border-slate-700/60 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-teal-400" />
            <span>
              {isPlaying
                ? `Playing audio (${speakerName})...`
                : playCount > 0
                ? `Played ${playCount} time${playCount > 1 ? 's' : ''}`
                : 'Ready to listen — click Play Spoken Prompt'}
            </span>
          </div>

          {(submitted || showTranscript) && (
            <button
              onClick={() => setShowTranscript(!showTranscript)}
              className="flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 cursor-pointer"
            >
              {showTranscript ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showTranscript ? 'Hide Prompt Text' : 'View Spoken Script'}
            </button>
          )}
        </div>

        {/* Revealed Transcript (if toggled or submitted) */}
        {showTranscript && (
          <div className="mt-4 p-4 rounded-xl bg-slate-950/60 border border-slate-700 text-sm text-slate-200 leading-relaxed font-normal">
            <div className="text-[11px] font-semibold text-teal-400 uppercase tracking-wider mb-1">
              Spoken Transcript ({speakerName}):
            </div>
            &ldquo;{cleanPrompt}&rdquo;
          </div>
        )}
      </div>

      {/* Answer Choices */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
            Which response is best? Select option A, B, C, or D:
          </span>
          <span className="text-xs text-slate-400 font-mono">
            {selectedIdx !== null ? '1 of 1 selected' : 'Choose 1 option'}
          </span>
        </div>

        <div className="space-y-2.5">
          {task.options.map((opt, optIdx) => {
            const isSelected = selectedIdx === optIdx;
            const isRightOption = correctAnswerIdx === optIdx;
            const optionLetter = String.fromCharCode(65 + optIdx);

            let optionClasses =
              'border-slate-200 bg-white hover:bg-slate-50 text-slate-800';

            if (submitted) {
              if (isRightOption) {
                optionClasses = 'border-emerald-500 bg-emerald-50 text-emerald-900 font-medium ring-1 ring-emerald-500';
              } else if (isSelected && !isRightOption) {
                optionClasses = 'border-rose-400 bg-rose-50 text-rose-900';
              } else {
                optionClasses = 'border-slate-200 bg-white text-slate-400 opacity-60';
              }
            } else if (isSelected) {
              optionClasses =
                'border-teal-700 bg-teal-50/70 text-teal-900 font-medium ring-2 ring-teal-700';
            }

            return (
              <label
                key={optIdx}
                onClick={() => handleSelectOption(optIdx)}
                className={`flex items-start gap-3.5 p-4 rounded-xl border text-sm sm:text-base cursor-pointer transition-all ${optionClasses}`}
              >
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                    submitted && isRightOption
                      ? 'bg-emerald-600 text-white'
                      : isSelected
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {optionLetter}
                </div>
                <input
                  type="radio"
                  name="choose-response-option"
                  checked={isSelected}
                  onChange={() => handleSelectOption(optIdx)}
                  disabled={submitted}
                  className="sr-only"
                />
                <span className="leading-snug pt-0.5">{opt}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Post-Submission Explanation */}
      {submitted && (
        <div
          className={`p-5 rounded-xl border leading-relaxed text-sm ${
            isCorrect
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-start gap-2">
            <HelpCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-semibold mb-1">
                {isCorrect ? 'Correct Response!' : 'Incorrect Choice'}
              </strong>
              <p className="text-slate-800 text-xs sm:text-sm">{explanation}</p>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        {!submitted ? (
          <button
            onClick={handleSubmit}
            disabled={selectedIdx === null}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 disabled:hover:bg-teal-700 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            Submit Response
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
                Next Spoken Item
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {submitted && (
          <div className="flex items-center gap-3 text-xs sm:text-sm bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-lg">
            <span>
              Score: <strong className="font-mono text-slate-900">{isCorrect ? 1 : 0}</strong>/1
            </span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span>
              Est. Scaled: <strong className="font-mono text-teal-800">Band {isCorrect ? '6.0' : '1.0'} / 6.0</strong>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
