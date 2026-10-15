// Web Speech API and Web Audio utilities for TOEFL audio tasks and speaking test simulation
import { getApiHeaders } from './apiKey';

export interface SpeechVoiceOption {
  name: string;
  lang: string;
  default: boolean;
}

let cachedVoices: SpeechSynthesisVoice[] = [];
const activeUtterances = new Set<SpeechSynthesisUtterance>();
let activeHtmlAudio: HTMLAudioElement | null = null;
let activeAudioCancel: (() => void) | null = null;
let activeFallbackCancel: (() => void) | null = null;
let activeFetchController: AbortController | null = null;
let currentDialogueSessionId = 0;
let isAudioPlayingState = false;
import { openDB } from 'idb';

const DB_NAME = 'toefl_tts_cache_v4';
const DB_VERSION = 1;
const STORE_NAME = 'audio_blobs';

// Immediately purge any stale cached audio blobs containing preambles
if (typeof window !== 'undefined' && 'indexedDB' in window) {
  try {
    indexedDB.deleteDatabase('toefl_tts_cache');
    indexedDB.deleteDatabase('toefl_tts_cache_v1');
    indexedDB.deleteDatabase('toefl_tts_cache_v2');
    indexedDB.deleteDatabase('toefl_tts_cache_v3');
  } catch {}
}

const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    db.createObjectStore(STORE_NAME);
  },
});

// Pre-cache available browser voices synchronously
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  cachedVoices = window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoices = window.speechSynthesis.getVoices();
  };
}

export function getVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return [];
  }
  if (cachedVoices.length === 0) {
    cachedVoices = window.speechSynthesis.getVoices();
  }
  return cachedVoices;
}

export function stopSpeaking() {
  isAudioPlayingState = false;
  currentDialogueSessionId++; // Immediately invalidates any playing dialogue or async loops

  // 0. Abort any in-flight TTS API network fetch immediately
  if (activeFetchController) {
    try {
      activeFetchController.abort();
    } catch {}
    activeFetchController = null;
  }

  // 1. Immediately pause and silence HTML Audio element
  if (activeHtmlAudio) {
    try {
      activeHtmlAudio.pause();
      activeHtmlAudio.currentTime = 0;
      activeHtmlAudio.src = '';
      if (activeHtmlAudio.dataset.isBlobUrl === 'true') {
        URL.revokeObjectURL(activeHtmlAudio.src);
      }
    } catch {
      // Ignored
    }
    activeHtmlAudio = null;
  }

  // 2. Safety measure: ensure any other audio tags in DOM are paused
  if (typeof document !== 'undefined') {
    try {
      const audioElements = document.querySelectorAll('audio');
      audioElements.forEach((el) => {
        try {
          el.pause();
          el.currentTime = 0;
        } catch {}
      });
    } catch {}
  }

  // 3. Immediately unblock any awaiting audio playback promise
  if (activeAudioCancel) {
    const cancel = activeAudioCancel;
    activeAudioCancel = null;
    try {
      cancel();
    } catch {}
  }

  // 4. Immediately cancel any fallback browser synthesis promise
  if (activeFallbackCancel) {
    const cancel = activeFallbackCancel;
    activeFallbackCancel = null;
    try {
      cancel();
    } catch {}
  }

  // 5. Cancel Web Speech API
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.pause();
      window.speechSynthesis.cancel();
      activeUtterances.clear();
    } catch {
      // Ignored
    }
  }
}

export function isAudioPlaying(): boolean {
  return isAudioPlayingState;
}

// TTS Daily Limit Tracker & Circuit Breaker
const TTS_SUCCESS_COUNT_KEY = 'toefl_tts_success_count';
const TTS_DATE_KEY = 'toefl_tts_date';
const TTS_BLOCKED_UNTIL_KEY = 'toefl_tts_blocked_until';

function getTtsQuotaData() {
  const today = new Date().toDateString();
  const storedDate = localStorage.getItem(TTS_DATE_KEY);
  if (storedDate !== today) {
    localStorage.setItem(TTS_DATE_KEY, today);
    localStorage.setItem(TTS_SUCCESS_COUNT_KEY, '0');
    return { count: 0, blockedUntil: 0 };
  }
  const count = parseInt(localStorage.getItem(TTS_SUCCESS_COUNT_KEY) || '0', 10);
  const blockedUntil = parseInt(localStorage.getItem(TTS_BLOCKED_UNTIL_KEY) || '0', 10);
  return { count, blockedUntil };
}

function incrementTtsQuota() {
  const count = parseInt(localStorage.getItem(TTS_SUCCESS_COUNT_KEY) || '0', 10);
  localStorage.setItem(TTS_SUCCESS_COUNT_KEY, (count + 1).toString());
}

export function resetTtsQuotaBlock(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(TTS_BLOCKED_UNTIL_KEY);
  }
}

export function getTtsUsageCount(): number {
  return parseInt(localStorage.getItem(TTS_SUCCESS_COUNT_KEY) || '0', 10);
}

