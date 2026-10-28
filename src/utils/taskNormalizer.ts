import {
  LEVELS,
  ACADEMIC_TOPICS,
  Level,
  AcademicTopic,
  isValidLevel,
  isValidAcademicTopic,
} from '../constants/filters';
import { TASK_DEFINITIONS, TaskTypeId } from '../types/taskTypes';
import { inferGender } from './voices';

const CANONICAL_TASK_IDS = new Set<string>(TASK_DEFINITIONS.map((t) => t.id));

const TASK_TYPE_ALIASES: Record<string, TaskTypeId> = {
  'complete-words': 'complete-words',
  complete_words: 'complete-words',
  completewords: 'complete-words',
  'c-test': 'complete-words',
  'reading-passage': 'reading-passage',
  reading_passage: 'reading-passage',
  reading_academic: 'reading-passage',
  'reading-academic': 'reading-passage',
  reading: 'reading-passage',
  'listening-dialogue': 'listening-dialogue',
  listening_dialogue: 'listening-dialogue',
  'listening-lecture': 'listening-dialogue',
  listening_lecture: 'listening-dialogue',
  listening: 'listening-dialogue',
  'listen-repeat': 'listen-repeat',
  listen_repeat: 'listen-repeat',
  'speaking-listen-repeat': 'listen-repeat',
  speaking_listen_repeat: 'listen-repeat',
  'speaking-interview': 'speaking-interview',
  speaking_interview: 'speaking-interview',
  interview: 'speaking-interview',
  'build-sentence': 'build-sentence',
  build_sentence: 'build-sentence',
  'writing-build-sentence': 'build-sentence',
  writing_build_sentence: 'build-sentence',
  'write-email': 'write-email',
  write_email: 'write-email',
  'writing-email': 'write-email',
  writing_email: 'write-email',
  email: 'write-email',
  'academic-discussion': 'academic-discussion',
  academic_discussion: 'academic-discussion',
  'writing-discussion': 'academic-discussion',
  writing_discussion: 'academic-discussion',
  discussion: 'academic-discussion',
};

const DIFFICULTY_ALIASES: Record<string, Level> = {
  beginner: 'beginner',
  easy: 'beginner',
  basic: 'beginner',
  foundation: 'beginner',
  a1: 'beginner',
  a2: 'beginner',
  intermediate: 'intermediate',
  medium: 'intermediate',
  moderate: 'intermediate',
  standard: 'intermediate',
  b1: 'intermediate',
  b2: 'intermediate',
  'b1-b2': 'intermediate',
  'upper-intermediate': 'upper-intermediate',
  upper_intermediate: 'upper-intermediate',
  upperintermediate: 'upper-intermediate',
  'upper intermediate': 'upper-intermediate',
  'b2-c1': 'upper-intermediate',
  high: 'upper-intermediate',
  advanced: 'advanced',
  hard: 'advanced',
  difficult: 'advanced',
  expert: 'advanced',
  c1: 'advanced',
  c2: 'advanced',
  'c1-c2': 'advanced',
};

const TOPIC_ALIASES: Record<string, AcademicTopic> = {
  'science-tech': 'science-tech',
  science_tech: 'science-tech',
  'science & technology': 'science-tech',
  science: 'science-tech',
  technology: 'science-tech',
  biology: 'science-tech',
  chemistry: 'science-tech',
  physics: 'science-tech',
  astronomy: 'science-tech',
  neuroscience: 'science-tech',
  medicine: 'science-tech',
  engineering: 'science-tech',
  'computer-science': 'science-tech',
  'campus-life': 'campus-life',
  campus_life: 'campus-life',
  'campus life': 'campus-life',
  'campus life & academics': 'campus-life',
  campus: 'campus-life',
  education: 'campus-life',
  university: 'campus-life',
  academics: 'campus-life',
  student: 'campus-life',
  'social-sciences': 'social-sciences',
  social_sciences: 'social-sciences',
  'social sciences': 'social-sciences',
  'social sciences & history': 'social-sciences',
  psychology: 'social-sciences',
  sociology: 'social-sciences',
  anthropology: 'social-sciences',
  history: 'social-sciences',
  archaeology: 'social-sciences',
  linguistics: 'social-sciences',
  'political-science': 'social-sciences',
  environment: 'environment',
  'ecology & environment': 'environment',
  ecology: 'environment',
  climate: 'environment',
  geology: 'environment',
  earth: 'environment',
  conservation: 'environment',
  sustainability: 'environment',
  'business-economics': 'business-economics',
  business_economics: 'business-economics',
  'business & economics': 'business-economics',
  business: 'business-economics',
  economics: 'business-economics',
  finance: 'business-economics',
  management: 'business-economics',
  marketing: 'business-economics',
  trade: 'business-economics',
  'arts-humanities': 'arts-humanities',
  arts_humanities: 'arts-humanities',
  'arts & humanities': 'arts-humanities',
  arts: 'arts-humanities',
  humanities: 'arts-humanities',
  literature: 'arts-humanities',
  philosophy: 'arts-humanities',
  art: 'arts-humanities',
  music: 'arts-humanities',
  architecture: 'arts-humanities',
  theatrical: 'arts-humanities',
};

const TOPIC_KEYWORD_RULES: Array<{ topic: AcademicTopic; pattern: RegExp }> = [
  {
    topic: 'campus-life',
    pattern:
      /\b(registrar|dormitory|dormitories|syllabus|syllabi|semester|undergraduate|advisor|counselor|tuition|scholarship|library|librarian|internship|coursework|enrollment|campus|faculty|commencement|capstone|prerequisite|lecture hall|office hours|student union)\b/i,
  },
  {
    topic: 'environment',
    pattern:
      /\b(ecosystem|biodiversity|deforestation|glacier|permafrost|climate|carbon dioxide|emission|acidification|coral|reef|wetland|estuary|pollution|drought|renewable|solar|hydrothermal|albedo|evapotranspiration|conservation|habitat|erosion|forestry|atmosphere)\b/i,
  },
  {
    topic: 'business-economics',
    pattern:
      /\b(inflation|monetary|central bank|tariff|supply chain|monopoly|elasticity|utility|commodity|marginal|macroeconomic|microeconomic|entrepreneur|subsidy|subsidies|fiscal|revenue|market|consumer|investment|portfolio|recession|currency|trade deficit|pricing)\b/i,
  },
  {
    topic: 'arts-humanities',
    pattern:
      /\b(renaissance|painting|sculpture|museum|curator|exhibition|symphony|acoustic|portrait|rhetoric|aristotelian|mythology|literary|poetry|avant-garde|surrealist|trompe|vanitas|fresco|architecture|classical|philosopher|aesthetic|manuscript)\b/i,
  },
  {
    topic: 'social-sciences',
    pattern:
      /\b(archaeology|archaeological|mayan|mesopotamian|cuneiform|anthropology|ethnographic|indigenous|sociology|cognitive bias|kahneman|framing effect|demographic|urbanization|civilization|linguistic|dialect|bilingual|voter|questionnaire)\b/i,
  },
  {
    topic: 'science-tech',
    pattern:
      /\b(neuron|synaptic|plasticity|dna|rna|histone|epigenetic|chloroplast|photosynthesis|quantum|algorithm|spectrophotometer|centrifuge|carbocation|peroxide|nucleosynthesis|supernova|seismometer|tectonic|cetacean|echolocation|avian|metabolism|enzyme)\b/i,
  },
];

