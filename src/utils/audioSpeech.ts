// Web Speech API and Web Audio utilities for TOEFL audio tasks and speaking test simulation

export interface SpeechVoiceOption {
  name: string;
  lang: string;
  default: boolean;
}

let cachedVoices: SpeechSynthesisVoice[] = [];
const activeUtterances = new Set<SpeechSynthesisUtterance>();
let activeHtmlAudio: HTMLAudioElement | null = null;
let isAudioPlayingState = false;
const ttsAudioCache = new Map<string, string>();

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

  // Stop Web Speech
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
      activeUtterances.clear();
    } catch {
      // Ignored
    }
  }

  // Stop HTML Audio
  if (activeHtmlAudio) {
    try {
      activeHtmlAudio.pause();
      activeHtmlAudio.currentTime = 0;
      activeHtmlAudio = null;
    } catch {
      // Ignored
    }
  }
}

export function isAudioPlaying(): boolean {
  return isAudioPlayingState;
}

// Fetch Cloud Audio from /api/tts via Gemini with in-memory caching
export async function fetchAudioDataUri(text: string, voiceName: string = 'Kore'): Promise<string> {
  const cacheKey = `${voiceName}:::${text}`;
  if (ttsAudioCache.has(cacheKey)) {
    return ttsAudioCache.get(cacheKey)!;
  }

  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voiceName }),
  });

  const json = await res.json();
  if (!res.ok || !json.success || !json.audioBase64) {
    throw new Error(json.error || 'TTS service failed');
  }

  const dataUri = `data:audio/wav;base64,${json.audioBase64}`;
  ttsAudioCache.set(cacheKey, dataUri);
  return dataUri;
}

// Play HTML Audio Data URI with promise resolution
export function playAudioDataUri(dataUri: string): Promise<void> {
  if (activeHtmlAudio) {
    try {
      activeHtmlAudio.pause();
    } catch {}
    activeHtmlAudio = null;
  }

  isAudioPlayingState = true;
  const audio = new Audio(dataUri);
  activeHtmlAudio = audio;

  return new Promise((resolve) => {
    audio.onended = () => {
      activeHtmlAudio = null;
      resolve();
    };
    audio.onerror = () => {
      activeHtmlAudio = null;
      resolve();
    };
    audio.play().catch(() => {
      activeHtmlAudio = null;
      resolve();
    });
  });
}

// Browser fallback speech synthesis
function speakScriptLineFallback(text: string, pitch = 1.0): Promise<void> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      const utt = new SpeechSynthesisUtterance(text);
      activeUtterances.add(utt);
      utt.lang = 'en-US';
      utt.rate = 0.95;
      utt.pitch = pitch;

      utt.onend = () => {
        activeUtterances.delete(utt);
        resolve();
      };
      utt.onerror = () => {
        activeUtterances.delete(utt);
        resolve();
      };

      window.speechSynthesis.speak(utt);
    } catch {
      resolve();
    }
  });
}

// Speak single line with Studio AI voice primary and browser fallback
export async function speakScriptLine(
  text: string,
  options: {
    rate?: number;
    pitch?: number;
    voiceName?: string;
    onEnd?: () => void;
    onError?: (err: any) => void;
  } = {}
): Promise<void> {
  stopSpeaking();
  isAudioPlayingState = true;

  const defaultVoice = options.pitch && options.pitch < 0.95 ? 'Puck' : 'Kore';
  const voice = options.voiceName || defaultVoice;

  try {
    const dataUri = await fetchAudioDataUri(text, voice);
    if (!isAudioPlayingState) return;
    await playAudioDataUri(dataUri);
    isAudioPlayingState = false;
    options.onEnd?.();
  } catch (err) {
    // Fall back to browser speech synthesis
    console.warn('AI voice failed, falling back to browser voice:', err);
    await speakScriptLineFallback(text, options.pitch ?? 1.0);
    isAudioPlayingState = false;
    options.onEnd?.();
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

  for (let i = 0; i < lines.length; i++) {
    if (!isAudioPlayingState) break; // User stopped playback

    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    onLineChange?.(i);

    const isSpeakerB =
      rawLine.startsWith('Speaker B:') ||
      rawLine.startsWith('B:') ||
      rawLine.toLowerCase().startsWith('professor:') ||
      rawLine.toLowerCase().startsWith('advisor:');

    const cleanText = rawLine.replace(/^(Speaker [AB]:|[AB]:|Professor.*?:|Student.*?:)\s*/i, '');
    const voiceToUse = isSpeakerB ? voiceMapping.B : voiceMapping.A;

    // Asynchronously pre-fetch the next line while current line is about to play
    if (i + 1 < lines.length) {
      const nextRaw = lines[i + 1].trim();
      const nextIsB =
        nextRaw.startsWith('Speaker B:') ||
        nextRaw.startsWith('B:') ||
        nextRaw.toLowerCase().startsWith('professor:') ||
        nextRaw.toLowerCase().startsWith('advisor:');
      const nextClean = nextRaw.replace(/^(Speaker [AB]:|[AB]:|Professor.*?:|Student.*?:)\s*/i, '');
      const nextVoice = nextIsB ? voiceMapping.B : voiceMapping.A;
      fetchAudioDataUri(nextClean, nextVoice).catch(() => {});
    }

    try {
      // 1. Studio Quality AI Voice (Puck for Male, Kore for Female)
      const dataUri = await fetchAudioDataUri(cleanText, voiceToUse);
      if (!isAudioPlayingState) break;
      await playAudioDataUri(dataUri);
      await new Promise((r) => setTimeout(r, 350));
    } catch {
      // 2. Fallback to Web Speech API
      const fallbackPitch = voiceToUse === 'Kore' || voiceToUse === 'Zephyr' ? 1.15 : 0.88;
      await speakScriptLineFallback(cleanText, fallbackPitch);
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  isAudioPlayingState = false;
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

// Request and verify microphone access with helpful error messages
export async function requestMicrophoneAccess(): Promise<{ granted: boolean; error?: string }> {
  if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
    return {
      granted: false,
      error: 'Audio recording is not supported in this browser environment. You can type your response instead.',
    };
  }

  try {
    const testStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    testStream.getTracks().forEach((t) => t.stop());
    return { granted: true };
  } catch (err: any) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      return {
        granted: false,
        error:
          'Microphone permission was denied. Please allow microphone access in your browser address bar (look for the lock/camera icon) to speak.',
      };
    }
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      return {
        granted: false,
        error: 'No microphone was found on your device. Please connect a microphone or type your response.',
      };
    }
    return {
      granted: false,
      error: `Could not access microphone: ${err.message || err.name}. You can type your response instead.`,
    };
  }
}

