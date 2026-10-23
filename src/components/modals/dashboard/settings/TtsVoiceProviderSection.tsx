import React, { useState, useEffect } from 'react';
import { Volume2, CheckCircle2, AlertCircle, Play, Sparkles, Server, Key, Globe } from 'lucide-react';
import {
  getStoredTtsProvider,
  setStoredTtsProvider,
  getStoredTtsApiKey,
  setStoredTtsApiKey,
  getStoredTtsBaseUrl,
  setStoredTtsBaseUrl,
  playSpeech,
  stopSpeaking,
} from '../../../../utils/audioSpeech';

export type TtsProviderOption = 'free' | 'openai' | 'gemini';

export const TtsVoiceProviderSection: React.FC = () => {
  const [provider, setProvider] = useState<TtsProviderOption>(() => {
    const p = getStoredTtsProvider();
    if (p === 'openai' || p === 'gemini') return p;
    return 'free';
  });

  const [apiKey, setApiKey] = useState<string>(() => getStoredTtsApiKey(provider));
  const [baseUrl, setBaseUrl] = useState<string>(() => getStoredTtsBaseUrl(provider));
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [ttsTestError, setTtsTestError] = useState<string | null>(null);
  const [isMale, setIsMale] = useState(false);

  useEffect(() => {
    const curP = getStoredTtsProvider() as TtsProviderOption;
    const actualP = (curP === 'openai' || curP === 'gemini') ? curP : 'free';
    setProvider(actualP);
    setApiKey(getStoredTtsApiKey(actualP));
    setBaseUrl(getStoredTtsBaseUrl(actualP));
  }, []);

  const handleProviderSelect = (newP: TtsProviderOption) => {
    setProvider(newP);
    setStoredTtsProvider(newP);
    setApiKey(getStoredTtsApiKey(newP));
    setBaseUrl(getStoredTtsBaseUrl(newP));
    showNotice(`TTS provider set to ${newP === 'free' ? 'Free Neural Server' : newP === 'openai' ? 'OpenAI TTS' : 'Gemini TTS'}`);
    setTestResult(null);
    setTtsTestError(null);
  };

  const handleApiKeyChange = (val: string) => {
    setApiKey(val);
    setStoredTtsApiKey(provider, val);
    showNotice('TTS API Key saved');
    setTtsTestError(null);
  };

  const handleBaseUrlChange = (val: string) => {
    setBaseUrl(val);
    setStoredTtsBaseUrl(provider, val);
    showNotice('TTS Base URL saved');
  };

  const showNotice = (msg: string) => {
    setSaveNotice(msg);
    setTimeout(() => {
      setSaveNotice((prev) => (prev === msg ? null : prev));
    }, 2500);
  };

  const handleTestTts = async () => {
    stopSpeaking();
    setIsTesting(true);
    setTestResult(null);
    setTtsTestError(null);

    const testSpeaker = isMale ? 'Marcus (Male)' : 'Victoria (Female)';
    const testText = isMale
      ? 'Marcus (Male): This is a test of the API voice engine.'
      : 'Victoria (Female): This is a test of the API voice engine.';
    const voiceName = isMale
      ? (provider === 'gemini' ? 'Puck' : provider === 'openai' ? 'onyx' : 'en-US-GuyNeural')
      : (provider === 'gemini' ? 'Kore' : provider === 'openai' ? 'nova' : 'en-US-JennyNeural');
    const startTime = Date.now();

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-tts-provider': provider,
        'x-tts-test': 'true'
      };
      if (provider !== 'free' && apiKey) {
        headers['x-tts-api-key'] = apiKey;
      }
      if (baseUrl) {
        headers['x-tts-base-url'] = baseUrl;
      }

      const res = await fetch('/api/tts', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text: testText,
          isMale,
          voiceName,
          speaker: testSpeaker,
        }),
      });

      if (!res.ok) {
        let errMessage = `HTTP ${res.status}`;
        try {
          const errData = await res.json();
          errMessage = errData.error || errData.message || errMessage;
        } catch {
          const raw = await res.text();
          if (raw) errMessage = raw;
        }
        setTtsTestError(errMessage);
        throw new Error(errMessage);
      }

      const data = await res.json();
      const audioUrl = data.audioUrl || (data.audioBase64 ? `data:${data.mimeType || 'audio/mpeg'};base64,${data.audioBase64}` : null);
      if (!audioUrl) {
        const errMessage = data.error || 'No audio returned from TTS server';
        setTtsTestError(errMessage);
        throw new Error(errMessage);
      }

      const audio = new Audio(audioUrl);
      if (provider === 'free' && (!data.modelUsed || data.modelUsed.includes('Neural Stream'))) {
        audio.playbackRate = isMale ? 0.98 : 1.02;
      }
      await audio.play();

      const latency = Date.now() - startTime;
      setTestResult({
        success: true,
        message: `Playing (${latency}ms) via ${data.modelUsed || provider.toUpperCase()}`,
      });
    } catch (err: any) {
      const msg = err?.message || 'Error testing voice synthesis.';
      setTtsTestError(msg);
      setTestResult({
        success: false,
        message: msg,
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 shadow-2xs">
      {/* Header & Mode Switcher */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
            <Volume2 className="w-4 h-4 text-teal-700" />
            TTS Voice Provider
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Select speech synthesis engine. If an API key encounters quota or errors, it automatically falls back to Free Neural.
          </p>
        </div>

        {/* Segmented Provider Switcher */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
          <button
            type="button"
            onClick={() => handleProviderSelect('free')}
            className={`px-3 py-1 font-semibold rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
              provider === 'free'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Free Neural Server (Zero-API)</span>
          </button>

          <button
            type="button"
            onClick={() => handleProviderSelect('openai')}
            className={`px-3 py-1 font-semibold rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
              provider === 'openai'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>OpenAI TTS API</span>
          </button>

          <button
            type="button"
            onClick={() => handleProviderSelect('gemini')}
            className={`px-3 py-1 font-semibold rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
              provider === 'gemini'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Gemini TTS API</span>
          </button>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setIsMale(false);
              setTtsTestError(null);
              setTestResult(null);
            }}
            className={`py-1 px-3 rounded-lg text-xs font-semibold cursor-pointer transition ${!isMale ? 'bg-teal-700 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          >
            Female Voice
          </button>
          <button
            type="button"
            onClick={() => {
              setIsMale(true);
              setTtsTestError(null);
              setTestResult(null);
            }}
            className={`py-1 px-3 rounded-lg text-xs font-semibold cursor-pointer transition ${isMale ? 'bg-teal-700 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          >
            Male Voice
          </button>
        </div>
      </div>

      {/* Provider Details & Inputs */}
      {provider === 'free' && (
        <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-900 space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-teal-800">
            <CheckCircle2 className="w-4 h-4 text-teal-600" />
            Zero-API Neural Synthesis Active
          </div>
          <p className="text-[11px] text-teal-700 font-normal">
            Uses high-fidelity neural streaming audio with natural British and American multi-speaker accents. No API key or setup required.
          </p>
        </div>
      )}

      {provider === 'openai' && (
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-700 flex items-center justify-between">
              <span>OpenAI TTS API Key</span>
              <span className="text-[10px] text-slate-500 font-normal">Stored locally in your browser</span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              placeholder="sk-proj-... or sk-..."
              className="w-full text-xs font-mono border border-slate-300 rounded-lg px-3 py-2 bg-slate-50 focus:border-teal-600 outline-hidden"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-700 flex items-center gap-1">
              <Globe className="w-3.5 h-3.5 text-slate-500" />
              <span>Base URL (Optional for OpenAI-compatible TTS endpoints)</span>
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => handleBaseUrlChange(e.target.value)}
              placeholder="https://api.openai.com/v1 (leave empty for official OpenAI)"
              className="w-full text-xs font-mono border border-slate-300 rounded-lg px-3 py-2 bg-slate-50 focus:border-teal-600 outline-hidden"
            />
            <p className="text-[10px] text-slate-500">
              Supports any standard third-party provider compatible with `/v1/audio/speech`.
            </p>
          </div>
        </div>
      )}

      {provider === 'gemini' && (
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-700 flex items-center justify-between">
              <span>Gemini TTS API Key</span>
              <span className="text-[10px] text-slate-500 font-normal">Dedicated for Gemini Speech</span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              placeholder="AIzaSy... (Dedicated for Gemini TTS)"
              className="w-full text-xs font-mono border border-slate-300 rounded-lg px-3 py-2 bg-slate-50 focus:border-teal-600 outline-hidden"
            />
          </div>
        </div>
      )}

      {/* Save Notice & Test Button */}
      <div className="pt-2 flex items-center justify-between flex-wrap gap-2 border-t border-slate-100">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTestTts}
            disabled={isTesting}
            className="px-3.5 py-1.5 bg-teal-800 hover:bg-teal-900 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{isTesting ? 'Testing TTS...' : 'Test Voice Synthesis'}</span>
          </button>

          {saveNotice && (
            <span className="text-[11px] text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              ✓ {saveNotice}
            </span>
          )}
        </div>

        {testResult && testResult.success && (
          <div className="text-xs font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="text-[11px]">{testResult.message}</span>
          </div>
        )}
      </div>

      {/* Explicit Test Error Message */}
      {ttsTestError && (
        <div className="w-full p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold text-rose-900 block text-xs">TTS API Key / Voice Test Rejected</span>
            <span className="text-rose-700 font-mono text-[11px] break-all block mt-1 leading-relaxed">{ttsTestError}</span>
          </div>
        </div>
      )}
    </div>
  );
};
