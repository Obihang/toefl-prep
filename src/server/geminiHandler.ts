import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { GENERATION_CHAIN, EVALUATION_CHAIN, TTS_CHAIN, TRANSCRIBE_CHAIN } from '../constants/models.ts';
import * as CURATED from '../data/curatedQuestions.ts';
import { generateWithFallback } from './geminiUtils.ts';
import { redactKey, isKeyError, isTransientError, getStatus, extractErrorMessage, isQuotaExhaustedError } from './geminiErrors.ts';

export { redactKey, isKeyError, isTransientError, getStatus, extractErrorMessage, isQuotaExhaustedError };

// Module-level Map of models that rejected the thinking parameter with a 400
export const rejectedThinkingModels = new Map<string, boolean>();

export interface ModelThinkingConfig {
  transcribe?: { thinkingLevel: 'minimal' } | { thinkingBudget: number };
  evaluation?: { thinkingLevel: 'low' } | { thinkingBudget: number };
}

// Verified model thinking specifications chosen per model instead of string matching
export const VERIFIED_MODEL_THINKING_CONFIGS: Record<string, ModelThinkingConfig> = {
  'gemini-3.1-flash-lite': {
    transcribe: { thinkingLevel: 'minimal' },
    evaluation: { thinkingLevel: 'low' },
  },
  'gemini-flash-latest': {
    transcribe: { thinkingLevel: 'minimal' },
    evaluation: { thinkingLevel: 'low' },
  },
  'gemini-3.8-flash': {
    transcribe: { thinkingLevel: 'minimal' },
    evaluation: { thinkingLevel: 'low' },
  },
  'gemini-3.1-pro-preview': {
    transcribe: { thinkingLevel: 'minimal' },
    evaluation: { thinkingLevel: 'low' },
  },
  'gemini-2.5-flash': {
    transcribe: { thinkingBudget: 0 },
    evaluation: { thinkingBudget: 256 },
  },
  'gemini-2.5-flash-lite': {
    transcribe: { thinkingBudget: 0 },
    evaluation: { thinkingBudget: 256 },
  },
};

export function getModelThinkingConfig(
  model: string,
  mode: 'transcribe' | 'evaluation'
): { thinkingLevel: string } | { thinkingBudget: number } | null {
  if (rejectedThinkingModels.get(model)) {
    return null;
  }
  const config = VERIFIED_MODEL_THINKING_CONFIGS[model];
  if (config) {
    return mode === 'transcribe' ? (config.transcribe || null) : (config.evaluation || null);
  }
  return null;
}

const Schemas = {
  completeWords: z.object({ title: z.string(), text: z.string(), totalBlanks: z.number() }),
  readingPassage: z.object({
    title: z.string(),
    passage: z.string(),
    questions: z.array(z.object({ q: z.string(), options: z.array(z.string()), answer: z.number(), why: z.string() })),
  }),
  listeningDialogue: z.object({
    title: z.string(),
    context: z.string(),
    speakers: z.record(z.string(), z.string()),
    script: z.string(),
    questions: z.array(z.object({ q: z.string(), options: z.array(z.string()), answer: z.number(), why: z.string() })),
  }),
  listenRepeat: z.object({ title: z.string(), sentences: z.array(z.string()) }),
  speakingInterview: z.object({
    title: z.string(),
    context: z.string(),
    questions: z.array(z.object({ question: z.string(), prepTimeSeconds: z.number(), responseTimeSeconds: z.number(), suggestedPoints: z.array(z.string()) })),
  }),
  buildSentence: z.object({
    title: z.string(),
    items: z.array(z.object({ context: z.string(), words: z.array(z.string()), answer: z.string(), explanation: z.string() })),
  }),
  writeEmail: z.object({
    title: z.string(),
    situation: z.string(),
    recipient: z.string(),
    goals: z.array(z.string()),
    suggestedWordCount: z.string(),
  }),
  academicDiscussion: z.object({
    title: z.string(),
    professorName: z.string(),
    professorPrompt: z.string(),
    s1: z.object({ name: z.string(), text: z.string() }),
    s2: z.object({ name: z.string(), text: z.string() }),
    question: z.string(),
  }),
};

