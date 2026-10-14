import type { ZodType } from 'zod';

// Free-tier only providers. All three expose an OpenAI-compatible API.
export type Provider = 'nvidia' | 'groq' | 'openrouter';

export const PROVIDER_BASE_URLS: Record<Provider, string> = {
  nvidia: 'https://integrate.api.nvidia.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};

export interface LLMOptions {
  apiKey?: string;
  model?: string;
  responseFormat?: 'text' | 'json_object';
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class LLMError extends Error {
  status: number;
  retryAfterSeconds?: number;
  constructor(message: string, status: number, retryAfterSeconds?: number) {
    super(message);
    this.name = 'LLMError';
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const DEFAULT_TIMEOUT_MS = 25000;

export function redact(text: string, apiKey?: string): string {
  let out = String(text || '');
  if (apiKey && apiKey.length > 6) {
    out = out.split(apiKey).join('[REDACTED]');
  }
  return out
    .replace(/nvapi-[A-Za-z0-9_-]{10,}/g, '[REDACTED]')
    .replace(/gsk_[A-Za-z0-9]{10,}/g, '[REDACTED]')
    .replace(/sk-or-[A-Za-z0-9_-]{10,}/g, '[REDACTED]');
}

// Parses "Retry-After: 30" or text such as "try again in 2m3.5s" / "in 7.66s" / "in 11h52m4s".
export function parseRetryAfterSeconds(headerValue: string | null | undefined, bodyText: string): number | undefined {
  if (headerValue) {
    const n = Number(headerValue);
    if (Number.isFinite(n) && n >= 0) return Math.ceil(n);
    const when = Date.parse(headerValue);
    if (Number.isFinite(when)) return Math.max(0, Math.ceil((when - Date.now()) / 1000));
  }
  const m = /in\s+((?:\d+(?:\.\d+)?\s*(?:ms|h|m|s)\s*)+)/i.exec(bodyText || '');
  if (!m) return undefined;
  let total = 0;
  const part = /(\d+(?:\.\d+)?)\s*(ms|h|m|s)/gi;
  let p: RegExpExecArray | null;
  while ((p = part.exec(m[1])) !== null) {
    const v = parseFloat(p[1]);
    const unit = p[2].toLowerCase();
    total += unit === 'h' ? v * 3600 : unit === 'm' ? v * 60 : unit === 's' ? v : v / 1000;
  }
  return total > 0 ? Math.ceil(total) : undefined;
}

// OpenRouter charges for most models. Only ':free' models are allowed, so a paid model can never be called.
export function assertFreeModel(provider: Provider, model?: string): void {
  if (provider === 'openrouter' && !(model && model.endsWith(':free'))) {
    throw new LLMError('Only free OpenRouter models (ids ending in ":free") are allowed.', 400);
  }
}

function isZeroPrice(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  const n = Number(value);
  return Number.isFinite(n) && n === 0;
}

export async function listModels(provider: Provider, opts: { apiKey?: string; timeoutMs?: number } = {}) {
  const url = `${PROVIDER_BASE_URLS[provider]}/models`;
  const headers: Record<string, string> = {};
  if (opts.apiKey) headers['Authorization'] = `Bearer ${opts.apiKey}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'GET', headers, signal: controller.signal });
    const text = await res.text();
    if (!res.ok) {
      throw new LLMError(`Model listing failed (${res.status}): ${redact(text.slice(0, 300), opts.apiKey)}`, res.status);
    }
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      throw new LLMError('Model listing returned invalid JSON.', 502);
    }
    const list: any[] = Array.isArray(json?.data) ? json.data : Array.isArray(json?.models) ? json.models : Array.isArray(json) ? json : [];
    let models = list
      .map((m: any) => ({ id: String(m?.id || m?.name || ''), name: m?.name ? String(m.name) : undefined, pricing: m?.pricing }))
      .filter((m) => m.id);
    if (provider === 'openrouter') {
      models = models.filter((m) => m.id.endsWith(':free') && isZeroPrice(m.pricing?.prompt) && isZeroPrice(m.pricing?.completion));
    }
    return models.map((m) => ({ id: m.id, name: m.name }));
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new LLMError('Model listing timed out.', 504);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function stripCodeFences(text: string): string {
  return String(text || '').replace(/```(?:json)?\s*/gi, '').replace(/\s*```/g, '').trim();
}

function extractJson(text: string): any {
  const cleaned = stripCodeFences(text);
  try {
    return JSON.parse(cleaned);
  } catch {}
  const obj = cleaned.match(/\{[\s\S]*\}/);
  if (obj) {
    try {
      return JSON.parse(obj[0]);
    } catch {}
  }
  const arr = cleaned.match(/\[[\s\S]*\]/);
  if (arr) {
    try {
      return JSON.parse(arr[0]);
    } catch {}
  }
  throw new LLMError('The model did not return valid JSON.', 422);
}

function contentToText(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((p: any) => (typeof p === 'string' ? p : p?.text || '')).join('');
  }
  return '';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function postOnce(url: string, apiKey: string, payload: any, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text();
    return { res, text };
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new LLMError('The provider timed out.', 504);
    throw new LLMError(`Network error: ${redact(String(err?.message || err), apiKey)}`, 503);
  } finally {
    clearTimeout(timer);
  }
}

export async function chat(provider: Provider, messages: ChatMessage[], schema?: ZodType<any>, opts: LLMOptions = {}) {
  const apiKey = (opts.apiKey || '').trim();
  const model = (opts.model || '').trim();
  if (!apiKey) throw new LLMError('No API key provided for this provider.', 401);
  if (!model) throw new LLMError('No model selected for this provider.', 400);
  assertFreeModel(provider, model);

  const wantJson = opts.responseFormat === 'json_object';
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = `${PROVIDER_BASE_URLS[provider]}/chat/completions`;

  const outMessages = messages.map((m) => ({ role: m.role, content: m.content }));
  if (wantJson) {
    outMessages.push({ role: 'system', content: 'Return only valid JSON. Do not wrap it in markdown fences.' });
  }

  const payload: any = { model, messages: outMessages, temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.2 };
  if (typeof opts.maxTokens === 'number') payload.max_tokens = opts.maxTokens;
  if (wantJson) payload.response_format = { type: 'json_object' };

  let retried = false;
  let droppedResponseFormat = false;

  // At most one retry in total, and only for server-side or parse problems (never for 4xx).
  for (;;) {
    let outcome: { res: Response; text: string };
    try {
      outcome = await postOnce(url, apiKey, payload, timeoutMs);
    } catch (err: any) {
      if (!retried && err instanceof LLMError && (err.status === 503 || err.status === 504)) {
        retried = true;
        await sleep(1000);
        continue;
      }
      throw err;
    }
    const { res, text } = outcome;

    if (!res.ok) {
      const status = res.status;
      const safeBody = redact(text.slice(0, 300), apiKey);
      if (status === 402 || /billing|payment[_ ]required/i.test(text)) {
        throw new LLMError('BILLING_REQUIRED', 402);
      }
      if (status === 429) {
        throw new LLMError(`Rate limited (429): ${safeBody}`, 429, parseRetryAfterSeconds(res.headers.get('retry-after'), text));
      }
      if (status === 400 && payload.response_format && !droppedResponseFormat) {
        // Some models reject response_format. Retry once without it.
        delete payload.response_format;
        droppedResponseFormat = true;
        continue;
      }
      if (status >= 500 && !retried) {
        retried = true;
        await sleep(1000);
        continue;
      }
      throw new LLMError(`Provider error (${status}): ${safeBody}`, status);
    }

    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {}
    const content = json ? contentToText(json?.choices?.[0]?.message?.content ?? json?.choices?.[0]?.text) : text;

    try {
      const result = wantJson ? extractJson(content) : stripCodeFences(content);
      if (schema) {
        const validated = schema.parse(result);
        return { success: true as const, result: validated, modelUsed: model };
      }
      return { success: true as const, result, modelUsed: model };
    } catch (err: any) {
      if (!retried) {
        retried = true;
        await sleep(500);
        continue;
      }
      if (err instanceof LLMError) throw err;
      throw new LLMError('The model response did not match the expected format.', 422);
    }
  }
}
