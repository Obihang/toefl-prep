/**
 * Client-Side Local Whisper STT Engine using @xenova/transformers@2.17.2 inside a Web Worker.
 * Dynamically loaded from CDN inside an inline Blob module Web Worker.
 * 100% Zero-API offline automatic speech recognition for Brave and all modern browsers.
 *
 * Upgraded Features:
 * - Dynamic Hardware-Aware WASM Thread Scaling (auto-detects logical cores).
 * - Soft-Knee Noise Gate preserving quiet speech and soft consonants (/s/, /t/, /f/).
 * - 400ms boundary silence padding.
 * - Acoustic Hesitation & Filler Word Detection ("um", "uh", "er", "ah", "hmm", "like", "you know").
 * - Background Web Worker running WASM inference off the main React UI thread with 25s timeout.
 */

import { alignHomophonesAndPhonetics } from './phoneticMatcher';

export type WhisperModelChoice = 'Xenova/whisper-small.en' | 'Xenova/whisper-base.en' | 'Xenova/whisper-tiny.en';

export interface WhisperModelInfo {
  id: WhisperModelChoice;
  name: string;
  badge: string;
  sizeMb: number;
  estSpeed: string;
  accuracy: string;
  recommended?: boolean;
}

export const WHISPER_MODELS: WhisperModelInfo[] = [
  {
    id: 'Xenova/whisper-tiny.en',
    name: 'Whisper Tiny (Light)',
    badge: 'Light ~40 MB',
    sizeMb: 40,
    estSpeed: '~2s response',
    accuracy: 'Fastest (~2s), basic accuracy for clear speech',
  },
  {
    id: 'Xenova/whisper-base.en',
    name: 'Whisper Base (Balanced - Recommended)',
    badge: 'Balanced ~75 MB',
    sizeMb: 75,
    estSpeed: '~3–4s response',
    accuracy: 'Fast (~3s), excellent accuracy for international accents',
    recommended: true,
  },
  {
    id: 'Xenova/whisper-small.en',
    name: 'Whisper Small (Heavy - High Accuracy)',
    badge: 'Heavy ~245 MB',
    sizeMb: 245,
    estSpeed: '~5–7s response',
    accuracy: 'Best accuracy for South Asian / international accents & TOEFL vocabulary',
  },
];

const FILLER_WORDS = new Set([
  'um',
  'uh',
  'erm',
  'er',
  'ah',
  'hmm',
  'like',
  'you know',
  'basically',
  'actually',
]);

export interface LocalWordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface LocalSpeakingMetrics {
  wpm: number;
  pauseCount: number;
  longestPause: number;
  totalPausesDuration: number;
  fillerWords: string[];
  fillerCount: number;
  wordCount: number;
  durationSeconds: number;
  acousticHesitations?: number;
}

export interface LocalWhisperResult {
  transcript: string;
  rawTranscript: string;
  words: LocalWordTimestamp[];
  durationMs: number;
  metrics: LocalSpeakingMetrics;
}

export interface VADAudioAnalysis {
  trimmedAudio: Float32Array;
  activeSpeakingTimeSeconds: number;
  pauseCount: number;
  longestPauseSeconds: number;
  totalPauseDurationSeconds: number;
  originalDurationSeconds: number;
  acousticHesitationStalls: number;
}

export interface ModelDownloadProgress {
  modelId: string;
  status: 'idle' | 'downloading' | 'verifying' | 'ready' | 'error';
  progress: number; // 0–100%
  file?: string;
  loadedMb?: number;
  totalMb?: number;
  error?: string;
}

export interface HardwareThreadInfo {
  logicalCores: number;
  autoThreads: number;
  activeThreads: number;
  isManual: boolean;
}

/**
 * Detect logical cores and compute hardware-aware optimal WASM threads.
 */
export function getOptimalWasmThreads(): HardwareThreadInfo {
  const logicalCores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
  const autoThreads = logicalCores <= 2 ? 1
    : logicalCores <= 4 ? 2
    : Math.min(12, Math.max(2, Math.floor(logicalCores * 0.65)));

  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('whisper_wasm_threads');
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= logicalCores) {
        return { logicalCores, autoThreads, activeThreads: parsed, isManual: true };
      }
    }
  }

  const isIsolated = typeof self !== 'undefined' && self.crossOriginIsolated;
  const activeThreads = isIsolated ? autoThreads : Math.min(4, autoThreads);
  return { logicalCores, autoThreads, activeThreads, isManual: false };
}

