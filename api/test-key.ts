import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { GENERATION_CHAIN } from '../src/constants/models.ts';

async function generateWithFallback(
  ai: GoogleGenAI,
  chain: string[],
  requestFn: (model: string) => Promise<any>
): Promise<{ result: any; modelUsed: string }> {
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
        const msg = (err?.message || '').toLowerCase();
        const status = err?.status || err?.statusCode || 0;
        const isKeyErr = status === 400 || status === 401 || status === 403 ||
          msg.includes('400') || msg.includes('401') || msg.includes('403') ||
          msg.includes('invalid api key') || msg.includes('api_key_invalid') ||
          msg.includes('permission denied') || msg.includes('unauthenticated') ||
          msg.includes('api key not valid');

        if (isKeyErr) throw err;

        if (attempts === 1 && (status === 503 || status === 429 || status === 404 || status === 500 ||
            msg.includes('503') || msg.includes('429') || msg.includes('404') ||
            msg.includes('unavailable') || msg.includes('resource_exhausted') ||
            msg.includes('quota') || msg.includes('overloaded') || msg.includes('not found'))) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        break;
      }
    }
  }
  throw lastError || new Error('All models failed');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  const customApiKey = (req.headers['x-gemini-api-key'] as string)?.trim();
  const apiKey = customApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(400).json({
      success: false,
      error: 'No Gemini API key provided. Add yours in Dashboard > API Key',
    });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const { modelUsed } = await generateWithFallback(ai, GENERATION_CHAIN, async (model) => {
      await ai.models.generateContent({
        model,
        contents: 'Reply with the single word OK',
        config: {
          temperature: 0.1,
        },
      });
      return true;
    });

    return res.status(200).json({ success: true, message: `Key works (${modelUsed})`, model: modelUsed });
  } catch (error: any) {
    console.error('Test key error:', error);
    let errMsg = error?.message || 'API key validation failed';
    errMsg = errMsg.replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED]');

    if (errMsg.toLowerCase().includes('429') || errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('resource_exhausted')) {
      errMsg = "Your key's free daily Gemini quota is used up. It usually resets at midnight Pacific time (PT). " + errMsg;
    }

    let status = 400;
    const lower = errMsg.toLowerCase();
    if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('invalid api key') || lower.includes('api_key_invalid')) {
      status = 401;
    } else if (lower.includes('429') || lower.includes('quota') || lower.includes('resource_exhausted')) {
      status = 429;
    } else if (lower.includes('500') || lower.includes('internal')) {
      status = 500;
    }

    return res.status(status).json({ success: false, error: errMsg });
  }
}
