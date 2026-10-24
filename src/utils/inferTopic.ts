import { ACADEMIC_TOPICS, AcademicTopic } from '../constants/filters';

const TOPIC_KEYWORDS: Record<AcademicTopic, string[]> = {
  'science-tech': [
    'astronomy', 'galaxy', 'planet', 'telescope', 'asteroid',
    'physics', 'quantum', 'gravity', 'chemistry', 'molecule',
    'biology', 'cellular', 'organism', 'genetics', 'dna',
    'evolution', 'species', 'fossil', 'dinosaur', 'computer',
    'algorithm', 'technology', 'engineering', 'laboratory', 'neural',
    'experiment', 'geology', 'tectonic', 'microscope', 'magnetic'
  ],
  'campus-life': [
    'professor', 'campus', 'student', 'dorm', 'dormitory',
    'assignment', 'registrar', 'tuition', 'semester', 'syllabus',
    'lecture', 'library', 'classmate', 'advisor', 'cafeteria',
    'internship', 'dean', 'prerequisite', 'exam', 'roommate',
    'faculty', 'undergraduate', 'textbook', 'coursework', 'office hours'
  ],
  'social-sciences': [
    'history', 'historical', 'civilization', 'archaeology', 'archaeologist',
    'anthropology', 'sociology', 'culture', 'cultural', 'government',
    'revolution', 'empire', 'medieval', 'migration', 'treaty',
    'demographic', 'policy', 'ancient', 'colonial', 'psychology',
    'psychological', 'artifact', 'dynasty', 'constitution', 'societal'
  ],
  environment: [
    'ecology', 'ecological', 'climate', 'biodiversity', 'conservation',
    'ecosystem', 'pollution', 'deforestation', 'habitat', 'renewable',
    'endangered', 'wildlife', 'glacier', 'carbon', 'greenhouse',
    'sustainable', 'emissions', 'atmospheric', 'drought', 'marine',
    'coral reef', 'wetland', 'erosion', 'global warming', 'ozone'
  ],
  'business-economics': [
    'economy', 'economic', 'marketing', 'consumer', 'inflation',
    'revenue', 'profit', 'corporation', 'corporate', 'finance',
    'financial', 'investment', 'investor', 'supply', 'demand',
    'trade', 'entrepreneur', 'commerce', 'commercial', 'market',
    'retail', 'capitalism', 'fiscal', 'monetary', 'stock market'
  ],
  'arts-humanities': [
    'literature', 'literary', 'painting', 'painter', 'sculpture',
    'sculptor', 'architecture', 'architectural', 'philosophy', 'philosopher',
    'museum', 'poetry', 'poem', 'theater', 'theatrical',
    'drama', 'symphony', 'composer', 'artist', 'aesthetic',
    'portrait', 'baroque', 'novel', 'novelist', 'renaissance'
  ],
};

/**
 * Extracts all relevant textual content from a TOEFL task/question object.
 */
function extractTaskText(task: any): string {
  if (!task) return '';
  if (typeof task === 'string') return task;

  const parts: string[] = [];

  if (task.title) parts.push(String(task.title));
  if (task.passage) parts.push(String(task.passage));
  if (task.prompt) parts.push(String(task.prompt));
  if (task.situation) parts.push(String(task.situation));
  if (task.professorPrompt) parts.push(String(task.professorPrompt));
  if (task.text) parts.push(String(task.text));
  if (task.script) parts.push(String(task.script));
  if (task.context) parts.push(String(task.context));

  // Sentences (build-sentence, listen-repeat)
  if (Array.isArray(task.sentences)) {
    task.sentences.forEach((s: any) => {
      if (typeof s === 'string') parts.push(s);
      else if (s?.text) parts.push(String(s.text));
    });
  }

  // Dialogue turns (listening-dialogue)
  if (Array.isArray(task.turns)) {
    task.turns.forEach((t: any) => {
      if (t?.text) parts.push(String(t.text));
    });
  }

  // Questions and options
  if (Array.isArray(task.questions)) {
    task.questions.forEach((q: any) => {
      if (q?.question) parts.push(String(q.question));
      if (q?.q) parts.push(String(q.q));
      if (Array.isArray(q?.options)) parts.push(q.options.join(' '));
    });
  }

  // Content sub-object if nested
  if (task.content && typeof task.content === 'object') {
    parts.push(extractTaskText(task.content));
  }

  return parts.join(' ').toLowerCase();
}

/**
 * Classifies a question text into one of the 6 canonical ACADEMIC_TOPICS.
 * Guaranteed to NEVER return 'all', 'general', or any unrecognized topic.
 */
export function inferTopic(taskOrText: any): AcademicTopic {
  const text = extractTaskText(taskOrText);
  if (!text.trim()) {
    return 'campus-life';
  }

  const scores: Record<AcademicTopic, number> = {
    'science-tech': 0,
    'campus-life': 0,
    'social-sciences': 0,
    environment: 0,
    'business-economics': 0,
    'arts-humanities': 0,
  };

  for (const topic of ACADEMIC_TOPICS) {
    const keywords = TOPIC_KEYWORDS[topic];
    for (const kw of keywords) {
      // Word boundary match or substring check for multi-word
      if (kw.includes(' ')) {
        if (text.includes(kw)) {
          scores[topic] += 3;
        }
      } else {
        const regex = new RegExp(`\\b${kw}\\b`, 'i');
        if (regex.test(text)) {
          scores[topic] += 1;
        }
      }
    }
  }

  let bestTopic: AcademicTopic = 'campus-life';
  let bestScore = 0;

  for (const topic of ACADEMIC_TOPICS) {
    if (scores[topic] > bestScore) {
      bestScore = scores[topic];
      bestTopic = topic;
    }
  }

  if (bestScore > 0) {
    return bestTopic;
  }

  // Deterministic fallback based on content character length, picking among valid topics
  const fallbackIndex = Math.abs(text.length) % ACADEMIC_TOPICS.length;
  return ACADEMIC_TOPICS[fallbackIndex];
}
