/**
 * Official 2026 ETS Updated TOEFL iBT® Test Overview Scoring Specifications
 * Tables 1, 2, 3 (Concordance) & Task-Specific Scoring Guides (Pages 21-28)
 */

export type SectionType = 'Reading' | 'Listening' | 'Writing' | 'Speaking';

export interface SectionStructureItem {
  section: SectionType;
  items: number;
  timeMinutes: number;
  description: string;
}

/** Table 1: Updated TOEFL Test Design & Timing (PDF Page 4 & Page 21) */
export const TOEFL_TEST_STRUCTURE_2026: SectionStructureItem[] = [
  {
    section: 'Reading',
    items: 50,
    timeMinutes: 30,
    description: 'Complete the Words (C-Test) and Reading Passages with academic comprehension questions',
  },
  {
    section: 'Listening',
    items: 47,
    timeMinutes: 29,
    description: 'Campus conversations and academic lectures with authentic global accents (US, UK, CA, NZ, AU)',
  },
  {
    section: 'Writing',
    items: 12,
    timeMinutes: 23,
    description: 'Build a Sentence, Write an Email (7 minutes), and Write for an Academic Discussion (10 minutes)',
  },
  {
    section: 'Speaking',
    items: 11,
    timeMinutes: 8,
    description: 'Listen and Repeat (7 sentences, 8–12s per item) and Take an Interview (4 questions, 45s per response)',
  },
];

export interface ConcordanceRow {
  band: number;
  cefr: string;
  reading: [number, number];
  listening: [number, number];
  writing: [number, number];
  speaking: [number, number];
  overall: [number, number];
}

/** Table 3: Official Score Concordance Table (PDF Page 22) */
export const TOEFL_CONCORDANCE_TABLE_2026: ConcordanceRow[] = [
  { band: 6.0, cefr: 'C2', reading: [29, 30], listening: [28, 30], writing: [29, 30], speaking: [28, 30], overall: [114, 120] },
  { band: 5.5, cefr: 'C1', reading: [27, 28], listening: [26, 27], writing: [27, 28], speaking: [27, 27], overall: [107, 113] },
  { band: 5.0, cefr: 'C1', reading: [24, 26], listening: [22, 25], writing: [24, 26], speaking: [25, 26], overall: [95, 106] },
  { band: 4.5, cefr: 'B2', reading: [22, 23], listening: [20, 21], writing: [21, 23], speaking: [23, 24], overall: [86, 94] },
  { band: 4.0, cefr: 'B2', reading: [18, 21], listening: [17, 19], writing: [17, 20], speaking: [20, 22], overall: [72, 85] },
  { band: 3.5, cefr: 'B1', reading: [12, 17], listening: [13, 16], writing: [15, 16], speaking: [18, 19], overall: [58, 71] },
  { band: 3.0, cefr: 'B1', reading: [6, 11],  listening: [9, 12],  writing: [13, 14], speaking: [16, 17], overall: [44, 57] },
  { band: 2.5, cefr: 'A2', reading: [4, 5],   listening: [6, 8],   writing: [11, 12], speaking: [13, 15], overall: [34, 43] },
  { band: 2.0, cefr: 'A2', reading: [3, 3],   listening: [4, 5],   writing: [7, 10],  speaking: [10, 12], overall: [24, 33] },
  { band: 1.5, cefr: 'A1', reading: [2, 2],   listening: [2, 3],   writing: [3, 6],   speaking: [5, 9],   overall: [12, 23] },
  { band: 1.0, cefr: 'A1', reading: [0, 1],   listening: [0, 1],   writing: [0, 2],   speaking: [0, 4],   overall: [0, 11] },
];

/**
 * Convert 0-30 scaled score to the new TOEFL 1.0 - 6.0 band scale using section-specific cutoffs from Table 3.
 */
