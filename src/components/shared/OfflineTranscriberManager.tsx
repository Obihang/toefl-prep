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
  Sparkles,
  Zap,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';

interface Props {
  compact?: boolean;
  onModelChanged?: () => void;
}

export const OfflineTranscriberManager: React.FC<Props> = ({ compact, onModelChanged }) => {
  const [cachedMap, setCachedMap] = useState<Record<string, boolean>>({});
  const [activeModel, setActiveModel] = useState<WhisperModelChoice>('Xenova/whisper-small.en');
  const [downloadingModelId, setDownloadingModelId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<ModelDownloadProgress | null>(null);
  const [persistedStorage, setPersistedStorage] = useState<boolean | null>(null);

  // Quick test state
  const [isTestRecording, setIsTestRecording] = useState(false);
  const [isTestTranscribing, setIsTestTranscribing] = useState(false);
  const [testResultText, setTestResultText] = useState<string | null>(null);
  const [testDurationMs, setTestDurationMs] = useState<number | null>(null);
  const [testAudioBlob, setTestAudioBlob] = useState<Blob | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const voiceSessionRef = useRef<VoiceSession | null>(null);

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

  const handleStartTestMic = async () => {
    setTestError(null);
    setTestResultText(null);
    setTestAudioBlob(null);

    if (isTestRecording && voiceSessionRef.current) {
      setIsTestTranscribing(true);
      try {
        const res = await voiceSessionRef.current.stop();
        if (res.audioBlob) {
          setTestAudioBlob(res.audioBlob);
          const start = Date.now();
          const localRes = await transcribeWithLocalWhisper(res.audioBlob);
          setTestResultText(localRes.transcript || '(No speech detected)');
          setTestDurationMs(Date.now() - start);
        }
      } catch (err: any) {
        setTestError(err?.message || 'Test transcription failed');
      } finally {
        setIsTestRecording(false);
        setIsTestTranscribing(false);
        voiceSessionRef.current = null;
      }
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
    try {
      await session.start();
      setIsTestRecording(true);
    } catch (err: any) {
      setIsTestRecording(false);
      setTestError(err?.message || 'Could not open microphone');
    }
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

        <div className="flex items-center gap-2 shrink-0 text-xs">
          <span className="px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-md font-mono text-slate-300">
            Storage: {persistedStorage ? 'Persistent ✅' : 'Standard Cache'}
          </span>
        </div>
      </div>

      {testError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{testError}</span>
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
                        className="flex-1 py-1.5 px-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors"
                      >
                        Use This Model
                      </button>
                    )}

                    <button
                      onClick={() => handleDelete(model.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 border border-slate-200 transition-colors"
                      title="Delete cached model files to free disk space"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleDownload(model.id)}
                    disabled={downloadingModelId !== null}
                    className="w-full py-2 px-3 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1.5"
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

      {/* Quick Mic Tester */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <Mic className="w-4 h-4 text-teal-700" />
            <span>Test Active Transcriber ({activeModel.split('/').pop()})</span>
          </div>

          <button
            onClick={handleStartTestMic}
            disabled={isTestTranscribing}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 ${
              isTestRecording
                ? 'bg-rose-600 text-white border-rose-600 animate-pulse'
                : isTestTranscribing
                ? 'bg-slate-200 text-slate-600 border-slate-300 cursor-wait'
                : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100'
            }`}
          >
            {isTestRecording ? (
              <>
                <MicOff className="w-3.5 h-3.5" /> Stop Test
              </>
            ) : isTestTranscribing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" /> Transcribing...
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5 text-teal-700" /> 🧪 Record 3s Test Speech
              </>
            )}
          </button>
        </div>

        {testResultText && (
          <div className="p-3 bg-white border border-teal-200 rounded-lg text-xs space-y-1 animate-in fade-in">
            <div className="flex items-center justify-between text-slate-500">
              <span className="font-semibold text-teal-800">Test Output Transcript:</span>
              {testDurationMs && <span className="font-mono text-[11px]">{testDurationMs}ms</span>}
            </div>
            <p className="text-slate-900 font-mono text-sm bg-slate-50 p-2 rounded border border-slate-200">
              "{testResultText}"
            </p>
            {testAudioBlob && (
              <button
                onClick={() => {
                  const url = URL.createObjectURL(testAudioBlob);
                  const a = new Audio(url);
                  a.play().catch(console.warn);
                }}
                className="text-[11px] font-semibold text-teal-800 hover:text-teal-900 flex items-center gap-1 pt-1"
              >
                <Play className="w-3 h-3 text-teal-700 fill-teal-700" /> ▶ Listen to Test Audio
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
