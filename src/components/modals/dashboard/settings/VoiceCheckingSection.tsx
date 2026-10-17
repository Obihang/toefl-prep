import React, { useState, useEffect, useRef } from 'react';
import { Volume2, Mic, CheckCircle2, AlertCircle, RefreshCw, Download, Trash2 } from 'lucide-react';
import {
  getVoices,
  playSpeech,
  getVoiceEngine,
  setVoiceEngine,
  getAudioInputDevices,
  getStoredMicDeviceId,
  setStoredMicDeviceId,
} from '../../../../utils/audioSpeech';
import {
  isOfflineVoiceDownloaded,
  downloadOfflineVoice,
  removeOfflineVoice,
} from '../../../../utils/offlineVoice';
import { getVoiceEngineFailureCount } from '../../../../utils/voiceDiagnostics';

export const VoiceCheckingSection: React.FC = () => {
  const [engine, setEngine] = useState<'webspeech' | 'kokoro' | 'aivoice'>('webspeech');
  const [voices, setVoices] = useState<any[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('Kore');
  const [speed, setSpeed] = useState(1.0);
  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const [testResult, setTestResult] = useState<{ success?: boolean; message?: string } | null>(null);

  // Kokoro offline model management state
  const [isKokoroDownloaded, setIsKokoroDownloaded] = useState(false);
  const [isDownloadingKokoro, setIsDownloadingKokoro] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [downloadStatusText, setDownloadStatusText] = useState<string>('');
  const [kokoroNotice, setKokoroNotice] = useState<string | null>(null);

  // Mic check state
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState('');
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [micStatusMsg, setMicStatusMsg] = useState('Click "Test Microphone" and speak.');
  const [micStatusType, setMicStatusType] = useState<'idle' | 'testing' | 'success' | 'warning' | 'error'>('idle');

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const intervalRef = useRef<any>(null);

  useEffect(() => {
    const syncEngine = () => {
      const storedEng = getVoiceEngine();
      if (storedEng === 'offline') setEngine('kokoro');
      else if (storedEng === 'cloud') setEngine('aivoice');
      else setEngine('webspeech');
    };

    syncEngine();
    setIsKokoroDownloaded(isOfflineVoiceDownloaded());
    setVoices(getVoices());
    setSelectedMicId(getStoredMicDeviceId() || '');
    getAudioInputDevices().then(setMicDevices).catch(() => {});

    const handleEngineEvent = (e: any) => {
      const eng = e.detail?.engine || getVoiceEngine();
      if (eng === 'offline') setEngine('kokoro');
      else if (eng === 'cloud') setEngine('aivoice');
      else setEngine('webspeech');
    };

    const handleFallbackToast = (e: any) => {
      if (e.detail) {
        setEngine('webspeech');
        setTestResult({
          success: false,
          message: `${e.detail.failedEngine} failed after 3 attempts (${e.detail.reason || 'audio error'}). Automatically switched to Web Speech.`,
        });
      }
    };

    window.addEventListener('toefl_voice_engine_changed', handleEngineEvent);
    window.addEventListener('toefl_voice_fallback_toast', handleFallbackToast);
    return () => {
      window.removeEventListener('toefl_voice_engine_changed', handleEngineEvent);
      window.removeEventListener('toefl_voice_fallback_toast', handleFallbackToast);
    };
  }, []);

  const handleEngineChange = async (newEng: 'webspeech' | 'kokoro' | 'aivoice') => {
    setEngine(newEng);
    setTestResult(null);
    if (newEng === 'webspeech') {
      setVoiceEngine('device');
    } else if (newEng === 'kokoro') {
      setVoiceEngine('offline');
      if (!isOfflineVoiceDownloaded()) {
        setKokoroNotice('Tip: Kokoro model weights are not downloaded yet. Click "Download Kokoro Model" below to pre-cache for instant voice response.');
      } else {
        setKokoroNotice(null);
      }
    } else if (newEng === 'aivoice') {
      setVoiceEngine('cloud');
    }
  };

  const handleDownloadKokoro = async () => {
    setIsDownloadingKokoro(true);
    setDownloadProgress(0);
    setDownloadStatusText('Initializing neural model download...');
    setKokoroNotice(null);

    const res = await downloadOfflineVoice((pct, status) => {
      setDownloadProgress(Math.round(pct));
      setDownloadStatusText(status || `Downloading weights (${Math.round(pct)}%)...`);
    });

    setIsDownloadingKokoro(false);
    if (res.success) {
      setIsKokoroDownloaded(true);
      setDownloadProgress(null);
      setKokoroNotice('Kokoro 82M model successfully downloaded and cached! Speech synthesis will now be instant and offline.');
      setTimeout(() => setKokoroNotice(null), 5000);
    } else {
      setKokoroNotice(`Download failed: ${res.error || 'Network error'}. You can still use Web Speech.`);
    }
  };

  const handleDeleteKokoro = async () => {
    await removeOfflineVoice();
    setIsKokoroDownloaded(false);
    setDownloadProgress(null);
    setKokoroNotice('Kokoro model weights removed from browser cache. Storage freed.');
    setTimeout(() => setKokoroNotice(null), 4000);
  };

  const handleTestVoice = async () => {
    setIsTestingVoice(true);
    setTestResult(null);
    try {
      let statusLog = '';
      await playSpeech('Welcome to TOEFL Prep Studio. Your speaking and writing success starts here.', {
        voiceName: selectedVoice,
        onStatus: (msg) => {
          statusLog = msg;
        },
        onEngineDetected: (eng) => {
          statusLog = eng;
        },
      });
      setTestResult({ success: true, message: statusLog || 'Voice test completed successfully!' });
    } catch (err: any) {
      const activeVoiceEng = getVoiceEngine();
      const failures = getVoiceEngineFailureCount(engine);
      if (activeVoiceEng === 'device' && engine !== 'webspeech') {
        setEngine('webspeech');
        setTestResult({
          success: false,
          message: `${engine === 'kokoro' ? 'Kokoro' : 'AI Voice'} failed 3 consecutive attempts (${err?.message || 'unavailable'}). Automatically toggled setting to Web Speech.`,
        });
      } else {
        setTestResult({
          success: false,
          message: `${engine === 'kokoro' ? 'Kokoro' : 'AI Voice'} encountered an issue (${err?.message || 'unavailable'}). Diagnostic attempt ${failures || 1}/3.`,
        });
      }
    } finally {
      setIsTestingVoice(false);
    }
  };

  const stopMicTest = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    setIsTestingMic(false);
    setAudioLevel(0);
  };

  const startMicTest = async () => {
    stopMicTest();
    setIsTestingMic(true);
    setMicStatusType('testing');
    setMicStatusMsg('Listening... Speak clearly into your microphone.');

    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(selectedMicId ? { deviceId: { exact: selectedMicId } } : {}),
        },
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch {
        // Fallback without deviceId constraint in case of ID mismatch
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      streamRef.current = stream;

      // Refresh audio input devices now that permission is granted
      getAudioInputDevices().then(setMicDevices).catch(() => {});

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.2;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const timeDomainData = new Uint8Array(analyser.fftSize);
      let soundCount = 0;
      let maxLvl = 0;

      intervalRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(timeDomainData);
        let maxDeviation = 0;
        for (let i = 0; i < timeDomainData.length; i++) {
          const dev = Math.abs(timeDomainData[i] - 128);
          if (dev > maxDeviation) maxDeviation = dev;
        }

        // Calculate responsive volume level (0-100)
        const lvl = Math.min(100, Math.round((maxDeviation / 128) * 160));
        setAudioLevel(lvl);
        if (lvl > maxLvl) maxLvl = lvl;

        if (lvl > 10) {
          soundCount++;
          if (soundCount >= 2) {
            setMicStatusType('success');
            setMicStatusMsg('Microphone working properly! Sound detected successfully.');
          }
        }
      }, 40);

      setTimeout(() => {
        if (isTestingMic && soundCount < 2) {
          setMicStatusType('warning');
          setMicStatusMsg('No clear sound detected. Please verify your mic is unmuted or speak louder.');
        }
      }, 7000);
    } catch (err: any) {
      stopMicTest();
      setMicStatusType('error');
      const errName = err?.name || '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setMicStatusMsg('Microphone permission blocked. Please allow microphone access in your browser address bar.');
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setMicStatusMsg('No microphone found on your computer. Please connect an audio input.');
      } else {
        setMicStatusMsg(err?.message || 'Could not access microphone.');
      }
    }
  };

  return (
    <div className="space-y-4 pt-2">
      <div>
        <h4 className="font-bold text-slate-900 text-sm">Voice &amp; Speech Checking</h4>
        <p className="text-xs text-slate-500 mt-0.5">
          Choose your speech engine, manage local neural weights (Kokoro), test audio output, and check your microphone.
        </p>
      </div>

      {/* Voice Engine Selector */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-700">Voice Synthesis Engine</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={() => handleEngineChange('webspeech')}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              engine === 'webspeech'
                ? 'border-teal-600 bg-teal-50/50 ring-2 ring-teal-600/20'
                : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className="font-bold text-xs text-slate-900">1. Web Speech</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Built-in browser synthesis. Works offline, 0 download.</div>
          </button>

          <button
            type="button"
            onClick={() => handleEngineChange('kokoro')}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative ${
              engine === 'kokoro'
                ? 'border-teal-600 bg-teal-50/50 ring-2 ring-teal-600/20'
                : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="font-bold text-xs text-slate-900">2. Kokoro Neural</div>
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${isKokoroDownloaded ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                {isKokoroDownloaded ? 'Ready' : 'Not Cached'}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Local neural TTS. High natural quality.</div>
          </button>

          <button
            type="button"
            onClick={() => handleEngineChange('aivoice')}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              engine === 'aivoice'
                ? 'border-teal-600 bg-teal-50/50 ring-2 ring-teal-600/20'
                : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className="font-bold text-xs text-slate-900">3. AI Voice (Cloud)</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Native cloud audio via your configured API key.</div>
          </button>
        </div>
      </div>

      {/* Kokoro Model Download / Delete Management Card */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <span>Kokoro 82M Neural Voice Storage</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${isKokoroDownloaded ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {isKokoroDownloaded ? '✓ Cached in Browser (Fast Playback)' : 'Not Cached (~15-25s on first test)'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Pre-downloading Kokoro stores model weights in browser storage so voice synthesis runs instantly without network lag.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!isKokoroDownloaded ? (
              <button
                type="button"
                onClick={handleDownloadKokoro}
                disabled={isDownloadingKokoro}
                className="px-3 py-1.5 bg-teal-800 hover:bg-teal-900 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                {isDownloadingKokoro ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>{isDownloadingKokoro ? 'Downloading...' : 'Download Kokoro Model'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDeleteKokoro}
                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Delete Kokoro Cache</span>
              </button>
            )}
          </div>
        </div>

        {isDownloadingKokoro && (
          <div className="space-y-1 pt-1">
            <div className="flex justify-between text-[11px] text-slate-600 font-medium">
              <span>{downloadStatusText}</span>
              <span>{downloadProgress !== null ? `${downloadProgress}%` : ''}</span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-600 transition-all duration-200 rounded-full"
                style={{ width: `${downloadProgress || 5}%` }}
              />
            </div>
          </div>
        )}

        {kokoroNotice && (
          <div className="p-2.5 bg-teal-50 border border-teal-200 text-teal-900 rounded-lg text-xs flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
            <span>{kokoroNotice}</span>
          </div>
        )}
      </div>

      {/* Voice Picker & Speed */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700">Voice Persona</label>
          <select
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 outline-hidden focus:border-teal-600 font-medium"
          >
            <option value="Kore">Kore (Balanced Academic)</option>
            <option value="Fenrir">Fenrir (Authoritative Male)</option>
            <option value="Aoede">Aoede (Clear Female)</option>
            <option value="Alloy">Alloy (Neutral)</option>
            <option value="Echo">Echo (Resonant)</option>
            {voices.map((v, i) => (
              <option key={i} value={v.name}>{v.name} ({v.lang})</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs font-semibold text-slate-700">
            <span>Playback Speed</span>
            <span>{speed}x</span>
          </div>
          <input
            type="range"
            min="0.8"
            max="1.2"
            step="0.05"
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            className="w-full accent-teal-600 mt-2 cursor-pointer"
          />
        </div>
      </div>

      {/* Test Voice Button */}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={handleTestVoice}
          disabled={isTestingVoice}
          className="px-4 py-2 bg-teal-800 hover:bg-teal-900 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
        >
          <Volume2 className="w-4 h-4" />
          <span>{isTestingVoice ? 'Synthesizing Audio...' : 'Test Voice Output'}</span>
        </button>
      </div>

      {testResult && (
        <div className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${testResult.success ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : 'bg-amber-50 text-amber-900 border border-amber-200'}`}>
          {testResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />}
          <span>{testResult.message}</span>
        </div>
      )}

      {/* Microphone Check Sub-section */}
      <div className="border-t border-slate-200 pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h5 className="font-bold text-slate-900 text-xs">Microphone Check &amp; Permissions</h5>
            <p className="text-[11px] text-slate-500">Live test to ensure your microphone picks up clear speech before practice.</p>
          </div>
          {isTestingMic ? (
            <button
              type="button"
              onClick={stopMicTest}
              className="px-3 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Stop Test
            </button>
          ) : (
            <button
              type="button"
              onClick={startMicTest}
              className="px-3 py-1 bg-teal-800 hover:bg-teal-900 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer shadow-xs"
            >
              Test Microphone
            </button>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-slate-600">Selected Audio Device</label>
          <select
            value={selectedMicId}
            onChange={(e) => {
              setSelectedMicId(e.target.value);
              setStoredMicDeviceId(e.target.value);
              if (isTestingMic) startMicTest();
            }}
            className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 outline-hidden focus:border-teal-600 font-medium"
          >
            <option value="">Default System Microphone</option>
            {micDevices.map((d, i) => (
              <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-slate-500 font-medium">
            <span>Live Microphone Waveform Level</span>
            <span className="font-mono font-bold">{audioLevel}%</span>
          </div>
          <div className="h-3 bg-slate-200 rounded-full overflow-hidden p-0.5">
            <div
              className={`h-full rounded-full transition-all duration-75 ${audioLevel > 10 ? 'bg-emerald-500' : 'bg-teal-600'}`}
              style={{ width: `${audioLevel}%` }}
            />
          </div>
        </div>

        <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
          micStatusType === 'success' ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' :
          micStatusType === 'error' ? 'bg-rose-50 text-rose-900 border border-rose-200' :
          micStatusType === 'warning' ? 'bg-amber-50 text-amber-900 border border-amber-200' :
          'bg-slate-50 text-slate-700 border border-slate-200'
        }`}>
          {micStatusType === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-slate-500 shrink-0" />}
          <span>{micStatusMsg}</span>
        </div>
      </div>
    </div>
  );
};