export function convertScaledToBand6(scaledScore30: number, section?: SectionType): number {
  const score = Math.max(0, Math.min(30, Math.round(scaledScore30)));

  if (!section) {
    // Standard blended conversion fallback
    for (const row of TOEFL_CONCORDANCE_TABLE_2026) {
      const avgMin = (row.reading[0] + row.listening[0] + row.writing[0] + row.speaking[0]) / 4;
      if (score >= Math.floor(avgMin)) {
        return row.band;
      }
    }
    return 1.0;
  }

  const key = section.toLowerCase() as 'reading' | 'listening' | 'writing' | 'speaking';
  for (const row of TOEFL_CONCORDANCE_TABLE_2026) {
    const range = row[key];
    if (score >= range[0]) {
      return row.band;
    }
  }

  return 1.0;
}

/**
 * Convert 0-120 total score to the official 1.0 - 6.0 band score from Table 3.
 */
export function convertOverall120ToBand6(total120: number): number {
  const score = Math.max(0, Math.min(120, Math.round(total120)));
  for (const row of TOEFL_CONCORDANCE_TABLE_2026) {
    if (score >= row.overall[0]) {
      return row.band;
    }
  }
  return 1.0;
}

/**
 * Get scaled score range for a section given a band score.
 */
export function getBandScoreRangeForSection(band: number, section: SectionType): [number, number] {
  const rounded = Math.round(band * 2) / 2;
  const match = TOEFL_CONCORDANCE_TABLE_2026.find((r) => Math.abs(r.band - rounded) < 0.01);
  if (!match) return [0, 1];
  const key = section.toLowerCase() as 'reading' | 'listening' | 'writing' | 'speaking';
  return match[key];
}

/** Table 2: CEFR Level Alignment & Descriptors */
export function getCefrFromBand6(band6: number): {
  code: string;
  name: string;
  descriptor: string;
  colorClass: string;
} {
  if (band6 <= 0) {
    return {
      code: 'N/A',
      name: 'No Data / Absolute Zero',
      descriptor: 'Complete practice sessions to determine your active CEFR proficiency level.',
      colorClass: 'text-slate-500 bg-slate-100 border-slate-200',
    };
  }
  if (band6 >= 6.0) {
    return {
      code: 'C2',
      name: 'C2 Proficient / Mastery',
      descriptor: 'Near-native fluency, precision, and nuance across academic domains.',
      colorClass: 'text-purple-700 bg-purple-50 border-purple-200',
    };
  }
  if (band6 >= 5.0) {
    return {
      code: 'C1',
      name: 'C1 Advanced (High Fluency)',
      descriptor: 'Effective operational command; suitable for high-ranking graduate programs.',
      colorClass: 'text-teal-700 bg-teal-50 border-teal-200',
    };
  }
  if (band6 >= 4.0) {
    return {
      code: 'B2',
      name: 'B2 Upper-Intermediate',
      descriptor: 'Independent user; satisfies standard undergraduate and graduate entrance bar.',
      colorClass: 'text-blue-700 bg-blue-50 border-blue-200',
    };
  }
  if (band6 >= 3.0) {
    return {
      code: 'B1',
      name: 'B1 Intermediate',
      descriptor: 'Threshold proficiency; understands main points of familiar academic contexts.',
      colorClass: 'text-amber-700 bg-amber-50 border-amber-200',
    };
  }
  if (band6 >= 2.0) {
    return {
      code: 'A2',
      name: 'A2 Elementary / Waystage',
      descriptor: 'Basic command; handles simple, routine communications.',
      colorClass: 'text-orange-700 bg-orange-50 border-orange-200',
    };
  }
  return {
    code: 'A1',
    name: 'A1 Beginner / Breakthrough',
    descriptor: 'Introductory familiarity with English vocabulary and basic structures.',
    colorClass: 'text-rose-700 bg-rose-50 border-rose-200',
  };
}

export interface TaskRawRubric {
  score: number;
  title: string;
  description: string;
}

