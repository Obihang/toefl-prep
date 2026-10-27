import { GoogleGenAI } from '@google/genai';
import { isKeyError, getStatus, isQuotaExhaustedError, redactSensitiveInfo } from './geminiErrors';
import { isModelGone, markModelDead, getLastListError, isModelDead } from './modelRoles';

function isTransientServerBusy(err: any): boolean {
  const status = getStatus(err);
  if (status === 503 || status === 500) return true;
  const msg = String(err?.message || '').toLowerCase();
  return (
    msg.includes('503') ||
    msg.includes('unavailable') ||
    msg.includes('overloaded')
  );
}

export async function generateWithFallback<T>(
  ai: GoogleGenAI,
  chain: string[],
  requestFn: (model: string) => Promise<T>,
  options?: { provider?: string }
): Promise<{ result: T; modelUsed: string }> {
  const activeChain = (chain || []).filter((m) => !isModelDead(m));

  if (activeChain.length === 0) {
    const listErr = getLastListError(options?.provider || 'gemini');
    const status = listErr?.status || 400;
    const msg = listErr?.message || 'Empty or unavailable model list';
    throw new Error(`Could not list models for this key (HTTP ${status}: ${msg})`);
  }

  let lastError: any = null;

  for (const model of activeChain) {
    let attempts = 0;
    while (attempts < 2) {
      attempts++;
      try {
        const result = await requestFn(model);
        return { result, modelUsed: model };
      } catch (err: any) {
        lastError = err;
        const errMsg = String(err?.message || err);
        const status = getStatus(err);
        const isQuota = isQuotaExhaustedError(err);
        
        if (isKeyError(err)) {
          throw err;
        }

        if (isModelGone(status, errMsg)) {
          markModelDead(model);
          console.warn(`Model ${model} is retired or gone (HTTP ${status}), marked dead for 24h. Trying next model...`);
          break;
        }

        if (isQuota) {
          console.warn(`Model ${model} quota exhausted (${attempts}/2): switching to next candidate.`);
        } else {
          console.warn(`Model ${model} attempt ${attempts} failed:`, redactSensitiveInfo(errMsg.slice(0, 200)));
        }

        if (isQuota) {
          break;
        }

        if (attempts === 1 && isTransientServerBusy(err)) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        break;
      }
    }
  }

  throw lastError || new Error('All models in fallback chain failed');
}
