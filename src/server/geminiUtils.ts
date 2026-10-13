import { GoogleGenAI } from '@google/genai';
import { isKeyError, getStatus, isQuotaExhaustedError } from './geminiErrors.ts';

let lastWorkingModel: string | null = null;

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

  // Prioritize the model that was already verified to work for this key, then fallback to original order
  const orderedChain =
    lastWorkingModel && chain.includes(lastWorkingModel)
      ? [lastWorkingModel, ...chain.filter((m) => m !== lastWorkingModel)]
      : chain;

  for (const model of orderedChain) {
    let attempts = 0;
    while (attempts < 2) {
      attempts++;
      try {
        const result = await requestFn(model);
        lastWorkingModel = model;
        return { result, modelUsed: model };
      } catch (err: any) {
        lastError = err;
        const errMsg = String(err?.message || err);
        const isQuota = isQuotaExhaustedError(err);
        
        // Log brief notice rather than huge stack trace on expected quota/transient limits
        if (isQuota) {
          console.warn(`Model ${model} quota exhausted (${attempts}/2): switching to next candidate.`);
        } else {
          console.warn(`Model ${model} attempt ${attempts} failed:`, errMsg.slice(0, 200));
        }

        if (isKeyError(err)) {
          throw err;
        }

        // On quota exhaustion (429), never retry the exact same model after 1s.
        // Immediately try the next model in the fallback chain.
        if (isQuota) {
          break;
        }

        // Retry once after 1 second only on transient server overload (503/UNAVAILABLE)
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
