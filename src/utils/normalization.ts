export function normalizeTaskData(task: any, taskType: string): any {
  if (!task || typeof task !== 'object') {
    return getFallbackTask(taskType);
  }

  const fallback = getFallbackTask(taskType);

  const result: any = {
    ...task,
    id: String(task.id || task.questionDocId || fallback.id),
    title: String(task.title || fallback.title),
    level: String(task.level || fallback.level || 'intermediate'),
    topic: String(task.topic || fallback.topic || 'general'),
  };

  switch (taskType) {
    case 'complete-words':
      {
        const t = String(task.text || task.passage || '');
        result.text = (t && t.includes('[[')) ? t : fallback.text;
        result.totalBlanks = Number(task.totalBlanks || fallback.totalBlanks || 10);
      }
      break;

    case 'reading-passage':
      result.passage = String(task.passage || task.text || fallback.passage);
      result.questions = Array.isArray(task.questions) && task.questions.length > 0
        ? task.questions.map((q: any) => ({
            q: String(q?.q || q?.question || ''),
            options: Array.isArray(q?.options) ? q.options.map((o: any) => String(o || '')) : ['A', 'B', 'C', 'D'],
            answer: Number(q?.answer ?? 0),
            why: String(q?.why || q?.explanation || ''),
          }))
        : fallback.questions;
      break;

    case 'listening-dialogue':
      result.context = String(task.context || fallback.context);
      result.script = String(task.script || task.text || fallback.script);
      result.speakers = task.speakers && typeof task.speakers === 'object' ? task.speakers : fallback.speakers;
      result.questions = Array.isArray(task.questions) && task.questions.length > 0
        ? task.questions.map((q: any) => ({
            q: String(q?.q || q?.question || ''),
            options: Array.isArray(q?.options) ? q.options.map((o: any) => String(o || '')) : ['A', 'B', 'C', 'D'],
            answer: Number(q?.answer ?? 0),
            why: String(q?.why || q?.explanation || ''),
          }))
        : fallback.questions;
      break;

    case 'listen-repeat':
      result.sentences = Array.isArray(task.sentences) && task.sentences.length > 0
        ? task.sentences.map((s: any) => String(s || ''))
        : fallback.sentences;
      result.speakerName = String(task.speakerName || fallback.speakerName);
      result.speakerGender = String(task.speakerGender || fallback.speakerGender);
      break;

    case 'speaking-interview':
      result.context = String(task.context || fallback.context);
      result.interviewerName = String(task.interviewerName || fallback.interviewerName);
      result.interviewerGender = String(task.interviewerGender || fallback.interviewerGender);
      result.questions = Array.isArray(task.questions) && task.questions.length > 0
        ? task.questions.map((q: any) => ({
            question: String(q?.question || q?.q || ''),
            prepTimeSeconds: Number(q?.prepTimeSeconds || 20),
            responseTimeSeconds: Number(q?.responseTimeSeconds || 45),
            suggestedPoints: Array.isArray(q?.suggestedPoints) ? q.suggestedPoints.map((p: any) => String(p || '')) : [],
          }))
        : fallback.questions;
      break;

    case 'build-sentence':
      result.items = Array.isArray(task.items) && task.items.length > 0
        ? task.items.map((i: any) => ({
            context: String(i?.context || ''),
            words: Array.isArray(i?.words) ? i.words.map((w: any) => String(w || '')) : [],
            answer: String(i?.answer || ''),
            explanation: String(i?.explanation || ''),
          }))
        : fallback.items;
      break;

    case 'write-email':
      result.situation = String(task.situation || fallback.situation);
      result.recipient = String(task.recipient || fallback.recipient);
      result.goals = Array.isArray(task.goals) && task.goals.length > 0 ? task.goals.map((g: any) => String(g || '')) : fallback.goals;
      result.suggestedWordCount = String(task.suggestedWordCount || fallback.suggestedWordCount);
      break;

    case 'academic-discussion':
      result.professorName = String(task.professorName || fallback.professorName);
      result.professorPrompt = String(task.professorPrompt || task.prompt || fallback.professorPrompt);
      result.s1 = task.s1 && typeof task.s1 === 'object' ? { name: String(task.s1.name || fallback.s1.name), text: String(task.s1.text || fallback.s1.text) } : fallback.s1;
      result.s2 = task.s2 && typeof task.s2 === 'object' ? { name: String(task.s2.name || fallback.s2.name), text: String(task.s2.text || fallback.s2.text) } : fallback.s2;
      result.question = String(task.question || fallback.question);
      break;
  }

  return result;
}

