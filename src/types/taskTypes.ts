export type TaskTypeId =
  | 'complete-words'
  | 'reading-passage'
  | 'listening-dialogue'
  | 'listen-repeat'
  | 'speaking-interview'
  | 'build-sentence'
  | 'write-email'
  | 'academic-discussion';

export interface TaskDefinition {
  id: TaskTypeId;
  name: string;
  section: 'Reading' | 'Listening' | 'Speaking' | 'Writing';
  description: string;
}

export const TASK_DEFINITIONS: TaskDefinition[] = [
  {
    id: 'complete-words',
    name: 'Complete the Words',
    section: 'Reading',
    description: 'C-Test: Academic paragraph with masked second halves of content words',
  },
  {
    id: 'reading-passage',
    name: 'Reading Passage',
    section: 'Reading',
    description: 'Academic text with 3 multiple-choice comprehension questions',
  },
  {
    id: 'listening-dialogue',
    name: 'Listening Audio',
    section: 'Listening',
    description: 'Campus conversation or lecture excerpt with audio simulation and questions',
  },
  {
    id: 'listen-repeat',
    name: 'Listen & Repeat',
    section: 'Speaking',
    description: 'Progressive sentences with speech synthesis and voice recognition accuracy',
  },
  {
    id: 'speaking-interview',
    name: 'Take an Interview',
    section: 'Speaking',
    description: '4 academic interview questions with official prep & speaking countdowns',
  },
  {
    id: 'build-sentence',
    name: 'Build a Sentence',
    section: 'Writing',
    description: 'Sentence scramble: tap tiles in correct sequence to form valid syntax',
  },
  {
    id: 'write-email',
    name: 'Write an Email',
    section: 'Writing',
    description: 'Campus scenario: achieve 3 goals with appropriate tone and word count',
  },
  {
    id: 'academic-discussion',
    name: 'Academic Discussion',
    section: 'Writing',
    description: 'Post in a university course forum engaging with professor & classmate views',
  },
];

export type SectionName = 'Reading' | 'Listening' | 'Speaking' | 'Writing';

export const TASK_SECTION_MAP: Record<string, SectionName> = {
  'complete-words': 'Reading',
  'reading-passage': 'Reading',
  'listening-dialogue': 'Listening',
  'listen-repeat': 'Speaking',
  'speaking-interview': 'Speaking',
  'build-sentence': 'Writing',
  'write-email': 'Writing',
  'academic-discussion': 'Writing',
  // Legacy aliases
  'reading': 'Reading',
  'listening': 'Listening',
  'listen_repeat': 'Speaking',
  'speaking_interview': 'Speaking',
  'complete_words': 'Reading',
  'build_sentence': 'Writing',
  'write_email': 'Writing',
  'academic_discussion': 'Writing',
};

export function getSectionForTaskType(taskType: string): SectionName | null {
  const norm = (taskType || '').trim().toLowerCase();
  return TASK_SECTION_MAP[norm] || null;
}
