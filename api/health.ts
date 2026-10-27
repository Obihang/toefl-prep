import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleHealth, wrapApiHandler } from '../src/server/handlers';

export default wrapApiHandler(async (req: VercelRequest, res: VercelResponse) => {
  return handleHealth(req, res);
});
