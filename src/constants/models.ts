import { GENERATION_MODELS, EVALUATION_MODELS, STT_MODEL, PROVIDER_ORDER } from '../config/models';

const DEFAULT_GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];

export const GENERATION_CHAIN =
  GENERATION_MODELS.gemini.length > 0 ? GENERATION_MODELS.gemini : DEFAULT_GEMINI_MODELS;
export const EVALUATION_CHAIN =
  EVALUATION_MODELS.gemini.length > 0 ? EVALUATION_MODELS.gemini : DEFAULT_GEMINI_MODELS;
export const TTS_CHAIN: string[] = [];
export const TRANSCRIBE_CHAIN =
  GENERATION_MODELS.gemini.length > 0 ? GENERATION_MODELS.gemini : DEFAULT_GEMINI_MODELS;

export const MODELS = {
  GENERATION: GENERATION_CHAIN[0] || 'gemini-2.5-flash',
  EVALUATION: EVALUATION_CHAIN[0] || 'gemini-2.5-flash',
  TTS: TTS_CHAIN[0] || '',
  TRANSCRIBE_PRIMARY: TRANSCRIBE_CHAIN[0] || 'gemini-2.5-flash',
  TRANSCRIBE_FALLBACK: TRANSCRIBE_CHAIN[1] || 'gemini-2.0-flash',
  TRANSCRIBE_LAST_RESORT: TRANSCRIBE_CHAIN[2] || 'gemini-2.0-flash',
};

export { STT_MODEL, PROVIDER_ORDER };

