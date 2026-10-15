import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  handleGenerateTask,
  handleEvaluateResponse,
  handleSynthesizeSpeech,
  handleTranscribeAudio,
  handleTestApiKey,
  parseRateLimitFromError,
  extractErrorMessage,
  getStatus,
  isKeyError,
  isTransientError,
  isQuotaExhaustedError,
} from './src/server/geminiHandler.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function createServer() {
  const app = express();

  app.use(express.json({ limit: '50mb' }));

  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      const key = req.headers['x-gemini-api-key'];
      console.log(`API Request: ${req.method} ${req.path}, x-gemini-api-key: ${key ? `PRESENT (starts with ${key.toString().slice(0, 6)})` : 'MISSING'}`);
    }
    next();
  });

  function extractApiConfig(req: express.Request) {
    const provider = (req.headers['x-api-provider'] as string)?.trim() || req.body?.provider || 'gemini';
    const apiKey = (req.headers['x-api-key'] as string)?.trim() || (req.headers['x-gemini-api-key'] as string)?.trim() || (req.body?.apiKey?.trim() as string);
    const baseUrl = (req.headers['x-api-base-url'] as string)?.trim() || req.body?.baseUrl?.trim();
    const model = (req.headers['x-api-model'] as string)?.trim() || req.body?.model?.trim();
    return { provider, apiKey, baseUrl, model };
  }

  // API endpoints
  app.post('/api/generate-task', async (req, res) => {
    try {
      const { taskType, level, topic } = req.body || {};
      const apiConfig = extractApiConfig(req);
      const result = await handleGenerateTask(taskType, level, topic, apiConfig);
      res.json({ success: true, data: result, rateLimit: result.rateLimit });
    } catch (error: any) {
      const msg = extractErrorMessage(error);
      const status = getStatus(error);
      const rateLimit = (status === 429 || isQuotaExhaustedError(error)) ? parseRateLimitFromError(error) : undefined;
      res.status(status === 429 ? 429 : 500).json({ success: false, error: msg, rateLimit });
    }
  });

  app.post('/api/evaluate-response', async (req, res) => {
    try {
      const { taskType, promptData, studentResponse } = req.body || {};
      const apiConfig = extractApiConfig(req);
      const result = await handleEvaluateResponse(taskType, promptData, studentResponse, apiConfig);
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
      const customApiKey = (req.headers['x-gemini-api-key'] as string)?.trim() || (req.headers['x-api-key'] as string)?.trim() || (req.body?.apiKey?.trim() as string);
      const result = await handleSynthesizeSpeech(text, voiceName, customApiKey);
      res.json({ success: true, audioBase64: result.audioBase64, mimeType: result.mimeType, modelUsed: result.modelUsed });
    } catch (error: any) {
      const msg = extractErrorMessage(error);
      const status = getStatus(error);
      const rateLimit = (status === 429 || isQuotaExhaustedError(error)) ? parseRateLimitFromError(error) : undefined;
      if (status === 429 || isQuotaExhaustedError(error)) {
        res.status(429).json({ success: false, error: msg, rateLimit });
      } else {
        const httpStatus = msg === 'SPEECH_UNAVAILABLE' ? 503 : 500;
        res.status(httpStatus).json({ success: false, error: msg });
      }
    }
  });

  app.post('/api/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType } = req.body || {};

      const customApiKey = (req.headers['x-gemini-api-key'] as string)?.trim() || (req.headers['x-api-key'] as string)?.trim() || (req.body?.apiKey?.trim() as string);
      const result = await handleTranscribeAudio(audioBase64, mimeType, customApiKey);


      res.json({ success: true, transcript: result.transcript, modelUsed: result.modelUsed, durationMs: result.durationMs });
    } catch (error: any) {
      const msg = error?.message || 'Audio transcription failed';
      const status = msg === 'SPEECH_UNAVAILABLE' ? 503 : 500;
      res.status(status).json({ success: false, error: msg });
    }
  });

  app.post('/api/test-key', async (req, res) => {
    const apiConfig = extractApiConfig(req);
    const effectiveKey = apiConfig.apiKey || (apiConfig.provider === 'gemini' ? process.env.GEMINI_API_KEY : '');
    if (!effectiveKey && apiConfig.provider !== 'custom') {
      return res.status(400).json({ success: false, error: `No API key provided for ${apiConfig.provider}.` });
    }

    try {
      const result = await handleTestApiKey(apiConfig);
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

  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });

  app.use(vite.middlewares);

  app.listen(3000, '0.0.0.0', () => {
    console.log('Server running on http://localhost:3000');
  });
}

createServer();
