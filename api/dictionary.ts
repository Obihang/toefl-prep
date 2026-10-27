import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleDictionaryEndpoint, wrapApiHandler } from '../src/server/handlers';

export default wrapApiHandler(async (req: VercelRequest, res: VercelResponse) => {
  return handleDictionaryEndpoint(req, res);
});