const CTEST_STOPWORDS = new Set([
  'that',
  'with',
  'from',
  'this',
  'they',
  'have',
  'were',
  'been',
  'into',
  'only',
  'also',
  'more',
  'most',
  'some',
  'such',
  'than',
  'then',
  'them',
  'what',
  'when',
  'where',
  'which',
  'while',
  'your',
  'their',
  'there',
  'these',
  'those',
  'would',
  'could',
  'should',
  'about',
  'after',
  'other',
  'under',
  'until',
  'very',
  'well',
  'will',
  'each',
  'both',
  'much',
  'many',
  'over',
  'upon',
  'even',
  'does',
  'done',
  'made',
  'make',
  'like',
]);

const SENTENCE_ABBREVIATIONS = new Set([
  'dr.',
  'mr.',
  'mrs.',
  'ms.',
  'prof.',
  'st.',
  'jr.',
  'sr.',
  'vs.',
  'etc.',
  'e.g.',
  'i.e.',
  'fig.',
  'vol.',
  'no.',
]);

export interface NormalizedBlankItem {
  index: number;
  prefix: string;
  answer: string;
  fullWord: string;
}

export function canonicalizeTaskType(rawType?: string): TaskTypeId {
  const cleaned = String(rawType || '')
    .trim()
    .toLowerCase();
  if (TASK_TYPE_ALIASES[cleaned]) {
    return TASK_TYPE_ALIASES[cleaned];
  }
  if (CANONICAL_TASK_IDS.has(cleaned)) {
    return cleaned as TaskTypeId;
  }
  return 'academic-discussion';
}

export function normalizeDifficultyLabel(rawLevel?: any): Level {
  const cleaned = String(rawLevel || '')
    .trim()
    .toLowerCase();
  if (isValidLevel(cleaned)) {
    return cleaned;
  }
  if (DIFFICULTY_ALIASES[cleaned]) {
    return DIFFICULTY_ALIASES[cleaned];
  }
  if (cleaned.includes('upper')) return 'upper-intermediate';
  if (cleaned.includes('adv') || cleaned.includes('c1') || cleaned.includes('hard')) return 'advanced';
  if (cleaned.includes('beg') || cleaned.includes('easy') || cleaned.includes('a1') || cleaned.includes('a2')) {
    return 'beginner';
  }
  return 'intermediate';
}

export function normalizeTopicLabel(rawTopic?: any, fallbackContent?: any): AcademicTopic {
  const cleaned = String(rawTopic || '')
    .trim()
    .toLowerCase();
  if (isValidAcademicTopic(cleaned)) {
    return cleaned;
  }
  if (TOPIC_ALIASES[cleaned]) {
    return TOPIC_ALIASES[cleaned];
  }

  const textBlob = JSON.stringify(fallbackContent || '').toLowerCase();
  for (const rule of TOPIC_KEYWORD_RULES) {
    if (rule.pattern.test(textBlob)) {
      return rule.topic;
    }
  }

  return 'science-tech';
}

/**
 * Deterministically normalizes any "Complete the Words" (C-Test) task according to
 * strict 2026 TOEFL iBT specifications:
 * 1. Merges separated compound words like "[nano] particles" -> "nanoparticles".
 * 2. Reconstructs full unblanked words from any bracket placement ([penetr]ate, [[penetr]]ate,
 *    integr[ation], [integration], etc.).
 * 3. Keeps Sentence 1 (the first sentence) 100% intact with zero blanks.
 * 4. Enforces that every blanked word is a single complete English word of at least 6 letters
 *    (fullWord.length >= 6) so prefix is ALWAYS >= 3 letters and answer is ALWAYS >= 3 letters:
 *    prefixLen = Math.floor(fullWord.length / 2)
 *    prefix = fullWord.slice(0, prefixLen) (always >= 3 letters)
 *    answer = fullWord.slice(prefixLen) (always >= 3 letters)
 *    Formatted as `${prefix}[[${answer}]]` with ZERO trailing suffix letters.
 * 5. Enforces 10 blanks per passage and derives `blanks` strictly from the validated tokens.
 */
