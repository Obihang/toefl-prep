import React, { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { getVoices } from '../../utils/audioSpeech';
import { getStoredApiKey } from '../../utils/apiKey';

export const NoVoiceBanner: React.FC<{ onOpenSettings?: () => void }> = ({ onOpenSettings }) => {
  const [hasVoice, setHasVoice] = useState(true);

  useEffect(() => {
    const check = () => {
      const voices = getVoices();
      const hasEnglish = voices.some((v) => v.lang.toLowerCase().startsWith('en'));
      const hasKey = !!(getStoredApiKey('gemini') || getStoredApiKey('groq') || getStoredApiKey('openrouter'));

      // If user has no API key and no English browser voice
      if (!hasEnglish && !hasKey) {
        setHasVoice(false);
      } else {
        setHasVoice(true);
      }
    };

    check();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = check;
    }
  }, []);

  if (hasVoice) return null;

  return (
    <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3 text-amber-900 text-xs sm:text-sm">
      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
      <div className="flex-1 space-y-1">
        <p className="font-semibold text-amber-800">
          No English speech voices detected.
        </p>
        <p className="text-amber-700">
          Connect your Gemini, Groq, or OpenRouter key in Settings for AI neural voices, or use Chrome/Edge for built-in voices.
        </p>
      </div>
      {onOpenSettings && (
        <button
          onClick={onOpenSettings}
          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-medium transition shrink-0 cursor-pointer"
        >
          Open Settings
        </button>
      )}
    </div>
  );
};
