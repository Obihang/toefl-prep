export type DetectedProvider = 'gemini' | 'nvidia' | 'groq' | 'openrouter' | null;

export interface KeyDetectResult {
  provider: DetectedProvider;
  label: string;
  complete: boolean;
  note?: string;
}

export const DETECTED_PROVIDER_NAMES: Record<string, string> = {
  gemini: 'Google Gemini',
  nvidia: 'NVIDIA',
  groq: 'Groq',
  openrouter: 'OpenRouter',
};

export function detectProviderFromKey(raw: string): KeyDetectResult {
  const key = (raw || '').trim();
  if (!key) {
    return {
      provider: null,
      label: 'Unknown',
      complete: false,
      note: 'Enter a supported free API key (Gemini, NVIDIA, Groq, or OpenRouter).',
    };
  }

  // 1. Gemini: starts with AIza, complete when length >= 39
  if (/^AIza/.test(key)) {
    return {
      provider: 'gemini',
      label: 'Google Gemini',
      complete: key.length >= 39,
    };
  }

  // 2. NVIDIA: starts with nvapi- (case-insensitive), complete when length >= 40
  if (/^nvapi-/i.test(key)) {
    return {
      provider: 'nvidia',
      label: 'NVIDIA',
      complete: key.length >= 40,
    };
  }

  // 3. Groq: starts with gsk_, complete when length >= 40
  if (/^gsk_/.test(key)) {
    return {
      provider: 'groq',
      label: 'Groq',
      complete: key.length >= 40,
    };
  }

  // 4. OpenRouter: starts with sk-or- (case-insensitive), complete when length >= 40
  if (/^sk-or-/i.test(key)) {
    return {
      provider: 'openrouter',
      label: 'OpenRouter',
      complete: key.length >= 40,
    };
  }

  // 5. xAI Grok: starts with xai- (case-insensitive) -> billed per use
  if (/^xai-/i.test(key)) {
    return {
      provider: null,
      label: 'xAI Grok',
      complete: false,
      note: 'xAI Grok keys are billed per use and not supported on the free tier.',
    };
  }

  // 6. Anthropic: starts with sk-ant- (case-insensitive) -> paid, not supported
  if (/^sk-ant-/i.test(key)) {
    return {
      provider: null,
      label: 'Anthropic',
      complete: false,
      note: 'Anthropic keys are paid and not supported on the free tier.',
    };
  }

  // 7. OpenAI or DeepSeek: starts with sk- -> billed per use, not auto-selected
  if (/^sk-/.test(key)) {
    return {
      provider: null,
      label: 'OpenAI or DeepSeek',
      complete: false,
      note: 'OpenAI and DeepSeek keys are billed per use, not auto-selected, can still be chosen manually.',
    };
  }

  // 8. Otherwise provider null, label 'Unknown', note listing free formats
  return {
    provider: null,
    label: 'Unknown',
    complete: false,
    note: 'Supported free keys: AIza... (Gemini), nvapi-... (NVIDIA), gsk_... (Groq), or sk-or-... (OpenRouter).',
  };
}
