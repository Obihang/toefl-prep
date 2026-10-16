import { detectProviderFromKey } from '../utils/keyDetect.ts';

export interface ApiConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  sttModel: string;
  ttsModel: string;
  voiceApiKey?: string;
  prompt?: string;
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

  // Provider resolution
  let rawProvider = (getHeader(headers, 'x-api-provider') || b.provider || 'auto').trim().toLowerCase();
  let provider = KNOWN_PROVIDERS.has(rawProvider) ? rawProvider : 'auto';

  // API Key resolution
  const xApiKey = getHeader(headers, 'x-api-key')?.trim();
  const xGeminiKey = (provider === 'gemini' || provider === 'auto') ? getHeader(headers, 'x-gemini-api-key')?.trim() : undefined;
  const bodyKey = typeof b.apiKey === 'string' ? b.apiKey.trim() : '';
  const apiKey = xApiKey || xGeminiKey || bodyKey;
  let effectiveApiKey = apiKey;

  // Optional Voice Key
  const voiceApiKey = (getHeader(headers, 'x-voice-api-key') || b.voiceApiKey || '').trim();

  // Prompt / Target sentence
  const prompt = (b.prompt || b.targetSentence || '').trim();

  // If provider is auto, infer from key
  if (provider === 'auto' && apiKey) {
    if (/^gsk_/i.test(apiKey)) {
      provider = 'groq';
    } else if (/^nvapi-/i.test(apiKey)) {
      provider = 'nvidia';
    } else if (/^sk-or-/i.test(apiKey)) {
      provider = 'openrouter';
    } else if (/^AIza/i.test(apiKey)) {
      provider = 'gemini';
    } else {
      const detected = detectProviderFromKey(apiKey);
      provider = detected.provider || 'gemini';
    }
  }

  // If user explicitly chose gemini, ensure non-Gemini keys don't break Gemini API calls
  if (provider === 'gemini' && effectiveApiKey && !/^AIza/i.test(effectiveApiKey)) {
    if (/^gsk_|^nvapi-|^sk-or-|^sk-proj-/i.test(effectiveApiKey)) {
      effectiveApiKey = '';
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
  const sttModel = (getHeader(headers, 'x-api-model-stt') || b.sttModel || '').trim();
  const ttsModel = (getHeader(headers, 'x-api-model-tts') || b.ttsModel || '').trim();

  return {
    provider,
    apiKey: effectiveApiKey,
    baseUrl,
    model,
    sttModel,
    ttsModel,
    voiceApiKey,
    prompt,
  };
}
