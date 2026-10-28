import { convertScaledToBand6 } from './scoreTracker';
import { calculateSentenceMatch } from './audioSpeech';

export interface GrammarErrorItem {
  original: string;
  corrected: string;
  explanation: string;
}

export interface LocalEvaluationResult {
  bandScore6: number;
  overallBand: number;
  bandScore: number;
  rawRubricScore: number;
  scaledScore: number;
  performanceLevel: 'Advanced' | 'High-Intermediate' | 'Low-Intermediate' | 'Basic';
  criteria: {
    taskFulfillment: number;
    coherence: number;
    vocabulary: number;
    grammar: number;
  };
  summary: string;
  feedbackSummary: string;
  strengths: string[];
  improvements: string[];
  areasForImprovement: string[];
  topFixes: string[];
  tips: string[];
  exemplar: string;
  exemplarResponse: string;
  modelBand6Rewrite: string;
  corrections: GrammarErrorItem[];
  errors: GrammarErrorItem[];
  grammarErrors: GrammarErrorItem[];
  copiedPromptDetected?: boolean;
  offTopicDetected?: boolean;
  answeredQuestionsCount?: number;
  accuracyPercent?: number;
  isLocalEvaluation: true;
  modelUsed: string;
}

const ACADEMIC_TRANSITIONS = [
  'furthermore',
  'moreover',
  'consequently',
  'nevertheless',
  'nonetheless',
  'therefore',
  'specifically',
  'conversely',
  'subsequently',
  'additionally',
  'whereas',
  'although',
  'despite',
  'ultimately',
  'notably',
  'significantly',
  'similarly',
  'alternatively',
  'accordingly',
  'in contrast',
  'for instance',
  'for example',
  'as a result',
  'on the other hand',
  'in addition',
];

const COMPLEX_CLAUSE_MARKERS = [
  'which',
  'although',
  'whereas',
  'while',
  'because',
  'since',
  'unless',
  'whether',
  'whereby',
  'provided that',
  'even though',
  'in order to',
  'so that',
];

const OPINION_STANCE_MARKERS = [
  'i believe',
  'in my view',
  'in my opinion',
  'from my perspective',
  'i agree',
  'i disagree',
  'i contend',
  'i strongly support',
  'i would argue',
  'it is essential',
  'it is crucial',
  'universities should',
  'governments should',
  'institutions must',
];

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'has', 'had',
  'are', 'was', 'were', 'been', 'being', 'will', 'would', 'could', 'should',
  'can', 'may', 'might', 'must', 'shall', 'into', 'onto', 'upon', 'about',
  'above', 'below', 'under', 'over', 'between', 'among', 'through', 'during',
  'before', 'after', 'since', 'until', 'while', 'where', 'when', 'which',
  'what', 'who', 'whom', 'whose', 'why', 'how', 'their', 'there', 'they',
  'them', 'these', 'those', 'your', 'yours', 'ours', 'very', 'more', 'most',
  'some', 'such', 'only', 'also', 'than', 'then', 'just', 'like', 'even',
  'both', 'each', 'many', 'much', 'other', 'another', 'same', 'different',
  'write', 'email', 'response', 'post', 'discussion', 'professor', 'student',
  'students', 'question', 'questions', 'explain', 'describe', 'discuss',
  'points', 'point', 'using', 'follow', 'following', 'include', 'make', 'sure',
  'least', 'words', 'minutes', 'time', 'read', 'listen', 'speak', 'answer',
]);

function normalizeTaskTypeKey(
  rawType?: string
): 'write-email' | 'academic-discussion' | 'speaking-interview' | 'listen-repeat' {
  const t = String(rawType || '')
    .trim()
    .toLowerCase();
  if (t.includes('email')) return 'write-email';
  if (t.includes('repeat')) return 'listen-repeat';
  if (t.includes('interview') || t.includes('speaking')) return 'speaking-interview';
  return 'academic-discussion';
}

function tokenizeWords(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ''))
    .filter(Boolean);
}

/**
 * Extracts all prompt text strings from promptData and extra?.task for
 * 3-gram plagiarism detection and topic relevance analysis.
 */
function collectPromptStrings(promptData: any, extra?: any): string[] {
  const sources = [promptData, extra?.task].filter((s) => s && typeof s === 'object');
  const chunks: string[] = [];

  for (const src of sources) {
    const fields = [
      src.professorPrompt,
      src.professor,
      src.scenario,
      src.situation,
      src.passage,
      src.context,
      src.question,
      src.title,
      typeof src.s1 === 'string' ? src.s1 : src.s1?.text,
      typeof src.s2 === 'string' ? src.s2 : src.s2?.text,
      typeof src.student1 === 'string' ? src.student1 : src.student1?.text,
      typeof src.student2 === 'string' ? src.student2 : src.student2?.text,
    ];
    for (const f of fields) {
      if (typeof f === 'string' && f.trim()) {
        chunks.push(f.trim());
      }
    }
    if (Array.isArray(src.studentPosts)) {
      for (const sp of src.studentPosts) {
        const txt = typeof sp === 'string' ? sp : sp?.text || sp?.post || '';
        if (txt) chunks.push(String(txt));
      }
    }
    if (Array.isArray(src.questions)) {
      for (const q of src.questions) {
        const txt = typeof q === 'string' ? q : q?.question || q?.q || q?.prompt || '';
        if (txt) chunks.push(String(txt));
      }
    }
    if (Array.isArray(src.goals)) {
      for (const g of src.goals) {
        if (g) chunks.push(String(g));
      }
    }
    if (Array.isArray(src.bulletPoints)) {
      for (const b of src.bulletPoints) {
        if (b) chunks.push(String(b));
      }
    }
  }

  return chunks;
}

/**
 * 1. Prompt-Copying / Plagiarism Detection:
 * Extracts 3-word n-grams from promptData and calculates the percentage of the
 * student's words that are copied verbatim from the prompt.
 */
export function detectPromptCopyingRatio(studentText: string, promptData: any, extra?: any): number {
  const cleanStudent = String(studentText || '').replace(/^Subject:.*$/im, '').trim();
  const studentWords = tokenizeWords(cleanStudent);
  if (studentWords.length < 6) return 0;

  const promptChunks = collectPromptStrings(promptData, extra);
  if (promptChunks.length === 0) return 0;

  const promptTrigrams = new Set<string>();
  for (const chunk of promptChunks) {
    const pWords = tokenizeWords(chunk);
    for (let i = 0; i <= pWords.length - 3; i++) {
      promptTrigrams.add(`${pWords[i]} ${pWords[i + 1]} ${pWords[i + 2]}`);
    }
  }

  if (promptTrigrams.size === 0) return 0;

  const copiedWordFlags = new Array(studentWords.length).fill(false);
  for (let i = 0; i <= studentWords.length - 3; i++) {
    const trigram = `${studentWords[i]} ${studentWords[i + 1]} ${studentWords[i + 2]}`;
    if (promptTrigrams.has(trigram)) {
      copiedWordFlags[i] = true;
      copiedWordFlags[i + 1] = true;
      copiedWordFlags[i + 2] = true;
    }
  }

  const copiedCount = copiedWordFlags.filter(Boolean).length;
  return copiedCount / studentWords.length;
}