export function setWasmThreadsOverride(threads: number | 'auto') {
  if (typeof localStorage !== 'undefined') {
    if (threads === 'auto') {
      localStorage.removeItem('whisper_wasm_threads');
    } else {
      localStorage.setItem('whisper_wasm_threads', threads.toString());
    }
  }
  if (workerInstance) {
    workerInstance.postMessage({ type: 'RESET', id: `req_reset_threads_${Date.now()}` });
  }
}

let isWorkerBusyState = false;

export function isWhisperWorkerBusy(): boolean {
  return isWorkerBusyState;
}

export function getWhisperModelChoice(): WhisperModelChoice {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('preferred_whisper_model') as WhisperModelChoice;
    if (saved && WHISPER_MODELS.some((m) => m.id === saved)) {
      return saved;
    }
  }
  const logicalCores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
  if (logicalCores <= 4) {
    return 'Xenova/whisper-tiny.en';
  }
  return 'Xenova/whisper-base.en';
}

export function setWhisperModelChoice(choice: WhisperModelChoice) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('preferred_whisper_model', choice);
  }
}

/**
 * Worker script string using @xenova/transformers@2.17.2 from CDN.
 * Dynamic hardware thread scaling + capped max_new_tokens.
 */
const WORKER_SCRIPT = `
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

env.allowLocalModels = false;
env.useBrowserCache = true;

let currentTranscriber = null;
let currentModelId = null;

self.onmessage = async (e) => {
  const { type, id, payload } = e.data;

  if (type === 'RESET') {
    currentTranscriber = null;
    currentModelId = null;
    if (id) self.postMessage({ type: 'RESET_COMPLETE', id });
    return;
  }

  if (type === 'DOWNLOAD_AND_WARMUP') {
    const { modelId, numThreads } = payload;
    try {
      if (env && env.wasm) {
        env.wasm.numThreads = numThreads || 4;
      }

      const fileProgress = {};
      const transcriber = await pipeline('automatic-speech-recognition', modelId, {
        quantized: true,
        progress_callback: (p) => {
          if (p.file) {
            fileProgress[p.file] = {
              loaded: p.loaded || 0,
              total: p.total || 0,
            };
          }

          let totalLoaded = 0;
          let totalSize = 0;
          for (const f of Object.values(fileProgress)) {
            totalLoaded += f.loaded;
            totalSize += f.total;
          }

          const overallPct = totalSize > 0 ? Math.min(99, Math.round((totalLoaded / totalSize) * 100)) : p.progress ? Math.round(p.progress) : 0;
          const loadedMb = Math.round((totalLoaded / (1024 * 1024)) * 10) / 10;
          const totalMb = Math.round((totalSize / (1024 * 1024)) * 10) / 10;

          self.postMessage({
            type: 'PROGRESS',
            id,
            payload: {
              modelId,
              status: 'downloading',
              progress: overallPct,
              file: p.file || 'model weights',
              loadedMb,
              totalMb,
            },
          });
        },
      });

      self.postMessage({
        type: 'PROGRESS',
        id,
        payload: {
          modelId,
          status: 'verifying',
          progress: 99,
          file: 'Verifying WASM pipeline execution in Web Worker...',
        },
      });

      // Warmup with a 0.5-second test buffer
      const testBuffer = new Float32Array(8000);
      await transcriber(testBuffer, {
        return_timestamps: false,
        chunk_length_s: 30,
        stride_length_s: 5,
        temperature: 0,
        max_new_tokens: 16,
      });

      currentTranscriber = transcriber;
      currentModelId = modelId;

      self.postMessage({
        type: 'WARMUP_COMPLETE',
        id,
        payload: { modelId },
      });
    } catch (err) {
      self.postMessage({
        type: 'ERROR',
        id,
        payload: { error: err.message || String(err) },
      });
    }
  } else if (type === 'TRANSCRIBE') {
    const { audioData, modelId, durationSec, numThreads } = payload;
    try {
      if (env && env.wasm) {
        env.wasm.numThreads = numThreads || 4;
      }

      if (!currentTranscriber || currentModelId !== modelId) {
        self.postMessage({
          type: 'PROGRESS',
          id,
          payload: { status: 'loading', message: 'Loading model into Web Worker...' },
        });

        const transcriber = await pipeline('automatic-speech-recognition', modelId, {
          quantized: true,
        });
        currentTranscriber = transcriber;
        currentModelId = modelId;
      }

      self.postMessage({
        type: 'PROGRESS',
        id,
        payload: { status: 'transcribing', message: 'Running WASM Whisper inference...' },
      });

      const max_new_tokens = Math.min(64, Math.max(16, Math.ceil(durationSec * 4.5)));

      const output = await currentTranscriber(audioData, {
        return_timestamps: false,
        chunk_length_s: 30,
        stride_length_s: 5,
        temperature: 0,
        max_new_tokens,
      });

      self.postMessage({
        type: 'TRANSCRIBE_COMPLETE',
        id,
        payload: { text: output.text || '' },
      });
    } catch (err) {
      self.postMessage({
        type: 'ERROR',
        id,
        payload: { error: err.message || String(err) },
      });
    }
  }
};
`;

