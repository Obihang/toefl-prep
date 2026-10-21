/**
 * Phonetic & Homophone Alignment for TOEFL Listen & Repeat Practice.
 * Aligns Whisper local STT transcripts against target prompt sentences to correct
 * homophone mishearings (e.g., "here" -> "Hear", "sent in" -> "Sentence", "there" -> "their").
 */

// Soundex implementation for phonetic encoding
export function soundex(word: string): string {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return '';

  const firstLetter = clean[0].toUpperCase();
  const codes: Record<string, string> = {
    b: '1', f: '1', p: '1', v: '1',
    c: '2', g: '2', j: '2', k: '2', q: '2', s: '2', x: '2', z: '2',
    d: '3', t: '3',
    l: '4',
    m: '5', n: '5',
    r: '6',
  };

  let result = firstLetter;
  let prevCode = codes[clean[0]] || '';

  for (let i = 1; i < clean.length; i++) {
    const char = clean[i];
    const code = codes[char] || '';
    if (code && code !== prevCode) {
      result += code;
      if (result.length === 4) break;
    }
    prevCode = code;
  }

  while (result.length < 4) {
    result += '0';
  }

  return result;
}

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// Known English homophones & STT phrase equivalents
const HOMOPHONE_MAP: Record<string, string[]> = {
  hear: ['here'],
  here: ['hear'],
  sentence: ['sent in', 'sent-in', 'sent inn', 'sent a', 'centre', 'senten', 'sentin'],
  their: ['there', "they're"],
  there: ['their', "they're"],
  "they're": ['there', 'their'],
  to: ['two', 'too'],
  two: ['to', 'too'],
  too: ['to', 'two'],
  for: ['four', 'fore'],
  four: ['for'],
  write: ['right', 'rite'],
  right: ['write'],
  know: ['no'],
  no: ['know'],
  new: ['knew'],
  knew: ['new'],
  where: ['wear', 'ware'],
  wear: ['where'],
  our: ['hour'],
  hour: ['our'],
  by: ['buy', 'bye'],
  buy: ['by'],
  site: ['cite', 'sight'],
  cite: ['site'],
  lab: ['laboratory'],
  laboratory: ['lab', 'labs'],
  task: ['tasc', 'tack', 'tash', 'just'],
  guidelines: ['guideline', 'guide lines'],
};

/**
 * Aligns STT transcript against target sentence by substituting homophones,
 * phonetic equivalents (Soundex match), and close Levenshtein matches.
 */
export function alignHomophonesAndPhonetics(
  transcript: string,
  targetSentence: string
): string {
  if (!transcript.trim() || !targetSentence.trim()) return transcript;

  const rawTargetWords = targetSentence.split(/\s+/).filter(Boolean);
  const targetWordsClean = rawTargetWords.map((w) => w.toLowerCase().replace(/[^a-z0-9']/g, ''));
  const targetSoundex = targetWordsClean.map(soundex);

  const rawTranscriptWords = transcript.split(/\s+/).filter(Boolean);
  const transcriptWordsClean = rawTranscriptWords.map((w) => w.toLowerCase().replace(/[^a-z0-9']/g, ''));

  const resultWords = [...rawTranscriptWords];

  for (let i = 0; i < rawTranscriptWords.length; i++) {
    const single = transcriptWordsClean[i];
    if (!single) continue;

    const double = i < rawTranscriptWords.length - 1 ? `${single} ${transcriptWordsClean[i + 1]}` : '';

    // Search target words nearby (within +-3 index window)
    const targetIdx = Math.min(i, targetWordsClean.length - 1);
    const searchStart = Math.max(0, targetIdx - 3);
    const searchEnd = Math.min(targetWordsClean.length - 1, targetIdx + 3);

    for (let t = searchStart; t <= searchEnd; t++) {
      const targetClean = targetWordsClean[t];
      const origTarget = rawTargetWords[t].replace(/[^a-zA-Z0-9']/g, '');

      // Check double-word bigram match (e.g. "sent in" matches "sentence")
      if (double && HOMOPHONE_MAP[targetClean]?.includes(double)) {
        resultWords[i] = origTarget;
        resultWords[i + 1] = '';
        break;
      }

      // Check single-word homophone match (e.g. "here" matches "Hear")
      if (HOMOPHONE_MAP[targetClean]?.includes(single)) {
        resultWords[i] = origTarget;
        break;
      }

      // Check Soundex or Levenshtein match
      if (single.length >= 3 && targetClean.length >= 3) {
        const dist = levenshteinDistance(single, targetClean);
        const sndMatch = targetSoundex[t] && soundex(single) === targetSoundex[t];

        if (dist <= 2 || (sndMatch && dist <= 3)) {
          const trailingPunct = rawTranscriptWords[i].match(/[^a-zA-Z0-9']+$/)?.[0] || '';
          resultWords[i] = origTarget + trailingPunct;
          break;
        }
      }
    }
  }

  return resultWords.filter(Boolean).join(' ');
}