function cleanAndExtractJson(text: string): any {
  if (!text || !text.trim()) {
    throw new Error('Model returned an empty response');
  }

  // 1. Direct parse
  try {
    return JSON.parse(text.trim());
  } catch {}

  // 2. Strip markdown code fence
  let unmarkdown = text.trim();
  if (unmarkdown.includes('```')) {
    unmarkdown = unmarkdown.replace(/```(?:json)?\s*/gi, '').replace(/\s*```/g, '').trim();
    try {
      return JSON.parse(unmarkdown);
    } catch {}
  }

  // 3. Extract JSON object with regex
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]);
    } catch {
      try {
        const cleaned = objMatch[0].replace(/,\s*([\}\]])/g, '$1');
        return JSON.parse(cleaned);
      } catch {}
    }
  }

  // 4. Extract JSON array with regex
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      return JSON.parse(arrMatch[0]);
    } catch {}
  }

  throw new Error(`Unable to parse valid JSON from AI response: ${text.slice(0, 100)}...`);
}

function normalizeAcademicDiscussion(data: any) {
  const title = String(data.title || 'Writing for an Academic Discussion');
  const profName = String(data.professorName || data.professor_name || data.professor?.name || 'Dr. Henderson');
  const profPrompt = String(data.professorPrompt || data.professor_prompt || data.professor?.prompt || data.prompt || data.context || 'Please share your thoughts on the topic below.');
  
  let s1 = data.s1 || data.student1 || (Array.isArray(data.students) ? data.students[0] : null);
  let s2 = data.s2 || data.student2 || (Array.isArray(data.students) ? data.students[1] : null);

  const s1Norm = {
    name: String((typeof s1 === 'object' ? (s1?.name || s1?.student || s1?.studentName) : null) || 'Student A'),
    text: String((typeof s1 === 'object' ? (s1?.text || s1?.post || s1?.response || s1?.content) : (typeof s1 === 'string' ? s1 : '')) || 'I agree with the professor on this point, but we should also consider alternative perspectives.'),
  };
  const s2Norm = {
    name: String((typeof s2 === 'object' ? (s2?.name || s2?.student || s2?.studentName) : null) || 'Student B'),
    text: String((typeof s2 === 'object' ? (s2?.text || s2?.post || s2?.response || s2?.content) : (typeof s2 === 'string' ? s2 : '')) || 'I take a somewhat different view. From my experience, there are several key factors to weigh.'),
  };

  const question = String(data.question || data.instructions || data.instruction || 'Your professor is teaching a class on this topic. Write a post responding to the professor\'s question.');

  return {
    title,
    professorName: profName,
    professorPrompt: profPrompt,
    s1: s1Norm,
    s2: s2Norm,
    question,
  };
}

