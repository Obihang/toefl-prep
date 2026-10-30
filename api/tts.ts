import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleTtsEndpoint, wrapApiHandler } from '../src/server/handlers';

export default wrapApiHandler(async (req: VercelRequest, res: VercelResponse) => {
  return handleTtsEndpoint(req, res);
});


