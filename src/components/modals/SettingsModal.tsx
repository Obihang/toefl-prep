import React, { useState, useEffect, useRef } from 'react';
import { X, Settings, Target, Calendar, CheckCircle2, User, MousePointer, Mic, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getStoredMicDeviceId, setStoredMicDeviceId, getAudioInputDevices, getVoiceEngine, setVoiceEngine, VoiceEngine, speakScriptLine, playSpeech, getVoices, getTtsUsageCount, isTtsCircuitBreakerBlocked, decodeSpeech, playDecodedSpeech, getAudioContext, audioBufferToWavBlob } from '../../utils/audioSpeech';
import { getStoredApiKey, getStoredVoiceKey, setStoredVoiceKey, getApiHeaders } from '../../utils/apiKey';
import { isOfflineVoiceDownloaded, isOfflineVoiceEnabled, getOfflineVoiceLastError, downloadOfflineVoice, removeOfflineVoice, testOfflineVoice } from '../../utils/offlineVoice';
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
  const [voiceEngine, setVoiceEngineState] = useState<VoiceEngine>('auto');

  const [voiceKeyInput, setVoiceKeyInput] = useState('');
  const [isOfflineDownloaded, setIsOfflineDownloaded] = useState(false);
  const [isDownloadingOffline, setIsDownloadingOffline] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const [cloudTestStatus, setCloudTestStatus] = useState<{ testing: boolean; result?: string; error?: string } | null>(null);
  const [deviceTestStatus, setDeviceTestStatus] = useState<{ testing: boolean; result?: string; error?: string } | null>(null);
  const [offlineTestStatus, setOfflineTestStatus] = useState<{ testing: boolean; result?: string; error?: string } | null>(null);
  const [audioTestStatus, setAudioTestStatus] = useState<{
    testing: boolean;
    webAudioSuccess?: boolean;
    htmlAudioSuccess?: boolean;
    contextState?: string;
    pageState?: string;
    error?: string;
  } | null>(null);

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

  const handleAudioTest = async () => {
    setAudioTestStatus({ testing: true });
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch {}
      }

      let webAudioOk = false;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 440;
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 1.0);
        webAudioOk = true;
      } catch (err: any) {
        console.warn('Web Audio 440Hz test failed:', err);
      }

      // Wait 1.1s for Web Audio tone to complete before starting HTML Audio tone
      await new Promise((r) => setTimeout(r, 1100));

      let htmlAudioOk = false;
      try {
        const sampleRate = 22050;
        const toneBuffer = ctx.createBuffer(1, sampleRate, sampleRate);
        const data = toneBuffer.getChannelData(0);
        for (let i = 0; i < sampleRate; i++) {
          data[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.15;
        }
        const wavBlob = audioBufferToWavBlob(toneBuffer);
        const url = URL.createObjectURL(wavBlob);
        const audio = new Audio(url);
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            URL.revokeObjectURL(url);
            resolve();
          }, 1500);
          audio.onended = () => {
            clearTimeout(timeout);
            URL.revokeObjectURL(url);
            resolve();
          };
          audio.onerror = () => {
            clearTimeout(timeout);
            URL.revokeObjectURL(url);
            reject(new Error('HTML audio element playback failed'));
          };
          audio.play().then(() => {
            htmlAudioOk = true;
          }).catch(reject);
        });
      } catch (err: any) {
        console.warn('HTML Audio 440Hz test failed:', err);
      }

      setAudioTestStatus({
        testing: false,
        webAudioSuccess: webAudioOk,
        htmlAudioSuccess: htmlAudioOk,
        contextState: ctx?.state || 'unknown',
        pageState: document.hidden ? 'Muted / Background Tab' : 'Unmuted / Active Tab',
      });
    } catch (err: any) {
      setAudioTestStatus({
        testing: false,
        error: err?.message || String(err),
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

          {/* Voice Engine & Speech Settings */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Mic className="w-4 h-4 text-teal-700" />
                Voice Engine &amp; Speech Settings
              </label>
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                Mode: {voiceEngine}
              </span>
            </div>

            {/* 4 Engine Modes */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => { setVoiceEngineState('auto'); setVoiceEngine('auto'); }}
                className={`p-2.5 text-xs rounded-lg border text-left transition-all ${
                  voiceEngine === 'auto'
                    ? 'bg-teal-50 border-teal-600 text-teal-900 ring-2 ring-teal-600/20 font-bold'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="font-semibold">Auto (Default)</div>
                <div className="text-[10px] text-slate-500 font-normal">Cloud → Device → Offline</div>
              </button>

              <button
                type="button"
                onClick={() => { setVoiceEngineState('cloud'); setVoiceEngine('cloud'); }}
                className={`p-2.5 text-xs rounded-lg border text-left transition-all ${
                  voiceEngine === 'cloud'
                    ? 'bg-teal-50 border-teal-600 text-teal-900 ring-2 ring-teal-600/20 font-bold'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="font-semibold">Cloud Voice</div>
                <div className="text-[10px] text-slate-500 font-normal">Studio AI Voice</div>
              </button>

              <button
                type="button"
                onClick={() => { setVoiceEngineState('device'); setVoiceEngine('device'); }}
                className={`p-2.5 text-xs rounded-lg border text-left transition-all ${
                  voiceEngine === 'device'
                    ? 'bg-teal-50 border-teal-600 text-teal-900 ring-2 ring-teal-600/20 font-bold'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="font-semibold">Device Voice</div>
                <div className="text-[10px] text-slate-500 font-normal">Browser Speech</div>
              </button>

              <button
                type="button"
                onClick={() => { setVoiceEngineState('offline'); setVoiceEngine('offline'); }}
                className={`p-2.5 text-xs rounded-lg border text-left transition-all ${
                  voiceEngine === 'offline'
                    ? 'bg-teal-50 border-teal-600 text-teal-900 ring-2 ring-teal-600/20 font-bold'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="font-semibold">Offline Neural</div>
                <div className="text-[10px] text-slate-500 font-normal">Kokoro ONNX (~90MB)</div>
              </button>
            </div>

            {/* Optional Separate Voice Key */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800">
                  Voice key (optional dedicated key for audio)
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
                placeholder="AIzaSy... or sk-... (Dedicated key for audio)"
                className="w-full text-xs border border-slate-300 rounded px-2.5 py-1.5 bg-white focus:border-teal-600 outline-hidden font-mono"
              />
              <p className="text-[11px] text-slate-500">
                Used for Studio AI voice playback when main provider is Groq, NVIDIA, or OpenRouter.
              </p>
            </div>

            {/* Offline Voice Download / Model Management */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800">
                  Offline neural voice (one-time download, about 90 MB)
                </label>
                {isOfflineDownloaded && (
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Ready
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Runs Kokoro-82M (q8; WebGPU / WASM) in a Web Worker so speech synthesis works completely offline without freezing.
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
                  className="px-3 py-1 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded hover:bg-rose-100 transition cursor-pointer"
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

            {/* Voice Diagnostics: One row per engine */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Voice Diagnostics
                </span>
                <span className="text-[10px] text-slate-500">Live Engine Health</span>
              </div>

              {/* Hardware & Browser Audio Test */}
              <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <strong className="text-slate-900 font-semibold block">Hardware &amp; Audio Output Test</strong>
                    <span className="text-[11px] text-slate-500">
                      Plays 1-sec 440 Hz tone through Web Audio and HTML &lt;audio&gt; element
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={audioTestStatus?.testing}
                    onClick={handleAudioTest}
                    className="px-3 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 font-semibold rounded border border-teal-300 transition cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    {audioTestStatus?.testing ? 'Playing Tones...' : 'Audio test'}
                  </button>
                </div>

                {audioTestStatus?.testing && (
                  <p className="text-[11px] text-teal-700 animate-pulse font-medium">
                    Playing 1s 440 Hz tone through Web Audio, then HTML &lt;audio&gt;...
                  </p>
                )}

                {audioTestStatus && !audioTestStatus.testing && (
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1 text-[11px]">
                    <div className="grid grid-cols-2 gap-2 font-mono">
                      <div>
                        <span className="text-slate-500">AudioContext State: </span>
                        <strong className={audioTestStatus.contextState === 'running' ? 'text-emerald-700' : 'text-amber-700'}>
                          {audioTestStatus.contextState || 'unknown'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Page Sound State: </span>
                        <strong className="text-slate-800">{audioTestStatus.pageState || 'Normal'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Web Audio: </span>
                        <strong className={audioTestStatus.webAudioSuccess ? 'text-emerald-700' : 'text-rose-600'}>
                          {audioTestStatus.webAudioSuccess ? '✓ Played' : '✗ Failed'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500">HTML &lt;audio&gt;: </span>
                        <strong className={audioTestStatus.htmlAudioSuccess ? 'text-emerald-700' : 'text-rose-600'}>
                          {audioTestStatus.htmlAudioSuccess ? '✓ Played' : '✗ Failed'}
                        </strong>
                      </div>
                    </div>
                    {audioTestStatus.error && (
                      <p className="text-rose-600 font-mono mt-1">Error: {audioTestStatus.error}</p>
                    )}
                  </div>
                )}

                <p className="text-[10px] text-slate-500 bg-amber-50 border border-amber-200/80 rounded px-2 py-1">
                  💡 <strong>Reminder:</strong> If you hear nothing in Brave: unmute the tab, and allow sound at <code className="bg-amber-100/60 px-1 py-0.5 rounded text-amber-900 font-mono">brave://settings/content/sound</code>.
                </p>
              </div>

              {/* Row 1: Cloud Voice */}
              <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <strong className="text-slate-900 font-semibold block">Cloud Engine (Studio AI Voice)</strong>
                    <span className="text-[11px] text-slate-500">
                      {getStoredApiKey() || getStoredVoiceKey() ? 'API Key configured' : 'No API key set'} · Daily quota: {getTtsUsageCount()} calls · {isTtsCircuitBreakerBlocked() ? 'Breaker tripped' : 'Breaker normal'}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={cloudTestStatus?.testing}
                    onClick={async () => {
                      setCloudTestStatus({ testing: true });
                      try {
                        const res = await fetch('/api/tts', {
                          method: 'POST',
                          headers: getApiHeaders(),
                          body: JSON.stringify({ text: 'Cloud voice synthesis test.', voiceName: 'Kore' }),
                        });
                        const data = await res.json();
                        if (!res.ok || !data.success || !data.audioBase64) {
                          throw new Error(data.error || 'Failed to synthesize cloud voice');
                        }
                        const { audioBuffer } = await decodeSpeech(data.audioBase64, data.mimeType || 'audio/wav');
                        await playDecodedSpeech(audioBuffer);
                        setCloudTestStatus({ testing: false, result: 'Cloud voice played successfully.' });
                      } catch (err: any) {
                        setCloudTestStatus({ testing: false, error: err?.message || String(err) });
                      }
                    }}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium rounded border border-slate-300 transition cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    {cloudTestStatus?.testing ? 'Testing...' : 'Test Cloud Voice'}
                  </button>
                </div>
                {cloudTestStatus?.result && (
                  <p className="text-[11px] text-emerald-700 font-medium">✓ {cloudTestStatus.result}</p>
                )}
                {cloudTestStatus?.error && (
                  <p className="text-[11px] text-rose-600 font-mono">Error: {cloudTestStatus.error}</p>
                )}
              </div>

              {/* Row 2: Device Voice */}
              <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <strong className="text-slate-900 font-semibold block">Device Engine (Browser SpeechSynthesis)</strong>
                    <span className="text-[11px] text-slate-500">
                      {getVoices().filter((v) => v.lang.toLowerCase().startsWith('en')).length} English voices found ({getVoices().length} total system voices)
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={deviceTestStatus?.testing}
                    onClick={async () => {
                      setDeviceTestStatus({ testing: true });
                      try {
                        const englishVoices = getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
                        if (englishVoices.length === 0) {
                          throw new Error('No English voices found in browser speech synthesis.');
                        }
                        const voiceObj = englishVoices[0];
                        const utt = new SpeechSynthesisUtterance('This is a test of browser device speech synthesis.');
                        utt.voice = voiceObj;
                        utt.lang = 'en-US';
                        await new Promise<void>((resolve, reject) => {
                          utt.onend = () => resolve();
                          utt.onerror = (e) => reject(new Error(e.error || 'Device speech error'));
                          window.speechSynthesis.cancel();
                          window.speechSynthesis.speak(utt);
                        });
                        setDeviceTestStatus({ testing: false, result: `Device voice (${voiceObj.name}) played successfully.` });
                      } catch (err: any) {
                        setDeviceTestStatus({ testing: false, error: err?.message || String(err) });
                      }
                    }}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium rounded border border-slate-300 transition cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    {deviceTestStatus?.testing ? 'Testing...' : 'Test Device Voice'}
                  </button>
                </div>
                {deviceTestStatus?.result && (
                  <p className="text-[11px] text-emerald-700 font-medium">✓ {deviceTestStatus.result}</p>
                )}
                {deviceTestStatus?.error && (
                  <p className="text-[11px] text-rose-600 font-mono">Error: {deviceTestStatus.error}</p>
                )}
              </div>

              {/* Row 3: Offline Voice */}
              <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <strong className="text-slate-900 font-semibold block">Offline Engine (Kokoro Neural Voice)</strong>
                    <span className="text-[11px] text-slate-500">
                      Downloaded: {isOfflineDownloaded ? 'Yes' : 'No'} · Enabled: {isOfflineVoiceEnabled() ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={offlineTestStatus?.testing}
                    onClick={async () => {
                      setOfflineTestStatus({ testing: true });
                      try {
                        const res = await testOfflineVoice();
                        if (res.success) {
                          setOfflineTestStatus({ testing: false, result: res.message });
                        } else {
                          setOfflineTestStatus({ testing: false, error: res.message });
                        }
                      } catch (err: any) {
                        setOfflineTestStatus({ testing: false, error: err?.message || String(err) });
                      }
                    }}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium rounded border border-slate-300 transition cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    {offlineTestStatus?.testing ? 'Testing...' : 'Test Offline Voice'}
                  </button>
                </div>
                {offlineTestStatus?.result && (
                  <p className="text-[11px] text-emerald-700 font-medium">✓ {offlineTestStatus.result}</p>
                )}
                {(offlineTestStatus?.error || (!offlineTestStatus?.result && getOfflineVoiceLastError())) && (
                  <p className="text-[11px] text-rose-600 font-mono">
                    Last error: {offlineTestStatus?.error || getOfflineVoiceLastError()}
                  </p>
                )}
              </div>
            </div>
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