/**
 * 2. Topic & Bullet-Point Relevance Scoring:
 * Extracts significant topic keywords (words >= 4 chars, excluding common stop words)
 * from promptData and measures how many topic/prompt concepts the student addressed.
 */
export function computeTopicRelevance(
  studentText: string,
  promptData: any,
  extra?: any
): {
  promptKeywordCount: number;
  matchedKeywordCount: number;
  relevanceRatio: number;
  bulletCoverageRatio: number;
  bulletsCovered: number;
  totalBullets: number;
} {
  const studentWords = tokenizeWords(studentText);
  const studentWordSet = new Set(studentWords);
  const studentStems = new Set(
    studentWords.filter((w) => w.length >= 5).map((w) => w.slice(0, 5))
  );

  const promptChunks = collectPromptStrings(promptData, extra);
  const promptKeywords = new Set<string>();
  for (const chunk of promptChunks) {
    for (const w of tokenizeWords(chunk)) {
      if (w.length >= 4 && !STOP_WORDS.has(w) && /^[a-z]+$/.test(w)) {
        promptKeywords.add(w);
      }
    }
  }

  let matchedKeywordCount = 0;
  for (const kw of promptKeywords) {
    if (studentWordSet.has(kw) || (kw.length >= 5 && studentStems.has(kw.slice(0, 5)))) {
      matchedKeywordCount++;
    }
  }

  // Check bullet-point coverage for Write an Email
  const rawGoals: string[] = Array.isArray(promptData?.goals)
    ? promptData.goals
    : Array.isArray(promptData?.bulletPoints)
    ? promptData.bulletPoints
    : Array.isArray(extra?.task?.goals)
    ? extra.task.goals
    : [];

  let bulletsCovered = 0;
  for (const goal of rawGoals) {
    const goalWords = tokenizeWords(String(goal || '')).filter(
      (w) => w.length >= 4 && !STOP_WORDS.has(w)
    );
    if (goalWords.length === 0) {
      bulletsCovered++;
      continue;
    }
    const hasMatch = goalWords.some(
      (gw) => studentWordSet.has(gw) || (gw.length >= 5 && studentStems.has(gw.slice(0, 5)))
    );
    if (hasMatch) {
      bulletsCovered++;
    }
  }

  const totalBullets = rawGoals.length;
  const bulletCoverageRatio = totalBullets > 0 ? bulletsCovered / totalBullets : 1;
  const relevanceRatio =
    promptKeywords.size > 0
      ? Math.min(1, matchedKeywordCount / Math.min(8, promptKeywords.size))
      : 1;

  return {
    promptKeywordCount: promptKeywords.size,
    matchedKeywordCount,
    relevanceRatio,
    bulletCoverageRatio,
    bulletsCovered,
    totalBullets,
  };
}

/**
 * 4. Expanded Grammar & Mechanics Detection:
 * Dynamically detects common ESL/TOEFL grammar errors in studentResponse.
 */
