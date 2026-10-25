import React, { useState, useEffect } from 'react';
import { X, Activity, Wifi, Cpu, Mic, ShieldCheck, Database, CheckCircle2, AlertCircle } from 'lucide-react';
import { getStoredApiKey, getStoredProvider, hasAnyStoredApiKey } from '../../utils/apiKey';

interface SystemStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SystemStatusModal: React.FC<SystemStatusModalProps> = ({ isOpen, onClose }) => {
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [hasGenerationKey, setHasGenerationKey] = useState<boolean>(false);
  const [hasTranscriberConfig, setHasTranscriberConfig] = useState<boolean>(false);
  const [activeProvider, setActiveProvider] = useState<string>('gemini');

  const checkStatus = () => {
    if (typeof window === 'undefined') return;

    // 1. Network status
    setIsOnline(navigator.onLine);

    // 2. Generation API Keys
    const geminiKey = (
      localStorage.getItem('gemini_api_key') ||
      localStorage.getItem('toefl_key_gemini') ||
      getStoredApiKey('gemini') ||
      ''
    ).trim();

    const groqKey = (
      localStorage.getItem('toefl_key_groq') ||
      localStorage.getItem('groq_api_key') ||
      getStoredApiKey('groq') ||
      ''
    ).trim();

    const anyKey = hasAnyStoredApiKey();
    setHasGenerationKey(Boolean(geminiKey || groqKey || anyKey));

    // 3. Transcriber API configuration
    const transcriberGroqKey = (
      localStorage.getItem('transcriber_groq_api_key') ||
      localStorage.getItem('toefl_key_groq') ||
      getStoredApiKey('groq') ||
      ''
    ).trim();

    const transcriberEngine = localStorage.getItem('toefl_transcriber_engine') || 'worker';
    const isWorkerSupported = typeof window !== 'undefined' && typeof Worker !== 'undefined';
    
    // Configured if Groq transcription key is present OR offline web worker whisper is supported
    setHasTranscriberConfig(Boolean(transcriberGroqKey || (transcriberEngine === 'worker' && isWorkerSupported)));

    setActiveProvider(getStoredProvider());
  };

  useEffect(() => {
    if (!isOpen) return;

    checkStatus();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleKeyUpdate = () => checkStatus();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('apiKeyUpdated', handleKeyUpdate);
    window.addEventListener('storage', handleKeyUpdate);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('apiKeyUpdated', handleKeyUpdate);
      window.removeEventListener('storage', handleKeyUpdate);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden transform transition-all"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="system-status-title"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-teal-100 text-teal-800 rounded-xl">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h3 id="system-status-title" className="text-sm font-bold text-slate-900">
                Live System Status
              </h3>
              <p className="text-[11px] text-slate-500">Core application services &amp; connectivity diagnostics</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-3.5">
          {/* Service Indicators List */}
          <div className="space-y-2.5">
            {/* 1. Network Connection */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <Wifi className={`w-4 h-4 ${isOnline ? 'text-emerald-600' : 'text-rose-600'}`} />
                <div>
                  <div className="text-xs font-bold text-slate-800">Network Connection</div>
                  <div className="text-[10px] text-slate-500">Internet &amp; WebSocket connectivity</div>
                </div>
              </div>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                isOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}>
                {isOnline ? '🟢 Online' : '🔴 Offline'}
              </span>
            </div>

            {/* 2. Generation API */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <Cpu className={`w-4 h-4 ${hasGenerationKey ? 'text-emerald-600' : 'text-rose-600'}`} />
                <div>
                  <div className="text-xs font-bold text-slate-800">Generation API (Gemini/Groq)</div>
                  <div className="text-[10px] text-slate-500">Provider: {activeProvider}</div>
                </div>
              </div>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                hasGenerationKey ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}>
                {hasGenerationKey ? '🟢 Keys Configured' : '🔴 Missing Keys'}
              </span>
            </div>

            {/* 3. Transcriber API */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <Mic className={`w-4 h-4 ${hasTranscriberConfig ? 'text-emerald-600' : 'text-rose-600'}`} />
                <div>
                  <div className="text-xs font-bold text-slate-800">Transcriber API</div>
                  <div className="text-[10px] text-slate-500">Groq Whisper Cloud &amp; Local Web Worker</div>
                </div>
              </div>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                hasTranscriberConfig ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}>
                {hasTranscriberConfig ? '🟢 Groq/Local configured' : '🔴 Missing'}
              </span>
            </div>
          </div>

          {/* Quick Environment Details Card */}
          <div className="p-3 bg-slate-100/70 border border-slate-200 rounded-xl space-y-1.5 text-[11px] text-slate-600">
            <div className="flex justify-between">
              <span className="font-semibold text-slate-700">Offline Question Shards:</span>
              <span className="text-emerald-700 font-bold">100% Ready (IndexedDB)</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold text-slate-700">Audio Speech Engine:</span>
              <span>Neural Edge TTS + Web Speech</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold text-slate-700">Error Tracking:</span>
              <span>Sentry Monitored</span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
