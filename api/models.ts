import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRoleModels } from '../src/server/modelRoles';
import { wrapApiHandler } from '../src/server/handlers';

export default wrapApiHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  const apiKey = (req.headers['x-gemini-key'] || req.headers['x-gemini-api-key'] || req.headers['x-api-key'] || req.headers['authorization'] || '').toString().replace('Bearer ', '').trim();
  const provider = (req.headers['x-api-provider'] || 'gemini').toString();

  const roleData = await getRoleModels(provider, apiKey);
  return res.status(200).json({
    success: true,
    models: roleData.all,
    generationModel: roleData.generationModel,
    evaluationModel: roleData.evaluationModel,
  });
});
