import React, { useState, useEffect } from 'react';
import { Volume2, CheckCircle2, AlertCircle, Play, Sparkles } from 'lucide-react';
import {
  getVoices,
  playSpeech,
  stopSpeaking,
  getVoiceEngine,
  setVoiceEngine,
} from '../../../../utils/audioSpeech';
import { getStoredApiKey } from '../../../../utils/apiKey';
import { getAiStatusInfo } from '../../../../utils/aiFallbackChain';
import { TtsVoiceProviderSection } from './TtsVoiceProviderSection';

export const VoiceCheckingSection: React.FC = () => {
  const [engine, setEngine] = useState<'auto' | 'edge' | 'cloud' | 'device'>('auto');
  const [voices, setVoices] = useState<any[]>([]);
  const [speed, setSpeed] = useState<number>(() => {
    const saved = localStorage.getItem('toefl_voice_speed');
    return saved ? parseFloat(saved) : 1.0;
  });
  const [selectedVoice, setSelectedVoice] = useState<'female' | 'male'>('female');
  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const [testResult, setTestResult] = useState<{ success?: boolean; message?: string } | null>(null);

  const aiStatus = getAiStatusInfo();

  useEffect(() => {
    const stored = getVoiceEngine();
    if (stored === 'cloud') setEngine('cloud');
    else if (stored === 'device') setEngine('device');
    else setEngine('auto');

    setVoices(getVoices());
  }, []);

  const handleEngineChange = (newEng: 'auto' | 'edge' | 'cloud' | 'device') => {
    setEngine(newEng);
    setTestResult(null);
    if (newEng === 'device') {
      setVoiceEngine('device');
    } else if (newEng === 'cloud') {
      setVoiceEngine('cloud');
    } else {
      setVoiceEngine('auto');
    }
  };

  const handleTestVoice = async () => {
    stopSpeaking();
    setIsTestingVoice(true);
    setTestResult(null);

    const testText =
      selectedVoice === 'female'
        ? 'Ms. Test (Female): This is a test of the female voice.'
        : 'Mr. Test (Male): This is a test of the male voice.';

    try {
      const startTime = Date.now();
      await playSpeech(testText, {
        voiceName: selectedVoice === 'female' ? 'en-US-JennyNeural' : 'en-US-GuyNeural',
        speaker: selectedVoice === 'female' ? 'Ms. Test (Female)' : 'Mr. Test (Male)',
        rate: speed,
        onStart: () => {
          const latency = Date.now() - startTime;
          setTestResult({
            success: true,
            message: `Playback active! Synthesized & started in ${latency}ms via ${engine === 'device' ? 'Browser Web Speech' : 'Edge Neural TTS'}.`,
          });
        },
        onError: (err) => {
          setTestResult({
            success: false,
            message: err?.message || 'Voice playback failed.',
          });
        },
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'Failed to initialize voice playback.',
      });
    } finally {
      setIsTestingVoice(false);
    }
  };

  const hasGemini = !!getStoredApiKey('gemini');
  const hasGroq = !!getStoredApiKey('groq');
  const hasOpenRouter = !!getStoredApiKey('openrouter');

  return (
    <div className="space-y-5 pt-2">
      {/* 0. Dedicated TTS Voice Provider */}
      <TtsVoiceProviderSection />

      {/* 1. Voice Synthesis Engine */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
          <span>Voice Synthesis Engine</span>
          <span className="text-[11px] text-teal-700 font-normal">
            Neural audio for Listening &amp; Speaking
          </span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <button
            type="button"
            onClick={() => handleEngineChange('auto')}
            className={`p-3 rounded-xl border text-left transition cursor-pointer ${
              engine === 'auto'
                ? 'bg-teal-50 border-teal-600 text-teal-900 font-bold shadow-2xs'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                Auto Neural TTS
              </span>
              <span className="text-[9px] bg-teal-100 text-teal-800 px-1.5 py-0.2 rounded-full font-bold">
                Default
              </span>
            </div>
            <p className="text-[11px] font-normal text-slate-500">
              High-definition Microsoft Edge neural voices with automatic Web Speech fallback.
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleEngineChange('cloud')}
            className={`p-3 rounded-xl border text-left transition cursor-pointer ${
              engine === 'cloud'
                ? 'bg-teal-50 border-teal-600 text-teal-900 font-bold shadow-2xs'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span>Cloud AI Voice</span>
              <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${hasGemini ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                {hasGemini ? 'Key Ready' : 'Needs Key'}
              </span>
            </div>
            <p className="text-[11px] font-normal text-slate-500">
              Uses your custom Gemini API key for Google multimodal voice generation.
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleEngineChange('device')}
            className={`p-3 rounded-xl border text-left transition cursor-pointer ${
              engine === 'device'
                ? 'bg-teal-50 border-teal-600 text-teal-900 font-bold shadow-2xs'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span>Browser Web Speech</span>
              <span className="text-[9px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded-full font-bold">
                {voices.length} voices
              </span>
            </div>
            <p className="text-[11px] font-normal text-slate-500">
              Local operating system voice synthesizer (Chrome, Edge, Safari). Zero network latency.
            </p>
          </button>
        </div>
      </div>

      {/* 2. Provider Key & STT Status Grid */}
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
        <h5 className="text-xs font-bold text-slate-800">Connected Providers &amp; Speech Roles</h5>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800">Google Gemini</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${hasGemini ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                {hasGemini ? 'Configured' : 'No Key'}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Generation &amp; Rubric Scoring</p>
          </div>

          <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800">Groq Whisper</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${hasGroq ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                {hasGroq ? 'STT Active' : 'Fallback to Browser'}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Word-level timestamps &amp; Speech metrics</p>
          </div>

          <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800">OpenRouter</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${hasOpenRouter ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                {hasOpenRouter ? 'Configured' : 'No Key'}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Backup LLM fallback routing</p>
          </div>
        </div>
      </div>

      {/* 3. Voice Controls & Test Playback */}
      <div className="space-y-3 p-4 bg-white border border-slate-200 rounded-xl">
        <h5 className="text-xs font-bold text-slate-800">Audio Preview &amp; Character Test</h5>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Speaker Role</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedVoice('female')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition cursor-pointer ${
                  selectedVoice === 'female'
                    ? 'bg-teal-50 border-teal-600 text-teal-800 font-bold'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Female (Student / Narrator)
              </button>
              <button
                type="button"
                onClick={() => setSelectedVoice('male')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition cursor-pointer ${
                  selectedVoice === 'male'
                    ? 'bg-teal-50 border-teal-600 text-teal-800 font-bold'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Male (Professor / Examiner)
              </button>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-slate-600">Speech Rate</label>
              <span className="text-xs font-bold text-teal-700">{speed}x</span>
            </div>
            <input
              type="range"
              min="0.8"
              max="1.2"
              step="0.05"
              value={speed}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setSpeed(val);
                localStorage.setItem('toefl_voice_speed', val.toString());
              }}
              className="w-full accent-teal-600 cursor-pointer"
            />
          </div>
        </div>

        <div className="pt-2 flex items-center justify-between flex-wrap gap-3">
          <button
            type="button"
            onClick={handleTestVoice}
            disabled={isTestingVoice}
            className="px-4 py-2 bg-teal-800 hover:bg-teal-900 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-xs"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{isTestingVoice ? 'Testing Voice...' : 'Test Speech Playback'}</span>
          </button>

          {testResult && (
            <div
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${
                testResult.success
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
