import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleTranscribeAudio } from '../src/server/geminiHandler.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  const customApiKey = (req.headers['x-gemini-api-key'] as string)?.trim() || (req.body?.apiKey?.trim() as string);

  try {
    const { audioBase64, mimeType } = req.body || {};
    const { transcript, modelUsed } = await handleTranscribeAudio(audioBase64, mimeType, customApiKey);
    return res.status(200).json({ success: true, transcript, modelUsed });
  } catch (error: any) {
    const msg = error?.message || 'Audio transcription failed';
    if (msg === 'SPEECH_UNAVAILABLE') {
      return res.status(503).json({ success: false, error: 'SPEECH_UNAVAILABLE' });
    }
    return res.status(500).json({ success: false, error: msg });
  }
}
