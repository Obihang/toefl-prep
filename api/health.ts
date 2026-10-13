import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ status: 'error', error: `Method ${req.method} Not Allowed` });
  }

  const customApiKey = (req.headers['x-gemini-api-key'] as string)?.trim();
  const hasGeminiKey = !!(customApiKey || process.env.GEMINI_API_KEY);
  const deep = req.query?.deep;
  return res.status(200).json({ status: 'ok', hasGeminiKey, ...(deep ? { deepSkipped: true } : {}) });
}
