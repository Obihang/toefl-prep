import { getApiHeaders, getStoredProvider, getStoredApiKey, getStoredVoiceKey } from './apiKey';
import { isRiffWav, parseSampleRateFromMime, stitchTranscripts } from './audioHelpers';
import { inferGender } from './voices';
import {
  recordVoiceEngineFailure,
  recordVoiceEngineSuccess,
  resetVoiceEngineFailureCounts,
} from './voiceDiagnostics';

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

const dbPromise =
  typeof window !== 'undefined' && 'indexedDB' in window
    ? openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          db.createObjectStore(STORE_NAME);
        },
      })
    : Promise.resolve(null as any);

const audioBufferMemoryCache = new Map<string, AudioBuffer>();

// Pre-fetch speech audio silently in the background
export async function prefetchSpeechAudio(text: string, voiceName: string = 'Kore'): Promise<void> {
  if (typeof window === 'undefined') return;
  let cleanText = text.trim();
  const colonIdx = cleanText.indexOf(':');
  if (colonIdx > 0 && colonIdx < 35) {
    cleanText = cleanText.substring(colonIdx + 1).trim();
  }
  if (!cleanText) return;

  const provider = getStoredProvider();
  const cacheKey = `cache_${provider}_${voiceName}_${cleanText}`;

  if (audioBufferMemoryCache.has(cacheKey)) return;

  try {
    const db = await dbPromise;
    if (db) {
      const cached = await db.get(STORE_NAME, cacheKey);
      if (cached && cached.base64) {
        const { audioBuffer } = await decodeSpeech(cached.base64, cached.mimeType || 'audio/wav');
        audioBufferMemoryCache.set(cacheKey, audioBuffer);
        return;
      }
    }
  } catch {}

  const hasKey = !!(getStoredApiKey('gemini') || getStoredApiKey('groq') || getStoredApiKey('openrouter') || getStoredApiKey() || getStoredVoiceKey());
  if (hasKey && !isTtsCircuitBreakerBlocked()) {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({ text: cleanText, voiceName }),
      });
      const json = await res.json();
      if (res.ok && json.success && json.audioBase64) {
        incrementTtsQuota();
        const { audioBuffer } = await decodeSpeech(json.audioBase64, json.mimeType || 'audio/wav');
        audioBufferMemoryCache.set(cacheKey, audioBuffer);
        try {
          const db = await dbPromise;
          await db.put(STORE_NAME, { base64: json.audioBase64, mimeType: json.mimeType, engine: provider }, cacheKey);
        } catch {}
      }
    } catch {}
  }
}

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
    const prevSrc = activeHtmlAudio.dataset.blobUrl || activeHtmlAudio.src || '';
    const prevIsBlob = activeHtmlAudio.dataset.isBlobUrl === 'true';
    try {
      activeHtmlAudio.pause();
      activeHtmlAudio.currentTime = 0;
      activeHtmlAudio.src = '';
    } catch {
      // Ignored
    }
    if (prevIsBlob && prevSrc) {
      try {
        URL.revokeObjectURL(prevSrc);
      } catch {}
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

  // Stop active Web Audio source node if playing
  if (activeSourceNode) {
    try {
      activeSourceNode.stop();
      activeSourceNode.disconnect();
    } catch {}
    activeSourceNode = null;
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

let globalAudioCtx: AudioContext | null = null;
let activeSourceNode: AudioBufferSourceNode | null = null;

export function getAudioContext(): AudioContext {
  if (!globalAudioCtx && typeof window !== 'undefined') {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      globalAudioCtx = new AudioCtx();
    }
  }
  return globalAudioCtx!;
}

export async function decodeSpeech(
  base64: string,
  mimeType: string = 'audio/wav'
): Promise<{ audioBuffer: AudioBuffer; sampleRate: number }> {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {}
  }

  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    bytes[i] = byteChars.charCodeAt(i);
  }

  const sampleRate = parseSampleRateFromMime(mimeType, 24000);
  const first4Hex = Array.from(bytes.slice(0, 4)).map((b) => b.toString(16).padStart(2, '0')).join(' ');
  console.log(`[decodeSpeech] mimeType=${mimeType}, byteLen=${bytes.byteLength}, first4=${first4Hex}, sampleRate=${sampleRate}, isRiff=${isRiffWav(bytes)}`);

  // Raw PCM / L16 without RIFF header
  if ((mimeType.includes('pcm') || mimeType.includes('L16')) && !isRiffWav(bytes)) {
    const numSamples = Math.floor(bytes.byteLength / 2);
    const audioBuffer = ctx.createBuffer(1, numSamples, sampleRate);
    const channelData = audioBuffer.getChannelData(0);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    for (let i = 0; i < numSamples; i++) {
      const int16 = view.getInt16(i * 2, true); // little endian
      channelData[i] = int16 / 32768.0;
    }
    return { audioBuffer, sampleRate };
  }

  // RIFF WAV, MP3, OGG, WEBM via decodeAudioData
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  return { audioBuffer, sampleRate: audioBuffer.sampleRate };
}

