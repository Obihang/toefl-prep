import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { GENERATION_CHAIN, EVALUATION_CHAIN, TTS_CHAIN, TRANSCRIBE_CHAIN } from '../constants/models.ts';
import * as CURATED from '../data/curatedQuestions.ts';
import { generateWithFallback } from './geminiUtils.ts';
import { redactKey, isKeyError, isTransientError, getStatus, extractErrorMessage, isQuotaExhaustedError } from './geminiErrors.ts';
import { inferGender } from '../utils/voices.ts';
import { callOpenAiCompatibleChat, testOpenAiCompatible, callOpenAiTts, callWhisperTranscription } from './llmClient.ts';

export type ApiCallOptions = string | { provider?: string; apiKey?: string; baseUrl?: string; model?: string };

export { redactKey, isKeyError, isTransientError, getStatus, extractErrorMessage, isQuotaExhaustedError };

export function parseRateLimitFromError(error: any) {
  let kind: 'per-minute' | 'per-day' | 'unknown' = 'per-minute';
  let retryAfterSeconds = 60;

  const errStr = JSON.stringify(error?.details || error?.message || error || '');
  const lower = errStr.toLowerCase();
  if (lower.includes('perday') || lower.includes('daily') || lower.includes('day')) {
    kind = 'per-day';
    retryAfterSeconds = 3600;
  }

  if (error?.details && Array.isArray(error.details)) {
    for (const detail of error.details) {
      if (detail['@type']?.includes('RetryInfo') && detail.retryDelay) {
        const match = String(detail.retryDelay).match(/([\d.]+)s/);
        if (match) retryAfterSeconds = Math.ceil(parseFloat(match[1]));
      }
      if (detail['@type']?.includes('QuotaFailure')) {
        const violations = detail.violations || [];
        for (const v of violations) {
          const qId = String(v.quotaId || '').toLowerCase();
          if (qId.includes('perday') || qId.includes('daily')) {
            kind = 'per-day';
            retryAfterSeconds = 3600;
          } else if (qId.includes('perminute') || qId.includes('minute')) {
            kind = 'per-minute';
          }
        }
      }
    }
  }

  return { kind, retryAfterSeconds };
}

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
    speakerGenders: z.record(z.string(), z.string()).default({ A: 'female', B: 'male' }),
    script: z.string(),
    questions: z.array(z.object({ q: z.string(), options: z.array(z.string()), answer: z.number(), why: z.string() })),
  }),
  listenRepeat: z.object({
    title: z.string(),
    speakerName: z.string().default('Sarah (student)'),
    speakerGender: z.string().default('female'),
    sentences: z.array(z.string()),
  }),
  speakingInterview: z.object({
    title: z.string(),
    context: z.string(),
    interviewerName: z.string().default('Professor Lee'),
    interviewerGender: z.string().default('male'),
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

  try {
    return JSON.parse(text.trim());
  } catch {}

  let unmarkdown = text.trim();
  if (unmarkdown.includes('```')) {
    unmarkdown = unmarkdown.replace(/```(?:json)?\s*/gi, '').replace(/\s*```/g, '').trim();
    try {
      return JSON.parse(unmarkdown);
    } catch {}
  }

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

  const question = String(data.question || data.instruction || 'Participate in the discussion by responding to the professor and explaining your position.');
  return { title, professorName: profName, professorPrompt: profPrompt, s1: s1Norm, s2: s2Norm, question };
}

function normalizeCompleteWords(data: any) {
  const title = String(data.title || 'Complete the Words');
  const text = String(data.text || data.passage || 'The development of [[modern]] science requires rigorous empirical observation and [[careful]] documentation.');
  const totalBlanks = Number(data.totalBlanks || 10);
  return { title, text, totalBlanks };
}

function normalizeReadingPassage(data: any) {
  const title = String(data.title || 'Reading Comprehension Passage');
  const passage = String(data.passage || 'Academic reading text explaining complex phenomena.');
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
      : ['Option A', 'Option B', 'Option C', 'Option D'];
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
  let speakers: Record<string, string> = { A: 'Sarah (student)', B: 'Professor Lee' };
  if (data.speakers && typeof data.speakers === 'object' && !Array.isArray(data.speakers)) {
    speakers = {
      A: String(data.speakers.A || data.speakers['Speaker A'] || 'Sarah (student)'),
      B: String(data.speakers.B || data.speakers['Speaker B'] || 'Professor Lee'),
    };
  } else if (Array.isArray(data.speakers) && data.speakers.length >= 2) {
    speakers = { A: String(data.speakers[0]), B: String(data.speakers[1]) };
  }

  const speakerGenders = data.speakerGenders || {
    A: inferGender(speakers.A || ''),
    B: inferGender(speakers.B || ''),
  };

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

  return { title, context, speakers, speakerGenders, script, questions };
}

function normalizeListenRepeat(data: any) {
  const title = String(data.title || 'Listen & Repeat Practice');
  const speakerName = String(data.speakerName || 'Sarah (student)');
  const speakerGender = String(data.speakerGender || inferGender(speakerName));
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
  return { title, speakerName, speakerGender, sentences };
}

function normalizeSpeakingInterview(data: any) {
  const title = String(data.title || 'Speaking Interview Practice');
  const context = String(data.context || 'University interview simulation.');
  const interviewerName = String(data.interviewerName || 'Professor Lee');
  const interviewerGender = String(data.interviewerGender || inferGender(interviewerName));
  const rawQs = Array.isArray(data.questions) ? data.questions : [];
  const questions = (rawQs.length > 0 ? rawQs : [{}, {}, {}, {}]).slice(0, 4).map((q: any, idx: number) => ({
    question: String(typeof q === 'string' ? q : (q.question || q.prompt || `Can you describe an academic experience that significantly shaped your interests? (${idx + 1})`)),
    prepTimeSeconds: Number(q.prepTimeSeconds || 20),
    responseTimeSeconds: Number(q.responseTimeSeconds || 45),
    suggestedPoints: Array.isArray(q.suggestedPoints) && q.suggestedPoints.length > 0
      ? q.suggestedPoints.map(String)
      : ['State your main viewpoint clearly', 'Provide a concrete personal or academic example', 'Summarize the significance'],
  }));
  return { title, context, interviewerName, interviewerGender, questions };
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

export async function handleTestApiKey(options?: ApiCallOptions): Promise<{ success: true; message: string; model: string }> {
  const opts = typeof options === 'string' ? { apiKey: options } : options || {};
  let provider = opts.provider || 'gemini';
  const rawKey = (opts.apiKey || (typeof options === 'string' ? options : '')).trim();

  // If provider is gemini or auto, but key clearly belongs to another provider
  if ((provider === 'gemini' || provider === 'auto') && rawKey) {
    if (/^nvapi-/i.test(rawKey)) provider = 'nvidia';
    else if (/^gsk_/.test(rawKey)) provider = 'groq';
    else if (/^sk-or-/i.test(rawKey)) provider = 'openrouter';
    else if (/^sk-/.test(rawKey)) provider = 'openai';
  }

  if (provider !== 'gemini') {
    return testOpenAiCompatible({
      provider,
      apiKey: opts.apiKey,
      baseUrl: opts.baseUrl,
      model: opts.model,
    });
  }

  const apiKey = (opts.apiKey && opts.apiKey.trim()) || process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error('No API key provided. Add yours in Dashboard > Settings & API Key');
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

  return { success: true, message: `Connected to Gemini (${modelUsed})`, model: modelUsed };
}

export async function handleGenerateTask(taskType: string, level: string, topic: string, options?: ApiCallOptions) {
  const opts = typeof options === 'string' ? { apiKey: options } : options || {};
  let provider = opts.provider || 'gemini';
  const customApiKey = (opts.apiKey || '').trim();

  // If provider is gemini or auto, but key clearly belongs to another provider
  if ((provider === 'gemini' || provider === 'auto') && customApiKey) {
    if (/^nvapi-/i.test(customApiKey)) provider = 'nvidia';
    else if (/^gsk_/.test(customApiKey)) provider = 'groq';
    else if (/^sk-or-/i.test(customApiKey)) provider = 'openrouter';
    else if (/^sk-/.test(customApiKey)) provider = 'openai';
  }

  const ai = provider === 'gemini' ? getAiClient(customApiKey) : null;
  
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
        return `You are an official ETS TOEFL test content creator. Create a TOEFL Listening task for level: ${levelDesc}. Topic: ${top}. Requirements: 1. A campus conversation OR a short classroom lecture with real first names and roles for speakers A and B (e.g. {"A": "Sarah (student)", "B": "Professor Lee"}) and speakerGenders: {"A": "female", "B": "male"}. 2. Script must be 120-150 words. 3. Exactly 3 multiple-choice comprehension questions with 4 options each. Return JSON format: {"title": "Listening Context Title", "context": "Brief 1-sentence situation description", "speakers": {"A": "Sarah (student)", "B": "Professor Lee"}, "speakerGenders": {"A": "female", "B": "male"}, "script": "Sarah (student): ...\\nProfessor Lee: ...", "questions": [{"q": "Question prompt?", "options": ["A", "B", "C", "D"], "answer": 0, "why": "Explanation..."}]}`;
      case 'listen-repeat':
        return `You are an official ETS TOEFL test creator. Create a TOEFL Speaking "Listen and Repeat" practice set for level: ${levelDesc}. Topic: ${top}. Return JSON format: {"title": "Listen & Repeat Exercise", "speakerName": "Sarah (student)", "speakerGender": "female", "sentences": ["Sentence 1", "Sentence 2", "Sentence 3", "Sentence 4", "Sentence 5"]}`;
      case 'speaking-interview':
        return `You are an official ETS TOEFL Speaking examiner. Create a TOEFL Speaking "Take an Interview" practice simulation for level: ${levelDesc}. Topic: ${top}. Return JSON format: {"title": "University Interview Simulation", "context": "Context description", "interviewerName": "Professor Lee", "interviewerGender": "male", "questions": [{"question": "Question text...", "prepTimeSeconds": 20, "responseTimeSeconds": 45, "suggestedPoints": ["Point 1", "Point 2"]}]}`;
      case 'build-sentence':
        return `You are an official ETS TOEFL test creator. Create 5 TOEFL Writing "Build a Sentence" (sentence scramble) items for level: ${levelDesc}. Topic: ${top}. Return JSON format: {"title": "Build a Sentence Practice", "items": [{"context": "Context setup line...", "words": ["w1", "w2", "w3", "w4", "w5"], "answer": "The complete correct sentence.", "explanation": "Grammar rule explanation."}]}`;
      case 'write-email':
        return `You are an official ETS TOEFL Writing test designer. Create a TOEFL Writing "Write an Email" prompt for level: ${levelDesc}. Topic: ${top}. Return JSON format: {"title": "Email Task Title", "situation": "Situation description...", "recipient": "Recipient name/office", "goals": ["Goal 1", "Goal 2", "Goal 3"], "suggestedWordCount": "80-120 words"}`;
      case 'academic-discussion':
      default:
        return `You are an official ETS TOEFL Writing test designer. Create a TOEFL Writing "Writing for an Academic Discussion" prompt for level: ${levelDesc}. Topic: ${top}. Return JSON format: {"title": "Academic Discussion Board", "professorName": "Professor Name", "professorPrompt": "Prompt text...", "s1": {"name": "Student A", "text": "Post text..."}, "s2": {"name": "Student B", "text": "Post text..."}, "question": "Instruction text..."}`;
    }
  };

  // If using non-Gemini provider (OpenAI, Groq, DeepSeek, OpenRouter, Custom)
  if (provider !== 'gemini') {
    try {
      const prompt = getPrompt(taskType, level, topic);
      const systemInstruction = 'You are an expert ETS TOEFL test design specialist. Return valid JSON matching the schema only.';
      const { text, modelUsed } = await callOpenAiCompatibleChat({
        provider,
        apiKey: opts.apiKey,
        baseUrl: opts.baseUrl,
        model: opts.model,
        purpose: 'generation',
        prompt: `${systemInstruction}\n\n${prompt}\n\nIMPORTANT: Return valid JSON matching the schema only. Do not wrap in markdown fences.`,
        systemInstruction,
        responseJson: true,
      });

      const parsed = cleanAndExtractJson(text);
      const normalized = normalizeTask(taskType, parsed);
      const result = schema.parse(normalized);
      return { ...result, isFallback: false, modelUsed };
    } catch (error: any) {
      const errMsg = extractErrorMessage(error);
      console.warn(`Failed to generate task with ${provider}, falling back to curated:`, errMsg);
      const curatedKey = curatedMap[taskType] as keyof typeof CURATED;
      const curatedTasks = CURATED[curatedKey] as any[];
      const item = curatedTasks[Math.floor(Math.random() * curatedTasks.length)];
      return {
        ...item,
        isFallback: true,
        fallbackReason: errMsg,
        modelUsed: `Curated ETS (${provider} fallback)`,
      };
    }
  }

  try {
    if (!ai) {
      throw new Error('No API key provided. Add yours in Dashboard > Settings & API Key');
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
    const isQuota = isQuotaExhaustedError(error) || getStatus(error) === 429;
    const rateLimit = isQuota ? parseRateLimitFromError(error) : undefined;
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
      rateLimit,
      fallbackReason: errMsg,
      modelUsed: 'Curated ETS TOEFL Question Bank',
    };
  }
}

