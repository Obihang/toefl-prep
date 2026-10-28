export type TaskTypeId =
  // Reading Section (3)
  | 'complete-words'
  | 'daily-life'
  | 'reading-academic'
  // Listening Section (4)
  | 'listening-choose-response'
  | 'listening-dialogue'
  | 'listening-announcement'
  | 'listening-academic-talk'
  // Writing Section (3)
  | 'build-sentence'
  | 'write-email'
  | 'academic-discussion'
  // Speaking Section (2)
  | 'listen-repeat'
  | 'speaking-interview'
  // Legacy aliases
  | 'reading-passage'
  | 'listening-lecture'
  | 'listening-conversation';

export type SectionName = 'Reading' | 'Listening' | 'Writing' | 'Speaking';

export interface TaskDefinition {
  id: TaskTypeId;
  canonicalId: string;
  name: string;
  shortName: string;
  section: SectionName;
  description: string;
  itemCountDesc: string;
  timingDesc: string;
}

/**
 * All 12 Official ETS 2026 TOEFL iBT® Task Types
 * Ordered strictly by official section sequence: Reading -> Listening -> Writing -> Speaking (PDF Page 4)
 */
export const TASK_DEFINITIONS: TaskDefinition[] = [
  // --- 1. Reading Section (3 Tasks) ---
  {
    id: 'complete-words',
    canonicalId: 'complete_words',
    name: 'R · Complete the Words',
    shortName: 'Complete Words',
    section: 'Reading',
    description: 'C-Test: 70–100 words, Sentence 1 intact, 10 alternating masked second-half blanks',
    itemCountDesc: '10 blanks per set',
    timingDesc: '~3–4 mins',
  },
  {
    id: 'daily-life',
    canonicalId: 'daily_life',
    name: 'R · Read in Daily Life',
    shortName: 'Daily Life',
    section: 'Reading',
    description: 'Real-world notice, email, text chain, menu, schedule, or invoice with 2–3 questions',
    itemCountDesc: '2–3 questions',
    timingDesc: '~2–3 mins',
  },
  {
    id: 'reading-academic',
    canonicalId: 'reading_academic',
    name: 'R · Read an Academic Passage',
    shortName: 'Academic Passage',
    section: 'Reading',
    description: '~200-word university passage followed by 5 targeted skill comprehension questions',
    itemCountDesc: '5 questions',
    timingDesc: '~6–7 mins',
  },

  // --- 2. Listening Section (4 Tasks) ---
  {
    id: 'listening-choose-response',
    canonicalId: 'listening_choose_response',
    name: 'L · Listen & Choose a Response',
    shortName: 'Choose Response',
    section: 'Listening',
    description: 'Hear 5 short spoken campus questions/statements (text hidden) & select the best reply A–D',
    itemCountDesc: '5 items per set',
    timingDesc: '~2 mins',
  },
  {
    id: 'listening-dialogue',
    canonicalId: 'listening_dialogue',
    name: 'L · Listen to a Conversation',
    shortName: 'Conversation',
    section: 'Listening',
    description: '8–10 turn campus dialogue between 2 locked voices followed by 2 comprehension questions',
    itemCountDesc: '2 questions',
    timingDesc: '~2–3 mins',
  },
  {
    id: 'listening-announcement',
    canonicalId: 'listening_announcement',
    name: 'L · Listen to an Announcement',
    shortName: 'Announcement',
    section: 'Listening',
    description: '40–85 word campus or classroom announcement spoken by 1 speaker with 2 questions',
    itemCountDesc: '2 questions',
    timingDesc: '~1.5 mins',
  },
  {
    id: 'listening-academic-talk',
    canonicalId: 'listening_academic_talk',
    name: 'L · Listen to an Academic Talk',
    shortName: 'Academic Talk',
    section: 'Listening',
    description: '120–220 word academic talk or podcast by 1 educator followed by 4 questions',
    itemCountDesc: '4 questions',
    timingDesc: '~3–4 mins',
  },

  // --- 3. Writing Section (3 Tasks) ---
  {
    id: 'build-sentence',
    canonicalId: 'writing_build_sentence',
    name: 'W · Build a Sentence',
    shortName: 'Build Sentence',
    section: 'Writing',
    description: 'Sentence scramble: tap tiles in correct syntactic sequence for Speaker 2',
    itemCountDesc: '5 items per set',
    timingDesc: '~4 mins',
  },
  {
    id: 'write-email',
    canonicalId: 'writing_email',
    name: 'W · Write an Email',
    shortName: 'Write Email',
    section: 'Writing',
    description: 'Official 7-minute campus email: cover 3 mandatory goals with appropriate register',
    itemCountDesc: '85–130 words',
    timingDesc: '7 minutes',
  },
  {
    id: 'academic-discussion',
    canonicalId: 'writing_discussion',
    name: 'W · Academic Discussion',
    shortName: 'Academic Discussion',
    section: 'Writing',
    description: 'Official 10-minute university forum: contribute an original point to professor & peers',
    itemCountDesc: '100+ words',
    timingDesc: '10 minutes',
  },

  // --- 4. Speaking Section (2 Tasks) ---
  {
    id: 'listen-repeat',
    canonicalId: 'speaking_listen_repeat',
    name: 'S · Listen & Repeat',
    shortName: 'Listen & Repeat',
    section: 'Speaking',
    description: '7 progressive tour/orientation sentences with neural audio & strict word-order scoring',
    itemCountDesc: '7 sentences',
    timingDesc: '8–12s / item',
  },
  {
    id: 'speaking-interview',
    canonicalId: 'speaking_interview',
    name: 'S · Take an Interview',
    shortName: 'Take Interview',
    section: 'Speaking',
    description: '4 sequential academic interview questions with 45s countdown & 0s prep time',
    itemCountDesc: '4 questions',
    timingDesc: '45s / item',
  },
];

export const TASK_SECTION_MAP: Record<string, SectionName> = {
  // Reading
  'complete-words': 'Reading',
  'complete_words': 'Reading',
  'daily-life': 'Reading',
  'daily_life': 'Reading',
  'reading-academic': 'Reading',
  'reading_academic': 'Reading',
  'reading-passage': 'Reading',
  'reading': 'Reading',

  // Listening
  'listening-choose-response': 'Listening',
  'listening_choose_response': 'Listening',
  'listening-dialogue': 'Listening',
  'listening_dialogue': 'Listening',
  'listening-conversation': 'Listening',
  'listening_conversation': 'Listening',
  'listening-announcement': 'Listening',
  'listening_announcement': 'Listening',
  'listening-academic-talk': 'Listening',
  'listening_academic_talk': 'Listening',
  'listening-lecture': 'Listening',
  'listening_lecture': 'Listening',
  'listening': 'Listening',

  // Writing
  'build-sentence': 'Writing',
  'writing_build_sentence': 'Writing',
  'write-email': 'Writing',
  'writing_email': 'Writing',
  'academic-discussion': 'Writing',
  'writing_discussion': 'Writing',

  // Speaking
  'listen-repeat': 'Speaking',
  'speaking_listen_repeat': 'Speaking',
  'listen_repeat': 'Speaking',
  'speaking-interview': 'Speaking',
  'speaking_interview': 'Speaking',
};

export function getSectionForTaskType(taskType: string): SectionName | null {
  const norm = (taskType || '').trim().toLowerCase();
  return TASK_SECTION_MAP[norm] || null;
}
