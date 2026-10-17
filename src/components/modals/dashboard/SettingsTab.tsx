import React, { useState, useEffect, useRef } from 'react';
import { User, Mic, Key, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { getStoredApiKey, setStoredApiKey, getStoredProvider, setStoredProvider, getStoredBaseUrl, setStoredBaseUrl, getStoredModel, setStoredModel, PROVIDERS, ApiProvider } from '../../../utils/apiKey';
import { detectProviderFromKey, KeyDetectResult, DEFAULT_PURPOSE_MODELS } from '../../../utils/keyDetect';
import { Accordion, AccordionSection } from './Accordion';
import { MicSection } from './MicSection';

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
  const [apiKeySaved, setApiKeySaved] = useState(false);
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
    setApiKeySaved(false);
    setTestKeyResult(null);
    autoTestedKeyRef.current = getStoredApiKey(currentProvider) || '';
  }, [displayName]);

  useEffect(() => {
    const res = detectProviderFromKey(apiKeyInput);
    setDetected(res);
    const activeKey = res.provider || provider || 'gemini';
    const models = DEFAULT_PURPOSE_MODELS[activeKey] || DEFAULT_PURPOSE_MODELS.gemini;
    setActivePurposeModels(models);

    if (provider === 'auto' && res.complete && res.provider && apiKeyInput.trim() !== autoTestedKeyRef.current) {
      if (res.provider !== provider) {
        setProvider(res.provider);
        setStoredProvider(res.provider);
        const defBase = PROVIDERS[res.provider]?.defaultBaseUrl || '';
        const defModel = PROVIDERS[res.provider]?.defaultModel || '';
        setBaseUrlInput(defBase);
        setStoredBaseUrl(defBase);
        if (!modelInput.trim() || modelInput === (PROVIDERS[provider]?.defaultModel || '')) {
          setModelInput(defModel);
          setStoredModel(defModel);
        }
      }
      const timer = setTimeout(() => {
        autoTestedKeyRef.current = apiKeyInput.trim();
        handleTestKey(true);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [apiKeyInput, provider, modelInput]);

  const handleTestKey = async (auto = false) => {
    if (!apiKeyInput.trim()) return;
    setIsTestingKey(true);
    setTestKeyResult(null);
    try {
      const trimmed = apiKeyInput.trim();
      const targetProvider = provider === 'auto' ? (detected?.provider || 'gemini') : provider;
      setStoredApiKey(trimmed, targetProvider);
      setStoredBaseUrl(baseUrlInput.trim());
      setStoredModel(modelInput.trim());
      setApiKeySaved(true);

      window.dispatchEvent(new CustomEvent('apiKeyUpdated'));
      setTestKeyResult({ success: true, message: `Successfully connected & activated ${PROVIDERS[targetProvider]?.name || targetProvider}!` });
    } catch (err: any) {
      setTestKeyResult({ success: false, message: err.message || 'Connection test failed.' });
    } finally {
      setIsTestingKey(false);
    }
  };

  const sections: AccordionSection[] = [
    {
      id: 'ai_provider',
      title: 'AI provider and API keys',
      icon: <Key className="w-4 h-4 text-teal-700" />,
      content: (
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h4 className="font-bold text-slate-900 text-sm">Universal AI Key &amp; Purpose Auto-Routing</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Paste any API key (Groq, NVIDIA, OpenAI, DeepSeek, OpenRouter, or Gemini). The applet automatically detects your provider and selects the ideal model for questions, scoring, and voice.
              </p>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-teal-700 underline">Groq</a>
              <span className="text-slate-300">·</span>
              <a href="https://build.nvidia.com" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-teal-700 underline">NVIDIA</a>
              <span className="text-slate-300">·</span>
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-teal-700 underline">OpenAI</a>
              <span className="text-slate-300">·</span>
              <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-teal-700 underline">DeepSeek</a>
              <span className="text-slate-300">·</span>
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-teal-700 font-semibold hover:text-teal-900 underline">Gemini Free</a>
            </div>
          </div>

          <div className="relative">
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => {
                setApiKeyInput(e.target.value);
                setApiKeySaved(false);
                setTestKeyResult(null);
              }}
              placeholder="Paste your API key here..."
              className="w-full text-sm bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 outline-hidden font-mono pr-24 shadow-2xs"
            />
            <button
              onClick={() => handleTestKey(false)}
              disabled={isTestingKey || !apiKeyInput.trim()}
              className="absolute right-1.5 top-1.5 bottom-1.5 px-3 bg-teal-800 hover:bg-teal-900 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <span>{isTestingKey ? 'Detecting...' : 'Test & Save'}</span>
            </button>
          </div>

          {testKeyResult && (
            <div className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${testKeyResult.success ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : 'bg-rose-50 text-rose-900 border border-rose-200'}`}>
              {testKeyResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
              <span>{testKeyResult.message}</span>
            </div>
          )}
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
            onBlur={() => { if (nameInput.trim()) setDisplayName(nameInput.trim()); }}
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-slate-50 focus:border-teal-600 outline-hidden"
          />
        </div>
      ),
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
  ];

  return (
    <div className="space-y-4">
      <Accordion sections={sections} storageKey="dashboard_settings_accordion_open" />
    </div>
  );
};
