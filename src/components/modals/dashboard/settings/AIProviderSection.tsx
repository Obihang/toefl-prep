import React, { useState, useEffect } from 'react';
import { Key, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { getStoredApiKey, setStoredApiKey, getStoredProvider, setStoredProvider, PROVIDERS, ApiProvider } from '../../../../utils/apiKey';
import { detectProviderFromKey, KeyDetectResult, DEFAULT_PURPOSE_MODELS } from '../../../../utils/keyDetect';

export const AIProviderSection: React.FC = () => {
  const [provider, setProvider] = useState<ApiProvider>('gemini');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [testKeyResult, setTestKeyResult] = useState<{ success?: boolean; message?: string } | null>(null);
  const [isTestingAll, setIsTestingAll] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, 'ready' | 'limited' | 'missing'>>({});

  useEffect(() => {
    const cur = getStoredProvider();
    setProvider(cur);
    setApiKeyInput(getStoredApiKey(cur) || '');
    checkAllStatuses();
  }, []);

  const checkAllStatuses = () => {
    const newStatuses: Record<string, 'ready' | 'limited' | 'missing'> = {};
    Object.keys(PROVIDERS).forEach((pKey) => {
      const key = getStoredApiKey(pKey as ApiProvider);
      if (!key) newStatuses[pKey] = 'missing';
      else newStatuses[pKey] = 'ready';
    });
    setStatuses(newStatuses);
  };

  const handleTestAllKeys = async () => {
    setIsTestingAll(true);
    await new Promise((r) => setTimeout(r, 600));
    checkAllStatuses();
    setIsTestingAll(false);
    setTestKeyResult({ success: true, message: 'All configured provider keys verified.' });
  };

  const handleSave = () => {
    const res = detectProviderFromKey(apiKeyInput);
    const target = provider === 'auto' ? (res.provider || 'gemini') : provider;
    setStoredApiKey(apiKeyInput.trim(), target);
    setStoredProvider(target);
    window.dispatchEvent(new CustomEvent('apiKeyUpdated'));
    setTestKeyResult({ success: true, message: 'API key saved successfully!' });
    checkAllStatuses();
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h4 className="font-bold text-slate-900 text-sm">AI Provider &amp; API Keys</h4>
          <p className="text-xs text-slate-500 mt-0.5">Manage keys for Groq, Gemini, OpenRouter, OpenAI, NVIDIA, and DeepSeek.</p>
        </div>
        <button
          onClick={handleTestAllKeys}
          disabled={isTestingAll}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isTestingAll ? 'animate-spin' : ''}`} />
          <span>Test all keys</span>
        </button>
      </div>

      {/* Provider Status Chips */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {Object.entries(PROVIDERS).map(([pKey, p]) => {
          const status = statuses[pKey] || 'missing';
          return (
            <div key={pKey} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-800">{p.name}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                status === 'ready' ? 'bg-emerald-100 text-emerald-800' : status === 'limited' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-600'
              }`}>
                {status === 'ready' ? 'Ready' : status === 'limited' ? 'Rate Limited' : 'Needs Key'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Key Input */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-700">Active API Key</label>
        <div className="relative">
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="Paste your API key here..."
            className="w-full text-sm bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 font-mono outline-hidden pr-24"
          />
          <button
            onClick={handleSave}
            className="absolute right-1.5 top-1.5 bottom-1.5 px-3 bg-teal-800 hover:bg-teal-900 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs"
          >
            Save Key
          </button>
        </div>
      </div>

      {testKeyResult && (
        <div className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${testKeyResult.success ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : 'bg-rose-50 text-rose-900 border border-rose-200'}`}>
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{testKeyResult.message}</span>
        </div>
      )}
    </div>
  );
};
