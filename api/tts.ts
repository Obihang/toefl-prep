import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleTtsEndpoint, wrapApiHandler } from '../src/server/handlers.ts';

export default wrapApiHandler(async (req: VercelRequest, res: VercelResponse) => {
  return handleTtsEndpoint(req, res);
});


