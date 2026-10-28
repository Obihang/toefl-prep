import { canonicalizeTaskType, validateNormalizedTask } from './taskNormalizer';

/**
 * Quality gate validator to purge low-quality stubs and ensure 2026 ETS TOEFL iBT standards.
 */
export function isHighQualityTask(task: any, taskType: string): boolean {
  if (!task || typeof task !== 'object') return false;

  const canonicalType = canonicalizeTaskType(taskType);
  const countWords = (text: string) => (text || '').trim().split(/\s+/).filter(Boolean).length;
  const countSentences = (text: string) =>
    (text || '')
      .split(/[.!?]+/)
      .filter((s) => s.trim().length > 3).length;

  switch (canonicalType) {
    case 'academic-discussion': {
      const profPrompt = String(task.professorPrompt || task.prompt || '');
      const s1Text = String(task.s1?.text || '');
      const s2Text = String(task.s2?.text || '');
      const profWords = countWords(profPrompt);
      const s1Words = countWords(s1Text);
      const s2Words = countWords(s2Text);
      const s1Sentences = countSentences(s1Text);
      const s2Sentences = countSentences(s2Text);

      return (
        profWords >= 35 &&
        profWords <= 140 &&
        s1Words >= 35 &&
        s1Words <= 110 &&
        s1Sentences >= 2 &&
        s2Words >= 35 &&
        s2Words <= 110 &&
        s2Sentences >= 2
      );
    }

    case 'write-email': {
      const situation = String(task.situation || task.context || task.prompt || '');
      const goals = Array.isArray(task.goals)
        ? task.goals
        : Array.isArray(task.bulletPoints)
        ? task.bulletPoints
        : [];
      const sitWords = countWords(situation);
      const modelAnswer = String(
        task.sampleResponse || task.modelAnswer || task.exemplar || task.sampleEmail || ''
      );
      const modelWords = countWords(modelAnswer);
      return sitWords >= 15 && goals.length >= 3 && (!modelAnswer || modelWords > 40);
    }

    case 'reading-passage': {
      const passage = String(task.passage || task.text || '');
      const questions = Array.isArray(task.questions) ? task.questions : [];
      const passageWords = countWords(passage);
      return passageWords >= 120 && questions.length >= 3 && validateNormalizedTask(canonicalType, task);
    }

    case 'listening-dialogue': {
      const script = String(task.script || task.text || task.lecture || '');
      const scriptWords = countWords(script);
      const questions = Array.isArray(task.questions) ? task.questions : [];
      return scriptWords >= 90 && questions.length >= 3 && validateNormalizedTask(canonicalType, task);
    }

    case 'complete-words': {
      return validateNormalizedTask(canonicalType, task);
    }

    case 'build-sentence': {
      return validateNormalizedTask(canonicalType, task);
    }

    case 'listen-repeat': {
      const sentences = Array.isArray(task.sentences) ? task.sentences : [];
      return (
        sentences.length >= 7 &&
        sentences.every((s: string) => countWords(s) >= 5) &&
        validateNormalizedTask(canonicalType, task)
      );
    }

    case 'speaking-interview': {
      const questions = Array.isArray(task.questions) ? task.questions : [];
      return (
        questions.length >= 4 &&
        questions.every((q: any) => q.question && q.question.length >= 15) &&
        validateNormalizedTask(canonicalType, task)
      );
    }

    default:
      return Boolean(task.title && task.id);
  }
}
