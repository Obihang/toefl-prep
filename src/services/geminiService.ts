import {
  GENERATION_MODELS,
  EVALUATION_MODELS,
  PROVIDER_ORDER,
  ModelProvider,
} from '../config/models';
import {
  getAllProviderKeys,
  getApiHeaders,
  getStoredApiKey,
  getStoredProvider,
  hasAnyProviderKey,
  ApiProvider,
} from '../utils/apiKey';
import { safeFetchJson } from '../utils/apiHelper';
import { evaluateResponseLocally, mergeAiAndLocalEvaluation } from '../utils/localEvaluator';
import { normalizeTaskData } from '../utils/taskNormalizer';

export async function fetchDynamicModels(provider: ModelProvider, apiKey: string): Promise<string[]> {
  if (provider !== 'gemini') return GENERATION_MODELS[provider] || [];

  const trimmedKey = (apiKey || '').trim();
  if (!trimmedKey) {
    return GENERATION_MODELS.gemini;
  }

  try {
    const res = await fetch('/api/models', {
      headers: {
        'x-gemini-key': trimmedKey,
        'x-api-key': trimmedKey,
        'x-api-provider': 'gemini',
      },
    });
    if (!res.ok) {
      return GENERATION_MODELS.gemini;
    }
    const json = await res.json();
    if (json && Array.isArray(json.models) && json.models.length > 0) {
      return json.models;
    }
  } catch {
    // Fallback to static configured Gemini models
  }

  return GENERATION_MODELS.gemini;
}

export async function executeWithFallback<T>(
  operation: (provider: ModelProvider, model: string, apiKey: string) => Promise<T>,
  role: 'generator' | 'evaluator' = 'generator'
): Promise<T> {
  const providerKeys = getAllProviderKeys();
  const preferred = getStoredProvider();
  const orderedProviders: ModelProvider[] = [];

  if (preferred && preferred !== 'auto' && preferred !== 'custom' && (PROVIDER_ORDER as string[]).includes(preferred)) {
    orderedProviders.push(preferred as ModelProvider);
  }
  for (const p of PROVIDER_ORDER) {
    if (!orderedProviders.includes(p)) {
      orderedProviders.push(p);
    }
  }

  let lastError: any = null;

  for (const provider of orderedProviders) {
    const apiKey = (providerKeys[provider] || getStoredApiKey(provider as ApiProvider) || '').trim();
    if (!apiKey) continue;

    const models =
      role === 'generator'
        ? await fetchDynamicModels(provider, apiKey)
        : EVALUATION_MODELS[provider] || GENERATION_MODELS[provider] || [];

    for (const model of models) {
      try {
        return await operation(provider, model, apiKey);
      } catch (err) {
        lastError = err;
      }
    }
  }

  throw lastError || new Error('No configured provider key succeeded.');
}

function resolveActiveProviderAndKey(): {
  provider: string;
  apiKey: string;
  providerKeys: Record<string, string>;
} {
  const providerKeys = getAllProviderKeys();
  let provider: string = getStoredProvider();
  let apiKey = getStoredApiKey(provider as ApiProvider) || providerKeys[provider] || '';

  if (!apiKey) {
    for (const candidate of PROVIDER_ORDER) {
      if (providerKeys[candidate]) {
        provider = candidate;
        apiKey = providerKeys[candidate];
        break;
      }
    }
  }

  return { provider, apiKey, providerKeys };
}

export const OFFICIAL_5_READING_QUESTION_TYPES = [
  'Factual Detail ("According to paragraph X...")',
  'Negative Factual (EXCEPT / NOT) ("According to the passage, all of the following are true EXCEPT:" or "Which of the following is NOT mentioned in paragraph X?")',
  'Vocabulary in Context ("The word \'X\' in paragraph Y is closest in meaning to:")',
  'Inference ("What can be inferred from paragraph X about...?" or "Which of the following does the passage imply about...?")',
  'Rhetorical Purpose / Relationship ("Why does the author mention \'X\' in paragraph Y?" or "How do the ideas in paragraph 2 relate to the ideas in paragraph 1?")',
] as const;

export const OFFICIAL_LISTENING_CONVERSATION_SPECS = {
  minWords: 75,
  maxWords: 110,
  minTurns: 8,
  maxTurns: 10,
  wordsPerTurn: '5-15 words',
  questionsCount: 2,
  requiresAudioExcerpt: true,
} as const;

export const OFFICIAL_LISTENING_ACADEMIC_TALK_SPECS = {
  minWords: 140,
  maxWords: 200,
  questionsCount: 4,
  requiresAudioExcerpt: true,
} as const;

export const OFFICIAL_BUILD_SENTENCE_SPEC = {
  itemsPerSet: 5,
  lowercaseTilesOnly: true,
  frameTypes: ['prefix_and_suffix', 'prefix_only', 'suffix_only', 'all_blanks'],
  includesInterrogativeQuestions: true,
  includesMultiWordPhraseChunks: true,
  minSingleWordTilesPerItem: 4,
  maxMultiWordPhraseTilesPerItem: 2,
  maxWordsPerPhraseTile: 3,
  includesGrammaticalDistractors: true,
} as const;

export const OFFICIAL_LISTEN_REPEAT_SPEC = {
  sentencesPerSet: 7,
  cohesiveSingleSpeakerScenario: true,
  directListenerAddress: true,
  wordCountProgression: '6-7 words (Sentence 1) up to 14-16 words (Sentence 7)',
} as const;

