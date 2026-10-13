import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { GENERATION_CHAIN } from '../src/constants/models.ts';
import { generateWithFallback } from '../src/server/geminiUtils.ts';
import { redactKey, isKeyError, isTransientError } from '../src/server/geminiErrors.ts';

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
    let errMsg = redactKey(error?.message || 'API key validation failed');

    if (errMsg.toLowerCase().includes('429') || errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('resource_exhausted')) {
      errMsg = "Your key's free daily Gemini quota is used up. It usually resets at midnight Pacific time (PT). " + errMsg;
    }

    let status = 400;
    if (isKeyError(error)) {
      status = 401;
    } else if (isTransientError(error)) {
      status = 429;
    } else if (error?.status === 500) {
      status = 500;
    }

    return res.status(status).json({ success: false, error: errMsg });
  }
}
