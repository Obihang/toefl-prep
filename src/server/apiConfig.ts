import { detectProviderFromKey } from '../utils/keyDetect.ts';

export interface ApiConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

const KNOWN_PROVIDERS = new Set(['gemini', 'nvidia', 'groq', 'openrouter', 'openai', 'deepseek', 'xai', 'anthropic', 'custom', 'auto']);

function getHeader(headers: any, name: string): string | undefined {
  if (!headers) return undefined;
  if (typeof headers.get === 'function') {
    const val = headers.get(name);
    return typeof val === 'string' ? val : undefined;
  }
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lower) {
      const v = headers[k];
      return Array.isArray(v) ? v[0] : (typeof v === 'string' ? v : undefined);
    }
  }
  return undefined;
}

export function getApiConfig(headers: any = {}, body: any = {}): ApiConfig {
  const b = body || {};

  // API Key resolution
  const xApiKey = getHeader(headers, 'x-api-key')?.trim();
  const xGeminiKey = getHeader(headers, 'x-gemini-api-key')?.trim();
  const bodyKey = typeof b.apiKey === 'string' ? b.apiKey.trim() : '';
  const apiKey = xApiKey || xGeminiKey || bodyKey;

  // Provider resolution
  let rawProvider = (getHeader(headers, 'x-api-provider') || b.provider || 'auto').trim().toLowerCase();
  let provider = KNOWN_PROVIDERS.has(rawProvider) ? rawProvider : 'auto';

  // If provider is auto or gemini, but key clearly indicates a specific provider:
  if (apiKey) {
    if (/^gsk_/i.test(apiKey)) {
      provider = 'groq';
    } else if (/^nvapi-/i.test(apiKey)) {
      provider = 'nvidia';
    } else if (/^sk-or-/i.test(apiKey)) {
      provider = 'openrouter';
    } else if (/^sk-proj-/i.test(apiKey) || /^sk-admin-/i.test(apiKey)) {
      provider = 'openai';
    } else if (/^xai-/i.test(apiKey)) {
      provider = 'xai';
    } else if (/^ds-/i.test(apiKey)) {
      provider = 'deepseek';
    } else if (/^AIza/i.test(apiKey)) {
      provider = 'gemini';
    } else if (provider === 'auto' && /^sk-/.test(apiKey)) {
      const detected = detectProviderFromKey(apiKey);
      provider = detected.provider || 'openai';
    }
  }

  if (provider === 'auto') {
    provider = apiKey ? (detectProviderFromKey(apiKey).provider || 'gemini') : 'gemini';
  }

  // Base URL resolution
  let baseUrl = '';
  const clientBaseUrl = (getHeader(headers, 'x-api-base-url') || b.baseUrl || '').trim();

  if (provider === 'custom') {
    const allowCustom = process.env.ALLOW_CUSTOM_BASE_URL === 'true' || !process.env.VERCEL;
    if (!allowCustom) {
      throw new Error('Custom endpoints are disabled on this server.');
    }
    baseUrl = clientBaseUrl;
  } else {
    baseUrl = '';
  }

  // Model resolution
  const model = (getHeader(headers, 'x-api-model') || b.model || '').trim();

  return {
    provider,
    apiKey,
    baseUrl,
    model,
  };
}