export function detectGrammarAndMechanicsErrors(rawText: string): GrammarErrorItem[] {
  const text = String(rawText || '').replace(/^Subject:.*$/im, '').trim();
  if (!text) return [];

  const errors: GrammarErrorItem[] = [];
  const seenOriginals = new Set<string>();

  const pushError = (original: string, corrected: string, explanation: string) => {
    const cleanOrig = original.trim();
    if (!cleanOrig || seenOriginals.has(cleanOrig.toLowerCase())) return;
    seenOriginals.add(cleanOrig.toLowerCase());
    errors.push({
      original: cleanOrig,
      corrected: corrected.trim(),
      explanation,
    });
  };

  // 1. Subject-verb agreement: "he/she/it have" or "he/she/it do"
  const svPronounRegex = /\b(he|she|it)\s+(have|do|are|were)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = svPronounRegex.exec(text)) !== null) {
    const subj = m[1];
    const verb = m[2].toLowerCase();
    const fixVerb =
      verb === 'have' ? 'has' : verb === 'do' ? 'does' : verb === 'are' ? 'is' : 'was';
    pushError(
      m[0],
      `${subj} ${fixVerb}`,
      `Singular third-person subject "${subj}" requires the singular verb "${fixVerb}".`
    );
  }

  // 2. Existential "there is many / several / numerous / multiple / various / few"
  const thereIsPluralRegex = /\b(there\s+is)\s+(many|several|numerous|multiple|various|few|two|three|four|five|a\s+lot\s+of\s+\w+s)\b/gi;
  while ((m = thereIsPluralRegex.exec(text)) !== null) {
    const isCap = m[1][0] === 'T';
    pushError(
      m[0],
      `${isCap ? 'There are' : 'there are'} ${m[2]}`,
      'Use plural "there are" before plural quantifiers and countable plural nouns.'
    );
  }

  // 3. Indefinite pronouns with plural verbs: "everyone have/are"
  const indefRegex = /\b(everyone|everybody|someone|somebody|nobody|anybody|each\s+student|every\s+student)\s+(have|are|were|do)\b/gi;
  while ((m = indefRegex.exec(text)) !== null) {
    const subj = m[1];
    const verb = m[2].toLowerCase();
    const fixVerb =
      verb === 'have' ? 'has' : verb === 'are' ? 'is' : verb === 'were' ? 'was' : 'does';
    pushError(
      m[0],
      `${subj} ${fixVerb}`,
      `Singular indefinite subject "${subj}" requires the singular verb "${fixVerb}".`
    );
  }

  // 4. Double / repeated consecutive words ("and and", "the the", "is is")
  const doubleWordRegex = /\b([a-zA-Z]{2,})\s+\1\b/gi;
  while ((m = doubleWordRegex.exec(text)) !== null) {
    const word = m[1].toLowerCase();
    if (word !== 'had' && word !== 'that') {
      pushError(
        m[0],
        m[1],
        `Remove the accidental duplicate word "${m[1]}".`
      );
    }
  }

  // 5. Uncountable plural errors ("informations", "researches", "advices", "equipments", "knowledges")
  const uncountableMap: Record<string, string> = {
    informations: 'information',
    researches: 'research',
    advices: 'advice',
    equipments: 'equipment',
    knowledges: 'knowledge',
    furnitures: 'furniture',
    homeworks: 'homework',
    evidences: 'evidence',
    feedbacks: 'feedback',
    softwares: 'software',
    luggages: 'luggage',
  };
  const uncountableRegex = /\b(informations|researches|advices|equipments|knowledges|furnitures|homeworks|evidences|feedbacks|softwares|luggages)\b/gi;
  while ((m = uncountableRegex.exec(text)) !== null) {
    const matched = m[1];
    const lower = matched.toLowerCase();
    const singular = uncountableMap[lower] || lower.replace(/s$/, '');
    const fixed = matched[0] === matched[0].toUpperCase()
      ? singular.charAt(0).toUpperCase() + singular.slice(1)
      : singular;
    pushError(
      matched,
      fixed,
      `"${fixed}" is an uncountable noun in academic English and does not take a plural "-s" ending.`
    );
  }

  // 6. Modal + "to" + verb ("can to help", "should to study", "must to complete")
  const modalToRegex = /\b(can|could|will|would|should|must|may|might)\s+to\s+([a-z]{2,})\b/gi;
  while ((m = modalToRegex.exec(text)) !== null) {
    pushError(
      m[0],
      `${m[1]} ${m[2]}`,
      `Modal verb "${m[1]}" must be followed directly by the base verb "${m[2]}" without "to".`
    );
  }

  // 7. Modal + 3rd person singular "-s" verb ("can helps", "will makes", "should provides")
  const modalSRegex = /\b(can|could|will|would|should|must|may|might)\s+(helps|makes|goes|creates|improves|leads|provides|allows|requires|causes|gives|takes|increases|reduces|supports)\b/gi;
  while ((m = modalSRegex.exec(text)) !== null) {
    const baseVerb = m[2].toLowerCase() === 'goes' ? 'go' : m[2].replace(/s$/i, '');
    pushError(
      m[0],
      `${m[1]} ${baseVerb}`,
      `Use the base form "${baseVerb}" after the modal auxiliary "${m[1]}".`
    );
  }

  // 8. Informal slang / conversational abbreviations ("gonna", "wanna", "u", "cuz", "a lot of")
  const slangMap: Record<string, { fix: string; note: string }> = {
    gonna: { fix: 'going to', note: 'Replace informal spoken contraction "gonna" with formal "going to".' },
    wanna: { fix: 'want to', note: 'Replace informal spoken contraction "wanna" with formal "want to".' },
    gotta: { fix: 'have to / must', note: 'Replace informal "gotta" with formal "must" or "have to".' },
    kinda: { fix: 'somewhat / rather', note: 'Replace informal "kinda" with formal academic hedging such as "somewhat".' },
    sorta: { fix: 'somewhat', note: 'Replace informal "sorta" with "somewhat" or "moderately".' },
    cuz: { fix: 'because', note: 'Replace informal abbreviation "cuz" with "because".' },
    cos: { fix: 'because', note: 'Replace informal abbreviation "cos" with "because".' },
    u: { fix: 'you', note: 'Spell out "you" in formal academic responses.' },
    ur: { fix: 'your', note: 'Spell out "your" in formal academic responses.' },
    idk: { fix: 'I am uncertain', note: 'Avoid text-message abbreviations like "idk" in TOEFL tasks.' },
    imo: { fix: 'in my opinion', note: 'Spell out "in my opinion" instead of using the abbreviation "imo".' },
    tbh: { fix: 'to be candid', note: 'Avoid informal abbreviations like "tbh" in academic writing.' },
  };
  const slangRegex = /\b(gonna|wanna|gotta|kinda|sorta|cuz|cos|u|ur|idk|imo|tbh)\b/gi;
  while ((m = slangRegex.exec(text)) !== null) {
    const key = m[1].toLowerCase();
    if (slangMap[key]) {
      pushError(m[0], slangMap[key].fix, slangMap[key].note);
    }
  }

  const alotRegex = /\b(a\s+lot\s+of|lots\s+of|alot)\b/gi;
  while ((m = alotRegex.exec(text)) !== null) {
    pushError(
      m[0],
      'numerous / a substantial amount of',
      'Prefer formal academic quantifiers ("numerous", "substantial", "significant") over conversational "a lot of".'
    );
  }

  // 9. Standalone lowercase "i"
  const lowerIRegex = /(?:^|\s)(i(?:\s|'(?:m|ve|ll|d)\b))/g;
  while ((m = lowerIRegex.exec(text)) !== null) {
    const tok = m[1].trim();
    const fixed = 'I' + tok.slice(1);
    pushError(
      tok,
      fixed,
      'Always capitalize the first-person singular pronoun "I" in English.'
    );
  }

  // 10. Missing sentence-initial capitalization
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const s of sentences) {
    const trimmed = s.trim();
    if (/^[a-z]/.test(trimmed)) {
      const firstWords = trimmed.split(/\s+/).slice(0, 4).join(' ');
      pushError(
        firstWords,
        firstWords.charAt(0).toUpperCase() + firstWords.slice(1),
        'Capitalize the first letter at the beginning of every sentence.'
      );
    }
    // 11. Run-on sentences > 45 words without internal semicolon or period
    const sWords = trimmed.split(/\s+/).filter(Boolean);
    if (sWords.length > 45 && !trimmed.includes(';')) {
      const snippet = `${sWords.slice(0, 7).join(' ')} ... (${sWords.length} words)`;
      pushError(
        snippet,
        `${sWords.slice(0, 7).join(' ')}. [Break into two sentences]`,
        'Run-on sentence exceeding 45 words without terminal punctuation; divide long clauses into two distinct sentences.'
      );
    }
  }

  // 12. Common TOEFL spelling & collocation mistakes
  const commonFixes: Array<{ pattern: RegExp; fix: string; note: string }> = [
    {
      pattern: /\bdepend\s+of\b/i,
      fix: 'depend on',
      note: 'The verb "depend" always takes the preposition "on", never "of".',
    },
    {
      pattern: /\bdiscuss\s+about\b/i,
      fix: 'discuss',
      note: '"Discuss" is a transitive verb and takes a direct object without "about".',
    },
    {
      pattern: /\bdespite\s+of\b/i,
      fix: 'despite / in spite of',
      note: 'Use "despite" without "of", or use the full phrase "in spite of".',
    },
    {
      pattern: /\b(enviroment|definately|occured|recieve|seperate|goverment|neccessary|accomodate)\b/i,
      fix: 'environment / definitely / occurred / receive / separate / government / necessary / accommodate',
      note: 'Check academic spelling of high-frequency TOEFL vocabulary.',
    },
  ];
  for (const rule of commonFixes) {
    const match = text.match(rule.pattern);
    if (match) {
      pushError(match[0], rule.fix, rule.note);
    }
  }

  return errors.slice(0, 6);
}