// Fetch Cloud Audio from /api/tts via Gemini with in-memory & IndexedDB caching
export async function fetchAudioBlob(text: string, voiceName: string = 'Kore'): Promise<Blob> {
  const cacheKey = `${voiceName}:::${text}`;
  const db = await dbPromise;
  
  // Check cache
  const cachedBlob = await db.get(STORE_NAME, cacheKey);
  if (cachedBlob) {
    return cachedBlob;
  }

  const { blockedUntil } = getTtsQuotaData();
  if (Date.now() < blockedUntil) {
    if (blockedUntil - Date.now() > 2 * 60 * 1000) {
      localStorage.removeItem(TTS_BLOCKED_UNTIL_KEY);
    } else {
      throw new Error('GEMINI_TTS_BLOCKED');
    }
  }

  const controller = new AbortController();
  activeFetchController = controller;

  let res: Response;
  let json: any;
  try {
    res = await fetch('/api/tts', {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({ text, voiceName }),
      signal: controller.signal,
    });
    json = await res.json();
  } finally {
    if (activeFetchController === controller) {
      activeFetchController = null;
    }
  }
  
  if (res.status === 429) {
    const retryAfter = (json.rateLimit?.retryAfterSeconds || 60) * 1000;
    const blockDuration = Math.min(retryAfter + 5000, 60000);
    localStorage.setItem(TTS_BLOCKED_UNTIL_KEY, (Date.now() + blockDuration).toString());
    throw new Error('GEMINI_TTS_BLOCKED');
  }

  if (!res.ok || !json.success || !json.audioBase64) {
    throw new Error(json.error || 'TTS service failed');
  }

  incrementTtsQuota();

  // Decode base64 to Blob
  const byteCharacters = atob(json.audioBase64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: json.mimeType || 'audio/wav' });

  // Store in cache
  try {
    await db.put(STORE_NAME, blob, cacheKey);
  } catch {}

  // Simple cache eviction (limit keys)
  try {
    const keys = await db.getAllKeys(STORE_NAME);
    if (keys.length > 50) {
      await db.delete(STORE_NAME, keys[0]);
    }
  } catch {}

  return blob;
}

// Play HTML Audio Data URI (or Blob URL) with promise resolution
// Now just a wrapper for playAudioBlob
export async function fetchAudioDataUri(text: string, voiceName: string = 'Kore'): Promise<string> {
  const blob = await fetchAudioBlob(text, voiceName);
  return URL.createObjectURL(blob);
}

// Play Blob with object URL and cleanup
export function playAudioBlob(blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob);
  return playAudioDataUri(url, true);
}

// Play HTML Audio Data URI (or Blob URL) with promise resolution
export function playAudioDataUri(dataUri: string, isBlobUrl: boolean = false): Promise<void> {
  if (activeHtmlAudio) {
    try {
      activeHtmlAudio.pause();
      activeHtmlAudio.currentTime = 0;
      activeHtmlAudio.src = '';
    } catch {}
    // Revoke previous blob URL if it was a blob URL
    if (activeHtmlAudio.dataset.isBlobUrl === 'true') {
      URL.revokeObjectURL(activeHtmlAudio.src);
    }
    activeHtmlAudio = null;
  }

  isAudioPlayingState = true;
  const audio = new Audio(dataUri);
  audio.dataset.isBlobUrl = isBlobUrl ? 'true' : 'false';
  activeHtmlAudio = audio;

  return new Promise<void>((resolve) => {
    let finished = false;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      activeAudioCancel = null;
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.src = '';
      } catch {}
      if (audio.dataset.isBlobUrl === 'true') {
        URL.revokeObjectURL(audio.src);
      }
      if (activeHtmlAudio === audio) {
        activeHtmlAudio = null;
      }
      resolve();
    };

    activeAudioCancel = cleanup;
    audio.onended = cleanup;
    audio.onerror = cleanup;

    audio.play().catch((err) => {
      console.warn('Audio play() failed:', err);
      cleanup();
    });
  });
}

// Browser fallback speech synthesis
function speakScriptLineFallback(text: string, pitch = 1.0, browserVoice?: SpeechSynthesisVoice | null): Promise<void> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let finished = false;
    let currentUtt: SpeechSynthesisUtterance | null = null;
    let safetyTimer: any = null;

    const cleanup = () => {
      if (finished) return;
      finished = true;
      if (safetyTimer) clearTimeout(safetyTimer);
      activeFallbackCancel = null;
      if (currentUtt) {
        activeUtterances.delete(currentUtt);
      }
      resolve();
    };

    activeFallbackCancel = cleanup;

    // Safety timeout in case browser speech synthesis hangs
    const maxDuration = Math.max(3500, text.length * 100);
    safetyTimer = setTimeout(cleanup, maxDuration);

    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      const utt = new SpeechSynthesisUtterance(text);
      currentUtt = utt;
      activeUtterances.add(utt);
      utt.lang = 'en-US';
      utt.rate = 0.95;
      utt.pitch = pitch;

      if (browserVoice) {
        const availableVoices = window.speechSynthesis.getVoices();
        const matched = availableVoices.find((v) => v.name === browserVoice.name || v.voiceURI === browserVoice.voiceURI);
        if (matched) {
          utt.voice = matched;
        }
      }

      utt.onend = cleanup;
      utt.onerror = cleanup;

      // Handle Chrome speech engine state cleanly
      window.speechSynthesis.resume();
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        setTimeout(() => {
          try {
            window.speechSynthesis.resume();
            window.speechSynthesis.speak(utt);
          } catch {
            cleanup();
          }
        }, 60);
      } else {
        window.speechSynthesis.speak(utt);
      }
    } catch {
      cleanup();
    }
  });
}

export type VoiceEngine = 'gemini' | 'device';

export function getVoiceEngine(): VoiceEngine {
  const stored = localStorage.getItem('toefl_voice_engine');
  if (!stored) return 'gemini';
  return stored as VoiceEngine;
}

export function setVoiceEngine(engine: VoiceEngine) {
  localStorage.setItem('toefl_voice_engine', engine);
}

export function getSavedBrowserVoiceName(gender: 'male' | 'female'): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(`toefl_browser_voice_${gender}`) || '';
}

export function setSavedBrowserVoiceName(gender: 'male' | 'female', voiceName: string): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(`toefl_browser_voice_${gender}`, voiceName.trim());
  }
}

