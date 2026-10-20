import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleHealth } from '../src/server/handlers';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return handleHealth(req, res);
}