function unlockAudioOnFirstUserGesture() {
  if (typeof window === 'undefined') return;
  try {
    const ctx = getAudioContext();
    if (ctx) {
      ctx.resume().catch(() => {});
      const silentBuffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = silentBuffer;
      source.connect(ctx.destination);
      source.start(0);
    }
  } catch {}
  window.removeEventListener('click', unlockAudioOnFirstUserGesture, true);
  window.removeEventListener('keydown', unlockAudioOnFirstUserGesture, true);
  window.removeEventListener('touchstart', unlockAudioOnFirstUserGesture, true);
}

if (typeof window !== 'undefined') {
  window.addEventListener('click', unlockAudioOnFirstUserGesture, true);
  window.addEventListener('keydown', unlockAudioOnFirstUserGesture, true);
  window.addEventListener('touchstart', unlockAudioOnFirstUserGesture, true);
}

export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;
  const numSamples = buffer.length;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const bufferLength = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  // RIFF chunk descriptor
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + dataSize, true); // size - 8
  view.setUint32(8, 0x57415645, false); // "WAVE"
  // fmt subchunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, byteRate, true); // ByteRate
  view.setUint16(32, blockAlign, true); // BlockAlign
  view.setUint16(34, bitDepth, true); // BitsPerSample
  // data subchunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, dataSize, true); // Subchunk2Size

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      let sample = buffer.getChannelData(channel)[i];
      sample = Math.max(-1, Math.min(1, sample));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

