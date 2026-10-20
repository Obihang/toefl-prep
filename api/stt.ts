import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getApiConfig } from '../src/server/apiConfig.ts';
import { STT_MODEL } from '../src/config/models.ts';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '30mb',
    },
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  const apiConfig = getApiConfig(req.headers, req.body);
  const groqKey = req.headers['x-groq-key'] as string || (apiConfig.provider === 'groq' ? apiConfig.apiKey : '');

  if (!groqKey || !groqKey.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Groq API key required for Whisper speech-to-text. Paste your Groq key in Dashboard > Settings.',
    });
  }

  try {
    const { audioBase64, mimeType = 'audio/webm', prompt } = req.body || {};

    if (!audioBase64) {
      return res.status(400).json({ success: false, error: 'No audio data provided' });
    }

    // Client-side & server-side 25MB check
    const approxBytes = (audioBase64.length * 3) / 4;
    if (approxBytes > 25 * 1024 * 1024) {
      return res.status(413).json({ success: false, error: 'Audio recording exceeds 25 MB limit' });
    }

    const buffer = Buffer.from(audioBase64, 'base64');
    const ext = mimeType.includes('wav') ? 'wav' : mimeType.includes('ogg') ? 'ogg' : 'webm';
    const fileBlob = new Blob([buffer], { type: mimeType });

    const formData = new FormData();
    formData.append('file', fileBlob, `recording.${ext}`);
    formData.append('model', STT_MODEL);
    formData.append('language', 'en');
    formData.append('temperature', '0');
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'word');

    if (prompt && typeof prompt === 'string') {
      formData.append('prompt', prompt.trim());
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqKey.trim()}`,
        },
        body: formData,
        signal: controller.signal,
      });

      if (!groqRes.ok) {
        const errText = await groqRes.text();
        return res.status(groqRes.status).json({
          success: false,
          error: `Groq Whisper STT error (${groqRes.status}): ${errText}`,
        });
      }

      const data: any = await groqRes.json();
      const words = Array.isArray(data.words)
        ? data.words.map((w: any) => ({
            word: String(w.word || '').trim(),
            start: Number(w.start || 0),
            end: Number(w.end || 0),
          }))
        : [];

      return res.status(200).json({
        success: true,
        transcript: String(data.text || '').trim(),
        words,
        duration: Number(data.duration || 0),
        modelUsed: `Groq ${STT_MODEL}`,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error: any) {
    const msg = error?.message || 'Speech-to-text processing failed';
    return res.status(500).json({ success: false, error: msg });
  }
}