function getFallbackTask(taskType: string): any {
  switch (taskType) {
    case 'complete-words':
      return {
        id: 'fallback-cw-1',
        title: 'Cognitive Development and Linguistic Acquisition',
        level: 'intermediate',
        topic: 'science-tech',
        text: 'Language acqui[[sition]] among you[[ng]] children demon[[strates]] remark[[able]] neurolo[[gical]] adaptab[[ility]]. Resear[[chers]] note th[[at]] early mu[[ltilingual]] exposure enhan[[ces]] cognit[[ive]] flexib[[ility]] across subse[[quent]] develo[[pmental]] stages.',
        totalBlanks: 10,
      };
    case 'reading-passage':
      return {
        id: 'fallback-rp-1',
        title: 'The Evolution of Avian Flight Mechanics',
        level: 'upper-intermediate',
        topic: 'science-tech',
        passage: 'The transition from terrestrial locomotion to powered flight in avian species represents one of the most remarkable evolutionary milestones. Paleontological discoveries in recent decades indicate that proto-feathers initially served thermal insulation or display functions rather than aerodynamic lift. Over successive generations, morphological modifications transformed forelimbs into sophisticated airfoil structures capable of generating thrust and lift simultaneously.',
        questions: [
          {
            q: 'According to the passage, what was the initial function of proto-feathers?',
            options: ['Thermal insulation or display', 'Direct aerodynamic propulsion', 'Underwater swimming and steering', 'Camouflage against predators'],
            answer: 0,
            why: 'The passage explicitly states that proto-feathers initially served thermal insulation or display functions.',
          },
        ],
      };
    case 'listening-dialogue':
      return {
        id: 'fallback-ld-1',
        title: 'Library Archive Access Discussion',
        level: 'intermediate',
        topic: 'campus-life',
        context: 'A student speaks with a library staff member about accessing rare manuscript archives.',
        speakers: { A: 'Sarah (Student)', B: 'Mr. Davis (Librarian)' },
        script: 'Sarah (Female): Good afternoon, Mr. Davis. I am researching nineteenth-century periodicals for my history thesis.\nMr. Davis (Male): Welcome, Sarah. Those special collections require advance registration and faculty sponsorship.\nSarah (Female): My advisor Dr. Henderson already approved my access form.\nMr. Davis (Male): Excellent. Let me retrieve the digital keycard for the secure reading room.',
        questions: [
          {
            q: 'Why does Sarah visit the library?',
            options: ['To borrow a modern textbook', 'To research nineteenth-century periodicals', 'To apply for a student employment position', 'To return overdue archival manuscripts'],
            answer: 1,
            why: 'Sarah states she is researching nineteenth-century periodicals for her history thesis.',
          },
        ],
      };
    case 'listen-repeat':
      return {
        id: 'fallback-lr-1',
        title: 'Academic Listening & Repeat Practice',
        level: 'intermediate',
        topic: 'science-tech',
        speakerName: 'Sarah (Female)',
        speakerGender: 'female',
        sentences: [
          'The research laboratory will remain closed during scheduled maintenance.',
          'Students must submit their final research proposals by Friday noon.',
          'Professor Jenkins explained the intricacies of quantum entanglement.',
        ],
      };
    case 'speaking-interview':
      return {
        id: 'fallback-si-1',
        title: 'University Campus Interview Simulation',
        level: 'intermediate',
        topic: 'campus-life',
        context: 'An admissions interviewer asks about your academic background and future goals.',
        interviewerName: 'Prof. Lee (Male)',
        interviewerGender: 'male',
        questions: [
          {
            question: 'Describe an academic subject that challenged your perspective and explain why.',
            prepTimeSeconds: 20,
            responseTimeSeconds: 45,
            suggestedPoints: ['Name the subject', 'Explain the specific challenge', 'Describe your resolution or growth'],
          },
        ],
      };
    case 'build-sentence':
      return {
        id: 'fallback-bs-1',
        title: 'Advanced Academic Sentence Structure',
        level: 'advanced',
        topic: 'science-tech',
        items: [
          {
            context: 'Arrange the scrambled words into a grammatically correct academic sentence.',
            words: ['Substantial', 'empirical', 'evidence', 'supports', 'the', 'hypothesis', 'regarding', 'neural', 'plasticity'],
            answer: 'Substantial empirical evidence supports the hypothesis regarding neural plasticity.',
            explanation: 'Subject + transitive verb + direct object + prepositional modifying phrase.',
          },
        ],
      };
    case 'write-email':
      return {
        id: 'fallback-we-1',
        title: 'Requesting Extension from Professor',
        level: 'intermediate',
        topic: 'campus-life',
        situation: 'You have contracted a flu virus and need a 48-hour extension on your research paper submission.',
        recipient: 'Professor Vance',
        goals: ['Politely explain the medical circumstance', 'Request a 48-hour deadline extension', 'Attach draft outline as provisional progress proof'],
        suggestedWordCount: '80-120 words',
      };
    case 'academic-discussion':
    default:
      return {
        id: 'fallback-ad-1',
        title: 'Online Education vs Traditional Seminars',
        level: 'intermediate',
        topic: 'social-sciences',
        professorName: 'Professor Henderson',
        professorPrompt: 'Our discussion this week examines whether virtual online classes offer equivalent pedagogical value compared to traditional face-to-face seminars.',
        s1: { name: 'Student A (Marcus)', text: 'Virtual classrooms democratize access for international learners.' },
        s2: { name: 'Student B (Elena)', text: 'In-person seminars foster spontaneous interpersonal debate and mentorship.' },
        question: 'State your position and contribute to the discussion board.',
      };
  }
}