/**
 * Evaluates a Speaking Listen & Repeat task across all 7 sentences using strict
 * sequential word-order alignment (`calculateSentenceMatch`).
 */
function evaluateListenRepeatLocally(
  promptData: any,
  studentResponse: any,
  extra?: any
): LocalEvaluationResult {
  const rawTargets: string[] = Array.isArray(promptData?.sentences)
    ? promptData.sentences.map((s: any) => String(typeof s === 'string' ? s : s?.sentence || s?.text || ''))
    : Array.isArray(promptData?.items)
    ? promptData.items.map((s: any) => String(typeof s === 'string' ? s : s?.sentence || s?.text || ''))
    : Array.isArray(extra?.task?.sentences)
    ? extra.task.sentences.map(String)
    : [];

  const targetCount = Math.max(7, rawTargets.length || 7);

  // Extract spoken sentences in order (0..targetCount-1)
  const spokenList: string[] = [];
  if (Array.isArray(studentResponse)) {
    for (const item of studentResponse) {
      if (typeof item === 'string') spokenList.push(item);
      else if (item && typeof item === 'object') {
        spokenList.push(
          String(item.userInput || item.studentResponse || item.transcript || item.response || item.text || '')
        );
      }
    }
  } else if (studentResponse && typeof studentResponse === 'object') {
    if (Array.isArray(studentResponse.sentences)) {
      for (const s of studentResponse.sentences) spokenList.push(String(s || ''));
    } else if (Array.isArray(studentResponse.responses)) {
      for (const s of studentResponse.responses) spokenList.push(String(s || ''));
    } else if (Array.isArray(studentResponse.states)) {
      for (const s of studentResponse.states) spokenList.push(String(s?.userInput || ''));
    } else {
      for (let i = 0; i < targetCount; i++) {
        spokenList.push(String(studentResponse[i] ?? studentResponse[`s${i + 1}`] ?? ''));
      }
    }
  } else if (typeof studentResponse === 'string') {
    const lines = studentResponse
      .split(/\n+/)
      .map((l) => l.replace(/^(?:Sentence|Item|S)?\s*\d+\s*[:.)-]\s*/i, '').trim())
      .filter(Boolean);
    spokenList.push(...lines);
  }

  let totalAccuracy = 0;
  let answeredSentences = 0;
  const corrections: GrammarErrorItem[] = [];

  for (let i = 0; i < targetCount; i++) {
    const target = rawTargets[i] || '';
    const spoken = (spokenList[i] || '').trim();
    if (!spoken) {
      // Unanswered sentences count as 0%
      if (target) {
        corrections.push({
          original: `Sentence ${i + 1}: [No recording submitted]`,
          corrected: target,
          explanation: 'Unrecorded sentences receive 0% accuracy in official Listen & Repeat scoring.',
        });
      }
      continue;
    }
    answeredSentences++;
    if (!target) {
      totalAccuracy += 85;
      continue;
    }
    const matchRes = calculateSentenceMatch(target, spoken);
    totalAccuracy += matchRes.percentage;
    if (matchRes.percentage < 100) {
      corrections.push({
        original: `Sentence ${i + 1}: "${spoken}" (${matchRes.percentage}%)`,
        corrected: target,
        explanation: 'Ensure every target word is repeated in the exact sequential order without omissions or extra inserted words.',
      });
    }
  }

  const avgAccuracy = Math.round(totalAccuracy / targetCount);

  // Strict 2026 TOEFL iBT Listen & Repeat Accuracy -> Band 1.0–6.0 mapping
  let bandScore6 = 1.0;
  if (avgAccuracy >= 95) bandScore6 = 6.0;
  else if (avgAccuracy >= 88) bandScore6 = 5.5;
  else if (avgAccuracy >= 80) bandScore6 = 5.0;
  else if (avgAccuracy >= 72) bandScore6 = 4.5;
  else if (avgAccuracy >= 64) bandScore6 = 4.0;
  else if (avgAccuracy >= 55) bandScore6 = 3.5;
  else if (avgAccuracy >= 45) bandScore6 = 3.0;
  else if (avgAccuracy >= 35) bandScore6 = 2.5;
  else if (avgAccuracy >= 25) bandScore6 = 2.0;
  else if (avgAccuracy >= 15) bandScore6 = 1.5;
  else bandScore6 = 1.0;

  const scaledScore = Math.round((bandScore6 / 6.0) * 30);
  const rawRubricScore = Number(((bandScore6 / 6.0) * 4.0).toFixed(1));
  const performanceLevel: LocalEvaluationResult['performanceLevel'] =
    bandScore6 >= 5.5
      ? 'Advanced'
      : bandScore6 >= 4.0
      ? 'High-Intermediate'
      : bandScore6 >= 2.5
      ? 'Low-Intermediate'
      : 'Basic';

  const summary = `Listen & Repeat Evaluation: Overall sequential word-order accuracy of ${avgAccuracy}% across ${targetCount} sentences (${answeredSentences}/${targetCount} answered) -> Band ${bandScore6.toFixed(1)}/6.0 (${performanceLevel}).`;
  const strengths: string[] = [];
  const improvements: string[] = [];

  if (avgAccuracy >= 88) {
    strengths.push(`High sequential word-order accuracy (${avgAccuracy}%) across the 7 academic sentences.`);
  } else if (answeredSentences > 0) {
    strengths.push(`Completed ${answeredSentences} of ${targetCount} Listen & Repeat sentences.`);
  }
  if (answeredSentences < targetCount) {
    improvements.push(`Complete all ${targetCount} sentences; ${targetCount - answeredSentences} unanswered sentence(s) were scored as 0%.`);
  }
  if (avgAccuracy < 95) {
    improvements.push('Focus on chunking prepositional phrases and multi-syllable academic nouns without inserting extra filler words or omitting articles.');
  }
  if (improvements.length === 0) {
    improvements.push('Maintain crisp consonant articulation and natural stress timing on the longest 14-15 word sentences.');
  }

  const exemplar = rawTargets.join(' ');

  return {
    bandScore6,
    overallBand: bandScore6,
    bandScore: bandScore6,
    rawRubricScore,
    scaledScore,
    performanceLevel,
    criteria: {
      taskFulfillment: Math.round((answeredSentences / targetCount) * 100),
      coherence: avgAccuracy,
      vocabulary: avgAccuracy,
      grammar: avgAccuracy,
    },
    summary,
    feedbackSummary: summary,
    strengths,
    improvements,
    areasForImprovement: improvements,
    topFixes: improvements.slice(0, 3),
    tips: improvements,
    exemplar,
    exemplarResponse: exemplar,
    modelBand6Rewrite: exemplar,
    corrections: corrections.slice(0, 5),
    errors: corrections.slice(0, 5),
    grammarErrors: corrections.slice(0, 5),
    answeredQuestionsCount: answeredSentences,
    accuracyPercent: avgAccuracy,
    isLocalEvaluation: true,
    modelUsed: 'Local Rubric Engine (Zero-API)',
  };
}

