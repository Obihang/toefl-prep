/**
 * Configuration for TOEFL Prep Studio BYOK (Bring-Your-Own-Key) models.
 * EDITING INSTRUCTIONS: Modify the model ID strings in the arrays below to update available models.
 */

export type ModelProvider = 'gemini' | 'groq' | 'openrouter' | 'nvidia' | 'openai';

export const GENERATION_MODELS: Record<ModelProvider, string[]> = {
  gemini: ['gemini-2.5-flash-lite', 'gemini-2.5-flash'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
  openrouter: ['google/gemini-2.5-flash-lite:free', 'meta-llama/llama-3.3-70b-instruct:free'],
  nvidia: ['meta/llama-3.3-70b-instruct'],
  openai: ['gpt-4o-mini'],
};

export const EVALUATION_MODELS: Record<ModelProvider, string[]> = {
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  groq: ['llama-3.3-70b-versatile'],
  openrouter: ['google/gemini-2.5-flash:free'],
  nvidia: ['meta/llama-3.3-70b-instruct'],
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
