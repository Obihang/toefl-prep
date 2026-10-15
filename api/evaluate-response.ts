import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getApiConfig } from '../src/server/apiConfig.ts';
import { handleEvaluateResponse } from '../src/server/geminiHandler.ts';
import { extractErrorMessage, isKeyError, isTransientError, getStatus } from '../src/server/geminiErrors.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  try {
    const config = getApiConfig(req.headers, req.body);
    const hasKey = config.apiKey || (config.provider === 'gemini' && !!process.env.GEMINI_API_KEY) || config.provider === 'custom';
    if (!hasKey) {
      return res.status(400).json({
        success: false,
        error: `No API key provided for ${config.provider}. Add yours in Dashboard > Settings & API Key`,
      });
    }

    const { taskType, promptData, studentResponse } = req.body || {};
    const result = await handleEvaluateResponse(taskType, promptData, studentResponse, config);
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
