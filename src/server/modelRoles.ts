import { GENERATION_MODELS, EVALUATION_MODELS } from '../config/models.ts';

export interface ModelChainsResult {
  generation: string[];
  evaluation: string[];
  tts: string[];
  stt: string[];
  all: string[];
}

export interface RoleModelsResult {
  chat: string[];
  stt: string[];
  tts: string[];
  all: string[];
  generationModel: string;
  evaluationModel: string;
}

const DROP_PATTERN = /embed|whisper|tts|speech|guard|moderat|rerank|vision|image|audio|transcri|safety|ocr|parse|clip|diffusion|stable|flux|\bvl\b|-vl-|reward|retriev|orpheus|playai|moderation/i;
const REASONING_PATTERN = /r1\b|reason|thinking|qwq|o1|o3/i;

// Dead model cache (24 hours)
const deadModelsCache = new Map<string, number>();

export function isModelDead(modelId: string): boolean {
  const expires = deadModelsCache.get(modelId);
  if (!expires) return false;
  if (Date.now() > expires) {
    deadModelsCache.delete(modelId);
    return false;
  }
  return true;
}

export function markModelDead(modelId: string): void {
  deadModelsCache.set(modelId, Date.now() + 24 * 3600 * 1000);
}

export function clearDeadModels(): void {
  deadModelsCache.clear();
}

/**
 * Universal helper to check if a model error indicates the model is retired, not found, or gone.
 * Returns true for HTTP 404, 410, and error messages matching dead model patterns.
 */
export function isModelGone(status?: number, message?: string): boolean {
  if (status === 404 || status === 410) {
    return true;
  }
  if (!message) return false;
  return /not found|does not exist|no access|retired|end of life|deprecated|gone|no endpoints/i.test(message);
}

// Track last list error per provider to report descriptive errors if chain is empty
const lastListErrors = new Map<string, { status: number; message: string }>();

export function getLastListError(provider: string): { status: number; message: string } | null {
  return lastListErrors.get(provider.toLowerCase()) || null;
}

export function setLastListError(provider: string, err: { status: number; message: string }): void {
  lastListErrors.set(provider.toLowerCase(), err);
}

function hashKey(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  return `k${hash}_len${key.length}`;
}

const roleChainsCache = new Map<string, { data: ModelChainsResult; expiresAt: number }>();

export function clearModelChainsCache(): void {
  roleChainsCache.clear();
}

function extractVersionNumber(id: string): number {
  // Strip parameter sizes (e.g. 120b, 70b, 20b, 8b) and context sizes (e.g. 128k, 32k)
  const cleanId = id.replace(/[-_]?\d+[bBkK]\b/g, '');
  const match = cleanId.match(/(\d+(?:\.\d+)?)/);
  if (match) {
    return parseFloat(match[1]);
  }
  return 1.0;
}

export function scoreModelForRole(id: string, role: 'generation' | 'evaluation', provider: string): number {
  const lower = id.toLowerCase();
  if (isModelDead(id)) return -9999;
  if (DROP_PATTERN.test(lower)) return -1000;
  if (REASONING_PATTERN.test(lower)) return -500;

  let score = 10;
  const version = extractVersionNumber(lower);

  if (role === 'generation') {
    // Prefer cheapest/fastest family: flash-lite, 8b, 20b, mini, small
    if (/flash-lite|8b|20b|mini|small/i.test(lower)) {
      score += 100;
    } else if (/flash|70b|instruct/i.test(lower)) {
      score += 50;
    }
  } else {
    // Evaluation role: prefer strongest available: pro, 120b, 70b, large, or newest non-lite flash
    if (/pro|120b|70b|large/i.test(lower)) {
      score += 120;
    } else if (/flash\b(?!-lite)/i.test(lower) || /gpt-4o\b/i.test(lower)) {
      score += 100;
    } else if (/instruct|chat/i.test(lower)) {
      score += 60;
    }
  }

  score += version * 5;
  return score;
}

export function rankModelsForRole(provider: string, ids: string[], role: 'generation' | 'evaluation'): string[] {
  let filtered = ids.filter((id) => !DROP_PATTERN.test(id) && !isModelDead(id));

  if (provider === 'openrouter') {
    const freeModels = filtered.filter((id) => id.endsWith(':free'));
    const nonFreeModels = filtered.filter((id) => !id.endsWith(':free'));
    filtered = [...freeModels, ...nonFreeModels];
  }

  return filtered.sort((a, b) => scoreModelForRole(b, role, provider) - scoreModelForRole(a, role, provider));
}

