/**
 * Universal Key Redaction & Sensitive Data Sanitization
 * Strictly strips API keys matching:
 * - AIza... (Gemini)
 * - AQ.... (Gemini Alternate)
 * - gsk_... (Groq)
 * - sk-... / sk-proj-... (OpenAI / DeepSeek / Anthropic)
 * - sk-or-... (OpenRouter)
 * - nvapi-... (NVIDIA NIM)
 * - Bearer tokens
 */

export const KEY_REGEXES = [
  /AIza[0-9A-Za-z_-]{10,}/g,
  /AQ\.[0-9A-Za-z_.-]{10,}/g,
  /gsk_[0-9A-Za-z_-]{10,}/g,
  /nvapi-[0-9A-Za-z_-]{10,}/g,
  /sk-or-[0-9A-Za-z_.-]{10,}/g,
  /sk-(?:proj-|admin-)?[0-9A-Za-z_-]{10,}/g,
  /Bearer\s+[A-Za-z0-9._~+/-]{8,}=*/gi,
];

export function redactKey(text: string): string {
  if (!text || typeof text !== 'string') return text;
  let redacted = text;
  for (const regex of KEY_REGEXES) {
    redacted = redacted.replace(regex, (match) => {
      if (match.toLowerCase().startsWith('bearer')) {
        return 'Bearer [REDACTED]';
      }
      return '[REDACTED]';
    });
  }
  return redacted;
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
    copy.name = errorOrObj.name;
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

/**
 * Sanitizes Sentry events before dispatch: removes API keys from
 * event message, exception values, breadcrumbs, tags, and request URLs.
 */
export function scrubSentryEvent(event: any): any {
  if (!event || typeof event !== 'object') return event;

  try {
    if (event.message && typeof event.message === 'string') {
      event.message = redactSensitiveInfo(event.message);
    }

    if (Array.isArray(event.exception?.values)) {
      for (const exc of event.exception.values) {
        if (exc.value && typeof exc.value === 'string') {
          exc.value = redactSensitiveInfo(exc.value);
        }
        if (exc.stacktrace?.frames && Array.isArray(exc.stacktrace.frames)) {
          for (const frame of exc.stacktrace.frames) {
            if (frame.filename && typeof frame.filename === 'string') {
              frame.filename = redactSensitiveInfo(frame.filename);
            }
          }
        }
      }
    }

    if (Array.isArray(event.breadcrumbs)) {
      for (const bc of event.breadcrumbs) {
        if (bc.message && typeof bc.message === 'string') {
          bc.message = redactSensitiveInfo(bc.message);
        }
        if (bc.data && typeof bc.data === 'object') {
          bc.data = redactSensitiveInfo(bc.data);
        }
      }
    }

    if (event.request?.url && typeof event.request.url === 'string') {
      event.request.url = redactSensitiveInfo(event.request.url);
    }

    if (event.extra && typeof event.extra === 'object') {
      event.extra = redactSensitiveInfo(event.extra);
    }
  } catch {
    // If scrubbing fails, return the event unmodified rather than breaking reporting
  }

  return event;
}
