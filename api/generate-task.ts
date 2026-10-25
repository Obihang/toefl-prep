import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleGenerateTaskEndpoint, wrapApiHandler } from '../src/server/handlers.ts';

export default wrapApiHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }
  return await handleGenerateTaskEndpoint(req, res);
});
