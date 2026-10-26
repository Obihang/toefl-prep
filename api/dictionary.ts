import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleDictionaryEndpoint, wrapApiHandler } from '../src/server/handlers.ts';

export default wrapApiHandler(async (req: VercelRequest, res: VercelResponse) => {
  return handleDictionaryEndpoint(req, res);
});
