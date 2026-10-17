import { getStoredProvider } from './apiKey';

export interface PurposeModelMapping {
  speakingWritingFeedback: string;
  readingListeningGeneration: string;
  vocabularyBank: string;
  mistakeNotebook: string;
  scoreProjectionStudyPlan: string;
  voiceTranscription: string;
  voiceSynthesis: string;
}

export const PROVIDER_OPTIMAL_MODELS: Record<string, Partial<PurposeModelMapping>> = {
  openrouter: {
    speakingWritingFeedback: 'meta-llama/llama-3.3-70b-instruct:free',
    readingListeningGeneration: 'meta-llama/llama-3.3-70b-instruct:free',
    vocabularyBank: 'meta-llama/llama-3.3-70b-instruct:free',
    mistakeNotebook: 'meta-llama/llama-3.3-70b-instruct:free',
    scoreProjectionStudyPlan: 'Client-side algorithmic analytics',
    voiceTranscription: 'Web Speech API / Whisper STT',
    voiceSynthesis: 'Web Speech / Kokoro',
  },
  groq: {
    speakingWritingFeedback: 'llama-3.3-70b-versatile',
    readingListeningGeneration: 'llama-3.3-70b-versatile',
    vocabularyBank: 'llama-3.3-70b-versatile',
    mistakeNotebook: 'llama-3.3-70b-versatile',
    scoreProjectionStudyPlan: 'Client-side algorithmic analytics',
    voiceTranscription: 'Whisper Large v3 (ultra-fast LPU)',
    voiceSynthesis: 'Web Speech / Kokoro',
  },
  nvidia: {
    speakingWritingFeedback: 'meta/llama-3.3-70b-instruct',
    readingListeningGeneration: 'meta/llama-3.3-70b-instruct',
    vocabularyBank: 'meta/llama-3.3-70b-instruct',
    mistakeNotebook: 'meta/llama-3.3-70b-instruct',
    scoreProjectionStudyPlan: 'Client-side algorithmic analytics',
    voiceTranscription: 'Web Speech API / Whisper STT',
    voiceSynthesis: 'Web Speech / Kokoro',
  },
  openai: {
    speakingWritingFeedback: 'gpt-4o',
    readingListeningGeneration: 'gpt-4o-mini',
    vocabularyBank: 'gpt-4o-mini',
    mistakeNotebook: 'gpt-4o-mini',
    scoreProjectionStudyPlan: 'Client-side algorithmic analytics',
    voiceTranscription: 'whisper-1',
    voiceSynthesis: 'tts-1',
  },
  gemini: {
    speakingWritingFeedback: 'gemini-3.8-flash (thinking/rubric)',
    readingListeningGeneration: 'gemini-3.8-flash',
    vocabularyBank: 'gemini-3.8-flash',
    mistakeNotebook: 'gemini-3.8-flash',
    scoreProjectionStudyPlan: 'Client-side algorithmic analytics',
    voiceTranscription: 'gemini-3.8-flash / Web Speech API',
    voiceSynthesis: 'Gemini Speech / Web Speech / Kokoro',
  },
};

export const DEFAULT_MODELS: PurposeModelMapping = {
  speakingWritingFeedback: 'gemini-3.8-flash (thinking/rubric)',
  readingListeningGeneration: 'gemini-3.8-flash',
  vocabularyBank: 'gemini-3.8-flash',
  mistakeNotebook: 'gemini-3.8-flash',
  scoreProjectionStudyPlan: 'Client-side algorithmic analytics',
  voiceTranscription: 'Web Speech API / Whisper Large v3',
  voiceSynthesis: 'Web Speech / Kokoro / AI Voice',
};

export const AVAILABLE_MODEL_CHOICES = [
  'gemini-3.8-flash',
  'gemini-2.5-flash',
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemini-2.0-flash-exp:free',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'meta/llama-3.3-70b-instruct',
  'gpt-4o-mini',
  'gpt-4o',
  'deepseek-chat',
  'Client-side algorithmic analytics',
  'Web Speech API / Whisper Large v3',
  'Web Speech / Kokoro',
];

export function getPurposeModels(): PurposeModelMapping {
  const provider = typeof localStorage !== 'undefined' ? getStoredProvider() : 'gemini';
  const providerDefaults = PROVIDER_OPTIMAL_MODELS[provider] || DEFAULT_MODELS;
  const base = { ...DEFAULT_MODELS, ...providerDefaults };

  if (typeof localStorage === 'undefined') return base;
  try {
    const stored = localStorage.getItem(`toefl_purpose_models_${provider}`) || localStorage.getItem('toefl_purpose_models');
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...base, ...parsed };
    }
  } catch {}
  return base;
}

export function setPurposeModel(purpose: keyof PurposeModelMapping, modelName: string) {
  if (typeof localStorage === 'undefined') return;
  const provider = getStoredProvider();
  const current = getPurposeModels();
  current[purpose] = modelName;
  localStorage.setItem(`toefl_purpose_models_${provider}`, JSON.stringify(current));
}
