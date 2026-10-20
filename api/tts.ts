import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleTtsEndpoint } from '../src/server/handlers.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }
  return handleTtsEndpoint(req, res);
}
