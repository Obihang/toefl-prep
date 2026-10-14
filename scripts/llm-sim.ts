// Offline tests for src/server/llm.ts using a fake fetch. Run with: npx tsx scripts/llm-sim.ts
import { z } from 'zod';
import { chat, listModels, parseRetryAfterSeconds, LLMError } from '../src/server/llm.ts';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + detail}`);
  if (!ok) failures++;
}

type Call = { url: string; body: any };
let calls: Call[] = [];
let queue: Array<() => Response | Promise<Response>> = [];

(globalThis as any).fetch = async (url: string, init: any) => {
  calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
  const next = queue.shift();
  if (!next) throw new Error('unexpected extra fetch call');
  return next();
};

const ok = (content: string) => () =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const status = (code: number, body = '{}', headers: Record<string, string> = {}) => () =>
  new Response(body, { status: code, headers });

const schema = z.object({ title: z.string(), n: z.number() });
const msgs = [{ role: 'user' as const, content: 'hi' }];
const KEY = 'nvapi-SECRETKEY1234567890';

async function expectError(fn: () => Promise<any>): Promise<LLMError | null> {
  try {
    await fn();
    return null;
  } catch (e: any) {
    return e as LLMError;
  }
}

(async () => {
  // 1. Paid OpenRouter model is refused before any network call.
  calls = []; queue = [];
  let err = await expectError(() => chat('openrouter', msgs, undefined, { apiKey: 'k12345678', model: 'openai/gpt-4o' }));
  check('paid OpenRouter model refused', !!err && err.status === 400 && calls.length === 0, String(err?.message));

  // 2. A :free OpenRouter model is allowed.
  calls = []; queue = [ok('{"title":"a","n":1}')];
  let res: any = await chat('openrouter', msgs, schema, { apiKey: 'k12345678', model: 'meta-llama/llama-3.3-70b-instruct:free', responseFormat: 'json_object' });
  check('free OpenRouter model works and validates JSON', res.result.title === 'a' && calls.length === 1);

  // 3. Fenced JSON is parsed.
  calls = []; queue = [ok('```json\n{"title":"b","n":2}\n```')];
  res = await chat('groq', msgs, schema, { apiKey: 'k12345678', model: 'm', responseFormat: 'json_object' });
  check('markdown fences stripped', res.result.n === 2);

  // 4. 429 is not retried and carries the retry delay.
  calls = []; queue = [status(429, '{"error":"Please try again in 2m3.5s"}')];
  err = await expectError(() => chat('groq', msgs, schema, { apiKey: 'k12345678', model: 'm' }));
  check('429 not retried, retryAfterSeconds parsed', !!err && err.status === 429 && err.retryAfterSeconds === 124 && calls.length === 1, JSON.stringify({ s: err?.status, r: err?.retryAfterSeconds, c: calls.length }));

  // 5. Retry-After header wins.
  calls = []; queue = [status(429, '{}', { 'retry-after': '30' })];
  err = await expectError(() => chat('groq', msgs, schema, { apiKey: 'k12345678', model: 'm' }));
  check('Retry-After header parsed', !!err && err.retryAfterSeconds === 30);

  // 6. 401 is not retried and does not leak the key.
  calls = []; queue = [status(401, `{"error":"bad key ${KEY}"}`)];
  err = await expectError(() => chat('nvidia', msgs, schema, { apiKey: KEY, model: 'm' }));
  check('401 not retried', !!err && err.status === 401 && calls.length === 1);
  check('API key redacted from error text', !!err && !String(err.message).includes(KEY), String(err?.message));

  // 7. 402 maps to BILLING_REQUIRED.
  calls = []; queue = [status(402, '{"error":"payment required"}')];
  err = await expectError(() => chat('nvidia', msgs, schema, { apiKey: KEY, model: 'm' }));
  check('402 -> BILLING_REQUIRED', !!err && err.message === 'BILLING_REQUIRED' && err.status === 402);

  // 8. 400 on response_format retries once without it.
  calls = []; queue = [status(400, '{"error":"response_format unsupported"}'), ok('{"title":"c","n":3}')];
  res = await chat('nvidia', msgs, schema, { apiKey: KEY, model: 'm', responseFormat: 'json_object' });
  check('400 retries without response_format', calls.length === 2 && !!calls[0].body.response_format && !calls[1].body.response_format && res.result.n === 3);

  // 9. A 503 is retried once, then succeeds.
  calls = []; queue = [status(503), ok('{"title":"d","n":4}')];
  res = await chat('groq', msgs, schema, { apiKey: 'k12345678', model: 'm', responseFormat: 'json_object' });
  check('503 retried once', calls.length === 2 && res.result.n === 4);

  // 10. Bad JSON twice fails with 422 (one retry only).
  calls = []; queue = [ok('not json at all'), ok('still not json')];
  err = await expectError(() => chat('groq', msgs, schema, { apiKey: 'k12345678', model: 'm', responseFormat: 'json_object' }));
  check('invalid JSON retried once then 422', !!err && err.status === 422 && calls.length === 2, JSON.stringify({ s: err?.status, c: calls.length }));

  // 11. Timeout aborts the request.
  calls = []; queue = [() => new Promise<Response>(() => {})];
  (globalThis as any).fetch = async (url: string, init: any) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
    return new Promise<Response>((_, reject) => {
      init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
  };
  err = await expectError(() => chat('groq', msgs, schema, { apiKey: 'k12345678', model: 'm', timeoutMs: 50 }));
  check('timeout aborts and reports 504', !!err && err.status === 504);

  // 12. OpenRouter model list keeps only free models.
  (globalThis as any).fetch = async () =>
    new Response(JSON.stringify({ data: [
      { id: 'a/b:free', pricing: { prompt: '0', completion: '0' } },
      { id: 'a/paid', pricing: { prompt: '0.001', completion: '0.002' } },
      { id: 'c/d:free', pricing: { prompt: '0.5', completion: '0' } },
    ] }), { status: 200 });
  const models = await listModels('openrouter', { apiKey: 'k12345678' });
  check('OpenRouter list only free models', models.length === 1 && models[0].id === 'a/b:free', JSON.stringify(models));

  // 13. Delay parser.
  check('parser: 11h52m4s', parseRetryAfterSeconds(null, 'Please retry in 11h52m4s') === 42724);

  console.log(failures === 0 ? 'All llm tests passed.' : `${failures} test(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})();
