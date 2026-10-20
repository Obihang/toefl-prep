// Diagnostic utility for Web Speech API and Neural Voice detection troubleshooting
import { getStoredApiKey } from './apiKey';
import { getAuthHeaders } from './apiKey';

export interface VoiceDiagnosticResult {
  hasSpeechSynthesis: boolean;
  voicesCount: number;
  languages: string[];
  voicesList: Array<{ name: string; lang: string; localService: boolean }>;
  isAsynchronousLoading: boolean;
  diagnosticMessage: string;
}

export interface FullVoiceDiagnosticResult {
  cloudApiKeyPresent: boolean;
  cloudEndpointReachable: boolean;
  cloudTtsAuthenticatedAndWorking: boolean;
  deviceSpeechAvailable: boolean;
  englishVoicesCount: number;
  diagnosticSummary: string;
}

export async function runVoiceDiagnostic(): Promise<VoiceDiagnosticResult> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return {
      hasSpeechSynthesis: false,
      voicesCount: 0,
      languages: [],
      voicesList: [],
      isAsynchronousLoading: false,
      diagnosticMessage: 'Web Speech API (speechSynthesis) is not supported in this browser environment.',
    };
  }

  let voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) {
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 1500);
      window.speechSynthesis.onvoiceschanged = () => {
        clearTimeout(timer);
        resolve(null);
      };
    });
    voices = window.speechSynthesis.getVoices();
  }

  const voicesList = voices.map((v) => ({
    name: v.name,
    lang: v.lang,
    localService: v.localService,
  }));

  const languages = Array.from(new Set(voices.map((v) => v.lang))).sort();
  const hasEnglish = languages.some((l) => l.toLowerCase().startsWith('en'));

  let diagnosticMessage = '';
  if (voices.length === 0) {
    diagnosticMessage = 'No voices detected in browser speechSynthesis. Chrome or Edge provides rich built-in voices.';
  } else if (!hasEnglish) {
    diagnosticMessage = `Found ${voices.length} voice(s), but none are English (en-*). English pronunciation may sound inaccurate.`;
  } else {
    diagnosticMessage = `Verified ${voices.length} browser voice(s), including ${voicesList.filter((v) => v.lang.toLowerCase().startsWith('en')).length} English voice(s).`;
  }

  return {
    hasSpeechSynthesis: true,
    voicesCount: voices.length,
    languages,
    voicesList,
    isAsynchronousLoading: false,
    diagnosticMessage,
  };
}

export async function runFullVoiceDiagnostic(): Promise<FullVoiceDiagnosticResult> {
  const cloudApiKeyPresent = !!(getStoredApiKey('gemini') || getStoredApiKey('groq') || getStoredApiKey('openrouter'));
  let cloudEndpointReachable = false;
  let cloudTtsAuthenticatedAndWorking = false;

  try {
    const authHdrs = await getAuthHeaders();
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHdrs },
      body: JSON.stringify({ text: 'Hello', voiceName: 'en-US-JennyNeural' }),
    });
    cloudEndpointReachable = true;
    if (res.ok) {
      cloudTtsAuthenticatedAndWorking = true;
    }
  } catch {
    cloudEndpointReachable = false;
  }

  let deviceSpeechAvailable = false;
  let englishVoicesCount = 0;
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      deviceSpeechAvailable = true;
    }
    englishVoicesCount = voices.filter((v) => v.lang.toLowerCase().startsWith('en')).length;
  }

  const summary = `AI Voice Reachable: ${cloudEndpointReachable ? 'Yes' : 'No'} | Working: ${cloudTtsAuthenticatedAndWorking ? 'Yes' : 'No'} | Web Speech Voices (EN): ${englishVoicesCount}`;

  return {
    cloudApiKeyPresent,
    cloudEndpointReachable,
    cloudTtsAuthenticatedAndWorking,
    deviceSpeechAvailable,
    englishVoicesCount,
    diagnosticSummary: summary,
  };
}

export interface VoiceFallbackEventDetail {
  failedEngine: 'AI Voice' | 'Web Speech';
  fallbackEngine: 'Web Speech';
  attempts: number;
  reason: string;
  timestamp: number;
}

let aiVoiceConsecutiveFailures = 0;

export function normalizeEngineName(engine: string): 'AI Voice' | 'Web Speech' {
  const lower = (engine || '').toLowerCase().trim();
  if (lower === 'device' || lower === 'webspeech') return 'Web Speech';
  return 'AI Voice';
}

export function getVoiceEngineFailureCount(engine: string): number {
  const norm = normalizeEngineName(engine);
  if (norm === 'AI Voice') return aiVoiceConsecutiveFailures;
  return 0;
}

export function resetVoiceEngineFailureCounts(): void {
  aiVoiceConsecutiveFailures = 0;
}

export function recordVoiceEngineSuccess(_engine?: string): void {
  aiVoiceConsecutiveFailures = 0;
}

export function recordVoiceEngineFailure(
  engine: string,
  reason?: string
): { triggeredFallback: boolean; attempts: number } {
  const norm = normalizeEngineName(engine);
  if (norm === 'Web Speech') {
    return { triggeredFallback: false, attempts: 0 };
  }

  aiVoiceConsecutiveFailures += 1;
  const attempts = aiVoiceConsecutiveFailures;
  const cleanReason = reason || 'Audio initialization or playback failed';

  if (attempts >= 3) {
    aiVoiceConsecutiveFailures = 0;
    triggerVoiceEngineFallback(norm, cleanReason);
    return { triggeredFallback: true, attempts };
  }

  return { triggeredFallback: false, attempts };
}

export function triggerVoiceEngineFallback(failedEngine: 'AI Voice' | 'Web Speech', reason?: string): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('toefl_voice_engine', 'device');
  }

  const detail: VoiceFallbackEventDetail = {
    failedEngine,
    fallbackEngine: 'Web Speech',
    attempts: 3,
    reason: reason || 'Audio synthesis or initialization failed',
    timestamp: Date.now(),
  };

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('toefl_voice_fallback_toast', { detail }));
    window.dispatchEvent(new CustomEvent('toefl_voice_engine_changed', { detail: { engine: 'device' } }));
  }
}