export function pickBrowserVoiceForGender(gender: 'male' | 'female', lang: string = 'en-US'): SpeechSynthesisVoice | null {
  const voices = getVoices();
  if (voices.length === 0) return null;

  const savedName = getSavedBrowserVoiceName(gender);
  if (savedName) {
    const matched = voices.find((v) => v.name === savedName);
    if (matched) return matched;
  }
  
  // Scoring function for voice quality
  const getScore = (v: SpeechSynthesisVoice) => {
    let score = 0;
    if (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Neural') || v.name.includes('Online')) score += 10;
    if (v.lang.startsWith(lang.substring(0, 2))) score += 5;
    if (gender === 'male' && (v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('man') || v.name.toLowerCase().includes('david') || v.name.toLowerCase().includes('guy'))) score += 5;
    if (gender === 'female' && (v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('woman') || v.name.toLowerCase().includes('zira') || v.name.toLowerCase().includes('samantha') || v.name.toLowerCase().includes('jenny'))) score += 5;
    return score;
  };

  return voices.sort((a, b) => getScore(b) - getScore(a))[0] || voices[0] || null;
}

export async function previewBrowserVoice(text: string, voiceName?: string, pitch: number = 1.0): Promise<void> {
  stopSpeaking();
  isAudioPlayingState = true;
  const voices = getVoices();
  const matchedVoice = voiceName ? voices.find((v) => v.name === voiceName) : null;
  await speakScriptLineFallback(text, pitch, matchedVoice);
}

// Speak single line with Studio AI voice primary and browser fallback
export async function speakScriptLine(
  text: string,
  options: {
    rate?: number;
    pitch?: number;
    voiceName?: string;
    browserVoice?: SpeechSynthesisVoice | null;
    onEnd?: () => void;
    onError?: (err: any) => void;
  } = {}
): Promise<void> {
  stopSpeaking();
  isAudioPlayingState = true;
  const currentSession = ++currentDialogueSessionId;

  const defaultVoice = options.pitch && options.pitch < 0.95 ? 'Puck' : 'Kore';
  const voice = options.voiceName || defaultVoice;
  const gender = voice === 'Puck' ? 'male' : 'female';

  // Clean any speaker prefix (e.g. "Sarah (student): " or "Interviewer: ") so it is not spoken aloud
  let cleanText = text.trim();
  const colonIdx = cleanText.indexOf(':');
  if (colonIdx > 0 && colonIdx < 35) {
    cleanText = cleanText.substring(colonIdx + 1).trim();
  }

  // 1. Try high-fidelity Studio Cloud Voice first (crisp, natural, works in iframe)
  try {
    const blob = await fetchAudioBlob(cleanText, voice);
    if (!isAudioPlayingState || currentDialogueSessionId !== currentSession) return;
    await playAudioBlob(blob);
    if (!isAudioPlayingState || currentDialogueSessionId !== currentSession) return;
    isAudioPlayingState = false;
    options.onEnd?.();
    return;
  } catch (err) {
    if (!isAudioPlayingState || currentDialogueSessionId !== currentSession) return;
    console.warn('Studio AI voice failed or unavailable, falling back to browser voice:', err);
  }

  // 2. Fall back to browser speech synthesis
  if (!isAudioPlayingState || currentDialogueSessionId !== currentSession) return;
  try {
    const voiceObj = options.browserVoice || pickBrowserVoiceForGender(gender);
    await speakScriptLineFallback(cleanText, options.pitch ?? 1.0, voiceObj);
  } catch (browserErr) {
    console.warn('Browser speech fallback failed:', browserErr);
    options.onError?.(browserErr);
  } finally {
    if (currentDialogueSessionId === currentSession) {
      isAudioPlayingState = false;
      options.onEnd?.();
    }
  }
}

// Play multi-line dialogue (Speaker A & B) with Studio AI voices
export async function playDialogue(
  lines: string[],
  voiceMapping: { A: string; B: string } = { A: 'Puck', B: 'Kore' },
  onLineChange?: (lineIndex: number) => void
): Promise<void> {
  stopSpeaking();
  isAudioPlayingState = true;
  const currentSession = ++currentDialogueSessionId;

  for (let i = 0; i < lines.length; i++) {
    if (!isAudioPlayingState || currentDialogueSessionId !== currentSession) break; // User stopped/restarted playback

    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    onLineChange?.(i);

    // Clean speaker prefix so it doesn't speak "Speaker A:" or "Professor Lee:"
    let cleanText = rawLine;
    let speakerLabel = '';
    const colonIdx = rawLine.indexOf(':');
    if (colonIdx > 0 && colonIdx < 35) {
      speakerLabel = rawLine.substring(0, colonIdx).trim().toLowerCase();
      cleanText = rawLine.substring(colonIdx + 1).trim();
    } else {
      cleanText = rawLine.replace(/^(Speaker [AB]:|[AB]:|Professor.*?:|Student.*?:)\s*/i, '');
    }

    const isSpeakerA =
      speakerLabel.includes('a') ||
      speakerLabel.includes('professor') ||
      speakerLabel.includes('advisor') ||
      speakerLabel.includes('dr.') ||
      speakerLabel.includes('doctor') ||
      speakerLabel.includes('faculty') ||
      speakerLabel.includes('interviewer') ||
      (!speakerLabel && i % 2 === 0);

    const voiceToUse = isSpeakerA ? voiceMapping.A : voiceMapping.B;

    // Asynchronously pre-fetch the next line while current line is about to play
    if (i + 1 < lines.length) {
      const nextRaw = lines[i + 1].trim();
      let nextClean = nextRaw;
      let nextLabel = '';
      const nextColon = nextRaw.indexOf(':');
      if (nextColon > 0 && nextColon < 35) {
        nextLabel = nextRaw.substring(0, nextColon).trim().toLowerCase();
        nextClean = nextRaw.substring(nextColon + 1).trim();
      } else {
        nextClean = nextRaw.replace(/^(Speaker [AB]:|[AB]:|Professor.*?:|Student.*?:)\s*/i, '');
      }
      const nextIsA =
        nextLabel.includes('a') ||
        nextLabel.includes('professor') ||
        nextLabel.includes('advisor') ||
        nextLabel.includes('dr.') ||
        nextLabel.includes('doctor') ||
        nextLabel.includes('faculty') ||
        nextLabel.includes('interviewer') ||
        (!nextLabel && (i + 1) % 2 === 0);
      const nextVoice = nextIsA ? voiceMapping.A : voiceMapping.B;
      fetchAudioDataUri(nextClean, nextVoice).catch(() => {});
    }

    try {
      // 1. Studio Quality AI Voice (Puck for Male, Kore for Female)
      const dataUri = await fetchAudioDataUri(cleanText, voiceToUse);
      if (!isAudioPlayingState || currentDialogueSessionId !== currentSession) break;
      await playAudioDataUri(dataUri);
      if (!isAudioPlayingState || currentDialogueSessionId !== currentSession) break;
      await new Promise((r) => setTimeout(r, 200));
    } catch {
      // 2. Fallback to Web Speech API
      if (!isAudioPlayingState || currentDialogueSessionId !== currentSession) break;
      const fallbackPitch = voiceToUse === 'Kore' || voiceToUse === 'Zephyr' ? 1.15 : 0.88;
      await speakScriptLineFallback(cleanText, fallbackPitch);
      if (!isAudioPlayingState || currentDialogueSessionId !== currentSession) break;
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  if (currentDialogueSessionId === currentSession) {
    isAudioPlayingState = false;
  }
}

export async function clearAudioCache(): Promise<void> {
  try {
    const db = await dbPromise;
    await db.clear(STORE_NAME);
  } catch {}
}

// Tone synthesizer using Web Audio API for TOEFL test countdown beeps
export function playChime(freq = 880, durationMs = 200, type: OscillatorType = 'sine') {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
  } catch {
    // AudioContext blocked or unavailable
  }
}

// Speech Recognition helper
export function createSpeechRecognizer(
  onTranscript: (text: string, isFinal: boolean) => void,
  onStatusChange?: (status: 'listening' | 'stopped' | 'error', errorMsg?: string) => void
) {
  const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRec) {
    return null;
  }

  const recognition = new SpeechRec();
  recognition.lang = 'en-US';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    onStatusChange?.('listening');
  };

  recognition.onresult = (event: any) => {
    let accumulatedFinal = '';
    let interim = '';

    for (let i = 0; i < event.results.length; ++i) {
      const res = event.results[i];
      if (res && res[0]) {
        if (res.isFinal) {
          accumulatedFinal += res[0].transcript + ' ';
        } else {
          interim += res[0].transcript;
        }
      }
    }

    const currentText = (accumulatedFinal + interim).trim();
    if (currentText) {
      onTranscript(currentText, Boolean(accumulatedFinal));
    }
  };

  recognition.onerror = (event: any) => {
    // Non-fatal error: user paused or momentarily quiet
    if (event.error === 'no-speech' || event.error === 'aborted') {
      return;
    }
    onStatusChange?.('error', event.error);
  };

  recognition.onend = () => {
    onStatusChange?.('stopped');
  };

  return recognition;
}

