import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleEvaluateResponse } from '../src/server/geminiHandler.ts';
import { extractErrorMessage, isKeyError, isTransientError, getStatus } from '../src/server/geminiErrors.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  const customApiKey = (req.headers['x-gemini-api-key'] as string)?.trim() || (req.body?.apiKey?.trim() as string);
  const hasKey = customApiKey || process.env.GEMINI_API_KEY;
  if (!hasKey) {
    return res.status(400).json({
      success: false,
      error: 'No Gemini API key provided. Add yours in Dashboard > Settings & API Key',
    });
  }

  try {
    const { taskType, promptData, studentResponse } = req.body || {};
    const result = await handleEvaluateResponse(taskType, promptData, studentResponse, customApiKey);
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    const msg = extractErrorMessage(error);
    const status = getStatus(error);
    let httpStatus = 500;
    if (isKeyError(error)) {
      httpStatus = 401;
    } else if (isTransientError(error)) {
      httpStatus = 429;
    } else if (status >= 400 && status <= 599) {
      httpStatus = status;
    }
    return res.status(httpStatus).json({ success: false, error: msg });
  }
}