export async function playDecodedSpeech(
  audioBuffer: AudioBuffer,
  onEnd?: () => void,
  rawBlob?: Blob
): Promise<void> {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {}
  }

  // Fallback to HTMLAudioElement if Web Audio context is not running
  if (!ctx || ctx.state !== 'running') {
    return new Promise<void>((resolve, reject) => {
      try {
        const blob = rawBlob || audioBufferToWavBlob(audioBuffer);
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        activeHtmlAudio = audio;
        audio.dataset.isBlobUrl = 'true';

        let finished = false;
        const durationSec = audioBuffer?.duration || 1.5;
        const timeoutMs = Math.round(durationSec * 1000) + 1500;

        const cleanup = () => {
          if (finished) return;
          finished = true;
          clearTimeout(safetyTimer);
          URL.revokeObjectURL(url);
          if (activeHtmlAudio === audio) activeHtmlAudio = null;
          onEnd?.();
          resolve();
        };

        const safetyTimer = setTimeout(cleanup, timeoutMs);
        audio.onended = cleanup;
        audio.onerror = () => {
          cleanup();
          reject(new Error('HTMLAudioElement error during playback'));
        };

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            cleanup();
            reject(new Error(`HTMLAudioElement play failed: ${err?.message || err}`));
          });
        }
      } catch (err: any) {
        reject(new Error(`Fallback audio play error: ${err?.message || err}`));
      }
    });
  }

  if (activeSourceNode) {
    try {
      activeSourceNode.stop();
      activeSourceNode.disconnect();
    } catch {}
    activeSourceNode = null;
  }

  const sourceNode = ctx.createBufferSource();
  sourceNode.buffer = audioBuffer;
  sourceNode.connect(ctx.destination);
  activeSourceNode = sourceNode;

  return new Promise<void>((resolve, reject) => {
    let finished = false;
    const durationSec = audioBuffer.duration || 1;
    const timeoutMs = Math.round(durationSec * 1000) + 1500;

    const cleanup = () => {
      if (finished) return;
      finished = true;
      clearTimeout(safetyTimer);
      try {
        sourceNode.disconnect();
      } catch {}
      if (activeSourceNode === sourceNode) {
        activeSourceNode = null;
      }
      onEnd?.();
      resolve();
    };

    // Never wait only for onended: resolve after audioBuffer.duration + 1.5 s,
    // and if the context is still not running report "Audio did not start"
    const safetyTimer = setTimeout(() => {
      if (ctx.state !== 'running') {
        cleanup();
        reject(new Error('Audio did not start'));
        return;
      }
      cleanup();
    }, timeoutMs);

    sourceNode.onended = cleanup;
    try {
      sourceNode.start(0);
    } catch (err) {
      clearTimeout(safetyTimer);
      finished = true;
      reject(err);
    }
  });
}

// Persistent Microphone Stream Retention
let activeMicStream: MediaStream | null = null;
let micIdleTimer: any = null;

function resetMicIdleTimer() {
  if (micIdleTimer) clearTimeout(micIdleTimer);
  micIdleTimer = setTimeout(() => {
    releaseMicStream();
  }, 60000);
}

function handleMicVisibilityChange() {
  if (document.hidden) {
    releaseMicStream();
  }
}

export async function getMicStream(): Promise<MediaStream> {
  if (activeMicStream && activeMicStream.active) {
    resetMicIdleTimer();
    return activeMicStream;
  }

  activeMicStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleMicVisibilityChange);
    document.addEventListener('visibilitychange', handleMicVisibilityChange);
  }

  resetMicIdleTimer();
  return activeMicStream;
}

