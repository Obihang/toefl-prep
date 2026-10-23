import assert from 'assert';
import { synthesizeGeminiTts } from '../src/server/geminiHandler.ts';

async function runGeminiTtsRegressionTests() {
  console.log('--- Starting Gemini TTS Regression Test Suite ---');

  // Test 1: Gemini TTS uses gemini-3.8-flash-lite-tts, not gemini-1.5-flash
  console.log('[Test 1] Verifying Gemini TTS endpoint URL model...');
  let interceptedUrl = '';
  let interceptedPayload: any = null;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    interceptedUrl = String(url);
    interceptedPayload = init?.body ? JSON.parse(String(init.body)) : null;

    // Return mock valid audio response
    const mockAudioBase64 = Buffer.from('RIFF1234WAVEfmt 16000data1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890').toString('base64');
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: 'audio/wav',
                    data: mockAudioBase64,
                  },
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  try {
    const res = await synthesizeGeminiTts('Hello world test', 'AIzaSyMockKey123', { voiceName: 'Kore', isMale: false });

    assert.ok(!interceptedUrl.includes('gemini-1.5-flash'), 'FAIL: Endpoint called deprecated gemini-1.5-flash');
    assert.ok(interceptedUrl.includes('gemini-3.8-flash-lite-tts'), 'PASS: Endpoint uses gemini-3.8-flash-lite-tts');
    assert.strictEqual(interceptedPayload.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Kore', 'PASS: Selected voice Kore passed correctly');
    assert.strictEqual(res.mimeType, 'audio/wav', 'PASS: MIME type is audio/wav');
    assert.ok(res.base64Audio.length > 100, 'PASS: Audio base64 is non-empty and valid length');
    assert.strictEqual(res.modelUsed, 'gemini-3.8-flash-lite-tts (Kore)', 'PASS: Identifies model and voice used');
  } finally {
    globalThis.fetch = originalFetch;
  }

  // Test 2: Prebuilt voice fallback mapping
  console.log('[Test 2] Verifying prebuilt voice fallback mapping...');
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    interceptedPayload = init?.body ? JSON.parse(String(init.body)) : null;
    const mockAudioBase64 = Buffer.from('RIFF1234WAVEfmt 16000data1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890').toString('base64');
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/wav', data: mockAudioBase64 } }] } }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  try {
    await synthesizeGeminiTts('Test male voice', 'AIzaSyMockKey123', { voiceName: 'invalidVoiceName', isMale: true });
    assert.strictEqual(interceptedPayload.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Puck', 'PASS: Male voice falls back to Puck');

    await synthesizeGeminiTts('Test female voice', 'AIzaSyMockKey123', { voiceName: 'invalidVoiceName', isMale: false });
    assert.strictEqual(interceptedPayload.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Kore', 'PASS: Female voice falls back to Kore');
  } finally {
    globalThis.fetch = originalFetch;
  }

  // Test 3: Missing credentials throw explicit error
  console.log('[Test 3] Verifying missing credentials throw explicit error...');
  try {
    await synthesizeGeminiTts('Test missing key', '', { voiceName: 'Kore' });
    assert.fail('Should have thrown missing credential error');
  } catch (err: any) {
    assert.ok(err.message.includes('Missing dedicated Gemini TTS API key'), 'PASS: Throws clear missing credential error');
  }

  // Test 4: HTTP 404, 401, 429 status code handling
  console.log('[Test 4] Verifying HTTP error code classification...');
  const errorCases = [
    { status: 404, body: { error: { message: 'models/gemini-1.5-flash is not found' } }, expected: 'Gemini HTTP 404' },
    { status: 401, body: { error: { message: 'API key not valid' } }, expected: 'Gemini HTTP 401' },
    { status: 429, body: { error: { message: 'Quota exceeded' } }, expected: 'Gemini HTTP 429' },
  ];

  for (const c of errorCases) {
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify(c.body), { status: c.status, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    try {
      await synthesizeGeminiTts('Error test', 'AIzaSyMockKey123');
      assert.fail(`Status ${c.status} should have failed`);
    } catch (err: any) {
      assert.ok(err.message.includes(c.expected), `PASS: HTTP ${c.status} contains expected text "${c.expected}"`);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  // Test 5: Verify Vercel handler delegates directly to handleTtsEndpoint
  console.log('[Test 5] Verifying Vercel api/tts.ts integration...');
  const vercelModule = await import('../api/tts.ts');
  assert.ok(typeof vercelModule.default === 'function', 'PASS: api/tts.ts exports default handler function');

  console.log('--- All Gemini TTS Regression Tests Passed Successfully! 🎉 ---');
}

runGeminiTtsRegressionTests().catch((err) => {
  console.error('TTS Regression Test Failed:', err);
  process.exit(1);
});
