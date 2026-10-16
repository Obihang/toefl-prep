import { DEFAULT_PURPOSE_MODELS } from '../utils/keyDetect.ts';
import type { PurposeModels } from '../utils/keyDetect.ts';
import { resolveModelName, classifyAudioModels } from './modelRoles.ts';

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

const DROP_PATTERN = /embed|whisper|tts|speech|guard|moderat|rerank|vision|image|audio|transcri|safety|ocr|parse|clip|diffusion|stable|flux|\bvl\b|-vl-|reward|retriev|orpheus|playai/i;
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
    .replace(/(AIza|AQ\.)[A-Za-z0-9_.-]{10,}/g, '[REDACTED]');
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
      return 120;
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
      if (lower.includes('llama-3.1-70b')) return 110;
      if (lower.includes('qwen-2.5')) return 100;
      if (lower.includes('deepseek')) return 90;
      if (lower.includes('mistral') || lower.includes('gemma')) return 50;
    }

    // General 70b or large instruct models
    if (lower.includes('70b') || lower.includes('instruct')) {
      return 50;
    }

    return 10;
  }

  // Sort descending by score
  const sorted = [...filtered].sort((a, b) => getScore(b) - getScore(a));

  // Put preferred first when specified
  if (preferred && preferred.trim()) {
    const trimmedPref = preferred.trim();
    const prefIndex = sorted.indexOf(trimmedPref);
    if (prefIndex > -1) {
      sorted.splice(prefIndex, 1);
      sorted.unshift(trimmedPref);
    } else {
      sorted.unshift(trimmedPref);
    }
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
  roles?: { chat: string; stt: string | null; tts: string | null };
  modelNote?: string;
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

  // Typed model name resolution
  let resolvedPref: string | undefined = undefined;
  let modelNote: string | undefined = undefined;

  if (preferredModel && preferredModel.trim()) {
    const trimmed = preferredModel.trim();
    const res = resolveModelName(trimmed, candidateIds);
    resolvedPref = res.model || trimmed;
  }

  const ranked = rankModels(provider, candidateIds, resolvedPref);
  if (ranked.length === 0) {
    throw Object.assign(new Error(`${providerName} has no available chat models.`), { status: 502 });
  }

  // Compute audio roles
  const audioRoles = classifyAudioModels(candidateIds);

  // 2. Test top candidate models (up to 5)
  const topCandidates = ranked.slice(0, 5);
  let lastTestError: any = null;
  let has429QuotaError = false;

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
        has429QuotaError = true;
        lastTestError = Object.assign(new Error(`Rate limit reached on ${modelToTest}. Trying next model.`), { status: 429 });
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        lastTestError = Object.assign(new Error(redactKey(errText.slice(0, 200), cleanKey)), { status: res.status });
        continue;
      }

      const pModels = DEFAULT_PURPOSE_MODELS[provider];

      if (preferredModel && preferredModel.trim() && !resolvedPref) {
        modelNote = `Model '${preferredModel.trim()}' was not found, using ${modelToTest} instead`;
      }

      return {
        success: true,
        provider,
        providerName,
        model: modelToTest,
        models: ranked.slice(0, 30),
        purposeModels: pModels,
        roles: {
          chat: modelToTest,
          stt: audioRoles.stt[0] || null,
          tts: audioRoles.tts[0] || null,
        },
        modelNote,
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

  if (has429QuotaError) {
    const pModels = DEFAULT_PURPOSE_MODELS[provider];
    const assigned = topCandidates[0] || 'meta-llama/llama-3.3-70b-instruct:free';
    if (preferredModel && preferredModel.trim() && !resolvedPref) {
      modelNote = `Model '${preferredModel.trim()}' was not found, using ${assigned} instead`;
    }
    return {
      success: true,
      provider,
      providerName,
      model: assigned,
      models: ranked.slice(0, 30),
      purposeModels: pModels,
      roles: {
        chat: assigned,
        stt: audioRoles.stt[0] || null,
        tts: audioRoles.tts[0] || null,
      },
      modelNote,
      message: `Connected to ${providerName}. Assigned model: ${assigned}.`,
      warning: 'Key is valid, but free rate limits were hit on tested models. It will be usable once your quota resets.',
    };
  }

  if (lastTestError?.status === 401) {
    throw lastTestError;
  }
  throw Object.assign(
    new Error(`None of the tested models on ${providerName} answered successfully.`),
    { status: 502 }
  );
}

// Auto probe: scans key signature for free auto-selected providers (Gemini, Groq, NVIDIA, OpenRouter)
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
  roles?: { chat: string; stt: string | null; tts: string | null };
  modelNote?: string;
  message: string;
  warning?: string;
}> {
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) {
    throw Object.assign(new Error('No API key provided.'), { status: 400 });
  }

  // Direct signature matches for free-tier auto-selected providers
  if (/^(AIza|AQ\.)/i.test(cleanKey)) {
    const { handleTestApiKey } = await import('./geminiHandler.ts');
    const result = await handleTestApiKey(cleanKey);
    return {
      success: true,
      provider: 'gemini',
      providerName: 'Google Gemini',
      model: result.model || 'gemini-3.8-flash',
      models: ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-pro-preview'],
      purposeModels: DEFAULT_PURPOSE_MODELS.gemini,
      roles: {
        chat: result.model || 'gemini-3.8-flash',
        stt: 'gemini-3.8-flash',
        tts: 'gemini-speech',
      },
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

  throw Object.assign(
    new Error('Only free-tier providers (Gemini, Groq, NVIDIA, OpenRouter) are auto-detected. For paid keys (OpenAI, DeepSeek, xAI, Anthropic), please select your provider manually.'),
    { status: 400 }
  );
}
