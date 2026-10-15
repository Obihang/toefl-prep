import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleSynthesizeSpeech } from '../src/server/geminiHandler.ts';
import { getApiConfig } from '../src/server/apiConfig.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  const apiConfig = getApiConfig(req.headers, req.body);

  try {
    const { text, voiceName } = req.body || {};
    const { audioBase64, mimeType, modelUsed } = await handleSynthesizeSpeech(text, voiceName, apiConfig);
    return res.status(200).json({ success: true, audioBase64, mimeType, modelUsed });
  } catch (error: any) {
    const msg = error?.message || 'TTS synthesis failed';
    if (msg === 'SPEECH_UNAVAILABLE') {
      return res.status(503).json({ success: false, error: 'SPEECH_UNAVAILABLE' });
    }
    return res.status(500).json({ success: false, error: msg });
  }
}
