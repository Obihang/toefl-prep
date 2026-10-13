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
