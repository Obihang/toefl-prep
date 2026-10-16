// Simulation and unit test suite for API key auto-detection, ranking, probing, and config
import { detectProviderFromKey } from '../src/utils/keyDetect.ts';
import { validateKeyForProvider } from '../src/utils/apiKey.ts';
import { getApiConfig } from '../src/server/apiConfig.ts';
import { rankModels, probeProvider } from '../src/server/providerProbe.ts';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + detail}`);
  if (!ok) failures++;
}

type Call = { url: string; method?: string; headers?: any; body?: any };
let calls: Call[] = [];
let queue: Array<() => Response | Promise<Response>> = [];

const originalFetch = globalThis.fetch;
(globalThis as any).fetch = async (url: string, init: any) => {
  calls.push({
    url: String(url),
    method: init?.method,
    headers: init?.headers,
    body: init?.body ? JSON.parse(init.body) : null,
  });
  const next = queue.shift();
  if (!next) throw new Error(`Unexpected fetch call to ${url}`);
  return next();
};

const jsonOk = (data: any) => () =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const statusRes = (code: number, body = '{}', headers: Record<string, string> = {}) => () =>
  new Response(body, { status: code, headers });

const SECRET_KEY = 'nvapi-SECRET123456789012345678901234567890';

async function expectError(fn: () => Promise<any>): Promise<any | null> {
  try {
    await fn();
    return null;
  } catch (e: any) {
    return e;
  }
}

(async () => {
  console.log('Running key detection, probing, and config simulation tests...');

  // 1. Prefix detection & completion
  const geminiShort = detectProviderFromKey('AIzaShort');
  check('partial Gemini key detected but not complete', geminiShort.provider === 'gemini' && !geminiShort.complete);

  const geminiFull = detectProviderFromKey('AIzaSyD-12345678901234567890123456789012345');
  check('full Gemini key detected and complete', geminiFull.provider === 'gemini' && geminiFull.complete);

  const nvidiaKey = detectProviderFromKey('nvapi-1234567890123456789012345678901234567890');
  check('NVIDIA key detected and complete', nvidiaKey.provider === 'nvidia' && nvidiaKey.complete);

  const groqKey = detectProviderFromKey('gsk_1234567890123456789012345678901234567890');
  check('Groq key detected and complete', groqKey.provider === 'groq' && groqKey.complete);

  const openrouterKey = detectProviderFromKey('sk-or-v1-123456789012345678901234567890123456');
  check('OpenRouter key detected and complete', openrouterKey.provider === 'openrouter' && openrouterKey.complete);

  // 2. Paid prefixes (xAI, Anthropic, sk-) are not auto-selected
  const xaiKey = detectProviderFromKey('xai-12345678901234567890');
  check('xAI key refused for auto-select', xaiKey.provider === null && xaiKey.label === 'xAI Grok' && !!xaiKey.note);

  const antKey = detectProviderFromKey('sk-ant-api03-1234567890');
  check('Anthropic key refused for auto-select', antKey.provider === null && antKey.label === 'Anthropic' && !!antKey.note);

  const skKey = detectProviderFromKey('sk-proj-1234567890');
  check('sk- key refused for auto-select', skKey.provider === null && skKey.label === 'OpenAI or DeepSeek' && !!skKey.note);

  const unknownKey = detectProviderFromKey('random-key-format');
  check('unknown key handled with guidance note', unknownKey.provider === null && unknownKey.label === 'Unknown' && !!unknownKey.note);

  // 3. rankModels filters out specialized models and ranks reasoning models last
  const testIds = [
    'llama-guard-3-8b',
    'whisper-large-v3',
    'tts-1-hd',
    'clip-vit-base',
    'deepseek-r1',
    'qwen-2.5-coder-32b',
    'meta/llama-3.3-70b-instruct',
    'text-embedding-3-small',
    'vision-ocr-model',
  ];
  const rankedNvidia = rankModels('nvidia', testIds);
  check(
    'rankModels drops embeddings, whisper, guard, tts, and puts llama-3.3-70b first',
    rankedNvidia[0] === 'meta/llama-3.3-70b-instruct' &&
      !rankedNvidia.some((id) => /guard|whisper|tts|clip|embedding|ocr/i.test(id))
  );
  check('rankModels puts reasoning model last', rankedNvidia[rankedNvidia.length - 1] === 'deepseek-r1');

  const rankedWithPref = rankModels('nvidia', testIds, 'qwen-2.5-coder-32b');
  check('rankModels places preferred model first when present', rankedWithPref[0] === 'qwen-2.5-coder-32b');

  // 4. probeProvider tests
  // 4a. probeProvider picks the best model
  calls = [];
  queue = [
    jsonOk({ data: [{ id: 'meta/llama-3.1-8b-instruct' }, { id: 'meta/llama-3.3-70b-instruct' }] }),
    jsonOk({ choices: [{ message: { content: 'OK' } }] }),
  ];
  const probeNvidia = await probeProvider('nvidia', 'nvapi-valid-key-12345678901234567890');
  check(
    'probeProvider picks top ranked model',
    probeNvidia.success && probeNvidia.model === 'meta/llama-3.3-70b-instruct' && calls.length === 2
  );

  // 4b. probeProvider falls through after 404 and tries next model
  calls = [];
  queue = [
    jsonOk({ data: [{ id: 'model-a' }, { id: 'model-b' }] }),
    statusRes(404, '{"error":"model not found"}'),
    jsonOk({ choices: [{ message: { content: 'OK' } }] }),
  ];
  const probeFallthrough = await probeProvider('groq', 'gsk_valid-key-12345678901234567890');
  check('probeProvider falls through on model failure', probeFallthrough.success && probeFallthrough.model === 'model-b');

  // 4c. probeProvider returns warning on 429
  calls = [];
  queue = [
    jsonOk({ data: [{ id: 'model-c' }] }),
    statusRes(429, '{"error":"rate limit reached"}'),
  ];
  const probeRateLimit = await probeProvider('groq', 'gsk_valid-key-12345678901234567890');
  check(
    'probeProvider handles 429 with warning',
    probeRateLimit.success && !!probeRateLimit.warning && probeRateLimit.model === 'model-c'
  );

  // 4d. probeProvider errors on 401 without leaking key
  calls = [];
  queue = [statusRes(401, `{"error":"unauthorized for ${SECRET_KEY}"}`)];
  let err = await expectError(() => probeProvider('nvidia', SECRET_KEY));
  check('probeProvider handles 401', !!err && err.status === 401);
  check('probeProvider does not leak key in 401 error text', !String(err?.message).includes(SECRET_KEY));

  // 4e. probeProvider errors on 402
  calls = [];
  queue = [
    jsonOk({ data: [{ id: 'model-d' }] }),
    statusRes(402, '{"error":"payment required"}'),
  ];
  err = await expectError(() => probeProvider('groq', 'gsk_valid-key-12345678901234567890'));
  check('probeProvider handles 402 skipped', !!err && err.status === 502);

  // 5. OpenRouter never lists, tests, or picks non-:free models
  calls = [];
  queue = [
    jsonOk({
      data: [
        { id: 'openai/gpt-4o', pricing: { prompt: '0.005', completion: '0.015' } },
        { id: 'google/gemini-2.0-flash-exp:free', pricing: { prompt: '0', completion: '0' } },
        { id: 'meta-llama/llama-3.3-70b-instruct:free', pricing: { prompt: 0, completion: 0 } },
        { id: 'fake/paid:free', pricing: { prompt: '0.01', completion: '0' } },
      ],
    }),
    jsonOk({ choices: [{ message: { content: 'OK' } }] }),
  ];
  const probeOpenRouter = await probeProvider('openrouter', 'sk-or-v1-valid-key-123456789012345678');
  check(
    'OpenRouter probes only verified free models',
    probeOpenRouter.success &&
      probeOpenRouter.model.endsWith(':free') &&
      !probeOpenRouter.models.some((m) => !m.endsWith(':free') || m.includes('fake/paid'))
  );

  // 6. getApiConfig validation
  // 6a. Ignores client-sent base URL for known providers
  const groqConfig = getApiConfig(
    { 'x-api-provider': 'groq', 'x-api-key': 'gsk_123', 'x-api-base-url': 'https://evil.com/v1' },
    { baseUrl: 'https://evil.com/v1' }
  );
  check('getApiConfig ignores client base URL for known provider', groqConfig.baseUrl === '');

  // 6b. Never uses legacy x-gemini-api-key for other providers
  const nonGeminiConfig = getApiConfig(
    { 'x-api-provider': 'groq', 'x-gemini-api-key': 'gemini-secret-key' },
    {}
  );
  check('getApiConfig ignores x-gemini-api-key for non-Gemini provider', nonGeminiConfig.apiKey === '');

  // 6c. Blocks custom endpoints when process.env.VERCEL is set
  const oldVercel = process.env.VERCEL;
  const oldCustom = process.env.ALLOW_CUSTOM_BASE_URL;
  try {
    process.env.VERCEL = '1';
    delete process.env.ALLOW_CUSTOM_BASE_URL;
    let customErr = null;
    try {
      getApiConfig({ 'x-api-provider': 'custom', 'x-api-base-url': 'http://localhost:11434/v1' });
    } catch (e: any) {
      customErr = e;
    }
    check(
      'getApiConfig blocks custom endpoints when VERCEL is set',
      !!customErr && String(customErr.message).includes('Custom endpoints are disabled on this server.')
    );
  } finally {
    if (oldVercel !== undefined) process.env.VERCEL = oldVercel;
    else delete process.env.VERCEL;
    if (oldCustom !== undefined) process.env.ALLOW_CUSTOM_BASE_URL = oldCustom;
    else delete process.env.ALLOW_CUSTOM_BASE_URL;
  }

  // 6d. Allows custom endpoints when VERCEL is not set
  delete process.env.VERCEL;
  const allowedCustom = getApiConfig({ 'x-api-provider': 'custom', 'x-api-base-url': 'http://localhost:11434/v1' });
  check('getApiConfig allows custom base URL when VERCEL is not set', allowedCustom.baseUrl === 'http://localhost:11434/v1');

  // 7. Key validation and prefix mismatch rejection
  const mismatchGroqOnGemini = validateKeyForProvider('gsk_123456789012345678901234567890', 'gemini');
  check(
    'Groq key rejected when provider is gemini',
    !mismatchGroqOnGemini.valid &&
      mismatchGroqOnGemini.mismatchedProvider === 'groq' &&
      String(mismatchGroqOnGemini.message).includes('Switch to Groq?')
  );

  const mismatchGeminiOnGroq = validateKeyForProvider('AIzaSyD-123456789012345678901234567890', 'groq');
  check(
    'Gemini key rejected when provider is groq',
    !mismatchGeminiOnGroq.valid &&
      mismatchGeminiOnGroq.mismatchedProvider === 'gemini' &&
      String(mismatchGeminiOnGroq.message).includes('Switch to Google Gemini?')
  );

  const validGemini = validateKeyForProvider('AIzaSyD-123456789012345678901234567890', 'gemini');
  check('Gemini key valid for gemini provider', validGemini.valid);

  const validAuto = validateKeyForProvider('gsk_123456789012345678901234567890', 'auto');
  check('Any key valid when provider is auto', validAuto.valid);

  // Restore fetch
  (globalThis as any).fetch = originalFetch;

  console.log(failures === 0 ? 'All key detection simulation tests passed.' : `${failures} test(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})();
