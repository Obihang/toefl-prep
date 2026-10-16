import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleTranscribeAudio } from '../src/server/geminiHandler.ts';
import { getApiConfig } from '../src/server/apiConfig.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  const apiConfig = getApiConfig(req.headers, req.body);

  try {
    const { audioBase64, mimeType } = req.body || {};
    const { transcript, modelUsed } = await handleTranscribeAudio(audioBase64, mimeType, apiConfig);
    return res.status(200).json({ success: true, transcript, modelUsed });
  } catch (error: any) {
    const msg = error?.message || 'Audio transcription failed';
    if (msg === 'SPEECH_UNAVAILABLE') {
      return res.status(503).json({ success: false, error: 'SPEECH_UNAVAILABLE' });
    }
    return res.status(500).json({ success: false, error: msg });
  }
}
