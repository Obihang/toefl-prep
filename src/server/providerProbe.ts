import { DEFAULT_PURPOSE_MODELS, PurposeModels } from '../utils/keyDetect.ts';

export const PROVIDER_LABELS: Record<string, string> = {
  gemini: 'Google Gemini',
  nvidia: 'NVIDIA NIM',
  groq: 'Groq',
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  xai: 'xAI Grok',
};

export const PROBE_BASE_URLS: Record<string, string> = {
  nvidia: 'https://integrate.api.nvidia.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  xai: 'https://api.x.ai/v1',
};

const DROP_PATTERN = /embed|whisper|tts|speech|guard|moderat|rerank|vision|image|audio|transcri|safety|ocr|parse|clip|diffusion|stable|flux|\bvl\b|-vl-|reward|retriev/i;
const REASONING_PATTERN = /r1\b|reason|thinking|qwq|o1|o3/i;

function redactKey(text: string, apiKey?: string): string {
  let out = String(text || '');
  if (apiKey && apiKey.length > 5) {
    out = out.split(apiKey).join('[REDACTED]');
  }
  return out
    .replace(/nvapi-[A-Za-z0-9_-]{10,}/g, '[REDACTED]')
    .replace(/gsk_[A-Za-z0-9]{10,}/g, '[REDACTED]')
    .replace(/sk-or-[A-Za-z0-9_-]{10,}/g, '[REDACTED]')
    .replace(/sk-[A-Za-z0-9_-]{10,}/g, '[REDACTED]')
    .replace(/AIza[A-Za-z0-9_-]{10,}/g, '[REDACTED]');
}

export function rankModels(provider: string, ids: string[], preferred?: string): string[] {
  // 1. Drop non-chat/specialized models
  let filtered = ids.filter((id) => !DROP_PATTERN.test(id));

  // 2. For openrouter, prioritize :free models if present
  if (provider === 'openrouter') {
    const freeModels = filtered.filter((id) => id.endsWith(':free'));
    if (freeModels.length > 0) {
      filtered = freeModels;
    }
  }

  // Score models based on provider preferences
  function getScore(id: string): number {
    const lower = id.toLowerCase();

    if (provider === 'openai') {
      if (lower === 'gpt-4o-mini') return 100;
      if (lower === 'gpt-4o') return 90;
      if (lower.includes('gpt-4')) return 70;
      return 10;
    }

    if (provider === 'deepseek') {
      if (lower === 'deepseek-chat') return 100;
      if (lower === 'deepseek-reasoner') return 80;
      return 10;
    }

    if (provider === 'xai') {
      if (lower.includes('grok-2')) return 100;
      if (lower.includes('grok')) return 80;
      return 10;
    }

    // Reasoning models pushed to end for generation speed
    if (REASONING_PATTERN.test(lower)) {
      return -100;
    }

    // Top choice: llama-3.3-70b
    if (lower.includes('llama-3.3-70b')) {
      return 100;
    }

    // Provider-specific second choices
    if (provider === 'groq') {
      if (lower.includes('gpt-oss-120b') || lower.includes('qwen') || lower.includes('llama-3.1-70b') || lower.includes('llama-3.1-8b')) {
        return 80;
      }
    } else if (provider === 'nvidia') {
      if (lower.includes('llama-3.1-70b-instruct') || (lower.includes('nemotron') && lower.includes('70b')) || lower.includes('mixtral')) {
        return 80;
      }
    } else if (provider === 'openrouter') {
      if (lower.includes('gpt-oss') || lower.includes('qwen') || lower.includes('gemma') || lower.includes('mistral')) {
        return 80;
      }
    }

    // General 70b or large instruct models
    if (lower.includes('70b') || lower.includes('instruct')) {
      return 50;
    }

    return 10;
  }

  // Sort descending by score
  const sorted = [...filtered].sort((a, b) => getScore(b) - getScore(a));

  // Put preferred first when present or add it to top
  if (preferred && preferred.trim()) {
    const trimmedPref = preferred.trim();
    const prefIndex = sorted.indexOf(trimmedPref);
    if (prefIndex > -1) {
      sorted.splice(prefIndex, 1);
    }
    sorted.unshift(trimmedPref);
  }

  return sorted;
}