/**
 * Parses the 4 responses (Q1..Q4) for Speaking Interview regardless of whether
 * studentResponse is passed as an array, an object, or a formatted string.
 */
function parseSpeakingInterviewResponses(
  studentResponse: any,
  extra?: any
): { slotResponses: string[]; answeredCount: number } {
  const slots = ['', '', '', ''];

  if (Array.isArray(studentResponse)) {
    for (let i = 0; i < Math.min(4, studentResponse.length); i++) {
      const item = studentResponse[i];
      slots[i] = String(
        typeof item === 'string'
          ? item
          : item?.studentResponse ?? item?.response ?? item?.answer ?? item?.text ?? ''
      ).trim();
    }
  } else if (Array.isArray(extra?.submissionData)) {
    for (let i = 0; i < Math.min(4, extra.submissionData.length); i++) {
      const item = extra.submissionData[i];
      slots[i] = String(
        typeof item === 'string'
          ? item
          : item?.studentResponse ?? item?.response ?? item?.answer ?? ''
      ).trim();
    }
  } else if (studentResponse && typeof studentResponse === 'object') {
    const arr = studentResponse.responses || studentResponse.answers || studentResponse.submissionData;
    if (Array.isArray(arr)) {
      for (let i = 0; i < Math.min(4, arr.length); i++) {
        const it = arr[i];
        slots[i] = String(typeof it === 'string' ? it : it?.studentResponse ?? it?.response ?? it ?? '').trim();
      }
    } else if (typeof studentResponse.response === 'string' || typeof studentResponse.text === 'string') {
      const str = String(studentResponse.response || studentResponse.text || '').trim();
      return parseSpeakingInterviewResponses(str, extra);
    } else {
      for (let i = 0; i < 4; i++) {
        slots[i] = String(
          studentResponse[i] ??
            studentResponse[`Q${i + 1}`] ??
            studentResponse[`q${i + 1}`] ??
            ''
        ).trim();
      }
    }
  } else if (typeof studentResponse === 'string') {
    const raw = studentResponse.trim();
    if (raw) {
      // Check for explicit Q1: ... Q2: ... markers
      const qMarkerRegex = /(?:^|\n)\s*(?:Q(?:uestion)?\s*([1-4]))\s*[:.)-]\s*([\s\S]*?)(?=(?:\n\s*Q(?:uestion)?\s*[1-4]\s*[:.)-])|$)/gi;
      let match: RegExpExecArray | null;
      let foundMarkers = false;
      while ((match = qMarkerRegex.exec(raw)) !== null) {
        foundMarkers = true;
        const idx = parseInt(match[1], 10) - 1;
        if (idx >= 0 && idx < 4) {
          slots[idx] = match[2].trim();
        }
      }

      if (!foundMarkers) {
        // Split by double newline paragraphs
        const paragraphs = raw
          .split(/\n\s*\n+/)
          .map((p) => p.trim())
          .filter(Boolean);
        if (paragraphs.length >= 2) {
          for (let i = 0; i < Math.min(4, paragraphs.length); i++) {
            slots[i] = paragraphs[i];
          }
        } else {
          // Single block of text without Q1..Q4 markers:
          // Check word count: if under 90 words, it's a single question response (Q1 only);
          // if >= 180 words, distribute across slots.
          const words = tokenizeWords(raw);
          if (words.length >= 180) {
            const quarter = Math.ceil(words.length / 4);
            for (let i = 0; i < 4; i++) {
              slots[i] = words.slice(i * quarter, (i + 1) * quarter).join(' ');
            }
          } else if (words.length >= 120) {
            const third = Math.ceil(words.length / 3);
            for (let i = 0; i < 3; i++) {
              slots[i] = words.slice(i * third, (i + 1) * third).join(' ');
            }
          } else if (words.length >= 75) {
            const half = Math.ceil(words.length / 2);
            slots[0] = words.slice(0, half).join(' ');
            slots[1] = words.slice(half).join(' ');
          } else {
            slots[0] = raw;
          }
        }
      }
    }
  }

  const answeredCount = slots.filter((s) => tokenizeWords(s).length >= 3).length;
  return { slotResponses: slots, answeredCount };
}

/**
 * Deterministic Local TOEFL Rubric Evaluator (No-API / Offline Mode)
 * Evaluates Write an Email, Academic Discussion, Speaking Interview, and Listen & Repeat
 * using official 2026 ETS TOEFL iBT 1.0–6.0 Band descriptors.
 */
