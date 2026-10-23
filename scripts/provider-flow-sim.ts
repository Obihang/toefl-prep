import { handleTestApiKey } from '../src/server/geminiHandler.ts';
import { probeProvider } from '../src/server/providerProbe.ts';
import { clearDeadModels, clearModelChainsCache, isModelDead } from '../src/server/modelRoles.ts';

console.log('--- Starting Provider Flow & Dead-Model Fallback Simulation ---');

const originalFetch = globalThis.fetch;

// Helper to install mock fetch handler
let currentMockHandler: (url: string, init?: RequestInit) => Promise<Response>;
globalThis.fetch = ((url: any, init?: any) => {
  if (currentMockHandler) {
    return currentMockHandler(String(url), init);
  }
  return originalFetch(url, init);
}) as any;

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function textResponse(text: string, status = 400): Response {
  return new Response(text, {
    status,
    headers: { 'Content-Type': 'text/plain' },
  });
}

async function runTest1() {
  console.log('\n[Test 1] Gemini: Mocked /models list with 3.x models, generateContent succeeds');
  clearDeadModels();
  clearModelChainsCache();

  currentMockHandler = async (url: string, init?: RequestInit) => {
    if (url.includes('/models') && !url.includes(':generateContent')) {
      return jsonResponse({
        models: [
          { name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3.5-pro', supportedGenerationMethods: ['generateContent'] },
        ],
      });
    }
    if (url.includes(':generateContent')) {
      return jsonResponse({
        candidates: [
          { content: { parts: [{ text: 'OK' }] } },
        ],
      });
    }
    return textResponse('Not found', 404);
  };

  const res = await handleTestApiKey({
    provider: 'gemini',
    apiKey: 'AIzaSyMockGeminiKey_3x_test',
  });

  console.log('Gemini Test result:', res);
  if (!res.success) throw new Error('Test 1 failed: success should be true');
  if (res.model !== 'gemini-3.5-flash-lite') {
    throw new Error(`Test 1 failed: expected gemini-3.5-flash-lite, got ${res.model}`);
  }
  if (res.generationModel !== 'gemini-3.5-flash-lite' || res.evaluationModel !== 'gemini-3.5-pro') {
    throw new Error('Test 1 failed: generation or evaluation model mismatch');
  }
  if (!res.message.includes('gemini-3.5-flash-lite') || !res.message.includes('gemini-3.5-pro')) {
    throw new Error('Test 1 failed: message does not mention chosen generation and evaluation models');
  }

  // Also test probeProvider for Gemini
  clearModelChainsCache();
  const probeRes = await probeProvider('gemini', 'AIzaSyMockGeminiKey_3x_test');
  if (probeRes.generationModel !== 'gemini-3.5-flash-lite') {
    throw new Error(`Test 1 probe failed: expected gemini-3.5-flash-lite, got ${probeRes.generationModel}`);
  }
  console.log('✓ Test 1 Passed: Gemini discovery and execution selected correct 3.x models');
}

async function runTest2() {
  console.log('\n[Test 2] NVIDIA: First ranked model returns 410, second succeeds');
  clearDeadModels();
  clearModelChainsCache();

  const attempts: string[] = [];

  currentMockHandler = async (url: string, init?: RequestInit) => {
    if (url.includes('/models') && init?.method === 'GET') {
      return jsonResponse({
        data: [
          { id: 'meta/llama-3.1-8b-instruct' },
          { id: 'meta/llama-3.2-3b-instruct' },
        ],
      });
    }
    if (url.includes('/chat/completions')) {
      const body = JSON.parse(String(init?.body || '{}'));
      attempts.push(body.model);
      if (body.model === 'meta/llama-3.1-8b-instruct') {
        return jsonResponse({ error: 'Model has been retired and is gone' }, 410);
      }
      if (body.model === 'meta/llama-3.2-3b-instruct') {
        return jsonResponse({
          choices: [{ message: { content: 'OK' } }],
        });
      }
    }
    return textResponse('Not found', 404);
  };

  const res = await probeProvider('nvidia', 'nvapi-mock-test-key-nvidia');
  console.log('NVIDIA probe result:', res, 'Attempts:', attempts);

  if (!res.success) throw new Error('Test 2 failed: success should be true');
  if (res.model !== 'meta/llama-3.2-3b-instruct') {
    throw new Error(`Test 2 failed: expected meta/llama-3.2-3b-instruct, got ${res.model}`);
  }
  if (!isModelDead('meta/llama-3.1-8b-instruct')) {
    throw new Error('Test 2 failed: 410 model was not marked dead for 24h');
  }
  if (!attempts.includes('meta/llama-3.1-8b-instruct') || !attempts.includes('meta/llama-3.2-3b-instruct')) {
    throw new Error('Test 2 failed: did not attempt both first and second model');
  }
  console.log('✓ Test 2 Passed: NVIDIA 410 handled, model marked dead, second model succeeded');
}

async function runTest3() {
  console.log('\n[Test 3] OpenRouter: First :free model returns 404, second succeeds');
  clearDeadModels();
  clearModelChainsCache();

  const attempts: string[] = [];

  currentMockHandler = async (url: string, init?: RequestInit) => {
    if (url.includes('/models') && init?.method === 'GET') {
      return jsonResponse({
        data: [
          { id: 'meta-llama/llama-3.1-8b-instruct:free' },
          { id: 'mistralai/mistral-7b-instruct:free' },
        ],
      });
    }
    if (url.includes('/chat/completions')) {
      const body = JSON.parse(String(init?.body || '{}'));
      attempts.push(body.model);
      if (body.model === 'meta-llama/llama-3.1-8b-instruct:free') {
        return jsonResponse({ error: { message: 'Model not found' } }, 404);
      }
      if (body.model === 'mistralai/mistral-7b-instruct:free') {
        return jsonResponse({
          choices: [{ message: { content: 'OK' } }],
        });
      }
    }
    return textResponse('Not found', 404);
  };

  const res = await probeProvider('openrouter', 'sk-or-mock-test-key-or');
  console.log('OpenRouter probe result:', res, 'Attempts:', attempts);

  if (!res.success) throw new Error('Test 3 failed: success should be true');
  if (res.model !== 'mistralai/mistral-7b-instruct:free') {
    throw new Error(`Test 3 failed: expected mistralai/mistral-7b-instruct:free, got ${res.model}`);
  }
  if (!isModelDead('meta-llama/llama-3.1-8b-instruct:free')) {
    throw new Error('Test 3 failed: 404 model was not marked dead');
  }
  console.log('✓ Test 3 Passed: OpenRouter 404 model skipped, second :free model succeeded');
}

async function runTest4() {
  console.log('\n[Test 4] Groq: Discovery has no llama-3.3, uses new models');
  clearDeadModels();
  clearModelChainsCache();

  currentMockHandler = async (url: string, init?: RequestInit) => {
    if (url.includes('/models') && init?.method === 'GET') {
      return jsonResponse({
        data: [
          { id: 'openai/gpt-oss-20b' },
          { id: 'openai/gpt-oss-120b' },
          { id: 'qwen/qwen3.6-27b' },
        ],
      });
    }
    if (url.includes('/chat/completions')) {
      const body = JSON.parse(String(init?.body || '{}'));
      if (body.model.includes('llama-3.3')) {
        return textResponse('Decommissioned model', 400);
      }
      return jsonResponse({
        choices: [{ message: { content: 'OK' } }],
      });
    }
    return textResponse('Not found', 404);
  };

  const res = await probeProvider('groq', 'gsk_mock-groq-test-key');
  console.log('Groq probe result:', res);

  if (!res.success) throw new Error('Test 4 failed: success should be true');
  if (res.model.includes('llama-3.3')) {
    throw new Error('Test 4 failed: retired llama-3.3 was selected');
  }
  if (res.generationModel !== 'openai/gpt-oss-20b') {
    throw new Error(`Test 4 failed: expected generation model openai/gpt-oss-20b, got ${res.generationModel}`);
  }
  if (res.evaluationModel !== 'openai/gpt-oss-120b') {
    throw new Error(`Test 4 failed: expected evaluation model openai/gpt-oss-120b, got ${res.evaluationModel}`);
  }
  console.log('✓ Test 4 Passed: Groq selected openai/gpt-oss-20b and 120b with no retired models');
}

async function runTest5() {
  console.log('\n[Test 5] Empty Gemini model list produces "Could not list models" error');
  clearDeadModels();
  clearModelChainsCache();

  currentMockHandler = async (url: string, init?: RequestInit) => {
    if (url.includes('/models')) {
      return jsonResponse({
        models: [],
      });
    }
    return textResponse('Not found', 404);
  };

  let threw = false;
  let errorMsg = '';

  try {
    await handleTestApiKey({
      provider: 'gemini',
      apiKey: 'AIzaSyEmptyTestKey999',
    });
  } catch (err: any) {
    threw = true;
    errorMsg = String(err?.message || err);
  }

  console.log('Captured error:', errorMsg);

  if (!threw) {
    throw new Error('Test 5 failed: handleTestApiKey did not throw on empty model list');
  }
  if (!errorMsg.includes('Could not list models for this key') || !errorMsg.includes('HTTP')) {
    throw new Error(`Test 5 failed: error message did not match expected "Could not list models for this key (HTTP ...)": ${errorMsg}`);
  }
  if (errorMsg.includes('All models in fallback chain failed')) {
    throw new Error(`Test 5 failed: generic "All models in fallback chain failed" error was returned: ${errorMsg}`);
  }
  console.log('✓ Test 5 Passed: Empty Gemini model list produced clear descriptive error');
}

async function main() {
  try {
    await runTest1();
    await runTest2();
    await runTest3();
    await runTest4();
    await runTest5();
    console.log('\n======================================================');
    console.log('🎉 ALL 5 PROVIDER FLOW SIMULATION TESTS PASSED! 🎉');
    console.log('======================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ SIMULATION FAILED:', err);
    process.exit(1);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main();
