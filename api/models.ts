import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST' && req.method !== 'GET') {
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
    }

    const apiKey = (req.headers['x-api-key'] || req.headers['authorization'] || '').toString().replace('Bearer ', '').trim();
    const provider = (req.headers['x-api-provider'] || 'gemini').toString();

    if (provider === 'groq' || provider === 'nvidia' || provider === 'openrouter') {
      const baseUrls: Record<string, string> = {
        nvidia: 'https://integrate.api.nvidia.com/v1',
        groq: 'https://api.groq.com/openai/v1',
        openrouter: 'https://openrouter.ai/api/v1',
      };
      const baseUrl = baseUrls[provider];
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };
      const response = await fetch(`${baseUrl}/models`, {
        method: 'GET',
        headers,
      });
      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ success: false, error: errText });
      }
      const data = await response.json();
      return res.status(200).json({ success: true, models: data });
    }

    return res.status(200).json({
      success: true,
      models: ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest'],
    });
  } catch (err: any) {
    console.error('Models route error:', err);
    return res.status(500).json({ success: false, error: String(err?.message || err) });
  }
}
