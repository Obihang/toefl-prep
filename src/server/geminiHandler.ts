import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { resolveModelChains } from './modelRoles';
import * as CURATED from '../data/curatedQuestions';
import { ACADEMIC_GLOSSARY } from '../utils/academicGlossary';
import { generateWithFallback } from './geminiUtils';
import { redactKey, isKeyError, isTransientError, getStatus, extractErrorMessage, isQuotaExhaustedError, redactSensitiveInfo } from './geminiErrors';
import { inferGender } from '../utils/voices';
import { callOpenAiCompatibleChat, testOpenAiCompatible, callOpenAiTts, callOpenRouterTts, callWhisperTranscription } from './llmClient';
import { callChatWithHealing } from './chatHealing';
import { callGroqSpeech } from './groqSpeech';
import { callAudio8Speech } from './audio8Speech';
import { wrapWavHeaderIfNeeded, parseSampleRateFromMime } from '../utils/audioHelpers';
import { collectAvailableProviders, prioritizeForGeneration } from './providerRouter';
import {
  normalizeCompleteWordsTask,
  normalizeBuildSentenceTask,
  verifyAndNormalizeMcqQuestions,
  normalizeDailyLifeTask,
  normalizeReadingAcademicTask,
  classifyReadingQuestionTypeBadge,
  normalizeListeningChooseResponseTask,
  normalizeListeningAnnouncementTask,
  normalizeListeningAcademicTalkTask,
  normalizeListeningDialogueTask,
} from '../utils/taskNormalizer';

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
    questions: z.array(z.object({
      q: z.string(),
      options: z.array(z.string()),
      answer: z.number(),
      why: z.string(),
      audioExcerpt: z.string().optional(),
      questionType: z.string().optional(),
    })),
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
    items: z.array(
      z.object({
        context: z.string(),
        framePrefix: z.string().optional().default(''),
        frameSuffix: z.string().optional().default('.'),
        targetChunks: z.array(z.string()),
        distractorChunks: z.array(z.string()).optional().default([]),
        words: z.array(z.string()),
        targetSentence: z.string().optional(),
        answer: z.string(),
        grammarRule: z.string().optional(),
        explanation: z.string(),
      })
    ),
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
  dailyLife: z.object({
    title: z.string(),
    formatType: z.string().default('notice'),
    context: z.string(),
    contentText: z.string(),
    questions: z.array(z.object({
      q: z.string(),
      options: z.array(z.string()),
      answer: z.number(),
      why: z.string(),
      questionType: z.string().optional(),
    })),
  }),
  listeningChooseResponse: z.object({
    title: z.string(),
    category: z.string().optional().default('Campus Life'),
    items: z.array(z.object({
      audioPrompt: z.string(),
      speakerName: z.string().default('Campus Speaker'),
      speakerGender: z.string().default('male'),
      options: z.array(z.string()),
      answer: z.number(),
      why: z.string(),
    })).optional(),
    audioPrompt: z.string().optional(),
    speakerName: z.string().optional().default('Campus Speaker'),
    speakerGender: z.string().optional().default('male'),
    options: z.array(z.string()).optional(),
    answer: z.number().optional(),
    why: z.string().optional(),
  }),
  listeningAnnouncement: z.object({
    title: z.string(),
    context: z.string(),
    speakerName: z.string().default('University Administrator'),
    speakerGender: z.string().default('female'),
    script: z.string(),
    questions: z.array(z.object({
      q: z.string(),
      options: z.array(z.string()),
      answer: z.number(),
      why: z.string(),
    })),
  }),
  listeningAcademicTalk: z.object({
    title: z.string(),
    topic: z.string(),
    speakerName: z.string().default('Professor'),
    speakerGender: z.string().default('male'),
    script: z.string(),
    questions: z.array(z.object({
      q: z.string(),
      options: z.array(z.string()),
      answer: z.number(),
      why: z.string(),
      audioExcerpt: z.string().optional(),
      questionType: z.string().optional(),
    })),
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
  let rawText = String(data.text || '').trim();
  if (!rawText || rawText.split(/\s+/).filter(Boolean).length < 25) {
    throw new Error('AI response missing valid complete_words paragraph text');
  }

  const normalized = normalizeCompleteWordsTask({ title, text: rawText });
  return {
    title: normalized.title,
    text: normalized.text,
    totalBlanks: normalized.totalBlanks,
    blanks: normalized.blanks,
  };
}

function normalizeReadingPassage(data: any) {
  if (!data || typeof data !== 'object') throw new Error('AI response is not an object');
  const title = String(data.title || 'Reading Comprehension Passage');
  const passage = String(data.passage || '');
  if (!passage || passage.trim().length < 30) {
    throw new Error('AI response missing valid reading passage text');
  }

  const rawQs = Array.isArray(data.questions) ? data.questions : [];
  if (rawQs.length < 3 || rawQs.length > 5) {
    throw new Error(`Reading comprehension requires 3 to 5 questions (received ${rawQs.length})`);
  }

  const preValidated = rawQs.map((q: any, idx: number) => {
    if (!q || typeof q !== 'object') throw new Error(`Question ${idx + 1} is invalid`);
    const qText = String(q.q || q.question || '').trim();
    if (!qText) throw new Error(`Question ${idx + 1} missing question text`);

    const options = Array.isArray(q.options) ? q.options.map(String).filter(Boolean) : [];
    if (options.length !== 4) {
      throw new Error(`Question ${idx + 1} must have exactly 4 options (received ${options.length})`);
    }

    let answer = q.answer ?? q.correctAnswer;
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

  const normalized = normalizeReadingAcademicTask({
    title,
    passage,
    questions: preValidated,
  });

  return {
    title: normalized.title,
    passage: normalized.passage,
    questions: normalized.questions,
  };
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
  if (rawQs.length < 2 || rawQs.length > 5) {
    throw new Error(`Listening conversation requires 2 to 5 questions (received ${rawQs.length})`);
  }

  const preValidated = rawQs.map((q: any, idx: number) => {
    if (!q || typeof q !== 'object') throw new Error(`Question ${idx + 1} is invalid`);
    const qText = String(q.q || q.question || '').trim();
    if (!qText) throw new Error(`Question ${idx + 1} missing question text`);

    const options = Array.isArray(q.options) ? q.options.map(String).filter(Boolean) : [];
    if (options.length !== 4) {
      throw new Error(`Question ${idx + 1} must have exactly 4 options (received ${options.length})`);
    }

    let answer = q.answer ?? q.correctAnswer;
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
      ...(q.audioExcerpt ? { audioExcerpt: String(q.audioExcerpt).trim() } : {}),
      ...(q.questionType ? { questionType: String(q.questionType).trim() } : {}),
    };
  });

  const normalized = normalizeListeningDialogueTask({
    title,
    context,
    speakers,
    speakerGenders,
    script,
    questions: preValidated.slice(0, 2),
  });

  return {
    title: normalized.title,
    context: normalized.context,
    speakers: normalized.speakers,
    speakerGenders: normalized.speakerGenders,
    script: normalized.script,
    questions: normalized.questions,
  };
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
  rawItems.forEach((it: any, idx: number) => {
    if (!it || typeof it !== 'object') throw new Error(`Build sentence item ${idx + 1} is invalid`);
    const context = String(it.context || '').trim();
    if (!context) throw new Error(`Build sentence item ${idx + 1} missing context`);
    const answer = String(it.targetSentence || it.answer || it.correctSentence || '').trim();
    if (!answer) {
      throw new Error(`Build sentence item ${idx + 1} missing correct sentence answer`);
    }
    const explanation = String(it.grammarRule || it.explanation || '').trim();
    if (!explanation) {
      throw new Error(`Build sentence item ${idx + 1} missing explanation`);
    }
  });
  const normalized = normalizeBuildSentenceTask({ title, items: rawItems });
  return {
    title: normalized.title,
    items: normalized.items.map((it) => ({
      context: it.context,
      framePrefix: it.framePrefix,
      frameSuffix: it.frameSuffix,
      targetChunks: it.targetChunks,
      distractorChunks: it.distractorChunks,
      words: it.words,
      targetSentence: it.targetSentence,
      answer: it.answer,
      grammarRule: it.grammarRule,
      explanation: it.explanation,
    })),
  };
}

function normalizeWriteEmail(data: any) {
  if (!data || typeof data !== 'object') throw new Error('AI response is not an object');
  const title = String(data.title || '').trim();
  if (!title) throw new Error('Write an Email missing title');
  const situation = String(data.situation || data.scenario || '').trim();
  if (!situation || situation.length < 15) {
    throw new Error('Write an Email missing valid situation description');
  }
  const recipient = String(data.recipient || '').trim();
  if (!recipient) {
    throw new Error('Write an Email missing recipient');
  }
  const goals = Array.isArray(data.goals)
    ? data.goals.map(String).filter(Boolean)
    : Array.isArray(data.bulletPoints)
    ? data.bulletPoints.map(String).filter(Boolean)
    : [];
  if (goals.length === 0) {
    throw new Error('Write an Email must have at least 1 goal');
  }
  const suggestedWordCount = String(data.suggestedWordCount || '100-130 words').trim();
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
    case 'complete_words':
      return normalizeCompleteWords(data);
    case 'reading-passage':
    case 'reading_academic':
    case 'reading-academic':
      return normalizeReadingPassage(data);
    case 'daily-life':
    case 'daily_life':
      return normalizeDailyLifeTask(data);
    case 'listening-dialogue':
    case 'listening_dialogue':
    case 'listening-conversation':
    case 'listening_conversation':
      return normalizeListeningDialogue(data);
    case 'listening-choose-response':
    case 'listening_choose_response':
      return normalizeListeningChooseResponseTask(data);
    case 'listening-announcement':
    case 'listening_announcement':
      return normalizeListeningAnnouncementTask(data);
    case 'listening-academic-talk':
    case 'listening_academic_talk':
    case 'listening-lecture':
    case 'listening_lecture':
      return normalizeListeningAcademicTalkTask(data);
    case 'listen-repeat':
    case 'speaking_listen_repeat':
      return normalizeListenRepeat(data);
    case 'speaking-interview':
    case 'speaking_interview':
      return normalizeSpeakingInterview(data);
    case 'build-sentence':
    case 'writing_build_sentence':
      return normalizeBuildSentence(data);
    case 'write-email':
    case 'writing_email':
      return normalizeWriteEmail(data);
    case 'academic-discussion':
    case 'writing_discussion':
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
  const taskMap: Record<string, string> = {
    'complete-words': 'completeWords',
    complete_words: 'completeWords',
    'daily-life': 'dailyLife',
    daily_life: 'dailyLife',
    'reading-academic': 'readingPassage',
    reading_academic: 'readingPassage',
    'reading-passage': 'readingPassage',
    'listening-choose-response': 'listeningChooseResponse',
    listening_choose_response: 'listeningChooseResponse',
    'listening-dialogue': 'listeningDialogue',
    listening_dialogue: 'listeningDialogue',
    'listening-conversation': 'listeningDialogue',
    listening_conversation: 'listeningDialogue',
    'listening-announcement': 'listeningAnnouncement',
    listening_announcement: 'listeningAnnouncement',
    'listening-academic-talk': 'listeningAcademicTalk',
    listening_academic_talk: 'listeningAcademicTalk',
    'listening-lecture': 'listeningAcademicTalk',
    listening_lecture: 'listeningAcademicTalk',
    'listen-repeat': 'listenRepeat',
    speaking_listen_repeat: 'listenRepeat',
    'speaking-listen-repeat': 'listenRepeat',
    'speaking-interview': 'speakingInterview',
    speaking_interview: 'speakingInterview',
    'build-sentence': 'buildSentence',
    writing_build_sentence: 'buildSentence',
    'writing-build-sentence': 'buildSentence',
    'write-email': 'writeEmail',
    writing_email: 'writeEmail',
    'writing-email': 'writeEmail',
    'academic-discussion': 'academicDiscussion',
    writing_discussion: 'academicDiscussion',
    'writing-discussion': 'academicDiscussion',
    'vocabulary_explanation': 'vocabularyExplanation',
    'vocabulary-explanation': 'vocabularyExplanation',
  };
  const curatedMap: Record<string, string> = {
    'complete-words': 'CURATED_COMPLETE_WORDS',
    complete_words: 'CURATED_COMPLETE_WORDS',
    'daily-life': 'CURATED_READING_PASSAGES',
    daily_life: 'CURATED_READING_PASSAGES',
    'reading-academic': 'CURATED_READING_PASSAGES',
    reading_academic: 'CURATED_READING_PASSAGES',
    'reading-passage': 'CURATED_READING_PASSAGES',
    'listening-choose-response': 'CURATED_LISTENING',
    listening_choose_response: 'CURATED_LISTENING',
    'listening-dialogue': 'CURATED_LISTENING',
    listening_dialogue: 'CURATED_LISTENING',
    'listening-conversation': 'CURATED_LISTENING',
    listening_conversation: 'CURATED_LISTENING',
    'listening-announcement': 'CURATED_LISTENING',
    listening_announcement: 'CURATED_LISTENING',
    'listening-academic-talk': 'CURATED_LISTENING',
    listening_academic_talk: 'CURATED_LISTENING',
    'listening-lecture': 'CURATED_LISTENING',
    listening_lecture: 'CURATED_LISTENING',
    'listen-repeat': 'CURATED_LISTEN_REPEAT',
    speaking_listen_repeat: 'CURATED_LISTEN_REPEAT',
    'speaking-listen-repeat': 'CURATED_LISTEN_REPEAT',
    'speaking-interview': 'CURATED_SPEAKING_INTERVIEWS',
    speaking_interview: 'CURATED_SPEAKING_INTERVIEWS',
    'build-sentence': 'CURATED_BUILD_SENTENCES',
    writing_build_sentence: 'CURATED_BUILD_SENTENCES',
    'writing-build-sentence': 'CURATED_BUILD_SENTENCES',
    'write-email': 'CURATED_WRITE_EMAILS',
    writing_email: 'CURATED_WRITE_EMAILS',
    'writing-email': 'CURATED_WRITE_EMAILS',
    'academic-discussion': 'CURATED_ACADEMIC_DISCUSSIONS',
    writing_discussion: 'CURATED_ACADEMIC_DISCUSSIONS',
    'writing-discussion': 'CURATED_ACADEMIC_DISCUSSIONS',
  };

  const schemaKey = taskMap[taskType];
  if (!schemaKey) {
    throw new Error(`Unknown task type: ${taskType}`);
  }
  const schema = Schemas[schemaKey as keyof typeof Schemas];

  const getPrompt = (tType: string, lvl: string, top: string) => {
    const levelDesc =
      lvl === 'advanced'
        ? 'Advanced (C1-C2 CEFR / TOEFL 100-120)'
        : lvl === 'beginner'
        ? 'Beginner-Intermediate (A2-B1 CEFR / TOEFL 40-60)'
        : lvl === 'intermediate'
        ? 'Intermediate (B1-B2 CEFR / TOEFL 60-85)'
        : 'Upper-Intermediate (B2-C1 CEFR / TOEFL 85-100)';
    switch (tType) {
      case 'complete-words':
      case 'complete_words':
        return `You are an official ETS 2026 TOEFL iBT test content creator. Create an authentic TOEFL Reading "Complete the Words" (C-Test) item for a student at level: ${levelDesc}. Topic: ${top}.
STRICT 2026 TOEFL iBT SPECIFICATIONS:
1. Write a cohesive, natural, 100% plain-English academic paragraph of strictly 65 to 85 words (exactly 3 to 4 sentences total) with ZERO brackets [ ].
2. Sentence 1 MUST be a clear introductory sentence (10-15 words).
3. Sentences 2 to 4 MUST be crisp, clear university-textbook prose exploring the academic topic with rich academic vocabulary.
4. FORBIDDEN: Do NOT insert any brackets [ ] or split any words into prefixes/suffixes! Return pure, pristine plain English text.
5. FORBIDDEN: Do NOT write repetitive filler sentences, redundant concluding summaries, or artificial buzzword lists. Write natural, authentic ETS TOEFL prose.
Return JSON format: {"title": "Short Academic Topic Title", "text": "The full 65-85 word plain-English academic paragraph with ZERO brackets", "totalBlanks": 10}`;
      case 'daily-life':
      case 'daily_life':
        return `You are an official ETS 2026 TOEFL iBT test creator. Create a TOEFL Reading "Read in Daily Life" item for level: ${levelDesc}. Topic: ${top}.
STRICT 2026 TOEFL iBT SPECIFICATIONS (Official PDF Page 6):
1. Choose an authentic daily life format (formatType): "notice", "email", "text-chain", "menu", "schedule", "invoice", or "social-post".
2. Write a realistic text of 15 to 150 words (contentText) with relevant campus or everyday context. Avoid repetitive phrasing or filler text.
3. Follow the official length-dependent question rule:
   - If the text is shorter (15–70 words, such as a campus notice, sign, social post, or short text message chain), include EXACTLY 2 multiple-choice questions.
   - If the text is longer (75–150 words, such as a detailed email, event schedule, itemized invoice, or dining menu), include EXACTLY 3 multiple-choice questions.
4. Vary the question skills across the official Page 6 types and tag each question's \`questionType\` accurately using:
   - "main_purpose" (identifying the main purpose or issuer of the communication)
   - "inference" (making inferences based on the text)
   - "factual_detail" (skimming and scanning for specific nonlinear information)
   - "idiomatic_meaning" (understanding informal or telegraphic language in context)
   - "negative_factual" (identifying which option is NOT true or EXCEPT)
Return JSON format: {"title": "Title", "formatType": "notice", "context": "Campus context description", "contentText": "Full text...", "questions": [{"q": "What is the main purpose of this notice?", "options": ["Option A", "Option B", "Option C", "Option D"], "answer": 0, "why": "Explanation...", "questionType": "main_purpose"}, {"q": "What can be inferred about...?", "options": ["Option A", "Option B", "Option C", "Option D"], "answer": 2, "why": "Explanation...", "questionType": "inference"}]}`;
      case 'reading-passage':
      case 'reading_academic':
      case 'reading-academic': {
        const hasSpecificFocus = promptData?.questionSkillFocus && promptData.questionSkillFocus !== 'all';
        const skillDirective = hasSpecificFocus
          ? `NOTE: Focus questions specifically on the skill: ${promptData.questionSkillFocus} (all 5 questions testing ${promptData.questionSkillFocus}).`
          : `CRITICAL QUESTION TYPE REQUIREMENT (readingQuestionFocus === 'all'):
Every 5-question passage MUST include EXACTLY 1 of each of the 5 official TOEFL iBT Reading question types (NO duplicate Factual Comprehension questions!), presented in a RANDOMIZED order across the 5 questions:
  1. Factual Detail ("According to paragraph X...") -> questionType: "Factual Detail"
  2. Negative Factual (EXCEPT / NOT) ("According to the passage, all of the following are true EXCEPT:" or "Which of the following is NOT mentioned in paragraph X?") -> questionType: "Negative Factual (EXCEPT/NOT)"
  3. Vocabulary in Context ("The word 'X' in paragraph Y is closest in meaning to:") -> questionType: "Vocabulary in Context"
  4. Inference ("What can be inferred from paragraph X about...?" or "Which of the following does the passage imply about...?") -> questionType: "Inference"
  5. Rhetorical Purpose / Relationship ("Why does the author mention 'X' in paragraph Y?" or "How do the ideas in paragraph 2 relate to the ideas in paragraph 1?") -> questionType: "Rhetorical Purpose"`;
        return `You are an official ETS 2026 TOEFL iBT test content creator. Create an authentic TOEFL "Read an Academic Passage" item with 5 multiple-choice questions for level: ${levelDesc}. Topic: ${top}.
${skillDirective}
STRICT 2026 TOEFL iBT SPECIFICATIONS:
1. Write a 180-210 word university-level academic passage (3 focused, cohesive paragraphs). Avoid repetitive phrasing or redundant concluding summaries.
2. Provide EXACTLY 5 multiple-choice questions in a randomized sequence of question types (1 Factual Detail, 1 Negative Factual EXCEPT/NOT, 1 Vocabulary in Context, 1 Inference, 1 Rhetorical Purpose / Relationship).
3. Every question MUST have 4 distinct, unique options (\`options.length === 4\`), \`answer\` (0..3, varied across questions), \`questionType\` ("Factual Detail", "Negative Factual (EXCEPT/NOT)", "Vocabulary in Context", "Inference", or "Rhetorical Purpose"), and a detailed \`why\` explanation that explicitly verifies why the option at index \`answer\` is right.
Return JSON format: {"title": "Passage Title", "passage": "180-210 word passage...", "questions": [{"q": "Question prompt?", "options": ["Unique Option A", "Unique Option B", "Unique Option C", "Unique Option D"], "answer": 2, "why": "Detailed explanation verifying why the option at index 2 is correct...", "questionType": "Inference"}]}`;
      }
      case 'listening-choose-response':
      case 'listening_choose_response':
        return `You are an official ETS 2026 TOEFL iBT test content creator. Create a 5-item TOEFL Listening "Listen & Choose a Response" practice set for level: ${levelDesc}. Topic: ${top}.
STRICT 2026 TOEFL iBT SPECIFICATIONS (Official PDF Pages 8-9):
1. Provide EXACTLY 5 independent short items in the \`items\` array.
2. Each item's \`audioPrompt\` MUST be a short, natural, 1-sentence everyday or campus question/statement of strictly 6 to 15 words (e.g., "Didn't I just see you in the library an hour ago?").
3. Provide \`speakerName\` and \`speakerGender\` ('male' or 'female') for each item.
4. For each item, provide EXACTLY 4 brief conversational reply \`options\` (each 5 to 12 words). Exactly ONE option is the natural, appropriate reply (\`answer\`: 0..3), and 3 are plausible distractors.
5. Include a clear \`why\` explanation for each item.
Return JSON format: {"title": "Campus Interaction Set", "category": "Campus Life", "items": [{"audioPrompt": "Short 6-15 word question?", "speakerName": "Sarah", "speakerGender": "female", "options": ["Option A", "Option B", "Option C", "Option D"], "answer": 1, "why": "Direct and natural response."}]}`;
      case 'listening-announcement':
      case 'listening_announcement':
        return `You are an official ETS 2026 TOEFL iBT test content creator. Create a TOEFL Listening "Listen to an Announcement" item for level: ${levelDesc}. Topic: ${top}.
STRICT 2026 TOEFL iBT SPECIFICATIONS:
1. Write a strictly 45 to 80 word spoken campus announcement (script) by 1 university official or professor (speakerName, speakerGender: 'male'|'female'). Avoid repetitive phrasing or filler text.
2. Follow with EXACTLY 2 comprehension questions. Each question must have 4 distinct options, answer index (0..3), and why explanation.
Return JSON format: {"title": "Announcement Title", "context": "University announcement context", "speakerName": "Dean Williams", "speakerGender": "male", "script": "Attention all students...", "questions": [{"q": "Question 1?", "options": ["A", "B", "C", "D"], "answer": 1, "why": "Explanation 1..."}, {"q": "Question 2?", "options": ["A", "B", "C", "D"], "answer": 2, "why": "Explanation 2..."}]}`;
      case 'listening-academic-talk':
      case 'listening_academic_talk':
      case 'listening-lecture':
      case 'listening_lecture':
        return `You are an official ETS 2026 TOEFL iBT test content creator. Create a TOEFL Listening "Listen to an Academic Talk" item for level: ${levelDesc}. Topic: ${top}.
STRICT 2026 TOEFL iBT SPECIFICATIONS:
1. Write a strictly 140 to 200 word academic talk or mini-lecture (script) by a university educator (speakerName, speakerGender: 'male'|'female'). Avoid repetitive phrasing or redundant concluding summaries.
2. Follow with EXACTLY 4 comprehension questions covering:
   - Gist / Main Idea ("questionType": "Gist / Main Idea")
   - Detail ("questionType": "Detail")
   - Inference / Implied Meaning ("questionType": "Inference / Implied Meaning")
   - Pragmatic "Listen Again to an Excerpt" Function/Purpose question ("questionType": "Speaker's Purpose / Function"): On EXACTLY 1 of the 4 questions, include \`"audioExcerpt"\` containing an exact 1-sentence quote from the lecture \`script\`, and ask "Why does the professor say this?" or "What does the professor imply when saying this?".
3. Each question must have 4 distinct options, answer index (0..3), questionType, and why explanation.
Return JSON format: {"title": "Lecture Title", "topic": "${top}", "speakerName": "Dr. Angela Evans", "speakerGender": "female", "script": "Good morning class...", "questions": [{"q": "Why does the professor say this?", "audioExcerpt": "Exact 1-sentence quote from the script.", "questionType": "Speaker's Purpose / Function", "options": ["A", "B", "C", "D"], "answer": 0, "why": "..."}, {"q": "Question 2?", "questionType": "Detail", "options": ["A", "B", "C", "D"], "answer": 1, "why": "..."}, {"q": "Question 3?", "questionType": "Detail", "options": ["A", "B", "C", "D"], "answer": 2, "why": "..."}, {"q": "Question 4?", "questionType": "Inference / Implied Meaning", "options": ["A", "B", "C", "D"], "answer": 3, "why": "..."}]}`;
      case 'listening-dialogue':
      case 'listening_dialogue':
      case 'listening-conversation':
      case 'listening_conversation':
        return `You are an official ETS 2026 TOEFL iBT test content creator. Create a TOEFL Listening "Listen to a Conversation" task for level: ${levelDesc}. Topic: ${top}.
STRICT 2026 TOEFL iBT SPECIFICATIONS (Official PDF Pages 9-10):
1. Write a short, natural 8 to 10 turn conversation of strictly 75 to 110 words total (5 to 15 words per turn, like a real 30-second spoken campus exchange—NOT a long multi-sentence monologue!) between two distinct speakers (1 female and 1 male with clear names, e.g., "Emma (Student)" & "Professor Miller", or "Lucas (Student)" & "Ms. Rivera (Librarian)").
2. Format every script line with the speaker name at the start of the line, e.g. "Emma: Professor Miller, do you have a minute to look at my survey design?\\nProfessor Miller: Sure, Emma. Did you narrow down your topic on sleep and memory?"
3. Follow with EXACTLY 2 multiple-choice questions testing official TOEFL Listening skills:
   - Question 1 MUST be an official "Listen Again to an Excerpt" pragmatic/function/implication question: include \`"audioExcerpt"\` with an exact 1-sentence line from the conversation (including the speaker prefix, e.g. "Professor Miller: Relying only on self-reported sleep logs can be pretty inaccurate, though."), set \`"questionType"\` to \`"Speaker's Purpose / Function"\` or \`"Inference / Implied Meaning"\`, and ask "Why does the speaker say this?" or "What does the speaker imply when saying this?".
   - Question 2 tests Detail or Gist / Main Idea (\`"questionType": "Detail"\` or \`"Gist / Main Idea"\`).
4. Every question MUST have 4 distinct options (\`options.length === 4\`), a verified \`answer\` index (0..3), \`questionType\`, and a clear \`why\` explanation confirming why that option is correct.
Return JSON format: {"title": "Conversation Title", "context": "Listen to a conversation between a student and a professor.", "speakers": {"A": "Emma (Student)", "B": "Professor Miller"}, "speakerGenders": {"A": "female", "B": "male"}, "script": "Emma: ...\\nProfessor Miller: ...", "questions": [{"q": "Why does the professor say this?", "audioExcerpt": "Professor Miller: Exact 1-sentence turn from the script.", "questionType": "Speaker's Purpose / Function", "options": ["Option A", "Option B", "Option C", "Option D"], "answer": 1, "why": "Explanation 1..."}, {"q": "Question 2?", "questionType": "Detail", "options": ["Option A", "Option B", "Option C", "Option D"], "answer": 2, "why": "Explanation 2..."}]}`;
      case 'listen-repeat':
      case 'speaking_listen_repeat':
      case 'speaking-listen-repeat':
        return `You are an official ETS 2026 TOEFL iBT test creator. Create a TOEFL Speaking "Listen and Repeat" practice set for level: ${levelDesc}. Topic: ${top}.
STRICT 2026 ETS TOEFL iBT "LISTEN AND REPEAT" SPECIFICATIONS:
1. COHESIVE SINGLE-SPEAKER SCENARIO: All 7 sentences in the set MUST be spoken by ONE single person (e.g., "Sarah (Lab Coordinator)", "Marcus (Head Librarian)", "Dr. Chen (Observatory Guide)", "Clara (Museum Docent)", "David (Academic Advisor)") directly addressing the listener ("Welcome to...", "Please store...", "You will find...", "If you need...") in ONE continuous, coherent campus or academic orientation/tour scenario!
2. FORBIDDEN: Do NOT write 7 random disconnected textbook statements about unrelated topics. Every sentence must belong to the same continuous briefing or guided tour.
3. PROGRESSIVE WORD LENGTH: Provide EXACTLY 7 natural spoken sentences that progress smoothly in length and grammatical complexity:
   - Sentence 1: 6–7 words (warm welcome or opening statement)
   - Sentence 2: 8 words
   - Sentence 3: 9–10 words
   - Sentence 4: 11 words
   - Sentence 5: 12 words
   - Sentence 6: 14 words
   - Sentence 7: 15–16 words
Return JSON format: {"title": "Biology Laboratory Safety Orientation", "speakerName": "Sarah (Lab Coordinator)", "speakerGender": "female", "sentences": ["Welcome to the undergraduate biology laboratory.", "Please store your backpacks inside the hallway lockers.", "Safety goggles and lab coats are required at all times.", "You will find clean glass slides inside the top cabinet drawer.", "Make sure to calibrate your microscope carefully before examining the tissue samples.", "Dispose of all used pipettes and gloves in the labeled biohazard container near the sink.", "If any chemical spill occurs during the experiment, notify your laboratory supervisor immediately for assistance."]}`;
      case 'speaking-interview':
      case 'speaking_interview':
        return `You are an official ETS 2026 TOEFL iBT Speaking examiner. Create a TOEFL Speaking "Take an Interview" practice simulation for level: ${levelDesc}. Topic: ${top}.
STRICT 2026 TOEFL iBT SPECIFICATIONS:
1. Format interviewerName with a realistic name and gender tag, e.g. "Prof. Lee (Male)" or "Dr. Patel (Female)".
2. Provide a brief interviewer introduction (\`context\`) followed by EXACTLY 4 progressive interview questions on the topic:
   - Q1: Personal preference or concrete personal experience.
   - Q2: Specific examples or elaboration.
   - Q3: Broader community or educational impact.
   - Q4: Future policy or abstract evaluation.
3. Each question has prepTimeSeconds: 15 and responseTimeSeconds: 45.
Return JSON format: {"title": "University Interview Simulation", "context": "Brief interviewer introduction to the topic", "interviewerName": "Prof. Lee (Male)", "interviewerGender": "male", "questions": [{"question": "Q1...", "prepTimeSeconds": 15, "responseTimeSeconds": 45, "suggestedPoints": ["Point 1", "Point 2"]}, {"question": "Q2...", "prepTimeSeconds": 15, "responseTimeSeconds": 45, "suggestedPoints": ["Point 1", "Point 2"]}, {"question": "Q3...", "prepTimeSeconds": 15, "responseTimeSeconds": 45, "suggestedPoints": ["Point 1", "Point 2"]}, {"question": "Q4...", "prepTimeSeconds": 15, "responseTimeSeconds": 45, "suggestedPoints": ["Point 1", "Point 2"]}]}`;
      case 'build-sentence':
      case 'writing_build_sentence':
        return `You are an official ETS 2026 TOEFL iBT test creator. Create a 5-item TOEFL Writing "Build a Sentence" set for level: ${levelDesc}. Topic: ${top}.
STRICT 2026 ETS TOEFL iBT "BUILD A SENTENCE" SPECIFICATIONS:
1. Provide EXACTLY 5 conversational exchanges in the \`items\` array.
2. NEVER CAPITALIZE TILES IN THE WORD BANK: Every single word or phrase tile in \`targetChunks\`, \`distractorChunks\`, and \`words\` MUST be 100% lowercase (except the standalone pronoun "I"—avoid proper nouns in movable tiles so capitalization never gives away which tile goes first!).
3. RANDOMIZE SENTENCE FRAME TYPES ACROSS THE 5 ITEMS: Mix these 4 official ETS frame layouts in randomized order across the 5 items:
   - Frame Type 1 (Fixed Beginning + Fixed Ending): e.g., \`"framePrefix": "The", "frameSuffix": "fantastic."\`
   - Frame Type 2 (Fixed Beginning Only): e.g., \`"framePrefix": "I'm not sure", "frameSuffix": "to the course website."\`
   - Frame Type 3 (Fixed Ending Only): e.g., \`"framePrefix": "", "frameSuffix": "so early on weeknights?"\`
   - Frame Type 4 (No Fixed Words — All Blanks + Final Punctuation \`.\` or \`?\`): e.g., \`"framePrefix": "", "frameSuffix": "?"\` or \`"."\`
4. INCLUDE INTERROGATIVE (QUESTION) SENTENCES & DIVERSE GRAMMAR: Across the 5 items (in randomized order), include:
   - Direct Interrogative / Question Sentences where Speaker 2 responds with a question ending in \`?\` (e.g., "How long has the science library been closing so early on weeknights?", "Wasn't the gallery reservation canceled earlier this week?")
   - Embedded / Indirect Questions ("whether/what/where/when + subject + verb" without auxiliary inversion)
   - Subject/Object Relative Clauses ("who", "which", "that", "whose")
   - Passive Voice & Causatives ("has been approved", "cannot be checked out")
   - Conditionals & Comparisons ("unless", "provided that", "far more efficient than")
5. OFFICIAL ETS TILE BALANCE RULE (KEEP MOST TILES AS SINGLE WORDS!):
   - Out of 6 or 7 blank slots (\`targetChunks\`), AT MOST 1 or 2 tiles should be a 2-3 word phrase (such as a noun phrase like \`"science library"\` or \`"tour guides"\`, or a short verb phrase like \`"showed us around"\`), while the REMAINING 4 to 5+ tiles MUST be SINGLE WORDS (especially question words, auxiliary verbs, main verbs, articles, pronouns, and connectors—e.g., \`["how", "long", "has", "the", "science library", "been", "closing"]\` or \`["tour guides", "who", "showed us around", "the", "old", "city", "were"]\`).
   - On 2 to 3 items in the set, include 1 single-word grammatical distractor tile in \`distractorChunks\` (e.g., \`["was"]\`, \`["have"]\`, \`["weren't"]\`, \`["which"]\`) so \`words\` has 1 more tile than blank slots.
   - \`words\` MUST be the shuffled array of \`[...targetChunks, ...distractorChunks]\`, 100% lowercase (except "I").
Return JSON format: {"title": "Build a Sentence: Campus & Academic Syntax", "items": [{"context": "What did you think of the guided tour of the historical district?", "framePrefix": "The", "frameSuffix": "fantastic.", "targetChunks": ["tour guides", "who", "showed us around", "the", "old", "city", "were"], "distractorChunks": ["was"], "words": ["old", "were", "who", "was", "tour guides", "city", "the", "showed us around"], "targetSentence": "The tour guides who showed us around the old city were fantastic.", "answer": "The tour guides who showed us around the old city were fantastic.", "grammarRule": "Subject relative clause ('who showed us around the old city') modifying plural 'tour guides', requiring plural verb 'were' instead of 'was'.", "explanation": "Subject relative clause ('who showed us around the old city') modifying plural 'tour guides', requiring plural verb 'were' instead of 'was'."}]}`;
      case 'write-email':
      case 'writing_email':
        return `You are an official ETS 2026 TOEFL iBT Writing test designer. Create a 7-minute TOEFL Writing "Write an Email" prompt for level: ${levelDesc}. Topic: ${top}.
STRICT 2026 TOEFL iBT SPECIFICATIONS:
1. Provide a clear campus or academic scenario (\`situation\`), \`recipient\` name and role, and EXACTLY 3 specific bullet points (\`goals\`) the student must accomplish in their email.
2. Set \`suggestedWordCount\` to "85-130 words".
Return JSON format: {"title": "Email Task Title", "situation": "Detailed campus or academic scenario description...", "recipient": "Recipient name and role", "goals": ["Specific bullet point 1", "Specific bullet point 2", "Specific bullet point 3"], "suggestedWordCount": "85-130 words"}`;
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
      case 'writing_discussion':
      default:
        return `You are an official ETS 2026 TOEFL iBT Writing test designer. Create a 10-minute TOEFL Writing "Writing for an Academic Discussion" prompt for level: ${levelDesc}. Topic: ${top}.
STRICT 2026 TOEFL iBT SPECIFICATIONS:
1. Provide a professor's course question (\`professorPrompt\`, 50-70 words) posing an open-ended academic debate question.
2. Provide 2 contrasting student posts (\`s1\` and \`s2\`, 50-70 words each, with distinct student names and contrasting viewpoints/examples).
Return JSON format: {"title": "Academic Discussion Board", "professorName": "Professor Name", "professorPrompt": "50-70 word professor question...", "s1": {"name": "Student A", "text": "50-70 word post taking viewpoint 1..."}, "s2": {"name": "Student B", "text": "50-70 word post taking contrasting viewpoint 2..."}, "question": "Express and support your personal opinion in the academic discussion forum, contributing a new point beyond the existing student posts."}`;
    }
  };

  const prompt = getPrompt(taskType, level, topic);
  const systemInstruction = 'You are an expert ETS TOEFL test design specialist. Write natural, authentic ETS TOEFL prose. Avoid repetitive phrasing, redundant concluding summaries, or artificial buzzword stuffing. Return valid JSON matching the schema only.';
  const fullPrompt = `${systemInstruction}\n\n${prompt}\n\nIMPORTANT: Return valid JSON matching the schema only. Do not wrap in markdown fences.`;

  // Collect available providers and distribute via round-robin for question generation (high throughput)
  const candidates = collectAvailableProviders(options);
  const prioritized = prioritizeForGeneration(candidates);

  let lastError: any = null;

  for (const candidate of prioritized) {
    try {
      if (candidate.provider === 'gemini') {
        const ai = getAiClient(candidate.apiKey);
        if (!ai) continue;

        const chains = await resolveModelChains('gemini', candidate.apiKey);
        const { result, modelUsed } = await generateWithFallback(ai, chains.generation, async (model) => {
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
      } else {
        const { text, modelUsed } = await callChatWithHealing({
          provider: candidate.provider,
          apiKey: candidate.apiKey,
          baseUrl: candidate.baseUrl,
          model: candidate.model,
          purpose: 'generation',
          prompt: fullPrompt,
          systemInstruction,
          responseJson: true,
        });

        const parsed = cleanAndExtractJson(text);
        const normalized = normalizeTask(taskType, parsed);
        const result = schema.parse(normalized);
        return { ...result, isFallback: false, modelUsed };
      }
    } catch (candidateErr: any) {
      lastError = candidateErr;
      const status = getStatus(candidateErr);
      const isQuota = isQuotaExhaustedError(candidateErr) || status === 429;
      console.warn(`Generation provider [${candidate.provider}] failed (${isQuota ? '429 Quota Exceeded' : candidateErr?.message || candidateErr}), continuing to next provider in chain...`);
      continue;
    }
  }

  // If all API providers fail, drop down to local/curated fallbacks
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

  const isQuota = isQuotaExhaustedError(lastError) || getStatus(lastError) === 429;
  const rateLimit = isQuota ? parseRateLimitFromError(lastError) : undefined;
  const errMsg = extractErrorMessage(lastError, 'AI Service');
  const curatedKey = curatedMap[taskType] as keyof typeof CURATED;
  const curatedTasks = CURATED[curatedKey] as any[];
  const item = curatedTasks ? curatedTasks[Math.floor(Math.random() * curatedTasks.length)] : null;

  return {
    ...item,
    isFallback: true,
    isQuotaExhausted: isQuota,
    rateLimit,
    fallbackReason: errMsg,
    modelUsed: 'Curated ETS TOEFL Question Bank',
  };
}

export { handleEvaluateResponse } from './evaluationHandler';

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
