export const LEVELS = [
  'beginner',
  'intermediate',
  'upper-intermediate',
  'advanced',
] as const;

export type Level = typeof LEVELS[number];

export const ACADEMIC_TOPICS = [
  'science-tech',
  'campus-life',
  'social-sciences',
  'environment',
  'business-economics',
  'arts-humanities',
] as const;

export type AcademicTopic = typeof ACADEMIC_TOPICS[number];

export const LEVEL_LABELS: Record<Level, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate (B1-B2 · 60-80)',
  'upper-intermediate': 'Upper-Intermediate (B2-C1 · 80-100)',
  advanced: 'Advanced (C1 · 100-120)',
};

export const TOPIC_LABELS: Record<AcademicTopic, string> = {
  'science-tech': 'Science & Technology',
  'campus-life': 'Campus Life & Academics',
  'social-sciences': 'Social Sciences & History',
  environment: 'Ecology & Environment',
  'business-economics': 'Business & Economics',
  'arts-humanities': 'Arts & Humanities',
};

export function isValidLevel(level: any): level is Level {
  return typeof level === 'string' && (LEVELS as readonly string[]).includes(level);
}

export function isValidAcademicTopic(topic: any): topic is AcademicTopic {
  return typeof topic === 'string' && (ACADEMIC_TOPICS as readonly string[]).includes(topic);
}
