/**
 * Configuration for TOEFL Prep Studio BYOK (Bring-Your-Own-Key) models.
 * Standardized on Gemini (Primary generation/grading) & Groq (Primary STT, fallback generation).
 */

export type ModelProvider = 'gemini' | 'groq';

export const GENERATION_MODELS: Record<ModelProvider, string[]> = {
  gemini: [], // discovered dynamically via /models endpoint
  groq: ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'],
};

export const EVALUATION_MODELS: Record<ModelProvider, string[]> = {
  gemini: [], // discovered dynamically via /models endpoint
  groq: ['openai/gpt-oss-120b'],
};

export const STT_MODEL = 'whisper-large-v3-turbo';

export const PROVIDER_ORDER: ModelProvider[] = ['gemini', 'groq'];

export interface ProviderStatus {
  provider: ModelProvider;
  isAvailable: boolean;
  rateLimitedUntil: number | null;
  lastError: string | null;
}
