// High-performance Offline Neural Voice support using Kokoro-82M in a dedicated Web Worker
import { inferGender } from './voices';

const STORAGE_KEY_ENABLED = 'toefl_offline_voice_enabled';
const STORAGE_KEY_DOWNLOADED = 'toefl_offline_voice_downloaded';
const STORAGE_KEY_ERROR = 'toefl_offline_voice_last_error';

export const KOKORO_FEMALE_VOICES = [
  'af_heart',
  'af_bella',
  'af_nicole',
  'af_sarah',
  'af_sky',
  'af_alloy',
  'af_aoede',
  'af_jessica',
  'af_kore',
  'af_nova',
  'af_river',
  'bf_emma',
  'bf_isabella',
  'bf_alice',
  'bf_lily',
] as const;

export const KOKORO_MALE_VOICES = [
  'am_adam',
  'am_echo',
  'am_eric',
  'am_fenrir',
  'am_liam',
  'am_michael',
  'am_onyx',
  'am_puck',
  'am_santa',
  'bm_george',
  'bm_lewis',
  'bm_daniel',
  'bm_fable',
] as const;

export function isOfflineVoiceEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY_ENABLED) === 'true';
}

export function setOfflineVoiceEnabled(enabled: boolean): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_ENABLED, enabled ? 'true' : 'false');
}

export function isOfflineVoiceDownloaded(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY_DOWNLOADED) === 'true';
}

export function getOfflineVoiceLastError(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY_ERROR) || null;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function pickOfflineVoice(voiceName: string, gender?: 'female' | 'male' | 'unknown'): string {
  const g = gender && gender !== 'unknown' ? gender : inferGender(voiceName);
  const isMale = g === 'male' || voiceName.toLowerCase().includes('puck') || voiceName.toLowerCase().includes('male');
  const pool = isMale ? KOKORO_MALE_VOICES : KOKORO_FEMALE_VOICES;
  const idx = hashCode(voiceName) % pool.length;
  return pool[idx];
}

export function pickOfflineDialogueVoices(seedStr: string): { A: string; B: string } {
  const seed = hashCode(seedStr);
  const voiceA = KOKORO_FEMALE_VOICES[seed % KOKORO_FEMALE_VOICES.length];
  const voiceB = KOKORO_MALE_VOICES[(seed >> 3) % KOKORO_MALE_VOICES.length];
  return { A: voiceA, B: voiceB };
}

let workerInstance: Worker | null = null;
let currentRequestId = 0;
const pendingRequests = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();
let progressCallbackRef: ((progressPct: number, statusText?: string) => void) | null = null;
let initResolver: ((voices: string[]) => void) | null = null;
let initRejecter: ((err: any) => void) | null = null;

function getWorker(): Worker | null {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    return null;
  }
  if (!workerInstance) {
    try {
      workerInstance = new Worker(new URL('./kokoro.worker.ts', import.meta.url), { type: 'module' });
      workerInstance.onmessage = (e: MessageEvent) => {
        const data = e.data || {};
        if (data.type === 'progress') {
          if (progressCallbackRef) {
            progressCallbackRef(data.progress || 0, data.status || 'downloading');
          }
        } else if (data.type === 'init-success') {
          if (initResolver) {
            initResolver(data.voices || []);
            initResolver = null;
            initRejecter = null;
          }
        } else if (data.type === 'init-error') {
          if (initRejecter) {
            initRejecter(new Error(data.error || 'Failed to initialize Kokoro TTS'));
            initResolver = null;
            initRejecter = null;
          }
        } else if (data.type === 'generate-success') {
          const req = pendingRequests.get(data.id);
          if (req) {
            pendingRequests.delete(data.id);
            req.resolve({ buffer: data.buffer, samplingRate: data.samplingRate });
          }
        } else if (data.type === 'generate-error') {
          const req = pendingRequests.get(data.id);
          if (req) {
            pendingRequests.delete(data.id);
            req.reject(new Error(data.error || 'Failed to generate offline speech'));
          }
        }
      };
      workerInstance.onerror = (err) => {
        console.warn('Kokoro worker runtime error:', err);
        if (initRejecter) {
          initRejecter(new Error(err.message || 'Worker thread failed'));
          initResolver = null;
          initRejecter = null;
        }
      };
    } catch (e) {
      console.warn('Could not spawn kokoro worker:', e);
      return null;
    }
  }
  return workerInstance;
}

export async function downloadOfflineVoice(
  onProgress?: (progressPct: number, statusText?: string) => void
): Promise<{ success: boolean; error?: string }> {
  try {
    const worker = getWorker();
    if (!worker) {
      throw new Error('Web Workers are not supported in this environment.');
    }

    progressCallbackRef = onProgress || null;

    const initPromise = new Promise<string[]>((resolve, reject) => {
      initResolver = resolve;
      initRejecter = reject;
    });

    worker.postMessage({ type: 'init' });
    await initPromise;

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_DOWNLOADED, 'true');
      localStorage.setItem(STORAGE_KEY_ENABLED, 'true');
      localStorage.removeItem(STORAGE_KEY_ERROR);
    }
    return { success: true };
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.warn('Offline voice setup failed:', msg);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_DOWNLOADED, 'false');
      localStorage.setItem(STORAGE_KEY_ENABLED, 'false');
      localStorage.setItem(STORAGE_KEY_ERROR, msg);
    }
    return { success: false, error: msg };
  } finally {
    progressCallbackRef = null;
  }
}

export async function removeOfflineVoice(): Promise<void> {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY_DOWNLOADED);
    localStorage.setItem(STORAGE_KEY_ENABLED, 'false');
    localStorage.removeItem(STORAGE_KEY_ERROR);
  }
  if (workerInstance) {
    try {
      workerInstance.terminate();
    } catch {}
    workerInstance = null;
  }
}

export async function generateOfflineSpeech(
  text: string,
  voiceName?: string
): Promise<{ arrayBuffer: ArrayBuffer; mimeType: string }> {
  if (!isOfflineVoiceDownloaded()) {
    throw new Error('Offline voice model is not downloaded. Download in Settings.');
  }

  const worker = getWorker();
  if (!worker) {
    throw new Error('Web Workers are not supported in this browser.');
  }

  const chosenVoice = pickOfflineVoice(voiceName || 'Kore');
  const id = ++currentRequestId;

  return new Promise<{ arrayBuffer: ArrayBuffer; mimeType: string }>((resolve, reject) => {
    pendingRequests.set(id, {
      resolve: (res) => resolve({ arrayBuffer: res.buffer, mimeType: 'audio/wav' }),
      reject,
    });
    worker.postMessage({
      type: 'generate',
      id,
      text,
      voice: chosenVoice,
    });
  });
}

export async function testOfflineVoice(): Promise<{ success: boolean; message: string }> {
  try {
    if (!isOfflineVoiceDownloaded()) {
      return { success: false, message: 'Offline voice model is not downloaded. Click "Download Offline Voice" first.' };
    }
    const res = await generateOfflineSpeech('Hello, offline speech synthesis is verified and working.');
    const { getAudioContext, playDecodedSpeech } = await import('./audioSpeech');
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }
    const audioBuffer = await ctx.decodeAudioData(res.arrayBuffer.slice(0));
    await playDecodedSpeech(audioBuffer);
    return { success: true, message: 'Offline voice played successfully!' };
  } catch (err: any) {
    const msg = err?.message || String(err);
    return { success: false, message: msg };
  }
}
