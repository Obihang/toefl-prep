/**
 * Client-Side Local Whisper STT Engine using @xenova/transformers@2.17.2.
 * Dynamically loaded from CDN so package.json and Vercel builds stay lightweight.
 * 100% Zero-API offline automatic speech recognition for Brave and all modern browsers.
 *
 * Upgraded Architecture:
 * - Persistent browser cache manager via CacheStorage & navigator.storage.persist().
 * - Pure CPU WebAssembly (quantized: true, no WebGPU crashes).
 * - 3 Selectable models (whisper-tiny.en, whisper-base.en, whisper-small.en).
 * - Explicit lifecycle functions: checkModelCachedStatus, downloadAndWarmupModel, deleteCachedModel.
 * - 16kHz resampling + 500ms VAD padding + peak normalization + phonetic homophone alignment.
 */

import { alignHomophonesAndPhonetics } from './phoneticMatcher';

const CDN_URL = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

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
    name: 'Whisper Base (Balanced)',
    badge: 'Balanced ~75 MB',
    sizeMb: 75,
    estSpeed: '~3–4s response',
    accuracy: 'Fast (~4s), good accuracy for standard accents',
  },
  {
    id: 'Xenova/whisper-small.en',
    name: 'Whisper Small (Heavy - High Accuracy)',
    badge: 'Heavy ~245 MB',
    sizeMb: 245,
    estSpeed: '~5–7s response',
    accuracy: 'Best accuracy for South Asian / international accents & TOEFL vocabulary',
    recommended: true,
  },
];

let pipelineModule: any = null;
let pipelineInstance: any = null;
let loadedModelName: string | null = null;
let pipelineLoadPromise: Promise<any> | null = null;

const FILLER_WORDS = new Set(['um', 'uh', 'erm', 'er', 'ah', 'like']);

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

export function getWhisperModelChoice(): WhisperModelChoice {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('preferred_whisper_model') as WhisperModelChoice;
    if (saved && WHISPER_MODELS.some((m) => m.id === saved)) {
      return saved;
    }
  }
  return 'Xenova/whisper-small.en';
}

export function setWhisperModelChoice(choice: WhisperModelChoice) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('preferred_whisper_model', choice);
  }
  if (choice !== loadedModelName) {
    pipelineInstance = null;
    loadedModelName = null;
    pipelineLoadPromise = null;
  }
}

/**
 * Dynamically import @xenova/transformers@2.17.2 from CDN.
 */
async function getTransformersModule(): Promise<any> {
  if (pipelineModule) return pipelineModule;
  try {
    const importDynamic = new Function('url', 'return import(url)');
    pipelineModule = await importDynamic(CDN_URL);
    if (pipelineModule?.env) {
      pipelineModule.env.allowLocalModels = false;
      pipelineModule.env.useBrowserCache = true;
      if (pipelineModule.env.wasm) {
        pipelineModule.env.wasm.numThreads = Math.min(
          4,
          (typeof navigator !== 'undefined' && (navigator as any).hardwareConcurrency) || 4
        );
      }
    }
    return pipelineModule;
  } catch (err) {
    console.warn('Failed to load @xenova/transformers from CDN:', err);
    throw new Error('Local Whisper engine could not be loaded from CDN. Check network connection.');
  }
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

  if (loadedModelName === modelId) {
    pipelineInstance = null;
    loadedModelName = null;
    pipelineLoadPromise = null;
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
 * Downloads and warms up the selected Whisper model with explicit progress callbacks.
 */
export async function downloadAndWarmupModel(
  modelId: WhisperModelChoice,
  onProgress?: (progress: ModelDownloadProgress) => void
): Promise<any> {
  // Request persistent storage from browser so Brave never evicts cached weights
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      await navigator.storage.persist();
    }
  } catch {}

  onProgress?.({
    modelId,
    status: 'downloading',
    progress: 0,
    file: 'Initializing downloader...',
  });

  const { pipeline, env } = await getTransformersModule();
  if (env) {
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    if (env.wasm) {
      env.wasm.numThreads = Math.min(4, (typeof navigator !== 'undefined' && (navigator as any).hardwareConcurrency) || 4);
    }
  }

  const fileProgress: Record<string, { loaded: number; total: number }> = {};

  const transcriber = await pipeline('automatic-speech-recognition', modelId, {
    quantized: true,
    progress_callback: (p: any) => {
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

      onProgress?.({
        modelId,
        status: 'downloading',
        progress: overallPct,
        file: p.file || 'model weights',
        loadedMb,
        totalMb,
      });
    },
  });

  // Warmup with a 0.5-second silent test buffer
  onProgress?.({
    modelId,
    status: 'verifying',
    progress: 99,
    file: 'Verifying WASM pipeline execution...',
  });

  const testBuffer = new Float32Array(8000);
  await transcriber(testBuffer, {
    return_timestamps: false,
    chunk_length_s: 30,
    stride_length_s: 5,
    temperature: 0,
  });

  pipelineInstance = transcriber;
  loadedModelName = modelId;

  // Mark in localStorage
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

  return transcriber;
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
 * Perform 50ms window RMS energy VAD with 500ms pre/post padding.
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
    };
  }

  const rmsWindows = new Float32Array(totalWindows);
  let maxPeak = 0;

  for (let i = 0; i < totalWindows; i++) {
    let sum = 0;
    const offset = i * samplesPerWindow;
    for (let j = 0; j < samplesPerWindow; j++) {
      const val = audio16k[offset + j];
      const absVal = Math.abs(val);
      if (absVal > maxPeak) maxPeak = absVal;
      sum += val * val;
    }
    rmsWindows[i] = Math.sqrt(sum / samplesPerWindow);
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
    let trimmed = audio16k;
    if (maxPeak > 0.01 && maxPeak < 0.9) {
      const scale = 0.92 / maxPeak;
      trimmed = new Float32Array(audio16k.length);
      for (let k = 0; k < audio16k.length; k++) trimmed[k] = audio16k[k] * scale;
    }
    return {
      trimmedAudio: trimmed,
      activeSpeakingTimeSeconds: Math.max(0.1, audio16k.length / sampleRate),
      pauseCount: 0,
      longestPauseSeconds: 0,
      totalPauseDurationSeconds: 0,
      originalDurationSeconds: audio16k.length / sampleRate,
    };
  }

  const leadingSilenceMs = firstSpeech * windowMs;
  const trailingSilenceMs = (totalWindows - 1 - lastSpeech) * windowMs;

  const paddingWindows = 10; // 500ms
  const startWindow = leadingSilenceMs > 600 ? Math.max(0, firstSpeech - paddingWindows) : 0;
  const endWindow = trailingSilenceMs > 600 ? Math.min(totalWindows - 1, lastSpeech + paddingWindows) : totalWindows - 1;

  const startSample = startWindow * samplesPerWindow;
  const endSample = Math.min(audio16k.length, (endWindow + 1) * samplesPerWindow);
  let trimmedAudio = audio16k.slice(startSample, endSample);

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
    originalDurationSeconds: audio16k.length / sampleRate,
  };
}

