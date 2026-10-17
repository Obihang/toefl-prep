export interface PurposeModelMapping {
  speakingWritingFeedback: string;
  readingListeningGeneration: string;
  vocabularyBank: string;
  mistakeNotebook: string;
  scoreProjectionStudyPlan: string;
  voiceTranscription: string;
  voiceSynthesis: string;
}

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
  'gpt-4o-mini',
  'llama-3.3-70b',
  'deepseek-chat',
  'Client-side algorithmic analytics',
  'Web Speech API / Whisper Large v3',
  'Web Speech / Kokoro / AI Voice',
];

export function getPurposeModels(): PurposeModelMapping {
  if (typeof localStorage === 'undefined') return DEFAULT_MODELS;
  try {
    const stored = localStorage.getItem('toefl_purpose_models');
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_MODELS, ...parsed };
    }
  } catch {}
  return DEFAULT_MODELS;
}

export function setPurposeModel(purpose: keyof PurposeModelMapping, modelName: string) {
  if (typeof localStorage === 'undefined') return;
  const current = getPurposeModels();
  current[purpose] = modelName;
  localStorage.setItem('toefl_purpose_models', JSON.stringify(current));
}
