import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleTtsCheckEndpoint, wrapApiHandler } from '../src/server/handlers';

export default wrapApiHandler(async (req: VercelRequest, res: VercelResponse) => {
  return handleTtsCheckEndpoint(req as any, res as any);
});