export function releaseMicStream() {
  if (micIdleTimer) clearTimeout(micIdleTimer);
  if (activeMicStream) {
    try {
      activeMicStream.getTracks().forEach((track) => track.stop());
    } catch {}
    activeMicStream = null;
  }
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

export function isTtsCircuitBreakerBlocked(): boolean {
  if (typeof localStorage === 'undefined') return false;
  const { blockedUntil } = getTtsQuotaData();
  return Date.now() < blockedUntil;
}

export function getTtsUsageCount(): number {
  return parseInt(localStorage.getItem(TTS_SUCCESS_COUNT_KEY) || '0', 10);
}

// Fetch Cloud Audio from /api/tts via Gemini with in-memory & IndexedDB caching
export async function fetchAudioBlob(text: string, voiceName: string = 'Kore'): Promise<Blob> {
  const cacheKey = `${voiceName}:::${text}`;
  const db = await dbPromise;
  
  // Check cache
  if (db) {
    const cachedBlob = await db.get(STORE_NAME, cacheKey);
    if (cachedBlob) {
      return cachedBlob;
    }
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
    const prevSrc = activeHtmlAudio.dataset.blobUrl || activeHtmlAudio.src || '';
    const prevIsBlob = activeHtmlAudio.dataset.isBlobUrl === 'true';
    try {
      activeHtmlAudio.pause();
      activeHtmlAudio.currentTime = 0;
      activeHtmlAudio.src = '';
    } catch {}
    if (prevIsBlob && prevSrc) {
      try {
        URL.revokeObjectURL(prevSrc);
      } catch {}
    }
    activeHtmlAudio = null;
  }

  isAudioPlayingState = true;
  const audio = new Audio(dataUri);
  audio.dataset.isBlobUrl = isBlobUrl ? 'true' : 'false';
  audio.dataset.blobUrl = dataUri;
  activeHtmlAudio = audio;

  return new Promise<void>((resolve, reject) => {
    let finished = false;
    let wasStoppedByUser = false;

    const cleanup = (isError = false, errorObj?: any) => {
      if (finished) return;
      finished = true;
      isAudioPlayingState = false;
      activeAudioCancel = null;

      const targetSrc = audio.dataset.blobUrl || audio.src || '';
      const isBlob = audio.dataset.isBlobUrl === 'true';

      try {
        audio.pause();
        audio.currentTime = 0;
        audio.src = '';
      } catch {}

      if (isBlob && targetSrc) {
        try {
          URL.revokeObjectURL(targetSrc);
        } catch {}
      }

      if (activeHtmlAudio === audio) {
        activeHtmlAudio = null;
      }

      if (isError && !wasStoppedByUser) {
        reject(errorObj || new Error('Audio playback failed'));
      } else {
        resolve();
      }
    };

    activeAudioCancel = () => {
      wasStoppedByUser = true;
      cleanup(false);
    };

    audio.onended = () => cleanup(false);
    audio.onerror = (e) => cleanup(true, e || new Error('HTML Audio error event fired'));

    audio.play().catch((err) => {
      if (!wasStoppedByUser) {
        console.warn('Audio play() failed:', err);
        cleanup(true, err);
      } else {
        cleanup(false);
      }
    });
  });
}

export interface PlaySpeechOptions {
  voiceName?: string;
  speaker?: string;
  rate?: number;
  onEngineDetected?: (engineLabel: string) => void;
  onStatus?: (statusLabel: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: any) => void;
  sessionId?: number;
  skipStop?: boolean;
}

export async function playSpeech(
  text: string,
  options: PlaySpeechOptions = {}
): Promise<void> {
  if (!options.skipStop) {
    stopSpeaking();
  }
  isAudioPlayingState = true;
  const currentSession = options.sessionId ?? ++currentDialogueSessionId;

  const provider = getStoredProvider();
  const voiceName = options.voiceName || 'Kore';
  let cleanText = text.trim();
  const colonIdx = cleanText.indexOf(':');
  if (colonIdx > 0 && colonIdx < 35) {
    cleanText = cleanText.substring(colonIdx + 1).trim();
  }

  const engine = getVoiceEngine();
  const hasKey = !!(getStoredApiKey() || getStoredVoiceKey());
  const breakerBlocked = isTtsCircuitBreakerBlocked();

  // Helper 1: Try Cloud Voice
  const tryCloud = async (): Promise<{ ok: boolean; reason?: string; cancelled?: boolean }> => {
    if (!hasKey) {
      const reason = 'No API key configured for Cloud voice.';
      console.warn(`Cloud voice skipped: ${reason}`);
      return { ok: false, reason };
    }
    if (breakerBlocked) {
      const reason = 'Cloud voice: daily limit reached.';
      console.warn(`Cloud voice skipped: ${reason}`);
      return { ok: false, reason };
    }

    // Check IndexedDB cache first
    const cacheKey = `cache_${provider}_${voiceName}_${cleanText}`;
    try {
      const db = await dbPromise;
      const cached = await db.get(STORE_NAME, cacheKey);
      if (cached && cached.base64) {
        const { audioBuffer } = await decodeSpeech(cached.base64, cached.mimeType || 'audio/wav');
        if (isAudioPlayingState && currentDialogueSessionId === currentSession) {
          options.onStatus?.(`Voice: Cached (${cached.engine || 'Cloud'})`);
          options.onEngineDetected?.(`Voice: Cached (${cached.engine || 'Cloud'})`);
          options.onStart?.();
          await playDecodedSpeech(audioBuffer, options.onEnd);
          return { ok: true };
        }
      }
    } catch {}

    // Cloud fetch with 20 second timeout
    options.onStatus?.('Generating voice...');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({ text: cleanText, voiceName }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      const json = await res.json();
      if (res.status === 429) {
        const retryAfter = (json.rateLimit?.retryAfterSeconds || 60) * 1000;
        const blockDuration = Math.min(retryAfter + 5000, 60000);
        localStorage.setItem(TTS_BLOCKED_UNTIL_KEY, (Date.now() + blockDuration).toString());
        const reason = 'Cloud voice: daily limit reached.';
        console.warn(reason);
        return { ok: false, reason };
      }

      if (!res.ok || !json.success || !json.audioBase64) {
        const reason = json.error || 'Cloud voice synthesis failed.';
        console.warn(`Cloud voice error: ${reason}`);
        return { ok: false, reason };
      }

      incrementTtsQuota();
      const engineName = provider === 'groq' ? 'Groq' : 'Gemini';

      // Always decode and cache immediately so late results are never discarded!
      const { audioBuffer } = await decodeSpeech(json.audioBase64, json.mimeType || 'audio/wav');
      try {
        const db = await dbPromise;
        await db.put(STORE_NAME, { base64: json.audioBase64, mimeType: json.mimeType, engine: engineName }, cacheKey);
      } catch {}

      // If user is still on this sentence, play it!
      if (isAudioPlayingState && currentDialogueSessionId === currentSession) {
        options.onStatus?.(`Voice: ${engineName}`);
        options.onEngineDetected?.(`Voice: ${engineName}`);
        options.onStart?.();
        try {
          await playDecodedSpeech(audioBuffer, options.onEnd);
          return { ok: true };
        } catch (playErr: any) {
          const reason = `Cloud playback failed: ${playErr?.message || playErr}`;
          console.warn(reason);
          return { ok: false, reason };
        }
      }
      return { ok: false, reason: 'Session cancelled or changed', cancelled: true };
    } catch (err: any) {
      clearTimeout(timer);
      const isTimeout = err?.name === 'AbortError' || String(err).includes('abort');
      const reason = isTimeout ? 'Cloud voice: request timed out after 20 seconds.' : (err?.message || 'Cloud voice unavailable.');
      console.warn(`Cloud voice failed: ${reason}`);
      return { ok: false, reason };
    }
  };

  // Helper 2: Try Device Voice
  const tryDevice = async (): Promise<{ ok: boolean; reason?: string; cancelled?: boolean }> => {
    let voices = getVoices();
    if (voices.filter((v) => v.lang.toLowerCase().startsWith('en')).length === 0) {
      await new Promise((r) => {
        const t = setTimeout(r, 1500);
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.onvoiceschanged = () => {
            clearTimeout(t);
            r(null);
          };
        }
      });
      voices = getVoices();
    }

    const englishVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
    if (englishVoices.length === 0) {
      const reason = 'Device voice: no English voices found.';
      console.warn(reason);
      return { ok: false, reason };
    }

    try {
      const g = inferGender(voiceName);
      const gender = g === 'male' ? 'male' : 'female';
      const voiceObj = pickBrowserVoiceForGender(gender) || englishVoices[0];

      if (isAudioPlayingState && currentDialogueSessionId === currentSession) {
        options.onStart?.();
        await speakScriptLineFallback(cleanText, 1.0, voiceObj);
        options.onEnd?.();
        return { ok: true };
      }
      return { ok: false, reason: 'Session cancelled or changed', cancelled: true };
    } catch (err: any) {
      const reason = `Device voice error: ${err?.message || err}`;
      console.warn(reason);
      return { ok: false, reason };
    }
  };

  const policy = getVoiceFallbackPolicy();
  const stepOrder: Array<'cloud' | 'device'> = [];
  if (hasKey && !breakerBlocked) {
    stepOrder.push('cloud');
  }
  const englishCount = getVoices().filter((v) => v.lang.toLowerCase().startsWith('en')).length;
  if (englishCount > 0) {
    stepOrder.push('device');
  }

  const engineFailures: Record<string, string> = {};

  for (let i = 0; i < stepOrder.length; i++) {
    if (!isAudioPlayingState || currentDialogueSessionId !== currentSession) break;

    const step = stepOrder[i];
    let result: { ok: boolean; reason?: string; cancelled?: boolean } = { ok: false };
    const label = step === 'cloud' ? 'Cloud' : 'Device';

    if (step === 'cloud') {
      result = await tryCloud();
      if (!result.cancelled) {
        if (result.ok) {
          recordVoiceEngineSuccess();
        } else {
          recordVoiceEngineFailure('cloud', result.reason);
        }
      }
    } else if (step === 'device') {
      result = await tryDevice();
      if (result.ok) {
        recordVoiceEngineSuccess();
      }
    }

    if (!isAudioPlayingState || currentDialogueSessionId !== currentSession || result.cancelled) {
      return;
    }

    if (result.ok) {
      if (Object.keys(engineFailures).length > 0) {
        const firstFailedEng = Object.keys(engineFailures)[0];
        const firstReason = engineFailures[firstFailedEng];
        const fallbackMsg = `Selected voice: ${firstFailedEng}. Failed: ${firstReason}. Fallback used: ${label}.`;
        options.onStatus?.(fallbackMsg);
        options.onEngineDetected?.(fallbackMsg);
      } else {
        const successMsg = `Voice used: ${label}`;
        options.onStatus?.(successMsg);
        options.onEngineDetected?.(successMsg);
      }
      return;
    } else {
      if (result.reason) {
        engineFailures[label] = result.reason;
      }
      if (policy === 'strict') {
        break;
      }
    }
  }

  // If no step can speak: show all engine failure reasons
  console.warn('All voice synthesis methods failed or unavailable.');
  const details = Object.keys(engineFailures).length > 0
    ? Object.entries(engineFailures).map(([eng, r]) => `${eng}: ${r}`).join(' | ')
    : 'No speech voices found.';
  const finalMsg = policy === 'strict'
    ? `Strict selected engine failed. Reason: ${details}`
    : `Engines tried: [${stepOrder.join(', ')}]. Reasons: ${details}`;
  options.onStatus?.(finalMsg);
  options.onEngineDetected?.(finalMsg);
  options.onError?.(new Error(finalMsg));
  options.onEnd?.();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('toefl_no_voice_available'));
  }
}

