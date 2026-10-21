/**
 * Client-Side Local Whisper STT Engine using @huggingface/transformers.
 * Dynamically loaded from CDN so package.json and Vercel builds stay lightweight.
 * 100% Zero-API offline automatic speech recognition for Brave and all modern browsers.
 */

const CDN_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.1.2';

let pipelineModule: any = null;
let pipelineInstance: any = null;
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
  words: LocalWordTimestamp[];
  durationMs: number;
  metrics: LocalSpeakingMetrics;
}

/**
 * Dynamically import @huggingface/transformers from CDN without Vite bundling issues.
 */
async function getTransformersModule(): Promise<any> {
  if (pipelineModule) return pipelineModule;
  try {
    const importDynamic = new Function('url', 'return import(url)');
    pipelineModule = await importDynamic(CDN_URL);
    if (pipelineModule?.env) {
      pipelineModule.env.allowLocalModels = false;
      pipelineModule.env.useBrowserCache = true;
    }
    return pipelineModule;
  } catch (err) {
    console.warn('Failed to load @huggingface/transformers from CDN:', err);
    throw new Error('Local Whisper engine could not be loaded from CDN. Check network connection.');
  }
}

/**
 * Decodes any recorded microphone audio blob (webm, mp4, ogg, wav) to a 16kHz mono Float32Array.
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
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;

    // Resample down to 16kHz mono using OfflineAudioContext
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
 * Initializes and caches the Whisper tiny pipeline with user-facing progress updates.
 */
export async function getLocalWhisperPipeline(onProgress?: (status: string) => void): Promise<any> {
  if (pipelineInstance) return pipelineInstance;
  if (pipelineLoadPromise) return pipelineLoadPromise;

  pipelineLoadPromise = (async () => {
    onProgress?.('Loading offline Whisper speech model (one-time ~40MB cached download)...');
    const { pipeline, env } = await getTransformersModule();
    if (env) {
      env.allowLocalModels = false;
      env.useBrowserCache = true;
    }

    const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
      dtype: 'q8',
      progress_callback: (progress: any) => {
        if (progress.status === 'progress' && progress.total) {
          const pct = Math.round((progress.loaded / progress.total) * 100);
          onProgress?.(`Loading offline Whisper speech model (${pct}% cached)...`);
        } else if (progress.status === 'ready' || progress.status === 'done') {
          onProgress?.('Whisper model loaded.');
        }
      },
    });

    pipelineInstance = transcriber;
    return transcriber;
  })();

  try {
    return await pipelineLoadPromise;
  } catch (err) {
    pipelineLoadPromise = null;
    throw err;
  }
}

/**
 * Compute speaking metrics (WPM, pause counts > 1.0s, longest pause, filler words) from chunks.
 */
function computeSpeakingMetrics(
  fullText: string,
  chunks: Array<{ text: string; timestamp?: [number, number] }>
): { words: LocalWordTimestamp[]; metrics: LocalSpeakingMetrics; durationMs: number } {
  const words: LocalWordTimestamp[] = [];
  const detectedFillers: string[] = [];

  for (const chunk of chunks) {
    const raw = (chunk.text || '').trim();
    if (!raw) continue;
    const splitWords = raw.split(/\s+/).filter(Boolean);
    const start = chunk.timestamp?.[0] ?? 0;
    const end = chunk.timestamp?.[1] ?? start + 0.3;
    const span = Math.max(0.1, end - start);

    splitWords.forEach((w, idx) => {
      const cleanWord = w.replace(/[^a-zA-Z']/g, '');
      const wordStart = start + (span / splitWords.length) * idx;
      const wordEnd = start + (span / splitWords.length) * (idx + 1);

      if (cleanWord) {
        words.push({
          word: w,
          start: Math.round(wordStart * 100) / 100,
          end: Math.round(wordEnd * 100) / 100,
        });

        const lowerClean = cleanWord.toLowerCase();
        if (FILLER_WORDS.has(lowerClean)) {
          detectedFillers.push(lowerClean);
        }
      }
    });
  }

  // Also check bigram filler: "you know"
  const lowerFull = fullText.toLowerCase();
  const youKnowMatches = lowerFull.match(/\byou know\b/g);
  if (youKnowMatches) {
    youKnowMatches.forEach(() => detectedFillers.push('you know'));
  }

  // Calculate pauses between consecutive words (> 1.0 second)
  let pauseCount = 0;
  let longestPause = 0;
  let totalPausesDuration = 0;

  for (let i = 0; i < words.length - 1; i++) {
    const gap = words[i + 1].start - words[i].end;
    if (gap >= 1.0) {
      pauseCount++;
      totalPausesDuration += gap;
      if (gap > longestPause) {
        longestPause = gap;
      }
    }
  }

  const durationSeconds = words.length > 0 ? Math.max(1, words[words.length - 1].end - words[0].start) : 1;
  const durationMs = Math.round(durationSeconds * 1000);
  const wpm = words.length > 0 ? Math.round((words.length / (durationSeconds / 60))) : 0;

  return {
    words,
    durationMs,
    metrics: {
      wpm: Math.min(220, Math.max(0, wpm)),
      pauseCount,
      longestPause: Math.round(longestPause * 10) / 10,
      totalPausesDuration: Math.round(totalPausesDuration * 10) / 10,
      fillerWords: detectedFillers,
      fillerCount: detectedFillers.length,
      wordCount: words.length,
      durationSeconds: Math.round(durationSeconds * 10) / 10,
    },
  };
}

/**
 * Transcribes audio blob completely in-browser using local Whisper Tiny model.
 * Zero API keys or server round-trips required.
 */
export async function transcribeWithLocalWhisper(
  audioBlob: Blob,
  onProgress?: (status: string) => void
): Promise<LocalWhisperResult> {
  onProgress?.('Decoding audio...');
  const audioData = await decodeAudioBlobTo16kHz(audioBlob);

  const transcriber = await getLocalWhisperPipeline(onProgress);
  onProgress?.('Transcribing locally...');

  const output = await transcriber(audioData, {
    return_timestamps: 'word',
    chunk_length_s: 30,
    stride_length_s: 5,
  });

  const fullText = (output.text || '').trim();
  const rawChunks = Array.isArray(output.chunks) ? output.chunks : [];

  const { words, durationMs, metrics } = computeSpeakingMetrics(fullText, rawChunks);

  return {
    transcript: fullText,
    words,
    durationMs,
    metrics,
  };
}