// Microphone Storage helpers
export function getStoredMicDeviceId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('toefl_mic_device_id') || null;
}

export function setStoredMicDeviceId(deviceId: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('toefl_mic_device_id', deviceId);
}

export async function getAudioInputDevices(): Promise<MediaDeviceInfo[]> {
  if (typeof window === 'undefined' || !navigator?.mediaDevices?.enumerateDevices) {
    return [];
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'audioinput');
  } catch {
    return [];
  }
}

// Fast Base64 conversion using FileReader instead of byte-by-byte loop
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const commaIdx = dataUrl.indexOf(',');
      resolve(commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Session Web Speech tracking
let hasShownWebSpeechHintThisSession = false;

export function isWebSpeechBlocked(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem('toefl_webspeech_unavailable') === 'true';
}

export function markWebSpeechBlocked(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('toefl_webspeech_unavailable', 'true');
  }
}

export const WEB_SPEECH_UNAVAILABLE_HINT =
  "Instant transcription isn't available in this browser (Brave blocks it). Use Chrome or Edge for instant results; otherwise transcription takes a few seconds.";

export function mapMicrophoneError(err: any): string {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Microphone permission was denied. Click the lock/site settings icon in your browser address bar to allow microphone access, then refresh.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No microphone was found on your device. Please plug in or connect a microphone or headset and try again.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Microphone is currently in use by another app or browser tab. Please close other voice apps (Zoom, Teams, Discord, etc.) and try again.';
  }
  return `Could not access microphone: ${err?.message || name}. You can type your response instead.`;
}

// Request and verify microphone access without opening throwaway streams
export async function requestMicrophoneAccess(): Promise<{ granted: boolean; error?: string }> {
  if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
    return {
      granted: false,
      error: 'Audio recording is not supported in this browser environment. You can type your response instead.',
    };
  }

  // Pre-check permission state without opening an audio stream
  try {
    if (navigator?.permissions?.query) {
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (status.state === 'denied') {
        return {
          granted: false,
          error:
            'Microphone permission was denied. Click the lock/site settings icon in your browser address bar to allow microphone access, then refresh.',
        };
      }
    }
  } catch {
    // navigator.permissions.query('microphone') not supported in some browsers (e.g. Firefox/Safari) - proceed safely
  }

  return { granted: true };
}

