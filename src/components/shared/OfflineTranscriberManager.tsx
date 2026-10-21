import React, { useState, useEffect, useRef } from 'react';
import {
  checkModelCachedStatus,
  downloadAndWarmupModel,
  deleteCachedModel,
  getWhisperModelChoice,
  setWhisperModelChoice,
  WHISPER_MODELS,
  WhisperModelChoice,
  ModelDownloadProgress,
  transcribeWithLocalWhisper,
  getOptimalWasmThreads,
  setWasmThreadsOverride,
} from '../../utils/localWhisperStt';
import { createVoiceSession, VoiceSession } from '../../utils/audioSpeech';
import {
  Download,
  CheckCircle2,
  Trash2,
  Mic,
  MicOff,
  Volume2,
  HardDrive,
  Loader2,
  Play,
  Pause,
  XCircle,
  AlertCircle,
  Cpu,
} from 'lucide-react';

interface Props {
  compact?: boolean;
  onModelChanged?: () => void;
}

export const OfflineTranscriberManager: React.FC<Props> = ({ compact, onModelChanged }) => {
  const [cachedMap, setCachedMap] = useState<Record<string, boolean>>({});
  const [activeModel, setActiveModel] = useState<WhisperModelChoice>('Xenova/whisper-base.en');
  const [downloadingModelId, setDownloadingModelId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<ModelDownloadProgress | null>(null);
  const [persistedStorage, setPersistedStorage] = useState<boolean | null>(null);

  // Quick 3-Second Test State
  const [isTestRecording, setIsTestRecording] = useState(false);
  const [isTestTranscribing, setIsTestTranscribing] = useState(false);
  const [testCountdown, setTestCountdown] = useState<number | null>(null);
  const [testResultText, setTestResultText] = useState<string | null>(null);
  const [testDurationMs, setTestDurationMs] = useState<number | null>(null);
  const [testModelUsed, setTestModelUsed] = useState<string | null>(null);
  const [testAudioBlob, setTestAudioBlob] = useState<Blob | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [isPlayingTestAudio, setIsPlayingTestAudio] = useState(false);

  const activePlayingKeyRef = useRef<string | null>(null);
  const testAudioRef = useRef<HTMLAudioElement | null>(null);
  const voiceSessionRef = useRef<VoiceSession | null>(null);
  const countdownIntervalRef = useRef<any>(null);
  const testTimerRef = useRef<any>(null);
  const testAbortControllerRef = useRef<AbortController | null>(null);

  const stopAllAudio = () => {
    if (testAudioRef.current) {
      try {
        testAudioRef.current.pause();
        testAudioRef.current.currentTime = 0;
      } catch {}
      testAudioRef.current = null;
    }
    activePlayingKeyRef.current = null;
    setIsPlayingTestAudio(false);
  };

  const handlePlayTestAudio = () => {
    const itemKey = 'test_audio';
    const wasPlayingThis = activePlayingKeyRef.current === itemKey;
    stopAllAudio();
    if (wasPlayingThis || !testAudioBlob) {
      return;
    }

    const url = URL.createObjectURL(testAudioBlob);
    const audio = new Audio(url);
    audio.loop = false;
    activePlayingKeyRef.current = itemKey;
    testAudioRef.current = audio;
    setIsPlayingTestAudio(true);

    audio.onended = () => {
      if (testAudioRef.current === audio) testAudioRef.current = null;
      if (activePlayingKeyRef.current === itemKey) activePlayingKeyRef.current = null;
      setIsPlayingTestAudio(false);
      URL.revokeObjectURL(url);
    };

    audio.onerror = () => {
      if (testAudioRef.current === audio) testAudioRef.current = null;
      if (activePlayingKeyRef.current === itemKey) activePlayingKeyRef.current = null;
      setIsPlayingTestAudio(false);
      URL.revokeObjectURL(url);
    };

    audio.play().catch(() => {
      if (testAudioRef.current === audio) testAudioRef.current = null;
      if (activePlayingKeyRef.current === itemKey) activePlayingKeyRef.current = null;
      setIsPlayingTestAudio(false);
      URL.revokeObjectURL(url);
    });
  };

  const refreshCacheStatuses = async () => {
    const currentActive = getWhisperModelChoice();
    setActiveModel(currentActive);

    const statuses: Record<string, boolean> = {};
    for (const m of WHISPER_MODELS) {
      statuses[m.id] = await checkModelCachedStatus(m.id);
    }
    setCachedMap(statuses);

    if (typeof navigator !== 'undefined' && navigator.storage?.persisted) {
      try {
        const isPersisted = await navigator.storage.persisted();
        setPersistedStorage(isPersisted);
      } catch {}
    }
  };

  useEffect(() => {
    refreshCacheStatuses();
    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (testTimerRef.current) clearTimeout(testTimerRef.current);
      if (testAbortControllerRef.current) testAbortControllerRef.current.abort();
      if (voiceSessionRef.current) voiceSessionRef.current.abort();
    };
  }, []);

  const handleDownload = async (modelId: WhisperModelChoice) => {
    setDownloadingModelId(modelId);
    setTestError(null);
    try {
      await downloadAndWarmupModel(modelId, (p) => {
        setDownloadProgress(p);
      });
      setActiveModel(modelId);
      setWhisperModelChoice(modelId);
      await refreshCacheStatuses();
      onModelChanged?.();
    } catch (err: any) {
      setTestError(err?.message || 'Failed to download and verify Whisper model.');
    } finally {
      setDownloadingModelId(null);
      setDownloadProgress(null);
    }
  };

  const handleSetActive = (modelId: WhisperModelChoice) => {
    setActiveModel(modelId);
    setWhisperModelChoice(modelId);
    onModelChanged?.();
  };

  const handleDelete = async (modelId: WhisperModelChoice) => {
    if (window.confirm(`Delete cached weights for ${modelId}? You can re-download anytime.`)) {
      await deleteCachedModel(modelId);
      await refreshCacheStatuses();
      onModelChanged?.();
    }
  };

  const stopRecordingAndTranscribe = async () => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    if (testTimerRef.current) clearTimeout(testTimerRef.current);
    setTestCountdown(null);

    if (!voiceSessionRef.current) return;

    const session = voiceSessionRef.current;
    voiceSessionRef.current = null;
    setIsTestRecording(false);
    setIsTestTranscribing(true);

    const abortController = new AbortController();
    testAbortControllerRef.current = abortController;

    const currentModel = getWhisperModelChoice();
    const modelInfo = WHISPER_MODELS.find((m) => m.id === currentModel);
    const modelLabel = modelInfo ? modelInfo.name : currentModel.split('/').pop() || currentModel;

    try {
      const res = await session.stop();
      if (abortController.signal.aborted) return;

      if (res.audioBlob) {
        setTestAudioBlob(res.audioBlob);
        const start = Date.now();
        const localRes = await transcribeWithLocalWhisper(res.audioBlob);
        if (abortController.signal.aborted) return;

        setTestResultText(localRes.transcript || '');
        setTestDurationMs(Date.now() - start);
        setTestModelUsed(modelLabel);
      }
    } catch (err: any) {
      if (!abortController.signal.aborted) {
        setTestError(err?.message || 'Test transcription failed.');
      }
    } finally {
      setIsTestTranscribing(false);
      testAbortControllerRef.current = null;
    }
  };

  const handleStartTestMic = async () => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    if (testTimerRef.current) clearTimeout(testTimerRef.current);

    setTestError(null);
    setTestResultText(null);
    setTestAudioBlob(null);

    if (isTestRecording) {
      await stopRecordingAndTranscribe();
      return;
    }

    const session = createVoiceSession({
      onStatusChange: (status) => {
        if (status === 'listening') setIsTestRecording(true);
        if (status === 'processing') setIsTestTranscribing(true);
        if (status === 'idle') {
          setIsTestRecording(false);
          setIsTestTranscribing(false);
        }
      },
    });

    voiceSessionRef.current = session;
    setTestCountdown(3);

    try {
      await session.start();
      setIsTestRecording(true);

      let secondsLeft = 3;
      countdownIntervalRef.current = setInterval(() => {
        secondsLeft -= 1;
        if (secondsLeft > 0) {
          setTestCountdown(secondsLeft);
        } else {
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          setTestCountdown(null);
          stopRecordingAndTranscribe();
        }
      }, 1000);
    } catch (err: any) {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      setTestCountdown(null);
      setIsTestRecording(false);
      setTestError(err?.message || 'Could not open microphone.');
    }
  };

  const handleCancelTest = () => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    if (testTimerRef.current) clearTimeout(testTimerRef.current);
    setTestCountdown(null);

    if (testAbortControllerRef.current) {
      testAbortControllerRef.current.abort();
      testAbortControllerRef.current = null;
    }

    if (voiceSessionRef.current) {
      try {
        voiceSessionRef.current.abort();
      } catch {}
      voiceSessionRef.current = null;
    }

    setIsTestRecording(false);
    setIsTestTranscribing(false);
    setTestError('Test cancelled.');
  };

  return (
    <div className="space-y-4">
      {/* Header & Storage Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 text-white p-4 rounded-xl shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-teal-400" />
            <h3 className="text-base font-bold tracking-tight">Offline Speech Transcriber Models</h3>
          </div>
          <p className="text-xs text-slate-300 mt-1">
            Pre-download and permanently cache heavy Whisper STT models in browser storage for 100% offline, zero-API speech practice.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0 text-xs">
          <span className="px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-md font-mono text-slate-300">
            Storage: {persistedStorage ? 'Persistent ✅' : 'Standard Cache'}
          </span>
          {(() => {
            const threadInfo = getOptimalWasmThreads();
            return (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-md font-mono text-slate-300">
                <Cpu className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                <span>CPU: {threadInfo.logicalCores} cores</span>
                <span className="text-slate-500">•</span>
                <span>Threads:</span>
                <select
                  value={threadInfo.isManual ? threadInfo.activeThreads : 'auto'}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'auto') {
                      setWasmThreadsOverride('auto');
                    } else {
                      setWasmThreadsOverride(parseInt(val, 10));
                    }
                    refreshCacheStatuses();
                  }}
                  className="bg-slate-900 text-teal-300 font-bold border border-slate-700 rounded px-1.5 py-0.5 text-[11px] focus:outline-hidden cursor-pointer"
                >
                  <option value="auto">Auto ({threadInfo.autoThreads} threads)</option>
                  {Array.from({ length: threadInfo.logicalCores }).map((_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1} thread{i > 0 ? 's' : ''}
                    </option>
                  ))}
                </select>
              </div>
            );
          })()}
        </div>
      </div>

      {testError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{testError}</span>
          </div>
          <button
            onClick={() => setTestError(null)}
            className="text-[11px] font-semibold text-rose-700 hover:text-rose-900 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Model Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {WHISPER_MODELS.map((model) => {
          const isCached = cachedMap[model.id] || false;
          const isActive = activeModel === model.id;
          const isDownloading = downloadingModelId === model.id;

          return (
            <div
              key={model.id}
              className={`border rounded-xl p-4 flex flex-col justify-between transition-all ${
                isActive
                  ? 'border-teal-500 bg-teal-50/20 ring-2 ring-teal-200'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      {model.name}
                      {model.recommended && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 rounded-md">
                          Recommended
                        </span>
                      )}
                    </h4>
                    <span className="text-[11px] font-mono text-slate-500 block mt-0.5">{model.badge}</span>
                  </div>

                  {isCached && (
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full flex items-center gap-1 shrink-0">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Cached
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-600 leading-snug">{model.accuracy}</p>
                <div className="text-[11px] text-slate-500 font-mono">Speed: {model.estSpeed}</div>
              </div>

              <div className="pt-4 border-t border-slate-100 mt-3 space-y-2">
                {isDownloading ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-teal-800 font-medium">
                      <span>Downloading model...</span>
                      <span className="font-mono">{downloadProgress?.progress || 0}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                      <div
                        className="h-full bg-teal-600 transition-all duration-150"
                        style={{ width: `${downloadProgress?.progress || 0}%` }}
                      />
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 truncate">
                      {downloadProgress?.file || 'Downloading weights...'} ({downloadProgress?.loadedMb || 0}/{downloadProgress?.totalMb || model.sizeMb} MB)
                    </div>
                  </div>
                ) : isCached ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    {isActive ? (
                      <span className="flex-1 py-1.5 px-2 text-center text-xs font-bold text-teal-800 bg-teal-100 border border-teal-300 rounded-lg">
                        ✓ Active Model
                      </span>
                    ) : (
                      <button
                        onClick={() => handleSetActive(model.id)}
                        className="flex-1 py-1.5 px-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors cursor-pointer"
                      >
                        Use This Model
                      </button>
                    )}

                    <button
                      onClick={() => handleDelete(model.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 border border-slate-200 transition-colors cursor-pointer"
                      title="Delete cached model files to free disk space"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleDownload(model.id)}
                    disabled={downloadingModelId !== null}
                    className="w-full py-2 px-3 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download & Save (~{model.sizeMb} MB)</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick 3-Second Mic Tester Widget */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <Mic className="w-4 h-4 text-teal-700" />
            <span>3-Second Transcriber & Noise Cancellation Test</span>
          </div>

          <div className="flex items-center gap-2">
            {(isTestRecording || isTestTranscribing) && (
              <button
                type="button"
                onClick={handleCancelTest}
                className="px-2.5 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded-lg transition flex items-center gap-1 cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Cancel Test</span>
              </button>
            )}

            <button
              onClick={handleStartTestMic}
              disabled={isTestTranscribing}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer ${
                isTestRecording
                  ? 'bg-rose-600 text-white border-rose-600 animate-pulse'
                  : isTestTranscribing
                  ? 'bg-teal-100 text-teal-800 border-teal-300 cursor-wait'
                  : 'bg-teal-700 hover:bg-teal-800 text-white border-teal-700 shadow-2xs'
              }`}
            >
              {isTestRecording ? (
                <>
                  <MicOff className="w-3.5 h-3.5" />
                  <span>Recording... {testCountdown !== null ? `${testCountdown}s` : ''}</span>
                </>
              ) : isTestTranscribing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-700" />
                  <span>Transcribing with Whisper...</span>
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5 text-white" />
                  <span>🧪 Record 3s Test Speech</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Outcome Box */}
        {(testAudioBlob || testResultText !== null) && (
          <div className="p-4 bg-white border border-teal-200 rounded-xl space-y-3 animate-in fade-in shadow-xs">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-teal-900 text-xs flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-teal-600" />
                  3-Second Test Complete
                </span>
                {testModelUsed && testDurationMs !== null && (
                  <span className="px-2.5 py-0.5 text-[11px] font-mono font-bold bg-teal-100 text-teal-900 border border-teal-300 rounded-md">
                    Transcribed in {(testDurationMs / 1000).toFixed(1)}s using {testModelUsed}
                  </span>
                )}
              </div>

              {testAudioBlob && (
                <button
                  type="button"
                  onClick={handlePlayTestAudio}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition flex items-center gap-1.5 cursor-pointer ${
                    isPlayingTestAudio
                      ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                      : 'text-teal-800 bg-teal-50 hover:bg-teal-100 border-teal-300'
                  }`}
                  title={isPlayingTestAudio ? 'Click to stop playback' : 'Listen to test recording'}
                >
                  {isPlayingTestAudio ? (
                    <>
                      <Pause className="w-3.5 h-3.5 fill-current text-slate-950" />
                      <span>⏹ Stop Playback</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 text-teal-700 fill-teal-700" />
                      <span>▶ Play Recorded Test Audio</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Detected Transcript
              </span>
              <p
                className={`p-3 rounded-lg border font-mono text-xs leading-relaxed ${
                  testResultText && testResultText.trim()
                    ? 'bg-slate-50 border-slate-200 text-slate-900 font-bold'
                    : 'bg-amber-50 border-amber-200 text-amber-900 italic'
                }`}
              >
                {testResultText && testResultText.trim()
                  ? `"${testResultText}"`
                  : 'No clear speech detected — try speaking closer to your earphone mic'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
