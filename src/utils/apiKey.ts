import { resetTtsQuotaBlock } from './audioSpeech';
import { auth } from '../firebase';

export async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const user = auth.currentUser;
    if (!user) return {};
    const token = await user.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

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
    placeholderKey: 'AIzaSy... or AQ....',
    keyHelpUrl: 'https://aistudio.google.com/apikey',
    helpText: 'Native multimodal models with built-in TTS and fast reasoning.',
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: '',
    placeholderKey: 'gsk_...',
    keyHelpUrl: 'https://console.groq.com/keys',
    helpText: 'Ultra-fast LPU inference (Llama 3.3 70B) & Whisper Large v3 for speech.',
  },
  nvidia: {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    defaultBaseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: '',
    placeholderKey: 'nvapi-...',
    keyHelpUrl: 'https://build.nvidia.com',
    helpText: 'Hardware-accelerated NVIDIA NIM with Llama 3.3 70B Instruct.',
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: '',
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

export function migrateLegacyKeys(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const oldGemini = localStorage.getItem('toefl_gemini_api_key');
    const oldCustom = localStorage.getItem('toefl_custom_api_key');

    const migrateKey = (raw: string) => {
      const k = raw.trim();
      if (!k) return;
      let target: ApiProvider | null = null;
      if (/^(AIza|AQ\.)/i.test(k)) target = 'gemini';
      else if (/^gsk_/.test(k)) target = 'groq';
      else if (/^nvapi-/i.test(k)) target = 'nvidia';
      else if (/^sk-or-/i.test(k)) target = 'openrouter';

      if (target && !localStorage.getItem(`toefl_key_${target}`)) {
        localStorage.setItem(`toefl_key_${target}`, k);
      }
    };

    if (oldGemini) {
      migrateKey(oldGemini);
      localStorage.removeItem('toefl_gemini_api_key');
    }
    if (oldCustom) {
      migrateKey(oldCustom);
      localStorage.removeItem('toefl_custom_api_key');
    }
  } catch {
    // Ignore storage errors in restricted iframe
  }
}

// Run one-time migration at startup
migrateLegacyKeys();

export function getStoredProvider(): ApiProvider {
  if (typeof localStorage === 'undefined') return 'gemini';
  const p = (localStorage.getItem('toefl_api_provider') || '') as ApiProvider;
  if (p && PROVIDERS[p]) {
    return p;
  }
  return 'gemini';
}

export function setStoredProvider(provider: ApiProvider): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem('toefl_api_provider', provider);
  resetTtsQuotaBlock();
}

export function getStoredApiKey(provider?: ApiProvider): string {
  if (typeof localStorage === 'undefined') return '';
  const targetProvider = provider || getStoredProvider();
  return (localStorage.getItem(`toefl_key_${targetProvider}`) || '').trim();
}

export function setStoredApiKey(key: string, provider?: ApiProvider): void {
  if (typeof localStorage === 'undefined') return;
  const targetProvider = provider || getStoredProvider();
  const trimmed = key.trim();
  localStorage.setItem(`toefl_key_${targetProvider}`, trimmed);
  resetTtsQuotaBlock();
}

export function getPrefixOwnerProvider(key: string): ApiProvider | null {
  const trimmed = (key || '').trim();
  if (!trimmed) return null;
  if (/^(AIza|AQ\.)/i.test(trimmed)) return 'gemini';
  if (/^gsk_/.test(trimmed)) return 'groq';
  if (/^nvapi-/i.test(trimmed)) return 'nvidia';
  if (/^sk-or-/i.test(trimmed)) return 'openrouter';
  if (/^sk-proj-|^sk-admin-/i.test(trimmed)) return 'openai';
  if (/^xai-/i.test(trimmed)) return 'xai';
  if (/^sk-ant-/i.test(trimmed)) return 'anthropic';
  if (/^ds-/i.test(trimmed)) return 'deepseek';
  return null;
}

