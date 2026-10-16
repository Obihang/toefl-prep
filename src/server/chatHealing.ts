import { callOpenAiCompatibleChat, LlmCallOptions } from './llmClient.ts';
import { getRoleModels } from './modelRoles.ts';

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

    // Never retry on 429 or non-404 errors
    if (!is404 || err?.status === 429 || errMessage.includes('429')) {
      throw err;
    }

    // Fetch fresh models
    let freshChatModels: string[] = [];
    try {
      const roles = await getRoleModels(provider, options.apiKey, true);
      freshChatModels = roles.chat || [];
    } catch {
      throw err;
    }

    const originalModel = options.model || '';
    const candidatesToTry = freshChatModels.filter((m) => m !== originalModel).slice(0, 2);

    let lastError = err;
    for (const altModel of candidatesToTry) {
      try {
        const res = await callOpenAiCompatibleChat({
          ...options,
          model: altModel,
        });
        return res;
      } catch (retryErr: any) {
        lastError = retryErr;
      }
    }

    throw lastError;
  }
}