/** Official 0-5 Task Rubrics from ETS Guide (Pages 23-28) */
export const OFFICIAL_TASK_RUBRICS: Record<string, TaskRawRubric[]> = {
  'write-email': [
    {
      score: 5,
      title: 'Advanced / Fully Successful (Score 5)',
      description: 'Fully addresses the prompt and fulfills all 3 requirements with clear purpose. Demonstrates high syntactic variety and appropriate lexical choice. Clear organization and tone suited to the audience. Very minor typographical or grammatical slips that do not obscure meaning.',
    },
    {
      score: 4,
      title: 'Competent / Successful (Score 4)',
      description: 'Fulfills all 3 requirements adequately. Generally clear with appropriate tone and vocabulary. Some minor syntactic errors or slight lapses in coherence, but communicative purpose is achieved without ambiguity.',
    },
    {
      score: 3,
      title: 'Partially Successful (Score 3)',
      description: 'Partially fulfills the requirements (addresses 2 of 3 goals well or touches on all 3 superficially). Vocabulary and sentence structures are somewhat limited or repetitive. Tone may be inconsistent. Meaning is mostly discernible despite noticeable language errors.',
    },
    {
      score: 2,
      title: 'Limited (Score 2)',
      description: 'Fails to address key requirements (only 1 goal addressed or severe misunderstanding of context). Frequent grammatical and lexical errors obscure parts of the message. Inappropriate tone or disorganized thought progression.',
    },
    {
      score: 1,
      title: 'Minimal (Score 1)',
      description: 'Minimal attempt to respond to the prompt. Severe grammatical, lexical, and structural deficiencies throughout; fails to communicate key points.',
    },
    {
      score: 0,
      title: 'Non-Scorable / Blank (Score 0)',
      description: 'Blank, entirely off-topic, written in a foreign language, or merely copies words from the prompt.',
    },
  ],
  'academic-discussion': [
    {
      score: 5,
      title: 'Advanced / Highly Effective (Score 5)',
      description: "A fully successful contribution to the academic discussion. Expresses a relevant, well-developed idea that clearly builds upon or responds to the professor's question and classmates' posts. Displays sophisticated vocabulary, syntactic variety, and strong cohesion. Few or no linguistic errors.",
    },
    {
      score: 4,
      title: 'Competent / Effective (Score 4)',
      description: 'An effective contribution. Clearly states a position with relevant elaboration. Acknowledges context and adds valuable perspective. Minor errors in grammar, word choice, or mechanics that do not hinder understanding.',
    },
    {
      score: 3,
      title: 'Adequate (Score 3)',
      description: 'An adequate contribution. Explains a stance with reasonable support, but development may be somewhat brief or generic. Connections to previous posts are superficial. Demonstrates noticeable errors in syntax or word forms that occasionally distract.',
    },
    {
      score: 2,
      title: 'Limited (Score 2)',
      description: 'A limited contribution. Position is unclear or supported with minimal/repetitive reasoning. Lacks effective synthesis with the discussion thread. Pervasive grammatical errors and limited vocabulary make reading difficult.',
    },
    {
      score: 1,
      title: 'Minimal (Score 1)',
      description: 'An unsuccessful contribution. Fails to engage with the prompt meaningfully or consists of fragmented thoughts. Severe language limitations impede comprehension.',
    },
    {
      score: 0,
      title: 'Non-Scorable / Blank (Score 0)',
      description: "Blank, off-topic, incomprehensible, or merely copies the prompt or classmates' text verbatim.",
    },
  ],
  'listen-repeat': [
    {
      score: 5,
      title: 'Mastery / Highly Accurate (Score 5)',
      description: 'Highly accurate reproduction of the stimulus sentence. All words are pronounced clearly and in exact order with natural intonation, stress, and rhythm. No omitted or inserted words.',
    },
    {
      score: 4,
      title: 'Accurate with Minor Variations (Score 4)',
      description: 'Accurate reproduction with minor phonological or prosodic variations. Most words (85–95%) produced accurately in proper order. Minor hesitation or self-correction that does not disrupt overall sentence flow.',
    },
    {
      score: 3,
      title: 'Moderately Accurate (Score 3)',
      description: 'Moderately accurate reproduction (70–84%). Main message recognizable, but with noticeable errors in pronunciation, word omission, or minor word-order slips. Pauses or uneven pacing evident.',
    },
    {
      score: 2,
      title: 'Limited Accuracy (Score 2)',
      description: 'Limited reproduction (50–69%). Significant portions omitted, substituted, or misordered. Frequent pronunciation errors obscure intelligibility.',
    },
    {
      score: 1,
      title: 'Minimal Reproduction (Score 1)',
      description: 'Minimal reproduction (<50%). Only isolated words or fragments recognizable. Extensive breakdowns in phonology, pacing, and structure.',
    },
    {
      score: 0,
      title: 'Non-Scorable / No Speech (Score 0)',
      description: 'No speech detected, completely unintelligible utterance, or unrelated background noise.',
    },
  ],
  'speaking-interview': [
    {
      score: 5,
      title: 'Advanced / Highly Fluent (Score 5)',
      description: "Highly effective and fluent response to the interview question. Ideas are fully developed, coherent, and directly address the prompt. Natural conversational delivery, appropriate pacing, and smooth transitions. Natural fillers (e.g., 'um', 'uh') used comfortably within normal conversational boundaries without stalling fluency. Broad vocabulary and syntactic range with only negligible slips.",
    },
    {
      score: 4,
      title: 'Competent / Clear & Fluent (Score 4)',
      description: 'Effective response. Communicates a clear perspective with relevant supporting details. Generally fluent with good intelligibility and varied sentence structures. Minor hesitations, occasional search for words, or slight language inaccuracies that do not detract from overall clarity.',
    },
    {
      score: 3,
      title: 'Developing / Noticeable Hesitation (Score 3)',
      description: 'Partially effective response. Response addresses the prompt but elaboration may be basic, repetitive, or slightly uneven. Noticeable pauses, hesitations, or reliance on simple structures. Pronunciation or grammatical errors occasionally require listener effort.',
    },
    {
      score: 2,
      title: 'Limited / Fragmented (Score 2)',
      description: 'Limited response. Ideas are fragmented, underdeveloped, or repetitious. Frequent pauses, false starts, and limited vocabulary hinder flow. Language errors frequently obscure intended meaning.',
    },
    {
      score: 1,
      title: 'Minimal / Strained (Score 1)',
      description: 'Very limited response. Straining to produce language; only isolated sentences or basic phrases. Severe pronunciation and grammar impediments prevent clear comprehension.',
    },
    {
      score: 0,
      title: 'Non-Scorable / Blank (Score 0)',
      description: 'No response, completely irrelevant response, or inaudible utterance.',
    },
  ],
};

