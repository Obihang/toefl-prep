import { GoogleGenAI } from '@google/genai';
import { isKeyError, getStatus, isQuotaExhaustedError } from './geminiErrors.ts';

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
  requestFn: (model: string) => Promise<T>
): Promise<{ result: T; modelUsed: string }> {
  let lastError: any = null;

  for (const model of chain) {
    let attempts = 0;
    while (attempts < 2) {
      attempts++;
      try {
        const result = await requestFn(model);
        return { result, modelUsed: model };
      } catch (err: any) {
        lastError = err;
        const errMsg = String(err?.message || err);
        const isQuota = isQuotaExhaustedError(err);
        
        if (isKeyError(err)) {
          throw err;
        }

        if (isQuota) {
          console.warn(`Model ${model} quota exhausted (${attempts}/2): switching to next candidate.`);
        } else {
          console.warn(`Model ${model} attempt ${attempts} failed:`, errMsg.slice(0, 200));
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