export function evaluateLocally(
  taskType: 'write-email' | 'academic-discussion' | 'speaking-interview' | 'listen-repeat' | string,
  promptData: any,
  studentResponse: any,
  extra?: {
    wpm?: number;
    pauseCount?: number;
    longestPause?: number;
    fillerCount?: number;
    task?: any;
    submissionData?: any[];
    answers?: Record<number, string>;
  }
): LocalEvaluationResult {
  const canonicalType = normalizeTaskTypeKey(taskType);

  // Special path for Listen & Repeat (7-sentence sequential word-order alignment)
  if (canonicalType === 'listen-repeat') {
    return evaluateListenRepeatLocally(promptData, studentResponse, extra);
  }

  // Extract clean text from studentResponse
  let cleanText = '';
  if (typeof studentResponse === 'string') {
    cleanText = studentResponse.trim();
  } else if (Array.isArray(studentResponse)) {
    cleanText = studentResponse
      .map((it) =>
        typeof it === 'string'
          ? it
          : it?.studentResponse || it?.response || it?.answer || it?.text || ''
      )
      .filter(Boolean)
      .join('\n\n')
      .trim();
  } else if (studentResponse && typeof studentResponse === 'object') {
    if (typeof studentResponse.body === 'string') {
      cleanText = studentResponse.subject
        ? `Subject: ${studentResponse.subject}\n\n${studentResponse.body}`.trim()
        : studentResponse.body.trim();
    } else if (typeof studentResponse.response === 'string') {
      cleanText = studentResponse.response.trim();
    } else if (typeof studentResponse.text === 'string') {
      cleanText = studentResponse.text.trim();
    } else {
      cleanText = Object.values(studentResponse)
        .filter((v) => typeof v === 'string')
        .join('\n\n')
        .trim();
    }
  }

  // Strip "Subject: ..." header when counting email body words so subject line doesn't skew body metrics
  const bodyOnlyText =
    canonicalType === 'write-email'
      ? cleanText.replace(/^Subject:[^\n]*\n*/i, '').trim() || cleanText
      : cleanText;

  const words = tokenizeWords(bodyOnlyText);
  const wordCount = words.length;
  const sentences = bodyOnlyText
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
  const sentenceCount = Math.max(1, sentences.length);
  const avgWordsPerSentence = wordCount / sentenceCount;

  // Lexical diversity & sophistication
  const uniqueWords = new Set(words);
  const ttr = wordCount > 0 ? uniqueWords.size / wordCount : 0;
  const longWords = words.filter((w) => w.length >= 7);
  const academicWordRatio = wordCount > 0 ? longWords.length / wordCount : 0;

  const lowerText = cleanText.toLowerCase();
  const transitionsUsed = ACADEMIC_TRANSITIONS.filter((t) => lowerText.includes(t));
  const complexClausesUsed = COMPLEX_CLAUSE_MARKERS.filter((c) =>
    new RegExp(`\\b${c}\\b`, 'i').test(lowerText)
  );
  const stanceMarkersUsed = OPINION_STANCE_MARKERS.filter((m) => lowerText.includes(m));

  // 1. Prompt-Copying Detection (> 45% copied verbatim -> cap at 1.5)
  const copiedRatio = detectPromptCopyingRatio(bodyOnlyText, promptData, extra);
  const copiedPromptDetected = wordCount >= 6 && copiedRatio > 0.45;

  // 2. Topic & Bullet-Point Relevance Detection
  const relevance = computeTopicRelevance(bodyOnlyText, promptData, extra);
  const offTopicDetected =
    wordCount >= 15 &&
    relevance.promptKeywordCount >= 3 &&
    relevance.matchedKeywordCount === 0;

  // 3. Dynamic Grammar & Mechanics Detection
  const corrections = detectGrammarAndMechanicsErrors(bodyOnlyText);
  const grammarErrorPenalty = Math.min(35, corrections.length * 7);

  // 4. Task-Calibrated Scoring
  let devScore = 60;
  let cohScore = 60;
  let vocabScore = 60;
  let gramScore = 65;

  let answeredQuestionsCount = 4;
  let interviewCompletenessCap = 6.0;

  if (canonicalType === 'write-email') {
    // 2026 TOEFL iBT Write an Email (7 mins): Full length credit at 85–130+ words!
    if (wordCount >= 85) devScore = 92;
    else if (wordCount >= 70) devScore = 82;
    else if (wordCount >= 50) devScore = 68;
    else if (wordCount >= 30) devScore = 50;
    else devScore = 30;

    // Salutation & sign-off checks
    const hasSalutation = /\b(dear|hello|hi|good morning|good afternoon|professor|dr\.|director|advisor|coordinator)\b/i.test(
      bodyOnlyText.slice(0, 120)
    );
    const hasSignOff = /\b(sincerely|regards|best|thank you|thanks|respectfully|yours|warmly|cordially)\b/i.test(
      bodyOnlyText.slice(-160)
    );
    if (hasSalutation) cohScore += 6;
    else devScore -= 6;

    if (hasSignOff) cohScore += 6;
    else devScore -= 6;

    // Bullet point coverage (3 goals)
    if (relevance.totalBullets > 0) {
      if (relevance.bulletsCovered === relevance.totalBullets) {
        devScore += 6;
      } else if (relevance.bulletsCovered === 2) {
        devScore -= 10;
      } else if (relevance.bulletsCovered === 1) {
        devScore -= 22;
      } else {
        devScore -= 35;
      }
    }
  } else if (canonicalType === 'academic-discussion') {
    // 2026 TOEFL iBT Academic Discussion (10 mins): Full length credit at 105–150+ words!
    if (wordCount >= 115) devScore = 93;
    else if (wordCount >= 100) devScore = 88;
    else if (wordCount >= 80) devScore = 76;
    else if (wordCount >= 55) devScore = 62;
    else devScore = 40;

    if (stanceMarkersUsed.length >= 1) devScore += 4;
    else devScore -= 6;

    // Check if student referenced topic or classmates
    const s1Name = String(promptData?.s1?.name || promptData?.s1 || extra?.task?.s1?.name || '').split(':')[0].trim().toLowerCase();
    const s2Name = String(promptData?.s2?.name || promptData?.s2 || extra?.task?.s2?.name || '').split(':')[0].trim().toLowerCase();
    if ((s1Name && lowerText.includes(s1Name)) || (s2Name && lowerText.includes(s2Name))) {
      cohScore += 5;
    }
  } else if (canonicalType === 'speaking-interview') {
    // 2026 TOEFL iBT Speaking Interview (4 x 45s):
    // Score each of the 4 questions individually and average across all 4!
    const parsedInterview = parseSpeakingInterviewResponses(studentResponse, extra);
    answeredQuestionsCount = parsedInterview.answeredCount;

    const slotScores6: number[] = [];
    for (let i = 0; i < 4; i++) {
      const resp = parsedInterview.slotResponses[i];
      const respWords = tokenizeWords(resp);
      if (respWords.length < 3) {
        // Unanswered question counts as 0!
        slotScores6.push(0);
        continue;
      }
      let slotBand = 3.5;
      if (respWords.length >= 55) slotBand = 5.5;
      else if (respWords.length >= 40) slotBand = 5.0;
      else if (respWords.length >= 28) slotBand = 4.5;
      else if (respWords.length >= 18) slotBand = 3.5;
      else if (respWords.length >= 10) slotBand = 2.5;
      else slotBand = 1.5;

      const respLower = resp.toLowerCase();
      const hasTrans = ACADEMIC_TRANSITIONS.some((t) => respLower.includes(t));
      const hasComplex = COMPLEX_CLAUSE_MARKERS.some((c) => new RegExp(`\\b${c}\\b`, 'i').test(respLower));
      if (hasTrans && hasComplex && respWords.length >= 45) {
        slotBand = Math.min(6.0, slotBand + 0.5);
      }
      const slotErrors = detectGrammarAndMechanicsErrors(resp);
      if (slotErrors.length >= 2) {
        slotBand = Math.max(1.5, slotBand - 0.5 * Math.min(3, slotErrors.length));
      }
      slotScores6.push(slotBand);
    }

    const avgSlotBand = slotScores6.reduce((a, b) => a + b, 0) / 4;
    interviewCompletenessCap = Math.max(
      1.0,
      Math.round(Math.min(avgSlotBand, 6.0 * (answeredQuestionsCount / 4)) * 2) / 2
    );

    devScore = Math.round((interviewCompletenessCap / 6.0) * 95);
    if (extra?.wpm) {
      if (extra.wpm >= 110 && extra.wpm <= 165) devScore += 4;
      else if (extra.wpm < 80) devScore -= 8;
    }
  }

  devScore = Math.min(98, Math.max(20, devScore));

  // Coherence & Organization
  if (transitionsUsed.length >= 3) cohScore = 92;
  else if (transitionsUsed.length === 2) cohScore = 85;
  else if (transitionsUsed.length === 1) cohScore = 76;
  else cohScore = 62;

  const paragraphCount = bodyOnlyText.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length;
  if (canonicalType !== 'speaking-interview' && paragraphCount >= 2) {
    cohScore = Math.min(98, cohScore + 5);
  }
  if (canonicalType === 'speaking-interview' && extra?.pauseCount !== undefined) {
    if (extra.pauseCount === 0) cohScore = Math.min(96, cohScore + 5);
    else if (extra.pauseCount >= 4) cohScore -= 12;
  }
  cohScore = Math.min(98, Math.max(25, cohScore));

  // Lexical Resource (Vocabulary)
  if (academicWordRatio >= 0.24 && ttr >= 0.52) vocabScore = 94;
  else if (academicWordRatio >= 0.18 && ttr >= 0.45) vocabScore = 85;
  else if (academicWordRatio >= 0.13) vocabScore = 75;
  else vocabScore = 62;
  vocabScore = Math.min(98, Math.max(25, vocabScore));

  // Grammatical Range & Accuracy
  if (avgWordsPerSentence >= 13 && avgWordsPerSentence <= 26 && complexClausesUsed.length >= 2) {
    gramScore = 92;
  } else if (avgWordsPerSentence >= 10 && complexClausesUsed.length >= 1) {
    gramScore = 82;
  } else if (avgWordsPerSentence < 7) {
    gramScore = 58;
  } else {
    gramScore = 72;
  }
  gramScore = Math.max(20, gramScore - grammarErrorPenalty);
  if (canonicalType === 'speaking-interview' && (extra?.fillerCount || 0) >= 3) {
    gramScore = Math.max(25, gramScore - 10);
  }

  // Relevance adjustments
  if (relevance.relevanceRatio >= 0.35) {
    devScore = Math.min(98, devScore + 3);
  } else if (relevance.relevanceRatio > 0 && relevance.relevanceRatio < 0.15) {
    devScore = Math.max(30, devScore - 15);
  }

  const avgCriteria = Math.round((devScore + cohScore + vocabScore + gramScore) / 4);
  let scaledScore = Math.min(30, Math.max(4, Math.round((avgCriteria / 100) * 30)));

  // Task-specific caps (Note: Write an Email is a 7-minute 85-130 word task, so do NOT cap 85+ word emails!)
  if (canonicalType === 'write-email') {
    if (wordCount < 35) scaledScore = Math.min(scaledScore, 12);
    else if (wordCount < 60) scaledScore = Math.min(scaledScore, 19);
    else if (wordCount < 75) scaledScore = Math.min(scaledScore, 24);
  } else if (canonicalType === 'academic-discussion') {
    if (wordCount < 45) scaledScore = Math.min(scaledScore, 12);
    else if (wordCount < 75) scaledScore = Math.min(scaledScore, 19);
    else if (wordCount < 95) scaledScore = Math.min(scaledScore, 24);
  }

  let bandScore6 = convertScaledToBand6(scaledScore);

  // Enforce Speaking Interview completeness cap (k / 4 questions answered)
  if (canonicalType === 'speaking-interview') {
    bandScore6 = Math.min(bandScore6, interviewCompletenessCap);
    scaledScore = Math.round((bandScore6 / 6.0) * 30);
  }

  // Enforce Off-Topic cap (<= 2.0)
  if (offTopicDetected) {
    bandScore6 = Math.min(bandScore6, 2.0);
    scaledScore = Math.min(scaledScore, 9);
  }

  // Enforce Prompt-Copying / Plagiarism cap (<= 1.5)
  if (copiedPromptDetected) {
    bandScore6 = Math.min(bandScore6, 1.5);
    scaledScore = Math.min(scaledScore, 6);
  }

  // Enforce Grammar error ceiling if many errors exist
  if (corrections.length >= 4) {
    bandScore6 = Math.min(bandScore6, 3.5);
    scaledScore = Math.min(scaledScore, 17);
  } else if (corrections.length >= 2) {
    bandScore6 = Math.min(bandScore6, 4.5);
    scaledScore = Math.min(scaledScore, 23);
  }

  const rawRubric5 = Number(((bandScore6 / 6.0) * 5.0).toFixed(1));
  const rawRubric4 = Number(((bandScore6 / 6.0) * 4.0).toFixed(1));
  const rawRubricScore = canonicalType === 'speaking-interview' ? rawRubric4 : rawRubric5;

  const performanceLevel: LocalEvaluationResult['performanceLevel'] =
    bandScore6 >= 5.5
      ? 'Advanced'
      : bandScore6 >= 4.0
      ? 'High-Intermediate'
      : bandScore6 >= 2.5
      ? 'Low-Intermediate'
      : 'Basic';

  // Strengths & Improvements
  const strengths: string[] = [];
  const improvements: string[] = [];

  if (copiedPromptDetected) {
    improvements.push('Avoid copying sentences directly from the prompt; use your own words.');
  }
  if (offTopicDetected) {
    improvements.push('Your response appears off-topic and does not address the prompt requirements.');
  }

  if (canonicalType === 'speaking-interview' && answeredQuestionsCount < 4) {
    improvements.push(
      `You only answered ${answeredQuestionsCount} of the 4 interview questions. Complete all 4 questions to achieve a full TOEFL Speaking band score.`
    );
  }

  if (canonicalType === 'write-email') {
    if (wordCount >= 85) {
      strengths.push(`Meets the official 7-minute TOEFL Email target length (${wordCount} words).`);
    } else {
      improvements.push(
        `Expand your email to 85–130 words (currently ${wordCount} words) to fully elaborate on all 3 required objectives.`
      );
    }
    if (relevance.totalBullets > 0 && relevance.bulletsCovered < relevance.totalBullets) {
      improvements.push(
        `Address all ${relevance.totalBullets} required bullet points in the prompt (currently covered ${relevance.bulletsCovered} of ${relevance.totalBullets}).`
      );
    } else if (relevance.totalBullets > 0) {
      strengths.push(`Addresses all ${relevance.totalBullets} communicative objectives specified in the prompt.`);
    }
  } else if (canonicalType === 'academic-discussion') {
    if (wordCount >= 105) {
      strengths.push(`Strong development (${wordCount} words) meeting the 10-minute Academic Discussion target.`);
    } else {
      improvements.push(
        `Aim for 105–150+ words (currently ${wordCount} words) to develop your argument with concrete academic examples.`
      );
    }
  }

  if (transitionsUsed.length >= 2) {
    strengths.push(`Effective use of academic discourse markers (${transitionsUsed.slice(0, 3).join(', ')}).`);
  } else {
    improvements.push(
      'Incorporate formal academic transitions ("furthermore", "consequently", "on the other hand") to link ideas.'
    );
  }

  if (complexClausesUsed.length >= 2) {
    strengths.push('Good syntactic variety using subordinate and relative clauses.');
  } else {
    improvements.push('Combine short simple sentences using subordinate clauses ("although", "whereas", "which").');
  }

  if (corrections.length > 0) {
    improvements.push(
      `Review ${corrections.length} grammatical/mechanical issue(s) identified in your response (e.g., "${corrections[0].original}" -> "${corrections[0].corrected}").`
    );
  } else if (!copiedPromptDetected && !offTopicDetected) {
    strengths.push('Clean grammatical control and mechanics with no major surface errors.');
  }

  if (strengths.length === 0) {
    strengths.push('Submitted a response for rubric analysis.');
  }

  const summary = copiedPromptDetected
    ? `Score capped at Band ${bandScore6.toFixed(1)}/6.0 (${performanceLevel}) because over 45% of the response was copied verbatim from the prompt. Paraphrase ideas in your own academic language.`
    : offTopicDetected
    ? `Score capped at Band ${bandScore6.toFixed(1)}/6.0 (${performanceLevel}) because the response does not address the specific topic and requirements of the prompt.`
    : canonicalType === 'speaking-interview' && answeredQuestionsCount < 4
    ? `Evaluated on the 2026 ETS TOEFL Speaking Rubric: Band ${bandScore6.toFixed(1)}/6.0 (${performanceLevel}). Note: Only ${answeredQuestionsCount} of 4 interview questions were answered, capping the overall band score proportionally (${answeredQuestionsCount}/4).`
    : `Evaluated on the 2026 ETS TOEFL Rubric: Band ${bandScore6.toFixed(1)}/6.0 (${performanceLevel}, Scaled ${scaledScore}/30). Your response (${wordCount} words, ${sentenceCount} sentences) demonstrates ${
        bandScore6 >= 5.0 ? 'strong' : bandScore6 >= 4.0 ? 'solid' : 'developing'
      } organization and lexical control.`;

  // Build Band 6.0 Exemplar
  let exemplar = '';
  if (canonicalType === 'write-email') {
    const recipient = promptData?.recipient || extra?.task?.recipient || 'Professor';
    const goals: string[] = promptData?.goals || extra?.task?.goals || [
      'explain the situation',
      'propose a solution',
      'confirm next steps',
    ];
    exemplar = `Subject: Inquiry Regarding ${promptData?.title || 'Academic Coursework'}\n\nDear ${recipient},\n\nI am writing to formally address ${goals[0]?.toLowerCase() || 'our upcoming academic requirement'}. Specifically, after reviewing the departmental guidelines, I wanted to ensure that my current progress aligns with your expectations.\n\nFurthermore, regarding ${goals[1]?.toLowerCase() || 'the second objective'}, I have prepared the necessary documentation and can submit it prior to the deadline. Finally, concerning ${goals[2]?.toLowerCase() || 'our next steps'}, I would be grateful if you could confirm whether a brief meeting during your office hours this week would be convenient.\n\nThank you very much for your time and guidance.\n\nSincerely,\nAlex Morgan`;
  } else if (canonicalType === 'academic-discussion') {
    const s1Name = String(promptData?.s1?.name || promptData?.s1 || extra?.task?.s1?.name || 'my classmate').split(':')[0];
    const s2Name = String(promptData?.s2?.name || promptData?.s2 || extra?.task?.s2?.name || 'the other student').split(':')[0];
    exemplar = `While ${s1Name} raises a valid point regarding immediate practical benefits, I strongly agree with ${s2Name}'s perspective that long-term institutional sustainability must take precedence. In my view, addressing "${promptData?.title || 'this policy issue'}" requires a balanced, evidence-based framework rather than short-term measures.\n\nSpecifically, empirical studies consistently demonstrate that when universities and policymakers invest in foundational infrastructure and transparent governance, both efficiency and equity improve significantly over time. Therefore, adopting a comprehensive strategy ensures lasting benefits for the entire academic community.`;
  } else {
    exemplar = `From my perspective, ${promptData?.title || 'this academic topic'} plays a pivotal role in modern higher education. First, when institutions prioritize structured, evidence-based practices, students develop stronger analytical and problem-solving capabilities. For instance, in my own academic coursework, collaborative seminars allowed us to synthesize theoretical models with real-world applications. Ultimately, balancing innovation with rigorous standards ensures long-term success.`;
  }

  return {
    bandScore6,
    overallBand: bandScore6,
    bandScore: bandScore6,
    rawRubricScore,
    scaledScore,
    performanceLevel,
    criteria: {
      taskFulfillment: devScore,
      coherence: cohScore,
      vocabulary: vocabScore,
      grammar: gramScore,
    },
    summary,
    feedbackSummary: summary,
    strengths,
    improvements,
    areasForImprovement: improvements,
    topFixes: improvements.slice(0, 3),
    tips: improvements,
    exemplar,
    exemplarResponse: exemplar,
    modelBand6Rewrite: exemplar,
    corrections,
    errors: corrections,
    grammarErrors: corrections,
    copiedPromptDetected,
    offTopicDetected,
    answeredQuestionsCount,
    isLocalEvaluation: true,
    modelUsed: 'Local Rubric Engine (Zero-API)',
  };
}

/**
 * Alias with signature (promptData, studentResponse, taskType, extra)
 */
export function evaluateResponseLocally(
  promptData: any,
  studentResponse: any,
  taskType: string = 'academic-discussion',
  extra?: any
): LocalEvaluationResult {
  return evaluateLocally(taskType, promptData, studentResponse, extra);
}
