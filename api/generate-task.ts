import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleGenerateTask } from '../src/server/geminiHandler.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  const customApiKey = (req.headers['x-gemini-api-key'] as string)?.trim();
  const hasKey = customApiKey || process.env.GEMINI_API_KEY;
  if (!hasKey) {
    return res.status(400).json({
      success: false,
      error: 'No Gemini API key provided. Add yours in Dashboard > API Key',
    });
  }

  try {
    const { taskType, level, topic } = req.body || {};
    const result = await handleGenerateTask(taskType, level, topic, customApiKey);
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || 'Generation failed' });
  }
}
