import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleTestKeyEndpoint } from '../src/server/handlers';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }
  return handleTestKeyEndpoint(req, res);
}
