import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
import { handleGenerateTask, handleEvaluateResponse, handleSynthesizeSpeech, handleTranscribeAudio } from './src/server/geminiHandler.ts';

function toeflApiPlugin(): Plugin {
  return {
    name: 'toefl-api-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
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

        if (req.url === '/api/generate-task' && req.method === 'POST') {
          try {
            const body = await readBody();
            const { taskType, level, topic } = body;
            const result = await handleGenerateTask(taskType, level, topic);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, data: result }));
          } catch (error: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                success: false,
                error: error.message || 'Failed to generate task with AI',
              })
            );
          }
          return;
        }

        if (req.url === '/api/evaluate-response' && req.method === 'POST') {
          try {
            const body = await readBody();
            const { taskType, promptData, studentResponse } = body;
            const result = await handleEvaluateResponse(
              taskType,
              promptData,
              studentResponse
            );
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, data: result }));
          } catch (error: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                success: false,
                error: error.message || 'Failed to evaluate response with AI',
              })
            );
          }
          return;
        }

        if (req.url === '/api/tts' && req.method === 'POST') {
          try {
            const body = await readBody();
            const { text, voiceName } = body;
            const audioBase64 = await handleSynthesizeSpeech(text, voiceName);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, audioBase64 }));
          } catch (error: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: error.message || 'TTS synthesis failed' }));
          }
          return;
        }

        if (req.url === '/api/transcribe' && req.method === 'POST') {
          try {
            const body = await readBody();
            const { audioBase64, mimeType } = body;
            const transcript = await handleTranscribeAudio(audioBase64, mimeType);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, transcript }));
          } catch (error: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: error.message || 'Audio transcription failed' }));
          }
          return;
        }

        if (req.url === '/api/test-key' && req.method === 'POST') {
          try {
            const body = await readBody();
            // Implement test-key logic similar to the Vercel function, 
            // but adapted for Express-like request/response
            // Or just import and call the handler if it's compatible
            
            // Re-implementing logic here for now to match the existing pattern in vite.config.ts
            // Actually, let's just make it simple:
            const customApiKey = req.headers['x-gemini-api-key'] as string || '';
            const apiKey = customApiKey || process.env.GEMINI_API_KEY || '';
            
            if (!apiKey) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: 'No Gemini API key provided.' }));
              return;
            }

            const { GoogleGenAI } = await import('@google/genai');
            const { GENERATION_CHAIN } = await import('./src/constants/models.ts');
            const { generateWithFallback } = await import('./src/server/geminiUtils.ts');
            const { redactKey, isKeyError, isTransientError } = await import('./src/server/geminiErrors.ts');
            
            const ai = new GoogleGenAI({ apiKey });
            
            const { modelUsed } = await generateWithFallback(ai, GENERATION_CHAIN, async (model) => {
              await ai.models.generateContent({
                model,
                contents: 'Reply with the single word OK',
                config: { temperature: 0.1 },
              });
              return true;
            });
            
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, message: `Key works (${modelUsed})`, model: modelUsed }));
          } catch (error: any) {
            let status = 500;
            if (isKeyError(error)) {
              status = 401;
            } else if (isTransientError(error)) {
              status = 429;
            } else if (error?.status === 400) {
              status = 400;
            }

            res.statusCode = status;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: error.message || 'Test key failed' }));
          }
          return;
        }

        if (req.url === '/api/health') {
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
