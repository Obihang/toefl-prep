import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleTestApiKey } from '../src/server/geminiHandler.ts';
import { getStatus, extractErrorMessage, isKeyError, isTransientError } from '../src/server/geminiErrors.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  const customApiKey = (req.headers['x-gemini-api-key'] as string)?.trim() || (req.body?.apiKey?.trim() as string);
  const apiKey = customApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(400).json({
      success: false,
      error: 'No Gemini API key provided. Add yours in Dashboard > Settings & API Key',
    });
  }

  try {
    const result = await handleTestApiKey(apiKey);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Test key error:', error);
    const errMsg = extractErrorMessage(error);
    const status = getStatus(error);
    let httpStatus = 400;
    if (isKeyError(error)) {
      httpStatus = 401;
    } else if (isTransientError(error)) {
      httpStatus = 429;
    } else if (status === 500) {
      httpStatus = 500;
    }

    return res.status(httpStatus).json({ success: false, error: errMsg });
  }
}
