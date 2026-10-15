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
    generation: 'llama-3.3-70b-versatile',
    evaluation: 'llama-3.3-70b-versatile',
    transcription: 'whisper-large-v3 (ultra-fast LPU)',
    tts: 'Server Gemini / Browser Speech',
  },
  nvidia: {
    generation: 'meta/llama-3.3-70b-instruct',
    evaluation: 'meta/llama-3.3-70b-instruct',
    transcription: 'Server Gemini / Browser STT',
    tts: 'Server Gemini / Browser Speech',
  },
  openrouter: {
    generation: 'meta-llama/llama-3.3-70b-instruct:free',
    evaluation: 'meta-llama/llama-3.3-70b-instruct:free',
    transcription: 'Server Gemini / Browser STT',
    tts: 'Server Gemini / Browser Speech',
  },
  openai: {
    generation: 'gpt-4o-mini (fast & structured)',
    evaluation: 'gpt-4o (deep rubric scoring)',
    transcription: 'whisper-1 (OpenAI Speech-to-Text)',
    tts: 'tts-1 (OpenAI natural speech)',
  },
  deepseek: {
    generation: 'deepseek-chat (DeepSeek-V3)',
    evaluation: 'deepseek-chat (DeepSeek-V3 reasoning)',
    transcription: 'Server Gemini / Browser STT',
    tts: 'Server Gemini / Browser Speech',
  },
  xai: {
    generation: 'grok-2-latest',
    evaluation: 'grok-2-latest',
    transcription: 'Server Gemini / Browser STT',
    tts: 'Server Gemini / Browser Speech',
  },
  anthropic: {
    generation: 'claude-3-5-haiku-latest',
    evaluation: 'claude-3-5-sonnet-latest',
    transcription: 'Server Gemini / Browser STT',
    tts: 'Server Gemini / Browser Speech',
  },
};

export function detectProviderFromKey(raw: string): KeyDetectResult {
  const key = (raw || '').trim();
  if (!key) {
    return {
      provider: null,
      label: 'Unknown',
      complete: false,
      note: 'Paste any key (Gemini, Groq, NVIDIA, OpenAI, DeepSeek, or OpenRouter).',
    };
  }

  // 1. Google Gemini: starts with AIza, length >= 39
  if (/^AIza/i.test(key)) {
    return {
      provider: 'gemini',
      label: 'Google Gemini',
      complete: key.length >= 35,
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
      note: 'Instant LPU inference with Llama 3.3 70B & Whisper Large v3.',
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

  // 5. OpenAI project key: starts with sk-proj- or sk-admin-
  if (/^sk-proj-/i.test(key) || /^sk-admin-/i.test(key)) {
    return {
      provider: 'openai',
      label: 'OpenAI',
      complete: key.length >= 45,
      purposeModels: DEFAULT_PURPOSE_MODELS.openai,
      note: 'GPT-4o for scoring, GPT-4o-mini for questions, Whisper for STT, and TTS-1 for voice.',
    };
  }

  // 6. xAI: starts with xai-
  if (/^xai-/i.test(key)) {
    return {
      provider: 'xai',
      label: 'xAI Grok',
      complete: key.length >= 35,
      purposeModels: DEFAULT_PURPOSE_MODELS.xai,
      note: 'Grok-2 reasoning for TOEFL questions and evaluations.',
    };
  }

  // 7. Anthropic: starts with sk-ant-
  if (/^sk-ant-/i.test(key)) {
    return {
      provider: 'anthropic',
      label: 'Anthropic Claude',
      complete: key.length >= 40,
      purposeModels: DEFAULT_PURPOSE_MODELS.anthropic,
      note: 'Claude 3.5 Sonnet / Haiku for precise academic evaluation.',
    };
  }

  // 8. DeepSeek specific pattern (often ds- or standard 32-hex format)
  if (/^ds-/i.test(key)) {
    return {
      provider: 'deepseek',
      label: 'DeepSeek',
      complete: key.length >= 30,
      purposeModels: DEFAULT_PURPOSE_MODELS.deepseek,
      note: 'DeepSeek-V3 for high-accuracy reasoning and answer grading.',
    };
  }

  // 9. Standard sk- prefix (can be OpenAI or DeepSeek)
  if (/^sk-[A-Za-z0-9_-]{20,}/.test(key)) {
    // If length is around 32-35 chars and purely alphanumeric, commonly DeepSeek
    const isLikelyDeepSeek = key.length <= 36 && !key.includes('proj');
    const likelyProvider = isLikelyDeepSeek ? 'deepseek' : 'openai';
    return {
      provider: likelyProvider,
      label: isLikelyDeepSeek ? 'DeepSeek (or OpenAI)' : 'OpenAI (or DeepSeek)',
      complete: key.length >= 30,
      purposeModels: isLikelyDeepSeek ? DEFAULT_PURPOSE_MODELS.deepseek : DEFAULT_PURPOSE_MODELS.openai,
      note: 'Auto-tested against OpenAI & DeepSeek to lock in optimal purpose models.',
    };
  }

  // 10. Fallback for custom / partial keys
  return {
    provider: null,
    label: 'Custom / Universal Key',
    complete: key.length >= 20,
    note: 'Will auto-probe against supported endpoints (Gemini, Groq, NVIDIA, OpenRouter, OpenAI, DeepSeek).',
  };
}
