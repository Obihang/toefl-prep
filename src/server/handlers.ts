import type { Request as ExpressReq, Response as ExpressRes } from 'express';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { head, put } from '@vercel/blob';
import { getApiConfig } from './apiConfig.ts';
import { handleGenerateTask, handleEvaluateResponse, handleTestApiKey, handleSynthesizeSpeech, synthesizeGeminiTts } from './geminiHandler.ts';
import { callOpenAiTts } from './llmClient.ts';
import { extractErrorMessage, isKeyError, isTransientError, getStatus, redactSensitiveInfo } from './geminiErrors.ts';
import { STT_MODEL } from '../config/models.ts';
import { filterWhisperHallucinations } from '../utils/speakingMetrics.ts';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { parseDialogueLine, detectSpeakerGender, inferGender } from '../utils/voices.ts';
import { firebasePublicConfig } from './firebasePublicConfig.ts';

export const FEMALE_VOICES = [
  "en-US-AvaNeural",
  "en-US-EmmaNeural",
  "en-US-AriaNeural",
  "en-US-JennyNeural",
  "en-GB-SoniaNeural",
  "en-GB-LibbyNeural"
];

export const MALE_VOICES = [
  "en-US-AndrewNeural",
  "en-US-GuyNeural",
  "en-US-BrianNeural",
  "en-US-ChristopherNeural",
  "en-GB-RyanNeural",
  "en-GB-ThomasNeural"
];

export const ALL_EDGE_VOICES = [...FEMALE_VOICES, ...MALE_VOICES];

type Req = ExpressReq | VercelRequest;
type Res = ExpressRes | VercelResponse;

interface CacheEntry {
  uid: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CacheEntry>();

async function verifyFirebaseToken(req: Req): Promise<string | null> {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader || typeof authHeader !== 'string') return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  const token = parts[1].trim();
  if (!token) return null;

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const now = Date.now();

  const cached = tokenCache.get(tokenHash);
  if (cached && now < cached.expiresAt) {
    return cached.uid;
  }

