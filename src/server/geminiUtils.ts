import { GoogleGenAI } from '@google/genai';
import { isKeyError, isTransientError } from './geminiErrors.ts';

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
        console.warn(`Model ${model} attempt ${attempts} failed:`, err?.message || err);

        if (isKeyError(err)) {
          throw err;
        }

        if (attempts === 1 && isTransientError(err)) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        break;
      }
    }
  }

  throw lastError || new Error('All models in fallback chain failed');
}