// Browser fallback speech synthesis
function speakScriptLineFallback(text: string, pitch = 1.0, browserVoice?: SpeechSynthesisVoice | null): Promise<void> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let finished = false;
    let wasStoppedByUser = false;
    let currentUtt: SpeechSynthesisUtterance | null = null;
    let safetyTimer: any = null;

    const cleanup = (hasError = false, err?: any) => {
      if (finished) return;
      finished = true;
      if (safetyTimer) clearTimeout(safetyTimer);
      activeFallbackCancel = null;
      if (currentUtt) {
        activeUtterances.delete(currentUtt);
      }
      if (hasError && !wasStoppedByUser) {
        reject(err || new Error('Browser speech synthesis error'));
      } else {
        resolve();
      }
    };

    activeFallbackCancel = () => {
      wasStoppedByUser = true;
      try {
        window.speechSynthesis.cancel();
      } catch {}
      cleanup(false);
    };

    // Safety timeout in case browser speech synthesis hangs
    const maxDuration = Math.max(3500, text.length * 100);
    safetyTimer = setTimeout(() => cleanup(true, new Error('Browser speech synthesis timeout')), maxDuration);

    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      const utt = new SpeechSynthesisUtterance(text);
      currentUtt = utt;
      activeUtterances.add(utt);
      utt.lang = 'en-US';

      // Firefox speech engines distort if pitch/rate are modified
      const isFirefox = typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent);
      utt.rate = isFirefox ? 1.0 : 0.95;
      utt.pitch = isFirefox ? 1.0 : pitch;

      if (browserVoice) {
        const availableVoices = window.speechSynthesis.getVoices();
        const matched = availableVoices.find((v) => v.name === browserVoice.name || v.voiceURI === browserVoice.voiceURI);
        if (matched) {
          utt.voice = matched;
        }
      }

      utt.onend = () => cleanup(false);
      utt.onerror = (e) => cleanup(true, e);

      // Handle Chrome speech engine state cleanly
      window.speechSynthesis.resume();
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        setTimeout(() => {
          try {
            window.speechSynthesis.resume();
            window.speechSynthesis.speak(utt);
          } catch (speakErr) {
            cleanup(true, speakErr);
          }
        }, 60);
      } else {
        window.speechSynthesis.speak(utt);
      }
    } catch (ex) {
      cleanup(true, ex);
    }
  });
}