function normalizeCompleteWords(data: any) {
  const title = String(data.title || 'Complete the Words');
  const text = String(data.text || data.passage || data.paragraph || '');
  let totalBlanks = Number(data.totalBlanks || data.total_blanks || 0);
  const matchCount = (text.match(/\[\[/g) || []).length;
  if (totalBlanks <= 0 || isNaN(totalBlanks)) {
    totalBlanks = matchCount > 0 ? matchCount : 10;
  }
  return { title, text, totalBlanks };
}

function normalizeReadingPassage(data: any) {
  const title = String(data.title || 'Academic Reading Passage');
  const passage = String(data.passage || data.text || '');
  const rawQs = Array.isArray(data.questions) ? data.questions : [];
  const questions = (rawQs.length > 0 ? rawQs : [{}, {}, {}]).slice(0, 3).map((q: any, idx: number) => {
    let answer = q.answer;
    if (typeof answer === 'string') {
      const char = answer.trim().toLowerCase();
      const mapped = ['a', 'b', 'c', 'd'].indexOf(char);
      answer = mapped !== -1 ? mapped : parseInt(char, 10);
    }
    const finalAnswer = (typeof answer === 'number' && !isNaN(answer) && answer >= 0 && answer <= 3) ? answer : 0;
    const options = Array.isArray(q.options) && q.options.length >= 2 
      ? q.options.map(String) 
      : ['First primary explanation', 'Alternative theoretical model', 'Empirical observation', 'Contrasting hypothesis'];
    return {
      q: String(q.q || q.question || `According to the passage, which statement best explains the central point? (${idx + 1})`),
      options,
      answer: finalAnswer,
      why: String(q.why || q.explanation || q.reason || 'This statement accurately reflects the evidence presented in the passage.'),
    };
  });
  return { title, passage, questions };
}

function normalizeListeningDialogue(data: any) {
  const title = String(data.title || 'Campus Conversation');
  const context = String(data.context || data.situation || 'A discussion between a professor and student.');
  let speakers: Record<string, string> = { A: 'Professor', B: 'Student' };
  if (data.speakers && typeof data.speakers === 'object' && !Array.isArray(data.speakers)) {
    speakers = {
      A: String(data.speakers.A || data.speakers['Speaker A'] || 'Professor'),
      B: String(data.speakers.B || data.speakers['Speaker B'] || 'Student'),
    };
  } else if (Array.isArray(data.speakers) && data.speakers.length >= 2) {
    speakers = { A: String(data.speakers[0]), B: String(data.speakers[1]) };
  }

  const script = String(data.script || data.dialogue || data.text || '');
  const rawQs = Array.isArray(data.questions) ? data.questions : [];
  const questions = (rawQs.length > 0 ? rawQs : [{}, {}, {}]).slice(0, 3).map((q: any, idx: number) => {
    let answer = q.answer;
    if (typeof answer === 'string') {
      const char = answer.trim().toLowerCase();
      const mapped = ['a', 'b', 'c', 'd'].indexOf(char);
      answer = mapped !== -1 ? mapped : parseInt(char, 10);
    }
    const finalAnswer = (typeof answer === 'number' && !isNaN(answer) && answer >= 0 && answer <= 3) ? answer : 0;
    const options = Array.isArray(q.options) && q.options.length >= 2
      ? q.options.map(String)
      : ['Reviewing the assignment guidelines', 'Clarifying research methodology', 'Requesting an extension', 'Discussing exam format'];
    return {
      q: String(q.q || q.question || `What is the main purpose of the conversation? (${idx + 1})`),
      options,
      answer: finalAnswer,
      why: String(q.why || q.explanation || q.reason || 'This is supported directly by the speakers in the dialogue.'),
    };
  });

  return { title, context, speakers, script, questions };
}

function normalizeListenRepeat(data: any) {
  const title = String(data.title || 'Listen & Repeat Practice');
  let sentences = Array.isArray(data.sentences) ? data.sentences.map(String).filter(Boolean) : [];
  if (sentences.length === 0 && Array.isArray(data.items)) {
    sentences = data.items.map((it: any) => String(typeof it === 'string' ? it : it.sentence || it.text || '')).filter(Boolean);
  }
  if (sentences.length === 0) {
    sentences = [
      'The archaeological expedition uncovered significant artifacts.',
      'Students are required to register for their seminar by Friday.',
      'Recent laboratory experiments confirm the initial scientific hypothesis.',
      'Environmental factors played a decisive role in the species migration.',
      'The university library will extend its hours during final examination week.',
    ];
  }
  return { title, sentences };
}

function normalizeSpeakingInterview(data: any) {
  const title = String(data.title || 'Speaking Interview Practice');
  const context = String(data.context || 'University interview simulation.');
  const rawQs = Array.isArray(data.questions) ? data.questions : [];
  const questions = (rawQs.length > 0 ? rawQs : [{}, {}, {}, {}]).slice(0, 4).map((q: any, idx: number) => ({
    question: String(typeof q === 'string' ? q : (q.question || q.prompt || `Can you describe an academic experience that significantly shaped your interests? (${idx + 1})`)),
    prepTimeSeconds: Number(q.prepTimeSeconds || 20),
    responseTimeSeconds: Number(q.responseTimeSeconds || 45),
    suggestedPoints: Array.isArray(q.suggestedPoints) && q.suggestedPoints.length > 0
      ? q.suggestedPoints.map(String)
      : ['State your main viewpoint clearly', 'Provide a concrete personal or academic example', 'Summarize the significance'],
  }));
  return { title, context, questions };
}

function normalizeBuildSentence(data: any) {
  const title = String(data.title || 'Build a Sentence Practice');
  const rawItems = Array.isArray(data.items) ? data.items : [];
  const items = (rawItems.length > 0 ? rawItems : [{}, {}, {}, {}, {}]).slice(0, 5).map((it: any) => ({
    context: String(it.context || it.setup || 'Arrange the words into a grammatically correct sentence:'),
    words: Array.isArray(it.words) && it.words.length > 0 ? it.words.map(String) : ['The', 'professors', 'conducted', 'groundbreaking', 'research'],
    answer: String(it.answer || it.sentence || 'The professors conducted groundbreaking research.'),
    explanation: String(it.explanation || it.rule || 'Subject-verb-object arrangement in academic writing.'),
  }));
  return { title, items };
}

function normalizeWriteEmail(data: any) {
  const title = String(data.title || 'Write an Email');
  const situation = String(data.situation || data.context || 'You need to contact your academic department regarding course enrollment.');
  const recipient = String(data.recipient || 'Academic Advisor');
  const goals = Array.isArray(data.goals) && data.goals.length > 0 ? data.goals.map(String) : [
    'Explain the scheduling conflict with your required course',
    'Inquire about alternative seminar sections or prerequisite waivers',
    'Request an appointment during office hours to discuss graduation requirements',
  ];
  const suggestedWordCount = String(data.suggestedWordCount || '80-120 words');
  return { title, situation, recipient, goals, suggestedWordCount };
}

function normalizeTask(taskType: string, data: any): any {
  if (!data || typeof data !== 'object') {
    throw new Error('Parsed data is not an object');
  }

  switch (taskType) {
    case 'complete-words':
      return normalizeCompleteWords(data);
    case 'reading-passage':
      return normalizeReadingPassage(data);
    case 'listening-dialogue':
      return normalizeListeningDialogue(data);
    case 'listen-repeat':
      return normalizeListenRepeat(data);
    case 'speaking-interview':
      return normalizeSpeakingInterview(data);
    case 'build-sentence':
      return normalizeBuildSentence(data);
    case 'write-email':
      return normalizeWriteEmail(data);
    case 'academic-discussion':
    default:
      return normalizeAcademicDiscussion(data);
  }
}

function getAiClient(customApiKey?: string) {
  const apiKey = (customApiKey && customApiKey.trim()) || process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return null;
  }
  return new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function handleTestApiKey(customApiKey?: string): Promise<{ success: true; message: string; model: string }> {
  const apiKey = (customApiKey && customApiKey.trim()) || process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error('No Gemini API key provided. Add yours in Dashboard > Settings & API Key');
  }

  const ai = new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const { modelUsed } = await generateWithFallback(ai, GENERATION_CHAIN, async (model) => {
    await ai.models.generateContent({
      model,
      contents: 'Reply with the single word OK',
      config: {
        temperature: 0.1,
      },
    });
    return true;
  });

  return { success: true, message: `Key works (${modelUsed})`, model: modelUsed };
}

export async function handleGenerateTask(taskType: string, level: string, topic: string, customApiKey?: string) {
  const ai = getAiClient(customApiKey);
  
  const taskMap: Record<string, string> = {
    'complete-words': 'completeWords',
    'reading-passage': 'readingPassage',
    'listening-dialogue': 'listeningDialogue',
    'listen-repeat': 'listenRepeat',
    'speaking-interview': 'speakingInterview',
    'build-sentence': 'buildSentence',
    'write-email': 'writeEmail',
    'academic-discussion': 'academicDiscussion',
  };
  const curatedMap: Record<string, string> = {
    'complete-words': 'CURATED_COMPLETE_WORDS',
    'reading-passage': 'CURATED_READING_PASSAGES',
    'listening-dialogue': 'CURATED_LISTENING',
    'listen-repeat': 'CURATED_LISTEN_REPEAT',
    'speaking-interview': 'CURATED_SPEAKING_INTERVIEWS',
    'build-sentence': 'CURATED_BUILD_SENTENCES',
    'write-email': 'CURATED_WRITE_EMAILS',
    'academic-discussion': 'CURATED_ACADEMIC_DISCUSSIONS',
  };

  const schemaKey = taskMap[taskType] || 'academicDiscussion';
  const schema = Schemas[schemaKey as keyof typeof Schemas];

  const getPrompt = (tType: string, lvl: string, top: string) => {
    const levelDesc =
      lvl === 'advanced'
        ? 'Advanced (C1 CEFR / TOEFL 100-120)'
        : lvl === 'intermediate'
        ? 'Intermediate (B1-B2 CEFR / TOEFL 60-80)'
        : 'Upper-Intermediate (B2-C1 CEFR / TOEFL 80-100)';
    switch (tType) {
      case 'complete-words':
        return `You are an official ETS TOEFL test content creator. Create an authentic TOEFL Reading "Complete the Words" (C-Test) item for a student at level: ${levelDesc}. Topic: ${top}. Requirements: 1. Write an academic paragraph of 75-90 words. 2. In the paragraph, select exactly 10 academic/content words (4 letters or more, starting from the second sentence, spaced out). 3. In the text, wrap the second half (or slightly more than half if odd length) of each chosen word in [[brackets]], leaving the first half visible outside. Return JSON format: {"title": "Short Academic Topic Title", "text": "The full paragraph with [[...]] wrapping the missing letters only", "totalBlanks": 10}`;
      case 'reading-passage':
        return `You are an official ETS TOEFL test content creator. Create an authentic TOEFL Reading Academic Passage with 3 multiple-choice questions for level: ${levelDesc}. Topic: ${top}. Requirements: 1. Academic passage between 160-200 words. 2. Exactly 3 multiple-choice questions: Main idea, Detail, Vocabulary/Inference. Return JSON format: {"title": "Passage Title", "passage": "Passage text...", "questions": [{"q": "Question prompt?", "options": ["A", "B", "C", "D"], "answer": 0, "why": "Explanation..."}]}`;
      case 'listening-dialogue':
        return `You are an official ETS TOEFL test content creator. Create a TOEFL Listening task for level: ${levelDesc}. Topic: ${top}. Requirements: 1. A campus conversation OR a short classroom lecture. 2. Script must be 120-150 words. 3. Exactly 3 multiple-choice comprehension questions with 4 options each. Return JSON format: {"title": "Listening Context Title", "context": "Brief 1-sentence situation description", "speakers": {"A": "Role of Speaker A", "B": "Role of Speaker B"}, "script": "Speaker A: ...\\nSpeaker B: ...", "questions": [{"q": "Question prompt?", "options": ["A", "B", "C", "D"], "answer": 0, "why": "Explanation..."}]}`;
      case 'listen-repeat':
        return `You are an official ETS TOEFL test creator. Create a TOEFL Speaking "Listen and Repeat" practice set for level: ${levelDesc}. Topic: ${top}. Return JSON format: {"title": "Listen & Repeat Exercise", "sentences": ["Sentence 1", "Sentence 2", "Sentence 3", "Sentence 4", "Sentence 5"]}`;
      case 'speaking-interview':
        return `You are an official ETS TOEFL Speaking examiner. Create a TOEFL Speaking "Take an Interview" practice simulation for level: ${levelDesc}. Topic: ${top}. Return JSON format: {"title": "University Interview Simulation", "context": "Context description", "questions": [{"question": "Question text...", "prepTimeSeconds": 20, "responseTimeSeconds": 45, "suggestedPoints": ["Point 1", "Point 2"]}]}`;
      case 'build-sentence':
        return `You are an official ETS TOEFL test creator. Create 5 TOEFL Writing "Build a Sentence" (sentence scramble) items for level: ${levelDesc}. Topic: ${top}. Return JSON format: {"title": "Build a Sentence Practice", "items": [{"context": "Context setup line...", "words": ["w1", "w2", "w3", "w4", "w5"], "answer": "The complete correct sentence.", "explanation": "Grammar rule explanation."}]}`;
      case 'write-email':
        return `You are an official ETS TOEFL Writing test designer. Create a TOEFL Writing "Write an Email" prompt for level: ${levelDesc}. Topic: ${top}. Return JSON format: {"title": "Email Task Title", "situation": "Situation description...", "recipient": "Recipient name/office", "goals": ["Goal 1", "Goal 2", "Goal 3"], "suggestedWordCount": "80-120 words"}`;
      case 'academic-discussion':
      default:
        return `You are an official ETS TOEFL Writing test designer. Create a TOEFL Writing "Writing for an Academic Discussion" prompt for level: ${levelDesc}. Topic: ${top}. Return JSON format: {"title": "Academic Discussion Board", "professorName": "Professor Name", "professorPrompt": "Prompt text...", "s1": {"name": "Student A", "text": "Post text..."}, "s2": {"name": "Student B", "text": "Post text..."}, "question": "Instruction text..."}`;
    }
  };

  try {
    if (!ai) {
      throw new Error('No Gemini API key provided. Add yours in Dashboard > Settings & API Key');
    }

    const { result, modelUsed } = await generateWithFallback(ai, GENERATION_CHAIN, async (model) => {
      const prompt = getPrompt(taskType, level, topic);
      const systemInstruction = 'You are an expert ETS TOEFL test design specialist. Return valid JSON matching the schema only.';
      const fullPrompt = `${systemInstruction}\n\n${prompt}\n\nIMPORTANT: Return valid JSON matching the schema only. Do not wrap in markdown fences.`;

      let response;
      try {
        response = await ai.models.generateContent({
          model,
          contents: fullPrompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.7,
          },
        });
      } catch (firstErr: any) {
        if (isKeyError(firstErr) || isQuotaExhaustedError(firstErr)) {
          throw firstErr;
        }
        console.warn(`Model ${model} JSON mime attempt failed, retrying plain contents:`, firstErr?.message || firstErr);
        response = await ai.models.generateContent({
          model,
          contents: fullPrompt,
          config: {
            temperature: 0.7,
          },
        });
      }

      const rawText = response.text || response.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
      const parsed = cleanAndExtractJson(rawText);
      const normalized = normalizeTask(taskType, parsed);
      return schema.parse(normalized);
    });

    return { ...result, isFallback: false, modelUsed };
  } catch (error: any) {
    const isQuota = isQuotaExhaustedError(error);
    const errMsg = extractErrorMessage(error);
    if (!isQuota) {
      console.warn(`Failed to generate task ${taskType}, falling back to curated:`, errMsg);
    }
    const curatedKey = curatedMap[taskType] as keyof typeof CURATED;
    const curatedTasks = CURATED[curatedKey] as any[];
    const item = curatedTasks[Math.floor(Math.random() * curatedTasks.length)];
    return {
      ...item,
      isFallback: true,
      isQuotaExhausted: isQuota,
      fallbackReason: errMsg,
      modelUsed: 'Curated ETS TOEFL Question Bank',
    };
  }
}

