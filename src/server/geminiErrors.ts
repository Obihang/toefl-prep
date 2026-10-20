export function getStatus(err: any): number {
  if (typeof err?.status === 'number') return err.status;
  if (typeof err?.statusCode === 'number') return err.statusCode;
  if (typeof err?.error?.code === 'number') return err.error.code;
  if (err?.message) {
    if (typeof err.message === 'object' && typeof err.message.error?.code === 'number') {
      return err.message.error.code;
    }
    if (typeof err.message === 'string') {
      try {
        const parsed = JSON.parse(err.message);
        if (typeof parsed?.error?.code === 'number') return parsed.error.code;
      } catch {
        const jsonMatch = err.message.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (typeof parsed?.error?.code === 'number') return parsed.error.code;
          } catch {
            // Ignore
          }
        }
      }
    }
  }
  return 0;
}

export function isKeyError(err: any): boolean {
  const status = getStatus(err);
  
  // Extract message safely to check
  let msg = '';
  if (typeof err?.message === 'string') {
    msg = err.message.toLowerCase();
  } else if (typeof err?.message === 'object' && err.message?.error?.message) {
    msg = String(err.message.error.message).toLowerCase();
  } else if (err?.error?.message) {
    msg = String(err.error.message).toLowerCase();
  } else if (err?.message) {
    msg = String(err.message).toLowerCase();
  }

  // Key errors are 401/403, and 400 only when the message contains API_KEY_INVALID or "API key not valid"
  if (status === 401 || status === 403) return true;
  if (status === 400 && (msg.includes('api_key_invalid') || msg.includes('api key not valid'))) {
    return true;
  }

  // Only if no status is found, fall back to checking text (never match bare numbers like "400")
  if (!status) {
    if (
      msg.includes('api_key_invalid') ||
      msg.includes('api key not valid') ||
      msg.includes('invalid api key') ||
      msg.includes('permission denied') ||
      msg.includes('unauthenticated')
    ) {
      return true;
    }
  }

  return false;
}

export function isTransientError(err: any): boolean {
  const status = getStatus(err);
  // Transient are 429/500/502/503/504/404
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504 || status === 404) return true;

  // Only if no status is found, fall back to checking text such as "UNAVAILABLE", "RESOURCE_EXHAUSTED", "quota"
  if (!status) {
    let msg = '';
    if (typeof err?.message === 'string') {
      msg = err.message.toLowerCase();
    } else if (err?.message) {
      msg = String(err.message).toLowerCase();
    }
    if (
      msg.includes('unavailable') ||
      msg.includes('resource_exhausted') ||
      msg.includes('quota') ||
      msg.includes('overloaded') ||
      msg.includes('not found') ||
      msg.includes('no longer available')
    ) {
      return true;
    }
  }

  return false;
}

export function isQuotaExhaustedError(err: any): boolean {
  const status = getStatus(err);
  if (status === 429) return true;
  let msg = '';
  if (typeof err === 'string') msg = err;
  else if (typeof err?.message === 'string') msg = err.message;
  else if (err?.error?.message) msg = String(err.error.message);
  else msg = String(err || '');
  const lower = msg.toLowerCase();
  return (
    lower.includes('429') ||
    lower.includes('quota') ||
    lower.includes('resource_exhausted') ||
    lower.includes('rate_limit') ||
    lower.includes('generativelanguage.googleapis.com/generate_content_free_tier_requests')
  );
}

export function redactKey(text: string): string {
  if (!text) return text;
  return text
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, '[REDACTED]')
    .replace(/AQ\.[0-9A-Za-z_.-]{10,}/g, '[REDACTED]')
    .replace(/gsk_[0-9A-Za-z_-]{10,}/g, '[REDACTED]')
    .replace(/nvapi-[0-9A-Za-z_-]{10,}/g, '[REDACTED]')
    .replace(/sk-or-[0-9A-Za-z_.-]{10,}/g, '[REDACTED]')
    .replace(/sk-[0-9A-Za-z_-]{10,}/g, '[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]{8,}=*/gi, 'Bearer [REDACTED]');
}

export function redactSensitiveInfo(errorOrObj: any): any {
  if (errorOrObj == null) return errorOrObj;

  if (typeof errorOrObj === 'string') {
    return redactKey(errorOrObj)
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]{8,}=*/gi, 'Bearer [REDACTED]')
      .replace(/([?&](?:key|api_key|token)=)[^&\s"']+/gi, '$1[REDACTED]')
      .replace(/(?:x-api-key|x-gemini-api-key|x-groq-key|apiKey|api_key|token|authorization|secret)\s*[:=]\s*["']?[^"'\s,;{}]+["']?/gi, (match) => {
        const prefix = match.split(/[:=]/)[0];
        return `${prefix}: [REDACTED]`;
      });
  }

  if (errorOrObj instanceof Error) {
    const copy = new Error(redactSensitiveInfo(errorOrObj.message));
    if (errorOrObj.stack) {
      copy.stack = redactSensitiveInfo(errorOrObj.stack);
    }
    return copy;
  }

  if (typeof errorOrObj === 'object') {
    try {
      const str = JSON.stringify(errorOrObj, (key, value) => {
        const lowerKey = key.toLowerCase();
        if (
          lowerKey === 'authorization' ||
          lowerKey === 'x-api-key' ||
          lowerKey === 'x-gemini-api-key' ||
          lowerKey === 'x-groq-key' ||
          lowerKey === 'apikey' ||
          lowerKey === 'api_key' ||
          lowerKey === 'token' ||
          lowerKey === 'secret'
        ) {
          return '[REDACTED]';
        }
        if (typeof value === 'string') {
          return redactSensitiveInfo(value);
        }
        return value;
      });
      return JSON.parse(str);
    } catch {
      return '[REDACTED_OBJECT]';
    }
  }

  return errorOrObj;
}