let workerInstance: Worker | null = null;
const pendingWorkerRequests = new Map<
  string,
  {
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
    onProgress?: (data: any) => void;
  }
>();

/**
 * Singleton Web Worker launcher.
 */
function getWorker(): Worker {
  if (workerInstance) return workerInstance;

  const blob = new Blob([WORKER_SCRIPT], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  workerInstance = new Worker(url, { type: 'module' });

  workerInstance.onmessage = (e: MessageEvent) => {
    const { type, id, payload } = e.data;
    const req = pendingWorkerRequests.get(id);

    if (type === 'PROGRESS') {
      req?.onProgress?.(payload);
    } else if (type === 'WARMUP_COMPLETE' || type === 'TRANSCRIBE_COMPLETE' || type === 'RESET_COMPLETE') {
      if (req) {
        pendingWorkerRequests.delete(id);
        req.resolve(payload);
      }
    } else if (type === 'ERROR') {
      if (req) {
        pendingWorkerRequests.delete(id);
        req.reject(new Error(payload?.error || 'Worker transcription error'));
      }
    }
  };

  workerInstance.onerror = (err) => {
    console.error('Whisper Web Worker error:', err);
    for (const [, req] of pendingWorkerRequests.entries()) {
      req.reject(new Error('Web Worker encountered an unhandled execution error.'));
    }
    pendingWorkerRequests.clear();
    workerInstance = null;
  };

  return workerInstance;
}

/**
 * Checks if model is already downloaded and cached in browser storage.
 */
export async function checkModelCachedStatus(modelId: string): Promise<boolean> {
  const localKey = `whisper_cached_${modelId.replace(/[^a-zA-Z0-9]/g, '_')}`;
  if (typeof localStorage !== 'undefined' && localStorage.getItem(localKey) === 'true') {
    return true;
  }

  if (typeof window === 'undefined' || !('caches' in window)) {
    return false;
  }

  try {
    const cache = await caches.open('transformers-cache');
    const keys = await cache.keys();
    const modelSlug = modelId.split('/').pop() || modelId;
    const hasModelFiles = keys.some(
      (req) => req.url.includes(modelSlug) && (req.url.includes('encoder') || req.url.includes('quantized') || req.url.includes('json'))
    );
    if (hasModelFiles) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(localKey, 'true');
      }
      return true;
    }
  } catch (e) {
    console.warn('Cache check notice:', e);
  }
  return false;
}

/**
 * Deletes model entries from transformers-cache.
 */
export async function deleteCachedModel(modelId: string): Promise<void> {
  const localKey = `whisper_cached_${modelId.replace(/[^a-zA-Z0-9]/g, '_')}`;
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(localKey);
  }

  if (workerInstance) {
    const id = `req_reset_${Date.now()}`;
    workerInstance.postMessage({ type: 'RESET', id });
  }

  if (typeof window === 'undefined' || !('caches' in window)) {
    return;
  }

  try {
    const cache = await caches.open('transformers-cache');
    const keys = await cache.keys();
    const modelSlug = modelId.split('/').pop() || modelId;
    for (const req of keys) {
      if (req.url.includes(modelSlug) || req.url.includes(modelId)) {
        await cache.delete(req);
      }
    }
  } catch (e) {
    console.warn('Failed to delete cached model:', e);
  }
}

/**
 * Downloads and warms up the selected Whisper model in the background Web Worker.
 */
