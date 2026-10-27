import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleSttEndpoint, wrapApiHandler } from '../src/server/handlers';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '5mb',
    },
  },
};

export default wrapApiHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }
  return await handleSttEndpoint(req, res);
});
