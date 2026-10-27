import { detectProviderFromKey } from '../utils/keyDetect';

export interface ApiConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  sttModel: string;
  ttsModel: string;
  voiceApiKey?: string;
  ttsProvider?: string;
  audio8Url?: string;
  prompt?: string;
  availableKeys?: Record<string, string>;
}

const KNOWN_PROVIDERS = new Set(['gemini', 'nvidia', 'groq', 'openrouter', 'openai', 'deepseek', 'xai', 'anthropic', 'custom', 'auto', 'audio8']);

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

  // Optional Voice Key & TTS Provider Settings
  const voiceApiKey = (getHeader(headers, 'x-voice-api-key') || b.voiceApiKey || '').trim();
  const ttsProvider = (getHeader(headers, 'x-tts-provider') || b.ttsProvider || '').trim().toLowerCase();
  const audio8Url = (getHeader(headers, 'x-audio8-url') || b.audio8Url || '').trim();

  // Prompt / Target sentence
  const prompt = (b.prompt || b.targetSentence || '').trim();

  // If provider is auto or gemini, infer from key signature
  if ((provider === 'auto' || provider === 'gemini') && apiKey) {
    if (/^gsk_/i.test(apiKey)) {
      provider = 'groq';
    } else if (/^nvapi-/i.test(apiKey)) {
      provider = 'nvidia';
    } else if (/^sk-or-/i.test(apiKey)) {
      provider = 'openrouter';
    } else if (/^(AIza|AQ\.)/i.test(apiKey)) {
      provider = 'gemini';
    } else if (/^sk-/i.test(apiKey)) {
      provider = 'openai';
    } else if (provider === 'auto') {
      const detected = detectProviderFromKey(apiKey);
      provider = detected.provider || 'gemini';
    }
  }

  if (provider === 'auto') {
    provider = apiKey ? (detectProviderFromKey(apiKey).provider || 'gemini') : 'gemini';
  }

  // Base URL resolution
  let baseUrl = '';
  const clientBaseUrl = (getHeader(headers, 'x-api-base-url') || b.baseUrl || '').trim();

  if (provider === 'custom' || provider === 'audio8') {
    const allowCustom = process.env.ALLOW_CUSTOM_BASE_URL === 'true' || !process.env.VERCEL;
    if (!allowCustom && provider === 'custom') {
      throw new Error('Custom endpoints are disabled on this server.');
    }
    baseUrl = clientBaseUrl || audio8Url;
  } else {
    baseUrl = '';
  }

  // Model resolution
  const model = (getHeader(headers, 'x-api-model') || b.model || '').trim();
  const sttModel = (getHeader(headers, 'x-api-model-stt') || b.sttModel || '').trim();
  const ttsModel = (getHeader(headers, 'x-api-model-tts') || b.ttsModel || '').trim();

  // Collect all multi-provider keys passed via headers or body
  const availableKeys: Record<string, string> = {};
  const KNOWN_ROUTED = ['gemini', 'groq', 'openai', 'anthropic', 'openrouter', 'nvidia', 'deepseek', 'xai'];
  for (const p of KNOWN_ROUTED) {
    const k = getHeader(headers, `x-api-key-${p}`) || (b.availableKeys && b.availableKeys[p]);
    if (k && typeof k === 'string' && k.trim()) {
      availableKeys[p] = k.trim();
    }
  }
  const xGroq = getHeader(headers, 'x-groq-key');
  if (xGroq && xGroq.trim() && !availableKeys.groq) {
    availableKeys.groq = xGroq.trim();
  }
  const xGemini = getHeader(headers, 'x-gemini-api-key');
  if (xGemini && xGemini.trim() && !availableKeys.gemini) {
    availableKeys.gemini = xGemini.trim();
  }
  if (effectiveApiKey && provider && provider !== 'auto') {
    if (!availableKeys[provider]) {
      availableKeys[provider] = effectiveApiKey;
    }
  }

  return {
    provider,
    apiKey: effectiveApiKey,
    baseUrl,
    model,
    sttModel,
    ttsModel,
    voiceApiKey,
    ttsProvider,
    audio8Url,
    prompt,
    availableKeys,
  };
}
