import { callOpenAiCompatibleChat } from './llmClient.ts';
import type { LlmCallOptions } from './llmClient.ts';
import { getRoleModels } from './modelRoles.ts';

const FALLBACK_MODELS_BY_PROVIDER: Record<string, string[]> = {
  openrouter: [
    'meta-llama/llama-3.3-70b-instruct:free',
    'qwen/qwen-2.5-72b-instruct:free',
    'meta-llama/llama-3.1-8b-instruct:free',
    'deepseek/deepseek-r1:free',
    'mistralai/mistral-small-24b-instruct-2501:free',
    'google/gemini-2.0-flash-thinking-exp:free',
    'google/gemini-2.0-flash-001',
    'meta-llama/llama-3.3-70b-instruct',
  ],
  groq: [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'gemma2-9b-it',
  ],
  nvidia: [
    'meta/llama-3.3-70b-instruct',
    'meta/llama-3.1-8b-instruct',
  ],
};

export async function callChatWithHealing(
  options: LlmCallOptions & { forceRefreshRoles?: boolean }
): Promise<{ text: string; modelUsed: string }> {
  const provider = (options.provider || 'custom').toLowerCase();
  const isRecoverableProvider = provider === 'nvidia' || provider === 'groq' || provider === 'openrouter';

  try {
    return await callOpenAiCompatibleChat(options);
  } catch (err: any) {
    if (!isRecoverableProvider || !options.apiKey) {
      throw err;
    }

    const errMessage = String(err?.message || '').toLowerCase();
    const is404 =
      err?.status === 404 ||
      errMessage.includes('(404)') ||
      errMessage.includes('model does not exist') ||
      errMessage.includes('not found') ||
      errMessage.includes('decommissioned') ||
      errMessage.includes('no access');

    const isQuotaOr429 =
      err?.status === 429 ||
      errMessage.includes('429') ||
      errMessage.includes('rate limit') ||
      errMessage.includes('quota') ||
      errMessage.includes('resource_exhausted');

    // If neither 404 nor quota/429, don't retry
    if (!is404 && !isQuotaOr429) {
      throw err;
    }

    // Determine alternative candidates
    let candidatesToTry: string[] = [];
    const defaultModel =
      provider === 'openrouter'
        ? 'meta-llama/llama-3.3-70b-instruct:free'
        : provider === 'groq'
        ? 'llama-3.3-70b-versatile'
        : 'meta/llama-3.3-70b-instruct';
    const attemptedModel = options.model || defaultModel;

    if (isQuotaOr429) {
      const predefined = FALLBACK_MODELS_BY_PROVIDER[provider] || [];
      candidatesToTry = predefined.filter((m) => m !== attemptedModel);
    } else {
      // 404 or decommissioned: fetch fresh models from provider probe
      try {
        const roles = await getRoleModels(provider, options.apiKey, true);
        const fresh = roles.chat || [];
        candidatesToTry = fresh.filter((m) => m !== attemptedModel).slice(0, 3);
      } catch {
        candidatesToTry = (FALLBACK_MODELS_BY_PROVIDER[provider] || []).filter((m) => m !== attemptedModel);
      }
    }

    let lastError = err;
    for (const altModel of candidatesToTry) {
      try {
        console.warn(`[Auto-Fallback] Trying fallback model ${altModel} for ${provider} due to ${isQuotaOr429 ? 'quota/rate limit' : 'model 404'}...`);
        const res = await callOpenAiCompatibleChat({
          ...options,
          model: altModel,
        });
        return res;
      } catch (retryErr: any) {
        lastError = retryErr;
      }
    }

    if (isQuotaOr429) {
      throw new Error(
        `Rate limit reached for ${provider}. Fallback models were attempted. Please wait a moment for limits to reset or switch to another provider.`
      );
    }

    throw lastError;
  }
}