export async function handleEvaluateResponse(
  taskType: string,
  promptData: any,
  studentResponse: any,
  customApiKey?: string
) {
  const ai = getAiClient(customApiKey);
  if (!ai) {
    throw new Error('No Gemini API key provided. Add yours in Dashboard > Settings & API Key');
  }

  const evaluationPrompt = `You are an official certified ETS TOEFL iBT scoring rater.
Evaluate the student's submission for the following TOEFL task type: "${taskType}".

Task Prompt and Requirements:
${JSON.stringify(promptData, null, 2)}

Student's Submission:
${JSON.stringify(studentResponse, null, 2)}

Scoring Guidelines:
- Evaluate using authentic ETS TOEFL rubrics.
- In the updated TOEFL reporting system, section scores are reported on a 1.0 to 6.0 Band Scale (with 0.5 increments: 1.0 to 6.0, mapped to CEFR A1-C2).
- The raw task rubric is 0.0 to 5.0 (for Writing tasks) or 0.0 to 4.0 (for Speaking tasks).
- Provide both:
  1. The new official TOEFL section Band Score on the 1.0 to 6.0 scale (bandScore6, e.g. 5.0 or 5.5).
  2. The raw task rubric score (rawRubricScore out of 5.0 or 4.0).
  3. The legacy scaled score out of 30 (scaledScore, e.g., 27/30).
- Identify specific grammar, punctuation, or word-choice errors with the original phrase, the corrected version, and a brief pedagogical explanation.
- Provide a high-scoring exemplar response demonstrating how a native or C1+ level candidate would address the exact same prompt.
- Suggest 3 concrete, actionable improvement tips.

Return JSON in this exact structure:
{
  "bandScore6": 5.5,
  "bandScore": 4.5,
  "rawRubricScore": 4.5,
  "rawRubricMax": 5.0,
  "scaledScore": 27,
  "performanceLevel": "C1 Advanced (High Fluency)",
  "summary": "Overall diagnostic assessment in 2-3 sentences.",
  "criteria": [
    {
      "name": "Task Completion & Relevance",
      "score": "4.5 / 5.0",
      "comment": "Specific feedback..."
    },
    {
      "name": "Coherence & Organization",
      "score": "4.0 / 5.0",
      "comment": "Specific feedback..."
    },
    {
      "name": "Grammar & Syntax",
      "score": "4.5 / 5.0",
      "comment": "Specific feedback..."
    },
    {
      "name": "Lexical Sophistication",
      "score": "4.0 / 5.0",
      "comment": "Specific feedback..."
    }
  ],
  "corrections": [
    {
      "original": "exact student phrase",
      "corrected": "improved/corrected phrase",
      "explanation": "why this correction improves the score"
    }
  ],
  "suggestions": [
    "Tip 1...",
    "Tip 2...",
    "Tip 3..."
  ],
  "exemplar": "A model high-scoring C1/C2 response demonstrating target structure and vocabulary."
}`;

  const startTime = Date.now();
  try {
    const { result } = await generateWithFallback(ai, EVALUATION_CHAIN, async (model) => {
      const executeEvaluation = async (withThinking: boolean) => {
        const config: any = {
          responseMimeType: 'application/json',
          temperature: 0.3,
        };
        const thinking = withThinking ? getModelThinkingConfig(model, 'evaluation') : null;
        if (thinking) {
          config.thinkingConfig = thinking;
        }

        try {
          return await ai.models.generateContent({
            model,
            contents: evaluationPrompt,
            config,
          });
        } catch (firstErr: any) {
          if (isKeyError(firstErr) || isQuotaExhaustedError(firstErr)) {
            throw firstErr;
          }
          const is400 =
            getStatus(firstErr) === 400 ||
            firstErr?.status === 'INVALID_ARGUMENT' ||
            firstErr?.error?.status === 'INVALID_ARGUMENT';

          if (withThinking && is400) {
            rejectedThinkingModels.set(model, true);
            console.warn(`Model ${model} evaluation rejected thinking config (400 / INVALID_ARGUMENT), skipping thinking on retry and subsequent calls.`);
            return executeEvaluation(false);
          }

          console.warn(`Model ${model} evaluation JSON mime attempt failed, retrying plain contents:`, firstErr?.message || firstErr);
          const fallbackConfig: any = { temperature: 0.3 };
          if (withThinking && !is400) {
            const fallbackThinking = getModelThinkingConfig(model, 'evaluation');
            if (fallbackThinking) {
              fallbackConfig.thinkingConfig = fallbackThinking;
            }
          }
          return await ai.models.generateContent({
            model,
            contents: `${evaluationPrompt}\n\nIMPORTANT: Return ONLY valid JSON matching the structure. Do not include markdown fences.`,
            config: fallbackConfig,
          });
        }
      };

      const response = await executeEvaluation(true);
      const rawText = response.text || response.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
      const parsed = cleanAndExtractJson(rawText);
      return { ...parsed, modelUsed: model };
    });

    const durationMs = Date.now() - startTime;
    return { ...result, durationMs };
  } catch (error: any) {
    const errMsg = extractErrorMessage(error);
    throw new Error(errMsg);
  }
}


