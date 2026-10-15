export type ApiProvider = 'gemini' | 'nvidia' | 'groq' | 'openrouter' | 'openai' | 'deepseek' | 'custom';

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
  gemini: {
    id: 'gemini',
    name: 'Google Gemini (Default)',
    defaultBaseUrl: '',
    defaultModel: 'gemini-3.8-flash',
    placeholderKey: 'AIzaSy...',
    keyHelpUrl: 'https://aistudio.google.com/apikey',
    helpText: 'Native multimodal models with built-in TTS and fast reasoning.',
  },
  nvidia: {
    id: 'nvidia',
    name: 'NVIDIA (free tier)',
    defaultBaseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'meta/llama-3.3-70b-instruct',
    placeholderKey: 'nvapi-...',
    keyHelpUrl: 'https://build.nvidia.com',
    helpText: 'Free tier NVIDIA NIM APIs with Llama 3.3 70B and Nemotron.',
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    placeholderKey: 'gsk_...',
    keyHelpUrl: 'https://console.groq.com/keys',
    helpText: 'Ultra-fast LPU inference (Llama 3.3 70B, Mixtral) with low latency.',
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    placeholderKey: 'sk-or-v1-...',
    keyHelpUrl: 'https://openrouter.ai/keys',
    helpText: 'Single key access to hundreds of models. Only free models ending in :free are used.',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    placeholderKey: 'sk-proj-...',
    keyHelpUrl: 'https://platform.openai.com/api-keys',
    helpText: 'High quality GPT-4o and GPT-4o-mini for TOEFL generation & evaluation.',
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    placeholderKey: 'sk-...',
    keyHelpUrl: 'https://platform.deepseek.com/api_keys',
    helpText: 'Affordable, powerful reasoning with deepseek-chat & deepseek-reasoner.',
  },
  custom: {
    id: 'custom',
    name: 'Custom (OpenAI-Compatible / Ollama / Local)',
    defaultBaseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3',
    placeholderKey: 'Optional or sk-...',
    helpText: 'Connect any OpenAI-compatible API endpoint, local Ollama, or custom proxy.',
  },
};

export function getStoredProvider(): ApiProvider {
  const p = (localStorage.getItem('toefl_api_provider') || '') as ApiProvider;
  const key = (localStorage.getItem('toefl_gemini_api_key') || localStorage.getItem('toefl_custom_api_key') || '').trim();

  // If no provider set, or default gemini, but key clearly belongs to another provider
  if ((!p || p === 'gemini') && key) {
    if (/^nvapi-/i.test(key)) return 'nvidia';
    if (/^gsk_/.test(key)) return 'groq';
    if (/^sk-or-/i.test(key)) return 'openrouter';
    if (/^sk-/.test(key)) return 'openai';
  }

  return PROVIDERS[p] ? p : 'gemini';
}

export function setStoredProvider(provider: ApiProvider): void {
  localStorage.setItem('toefl_api_provider', provider);
}

export function getStoredApiKey(): string {
  return (localStorage.getItem('toefl_gemini_api_key') || localStorage.getItem('toefl_custom_api_key') || '').trim();
}

export function setStoredApiKey(key: string): void {
  const trimmed = key.trim();
  localStorage.setItem('toefl_gemini_api_key', trimmed);
  localStorage.setItem('toefl_custom_api_key', trimmed);

  if (/^nvapi-/i.test(trimmed)) {
    setStoredProvider('nvidia');
  } else if (/^gsk_/.test(trimmed)) {
    setStoredProvider('groq');
  } else if (/^sk-or-/i.test(trimmed)) {
    setStoredProvider('openrouter');
  } else if (/^sk-/.test(trimmed)) {
    setStoredProvider('openai');
  } else if (/^AIza/.test(trimmed)) {
    setStoredProvider('gemini');
  }
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
    // Send x-gemini-api-key ONLY when provider is gemini
    if (provider === 'gemini') {
      headers['x-gemini-api-key'] = key;
    }
  }

  if (baseUrl) {
    headers['x-api-base-url'] = baseUrl;
  }

  if (model) {
    headers['x-api-model'] = model;
  }

  return headers;
}
