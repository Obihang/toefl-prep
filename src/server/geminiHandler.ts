import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { resolveModelChains } from './modelRoles.ts';
import * as CURATED from '../data/curatedQuestions.ts';
import { ACADEMIC_GLOSSARY } from '../utils/academicGlossary.ts';
import { generateWithFallback } from './geminiUtils.ts';
import { redactKey, isKeyError, isTransientError, getStatus, extractErrorMessage, isQuotaExhaustedError, redactSensitiveInfo } from './geminiErrors.ts';
import { inferGender } from '../utils/voices.ts';
import { callOpenAiCompatibleChat, testOpenAiCompatible, callOpenAiTts, callOpenRouterTts, callWhisperTranscription } from './llmClient.ts';
import { callChatWithHealing } from './chatHealing.ts';
import { callGroqSpeech } from './groqSpeech.ts';
import { callAudio8Speech } from './audio8Speech.ts';
import { wrapWavHeaderIfNeeded, parseSampleRateFromMime } from '../utils/audioHelpers.ts';

export type ApiCallOptions = string | { provider?: string; apiKey?: string; baseUrl?: string; model?: string; sttModel?: string; ttsModel?: string; voiceApiKey?: string; ttsProvider?: string; audio8Url?: string; prompt?: string };

export { redactKey, isKeyError, isTransientError, getStatus, extractErrorMessage, isQuotaExhaustedError, redactSensitiveInfo };

export function parseRateLimitFromError(error: any) {
  let kind: 'per-minute' | 'per-day' | 'unknown' = 'per-minute';
  let retryAfterSeconds = 25;

  const errStr = JSON.stringify(error?.details || error?.message || error || '');
  const lower = errStr.toLowerCase();

  // Extract explicit retry seconds if mentioned in message (e.g. "try again in 12s", "retry after 20 seconds")
  const secMatch = errStr.match(/(\d+)\s*(?:s|sec|seconds|second)\b/i);
  if (secMatch) {
    retryAfterSeconds = Math.max(5, parseInt(secMatch[1], 10));
  }

  if (/(per[-_ ]?day|daily[-_ ]quota|daily[-_ ]limit|generate_content_free_tier_requests|resets at midnight pt)/i.test(errStr)) {
    kind = 'per-day';
    retryAfterSeconds = 1800;
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
            retryAfterSeconds = 1800;
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
  transcribe?: { thinkingBudget: number };
  evaluation?: { thinkingLevel?: string; thinkingBudget?: number };
}

// Verified model thinking specifications chosen per model
export const VERIFIED_MODEL_THINKING_CONFIGS: Record<string, ModelThinkingConfig> = {
  'gemini-3.8-flash': {
    evaluation: { thinkingBudget: 256 },
  },
  'gemini-3.5-flash-lite': {
    evaluation: { thinkingBudget: 256 },
  },
};

export function getModelThinkingConfig(
  model: string,
  mode: 'transcribe' | 'evaluation'
): { thinkingLevel?: string; thinkingBudget?: number } | null {
  if (mode === 'transcribe') {
    return null; // Transcription does not need thinking tokens
  }
  if (rejectedThinkingModels.get(model)) {
    return null;
  }
  const config = VERIFIED_MODEL_THINKING_CONFIGS[model];
  if (config) {
    return config.evaluation || null;
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
  vocabularyExplanation: z.object({
    word: z.string(),
    phonetic: z.string().optional().default(''),
    meanings: z.array(z.object({
      partOfSpeech: z.string(),
      definition: z.string(),
      example: z.string().optional().default(''),
    })),
    examples: z.array(z.string()).optional().default([]),
    synonyms: z.array(z.string()).optional().default([]),
  }),
};

export function cleanAndExtractJson(text: string): any {
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
        let repair = objMatch[0].replace(/,\s*([\}\]])/g, '$1');
        
        // Count braces to repair truncation
        let open = (repair.match(/\{/g) || []).length;
        let closed = (repair.match(/\}/g) || []).length;
        while (open > closed) {
          repair += '}';
          closed++;
        }
        
        return JSON.parse(repair);
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
  if (!data || typeof data !== 'object') throw new Error('AI response is not an object');
  const title = String(data.title || 'Writing for an Academic Discussion');
  const profName = String(data.professorName || data.professor_name || data.professor?.name || 'Dr. Henderson');
  const profPrompt = String(data.professorPrompt || data.professor_prompt || data.professor?.prompt || data.prompt || data.context || '');
  if (!profPrompt || profPrompt.trim().length < 10) {
    throw new Error('AI response missing valid professor discussion prompt');
  }
  
  let s1 = data.s1 || data.student1 || (Array.isArray(data.students) ? data.students[0] : null);
  let s2 = data.s2 || data.student2 || (Array.isArray(data.students) ? data.students[1] : null);

  const s1Text = String((typeof s1 === 'object' ? (s1?.text || s1?.post || s1?.response || s1?.content) : (typeof s1 === 'string' ? s1 : '')) || '');
  const s2Text = String((typeof s2 === 'object' ? (s2?.text || s2?.post || s2?.response || s2?.content) : (typeof s2 === 'string' ? s2 : '')) || '');

  if (!s1Text || !s2Text) {
    throw new Error('AI response missing student discussion posts');
  }

  const s1Norm = {
    name: String((typeof s1 === 'object' ? (s1?.name || s1?.student || s1?.studentName) : null) || 'Student A'),
    text: s1Text,
  };
  const s2Norm = {
    name: String((typeof s2 === 'object' ? (s2?.name || s2?.student || s2?.studentName) : null) || 'Student B'),
    text: s2Text,
  };

  const question = String(data.question || data.instruction || 'Participate in the discussion by responding to the professor and explaining your position.');
  return { title, professorName: profName, professorPrompt: profPrompt, s1: s1Norm, s2: s2Norm, question };
}

