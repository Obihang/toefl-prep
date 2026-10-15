export interface ApiConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

const KNOWN_PROVIDERS = new Set(['gemini', 'nvidia', 'groq', 'openrouter', 'openai', 'deepseek', 'custom', 'auto']);

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

  // Provider resolution
  const rawProvider = (getHeader(headers, 'x-api-provider') || b.provider || 'gemini').trim().toLowerCase();
  const provider = KNOWN_PROVIDERS.has(rawProvider) ? rawProvider : 'gemini';

  // API Key resolution
  let apiKey = '';
  const xApiKey = getHeader(headers, 'x-api-key')?.trim();
  const xGeminiKey = getHeader(headers, 'x-gemini-api-key')?.trim();
  const bodyKey = typeof b.apiKey === 'string' ? b.apiKey.trim() : '';

  if (provider === 'gemini' || provider === 'auto') {
    apiKey = xApiKey || xGeminiKey || bodyKey;
  } else {
    // For every other provider use ONLY x-api-key or body.apiKey (never legacy x-gemini-api-key)
    apiKey = xApiKey || bodyKey;
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
    // For all other providers ignore any client-sent base URL
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
