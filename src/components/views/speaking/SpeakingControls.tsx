import React from 'react';
import {
  Volume2,
  Play,
  Pause,
  Mic,
  MicOff,
  Loader2,
} from 'lucide-react';

export interface SpeakingControlsProps {
  currentQIndex: number;
  totalQuestions: number;
  currentQ: {
    question: string;
    prepTimeSeconds?: number;
    responseTimeSeconds: number;
    suggestedPoints: string[];
  };
  isPlayingAudio: boolean;
  isLoadingAudio?: boolean;
  audioError: string | null;
  onHearQuestion: () => void;
  onRestartQuestionAudio?: () => void;
  timerMode?: 'idle' | 'speaking';
  timeLeft: number;
  onStartSimulation?: () => void;
  onStopSimulation?: () => void;
  hasRecording: boolean;
  isPlayingRecording: boolean;
  onPlayUserRecording: () => void;
  onRetryTranscription?: () => void;
  isTranscribing: boolean;
  transcriptionError?: string | null;
  isRecording: boolean;
  transcribeSeconds: number;
  onManualMicToggle: () => void;
  autoStart?: boolean;
  onSetAutoStart?: (val: boolean) => void;
  audioLevel?: number;
  recordingSeconds?: number;
  showPromptText?: boolean;
  hasAnswerText?: boolean;
}

export const SpeakingControls: React.FC<SpeakingControlsProps> = ({
  currentQIndex,
  totalQuestions,
  currentQ,
  isPlayingAudio,
  isLoadingAudio = false,
  audioError,
  onHearQuestion,
  timeLeft,
  hasRecording,
  isPlayingRecording,
  onPlayUserRecording,
  isTranscribing,
  isRecording,
  transcribeSeconds,
  onManualMicToggle,
  audioLevel,
  showPromptText = true,
  hasAnswerText = false,
}) => {
  const allowedSeconds = currentQ.responseTimeSeconds || 45;
  const isRevealed = showPromptText || hasRecording || hasAnswerText;

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-teal-700 uppercase tracking-wider">
              Question {currentQIndex + 1} of {totalQuestions}
            </span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span className="text-[11px] font-mono text-slate-500">
              0s Prep · {allowedSeconds}s Response
            </span>
          </div>
          {isRevealed ? (
            <h3 className="text-base sm:text-lg font-semibold text-slate-900 leading-snug">
              {currentQ.question}
            </h3>
          ) : (
            <div className="p-3 bg-teal-50/70 border border-teal-200/90 rounded-lg text-xs text-teal-900 flex items-center gap-2">
              <span className="text-sm">🎧</span>
              <span>Listen to the interviewer's question and speak after the beep (question text is hidden just like the real exam).</span>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={onHearQuestion}
              disabled={isLoadingAudio}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isPlayingAudio
                  ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 border-amber-500 font-semibold'
                  : isLoadingAudio
                  ? 'bg-teal-100 text-teal-800 border-teal-300 opacity-90'
                  : 'bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100'
              }`}
            >
              {isLoadingAudio ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-700" />
              ) : isPlayingAudio ? (
                <Pause className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
              <span>{isLoadingAudio ? 'Loading...' : isPlayingAudio ? 'Stop Audio' : 'Hear Question'}</span>
            </button>

            <button
              type="button"
              onClick={onManualMicToggle}
              disabled={isTranscribing}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                isRecording
                  ? 'bg-rose-600 border-rose-600 text-white shadow-xs animate-pulse hover:bg-rose-700'
                  : isTranscribing
                  ? 'bg-slate-100 border-slate-300 text-slate-600 cursor-wait'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400'
              }`}
              title={isRecording ? 'Click or press Enter to finish speaking' : 'Click to record your 45s interview response'}
            >
              {isRecording ? (
                <>
                  <MicOff className="w-3.5 h-3.5 text-white" />
                  <span>Stop (Enter) · {timeLeft}s</span>
                </>
              ) : isTranscribing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
                  <span>Transcribing... {transcribeSeconds}s</span>
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5 text-rose-600" />
                  <span>Speak ({allowedSeconds}s)</span>
                </>
              )}
            </button>

            {hasRecording && (
              <button
                type="button"
                onClick={onPlayUserRecording}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                  isPlayingRecording
                    ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
                title={isPlayingRecording ? 'Stop playback' : 'Listen to your recorded voice'}
              >
                {isPlayingRecording ? (
                  <>
                    <Pause className="w-3.5 h-3.5 fill-current text-slate-950" />
                    <span>Stop</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 text-teal-700 fill-teal-700" />
                    <span>My Voice</span>
                  </>
                )}
              </button>
            )}
          </div>
          {audioError && (
            <div className="text-[11px] text-rose-600 font-mono text-right max-w-sm">
              Audio failure: {audioError}
            </div>
          )}
        </div>
      </div>

      {/* Suggested Talking Points (only shown when question text is revealed) */}
      {isRevealed && currentQ.suggestedPoints && currentQ.suggestedPoints.length > 0 && (
        <div className="border border-slate-100 bg-slate-50/60 rounded-lg p-3 text-xs">
          <span className="font-semibold text-slate-700">Key Points to Address:</span>
          <ul className="list-disc list-inside mt-1 space-y-0.5 text-slate-600">
            {currentQ.suggestedPoints.map((pt, i) => (
              <li key={i}>{pt}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Live input-level meter and 45s countdown during active recording */}
      {isRecording && (
        <div className="flex items-center justify-between gap-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-2.5 rounded-lg flex-wrap animate-in fade-in shadow-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="relative flex h-2.5 w-2.5 items-center justify-center shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600"></span>
            </span>
            <span className="font-bold text-rose-900">Recording Active</span>
            <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded font-mono font-bold text-[11px]">
              0:{String(Math.max(0, timeLeft)).padStart(2, '0')} left (of {allowedSeconds}s)
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-600">
              Speak clearly (0s prep). Press <strong>Enter</strong> or click <strong>Stop (Enter)</strong> when done.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-semibold text-slate-700">Mic Pulse:</span>
            <div className="w-24 h-2.5 bg-rose-100 rounded-full overflow-hidden border border-rose-200 p-0.5 flex items-center">
              <div
                className="h-full bg-rose-500 rounded-full transition-all duration-75"
                style={{ width: `${Math.min(100, Math.max(5, audioLevel ?? 0))}%` }}
              />
            </div>
            <span className="text-[10px] font-mono font-semibold text-slate-600 w-8 text-right">{audioLevel ?? 0}%</span>
          </div>
        </div>
      )}
    </div>
  );
};
