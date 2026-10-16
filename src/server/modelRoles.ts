import { rankModels } from './providerProbe.ts';

export interface RoleModelsResult {
  chat: string[];
  stt: string[];
  tts: string[];
  all: string[];
}

export function classifyAudioModels(ids: string[]): { stt: string[]; tts: string[] } {
  const sttCandidates = ids.filter((id) => /whisper|transcri|parakeet|canary/i.test(id));
  const ttsCandidates = ids.filter(
    (id) => /tts|orpheus|playai|text-to-speech/i.test(id) && !/guard|whisper|transcri/i.test(id)
  );

  function scoreStt(id: string): number {
    const lower = id.toLowerCase();
    if (lower.includes('arabic') || lower.includes('translate')) return -100;
    if (lower.includes('whisper-large-v3-turbo')) return 100;
    if (lower.includes('whisper-large-v3')) return 90;
    if (lower.includes('whisper')) return 80;
    return 10;
  }

  function scoreTts(id: string): number {
    const lower = id.toLowerCase();
    if (lower.includes('arabic')) return -100;
    if (lower.includes('orpheus') && lower.includes('english')) return 100;
    if (lower.includes('orpheus')) return 90;
    if (lower.includes('playai')) return 80;
    return 10;
  }

  const stt = [...sttCandidates].sort((a, b) => scoreStt(b) - scoreStt(a));
  const tts = [...ttsCandidates].sort((a, b) => scoreTts(b) - scoreTts(a));

  return { stt, tts };
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

  // 1. Exact match
  if (ids.includes(trimmed)) {
    return { model: trimmed, exact: true };
  }

  // 2. Case insensitive match
  const caseMatch = ids.find((id) => id.toLowerCase() === lowerTyped);
  if (caseMatch) {
    return { model: caseMatch, exact: true };
  }

  // 3. Ending with "/typed" or ":typed"
  const suffixMatch = ids.find(
    (id) => id.toLowerCase().endsWith('/' + lowerTyped) || id.toLowerCase().endsWith(':' + lowerTyped)
  );
  if (suffixMatch) {
    return { model: suffixMatch, exact: false };
  }

  // 4. Normalized equality (letters and digits only)
  const normTyped = lowerTyped.replace(/[^a-z0-9]/g, '');
  const normMatch = ids.find((id) => id.toLowerCase().replace(/[^a-z0-9]/g, '') === normTyped);
  if (normMatch) {
    return { model: normMatch, exact: false };
  }

  // 5. Shortest id containing normalized text when normTyped >= 4 chars
  if (normTyped.length >= 4) {
    const containsMatches = ids.filter((id) =>
      id.toLowerCase().replace(/[^a-z0-9]/g, '').includes(normTyped)
    );
    if (containsMatches.length > 0) {
      containsMatches.sort((a, b) => a.length - b.length);
      return { model: containsMatches[0], exact: false };
    }
  }

  return { model: null, exact: false };
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

export async function getRoleModels(
  provider: string,
  apiKey: string,
  force = false
): Promise<RoleModelsResult> {
  const p = (provider || '').toLowerCase();
  if (p !== 'nvidia' && p !== 'groq' && p !== 'openrouter') {
    return { chat: [], stt: [], tts: [], all: [] };
  }

  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) {
    return { chat: [], stt: [], tts: [], all: [] };
  }

  const cacheKey = `${p}:${hashKey(cleanKey)}`;
  const now = Date.now();

  if (!force) {
    const cached = roleModelsCache.get(cacheKey);
    if (cached && now < cached.expiresAt) {
      return cached.data;
    }
  }

  const baseUrls: Record<string, string> = {
    nvidia: 'https://integrate.api.nvidia.com/v1',
    groq: 'https://api.groq.com/openai/v1',
    openrouter: 'https://openrouter.ai/api/v1',
  };

  const baseUrl = baseUrls[p];
  if (!baseUrl) {
    return { chat: [], stt: [], tts: [], all: [] };
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${cleanKey}`,
    'Content-Type': 'application/json',
  };

  if (p === 'openrouter') {
    headers['HTTP-Referer'] = 'https://toeflprepstudio.com';
    headers['X-Title'] = 'TOEFL Prep Studio';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  let rawModels: any[] = [];
  try {
    const res = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    if (res.ok) {
      const text = await res.text();
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {}
      rawModels = Array.isArray(json?.data) ? json.data : Array.isArray(json?.models) ? json.models : Array.isArray(json) ? json : [];
    }
  } catch {
    // Return empty on fetch failure
  } finally {
    clearTimeout(timer);
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

  const all = rawModels.map((m: any) => String(m?.id || m?.name || '')).filter(Boolean);
  const { stt, tts } = classifyAudioModels(all);
  const sttTtsSet = new Set([...stt, ...tts]);
  const chatCandidateIds = all.filter((id) => !sttTtsSet.has(id));
  const chat = rankModels(p, chatCandidateIds);

  const result: RoleModelsResult = { chat, stt, tts, all };

  roleModelsCache.set(cacheKey, {
    data: result,
    expiresAt: now + 10 * 60 * 1000,
  });

  return result;
}