export function classifyAudioModels(ids: string[]): { stt: string[]; tts: string[] } {
  const sttCandidates = ids.filter((id) => /whisper|transcri|parakeet|canary/i.test(id));
  const ttsCandidates = ids.filter(
    (id) => /tts|orpheus|playai|text-to-speech|voxtral/i.test(id) && !/guard|whisper|transcri/i.test(id)
  );
  return { stt: sttCandidates, tts: ttsCandidates };
}

export function resolveModelName(
  typed: string | undefined | null,
  ids: string[]
): { model: string | null; exact: boolean } {
  if (!typed || !typed.trim()) {
    return { model: null, exact: false };
  }
  const trimmed = typed.trim();
  const lowerTyped = trimmed.toLowerCase();

  if (ids.includes(trimmed)) {
    return { model: trimmed, exact: true };
  }
  const caseMatch = ids.find((id) => id.toLowerCase() === lowerTyped);
  if (caseMatch) {
    return { model: caseMatch, exact: true };
  }
  const normTyped = lowerTyped.replace(/[^a-z0-9]/g, '');
  const normMatch = ids.find((id) => id.toLowerCase().replace(/[^a-z0-9]/g, '') === normTyped);
  if (normMatch) {
    return { model: normMatch, exact: false };
  }
  return { model: null, exact: false };
}

/**
 * Shared function to resolve ranked model chains { generation, evaluation, tts, stt }
 * from the provider's real /models endpoint, cached for 6 hours per provider and hashed key.
 */