export async function callBackendGenerate(
  taskType: string,
  level: string = 'intermediate',
  topic: string = 'science-tech',
  promptData?: any,
  extraOptions?: Record<string, any> | boolean
): Promise<any> {
  const { provider, apiKey, providerKeys } = resolveActiveProviderAndKey();
  const optionsObj = typeof extraOptions === 'boolean' ? { coachMode: extraOptions } : extraOptions;
  const isCoachMode = Boolean(
    promptData === true ||
      promptData?.coachMode === true ||
      promptData?.mode === 'coach' ||
      optionsObj?.coachMode === true ||
      optionsObj?.mode === 'coach'
  );
  const basePromptData =
    typeof promptData === 'object' && promptData !== null
      ? { ...promptData, ...(isCoachMode ? { coachMode: true, mode: 'coach' } : {}) }
      : isCoachMode
      ? { coachMode: true, mode: 'coach' }
      : undefined;

  const isReadingAcademic =
    taskType === 'reading-academic' || taskType === 'reading_academic' || taskType === 'reading-passage';
  const isListeningWithExcerpt =
    taskType === 'listening-dialogue' ||
    taskType === 'listening_dialogue' ||
    taskType === 'listening-conversation' ||
    taskType === 'listening_conversation' ||
    taskType === 'listening-academic-talk' ||
    taskType === 'listening_academic_talk' ||
    taskType === 'listening-lecture' ||
    taskType === 'listening_lecture';
  const isBuildSentence =
    taskType === 'build-sentence' ||
    taskType === 'writing_build_sentence' ||
    taskType === 'writing-build-sentence';
  const isListenRepeat =
    taskType === 'listen-repeat' ||
    taskType === 'speaking_listen_repeat' ||
    taskType === 'speaking-listen-repeat';
  const readingQuestionFocus =
    basePromptData?.questionSkillFocus || basePromptData?.readingQuestionFocus || 'all';
  const enrichedPromptData = isReadingAcademic
    ? {
        ...(basePromptData || {}),
        questionSkillFocus: readingQuestionFocus,
        readingQuestionFocus,
        requiredQuestionTypes:
          readingQuestionFocus === 'all' ? OFFICIAL_5_READING_QUESTION_TYPES : undefined,
      }
    : isListeningWithExcerpt
    ? {
        ...(basePromptData || {}),
        requiresAudioExcerpt: true,
      }
    : isBuildSentence
    ? {
        ...(basePromptData || {}),
        ...OFFICIAL_BUILD_SENTENCE_SPEC,
        itemsPerSet: isCoachMode ? 8 : OFFICIAL_BUILD_SENTENCE_SPEC.itemsPerSet,
      }
    : isListenRepeat
    ? {
        ...(basePromptData || {}),
        ...OFFICIAL_LISTEN_REPEAT_SPEC,
        sentencesPerSet: isCoachMode ? 12 : OFFICIAL_LISTEN_REPEAT_SPEC.sentencesPerSet,
      }
    : basePromptData;

  const options = {
    provider,
    apiKey,
    customApiKey: apiKey,
    providerKeys,
    availableKeys: providerKeys,
    coachMode: isCoachMode,
    ...(optionsObj || {}),
  };

  return safeFetchJson('/api/generate-task', {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify({
      taskType,
      level,
      topic,
      coachMode: isCoachMode,
      promptData: enrichedPromptData,
      customApiKey: apiKey,
      provider,
      apiKey,
      providerKeys,
      availableKeys: providerKeys,
      options,
    }),
  });
}

export async function generateTaskContent(
  taskType: string,
  level: string = 'intermediate',
  topic: string = 'science-tech',
  promptData?: any,
  extraOptions?: Record<string, any> | boolean
): Promise<any> {
  const optionsObj = typeof extraOptions === 'boolean' ? { coachMode: extraOptions } : extraOptions;
  const res = await callBackendGenerate(taskType, level, topic, promptData, optionsObj);
  const rawData = res?.data || res;
  return normalizeTaskData(rawData, taskType);
}

export async function evaluateResponse(
  taskType: string,
  promptData: any,
  studentResponse: any,
  extraOptions?: Record<string, any>
): Promise<any> {
  const { provider, apiKey, providerKeys } = resolveActiveProviderAndKey();
  const localBaseline = evaluateResponseLocally(promptData, studentResponse, taskType, extraOptions);

  if (extraOptions?.mode === 'local' || (!hasAnyProviderKey() && !apiKey)) {
    return localBaseline;
  }

  const options = {
    provider,
    apiKey,
    customApiKey: apiKey,
    providerKeys,
    availableKeys: providerKeys,
    ...(extraOptions || {}),
  };

  try {
    const res = await safeFetchJson('/api/evaluate-response', {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({
        taskType,
        promptData,
        studentResponse,
        customApiKey: apiKey,
        provider,
        apiKey,
        providerKeys,
        availableKeys: providerKeys,
        options,
      }),
    });

    if (res && res.success === false) {
      return localBaseline;
    }
    const rawEval = res?.data || res;
    return mergeAiAndLocalEvaluation(rawEval, localBaseline);
  } catch (err) {
    console.warn('[geminiService] /api/evaluate-response failed, falling back to evaluateResponseLocally:', err);
    return localBaseline;
  }
}