export async function handleSynthesizeSpeech(
  text: string,
  voiceName: string = 'Kore',
  customApiKey?: string
): Promise<{ audioBase64: string; modelUsed: string }> {
  const ai = getAiClient(customApiKey);
  if (!ai) {
    throw new Error('SPEECH_UNAVAILABLE');
  }

  const validVoices = new Set<string>([
    'Achernar', 'Aoede', 'Autonoe', 'Callirrhoe', 'Despina', 'Erinome', 'Gacrux', 'Kore', 'Laomedeia', 'Leda', 'Pulcherrima', 'Sulafat', 'Vindemiatrix', 'Zephyr',
    'Achird', 'Algenib', 'Algieba', 'Alnilam', 'Charon', 'Enceladus', 'Fenrir', 'Iapetus', 'Orus', 'Puck', 'Rasalgethi', 'Sadachbia', 'Sadaltager', 'Schedar', 'Umbriel', 'Zubenelgenubi'
  ]);
  const safeVoiceName = validVoices.has(voiceName) ? voiceName : 'Kore';

  try {
    const { result, modelUsed } = await generateWithFallback(ai, TTS_CHAIN, async (model) => {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [{ text }],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: safeVoiceName },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        throw new Error('Failed to generate audio from speech model');
      }
      return base64Audio;
    });

    return { audioBase64: result, modelUsed };
  } catch (error: any) {
    console.error('TTS error:', error);
    throw new Error('SPEECH_UNAVAILABLE');
  }
}

