import React, { useState, useEffect, useRef } from 'react';
import { X, Settings, Target, Calendar, CheckCircle2, User, MousePointer, Mic, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getStoredMicDeviceId, setStoredMicDeviceId, getAudioInputDevices, getVoiceEngine, setVoiceEngine, VoiceEngine, speakScriptLine, playSpeech, getVoices, getTtsUsageCount } from '../../utils/audioSpeech';
import { getStoredVoiceKey, setStoredVoiceKey } from '../../utils/apiKey';
import { isOfflineVoiceDownloaded, downloadOfflineVoice, removeOfflineVoice } from '../../utils/offlineVoice';
import { getQuestionCountsPerSection } from '../../utils/sharedQuestions';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

import { getCursorPreference, setCursorPreference, CursorObjectStyle } from '../../utils/cursorPreferences';

export const SettingsModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { displayName, setDisplayName } = useAuth();
  const [nameInput, setNameInput] = useState('');
  const [targetScore, setTargetScore] = useState('100');
  const [testDate, setTestDate] = useState('');
  const [cursorStyle, setCursorStyleState] = useState<CursorObjectStyle>('pen');
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [randomizeVoices, setRandomizeVoices] = useState(true);
  const [voiceEngine, setVoiceEngineState] = useState<VoiceEngine>('device');

  const [voiceKeyInput, setVoiceKeyInput] = useState('');
  const [isOfflineDownloaded, setIsOfflineDownloaded] = useState(false);
  const [isDownloadingOffline, setIsDownloadingOffline] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const [isTestingMic, setIsTestingMic] = useState(false);
  const [testSecondsLeft, setTestSecondsLeft] = useState(3);
  const [testAudioLevel, setTestAudioLevel] = useState(0);
  const [testResult, setTestResult] = useState<{
    status: 'works' | 'silent' | 'error';
    message: string;
    audioContextState: string;
    deviceName: string;
  } | null>(null);

  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({
    Reading: 0,
    Listening: 0,
    Speaking: 0,
    Writing: 0,
    'Vocabulary & Grammar': 0,
  });
  const [loadingCounts, setLoadingCounts] = useState(true);

  const testAudioNodesRef = useRef<{
    stream?: MediaStream;
    ctx?: AudioContext;
    interval?: any;
    timer?: any;
  }>({});

  const stopMicTest = () => {
    if (testAudioNodesRef.current.interval) clearInterval(testAudioNodesRef.current.interval);
    if (testAudioNodesRef.current.timer) clearInterval(testAudioNodesRef.current.timer);
    if (testAudioNodesRef.current.stream) {
      testAudioNodesRef.current.stream.getTracks().forEach((t) => t.stop());
    }
    if (testAudioNodesRef.current.ctx && testAudioNodesRef.current.ctx.state !== 'closed') {
      try {
        testAudioNodesRef.current.ctx.close();
      } catch {}
    }
    testAudioNodesRef.current = {};
    setIsTestingMic(false);
    setTestAudioLevel(0);
  };

  useEffect(() => {
    setNameInput(displayName || localStorage.getItem('toefl_display_name') || '');
    const storedTarget = localStorage.getItem('toefl_target_score') || '100';
    const storedDate = localStorage.getItem('toefl_test_date') || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    setTargetScore(storedTarget);
    setTestDate(storedDate);
    setCursorStyleState(getCursorPreference());
    setSelectedMicId(getStoredMicDeviceId() || '');
    setRandomizeVoices(localStorage.getItem('toefl_randomize_voices') !== 'false');
    setVoiceEngineState(getVoiceEngine());
    setVoiceKeyInput(getStoredVoiceKey());
    setIsOfflineDownloaded(isOfflineVoiceDownloaded());
    getAudioInputDevices().then(setMicDevices).catch(() => {});
    
    setLoadingCounts(true);
    getQuestionCountsPerSection().then((counts) => {
      setQuestionCounts(counts);
      setLoadingCounts(false);
    }).catch(() => setLoadingCounts(false));

    setNameError(null);
    setSavedSuccess(false);

    const handleDeviceChange = () => {
      getAudioInputDevices().then(setMicDevices).catch(() => {});
    };
    navigator?.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
    return () => {
      navigator?.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
      stopMicTest();
    };
  }, [isOpen, displayName]);


  if (!isOpen) return null;

  const handleCursorChange = (style: CursorObjectStyle) => {
    setCursorStyleState(style);
    setCursorPreference(style);
  };

  const handleTestMicrophone = async () => {
    stopMicTest();
    setIsTestingMic(true);
    setTestSecondsLeft(3);
    setTestAudioLevel(0);
    setTestResult(null);

    // Resolve selected device name
    let deviceName = 'Default Audio Input (System Default)';
    if (selectedMicId) {
      const match = micDevices.find((d) => d.deviceId === selectedMicId);
      if (match?.label) {
        deviceName = match.label;
      } else {
        deviceName = `Device (${selectedMicId.slice(0, 8)}...)`;
      }
    } else if (micDevices.length > 0 && micDevices[0].label) {
      deviceName = `${micDevices[0].label} (Default)`;
    }

    let audioContextState = 'unknown';

    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          ...(selectedMicId ? { deviceId: { exact: selectedMicId } } : {}),
        },
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      const activeTrack = stream.getAudioTracks()[0];
      if (activeTrack?.label && (!selectedMicId || deviceName.includes('Default'))) {
        deviceName = activeTrack.label;
      }

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        throw new Error('Web Audio API is not supported in this browser.');
      }

      const audioContext = new AudioCtx();
      if (audioContext.state === 'suspended') {
        try {
          await audioContext.resume();
        } catch {}
      }
      audioContextState = audioContext.state;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      testAudioNodesRef.current = { stream, ctx: audioContext };

      let maxVol = 0;
      let totalVol = 0;
      let sampleCount = 0;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const interval = setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        const lvl = Math.min(100, Math.round((avg / 120) * 100));
        setTestAudioLevel(lvl);

        sampleCount++;
        totalVol += lvl;
        if (lvl > maxVol) maxVol = lvl;
      }, 50);
      testAudioNodesRef.current.interval = interval;

      let remaining = 3;
      const timer = setInterval(() => {
        remaining--;
        setTestSecondsLeft(remaining);
        if (remaining <= 0) {
          clearInterval(timer);
          clearInterval(interval);

          audioContextState = audioContext.state;

          stream.getTracks().forEach((t) => t.stop());
          try {
            source.disconnect();
            analyser.disconnect();
            audioContext.close();
          } catch {}

          setIsTestingMic(false);
          setTestAudioLevel(0);

          const avgVol = sampleCount > 0 ? totalVol / sampleCount : 0;
          const micWorks = maxVol >= 4 || avgVol >= 2;

          setTestResult({
            status: micWorks ? 'works' : 'silent',
            message: micWorks ? 'Mic works' : 'No sound detected',
            audioContextState,
            deviceName,
          });
        }
      }, 1000);
      testAudioNodesRef.current.timer = timer;
    } catch (err: any) {
      stopMicTest();
      setTestResult({
        status: 'error',
        message: err?.message || 'Could not access microphone',
        audioContextState,
        deviceName,
      });
    }
  };

  const handleSave = () => {
    const trimmed = nameInput.trim();
    if (trimmed && (trimmed.length < 2 || trimmed.length > 30)) {
      setNameError('Display name must be between 2 and 30 characters.');
      return;
    }
    if (trimmed) {
      setDisplayName(trimmed);
    }
    setCursorPreference(cursorStyle);
    setStoredMicDeviceId(selectedMicId);
    setSavedSuccess(true);
    setTimeout(() => {
      onClose();
    }, 800);
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 space-y-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center">
              <Settings className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Study Goals & Preferences</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <User className="w-4 h-4 text-teal-700" />
              Display Name (Author label)
            </label>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => {
                setNameInput(e.target.value);
                if (nameError) setNameError(null);
              }}
              placeholder="e.g. TOEFLScholar"
              maxLength={30}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:border-teal-600 outline-hidden"
            />
            <div className="flex justify-between items-center text-[11px] text-slate-400">
              <span>Used only for "Created by &lt;name&gt;" on shared questions</span>
              <span>{nameInput.trim().length}/30</span>
            </div>
            {nameError && (
              <p className="text-xs text-rose-600 font-medium">{nameError}</p>
            )}
          </div>



          {/* Interactive Clickable Cursor Object Style */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="text-sm font-semibold text-slate-700 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <MousePointer className="w-4 h-4 text-teal-700" />
                Hover Cursor on Clickable Points
              </span>
              <span className="text-[11px] text-teal-800 font-medium bg-teal-50 px-2 py-0.5 rounded-full">
                Custom Object
              </span>
            </label>
            <p className="text-xs text-slate-500">
              When hovering over any button, tab, answer choice, or interactive point:
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleCursorChange('pen')}
                className={`p-2.5 rounded-xl border text-left text-xs transition-all flex items-center gap-2.5 cursor-pointer ${
                  cursorStyle === 'pen'
                    ? 'border-teal-700 bg-teal-50/80 text-teal-950 font-bold ring-2 ring-teal-600/20 shadow-xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <span className="text-lg">✒️</span>
                <div>
                  <div className="font-semibold leading-tight">Fountain Pen</div>
                  <div className="text-[10px] text-slate-400 font-normal">ETS writing nib</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleCursorChange('quill')}
                className={`p-2.5 rounded-xl border text-left text-xs transition-all flex items-center gap-2.5 cursor-pointer ${
                  cursorStyle === 'quill'
                    ? 'border-indigo-700 bg-indigo-50/80 text-indigo-950 font-bold ring-2 ring-indigo-600/20 shadow-xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <span className="text-lg">🪶</span>
                <div>
                  <div className="font-semibold leading-tight">Academic Quill</div>
                  <div className="text-[10px] text-slate-400 font-normal">Manuscript quill</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleCursorChange('wand')}
                className={`p-2.5 rounded-xl border text-left text-xs transition-all flex items-center gap-2.5 cursor-pointer ${
                  cursorStyle === 'wand'
                    ? 'border-sky-700 bg-sky-50/80 text-sky-950 font-bold ring-2 ring-sky-600/20 shadow-xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <span className="text-lg">✨</span>
                <div>
                  <div className="font-semibold leading-tight">Scholar Wand</div>
                  <div className="text-[10px] text-slate-400 font-normal">Star radiance</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleCursorChange('classic')}
                className={`p-2.5 rounded-xl border text-left text-xs transition-all flex items-center gap-2.5 cursor-pointer ${
                  cursorStyle === 'classic'
                    ? 'border-slate-700 bg-slate-100 text-slate-900 font-bold ring-2 ring-slate-400/20 shadow-xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <span className="text-lg">👆</span>
                <div>
                  <div className="font-semibold leading-tight">Classic Pointer</div>
                  <div className="text-[10px] text-slate-400 font-normal">System hand</div>
                </div>
              </button>
            </div>
          </div>

          {/* Voice Engine & Optional Separate Voice Key */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <label className="text-sm font-semibold text-slate-700 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-teal-700" />
                Voice Engine &amp; Speech Settings
              </span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setVoiceEngineState('gemini'); setVoiceEngine('gemini'); }}
                className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-all ${voiceEngine === 'gemini' ? 'bg-teal-50 border-teal-600 text-teal-900 ring-2 ring-teal-600/20 font-bold' : 'bg-white border-slate-300 text-slate-700'}`}
              >
                Studio AI Voice (Recommended)
              </button>
              <button
                type="button"
                onClick={() => { setVoiceEngineState('device'); setVoiceEngine('device'); }}
                className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-all ${voiceEngine === 'device' ? 'bg-teal-50 border-teal-600 text-teal-900' : 'bg-white border-slate-300 text-slate-700'}`}
              >
                Browser Device Voice (Offline)
              </button>
            </div>

            {/* Optional Separate Voice Key */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800">
                  Voice key (optional, free Gemini key)
                </label>
                <span className="text-[11px] text-teal-800 font-mono bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                  Calls today: {getTtsUsageCount()}
                </span>
              </div>
              <input
                type="password"
                value={voiceKeyInput}
                onChange={(e) => {
                  setVoiceKeyInput(e.target.value);
                  setStoredVoiceKey(e.target.value);
                }}
                placeholder="AIzaSy... (Dedicated Gemini API key for audio)"
                className="w-full text-xs border border-slate-300 rounded px-2.5 py-1.5 bg-white focus:border-teal-600 outline-hidden font-mono"
              />
              <p className="text-[11px] text-slate-500">
                Used for Studio AI voice playback when main provider is Groq, NVIDIA, or OpenRouter.
              </p>
            </div>

            {/* Opt-in Offline Voice */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800">
                  Offline voice (one-time download, about 90 MB)
                </label>
                {isOfflineDownloaded && (
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Ready
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                High-quality offline ONNX neural voice for browsers without built-in speech synthesis.
              </p>
              {typeof navigator !== 'undefined' && (navigator as any).connection?.type === 'cellular' && (
                <p className="text-[11px] text-amber-700 font-medium">
                  ⚠️ Note: Mobile data connection detected. Download requires ~90 MB.
                </p>
              )}
              {isDownloadingOffline ? (
                <div className="space-y-1">
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-600 transition-all duration-150"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-slate-600 font-mono">
                    Downloading model... {downloadProgress}%
                  </span>
                </div>
              ) : isOfflineDownloaded ? (
                <button
                  type="button"
                  onClick={async () => {
                    await removeOfflineVoice();
                    setIsOfflineDownloaded(false);
                  }}
                  className="px-3 py-1 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded hover:bg-rose-100 transition"
                >
                  Remove Offline Voice
                </button>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    setIsDownloadingOffline(true);
                    setDownloadProgress(0);
                    try {
                      await downloadOfflineVoice((pct) => setDownloadProgress(pct));
                    } catch (err) {
                      console.warn('Offline download error:', err);
                    } finally {
                      setIsDownloadingOffline(false);
                      setIsOfflineDownloaded(isOfflineVoiceDownloaded());
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded transition cursor-pointer"
                >
                  Download Offline Voice (~90 MB)
                </button>
              )}
            </div>

            {isOfflineDownloaded ? (
              <p className="text-xs text-emerald-700 font-medium">✨ Offline neural voice active and ready (Kokoro ONNX engine).</p>
            ) : voiceEngine === 'device' && getVoices().filter(v => v.lang.startsWith('en')).length === 0 ? (
              <p className="text-xs text-rose-600">No English speech voices found on this device. Download the offline voice or use Studio AI Voice.</p>
            ) : null}
            <button
              type="button"
              onClick={async () => {
                await playSpeech("This is a test of the TOEFL Prep Studio voice engine.");
              }}
              className="mt-2 w-full px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
            >
              Test Voice Audio
            </button>
          </div>

          {/* Database Questions Stats */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="text-sm font-semibold text-slate-700 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Target className="w-4 h-4 text-teal-700" />
                Saved Questions Database Stats
              </span>
              <span className="text-[11px] text-teal-800 font-medium bg-teal-50 px-2 py-0.5 rounded-full">
                Shared Bank
              </span>
            </label>
            <p className="text-xs text-slate-500">
              Total questions saved in the shared database for each TOEFL section:
            </p>
            {loadingCounts ? (
              <div className="text-xs text-slate-400 py-2 text-center">Loading database stats...</div>
            ) : (
              <div className="grid grid-cols-2 gap-2 pt-1">
                {Object.entries(questionCounts).map(([section, count]) => (
                  <div key={section} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700">{section}</span>
                    <span className="text-xs font-bold text-teal-800 font-mono bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                      {count} saved
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Microphone Audio Input Selector */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="text-sm font-semibold text-slate-700 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-teal-700" />
                Audio Input (Microphone)
              </span>
              <span className="text-[11px] text-teal-800 font-medium bg-teal-50 px-2 py-0.5 rounded-full">
                Voice Capture
              </span>
            </label>
            <select
              value={selectedMicId}
              onChange={(e) => {
                setSelectedMicId(e.target.value);
                setStoredMicDeviceId(e.target.value);
              }}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:border-teal-600 outline-hidden bg-white text-slate-900"
            >
              <option value="">Default Audio Input (System Default)</option>
              {micDevices.map((device, idx) => (
                <option key={device.deviceId || idx} value={device.deviceId}>
                  {device.label || `Microphone ${idx + 1}`}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">
              Select which microphone to use for Speaking Interview and Listen &amp; Repeat tasks.
            </p>

            {/* Test Microphone Button & Real-time Live Meter */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleTestMicrophone}
                disabled={isTestingMic}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer ${
                  isTestingMic
                    ? 'bg-rose-600 text-white border-rose-600 animate-pulse'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Mic className={`w-3.5 h-3.5 ${isTestingMic ? 'text-white' : 'text-teal-700'}`} />
                <span>{isTestingMic ? `Recording test... ${testSecondsLeft}s` : 'Test microphone'}</span>
              </button>

              {/* Live meter while testing */}
              {isTestingMic && (
                <div className="mt-2.5 p-3 bg-rose-50 border border-rose-200 rounded-lg space-y-2 animate-in fade-in">
                  <div className="flex items-center justify-between text-xs text-rose-800">
                    <span className="font-semibold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping" />
                      Testing microphone (Speak now)...
                    </span>
                    <span className="font-mono font-bold text-rose-700">{testSecondsLeft}s left</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 rounded-full transition-all duration-75"
                        style={{ width: `${Math.max(4, testAudioLevel)}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-mono text-slate-600 w-8 text-right">{testAudioLevel}%</span>
                  </div>
                </div>
              )}

              {/* Test Result Display */}
              {testResult && !isTestingMic && (
                <div
                  className={`mt-2.5 p-3 rounded-lg border text-xs space-y-1.5 animate-in fade-in ${
                    testResult.status === 'works'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : testResult.status === 'silent'
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-sm">
                    {testResult.status === 'works' ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{testResult.message}</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>{testResult.message}</span>
                      </>
                    )}
                  </div>
                  <div className="text-[11px] space-y-0.5 opacity-90">
                    <div>
                      <span className="font-medium text-slate-600">Selected device: </span>
                      <strong className="text-slate-900">{testResult.deviceName}</strong>
                    </div>
                    <div>
                      <span className="font-medium text-slate-600">AudioContext state: </span>
                      <strong className="font-mono text-slate-900">{testResult.audioContextState}</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Randomize Voices Toggle */}
          <div className="space-y-2 pt-2 border-t border-slate-100 flex items-center justify-between">
            <div>
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Mic className="w-4 h-4 text-teal-700" />
                Randomize Voices
              </label>
              <p className="text-xs text-slate-500">
                Randomize gender-matched TTS voices per task or use default (Kore / Puck).
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={randomizeVoices}
                onChange={(e) => {
                  setRandomizeVoices(e.target.checked);
                  localStorage.setItem('toefl_randomize_voices', String(e.target.checked));
                }}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-600"></div>
            </label>
          </div>
        </div>

        {savedSuccess && (
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Study goals saved successfully!</span>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-lg transition-colors"
          >
            Save Goals
          </button>
        </div>
      </div>
    </div>
  );
};
