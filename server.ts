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
import { getApiConfig } from './src/server/apiConfig.ts';
import { probeProvider, probeAuto } from './src/server/providerProbe.ts';
import { DEFAULT_PURPOSE_MODELS } from './src/utils/keyDetect.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function createServer() {
  const app = express();

  app.use(express.json({ limit: '50mb' }));

  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      const start = Date.now();
      const provider = req.headers['x-api-provider'] || 'gemini';
      const key = (req.headers['x-api-key'] || req.headers['x-gemini-api-key']) as string | undefined;
      const hasKey = !!key;
      const requestId = (req.headers['x-request-id'] as string) || ('req-' + Math.random().toString(36).substring(2, 9));
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`API Request: ${req.method} ${req.path}, provider: ${provider}, keyPresent: ${hasKey}, status: ${res.statusCode}, duration: ${duration}ms, requestId: ${requestId}`);
      });
    }
    next();
  });

  // API endpoints
  app.post('/api/generate-task', async (req, res) => {
    try {
      const { taskType, level, topic } = req.body || {};
      const apiConfig = getApiConfig(req.headers, req.body);
      const result = await handleGenerateTask(taskType, level, topic, apiConfig);
      res.json({ success: true, data: result, rateLimit: result.rateLimit });
    } catch (error: any) {
      const apiConfig = getApiConfig(req.headers, req.body);
      const msg = extractErrorMessage(error, apiConfig.provider);
      const status = getStatus(error);
      const rateLimit = (status === 429 || isQuotaExhaustedError(error)) ? parseRateLimitFromError(error) : undefined;
      res.status(status === 429 ? 429 : 500).json({ success: false, error: msg, rateLimit });
    }
  });

  app.post('/api/evaluate-response', async (req, res) => {
    try {
      const { taskType, promptData, studentResponse } = req.body || {};
      const apiConfig = getApiConfig(req.headers, req.body);
      const result = await handleEvaluateResponse(taskType, promptData, studentResponse, apiConfig);
      res.json({ success: true, data: result });
    } catch (error: any) {
      const apiConfig = getApiConfig(req.headers, req.body);
      const msg = extractErrorMessage(error, apiConfig.provider);
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
      const apiConfig = getApiConfig(req.headers, req.body);
      const result = await handleSynthesizeSpeech(text, voiceName, apiConfig);
      res.json({ success: true, audioBase64: result.audioBase64, mimeType: result.mimeType, modelUsed: result.modelUsed });
    } catch (error: any) {
      const apiConfig = getApiConfig(req.headers, req.body);
      const msg = extractErrorMessage(error, apiConfig.provider);
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
      const apiConfig = getApiConfig(req.headers, req.body);
      const result = await handleTranscribeAudio(audioBase64, mimeType, apiConfig);
      res.json({ success: true, transcript: result.transcript, modelUsed: result.modelUsed, durationMs: result.durationMs });
    } catch (error: any) {
      const msg = error?.message || 'Audio transcription failed';
      const status = msg === 'SPEECH_UNAVAILABLE' ? 503 : 500;
      res.status(status).json({ success: false, error: msg });
    }
  });

  app.post('/api/test-key', async (req, res) => {
    try {
      const config = getApiConfig(req.headers, req.body);

      if (!config.apiKey && config.provider !== 'gemini' && config.provider !== 'custom') {
        return res.status(400).json({
          success: false,
          error: 'Please paste an API key first.',
        });
      }

      // If provider is auto or auto-probed
      if (config.provider === 'auto' || (!req.headers['x-api-provider'] && !req.body?.provider)) {
        if (config.apiKey) {
          const autoResult = await probeAuto(config.apiKey, config.model);
          return res.json(autoResult);
        }
      }

      if (config.provider === 'gemini') {
        const apiKey = config.apiKey || process.env.GEMINI_API_KEY;
        if (!apiKey) {
          return res.status(400).json({
            success: false,
            error: 'No API key provided. Paste your key in Settings & API Key',
          });
        }
        const result = await handleTestApiKey({
          apiKey,
          model: config.model,
          provider: 'gemini',
        });
        return res.json({
          ...result,
          provider: 'gemini',
          providerName: 'Google Gemini',
          purposeModels: DEFAULT_PURPOSE_MODELS.gemini,
        });
      }

      // Supported OpenAI-compatible providers
      if (['nvidia', 'groq', 'openrouter', 'openai', 'deepseek', 'xai'].includes(config.provider)) {
        const probeResult = await probeProvider(config.provider, config.apiKey, config.model);
        return res.json(probeResult);
      }

      const result = await handleTestApiKey(config);
      return res.json(result);
    } catch (error: any) {
      if (!isKeyError(error)) {
        console.error('Test key error:', error);
      }
      const config = getApiConfig(req.headers, req.body);
      const errMsg = extractErrorMessage(error, config.provider);
      const rawStatus = typeof error?.status === 'number' ? error.status : getStatus(error);
      let httpStatus = 400;
      if (isKeyError(error) || rawStatus === 401 || rawStatus === 402 || rawStatus === 429) {
        httpStatus = isKeyError(error) ? 401 : rawStatus;
      } else if (rawStatus >= 500 && rawStatus <= 599) {
        httpStatus = 502;
      }

      res.status(httpStatus).json({ success: false, error: errMsg });
    }
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', hasGeminiKey: !!process.env.GEMINI_API_KEY });
  });

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(3000, '0.0.0.0', () => {
    console.log('Server running on http://localhost:3000');
  });
}

createServer();
