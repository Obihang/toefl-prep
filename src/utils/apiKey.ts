export type ApiProvider = 'auto' | 'gemini' | 'nvidia' | 'groq' | 'openrouter' | 'openai' | 'deepseek' | 'xai' | 'anthropic' | 'custom';

export interface ProviderConfig {
  id: ApiProvider;
  name: string;
  defaultBaseUrl: string;
  defaultModel: string;
  placeholderKey: string;
  keyHelpUrl?: string;
  helpText: string;
}

export const PROVIDERS: Record<ApiProvider, ProviderConfig> = {
  auto: {
    id: 'auto',
    name: '⚡ Auto-Detect (Recommended)',
    defaultBaseUrl: '',
    defaultModel: 'Auto-Routed by Purpose',
    placeholderKey: 'Paste any key (Gemini, Groq, NVIDIA, OpenAI, DeepSeek, OpenRouter...)',
    helpText: 'Automatically reads your key, detects the provider, and selects the ideal model for questions, scoring, and voice.',
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    defaultBaseUrl: '',
    defaultModel: 'gemini-3.8-flash',
    placeholderKey: 'AIzaSy...',
    keyHelpUrl: 'https://aistudio.google.com/apikey',
    helpText: 'Native multimodal models with built-in TTS and fast reasoning.',
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    placeholderKey: 'gsk_...',
    keyHelpUrl: 'https://console.groq.com/keys',
    helpText: 'Ultra-fast LPU inference (Llama 3.3 70B) & Whisper Large v3 for speech.',
  },
  nvidia: {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    defaultBaseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'meta/llama-3.3-70b-instruct',
    placeholderKey: 'nvapi-...',
    keyHelpUrl: 'https://build.nvidia.com',
    helpText: 'Hardware-accelerated NVIDIA NIM with Llama 3.3 70B Instruct.',
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    placeholderKey: 'sk-or-v1-...',
    keyHelpUrl: 'https://openrouter.ai/keys',
    helpText: 'Universal access across top open-source models with automatic free routing.',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    placeholderKey: 'sk-proj-... or sk-...',
    keyHelpUrl: 'https://platform.openai.com/api-keys',
    helpText: 'GPT-4o for deep rubric evaluation, GPT-4o-mini for questions, Whisper STT, and TTS-1 voice.',
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    placeholderKey: 'sk-...',
    keyHelpUrl: 'https://platform.deepseek.com/api_keys',
    helpText: 'DeepSeek-V3 high-precision analytical scoring and task generation.',
  },
  xai: {
    id: 'xai',
    name: 'xAI Grok',
    defaultBaseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-2-latest',
    placeholderKey: 'xai-...',
    keyHelpUrl: 'https://console.x.ai',
    helpText: 'xAI Grok-2 reasoning for authentic TOEFL academic evaluation.',
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-sonnet-latest',
    placeholderKey: 'sk-ant-...',
    keyHelpUrl: 'https://console.anthropic.com',
    helpText: 'Claude 3.5 Sonnet / Haiku for precise academic evaluation.',
  },
  custom: {
    id: 'custom',
    name: 'Custom (OpenAI-Compatible / Ollama)',
    defaultBaseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3',
    placeholderKey: 'Optional or sk-...',
    helpText: 'Connect any OpenAI-compatible API endpoint, local Ollama, or custom proxy.',
  },
};

export function getStoredProvider(): ApiProvider {
  const p = (localStorage.getItem('toefl_api_provider') || '') as ApiProvider;

  if (p && PROVIDERS[p]) {
    return p;
  }

  const key = (localStorage.getItem('toefl_gemini_api_key') || localStorage.getItem('toefl_custom_api_key') || '').trim();

  // If auto or unset, infer from key signature
  if (key) {
    if (/^nvapi-/i.test(key)) return 'nvidia';
    if (/^gsk_/.test(key)) return 'groq';
    if (/^sk-or-/i.test(key)) return 'openrouter';
    if (/^sk-proj-/i.test(key) || /^sk-admin-/i.test(key)) return 'openai';
    if (/^xai-/i.test(key)) return 'xai';
    if (/^ds-/i.test(key)) return 'deepseek';
    if (/^AIza/i.test(key)) return 'gemini';
  }

  return 'gemini';
}

