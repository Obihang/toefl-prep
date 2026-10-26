import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import rateLimit from 'express-rate-limit';
import {
  handleHealth,
  handleTestKeyEndpoint,
  handleGenerateTaskEndpoint,
  handleEvaluateResponseEndpoint,
  handleSttEndpoint,
  handleTtsEndpoint,
  handleDictionaryEndpoint,
  handleTtsCheckEndpoint,
  wrapApiHandler,
} from './src/server/handlers.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function createServer() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '10mb' }));

  // API rate limiter
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    standardHeaders: 'draft-7', // Modern standardized headers
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests from this IP, please try again after 15 minutes.' },
  });

  app.use('/api/', apiLimiter);

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

  // API endpoints sharing handlers with Vercel functions wrapped with wrapApiHandler
  app.post('/api/generate-task', wrapApiHandler(handleGenerateTaskEndpoint));
  app.post('/api/evaluate-response', wrapApiHandler(handleEvaluateResponseEndpoint));
  app.post('/api/tts', wrapApiHandler(handleTtsEndpoint));
  app.get('/api/tts-check', wrapApiHandler(handleTtsCheckEndpoint));
  app.post('/api/stt', wrapApiHandler(handleSttEndpoint));
  app.post('/api/transcribe', wrapApiHandler(handleSttEndpoint));
  app.post('/api/test-key', wrapApiHandler(handleTestKeyEndpoint));
  app.get('/api/dictionary', wrapApiHandler(handleDictionaryEndpoint));
  app.get('/api/health', wrapApiHandler(handleHealth));

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
