export function getStatus(err: any): number {
  if (typeof err?.status === 'number') return err.status;
  if (typeof err?.statusCode === 'number') return err.statusCode;
  if (err?.message) {
    try {
      const parsed = JSON.parse(err.message);
      if (parsed?.error?.code) return parsed.error.code;
    } catch {
      // Ignore
    }
  }
  return 0;
}

export function isKeyError(err: any): boolean {
  const status = getStatus(err);
  if (status === 401 || status === 403) return true;
  if (status === 400) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('api_key_invalid') || msg.includes('api key not valid')) {
      return true;
    }
  }
  const msg = (err?.message || '').toLowerCase();
  if (msg.includes('invalid api key') || msg.includes('api_key_invalid') ||
      msg.includes('permission denied') || msg.includes('unauthenticated') ||
      msg.includes('api key not valid')) {
    return true;
  }
  return false;
}

export function isTransientError(err: any): boolean {
  const status = getStatus(err);
  if (status === 429 || status === 500 || status === 503 || status === 404) return true;
  const msg = (err?.message || '').toLowerCase();
  if (msg.includes('unavailable') || msg.includes('resource_exhausted') ||
      msg.includes('quota') || msg.includes('overloaded')) {
    return true;
  }
  return false;
}

export function redactKey(text: string): string {
  if (!text) return text;
  return text.replace(/AIza[0-9A-Za-z_-]{35}/g, '[REDACTED]');
}