// Send recorded audio to Gemini /api/transcribe fallback with fast base64 and 20s timeout
export async function transcribeAudioBlob(blob: Blob): Promise<{ transcript: string; durationMs?: number }> {
  const base64 = await blobToBase64(blob);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch('/api/transcribe', {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({
        audioBase64: base64,
        mimeType: blob.type || 'audio/webm',
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Audio transcription failed');
    }
    return {
      transcript: json.transcript || '',
      durationMs: json.durationMs,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError' || String(err).includes('aborted')) {
      throw new Error('TRANSCRIPTION_TIMEOUT');
    }
    throw err;
  }
}

// Unified Voice Recording Session combining Web Speech (real-time) and MediaRecorder (reliable fallback)
export interface VoiceSessionOptions {
  onTranscriptUpdate?: (text: string) => void;
  onStatusChange?: (status: 'idle' | 'listening' | 'waiting_for_voice' | 'processing' | 'error', errorMsg?: string) => void;
  onAudioLevel?: (level: number) => void; // 0 to 100 for live meter
  onQuietWarning?: (warning: string) => void; // "We can't hear you..."
  onDeviceDisconnected?: (msg: string) => void;
  onNotice?: (notice: string) => void; // e.g. Brave Web Speech notice or headphones echo notice
  autoStartThreshold?: number; // Level (0-100) to trigger auto-start
}

export interface VoiceSessionResult {
  transcript: string;
  audioBlob: Blob | null;
  durationMs?: number;
  isSilent?: boolean;
  error?: 'TRANSCRIPTION_TIMEOUT' | 'TRANSCRIPTION_FAILED';
}

export interface VoiceSession {
  start: () => Promise<void>;
  stop: () => Promise<VoiceSessionResult>;
  abort: () => void;
  isRecording: () => boolean;
}

export function createVoiceSession(options: VoiceSessionOptions): VoiceSession {
  let isRecordingState = false;
  let activeStream: MediaStream | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let recognitionInstance: any = null;
  let accumulatedTranscript = '';
  let audioChunks: Blob[] = [];

  let audioContext: AudioContext | null = null;
  let analyserNode: AnalyserNode | null = null;
  let mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  let meterInterval: any = null;
  let audioContextAlwaysRunning = false;

  let maxVolume = 0;
  let totalVolume = 0;
  let volumeSamples = 0;
  let quietWarningFired = false;
  let recordingStartTime = 0;
  let isDeviceUnplugged = false;

  const tryResumeContext = () => {
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }
  };

  const cleanupAudioNodes = () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('click', tryResumeContext);
      window.removeEventListener('keydown', tryResumeContext);
    }
    if (meterInterval) {
      clearInterval(meterInterval);
      meterInterval = null;
    }
    if (mediaStreamSource) {
      try {
        mediaStreamSource.disconnect();
      } catch {}
      mediaStreamSource = null;
    }
    if (analyserNode) {
      try {
        analyserNode.disconnect();
      } catch {}
      analyserNode = null;
    }
    if (audioContext && audioContext.state !== 'closed') {
      try {
        audioContext.close();
      } catch {}
      audioContext = null;
    }
    if (activeStream) {
      activeStream.getTracks().forEach((t) => t.stop());
      activeStream = null;
    }
    options.onAudioLevel?.(0);
  };

  const cleanupAll = () => {
    isRecordingState = false;
    cleanupAudioNodes();
    if (recognitionInstance) {
      try {
        recognitionInstance.stop();
      } catch {}
      recognitionInstance = null;
    }
    mediaRecorder = null;
    audioChunks = [];
  };

  return {
    isRecording: () => isRecordingState,

    start: async () => {
      cleanupAll();
      accumulatedTranscript = '';
      audioChunks = [];
      maxVolume = 0;
      totalVolume = 0;
      volumeSamples = 0;
      quietWarningFired = false;
      isDeviceUnplugged = false;

      // Stop any TTS playback immediately to avoid microphone picking up app voice
      stopSpeaking();
      if (isAudioPlaying()) {
        await new Promise((r) => setTimeout(r, 120));
      }

      // Check mic access first without opening a throwaway stream
      const permCheck = await requestMicrophoneAccess();
      if (!permCheck.granted) {
        options.onStatusChange?.('error', permCheck.error);
        throw new Error(permCheck.error);
      }

      try {
        const selectedDeviceId = getStoredMicDeviceId();
        const speechConstraints: MediaStreamConstraints = {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            ...(selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : {}),
          },
        };

        // Open microphone once directly in session start
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia(speechConstraints);
        } catch (firstErr: any) {
          // If browser rejects constraints or device changed, retry with { audio: true }
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          } catch (secondErr: any) {
            const errorMsg = mapMicrophoneError(secondErr || firstErr);
            options.onStatusChange?.('error', errorMsg);
            throw new Error(errorMsg);
          }
        }

        activeStream = stream;

        // Monitor if device is unplugged mid-recording
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.onended = () => {
            if (isRecordingState) {
              isDeviceUnplugged = true;
              console.warn('[Audio] Microphone device disconnected mid-recording');
              options.onDeviceDisconnected?.('Microphone was disconnected. Keeping audio recorded so far.');
            }
          };
        }

        // Setup AnalyserNode for live level meter & silence detection
        try {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtx) {
            audioContext = new AudioCtx();
            // Resume immediately after creating AudioContext
            if (audioContext.state === 'suspended') {
              try {
                await audioContext.resume();
              } catch {}
            }

            // Also attach interaction resume handler if still suspended
            if (typeof window !== 'undefined') {
              window.addEventListener('click', tryResumeContext, { once: true });
              window.addEventListener('keydown', tryResumeContext, { once: true });
            }

            audioContextAlwaysRunning = audioContext.state === 'running';
            audioContext.onstatechange = () => {
              if (!audioContext || audioContext.state !== 'running') {
                audioContextAlwaysRunning = false;
              }
            };

            analyserNode = audioContext.createAnalyser();
            analyserNode.fftSize = 256;
            mediaStreamSource = audioContext.createMediaStreamSource(stream);
            mediaStreamSource.connect(analyserNode);

            const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
            meterInterval = setInterval(() => {
              if (!isRecordingState || !analyserNode) return;

              if (!audioContext || audioContext.state !== 'running') {
                audioContextAlwaysRunning = false;
              }

              analyserNode.getByteFrequencyData(dataArray);
              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
              const avg = sum / dataArray.length;
              const lvl = Math.min(100, Math.round((avg / 120) * 100));
              options.onAudioLevel?.(lvl);

              if (waitingForVoice && lvl > (options.autoStartThreshold || 0)) {
                waitingForVoice = false;
                startRecording();
              }

              volumeSamples++;
              totalVolume += lvl;
              if (lvl > maxVolume) maxVolume = lvl;

              // Only trust analyser for "We can't hear you" if audioContext was running the whole time
              const elapsed = Date.now() - recordingStartTime;
              if (elapsed >= 3000 && elapsed <= 3800 && !quietWarningFired) {
                if (audioContextAlwaysRunning && audioContext?.state === 'running') {
                  quietWarningFired = true;
                  const avgFirst3 = totalVolume / Math.max(1, volumeSamples);
                  if (avgFirst3 < 3 && maxVolume < 5) {
                    options.onQuietWarning?.("We can't hear you. Check your microphone or speak closer to it.");
                  }
                }
              }
            }, 60);
          }
        } catch (e) {
          audioContextAlwaysRunning = false;
          console.warn('[Audio] AnalyserNode setup notice:', e);
        }

        // Pick best supported MIME type in order:
        // audio/webm;codecs=opus, audio/webm, audio/mp4 (Safari), audio/ogg;codecs=opus
        const mimeTypes = [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/mp4',
          'audio/ogg;codecs=opus',
        ];
        const supportedType = mimeTypes.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) || '';

        try {
          mediaRecorder = supportedType
            ? new MediaRecorder(stream, { mimeType: supportedType, audioBitsPerSecond: 24000 })
            : new MediaRecorder(stream, { audioBitsPerSecond: 24000 });

          mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              audioChunks.push(e.data);
            }
          };
        } catch {
          mediaRecorder = null;
        }

        const autoStartEnabled = options.autoStartThreshold !== undefined;
        let waitingForVoice = autoStartEnabled;

        const startRecording = () => {
          if (mediaRecorder && mediaRecorder.state === 'inactive') {
            try {
              mediaRecorder.start(250);
            } catch {}
          }
          recordingStartTime = Date.now();
          isRecordingState = true;
          options.onStatusChange?.('listening');

          // Setup SpeechRecognition for real-time live typing if not blocked in session
          if (!isWebSpeechBlocked() && !recognitionInstance) {
            recognitionInstance = createSpeechRecognizer(
              (text) => {
                accumulatedTranscript = text;
                options.onTranscriptUpdate?.(text);
              },
              (status, errorMsg) => {
                if (status === 'error' && isRecordingState) {
                  if (errorMsg === 'network' || errorMsg === 'service-not-allowed') {
                    markWebSpeechBlocked();
                    if (!hasShownWebSpeechHintThisSession) {
                      hasShownWebSpeechHintThisSession = true;
                      options.onNotice?.(WEB_SPEECH_UNAVAILABLE_HINT);
                    }
                  } else if (errorMsg === 'not-allowed') {
                    options.onStatusChange?.('error', 'Microphone permission denied.');
                  }
                }
              }
            );

            if (recognitionInstance) {
              try {
                recognitionInstance.start();
              } catch {}
            }
          } else if (!hasShownWebSpeechHintThisSession && isWebSpeechBlocked()) {
            hasShownWebSpeechHintThisSession = true;
            options.onNotice?.(WEB_SPEECH_UNAVAILABLE_HINT);
          }
        };

        if (waitingForVoice) {
          isRecordingState = true;
          options.onStatusChange?.('waiting_for_voice');
        } else {
          startRecording();
        }

      } catch (err: any) {
        cleanupAll();
        options.onStatusChange?.('error', err.message || 'Could not start recording');
        throw err;
      }
    },

    stop: async (): Promise<VoiceSessionResult> => {
      if (!isRecordingState && audioChunks.length === 0) {
        return { transcript: accumulatedTranscript, audioBlob: null };
      }

      const stopRequestedTime = Date.now();
      console.log('[Audio Timing] Stop recording triggered at', new Date().toISOString());

      // Keep recording about 300 ms after the user presses Stop so the first and last words are not clipped
      if (mediaRecorder && mediaRecorder.state === 'recording' && !isDeviceUnplugged) {
        await new Promise((r) => setTimeout(r, 300));
      }

      isRecordingState = false;

      // Stop speech recognition
      if (recognitionInstance) {
        try {
          recognitionInstance.stop();
        } catch {}
        recognitionInstance = null;
      }

      // Stop MediaRecorder and collect final audio blob
      let finalAudioBlob: Blob | null = null;
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        await new Promise<void>((resolve) => {
          mediaRecorder!.onstop = () => {
            const mime = mediaRecorder?.mimeType || 'audio/webm';
            finalAudioBlob = new Blob(audioChunks, { type: mime });
            resolve();
          };
          try {
            mediaRecorder!.stop();
          } catch {
            resolve();
          }
        });
      } else if (audioChunks.length > 0) {
        finalAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      }

      // Release audio nodes & stream tracks immediately
      cleanupAudioNodes();

      // Decide "silent" mainly from recorded blob size and duration
      // A blob under ~1 KB per second of recording is likely silent.
      // Never treat clip as silent because of analyser readings if AudioContext was suspended.
      const recordingDurationSec = Math.max(0.2, (Date.now() - recordingStartTime) / 1000);
      const blobSize = finalAudioBlob ? finalAudioBlob.size : 0;
      const bytesPerSec = blobSize / recordingDurationSec;

      let isSilentClip = false;
      if (!accumulatedTranscript.trim()) {
        if (!finalAudioBlob || blobSize < 150) {
          isSilentClip = true;
        } else if (recordingDurationSec >= 1.5 && bytesPerSec < 850) {
          if (audioContextAlwaysRunning && audioContext?.state === 'running') {
            const avgVol = volumeSamples > 0 ? totalVolume / volumeSamples : 0;
            if (maxVolume < 3 && avgVol < 1.5) {
              isSilentClip = true;
            }
          } else if (bytesPerSec < 350) {
            // When analyser was suspended or not running, transcribe anyway unless data is nearly empty
            isSilentClip = true;
          }
        }
      }

      if (isSilentClip && !accumulatedTranscript.trim()) {
        console.warn(`[Audio Timing] Silent clip detected (size: ${blobSize}B, duration: ${recordingDurationSec.toFixed(1)}s, ${Math.round(bytesPerSec)} B/s, ctxRunning: ${audioContextAlwaysRunning}). Skipping transcription.`);
        options.onStatusChange?.('error', 'No sound was detected in your recording. Please check your microphone or speak closer to it, then try again.');
        return { transcript: '', audioBlob: finalAudioBlob, isSilent: true };
      }

      // If we have live transcript from Web Speech, return immediately
      const liveTranscript = accumulatedTranscript.trim();
      if (liveTranscript.length > 0) {
        console.log(`[Audio Timing] stop -> transcript: ${Date.now() - stopRequestedTime}ms (via Web Speech)`);
        options.onStatusChange?.('idle');
        return { transcript: liveTranscript, audioBlob: finalAudioBlob };
      }

      // Fallback: If Web Speech produced no text, use fast Gemini transcription with 20s timeout
      if (finalAudioBlob && (finalAudioBlob as Blob).size > 150) {
        options.onStatusChange?.('processing');
        try {
          const { transcript: aiTranscribed, durationMs } = await transcribeAudioBlob(finalAudioBlob);
          const cleaned = aiTranscribed.trim();
          console.log(`[Audio Timing] stop -> transcript: ${Date.now() - stopRequestedTime}ms (via Gemini /api/transcribe, model duration: ${durationMs || 'N/A'}ms)`);
          if (cleaned) {
            options.onTranscriptUpdate?.(cleaned);
          }
          options.onStatusChange?.('idle');
          return { transcript: cleaned, audioBlob: finalAudioBlob, durationMs };
        } catch (err: any) {
          console.warn('[Audio] AI speech transcription fallback error:', err);
          const errCode: 'TRANSCRIPTION_TIMEOUT' | 'TRANSCRIPTION_FAILED' =
            err?.message === 'TRANSCRIPTION_TIMEOUT' ? 'TRANSCRIPTION_TIMEOUT' : 'TRANSCRIPTION_FAILED';

          if (errCode === 'TRANSCRIPTION_TIMEOUT') {
            options.onStatusChange?.('error', 'Transcription timed out (20s). Audio saved. Click "Retry transcription" or type your answer.');
          } else {
            options.onStatusChange?.('error', 'Audio transcription failed. Audio saved. Click "Retry transcription" or type your answer.');
          }

          // Return failure status with retained audioBlob instead of throwing
          return { transcript: '', audioBlob: finalAudioBlob, error: errCode };
        }
      }

      options.onStatusChange?.('idle');
      return { transcript: liveTranscript, audioBlob: finalAudioBlob };
    },

    abort: () => {
      cleanupAll();
      options.onStatusChange?.('idle');
    },
  };
}


