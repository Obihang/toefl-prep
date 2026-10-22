/**
 * Configuration for TOEFL Prep Studio BYOK (Bring-Your-Own-Key) models.
 * EDITING INSTRUCTIONS: Modify the model ID strings in the arrays below to update available models.
 */

export type ModelProvider = 'gemini' | 'groq' | 'openrouter' | 'nvidia' | 'openai';

export const GENERATION_MODELS: Record<ModelProvider, string[]> = {
  gemini: [], // Edit me: discovered dynamically via /models endpoint
  groq: ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'],
  openrouter: [],
  nvidia: [],
  openai: ['gpt-4o-mini'],
};

export const EVALUATION_MODELS: Record<ModelProvider, string[]> = {
  gemini: [], // Edit me: discovered dynamically via /models endpoint
  groq: ['openai/gpt-oss-120b'],
  openrouter: [],
  nvidia: [],
  openai: ['gpt-4o'],
};

export const STT_MODEL = 'whisper-large-v3-turbo';

export const PROVIDER_ORDER: ModelProvider[] = ['gemini', 'groq', 'openrouter', 'nvidia', 'openai'];

export interface ProviderStatus {
  provider: ModelProvider;
  isAvailable: boolean;
  rateLimitedUntil: number | null;
  lastError: string | null;
}