export async function handleTranscribeAudio(
  audioBase64: string,
  mimeType: string = 'audio/webm',
  customApiKey?: string
): Promise<{ transcript: string; modelUsed: string; durationMs: number }> {
  const startTime = Date.now();
  const ai = getAiClient(customApiKey);
  if (!ai) {
    throw new Error('SPEECH_UNAVAILABLE');
  }

  const cleanMime = mimeType.split(';')[0].trim() || 'audio/webm';
  const promptText =
    'Transcribe the spoken English speech in this audio accurately. Write out spoken times and numbers as standard words where appropriate to match natural speech (e.g. transcribe "10:00" as "ten o\'clock", "2" as "two", "50%" as "fifty percent"). Return only the exact transcription without introductory phrases or commentary.';

  try {
    const { result, modelUsed } = await generateWithFallback(ai, TRANSCRIBE_CHAIN, async (model) => {
      const executeTranscription = async (withThinking: boolean): Promise<string> => {
        const config: any = {
          temperature: 0.0,
          maxOutputTokens: 2048,
        };

        const thinking = withThinking ? getModelThinkingConfig(model, 'transcribe') : null;
        if (thinking) {
          config.thinkingConfig = thinking;
        }

        try {
          const response = await ai.models.generateContent({
            model,
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    inlineData: {
                      mimeType: cleanMime,
                      data: audioBase64,
                    },
                  },
                  {
                    text: promptText,
                  },
                ],
              },
            ],
            config,
          });

          const text = (response.text || '').trim();
          if (!text) {
            throw new Error('Empty transcription returned');
          }
          return text;
        } catch (err: any) {
          if (isKeyError(err) || isQuotaExhaustedError(err)) {
            throw err;
          }
          const is400 =
            getStatus(err) === 400 ||
            err?.status === 'INVALID_ARGUMENT' ||
            err?.error?.status === 'INVALID_ARGUMENT';

          if (withThinking && is400) {
            rejectedThinkingModels.set(model, true);
            console.warn(`Model ${model} transcription rejected thinking config (400 / INVALID_ARGUMENT), skipping thinking on retry and subsequent calls.`);
            return executeTranscription(false);
          }
          throw err;
        }
      };

      return await executeTranscription(true);
    });

    const durationMs = Date.now() - startTime;
    return { transcript: result, modelUsed, durationMs };
  } catch (error: any) {
    console.error('Transcription error:', error?.message || error);
    throw new Error('SPEECH_UNAVAILABLE');
  }
}

