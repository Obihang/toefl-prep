/**
 * Quality gate validator to purge low-quality stubs and ensure 2026 ETS TOEFL iBT standards.
 */
export function isHighQualityTask(task: any, taskType: string): boolean {
  if (!task || typeof task !== 'object') return false;

  const countWords = (text: string) => (text || '').trim().split(/\s+/).filter(Boolean).length;
  const countSentences = (text: string) => (text || '').split(/[.!?]+/).filter((s) => s.trim().length > 3).length;

  switch (taskType) {
    case 'academic-discussion': {
      const profPrompt = String(task.professorPrompt || task.prompt || '');
      const s1Text = String(task.s1?.text || '');
      const s2Text = String(task.s2?.text || '');
      const profWords = countWords(profPrompt);
      const s1Words = countWords(s1Text);
      const s2Words = countWords(s2Text);
      const s1Sentences = countSentences(s1Text);
      const s2Sentences = countSentences(s2Text);

      // Professor prompt: 50-100 words; Student posts: 45-75 words, 3+ sentences
      return (
        profWords >= 40 &&
        profWords <= 120 &&
        s1Words >= 40 &&
        s1Words <= 90 &&
        s1Sentences >= 3 &&
        s2Words >= 40 &&
        s2Words <= 90 &&
        s2Sentences >= 3
      );
    }

    case 'write-email': {
      const situation = String(task.situation || task.context || task.prompt || '');
      const goals = Array.isArray(task.goals) ? task.goals : (Array.isArray(task.bulletPoints) ? task.bulletPoints : []);
      const sitWords = countWords(situation);
      const modelAnswer = String(task.sampleResponse || task.modelAnswer || task.exemplar || task.sampleEmail || '');
      const modelWords = countWords(modelAnswer);
      return sitWords > 15 && goals.length >= 2 && (!modelAnswer || modelWords > 40);
    }

    case 'reading-passage': {
      const passage = String(task.passage || task.text || '');
      const questions = Array.isArray(task.questions) ? task.questions : [];
      const passageWords = countWords(passage);
      return passageWords >= 150 && questions.length >= 3;
    }

    case 'listening-dialogue':
    case 'listening-lecture': {
      const script = String(task.script || task.text || task.lecture || '');
      const scriptWords = countWords(script);
      const questions = Array.isArray(task.questions) ? task.questions : [];
      return scriptWords >= 120 && questions.length >= 3;
    }

    case 'complete-words': {
      const text = String(task.text || '');
      const blankMatches = text.match(/\[\[/g) || [];
      return text.length > 50 && blankMatches.length >= 5;
    }

    case 'build-sentence': {
      const items = Array.isArray(task.items) ? task.items : [];
      return items.length >= 1 && items.every((i: any) => i.answer && Array.isArray(i.words) && i.words.length >= 5);
    }

    case 'listen-repeat': {
      const sentences = Array.isArray(task.sentences) ? task.sentences : [];
      return sentences.length >= 2 && sentences.every((s: string) => countWords(s) >= 8);
    }

    case 'speaking-interview': {
      const questions = Array.isArray(task.questions) ? task.questions : [];
      return questions.length >= 1 && questions.every((q: any) => q.question && q.question.length > 15);
    }

    default:
      return Boolean(task.title && task.id);
  }
}
