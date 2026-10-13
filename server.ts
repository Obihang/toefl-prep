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

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', hasGeminiKey: !!process.env.GEMINI_API_KEY });
});

// Serve static assets in production
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(port, () => {
  console.log(`TOEFL Prep Studio server listening on port ${port}`);
});
