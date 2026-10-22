import crypto from 'crypto';

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

export function markModelDead(modelId: string) {
  deadModelsCache.set(modelId, Date.now() + 24 * 3600 * 1000);
}

function hashKey(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  return `k${hash}_len${key.length}`;
}

const roleModelsCache = new Map<string, { data: RoleModelsResult; expiresAt: number }>();

function extractVersionNumber(id: string): number {
  const match = id.match(/(\d+(?:\.\d+)?)/);
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

export async function getRoleModels(
  provider: string,
  apiKey: string,
  force = false
): Promise<RoleModelsResult> {
  const p = (provider || '').toLowerCase();
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) {
    return { chat: [], stt: [], tts: [], all: [], generationModel: '', evaluationModel: '' };
  }

  const cacheKey = `${p}:${hashKey(cleanKey)}`;
  const now = Date.now();

  if (!force) {
    const cached = roleModelsCache.get(cacheKey);
    if (cached && now < cached.expiresAt) {
      return cached.data;
    }
  }

  let rawModels: any[] = [];
  const baseUrls: Record<string, string> = {
    nvidia: 'https://integrate.api.nvidia.com/v1',
    groq: 'https://api.groq.com/openai/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    openai: 'https://api.openai.com/v1',
    gemini: 'https://generativelanguage.googleapis.com/v1beta',
  };

  try {
    if (p === 'gemini') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models`, {
        method: 'GET',
        headers: {
          'x-goog-api-key': cleanKey,
          'Content-Type': 'application/json',
        },
      });
      if (res.ok) {
        const json = await res.json();
        rawModels = Array.isArray(json?.models) ? json.models : [];
        rawModels = rawModels.filter((m: any) => {
          const methods = m?.supportedGenerationMethods || [];
          const name = String(m?.name || '');
          const isContent = methods.includes('generateContent');
          const isExcluded = /image|tts|live|audio|embedding|imagen|veo|lyria|robotics|native-audio/i.test(name);
          return isContent && !isExcluded;
        });
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
        if (res.ok) {
          const json = await res.json();
          rawModels = Array.isArray(json?.data) ? json.data : Array.isArray(json?.models) ? json.models : Array.isArray(json) ? json : [];
        }
      }
    }
  } catch {}

  if (p === 'openrouter') {
    rawModels = rawModels.filter((m: any) => {
      const id = String(m?.id || '');
      if (id.endsWith(':free')) return true;
      const promptPrice = Number(m?.pricing?.prompt ?? 1);
      const completionPrice = Number(m?.pricing?.completion ?? 1);
      return promptPrice === 0 && completionPrice === 0;
    });
  }

  const all = rawModels.map((m: any) => String(m?.name?.replace('models/', '') || m?.id || m?.name || '')).filter(Boolean);
  const { stt, tts } = classifyAudioModels(all);
  const sttTtsSet = new Set([...stt, ...tts]);
  const chatCandidateIds = all.filter((id) => !sttTtsSet.has(id));

  const genRanked = rankModelsForRole(p, chatCandidateIds, 'generation');
  const evalRanked = rankModelsForRole(p, chatCandidateIds, 'evaluation');

  const result: RoleModelsResult = {
    chat: genRanked,
    stt,
    tts,
    all,
    generationModel: genRanked[0] || (p === 'gemini' ? 'gemini-1.5-flash' : ''),
    evaluationModel: evalRanked[0] || genRanked[0] || '',
  };

  roleModelsCache.set(cacheKey, {
    data: result,
    expiresAt: now + 6 * 3600 * 1000, // 6 hours caching per provider+key hash
  });

  return result;
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
  } else if (status === 404 || lower.includes('model not found') || lower.includes('does not exist') || lower.includes('no access') || lower.includes('retired')) {
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