export async function resolveModelChains(
  provider: string,
  apiKey: string,
  force = false
): Promise<ModelChainsResult> {
  const p = (provider || 'gemini').toLowerCase();
  const cleanKey = (apiKey || '').trim();

  const cacheKey = `${p}:${hashKey(cleanKey)}`;
  const now = Date.now();

  if (!force) {
    const cached = roleChainsCache.get(cacheKey);
    if (cached && now < cached.expiresAt) {
      return cached.data;
    }
  }

  const baseUrls: Record<string, string> = {
    nvidia: 'https://integrate.api.nvidia.com/v1',
    groq: 'https://api.groq.com/openai/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    openai: 'https://api.openai.com/v1',
    gemini: 'https://generativelanguage.googleapis.com/v1beta',
  };

  let rawModels: any[] = [];
  let geminiTtsModels: string[] = [];
  let fetchFailed = false;

  if (!cleanKey) {
    setLastListError(p, { status: 401, message: 'No API key provided' });
    return getFallbackChains(p);
  }

  try {
    if (p === 'gemini') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models`, {
        method: 'GET',
        headers: {
          'x-goog-api-key': cleanKey,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        fetchFailed = true;
        const errText = await res.text();
        let errMsg = errText;
        try {
          const j = JSON.parse(errText);
          errMsg = j.error?.message || j.message || errText;
        } catch {}
        setLastListError('gemini', { status: res.status, message: redactKeyInText(errMsg, cleanKey) });
      } else {
        const json = await res.json();
        const list = Array.isArray(json?.models) ? json.models : [];
        if (list.length === 0) {
          setLastListError('gemini', { status: 200, message: 'No models found in Gemini /models response' });
        }

        // Gemini models supporting generateContent
        const contentModels = list.filter((m: any) => {
          const methods = m?.supportedGenerationMethods || [];
          return methods.includes('generateContent');
        });

        // Chat models: exclude image, tts, live, audio, embedding, imagen, veo, lyria, robotics, native-audio
        rawModels = contentModels.filter((m: any) => {
          const name = String(m?.name || '');
          return !/image|tts|live|audio|embedding|imagen|veo|lyria|robotics|native-audio/i.test(name);
        });

        // TTS models: keep only models whose name contains "tts" (never 'tts-1')
        geminiTtsModels = list
          .map((m: any) => String(m?.name || '').replace(/^models\//, ''))
          .filter((name: string) => /tts/i.test(name) && !/tts-1/i.test(name));
      }
    } else {
      const baseUrl = baseUrls[p];
      if (baseUrl) {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${cleanKey}`,
          'Content-Type': 'application/json',
        };
        if (p === 'openrouter') {
          headers['HTTP-Referer'] = 'https://toeflprepstudio.com';
          headers['X-Title'] = 'TOEFL Prep Studio';
        }
        const res = await fetch(`${baseUrl}/models`, {
          method: 'GET',
          headers,
        });

        if (!res.ok) {
          fetchFailed = true;
          const errText = await res.text();
          let errMsg = errText;
          try {
            const j = JSON.parse(errText);
            errMsg = j.error?.message || j.message || errText;
          } catch {}
          setLastListError(p, { status: res.status, message: redactKeyInText(errMsg, cleanKey) });
        } else {
          const json = await res.json();
          rawModels = Array.isArray(json?.data)
            ? json.data
            : Array.isArray(json?.models)
            ? json.models
            : Array.isArray(json)
            ? json
            : [];
          if (rawModels.length === 0) {
            setLastListError(p, { status: 200, message: `No models returned from ${p} /models` });
          }
        }
      }
    }
  } catch (err: any) {
    fetchFailed = true;
    setLastListError(p, { status: 500, message: redactKeyInText(err?.message || String(err), cleanKey) });
  }

  if (p === 'openrouter') {
    rawModels = rawModels.filter((m: any) => {
      const id = String(m?.id || '');
      if (id.endsWith(':free')) return true;
      const promptPrice = Number(m?.pricing?.prompt ?? 1);
      const completionPrice = Number(m?.pricing?.completion ?? 1);
      return promptPrice === 0 && completionPrice === 0;
    });
  }

  const all = rawModels
    .map((m: any) => String(m?.name?.replace(/^models\//, '') || m?.id || m?.name || ''))
    .filter(Boolean);

  let sttCandidates: string[] = [];
  let ttsCandidates: string[] = [];

  if (p === 'gemini') {
    ttsCandidates = geminiTtsModels;
    sttCandidates = all; // Gemini multimodal audio transcription
  } else {
    const audio = classifyAudioModels(all);
    sttCandidates = audio.stt;
    ttsCandidates = audio.tts;
  }

  const sttTtsSet = new Set([...sttCandidates, ...ttsCandidates]);
  const chatCandidateIds = p === 'gemini' ? all : all.filter((id) => !sttTtsSet.has(id));

  let genRanked = rankModelsForRole(p, chatCandidateIds, 'generation');
  let evalRanked = rankModelsForRole(p, chatCandidateIds, 'evaluation');

  // If live discovery failed and yielded 0 candidates, use static fallback config
  if (fetchFailed && genRanked.length === 0) {
    const fallbacks = getFallbackChains(p);
    genRanked = fallbacks.generation;
    evalRanked = fallbacks.evaluation;
    if (sttCandidates.length === 0) sttCandidates = fallbacks.stt;
    if (ttsCandidates.length === 0) ttsCandidates = fallbacks.tts;
  }

  const result: ModelChainsResult = {
    generation: genRanked,
    evaluation: evalRanked,
    tts: ttsCandidates,
    stt: sttCandidates,
    all,
  };

  if (!fetchFailed && (genRanked.length > 0 || all.length > 0)) {
    roleChainsCache.set(cacheKey, {
      data: result,
      expiresAt: now + 6 * 3600 * 1000, // 6 hours
    });
  }

  return result;
}

function getFallbackChains(provider: string): ModelChainsResult {
  const p = (provider || '').toLowerCase() as keyof typeof GENERATION_MODELS;
  const gen = (GENERATION_MODELS[p] || []).filter((m) => !isModelDead(m));
  const ev = (EVALUATION_MODELS[p] || []).filter((m) => !isModelDead(m));
  return {
    generation: gen,
    evaluation: ev.length > 0 ? ev : gen,
    tts: [],
    stt: [],
    all: [...gen, ...ev],
  };
}

export async function getRoleModels(
  provider: string,
  apiKey: string,
  force = false
): Promise<RoleModelsResult> {
  const chains = await resolveModelChains(provider, apiKey, force);
  return {
    chat: chains.generation,
    stt: chains.stt,
    tts: chains.tts,
    all: chains.all,
    generationModel: chains.generation[0] || '',
    evaluationModel: chains.evaluation[0] || chains.generation[0] || '',
  };
}

export function redactKeyInText(text: string, apiKey?: string): string {
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

export function formatProviderError(provider: string, model: string, status: number, rawMessage: string, apiKey?: string) {
  const cleanMsg = redactKeyInText(rawMessage, apiKey);
  let humanExplanation = 'Provider error occurred';
  const lower = cleanMsg.toLowerCase();

  if (status === 401 || status === 403 || lower.includes('invalid api key') || lower.includes('unauthorized') || lower.includes('api key not valid')) {
    humanExplanation = 'Invalid API key or unauthorized access.';
  } else if (status === 404 || status === 410 || lower.includes('model not found') || lower.includes('does not exist') || lower.includes('no access') || lower.includes('retired') || lower.includes('gone')) {
    humanExplanation = 'Model retired, not found, or no access.';
  } else if (status === 429 || lower.includes('rate limit') || lower.includes('quota') || lower.includes('resource_exhausted')) {
    humanExplanation = 'Rate limited or quota exhausted.';
  } else if (status >= 500) {
    humanExplanation = 'Provider server error.';
  } else {
    humanExplanation = 'Request failed.';
  }

  return {
    success: false,
    provider,
    modelTried: model,
    httpStatus: status,
    providerErrorMessage: cleanMsg,
    humanExplanation,
    error: `${provider} (${model}) [HTTP ${status}]: ${cleanMsg} (${humanExplanation})`,
  };
}
