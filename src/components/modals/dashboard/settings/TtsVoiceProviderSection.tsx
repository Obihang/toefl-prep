import React, { useState } from 'react';
import { Volume2, CheckCircle2, Play, AlertCircle } from 'lucide-react';
import { playSpeech, stopSpeaking } from '../../../../utils/audioSpeech';

export const TtsVoiceProviderSection: React.FC = () => {
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [ttsTestError, setTtsTestError] = useState<string | null>(null);
  const [isMale, setIsMale] = useState(false);

  const handleTestTts = async () => {
    stopSpeaking();
    setIsTesting(true);
    setTestResult(null);
    setTtsTestError(null);

    const testSpeaker = isMale ? 'Marcus (Male)' : 'Victoria (Female)';
    const testText = isMale
      ? 'Marcus (Male): This is a test of the Edge Neural voice engine.'
      : 'Victoria (Female): This is a test of the Edge Neural voice engine.';
    const voiceName = isMale ? 'en-US-GuyNeural' : 'en-US-AriaNeural';
    const startTime = Date.now();

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: testText,
          voiceName,
          gender: isMale ? 'male' : 'female',
          isMale,
          speaker: testSpeaker,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setTtsTestError(data.detail || data.error || "Unknown Error");
        return;
      }

      const audioUrl = data.audioUrl || (data.audioBase64 ? `data:${data.mimeType || 'audio/mpeg'};base64,${data.audioBase64}` : null);
      if (!audioUrl) {
        setTtsTestError('No audio returned from TTS server');
        return;
      }

      const audio = new Audio(audioUrl);
      audio.playbackRate = 1.0;
      await audio.play();

      setTestResult({
        success: true,
        message: `Playing (${Date.now() - startTime}ms) via Edge TTS`,
      });
    } catch (err: any) {
      setTtsTestError(err?.message || 'Error testing voice synthesis.');
      setTestResult(null);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 shadow-2xs">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
            <Volume2 className="w-4 h-4 text-teal-700" />
            Voice Engine
          </h4>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setIsMale(false)} className={`py-1 px-3 rounded-lg text-xs font-semibold cursor-pointer transition ${!isMale ? 'bg-teal-700 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>Female Voice</button>
          <button type="button" onClick={() => setIsMale(true)} className={`py-1 px-3 rounded-lg text-xs font-semibold cursor-pointer transition ${isMale ? 'bg-teal-700 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>Male Voice</button>
        </div>
      </div>

      <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-900 space-y-1">
        <div className="flex items-center gap-1.5 font-bold text-teal-800">
          <CheckCircle2 className="w-4 h-4 text-teal-600" />
          Voice Engine: Microsoft Edge Neural (100% Free & Unlimited)
        </div>
        <p className="text-[11px] text-teal-700 font-normal">
          Uses high-fidelity neural streaming audio via Microsoft Edge. No API key required.
        </p>
      </div>

      <button
        onClick={handleTestTts}
        disabled={isTesting}
        className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white py-2 rounded-lg text-xs font-semibold hover:bg-slate-800 transition disabled:opacity-50"
      >
        <Play className="w-3.5 h-3.5" />
        {isTesting ? 'Testing...' : 'Test Voice Synthesis'}
      </button>

      {testResult && <div className="p-2 bg-green-50 text-green-700 rounded text-xs flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/>{testResult.message}</div>}
      {ttsTestError && <div className="p-2 bg-red-50 text-red-700 rounded text-xs flex items-center gap-2"><AlertCircle className="w-4 h-4"/>{ttsTestError}</div>}
    </div>
  );
};