export async function handleEvaluateResponse(
  taskType: string,
  promptData: any,
  studentResponse: any,
  options?: ApiCallOptions
) {
  const opts = typeof options === 'string' ? { apiKey: options } : options || {};
  let provider = opts.provider || 'gemini';
  const customApiKey = (opts.apiKey || '').trim();

  // If provider is gemini or auto, but key clearly belongs to another provider
  if ((provider === 'gemini' || provider === 'auto') && customApiKey) {
    if (/^nvapi-/i.test(customApiKey)) provider = 'nvidia';
    else if (/^gsk_/.test(customApiKey)) provider = 'groq';
    else if (/^sk-or-/i.test(customApiKey)) provider = 'openrouter';
    else if (/^sk-/.test(customApiKey)) provider = 'openai';
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

Return valid JSON format:
{
  "bandScore6": 5.0,
  "rawRubricScore": 4.0,
  "scaledScore": 27,
  "feedbackSummary": "Detailed qualitative feedback paragraph...",
  "errors": [
    {"original": "...", "corrected": "...", "explanation": "..."}
  ],
  "exemplarResponse": "Model high-scoring response...",
  "tips": ["Tip 1", "Tip 2", "Tip 3"]
}`;

  // If using non-Gemini provider (OpenAI, Groq, DeepSeek, OpenRouter, Custom)
  if (provider !== 'gemini') {
    const { text, modelUsed } = await callOpenAiCompatibleChat({
      provider,
      apiKey: opts.apiKey,
      baseUrl: opts.baseUrl,
      model: opts.model,
      purpose: 'evaluation',
      prompt: evaluationPrompt,
      systemInstruction: 'You are an official certified ETS TOEFL iBT scoring rater. Return valid JSON only.',
      responseJson: true,
      temperature: 0.3,
    });

    const parsed = cleanAndExtractJson(text);
    const result = z.object({
      bandScore6: z.number(),
      rawRubricScore: z.number(),
      scaledScore: z.number(),
      feedbackSummary: z.string(),
      errors: z.array(z.object({ original: z.string(), corrected: z.string(), explanation: z.string() })),
      exemplarResponse: z.string(),
      tips: z.array(z.string()),
    }).parse(parsed);

    return { ...result, modelUsed };
  }

  const ai = getAiClient(customApiKey);
  if (!ai) {
    throw new Error('No API key provided. Add yours in Dashboard > Settings & API Key');
  }

  const { result, modelUsed } = await generateWithFallback(ai, EVALUATION_CHAIN, async (model) => {
    const thinkingConfig = getModelThinkingConfig(model, 'evaluation');
    const response = await ai.models.generateContent({
      model,
      contents: evaluationPrompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.3,
        ...(thinkingConfig ? { thinkingConfig } : {}),
      } as any,
    });

    const rawText = response.text || response.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
    const parsed = cleanAndExtractJson(rawText);
    return z.object({
      bandScore6: z.number(),
      rawRubricScore: z.number(),
      scaledScore: z.number(),
      feedbackSummary: z.string(),
      errors: z.array(z.object({ original: z.string(), corrected: z.string(), explanation: z.string() })),
      exemplarResponse: z.string(),
      tips: z.array(z.string()),
    }).parse(parsed);
  });

  return { ...result, modelUsed };
}

export async function handleSynthesizeSpeech(
  text: string,
  voiceName: string = 'Kore',
  options?: ApiCallOptions
) {
  const opts = typeof options === 'string' ? { apiKey: options } : options || {};
  let provider = opts.provider || 'gemini';
  const customApiKey = (opts.apiKey || (typeof options === 'string' ? options : '')).trim();

  // If OpenAI key, utilize OpenAI TTS API directly
  if (provider === 'openai' && customApiKey) {
    try {
      const res = await callOpenAiTts({ apiKey: customApiKey, text, voiceName });
      return res;
    } catch (err: any) {
      console.warn('OpenAI TTS failed, falling back to Gemini/browser:', err?.message || err);
    }
  }

  const ai = getAiClient(customApiKey);
  if (!ai) {
    throw new Error('SPEECH_UNAVAILABLE');
  }

  const validVoices = [
    'Achernar', 'Aoede', 'Autonoe', 'Callirrhoe', 'Despina', 'Erinome', 'Gacrux', 'Kore', 'Laomedeia', 'Leda', 'Pulcherrima', 'Sulafat', 'Vindemiatrix', 'Zephyr',
    'Achird', 'Algenib', 'Algieba', 'Alnilam', 'Charon', 'Enceladus', 'Fenrir', 'Iapetus', 'Orus', 'Puck', 'Rasalgethi', 'Sadachbia', 'Sadaltager', 'Schedar', 'Umbriel', 'Zubenelgenubi'
  ];

  const resolvedVoice = validVoices.includes(voiceName) ? voiceName : 'Kore';

  const { result, modelUsed } = await generateWithFallback(ai, TTS_CHAIN, async (model) => {
    const interaction = await ai.interactions.create({
      model,
      input: [
        {
          type: "text",
          text: `Please read the following text aloud naturally:\n${text}`,
        },
      ],
      response_format: { type: "audio" },
      generation_config: {
        speech_config: [
          {
            language: "en-US",
            voice: resolvedVoice,
          },
        ],
      },
    });

    const audio = interaction.output_audio;
    if (!audio?.data) {
      throw new Error('No audio data returned from model');
    }
    return { audioBase64: audio.data, mimeType: audio.mime_type || 'audio/wav' };
  });

  return { audioBase64: result.audioBase64, mimeType: result.mimeType, modelUsed };
}

export async function handleTranscribeAudio(
  audioBase64: string,
  mimeType: string = 'audio/webm',
  options?: ApiCallOptions
) {
  const opts = typeof options === 'string' ? { apiKey: options } : options || {};
  let provider = opts.provider || 'gemini';
  const customApiKey = (opts.apiKey || (typeof options === 'string' ? options : '')).trim();

  // If Groq or OpenAI key, utilize native Whisper transcription
  if ((provider === 'groq' || provider === 'openai') && customApiKey) {
    try {
      const startTime = Date.now();
      const res = await callWhisperTranscription({
        provider,
        apiKey: customApiKey,
        audioBase64,
        mimeType,
      });
      return { transcript: res.transcript, modelUsed: res.modelUsed, durationMs: Date.now() - startTime };
    } catch (err: any) {
      console.warn(`${provider.toUpperCase()} Whisper transcription failed, checking Gemini fallback:`, err?.message || err);
    }
  }

  const ai = getAiClient(customApiKey);
  if (!ai) {
    throw new Error('SPEECH_UNAVAILABLE');
  }

  const startTime = Date.now();
  const { result, modelUsed } = await generateWithFallback(ai, TRANSCRIBE_CHAIN, async (model) => {
    const thinkingConfig = getModelThinkingConfig(model, 'transcribe');
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          inlineData: {
            mimeType: mimeType || 'audio/webm',
            data: audioBase64,
          },
        },
        {
          text: 'Transcribe the spoken speech in this audio accurately. Return only the exact transcribed transcript text with no extra commentary, quotation marks, or notes.',
        },
      ],
      config: {
        temperature: 0.1,
        maxOutputTokens: 2048,
        ...(thinkingConfig ? { thinkingConfig } : {}),
      } as any,
    });

    const transcript = response.text || response.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
    return { transcript: transcript.trim() };
  });

  const durationMs = Date.now() - startTime;
  return { transcript: result.transcript, modelUsed, durationMs };
}
