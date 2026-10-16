import React, { useState, useEffect } from 'react';
import { VolumeX, AlertTriangle, Download, Key } from 'lucide-react';
import { getVoices } from '../../utils/audioSpeech';
import { getStoredVoiceKey, getStoredApiKey } from '../../utils/apiKey';
import { isOfflineVoiceDownloaded } from '../../utils/offlineVoice';

export const NoVoiceBanner: React.FC<{ onOpenSettings?: () => void }> = ({ onOpenSettings }) => {
  const [hasVoice, setHasVoice] = useState(true);

  useEffect(() => {
    const check = () => {
      const voices = getVoices();
      const hasEnglish = voices.some((v) => v.lang.toLowerCase().startsWith('en'));
      const hasVoiceKey = !!getStoredVoiceKey();
      const hasMainKey = !!getStoredApiKey();
      const hasOffline = isOfflineVoiceDownloaded();

      if (!hasEnglish && !hasVoiceKey && !hasMainKey && !hasOffline) {
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
    <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3 text-amber-200 text-xs sm:text-sm">
      <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
      <div className="flex-1 space-y-1">
        <p className="font-semibold text-amber-300">
          No speech voices found in this browser.
        </p>
        <p className="text-amber-200/80">
          Use the offline voice, add a Gemini voice key in Settings, or on Linux run:{' '}
          <code className="bg-black/30 px-1.5 py-0.5 rounded font-mono text-amber-300">
            sudo apt install speech-dispatcher espeak-ng
          </code>
        </p>
      </div>
      {onOpenSettings && (
        <button
          onClick={onOpenSettings}
          className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-medium transition shrink-0"
        >
          Open Settings
        </button>
      )}
    </div>
  );
};
