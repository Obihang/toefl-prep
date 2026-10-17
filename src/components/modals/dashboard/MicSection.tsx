import React, { useState, useEffect, useRef } from 'react';
import { Mic, CheckCircle2, AlertCircle, Volume2 } from 'lucide-react';
import { getStoredMicDeviceId, setStoredMicDeviceId, getAudioInputDevices } from '../../../utils/audioSpeech';

interface MicSectionProps {
  onVerified?: () => void;
}

export const MicSection: React.FC<MicSectionProps> = ({ onVerified }) => {
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  const [isTesting, setIsTesting] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [maxAmplitude, setMaxAmplitude] = useState(0);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'warning' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('Click "Test Microphone" and speak to check input.');

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const intervalRef = useRef<any>(null);

  useEffect(() => {
    setSelectedMicId(getStoredMicDeviceId() || '');
    getAudioInputDevices().then(setMicDevices).catch(() => {});

    const handleDeviceChange = () => {
      getAudioInputDevices().then(setMicDevices).catch(() => {});
    };
    navigator?.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
    return () => {
      navigator?.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
      stopTest();
    };
  }, []);

  const stopTest = () => {
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
    setIsTesting(false);
    setAudioLevel(0);
  };

  const startTest = async () => {
    stopTest();
    setIsTesting(true);
    setTestStatus('testing');
    setMaxAmplitude(0);
    setStatusMessage('Listening... Speak clearly into your microphone.');

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

      streamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        throw new Error('Web Audio API not supported.');
      }

      const audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.3;
      analyserRef.current = analyser;

      // Refresh audio input devices now that permission is granted
      getAudioInputDevices().then(setMicDevices).catch(() => {});

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const timeDomainData = new Uint8Array(analyser.fftSize);
      let localMax = 0;
      let soundDetectedCount = 0;

      intervalRef.current = setInterval(() => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(timeDomainData);

        let maxDeviation = 0;
        for (let i = 0; i < timeDomainData.length; i++) {
          const dev = Math.abs(timeDomainData[i] - 128);
          if (dev > maxDeviation) maxDeviation = dev;
        }

        const level = Math.min(100, Math.round((maxDeviation / 128) * 160));
        setAudioLevel(level);

        if (level > localMax) {
          localMax = level;
          setMaxAmplitude(localMax);
        }

        if (level > 10) {
          soundDetectedCount++;
          if (soundDetectedCount >= 2) {
            setTestStatus('success');
            setStatusMessage('Microphone active! Sound successfully detected.');
            onVerified?.();
          }
        }
      }, 40);

      setTimeout(() => {
        if (soundDetectedCount < 2) {
          setTestStatus('warning');
          setStatusMessage('No voice detected. Please check your mic volume or select another device.');
        }
      }, 7000);

    } catch (err: any) {
      stopTest();
      setTestStatus('error');
      const errName = err?.name || '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setStatusMessage('Microphone access blocked. Please allow microphone permissions in your browser address bar.');
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setStatusMessage('No microphone device found. Please connect an audio input.');
      } else {
        setStatusMessage(err?.message || 'Could not access microphone. Please check permissions.');
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Device Selector */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-700">Audio Input Device</label>
        <select
          value={selectedMicId}
          onChange={(e) => {
            setSelectedMicId(e.target.value);
            setStoredMicDeviceId(e.target.value);
            if (isTesting) startTest();
          }}
          className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 outline-hidden focus:border-teal-600 font-medium"
        >
          <option value="">Default System Microphone</option>
          {micDevices.map((device, idx) => (
            <option key={device.deviceId || idx} value={device.deviceId}>
              {device.label || `Microphone ${idx + 1}`}
            </option>
          ))}
        </select>
      </div>

      {/* Level Meter & Status */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mic className={`w-4 h-4 ${isTesting ? 'text-emerald-600 animate-pulse' : 'text-slate-500'}`} />
            <span className="text-xs font-bold text-slate-800">Microphone Input Test</span>
          </div>
          {isTesting ? (
            <button
              onClick={stopTest}
              className="px-2.5 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 text-[11px] font-semibold rounded-md transition-colors cursor-pointer"
            >
              Stop Test
            </button>
          ) : (
            <button
              onClick={startTest}
              className="px-3 py-1 bg-teal-800 hover:bg-teal-900 text-white text-[11px] font-semibold rounded-md transition-colors cursor-pointer shadow-2xs"
            >
              Test Microphone
            </button>
          )}
        </div>

        {/* Level Meter Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-slate-500 font-medium">
            <span>Input Level</span>
            <span>{audioLevel}%</span>
          </div>
          <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden p-0.5">
            <div
              className={`h-full rounded-full transition-all duration-75 ${
                audioLevel > 5 ? 'bg-emerald-500' : 'bg-teal-600'
              }`}
              style={{ width: `${audioLevel}%` }}
            />
          </div>
        </div>

        {/* Status Message */}
        <div className="flex items-start gap-2 text-xs text-slate-600 pt-1">
          {testStatus === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />}
          {testStatus === 'warning' && <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />}
          {testStatus === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />}
          {testStatus === 'testing' && <Volume2 className="w-4 h-4 text-teal-700 shrink-0 mt-0.5 animate-pulse" />}
          {testStatus === 'idle' && <Mic className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />}
          <span className="leading-relaxed">{statusMessage}</span>
        </div>
      </div>
    </div>
  );
};