// Send recorded audio to Gemini /api/transcribe fallback
export async function transcribeAudioBlob(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  const res = await fetch('/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audioBase64: base64,
      mimeType: blob.type || 'audio/webm',
    }),
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Audio transcription failed');
  }
  return json.transcript || '';
}

// Unified Voice Recording Session combining Web Speech (real-time) and MediaRecorder (reliable fallback)
export interface VoiceSession {
  start: () => Promise<void>;
  stop: () => Promise<{ transcript: string; audioBlob: Blob | null }>;
  abort: () => void;
  isRecording: () => boolean;
}

export function createVoiceSession(options: {
  onTranscriptUpdate?: (text: string) => void;
  onStatusChange?: (status: 'idle' | 'listening' | 'processing' | 'error', errorMsg?: string) => void;
}): VoiceSession {
  let isRecordingState = false;
  let activeStream: MediaStream | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let recognitionInstance: any = null;
  let accumulatedTranscript = '';
  let audioChunks: Blob[] = [];

  const cleanup = () => {
    isRecordingState = false;
    if (activeStream) {
      activeStream.getTracks().forEach((t) => t.stop());
      activeStream = null;
    }
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
      cleanup();
      accumulatedTranscript = '';
      audioChunks = [];

      // Check mic access first
      const permCheck = await requestMicrophoneAccess();
      if (!permCheck.granted) {
        options.onStatusChange?.('error', permCheck.error);
        throw new Error(permCheck.error);
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        activeStream = stream;
        isRecordingState = true;
        options.onStatusChange?.('listening');

        // Setup MediaRecorder
        const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
        const supportedType = mimeTypes.find((t) => MediaRecorder.isTypeSupported(t)) || '';

        try {
          mediaRecorder = supportedType ? new MediaRecorder(stream, { mimeType: supportedType }) : new MediaRecorder(stream);
          mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              audioChunks.push(e.data);
            }
          };
          mediaRecorder.start(200); // 200ms slice
        } catch {
          mediaRecorder = null;
        }

        // Setup SpeechRecognition for real-time live typing
        recognitionInstance = createSpeechRecognizer(
          (text) => {
            accumulatedTranscript = text;
            options.onTranscriptUpdate?.(text);
          },
          (status, errorMsg) => {
            if (status === 'error' && isRecordingState) {
              // Speech recognition error shouldn't kill active MediaRecorder unless fatal
              if (errorMsg === 'not-allowed') {
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
      } catch (err: any) {
        cleanup();
        options.onStatusChange?.('error', err.message || 'Could not start recording');
        throw err;
      }
    },

    stop: async (): Promise<{ transcript: string; audioBlob: Blob | null }> => {
      if (!isRecordingState) {
        return { transcript: accumulatedTranscript, audioBlob: null };
      }

      isRecordingState = false;

      // Stop speech recognition
      if (recognitionInstance) {
        try {
          recognitionInstance.stop();
        } catch {}
      }

      // Stop media recorder
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
      }

      // Give browser speech recognizer a brief window to flush final result if empty
      if (!accumulatedTranscript.trim()) {
        await new Promise((r) => setTimeout(r, 200));
      }

      if (recognitionInstance) {
        recognitionInstance = null;
      }

      // Release mic stream
      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
        activeStream = null;
      }

      // If we have live transcript from Web Speech, return immediately (zero server latency)
      const liveTranscript = accumulatedTranscript.trim();
      if (liveTranscript.length > 0) {
        options.onStatusChange?.('idle');
        return { transcript: liveTranscript, audioBlob: finalAudioBlob };
      }

      // Fallback: If Web Speech produced no text, use fast Gemini transcription
      if (finalAudioBlob && (finalAudioBlob as Blob).size > 1500) {
        options.onStatusChange?.('processing');
        try {
          const aiTranscribed = await transcribeAudioBlob(finalAudioBlob);
          if (aiTranscribed.trim()) {
            options.onTranscriptUpdate?.(aiTranscribed.trim());
            options.onStatusChange?.('idle');
            return { transcript: aiTranscribed.trim(), audioBlob: finalAudioBlob };
          }
        } catch (err) {
          console.warn('AI speech transcription fallback failed:', err);
        }
      }

      options.onStatusChange?.('idle');
      return { transcript: liveTranscript, audioBlob: finalAudioBlob };
    },

    abort: () => {
      cleanup();
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
