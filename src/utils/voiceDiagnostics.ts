// Diagnostic utility for Web Speech API / speechSynthesis voice detection troubleshooting
import { getStoredApiKey, getStoredVoiceKey } from './apiKey';
import { isOfflineVoiceDownloaded } from './offlineVoice';

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
  webGpuAdapterAvailable: boolean;
  kokoroWasmInitialized: boolean;
  kokoroInferencePassed: boolean;
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
    diagnosticMessage = 'No system speech voices detected. Common cause: operating system or browser lacks local TTS packages or speech synthesis is disabled.';
  } else if (!hasEnglish) {
    diagnosticMessage = `Detected ${voices.length} voices, but NO English voices were found (Available languages: ${languages.join(', ') || 'none'}).`;
  } else {
    diagnosticMessage = `Successfully detected ${voices.length} voices across ${languages.length} language codes (English speech available).`;
  }

  return {
    hasSpeechSynthesis: true,
    voicesCount: voices.length,
    languages,
    voicesList,
    isAsynchronousLoading: voices.length === 0,
    diagnosticMessage,
  };
}

export async function runFullVoiceDiagnostics(): Promise<FullVoiceDiagnosticResult> {
  const cloudApiKeyPresent = !!(getStoredApiKey() || getStoredVoiceKey() || (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY));
  
  let cloudEndpointReachable = false;
  let cloudTtsAuthenticatedAndWorking = false;

  if (cloudApiKeyPresent) {
    try {
      const res = await fetch('/api/health', { method: 'GET' });
      cloudEndpointReachable = res.ok;
    } catch {
      cloudEndpointReachable = false;
    }
  }

  const deviceSpeechAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;
  let englishVoicesCount = 0;
  if (deviceSpeechAvailable) {
    let voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) {
      await new Promise((r) => setTimeout(r, 500));
      voices = window.speechSynthesis.getVoices();
    }
    englishVoicesCount = voices.filter((v) => v.lang.toLowerCase().startsWith('en')).length;
  }

  let webGpuAdapterAvailable = false;
  if (typeof navigator !== 'undefined' && 'gpu' in navigator && (navigator as any).gpu) {
    try {
      const adapter = await (navigator as any).gpu.requestAdapter();
      webGpuAdapterAvailable = !!adapter;
    } catch {
      webGpuAdapterAvailable = false;
    }
  }

  const kokoroWasmInitialized = isOfflineVoiceDownloaded();
  const kokoroInferencePassed = kokoroWasmInitialized;

  const summary = `Cloud Key: ${cloudApiKeyPresent ? 'Yes' : 'No'} | Reachable: ${cloudEndpointReachable ? 'Yes' : 'No'} | Device Voices (EN): ${englishVoicesCount} | WebGPU: ${webGpuAdapterAvailable ? 'Available' : 'Unavailable / Fallback WASM'} | Kokoro Ready: ${kokoroWasmInitialized ? 'Yes' : 'No'}`;

  return {
    cloudApiKeyPresent,
    cloudEndpointReachable,
    cloudTtsAuthenticatedAndWorking,
    deviceSpeechAvailable,
    englishVoicesCount,
    webGpuAdapterAvailable,
    kokoroWasmInitialized,
    kokoroInferencePassed,
    diagnosticSummary: summary,
  };
}

export interface VoiceFallbackEventDetail {
  failedEngine: 'Kokoro' | 'AI Voice';
  fallbackEngine: 'Web Speech';
  attempts: number;
  reason: string;
  timestamp: number;
}

// In-memory counters for consecutive failed attempts
let kokoroConsecutiveFailures = 0;
let aiVoiceConsecutiveFailures = 0;

export function normalizeEngineName(engine: string): 'Kokoro' | 'AI Voice' | 'Web Speech' {
  const lower = (engine || '').toLowerCase().trim();
  if (lower === 'kokoro' || lower === 'offline') return 'Kokoro';
  if (lower === 'aivoice' || lower === 'ai voice' || lower === 'cloud' || lower === 'gemini') return 'AI Voice';
  return 'Web Speech';
}

export function getVoiceEngineFailureCount(engine: string): number {
  const norm = normalizeEngineName(engine);
  if (norm === 'Kokoro') return kokoroConsecutiveFailures;
  if (norm === 'AI Voice') return aiVoiceConsecutiveFailures;
  return 0;
}

export function resetVoiceEngineFailureCounts(engine?: string): void {
  if (!engine) {
    kokoroConsecutiveFailures = 0;
    aiVoiceConsecutiveFailures = 0;
    return;
  }
  const norm = normalizeEngineName(engine);
  if (norm === 'Kokoro') kokoroConsecutiveFailures = 0;
  else if (norm === 'AI Voice') aiVoiceConsecutiveFailures = 0;
}

export function recordVoiceEngineSuccess(engine: string): void {
  const norm = normalizeEngineName(engine);
  if (norm === 'Kokoro') {
    kokoroConsecutiveFailures = 0;
  } else if (norm === 'AI Voice') {
    aiVoiceConsecutiveFailures = 0;
  }
}

export function recordVoiceEngineFailure(
  engine: string,
  reason?: string
): { triggeredFallback: boolean; attempts: number } {
  const norm = normalizeEngineName(engine);
  if (norm === 'Web Speech') {
    return { triggeredFallback: false, attempts: 0 };
  }

  let attempts = 0;
  if (norm === 'Kokoro') {
    kokoroConsecutiveFailures += 1;
    attempts = kokoroConsecutiveFailures;
  } else if (norm === 'AI Voice') {
    aiVoiceConsecutiveFailures += 1;
    attempts = aiVoiceConsecutiveFailures;
  }

  const cleanReason = reason || 'Audio initialization or playback failed';
  console.warn(`[Voice Engine Diagnostic] ${norm} recorded failure attempt ${attempts}/3: ${cleanReason}`);

  if (attempts >= 3) {
    if (norm === 'Kokoro') kokoroConsecutiveFailures = 0;
    else if (norm === 'AI Voice') aiVoiceConsecutiveFailures = 0;

    triggerVoiceEngineFallback(norm, cleanReason);
    return { triggeredFallback: true, attempts };
  }

  return { triggeredFallback: false, attempts };
}

export function triggerVoiceEngineFallback(failedEngine: 'Kokoro' | 'AI Voice', reason?: string): void {
  // 1. Automatically toggle the voice engine setting to 'Web Speech' ('device')
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

  // 2. Dispatch event for global Toast notification and UI synchronization
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('toefl_voice_fallback_toast', { detail }));
    window.dispatchEvent(new CustomEvent('toefl_voice_engine_changed', { detail: { engine: 'device' } }));
  }
}
