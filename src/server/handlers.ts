import type { Request as ExpressReq, Response as ExpressRes } from 'express';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { EdgeTTS } from 'node-edge-tts';
import { getApiConfig } from './apiConfig';
import { handleGenerateTask, handleEvaluateResponse, handleTestApiKey } from './geminiHandler';
import { extractErrorMessage, isKeyError, isTransientError, getStatus } from './geminiErrors';
import { STT_MODEL } from '../config/models';

type Req = ExpressReq | VercelRequest;
type Res = ExpressRes | VercelResponse;

// Initialize firebase admin if not already initialized
if (!(admin as any).apps.length) {
  try {
    admin.initializeApp();
  } catch {
    // Fallback credential init for local dev without service account JSON if env vars are present
    try {
      admin.initializeApp({
        credential: (admin as any).credential.applicationDefault(),
      });
    } catch {}
  }
}

async function verifyFirebaseToken(req: Req): Promise<string | null> {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader || typeof authHeader !== 'string') return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  const token = parts[1];
  try {
    const decoded = await (admin as any).auth().verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

// Allowed Edge voices allowlist
const ALLOWED_EDGE_VOICES = new Set([
  'en-US-JennyNeural',
  'en-US-GuyNeural',
  'en-US-AriaNeural',
  'en-US-EmmaNeural',
  'en-US-ChristopherNeural',
  'en-US-SteffanNeural',
  'en-US-RyanNeural',
  'en-US-SoniaNeural',
  'en-US-AndrewNeural',
  'en-US-BrianNeural',
  'en-US-AvaNeural',
]);

const BLOB_DOMAIN_SUFFIX = 'blob.vercel-storage.com';

export async function handleHealth(req: Req, res: Res) {
  return res.status(200).json({
    status: 'ok',
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    blobConfigured: !!process.env.BLOB_READ_WRITE_TOKEN,
  });
}

export async function handleTestKeyEndpoint(req: Req, res: Res) {
  try {
    const config = getApiConfig(req.headers, req.body);
    const result = await handleTestApiKey(config);
    return res.status(200).json(result);
  } catch (error: any) {
    const status = getStatus(error) || 400;
    return res.status(status).json({ success: false, error: extractErrorMessage(error) });
  }
}

export async function handleGenerateTaskEndpoint(req: Req, res: Res) {
  try {
    const config = getApiConfig(req.headers, req.body);
    const { taskType, level, topic } = req.body || {};
    const result = await handleGenerateTask(taskType, level, topic, config);
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    const status = getStatus(error) || 500;
    return res.status(status).json({ success: false, error: extractErrorMessage(error) });
  }
}

export async function handleEvaluateResponseEndpoint(req: Req, res: Res) {
  try {
    const config = getApiConfig(req.headers, req.body);
    const { taskType, promptData, studentResponse } = req.body || {};
    const result = await handleEvaluateResponse(taskType, promptData, studentResponse, config);
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    const status = getStatus(error) || 500;
    return res.status(status).json({ success: false, error: extractErrorMessage(error) });
  }
}

export async function handleSttEndpoint(req: Req, res: Res) {
  const apiConfig = getApiConfig(req.headers, req.body);
  const groqKey = (req.headers['x-groq-key'] as string) || (apiConfig.provider === 'groq' ? apiConfig.apiKey : '');

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

    // Server-side size check (max 4.5 MB for Vercel / serverless limits)
    const approxBytes = (audioBase64.length * 3) / 4;
    if (approxBytes > 4.5 * 1024 * 1024) {
      return res.status(413).json({ success: false, error: 'Audio recording exceeds 4.5 MB limit (approx 90 seconds max)' });
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

export async function handleTtsEndpoint(req: Req, res: Res) {
  try {
    const uid = await verifyFirebaseToken(req);
    if (!uid) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Valid Firebase ID token required in Authorization header' });
    }

    const { text, voiceName, speaker, rate = 1.0 } = req.body || {};

    if (!text || typeof text !== 'string' || text.trim().length === 0 || text.length > 3000) {
      return res.status(400).json({ success: false, error: 'Text must be between 1 and 3000 characters for TTS synthesis' });
    }

    const numRate = Number(rate);
    if (isNaN(numRate) || numRate < 0.7 || numRate > 1.3) {
      return res.status(400).json({ success: false, error: 'Speech rate must be between 0.7 and 1.3' });
    }

    const cleanText = text.trim();

    // Map speaker/gender or validate voiceName against allowlist
    let selectedVoice = 'en-US-JennyNeural';
    const lowerVoice = (voiceName || '').toLowerCase();
    const lowerSpeaker = (speaker || '').toLowerCase();

    if (
      lowerSpeaker.includes('b') ||
      lowerSpeaker.includes('prof') ||
      lowerSpeaker.includes('male') ||
      lowerVoice.includes('guy') ||
      lowerVoice.includes('andrew')
    ) {
      selectedVoice = 'en-US-GuyNeural';
    } else if (voiceName && ALLOWED_EDGE_VOICES.has(voiceName)) {
      selectedVoice = voiceName;
    }

    const ratePercent = Math.round((numRate - 1.0) * 100);
    const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;

    const hash = crypto
      .createHash('sha256')
      .update(`${cleanText}:::${selectedVoice}:::${rateStr}`)
      .digest('hex');

    const blobPath = `toefl-tts/${hash}.mp3`;
    let audioUrl: string | undefined;

    // Check Vercel Blob existence via head() if BLOB_READ_WRITE_TOKEN is configured
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const { head } = await import('@vercel/blob');
        const blobInfo = await head(blobPath);
        if (blobInfo && blobInfo.url && blobInfo.url.includes(BLOB_DOMAIN_SUFFIX)) {
          audioUrl = blobInfo.url;
        }
      } catch {}
    }

    if (audioUrl) {
      return res.status(200).json({
        success: true,
        audioUrl,
        mimeType: 'audio/mpeg',
        modelUsed: `EdgeTTS (${selectedVoice})`,
        hash,
        cached: true,
      });
    }

    // Synthesize using EdgeTTS
    const tmpPath = path.join('/tmp', `tts_${hash}.mp3`);
    const edgeTts = new EdgeTTS({
      voice: selectedVoice,
      rate: rateStr,
    });

    await edgeTts.ttsPromise(cleanText, tmpPath);
    const audioBuffer = await fs.promises.readFile(tmpPath);
    const audioBase64 = audioBuffer.toString('base64');
    fs.promises.unlink(tmpPath).catch(() => {});

    // Try uploading to Vercel Blob
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const { put } = await import('@vercel/blob');
        const blob = await put(blobPath, audioBuffer, {
          access: 'public',
          addRandomSuffix: false,
        });
        if (blob && blob.url && blob.url.includes(BLOB_DOMAIN_SUFFIX)) {
          audioUrl = blob.url;
        }
      } catch (uploadErr) {
        console.warn('Vercel Blob upload failed:', uploadErr);
      }
    }

    // Note: Never return or save base64 data URL as audioUrl. Only return audioBase64 for immediate playback if blob upload is missing.
    return res.status(200).json({
      success: true,
      audioBase64: audioUrl ? undefined : audioBase64,
      audioUrl: audioUrl,
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