export async function probeProvider(
  provider: string,
  apiKey: string,
  preferredModel?: string
): Promise<{
  success: true;
  provider: string;
  providerName: string;
  model: string;
  models: string[];
  purposeModels?: PurposeModels;
  message: string;
  warning?: string;
}> {
  const providerName = PROVIDER_LABELS[provider] || provider;
  const baseUrl = PROBE_BASE_URLS[provider];
  if (!baseUrl) {
    throw Object.assign(new Error(`Unsupported probe provider: ${provider}`), { status: 400 });
  }

  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) {
    throw Object.assign(new Error(`No API key provided for ${providerName}.`), { status: 401 });
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${cleanKey}`,
    'Content-Type': 'application/json',
  };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://toeflprepstudio.com';
    headers['X-Title'] = 'TOEFL Prep Studio';
  }

  // 1. Fetch models list with timeout
  const modelsUrl = `${baseUrl}/models`;
  const listController = new AbortController();
  const listTimer = setTimeout(() => listController.abort(), 12000);

  let rawModels: any[] = [];
  try {
    const res = await fetch(modelsUrl, {
      method: 'GET',
      headers,
      signal: listController.signal,
    });

    if (res.status === 401 || res.status === 403) {
      throw Object.assign(new Error(`${providerName} rejected this key. Check that it was copied completely.`), { status: 401 });
    }

    const text = await res.text();
    if (!res.ok) {
      throw Object.assign(new Error(`${providerName} model query failed (${res.status}): ${redactKey(text.slice(0, 200), cleanKey)}`), { status: res.status });
    }

    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      throw Object.assign(new Error(`${providerName} returned invalid JSON for models list.`), { status: 502 });
    }

    rawModels = Array.isArray(json?.data) ? json.data : Array.isArray(json?.models) ? json.models : Array.isArray(json) ? json : [];
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw Object.assign(new Error(`${providerName} connection timed out.`), { status: 504 });
    }
    throw err;
  } finally {
    clearTimeout(listTimer);
  }

  // Filter candidate IDs
  let candidateIds: string[] = [];
  if (provider === 'openrouter') {
    const freeModels = rawModels
      .filter((m: any) => {
        const id = String(m?.id || '');
        if (!id.endsWith(':free')) return false;
        const promptPrice = Number(m?.pricing?.prompt ?? 0);
        const completionPrice = Number(m?.pricing?.completion ?? 0);
        return promptPrice === 0 && completionPrice === 0;
      })
      .map((m: any) => String(m.id));
    candidateIds = freeModels.length > 0 ? freeModels : rawModels.map((m: any) => String(m?.id || m?.name || '')).filter(Boolean);
  } else {
    candidateIds = rawModels.map((m: any) => String(m?.id || m?.name || '')).filter(Boolean);
  }

  const ranked = rankModels(provider, candidateIds, preferredModel);
  if (ranked.length === 0) {
    throw Object.assign(new Error(`${providerName} has no available chat models.`), { status: 502 });
  }

  // 2. Test up to top 2 models
  const topCandidates = ranked.slice(0, 2);
  let lastTestError: any = null;

  for (const modelToTest of topCandidates) {
    const chatUrl = `${baseUrl}/chat/completions`;
    const chatController = new AbortController();
    const chatTimer = setTimeout(() => chatController.abort(), 12000);

    try {
      const res = await fetch(chatUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelToTest,
          messages: [{ role: 'user', content: 'Say OK' }],
          max_tokens: 5,
        }),
        signal: chatController.signal,
      });

      if (res.status === 401 || res.status === 403) {
        throw Object.assign(new Error(`${providerName} rejected this key. Check that it was copied completely.`), { status: 401 });
      }

      if (res.status === 402) {
        lastTestError = Object.assign(new Error('Insufficient credits or account balance.'), { status: 402 });
        continue;
      }

      if (res.status === 429) {
        const pModels = DEFAULT_PURPOSE_MODELS[provider];
        return {
          success: true,
          provider,
          providerName,
          model: modelToTest,
          models: ranked.slice(0, 30),
          purposeModels: pModels,
          message: `Connected to ${providerName}. Assigned model: ${modelToTest}.`,
          warning: 'Key is valid, but the free rate limit was reached. It will be usable once your quota resets.',
        };
      }

      if (!res.ok) {
        const errText = await res.text();
        lastTestError = Object.assign(new Error(redactKey(errText.slice(0, 200), cleanKey)), { status: res.status });
        continue;
      }

      const pModels = DEFAULT_PURPOSE_MODELS[provider];
      return {
        success: true,
        provider,
        providerName,
        model: modelToTest,
        models: ranked.slice(0, 30),
        purposeModels: pModels,
        message: `Connected to ${providerName}. Assigned model: ${modelToTest}.`,
      };
    } catch (err: any) {
      if (err?.status === 401) throw err;
      lastTestError = err;
      continue;
    } finally {
      clearTimeout(chatTimer);
    }
  }

  if (lastTestError?.status === 401) {
    throw lastTestError;
  }
  throw Object.assign(
    new Error(`None of the tested models on ${providerName} answered successfully.`),
    { status: 502 }
  );
}

// Auto probe: scans key signature or probes OpenAI and DeepSeek if key is ambiguous (sk-...)
export async function probeAuto(
  apiKey: string,
  preferredModel?: string
): Promise<{
  success: true;
  provider: string;
  providerName: string;
  model: string;
  models: string[];
  purposeModels?: PurposeModels;
  message: string;
  warning?: string;
}> {
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) {
    throw Object.assign(new Error('No API key provided.'), { status: 400 });
  }

  // Direct signature matches
  if (/^AIza/i.test(cleanKey)) {
    const { handleTestApiKey } = await import('./geminiHandler.ts');
    const result = await handleTestApiKey(cleanKey);
    return {
      success: true,
      provider: 'gemini',
      providerName: 'Google Gemini',
      model: result.model || 'gemini-3.8-flash',
      models: ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-pro-preview'],
      purposeModels: DEFAULT_PURPOSE_MODELS.gemini,
      message: `Connected to Google Gemini (${result.model || 'gemini-3.8-flash'})`,
    };
  }
  if (/^gsk_/i.test(cleanKey)) {
    return probeProvider('groq', cleanKey, preferredModel);
  }
  if (/^nvapi-/i.test(cleanKey)) {
    return probeProvider('nvidia', cleanKey, preferredModel);
  }
  if (/^sk-or-/i.test(cleanKey)) {
    return probeProvider('openrouter', cleanKey, preferredModel);
  }
  if (/^sk-proj-/i.test(cleanKey) || /^sk-admin-/i.test(cleanKey)) {
    return probeProvider('openai', cleanKey, preferredModel);
  }
  if (/^xai-/i.test(cleanKey)) {
    return probeProvider('xai', cleanKey, preferredModel);
  }
  if (/^ds-/i.test(cleanKey)) {
    return probeProvider('deepseek', cleanKey, preferredModel);
  }

  // Ambiguous sk- prefix: Try OpenAI first, then DeepSeek
  if (/^sk-/.test(cleanKey)) {
    try {
      const openAiResult = await probeProvider('openai', cleanKey, preferredModel);
      return openAiResult;
    } catch (openAiErr: any) {
      // If unauthorized on OpenAI, try DeepSeek
      if (openAiErr?.status === 401 || openAiErr?.status === 403 || String(openAiErr?.message).includes('rejected')) {
        try {
          const deepseekResult = await probeProvider('deepseek', cleanKey, preferredModel);
          return deepseekResult;
        } catch {
          // Both failed, throw original error
          throw openAiErr;
        }
      }
      throw openAiErr;
    }
  }

  // Fallback: try Groq, NVIDIA, OpenRouter
  throw Object.assign(new Error('Could not automatically determine the provider for this key format. Supported keys: AIza... (Gemini), gsk_... (Groq), nvapi-... (NVIDIA), sk-or-... (OpenRouter), sk-proj-... (OpenAI), or sk-... (DeepSeek/OpenAI).'), { status: 400 });
}
