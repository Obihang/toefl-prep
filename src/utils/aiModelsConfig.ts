import { getStoredProvider } from './apiKey';
import { GENERATION_MODELS, EVALUATION_MODELS } from '../config/models';

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
    speakingWritingFeedback: GENERATION_MODELS.openrouter[0],
    readingListeningGeneration: GENERATION_MODELS.openrouter[0],
    vocabularyBank: GENERATION_MODELS.openrouter[0],
    mistakeNotebook: GENERATION_MODELS.openrouter[0],
    scoreProjectionStudyPlan: 'Client-side algorithmic analytics',
    voiceTranscription: 'Whisper STT',
    voiceSynthesis: 'AI Voice',
  },
  groq: {
    speakingWritingFeedback: GENERATION_MODELS.groq[0],
    readingListeningGeneration: GENERATION_MODELS.groq[0],
    vocabularyBank: GENERATION_MODELS.groq[0],
    mistakeNotebook: GENERATION_MODELS.groq[0],
    scoreProjectionStudyPlan: 'Client-side algorithmic analytics',
    voiceTranscription: 'Whisper Large v3 Turbo',
    voiceSynthesis: 'AI Voice',
  },
  nvidia: {
    speakingWritingFeedback: GENERATION_MODELS.nvidia[0],
    readingListeningGeneration: GENERATION_MODELS.nvidia[0],
    vocabularyBank: GENERATION_MODELS.nvidia[0],
    mistakeNotebook: GENERATION_MODELS.nvidia[0],
    scoreProjectionStudyPlan: 'Client-side algorithmic analytics',
    voiceTranscription: 'Whisper STT',
    voiceSynthesis: 'AI Voice',
  },
  openai: {
    speakingWritingFeedback: EVALUATION_MODELS.openai[0],
    readingListeningGeneration: GENERATION_MODELS.openai[0],
    vocabularyBank: GENERATION_MODELS.openai[0],
    mistakeNotebook: GENERATION_MODELS.openai[0],
    scoreProjectionStudyPlan: 'Client-side algorithmic analytics',
    voiceTranscription: 'whisper-1',
    voiceSynthesis: 'tts-1',
  },
  gemini: {
    speakingWritingFeedback: EVALUATION_MODELS.gemini[0],
    readingListeningGeneration: GENERATION_MODELS.gemini[0],
    vocabularyBank: GENERATION_MODELS.gemini[0],
    mistakeNotebook: GENERATION_MODELS.gemini[0],
    scoreProjectionStudyPlan: 'Client-side algorithmic analytics',
    voiceTranscription: 'Offline Whisper (whisper-base.en • Local Worker)',
    voiceSynthesis: 'AI Voice',
  },
};

export const DEFAULT_MODELS: PurposeModelMapping = {
  speakingWritingFeedback: EVALUATION_MODELS.gemini[0],
  readingListeningGeneration: GENERATION_MODELS.gemini[0],
  vocabularyBank: GENERATION_MODELS.gemini[0],
  mistakeNotebook: GENERATION_MODELS.gemini[0],
  scoreProjectionStudyPlan: 'Client-side algorithmic analytics',
  voiceTranscription: 'Whisper Large v3 Turbo',
  voiceSynthesis: 'AI Voice',
};

export const AVAILABLE_MODEL_CHOICES = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'google/gemini-2.5-flash-lite:free',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'meta-llama/llama-3.3-70b-instruct:free',
  'meta/llama-3.3-70b-instruct',
  'gpt-4o-mini',
  'gpt-4o',
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

export function setPurposeModel(purpose: keyof PurposeModelMapping, model: string): void {
  if (typeof localStorage === 'undefined') return;
  const provider = getStoredProvider();
  const current = getPurposeModels();
  const updated = { ...current, [purpose]: model };
  try {
    localStorage.setItem(`toefl_purpose_models_${provider}`, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('apiKeyUpdated'));
  } catch {}
}
