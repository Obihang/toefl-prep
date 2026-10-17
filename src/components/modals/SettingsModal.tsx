import React, { useState, useEffect, useRef } from 'react';
import { X, Settings, Target, Calendar, CheckCircle2, User, MousePointer, Mic, AlertCircle, Key, ChevronDown, ChevronUp, Cpu, Volume2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getStoredMicDeviceId, setStoredMicDeviceId, getAudioInputDevices, getVoiceEngine, setVoiceEngine, VoiceEngine, speakScriptLine, playSpeech, getVoices, getTtsUsageCount, isTtsCircuitBreakerBlocked, decodeSpeech, playDecodedSpeech, getAudioContext, audioBufferToWavBlob } from '../../utils/audioSpeech';
import { getStoredApiKey, getStoredVoiceKey, setStoredVoiceKey, getStoredAudio8Url, setStoredAudio8Url, getStoredTtsProvider, setStoredTtsProvider, getApiHeaders } from '../../utils/apiKey';
import { isOfflineVoiceDownloaded, isOfflineVoiceEnabled, getOfflineVoiceLastError, downloadOfflineVoice, removeOfflineVoice, testOfflineVoice } from '../../utils/offlineVoice';
import { getCursorPreference, setCursorPreference, CursorObjectStyle } from '../../utils/cursorPreferences';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { displayName, setDisplayName } = useAuth();
  const [nameInput, setNameInput] = useState('');
  const [cursorStyle, setCursorStyleState] = useState<CursorObjectStyle>('pen');
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [randomizeVoices, setRandomizeVoices] = useState(true);
  const [voiceEngine, setVoiceEngineState] = useState<VoiceEngine>('auto');
  const [enablePrefetching, setEnablePrefetching] = useState<boolean>(() => {
    const saved = localStorage.getItem('toefl_enable_prefetching');
    return saved === null ? true : saved === 'true';
  });

  const [voiceKeyInput, setVoiceKeyInput] = useState('');
  const [audio8UrlInput, setAudio8UrlInput] = useState('');
  const [ttsProviderInput, setTtsProviderInput] = useState('');
  const [isOfflineDownloaded, setIsOfflineDownloaded] = useState(false);
  const [isDownloadingOffline, setIsDownloadingOffline] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Accordion dropdown collapse states for clean layout
  const [openSection, setOpenSection] = useState<'all' | 'api' | 'profile' | 'voice' | 'mic' | 'cursor'>('all');

  const [cloudTestStatus, setCloudTestStatus] = useState<{ testing: boolean; result?: string; error?: string } | null>(null);
  const [audio8TestStatus, setAudio8TestStatus] = useState<{ testing: boolean; result?: string; error?: string } | null>(null);
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
    setCursorStyleState(getCursorPreference());
    setSelectedMicId(getStoredMicDeviceId() || '');
    setRandomizeVoices(localStorage.getItem('toefl_randomize_voices') !== 'false');
    setVoiceEngineState(getVoiceEngine());
    setVoiceKeyInput(getStoredVoiceKey());
    setAudio8UrlInput(getStoredAudio8Url());
    setTtsProviderInput(getStoredTtsProvider());
    setIsOfflineDownloaded(isOfflineVoiceDownloaded());
    getAudioInputDevices().then(setMicDevices).catch(() => {});

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
        audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      testAudioNodesRef.current.stream = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      testAudioNodesRef.current.ctx = ctx;
      audioContextState = ctx.state;

      if (ctx.state === 'suspended') {
        await ctx.resume();
        audioContextState = ctx.state;
      }

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let maxLevelObserved = 0;

      testAudioNodesRef.current.interval = setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100 * 2.2));
        if (normalized > maxLevelObserved) {
          maxLevelObserved = normalized;
        }
        setTestAudioLevel(normalized);
      }, 80);

      let timeLeft = 3;
      testAudioNodesRef.current.timer = setInterval(() => {
        timeLeft -= 1;
        if (timeLeft > 0) {
          setTestSecondsLeft(timeLeft);
        } else {
          clearInterval(testAudioNodesRef.current.timer);
          stopMicTest();
          if (maxLevelObserved > 8) {
            setTestResult({
              status: 'works',
              message: 'Microphone is working perfectly!',
              audioContextState,
              deviceName,
            });
          } else {
            setTestResult({
              status: 'silent',
              message: 'Microphone audio was very quiet. Check mic mute or permissions.',
              audioContextState,
              deviceName,
            });
          }
        }
      }, 1000);
    } catch (err: any) {
      stopMicTest();
      setTestResult({
        status: 'error',
        message: err?.message || 'Could not access microphone. Please check browser permissions.',
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
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 p-6 space-y-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Settings &amp; Preferences</h2>
              <p className="text-xs text-slate-500">Configure profile, voice engine, microphone, cursor &amp; API keys</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dropdown Layout Navigation / Quick Filter */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600">
          <button
            type="button"
            onClick={() => setOpenSection('all')}
            className={`flex-1 py-1.5 px-2 rounded-lg transition cursor-pointer ${openSection === 'all' ? 'bg-white text-teal-900 shadow-xs font-bold' : 'hover:text-slate-900'}`}
          >
            Expand All
          </button>
          <button
            type="button"
            onClick={() => setOpenSection(openSection === 'profile' ? 'all' : 'profile')}
            className={`py-1.5 px-2.5 rounded-lg transition cursor-pointer ${openSection === 'profile' ? 'bg-white text-teal-900 shadow-xs font-bold' : 'hover:text-slate-900'}`}
          >
            Profile
          </button>
          <button
            type="button"
            onClick={() => setOpenSection(openSection === 'voice' ? 'all' : 'voice')}
            className={`py-1.5 px-2.5 rounded-lg transition cursor-pointer ${openSection === 'voice' ? 'bg-white text-teal-900 shadow-xs font-bold' : 'hover:text-slate-900'}`}
          >
            Voice Engine
          </button>
          <button
            type="button"
            onClick={() => setOpenSection(openSection === 'mic' ? 'all' : 'mic')}
            className={`py-1.5 px-2.5 rounded-lg transition cursor-pointer ${openSection === 'mic' ? 'bg-white text-teal-900 shadow-xs font-bold' : 'hover:text-slate-900'}`}
          >
            Microphone
          </button>
          <button
            type="button"
            onClick={() => setOpenSection(openSection === 'cursor' ? 'all' : 'cursor')}
            className={`py-1.5 px-2.5 rounded-lg transition cursor-pointer ${openSection === 'cursor' ? 'bg-white text-teal-900 shadow-xs font-bold' : 'hover:text-slate-900'}`}
          >
            Cursor
          </button>
          <button
            type="button"
            onClick={() => setOpenSection(openSection === 'api' ? 'all' : 'api')}
            className={`py-1.5 px-2.5 rounded-lg transition cursor-pointer ${openSection === 'api' ? 'bg-white text-teal-900 shadow-xs font-bold' : 'hover:text-slate-900'}`}
          >
            API Key
          </button>
        </div>

        <div className="space-y-4">
          {/* 1. Display Name & Author (Dropdown block) */}
          {(openSection === 'all' || openSection === 'profile') && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div
                onClick={() => setOpenSection(openSection === 'profile' ? 'all' : 'profile')}
                className="flex items-center justify-between cursor-pointer"
              >
                <label className="text-sm font-bold text-slate-900 flex items-center gap-2 cursor-pointer">
                  <User className="w-4 h-4 text-teal-700" />
                  Display Name (Author Label)
                </label>
                <span className="text-xs text-teal-800 font-medium bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                  {nameInput.trim() || 'TOEFLScholar'}
                </span>
              </div>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => {
                  setNameInput(e.target.value);
                  if (nameError) setNameError(null);
                }}
                placeholder="e.g. TOEFLScholar"
                maxLength={30}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:border-teal-600 outline-hidden text-slate-900"
              />
              <div className="flex justify-between items-center text-[11px] text-slate-500">
                <span>Used for "Created by &lt;name&gt;" on shared questions</span>
                <span className="font-mono">{nameInput.trim().length}/30</span>
              </div>
              {nameError && (
                <p className="text-xs text-rose-600 font-medium">{nameError}</p>
              )}
            </div>
          )}

          {/* 2. Voice Engine & Audio (Dropdown block) */}
          {(openSection === 'all' || openSection === 'voice') && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div
                onClick={() => setOpenSection(openSection === 'voice' ? 'all' : 'voice')}
                className="flex items-center justify-between cursor-pointer"
              >
                <label className="text-sm font-bold text-slate-900 flex items-center gap-2 cursor-pointer">
                  <Mic className="w-4 h-4 text-teal-700" />
                  Voice Engine &amp; Speech Preferences
                </label>
                <span className="text-xs font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200 capitalize">
                  {voiceEngine}
                </span>
              </div>

              {/* 4 Engine Modes */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setVoiceEngineState('auto'); setVoiceEngine('auto'); }}
                  className={`p-2.5 text-xs rounded-lg border text-left transition-all cursor-pointer ${
                    voiceEngine === 'auto'
                      ? 'bg-teal-50 border-teal-600 text-teal-950 ring-2 ring-teal-600/20 font-bold shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="font-semibold">Auto (Default)</div>
                  <div className="text-[10px] text-slate-500 font-normal">Cloud → Device → Offline</div>
                </button>

                <button
                  type="button"
                  onClick={() => { setVoiceEngineState('cloud'); setVoiceEngine('cloud'); }}
                  className={`p-2.5 text-xs rounded-lg border text-left transition-all cursor-pointer ${
                    voiceEngine === 'cloud'
                      ? 'bg-teal-50 border-teal-600 text-teal-950 ring-2 ring-teal-600/20 font-bold shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="font-semibold">Cloud Voice</div>
                  <div className="text-[10px] text-slate-500 font-normal">Studio AI Voice</div>
                </button>

                <button
                  type="button"
                  onClick={() => { setVoiceEngineState('device'); setVoiceEngine('device'); }}
                  className={`p-2.5 text-xs rounded-lg border text-left transition-all cursor-pointer ${
                    voiceEngine === 'device'
                      ? 'bg-teal-50 border-teal-600 text-teal-950 ring-2 ring-teal-600/20 font-bold shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="font-semibold">Device Voice</div>
                  <div className="text-[10px] text-slate-500 font-normal">Browser Speech</div>
                </button>

                <button
                  type="button"
                  onClick={() => { setVoiceEngineState('offline'); setVoiceEngine('offline'); }}
                  className={`p-2.5 text-xs rounded-lg border text-left transition-all cursor-pointer ${
                    voiceEngine === 'offline'
                      ? 'bg-teal-50 border-teal-600 text-teal-950 ring-2 ring-teal-600/20 font-bold shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="font-semibold">Offline Neural</div>
                  <div className="text-[10px] text-slate-500 font-normal">Kokoro ONNX (~90MB)</div>
                </button>
              </div>

              {/* Offline Voice Download / Model Management */}
              <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800">
                    Offline neural voice (one-time download, ~90 MB)
                  </label>
                  {isOfflineDownloaded && (
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Ready
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  Runs Kokoro-82M in a Web Worker so speech synthesis works offline without freezing.
                </p>
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
            </div>
          )}

          {/* 3. Microphone & Audio Input (Dropdown block) */}
          {(openSection === 'all' || openSection === 'mic') && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div
                onClick={() => setOpenSection(openSection === 'mic' ? 'all' : 'mic')}
                className="flex items-center justify-between cursor-pointer"
              >
                <label className="text-sm font-bold text-slate-900 flex items-center gap-2 cursor-pointer">
                  <Mic className="w-4 h-4 text-teal-700" />
                  Audio Input (Microphone)
                </label>
                <span className="text-xs text-teal-800 font-medium bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                  {micDevices.length} devices
                </span>
              </div>
              <select
                value={selectedMicId}
                onChange={(e) => {
                  setSelectedMicId(e.target.value);
                  setStoredMicDeviceId(e.target.value);
                }}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:border-teal-600 outline-hidden text-slate-900"
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
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleTestMicrophone}
                  disabled={isTestingMic}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer ${
                    isTestingMic
                      ? 'bg-rose-600 text-white border-rose-600 animate-pulse'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <Mic className={`w-3.5 h-3.5 ${isTestingMic ? 'text-white' : 'text-teal-700'}`} />
                  <span>{isTestingMic ? `Recording test... ${testSecondsLeft}s` : 'Test microphone'}</span>
                </button>

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
          )}

          {/* 4. Cursor Style (Dropdown block) */}
          {(openSection === 'all' || openSection === 'cursor') && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div
                onClick={() => setOpenSection(openSection === 'cursor' ? 'all' : 'cursor')}
                className="flex items-center justify-between cursor-pointer"
              >
                <label className="text-sm font-bold text-slate-900 flex items-center gap-2 cursor-pointer">
                  <MousePointer className="w-4 h-4 text-teal-700" />
                  Hover Cursor Style
                </label>
                <span className="text-xs text-teal-800 font-medium bg-teal-50 px-2 py-0.5 rounded border border-teal-200 capitalize">
                  {cursorStyle}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Choose the custom cursor object displayed when hovering over interactive elements:
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleCursorChange('pen')}
                  className={`p-2.5 rounded-xl border text-left text-xs transition-all flex items-center gap-2.5 cursor-pointer ${
                    cursorStyle === 'pen'
                      ? 'border-teal-700 bg-teal-50/80 text-teal-950 font-bold ring-2 ring-teal-600/20 shadow-xs'
                      : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700'
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
                      : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700'
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
                      : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700'
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
                      : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700'
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
          )}

          {/* 5. API Key & Background Prefetching Options (Dropdown block) */}
          {(openSection === 'all' || openSection === 'api') && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div
                onClick={() => setOpenSection(openSection === 'api' ? 'all' : 'api')}
                className="flex items-center justify-between cursor-pointer"
              >
                <label className="text-sm font-bold text-slate-900 flex items-center gap-2 cursor-pointer">
                  <Key className="w-4 h-4 text-teal-700" />
                  API Keys &amp; Prefetching Options
                </label>
                <span className="text-xs text-teal-800 font-medium bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                  {getStoredApiKey().trim() ? 'Configured' : 'No Key'}
                </span>
              </div>

              {/* Optional Voice Key */}
              <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1.5">
                <label className="text-xs font-bold text-slate-800">
                  Voice key (optional dedicated key for audio synthesis)
                </label>
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
              </div>

              {/* Background Prefetching Control */}
              <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <span>Background Question Prefetching</span>
                    <span className={`w-2 h-2 rounded-full ${enablePrefetching ? 'bg-emerald-600 animate-pulse' : 'bg-slate-400'}`} />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !enablePrefetching;
                      setEnablePrefetching(next);
                      localStorage.setItem('toefl_enable_prefetching', next ? 'true' : 'false');
                      window.dispatchEvent(new Event('storage'));
                    }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded transition cursor-pointer ${
                      enablePrefetching
                        ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                        : 'bg-teal-700 text-white hover:bg-teal-800'
                    }`}
                  >
                    {enablePrefetching ? 'Stop Prefetching' : 'Start Prefetching'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  {enablePrefetching
                    ? 'Prefetches upcoming TOEFL questions in the background for instant generation.'
                    : 'Prefetching is stopped. Questions will only generate on-demand.'}
                </p>
              </div>
            </div>
          )}
        </div>

        {savedSuccess && (
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Settings updated successfully!</span>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-lg transition-colors cursor-pointer"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};