export function normalizeCompleteWordsTask(raw: any): {
  title: string;
  text: string;
  totalBlanks: number;
  blanks: NormalizedBlankItem[];
  explanation?: string;
} {
  const fallbackText =
    'Synaptic plasticity is the biological foundation of human learning and memory consolidation. Neurosc[[ientists]] have disco[[vered]] that syna[[pses]] stren[[gthen]] thr[[ough]] repe[[ated]] elect[[rical]] stimu[[lation]]. This pheno[[menon]] ena[[bles]] cere[[bral]] circ[[uits]] to retain complex information across decades.';

  const title = String(raw?.title || 'Complete the Words').trim() || 'Complete the Words';
  let rawText = String(raw?.text || raw?.passage || raw?.content?.text || '').trim();
  if (!rawText || rawText.length < 40) {
    rawText = fallbackText;
  }

  // Merge separated compound words where a bracketed prefix is separated by a space from its stem,
  // e.g., "[nano] particles" or "[[nano]] particles" -> "[nano]particles"
  rawText = rawText.replace(
    /(\[+[a-zA-Z]{2,8}\]+)\s+(particles|particle|chemical|chemicals|chemistry|logical|biology|biological|diversity|systems|system|organisms|organism|synthesis|synthetic|scientists|scientist|science|economic|economics|disciplinary|graduates|graduate|structure|structures|conductors|conductor|dynamics|thermal|magnetic|climate|climatologists|sphere|spheres|technology|technologies|medicine|medical|mechanics|mechanical|analysis|analytics|network|networks|plasticity|vascular|cellular|molecular)\b/gi,
    '$1$2'
  );
  // Also merge reverse separated compounds like "nano [particles]" or "nano [[particles]]" -> "nano[[particles]]"
  rawText = rawText.replace(
    /\b(nano|bio|neuro|eco|micro|macro|photo|chemo|inter|paleo|electro|socio|thermo|hydro|multi|semi|super|under|over|trans|infra|auto|cardio|geo|astro|cyber|radio)\s+(\[+[a-zA-Z]{3,}\]+)/gi,
    '$1$2'
  );

  const rawTokens = rawText.split(/(\s+)/);

  interface ParsedToken {
    isWhitespace: boolean;
    rawToken: string;
    leadingPunct: string;
    fullWord: string;
    trailingPunct: string;
    hadBracket: boolean;
    isPureAlphaWord: boolean;
    sentenceIndex: number;
    shouldBlank: boolean;
  }

  const parsedTokens: ParsedToken[] = [];
  let currentSentenceIndex = 0;

  for (let i = 0; i < rawTokens.length; i++) {
    const tok = rawTokens[i];
    if (/^\s+$/.test(tok) || tok === '') {
      parsedTokens.push({
        isWhitespace: true,
        rawToken: tok,
        leadingPunct: '',
        fullWord: '',
        trailingPunct: '',
        hadBracket: false,
        isPureAlphaWord: false,
        sentenceIndex: currentSentenceIndex,
        shouldBlank: false,
      });
      continue;
    }

    const hadBracket = tok.includes('[') && tok.includes(']');
    // Strip all square brackets from the token to recover the full unbroken word
    const stripped = tok.replace(/\[+|\]+/g, '');

    // Separate leading punctuation, core word characters, and trailing punctuation
    const match = stripped.match(/^([^a-zA-Z0-9]*)(.*?)([^a-zA-Z0-9]*)$/);
    const leadingPunct = match ? match[1] : '';
    const fullWord = match ? match[2] : stripped;
    const trailingPunct = match ? match[3] : '';
    const isPureAlphaWord = /^[a-zA-Z]+$/.test(fullWord);

    const thisSentenceIdx = currentSentenceIndex;

    // Detect end of sentence
    const lowerWithTrailing = (fullWord + trailingPunct).toLowerCase();
    if (
      /[.!?]/.test(trailingPunct) &&
      !SENTENCE_ABBREVIATIONS.has(lowerWithTrailing) &&
      fullWord.length > 1
    ) {
      currentSentenceIndex++;
    }

    parsedTokens.push({
      isWhitespace: false,
      rawToken: tok,
      leadingPunct,
      fullWord,
      trailingPunct,
      hadBracket,
      isPureAlphaWord,
      sentenceIndex: thisSentenceIdx,
      shouldBlank: false,
    });
  }

  // If the entire passage was written as 1 giant sentence without periods, treat the first 12 words as Sentence 0
  const hasSentence2 = parsedTokens.some((t) => !t.isWhitespace && t.sentenceIndex >= 1);
  if (!hasSentence2) {
    let wordCounter = 0;
    for (const pt of parsedTokens) {
      if (!pt.isWhitespace) {
        wordCounter++;
        if (wordCounter > 12) {
          pt.sentenceIndex = 1;
        }
      }
    }
  }

  // Step 1: Mark existing valid bracketed words in Sentence 2+ (sentenceIndex >= 1)
  // Any bracketed word < 6 letters (e.g. "side", "nano", "into") is automatically unblanked!
  const selectedIndices: number[] = [];
  for (let i = 0; i < parsedTokens.length; i++) {
    const pt = parsedTokens[i];
    if (pt.isWhitespace) continue;
    // Sentence 1 (sentenceIndex === 0) must NEVER have blanks
    if (pt.sentenceIndex === 0) {
      pt.shouldBlank = false;
      continue;
    }
    if (
      pt.hadBracket &&
      pt.isPureAlphaWord &&
      pt.fullWord.length >= 6 &&
      !CTEST_STOPWORDS.has(pt.fullWord.toLowerCase())
    ) {
      if (selectedIndices.length < 10) {
        pt.shouldBlank = true;
        selectedIndices.push(i);
      }
    }
  }

  // Step 2: If fewer than 10 blanks exist in Sentence 2+, auto-select additional 6+ letter academic words
  if (selectedIndices.length < 10) {
    const needed = 10 - selectedIndices.length;
    const candidateIndices: number[] = [];
    for (let i = 0; i < parsedTokens.length; i++) {
      const pt = parsedTokens[i];
      if (pt.isWhitespace || pt.sentenceIndex === 0 || pt.shouldBlank) continue;
      if (
        pt.isPureAlphaWord &&
        pt.fullWord.length >= 6 &&
        pt.fullWord.length <= 15 &&
        !CTEST_STOPWORDS.has(pt.fullWord.toLowerCase())
      ) {
        candidateIndices.push(i);
      }
    }

    // If still fewer than needed (e.g. any >15 letter academic words), include >= 6 letters without upper cap
    if (candidateIndices.length < needed) {
      for (let i = 0; i < parsedTokens.length; i++) {
        const pt = parsedTokens[i];
        if (pt.isWhitespace || pt.sentenceIndex === 0 || pt.shouldBlank) continue;
        if (
          !candidateIndices.includes(i) &&
          pt.isPureAlphaWord &&
          pt.fullWord.length >= 6 &&
          !CTEST_STOPWORDS.has(pt.fullWord.toLowerCase())
        ) {
          candidateIndices.push(i);
        }
      }
    }

    if (candidateIndices.length <= needed) {
      for (const cIdx of candidateIndices) {
        parsedTokens[cIdx].shouldBlank = true;
        selectedIndices.push(cIdx);
      }
    } else {
      // Space selections evenly across candidateIndices
      for (let k = 0; k < needed; k++) {
        const pickPos = Math.min(
          candidateIndices.length - 1,
          Math.floor(((k + 0.5) * candidateIndices.length) / needed)
        );
        let chosenTokenIdx = candidateIndices[pickPos];
        if (parsedTokens[chosenTokenIdx].shouldBlank) {
          const alt = candidateIndices.find((idx) => !parsedTokens[idx].shouldBlank);
          if (alt !== undefined) chosenTokenIdx = alt;
        }
        if (!parsedTokens[chosenTokenIdx].shouldBlank) {
          parsedTokens[chosenTokenIdx].shouldBlank = true;
          selectedIndices.push(chosenTokenIdx);
        }
      }
    }
  }

  // Step 3: Build final normalized text and blanks array strictly from validated prefix[[answer]] tokens
  const blanks: NormalizedBlankItem[] = [];
  let blankCounter = 0;

  const rebuiltTokens = parsedTokens.map((pt) => {
    if (pt.isWhitespace) return pt.rawToken;
    if (!pt.shouldBlank || blankCounter >= 10 || pt.fullWord.length < 6) {
      return `${pt.leadingPunct}${pt.fullWord}${pt.trailingPunct}`;
    }

    const fullWord = pt.fullWord;
    const prefixLen = Math.floor(fullWord.length / 2);
    const prefix = fullWord.slice(0, prefixLen);
    const answer = fullWord.slice(prefixLen);

    blanks.push({
      index: blankCounter,
      prefix,
      answer,
      fullWord,
    });
    blankCounter++;

    return `${pt.leadingPunct}${prefix}[[${answer}]]${pt.trailingPunct}`;
  });

  const normalizedText = rebuiltTokens.join('');

  return {
    title,
    text: normalizedText,
    totalBlanks: blanks.length,
    blanks,
    ...(raw?.explanation ? { explanation: String(raw.explanation) } : {}),
  };
}

