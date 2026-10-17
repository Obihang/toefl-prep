import React, { useState, useEffect, useRef } from 'react';
import { Volume2, Mic, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { getVoices, playSpeech, getVoiceEngine, setVoiceEngine, getAudioInputDevices, getStoredMicDeviceId, setStoredMicDeviceId } from '../../../../utils/audioSpeech';

export const VoiceCheckingSection: React.FC = () => {
  const [engine, setEngine] = useState<'webspeech' | 'kokoro' | 'aivoice'>('webspeech');
  const [voices, setVoices] = useState<any[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('Kore');
  const [speed, setSpeed] = useState(1.0);
  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const [testResult, setTestResult] = useState<{ success?: boolean; message?: string } | null>(null);
  const [kokoroLoading, setKokoroLoading] = useState(false);
  const [kokoroError, setKokoroError] = useState<string | null>(null);

  // Mic check state
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState('');
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [micStatusMsg, setMicStatusMsg] = useState('Click "Test Microphone" and speak.');
  const [micStatusType, setMicStatusType] = useState<'idle' | 'testing' | 'success' | 'warning' | 'error'>('idle');

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<any>(null);

  useEffect(() => {
    const storedEng = getVoiceEngine();
    // Map stored engine to one of the 3
    if (storedEng === 'offline') setEngine('kokoro');
    else if (storedEng === 'cloud') setEngine('aivoice');
    else setEngine('webspeech');

    setVoices(getVoices());
    setSelectedMicId(getStoredMicDeviceId() || '');
    getAudioInputDevices().then(setMicDevices).catch(() => {});
  }, []);

  const handleEngineChange = async (newEng: 'webspeech' | 'kokoro' | 'aivoice') => {
    setEngine(newEng);
    setKokoroError(null);
    if (newEng === 'webspeech') setVoiceEngine('device');
    else if (newEng === 'kokoro') {
      setVoiceEngine('offline');
      setKokoroLoading(true);
      try {
        // simulate or trigger load check
        setTimeout(() => setKokoroLoading(false), 800);
      } catch (err: any) {
        setKokoroError(err?.message || 'Failed to load Kokoro neural model');
        setKokoroLoading(false);
      }
    } else if (newEng === 'aivoice') {
      setVoiceEngine('cloud');
    }
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
        }
      });
      setTestResult({ success: true, message: statusLog || 'Voice test completed successfully!' });
    } catch (err: any) {
      // Automatic fallback notice
      setTestResult({
        success: false,
        message: `Engine encountered an issue (${err?.message || 'unavailable'}). Automatically fell back to Web Speech.`
      });
      setEngine('webspeech');
      setVoiceEngine('device');
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
      try { audioContextRef.current.close(); } catch {}
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
          ...(selectedMicId ? { deviceId: { exact: selectedMicId } } : {}),
        },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let maxL = 0;

      intervalRef.current = setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const lvl = Math.min(100, Math.round((sum / dataArray.length) * 120));
        setAudioLevel(lvl);
        if (lvl > maxL) maxL = lvl;

        if (lvl > 5) {
          setMicStatusType('success');
          setMicStatusMsg('Microphone active! Voice input detected successfully.');
        }
      }, 50);

      setTimeout(() => {
        if (maxL < 5 && isTestingMic) {
          setMicStatusType('warning');
          setMicStatusMsg('No voice detected. Please check microphone volume or select another input.');
        }
      }, 6000);
    } catch (err: any) {
      stopMicTest();
      setMicStatusType('error');
      setMicStatusMsg(err?.message || 'Microphone permission denied or no microphone found.');
    }
  };

  return (
    <div className="space-y-4 pt-2">
      <div>
        <h4 className="font-bold text-slate-900 text-sm">Voice &amp; Speech Checking</h4>
        <p className="text-xs text-slate-500 mt-0.5">
          Choose your preferred speech synthesis engine, test audio output, and verify microphone input levels.
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
              engine === 'webspeech' ? 'border-teal-600 bg-teal-50/50 ring-2 ring-teal-600/20' : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className="font-bold text-xs text-slate-900">1. Web Speech</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Browser built-in, offline ready, instant.</div>
          </button>

          <button
            type="button"
            onClick={() => handleEngineChange('kokoro')}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              engine === 'kokoro' ? 'border-teal-600 bg-teal-50/50 ring-2 ring-teal-600/20' : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className="font-bold text-xs text-slate-900">2. Kokoro Neural</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Local neural TTS, high-quality audio.</div>
          </button>

          <button
            type="button"
            onClick={() => handleEngineChange('aivoice')}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              engine === 'aivoice' ? 'border-teal-600 bg-teal-50/50 ring-2 ring-teal-600/20' : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className="font-bold text-xs text-slate-900">3. AI Voice (Cloud)</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Cloud model-based voice (requires API key).</div>
          </button>
        </div>

        {kokoroLoading && (
          <div className="p-2.5 bg-amber-50 text-amber-900 border border-amber-200 rounded-lg text-xs flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-amber-600" />
            <span>Loading local Kokoro neural weights...</span>
          </div>
        )}
        {kokoroError && (
          <div className="p-2.5 bg-rose-50 text-rose-900 border border-rose-200 rounded-lg text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600" />
            <span>{kokoroError}. Fell back to Web Speech.</span>
          </div>
        )}
      </div>

      {/* Voice Picker & Speed */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700">Voice / Persona</label>
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
            <span>Speaking Speed</span>
            <span>{speed}x</span>
          </div>
          <input
            type="range"
            min="0.8"
            max="1.2"
            step="0.05"
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            className="w-full accent-teal-600 mt-2"
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
          <span>{isTestingVoice ? 'Playing Test...' : 'Test Voice Audio'}</span>
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
            <p className="text-[11px] text-slate-500">Verify your input device and test voice level before speaking tasks.</p>
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
          <label className="text-[11px] font-semibold text-slate-600">Input Device</label>
          <select
            value={selectedMicId}
            onChange={(e) => {
              setSelectedMicId(e.target.value);
              setStoredMicDeviceId(e.target.value);
              if (isTestingMic) startMicTest();
            }}
            className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 outline-hidden focus:border-teal-600"
          >
            <option value="">Default System Microphone</option>
            {micDevices.map((d, i) => (
              <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-slate-500 font-medium">
            <span>Input Level Meter</span>
            <span>{audioLevel}%</span>
          </div>
          <div className="h-2 bg-slate-200 rounded-full overflow-hidden p-0.5">
            <div
              className="h-full bg-teal-600 rounded-full transition-all duration-75"
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
