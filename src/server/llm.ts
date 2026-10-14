import fetch from 'node-fetch';
import { ZodSchema } from 'zod';

export type Provider = 'nvidia' | 'groq' | 'openrouter' | 'openai';

export interface LLMOptions {
  baseUrl?: string; // override default base URL
  apiKey?: string;
  model?: string;
  responseFormat?: 'text' | 'json_object';
  temperature?: number;
  maxRetries?: number;
}

function stripCodeFences(text: string) {
  if (!text) return text;
  // Remove fences like ```json ... ``` or ``` ... ``` and inline backticks
  return text
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/\s*```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function defaultBaseUrlFor(provider: Provider) {
  switch (provider) {
    case 'nvidia':
      return 'https://integrate.api.nvidia.com/v1';
    case 'groq':
      return 'https://api.groq.com/openai/v1';
    case 'openrouter':
      return 'https://openrouter.ai/api/v1';
    case 'openai':
    default:
      return 'https://api.openai.com/v1';
  }
}

async function safeFetch(url: string, init: any) {
  // node-fetch already throws on network errors. Return response object.
  return fetch(url, init);
}

export async function listModels(provider: Provider, opts: { apiKey?: string; baseUrl?: string } = {}) {
  const baseUrl = opts.baseUrl || defaultBaseUrlFor(provider);
  const url = `${baseUrl.replace(/\/$/, '')}/models`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.apiKey) headers['Authorization'] = `Bearer ${opts.apiKey}`;

  const res = await safeFetch(url, { method: 'GET', headers });
  if (!res.ok) {
    const text = await res.text();
    // For billing errors (402) or provider-specific billing messages, throw with status
    const err: any = new Error(`Model listing failed: ${res.status} ${text}`);
    err.status = res.status;
    throw err;
  }

  const json = await res.json();

  // Normalize shapes: many providers return { data: [...] } or { models: [...] }
  const candidates = json?.data || json?.models || json || [];

  // For OpenRouter, only return free models (IDs ending with :free)
  if (provider === 'openrouter') {
    return Array.isArray(candidates) ? candidates.filter((m: any) => String(m.id || m.name || '').endsWith(':free')) : [];
  }

  return candidates;
}

export async function chat(
  provider: Provider,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> ,
  schema?: ZodSchema<any>,
  opts: LLMOptions = {}
) {
  const baseUrl = (opts.baseUrl || defaultBaseUrlFor(provider)).replace(/\/$/, '');
  const apiKey = opts.apiKey;
  const model = opts.model;
  const responseFormat = opts.responseFormat || 'text';
  const temperature = typeof opts.temperature === 'number' ? opts.temperature : 0.2;
  const maxRetries = typeof opts.maxRetries === 'number' ? opts.maxRetries : 1;

  const payload: any = {
    model: model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    temperature,
  };

  if (responseFormat === 'json_object') {
    // Add a hint field; not all providers support this. Providers that do should accept it.
    payload.response_format = { type: 'json_object' };
  }

  const url = `${baseUrl}/chat/completions`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  let attempt = 0;
  let lastErr: any = null;
  while (attempt <= maxRetries) {
    try {
      const res = await safeFetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
      const text = await res.text();
      if (!res.ok) {
        // If billing required or 402, surface as special error
        const err: any = new Error(`Provider error ${res.status}: ${text}`);
        err.status = res.status;
        err.body = text;
        throw err;
      }

      // Try to parse JSON response
      let json: any;
      try {
        json = JSON.parse(text);
      } catch (e) {
        // Some providers return plain text
        json = null;
      }

      // Extract content from common shapes
      let content = '';
      if (json) {
        if (Array.isArray(json.choices) && json.choices.length > 0) {
          const choice = json.choices[0];
          content = (choice?.message?.content) ?? (choice?.text) ?? '';
        } else if (json?.output?.[0]?.content?.text) {
          content = json.output[0].content.text;
        } else if (typeof json?.text === 'string') {
          content = json.text;
        } else if (json?.choices?.[0]?.message?.content?.parts) {
          // Some Google-like shapes
          content = json.choices[0].message.content.parts.map((p: any) => p.text || '').join('');
        } else {
          // Fallback: stringify entire response
          content = JSON.stringify(json);
        }
      } else {
        content = text;
      }

      content = stripCodeFences(String(content || ''));

      // If responseFormat asked for json_object, try to parse JSON out of content
      let parsed: any = null;
      if (responseFormat === 'json_object') {
        try {
          parsed = JSON.parse(content);
        } catch (e) {
          // try to extract first JSON-looking substring
          const m = content.match(/\{[\s\S]*\}/);
          if (m) {
            try {
              parsed = JSON.parse(m[0]);
            } catch {}
          }
        }
      }

      const result = parsed ?? content;

      // If schema provided, validate
      if (schema) {
        try {
          const validated = schema.parse(result);
          return { success: true, result: validated, raw: json ?? text };
        } catch (valErr) {
          const err: any = new Error('Schema validation failed');
          err.validation = valErr;
          throw err;
        }
      }

      return { success: true, result, raw: json ?? text };
    } catch (err: any) {
      lastErr = err;
      // If billing error (402) or contains 'billing' or 'payment_required' stop retrying and surface
      const status = err?.status || 0;
      const body = err?.body || String(err?.message || err || '');
      if (status === 402 || /billing|payment_required|payment required/i.test(body)) {
        const e: any = new Error('BILLING_REQUIRED');
        e.status = 402;
        throw e;
      }

      // retry once for transient network or parse errors
      if (attempt < maxRetries) {
        attempt++;
        continue;
      }

      throw lastErr;
    }
  }

  throw lastErr || new Error('Chat failed');
}
