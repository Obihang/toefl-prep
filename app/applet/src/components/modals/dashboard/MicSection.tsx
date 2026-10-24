import React, { useState, useEffect, useRef } from 'react';
import { Mic, CheckCircle2, AlertCircle, Volume2, RotateCcw } from 'lucide-react';
import { getStoredMicDeviceId, setStoredMicDeviceId, getAudioInputDevices } from '../../../utils/audioSpeech';

interface MicSectionProps {
  onVerified?: () => void;
}

export const MicSection: React.FC<MicSectionProps> = ({ onVerified }) => {
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  const [isTesting, setIsTesting] = useState(false);
  const [rmsDb, setRmsDb] = useState<number>(-60);
  const [peakDb, setPeakDb] = useState<number>(-60);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'recording' | 'playing' | 'success' | 'warning' | 'error' | 'permission_denied' | 'no_mic' | 'mic_in_use'>('idle');
  const [statusMessage, setStatusMessage] = useState('Click "Test Microphone" to start 3-second recording and audio test.');
  const [deviceInfo, setDeviceInfo] = useState<{ label: string; sampleRate: number; permissionState: string }>({ label: '', sampleRate: 0, permissionState: 'unknown' });
  const [audioPlaybackUrl, setAudioPlaybackUrl] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<any>(null);
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setSelectedMicId(getStoredMicDeviceId() || '');
    getAudioInputDevices().then(setMicDevices).catch(() => {});

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'microphone' as any }).then((res) => {
        setDeviceInfo((prev) => ({ ...prev, permissionState: res.state }));
        res.onchange = () => {
          setDeviceInfo((prev) => ({ ...prev, permissionState: res.state }));
        };
      }).catch(() => {});
    }

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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
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
    if (playbackAudioRef.current) {
      try {
        playbackAudioRef.current.pause();
        playbackAudioRef.current = null;
      } catch {}
    }
    setIsTesting(false);
  };

  const startTest = async () => {
    stopTest();
    setIsTesting(true);
    setTestStatus('testing');
    setRmsDb(-60);
    setPeakDb(-60);
    setStatusMessage('Resuming audio context and requesting microphone access...');
    audioChunksRef.current = [];
    setAudioPlaybackUrl(null);

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        throw new Error('Web Audio API not supported.');
      }

      const audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      audioContextRef.current = audioCtx;

      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          channelCount: 1,
          ...(selectedMicId ? { deviceId: { exact: selectedMicId } } : {}),
        },
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err: any) {
        const name = err?.name || '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setTestStatus('permission_denied');
          setStatusMessage('Permission denied. Please allow microphone access in your browser settings.');
          setIsTesting(false);
          return;
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setTestStatus('no_mic');
          setStatusMessage('No microphone found. Please connect an audio input device.');
          setIsTesting(false);
          return;
        } else if (name === 'NotReadableError' || name === 'TrackStartError') {
          setTestStatus('mic_in_use');
          setStatusMessage('Microphone in use by another application.');
          setIsTesting(false);
          return;
        }
        throw err;
      }

      streamRef.current = stream;
      const track = stream.getAudioTracks()[0];
      const deviceLabel = track ? track.label : 'Default Microphone';
      const sampleRate = audioCtx.sampleRate;
      setDeviceInfo((prev) => ({ ...prev, label: deviceLabel, sampleRate, permissionState: 'granted' }));

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.2;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4' });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioPlaybackUrl(url);
        setTestStatus('playing');
        setStatusMessage('Playing back 3-second recording...');

        const pAudio = new Audio(url);
        playbackAudioRef.current = pAudio;
        pAudio.onended = () => {
          setIsTesting(false);
          stopTest();
        };
        pAudio.play().catch(() => {
          setIsTesting(false);
          stopTest();
        });
      };

      recorder.start();
      setTestStatus('recording');
      setStatusMessage('Recording 3 seconds... Speak into your microphone.');

      const floatArray = new Float32Array(analyser.fftSize);
      let aboveThresholdMs = 0;
      let maxPeakSeen = -100;
      let totalRmsAccum = 0;
      let countRms = 0;

      const startTime = Date.now();
      intervalRef.current = setInterval(() => {
        if (!analyserRef.current) return;
        analyserRef.current.getFloatTimeDomainData(floatArray);

        let sumSq = 0;
        let peak = 0;
        for (let i = 0; i < floatArray.length; i++) {
          const val = floatArray[i];
          sumSq += val * val;
          if (Math.abs(val) > peak) peak = Math.abs(val);
        }

        const rms = Math.sqrt(sumSq / floatArray.length);
        const safeRms = Math.max(rms, 1e-5);
        const currentRmsDb = 20 * Math.log10(safeRms);

        const safePeak = Math.max(peak, 1e-5);
        const currentPeakDb = 20 * Math.log10(safePeak);

        setRmsDb(Math.round(currentRmsDb));
        setPeakDb(Math.round(currentPeakDb));

        if (currentPeakDb > maxPeakSeen) {
          maxPeakSeen = currentPeakDb;
        }
        totalRmsAccum += currentRmsDb;
        countRms++;

        if (currentPeakDb > -40) {
          aboveThresholdMs += 50;
        }

        if (Date.now() - startTime >= 3000) {
          clearInterval(intervalRef.current);
          try {
            recorder.stop();
          } catch {}

          const avgRmsDb = countRms > 0 ? totalRmsAccum / countRms : -60;
          if (maxPeakSeen > -1) {
            setTestStatus('warning');
            setStatusMessage('Warning: Audio clipping detected (above -1 dBFS). Please move slightly further or lower gain.');
          } else if (avgRmsDb < -50 || aboveThresholdMs < 300) {
            setTestStatus('warning');
            setStatusMessage('Warning: Microphone too quiet (below -50 dBFS or peak < -40 dBFS for <300ms). Please speak louder or check input.');
          } else {
            setTestStatus('success');
            setStatusMessage('Microphone test passed successfully!');
            onVerified?.();
          }
        }
      }, 50);

      setTimeout(() => {
        if (recorder.state === 'recording') {
          try {
            recorder.stop();
          } catch {}
        }
      }, 3200);

    } catch (err: any) {
      stopTest();
      setTestStatus('error');
      setStatusMessage(err?.message || 'Could not access microphone.');
    }
  };

  const normalizedMeter = Math.max(0, Math.min(100, Math.round(((rmsDb + 60) / 60) * 100)));

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
          className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 outline-hidden focus:border-teal-600 font-medium cursor-pointer"
        >
          <option value="">Default System Microphone</option>
          {micDevices.map((device, idx) => (
            <option key={device.deviceId || idx} value={device.deviceId}>
              {device.label || `Microphone ${idx + 1}`}
            </option>
          ))}
        </select>
      </div>

      {/* Device Info & Status Card */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mic className={`w-4 h-4 ${isTesting ? 'text-emerald-600 animate-pulse' : 'text-slate-500'}`} />
            <span className="text-xs font-bold text-slate-800">Microphone Test &amp; 3s Playback</span>
          </div>
          <div className="flex gap-2">
            {isTesting ? (
              <button
                type="button"
                onClick={stopTest}
                className="px-2.5 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 text-[11px] font-semibold rounded-md transition-colors cursor-pointer"
              >
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={startTest}
                className="px-3 py-1 bg-teal-800 hover:bg-teal-900 text-white text-[11px] font-semibold rounded-md transition-colors cursor-pointer shadow-2xs flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>{audioPlaybackUrl ? 'Test Again' : 'Test Microphone'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Device metadata summary */}
        <div className="grid grid-cols-3 gap-2 text-[11px] bg-white border border-slate-200 rounded-lg p-2 text-slate-600">
          <div>
            <span className="font-semibold block text-slate-800">Device</span>
            <span className="truncate block font-mono text-[10px]" title={deviceInfo.label || 'Default'}>{deviceInfo.label || 'Default'}</span>
          </div>
          <div>
            <span className="font-semibold block text-slate-800">Sample Rate</span>
            <span>{deviceInfo.sampleRate ? `${deviceInfo.sampleRate} Hz` : 'Ready'}</span>
          </div>
          <div>
            <span className="font-semibold block text-slate-800">Permission</span>
            <span className="capitalize">{deviceInfo.permissionState}</span>
          </div>
        </div>

        {/* Level Meter Bar (RMS in dBFS) */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-slate-500 font-medium">
            <span>RMS Level ({rmsDb} dBFS) | Peak ({peakDb} dBFS)</span>
            <span>{normalizedMeter}%</span>
          </div>
          <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden p-0.5">
            <div
              className={`h-full rounded-full transition-all duration-75 ${
                rmsDb > -25 ? 'bg-amber-500' : rmsDb > -50 ? 'bg-emerald-500' : 'bg-teal-600'
              }`}
              style={{ width: `${normalizedMeter}%` }}
            />
          </div>
        </div>

        {/* Status Message */}
        <div className="flex items-start gap-2 text-xs text-slate-600 pt-1">
          {testStatus === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />}
          {(testStatus === 'warning' || testStatus === 'mic_in_use') && <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />}
          {(testStatus === 'error' || testStatus === 'permission_denied' || testStatus === 'no_mic') && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />}
          {(testStatus === 'testing' || testStatus === 'recording' || testStatus === 'playing') && <Volume2 className="w-4 h-4 text-teal-700 shrink-0 mt-0.5 animate-pulse" />}
          {testStatus === 'idle' && <Mic className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />}
          <span className="leading-relaxed">{statusMessage}</span>
        </div>
      </div>
    </div>
  );
};