import { resetTtsQuotaBlock } from './audioSpeech';

export function setStoredProvider(provider: ApiProvider): void {
  localStorage.setItem('toefl_api_provider', provider);
  resetTtsQuotaBlock();
}

export function getStoredApiKey(): string {
  const provider = getStoredProvider();
  
  if (provider === 'gemini') {
    const geminiKey = (localStorage.getItem('toefl_key_gemini') || localStorage.getItem('toefl_gemini_api_key') || '').trim();
    // Do not leak Groq/NVIDIA keys into Gemini requests
    if (/^gsk_|^nvapi-|^sk-or-|^sk-proj-/i.test(geminiKey)) {
      return '';
    }
    return geminiKey;
  }

  const perProviderKey = localStorage.getItem(`toefl_key_${provider}`);
  if (perProviderKey !== null && perProviderKey.trim()) {
    return perProviderKey.trim();
  }

  const legacyKey = (localStorage.getItem('toefl_gemini_api_key') || localStorage.getItem('toefl_custom_api_key') || '').trim();
  return legacyKey;
}

export function setStoredApiKey(key: string): void {
  const trimmed = key.trim();
  let providerToSet: ApiProvider | null = null;

  if (/^nvapi-/i.test(trimmed)) {
    providerToSet = 'nvidia';
  } else if (/^gsk_/.test(trimmed)) {
    providerToSet = 'groq';
  } else if (/^sk-or-/i.test(trimmed)) {
    providerToSet = 'openrouter';
  } else if (/^sk-proj-/i.test(trimmed) || /^sk-admin-/i.test(trimmed)) {
    providerToSet = 'openai';
  } else if (/^xai-/i.test(trimmed)) {
    providerToSet = 'xai';
  } else if (/^ds-/i.test(trimmed)) {
    providerToSet = 'deepseek';
  } else if (/^AIza/i.test(trimmed)) {
    providerToSet = 'gemini';
  }

  if (providerToSet) {
    localStorage.setItem(`toefl_key_${providerToSet}`, trimmed);
    setStoredProvider(providerToSet);
  } else {
    const currentP = (localStorage.getItem('toefl_api_provider') || 'gemini') as ApiProvider;
    localStorage.setItem(`toefl_key_${currentP}`, trimmed);
  }

  if (trimmed) {
    if (providerToSet === 'gemini' || /^AIza/i.test(trimmed)) {
      localStorage.setItem('toefl_gemini_api_key', trimmed);
    } else if (providerToSet === 'groq') {
      localStorage.setItem('toefl_key_groq', trimmed);
    }
    localStorage.setItem('toefl_custom_api_key', trimmed);
  }

  resetTtsQuotaBlock();
}

export function getStoredBaseUrl(): string {
  const provider = getStoredProvider();
  const saved = localStorage.getItem(`toefl_base_url_${provider}`);
  if (saved !== null) return saved;
  return PROVIDERS[provider]?.defaultBaseUrl || '';
}

export function setStoredBaseUrl(url: string): void {
  const provider = getStoredProvider();
  localStorage.setItem(`toefl_base_url_${provider}`, url.trim());
}

export function getStoredModel(): string {
  const provider = getStoredProvider();
  const saved = localStorage.getItem(`toefl_model_${provider}`);
  if (saved !== null && saved.trim()) return saved.trim();
  return PROVIDERS[provider]?.defaultModel || '';
}

export function setStoredModel(model: string): void {
  const provider = getStoredProvider();
  localStorage.setItem(`toefl_model_${provider}`, model.trim());
}

export function getApiHeaders(): Record<string, string> {
  const provider = getStoredProvider();
  const key = getStoredApiKey();
  const baseUrl = getStoredBaseUrl();
  const model = getStoredModel();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  headers['x-api-provider'] = provider;

  if (key) {
    headers['x-api-key'] = key;
    if (provider === 'gemini') {
      headers['x-gemini-api-key'] = key;
    }
  }

  if (baseUrl) {
    headers['x-api-base-url'] = baseUrl;
  }

  if (model && model !== 'Auto-Routed by Purpose' && model !== 'Auto-Optimized') {
    headers['x-api-model'] = model;
  }

  return headers;
}
