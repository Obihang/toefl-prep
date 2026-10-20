/**
 * Configuration for TOEFL Prep Studio BYOK (Bring-Your-Own-Key) models.
 * Users can customize these model IDs as desired.
 */

export type ModelProvider = 'gemini' | 'groq' | 'openrouter';

export const GENERATION_MODELS: Record<ModelProvider, string[]> = {
  gemini: ['gemini-2.5-flash-lite', 'gemini-2.5-flash'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
  openrouter: ['google/gemini-2.5-flash-lite', 'meta-llama/llama-3.3-70b-instruct'],
};

export const EVALUATION_MODELS: Record<ModelProvider, string[]> = {
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  groq: ['llama-3.3-70b-versatile'],
  openrouter: ['anthropic/claude-3.5-sonnet', 'google/gemini-2.5-flash'],
};

export const STT_MODEL = 'whisper-large-v3-turbo';

export const PROVIDER_ORDER: ModelProvider[] = ['gemini', 'groq', 'openrouter'];

export interface ProviderStatus {
  provider: ModelProvider;
  isAvailable: boolean;
  rateLimitedUntil: number | null;
  lastError: string | null;
}
