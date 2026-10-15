export const PROVIDER_LABELS: Record<string, string> = {
  gemini: 'Google Gemini',
  nvidia: 'NVIDIA',
  groq: 'Groq',
  openrouter: 'OpenRouter',
};

export const PROBE_BASE_URLS: Record<string, string> = {
  nvidia: 'https://integrate.api.nvidia.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
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
    .replace(/AIza[A-Za-z0-9_-]{10,}/g, '[REDACTED]');
}

export function rankModels(provider: string, ids: string[], preferred?: string): string[] {
  // 1. Drop non-chat/specialized models
  let filtered = ids.filter((id) => !DROP_PATTERN.test(id));

  // 2. For openrouter, keep only :free models
  if (provider === 'openrouter') {
    filtered = filtered.filter((id) => id.endsWith(':free'));
  }

  // Score models based on provider preferences
  function getScore(id: string): number {
    const lower = id.toLowerCase();
    
    // Reasoning models pushed to end
    if (REASONING_PATTERN.test(lower)) {
      return -100;
    }

    // Top choice: llama-3.3-70b
    if (lower.includes('llama-3.3-70b')) {
      return 100;
    }

    // Provider-specific second choices
    if (provider === 'groq') {
      if (lower.includes('gpt-oss-120b') || lower.includes('qwen') || lower.includes('llama-3.1-70b')) {
        return 80;
      }
    } else if (provider === 'nvidia') {
      if (lower.includes('llama-3.1-70b-instruct') || (lower.includes('nemotron') && lower.includes('70b')) || lower.includes('mixtral')) {
        return 80;
      }
    } else if (provider === 'openrouter') {
      if (lower.includes('gpt-oss') || lower.includes('qwen') || lower.includes('gemma')) {
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

  // Put preferred first when present in the list
  if (preferred) {
    const prefIndex = sorted.indexOf(preferred);
    if (prefIndex > -1) {
      sorted.splice(prefIndex, 1);
      sorted.unshift(preferred);
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
  const listTimer = setTimeout(() => listController.abort(), 18000);

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

  // Filter openrouter free models
  let candidateIds: string[] = [];
  if (provider === 'openrouter') {
    candidateIds = rawModels
      .filter((m: any) => {
        const id = String(m?.id || '');
        if (!id.endsWith(':free')) return false;
        const promptPrice = Number(m?.pricing?.prompt ?? 0);
        const completionPrice = Number(m?.pricing?.completion ?? 0);
        return promptPrice === 0 && completionPrice === 0;
      })
      .map((m: any) => String(m.id));
  } else {
    candidateIds = rawModels.map((m: any) => String(m?.id || m?.name || '')).filter(Boolean);
  }

  const ranked = rankModels(provider, candidateIds, preferredModel);
  if (ranked.length === 0) {
    throw Object.assign(new Error(`${providerName} has no available chat models.`), { status: 502 });
  }

  // 2. Test up to top 3 models
  const topCandidates = ranked.slice(0, 3);
  let lastTestError: any = null;

  for (const modelToTest of topCandidates) {
    const chatUrl = `${baseUrl}/chat/completions`;
    const chatController = new AbortController();
    const chatTimer = setTimeout(() => chatController.abort(), 20000);

    try {
      const res = await fetch(chatUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelToTest,
          messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
          max_tokens: 8,
        }),
        signal: chatController.signal,
      });

      if (res.status === 401 || res.status === 403) {
        throw Object.assign(new Error(`${providerName} rejected this key. Check that it was copied completely.`), { status: 401 });
      }

      if (res.status === 402) {
        // Needs payment, skipped
        lastTestError = Object.assign(new Error('needs payment, skipped'), { status: 402 });
        continue;
      }

      if (res.status === 429) {
        // Key is valid, but free limit reached!
        return {
          success: true,
          provider,
          providerName,
          model: modelToTest,
          models: ranked.slice(0, 30),
          message: `Connected to ${providerName}. Using ${modelToTest}.`,
          warning: 'Key is valid, but the free rate limit was reached. It will be usable once your quota resets.',
        };
      }

      if (!res.ok) {
        const errText = await res.text();
        lastTestError = Object.assign(new Error(redactKey(errText.slice(0, 200), cleanKey)), { status: res.status });
        continue;
      }

      // Success
      return {
        success: true,
        provider,
        providerName,
        model: modelToTest,
        models: ranked.slice(0, 30),
        message: `Connected to ${providerName}. Using ${modelToTest}.`,
      };
    } catch (err: any) {
      if (err?.status === 401) throw err;
      lastTestError = err;
      continue;
    } finally {
      clearTimeout(chatTimer);
    }
  }

  // If none answered
  if (lastTestError?.status === 401) {
    throw lastTestError;
  }
  throw Object.assign(
    new Error(`None of the tested models on ${providerName} answered successfully.`),
    { status: 502 }
  );
}
