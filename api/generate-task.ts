import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleGenerateTask } from '../src/server/geminiHandler.ts';
import { extractErrorMessage } from '../src/server/geminiErrors.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  const customApiKey = (req.headers['x-gemini-api-key'] as string)?.trim() || (req.body?.apiKey?.trim() as string);

  try {
    const { taskType, level, topic } = req.body || {};
    const result = await handleGenerateTask(taskType, level, topic, customApiKey);
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    const msg = extractErrorMessage(error);
    return res.status(500).json({ success: false, error: msg });
  }
}
