import type { Request as ExpressReq, Response as ExpressRes } from 'express';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getApiConfig } from './apiConfig.ts';
import { handleGenerateTask, handleEvaluateResponse, handleTestApiKey, handleSynthesizeSpeech } from './geminiHandler.ts';
import { extractErrorMessage, isKeyError, isTransientError, getStatus, redactSensitiveInfo } from './geminiErrors.ts';
import { STT_MODEL } from '../config/models.ts';
import { filterWhisperHallucinations } from '../utils/speakingMetrics.ts';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { EdgeTTS as NodeEdgeTTS } from 'node-edge-tts';
import { inferGender } from '../utils/voices.ts';

// Monkey patch generateSecMsGec to fix 64-bit integer overflow bug in msedge-tts
if ((MsEdgeTTS as any).generateSecMsGec) {
  (MsEdgeTTS as any).generateSecMsGec = async function (trustedClientToken: string) {
    const WINDOWS_FILE_TIME_EPOCH = 11644473600n;
    const ticks = BigInt(Math.floor(Date.now() / 1000 + Number(WINDOWS_FILE_TIME_EPOCH))) * 10000000n;
    const roundedTicks = ticks - (ticks % 3000000000n);
    const strToHash = roundedTicks.toString() + trustedClientToken;
    return crypto.createHash('sha256').update(strToHash, 'ascii').digest('hex').toUpperCase();
  };
}

type Req = ExpressReq | VercelRequest;
type Res = ExpressRes | VercelResponse;

let adminApp: any = null;

function getAdminApp() {
  if (adminApp) return adminApp;
  const apps = getApps();
  if (apps.length > 0) {
    adminApp = apps[0];
    return adminApp;
  }
  let defaultProjectId: string | undefined = undefined;
  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      defaultProjectId = raw.projectId;
    }
  } catch {
    // ignore
  }
  const projectId = process.env.FIREBASE_PROJECT_ID || defaultProjectId || 'your-firebase-project-id';
  adminApp = initializeApp({ projectId });
  return adminApp;
}

async function verifyFirebaseToken(req: Req): Promise<string | null> {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader || typeof authHeader !== 'string') return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  const token = parts[1];
  try {
    const admin = getAdminApp();
    const decoded = await getAuth(admin).verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

// Allowed Edge voices allowlist including natural multi-speaker & professor voices
const ALLOWED_EDGE_VOICES = new Set([
  'en-US-AriaNeural',
  'en-US-JennyNeural',
  'en-US-MichelleNeural',
  'en-US-GuyNeural',
  'en-US-ChristopherNeural',
  'en-US-EricNeural',
  'en-US-EmmaNeural',
  'en-US-SteffanNeural',
  'en-US-RyanNeural',
  'en-US-SoniaNeural',
  'en-US-AndrewNeural',
  'en-US-BrianNeural',
  'en-US-AvaNeural',
]);

export function stripSpeakerAndFormatting(text: string): string {
  if (!text) return '';
  let cleaned = text.trim();

  // 1. Strip explicit speaker label prefixes (e.g. Speaker A, Student 1, Professor, Narrator, Woman, Man)
  cleaned = cleaned.replace(
    /^\s*(?:\*\*|__)?\[?\s*(?:Speaker\s*[A-Z0-9]*|Student\s*[A-Z0-9]*|Professor|Prof\.?\s*\w*|Doctor\s*\w*|Dr\.?\s*\w*|Narrator|Man|Woman|Male|Female|Interviewer|Participant|Person\s*[A-Z0-9]*|Faculty|Instructor|Advisor)\s*\]?(?:\s*\([^)]*\))?(?:\*\*|__)?\s*:\s*/gim,
    ''
  );

  // 2. Strip generic [Role]: or **Role**: if colon exists near start
  cleaned = cleaned.replace(/^\s*(?:\*\*|__)?\[?[A-Za-z0-9\s.]{1,30}\]?(?:\*\*|__)?\s*:\s*/, (match) => {
    if (
      /speaker|student|professor|prof|narrator|man|woman|male|female|interviewer|participant|advisor|instructor|dr\.|doctor|person/i.test(match) ||
      /^[A-Z0-9\s.]+:\s*$/.test(match)
    ) {
      return '';
    }
    return match;
  });

  // 3. Strip bracketed stage directions e.g. [laughs], [sighs], [applause], [pauses]
  cleaned = cleaned.replace(/\[[^\]]*\]/g, ' ');

  // 4. Strip parenthesized stage directions e.g. (pauses), (laughs), (clears throat)
  cleaned = cleaned.replace(/\((?:pauses?|sighs?|laughs?|chuckles?|clears throat|applause|cheering|coughing|sound|music|gasp|whispering|shouting|silence|interrupted)\)/gi, ' ');

  // 5. Strip markdown formatting (*, **, _, __, #, `, >)
  cleaned = cleaned.replace(/[*_#`>]+/g, ' ');

  // 6. Clean up whitespace
  return cleaned.replace(/\s+/g, ' ').trim();
}

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
    console.error('Test key error:', redactSensitiveInfo(error));
    const status = getStatus(error) || 400;
    return res.status(status).json({ success: false, error: redactSensitiveInfo(extractErrorMessage(error)) });
  }
}