export type VoiceEngine = 'auto' | 'cloud' | 'device' | 'offline';

export function getVoiceEngine(): VoiceEngine {
  if (typeof localStorage === 'undefined') return 'auto';
  const stored = localStorage.getItem('toefl_voice_engine');
  if (!stored) return 'auto';
  if (stored === 'gemini') return 'cloud';
  if (stored === 'auto' || stored === 'cloud' || stored === 'device' || stored === 'offline') {
    return stored;
  }
  return 'auto';
}

export function setVoiceEngine(engine: VoiceEngine) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('toefl_voice_engine', engine);
    window.dispatchEvent(new CustomEvent('toefl_voice_engine_changed', { detail: { engine } }));
  }
  resetVoiceEngineFailureCounts();
}

export type VoiceFallbackPolicy = 'fallback' | 'strict';

export function getVoiceFallbackPolicy(): VoiceFallbackPolicy {
  if (typeof localStorage === 'undefined') return 'fallback';
  return (localStorage.getItem('toefl_voice_fallback_policy') as VoiceFallbackPolicy) || 'fallback';
}

export function setVoiceFallbackPolicy(policy: VoiceFallbackPolicy) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('toefl_voice_fallback_policy', policy);
  }
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

// Speak single line with unified playSpeech pipeline
export async function speakScriptLine(
  text: string,
  options: {
    rate?: number;
    pitch?: number;
    voiceName?: string;
    browserVoice?: SpeechSynthesisVoice | null;
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (err: any) => void;
    onStatus?: (status: string) => void;
    onEngineDetected?: (engine: string) => void;
  } = {}
): Promise<void> {
  const defaultVoice = options.pitch && options.pitch < 0.95 ? 'Puck' : 'Kore';
  const voice = options.voiceName || defaultVoice;
  return playSpeech(text, {
    voiceName: voice,
    onStart: options.onStart,
    onEnd: options.onEnd,
    onError: options.onError,
    onStatus: options.onStatus,
    onEngineDetected: options.onEngineDetected,
  });
}

// Play multi-line dialogue line by line in order using unified playSpeech pipeline
export async function playDialogue(
  lines: string[],
  voiceMapping: { A: string; B: string } = { A: 'Puck', B: 'Kore' },
  onLineChange?: (lineIndex: number) => void,
  options: {
    onStatus?: (status: string) => void;
    onEnd?: () => void;
  } = {}
): Promise<void> {
  stopSpeaking();
  isAudioPlayingState = true;
  const currentSession = ++currentDialogueSessionId;

  for (let i = 0; i < lines.length; i++) {
    if (!isAudioPlayingState || currentDialogueSessionId !== currentSession) break;

    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    onLineChange?.(i);

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

    await playSpeech(cleanText, {
      voiceName: voiceToUse,
      sessionId: currentSession,
      skipStop: true,
      onStatus: options.onStatus,
      onEngineDetected: options.onStatus,
    });

    if (!isAudioPlayingState || currentDialogueSessionId !== currentSession) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  if (currentDialogueSessionId === currentSession) {
    isAudioPlayingState = false;
    options.onEnd?.();
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
