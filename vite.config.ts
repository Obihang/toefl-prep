import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
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

function toeflApiPlugin(): Plugin {
  return {
    name: 'toefl-api-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const urlPath = req.url ? req.url.split('?')[0] : '';
        if (!urlPath.startsWith('/api/')) {
          return next();
        }

        const readBody = (): Promise<any> => {
          return new Promise((resolve, reject) => {
            let data = '';
            req.on('data', (chunk) => {
              data += chunk;
            });
            req.on('end', () => {
              try {
                resolve(data ? JSON.parse(data) : {});
              } catch (err) {
                reject(err);
              }
            });
            req.on('error', reject);
          });
        };

        const customApiKey =
          (req.headers['x-gemini-api-key'] as string)?.trim() || undefined;

        if (urlPath === '/api/generate-task' && req.method === 'POST') {
          try {
            const body = await readBody();
            const { taskType, level, topic } = body;
            const apiKey = customApiKey || (body?.apiKey?.trim() as string) || undefined;
            const result = await handleGenerateTask(taskType, level, topic, apiKey);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, data: result }));
          } catch (error: any) {
            const msg = extractErrorMessage(error);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                success: false,
                error: msg || 'Failed to generate task with AI',
              })
            );
          }
          return;
        }

        if (urlPath === '/api/evaluate-response' && req.method === 'POST') {
          try {
            const body = await readBody();
            const { taskType, promptData, studentResponse } = body;
            const apiKey = customApiKey || (body?.apiKey?.trim() as string) || undefined;
            const result = await handleEvaluateResponse(
              taskType,
              promptData,
              studentResponse,
              apiKey
            );
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, data: result }));
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
            res.statusCode = httpStatus;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                success: false,
                error: msg || 'Failed to evaluate response with AI',
              })
            );
          }
          return;
        }

        if (urlPath === '/api/tts' && req.method === 'POST') {
          try {
            const body = await readBody();
            const { text, voiceName } = body;
            const apiKey = customApiKey || (body?.apiKey?.trim() as string) || undefined;
            const result = await handleSynthesizeSpeech(text, voiceName, apiKey);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, audioBase64: result.audioBase64, modelUsed: result.modelUsed }));
          } catch (error: any) {
            const msg = error?.message || 'TTS synthesis failed';
            res.statusCode = msg === 'SPEECH_UNAVAILABLE' ? 503 : 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: msg }));
          }
          return;
        }

        if (urlPath === '/api/transcribe' && req.method === 'POST') {
          try {
            const body = await readBody();
            const { audioBase64, mimeType } = body;
            const apiKey = customApiKey || (body?.apiKey?.trim() as string) || undefined;
            const result = await handleTranscribeAudio(audioBase64, mimeType, apiKey);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, transcript: result.transcript, modelUsed: result.modelUsed }));
          } catch (error: any) {
            const msg = error?.message || 'Audio transcription failed';
            res.statusCode = msg === 'SPEECH_UNAVAILABLE' ? 503 : 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: msg }));
          }
          return;
        }

        if (urlPath === '/api/test-key' && req.method === 'POST') {
          try {
            const body = await readBody();
            const apiKey = customApiKey || (body?.apiKey?.trim() as string) || process.env.GEMINI_API_KEY || '';
            const result = await handleTestApiKey(apiKey);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
          } catch (error: any) {
            const msg = extractErrorMessage(error);
            const status = getStatus(error);
            let httpStatus = 400;
            if (isKeyError(error)) {
              httpStatus = 401;
            } else if (isTransientError(error)) {
              httpStatus = 429;
            } else if (status === 500) {
              httpStatus = 500;
            }
            res.statusCode = httpStatus;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: msg }));
          }
          return;
        }

        if (urlPath === '/api/health') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'ok', hasGeminiKey: !!process.env.GEMINI_API_KEY }));
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), toeflApiPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
