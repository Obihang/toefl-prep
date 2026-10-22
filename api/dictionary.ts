import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleDictionaryEndpoint } from '../src/server/handlers.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return handleDictionaryEndpoint(req, res);
}
