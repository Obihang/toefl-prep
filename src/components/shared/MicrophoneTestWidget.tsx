import React, { useState, useEffect, useRef } from 'react';
import { Mic, CheckCircle2, AlertCircle, Volume2, Radio } from 'lucide-react';
import { getStoredMicDeviceId, setStoredMicDeviceId, getAudioInputDevices, playSpeech } from '../../utils/audioSpeech';
import { runVoiceDiagnostic, VoiceDiagnosticResult } from '../../utils/voiceDiagnostics';

interface Props {
  onVerified?: () => void;
  compact?: boolean;
}

export const MicrophoneTestWidget: React.FC<Props> = ({ onVerified, compact = false }) => {
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  const [isTesting, setIsTesting] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [maxAmplitude, setMaxAmplitude] = useState(0);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'warning' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('Click "Test Microphone" and speak to check input.');

  const [diagnosticResult, setDiagnosticResult] = useState<VoiceDiagnosticResult | null>(null);
  const [isRunningDiagnostic, setIsRunningDiagnostic] = useState(false);
  const [isForcingSpeech, setIsForcingSpeech] = useState(false);
  const [speechFeedback, setSpeechFeedback] = useState<string | null>(null);

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
          echoCancellation: false,
          noiseSuppression: false,
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

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let localMax = 0;
      let soundDetectedCount = 0;

      intervalRef.current = setInterval(() => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const level = Math.min(100, Math.round((avg / 100) * 100));
        setAudioLevel(level);

        if (level > localMax) {
          localMax = level;
          setMaxAmplitude(localMax);
        }

        if (level > 4) {
          soundDetectedCount++;
          if (soundDetectedCount >= 3 && testStatus !== 'success') {
            setTestStatus('success');
            setStatusMessage('Microphone active! Sound successfully detected.');
            onVerified?.();
          }
        }
      }, 50);

      // Timeout after 8 seconds if no sound detected
      setTimeout(() => {
        if (isTesting && testStatus === 'testing') {
          if (localMax < 4) {
            setTestStatus('warning');
            setStatusMessage('No voice detected. Please check your mic volume or select another device.');
          }
        }
      }, 8000);

    } catch (err: any) {
      stopTest();
      setTestStatus('error');
      setStatusMessage(err?.message || 'Could not access microphone. Please check permissions.');
    }
  };

  return (
    <div className={`bg-white border border-slate-200 rounded-2xl ${compact ? 'p-4' : 'p-5'} space-y-4 shadow-xs`}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
            <Mic className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">Microphone Amplitude Test</h4>
            <p className="text-xs text-slate-500">Verify your microphone input before speaking tasks</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isTesting ? (
            <button
              type="button"
              onClick={stopTest}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              <span>Stop Test</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={startTest}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-lg transition shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Test Microphone</span>
            </button>
          )}
        </div>
      </div>

      {/* Mic Selector */}
      <div className="space-y-1">
        <label className="text-[11px] font-semibold text-slate-600">Select Audio Input Device</label>
        <select
          value={selectedMicId}
          onChange={(e) => {
            setSelectedMicId(e.target.value);
            setStoredMicDeviceId(e.target.value);
            if (isTesting) startTest();
          }}
          className="w-full text-xs border border-slate-300 rounded-lg px-3 py-1.5 bg-slate-50 text-slate-900 focus:border-teal-600 outline-hidden"
        >
          <option value="">Default Audio Input (System Default)</option>
          {micDevices.map((device, idx) => (
            <option key={device.deviceId || idx} value={device.deviceId}>
              {device.label || `Microphone ${idx + 1}`}
            </option>
          ))}
        </select>
      </div>

      {/* Real-time Amplitude Meter */}
      <div className="space-y-2 bg-slate-50/80 border border-slate-200/80 rounded-xl p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-700 flex items-center gap-1.5">
            {isTesting && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />}
            <span>{statusMessage}</span>
          </span>
          <span className="font-mono font-bold text-teal-800">{audioLevel}%</span>
        </div>

        {/* Level Bar */}
        <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden p-0.5">
          <div
            className={`h-full rounded-full transition-all duration-75 ${
              audioLevel > 50 ? 'bg-emerald-500' : audioLevel > 15 ? 'bg-teal-600' : audioLevel > 3 ? 'bg-sky-500' : 'bg-slate-300'
            }`}
            style={{ width: `${Math.max(3, audioLevel)}%` }}
          />
        </div>

        {/* Amplitude bars visualizer */}
        <div className="flex items-end justify-between gap-1 pt-1 h-8 px-1">
          {Array.from({ length: 24 }).map((_, i) => {
            const barHeight = Math.min(100, Math.max(8, (audioLevel * (Math.sin(i + audioLevel) + 1.2)) / 2));
            return (
              <div
                key={i}
                className={`flex-1 rounded-xs transition-all duration-75 ${
                  isTesting && audioLevel > 2 ? 'bg-teal-600' : 'bg-slate-300'
                }`}
                style={{ height: isTesting ? `${barHeight}%` : '15%' }}
              />
            );
          })}
        </div>
      </div>

      {/* Status Banner */}
      {testStatus === 'success' && (
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Microphone is active and working correctly! (Peak amplitude: {maxAmplitude}%)</span>
        </div>
      )}
      {testStatus === 'warning' && (
        <div className="flex items-center gap-2 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 p-2.5 rounded-lg">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>No speech detected. Check your physical mic mute switch or select another device.</span>
        </div>
      )}
      {testStatus === 'error' && (
        <div className="flex items-center gap-2 text-xs font-medium text-rose-800 bg-rose-50 border border-rose-200 p-2.5 rounded-lg">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Voice Synthesis Diagnostic Tool */}
      <div className="pt-3 border-t border-slate-100 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs font-semibold text-slate-700">Browser Speech Voice Diagnostics</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={async () => {
                setIsRunningDiagnostic(true);
                try {
                  const res = await runVoiceDiagnostic();
                  setDiagnosticResult(res);
                } catch (err: any) {
                  setDiagnosticResult({
                    hasSpeechSynthesis: false,
                    voicesCount: 0,
                    languages: [],
                    voicesList: [],
                    isAsynchronousLoading: false,
                    diagnosticMessage: err?.message || 'Diagnostic failed',
                  });
                } finally {
                  setIsRunningDiagnostic(false);
                }
              }}
              disabled={isRunningDiagnostic}
              className="px-2.5 py-1 text-[11px] font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-md transition cursor-pointer"
            >
              {isRunningDiagnostic ? 'Running...' : 'Check Voices'}
            </button>

            <button
              type="button"
              onClick={async () => {
                setIsForcingSpeech(true);
                setSpeechFeedback('Speaking test phrase ("Testing voice synthesis")...');
                try {
                  await playSpeech("Testing voice synthesis");
                  setSpeechFeedback('Speech synthesis triggered successfully!');
                } catch (err: any) {
                  setSpeechFeedback(`Speech synthesis error: ${err?.message || 'Unknown'}`);
                } finally {
                  setIsForcingSpeech(false);
                }
              }}
              disabled={isForcingSpeech}
              className="px-2.5 py-1 text-[11px] font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-md transition cursor-pointer shadow-xs"
            >
              {isForcingSpeech ? 'Speaking...' : 'Force Speech Synthesis'}
            </button>
          </div>
        </div>

        {speechFeedback && (
          <div className="text-[11px] font-medium text-teal-900 bg-teal-50 border border-teal-200 p-2 rounded-lg">
            {speechFeedback}
          </div>
        )}

        {diagnosticResult && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
            <div className="font-semibold text-slate-800 flex items-center justify-between">
              <span>Detected Voices: {diagnosticResult.voicesCount}</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${diagnosticResult.voicesCount > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                {diagnosticResult.voicesCount > 0 ? 'Available' : 'None Found'}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">{diagnosticResult.diagnosticMessage}</p>
            {diagnosticResult.languages.length > 0 && (
              <div>
                <span className="font-medium text-slate-700 text-[11px] block mb-1">Available Languages ({diagnosticResult.languages.length}):</span>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  {diagnosticResult.languages.map((lang) => (
                    <span key={lang} className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${lang.toLowerCase().startsWith('en') ? 'bg-teal-100 text-teal-900 font-bold border border-teal-300' : 'bg-slate-200 text-slate-700'}`}>
                      {lang}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
