import type { Request, Response } from 'express';
import { synthesizeEdge, listEdgeVoices, EdgeTtsError, SEC_MS_GEC_VERSION, getClockSkewSeconds } from '../edgeTts';

/** Diagnostic: shows the exact Edge TTS result (or error) so problems are visible instead of guessed. */
export async function handleTtsCheckEndpoint(_req: Request, res: Response) {
  const results: any = { ok: true, diagnostics: { secMsGecVersion: SEC_MS_GEC_VERSION } };

  try {
    const voices = await listEdgeVoices();
    const english = voices.filter((v) => v.Locale?.startsWith('en-'));
    results.diagnostics.voicesTotal = voices.length;
    results.diagnostics.englishVoices = english.length;
    results.diagnostics.englishMale = english.filter((v) => v.Gender === 'Male').length;
    results.diagnostics.englishFemale = english.filter((v) => v.Gender === 'Female').length;
  } catch (err: any) {
    results.ok = false;
    results.diagnostics.voicesError =
      err instanceof EdgeTtsError ? `${err.step}: ${err.message} (status: ${err.status})` : String(err?.message || err);
  }

  for (const voice of ['en-US-AriaNeural', 'en-US-GuyNeural']) {
    const start = Date.now();
    try {
      const buffer = await synthesizeEdge('This is a test.', voice);
      results.diagnostics[voice] = { ok: true, bytes: buffer.length, elapsedMs: Date.now() - start };
    } catch (err: any) {
      results.ok = false;
      results.diagnostics[voice] = {
        ok: false,
        elapsedMs: Date.now() - start,
        error: err instanceof EdgeTtsError ? `${err.step}: ${err.message} (status: ${err.status})` : String(err?.message || err),
      };
    }
  }
  results.diagnostics.clockSkewSeconds = Math.round(getClockSkewSeconds());
  res.status(results.ok ? 200 : 502).json(results);
}
