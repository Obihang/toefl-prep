/**
 * Speaking Fluency Metrics for TOEFL Prep Studio
 * Calculates WPM, pause counts, longest pauses, and filler word detection.
 */

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface SpeakingMetrics {
  wpm: number;
  fillerWordCount: number;
  fillerCount?: number;
  fillerWords: string[];
  longestPauseSeconds: number;
  pausesOver1Sec: number;
  pauseCount?: number;
  totalSpeakingTimeSeconds: number;
  allowedTimeSeconds?: number;
}

export const COMMON_FILLERS = new Set([
  'um',
  'uh',
  'uhm',
  'er',
  'erm',
  'ah',
  'hmm',
  'you know',
  'i mean',
]);

// Known Whisper silence hallucination patterns
export const SILENCE_HALLUCINATION_EXACT = [
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
  /^[\s.!?,;:'"\u2026-]+$/,
  /^\.{1,}[\s.!?,]*$/,
];

/**
 * Strips Whisper repetition hallucinations on silent or low-volume audio.
 */
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

  // Check if transcript ends with trailing Whisper hallucination
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

/**
 * Calculates Words Per Minute (WPM) based on word count and active speaking duration in seconds.
 */
export function calculateWpm(wordCount: number, durationSeconds: number): number {
  if (wordCount <= 0 || durationSeconds <= 0) return 0;
  const minutes = Math.max(0.016, durationSeconds / 60);
  return Math.round(wordCount / minutes);
}

/**
 * Words preceding "like" that prove it is used as a verb, preposition, or comparative conjunction
 */
const LIKE_PRECEDING_WORDS = new Set([
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'people', 'students', 'who',
  "don't", "doesn't", "didn't", 'dont', 'doesnt', 'didnt',
  'would', "wouldn't", 'wouldnt', 'should', "shouldn't", 'shouldnt', 'could', "couldn't", 'couldnt',
  'might', 'also', 'really', 'feel', 'feels', 'felt', 'feeling',
  'look', 'looks', 'looked', 'looking', 'sound', 'sounds', 'sounded', 'sounding',
  'seem', 'seems', 'seemed', 'seeming', 'taste', 'tastes', 'smell', 'smells',
  'act', 'acts', 'acted', 'things', 'places', 'activities', 'subjects', 'courses',
  'just', 'more', 'much', 'something', 'anything', 'nothing', 'someone', 'anyone',
  'not', 'such', 'what', 'which', 'quite', 'always', 'still', 'never', 'often',
]);

/**
 * Words following "like" that prove it is used as a preposition, conjunction, or infinitive verb
 */
const LIKE_FOLLOWING_WORDS = new Set([
  'to', 'the', 'a', 'an', 'it', 'this', 'that', 'these', 'those',
  'what', 'how', 'when', 'where', 'why', 'who', 'whom', 'which',
  'my', 'your', 'his', 'her', 'its', 'our', 'their',
  'some', 'any', 'all', 'most', 'many', 'much', 'more',
  'studying', 'working', 'reading', 'living', 'going', 'having', 'doing', 'playing', 'eating', 'using',
  'campus', 'library', 'cafeteria', 'park', 'parks', 'class', 'classes',
]);

/**
 * Detects genuine spoken filler words from text or transcripts.
 * Excludes grammatical uses of "like" (verbs, prepositions, comparative conjunctions).
 * 1-2 natural fillers are normal conversational English per ETS Speaking rubrics.
 */
export function detectFillerWords(transcript: string): {
  fillerCount: number;
  fillerWords: string[];
} {
  const detectedFillers: string[] = [];
  const textWords = transcript.toLowerCase().match(/\b[a-z']+\b/g) || [];

  for (let i = 0; i < textWords.length; i++) {
    const single = textWords[i];

    // Standard genuine hesitation fillers: um, uh, er, ah, etc.
    if (COMMON_FILLERS.has(single)) {
      detectedFillers.push(single);
      continue;
    }

    // Special context-aware check for "like":
    // Only count as filler if NOT preceded by a subject/verb/helper AND NOT followed by an object/clause/article.
    if (single === 'like') {
      const prevWord = i > 0 ? textWords[i - 1] : '';
      const nextWord = i < textWords.length - 1 ? textWords[i + 1] : '';

      const isLegitimatePreceding = LIKE_PRECEDING_WORDS.has(prevWord);
      const isLegitimateFollowing = LIKE_FOLLOWING_WORDS.has(nextWord);

      // Only count "like" as hesitation if it's repeated ("like like") or not used as verb/preposition
      const isRepetition = (nextWord === 'like' || prevWord === 'like');
      if (isRepetition) {
        if (nextWord === 'like') {
          detectedFillers.push('like, like');
        }
      } else if (!isLegitimatePreceding && !isLegitimateFollowing) {
        // Only isolated hesitation or "and like and"
        if (prevWord === 'and' && (nextWord === 'and' || nextWord === 'so' || !nextWord)) {
          detectedFillers.push('like');
        }
      }
    }

    // Check two-word fillers ("you know", "i mean", "sort of", "kind of")
    if (i < textWords.length - 1) {
      const double = `${textWords[i]} ${textWords[i + 1]}`;
      if (COMMON_FILLERS.has(double)) {
        detectedFillers.push(double);
      }
    }
  }

  return {
    fillerCount: detectedFillers.length,
    fillerWords: Array.from(new Set(detectedFillers)),
  };
}

/**
 * 1–2 natural spoken fillers ("um", "uh") are completely normal and natural
 * in conversational TOEFL speaking responses per official ETS Scoring Rubrics.
 */
export function isNaturalFillerCount(count: number): boolean {
  return count <= 2;
}

/**
 * Calculates silence gaps and pause metrics from word timestamps.
 */
export function calculatePauses(words: WordTimestamp[]): {
  longestPauseSeconds: number;
  pausesOver1Sec: number;
  pauseCount: number;
} {
  let longestPause = 0;
  let pausesOver1Sec = 0;

  if (words && words.length > 1) {
    for (let i = 1; i < words.length; i++) {
      const gap = Math.max(0, words[i].start - words[i - 1].end);
      if (gap > longestPause) {
        longestPause = gap;
      }
      if (gap > 1.0) {
        pausesOver1Sec++;
      }
    }
  }

  return {
    longestPauseSeconds: Math.round(longestPause * 10) / 10,
    pausesOver1Sec,
    pauseCount: pausesOver1Sec,
  };
}

/**
 * Calculates comprehensive speaking metrics: WPM, pauses, filler words, and total duration.
 */
export function calculateSpeakingMetrics(
  words: WordTimestamp[] = [],
  transcript: string = '',
  totalAudioDuration: number = 0,
  allowedTimeSeconds?: number
): SpeakingMetrics {
  const { transcript: cleanTranscript, words: cleanWords } = filterWhisperHallucinations(transcript, words);
  const tokens = cleanTranscript.trim().split(/\s+/).filter(Boolean);
  const wordCount = cleanWords.length > 0 ? cleanWords.length : tokens.length;

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

  const wpm = calculateWpm(wordCount, activeSpeakingDuration);
  const { fillerCount, fillerWords } = detectFillerWords(cleanTranscript);
  const { longestPauseSeconds, pausesOver1Sec, pauseCount } = calculatePauses(cleanWords);

  const totalSpeakingTime = totalAudioDuration > 0 ? totalAudioDuration : activeSpeakingDuration;

  return {
    wpm,
    fillerWordCount: fillerCount,
    fillerCount,
    fillerWords,
    longestPauseSeconds,
    pausesOver1Sec,
    pauseCount,
    totalSpeakingTimeSeconds: Math.round(totalSpeakingTime * 10) / 10,
    allowedTimeSeconds,
  };
}