export function extractErrorMessage(err: any, explicitProvider?: string): string {
  if (!err) return 'Unknown error';
  let rawMsg = '';
  if (typeof err === 'string') {
    rawMsg = err;
  } else if (typeof err.message === 'string') {
    rawMsg = err.message;
  } else if (err.error?.message) {
    rawMsg = String(err.error.message);
  } else {
    rawMsg = String(err);
  }

  // Detect provider from original message or explicit argument BEFORE stripping nested JSON
  const originalLower = (rawMsg + ' ' + (err?.provider || '')).toLowerCase();
  const detectedProvider = (explicitProvider || '').toLowerCase() ||
    (originalLower.includes('openrouter') || originalLower.includes('sk-or-') ? 'openrouter' :
     originalLower.includes('groq') || originalLower.includes('gsk_') ? 'groq' :
     originalLower.includes('nvidia') || originalLower.includes('nvapi-') ? 'nvidia' :
     originalLower.includes('openai') ? 'openai' :
     originalLower.includes('gemini') || originalLower.includes('aiza') || originalLower.includes('generativelanguage') ? 'gemini' :
     '');

  // Extract nested JSON error message if present (e.g. from Google API or OpenRouter)
  try {
    const jsonMatch = rawMsg.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed?.error?.message) {
        rawMsg = parsed.error.message;
      }
    }
  } catch {}

  const lower = rawMsg.toLowerCase();
  const urlMatch = rawMsg.match(/https:\/\/console\.cloud\.google\.com\/[^\s"')]+/);
  if (lower.includes('not enabled') || lower.includes('api has not been used') || lower.includes('service_disabled')) {
    const directLink = urlMatch ? ` Enable it directly: ${urlMatch[0]}` : '';
    rawMsg = `Generative Language API is not enabled for this key's project.${directLink} Or in Google AI Studio (aistudio.google.com/apikey), click "Create API key in new project".`;
  } else if (lower.includes('billing') || lower.includes('billable')) {
    rawMsg = 'Billing account issue: The model requested requires paid billing. Switch to gemini-3.8-flash in Settings for free-tier practice, or link a billing account.';
  } else if (lower.includes('caller does not have permission') || lower.includes('requests from referer') || lower.includes('requests from this ip')) {
    rawMsg = 'Key restriction issue: Remove HTTP referrer or IP restrictions on your key in Google Cloud Console.';
  } else if (isKeyError(err) || lower.includes('api_key_invalid') || lower.includes('api key not valid') || lower.includes('invalid api key') || lower.includes('access_token_type_unsupported')) {
    // Preserve key error
  } else if (lower.includes('quota or rate limit') || lower.includes('fallback models were attempted')) {
    // Preserve custom healing error messages with explicit provider recovery instructions
  } else if (lower.includes('429') || lower.includes('quota') || lower.includes('resource_exhausted') || lower.includes('rate limit')) {
    if (detectedProvider === 'openrouter') {
      if (lower.includes('insufficient_quota') || lower.includes('credit') || lower.includes('balance') || lower.includes('payment_required') || lower.includes('402')) {
        rawMsg = "Your OpenRouter credits are exhausted. Check your balance at https://openrouter.ai/credits or connect another key.";
      } else {
        rawMsg = "OpenRouter rate limit reached. Please wait a few moments or try another model in Settings.";
      }
    } else if (detectedProvider === 'groq') {
      rawMsg = "Your Groq per-minute rate limit is reached. Please wait a moment for it to reset or connect another key.";
    } else if (detectedProvider === 'nvidia') {
      rawMsg = "Your NVIDIA rate limit is reached. Please wait a moment for it to reset or connect another key.";
    } else if (detectedProvider === 'gemini') {
      if (lower.includes('resource_exhausted') || lower.includes('generate_content_free_tier_requests') || lower.includes('daily')) {
        rawMsg = "Gemini free daily AI quota is used up. It resets at midnight Pacific time (PT). Try using OpenRouter (https://openrouter.ai/keys) or Groq (https://console.groq.com/keys) for free quota.";
      } else {
        rawMsg = "Gemini per-minute rate limit reached (15 requests/min). Please wait 15-30 seconds.";
      }
    } else {
      rawMsg = "API rate limit reached. Please wait a moment for it to reset or connect another key.";
    }
  } else if (lower.includes('503') || lower.includes('unavailable') || lower.includes('overloaded') || lower.includes('model busy')) {
    rawMsg = 'AI models are temporarily busy. Please try again in a moment.';
  } else if (lower.includes('no longer available') || lower.includes('not supported') || lower.includes('not found')) {
    rawMsg = 'AI model temporarily unavailable. Please try again in a moment.';
  }

  return redactSensitiveInfo(rawMsg);
}
