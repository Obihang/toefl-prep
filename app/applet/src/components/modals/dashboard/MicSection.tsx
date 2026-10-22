import React, { useState, useEffect, useRef } from 'react';
import { Mic, CheckCircle2, AlertCircle, Volume2, RefreshCw } from 'lucide-react';
import { getStoredMicDeviceId, setStoredMicDeviceId, getAudioInputDevices } from '../../../utils/audioSpeech';

interface MicSectionProps {
  onVerified?: () => void;
}

export const MicSection: React.FC<MicSectionProps> = ({ onVerified }) => {
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  const [isTesting, setIsTesting] = useState(false);
  const [isPlayingBack, setIsPlayingBack] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0); // 0-100 percentage for live meter
  const [peakDb, setPeakDb] = useState(-100);
  const [rmsDb, setRmsDb] = useState(-100);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'recording' | 'playback' | 'success' | 'warning' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('Click "Test Microphone" to measure audio level, record 3s, and test playback.');
  const [deviceName, setDeviceName] = useState('Default System Microphone');
  const [sampleRate, setSampleRate] = useState<number>(44100);
  const [permissionState, setPermissionState] = useState<PermissionState | 'unknown'>('unknown');

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const intervalRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setSelectedMicId(getStoredMicDeviceId() || '');
    getAudioInputDevices().then(setMicDevices).catch(() => {});

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'microphone' as PermissionName }).then((result) => {
        setPermissionState(result.state);
        result.onchange = () => setPermissionState(result.state);
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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current = null;
    }
    setIsTesting(false);
    setIsPlayingBack(false);
    setAudioLevel(0);
  };

  const startTest = async () => {
    stopTest();
    setIsTesting(true);
    setTestStatus('testing');
    setStatusMessage('Requesting microphone access and listening...');

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
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      streamRef.current = stream;
      setPermissionState('granted');

      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        const settings = audioTrack.getSettings();
        setDeviceName(audioTrack.label || selectedMicId || 'Default Microphone');
        if (settings.sampleRate) {
          setSampleRate(settings.sampleRate);
        }
      }

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        throw new Error('Web Audio API not supported.');
      }

      const audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      audioContextRef.current = audioCtx;
      setSampleRate(audioCtx.sampleRate);

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const floatArray = new Float32Array(analyser.fftSize);
      let peakDurationMs = 0;
      let hasClipped = false;
      let isTooQuiet = true;
      const startTime = Date.now();

      // Live meter & measurement interval (every 50ms) using getFloatTimeDomainData
      intervalRef.current = setInterval(() => {
        if (!analyserRef.current) return;
        analyserRef.current.getFloatTimeDomainData(floatArray);

        let sumSquares = 0;
        let peak = 0;
        for (let i = 0; i < floatArray.length; i++) {
          const val = floatArray[i];
          sumSquares += val * val;
          if (Math.abs(val) > peak) peak = Math.abs(val);
        }

        const rms = Math.sqrt(sumSquares / floatArray.length);
        const safeRms = Math.max(rms, 1e-5);
        const safePeak = Math.max(peak, 1e-5);

        const calculatedRmsDb = 20 * Math.log10(safeRms);
        const calculatedPeakDb = 20 * Math.log10(safePeak);

        setRmsDb(Math.round(calculatedRmsDb * 10) / 10);
        setPeakDb(Math.round(calculatedPeakDb * 10) / 10);

        // Map rmsDb (-60 to 0 dBFS) to percentage (0 to 100) for live meter
        const pct = Math.min(100, Math.max(0, Math.round(((calculatedRmsDb + 60) / 60) * 100)));
        setAudioLevel(pct);

        if (calculatedPeakDb > -40) {
          peakDurationMs += 50;
          isTooQuiet = false;
        }
        if (calculatedPeakDb > -1) {
          hasClipped = true;
        }
      }, 50);

      // Setup MediaRecorder for 3 seconds recording
      recordedChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Stop analysis and tracks
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          try {
            audioContextRef.current.close();
          } catch {}
        }

        const passed = peakDurationMs >= 300 && !hasClipped && !isTooQuiet;

        if (hasClipped) {
          setTestStatus('warning');
          setStatusMessage('Microphone clipping detected (> -1 dBFS). Please move further back or lower input volume.');
        } else if (isTooQuiet || peakDurationMs < 300) {
          setTestStatus('warning');
          setStatusMessage(`Microphone too quiet (Peak: ${peakDb} dBFS). Please speak louder or check input.`);
        } else {
          setTestStatus('success');
          setStatusMessage('Microphone test passed! Playing back recording...');
          onVerified?.();
        }

        // Play back recording
        const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        audioElementRef.current = audio;
        setIsPlayingBack(true);
        setTestStatus('playback');

        audio.onended = () => {
          setIsPlayingBack(false);
          URL.revokeObjectURL(audioUrl);
        };

        audio.play().catch(() => {
          setIsPlayingBack(false);
        });
      };

      mediaRecorder.start();
      setTestStatus('recording');
      setStatusMessage('Recording for 3 seconds... Please speak into the mic.');

      setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, 3000);

    } catch (err: any) {
      stopTest();
      setTestStatus('error');
      const errName = err?.name || '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setPermissionState('denied');
        setStatusMessage('Permission denied. Please allow microphone access in your browser settings.');
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setStatusMessage('No microphone found. Please connect an audio input device.');
      } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
        setStatusMessage('Microphone in use by another application or device.');
      } else {
        setStatusMessage(err?.message || 'Could not access microphone. Please check permissions.');
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Device Selector & Info */}
      <div className="space-y-3">
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

        {/* Device Meta Info */}
        <div className="grid grid-cols-3 gap-2 text-[11px] bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-600">
          <div>
            <span className="font-bold block text-slate-800">Device</span>
            <span className="truncate block font-mono" title={deviceName}>{deviceName}</span>
          </div>
          <div>
            <span className="font-bold block text-slate-800">Sample Rate</span>
            <span className="font-mono">{sampleRate} Hz</span>
          </div>
          <div>
            <span className="font-bold block text-slate-800">Permission</span>
            <span className={`font-semibold capitalize ${permissionState === 'granted' ? 'text-emerald-700' : permissionState === 'denied' ? 'text-rose-700' : 'text-amber-700'}`}>
              {permissionState}
            </span>
          </div>
        </div>
      </div>

      {/* Level Meter & Status */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mic className={`w-4 h-4 ${isTesting || isPlayingBack ? 'text-emerald-600 animate-pulse' : 'text-slate-500'}`} />
            <span className="text-xs font-bold text-slate-800">Microphone Input &amp; Playback Test</span>
          </div>
          <div className="flex gap-2">
            {isTesting || isPlayingBack ? (
              <button
                onClick={stopTest}
                className="px-2.5 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 text-[11px] font-semibold rounded-md transition-colors cursor-pointer"
              >
                Stop Test
              </button>
            ) : (
              <button
                onClick={startTest}
                className="px-3 py-1 bg-teal-800 hover:bg-teal-900 text-white text-[11px] font-semibold rounded-md transition-colors cursor-pointer shadow-2xs flex items-center gap-1.5"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Test again</span>
              </button>
            )}
          </div>
        </div>

        {/* Level Meter Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-slate-500 font-medium">
            <span>Input Level (RMS: {rmsDb} dBFS, Peak: {peakDb} dBFS)</span>
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
          {(testStatus === 'testing' || testStatus === 'recording' || testStatus === 'playback') && <Volume2 className="w-4 h-4 text-teal-700 shrink-0 mt-0.5 animate-pulse" />}
          {testStatus === 'idle' && <Mic className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />}
          <span className="leading-relaxed">{statusMessage}</span>
        </div>
      </div>
    </div>
  );
};