function tokenizeSentenceWords(sentence: string): string[] {
  return (sentence || '')
    .trim()
    .replace(/[.!?;:,]+$/g, '')
    .split(/\s+/)
    .map((w) => w.replace(/^[,;:.!?()"']+|[.!?;:,()"']+$/g, ''))
    .filter(Boolean);
}

function haveSameWordMultiset(wordsA: string[], wordsB: string[]): boolean {
  if (wordsA.length !== wordsB.length || wordsA.length === 0) return false;
  const countMap = new Map<string, number>();
  for (const w of wordsA) {
    const key = w.toLowerCase();
    countMap.set(key, (countMap.get(key) || 0) + 1);
  }
  for (const w of wordsB) {
    const key = w.toLowerCase();
    const prev = countMap.get(key) || 0;
    if (prev <= 0) return false;
    if (prev === 1) countMap.delete(key);
    else countMap.set(key, prev - 1);
  }
  return countMap.size === 0;
}

function deterministicScrambleWords(targetWords: string[], seedStr: string): string[] {
  if (targetWords.length <= 1) return [...targetWords];
  const arr = [...targetWords];
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
  }
  for (let i = arr.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  // Ensure scrambled order is never identical to original sentence order
  const isIdentical = arr.every((w, idx) => w === targetWords[idx]);
  if (isIdentical && arr.length >= 2) {
    const first = arr[0];
    arr[0] = arr[arr.length - 1];
    arr[arr.length - 1] = first;
    if (arr.every((w, idx) => w === targetWords[idx]) && arr.length >= 3) {
      const mid = arr[1];
      arr[1] = arr[0];
      arr[0] = mid;
    }
  }
  return arr;
}

function sanitizeBuildSentenceContext(rawContext: string, answerSentence: string, index: number): string {
  const fallbackPrompts = [
    'What did the faculty committee conclude after reviewing the departmental curriculum report?',
    'How do researchers explain the unexpected outcome observed during the laboratory trial?',
    'Why did the university administration revise the campus sustainability guidelines this semester?',
    'What factor primarily influences student participation in interdisciplinary research seminars?',
    'How does the new municipal policy affect public transit ridership during peak hours?',
  ];
  const cleanCtx = (rawContext || '').trim();
  const cleanAns = (answerSentence || '').trim();
  if (!cleanCtx || cleanCtx.length < 12) {
    return fallbackPrompts[index % fallbackPrompts.length];
  }
  const normCtx = cleanCtx.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const normAns = cleanAns.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  if (!normAns) return cleanCtx;

  // Reject context if it contains or equals the answer sentence
  if (normCtx === normAns || normCtx.includes(normAns) || normAns.includes(normCtx)) {
    return fallbackPrompts[index % fallbackPrompts.length];
  }

  // Also check word overlap ratio: if >= 70% of the answer content words appear in sequence in context, replace it
  const ansWords = tokenizeSentenceWords(cleanAns).map((w) => w.toLowerCase());
  const ctxWords = new Set(tokenizeSentenceWords(cleanCtx).map((w) => w.toLowerCase()));
  const contentAnsWords = ansWords.filter((w) => w.length > 3);
  if (contentAnsWords.length >= 4) {
    const overlap = contentAnsWords.filter((w) => ctxWords.has(w)).length;
    if (overlap / contentAnsWords.length >= 0.75) {
      return fallbackPrompts[index % fallbackPrompts.length];
    }
  }

  return cleanCtx;
}

const FALLBACK_BUILD_SENTENCE_ITEMS = [
  {
    context: 'What did recent laboratory trials conclude about how neural networks adapt over time?',
    answer: 'Substantial empirical evidence supports the hypothesis regarding synaptic plasticity.',
    explanation:
      'Subject noun phrase ("Substantial empirical evidence") + transitive verb ("supports") + direct object ("the hypothesis regarding synaptic plasticity").',
  },
  {
    context: 'How can multinational manufacturers protect their operations against sudden supply disruptions?',
    answer: 'Diversified sourcing strategies mitigate the financial impact of regional shortages.',
    explanation:
      'Plural subject ("Diversified sourcing strategies") + verb ("mitigate") + direct object ("the financial impact of regional shortages").',
  },
  {
    context: 'Why did the university library extend its operating hours during the final examination period?',
    answer: 'Undergraduate students requested additional quiet study spaces for collaborative projects.',
    explanation:
      'Subject ("Undergraduate students") + past verb ("requested") + object ("additional quiet study spaces for collaborative projects").',
  },
  {
    context: 'How do coastal wetlands help mitigate the effects of rising atmospheric carbon levels?',
    answer: 'Estuarine marshes sequester significant quantities of carbon within anaerobic sediments.',
    explanation:
      'Subject ("Estuarine marshes") + transitive verb ("sequester") + object ("significant quantities of carbon within anaerobic sediments").',
  },
  {
    context: 'What requirement must students fulfill before registering for the advanced econometrics seminar?',
    answer: 'Applicants must complete introductory statistical modeling before enrolling in econometrics.',
    explanation:
      'Subject ("Applicants") + modal verb phrase ("must complete") + object ("introductory statistical modeling") + temporal clause.',
  },
];

export function normalizeBuildSentenceItem(
  it: any,
  idx: number = 0,
  _topic?: string,
  _title?: string
): {
  context: string;
  words: string[];
  scrambledWords: string[];
  answer: string;
  correctSentence: string;
  explanation: string;
} {
  const fb = FALLBACK_BUILD_SENTENCE_ITEMS[idx % FALLBACK_BUILD_SENTENCE_ITEMS.length];
  const rawAns = String(it?.answer || it?.correctSentence || it?.targetSentence || it?.sentence || fb.answer).trim();
  const cleanAnswer = /[.!?]$/.test(rawAns) ? rawAns : `${rawAns}.`;
  const targetWords = tokenizeSentenceWords(cleanAnswer);

  const candidateWordsRaw = Array.isArray(it?.words)
    ? it.words
    : Array.isArray(it?.scrambledWords)
    ? it.scrambledWords
    : Array.isArray(it?.chunks)
    ? it.chunks
    : [];
  const candidateWords = candidateWordsRaw
    .map((w: any) => String(w || '').replace(/^[,;:.!?()"']+|[.!?;:,()"']+$/g, '').trim())
    .filter(Boolean);

  const isExactMatch =
    haveSameWordMultiset(candidateWords, targetWords) &&
    !candidateWords.every((w: string, i: number) => w === targetWords[i]);

  const finalScrambled = isExactMatch
    ? candidateWords
    : deterministicScrambleWords(targetWords, `${cleanAnswer}-${idx}`);

  const cleanContext = sanitizeBuildSentenceContext(
    String(it?.context || it?.prompt || ''),
    cleanAnswer,
    idx
  );

  return {
    context: cleanContext,
    words: finalScrambled,
    scrambledWords: finalScrambled,
    answer: cleanAnswer,
    correctSentence: cleanAnswer,
    explanation: String(
      it?.explanation ||
        it?.why ||
        'Follow standard academic English subject-verb-object word order and modifier placement.'
    ).trim(),
  };
}

export function normalizeBuildSentenceTask(raw: any): {
  title: string;
  items: Array<{
    context: string;
    words: string[];
    scrambledWords: string[];
    answer: string;
    correctSentence: string;
    explanation: string;
  }>;
} {
  const title = String(raw?.title || 'Build a Sentence: Academic Syntax').trim() || 'Build a Sentence: Academic Syntax';
  const rawItems: any[] = Array.isArray(raw?.items)
    ? raw.items
    : Array.isArray(raw?.questions)
    ? raw.questions
    : raw?.answer || raw?.correctSentence
    ? [raw]
    : [];

  const normalizedItems: Array<{
    context: string;
    words: string[];
    scrambledWords: string[];
    answer: string;
    correctSentence: string;
    explanation: string;
  }> = [];

  for (let idx = 0; idx < rawItems.length; idx++) {
    const it = rawItems[idx];
    if (!it || typeof it !== 'object') continue;
    const rawAns = String(it.answer || it.correctSentence || it.targetSentence || it.sentence || '').trim();
    if (!rawAns || rawAns.length < 15) continue;

    // Ensure terminal period
    const cleanAnswer = /[.!?]$/.test(rawAns) ? rawAns : `${rawAns}.`;
    const targetWords = tokenizeSentenceWords(cleanAnswer);
    if (targetWords.length < 5) continue;

    const candidateWordsRaw = Array.isArray(it.words)
      ? it.words
      : Array.isArray(it.scrambledWords)
      ? it.scrambledWords
      : Array.isArray(it.chunks)
      ? it.chunks
      : [];
    const candidateWords = candidateWordsRaw
      .map((w: any) => String(w || '').replace(/^[,;:.!?()"']+|[.!?;:,()"']+$/g, '').trim())
      .filter(Boolean);

    const isExactMatch =
      haveSameWordMultiset(candidateWords, targetWords) &&
      !candidateWords.every((w: string, i: number) => w === targetWords[i]);

    const finalScrambled = isExactMatch
      ? candidateWords
      : deterministicScrambleWords(targetWords, `${cleanAnswer}-${idx}`);

    const cleanContext = sanitizeBuildSentenceContext(
      String(it.context || it.prompt || ''),
      cleanAnswer,
      idx
    );

    normalizedItems.push({
      context: cleanContext,
      words: finalScrambled,
      scrambledWords: finalScrambled,
      answer: cleanAnswer,
      correctSentence: cleanAnswer,
      explanation: String(
        it.explanation ||
          it.why ||
          'Follow standard academic English subject-verb-object word order and modifier placement.'
      ).trim(),
    });
  }

  // Ensure every Build a Sentence task has 5 items
  let fallbackIdx = 0;
  while (normalizedItems.length < 5 && fallbackIdx < FALLBACK_BUILD_SENTENCE_ITEMS.length) {
    const fb = FALLBACK_BUILD_SENTENCE_ITEMS[fallbackIdx++];
    if (normalizedItems.some((existing) => existing.answer === fb.answer)) continue;
    const targetWords = tokenizeSentenceWords(fb.answer);
    const scrambled = deterministicScrambleWords(targetWords, fb.answer);
    normalizedItems.push({
      context: fb.context,
      words: scrambled,
      scrambledWords: scrambled,
      answer: fb.answer,
      correctSentence: fb.answer,
      explanation: fb.explanation,
    });
  }

  return {
    title,
    items: normalizedItems.slice(0, 5),
  };
}

const FALLBACK_LISTEN_REPEAT_SENTENCES = [
  'Please submit your laboratory safety forms before Friday afternoon.',
  'The university library recently expanded its digital archive of historical manuscripts.',
  'Undergraduate researchers must calibrate the optical spectrophotometer prior to analyzing chemical samples.',
  'Microeconomic theory suggests that consumer price elasticity varies significantly across essential commodity markets.',
  'Paleoclimatologists examine microscopic marine fossils within sediment cores to reconstruct prehistoric oceanic temperatures.',
  'Interdisciplinary collaboration between structural engineers and urban ecologists fosters resilient metropolitan infrastructure design.',
  'Neuroimaging studies demonstrate that sustained bilingual communication strengthens executive control networks across the prefrontal cortex.',
];

export function normalizeTaskContent(taskType: string, rawTask: any): any {
  const canonicalType = canonicalizeTaskType(taskType);
  const task = rawTask && typeof rawTask === 'object' ? (rawTask.content && typeof rawTask.content === 'object' && !rawTask.title ? { ...rawTask, ...rawTask.content } : rawTask) : {};

  switch (canonicalType) {
    case 'complete-words': {
      const cw = normalizeCompleteWordsTask(task);
      return {
        ...task,
        title: cw.title,
        text: cw.text,
        totalBlanks: cw.totalBlanks,
        blanks: cw.blanks,
      };
    }

    case 'build-sentence': {
      const bs = normalizeBuildSentenceTask(task);
      return {
        ...task,
        title: bs.title,
        items: bs.items,
      };
    }

    case 'listen-repeat': {
      const title = String(task.title || 'Campus & Academic Listen and Repeat').trim();
      const speakerName = String(task.speakerName || 'Dr. Evelyn Vance (Female)').trim();
      const speakerGender =
        task.speakerGender === 'male' || task.speakerGender === 'female'
          ? task.speakerGender
          : inferGender(speakerName);

      let rawSentences: string[] = Array.isArray(task.sentences)
        ? task.sentences.map((s: any) => String(typeof s === 'string' ? s : s?.sentence || s?.text || '').trim()).filter(Boolean)
        : Array.isArray(task.items)
        ? task.items.map((s: any) => String(typeof s === 'string' ? s : s?.sentence || s?.text || '').trim()).filter(Boolean)
        : [];

      // Filter out overly short fragments (< 5 words)
      rawSentences = rawSentences.filter((s) => s.split(/\s+/).filter(Boolean).length >= 5);

      let fbIdx = 0;
      while (rawSentences.length < 7 && fbIdx < FALLBACK_LISTEN_REPEAT_SENTENCES.length) {
        const candidate = FALLBACK_LISTEN_REPEAT_SENTENCES[fbIdx++];
        if (!rawSentences.includes(candidate)) {
          rawSentences.push(candidate);
        }
      }

      return {
        ...task,
        title,
        speakerName,
        speakerGender,
        sentences: rawSentences.slice(0, 7),
      };
    }

    case 'speaking-interview': {
      const title = String(task.title || 'Academic Research & Policy Interview').trim();
      const context = String(
        task.context ||
          'You are participating in a structured academic interview regarding university policy and contemporary research.'
      ).trim();
      const interviewerName = String(task.interviewerName || 'Professor Arthur Miller (Male)').trim();
      const interviewerGender =
        task.interviewerGender === 'male' || task.interviewerGender === 'female'
          ? task.interviewerGender
          : inferGender(interviewerName);

      const rawQs = Array.isArray(task.questions) ? task.questions : [];
      const normalizedQs = rawQs
        .map((q: any) => {
          const qText = String(typeof q === 'string' ? q : q?.question || q?.prompt || '').trim();
          if (!qText) return null;
          return {
            question: qText,
            prepTimeSeconds: Number(q?.prepTimeSeconds) || 15,
            responseTimeSeconds: Number(q?.responseTimeSeconds) || 45,
            suggestedPoints:
              Array.isArray(q?.suggestedPoints) && q.suggestedPoints.length > 0
                ? q.suggestedPoints.map(String)
                : [
                    'State your primary position clearly',
                    'Support your argument with a concrete academic or personal example',
                    'Synthesize the broader implications of your view',
                  ],
          };
        })
        .filter(Boolean) as Array<{
        question: string;
        prepTimeSeconds: number;
        responseTimeSeconds: number;
        suggestedPoints: string[];
      }>;

      const defaultFollowUps = [
        {
          question: `Looking more broadly at ${title.toLowerCase()}, what practical challenges do students or institutions typically encounter first?`,
          prepTimeSeconds: 15,
          responseTimeSeconds: 45,
          suggestedPoints: [
            'Identify a specific logistical or resource obstacle',
            'Explain how this obstacle affects daily academic work',
            'Propose a realistic initial mitigation step',
          ],
        },
        {
          question:
            'How should universities balance short-term financial constraints against long-term educational quality in this area?',
          prepTimeSeconds: 15,
          responseTimeSeconds: 45,
          suggestedPoints: [
            'Compare immediate budget pressures with long-term academic outcomes',
            'Provide an example of a high-impact institutional investment',
            'Explain how stakeholders benefit over time',
          ],
        },
        {
          question:
            'Some critics argue that traditional institutional approaches are outdated. To what extent do you agree or disagree with that view?',
          prepTimeSeconds: 15,
          responseTimeSeconds: 45,
          suggestedPoints: [
            'Take a clear stance on traditional versus modern reforms',
            'Acknowledge one valid point from the opposing perspective',
            'Defend your conclusion with specific evidence',
          ],
        },
        {
          question:
            'Looking ahead over the next decade, how do you expect technological and social shifts to transform this field?',
          prepTimeSeconds: 15,
          responseTimeSeconds: 45,
          suggestedPoints: [
            'Forecast a key technological or demographic trend',
            'Evaluate potential risks and ethical considerations',
            'Conclude with how future graduates should prepare',
          ],
        },
      ];

      let fIdx = 0;
      while (normalizedQs.length < 4 && fIdx < defaultFollowUps.length) {
        normalizedQs.push(defaultFollowUps[fIdx++]);
      }

      return {
        ...task,
        title,
        context,
        interviewerName,
        interviewerGender,
        questions: normalizedQs.slice(0, 4),
      };
    }

    case 'reading-passage': {
      return normalizeReadingAcademicTask(task);
    }

    case 'listening-dialogue': {
      return normalizeListeningDialogueTask(task);
    }

    case 'write-email': {
      const title = String(task.title || 'Academic Campus Email').trim();
      const situation = String(task.situation || task.context || task.prompt || '').trim();
      const recipient = String(task.recipient || 'Professor Harrison').trim();
      const goals = Array.isArray(task.goals)
        ? task.goals.map(String).filter(Boolean)
        : Array.isArray(task.bulletPoints)
        ? task.bulletPoints.map(String).filter(Boolean)
        : [];
      const suggestedWordCount = String(task.suggestedWordCount || '100-130 words').trim();
      return {
        ...task,
        title,
        situation,
        recipient,
        goals,
        suggestedWordCount,
      };
    }

    case 'academic-discussion':
    default: {
      const title = String(task.title || 'Academic Course Discussion').trim();
      const professorName = String(task.professorName || task.professor?.name || 'Professor Henderson').trim();
      const professorPrompt = String(task.professorPrompt || task.prompt || task.professor?.prompt || '').trim();
      const s1 = {
        name: String(task.s1?.name || task.student1?.name || 'Marcus').trim(),
        text: String(task.s1?.text || task.student1?.text || '').trim(),
      };
      const s2 = {
        name: String(task.s2?.name || task.student2?.name || 'Elena').trim(),
        text: String(task.s2?.text || task.student2?.text || '').trim(),
      };
      const question = String(
        task.question ||
          'Express and support your personal opinion in the academic discussion forum, contributing a distinct perspective.'
      ).trim();

      return {
        ...task,
        title,
        professorName,
        professorPrompt,
        s1,
        s2,
        question,
      };
    }
  }
}

const FALLBACK_ACADEMIC_DISTRACTORS = [
  'It remains entirely unaffected by external environmental or institutional variables.',
  'It relies exclusively on outdated nineteenth-century observational methodologies.',
  'It contradicts the primary empirical conclusion established by the researchers.',
  'It eliminates the need for any further experimental or longitudinal verification.',
];

/**
 * Ensures all 4 MCQ options are unique strings and performs Answer-Key Self-Verification:
 * If `why`/`explanation` explicitly quotes or mentions one of the 4 option texts verbatim
 * as the correct answer while `answer`/`correctAnswer` points to a different option index,
 * auto-corrects `answer` and `correctAnswer` to match the verified option index.
 */
export function verifyAndNormalizeMcqQuestions(
  rawQs: any[],
  defaultWhy: string
): Array<{
  q: string;
  question: string;
  options: string[];
  answer: number;
  correctAnswer: number;
  why: string;
  explanation: string;
}> {
  if (!Array.isArray(rawQs)) return [];

  const result: Array<{
    q: string;
    question: string;
    options: string[];
    answer: number;
    correctAnswer: number;
    why: string;
    explanation: string;
  }> = [];

  for (let qIdx = 0; qIdx < rawQs.length; qIdx++) {
    const q = rawQs[qIdx];
    if (!q || typeof q !== 'object') continue;
    const qText = String(q.q || q.question || '').trim();
    const rawOptions = Array.isArray(q.options) ? q.options.map((o: any) => String(o || '').trim()).filter(Boolean) : [];
    if (!qText || rawOptions.length === 0) continue;

    // Ensure 4 distinct options (replace duplicates with plausible distractors)
    const uniqueOptions: string[] = [];
    const seenLower = new Set<string>();
    for (const opt of rawOptions) {
      const cleanedOpt = opt.replace(/^[A-Da-d][.)]\s*/, '').trim() || opt;
      const key = cleanedOpt.toLowerCase();
      if (!seenLower.has(key)) {
        seenLower.add(key);
        uniqueOptions.push(cleanedOpt);
      }
      if (uniqueOptions.length === 4) break;
    }

    let distIdx = 0;
    while (uniqueOptions.length < 4) {
      const candidate = FALLBACK_ACADEMIC_DISTRACTORS[(qIdx + distIdx) % FALLBACK_ACADEMIC_DISTRACTORS.length];
      distIdx++;
      const key = candidate.toLowerCase();
      if (!seenLower.has(key)) {
        seenLower.add(key);
        uniqueOptions.push(candidate);
      } else {
        uniqueOptions.push(`${candidate.replace(/\.$/, '')} (Alternative ${uniqueOptions.length + 1}).`);
      }
    }

    let answer = typeof q.answer === 'number' ? q.answer : Number(q.correctAnswer ?? 0);
    if (isNaN(answer) || answer < 0 || answer > 3) answer = 0;

    const whyText = String(q.why || q.explanation || defaultWhy).trim() || defaultWhy;
    const whyLower = whyText.toLowerCase();

    // Answer-Key Self-Verification:
    // Check if why/explanation explicitly states or quotes one of the 4 option texts verbatim
    const verbatimMatches: number[] = [];
    for (let i = 0; i < 4; i++) {
      const optClean = uniqueOptions[i]
        .toLowerCase()
        .replace(/[.!?;:,]+$/g, '')
        .trim();
      if (optClean.length >= 6 && whyLower.includes(optClean)) {
        // Ensure it's not mentioned only as "is incorrect" or "is wrong"
        const pos = whyLower.indexOf(optClean);
        const afterSnippet = whyLower.slice(pos + optClean.length, pos + optClean.length + 35);
        const isNegated = /\b(is incorrect|is wrong|is false|is not correct|contradicts)\b/.test(afterSnippet);
        if (!isNegated) {
          verbatimMatches.push(i);
        }
      }
    }

    if (verbatimMatches.length === 1 && verbatimMatches[0] !== answer) {
      answer = verbatimMatches[0];
    } else if (verbatimMatches.length === 0) {
      // Also check if explanation explicitly says "Option B is correct" / "correct answer is C"
      const letterMatch = whyText.match(
        /\b(?:option|choice|correct answer is)\s*\(?([A-D])\)?\s*(?:is correct|because|accurately|correctly)/i
      );
      if (letterMatch) {
        const letterIdx = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
        if (letterIdx >= 0 && letterIdx <= 3) {
          answer = letterIdx;
        }
      }
    }

    result.push({
      q: qText,
      question: qText,
      options: uniqueOptions.slice(0, 4),
      answer,
      correctAnswer: answer,
      why: whyText,
      explanation: whyText,
    });
  }

  return result;
}

export function normalizeReadingAcademicTask(task: any): any {
  const title = String(task?.title || 'Academic Reading Comprehension').trim();
  const passage = String(task?.passage || task?.text || '').trim();
  const rawQs = Array.isArray(task?.questions) ? task.questions : [];
  const questions = verifyAndNormalizeMcqQuestions(
    rawQs,
    'Supported directly by evidence in the reading passage.'
  );

  return {
    ...task,
    title,
    passage,
    questions,
  };
}

export function normalizeListeningDialogueTask(task: any): any {
  const title = String(task?.title || 'Campus Conversation & Lecture').trim();
  const context = String(
    task?.context || task?.situation || 'Listen to an academic discussion or university conversation.'
  ).trim();
  const script = String(task?.script || task?.dialogue || task?.lecture || task?.text || '').trim();

  let speakers = task?.speakers;
  if (!speakers || typeof speakers !== 'object' || Array.isArray(speakers)) {
    speakers = { A: 'Emma (Student)', B: 'Professor Miller' };
  }

  const speakerGenders = task?.speakerGenders || {
    A: inferGender(String(speakers.A || '')),
    B: inferGender(String(speakers.B || '')),
  };

  const rawQs = Array.isArray(task?.questions) ? task.questions : [];
  const questions = verifyAndNormalizeMcqQuestions(rawQs, 'Directly stated in the audio passage.');

  return {
    ...task,
    title,
    context,
    speakers,
    speakerGenders,
    script,
    questions,
  };
}

/**
 * Validates that a normalized task strictly meets 2026 TOEFL iBT structural and quality rules.
 */
export function validateNormalizedTask(taskTypeOrItem: string | any, normalizedData?: any): boolean {
  const isSingleArgObject = typeof taskTypeOrItem === 'object' && taskTypeOrItem !== null && normalizedData === undefined;
  const rawType = isSingleArgObject ? taskTypeOrItem.taskType : taskTypeOrItem;
  const targetObj = isSingleArgObject ? taskTypeOrItem : normalizedData;

  if (!targetObj || typeof targetObj !== 'object') return false;
  const canonicalType = canonicalizeTaskType(rawType);
  const data =
    targetObj.content && typeof targetObj.content === 'object' && !targetObj.title && !targetObj.text && !targetObj.items
      ? targetObj.content
      : targetObj;

  switch (canonicalType) {
    case 'complete-words': {
      const text = String(data.text || '');
      if (!text || text.length < 50) return false;
      // Reject any backwards blank where ]] is followed immediately by letters (e.g. [[penetr]]ate)
      if (/\]\][a-zA-Z]/.test(text)) return false;
      // Reject any blank where [[ is NOT preceded immediately by at least 3 letters or solution is < 3 letters (minimum 6-letter word)
      const parts = text.split(/\[\[(.+?)\]\]/);
      if (parts.length < 17) return false; // At least 8 blanks (10 standard)
      for (let i = 1; i < parts.length; i += 2) {
        const solution = parts[i];
        const prevText = parts[i - 1] || '';
        const prefixMatch = prevText.match(/([a-zA-Z]+)$/);
        if (!prefixMatch || prefixMatch[1].length < 3) return false;
        if (!/^[a-zA-Z]{3,}$/.test(solution)) return false;
      }
      return true;
    }

    case 'build-sentence': {
      const items = Array.isArray(data.items) ? data.items : [];
      if (items.length < 5) return false;
      return items.every((item: any) => {
        const ans = String(item.answer || item.correctSentence || '').trim();
        const ctx = String(item.context || '').trim();
        const words = Array.isArray(item.words) ? item.words : [];
        const targetWords = tokenizeSentenceWords(ans);
        if (targetWords.length < 5 || !ctx) return false;
        if (ctx.toLowerCase().includes(ans.toLowerCase().replace(/[.!?]+$/, ''))) return false;
        return haveSameWordMultiset(words, targetWords);
      });
    }

    case 'reading-passage': {
      const passage = String(data.passage || '');
      const wordCount = passage.trim().split(/\s+/).filter(Boolean).length;
      const questions = Array.isArray(data.questions) ? data.questions : [];
      if (wordCount < 120 || questions.length < 3) return false;
      return questions.every(
        (q: any) =>
          q.q &&
          Array.isArray(q.options) &&
          q.options.length === 4 &&
          new Set(q.options.map((o: any) => String(o).toLowerCase().trim())).size === 4 &&
          typeof q.answer === 'number' &&
          q.answer >= 0 &&
          q.answer <= 3
      );
    }

    case 'listening-dialogue': {
      const script = String(data.script || '');
      const wordCount = script.trim().split(/\s+/).filter(Boolean).length;
      const questions = Array.isArray(data.questions) ? data.questions : [];
      if (wordCount < 90 || questions.length < 3) return false;
      return questions.every(
        (q: any) =>
          q.q &&
          Array.isArray(q.options) &&
          q.options.length === 4 &&
          new Set(q.options.map((o: any) => String(o).toLowerCase().trim())).size === 4 &&
          typeof q.answer === 'number' &&
          q.answer >= 0 &&
          q.answer <= 3
      );
    }

    case 'listen-repeat': {
      const sentences = Array.isArray(data.sentences) ? data.sentences : [];
      if (sentences.length < 7) return false;
      return sentences.every((s: string) => String(s || '').trim().split(/\s+/).filter(Boolean).length >= 5);
    }

    case 'speaking-interview': {
      const questions = Array.isArray(data.questions) ? data.questions : [];
      if (questions.length < 4) return false;
      return questions.every((q: any) => String(q?.question || '').trim().length >= 15);
    }

    case 'write-email': {
      const situation = String(data.situation || '').trim();
      const recipient = String(data.recipient || '').trim();
      const goals = Array.isArray(data.goals) ? data.goals : [];
      return situation.length >= 30 && recipient.length >= 2 && goals.length >= 3;
    }

    case 'academic-discussion': {
      const prompt = String(data.professorPrompt || '').trim();
      const s1Text = String(data.s1?.text || '').trim();
      const s2Text = String(data.s2?.text || '').trim();
      return prompt.length >= 40 && s1Text.length >= 40 && s2Text.length >= 40;
    }

    default:
      return false;
  }
}

export function normalizeQuestionBankItem(rawItem: any, fallbackTaskType?: string): any {
  if (!rawItem || typeof rawItem !== 'object') return null;

  const taskType = canonicalizeTaskType(rawItem.taskType || fallbackTaskType);
  const rawContent =
    rawItem.content && typeof rawItem.content === 'object'
      ? { ...rawItem, ...rawItem.content }
      : { ...rawItem };

  const level = normalizeDifficultyLabel(rawItem.level || rawContent.level || rawItem.difficulty);
  const topic = normalizeTopicLabel(rawItem.topic || rawContent.topic, rawContent);

  const normalizedContent = normalizeTaskContent(taskType, rawContent);

  return {
    ...normalizedContent,
    id: String(rawItem.id || rawContent.id || `${taskType}-${Date.now()}`),
    taskType,
    level,
    difficulty: level,
    topic,
    content: {
      ...normalizedContent,
      level,
      difficulty: level,
      topic,
    },
  };
}

export function normalizeTaskData(raw: any, fallbackTaskType?: string): any {
  if (!raw || typeof raw !== 'object') return raw;
  const taskType = canonicalizeTaskType(raw.taskType || fallbackTaskType);
  const baseObj =
    raw.content && typeof raw.content === 'object'
      ? { ...raw, ...raw.content }
      : { ...raw };

  const level = normalizeDifficultyLabel(raw.level || baseObj.level || raw.difficulty);
  const topic = normalizeTopicLabel(raw.topic || baseObj.topic, baseObj);
  const normalizedContent = normalizeTaskContent(taskType, baseObj);

  return {
    ...raw,
    ...normalizedContent,
    taskType,
    level,
    difficulty: level,
    topic,
    ...(raw.content && typeof raw.content === 'object'
      ? {
          content: {
            ...raw.content,
            ...normalizedContent,
            level,
            difficulty: level,
            topic,
          },
        }
      : {}),
  };
}
