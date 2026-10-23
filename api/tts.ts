import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleTtsEndpoint } from '../src/server/handlers.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return handleTtsEndpoint(req, res);
}


