import React, { useState, useEffect } from 'react';
import { Volume2, X, Settings } from 'lucide-react';
import { VoiceFallbackEventDetail } from '../../utils/voiceDiagnostics';

interface VoiceDiagnosticToastProps {
  onOpenSettings?: () => void;
}

export const VoiceDiagnosticToast: React.FC<VoiceDiagnosticToastProps> = ({ onOpenSettings }) => {
  const [activeToast, setActiveToast] = useState<VoiceFallbackEventDetail | null>(null);

  useEffect(() => {
    const handleFallbackEvent = (e: Event) => {
      const custom = e as CustomEvent<VoiceFallbackEventDetail>;
      if (custom.detail) {
        setActiveToast(custom.detail);
      }
    };

    window.addEventListener('toefl_voice_fallback_toast', handleFallbackEvent);
    return () => window.removeEventListener('toefl_voice_fallback_toast', handleFallbackEvent);
  }, []);

  useEffect(() => {
    if (!activeToast) return;
    const timer = setTimeout(() => {
      setActiveToast(null);
    }, 8500);
    return () => clearTimeout(timer);
  }, [activeToast]);

  if (!activeToast) return null;

  return (
    <aside
      role="alert"
      aria-live="assertive"
      className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 z-[100] max-w-md w-[calc(100vw-3rem)] sm:w-full animate-in slide-in-from-bottom-5 fade-in duration-300 pointer-events-auto"
    >
      <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-2xl border border-amber-500/40 ring-4 ring-amber-500/10 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl shrink-0">
              <Volume2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-bold text-white">Voice Engine Diagnostic</h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Fallback Activated
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">Automatic recovery after 3 failed attempts</p>
            </div>
          </div>
          <button
            onClick={() => setActiveToast(null)}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-200 leading-relaxed bg-slate-800/70 p-3 rounded-xl border border-slate-700/60">
          <strong className="text-amber-300 font-semibold">{activeToast.failedEngine}</strong> failed to initialize or play audio after 3 attempts ({activeToast.reason || 'Audio synthesis unavailable'}). Setting automatically toggled to <strong className="text-teal-300 font-semibold">{activeToast.fallbackEngine}</strong> for uninterrupted practice.
        </p>

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span className="text-[11px] text-slate-400">Browser speech is now active</span>
          <div className="flex items-center gap-2">
            {onOpenSettings && (
              <button
                type="button"
                onClick={() => {
                  setActiveToast(null);
                  onOpenSettings();
                }}
                className="px-2.5 py-1.5 text-xs font-semibold text-teal-300 hover:text-teal-200 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Voice Settings</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveToast(null)}
              className="px-3 py-1.5 text-xs font-bold text-slate-900 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors cursor-pointer shadow-xs"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
