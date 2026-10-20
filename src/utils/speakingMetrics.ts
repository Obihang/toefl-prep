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

export function calculateSpeakingMetrics(
  words: WordTimestamp[] = [],
  transcript: string = '',
  totalAudioDuration: number = 0,
  allowedTimeSeconds?: number
): SpeakingMetrics {
  const tokens = transcript.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length > 0 ? words.length : tokens.length;

  let speakingTime = totalAudioDuration;
  if (!speakingTime || speakingTime <= 0) {
    if (words.length > 0) {
      speakingTime = Math.max(1, words[words.length - 1].end - words[0].start);
    } else {
      speakingTime = 1;
    }
  }

  const minutes = Math.max(0.05, speakingTime / 60);
  const wpm = Math.round(wordCount / minutes);

  // Detect fillers from words or transcript
  const detectedFillers: string[] = [];
  const textWords = (transcript.toLowerCase().match(/\b[a-z']+\b/g) || []);
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
  if (words.length > 1) {
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
    wpm,
    fillerWordCount: detectedFillers.length,
    fillerWords: Array.from(new Set(detectedFillers)),
    longestPauseSeconds: Math.round(longestPause * 10) / 10,
    pausesOver1Sec,
    totalSpeakingTimeSeconds: Math.round(speakingTime * 10) / 10,
    allowedTimeSeconds,
  };
}