  const apiKey = firebasePublicConfig.apiKey;
  if (!apiKey) return null;

  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ idToken: token }),
    });

    if (!res.ok) {
      return null;
    }

    const data: any = await res.json();
    const localId = data?.users?.[0]?.localId;
    if (localId && typeof localId === 'string') {
      if (tokenCache.size >= 500) {
        const firstKey = tokenCache.keys().next().value;
        if (firstKey) tokenCache.delete(firstKey);
      }
      tokenCache.set(tokenHash, {
        uid: localId,
        expiresAt: now + 5 * 60 * 1000,
      });
      return localId;
    }
    return null;
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
    const { taskType, level, topic, promptData } = req.body || {};
    const result = await handleGenerateTask(taskType, level, topic, config, promptData);
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
  gender: string,
  voiceName?: string
): Promise<{ buffer: Buffer; modelUsed: string } | null> {
  const chunks = splitTextIntoSentences(text, 180);
  if (chunks.length === 0) return null;

  let accent = 'en-US';
  if (voiceName && voiceName.startsWith('en-GB')) {
    accent = 'en-GB';
  } else {
    const normSpk = (speakerName || '').toLowerCase();
    if (gender === 'male' || normSpk.includes('mark') || normSpk.includes('prof') || normSpk.includes('john') || normSpk.includes('guy') || normSpk.includes('marcus') || normSpk.includes('male')) {
      accent = 'en-GB';
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
      const modelLabel = voiceName ? `Edge TTS (${voiceName})` : `Neural Stream (${accent})`;
      return {
        buffer: Buffer.concat(buffers),
        modelUsed: modelLabel,
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

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const text = body.text || '';
    const voiceName = body.voiceName || '';
    const speaker = body.speaker || '';
    const rate = body.rate || 1.0;

    if (!text || typeof text !== 'string' || text.trim().length === 0 || text.length > 3000) {
      return res.status(400).json({ success: false, error: 'Text must be between 1 and 3000 characters for TTS synthesis' });
    }

    const numRate = Number(rate);
    if (isNaN(numRate) || numRate < 0.7 || numRate > 1.3) {
      return res.status(400).json({ success: false, error: 'Speech rate must be between 0.7 and 1.3' });
    }

    // TTS Provider headers:
    const ttsProvider = (req.headers['x-tts-provider'] || '').toString().trim().toLowerCase();
    const ttsApiKey = (req.headers['x-tts-api-key'] || '').toString().trim();
    const ttsBaseUrl = (req.headers['x-tts-base-url'] || '').toString().trim();

    // Legacy headers fallback
    const userApiKey = (req.headers['x-api-key'] || req.headers['x-gemini-api-key'] || '').toString().trim();
    const voiceApiKey = (req.headers['x-voice-api-key'] || '').toString().trim();
    const provider = (req.headers['x-api-provider'] || '').toString().trim().toLowerCase();

    const isTest = req.headers['x-tts-test'] === 'true';

    const isMaleExplicit = body.isMale === true || body.gender === 'male';
    let isMale = isMaleExplicit || /Male|Guy|Christopher|Eric|onyx|alloy|Puck/i.test(voiceName || speaker);
    let cleanText = text;
    const prefixMatch = text.match(/^\s*(?:\*\*|__)?([A-Z][a-zA-Z0-9.\s'-]{0,28}?)(?:\s*\(([^)]+)\))?(?:\*\*|__)?\s*:/i);
    if (prefixMatch) {
      const pSpeakerName = prefixMatch[1].trim();
      const pSpeakerHint = prefixMatch[2] ? prefixMatch[2].trim() : '';
      if (detectSpeakerGender(pSpeakerName, pSpeakerHint) === 'male' || /male/i.test(pSpeakerHint)) {
        isMale = true;
      } else if (detectSpeakerGender(pSpeakerName, pSpeakerHint) === 'female' || /female/i.test(pSpeakerHint)) {
        if (!isMaleExplicit) isMale = false;
      }
      cleanText = text.replace(/^\s*(?:\*\*|__)?(?:[A-Z][a-zA-Z0-9.\s'-]{0,28}?)(?:\s*\([^)]+\))?(?:\*\*|__)?\s*:\s*/i, '').trim();
    }
    const speakerName = speaker || (prefixMatch ? prefixMatch[1].trim() : '');
    const speakerHint = body.speakerHint || (prefixMatch ? (prefixMatch[2] || '') : '');
    if (!isMale && (detectSpeakerGender(speakerName, speakerHint) === 'male' || /male/i.test(speakerHint))) {
      isMale = true;
    }

    if (!cleanText) {
      return res.status(200).json({
        success: true,
        audioBase64: '',
        audioUrl: undefined,
        mimeType: 'audio/mpeg',
        modelUsed: 'Empty text',
      });
    }

    const reqVoice = (body.voice || body.voiceName || voiceName || '').toString().trim();
    const reqGender = (body.gender || (body.isMale === true ? 'male' : body.isMale === false ? 'female' : '')).toString().toLowerCase();

    let selectedVoice = '';
    if (reqVoice && (FEMALE_VOICES.includes(reqVoice) || MALE_VOICES.includes(reqVoice))) {
      selectedVoice = reqVoice;
    } else if (reqGender === 'male' || reqGender === 'female') {
      const pool = reqGender === 'male' ? MALE_VOICES : FEMALE_VOICES;
      selectedVoice = pool[Math.floor(Math.random() * pool.length)];
    } else {
      const gender = isMale ? 'male' : detectSpeakerGender(speakerName, prefixMatch ? (prefixMatch[2] || '') : '');
      if (gender === 'male' || gender === 'female') {
        const pool = gender === 'male' ? MALE_VOICES : FEMALE_VOICES;
        selectedVoice = pool[Math.floor(Math.random() * pool.length)];
      } else {
        selectedVoice = ALL_EDGE_VOICES[Math.floor(Math.random() * ALL_EDGE_VOICES.length)];
      }
    }

    isMale = MALE_VOICES.includes(selectedVoice) || reqGender === 'male';

    const pitch = (body.pitch || '0Hz').toString().trim();
    const ratePercent = Math.round((numRate - 1.0) * 100);
    const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;

    const hash = crypto
      .createHash('sha256')
      .update(`${cleanText}:::${selectedVoice}:::${pitch}:::${rateStr}`)
      .digest('hex');

    const blobPath = `toefl-tts/${hash}.mp3`;
    let audioUrl: string | undefined;

    // Check Vercel Blob existence via head() if BLOB_READ_WRITE_TOKEN is configured (strictly bypass cache during tests)
    if (!isTest && process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const blobInfo = await head(blobPath);
        if (blobInfo && blobInfo.url && blobInfo.url.includes(BLOB_DOMAIN_SUFFIX)) {
          audioUrl = blobInfo.url;
        }
      } catch {}
    }

    if (!isTest && audioUrl) {
      return res.status(200).json({
        success: true,
        audioUrl,
        mimeType: 'audio/mpeg',
        modelUsed: `Cached Voice (${selectedVoice})`,
        providerUsed: 'cached',
        hash,
        cached: true,
        isMale,
      });
    }

    let audioBuffer: Buffer | null = null;
    let mimeType = 'audio/mpeg';
    let modelUsed = `Neural Stream (${selectedVoice})`;

    // If testing OpenAI or Gemini but no API key is configured, return explicit error immediately
    if (isTest && (ttsProvider === 'openai' || ttsProvider === 'gemini') && !ttsApiKey && !process.env.GEMINI_TTS_API_KEY && !process.env.OPENAI_TTS_API_KEY) {
      return res.status(400).json({ error: `API Failed: Missing dedicated API key for ${ttsProvider.toUpperCase()} TTS. Please paste a valid key in Settings.` });
    }

    // Stage 1: Exact REST API Payloads for OpenAI and Gemini TTS
    if (ttsProvider === 'openai' || provider === 'openai') {
      const apiKey = ttsApiKey || process.env.OPENAI_TTS_API_KEY || userApiKey || process.env.OPENAI_API_KEY || '';
      if (!apiKey) {
        if (isTest) {
          return res.status(400).json({ error: 'Missing OpenAI TTS API key. Please enter a valid OpenAI API key in Settings.' });
        }
      } else {
        try {
          const openAiUrl = ttsBaseUrl
            ? (ttsBaseUrl.endsWith('/audio/speech') ? ttsBaseUrl : `${ttsBaseUrl.replace(/\/+$/, '')}/audio/speech`)
            : 'https://api.openai.com/v1/audio/speech';
          const openAiFemalePool = ['nova', 'shimmer', 'alloy'];
          const openAiMalePool = ['onyx', 'echo', 'fable'];
          const validOpenAiVoices = new Set([...openAiFemalePool, ...openAiMalePool]);
          let selectedOpenAiVoice = voiceName || '';
          if (!validOpenAiVoices.has(selectedOpenAiVoice)) {
            const seedString = voiceName || speakerName || cleanText.slice(0, 20);
            const hash = seedString.split('').reduce((acc: number, char: string) => char.charCodeAt(0) + acc, 0);
            const pool = isMale ? openAiMalePool : openAiFemalePool;
            selectedOpenAiVoice = pool[hash % pool.length];
          }

          const openAiRes = await fetch(openAiUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'tts-1', voice: selectedOpenAiVoice, input: cleanText })
          });
          if (!openAiRes.ok) {
            const errText = await openAiRes.text();
            let errDetail = errText;
            try {
              const errJson = JSON.parse(errText);
              errDetail = errJson.error?.message || errDetail;
            } catch {}
            throw new Error(`OpenAI HTTP ${openAiRes.status}: ${errDetail || openAiRes.statusText}`);
          }
          const buffer = await openAiRes.arrayBuffer();
          const base64Audio = Buffer.from(buffer).toString('base64');
          return res.status(200).json({
            success: true,
            audioUrl: `data:audio/mpeg;base64,${base64Audio}`,
            audioBase64: base64Audio,
            mimeType: 'audio/mpeg',
            modelUsed: `OpenAI TTS (${selectedOpenAiVoice})`,
            providerUsed: 'openai',
            voiceUsed: selectedOpenAiVoice,
            fallbackUsed: false,
            isMale,
          });
        } catch (openAiErr) {
          if (isTest) {
            const errText = openAiErr instanceof Error ? openAiErr.message : String(openAiErr);
            return res.status(400).json({ error: `API Failed: ${errText}` });
          }
          console.warn('OpenAI TTS failed, falling through to zero-key stream:', redactSensitiveInfo(openAiErr));
        }
      }
    } else if (ttsProvider === 'gemini' || provider === 'gemini') {
      const apiKey = ttsApiKey || process.env.GEMINI_TTS_API_KEY || userApiKey || process.env.GEMINI_API_KEY || '';
      if (!apiKey) {
        if (isTest) {
          return res.status(400).json({ error: 'Missing Gemini TTS API key. Please enter a valid Gemini API key in Settings.' });
        }
      } else {
        try {
          const resData = await synthesizeGeminiTts(cleanText, apiKey, { voiceName, isMale });
          return res.status(200).json({
            success: true,
            audioUrl: `data:${resData.mimeType};base64,${resData.base64Audio}`,
            audioBase64: resData.base64Audio,
            mimeType: resData.mimeType,
            modelUsed: `Gemini TTS (${resData.voiceUsed})`,
            providerUsed: 'gemini',
            voiceUsed: resData.voiceUsed,
            fallbackUsed: false,
            isMale,
          });
        } catch (geminiErr) {
          if (isTest) {
            const errText = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
            return res.status(400).json({ error: `API Failed: ${errText}` });
          }
          console.warn('Gemini TTS failed, falling through to zero-key stream:', redactSensitiveInfo(geminiErr));
        }
      }
    }

    // Never fall back to neural during test calls for API providers
    if (isTest && (ttsProvider === 'openai' || ttsProvider === 'gemini')) {
      return res.status(400).json({ error: `API Failed: Failed to generate audio using ${ttsProvider.toUpperCase()} TTS.` });
    }

    // Stage 2: Guaranteed Zero-Dependency Node fetch MP3 stream (Zero-key synthesis)
    const zeroKeyRes = await synthesizeWithZeroKeyFetch(cleanText, speakerName, isMale ? 'male' : 'female', selectedVoice);
    if (zeroKeyRes) {
      audioBuffer = zeroKeyRes.buffer;
      mimeType = 'audio/mpeg';
      modelUsed = zeroKeyRes.modelUsed;
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
      providerUsed: 'fallback',
      hash,
      cached: false,
      isMale,
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

  const isArchaicOrPlato = (def: string) =>
    /\b(plato|platonist|sect|obsolete|archaic|historical|dated|rare|misspelling of|alternative form of|urine)\b/i.test(def);
  const scoreDefinition = (definition: string): number => {
    if (!definition) return -100;
    const d = definition.toLowerCase();
    let score = 0;
    const penaltyRegex = /\b(slang|music|hip-hop|african american|informal|derogatory|obsolete|archaic|historical|dated|rare|vulgar|offensive|colloquial|jargon|surname|given name|christian|bible|sect|plato|platonist|misspelling of|alternative form of|urine)\b/gi;
    const penalties = d.match(penaltyRegex);
    if (penalties) score -= 50 * penalties.length;
    const rewardKeywords = [
      'city', 'town', 'relating to', 'characteristic of', 'study of',
      'process', 'system', 'science', 'art', 'education', 'learning',
      'school', 'university', 'pertaining to', 'denoting', 'constituting',
      'scholarly', 'institution', 'principle', 'method', 'theory',
      'living in', 'inhabitant'
    ];
    for (const kw of rewardKeywords) {
      if (d.includes(kw)) score += 10;
    }
    return score;
  };

  // Cascade logic: 1. Wikimedia Wiktionary REST, 2. FreeDictionaryAPI, 3. Datamuse
  const sources = [
    async () => { // 1. Wikimedia Wiktionary REST API
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      try {
        const res = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(w)}`, {
          signal: controller.signal,
          headers: { 'User-Agent': 'TOEFLPrepStudio/1.0 (educational app)' }
        });
        clearTimeout(timeout);
        if (!res.ok) return null;
        const data = await res.json();
        const enEntries = data.en || [];
        const meanings: Array<{ partOfSpeech: string; definition: string; example: string }> = [];
        for (const entry of enEntries) {
          const pos = String(entry.partOfSpeech || 'noun').toLowerCase();
          for (const defObj of (entry.definitions || [])) {
            const defHtml = defObj.definition || '';
            const cleanDef = String(defHtml).replace(/<[^>]*>?/gm, '').replace(/^\([^)]+\)\s*/, '').trim();
            if (!cleanDef || /(obsolete|archaic|dated|rare|misspelling of|alternative form of)/i.test(cleanDef)) continue;
            meanings.push({
              partOfSpeech: pos,
              definition: cleanDef,
              example: '',
            });
          }
        }
        if (meanings.length === 0) return null;
        return {
          meanings: meanings.slice(0, 3),
          source: 'wiktionary_rest',
        };
      } catch {
        clearTimeout(timeout);
        return null;
      }
    },
    async () => { // 2. DictionaryAPI (clean definitions, real examples, audio)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      try {
        const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) return null;
        const data = await res.json();
        if (!Array.isArray(data) || !data[0] || !Array.isArray(data[0].meanings)) return null;

        const meanings: Array<{ partOfSpeech: string; definition: string; example: string }> = [];
        for (const m of data[0].meanings) {
          const pos = String(m.partOfSpeech || 'noun').toLowerCase();
          for (const d of (m.definitions || [])) {
            if (!d.definition) continue;
            const cleanDef = String(d.definition).replace(/^\([^)]+\)\s*/, '').trim();
            if (/(obsolete|archaic|dated|rare|misspelling of|alternative form of|urine)/i.test(cleanDef)) continue;
            meanings.push({
              partOfSpeech: pos,
              definition: cleanDef,
              example: typeof d.example === 'string' ? d.example.trim() : '',
            });
          }
        }
        if (meanings.length === 0) return null;

        const modernMeanings = meanings.filter((m) => !isArchaicOrPlato(m.definition));
        const finalMeanings = (modernMeanings.length > 0 ? modernMeanings : meanings).sort((a, b) => {
          const aScore = scoreDefinition(a.definition);
          const bScore = scoreDefinition(b.definition);
          if (aScore !== bScore) return bScore - aScore;
          if (a.example && !b.example) return -1;
          if (!a.example && b.example) return 1;
          return 0;
        });

        return {
          meanings: finalMeanings,
          phonetic: data[0].phonetic || data[0].phonetics?.find((p: any) => p.text)?.text || '',
          source: 'dictionaryapi',
        };
      } catch {
        clearTimeout(timeout);
        return null;
      }
    },
    async () => { // 2. Datamuse with STRICT exact-word check
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      try {
        const res = await fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(w)}&md=dprs&max=5`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) return null;
        const data = await res.json();
        if (!Array.isArray(data)) return null;

        const meanings: Array<{ partOfSpeech: string; definition: string; example: string }> = [];
        for (const item of data) {
          // STRICT CHECK: NEVER include definitions from rhyming, similar, or neighboring words
          if (!item.word || item.word.toLowerCase() !== w) continue;
          if (!Array.isArray(item.defs)) continue;

          for (const defStr of item.defs) {
            const parts = defStr.split('\t');
            if (parts.length < 2) continue;
            const posCode = parts[0].trim().toLowerCase();
            const defText = parts[1].replace(/^\([^)]+\)\s*/, '').trim();
            if (/(obsolete|archaic|dated|rare|misspelling of|alternative form of|urine)/i.test(defText)) continue;

            const posMap: Record<string, string> = { n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb', u: 'noun' };
            meanings.push({
              partOfSpeech: posMap[posCode] || posCode || 'noun',
              definition: defText,
              example: '',
            });
          }
        }
        const modernMeanings = meanings.filter((m) => !isArchaicOrPlato(m.definition));
        const finalMeanings = (modernMeanings.length > 0 ? modernMeanings : meanings).sort((a, b) => {
          const aScore = scoreDefinition(a.definition);
          const bScore = scoreDefinition(b.definition);
          if (aScore !== bScore) return bScore - aScore;
          return 0;
        });

        if (finalMeanings.length === 0) return null;
        return {
          meanings: finalMeanings,
          source: 'datamuse',
        };
      } catch {
        clearTimeout(timeout);
        return null;
      }
    },
  ];

  for (const source of sources) {
    try {
      const result = await source();
      if (result && Array.isArray(result.meanings) && result.meanings.length > 0) {
        return res.json(result);
      }
    } catch {}
  }
  return res.status(404).json({ success: false, error: 'Not found' });
}
