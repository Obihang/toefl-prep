import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleEvaluateResponseEndpoint, wrapApiHandler } from '../src/server/handlers';

export default wrapApiHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }
  return await handleEvaluateResponseEndpoint(req, res);
});
