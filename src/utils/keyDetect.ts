export type DetectedProvider =
  | 'gemini'
  | 'groq'
  | 'nvidia'
  | 'openrouter'
  | 'openai'
  | 'deepseek'
  | 'xai'
  | 'anthropic'
  | 'auto'
  | null;

export interface PurposeModels {
  generation: string;
  evaluation: string;
  transcription: string;
  tts: string;
}

export interface KeyDetectResult {
  provider: DetectedProvider;
  label: string;
  complete: boolean;
  purposeModels?: PurposeModels;
  note?: string;
}

export const DETECTED_PROVIDER_NAMES: Record<string, string> = {
  gemini: 'Google Gemini',
  groq: 'Groq',
  nvidia: 'NVIDIA NIM',
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  xai: 'xAI Grok',
  anthropic: 'Anthropic Claude',
};

export const DEFAULT_PURPOSE_MODELS: Record<string, PurposeModels> = {
  gemini: {
    generation: 'gemini-3.8-flash',
    evaluation: 'gemini-3.8-flash (thinking/rubric)',
    transcription: 'gemini-3.8-flash (multimodal audio)',
    tts: 'Gemini Speech (natural native voices)',
  },
  groq: {
    generation: 'Auto (best available)',
    evaluation: 'Auto (best available)',
    transcription: 'Whisper Large v3 (ultra-fast LPU)',
    tts: 'Studio Voice / Web Speech',
  },
  nvidia: {
    generation: 'Auto (best available)',
    evaluation: 'Auto (best available)',
    transcription: 'Whisper STT / Web Mic',
    tts: 'Studio Voice / Web Speech',
  },
  openrouter: {
    generation: 'Auto (best available)',
    evaluation: 'Auto (best available)',
    transcription: 'Whisper STT / Web Mic',
    tts: 'Studio Voice / Web Speech',
  },
};

export function detectProviderFromKey(raw: string): KeyDetectResult {
  const key = (raw || '').trim();
  if (!key) {
    return {
      provider: null,
      label: 'Unknown',
      complete: false,
      note: 'Paste any key (Gemini, Groq, NVIDIA, or OpenRouter).',
    };
  }

  // 1. Google Gemini: starts with AIza or AQ.
  if (/^(AIza|AQ\.)/i.test(key)) {
    return {
      provider: 'gemini',
      label: 'Google Gemini',
      complete: key.length >= 25,
      purposeModels: DEFAULT_PURPOSE_MODELS.gemini,
      note: 'Native multimodal models with built-in voice audio and fast grading.',
    };
  }

  // 2. Groq: starts with gsk_
  if (/^gsk_/i.test(key)) {
    return {
      provider: 'groq',
      label: 'Groq',
      complete: key.length >= 35,
      purposeModels: DEFAULT_PURPOSE_MODELS.groq,
      note: 'Instant LPU inference with Llama models.',
    };
  }

  // 3. NVIDIA: starts with nvapi-
  if (/^nvapi-/i.test(key)) {
    return {
      provider: 'nvidia',
      label: 'NVIDIA NIM',
      complete: key.length >= 35,
      purposeModels: DEFAULT_PURPOSE_MODELS.nvidia,
      note: 'Hardware-accelerated Llama 3.3 70B Instruct inference.',
    };
  }

  // 4. OpenRouter: starts with sk-or-
  if (/^sk-or-/i.test(key)) {
    return {
      provider: 'openrouter',
      label: 'OpenRouter',
      complete: key.length >= 35,
      purposeModels: DEFAULT_PURPOSE_MODELS.openrouter,
      note: 'Access to open-source models with automatic free routing.',
    };
  }

  // 5. xAI: starts with xai- (Paid per use)
  if (/^xai-/i.test(key)) {
    return {
      provider: null,
      label: 'xAI Grok',
      complete: key.length >= 20,
      note: 'This paid API key is billed per use and is not auto-selected.',
    };
  }

  // 6. Anthropic: starts with sk-ant- (Paid per use)
  if (/^sk-ant-/i.test(key)) {
    return {
      provider: null,
      label: 'Anthropic',
      complete: key.length >= 20,
      note: 'This paid API key is billed per use and is not auto-selected.',
    };
  }

  // 7. OpenAI / DeepSeek: starts with sk- or sk-proj- or sk-admin- (Paid per use)
  if (/^sk-/i.test(key)) {
    return {
      provider: null,
      label: 'OpenAI or DeepSeek',
      complete: key.length >= 20,
      note: 'This paid API key is billed per use and is not auto-selected.',
    };
  }

  // 8. Unknown formats
  return {
    provider: null,
    label: 'Unknown',
    complete: false,
    note: 'Unrecognized key format. Supported free-tier keys start with AIza or AQ., nvapi-, gsk_, or sk-or-.',
  };
}

export function detectProviderFromUrl(url: string): string | null {
  if (!url) return null;
  const lower = url.toLowerCase();
  if (lower.includes('api.groq.com')) return 'groq';
  if (lower.includes('integrate.api.nvidia.com')) return 'nvidia';
  if (lower.includes('openrouter.ai')) return 'openrouter';
  if (lower.includes('generativelanguage.googleapis.com')) return 'gemini';
  return null;
}

export function guessProviderFromModel(model: string): string | null {
  if (!model) return null;
  const lower = model.toLowerCase();
  if (lower.endsWith('-versatile') || lower.endsWith('-instant')) return 'groq';
  if (lower.startsWith('meta/')) return 'nvidia';
  if (lower.endsWith(':free')) return 'openrouter';
  if (lower.startsWith('gemini-')) return 'gemini';
  return null;
}
