import { type ApiCallOptions } from './geminiHandler';

export interface ProviderCandidate {
  provider: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

/**
 * Collects all configured provider API keys from headers, request options, and environment.
 */
export function collectAvailableProviders(options?: ApiCallOptions): ProviderCandidate[] {
  const opts = typeof options === 'string' ? { apiKey: options } : options || {};
  const map: Map<string, string> = new Map();

  // 1. Available keys dictionary from headers / config
  const availableKeys = (opts as any).availableKeys || {};
  for (const [p, k] of Object.entries(availableKeys)) {
    if (typeof k === 'string' && k.trim()) {
      map.set(p.toLowerCase(), k.trim());
    }
  }

  // 2. Specific keys passed in options
  const KNOWN = ['gemini', 'groq', 'openai', 'anthropic', 'openrouter', 'nvidia', 'deepseek', 'xai'];
  for (const p of KNOWN) {
    const k = (opts as any)[`${p}Key`] || (opts as any)[`${p}ApiKey`];
    if (typeof k === 'string' && k.trim() && !map.has(p)) {
      map.set(p, k.trim());
    }
  }

  // 3. Primary apiKey in options (infer provider if auto/gemini)
  const customApiKey = (opts.apiKey || '').trim();
  let primaryProvider = (opts.provider || 'auto').toLowerCase();
  if (customApiKey) {
    let p = primaryProvider;
    if (p === 'auto' || p === 'gemini') {
      if (/^(AIza|AQ)/i.test(customApiKey)) p = 'gemini';
      else if (/^gsk_/.test(customApiKey)) p = 'groq';
      else if (/^sk-or-/i.test(customApiKey)) p = 'openrouter';
      else if (/^nvapi-/i.test(customApiKey)) p = 'nvidia';
      else if (/^sk-ant-/i.test(customApiKey)) p = 'anthropic';
      else if (/^sk-/.test(customApiKey)) p = 'openai';
      else if (/^xai-/.test(customApiKey)) p = 'xai';
      else if (/^ds-/.test(customApiKey)) p = 'deepseek';
      else p = 'gemini';
    }
    primaryProvider = p;
    if (!map.has(p)) {
      map.set(p, customApiKey);
    }
  }

  // 4. Server environment variables
  if (!map.has('gemini') && process.env.GEMINI_API_KEY) {
    map.set('gemini', process.env.GEMINI_API_KEY.trim());
  }
  if (!map.has('groq') && process.env.GROQ_API_KEY) {
    map.set('groq', process.env.GROQ_API_KEY.trim());
  }
  if (!map.has('openai') && process.env.OPENAI_API_KEY) {
    map.set('openai', process.env.OPENAI_API_KEY.trim());
  }
  if (!map.has('anthropic') && process.env.ANTHROPIC_API_KEY) {
    map.set('anthropic', process.env.ANTHROPIC_API_KEY.trim());
  }
  if (!map.has('openrouter') && process.env.OPENROUTER_API_KEY) {
    map.set('openrouter', process.env.OPENROUTER_API_KEY.trim());
  }
  if (!map.has('nvidia') && process.env.NVIDIA_API_KEY) {
    map.set('nvidia', process.env.NVIDIA_API_KEY.trim());
  }
  if (!map.has('deepseek') && process.env.DEEPSEEK_API_KEY) {
    map.set('deepseek', process.env.DEEPSEEK_API_KEY.trim());
  }
  if (!map.has('xai') && process.env.XAI_API_KEY) {
    map.set('xai', process.env.XAI_API_KEY.trim());
  }

  const isAutoSingle = map.size === 1 && (!opts.provider || opts.provider.toLowerCase() === 'auto');

  return Array.from(map.entries()).map(([provider, apiKey]) => {
    const isPrimary = provider === primaryProvider || isAutoSingle;
    return {
      provider,
      apiKey,
      baseUrl: isPrimary ? (opts as any).baseUrl : undefined,
      model: isPrimary ? (opts as any).model : undefined,
    };
  });
}

/**
 * Task Specialization for Evaluation (Grading): Needs high reasoning first.
 * If 1 key total -> route to that 1 provider.
 * If multiple keys -> gemini -> openai -> anthropic -> openrouter -> groq -> nvidia
 */
export function prioritizeForEvaluation(candidates: ProviderCandidate[]): ProviderCandidate[] {
  if (candidates.length <= 1) return candidates;
  const EVAL_ORDER = ['gemini', 'openai', 'anthropic', 'openrouter', 'groq', 'nvidia', 'deepseek', 'xai'];
  return [...candidates].sort((a, b) => {
    const idxA = EVAL_ORDER.indexOf(a.provider);
    const idxB = EVAL_ORDER.indexOf(b.provider);
    const scoreA = idxA === -1 ? 99 : idxA;
    const scoreB = idxB === -1 ? 99 : idxB;
    return scoreA - scoreB;
  });
}

let generationCounter = 0;

/**
 * Task Specialization for Question Generation: Needs high throughput.
 * If 1 key total -> route to that 1 provider.
 * If multiple keys -> round-robin / shuffle available providers to distribute quota evenly.
 */
export function prioritizeForGeneration(candidates: ProviderCandidate[]): ProviderCandidate[] {
  if (candidates.length <= 1) return candidates;
  const n = candidates.length;
  const startIdx = generationCounter % n;
  generationCounter = (generationCounter + 1) % 10000;
  return [...candidates.slice(startIdx), ...candidates.slice(0, startIdx)];
}