/**
 * Get task raw rubric descriptor based on raw score (0-5)
 */
export function getTaskRawRubric(taskType: string, rawScore: number): TaskRawRubric {
  const normKey = taskType.toLowerCase().replace(/_/g, '-');
  const rubrics = OFFICIAL_TASK_RUBRICS[normKey] || OFFICIAL_TASK_RUBRICS['write-email'];
  const clampedScore = Math.max(0, Math.min(5, Math.round(rawScore)));
  const found = rubrics.find((r) => r.score === clampedScore);
  return found || rubrics[rubrics.length - 1];
}

/**
 * Maps a 0-5 raw task rubric score directly to a 1.0 - 6.0 section band score
 */
export function convertRawRubricToBand6(rawScore5: number): number {
  const clamped = Math.max(0, Math.min(5, Number(rawScore5) || 0));
  if (clamped >= 4.8) return 6.0;
  if (clamped >= 4.3) return 5.5;
  if (clamped >= 3.8) return 5.0;
  if (clamped >= 3.2) return 4.5;
  if (clamped >= 2.6) return 4.0;
  if (clamped >= 2.0) return 3.5;
  if (clamped >= 1.5) return 3.0;
  if (clamped >= 1.0) return 2.5;
  if (clamped >= 0.6) return 2.0;
  if (clamped >= 0.2) return 1.5;
  return 1.0;
}