/**
 * Pipeline retriever that uses cached model or loads requested model.
 */
export async function getLocalWhisperPipeline(
  onProgress?: (status: string) => void,
  targetModel: WhisperModelChoice = getWhisperModelChoice()
): Promise<any> {
  if (pipelineInstance && loadedModelName === targetModel) {
    return pipelineInstance;
  }
  if (pipelineLoadPromise && loadedModelName === targetModel) {
    return pipelineLoadPromise;
  }

  pipelineLoadPromise = (async () => {
    return downloadAndWarmupModel(targetModel, (p) => {
      onProgress?.(p.file ? `Loading ${targetModel}: ${p.progress}% (${p.file})` : `Loading ${targetModel}...`);
    });
  })();

  try {
    return await pipelineLoadPromise;
  } catch (err) {
    pipelineLoadPromise = null;
    loadedModelName = null;
    throw err;
  }
}

/**
 * Transcribes audio blob completely in-browser using local Whisper model.
 */
export async function transcribeWithLocalWhisper(
  audioBlob: Blob,
  onProgress?: (status: string) => void,
  targetSentence?: string
): Promise<LocalWhisperResult> {
  onProgress?.('Decoding & resampling audio to 16kHz...');
  const rawAudio16k = await decodeAudioBlobTo16kHz(audioBlob);

  onProgress?.('Trimming silence & normalizing volume...');
  const vad = analyzeAndNormalizeAudioWaveform(rawAudio16k);

  const activeModel = getWhisperModelChoice();
  const isCached = await checkModelCachedStatus(activeModel);

  if (!isCached && !pipelineInstance) {
    throw new Error(`NO_CACHED_MODEL:${activeModel}`);
  }

  const transcriber = await getLocalWhisperPipeline(onProgress, activeModel);
  onProgress?.(`Transcribing locally with ${activeModel}...`);

  const output = await transcriber(vad.trimmedAudio, {
    return_timestamps: false,
    chunk_length_s: 30,
    stride_length_s: 5,
    temperature: 0,
  });

  const rawFullText = (output.text || '').trim();

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
    fillerCount: detectedFillers.length,
    wordCount,
    durationSeconds: Math.round(vad.activeSpeakingTimeSeconds * 10) / 10,
  };

  return {
    transcript: fullText,
    rawTranscript: rawFullText,
    words: [],
    durationMs: Math.round(vad.activeSpeakingTimeSeconds * 1000),
    metrics,
  };
}
