import type { Request, Response } from 'express';
import { synthesizeEdge, EdgeTtsError, OUTPUT_FORMAT } from '../edgeTts.ts';
import { MsEdgeTTS } from 'msedge-tts';

export async function handleTtsCheckEndpoint(req: Request, res: Response) {
  const results: any = { ok: true, diagnostics: {} };
  
  // 1. Check voices
  const tts = new MsEdgeTTS();
  try {
    const voices = await tts.getVoices();
    results.diagnostics.edgeVoicesCount = voices.filter(v => v.Name.startsWith('en-')).length;
    results.diagnostics.msedgeTtsVersion = '2.1.0';
  } catch (err: any) {
    results.diagnostics.edgeVoicesError = err.message;
  }

  // 2. Test voices
  const testVoices = ['en-US-AriaNeural', 'en-US-GuyNeural'];
  for (const voice of testVoices) {
    const start = Date.now();
    try {
      const buffer = await synthesizeEdge('This is a test.', voice);
      results.diagnostics[voice] = {
        ok: true,
        bytes: buffer.length,
        elapsedMs: Date.now() - start
      };
    } catch (err: any) {
      results.diagnostics[voice] = {
        ok: false,
        error: err instanceof EdgeTtsError ? `${err.step}: ${err.message} (status: ${err.status})` : err.message
      };
      results.ok = false;
    }
  }

  res.status(results.ok ? 200 : 502).json(results);
}
