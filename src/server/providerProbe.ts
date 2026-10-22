import { getRoleModels, markModelDead, formatProviderError, redactKeyInText, rankModelsForRole } from './modelRoles.ts';

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
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
};

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
  generationModel: string;
  evaluationModel: string;
  roles?: { chat: string; stt: string | null; tts: string | null };
  modelNote?: string;
  message: string;
  warning?: string;
}> {
  const providerName = PROVIDER_LABELS[provider] || provider;
  const baseUrl = PROBE_BASE_URLS[provider];
  if (!baseUrl && provider !== 'gemini') {
    throw Object.assign(new Error(`Unsupported probe provider: ${provider}`), { status: 400 });
  }

  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) {
    throw Object.assign(new Error(`No API key provided for ${providerName}.`), { status: 401 });
  }

  // 1. Discovery first: fetch models via real endpoint
  let roleData = await getRoleModels(provider, cleanKey, true);
  let candidates = roleData.chat;

  if (candidates.length === 0) {
    // If discovery failed or returned empty, use fallback discovery or throw detailed error
    roleData = await getRoleModels(provider, cleanKey, true);
    candidates = roleData.chat;
    if (candidates.length === 0) {
      const errInfo = formatProviderError(provider, preferredModel || 'default', 502, `${providerName} models endpoint returned no chat models.`, cleanKey);
      throw Object.assign(new Error(errInfo.error), { status: 502, details: errInfo });
    }
  }

  const generationModel = roleData.generationModel || candidates[0];
  const evaluationModel = roleData.evaluationModel || generationModel;

  // OpenRouter: try up to 3 ranked :free models before giving up
  const maxTries = provider === 'openrouter' ? Math.min(3, candidates.length) : Math.min(5, candidates.length);
  const triedModels: Array<{ model: string; error: string; status: number }> = [];

  for (let i = 0; i < maxTries; i++) {
    const modelToTest = candidates[i] || generationModel;
    const chatUrl = provider === 'gemini'
      ? `https://generativelanguage.googleapis.com/v1beta/models/${modelToTest}:generateContent`
      : `${baseUrl}/chat/completions`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    try {
      let res: Response;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (provider === 'gemini') {
        headers['x-goog-api-key'] = cleanKey;
      } else {
        headers['Authorization'] = `Bearer ${cleanKey}`;
        if (provider === 'openrouter') {
          headers['HTTP-Referer'] = 'https://toeflprepstudio.com';
          headers['X-Title'] = 'TOEFL Prep Studio';
        }
      }

      const body = provider === 'gemini'
        ? JSON.stringify({ contents: [{ parts: [{ text: 'Say OK' }] }] })
        : JSON.stringify({
            model: modelToTest,
            messages: [{ role: 'user', content: 'Say OK' }],
            max_tokens: 5,
          });

      res = await fetch(chatUrl, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      if (res.status === 401 || res.status === 403) {
        const errInfo = formatProviderError(provider, modelToTest, res.status, 'API key rejected or unauthorized', cleanKey);
        throw Object.assign(new Error(errInfo.error), { status: 401, details: errInfo });
      }

      if (res.status === 404 || res.status === 400) {
        const errText = await res.text();
        if (res.status === 404 || /not found|does not exist|no access|retired/i.test(errText)) {
          markModelDead(modelToTest);
        }
        triedModels.push({ model: modelToTest, error: errText, status: res.status });
        continue;
      }

      if (res.status === 429) {
        triedModels.push({ model: modelToTest, error: 'Rate limit / quota exhausted', status: 429 });
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        triedModels.push({ model: modelToTest, error: errText, status: res.status });
        continue;
      }

      // Success
      return {
        success: true,
        provider,
        providerName,
        model: modelToTest,
        models: roleData.all.slice(0, 30),
        generationModel,
        evaluationModel,
        roles: {
          chat: modelToTest,
          stt: roleData.stt[0] || null,
          tts: roleData.tts[0] || null,
        },
        message: `Connected to ${providerName}. Generation model: ${generationModel}, Evaluation model: ${evaluationModel}.`,
      };
    } catch (err: any) {
      if (err?.status === 401) throw err;
      triedModels.push({ model: modelToTest, error: err?.message || String(err), status: err?.status || 500 });
      continue;
    } finally {
      clearTimeout(timer);
    }
  }

  // If all tried models failed, format detailed real error report
  const lastErr = triedModels[triedModels.length - 1] || { model: candidates[0], error: 'Unknown failure', status: 502 };
  const errInfo = formatProviderError(provider, lastErr.model, lastErr.status, lastErr.error, cleanKey);
  throw Object.assign(new Error(errInfo.error), { status: lastErr.status || 502, details: errInfo });
}

export async function probeAuto(
  apiKey: string,
  preferredModel?: string
): Promise<{
  success: true;
  provider: string;
  providerName: string;
  model: string;
  models: string[];
  generationModel: string;
  evaluationModel: string;
  roles?: { chat: string; stt: string | null; tts: string | null };
  message: string;
  warning?: string;
}> {
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) {
    throw Object.assign(new Error('No API key provided.'), { status: 400 });
  }

  if (/^(AIza|AQ\.)/i.test(cleanKey)) {
    return probeProvider('gemini', cleanKey, preferredModel);
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
  if (/^sk-/i.test(cleanKey)) {
    return probeProvider('openai', cleanKey, preferredModel);
  }

  throw Object.assign(
    new Error('Only free-tier & standard providers (Gemini, Groq, NVIDIA, OpenRouter, OpenAI) are auto-detected.'),
    { status: 400 }
  );
}