export function validateKeyForProvider(
  key: string,
  provider: ApiProvider
): { valid: boolean; mismatchedProvider?: ApiProvider; message?: string } {
  const trimmed = (key || '').trim();
  if (!trimmed || provider === 'auto' || provider === 'custom') {
    return { valid: true };
  }
  const owner = getPrefixOwnerProvider(trimmed);
  if (owner && owner !== provider) {
    const ownerName = PROVIDERS[owner]?.name || owner;
    return {
      valid: false,
      mismatchedProvider: owner,
      message: `This looks like a ${ownerName} key. Switch to ${ownerName}?`,
    };
  }
  return { valid: true };
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

export interface StoredRoles {
  chat?: string;
  stt?: string;
  tts?: string;
}

export function getStoredRoles(provider?: string): StoredRoles | null {
  const p = provider || getStoredProvider();
  const raw = localStorage.getItem(`toefl_roles_${p}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setStoredRoles(provider: string, roles: StoredRoles): void {
  if (!provider) return;
  localStorage.setItem(`toefl_roles_${provider}`, JSON.stringify(roles));
}

export function hasAnyStoredApiKey(): boolean {
  if (typeof localStorage === 'undefined') return false;
  const providers: ApiProvider[] = ['gemini', 'openrouter', 'groq', 'nvidia', 'openai', 'deepseek', 'xai', 'anthropic', 'custom'];
  for (const p of providers) {
    if ((localStorage.getItem(`toefl_key_${p}`) || '').trim()) return true;
  }
  if ((localStorage.getItem('toefl_gemini_api_key') || '').trim()) return true;
  if ((localStorage.getItem('toefl_custom_api_key') || '').trim()) return true;
  if ((localStorage.getItem('toefl_voice_api_key') || '').trim()) return true;
  return false;
}

export function disconnectAllApiKeys(): void {
  if (typeof localStorage === 'undefined') return;
  const providers: ApiProvider[] = ['gemini', 'openrouter', 'groq', 'nvidia', 'openai', 'deepseek', 'xai', 'anthropic', 'custom', 'auto'];
  providers.forEach((p) => {
    localStorage.removeItem(`toefl_key_${p}`);
    localStorage.removeItem(`toefl_base_url_${p}`);
    localStorage.removeItem(`toefl_model_${p}`);
    localStorage.removeItem(`toefl_roles_${p}`);
    localStorage.removeItem(`toefl_purpose_models_${p}`);
  });
  localStorage.removeItem('toefl_api_provider');
  localStorage.removeItem('toefl_gemini_api_key');
  localStorage.removeItem('toefl_custom_api_key');
  localStorage.removeItem('toefl_voice_api_key');
  localStorage.removeItem('toefl_audio8_url');
  localStorage.removeItem('toefl_tts_provider');
  localStorage.removeItem('tts_provider');
  localStorage.removeItem('tts_api_key');
  localStorage.removeItem('tts_base_url');
  localStorage.removeItem('toefl_purpose_models');
  localStorage.removeItem('toefl_tts_blocked_until');
  resetTtsQuotaBlock();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('apiKeyUpdated'));
  }
}

export function getStoredVoiceKey(): string {
  if (typeof localStorage === 'undefined') return '';
  return (localStorage.getItem('toefl_voice_api_key') || '').trim();
}

export function setStoredVoiceKey(key: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem('toefl_voice_api_key', key.trim());
}

export function getStoredAudio8Url(): string {
  if (typeof localStorage === 'undefined') return '';
  return (localStorage.getItem('toefl_audio8_url') || '').trim();
}

export function setStoredAudio8Url(url: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem('toefl_audio8_url', url.trim());
}

export function getStoredTtsProvider(): string {
  if (typeof localStorage === 'undefined') return 'free';
  return (
    localStorage.getItem('tts_provider') ||
    localStorage.getItem('toefl_tts_provider') ||
    'free'
  ).trim();
}

export function setStoredTtsProvider(provider: string): void {
  if (typeof localStorage === 'undefined') return;
  const clean = provider.trim() || 'free';
  localStorage.setItem('tts_provider', clean);
  localStorage.setItem('toefl_tts_provider', clean);
}

export function getStoredTtsApiKey(provider: string): string {
  if (typeof localStorage === 'undefined') return '';
  return (localStorage.getItem(`tts_api_key_${provider}`) || '').trim();
}

export function setStoredTtsApiKey(provider: string, key: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(`tts_api_key_${provider}`, key.trim());
}

export function getStoredTtsBaseUrl(provider: string): string {
  if (typeof localStorage === 'undefined') return '';
  return (localStorage.getItem(`tts_base_url_${provider}`) || '').trim();
}

export function setStoredTtsBaseUrl(provider: string, url: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(`tts_base_url_${provider}`, url.trim());
}

export function getApiHeaders(): Record<string, string> {
  const provider = getStoredProvider();
  const key = getStoredApiKey();
  const voiceKey = getStoredVoiceKey();
  const baseUrl = getStoredBaseUrl();
  const model = getStoredModel();
  const roles = getStoredRoles(provider);
  const audio8Url = getStoredAudio8Url();
  const ttsProvider = getStoredTtsProvider();
  const ttsApiKey = getStoredTtsApiKey(ttsProvider);
  const ttsBaseUrl = getStoredTtsBaseUrl(ttsProvider);

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

  if (voiceKey) {
    headers['x-voice-api-key'] = voiceKey;
  }

  if (baseUrl) {
    headers['x-api-base-url'] = baseUrl;
  }

  if (model && model !== 'Auto-Routed by Purpose' && model !== 'Auto-Optimized') {
    headers['x-api-model'] = model;
  }

  if (roles?.stt) {
    headers['x-api-model-stt'] = roles.stt;
  }

  if (roles?.tts) {
    headers['x-api-model-tts'] = roles.tts;
  }

  if (audio8Url) {
    headers['x-audio8-url'] = audio8Url;
  }

  if (ttsProvider) {
    headers['x-tts-provider'] = ttsProvider;
  }

  if (ttsApiKey) {
    headers['x-tts-api-key'] = ttsApiKey;
  }

  if (ttsBaseUrl) {
    headers['x-tts-base-url'] = ttsBaseUrl;
  }

  return headers;
}

export function getScholarUsername(): string {
  if (typeof localStorage === 'undefined') return 'Scholar';
  const saved = localStorage.getItem('toefl_display_name');
  if (saved && saved.trim()) return saved.trim();
  const authUser = auth?.currentUser;
  if (authUser?.displayName) return authUser.displayName;
  if (authUser?.email) {
    const prefix = authUser.email.split('@')[0];
    if (prefix) return prefix;
  }
  return 'Scholar';
}

export function setScholarUsername(name: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem('toefl_display_name', name.trim());
}

export function getAvailableGenerationKeys(): Array<{ provider: string; key: string }> {
  if (typeof localStorage === 'undefined') return [];
  const providers: ApiProvider[] = ['gemini', 'groq', 'nvidia', 'openrouter', 'openai', 'deepseek', 'xai', 'anthropic', 'custom'];
  const list: Array<{ provider: string; key: string }> = [];
  for (const p of providers) {
    const k = (localStorage.getItem(`toefl_key_${p}`) || '').trim();
    if (k) list.push({ provider: p, key: k });
  }
  const oldGemini = (localStorage.getItem('toefl_gemini_api_key') || '').trim();
  if (oldGemini && !list.some(x => x.key === oldGemini)) {
    list.push({ provider: 'gemini', key: oldGemini });
  }
  return list;
}

export type TranscriberProvider = 'groq' | 'gemini' | 'local';

export function getStoredTranscriberProvider(): TranscriberProvider {
  if (typeof localStorage === 'undefined') return 'local';
  const p = localStorage.getItem('transcriber_provider') as TranscriberProvider;
  if (p === 'groq' || p === 'gemini' || p === 'local') return p;
  return 'local';
}

export function setStoredTranscriberProvider(p: TranscriberProvider): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem('transcriber_provider', p);
}

export function getStoredTranscriberKey(provider?: TranscriberProvider): string {
  if (typeof localStorage === 'undefined') return '';
  const p = provider || getStoredTranscriberProvider();
  if (p === 'groq') return (localStorage.getItem('transcriber_groq_api_key') || '').trim();
  if (p === 'gemini') return (localStorage.getItem('transcriber_gemini_api_key') || '').trim();
  return '';
}

export function setStoredTranscriberKey(key: string, provider: 'groq' | 'gemini'): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(`transcriber_${provider}_api_key`, key.trim());
}

import { safeFetchJson } from './apiHelper';

export async function safeGenerateTaskWithFailover(payload: {
  taskType: string;
  level: string;
  topic: string;
}): Promise<{ success: boolean; data?: any; error?: string }> {
  const keys = getAvailableGenerationKeys();
  if (keys.length === 0) {
    try {
      const json = await safeFetchJson('/api/generate-task', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify(payload),
      });
      return json;
    } catch (err: any) {
      return { success: false, error: err?.message || 'Generation failed' };
    }
  }

  for (let i = 0; i < keys.length; i++) {
    const kp = keys[i];
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-provider': kp.provider,
      'x-api-key': kp.key,
    };
    if (kp.provider === 'gemini') {
      headers['x-gemini-api-key'] = kp.key;
    }
    try {
      const json = await safeFetchJson('/api/generate-task', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      if (json.success && json.data && !json.data.isFallback) {
        return json;
      }
    } catch (err: any) {
      console.warn(`Generation with key [${kp.provider}] failed, trying next key...`, err);
    }
  }

  try {
    const json = await safeFetchJson('/api/generate-task', {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify(payload),
    });
    return json;
  } catch (err: any) {
    return { success: false, error: err?.message || 'All generation keys failed' };
  }
}