// Time words lookup
const TIME_HOURS: Record<string, string> = {
  '1': 'one',
  '2': 'two',
  '3': 'three',
  '4': 'four',
  '5': 'five',
  '6': 'six',
  '7': 'seven',
  '8': 'eight',
  '9': 'nine',
  '10': 'ten',
  '11': 'eleven',
  '12': 'twelve',
};

// Numbers to words map
const NUM_WORDS: Record<string, string> = {
  '0': 'zero',
  '1': 'one',
  '2': 'two',
  '3': 'three',
  '4': 'four',
  '5': 'five',
  '6': 'six',
  '7': 'seven',
  '8': 'eight',
  '9': 'nine',
  '10': 'ten',
  '11': 'eleven',
  '12': 'twelve',
  '13': 'thirteen',
  '14': 'fourteen',
  '15': 'fifteen',
  '16': 'sixteen',
  '17': 'seventeen',
  '18': 'eighteen',
  '19': 'nineteen',
  '20': 'twenty',
  '30': 'thirty',
  '40': 'forty',
  '50': 'fifty',
  '60': 'sixty',
  '70': 'seventy',
  '80': 'eighty',
  '90': 'ninety',
  '100': 'one hundred',
  '1000': 'one thousand',
  '1st': 'first',
  '2nd': 'second',
  '3rd': 'third',
  '4th': 'fourth',
  '5th': 'fifth',
  '6th': 'sixth',
  '7th': 'seventh',
  '8th': 'eighth',
  '9th': 'ninth',
  '10th': 'tenth',
};

