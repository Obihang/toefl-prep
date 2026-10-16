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
  // Transient are 429/500/503/404
  if (status === 429 || status === 500 || status === 503 || status === 404) return true;

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
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED]')
    .replace(/AQ\.[0-9A-Za-z_.-]{10,}/g, '[REDACTED]');
}

export function extractErrorMessage(err: any): string {
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

  // Extract nested JSON error message if present (e.g. from Google API)
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
    rawMsg = 'Billing account issue: The model requested requires paid billing. Switch to gemini-2.5-flash in Settings for free-tier practice, or link a billing account.';
  } else if (lower.includes('caller does not have permission') || lower.includes('requests from referer') || lower.includes('requests from this ip')) {
    rawMsg = 'Key restriction issue: Remove HTTP referrer or IP restrictions on your key in Google Cloud Console.';
  } else if (isKeyError(err) || lower.includes('api_key_invalid') || lower.includes('api key not valid') || lower.includes('invalid api key') || lower.includes('access_token_type_unsupported')) {
    rawMsg = 'Invalid API key. Please check your key in Dashboard > Settings & API Key.';
  } else if (lower.includes('429') || lower.includes('quota') || lower.includes('resource_exhausted')) {
    rawMsg = "Your key's free daily AI quota is used up. It usually resets at midnight Pacific time (PT).";
  } else if (lower.includes('503') || lower.includes('unavailable') || lower.includes('overloaded') || lower.includes('model busy')) {
    rawMsg = 'AI models are temporarily busy. Please try again in a moment.';
  } else if (lower.includes('no longer available') || lower.includes('not supported') || lower.includes('not found')) {
    rawMsg = 'AI model temporarily unavailable. Please try again in a moment.';
  }

  return redactKey(rawMsg);
}
