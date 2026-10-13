import express from 'express';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  handleGenerateTask,
  handleEvaluateResponse,
  handleSynthesizeSpeech,
  handleTranscribeAudio,
  handleTestApiKey,
} from './src/server/geminiHandler.ts';
import {
  getStatus,
  extractErrorMessage,
  isKeyError,
  isTransientError,
} from './src/server/geminiErrors.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: 'Too many requests, please try again in a few minutes.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);
app.use(express.json({ limit: '10mb' }));

// Debug logging
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    const key = req.headers['x-gemini-api-key'];
    console.log(`API Request: ${req.method} ${req.path}, x-gemini-api-key: ${key ? `PRESENT (starts with ${key.toString().slice(0, 6)})` : 'MISSING'}`);
  }
  next();
});

// API endpoints
app.post('/api/generate-task', async (req, res) => {
  try {
    const { taskType, level, topic } = req.body || {};
    const customApiKey = (req.headers['x-gemini-api-key'] as string)?.trim() || (req.body?.apiKey?.trim() as string);
    const result = await handleGenerateTask(taskType, level, topic, customApiKey);
    res.json({ success: true, data: result });
  } catch (error: any) {
    const msg = extractErrorMessage(error);
    res.status(500).json({ success: false, error: msg });
  }
});

app.post('/api/evaluate-response', async (req, res) => {
  try {
    const { taskType, promptData, studentResponse } = req.body || {};
    const customApiKey = (req.headers['x-gemini-api-key'] as string)?.trim() || (req.body?.apiKey?.trim() as string);
    const result = await handleEvaluateResponse(taskType, promptData, studentResponse, customApiKey);
    res.json({ success: true, data: result });
  } catch (error: any) {
    const msg = extractErrorMessage(error);
    const status = getStatus(error);
    let httpStatus = 500;
    if (isKeyError(error)) {
      httpStatus = 401;
    } else if (isTransientError(error)) {
      httpStatus = 429;
    } else if (status >= 400 && status <= 599) {
      httpStatus = status;
    }
    res.status(httpStatus).json({ success: false, error: msg });
  }
});

app.post('/api/tts', async (req, res) => {
  try {
    const { text, voiceName } = req.body || {};
    const customApiKey = (req.headers['x-gemini-api-key'] as string)?.trim() || (req.body?.apiKey?.trim() as string);
    const result = await handleSynthesizeSpeech(text, voiceName, customApiKey);
    res.json({ success: true, audioBase64: result.audioBase64, modelUsed: result.modelUsed });
  } catch (error: any) {
    const msg = error?.message || 'TTS synthesis failed';
    const status = msg === 'SPEECH_UNAVAILABLE' ? 503 : 500;
    res.status(status).json({ success: false, error: msg });
  }
});

app.post('/api/transcribe', async (req, res) => {
  try {
    const { audioBase64, mimeType } = req.body || {};
    const customApiKey = (req.headers['x-gemini-api-key'] as string)?.trim() || (req.body?.apiKey?.trim() as string);
    const result = await handleTranscribeAudio(audioBase64, mimeType, customApiKey);
    res.json({ success: true, transcript: result.transcript, modelUsed: result.modelUsed });
  } catch (error: any) {
    const msg = error?.message || 'Audio transcription failed';
    const status = msg === 'SPEECH_UNAVAILABLE' ? 503 : 500;
    res.status(status).json({ success: false, error: msg });
  }
});

app.post('/api/test-key', async (req, res) => {
  const customApiKey = (req.headers['x-gemini-api-key'] as string)?.trim() || (req.body?.apiKey?.trim() as string);
  const apiKey = customApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ success: false, error: 'No Gemini API key provided.' });
  }

  try {
    const result = await handleTestApiKey(apiKey);
    res.json(result);
  } catch (error: any) {
    console.error('Test key error:', error);
    const errMsg = extractErrorMessage(error);
    const status = getStatus(error);
    let httpStatus = 400;
    if (isKeyError(error)) {
      httpStatus = 401;
    } else if (isTransientError(error)) {
      httpStatus = 429;
    } else if (status === 500) {
      httpStatus = 500;
    }

    res.status(httpStatus).json({ success: false, error: errMsg });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', hasGeminiKey: !!process.env.GEMINI_API_KEY });
});

const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(port, () => {
  console.log(`TOEFL Prep Studio server listening on port ${port}`);
});