// Spoken text normalizer that resolves "10:00" vs "ten o'clock", contractions, and numbers
export function normalizeSpokenText(text: string): string {
  if (!text) return '';
  let s = text.toLowerCase();

  // Replace smart / curly quotes and special characters
  s = s.replace(/[\u2018\u2019\u201B\u0060\u00B4]/g, "'");
  s = s.replace(/[\u201C\u201D]/g, '"');

  // Convert "10:00", "10:00 am", "10:00 a.m.", "10:00pm", etc. -> "ten o'clock"
  s = s.replace(/\b(1[0-2]|[1-9]):00(?:\s*(?:am|pm|a\.m\.|p\.m\.))?\b/gi, (_, h) => {
    return `${TIME_HOURS[h] || h} o'clock`;
  });

  // Convert "10:30", "10:15", "10:45", etc.
  s = s.replace(/\b(1[0-2]|[1-9]):([0-5][0-9])(?:\s*(?:am|pm|a\.m\.|p\.m\.))?\b/gi, (_, h, m) => {
    const minWords: Record<string, string> = {
      '15': 'fifteen',
      '30': 'thirty',
      '45': 'forty five',
      '20': 'twenty',
      '10': 'ten',
      '05': 'five',
    };
    return `${TIME_HOURS[h] || h} ${minWords[m] || m}`;
  });

  // Convert "10 o'clock", "10 oclock", "10 o clock" -> "ten o'clock"
  s = s.replace(/\b(1[0-2]|[1-9])\s*o'?clock\b/gi, (_, h) => `${TIME_HOURS[h] || h} o'clock`);
  s = s.replace(/\b(1[0-2]|[1-9])\s+o\s+clock\b/gi, (_, h) => `${TIME_HOURS[h] || h} o'clock`);

  // Convert numbers to words: "10" -> "ten", "1st" -> "first"
  s = s.replace(/\b([0-9]{1,4}(?:st|nd|rd|th)?)\b/g, (match) => NUM_WORDS[match] || match);

  // Normalize o'clock variations
  s = s.replace(/\bo\s+clock\b/g, "o'clock");
  s = s.replace(/\boclock\b/g, "o'clock");

  // Symbols
  s = s.replace(/%/g, ' percent ');
  s = s.replace(/&/g, ' and ');
  s = s.replace(/\$/g, ' dollar ');

  return s;
}

// Tokenize text into normalized word tokens for comparison
export function tokenizeNormalizedWords(text: string): string[] {
  const norm = normalizeSpokenText(text);
  return norm
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter(Boolean);
}

// Check if two words are equivalent in TOEFL speaking context
function areWordsEquivalent(targetWord: string, candidate: string): boolean {
  if (targetWord === candidate) return true;

  // Contraction or o'clock without quote
  const cleanTarget = targetWord.replace(/'/g, '');
  const cleanCandidate = candidate.replace(/'/g, '');
  if (cleanTarget === cleanCandidate) return true;

  // Common synonyms / abbreviations
  const synonyms: Record<string, string[]> = {
    laboratory: ['lab', 'labs'],
    lab: ['laboratory'],
    professor: ['prof', 'professors'],
    professors: ['prof', 'professor'],
    doctor: ['dr'],
    assistants: ['assistant'],
    assistant: ['assistants'],
    reports: ['report'],
    report: ['reports'],
    slides: ['slide'],
    slide: ['slides'],
    sessions: ['session'],
    session: ['sessions'],
    hours: ['hour'],
    hour: ['hours'],
    concepts: ['concept'],
    concept: ['concepts'],
    datasets: ['dataset'],
    dataset: ['datasets'],
    panels: ['panel'],
    panel: ['panels'],
    trials: ['trial'],
    trial: ['trials'],
    organisms: ['organism'],
    organism: ['organisms'],
    layers: ['layer'],
    layer: ['layers'],
    communities: ['community'],
    community: ['communities'],
  };

  if (synonyms[targetWord]?.includes(candidate)) return true;
  if (synonyms[candidate]?.includes(targetWord)) return true;

  // Single-letter morphological difference (plural 's' or 'ed')
  if (
    targetWord.length >= 5 &&
    (targetWord + 's' === candidate || candidate + 's' === targetWord || targetWord + 'ed' === candidate)
  ) {
    return true;
  }

  return false;
}

// Compare target sentence vs student spoken transcript with smart time & number equivalence
export function calculateSentenceMatch(
  target: string,
  spoken: string
): {
  percentage: number;
  wordStatuses: Array<{ word: string; status: 'matched' | 'missed' | 'extra' }>;
} {
  const rawTargetWords = target.split(/\s+/).filter(Boolean);
  if (rawTargetWords.length === 0) {
    return { percentage: 0, wordStatuses: [] };
  }

  const spokenTokens = tokenizeNormalizedWords(spoken);
  const spokenFreq = new Map<string, number>();
  for (const t of spokenTokens) {
    spokenFreq.set(t, (spokenFreq.get(t) || 0) + 1);
  }

  const wordStatuses: Array<{ word: string; status: 'matched' | 'missed' | 'extra' }> = [];
  let matchedCount = 0;

  for (const rawWord of rawTargetWords) {
    const normTokens = tokenizeNormalizedWords(rawWord);
    let allTokensMatched = true;

    if (normTokens.length === 0) {
      allTokensMatched = true;
    } else {
      for (const token of normTokens) {
        // Direct match
        const directCount = spokenFreq.get(token) || 0;
        if (directCount > 0) {
          spokenFreq.set(token, directCount - 1);
          continue;
        }

        // Equivalence / synonym match
        let foundEquivalent = false;
        for (const [candidate, count] of spokenFreq.entries()) {
          if (count > 0 && areWordsEquivalent(token, candidate)) {
            spokenFreq.set(candidate, count - 1);
            foundEquivalent = true;
            break;
          }
        }

        if (!foundEquivalent) {
          allTokensMatched = false;
        }
      }
    }

    if (allTokensMatched) {
      matchedCount++;
      wordStatuses.push({ word: rawWord, status: 'matched' });
    } else {
      wordStatuses.push({ word: rawWord, status: 'missed' });
    }
  }

  const percentage = Math.round((matchedCount / rawTargetWords.length) * 100);
  return { percentage, wordStatuses };
}
