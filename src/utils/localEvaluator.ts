import { convertScaledToBand6 } from './scoreTracker';
import { calculateSentenceMatch } from './audioSpeech';

export interface GrammarErrorItem {
  original: string;
  corrected: string;
  explanation: string;
  type?: 'grammar' | 'spelling' | 'mechanics' | 'wording';
}

export interface CriterionItem {
  name: string;
  score: number;
  maxScore?: number;
  displayScore?: string;
  feedback: string;
  comment: string;
}

export interface BulletAnalysisItem {
  goal: string;
  addressed: boolean;
  status: 'complete' | 'partial' | 'missing';
  feedback: string;
}

export type CriteriaArrayWithLegacyProps = CriterionItem[] & {
  taskFulfillment: number;
  coherence: number;
  vocabulary: number;
  grammar: number;
};

export interface LocalEvaluationResult {
  bandScore6: number;
  overallBand: number;
  bandScore: number;
  rawRubricScore: number;
  scaledScore: number;
  performanceLevel: 'Advanced' | 'High-Intermediate' | 'Low-Intermediate' | 'Basic';
  criteria: CriteriaArrayWithLegacyProps;
  criteriaBreakdown: {
    taskFulfillment: number;
    coherence: number;
    vocabulary: number;
    grammar: number;
  };
  subScores: {
    taskFulfillment: number;
    languageUse: number;
    topicDevelopment: number;
  };
  bulletAnalysis?: BulletAnalysisItem[];
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
  wordingImprovements?: GrammarErrorItem[];
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

const COMMON_ACADEMIC_MISSPELLINGS: Record<string, string> = {
  disucss: 'discuss',
  disucssed: 'discussed',
  disucssing: 'discussing',
  discusion: 'discussion',
  introdutory: 'introductory',
  introdcutory: 'introductory',
  introductry: 'introductory',
  recieve: 'receive',
  recieved: 'received',
  seperate: 'separate',
  seperated: 'separated',
  occured: 'occurred',
  occuring: 'occurring',
  accomodate: 'accommodate',
  accomodation: 'accommodation',
  definately: 'definitely',
  definitly: 'definitely',
  enviroment: 'environment',
  enviromental: 'environmental',
  goverment: 'government',
  neccessary: 'necessary',
  necesary: 'necessary',
  priviledge: 'privilege',
  recomend: 'recommend',
  reccommend: 'recommend',
  recomendation: 'recommendation',
  sedeule: 'schedule',
  scedule: 'schedule',
  scheduel: 'schedule',
  profesoor: 'professor',
  proffessor: 'professor',
  profesor: 'professor',
  uniiversity: 'university',
  univeristy: 'university',
  requiremnt: 'requirement',
  requirment: 'requirement',
  requiremnts: 'requirements',
  requirments: 'requirements',
  appointmnt: 'appointment',
  apointment: 'appointment',
  assignmnt: 'assignment',
  assingment: 'assignment',
  availible: 'available',
  avaliable: 'available',
  conveniant: 'convenient',
  convinient: 'convenient',
  tommorow: 'tomorrow',
  tomorow: 'tomorrow',
  wedensday: 'Wednesday',
  wensday: 'Wednesday',
  thrusday: 'Thursday',
  febuary: 'February',
  oppurtunity: 'opportunity',
  oportunity: 'opportunity',
  attendence: 'attendance',
  labratory: 'laboratory',
  curricullum: 'curriculum',
  knowlege: 'knowledge',
  arguement: 'argument',
  beggining: 'beginning',
  beleive: 'believe',
  calender: 'calendar',
  collegue: 'colleague',
  commitee: 'committee',
  concious: 'conscious',
  curiousity: 'curiosity',
  disapoint: 'disappoint',
  embarass: 'embarrass',
  existance: 'existence',
  foriegn: 'foreign',
  freind: 'friend',
  grammer: 'grammar',
  guidence: 'guidance',
  immediatly: 'immediately',
  independant: 'independent',
  interupt: 'interrupt',
  maintainance: 'maintenance',
  noticable: 'noticeable',
  occassion: 'occasion',
  persue: 'pursue',
  posession: 'possession',
  prefered: 'preferred',
  questionaire: 'questionnaire',
  refered: 'referred',
  relevent: 'relevant',
  succesful: 'successful',
  suprise: 'surprise',
  unfortunatly: 'unfortunately',
  untill: 'until',
  wierd: 'weird',
  biolgoy: 'biology',
  biolgy: 'biology',
};

const CORE_ACADEMIC_TARGETS = [
  'discuss',
  'introductory',
  'biology',
  'chemistry',
  'psychology',
  'economics',
  'professor',
  'schedule',
  'requirement',
  'requirements',
  'university',
  'alternative',
  'wednesday',
  'thursday',
  'tuesday',
  'saturday',
  'semester',
  'department',
  'laboratory',
  'assignment',
  'research',
  'conference',
  'attendance',
  'registration',
  'graduation',
  'syllabus',
  'curriculum',
  'experiment',
  'presentation',
  'scholarship',
  'opportunity',
  'convenient',
  'available',
  'appointment',
];

export function buildCriteriaArray(
  items: CriterionItem[],
  legacyScores: {
    taskFulfillment: number;
    coherence: number;
    vocabulary: number;
    grammar: number;
  }
): CriteriaArrayWithLegacyProps {
  const arr = [...items] as CriteriaArrayWithLegacyProps;
  Object.assign(arr, legacyScores);
  return arr;
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

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
    if (Array.isArray(src.instructions)) {
      for (const inst of src.instructions) {
        if (inst) chunks.push(String(inst));
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
 * Counts how many distinct specific alternative day/time expressions the student proposed
 * (excluding a day mentioned purely as the missed office-hours day).
 */
function countProposedAlternativeTimeSlots(studentText: string, promptData: any, extra?: any): {
  proposedCount: number;
  hasVagueTimeOnly: boolean;
} {
  const clean = String(studentText || '').toLowerCase();
  const promptSituation = String(promptData?.situation || extra?.task?.situation || '').toLowerCase();

  // Identify if a specific day of the week is mentioned in the prompt situation as the conflict day (e.g., "Wednesday")
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const conflictDays = new Set<string>();
  for (const d of days) {
    if (promptSituation.includes(d)) {
      conflictDays.add(d);
    }
  }

  let proposedCount = 0;
  // Check non-conflict days mentioned in student text
  for (const d of days) {
    if (clean.includes(d) && !conflictDays.has(d)) {
      proposedCount++;
    }
  }

  // Check explicit clock times or time-of-day periods (e.g. "2:00", "2 pm", "10 am", "morning", "afternoon", "tomorrow", "next week")
  const timeMatches = clean.match(/\b(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|o'clock)|morning|afternoon|evening|tomorrow|next\s+week)\b/gi) || [];
  proposedCount += timeMatches.length;

  const hasVagueTimeOnly =
    proposedCount < 2 &&
    /\b(whenever\s+you\s+are\s+free|whenever\s+you're\s+free|another\s+time|any\s+time|some\s+other\s+time|when\s+you\s+are\s+free)\b/i.test(
      clean
    );

  return { proposedCount, hasVagueTimeOnly };
}

/**
 * 2. Topic & Bullet-Point Relevance Scoring:
 * Extracts significant topic keywords and verifies each required objective for Write an Email.
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
  bulletAnalysis: BulletAnalysisItem[];
} {
  const studentWords = tokenizeWords(studentText);
  const studentWordSet = new Set(studentWords);
  const studentStems = new Set(
    studentWords.filter((w) => w.length >= 5).map((w) => w.slice(0, 5))
  );

  // Also include corrected forms of misspelled words so a typo like "disucss" or "introdutory"
  // is still recognized for topic keyword matching while being penalized in Spelling/Grammar!
  for (const w of studentWords) {
    if (COMMON_ACADEMIC_MISSPELLINGS[w]) {
      const fixed = COMMON_ACADEMIC_MISSPELLINGS[w].toLowerCase();
      studentWordSet.add(fixed);
      if (fixed.length >= 5) studentStems.add(fixed.slice(0, 5));
    }
  }

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
    : Array.isArray(promptData?.instructions)
    ? promptData.instructions
    : Array.isArray(extra?.task?.goals)
    ? extra.task.goals
    : [];

  let bulletsCovered = 0;
  const bulletAnalysis: BulletAnalysisItem[] = [];

  for (let idx = 0; idx < rawGoals.length; idx++) {
    const goal = String(rawGoals[idx] || '').trim();
    const asksForTwoTimes =
      /\b(two|2|multiple|several)\s+(?:alternative\s+|specific\s+|different\s+|possible\s+)?(?:times?|days?|dates?|slots?|options?)\b/i.test(
        goal
      ) ||
      /\bsuggest\s+(?:two\s+)?(?:alternative\s+)?times?\b/i.test(goal);

    if (asksForTwoTimes) {
      const { proposedCount, hasVagueTimeOnly } = countProposedAlternativeTimeSlots(
        studentText,
        promptData,
        extra
      );
      if (proposedCount >= 2) {
        bulletsCovered++;
        bulletAnalysis.push({
          goal,
          addressed: true,
          status: 'complete',
          feedback: `Objective #${idx + 1} Complete: Proposed two specific alternative meeting times.`,
        });
      } else if (proposedCount === 1) {
        bulletsCovered += 0.5;
        bulletAnalysis.push({
          goal,
          addressed: false,
          status: 'partial',
          feedback: `Objective #${idx + 1} Partially Addressed: The prompt requires two alternative times ("${goal}"), but only one specific time/day was mentioned.`,
        });
      } else {
        bulletAnalysis.push({
          goal,
          addressed: false,
          status: hasVagueTimeOnly ? 'partial' : 'missing',
          feedback: hasVagueTimeOnly
            ? `Objective #${idx + 1} Incomplete: The prompt requires you to "${goal}", but you only wrote a vague request ("another time whenever you are free") without proposing two specific days or time slots (e.g., "Tuesday at 2:00 PM or Thursday morning at 10:00 AM").`
            : `Objective #${idx + 1} Missing: You did not suggest two specific alternative times to meet ("${goal}").`,
        });
      }
      continue;
    }

    const goalWords = tokenizeWords(goal).filter(
      (w) => w.length >= 4 && !STOP_WORDS.has(w) && !['meet', 'with', 'when', 'could', 'would', 'your'].includes(w)
    );
    if (goalWords.length === 0) {
      bulletsCovered++;
      bulletAnalysis.push({
        goal,
        addressed: true,
        status: 'complete',
        feedback: `Objective #${idx + 1} Complete: Addressed "${goal}".`,
      });
      continue;
    }
    const hasMatch = goalWords.some(
      (gw) => studentWordSet.has(gw) || (gw.length >= 5 && studentStems.has(gw.slice(0, 5)))
    );
    if (hasMatch) {
      bulletsCovered++;
      bulletAnalysis.push({
        goal,
        addressed: true,
        status: 'complete',
        feedback: `Objective #${idx + 1} Complete: Addressed "${goal}".`,
      });
    } else {
      bulletAnalysis.push({
        goal,
        addressed: false,
        status: 'missing',
        feedback: `Objective #${idx + 1} Incomplete: Make sure to explicitly address "${goal}" with concrete details.`,
      });
    }
  }

  const totalBullets = rawGoals.length;
  const roundedCovered = Math.floor(bulletsCovered);
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
    bulletsCovered: roundedCovered,
    totalBullets,
    bulletAnalysis,
  };
}

/**
 * 4. Expanded Grammar, Spelling, Capitalization & Wording Detection:
 * Dynamically detects spelling typos, standalone lowercase "i", repeated words,
 * preposition/collocation errors, pronoun agreement, punctuation, and better wording.
 */
export function detectGrammarAndMechanicsErrors(
  rawText: string,
  promptData?: any,
  extra?: any
): GrammarErrorItem[] {
  const text = String(rawText || '').replace(/^Subject:.*$/im, '').trim();
  if (!text) return [];

  const errors: GrammarErrorItem[] = [];
  const seenOriginals = new Set<string>();

  const pushError = (
    original: string,
    corrected: string,
    explanation: string,
    type: GrammarErrorItem['type'] = 'grammar'
  ) => {
    const cleanOrig = original.trim();
    if (!cleanOrig || seenOriginals.has(cleanOrig.toLowerCase())) return;
    seenOriginals.add(cleanOrig.toLowerCase());
    errors.push({
      original: cleanOrig,
      corrected: corrected.trim(),
      explanation,
      type,
    });
  };

  let m: RegExpExecArray | null;

  // 1. Standalone lowercase "i" and contractions "i'm", "i've", "i'll", "i'd", "i couldn't"
  const lowerIContractionRegex = /\b(i'(?:m|ve|ll|d))\b/g;
  while ((m = lowerIContractionRegex.exec(text)) !== null) {
    const tok = m[1];
    pushError(
      tok,
      'I' + tok.slice(1),
      'Capitalization error: the first-person singular pronoun "I" must always be capitalized in English.',
      'mechanics'
    );
  }

  const lowerIStandaloneRegex = /\bi\b/g;
  while ((m = lowerIStandaloneRegex.exec(text)) !== null) {
    const afterChar = text[m.index + 1] || '';
    if (afterChar === "'" || afterChar === '.') continue;
    pushError(
      'i',
      'I',
      'Capitalization error: the first-person singular pronoun "I" must always be capitalized in English.',
      'mechanics'
    );
  }

  // 2. Double / repeated consecutive words ("about about", "the the", "and and", "is is")
  const doubleWordRegex = /\b([a-zA-Z]{2,})\s+\1\b/gi;
  while ((m = doubleWordRegex.exec(text)) !== null) {
    const word = m[1].toLowerCase();
    if (word !== 'had' && word !== 'that') {
      // Check if preceded by discuss/disucss ("discuss about about")
      const prefixSlice = text.slice(Math.max(0, m.index - 12), m.index).toLowerCase();
      if (word === 'about' && /(?:discuss|disucss)\s*$/.test(prefixSlice)) {
        pushError(
          m[0],
          '[omit — "discuss" takes no preposition "about"]',
          'Redundant repeated word ("about about") and collocation error: the transitive verb "discuss" takes a direct object directly without "about" (write "discuss the introductory courses").',
          'grammar'
        );
      } else {
        pushError(
          m[0],
          m[1],
          `Redundant repeated word: remove the duplicate word "${m[1]}".`,
          'grammar'
        );
      }
    }
  }

  // 3. Explicit dictionary of common academic & campus spelling mistakes
  const wordTokenRegex = /\b([A-Za-z]{4,})\b/g;
  while ((m = wordTokenRegex.exec(text)) !== null) {
    const rawWord = m[1];
    const lowerWord = rawWord.toLowerCase();
    if (COMMON_ACADEMIC_MISSPELLINGS[lowerWord]) {
      const correctBase = COMMON_ACADEMIC_MISSPELLINGS[lowerWord];
      const corrected =
        rawWord[0] === rawWord[0].toUpperCase() && rawWord[0] !== rawWord[0].toLowerCase()
          ? correctBase.charAt(0).toUpperCase() + correctBase.slice(1)
          : correctBase;
      pushError(
        rawWord,
        corrected,
        `Spelling error: "${rawWord}" is misspelled; the correct academic spelling is "${corrected}".`,
        'spelling'
      );
    }
  }

  // 4. Dynamic Prompt-Word & Core Academic Word Levenshtein Typo Check (edit distance 1-2)
  const promptStrings = collectPromptStrings(promptData, extra);
  const targetVocabMap = new Map<string, string>();
  for (const w of CORE_ACADEMIC_TARGETS) {
    targetVocabMap.set(w.toLowerCase(), w);
  }
  for (const chunk of promptStrings) {
    const rawMatches = chunk.match(/\b[A-Za-z]{6,}\b/g) || [];
    for (const rw of rawMatches) {
      targetVocabMap.set(rw.toLowerCase(), rw.toLowerCase());
    }
  }

  const validLookup = new Set<string>(targetVocabMap.keys());
  for (const k of Array.from(validLookup)) {
    validLookup.add(`${k}s`);
    validLookup.add(`${k}es`);
    validLookup.add(`${k}ed`);
    validLookup.add(`${k}d`);
    validLookup.add(`${k}ing`);
    if (k.endsWith('y')) {
      validLookup.add(`${k.slice(0, -1)}ies`);
      validLookup.add(`${k.slice(0, -1)}ied`);
    }
  }

  wordTokenRegex.lastIndex = 0;
  while ((m = wordTokenRegex.exec(text)) !== null) {
    const rawWord = m[1];
    const lowerWord = rawWord.toLowerCase();
    if (
      lowerWord.length < 6 ||
      validLookup.has(lowerWord) ||
      COMMON_ACADEMIC_MISSPELLINGS[lowerWord] ||
      STOP_WORDS.has(lowerWord)
    ) {
      continue;
    }

    for (const [targetLower, targetDisplay] of targetVocabMap.entries()) {
      if (Math.abs(lowerWord.length - targetLower.length) > 2) continue;
      // Avoid flagging valid inflections of the target word
      if (
        lowerWord === `${targetLower}s` ||
        lowerWord === `${targetLower}ed` ||
        lowerWord === `${targetLower}ing` ||
        targetLower === `${lowerWord}s` ||
        targetLower === `${lowerWord}ed`
      ) {
        continue;
      }
      // Require same starting letter and ending letter to avoid false positives on unrelated words
      if (lowerWord[0] !== targetLower[0]) continue;
      const dist = levenshteinDistance(lowerWord, targetLower);
      if (
        dist === 1 ||
        (dist === 2 &&
          lowerWord.length >= 7 &&
          targetLower.length >= 7 &&
          lowerWord[1] === targetLower[1] &&
          lowerWord[lowerWord.length - 1] === targetLower[targetLower.length - 1])
      ) {
        pushError(
          rawWord,
          targetDisplay,
          `Spelling error: "${rawWord}" appears to be a typo for "${targetDisplay}".`,
          'spelling'
        );
        break;
      }
    }
  }

  // 5. Common ESL Grammar & Collocation Patterns
  // 5a. "you office hours" / "you office" / "you class" / "you course" / "you help" / "you lecture"
  const youPossessiveRegex = /\b(you)\s+(office\s+hours|office|class(?:es)?|course(?:s)?|lecture(?:s)?|help|guidance|time|schedule|email|question(?:s)?|syllabus|department)\b/gi;
  while ((m = youPossessiveRegex.exec(text)) !== null) {
    const isCap = m[1][0] === 'Y';
    pushError(
      m[0],
      `${isCap ? 'Your' : 'your'} ${m[2]}`,
      `Grammar error: use the possessive determiner "${isCap ? 'Your' : 'your'}" before the noun phrase "${m[2]}" instead of the pronoun "${m[1]}".`,
      'grammar'
    );
  }

  // 5b. "during Monday/Tuesday/Wednesday/Thursday/Friday/Saturday/Sunday" -> "on Wednesday"
  const duringDayRegex = /\b(during)\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s?\b/gi;
  while ((m = duringDayRegex.exec(text)) !== null) {
    const isCap = m[1][0] === 'D';
    const dayProper = m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase();
    pushError(
      m[0],
      `${isCap ? 'On' : 'on'} ${dayProper}`,
      `Preposition error: use the preposition "on" with days of the week ("on ${dayProper}"), not "during".`,
      'grammar'
    );
  }

  // 5c. "have by biology" / "by biology" / "by schedule" / "by class" (typo for "my")
  const byForMyRegex = /\b(have|had|attend|attended|in|for|missed)\s+by\s+(biology|chemistry|physics|math|psychology|economics|history|english|class(?:es)?|course(?:s)?|lecture(?:s)?|lab|schedule|exam|meeting)\b/gi;
  while ((m = byForMyRegex.exec(text)) !== null) {
    const verb = m[1].toLowerCase() === 'have' ? 'had' : m[1];
    pushError(
      m[0],
      `${verb} my ${m[2]}`,
      `Grammar & word-choice error: replace "by" with the possessive determiner "my" ("${verb} my ${m[2]}").`,
      'grammar'
    );
  }

  // 5d. Plural noun + "and its" ("classes and its requirement", "courses and its")
  const pluralItsRegex = /\b(classes|courses|lectures|seminars|labs|assignments|exams|projects)\s+and\s+its\s+(requirement(?:s)?|schedule|syllabus|deadline(?:s)?|workload|grade(?:s)?)\b/gi;
  while ((m = pluralItsRegex.exec(text)) !== null) {
    const pluralNoun = m[1];
    const fixedReq = m[2].endsWith('s') ? m[2] : `${m[2]}s`;
    pushError(
      m[0],
      `${pluralNoun} and their ${fixedReq}`,
      `Pronoun-antecedent agreement error: plural "${pluralNoun}" does not agree with singular possessive "its". Use "${pluralNoun} and their ${fixedReq}".`,
      'grammar'
    );
  }

  // 5e. "discuss/disucss about" (single "about")
  const discussAboutRegex = /\b(discuss(?:ed|ing|es)?|disucss(?:ed|ing|es)?)\s+about\b(?!\s+about)/gi;
  while ((m = discussAboutRegex.exec(text)) !== null) {
    pushError(
      m[0],
      'discuss',
      'Grammar/Collocation error: "discuss" is a transitive verb and takes a direct object without the preposition "about".',
      'grammar'
    );
  }

  // 6. Subject-verb agreement: "he/she/it have" or "he/she/it do"
  const svPronounRegex = /\b(he|she|it)\s+(have|do|are|were)\b/gi;
  while ((m = svPronounRegex.exec(text)) !== null) {
    const subj = m[1];
    const verb = m[2].toLowerCase();
    const fixVerb =
      verb === 'have' ? 'has' : verb === 'do' ? 'does' : verb === 'are' ? 'is' : 'was';
    pushError(
      m[0],
      `${subj} ${fixVerb}`,
      `Singular third-person subject "${subj}" requires the singular verb "${fixVerb}".`,
      'grammar'
    );
  }

  // 7. Existential "there is many / several / numerous / multiple / various / few"
  const thereIsPluralRegex = /\b(there\s+is)\s+(many|several|numerous|multiple|various|few|two|three|four|five|a\s+lot\s+of\s+\w+s)\b/gi;
  while ((m = thereIsPluralRegex.exec(text)) !== null) {
    const isCap = m[1][0] === 'T';
    pushError(
      m[0],
      `${isCap ? 'There are' : 'there are'} ${m[2]}`,
      'Use plural "there are" before plural quantifiers and countable plural nouns.',
      'grammar'
    );
  }

  // 8. Indefinite pronouns with plural verbs: "everyone have/are"
  const indefRegex = /\b(everyone|everybody|someone|somebody|nobody|anybody|each\s+student|every\s+student)\s+(have|are|were|do)\b/gi;
  while ((m = indefRegex.exec(text)) !== null) {
    const subj = m[1];
    const verb = m[2].toLowerCase();
    const fixVerb =
      verb === 'have' ? 'has' : verb === 'are' ? 'is' : verb === 'were' ? 'was' : 'does';
    pushError(
      m[0],
      `${subj} ${fixVerb}`,
      `Singular indefinite subject "${subj}" requires the singular verb "${fixVerb}".`,
      'grammar'
    );
  }

  // 9. Uncountable plural errors ("informations", "researches", "advices", "equipments", "knowledges")
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
      `"${fixed}" is an uncountable noun in academic English and does not take a plural "-s" ending.`,
      'grammar'
    );
  }

  // 10. Modal + "to" + verb ("can to help", "should to study", "must to complete")
  const modalToRegex = /\b(can|could|will|would|should|must|may|might)\s+to\s+([a-z]{2,})\b/gi;
  while ((m = modalToRegex.exec(text)) !== null) {
    pushError(
      m[0],
      `${m[1]} ${m[2]}`,
      `Modal verb "${m[1]}" must be followed directly by the base verb "${m[2]}" without "to".`,
      'grammar'
    );
  }

  // 11. Modal + 3rd person singular "-s" verb ("can helps", "will makes", "should provides")
  const modalSRegex = /\b(can|could|will|would|should|must|may|might)\s+(helps|makes|goes|creates|improves|leads|provides|allows|requires|causes|gives|takes|increases|reduces|supports)\b/gi;
  while ((m = modalSRegex.exec(text)) !== null) {
    const baseVerb = m[2].toLowerCase() === 'goes' ? 'go' : m[2].replace(/s$/i, '');
    pushError(
      m[0],
      `${m[1]} ${baseVerb}`,
      `Use the base form "${baseVerb}" after the modal auxiliary "${m[1]}".`,
      'grammar'
    );
  }

  // 12. Informal slang / conversational abbreviations
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
      pushError(m[0], slangMap[key].fix, slangMap[key].note, 'wording');
    }
  }

  const alotRegex = /\b(a\s+lot\s+of|lots\s+of|alot)\b/gi;
  while ((m = alotRegex.exec(text)) !== null) {
    pushError(
      m[0],
      'numerous / a substantial amount of',
      'Prefer formal academic quantifiers ("numerous", "substantial", "significant") over conversational "a lot of".',
      'wording'
    );
  }

  // 13. Better Wording / Academic Register Upgrades
  const wordingRules: Array<{ pattern: RegExp; fix: string; note: string }> = [
    {
      pattern: /\bcouldn't\s+manage\s+to\s+meet\s+you\b/i,
      fix: 'was unable to attend your scheduled office hours',
      note: 'Better Wording (Academic Register): replace conversational "couldn\'t manage to meet you" with formal "was unable to attend your scheduled office hours".',
    },
    {
      pattern: /\bI\s+am\s+writing\s+to\s+tell\s+you\b/i,
      fix: 'I am writing to inform you',
      note: 'Better Wording (Register): "I am writing to inform you" is more appropriate for formal academic correspondence than "tell you".',
    },
    {
      pattern: /\bwhenever\s+you\s+are\s+free\b/i,
      fix: 'at your earliest convenience (e.g., Tuesday at 2:00 PM or Thursday morning)',
      note: 'Better Wording & Specificity: "whenever you are free" is overly casual and vague; propose two specific alternative days/times in formal register.',
    },
    {
      pattern: /\bI\s+want\s+to\s+ask\s+you\b/i,
      fix: 'I would like to inquire',
      note: 'Better Wording (Register): use polite academic hedging ("I would like to inquire") instead of direct "I want to ask you".',
    },
    {
      pattern: /\bdepend\s+of\b/i,
      fix: 'depend on',
      note: 'Collocation error: the verb "depend" always takes the preposition "on", never "of".',
    },
    {
      pattern: /\bdespite\s+of\b/i,
      fix: 'despite / in spite of',
      note: 'Collocation error: use "despite" without "of", or use the full phrase "in spite of".',
    },
  ];
  for (const rule of wordingRules) {
    const match = text.match(rule.pattern);
    if (match) {
      pushError(
        match[0],
        rule.fix,
        rule.note,
        rule.note.startsWith('Better Wording') ? 'wording' : 'grammar'
      );
    }
  }

  // 14. Missing comma after formal closing sign-off ("Sincerely", "Best regards", "Kind regards")
  const signOffNoCommaRegex = /(?:^|\n)\s*(Sincerely|Best\s+regards|Kind\s+regards|Warm\s+regards|Respectfully)\s*(?=\n|$)/i;
  const signOffMatch = text.match(signOffNoCommaRegex);
  if (signOffMatch) {
    pushError(
      signOffMatch[1],
      `${signOffMatch[1]},`,
      `Punctuation error: place a comma after the closing sign-off ("${signOffMatch[1]},").`,
      'mechanics'
    );
  }

  // 15. Missing sentence-initial capitalization
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const s of sentences) {
    const trimmed = s.trim();
    if (/^[a-z]/.test(trimmed)) {
      const firstWords = trimmed.split(/\s+/).slice(0, 3).join(' ');
      pushError(
        firstWords,
        firstWords.charAt(0).toUpperCase() + firstWords.slice(1),
        'Capitalize the first letter at the beginning of every sentence.',
        'mechanics'
      );
    }
    // 16. Run-on sentences > 45 words without internal semicolon or period
    const sWords = trimmed.split(/\s+/).filter(Boolean);
    if (sWords.length > 45 && !trimmed.includes(';')) {
      const snippet = `${sWords.slice(0, 7).join(' ')} ... (${sWords.length} words)`;
      pushError(
        snippet,
        `${sWords.slice(0, 7).join(' ')}. [Break into two sentences]`,
        'Run-on sentence exceeding 45 words without terminal punctuation; divide long clauses into two distinct sentences.',
        'mechanics'
      );
    }
  }

  return errors.slice(0, 18);
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
      if (target) {
        corrections.push({
          original: `Sentence ${i + 1}: [No recording submitted]`,
          corrected: target,
          explanation: 'Unrecorded sentences receive 0% accuracy in official Listen & Repeat scoring.',
          type: 'mechanics',
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
        type: 'grammar',
      });
    }
  }

  const avgAccuracy = Math.round(totalAccuracy / targetCount);

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
  const rawRubricScore = Number(((bandScore6 / 6.0) * 5.0).toFixed(1));
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
  const legacyCriteria = {
    taskFulfillment: Math.round((answeredSentences / targetCount) * 100),
    coherence: avgAccuracy,
    vocabulary: avgAccuracy,
    grammar: avgAccuracy,
  };

  const criteriaItems: CriterionItem[] = [
    {
      name: 'Task Completion (Sentences Repeated)',
      score: Number(((answeredSentences / targetCount) * 5).toFixed(1)),
      displayScore: `${answeredSentences}/${targetCount}`,
      feedback: `Completed ${answeredSentences} of ${targetCount} prompted sentences.`,
      comment: `Completed ${answeredSentences} of ${targetCount} prompted sentences.`,
    },
    {
      name: 'Sequential Word-Order Accuracy',
      score: rawRubricScore,
      displayScore: `${avgAccuracy}%`,
      feedback: `Achieved ${avgAccuracy}% exact word-sequence match across all items.`,
      comment: `Achieved ${avgAccuracy}% exact word-sequence match across all items.`,
    },
    {
      name: 'Phonetic & Lexical Precision',
      score: rawRubricScore,
      displayScore: `${rawRubricScore.toFixed(1)} / 5.0`,
      feedback: avgAccuracy >= 85 ? 'Clear lexical reproduction of academic vocabulary.' : 'Practice retaining multi-syllable content words and prepositions.',
      comment: avgAccuracy >= 85 ? 'Clear lexical reproduction of academic vocabulary.' : 'Practice retaining multi-syllable content words and prepositions.',
    },
    {
      name: 'Grammatical & Structural Retention',
      score: rawRubricScore,
      displayScore: `${rawRubricScore.toFixed(1)} / 5.0`,
      feedback: avgAccuracy >= 85 ? 'Maintained clause structure and inflections accurately.' : 'Focus on preserving articles, auxiliary verbs, and plural endings.',
      comment: avgAccuracy >= 85 ? 'Maintained clause structure and inflections accurately.' : 'Focus on preserving articles, auxiliary verbs, and plural endings.',
    },
  ];

  return {
    bandScore6,
    overallBand: bandScore6,
    bandScore: bandScore6,
    rawRubricScore,
    scaledScore,
    performanceLevel,
    criteria: buildCriteriaArray(criteriaItems, legacyCriteria),
    criteriaBreakdown: legacyCriteria,
    subScores: {
      taskFulfillment: bandScore6,
      languageUse: bandScore6,
      topicDevelopment: bandScore6,
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
    corrections: corrections.slice(0, 10),
    errors: corrections.slice(0, 10),
    grammarErrors: corrections.slice(0, 10),
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
        const paragraphs = raw
          .split(/\n\s*\n+/)
          .map((p) => p.trim())
          .filter(Boolean);
        if (paragraphs.length >= 2) {
          for (let i = 0; i < Math.min(4, paragraphs.length); i++) {
            slots[i] = paragraphs[i];
          }
        } else {
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

  if (canonicalType === 'listen-repeat') {
    return evaluateListenRepeatLocally(promptData, studentResponse, extra);
  }

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
  const longWords = words.filter((w) => w.length >= 7 && !COMMON_ACADEMIC_MISSPELLINGS[w]);
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

  // 3. Dynamic Grammar, Spelling, Capitalization & Wording Detection
  const corrections = detectGrammarAndMechanicsErrors(bodyOnlyText, promptData, extra);
  const hardErrors = corrections.filter((c) => c.type !== 'wording');
  const wordingItems = corrections.filter((c) => c.type === 'wording');
  const grammarErrorPenalty = Math.min(55, hardErrors.length * 8 + wordingItems.length * 3);

  // 4. Task-Calibrated Scoring
  let devScore = 60;
  let cohScore = 60;
  let vocabScore = 60;
  let gramScore = 65;

  let answeredQuestionsCount = 4;
  let interviewCompletenessCap = 6.0;

  if (canonicalType === 'write-email') {
    if (wordCount >= 85) devScore = 92;
    else if (wordCount >= 70) devScore = 80;
    else if (wordCount >= 50) devScore = 64;
    else if (wordCount >= 30) devScore = 48;
    else devScore = 30;

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
        devScore -= 14;
      } else if (relevance.bulletsCovered === 1) {
        devScore -= 25;
      } else {
        devScore -= 38;
      }
    }
  } else if (canonicalType === 'academic-discussion') {
    if (wordCount >= 115) devScore = 93;
    else if (wordCount >= 100) devScore = 88;
    else if (wordCount >= 80) devScore = 76;
    else if (wordCount >= 55) devScore = 62;
    else devScore = 40;

    if (stanceMarkersUsed.length >= 1) devScore += 4;
    else devScore -= 6;

    const s1Name = String(promptData?.s1?.name || promptData?.s1 || extra?.task?.s1?.name || '').split(':')[0].trim().toLowerCase();
    const s2Name = String(promptData?.s2?.name || promptData?.s2 || extra?.task?.s2?.name || '').split(':')[0].trim().toLowerCase();
    if ((s1Name && lowerText.includes(s1Name)) || (s2Name && lowerText.includes(s2Name))) {
      cohScore += 5;
    }
  } else if (canonicalType === 'speaking-interview') {
    const parsedInterview = parseSpeakingInterviewResponses(studentResponse, extra);
    answeredQuestionsCount = parsedInterview.answeredCount;

    const slotScores6: number[] = [];
    for (let i = 0; i < 4; i++) {
      const resp = parsedInterview.slotResponses[i];
      const respWords = tokenizeWords(resp);
      if (respWords.length < 3) {
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
      const slotErrors = detectGrammarAndMechanicsErrors(resp, promptData, extra);
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

  // Lexical Resource (Vocabulary & Register)
  if (academicWordRatio >= 0.24 && ttr >= 0.52) vocabScore = 94;
  else if (academicWordRatio >= 0.18 && ttr >= 0.45) vocabScore = 85;
  else if (academicWordRatio >= 0.13) vocabScore = 75;
  else vocabScore = 62;

  if (wordingItems.length >= 2) vocabScore -= 12;
  else if (wordingItems.length === 1) vocabScore -= 6;
  vocabScore = Math.min(98, Math.max(25, vocabScore));

  // Grammatical Range & Mechanics
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

  const fillerRatio = wordCount > 0 ? (extra?.fillerCount || 0) / wordCount : 0;
  if (canonicalType === 'speaking-interview' && fillerRatio > 0.08) {
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

  if (canonicalType === 'write-email') {
    if (wordCount < 35) scaledScore = Math.min(scaledScore, 12);
    else if (wordCount < 60) scaledScore = Math.min(scaledScore, 18);
    else if (wordCount < 75) scaledScore = Math.min(scaledScore, 23);

    if (relevance.totalBullets > 0 && relevance.bulletsCovered < relevance.totalBullets) {
      scaledScore = Math.min(scaledScore, 21);
    }
  } else if (canonicalType === 'academic-discussion') {
    if (wordCount < 45) scaledScore = Math.min(scaledScore, 12);
    else if (wordCount < 75) scaledScore = Math.min(scaledScore, 19);
    else if (wordCount < 95) scaledScore = Math.min(scaledScore, 24);
  }

  let bandScore6 = convertScaledToBand6(scaledScore);

  if (canonicalType === 'speaking-interview') {
    bandScore6 = Math.min(bandScore6, interviewCompletenessCap);
    scaledScore = Math.round((bandScore6 / 6.0) * 30);
  }

  if (offTopicDetected) {
    bandScore6 = Math.min(bandScore6, 2.0);
    scaledScore = Math.min(scaledScore, 9);
  }

  if (copiedPromptDetected) {
    bandScore6 = Math.min(bandScore6, 1.5);
    scaledScore = Math.min(scaledScore, 6);
  }

  // Enforce realistic Grammar/Spelling/Mechanics error ceiling
  if (hardErrors.length >= 6) {
    bandScore6 = Math.min(bandScore6, 3.0);
    scaledScore = Math.min(scaledScore, 15);
  } else if (hardErrors.length >= 4) {
    bandScore6 = Math.min(bandScore6, 3.5);
    scaledScore = Math.min(scaledScore, 17);
  } else if (hardErrors.length >= 2) {
    bandScore6 = Math.min(bandScore6, 4.5);
    scaledScore = Math.min(scaledScore, 23);
  }

  const rawRubricScore = Number(((bandScore6 / 6.0) * 5.0).toFixed(1));

  const performanceLevel: LocalEvaluationResult['performanceLevel'] =
    bandScore6 >= 5.5
      ? 'Advanced'
      : bandScore6 >= 4.0
      ? 'High-Intermediate'
      : bandScore6 >= 2.5
      ? 'Low-Intermediate'
      : 'Basic';

  const strengths: string[] = [];
  const improvements: string[] = [];

  if (copiedPromptDetected) {
    improvements.push('Avoid copying sentences directly from the prompt; paraphrase ideas in your own academic language.');
  }
  if (offTopicDetected) {
    improvements.push('Your response appears off-topic and does not address the specific prompt requirements.');
  }

  if (canonicalType === 'speaking-interview' && answeredQuestionsCount < 4) {
    improvements.push(
      `You only answered ${answeredQuestionsCount} of the 4 interview questions. Complete all 4 questions to achieve a full TOEFL Speaking band score.`
    );
  }

  // Add incomplete bullet-point feedback first so it appears in Top 2 Actionable Fixes!
  if (canonicalType === 'write-email' && relevance.bulletAnalysis.length > 0) {
    for (const b of relevance.bulletAnalysis) {
      if (!b.addressed) {
        improvements.push(b.feedback);
      }
    }
    if (relevance.bulletsCovered === relevance.totalBullets && relevance.totalBullets > 0) {
      strengths.push(`Addresses all ${relevance.totalBullets} communicative objectives specified in the prompt.`);
    }
  }

  if (hardErrors.length > 0) {
    const sampleFixes = hardErrors
      .slice(0, 3)
      .map((e) => `"${e.original}" → "${e.corrected}"`)
      .join('; ');
    improvements.push(
      `Fix ${hardErrors.length} grammar, spelling, and capitalization error(s) (${sampleFixes}).`
    );
  } else if (!copiedPromptDetected && !offTopicDetected) {
    strengths.push('Clean grammatical control and mechanics with no major surface errors.');
  }

  if (wordingItems.length > 0) {
    improvements.push(
      `Upgrade informal phrasing to academic register (e.g., "${wordingItems[0].original}" → "${wordingItems[0].corrected}").`
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
      'Incorporate formal academic transitions ("furthermore", "consequently", "moreover") to connect your sentences smoothly.'
    );
  }

  if (complexClausesUsed.length >= 2) {
    strengths.push('Good syntactic variety using subordinate and relative clauses.');
  } else {
    improvements.push('Combine short simple sentences using subordinate clauses ("although", "whereas", "which").');
  }

  if (strengths.length === 0) {
    strengths.push('Submitted a response for official ETS rubric analysis.');
  }

  const summary = copiedPromptDetected
    ? `Score capped at Band ${bandScore6.toFixed(1)}/6.0 (${performanceLevel}) because over 45% of the response was copied verbatim from the prompt. Paraphrase ideas in your own academic language.`
    : offTopicDetected
    ? `Score capped at Band ${bandScore6.toFixed(1)}/6.0 (${performanceLevel}) because the response does not address the specific topic and requirements of the prompt.`
    : canonicalType === 'speaking-interview' && answeredQuestionsCount < 4
    ? `Evaluated on the 2026 ETS TOEFL Speaking Rubric: Band ${bandScore6.toFixed(1)}/6.0 (${performanceLevel}). Note: Only ${answeredQuestionsCount} of 4 interview questions were answered, capping the overall band score proportionally (${answeredQuestionsCount}/4).`
    : `Evaluated on the 2026 ETS TOEFL Rubric: Band ${bandScore6.toFixed(1)}/6.0 (${performanceLevel}, Task Rubric ${rawRubricScore}/5.0, Scaled ${scaledScore}/30). Your response (${wordCount} words, ${sentenceCount} sentences) ${
        hardErrors.length > 0
          ? `contains ${hardErrors.length} spelling/grammar/mechanics issue(s) and ${wordingItems.length} register upgrade opportunity(ies)`
          : 'demonstrates clean mechanical control'
      }${
        canonicalType === 'write-email' && relevance.totalBullets > 0
          ? `, covering ${relevance.bulletsCovered} of ${relevance.totalBullets} required email objectives.`
          : '.'
      }`;

  // Build Band 6.0 Exemplar
  let exemplar = '';
  const existingModelAnswer =
    promptData?.modelAnswer ||
    promptData?.modelResponse ||
    promptData?.sampleAnswer ||
    extra?.task?.modelAnswer ||
    extra?.task?.modelResponse ||
    extra?.task?.sampleAnswer;

  if (typeof existingModelAnswer === 'string' && existingModelAnswer.trim().length > 40) {
    exemplar = existingModelAnswer.trim();
  } else if (canonicalType === 'write-email') {
    const recipient = promptData?.recipient || extra?.task?.recipient || 'Professor';
    const rawGoals: string[] = Array.isArray(promptData?.goals)
      ? promptData.goals
      : Array.isArray(extra?.task?.goals)
      ? extra.task.goals
      : [];

    const convertImperativeGoalToFirstPerson = (rawGoal: string, idx: number): string => {
      if (!rawGoal || typeof rawGoal !== 'string') return '';
      let g = rawGoal.trim().replace(/^["']+|["']+$/g, '').replace(/[.!?]+$/, '').trim();

      // Convert parenthetical "(to discuss ...)" into natural infinitive clause
      g = g.replace(/\(\s*(to\s+[^)]+)\)/gi, '$1').replace(/\(\s*([^)]+)\)/gi, 'regarding $1');

      // Convert pronouns from 2nd/3rd person prompt perspective to 1st-person student -> 2nd-person recipient
      const swapPronouns = (str: string): string =>
        str
          .replace(/\byour\b/gi, 'my')
          .replace(/\byou\s+are\b/gi, 'I am')
          .replace(/\byou\s+were\b/gi, 'I was')
          .replace(/\byou\s+have\b/gi, 'I have')
          .replace(/\byou\s+had\b/gi, 'I had')
          .replace(/\byou\s+want\b/gi, 'I would like')
          .replace(/\byou\s+need\b/gi, 'I need')
          .replace(/\byou\s+can\b/gi, 'I can')
          .replace(/\byou\s+would\b/gi, 'I would')
          .replace(/\bwith\s+(?:her|him)\b/gi, 'with you')
          .replace(/\bfrom\s+(?:her|him)\b/gi, 'from you')
          .replace(
            /\b(?:her|his)\s+((?:monday|tuesday|wednesday|thursday|friday|weekly|scheduled|upcoming|introductory|advanced|two|three|morning|afternoon)?\s*(?:office\s+hours|class|classes|course|courses|seminar|seminars|lecture|lectures|lab|labs|syllabus|guidance|feedback|approval|permission|section|sections|meeting|session)s?)\b/gi,
            'your $1'
          )
          .replace(/\b(?:her|his)\s+(office\s+hours|class|classes|course|courses|seminar|lecture|lab|syllabus|guidance|feedback)\b/gi, 'your $1');

      if (/^explain\s+why\s+you\s+(?:want|need|would\s+like)\s+to\s+meet\b/i.test(g)) {
        const rest = swapPronouns(g.replace(/^explain\s+why\s+you\s+(?:want|need|would\s+like)\s+to\s+meet\s*/i, '').trim());
        return rest
          ? `I am writing because I would like to schedule a brief meeting with you ${rest} and clarify the course requirements.`
          : 'I am writing because I would like to schedule a brief meeting with you to discuss the course requirements.';
      }
      if (/^explain\s+(?:why|that)\s+/i.test(g)) {
        const rest = swapPronouns(g.replace(/^explain\s+(?:why|that)\s+/i, '').trim());
        return `I am writing to explain that ${rest.charAt(0).toLowerCase() + rest.slice(1)}.`;
      }
      if (/^explain\s+/i.test(g)) {
        const rest = swapPronouns(g.replace(/^explain\s+/i, '').trim());
        return `I am writing to provide details regarding ${rest.charAt(0).toLowerCase() + rest.slice(1)}.`;
      }
      if (/^apologize\s+for\s+/i.test(g)) {
        const rest = swapPronouns(g.replace(/^apologize\s+for\s+/i, '').trim());
        return `I am writing to formally apologize for ${rest.charAt(0).toLowerCase() + rest.slice(1)}.`;
      }
      if (/^mention\s+that\s+/i.test(g)) {
        const rest = swapPronouns(g.replace(/^mention\s+that\s+/i, '').trim());
        if (/conflict|unable|miss|cannot/i.test(rest)) {
          return `Unfortunately, ${rest.charAt(0).toLowerCase() + rest.slice(1)}, which prevents me from attending during that scheduled window.`;
        }
        return `In addition, I wanted to mention that ${rest.charAt(0).toLowerCase() + rest.slice(1)}.`;
      }
      if (/^state\s+that\s+/i.test(g)) {
        const rest = swapPronouns(g.replace(/^state\s+that\s+/i, '').trim());
        return `I would also like to note that ${rest.charAt(0).toLowerCase() + rest.slice(1)}.`;
      }
      if (/^describe\s+/i.test(g)) {
        const rest = swapPronouns(g.replace(/^describe\s+/i, '').trim());
        return `Specifically, I would like to share details regarding ${rest.charAt(0).toLowerCase() + rest.slice(1)}.`;
      }
      if (/^(?:suggest|propose)\s+two\s+alternative\s+times\b/i.test(g) || /alternative\s+times/i.test(g)) {
        return 'Would it be possible for us to meet at an alternative time this week? Specifically, I am available on Tuesday between 2:00 PM and 4:00 PM, or on Thursday morning at 10:00 AM.';
      }
      if (/^(?:suggest|propose)\s+/i.test(g)) {
        const rest = swapPronouns(g.replace(/^(?:suggest|propose)\s+(?:that\s+)?/i, '').trim());
        return `To resolve this smoothly, I would like to propose ${rest.charAt(0).toLowerCase() + rest.slice(1)}.`;
      }
      if (/^ask\s+(?:if|whether)\s+/i.test(g)) {
        const rest = swapPronouns(g.replace(/^ask\s+(?:if|whether)\s+/i, '').trim());
        return `Could you please let me know whether ${rest.charAt(0).toLowerCase() + rest.slice(1)}?`;
      }
      if (/^ask\s+(?:about|for)\s+/i.test(g)) {
        const rest = swapPronouns(g.replace(/^ask\s+(?:about|for)\s+/i, '').trim());
        return `I would also appreciate your guidance regarding ${rest.charAt(0).toLowerCase() + rest.slice(1)}.`;
      }
      if (/^request\s+/i.test(g)) {
        const rest = swapPronouns(g.replace(/^request\s+(?:that\s+)?/i, '').trim());
        return `I would like to formally request ${rest.charAt(0).toLowerCase() + rest.slice(1)}.`;
      }

      const converted = swapPronouns(g);
      if (idx === 0) {
        return `I am writing to reach out regarding ${converted.charAt(0).toLowerCase() + converted.slice(1)}.`;
      }
      return `Furthermore, I wanted to address ${converted.charAt(0).toLowerCase() + converted.slice(1)}.`;
    };

    const p1 = rawGoals[0]
      ? convertImperativeGoalToFirstPerson(rawGoals[0], 0)
      : 'I am writing to inquire about our upcoming academic coursework and clarify the syllabus requirements.';
    const p2Core = rawGoals[1]
      ? convertImperativeGoalToFirstPerson(rawGoals[1], 1)
      : 'Unfortunately, my mandatory biology laboratory session conflicts with your scheduled Wednesday office hours, so I am unable to attend at that time.';
    const p2 = `${p2Core} Because I want to ensure that I make a well-informed academic decision and stay on track with your expectations, your guidance would be invaluable.`;
    const p3Core = rawGoals[2]
      ? convertImperativeGoalToFirstPerson(rawGoals[2], 2)
      : 'Would it be possible for us to schedule a brief appointment at an alternative time this week? Specifically, I am available on Tuesday between 2:00 PM and 4:00 PM, or on Thursday morning at 10:00 AM.';
    const p3 = p3Core.includes('convenient for you')
      ? p3Core
      : `${p3Core} Please let me know if either of these options is convenient for you.`;

    exemplar = `Subject: Inquiry Regarding ${promptData?.title || 'Academic Coursework'}\n\nDear ${recipient.split(',')[0]},\n\n${p1}\n\n${p2}\n\n${p3}\n\nThank you very much for your time and consideration.\n\nSincerely,\nAlex Morgan`;
  } else if (canonicalType === 'academic-discussion') {
    const s1Name = String(promptData?.s1?.name || promptData?.s1 || extra?.task?.s1?.name || 'my classmate').split(':')[0];
    const s2Name = String(promptData?.s2?.name || promptData?.s2 || extra?.task?.s2?.name || 'the other student').split(':')[0];
    exemplar = `While ${s1Name} raises a valid point regarding immediate practical benefits, I strongly agree with ${s2Name}'s perspective that long-term institutional sustainability must take precedence. In my view, addressing ${promptData?.title ? promptData.title.toLowerCase() : 'this policy issue'} requires a balanced, evidence-based framework rather than short-term measures.\n\nSpecifically, empirical studies consistently demonstrate that when universities and policymakers invest in foundational infrastructure and transparent governance, both efficiency and equity improve significantly over time. Therefore, adopting a comprehensive strategy ensures lasting benefits for the entire academic community.`;
  } else {
    exemplar = `From my perspective, ${promptData?.title || 'this academic topic'} plays a pivotal role in modern higher education. First, when institutions prioritize structured, evidence-based practices, students develop stronger analytical and problem-solving capabilities. For instance, in my own academic coursework, collaborative seminars allowed us to synthesize theoretical models with real-world applications. Ultimately, balancing innovation with rigorous standards ensures long-term success.`;
  }

  const devScore5 = Number(((devScore / 100) * 5.0).toFixed(1));
  const cohScore5 = Number(((cohScore / 100) * 5.0).toFixed(1));
  const vocabScore5 = Number(((vocabScore / 100) * 5.0).toFixed(1));
  const gramScore5 = Number(((gramScore / 100) * 5.0).toFixed(1));

  const legacyCriteria = {
    taskFulfillment: devScore,
    coherence: cohScore,
    vocabulary: vocabScore,
    grammar: gramScore,
  };

  const criteriaItems: CriterionItem[] = [
    {
      name: canonicalType === 'speaking-interview' ? 'Task Fulfillment & Topic Development' : 'Task Fulfillment & Elaboration',
      score: devScore5,
      maxScore: 5.0,
      displayScore: `${devScore5.toFixed(1)} / 5.0`,
      feedback:
        canonicalType === 'write-email' && relevance.totalBullets > 0
          ? `Covered ${relevance.bulletsCovered} of ${relevance.totalBullets} required objectives (${wordCount} words; target 85–130 words).`
          : `Developed response with ${wordCount} words across ${sentenceCount} sentence(s).`,
      comment:
        canonicalType === 'write-email' && relevance.totalBullets > 0
          ? `Covered ${relevance.bulletsCovered} of ${relevance.totalBullets} required objectives (${wordCount} words; target 85–130 words).`
          : `Developed response with ${wordCount} words across ${sentenceCount} sentence(s).`,
    },
    {
      name: canonicalType === 'speaking-interview' ? 'Delivery & Discourse Coherence' : 'Organization & Coherence',
      score: cohScore5,
      maxScore: 5.0,
      displayScore: `${cohScore5.toFixed(1)} / 5.0`,
      feedback:
        transitionsUsed.length > 0
          ? `Used ${transitionsUsed.length} academic transition(s) (${transitionsUsed.slice(0, 3).join(', ')}) across ${paragraphCount} paragraph(s).`
          : `Organized into ${paragraphCount} paragraph(s); add explicit discourse markers ("furthermore", "consequently") to strengthen flow.`,
      comment:
        transitionsUsed.length > 0
          ? `Used ${transitionsUsed.length} academic transition(s) (${transitionsUsed.slice(0, 3).join(', ')}) across ${paragraphCount} paragraph(s).`
          : `Organized into ${paragraphCount} paragraph(s); add explicit discourse markers ("furthermore", "consequently") to strengthen flow.`,
    },
    {
      name: 'Vocabulary & Academic Register',
      score: vocabScore5,
      maxScore: 5.0,
      displayScore: `${vocabScore5.toFixed(1)} / 5.0`,
      feedback:
        wordingItems.length > 0
          ? `Identified ${wordingItems.length} informal phrase(s) that can be upgraded to formal academic register.`
          : `Lexical diversity (TTR ${(ttr * 100).toFixed(0)}%) with appropriate academic tone.`,
      comment:
        wordingItems.length > 0
          ? `Identified ${wordingItems.length} informal phrase(s) that can be upgraded to formal academic register.`
          : `Lexical diversity (TTR ${(ttr * 100).toFixed(0)}%) with appropriate academic tone.`,
    },
    {
      name: 'Grammar & Mechanics (Spelling/Punctuation/Capitalization)',
      score: gramScore5,
      maxScore: 5.0,
      displayScore: `${gramScore5.toFixed(1)} / 5.0`,
      feedback:
        hardErrors.length > 0
          ? `Detected ${hardErrors.length} grammar, spelling, or capitalization error(s) requiring correction.`
          : 'Strong grammatical control, accurate spelling, and clean punctuation.',
      comment:
        hardErrors.length > 0
          ? `Detected ${hardErrors.length} grammar, spelling, or capitalization error(s) requiring correction.`
          : 'Strong grammatical control, accurate spelling, and clean punctuation.',
    },
  ];

  const subScores = {
    taskFulfillment: Number(((devScore / 100) * 6.0).toFixed(1)),
    languageUse: Number((((vocabScore + gramScore) / 200) * 6.0).toFixed(1)),
    topicDevelopment: Number(((cohScore / 100) * 6.0).toFixed(1)),
  };

  return {
    bandScore6,
    overallBand: bandScore6,
    bandScore: bandScore6,
    rawRubricScore,
    scaledScore,
    performanceLevel,
    criteria: buildCriteriaArray(criteriaItems, legacyCriteria),
    criteriaBreakdown: legacyCriteria,
    subScores,
    bulletAnalysis: relevance.bulletAnalysis.length > 0 ? relevance.bulletAnalysis : undefined,
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
    wordingImprovements: wordingItems,
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

/**
 * Merges deterministic local error highlights, bullet-point completion checks,
 * and criteria array fallbacks into an AI evaluation response so that mechanical/spelling/
 * collocation errors (e.g. "disucss", "about about", lowercase "i", "you office hours",
 * "classes and its requirement") are NEVER missed even when grading with an LLM.
 */
export function mergeAiAndLocalEvaluation(aiEval: any, localEval: LocalEvaluationResult): any {
  if (!aiEval || typeof aiEval !== 'object') {
    return localEval;
  }

  const aiCorrections: GrammarErrorItem[] = Array.isArray(aiEval.corrections)
    ? aiEval.corrections
    : Array.isArray(aiEval.grammarErrors)
    ? aiEval.grammarErrors
    : Array.isArray(aiEval.errors)
    ? aiEval.errors
    : [];

  const mergedCorrections: GrammarErrorItem[] = [...aiCorrections];
  const seenOriginals = new Set(
    aiCorrections
      .map((c) => String(c?.original || '').trim().toLowerCase())
      .filter(Boolean)
  );

  for (const localErr of localEval.corrections || []) {
    const key = String(localErr?.original || '').trim().toLowerCase();
    if (!key) continue;
    const alreadyCovered = Array.from(seenOriginals).some(
      (existing) => existing === key || existing.includes(key) || key.includes(existing)
    );
    if (!alreadyCovered) {
      seenOriginals.add(key);
      mergedCorrections.push(localErr);
    }
  }

  const aiTopFixes: string[] = Array.isArray(aiEval.topFixes)
    ? aiEval.topFixes
    : Array.isArray(aiEval.improvements)
    ? aiEval.improvements
    : [];

  const mergedTopFixes = [...aiTopFixes];
  if (Array.isArray(localEval.bulletAnalysis)) {
    for (const b of localEval.bulletAnalysis) {
      if (!b.addressed && b.feedback && !mergedTopFixes.includes(b.feedback)) {
        mergedTopFixes.unshift(b.feedback);
      }
    }
  }

  const validCriteria =
    Array.isArray(aiEval.criteria) && aiEval.criteria.length > 0
      ? aiEval.criteria
      : localEval.criteria;

  const cleanExemplar =
    aiEval.modelBand6Rewrite ||
    aiEval.exemplar ||
    aiEval.exemplarResponse ||
    localEval.modelBand6Rewrite;

  return {
    ...localEval,
    ...aiEval,
    criteria: validCriteria,
    bulletAnalysis: aiEval.bulletAnalysis || localEval.bulletAnalysis,
    corrections: mergedCorrections,
    errors: mergedCorrections,
    grammarErrors: mergedCorrections,
    topFixes: mergedTopFixes.slice(0, 4),
    improvements: mergedTopFixes.length > 0 ? mergedTopFixes : localEval.improvements,
    exemplar: cleanExemplar,
    exemplarResponse: cleanExemplar,
    modelBand6Rewrite: cleanExemplar,
    isLocalEvaluation: Boolean(aiEval.isLocalEvaluation),
  };
}