export async function downloadAndWarmupModel(
  modelId: WhisperModelChoice,
  onProgress?: (progress: ModelDownloadProgress) => void
): Promise<any> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      await navigator.storage.persist();
    }
  } catch {}

  onProgress?.({
    modelId,
    status: 'downloading',
    progress: 0,
    file: 'Initializing Web Worker background downloader...',
  });

  const worker = getWorker();
  const reqId = `req_download_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const { activeThreads } = getOptimalWasmThreads();

  return new Promise((resolve, reject) => {
    pendingWorkerRequests.set(reqId, {
      resolve: () => {
        const localKey = `whisper_cached_${modelId.replace(/[^a-zA-Z0-9]/g, '_')}`;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(localKey, 'true');
          localStorage.setItem('preferred_whisper_model', modelId);
        }
        onProgress?.({
          modelId,
          status: 'ready',
          progress: 100,
        });
        resolve(true);
      },
      reject,
      onProgress: (p: any) => {
        onProgress?.(p);
      },
    });

    worker.postMessage({
      type: 'DOWNLOAD_AND_WARMUP',
      id: reqId,
      payload: { modelId, numThreads: activeThreads },
    });
  });
}

/**
 * Decodes microphone audio blob to 16kHz Float32Array.
 */
export async function decodeAudioBlobTo16kHz(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error('AudioContext is not supported in this browser.');
  }

  const audioCtx = new AudioContextClass();
  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;

    const targetLength = Math.max(1, Math.ceil((length * 16000) / sampleRate));
    const offlineCtx = new OfflineAudioContext(1, targetLength, 16000);
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start(0);
    const resampled = await offlineCtx.startRendering();
    return resampled.getChannelData(0);
  } finally {
    if (audioCtx.state !== 'closed') {
      audioCtx.close().catch(() => {});
    }
  }
}

/**
 * Perform 50ms window RMS energy VAD with gentle soft-knee noise gate & 400ms padding.
 */
export function analyzeAndNormalizeAudioWaveform(
  audio16k: Float32Array
): VADAudioAnalysis {
  const sampleRate = 16000;
  const windowMs = 50;
  const samplesPerWindow = Math.floor((sampleRate * windowMs) / 1000); // 800 samples
  const totalWindows = Math.floor(audio16k.length / samplesPerWindow);

  if (totalWindows === 0) {
    return {
      trimmedAudio: audio16k,
      activeSpeakingTimeSeconds: Math.max(0.1, audio16k.length / sampleRate),
      pauseCount: 0,
      longestPauseSeconds: 0,
      totalPauseDurationSeconds: 0,
      originalDurationSeconds: audio16k.length / sampleRate,
      acousticHesitationStalls: 0,
    };
  }

  const rmsWindows = new Float32Array(totalWindows);
  let maxPeak = 0;
  let peakRms = 0;

  for (let i = 0; i < totalWindows; i++) {
    let sum = 0;
    const offset = i * samplesPerWindow;
    for (let j = 0; j < samplesPerWindow; j++) {
      const val = audio16k[offset + j];
      const absVal = Math.abs(val);
      if (absVal > maxPeak) maxPeak = absVal;
      sum += val * val;
    }
    const rms = Math.sqrt(sum / samplesPerWindow);
    rmsWindows[i] = rms;
    if (rms > peakRms) peakRms = rms;
  }

  // Gentle Soft-Knee Noise Gate: Attenuate quiet frames (rms < 3.5% peak) by 0.35 factor
  // Preserves soft consonants (/s/, /t/, /f/, /p/, /th/) while softening background hiss
  const gateThreshold = Math.max(0.0015, peakRms * 0.035);
  const gatedAudio16k = new Float32Array(audio16k.length);
  for (let i = 0; i < totalWindows; i++) {
    const offset = i * samplesPerWindow;
    const isQuiet = rmsWindows[i] < gateThreshold;
    const factor = isQuiet ? 0.35 : 1.0;
    for (let j = 0; j < samplesPerWindow; j++) {
      gatedAudio16k[offset + j] = audio16k[offset + j] * factor;
    }
  }

  // Acoustic Hesitation Detector: Scan for sustained voiced stalls (250ms–850ms, i.e. 5 to 17 windows of steady energy)
  let acousticHesitationStalls = 0;
  let currentVoicedStreak = 0;
  for (let i = 0; i < totalWindows; i++) {
    if (rmsWindows[i] >= 0.012 && rmsWindows[i] <= 0.12) {
      currentVoicedStreak++;
    } else {
      if (currentVoicedStreak >= 5 && currentVoicedStreak <= 17) {
        acousticHesitationStalls++;
      }
      currentVoicedStreak = 0;
    }
  }

  const silenceThreshold = Math.max(0.0025, Math.min(0.01, maxPeak * 0.08));

  const isSpeech = new Uint8Array(totalWindows);
  for (let i = 0; i < totalWindows; i++) {
    isSpeech[i] = rmsWindows[i] >= silenceThreshold ? 1 : 0;
  }

  let firstSpeech = -1;
  let lastSpeech = -1;
  for (let i = 0; i < totalWindows; i++) {
    if (isSpeech[i] === 1) {
      if (firstSpeech === -1) firstSpeech = i;
      lastSpeech = i;
    }
  }

  if (firstSpeech === -1) {
    let trimmed = gatedAudio16k;
    if (maxPeak > 0.01 && maxPeak < 0.9) {
      const scale = 0.92 / maxPeak;
      trimmed = new Float32Array(gatedAudio16k.length);
      for (let k = 0; k < gatedAudio16k.length; k++) trimmed[k] = gatedAudio16k[k] * scale;
    }
    return {
      trimmedAudio: trimmed,
      activeSpeakingTimeSeconds: Math.max(0.1, gatedAudio16k.length / sampleRate),
      pauseCount: 0,
      longestPauseSeconds: 0,
      totalPauseDurationSeconds: 0,
      originalDurationSeconds: gatedAudio16k.length / sampleRate,
      acousticHesitationStalls,
    };
  }

  const leadingSilenceMs = firstSpeech * windowMs;
  const trailingSilenceMs = (totalWindows - 1 - lastSpeech) * windowMs;

  const paddingWindows = 8; // 400ms
  const startWindow = leadingSilenceMs > 450 ? Math.max(0, firstSpeech - paddingWindows) : 0;
  const endWindow = trailingSilenceMs > 450 ? Math.min(totalWindows - 1, lastSpeech + paddingWindows) : totalWindows - 1;

  const startSample = startWindow * samplesPerWindow;
  const endSample = Math.min(gatedAudio16k.length, (endWindow + 1) * samplesPerWindow);
  let trimmedAudio = gatedAudio16k.slice(startSample, endSample);

  let trimmedMaxPeak = 0;
  for (let k = 0; k < trimmedAudio.length; k++) {
    const absVal = Math.abs(trimmedAudio[k]);
    if (absVal > trimmedMaxPeak) trimmedMaxPeak = absVal;
  }

  if (trimmedMaxPeak > 0.01 && trimmedMaxPeak < 0.9) {
    const scale = 0.92 / trimmedMaxPeak;
    const normalized = new Float32Array(trimmedAudio.length);
    for (let k = 0; k < trimmedAudio.length; k++) {
      normalized[k] = trimmedAudio[k] * scale;
    }
    trimmedAudio = normalized;
  }

  let pauseCount = 0;
  let longestPauseWindows = 0;
  let totalPauseWindows = 0;
  let currentSilentStreak = 0;

  for (let i = firstSpeech; i <= lastSpeech; i++) {
    if (isSpeech[i] === 0) {
      currentSilentStreak++;
    } else {
      if (currentSilentStreak >= 20) {
        pauseCount++;
        totalPauseWindows += currentSilentStreak;
        if (currentSilentStreak > longestPauseWindows) {
          longestPauseWindows = currentSilentStreak;
        }
      }
      currentSilentStreak = 0;
    }
  }

  const activeSpeakingTimeSeconds = Math.max(0.5, ((lastSpeech - firstSpeech + 1) * windowMs) / 1000);
  const longestPauseSeconds = Math.round(((longestPauseWindows * windowMs) / 1000) * 10) / 10;
  const totalPauseDurationSeconds = Math.round(((totalPauseWindows * windowMs) / 1000) * 10) / 10;

  return {
    trimmedAudio,
    activeSpeakingTimeSeconds,
    pauseCount,
    longestPauseSeconds,
    totalPauseDurationSeconds,
    originalDurationSeconds: gatedAudio16k.length / sampleRate,
    acousticHesitationStalls,
  };
}

/**
 * Pipeline retriever wrapper for backward compatibility.
 */
export async function getLocalWhisperPipeline(
  onProgress?: (status: string) => void,
  targetModel: WhisperModelChoice = getWhisperModelChoice()
): Promise<any> {
  return downloadAndWarmupModel(targetModel, (p) => {
    onProgress?.(p.file ? `Loading ${targetModel}: ${p.progress}% (${p.file})` : `Loading ${targetModel}...`);
  });
}

/**
 * Transcribes audio blob completely off main thread in Web Worker with a 25s safety timeout.
 */
export async function transcribeWithLocalWhisper(
  audioBlob: Blob,
  onProgress?: (status: string) => void,
  targetSentence?: string
): Promise<LocalWhisperResult> {
  onProgress?.('Decoding & resampling audio to 16kHz...');
  const rawAudio16k = await decodeAudioBlobTo16kHz(audioBlob);

  onProgress?.('Trimming silence & applying soft noise gate...');
  const vad = analyzeAndNormalizeAudioWaveform(rawAudio16k);

  const activeModel = getWhisperModelChoice();
  const isCached = await checkModelCachedStatus(activeModel);

  if (!isCached) {
    throw new Error(`NO_CACHED_MODEL:${activeModel}`);
  }

  const threadInfo = getOptimalWasmThreads();
  onProgress?.(`Transcribing locally (${activeModel}, ${threadInfo.activeThreads} WASM threads)...`);

  const worker = getWorker();
  const reqId = `req_tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const durationSec = vad.activeSpeakingTimeSeconds;

  const resultText: string = await new Promise((resolve, reject) => {
    isWorkerBusyState = true;
    const timeoutTimer = setTimeout(() => {
      isWorkerBusyState = false;
      if (pendingWorkerRequests.has(reqId)) {
        pendingWorkerRequests.delete(reqId);
        reject(new Error('TRANSCRIPTION_TIMEOUT'));
      }
    }, 25000);

    pendingWorkerRequests.set(reqId, {
      resolve: (payload: any) => {
        isWorkerBusyState = false;
        clearTimeout(timeoutTimer);
        resolve(payload.text || '');
      },
      reject: (err) => {
        isWorkerBusyState = false;
        clearTimeout(timeoutTimer);
        reject(err);
      },
      onProgress: (p: any) => {
        if (p.message) onProgress?.(p.message);
      },
    });

    const audioDataCopy = new Float32Array(vad.trimmedAudio);
    worker.postMessage({
      type: 'TRANSCRIBE',
      id: reqId,
      payload: {
        audioData: audioDataCopy,
        modelId: activeModel,
        durationSec,
        numThreads: threadInfo.activeThreads,
      },
    });
  });

  const rawFullText = resultText.trim();

  const fullText = targetSentence
    ? alignHomophonesAndPhonetics(rawFullText, targetSentence)
    : rawFullText;

  const detectedFillers: string[] = [];
  const lowerFull = fullText.toLowerCase();
  const wordsInText = lowerFull.match(/\b[a-z']+\b/g) || [];

  for (const w of wordsInText) {
    if (FILLER_WORDS.has(w)) {
      detectedFillers.push(w);
    }
  }
  const youKnowMatches = lowerFull.match(/\byou know\b/g);
  if (youKnowMatches) {
    youKnowMatches.forEach(() => detectedFillers.push('you know'));
  }

  const totalFillerCount = Math.max(detectedFillers.length, vad.acousticHesitationStalls);

  const wordCount = wordsInText.length;
  const durationMin = vad.activeSpeakingTimeSeconds / 60;
  const rawWpm = durationMin > 0 ? Math.round(wordCount / durationMin) : 0;
  const wpm = Math.min(220, Math.max(0, rawWpm));

  const metrics: LocalSpeakingMetrics = {
    wpm,
    pauseCount: vad.pauseCount,
    longestPause: vad.longestPauseSeconds,
    totalPausesDuration: vad.totalPauseDurationSeconds,
    fillerWords: detectedFillers,
    fillerCount: totalFillerCount,
    wordCount,
    durationSeconds: Math.round(vad.activeSpeakingTimeSeconds * 10) / 10,
    acousticHesitations: vad.acousticHesitationStalls,
  };

  return {
    transcript: fullText,
    rawTranscript: rawFullText,
    words: [],
    durationMs: Math.round(vad.activeSpeakingTimeSeconds * 1000),
    metrics,
  };
}
