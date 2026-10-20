import {
  ModelProvider,
  GENERATION_MODELS,
  EVALUATION_MODELS,
  STT_MODEL,
  PROVIDER_ORDER,
} from '../config/models';
import { getStoredProvider, getStoredApiKey } from './apiKey';

export interface ProviderErrorDetail {
  provider: ModelProvider;
  error: string;
  statusCode?: number;
}

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
  } catch {
    // Ignore storage errors
  }
}

export function clearProviderRateLimit(provider: ModelProvider): void {
  try {
    localStorage.removeItem(`${RATE_LIMIT_PREFIX}${provider}`);
    window.dispatchEvent(new CustomEvent('toefl_rate_limits_changed'));
  } catch {
    // Ignore
  }
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

export interface AiExecutionResult<T> {
  result: T;
  providerUsed: ModelProvider;
  modelUsed: string;
}

export async function executeWithFallbackChain<T>(
  purpose: 'generation' | 'evaluation',
  action: (provider: ModelProvider, apiKey: string, model: string) => Promise<T>
): Promise<AiExecutionResult<T>> {
  const configured = getUserConfiguredProviders();
  if (configured.length === 0) {
    throw new Error('No API keys configured. Please paste your Gemini, Groq, or OpenRouter key in Settings.');
  }

  // Check if user specified a manual provider override in settings
  const manualProvider = getStoredProvider();
  let providerList: ModelProvider[] = [];

  if (manualProvider !== 'auto' && configured.includes(manualProvider as ModelProvider)) {
    // Prioritize manual provider, then others as backup
    providerList = [manualProvider as ModelProvider, ...configured.filter((p) => p !== manualProvider)];
  } else {
    // Default: ordered chain (Gemini -> Groq -> OpenRouter)
    providerList = [...configured];
  }

  const failures: ProviderErrorDetail[] = [];

  for (const provider of providerList) {
    // Check if provider is currently rate-limited
    const rateLimitedUntil = getProviderRateLimit(provider);
    if (rateLimitedUntil && Date.now() < rateLimitedUntil) {
      const waitSec = Math.ceil((rateLimitedUntil - Date.now()) / 1000);
      failures.push({
        provider,
        error: `Rate-limited (${waitSec}s remaining)`,
        statusCode: 429,
      });
      continue;
    }

    const apiKey = (localStorage.getItem(`toefl_key_${provider}`) || getStoredApiKey(provider) || '').trim();
    if (!apiKey) continue;

    const models = purpose === 'generation' ? GENERATION_MODELS[provider] : EVALUATION_MODELS[provider];
    const model = models[0] || (provider === 'gemini' ? 'gemini-2.5-flash-lite' : 'llama-3.3-70b-versatile');

    // Try up to 2 retries with exponential backoff for this provider
    let attempt = 0;
    const maxRetries = 2;
    let providerSucceeded = false;
    let finalResult: T | undefined;

    while (attempt <= maxRetries && !providerSucceeded) {
      try {
        finalResult = await action(provider, apiKey, model);
        providerSucceeded = true;
        clearProviderRateLimit(provider);
        return {
          result: finalResult,
          providerUsed: provider,
          modelUsed: model,
        };
      } catch (err: any) {
        attempt++;
        const msg = String(err?.message || err || 'Unknown error');
        const status = err?.status || (msg.includes('429') ? 429 : msg.includes('50') ? 500 : 0);

        // Handle Rate limits or Quota exhausted
        if (status === 429 || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('rate limit')) {
          setProviderRateLimit(provider, 60);
          failures.push({ provider, error: 'Rate limit or quota exceeded (429)', statusCode: 429 });
          break; // Stop retrying this provider and move to the next in chain
        }

        // On transient error (5xx or timeout), wait with exponential backoff if retries left
        if (attempt <= maxRetries && (status >= 500 || msg.includes('timeout') || msg.includes('fetch'))) {
          const backoffMs = attempt * 500;
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        // Non-retryable error (e.g. 401 invalid key or schema rejection)
        failures.push({ provider, error: msg, statusCode: status });
        break;
      }
    }
  }

  // All providers in chain failed
  const details = failures.map((f) => `${f.provider}: ${f.error}`).join('; ');
  throw new Error(`All configured AI providers failed: ${details}`);
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
  const primaryProvider: ModelProvider | 'none' = configured.length > 0 ? configured[0] : 'none';

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
      model: primaryProvider !== 'none' ? GENERATION_MODELS[primaryProvider][0] : 'None (Curated Fallback)',
      status: primaryProvider === 'none' ? 'not-configured' : rateLimits[primaryProvider] ? 'rate-limited' : 'active',
    },
    evaluation: {
      provider: primaryProvider,
      model: primaryProvider !== 'none' ? EVALUATION_MODELS[primaryProvider][0] : 'None',
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
