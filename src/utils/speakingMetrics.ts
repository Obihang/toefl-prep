export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface SpeakingMetrics {
  wpm: number;
  fillerWordCount: number;
  fillerWords: string[];
  longestPauseSeconds: number;
  pausesOver1Sec: number;
  totalSpeakingTimeSeconds: number;
  allowedTimeSeconds?: number;
}

const COMMON_FILLERS = new Set([
  'um',
  'uh',
  'like',
  'er',
  'ah',
  'basically',
  'actually',
  'literally',
  'well',
  'you know',
  'i mean',
  'sort of',
  'kind of',
]);

// Known Whisper silence hallucination patterns
const SILENCE_HALLUCINATION_EXACT = [
  /^thank\s+you(\s+for\s+watching|\s+for\s+listening|\s+very\s+much)?[\s.!?,]*$/i,
  /^thanks\s+for\s+watching[\s.!?,]*$/i,
  /^subtitles\s+(by|created\s+by)?.*$/i,
  /^captions\s+(by|created\s+by)?.*$/i,
  /^translated\s+(by|created\s+by)?.*$/i,
  /^(please\s+)?(like\s+and\s+)?subscribe[\s.!?,]*$/i,
  /^you[\s.!?,]*$/i,
  /^(bye|goodbye|bye\s+bye)[\s.!?,]*$/i,
  /^\[.*(silence|music|applause|laughter|blank).*\]$/i,
  /^\(.*(silence|music|applause|laughter|blank).*\)$/i,
  /^\.{2,}[\s.!?,]*$/,
];

export function filterWhisperHallucinations(
  transcript: string,
  words: WordTimestamp[] = []
): { transcript: string; words: WordTimestamp[]; isHallucination: boolean } {
  const trimmed = transcript.trim();
  if (!trimmed) {
    return { transcript: '', words: [], isHallucination: false };
  }

  const lower = trimmed.toLowerCase();
  const isExactHallucination = SILENCE_HALLUCINATION_EXACT.some((pat) => pat.test(lower));
  const tokenCount = trimmed.split(/\s+/).filter(Boolean).length;

  if (isExactHallucination && tokenCount <= 5) {
    return { transcript: '', words: [], isHallucination: true };
  }

  // Check if transcript ends with a trailing Whisper hallucination (e.g. "... Thank you for watching.")
  let cleaned = trimmed;
  cleaned = cleaned.replace(/[\s,.-]+(thank you for watching|thanks for watching|subtitles by.*|captions by.*)[\s.!?,]*$/i, '');
  
  if (!cleaned.trim()) {
    return { transcript: '', words: [], isHallucination: true };
  }

  let filteredWords = words;
  if (cleaned !== trimmed && words.length > 0) {
    const cleanedTokens = cleaned.trim().toLowerCase().split(/\s+/).filter(Boolean);
    filteredWords = words.slice(0, cleanedTokens.length);
  }

  return { transcript: cleaned.trim(), words: filteredWords, isHallucination: false };
}

export function calculateSpeakingMetrics(
  words: WordTimestamp[] = [],
  transcript: string = '',
  totalAudioDuration: number = 0,
  allowedTimeSeconds?: number
): SpeakingMetrics {
  const { transcript: cleanTranscript, words: cleanWords } = filterWhisperHallucinations(transcript, words);
  const tokens = cleanTranscript.trim().split(/\s+/).filter(Boolean);
  const wordCount = cleanWords.length > 0 ? cleanWords.length : tokens.length;

  // Calculate speaking duration from the start of the first spoken word to the end of the last spoken word
  // so that leading or trailing pauses before speaking don't artificially tank WPM.
  let activeSpeakingDuration = totalAudioDuration;
  if (cleanWords.length > 1) {
    const firstWordStart = cleanWords[0].start;
    const lastWordEnd = cleanWords[cleanWords.length - 1].end;
    if (lastWordEnd > firstWordStart) {
      activeSpeakingDuration = lastWordEnd - firstWordStart;
    }
  } else if (cleanWords.length === 1) {
    activeSpeakingDuration = Math.max(0.5, cleanWords[0].end - cleanWords[0].start);
  } else if (!activeSpeakingDuration || activeSpeakingDuration <= 0) {
    activeSpeakingDuration = 1;
  }

  const minutes = Math.max(0.016, activeSpeakingDuration / 60);
  const wpm = wordCount > 0 ? Math.round(wordCount / minutes) : 0;

  // Detect fillers from words or transcript
  const detectedFillers: string[] = [];
  const textWords = (cleanTranscript.toLowerCase().match(/\b[a-z']+\b/g) || []);
  for (let i = 0; i < textWords.length; i++) {
    const single = textWords[i];
    if (COMMON_FILLERS.has(single)) {
      detectedFillers.push(single);
    }
    if (i < textWords.length - 1) {
      const double = `${textWords[i]} ${textWords[i + 1]}`;
      if (COMMON_FILLERS.has(double)) {
        detectedFillers.push(double);
      }
    }
  }

  // Calculate pauses from word timestamps
  let longestPause = 0;
  let pausesOver1Sec = 0;
  if (cleanWords.length > 1) {
    for (let i = 1; i < cleanWords.length; i++) {
      const gap = Math.max(0, cleanWords[i].start - cleanWords[i - 1].end);
      if (gap > longestPause) {
        longestPause = gap;
      }
      if (gap > 1.0) {
        pausesOver1Sec++;
      }
    }
  }

  const totalSpeakingTime = totalAudioDuration > 0 ? totalAudioDuration : activeSpeakingDuration;

  return {
    wpm,
    fillerWordCount: detectedFillers.length,
    fillerWords: Array.from(new Set(detectedFillers)),
    longestPauseSeconds: Math.round(longestPause * 10) / 10,
    pausesOver1Sec,
    totalSpeakingTimeSeconds: Math.round(totalSpeakingTime * 10) / 10,
    allowedTimeSeconds,
  };
}
