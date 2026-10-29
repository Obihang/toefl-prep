/**
 * Official 2026 ETS TOEFL iBT® Task Types and Global Enums
 */

export enum TaskType {
  // Reading Section (3)
  READING_COMPLETE_WORDS = 'complete_words',
  READING_DAILY_LIFE = 'daily_life',
  READING_ACADEMIC = 'reading_academic',

  // Listening Section (4)
  LISTENING_CHOOSE_RESPONSE = 'listening_choose_response',
  LISTENING_CONVERSATION = 'listening_dialogue',
  LISTENING_ANNOUNCEMENT = 'listening_announcement',
  LISTENING_ACADEMIC_TALK = 'listening_academic_talk',

  // Writing Section (3)
  WRITING_BUILD_SENTENCE = 'writing_build_sentence',
  WRITING_EMAIL = 'writing_email',
  WRITING_DISCUSSION = 'writing_discussion',

  // Speaking Section (2)
  SPEAKING_LISTEN_REPEAT = 'speaking_listen_repeat',
  SPEAKING_INTERVIEW = 'speaking_interview',
}

/** Official Reading Question Skill Modes (PDF Pages 6-7) */
export type ReadingQuestionSkill =
  | 'all'
  | 'factual'
  | 'negative_factual'
  | 'inference'
  | 'vocabulary'
  | 'rhetorical_purpose';

export interface ReadingSkillOption {
  id: ReadingQuestionSkill;
  label: string;
  badgeLabel: string;
  description: string;
  colorClass: string;
}

export const READING_SKILL_OPTIONS: ReadingSkillOption[] = [
  {
    id: 'all',
    label: 'All Question Types (Standard Mix)',
    badgeLabel: 'Mixed Skills',
    description: 'Authentic 5-question mix covering factual, inference, vocabulary, negative factual, and rhetorical purpose.',
    colorClass: 'bg-slate-100 text-slate-800 border-slate-300',
  },
  {
    id: 'factual',
    label: 'Factual Information ("According to the passage...")',
    badgeLabel: 'Factual Info',
    description: 'Identifies explicitly stated facts, dates, scientific discoveries, or historical details.',
    colorClass: 'bg-blue-50 text-blue-800 border-blue-200',
  },
  {
    id: 'negative_factual',
    label: 'Negative Factual ("EXCEPT" / "NOT")',
    badgeLabel: 'Negative Factual (EXCEPT)',
    description: 'Requires finding which option is false, contradicted, or not mentioned in the passage.',
    colorClass: 'bg-rose-50 text-rose-800 border-rose-200',
  },
  {
    id: 'inference',
    label: 'Inference ("What can be inferred..." / "implies")',
    badgeLabel: 'Inference',
    description: 'Draws logical conclusions strongly implied but not directly stated by the author.',
    colorClass: 'bg-purple-50 text-purple-800 border-purple-200',
  },
  {
    id: 'vocabulary',
    label: 'Vocabulary in Context ("The word X is closest in meaning to...")',
    badgeLabel: 'Vocabulary in Context',
    description: 'Determines the precise semantic meaning of an academic word or phrase in this specific context.',
    colorClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  {
    id: 'rhetorical_purpose',
    label: 'Rhetorical Purpose & Idea Relationships ("Why does the author mention...")',
    badgeLabel: 'Rhetorical Purpose',
    description: 'Analyzes why the author included a detail, example, comparison, or transition.',
    colorClass: 'bg-amber-50 text-amber-900 border-amber-200',
  },
];

export type ListeningQuestionSkill =
  | 'Gist / Main Idea'
  | 'Detail'
  | "Speaker's Purpose / Function"
  | 'Inference / Implied Meaning';

export interface ListeningComprehensionQuestion {
  q: string;
  question?: string;
  options: string[];
  answer: number;
  correctAnswer?: number;
  why: string;
  explanation?: string;
  audioExcerpt?: string;
  questionType?: string;
}

export interface BuildSentenceItem {
  id?: string;
  context: string;
  framePrefix?: string;
  frameSuffix?: string;
  targetChunks: string[];
  distractorChunks?: string[];
  words: string[];
  scrambledWords?: string[];
  targetSentence: string;
  answer: string;
  correctSentence?: string;
  grammarRule?: string;
  explanation: string;
}

export interface BuildSentenceTask {
  id: string;
  title: string;
  level: string;
  topic: string;
  items: BuildSentenceItem[];
}

export * from './types/taskTypes';
