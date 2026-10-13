export function getStoredApiKey(): string {
  return localStorage.getItem('toefl_gemini_api_key') || '';
}

export function setStoredApiKey(key: string): void {
  localStorage.setItem('toefl_gemini_api_key', key.trim());
}

export function getApiHeaders(): Record<string, string> {
  const key = getStoredApiKey();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (key.trim()) {
    headers['x-gemini-api-key'] = key.trim();
  }
  return headers;
}
