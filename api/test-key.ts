import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { MODELS } from '../src/constants/models.ts';

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

    // NO curated fallback and NO retry
    await ai.models.generateContent({
      model: MODELS.GENERATION,
      contents: 'Reply with the single word OK',
      config: {
        temperature: 0.1,
      },
    });

    return res.status(200).json({ success: true, model: MODELS.GENERATION });
  } catch (error: any) {
    console.error('Test key error:', error);
    let errMsg = error?.message || 'API key validation failed';
    // Remove API key if accidentally present in message
    errMsg = errMsg.replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED]');

    let status = 400;
    const lower = errMsg.toLowerCase();
    if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('invalid api key')) {
      status = 401;
    } else if (lower.includes('429') || lower.includes('quota') || lower.includes('resource_exhausted')) {
      status = 429;
    } else if (lower.includes('500') || lower.includes('internal')) {
      status = 500;
    }

    return res.status(status).json({ success: false, error: errMsg });
  }
}
