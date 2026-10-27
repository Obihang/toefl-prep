import React from 'react';
import {
  Volume2,
  RotateCcw,
  Clock,
  Play,
  Pause,
  RefreshCw,
  Mic,
  MicOff,
  Loader2,
} from 'lucide-react';

export interface SpeakingControlsProps {
  currentQIndex: number;
  totalQuestions: number;
  currentQ: {
    question: string;
    prepTimeSeconds: number;
    responseTimeSeconds: number;
    suggestedPoints: string[];
  };
  isPlayingAudio: boolean;
  audioError: string | null;
  onHearQuestion: () => void;
  onRestartQuestionAudio: () => void;
  timerMode: 'idle' | 'prep' | 'speaking';
  timeLeft: number;
  onStartSimulation: () => void;
  onStopSimulation: () => void;
  hasRecording: boolean;
  isPlayingRecording: boolean;
  onPlayUserRecording: () => void;
  onRetryTranscription: () => void;
  isTranscribing: boolean;
  transcriptionError: string | null;
  isRecording: boolean;
  transcribeSeconds: number;
  onManualMicToggle: () => void;
  autoStart: boolean;
  onSetAutoStart: (val: boolean) => void;
  audioLevel: number;
  recordingSeconds: number;
}

export const SpeakingControls: React.FC<SpeakingControlsProps> = ({
  currentQIndex,
  totalQuestions,
  currentQ,
  isPlayingAudio,
  audioError,
  onHearQuestion,
  onRestartQuestionAudio,
  timerMode,
  timeLeft,
  onStartSimulation,
  onStopSimulation,
  hasRecording,
  isPlayingRecording,
  onPlayUserRecording,
  onRetryTranscription,
  isTranscribing,
  transcriptionError,
  isRecording,
  transcribeSeconds,
  onManualMicToggle,
  autoStart,
  onSetAutoStart,
  audioLevel,
  recordingSeconds,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <span className="text-xs font-semibold text-teal-700 uppercase tracking-wider">
            Question {currentQIndex + 1} of {totalQuestions}
          </span>
          <h3 className="text-base sm:text-lg font-semibold text-slate-900 leading-snug">
            {currentQ.question}
          </h3>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              onClick={onHearQuestion}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                isPlayingAudio
                  ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 border-amber-500 font-semibold'
                  : 'text-slate-700 bg-slate-50 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {isPlayingAudio ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Volume2 className="w-3.5 h-3.5 text-teal-700" />}
              {isPlayingAudio ? '⏹ Stop Audio' : 'Hear Question'}
            </button>

            <button
              onClick={onRestartQuestionAudio}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
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
            <span>Prep: <strong className="font-mono text-slate-800">2s</strong></span>
          </div>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <div>
            <span>Response: <strong className="font-mono text-slate-800">{currentQ.responseTimeSeconds}s</strong></span>
          </div>
        </div>

        {timerMode === 'idle' ? (
          <button
            onClick={onStartSimulation}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
              {timerMode === 'prep' ? `Get ready to speak... (${timeLeft}s)` : `RECORDING: ${timeLeft}s`}
            </div>

            <button
              onClick={onStopSimulation}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
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
            {hasRecording && (
              <>
                <button
                  type="button"
                  onClick={onPlayUserRecording}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors shrink-0 cursor-pointer ${
                    isPlayingRecording
                      ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                      : 'border-teal-300 bg-teal-50 text-teal-900 hover:bg-teal-100'
                  }`}
                  title={isPlayingRecording ? 'Click to stop playback' : 'Listen to your exact recorded voice'}
                >
                  {isPlayingRecording ? (
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
                  onClick={onRetryTranscription}
                  disabled={isTranscribing || isRecording}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    transcriptionError
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
              onClick={onManualMicToggle}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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
                onChange={(e) => onSetAutoStart(e.target.checked)}
                className="rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
              />
              <label htmlFor="autostart" className="cursor-pointer">Auto-start on sound</label>
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
              <div className="w-24 h-2.5 bg-rose-100 rounded-full overflow-hidden border border-rose-200 p-0.5 flex items-center">
                <div
                  className="h-full bg-rose-500 rounded-full transition-all duration-75"
                  style={{ width: `${Math.min(100, Math.max(5, audioLevel))}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
