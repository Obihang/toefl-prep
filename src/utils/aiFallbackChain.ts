import {
  ModelProvider,
  GENERATION_MODELS,
  EVALUATION_MODELS,
  STT_MODEL,
  PROVIDER_ORDER,
} from '../config/models';
import { getStoredProvider, getStoredApiKey } from './apiKey';

const RATE_LIMIT_PREFIX = 'toefl_ratelimit_until_';

export function getProviderRateLimit(provider: ModelProvider): number | null {
  try {
    const raw = localStorage.getItem(`${RATE_LIMIT_PREFIX}${provider}`);
    if (!raw) return null;
    const until = parseInt(raw, 10);
    if (isNaN(until) || Date.now() >= until) {
      localStorage.removeItem(`${RATE_LIMIT_PREFIX}${provider}`);
      return null;
    }
    return until;
  } catch {
    return null;
  }
}

export function setProviderRateLimit(provider: ModelProvider, durationSeconds: number = 60): void {
  try {
    const until = Date.now() + durationSeconds * 1000;
    localStorage.setItem(`${RATE_LIMIT_PREFIX}${provider}`, until.toString());
    window.dispatchEvent(new CustomEvent('toefl_rate_limits_changed'));
  } catch {}
}

export function clearProviderRateLimit(provider: ModelProvider): void {
  try {
    localStorage.removeItem(`${RATE_LIMIT_PREFIX}${provider}`);
    window.dispatchEvent(new CustomEvent('toefl_rate_limits_changed'));
  } catch {}
}

export function getUserConfiguredProviders(): ModelProvider[] {
  const result: ModelProvider[] = [];
  for (const p of PROVIDER_ORDER) {
    const key = (localStorage.getItem(`toefl_key_${p}`) || getStoredApiKey(p) || '').trim();
    if (key) {
      result.push(p);
    }
  }
  return result;
}

export interface AiStatusInfo {
  generation: { provider: string; model: string; status: 'active' | 'rate-limited' | 'not-configured' };
  evaluation: { provider: string; model: string; status: 'active' | 'rate-limited' | 'not-configured' };
  stt: { provider: string; model: string; status: 'active' | 'not-configured' };
  tts: { provider: string; model: string; status: 'active' };
  rateLimits: Record<string, { until: number; remainingSeconds: number }>;
}

export function getAiStatusInfo(): AiStatusInfo {
  const configured = getUserConfiguredProviders();
  const primaryProvider: ModelProvider | 'none' = configured.length > 0 ? configured[0] : (getStoredApiKey('gemini') ? 'gemini' : 'none');

  const rateLimits: Record<string, { until: number; remainingSeconds: number }> = {};
  for (const p of PROVIDER_ORDER) {
    const until = getProviderRateLimit(p);
    if (until) {
      rateLimits[p] = {
        until,
        remainingSeconds: Math.ceil((until - Date.now()) / 1000),
      };
    }
  }

  const groqKey = (localStorage.getItem('toefl_key_groq') || '').trim();

  return {
    generation: {
      provider: primaryProvider,
      model: primaryProvider !== 'none' && GENERATION_MODELS[primaryProvider]?.[0] ? GENERATION_MODELS[primaryProvider][0] : 'Curated Fallback',
      status: primaryProvider === 'none' ? 'not-configured' : rateLimits[primaryProvider] ? 'rate-limited' : 'active',
    },
    evaluation: {
      provider: primaryProvider,
      model: primaryProvider !== 'none' && EVALUATION_MODELS[primaryProvider]?.[0] ? EVALUATION_MODELS[primaryProvider][0] : 'Curated Fallback',
      status: primaryProvider === 'none' ? 'not-configured' : rateLimits[primaryProvider] ? 'rate-limited' : 'active',
    },
    stt: {
      provider: groqKey ? 'Groq' : 'Browser Web Speech API',
      model: groqKey ? STT_MODEL : 'Native Browser',
      status: groqKey ? 'active' : 'not-configured',
    },
    tts: {
      provider: 'Microsoft Edge Neural TTS',
      model: 'en-US Neural (Jenny / Guy)',
      status: 'active',
    },
    rateLimits,
  };
}