export async function handleGenerateTaskEndpoint(req: Req, res: Res) {
  try {
    const config = getApiConfig(req.headers, req.body);
    const { taskType, level, topic } = req.body || {};
    const result = await handleGenerateTask(taskType, level, topic, config);
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    console.error('Generate task error:', redactSensitiveInfo(error));
    const status = getStatus(error) || 500;
    return res.status(status).json({ success: false, error: redactSensitiveInfo(extractErrorMessage(error)) });
  }
}

export async function handleEvaluateResponseEndpoint(req: Req, res: Res) {
  try {
    const config = getApiConfig(req.headers, req.body);
    const { taskType, promptData, studentResponse } = req.body || {};
    const result = await handleEvaluateResponse(taskType, promptData, studentResponse, config);
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    console.error('Evaluate response error:', redactSensitiveInfo(error));
    const status = getStatus(error) || 500;
    return res.status(status).json({ success: false, error: redactSensitiveInfo(extractErrorMessage(error)) });
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
        console.error('Groq Whisper STT error:', redactSensitiveInfo(errText));
        return res.status(groqRes.status).json({
          success: false,
          error: redactSensitiveInfo(`Groq Whisper STT error (${groqRes.status}): ${errText}`),
        });
      }

      const data: any = await groqRes.json();
      const rawWords = Array.isArray(data.words)
        ? data.words.map((w: any) => ({
            word: String(w.word || '').trim(),
            start: Number(w.start || 0),
            end: Number(w.end || 0),
          }))
        : [];

      const rawTranscript = String(data.text || '').trim();
      const { transcript, words } = filterWhisperHallucinations(rawTranscript, rawWords);

      return res.status(200).json({
        success: true,
        transcript,
        words,
        duration: Number(data.duration || 0),
        modelUsed: `Groq ${STT_MODEL}`,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error: any) {
    console.error('STT endpoint error:', redactSensitiveInfo(error));
    const msg = redactSensitiveInfo(error?.message || 'Speech-to-text processing failed');
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

    let effectiveSpeaker = (speaker || '').toString();
    if (!effectiveSpeaker) {
      const match = text.match(/^\s*(?:\*\*|__)?\[?\s*([A-Za-z0-9\s.]+?)\s*\]?(?:\s*\([^)]*\))?(?:\*\*|__)?\s*:\s*/);
      if (match) {
        effectiveSpeaker = match[1].trim();
      }
    }

    const cleanText = stripSpeakerAndFormatting(text);
    if (!cleanText) {
      return res.status(200).json({
        success: true,
        audioBase64: '',
        audioUrl: undefined,
        mimeType: 'audio/mpeg',
        modelUsed: 'Empty text',
      });
    }

    // Map multi-speaker dialogues, professors, and voices cleanly to natural Microsoft Neural voices:
    // Female voices: en-US-AriaNeural, en-US-JennyNeural, en-US-MichelleNeural
    // Male voices: en-US-GuyNeural, en-US-ChristopherNeural, en-US-EricNeural
    let selectedVoice = 'en-US-JennyNeural';
    const lowerVoice = (voiceName || '').toLowerCase();
    const lowerSpeaker = effectiveSpeaker.toLowerCase();

    if (voiceName && ALLOWED_EDGE_VOICES.has(voiceName)) {
      selectedVoice = voiceName;
    } else if (
      lowerSpeaker.includes('prof') ||
      lowerSpeaker.includes('instructor') ||
      lowerSpeaker.includes('dr') ||
      lowerSpeaker.includes('advisor') ||
      lowerSpeaker.includes('faculty')
    ) {
      // Academic professors & instructors
      const g = inferGender(speaker);
      if (g === 'female' || lowerVoice.includes('female') || lowerVoice.includes('aria') || lowerVoice.includes('michelle')) {
        selectedVoice = lowerVoice.includes('michelle') ? 'en-US-MichelleNeural' : 'en-US-AriaNeural';
      } else {
        selectedVoice = 'en-US-ChristopherNeural';
      }
    } else if (
      lowerSpeaker.includes('b') ||
      lowerSpeaker.includes('student b') ||
      lowerSpeaker.includes('male') ||
      lowerVoice.includes('guy') ||
      lowerVoice.includes('christopher') ||
      lowerVoice.includes('eric') ||
      lowerVoice.includes('puck') ||
      lowerVoice.includes('charon') ||
      lowerVoice.includes('fenrir') ||
      lowerVoice.includes('algenib')
    ) {
      selectedVoice = (lowerSpeaker.includes('eric') || lowerVoice.includes('eric')) ? 'en-US-EricNeural' : 'en-US-GuyNeural';
    } else if (
      lowerSpeaker.includes('a') ||
      lowerSpeaker.includes('student a') ||
      lowerSpeaker.includes('female') ||
      lowerVoice.includes('aria') ||
      lowerVoice.includes('michelle') ||
      lowerVoice.includes('jenny') ||
      lowerVoice.includes('kore') ||
      lowerVoice.includes('aoede')
    ) {
      selectedVoice = lowerVoice.includes('michelle')
        ? 'en-US-MichelleNeural'
        : (lowerVoice.includes('aria') ? 'en-US-AriaNeural' : 'en-US-JennyNeural');
    } else {
      const g = inferGender(speaker || voiceName);
      selectedVoice = g === 'male' ? 'en-US-GuyNeural' : 'en-US-JennyNeural';
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

    // Synthesize using 3-stage pipeline:
    // Stage 1: Primary MsEdgeTTS
    // Stage 2: Secondary NodeEdgeTTS
    // Stage 3: Gemini Cloud TTS fallback
    let audioBuffer: Buffer | null = null;
    let mimeType = 'audio/mpeg';
    let modelUsed = `EdgeTTS (${selectedVoice})`;

    // Stage 1: MsEdgeTTS
    const tmpDir = path.join('/tmp', `msedge_${hash}_${Date.now()}`);
    try {
      await fs.promises.mkdir(tmpDir, { recursive: true });
      const msTts = new MsEdgeTTS();
      await msTts.setMetadata(selectedVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const fileRes = await msTts.toFile(tmpDir, cleanText);
      if (fileRes && fileRes.audioFilePath && fs.existsSync(fileRes.audioFilePath)) {
        audioBuffer = await fs.promises.readFile(fileRes.audioFilePath);
      }
      msTts.close();
    } catch (primaryErr) {
      console.warn('MsEdgeTTS attempt failed, falling back to NodeEdgeTTS:', redactSensitiveInfo(primaryErr));
    } finally {
      fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }

    // Stage 2: NodeEdgeTTS
    if (!audioBuffer || audioBuffer.length === 0) {
      const tmpPath = path.join('/tmp', `tts_${hash}.mp3`);
      try {
        const nodeTts = new NodeEdgeTTS({
          voice: selectedVoice,
          rate: rateStr,
        });
        await nodeTts.ttsPromise(cleanText, tmpPath);
        if (fs.existsSync(tmpPath)) {
          audioBuffer = await fs.promises.readFile(tmpPath);
        }
      } catch (secondaryErr) {
        console.warn('NodeEdgeTTS attempt failed:', redactSensitiveInfo(secondaryErr));
      } finally {
        fs.promises.unlink(tmpPath).catch(() => {});
      }
    }

    // Stage 3: Gemini Cloud TTS fallback
    if (!audioBuffer || audioBuffer.length === 0) {
      try {
        const userApiKey = (req.headers['x-api-key'] || req.headers['x-gemini-api-key'] || '').toString();
        const voiceApiKey = (req.headers['x-voice-api-key'] || '').toString();
        const provider = (req.headers['x-api-provider'] || '').toString();
        const geminiRes = await handleSynthesizeSpeech(cleanText, selectedVoice, {
          apiKey: userApiKey,
          voiceApiKey,
          provider: provider as any,
        });
        if (geminiRes && geminiRes.audioBase64) {
          audioBuffer = Buffer.from(geminiRes.audioBase64, 'base64');
          mimeType = geminiRes.mimeType || 'audio/wav';
          modelUsed = geminiRes.modelUsed || 'Gemini Cloud TTS';
        }
      } catch (geminiErr) {
        console.warn('Gemini TTS fallback attempt failed:', redactSensitiveInfo(geminiErr));
      }
    }

    // If all synthesis stages fail (e.g. Rate limit / 429 from external providers)
    if (!audioBuffer || audioBuffer.length === 0) {
      return res.status(429).json({
        success: false,
        error: 'Text-to-speech service is temporarily rate limited. Please try again in a few seconds.',
        rateLimit: { retryAfterSeconds: 5 },
      });
    }

    const audioBase64 = audioBuffer.toString('base64');

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
        console.warn('Vercel Blob upload failed:', redactSensitiveInfo(uploadErr));
      }
    }

    // Return valid audio stream / base64 data for native Brave playback
    return res.status(200).json({
      success: true,
      audioBase64: audioUrl ? undefined : audioBase64,
      audioUrl: audioUrl,
      mimeType,
      modelUsed,
      hash,
      cached: false,
    });
  } catch (error: any) {
    console.error('TTS endpoint error:', redactSensitiveInfo(error));
    const msg = redactSensitiveInfo(error?.message || 'TTS synthesis failed');
    return res.status(500).json({ success: false, error: msg });
  }
}
