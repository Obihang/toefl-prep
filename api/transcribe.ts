import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleSttEndpoint } from '../src/server/handlers.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', ['POST']);
      return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
    }
    return await handleSttEndpoint(req, res);
  } catch (err: any) {
    console.error('Transcribe route error:', err);
    return res.status(500).json({ success: false, error: String(err?.message || err) });
  }
}
