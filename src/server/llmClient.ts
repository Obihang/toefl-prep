export interface LlmCallOptions {
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
  responseJson?: boolean;
}

export function resolveProviderDefaults(provider: string = 'gemini', baseUrl?: string, model?: string) {
  let resolvedBaseUrl = baseUrl?.trim();
  let resolvedModel = model?.trim();

  switch (provider) {
    case 'openai':
      resolvedBaseUrl = resolvedBaseUrl || 'https://api.openai.com/v1';
      resolvedModel = resolvedModel || 'gpt-4o-mini';
      break;
    case 'groq':
      resolvedBaseUrl = resolvedBaseUrl || 'https://api.groq.com/openai/v1';
      resolvedModel = resolvedModel || 'llama-3.3-70b-versatile';
      break;
    case 'deepseek':
      resolvedBaseUrl = resolvedBaseUrl || 'https://api.deepseek.com/v1';
      resolvedModel = resolvedModel || 'deepseek-chat';
      break;
    case 'openrouter':
      resolvedBaseUrl = resolvedBaseUrl || 'https://openrouter.ai/api/v1';
      resolvedModel = resolvedModel || 'google/gemini-2.5-flash';
      break;
    case 'custom':
      resolvedBaseUrl = resolvedBaseUrl || 'http://localhost:11434/v1';
      resolvedModel = resolvedModel || 'llama3';
      break;
    case 'gemini':
    default:
      resolvedBaseUrl = resolvedBaseUrl || '';
      resolvedModel = resolvedModel || 'gemini-3.8-flash';
      break;
  }

  return { baseUrl: resolvedBaseUrl, model: resolvedModel };
}

export async function callOpenAiCompatibleChat(options: LlmCallOptions): Promise<{ text: string; modelUsed: string }> {
  const { provider = 'custom', apiKey, baseUrl, model, prompt, systemInstruction, temperature = 0.7, responseJson = true } = options;
  const resolved = resolveProviderDefaults(provider, baseUrl, model);

  if (!resolved.baseUrl) {
    throw new Error(`Base URL is missing for provider ${provider}`);
  }

  const endpoint = `${resolved.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey && apiKey.trim()) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
  }

  if (endpoint.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = 'https://toeflprepstudio.com';
    headers['X-Title'] = 'TOEFL Prep Studio';
  }

  const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
  if (systemInstruction && systemInstruction.trim()) {
    messages.push({ role: 'system', content: systemInstruction.trim() });
  }
  messages.push({ role: 'user', content: prompt });

  const payload: any = {
    model: resolved.model,
    messages,
    temperature,
  };

  if (responseJson) {
    payload.response_format = { type: 'json_object' };
  }

  let res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  // If response_format json_object fails (some models do not support it), retry without it
  if (!res.ok && responseJson) {
    const errorText = await res.text();
    if (res.status === 400 || errorText.toLowerCase().includes('response_format') || errorText.toLowerCase().includes('json_object')) {
      delete payload.response_format;
      res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
    } else {
      let parsedErr = errorText;
      try {
        const j = JSON.parse(errorText);
        parsedErr = j.error?.message || j.message || errorText;
      } catch {}
      throw new Error(`${provider.toUpperCase()} API Error (${res.status}): ${parsedErr}`);
    }
  }

  if (!res.ok) {
    const errorText = await res.text();
    let parsedErr = errorText;
    try {
      const j = JSON.parse(errorText);
      parsedErr = j.error?.message || j.message || errorText;
    } catch {}
    throw new Error(`${provider.toUpperCase()} API Error (${res.status}): ${parsedErr}`);
  }

  const json: any = await res.json();
  const choice = json.choices?.[0];
  const text = choice?.message?.content || choice?.text || '';

  if (!text || !text.trim()) {
    throw new Error(`${provider.toUpperCase()} returned an empty response.`);
  }

  return { text, modelUsed: `${provider}:${resolved.model}` };
}

export async function testOpenAiCompatible(options: {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}): Promise<{ success: true; message: string; model: string }> {
  const { provider, apiKey, baseUrl, model } = options;
  const resolved = resolveProviderDefaults(provider, baseUrl, model);

  const endpoint = `${resolved.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey && apiKey.trim()) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
  }

  if (endpoint.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = 'https://toeflprepstudio.com';
    headers['X-Title'] = 'TOEFL Prep Studio';
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: resolved.model,
      messages: [{ role: 'user', content: 'Say OK' }],
      max_tokens: 5,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    let parsedErr = errorText;
    try {
      const j = JSON.parse(errorText);
      parsedErr = j.error?.message || j.message || errorText;
    } catch {}
    throw new Error(`${provider.toUpperCase()} Connection Error (${res.status}): ${parsedErr}`);
  }

  return {
    success: true,
    message: `Connected successfully to ${provider.toUpperCase()} (${resolved.model})`,
    model: `${provider}:${resolved.model}`,
  };
}
