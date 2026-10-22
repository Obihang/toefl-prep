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
import { parseDialogueLine, detectSpeakerGender, inferGender } from '../utils/voices.ts';

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
  'en-US-AnaNeural',
  'en-US-EmmaNeural',
  'en-US-GuyNeural',
  'en-US-ChristopherNeural',
  'en-US-EricNeural',
  'en-US-RogerNeural',
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

function splitTextIntoSentences(text: string, maxLen = 180): string[] {
  if (!text) return [];
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks: string[] = [];

  for (const raw of sentences) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.length <= maxLen) {
      chunks.push(trimmed);
    } else {
      const words = trimmed.split(/\s+/);
      let current = '';
      for (const word of words) {
        if ((current + ' ' + word).trim().length <= maxLen) {
          current = (current + ' ' + word).trim();
        } else {
          if (current) chunks.push(current);
          current = word;
        }
      }
      if (current) chunks.push(current);
    }
  }

  return chunks.length > 0 ? chunks : [text.trim()];
}

async function synthesizeWithZeroKeyFetch(
  text: string,
  speakerName: string,
  gender: string
): Promise<{ buffer: Buffer; modelUsed: string } | null> {
  const chunks = splitTextIntoSentences(text, 180);
  if (chunks.length === 0) return null;

  // Map speaker/gender to distinct English regional accents for clear natural speaker separation
  let accent = 'en-US';
  const normSpk = (speakerName || '').toLowerCase();

  if (gender === 'male' || normSpk.includes('mark') || normSpk.includes('prof') || normSpk.includes('john') || normSpk.includes('puck') || normSpk.includes('guy')) {
    if (normSpk.includes('b') || normSpk.includes('2') || normSpk.includes('prof')) {
      accent = 'en-GB'; // British English
    } else if (normSpk.includes('c') || normSpk.includes('dean')) {
      accent = 'en-AU'; // Australian English
    } else {
      accent = 'en-CA'; // Canadian / US English
    }
  } else {
    if (normSpk.includes('b') || normSpk.includes('2')) {
      accent = 'en-GB'; // British Female
    } else {
      accent = 'en-US'; // US Female
    }
  }

  const buffers: Buffer[] = [];
  try {
    for (const chunk of chunks) {
      const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${accent}&q=${encodeURIComponent(chunk)}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://translate.google.com/',
        },
      });

      if (!response.ok) {
        console.warn(`Zero-key TTS fetch returned status ${response.status}`);
        return null;
      }

      const arrBuf = await response.arrayBuffer();
      if (arrBuf && arrBuf.byteLength > 0) {
        buffers.push(Buffer.from(arrBuf));
      }
    }

    if (buffers.length > 0) {
      return {
        buffer: Buffer.concat(buffers),
        modelUsed: `Neural Stream (${accent})`,
      };
    }
  } catch (fetchErr) {
    console.warn('Zero-key TTS fetch error:', fetchErr);
  }

  return null;
}

export async function handleTtsEndpoint(req: Req, res: Res) {
  try {
    // Verify token if present, but do NOT block guests practicing tasks without login
    let uid: string | null = null;
    try {
      uid = await verifyFirebaseToken(req);
    } catch {
      // Ignored for guest mode
    }

    const { text, voiceName, speaker, rate = 1.0 } = req.body || {};

    if (!text || typeof text !== 'string' || text.trim().length === 0 || text.length > 3000) {
      return res.status(400).json({ success: false, error: 'Text must be between 1 and 3000 characters for TTS synthesis' });
    }

    const numRate = Number(rate);
    if (isNaN(numRate) || numRate < 0.7 || numRate > 1.3) {
      return res.status(400).json({ success: false, error: 'Speech rate must be between 0.7 and 1.3' });
    }

    const parsedLine = parseDialogueLine(text);
    const speakerName = (speaker || parsedLine.speakerName).toString().trim();
    const cleanText = parsedLine.spokenText || stripSpeakerAndFormatting(text);

    if (!cleanText) {
      return res.status(200).json({
        success: true,
        audioBase64: '',
        audioUrl: undefined,
        mimeType: 'audio/mpeg',
        modelUsed: 'Empty text',
      });
    }

    const gender = detectSpeakerGender(speakerName, parsedLine.speakerHint);
    let selectedVoice = voiceName || (gender === 'female' ? 'en-US-AriaNeural' : gender === 'male' ? 'en-US-GuyNeural' : 'en-US-JennyNeural');

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
        modelUsed: `Cached Voice (${selectedVoice})`,
        hash,
        cached: true,
      });
    }

    let audioBuffer: Buffer | null = null;
    let mimeType = 'audio/mpeg';
    let modelUsed = `Neural Stream (${selectedVoice})`;

    // Stage 1: Try Gemini Cloud TTS if API key provided in headers
    const userApiKey = (req.headers['x-api-key'] || req.headers['x-gemini-api-key'] || '').toString();
    const voiceApiKey = (req.headers['x-voice-api-key'] || '').toString();
    const provider = (req.headers['x-api-provider'] || '').toString();

    if (userApiKey || voiceApiKey) {
      try {
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
        console.warn('Gemini TTS attempt failed:', redactSensitiveInfo(geminiErr));
      }
    }

    // Stage 2: Guaranteed Zero-Dependency Node fetch MP3 stream (Zero-key synthesis)
    if (!audioBuffer || audioBuffer.length === 0) {
      const zeroKeyRes = await synthesizeWithZeroKeyFetch(cleanText, speakerName, gender);
      if (zeroKeyRes) {
        audioBuffer = zeroKeyRes.buffer;
        mimeType = 'audio/mpeg';
        modelUsed = zeroKeyRes.modelUsed;
      }
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'Speech synthesis temporarily unavailable. Please try again.',
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
export async function handleDictionaryEndpoint(req: Req, res: Res) {
  const { word } = req.query;
  if (!word || typeof word !== 'string') return res.status(400).json({ success: false, error: 'Word required' });
  const w = word.trim().toLowerCase();

  // Cascade logic
  const sources = [
    async () => { // Datamuse
      const data = await (await fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(w)}&md=dprs&max=3`)).json();
      if (!data[0] || data[0].word.toLowerCase() !== w || !data[0].defs) return null;
      return { 
        meanings: data.map((d: any) => {
           const [pos, def] = d.defs[0].split('\t');
           const cleanDef = def.replace(/^\([^)]+\)\s*/, '');
           return { partOfSpeech: pos, definition: cleanDef, example: '' };
        }).filter((m: any) => !/(obsolete|archaic|dated|rare|misspelling of|alternative form of|urine)/i.test(m.definition)),
        source: 'datamuse' 
      };
    },
    async () => { // DictionaryAPI
      const data = await (await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`)).json();
      if (!data[0]) return null;
      return { 
        meanings: data[0].meanings.map((m: any) => ({
          partOfSpeech: m.partOfSpeech,
          definition: m.definitions[0].definition.replace(/^\([^)]+\)\s*/, ''),
          example: m.definitions[0].example || '',
        })).filter((m: any) => !/(obsolete|archaic|dated|rare|misspelling of|alternative form of|urine)/i.test(m.definition)),
        phonetic: data[0].phonetic || data[0].phonetics?.find((p: any) => p.text)?.text || '',
        source: 'dictionaryapi' 
      };
    }
  ];

  for (const source of sources) {
    try {
      const result = await source();
      if (result && result.meanings.length > 0) return res.json(result);
    } catch {}
  }
  return res.status(404).json({ success: false, error: 'Not found' });
}
