import type { VercelRequest, VercelResponse } from '@vercel/node';
import { EdgeTTS } from 'node-edge-tts';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Memory/tmp cache for audio to avoid re-synthesizing within server runtime
const memoryCache = new Map<string, { audioBase64: string; audioUrl?: string }>();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  try {
    const { text, voiceName, speaker, rate = 1.0 } = req.body || {};

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ success: false, error: 'Text is required for TTS synthesis' });
    }

    const cleanText = text.trim();

    // Map speaker/gender to authentic English neural voices
    let selectedVoice = 'en-US-JennyNeural';
    const lowerVoice = (voiceName || '').toLowerCase();
    const lowerSpeaker = (speaker || '').toLowerCase();

    if (
      lowerSpeaker.includes('b') ||
      lowerSpeaker.includes('prof') ||
      lowerSpeaker.includes('male') ||
      lowerVoice.includes('guy') ||
      lowerVoice.includes('fenrir') ||
      lowerVoice.includes('puck') ||
      lowerVoice.includes('male')
    ) {
      selectedVoice = 'en-US-GuyNeural';
    } else if (
      lowerVoice.includes('aria') ||
      lowerVoice.includes('emma') ||
      lowerVoice.includes('sarah') ||
      lowerVoice.includes('female')
    ) {
      selectedVoice = 'en-US-JennyNeural';
    } else if (voiceName && voiceName.includes('Neural')) {
      selectedVoice = voiceName;
    }

    // Convert numeric rate (e.g. 1.0, 0.9, 1.1) to Edge TTS rate string (e.g. "+0%", "-10%", "+10%")
    const ratePercent = Math.round((Number(rate || 1.0) - 1.0) * 100);
    const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;

    // Compute deterministic sha256 hash
    const hash = crypto
      .createHash('sha256')
      .update(`${cleanText}:::${selectedVoice}:::${rateStr}`)
      .digest('hex');

    // 1. Check in-memory cache
    if (memoryCache.has(hash)) {
      const cached = memoryCache.get(hash)!;
      return res.status(200).json({
        success: true,
        audioBase64: cached.audioBase64,
        audioUrl: cached.audioUrl,
        mimeType: 'audio/mpeg',
        modelUsed: `EdgeTTS (${selectedVoice})`,
        hash,
        cached: true,
      });
    }

    // 2. Synthesize using EdgeTTS
    const tmpPath = path.join('/tmp', `tts_${hash}.mp3`);
    const edgeTts = new EdgeTTS({
      voice: selectedVoice,
      rate: rateStr,
    });

    await edgeTts.ttsPromise(cleanText, tmpPath);

    const audioBuffer = await fs.promises.readFile(tmpPath);
    const audioBase64 = audioBuffer.toString('base64');

    // Clean up temporary file
    fs.promises.unlink(tmpPath).catch(() => {});

    let audioUrl: string | undefined;

    // 3. Optional Vercel Blob upload if BLOB_READ_WRITE_TOKEN is configured
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const { put } = await import('@vercel/blob');
        const blob = await put(`toefl-tts/${hash}.mp3`, audioBuffer, {
          access: 'public',
          addRandomSuffix: false,
        });
        audioUrl = blob.url;
      } catch (uploadErr) {
        console.warn('Vercel Blob upload skipped or failed:', uploadErr);
      }
    }

    // Save to memory cache
    memoryCache.set(hash, { audioBase64, audioUrl });

    return res.status(200).json({
      success: true,
      audioBase64,
      audioUrl: audioUrl || `data:audio/mpeg;base64,${audioBase64}`,
      mimeType: 'audio/mpeg',
      modelUsed: `EdgeTTS (${selectedVoice})`,
      hash,
      cached: false,
    });
  } catch (error: any) {
    const msg = error?.message || 'TTS synthesis failed';
    return res.status(500).json({ success: false, error: msg });
  }
}