function normalizeCompleteWords(data: any) {
  if (!data || typeof data !== 'object') throw new Error('AI response is not an object');
  const title = String(data.title || 'Complete the Words').trim();
  if (!title) throw new Error('Complete the Words missing title');
  const text = String(data.text || '').trim();
  if (!text || !text.includes('[[') || !text.includes(']]')) {
    throw new Error('AI response missing valid [[masked]] word blanks in text');
  }
  const blankMatches = text.match(/\[\[/g) || [];
  if (blankMatches.length < 3) {
    throw new Error(`Complete the Words generated insufficient blanks (${blankMatches.length}), at least 3 required`);
  }
  // The actual [[masked]] words in the text define the true blank count.
  // We reconcile totalBlanks to blankMatches.length so mismatching totalBlanks never crashes valid generation.
  const totalBlanks = blankMatches.length;
  return { title, text, totalBlanks };
}

function normalizeReadingPassage(data: any) {
  if (!data || typeof data !== 'object') throw new Error('AI response is not an object');
  const title = String(data.title || 'Reading Comprehension Passage');
  const passage = String(data.passage || '');
  if (!passage || passage.trim().length < 30) {
    throw new Error('AI response missing valid reading passage text');
  }

  const rawQs = Array.isArray(data.questions) ? data.questions : [];
  if (rawQs.length !== 3) {
    throw new Error(`Reading comprehension requires exactly 3 questions (received ${rawQs.length})`);
  }

  const questions = rawQs.map((q: any, idx: number) => {
    if (!q || typeof q !== 'object') throw new Error(`Question ${idx + 1} is invalid`);
    const qText = String(q.q || q.question || '').trim();
    if (!qText) throw new Error(`Question ${idx + 1} missing question text`);

    const options = Array.isArray(q.options) ? q.options.map(String).filter(Boolean) : [];
    if (options.length !== 4) {
      throw new Error(`Question ${idx + 1} must have exactly 4 options (received ${options.length})`);
    }

    let answer = q.answer;
    if (typeof answer === 'string') {
      const char = answer.trim().toLowerCase();
      const mapped = ['a', 'b', 'c', 'd'].indexOf(char);
      answer = mapped !== -1 ? mapped : parseInt(char, 10);
    }

    if (typeof answer !== 'number' || isNaN(answer) || answer < 0 || answer > 3) {
      throw new Error(`Question ${idx + 1} contains invalid correct answer index (${q.answer}), must be 0-3`);
    }

    return {
      q: qText,
      options,
      answer,
      why: String(q.why || q.explanation || q.reason || 'Accurately supported by passage evidence.'),
    };
  });

  return { title, passage, questions };
}

function normalizeListeningDialogue(data: any) {
  if (!data || typeof data !== 'object') throw new Error('AI response is not an object');
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

  const script = String(data.script || data.dialogue || data.text || '').trim();
  if (!script || script.length < 20) {
    throw new Error('AI response missing valid listening audio script');
  }

  const rawQs = Array.isArray(data.questions) ? data.questions : [];
  if (rawQs.length !== 3) {
    throw new Error(`Listening comprehension requires exactly 3 questions (received ${rawQs.length})`);
  }

  const questions = rawQs.map((q: any, idx: number) => {
    if (!q || typeof q !== 'object') throw new Error(`Question ${idx + 1} is invalid`);
    const qText = String(q.q || q.question || '').trim();
    if (!qText) throw new Error(`Question ${idx + 1} missing question text`);

    const options = Array.isArray(q.options) ? q.options.map(String).filter(Boolean) : [];
    if (options.length !== 4) {
      throw new Error(`Question ${idx + 1} must have exactly 4 options (received ${options.length})`);
    }

    let answer = q.answer;
    if (typeof answer === 'string') {
      const char = answer.trim().toLowerCase();
      const mapped = ['a', 'b', 'c', 'd'].indexOf(char);
      answer = mapped !== -1 ? mapped : parseInt(char, 10);
    }

    if (typeof answer !== 'number' || isNaN(answer) || answer < 0 || answer > 3) {
      throw new Error(`Question ${idx + 1} contains invalid correct answer index (${q.answer}), must be 0-3`);
    }

    return {
      q: qText,
      options,
      answer,
      why: String(q.why || q.explanation || q.reason || 'Supported by dialogue.'),
    };
  });

  return { title, context, speakers, speakerGenders, script, questions };
}

function normalizeListenRepeat(data: any) {
  if (!data || typeof data !== 'object') throw new Error('AI response is not an object');
  const title = String(data.title || 'Listen & Repeat Practice');
  const speakerName = String(data.speakerName || 'Sarah (student)');
  const speakerGender = String(data.speakerGender || inferGender(speakerName));
  let sentences = Array.isArray(data.sentences) ? data.sentences.map(String).filter(Boolean) : [];
  if (sentences.length === 0 && Array.isArray(data.items)) {
    sentences = data.items.map((it: any) => String(typeof it === 'string' ? it : it.sentence || it.text || '')).filter(Boolean);
  }
  if (sentences.length === 0) {
    throw new Error('AI response missing sentences array');
  }
  return { title, speakerName, speakerGender, sentences };
}

function normalizeSpeakingInterview(data: any) {
  if (!data || typeof data !== 'object') throw new Error('AI response is not an object');
  const title = String(data.title || '').trim();
  if (!title) throw new Error('Speaking Interview missing title');
  const context = String(data.context || '').trim();
  if (!context) throw new Error('Speaking Interview missing context');
  const interviewerName = String(data.interviewerName || '').trim();
  if (!interviewerName) throw new Error('Speaking Interview missing interviewerName');
  const interviewerGender = String(data.interviewerGender || inferGender(interviewerName));
  const rawQs = Array.isArray(data.questions) ? data.questions : [];
  if (rawQs.length === 0) {
    throw new Error('Speaking interview requires at least 1 question');
  }

  // If fewer than 4 questions, duplicate or pad with follow-up questions
  while (rawQs.length < 4 && rawQs.length > 0) {
    const lastQ = rawQs[rawQs.length - 1];
    rawQs.push({
      ...lastQ,
      question: `${lastQ.question || lastQ.prompt || 'Could you elaborate further on this aspect?'} (Follow-up)`,
    });
  }

  // If more than 4, slice to 4
  const activeQs = rawQs.slice(0, 4);

  const questions = activeQs.map((q: any, idx: number) => {
    if (!q || typeof q !== 'object') throw new Error(`Interview question ${idx + 1} is invalid`);
    const qText = String(q.question || q.prompt || '').trim();
    if (!qText) throw new Error(`Interview question ${idx + 1} missing text`);
    const prepTime = Number(q.prepTimeSeconds) || 15;
    const respTime = Number(q.responseTimeSeconds) || 45;
    const suggestedPoints = Array.isArray(q.suggestedPoints) && q.suggestedPoints.length > 0
      ? q.suggestedPoints.map(String).filter(Boolean)
      : ['Provide clear examples', 'Support your viewpoint'];
    return {
      question: qText,
      prepTimeSeconds: prepTime,
      responseTimeSeconds: respTime,
      suggestedPoints,
    };
  });
  return { title, context, interviewerName, interviewerGender, questions };
}

function normalizeBuildSentence(data: any) {
  if (!data || typeof data !== 'object') throw new Error('AI response is not an object');
  const title = String(data.title || '').trim();
  if (!title) throw new Error('Build a Sentence missing title');
  const rawItems = Array.isArray(data.items) ? data.items : [];
  if (rawItems.length !== 5) {
    throw new Error(`Build a sentence requires exactly 5 items (received ${rawItems.length})`);
  }
  const items = rawItems.map((it: any, idx: number) => {
    if (!it || typeof it !== 'object') throw new Error(`Build sentence item ${idx + 1} is invalid`);
    const context = String(it.context || '').trim();
    if (!context) throw new Error(`Build sentence item ${idx + 1} missing context`);
    const words = Array.isArray(it.words) ? it.words.map(String).filter(Boolean) : [];
    if (words.length < 2) {
      throw new Error(`Build sentence item ${idx + 1} must have at least 2 words`);
    }
    const answer = String(it.answer || '').trim();
    if (!answer) {
      throw new Error(`Build sentence item ${idx + 1} missing correct sentence answer`);
    }
    const explanation = String(it.explanation || '').trim();
    if (!explanation) {
      throw new Error(`Build sentence item ${idx + 1} missing explanation`);
    }
    return { context, words, answer, explanation };
  });
  return { title, items };
}

function normalizeWriteEmail(data: any) {
  if (!data || typeof data !== 'object') throw new Error('AI response is not an object');
  const title = String(data.title || '').trim();
  if (!title) throw new Error('Write an Email missing title');
  const situation = String(data.situation || '').trim();
  if (!situation || situation.length < 15) {
    throw new Error('Write an Email missing valid situation description');
  }
  const recipient = String(data.recipient || '').trim();
  if (!recipient) {
    throw new Error('Write an Email missing recipient');
  }
  const goals = Array.isArray(data.goals) ? data.goals.map(String).filter(Boolean) : [];
  if (goals.length === 0) {
    throw new Error('Write an Email must have at least 1 goal');
  }
  const suggestedWordCount = String(data.suggestedWordCount || '').trim();
  if (!suggestedWordCount) {
    throw new Error('Write an Email missing suggestedWordCount');
  }
  return { title, situation, recipient, goals, suggestedWordCount };
}

function normalizeVocabularyExplanation(data: any): any {
  const word = String(data.word || '').trim();
  const phonetic = String(data.phonetic || '').trim();
  const rawMeanings = Array.isArray(data.meanings) ? data.meanings : [];
  const meanings = rawMeanings.map((m: any) => ({
    partOfSpeech: String(m.partOfSpeech || 'noun').toLowerCase().trim(),
    definition: String(m.definition || '').trim(),
    example: String(m.example || '').trim(),
  })).filter((m: any) => m.definition.length > 0);

  if (meanings.length === 0 && data.definition) {
    meanings.push({
      partOfSpeech: String(data.partOfSpeech || 'noun').toLowerCase().trim(),
      definition: String(data.definition).trim(),
      example: String(data.example || '').trim(),
    });
  }

  const examples = Array.isArray(data.examples)
    ? data.examples.map((e: any) => String(e).trim()).filter(Boolean)
    : (meanings[0]?.example ? [meanings[0].example] : []);

  const synonyms = Array.isArray(data.synonyms)
    ? data.synonyms.map((s: any) => String(s).trim()).filter(Boolean)
    : [];

  return {
    word: word || 'word',
    phonetic,
    meanings: meanings.length > 0 ? meanings : [{ partOfSpeech: 'noun', definition: 'Definition unavailable', example: '' }],
    examples,
    synonyms,
  };
}

export function normalizeTask(taskType: string, data: any): any {
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
      return normalizeAcademicDiscussion(data);
    case 'vocabulary_explanation':
    case 'vocabulary-explanation':
      return normalizeVocabularyExplanation(data);
    default:
      throw new Error(`Unknown task type: ${taskType}`);
  }
}

export function getAiClient(customApiKey?: string) {
  let apiKey = '';
  if (customApiKey && customApiKey.trim()) {
    const trimmed = customApiKey.trim();
    if (/^(AIza|AQ\.)/i.test(trimmed)) {
      apiKey = trimmed;
    } else if (/^(gsk_|nvapi-|sk-or-|sk-proj-|sk-admin-|xai-|sk-ant-|ds-)/i.test(trimmed)) {
      // Key belongs to a third-party provider (Groq, NVIDIA, OpenRouter, OpenAI, etc.)
      apiKey = process.env.GEMINI_API_KEY || '';
    } else {
      apiKey = trimmed;
    }
  } else {
    apiKey = process.env.GEMINI_API_KEY || '';
  }

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

export async function handleTestApiKey(options?: ApiCallOptions): Promise<{
  success: true;
  message: string;
  model: string;
  provider?: string;
  providerName?: string;
  generationModel?: string;
  evaluationModel?: string;
}> {
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

  const chains = await resolveModelChains('gemini', apiKey.trim());
  const customModel =
    opts.model && opts.model.trim() && opts.model !== 'Auto-Routed by Purpose' && opts.model !== 'Auto-Optimized'
      ? opts.model.trim()
      : null;
  const chain = customModel ? [customModel, ...chains.generation] : chains.generation;

  const ai = new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const { modelUsed } = await generateWithFallback(ai, chain, async (model) => {
    await ai.models.generateContent({
      model,
      contents: 'Reply with the single word OK',
      config: {
        temperature: 0.1,
      },
    });
    return true;
  });

  const genModel = chains.generation[0] || modelUsed;
  const evalModel = chains.evaluation[0] || genModel;

  return {
    success: true,
    provider: 'gemini',
    providerName: 'Google Gemini',
    message: `Connected to Google Gemini. Generation model: ${genModel}, Evaluation model: ${evalModel}.`,
    model: modelUsed,
    generationModel: genModel,
    evaluationModel: evalModel,
  };
}

export async function handleGenerateTask(taskType: string, level: string, topic: string, options?: ApiCallOptions, promptData?: any) {
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
    'vocabulary_explanation': 'vocabularyExplanation',
    'vocabulary-explanation': 'vocabularyExplanation',
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

  const schemaKey = taskMap[taskType];
  if (!schemaKey) {
    throw new Error(`Unknown task type: ${taskType}`);
  }
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
        return `You are an official ETS TOEFL test content creator. Create an authentic TOEFL Reading "Complete the Words" (C-Test) item for a student at level: ${levelDesc}. Topic: ${top}. Requirements: 1. Write an academic paragraph of 75-90 words. 2. In the paragraph, select between 8 to 10 academic/content words (4 letters or more, starting from the second sentence, spaced out). 3. In the text, wrap the second half (or slightly more than half if odd length) of each chosen word in [[brackets]], leaving the first half visible outside. Return JSON format: {"title": "Short Academic Topic Title", "text": "The full paragraph with [[...]] wrapping the missing letters only", "totalBlanks": 10}`;
      case 'reading-passage':
        return `You are an official ETS TOEFL test content creator. Create an authentic TOEFL Reading Academic Passage with 3 multiple-choice questions for level: ${levelDesc}. Topic: ${top}. Requirements: 1. Academic passage between 160-200 words. 2. Exactly 3 multiple-choice questions: Main idea, Detail, Vocabulary/Inference. Return JSON format: {"title": "Passage Title", "passage": "Passage text...", "questions": [{"q": "Question prompt?", "options": ["A", "B", "C", "D"], "answer": 0, "why": "Explanation..."}]}`;
      case 'listening-dialogue':
        return `You are an official ETS TOEFL test content creator. Create a TOEFL Listening task for level: ${levelDesc}. Topic: ${top}. Requirements: 1. A campus conversation OR a short classroom lecture with realistic first names and parenthetical gender tags for speakers (e.g. "Sarah (Female)", "Mark (Male)", "Prof. Davis (Male)"). 2. Format every script line with the speaker name and gender tag at the start of the line, e.g. "Sarah (Female): Hello Professor." or "Prof. Davis (Male): Welcome, Sarah." 3. Script must be 120-150 words. 4. Exactly 3 multiple-choice comprehension questions with 4 options each. Return JSON format: {"title": "Listening Context Title", "context": "Brief 1-sentence situation description", "speakers": {"A": "Sarah (student)", "B": "Prof. Davis"}, "speakerGenders": {"A": "female", "B": "male"}, "script": "Sarah (Female): ...\\nProf. Davis (Male): ...", "questions": [{"q": "Question prompt?", "options": ["A", "B", "C", "D"], "answer": 0, "why": "Explanation..."}]}`;
      case 'listen-repeat':
        return `You are an official ETS TOEFL test creator. Create a TOEFL Speaking "Listen and Repeat" practice set for level: ${levelDesc}. Topic: ${top}. Format speakerName with realistic first name and gender tag e.g. "Sarah (Female)" or "Mark (Male)". Return JSON format: {"title": "Listen & Repeat Exercise", "speakerName": "Sarah (Female)", "speakerGender": "female", "sentences": ["Sentence 1", "Sentence 2", "Sentence 3", "Sentence 4", "Sentence 5"]}`;
      case 'speaking-interview':
        return `You are an official ETS TOEFL Speaking examiner. Create a TOEFL Speaking "Take an Interview" practice simulation for level: ${levelDesc}. Topic: ${top}. Format interviewerName with realistic name and gender tag e.g. "Prof. Lee (Male)" or "Dr. Patel (Female)". Return JSON format: {"title": "University Interview Simulation", "context": "Context description", "interviewerName": "Prof. Lee (Male)", "interviewerGender": "male", "questions": [{"question": "Question text...", "prepTimeSeconds": 20, "responseTimeSeconds": 45, "suggestedPoints": ["Point 1", "Point 2"]}]}`;
      case 'build-sentence':
        return `You are an official ETS TOEFL test creator. Create 5 TOEFL Writing "Build a Sentence" (sentence scramble) items for level: ${levelDesc}. Topic: ${top}. Return JSON format: {"title": "Build a Sentence Practice", "items": [{"context": "Context setup line...", "words": ["w1", "w2", "w3", "w4", "w5"], "answer": "The complete correct sentence.", "explanation": "Grammar rule explanation."}]}`;
      case 'write-email':
        return `You are an official ETS TOEFL Writing test designer. Create a TOEFL Writing "Write an Email" prompt for level: ${levelDesc}. Topic: ${top}. Return JSON format: {"title": "Email Task Title", "situation": "Situation description...", "recipient": "Recipient name/office", "goals": ["Goal 1", "Goal 2", "Goal 3"], "suggestedWordCount": "80-120 words"}`;
      case 'vocabulary_explanation':
      case 'vocabulary-explanation': {
        const targetWord = promptData?.word || top || 'word';
        const sentenceContext = promptData?.context || '';
        return `You are an expert English lexicographer and official TOEFL vocabulary instructor.
Provide the precise modern academic definition and grammatical explanation for the word "${targetWord}" in the context of this sentence: "${sentenceContext}".
Requirements:
1. Identify the exact part of speech used in the context sentence (e.g. "adjective", "verb", "noun", "adverb"). Note: If the word modifies a noun (e.g. "academic topic"), it is an "adjective".
2. Provide a modern, TOEFL-level definition explaining how the word is used in this specific context sentence. NEVER return archaic, historical, or ancient definitions (such as references to Plato, Platonists, sects, or obsolete meanings).
3. Provide 2 authentic, high-quality modern example sentences demonstrating this exact usage.
4. If the word has other common modern meanings, include them in the meanings array.
5. Provide 2-4 academic synonyms.
Return valid JSON matching this schema:
{
  "word": "${targetWord}",
  "phonetic": "/.../",
  "meanings": [
    {
      "partOfSpeech": "adjective",
      "definition": "Relating to education, study, or scholarship at a college or university",
      "example": "She excelled in her academic pursuits and was awarded a scholarship."
    }
  ],
  "examples": [
    "The university maintains rigorous academic standards.",
    "They discussed several academic topics during the seminar."
  ],
  "synonyms": ["scholarly", "educational", "intellectual", "pedagogical"]
}`;
      }
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
      const { text, modelUsed } = await callChatWithHealing({
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
      const errMsg = extractErrorMessage(error, provider);
      if (!isKeyError(error)) {
        console.warn(`Failed to generate task with ${provider}, falling back to curated:`, errMsg);
      } else {
        console.info(`Using authentic curated ETS item for ${taskType} (${errMsg})`);
      }
      if (taskType === 'vocabulary_explanation' || taskType === 'vocabulary-explanation') {
        const targetWord = promptData?.word || topic || 'word';
        const cleanW = targetWord.toLowerCase().trim();
        const glossaryEntry = ACADEMIC_GLOSSARY[cleanW];
        if (glossaryEntry) {
          return {
            word: targetWord,
            phonetic: '',
            meanings: [{
              partOfSpeech: glossaryEntry.partOfSpeech || 'adjective',
              definition: glossaryEntry.definition,
              example: promptData?.context || '',
            }],
            examples: promptData?.context ? [promptData.context] : [],
            synonyms: glossaryEntry.synonyms || [],
            isFallback: false,
            modelUsed: 'Academic Glossary',
          };
        }
        const isAdj = /\b\w+(ic|al|ive|ous|less|able|ible|ful|ial|ical)\b/i.test(targetWord);
        const isV = targetWord.endsWith('ing') || targetWord.endsWith('ed');
        const pos = isAdj ? 'adjective' : isV ? 'verb' : 'noun';
        return {
          word: targetWord,
          phonetic: '',
          meanings: [{
            partOfSpeech: pos,
            definition: isAdj ? `Relating to or characterized by ${targetWord}` : `Pertaining to ${targetWord}`,
            example: promptData?.context || '',
          }],
          examples: promptData?.context ? [promptData.context] : [],
          synonyms: [],
          isFallback: true,
          modelUsed: `Local fallback (${provider})`,
        };
      }
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

    const chains = await resolveModelChains('gemini', customApiKey || process.env.GEMINI_API_KEY || '');
    const { result, modelUsed } = await generateWithFallback(ai, chains.generation, async (model) => {
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
        console.warn(`Model ${model} JSON mime attempt failed, retrying plain contents:`, redactSensitiveInfo(firstErr?.message || firstErr));
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
    // Fallback Waterfall: Gemini -> Groq -> Local Heuristic Fallback
    const groqKey = ((opts as any)?.groqKey || (opts as any)?.groqApiKey || process.env.GROQ_API_KEY || '').trim();
    if (groqKey && (provider as string) !== 'groq') {
      try {
        const prompt = getPrompt(taskType, level, topic);
        const systemInstruction = 'You are an expert ETS TOEFL test design specialist. Return valid JSON matching the schema only.';
        const { text, modelUsed } = await callChatWithHealing({
          provider: 'groq',
          apiKey: groqKey,
          purpose: 'generation',
          prompt: `${systemInstruction}\n\n${prompt}\n\nIMPORTANT: Return valid JSON matching the schema only. Do not wrap in markdown fences.`,
          systemInstruction,
          responseJson: true,
        });
        const parsed = cleanAndExtractJson(text);
        const normalized = normalizeTask(taskType, parsed);
        return { ...schema.parse(normalized), isFallback: false, modelUsed: `Groq fallback (${modelUsed})` };
      } catch (groqErr) {
        console.warn('Groq generation fallback failed, continuing to local heuristic fallback:', groqErr);
      }
    }

    const isQuota = isQuotaExhaustedError(error) || getStatus(error) === 429;
    const rateLimit = isQuota ? parseRateLimitFromError(error) : undefined;
    const errMsg = extractErrorMessage(error, provider);
    if (!isQuota && !isKeyError(error)) {
      console.warn(`Failed to generate task ${taskType}, falling back to curated:`, errMsg);
    } else {
      console.info(`Using authentic curated ETS item for ${taskType} (${errMsg})`);
    }
    if (taskType === 'vocabulary_explanation' || taskType === 'vocabulary-explanation') {
      const targetWord = promptData?.word || topic || 'word';
      const cleanW = targetWord.toLowerCase().trim();
      const glossaryEntry = ACADEMIC_GLOSSARY[cleanW];
      if (glossaryEntry) {
        return {
          word: targetWord,
          phonetic: '',
          meanings: [{
            partOfSpeech: glossaryEntry.partOfSpeech || 'adjective',
            definition: glossaryEntry.definition,
            example: promptData?.context || '',
          }],
          examples: promptData?.context ? [promptData.context] : [],
          synonyms: glossaryEntry.synonyms || [],
          isFallback: false,
          modelUsed: 'Academic Glossary',
        };
      }
      const isAdj = /\b\w+(ic|al|ive|ous|less|able|ible|ful|ial|ical)\b/i.test(targetWord);
      const isV = targetWord.endsWith('ing') || targetWord.endsWith('ed');
      const pos = isAdj ? 'adjective' : isV ? 'verb' : 'noun';
      return {
        word: targetWord,
        phonetic: '',
        meanings: [{
          partOfSpeech: pos,
          definition: isAdj ? `Relating to or characterized by ${targetWord}` : `Pertaining to ${targetWord}`,
          example: promptData?.context || '',
        }],
        examples: promptData?.context ? [promptData.context] : [],
        synonyms: [],
        isFallback: true,
        modelUsed: 'Local fallback',
      };
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

export { handleEvaluateResponse } from './evaluationHandler.ts';

function addWavHeader(pcmBuffer: Buffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): Buffer {
  return wrapWavHeaderIfNeeded(pcmBuffer, sampleRate, numChannels, bitsPerSample);
}

export async function handleSynthesizeSpeech(
  text: string,
  voiceName: string = 'Kore',
  options?: ApiCallOptions
) {
  const opts = typeof options === 'string' ? { apiKey: options } : options || {};
  let provider = opts.provider || 'gemini';
  const customApiKey = (opts.apiKey || (typeof options === 'string' ? options : '')).trim();

  // Check if Audio8-TTS provider requested
  if (provider === 'audio8' || (opts as any).ttsProvider === 'audio8' || (opts as any).audio8Url) {
    const audio8Url = (opts as any).audio8Url || opts.baseUrl || process.env.AUDIO8_TTS_URL || 'http://localhost:8000';
    try {
      const res = await callAudio8Speech({
        baseUrl: audio8Url,
        apiKey: customApiKey,
        text,
        voiceName,
      });
      return res;
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('401') || msg.includes('UNAUTHORIZED')) {
        throw new Error('TTS_INVALID_CREDENTIALS');
      }
      throw new Error(`Audio8-TTS service error: ${msg}`);
    }
  }

  // If OpenRouter key, utilize OpenRouter TTS API directly (/api/v1/audio/speech)
  if (provider === 'openrouter' && customApiKey) {
    try {
      const res = await callOpenRouterTts({
        apiKey: customApiKey,
        text,
        voiceName,
        model: opts.ttsModel,
      });
      return res;
    } catch (err: any) {
      if (err?.status === 401 || err?.message?.includes('401')) {
        throw new Error('TTS_INVALID_CREDENTIALS');
      }
      if (err?.status === 429 || err?.message?.includes('429')) {
        throw new Error('TTS_QUOTA_EXCEEDED');
      }
      throw new Error(`OpenRouter TTS failed: ${err?.message || 'SPEECH_UNAVAILABLE'}`);
    }
  }

  // If Groq key, utilize Groq TTS API directly
  if (provider === 'groq' && customApiKey) {
    try {
      let ttsModel = opts.ttsModel || '';
      if (!ttsModel) {
        try {
          const chains = await resolveModelChains('groq', customApiKey);
          ttsModel = chains.tts[0] || 'playai-tts';
        } catch {
          ttsModel = 'playai-tts';
        }
      }
      const res = await callGroqSpeech({
        apiKey: customApiKey,
        text,
        voiceName,
        model: ttsModel,
      });
      return res;
    } catch (err: any) {
      if (err?.code === 'TTS_TERMS_REQUIRED') {
        throw Object.assign(
          new Error(err.message || 'Groq voice model terms must be accepted in the Groq console.'),
          { code: 'TTS_TERMS_REQUIRED' }
        );
      }
      if (err?.status === 401 || err?.message?.includes('401')) {
        throw new Error('TTS_INVALID_CREDENTIALS');
      }
      if (err?.status === 429 || err?.message?.includes('429')) {
        throw new Error('TTS_QUOTA_EXCEEDED');
      }
      throw new Error(`Groq TTS failed: ${err?.message || 'SPEECH_UNAVAILABLE'}`);
    }
  }

  // If OpenAI key, utilize OpenAI TTS API directly
  if (provider === 'openai' && customApiKey) {
    try {
      const res = await callOpenAiTts({ apiKey: customApiKey, text, voiceName });
      return res;
    } catch (err: any) {
      if (err?.status === 401 || err?.message?.includes('401')) {
        throw new Error('TTS_INVALID_CREDENTIALS');
      }
      if (err?.status === 429 || err?.message?.includes('429')) {
        throw new Error('TTS_QUOTA_EXCEEDED');
      }
      throw new Error(`OpenAI TTS failed: ${err?.message || 'SPEECH_UNAVAILABLE'}`);
    }
  }

  // If Anthropic, XAI, DeepSeek, NVIDIA, or custom, throw unsupported provider error
  const unsupportedProviders = ['anthropic', 'xai', 'deepseek', 'nvidia', 'custom'];
  if (unsupportedProviders.includes(provider)) {
    throw new Error(`TTS_UNSUPPORTED_PROVIDER: Provider '${provider}' does not support text-to-speech synthesis. Use Cloud (Gemini), Groq, OpenRouter, OpenAI, or Offline Neural voice.`);
  }

  // Gemini TTS path: NEVER send non-Gemini keys to Gemini
  const isGeminiKey = (k: string) => /^(AIza|AQ\.)/i.test(k);
  const rawVoiceKey = (opts.voiceApiKey || '').trim();
  const voiceApiKey = rawVoiceKey && isGeminiKey(rawVoiceKey) ? rawVoiceKey : '';
  const validCustomGeminiKey = customApiKey && isGeminiKey(customApiKey) ? customApiKey : '';
  const envKey = process.env.GEMINI_TTS_API_KEY && isGeminiKey(process.env.GEMINI_TTS_API_KEY) ? process.env.GEMINI_TTS_API_KEY : '';

  const geminiKey = voiceApiKey || validCustomGeminiKey || envKey;
  if (!geminiKey) {
    throw new Error('TTS_INVALID_CREDENTIALS: No valid dedicated Gemini API key configured for Cloud TTS.');
  }

  try {
    const isMale = /Male|Guy|Christopher|Eric|Puck/i.test(voiceName);
    const result = await synthesizeGeminiTts(text, geminiKey, { voiceName, isMale });
    return { audioBase64: result.base64Audio, mimeType: result.mimeType, modelUsed: result.modelUsed };
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes('401') || msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED')) {
      throw new Error('TTS_INVALID_CREDENTIALS');
    }
    if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
      throw new Error('TTS_QUOTA_EXCEEDED');
    }
    throw new Error(`Gemini TTS error: ${msg}`);
  }
}

export async function synthesizeGeminiTts(
  cleanText: string,
  apiKey: string,
  options: { voiceName?: string; isMale?: boolean } = {}
): Promise<{
  base64Audio: string;
  mimeType: string;
  modelUsed: string;
  voiceUsed: string;
}> {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Missing dedicated Gemini TTS API key. Please enter a valid Gemini TTS API key in Settings.');
  }

  // Prebuilt Gemini 3.8 TTS voices: Puck, Charon, Kore, Fenrir, Zephyr
  const validVoices = new Set(['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr']);
  let geminiVoice = options.voiceName || '';
  if (!validVoices.has(geminiVoice)) {
    geminiVoice = options.isMale ? 'Puck' : 'Kore';
  }

  const model = 'gemini-3.8-flash-lite-tts';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: cleanText,
            speechMetadata: {
              style: 'Clear, professional voice',
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: geminiVoice,
          },
        },
      },
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text();
    let detail = errText;
    try {
      const errJson = JSON.parse(errText);
      detail = errJson.error?.message || detail;
    } catch {}
    throw new Error(`Gemini HTTP ${response.status}: ${detail}`);
  }

  const data = await response.json();
  const part = data.candidates?.[0]?.content?.parts?.[0];
  const base64Audio = part?.inlineData?.data;
  let mimeType = part?.inlineData?.mimeType || 'audio/wav';

  if (!base64Audio || typeof base64Audio !== 'string' || base64Audio.length < 100) {
    throw new Error('No valid audio data returned from Gemini TTS API.');
  }

  return {
    base64Audio,
    mimeType,
    modelUsed: `${model} (${geminiVoice})`,
    voiceUsed: geminiVoice,
  };
}

export async function handleTranscribeAudio(
  audioBase64: string,
  mimeType: string = 'audio/webm',
  options?: ApiCallOptions
) {
  const opts = typeof options === 'string' ? { apiKey: options } : options || {};
  let provider = opts.provider || 'gemini';
  const customApiKey = (opts.apiKey || (typeof options === 'string' ? options : '')).trim();

  // If Groq, OpenRouter, or OpenAI key, utilize native Whisper transcription
  if ((provider === 'groq' || provider === 'openai' || provider === 'openrouter') && customApiKey) {
    try {
      const startTime = Date.now();
      const res = await callWhisperTranscription({
        provider,
        apiKey: customApiKey,
        audioBase64,
        mimeType,
        sttModel: opts.sttModel,
        prompt: opts.prompt,
      });
      return { transcript: res.transcript, modelUsed: res.modelUsed, durationMs: Date.now() - startTime };
    } catch (err: any) {
      console.warn(`${provider.toUpperCase()} Whisper transcription failed, checking Gemini fallback:`, redactSensitiveInfo(err?.message || err));
    }
  }

  const geminiKey = (customApiKey && /^(AIza|AQ\.)/i.test(customApiKey)) ? customApiKey : (process.env.GEMINI_API_KEY || '');
  const ai = getAiClient(geminiKey);
  if (!ai) {
    throw new Error('SPEECH_UNAVAILABLE');
  }

  const startTime = Date.now();
  const chains = await resolveModelChains('gemini', geminiKey);
  const { result, modelUsed } = await generateWithFallback(ai, chains.generation, async (model) => {
    const thinkingConfig = getModelThinkingConfig(model, 'transcribe');
    const promptText = opts.prompt
      ? `Transcribe the spoken speech in this audio accurately. Target sentence reference: "${opts.prompt}". Return only the transcribed speech.`
      : 'Transcribe the spoken speech in this audio accurately. Return only the exact transcribed transcript text with no extra commentary, quotation marks, or notes.';

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
          text: promptText,
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
