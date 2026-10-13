import express from 'express';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { handleGenerateTask, handleEvaluateResponse, handleSynthesizeSpeech, handleTranscribeAudio } from './src/server/geminiHandler.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later.',
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
    const { taskType, level, topic } = req.body;
    const customApiKey = req.headers['x-gemini-api-key'] as string;
    const result = await handleGenerateTask(taskType, level, topic, customApiKey);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Generation failed' });
  }
});

app.post('/api/evaluate-response', async (req, res) => {
  try {
    const { taskType, promptData, studentResponse } = req.body;
    const customApiKey = req.headers['x-gemini-api-key'] as string;
    const result = await handleEvaluateResponse(taskType, promptData, studentResponse, customApiKey);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Evaluation failed' });
  }
});

app.post('/api/tts', async (req, res) => {
  try {
    const { text, voiceName } = req.body;
    const customApiKey = req.headers['x-gemini-api-key'] as string;
    const audioBase64 = await handleSynthesizeSpeech(text, voiceName, customApiKey);
    res.json({ success: true, audioBase64 });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'TTS synthesis failed' });
  }
});

app.post('/api/transcribe', async (req, res) => {
  try {
    const { audioBase64, mimeType } = req.body;
    const customApiKey = req.headers['x-gemini-api-key'] as string;
    const transcript = await handleTranscribeAudio(audioBase64, mimeType, customApiKey);
    res.json({ success: true, transcript });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Audio transcription failed' });
  }
});

app.post('/api/test-key', async (req, res) => {
  const customApiKey = (req.headers['x-gemini-api-key'] as string)?.trim();
  const apiKey = customApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ success: false, error: 'No Gemini API key provided.' });
  }

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const { GENERATION_CHAIN } = await import('./src/constants/models.ts');
    const { generateWithFallback } = await import('./src/server/geminiUtils.ts');
    
    const ai = new GoogleGenAI({ apiKey });
    const { modelUsed } = await generateWithFallback(ai, GENERATION_CHAIN, async (model) => {
      await ai.models.generateContent({
        model,
        contents: 'Reply with the single word OK',
        config: { temperature: 0.1 },
      });
      return true;
    });
    
    res.json({ success: true, message: `Key works (${modelUsed})`, model: modelUsed });
  } catch (error: any) {
    let status = 500;
    if (isKeyError(error)) {
      status = 401;
    } else if (isTransientError(error)) {
      status = 429;
    } else if (error?.status === 400) {
      status = 400;
    }

    res.status(status).json({ success: false, error: error.message || 'Test key failed' });
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
