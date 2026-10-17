import React, { useState, useEffect, useRef } from 'react';
import { User, Mic, Key, CheckCircle2, AlertCircle, Volume2, Cpu, Trash2, ArrowRight, Sparkles } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import {
  getStoredApiKey,
  setStoredApiKey,
  getStoredProvider,
  setStoredProvider,
  getStoredBaseUrl,
  setStoredBaseUrl,
  getStoredModel,
  setStoredModel,
  PROVIDERS,
  ApiProvider,
} from '../../../utils/apiKey';
import { detectProviderFromKey, KeyDetectResult, DEFAULT_PURPOSE_MODELS } from '../../../utils/keyDetect';
import { Accordion, AccordionSection } from './Accordion';
import { MicSection } from './MicSection';
import { VoiceCheckingSection } from './settings/VoiceCheckingSection';
import { AIModelsSection } from './settings/AIModelsSection';

interface SettingsTabProps {
  onConfigureGoals?: () => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({ onConfigureGoals }) => {
  const { displayName, setDisplayName } = useAuth();
  const [nameInput, setNameInput] = useState('');
  const [provider, setProvider] = useState<ApiProvider>('gemini');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [baseUrlInput, setBaseUrlInput] = useState('');
  const [modelInput, setModelInput] = useState('');
  const [detected, setDetected] = useState<KeyDetectResult | null>(null);
  const [activePurposeModels, setActivePurposeModels] = useState<any>(null);
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [testKeyResult, setTestKeyResult] = useState<{ success?: boolean; message?: string; model?: string } | null>(null);
  const autoTestedKeyRef = useRef<string>('');

  useEffect(() => {
    setNameInput(displayName || localStorage.getItem('toefl_display_name') || '');
    const currentProvider = getStoredProvider();
    setProvider(currentProvider);
    setApiKeyInput(getStoredApiKey(currentProvider) || '');
    setBaseUrlInput(getStoredBaseUrl());
    setModelInput(getStoredModel());
    setTestKeyResult(null);
    autoTestedKeyRef.current = getStoredApiKey(currentProvider) || '';
  }, [displayName]);

  useEffect(() => {
    const res = detectProviderFromKey(apiKeyInput);
    setDetected(res);
    const activeKey = res.provider || provider || 'gemini';
    const models = DEFAULT_PURPOSE_MODELS[activeKey] || DEFAULT_PURPOSE_MODELS.gemini;
    setActivePurposeModels(models);

    // Auto-detect and switch if provider is auto
    if (provider === 'auto' && res.complete && res.provider && apiKeyInput.trim() !== autoTestedKeyRef.current) {
      if (res.provider !== provider) {
        setProvider(res.provider);
        setStoredProvider(res.provider);
        const defBase = PROVIDERS[res.provider]?.defaultBaseUrl || '';
        const defModel = PROVIDERS[res.provider]?.defaultModel || '';
        setBaseUrlInput(defBase);
        setStoredBaseUrl(defBase);
        setModelInput(defModel);
        setStoredModel(defModel);
      }
      const timer = setTimeout(() => {
        autoTestedKeyRef.current = apiKeyInput.trim();
        handleTestKey(res.provider as ApiProvider);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [apiKeyInput, provider, modelInput]);

  const handleSwitchProvider = (newProvider: ApiProvider) => {
    setProvider(newProvider);
    setStoredProvider(newProvider);
    const defBase = PROVIDERS[newProvider]?.defaultBaseUrl || '';
    const defModel = PROVIDERS[newProvider]?.defaultModel || '';
    setBaseUrlInput(defBase);
    setStoredBaseUrl(defBase);
    setModelInput(defModel);
    setStoredModel(defModel);

    // If key is present, save for new provider
    if (apiKeyInput.trim()) {
      setStoredApiKey(apiKeyInput.trim(), newProvider);
      window.dispatchEvent(new CustomEvent('apiKeyUpdated'));
      setTestKeyResult({
        success: true,
        message: `Switched active provider to ${PROVIDERS[newProvider]?.name || newProvider}.`,
      });
    }
  };

  const handleDisconnectKey = () => {
    setStoredApiKey('', provider);
    setApiKeyInput('');
    setTestKeyResult(null);
    window.dispatchEvent(new CustomEvent('apiKeyUpdated'));
    setTestKeyResult({
      success: true,
      message: `API disconnected. Key for ${PROVIDERS[provider]?.name || provider} removed.`,
    });
    setTimeout(() => setTestKeyResult(null), 4000);
  };

  const handleTestKey = async (overrideProvider?: ApiProvider) => {
    if (!apiKeyInput.trim()) return;
    setIsTestingKey(true);
    setTestKeyResult(null);

    const trimmed = apiKeyInput.trim();
    // Prioritize detected provider if valid
    const targetProvider: ApiProvider =
      overrideProvider ||
      (detected?.provider ? (detected.provider as ApiProvider) : provider === 'auto' ? 'gemini' : provider);

    try {
      setProvider(targetProvider);
      setStoredProvider(targetProvider);
      setStoredApiKey(trimmed, targetProvider);

      const defBase = baseUrlInput.trim() || PROVIDERS[targetProvider]?.defaultBaseUrl || '';
      const defModel = modelInput.trim() || PROVIDERS[targetProvider]?.defaultModel || '';
      setStoredBaseUrl(defBase);
      setStoredModel(defModel);

      // Verify connection against server endpoint
      const res = await fetch('/api/test-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': trimmed,
          'x-api-provider': targetProvider,
        },
        body: JSON.stringify({
          provider: targetProvider,
          apiKey: trimmed,
          model: defModel,
        }),
      });

      const json = await res.json();
      window.dispatchEvent(new CustomEvent('apiKeyUpdated'));

      if (res.ok && json.success) {
        setTestKeyResult({
          success: true,
          message: `Successfully connected to ${PROVIDERS[targetProvider]?.name || targetProvider}! Purpose models automatically configured.`,
        });
      } else {
        const errorMsg = json.error || `Could not verify ${PROVIDERS[targetProvider]?.name || targetProvider} key.`;
        setTestKeyResult({ success: false, message: errorMsg });
      }
    } catch (err: any) {
      setTestKeyResult({ success: false, message: err?.message || 'Connection test failed.' });
    } finally {
      setIsTestingKey(false);
    }
  };

  const hasCurrentSavedKey = Boolean(getStoredApiKey(provider));

  const sections: AccordionSection[] = [
    {
      id: 'ai_provider',
      title: 'AI provider and API keys',
      icon: <Key className="w-4 h-4 text-teal-700" />,
      content: (
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-slate-900 text-sm">Universal AI Key &amp; Purpose Auto-Routing</h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800">
                  Active: {PROVIDERS[provider]?.name || provider}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Paste any key (OpenRouter, Groq, Gemini, NVIDIA, or OpenAI). The system detects the provider and activates task models.
              </p>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-teal-700 font-semibold hover:text-teal-900 underline">OpenRouter</a>
              <span className="text-slate-300">·</span>
              <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-teal-700 underline">Groq</a>
              <span className="text-slate-300">·</span>
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-teal-700 font-semibold hover:text-teal-900 underline">Gemini Free</a>
              <span className="text-slate-300">·</span>
              <a href="https://build.nvidia.com" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-teal-700 underline">NVIDIA</a>
            </div>
          </div>

          {/* Key Input */}
          <div className="space-y-2">
            <div className="relative">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => {
                  setApiKeyInput(e.target.value);
                  setTestKeyResult(null);
                }}
                placeholder="Paste your API key here (sk-or-..., gsk_..., AIza..., nvapi-...)"
                className="w-full text-sm bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 outline-hidden font-mono pr-28 shadow-2xs"
              />
              <button
                onClick={() => handleTestKey()}
                disabled={isTestingKey || !apiKeyInput.trim()}
                className="absolute right-1.5 top-1.5 bottom-1.5 px-3 bg-teal-800 hover:bg-teal-900 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <span>{isTestingKey ? 'Connecting...' : 'Connect Key'}</span>
              </button>
            </div>

            {/* Provider Switch Notice Banner */}
            {detected?.provider && detected.provider !== provider && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between flex-wrap gap-2 text-xs animate-in fade-in">
                <div className="flex items-center gap-2 text-amber-900 font-medium">
                  <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Detected <strong>{detected.label}</strong> key format (current provider is <strong>{PROVIDERS[provider]?.name || provider}</strong>).
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleSwitchProvider(detected.provider as ApiProvider)}
                  className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                >
                  <span>Switch to {detected.label}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Key Action & Disconnect Buttons */}
            <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                {detected?.label && detected.label !== 'Unknown' && (
                  <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-mono text-[11px]">
                    Format: {detected.label}
                  </span>
                )}
              </div>

              {hasCurrentSavedKey && (
                <button
                  type="button"
                  onClick={handleDisconnectKey}
                  className="px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Disconnect API</span>
                </button>
              )}
            </div>
          </div>

          {testKeyResult && (
            <div
              className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                testKeyResult.success
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                  : 'bg-rose-50 text-rose-900 border border-rose-200'
              }`}
            >
              {testKeyResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{testKeyResult.message}</span>
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'voice_checking',
      title: 'Voice Checking',
      icon: <Volume2 className="w-4 h-4 text-teal-700" />,
      content: <VoiceCheckingSection />,
    },
    {
      id: 'ai_models',
      title: 'AI Models',
      icon: <Cpu className="w-4 h-4 text-teal-700" />,
      content: <AIModelsSection />,
    },
    {
      id: 'microphone',
      title: 'Microphone',
      icon: <Mic className="w-4 h-4 text-teal-700" />,
      content: (
        <div className="pt-2">
          <MicSection />
        </div>
      ),
    },
    {
      id: 'profile',
      title: 'Profile',
      icon: <User className="w-4 h-4 text-teal-700" />,
      content: (
        <div className="space-y-2 pt-2">
          <label className="text-xs font-semibold text-slate-600">Display Name</label>
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={() => {
              if (nameInput.trim()) setDisplayName(nameInput.trim());
            }}
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-slate-50 focus:border-teal-600 outline-hidden"
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Accordion sections={sections} storageKey="dashboard_settings_accordion_open" />
    </div>
  );
};
