import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRoleModels } from '../src/server/modelRoles.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST' && req.method !== 'GET') {
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
    }

    const apiKey = (req.headers['x-api-key'] || req.headers['authorization'] || '').toString().replace('Bearer ', '').trim();
    const provider = (req.headers['x-api-provider'] || 'gemini').toString();

    const roleData = await getRoleModels(provider, apiKey);
    return res.status(200).json({
      success: true,
      models: roleData.all,
      generationModel: roleData.generationModel,
      evaluationModel: roleData.evaluationModel,
    });
  } catch (err: any) {
    console.error('Models route error:', err);
    return res.status(500).json({ success: false, error: String(err?.message || err) });
  }
}
