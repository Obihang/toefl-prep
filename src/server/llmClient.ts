import { filterWhisperHallucinations } from '../utils/speakingMetrics.ts';

export type ModelPurpose = 'generation' | 'evaluation' | 'transcription' | 'tts';

export interface LlmCallOptions {
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  purpose?: ModelPurpose;
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
  responseJson?: boolean;
}

export function resolveProviderDefaults(
  provider: string = 'gemini',
  baseUrl?: string,
  model?: string,
  purpose: ModelPurpose = 'generation'
) {
  let resolvedBaseUrl = baseUrl?.trim();
  let resolvedModel = model?.trim();

  switch (provider.toLowerCase()) {
    case 'nvidia':
      resolvedBaseUrl = resolvedBaseUrl || 'https://integrate.api.nvidia.com/v1';
      resolvedModel = resolvedModel || 'meta/llama-3.1-8b-instruct';
      break;

    case 'groq':
      resolvedBaseUrl = resolvedBaseUrl || 'https://api.groq.com/openai/v1';
      if (purpose === 'tts') {
        resolvedModel = resolvedModel || 'playai-tts';
      } else if (purpose === 'transcription') {
        resolvedModel = resolvedModel || 'whisper-large-v3-turbo';
      } else {
        resolvedModel = resolvedModel || 'openai/gpt-oss-20b';
      }
      break;

    case 'openrouter':
      resolvedBaseUrl = resolvedBaseUrl || 'https://openrouter.ai/api/v1';
      if (purpose === 'tts') {
        resolvedModel = resolvedModel || 'openai/tts-1';
      } else if (purpose === 'transcription') {
        resolvedModel = resolvedModel || 'openai/whisper-large-v3';
      } else {
        resolvedModel = resolvedModel || 'meta-llama/llama-3.1-8b-instruct:free';
      }
      break;

    case 'openai':
      resolvedBaseUrl = resolvedBaseUrl || 'https://api.openai.com/v1';
      if (purpose === 'evaluation') {
        resolvedModel = resolvedModel || 'gpt-4o';
      } else if (purpose === 'transcription') {
        resolvedModel = resolvedModel || 'whisper-1';
      } else if (purpose === 'tts') {
        resolvedModel = resolvedModel || 'tts-1';
      } else {
        resolvedModel = resolvedModel || 'gpt-4o-mini';
      }
      break;

    case 'deepseek':
      resolvedBaseUrl = resolvedBaseUrl || 'https://api.deepseek.com/v1';
      resolvedModel = resolvedModel || 'deepseek-chat';
      break;

    case 'xai':
      resolvedBaseUrl = resolvedBaseUrl || 'https://api.x.ai/v1';
      resolvedModel = resolvedModel || 'grok-2-latest';
      break;

    case 'anthropic':
      resolvedBaseUrl = resolvedBaseUrl || 'https://api.anthropic.com/v1';
      resolvedModel = resolvedModel || (purpose === 'evaluation' ? 'claude-3-5-sonnet-latest' : 'claude-3-5-haiku-latest');
      break;

    case 'custom':
      resolvedBaseUrl = resolvedBaseUrl || 'http://localhost:11434/v1';
      resolvedModel = resolvedModel || 'llama3';
      break;

    case 'gemini':
    default:
      resolvedBaseUrl = resolvedBaseUrl || '';
      resolvedModel = resolvedModel || 'gemini-1.5-flash';
      break;
  }

  return { baseUrl: resolvedBaseUrl, model: resolvedModel };
}

export async function callOpenAiCompatibleChat(options: LlmCallOptions): Promise<{ text: string; modelUsed: string }> {
  const { provider = 'custom', apiKey, baseUrl, model, purpose = 'generation', prompt, systemInstruction, temperature = 0.7, responseJson = true } = options;
  const resolved = resolveProviderDefaults(provider, baseUrl, model, purpose);

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

// Native Speech Synthesis for OpenAI TTS
export async function callOpenAiTts(options: {
  apiKey: string;
  text: string;
  voiceName?: string;
}): Promise<{ audioBase64: string; mimeType: string; modelUsed: string }> {
  const { apiKey, text, voiceName = 'alloy' } = options;
  if (!apiKey || !apiKey.trim()) {
    throw new Error('OpenAI API key missing for TTS');
  }

  // Map TOEFL voice names to OpenAI natural voices (alloy, echo, fable, onyx, nova, shimmer)
  const lowerVoice = (voiceName || '').toLowerCase();
  let selectedVoice = 'alloy';
  if (lowerVoice.includes('female') || ['kore', 'aoede', 'despina', 'leda', 'sarah', 'emily'].some(v => lowerVoice.includes(v))) {
    selectedVoice = 'nova';
  } else if (lowerVoice.includes('male') || ['fenrir', 'iapetus', 'orus', 'puck', 'lee', 'john'].some(v => lowerVoice.includes(v))) {
    selectedVoice = 'onyx';
  } else if (['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'].includes(lowerVoice)) {
    selectedVoice = lowerVoice;
  }

  const endpoint = 'https://api.openai.com/v1/audio/speech';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice: selectedVoice,
      response_format: 'mp3',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI TTS Error (${res.status}): ${err}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const audioBase64 = Buffer.from(arrayBuffer).toString('base64');
  return {
    audioBase64,
    mimeType: 'audio/mpeg',
    modelUsed: `openai:tts-1 (${selectedVoice})`,
  };
}

// Native Speech Synthesis for OpenRouter TTS (/api/v1/audio/speech)
export async function callOpenRouterTts(options: {
  apiKey: string;
  text: string;
  voiceName?: string;
  model?: string;
}): Promise<{ audioBase64: string; mimeType: string; modelUsed: string }> {
  const { apiKey, text, voiceName = 'alloy', model = 'openai/tts-1' } = options;
  if (!apiKey || !apiKey.trim()) {
    throw new Error('OpenRouter API key missing for TTS');
  }

  const lowerVoice = (voiceName || '').toLowerCase();
  let selectedVoice = 'alloy';
  if (lowerVoice.includes('female') || ['kore', 'aoede', 'despina', 'leda', 'sarah', 'emily'].some(v => lowerVoice.includes(v))) {
    selectedVoice = 'nova';
  } else if (lowerVoice.includes('male') || ['fenrir', 'iapetus', 'orus', 'puck', 'lee', 'john'].some(v => lowerVoice.includes(v))) {
    selectedVoice = 'onyx';
  } else if (['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'].includes(lowerVoice)) {
    selectedVoice = lowerVoice;
  }

  const ttsModel = model || 'openai/tts-1';
  const endpoint = 'https://openrouter.ai/api/v1/audio/speech';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://toeflprepstudio.com',
      'X-Title': 'TOEFL Prep Studio',
    },
    body: JSON.stringify({
      model: ttsModel,
      input: text,
      voice: selectedVoice,
      response_format: 'mp3',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter TTS Error (${res.status}): ${err}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const audioBase64 = Buffer.from(arrayBuffer).toString('base64');
  return {
    audioBase64,
    mimeType: 'audio/mpeg',
    modelUsed: `openrouter:${ttsModel} (${selectedVoice})`,
  };
}

// Native Audio Transcription for Groq / OpenRouter / OpenAI Whisper
export async function callWhisperTranscription(options: {
  provider: 'groq' | 'openai' | 'openrouter';
  apiKey: string;
  audioBase64: string;
  mimeType?: string;
  sttModel?: string;
  prompt?: string;
}): Promise<{ transcript: string; modelUsed: string }> {
  const { provider, apiKey, audioBase64, mimeType = 'audio/webm', sttModel, prompt } = options;
  if (!apiKey || !apiKey.trim()) {
    throw new Error(`${provider.toUpperCase()} API key missing for transcription`);
  }

  const endpoint = provider === 'groq'
    ? 'https://api.groq.com/openai/v1/audio/transcriptions'
    : provider === 'openrouter'
    ? 'https://openrouter.ai/api/v1/audio/transcriptions'
    : 'https://api.openai.com/v1/audio/transcriptions';

  let model = (sttModel || '').trim();
  if (!model && provider === 'groq') {
    try {
      const { getRoleModels } = await import('./modelRoles.ts');
      const roles = await getRoleModels('groq', apiKey);
      model = roles.stt[0] || 'whisper-large-v3-turbo';
    } catch {
      model = 'whisper-large-v3-turbo';
    }
  }
  if (!model) {
    model = provider === 'groq' ? 'whisper-large-v3-turbo'
      : provider === 'openrouter' ? 'openai/whisper-large-v3'
      : 'whisper-1';
  }

  const buffer = Buffer.from(audioBase64, 'base64');
  const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('webm') ? 'webm' : mimeType.includes('mp4') ? 'm4a' : mimeType.includes('wav') ? 'wav' : 'mp3';
  const fileBlob = new Blob([buffer], { type: mimeType });

  const formData = new FormData();
  formData.append('file', fileBlob, `speech.${ext}`);
  formData.append('model', model);
  formData.append('language', 'en');
  formData.append('temperature', '0');
  if (prompt && prompt.trim()) {
    formData.append('prompt', prompt.trim());
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey.trim()}`,
  };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://toeflprepstudio.com';
    headers['X-Title'] = 'TOEFL Prep Studio';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: formData,
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`${provider.toUpperCase()} Whisper Error (${res.status}): ${errText}`);
    }

    const data: any = await res.json();
    const rawTranscript = data.text || '';
    const { transcript } = filterWhisperHallucinations(rawTranscript);
    return { transcript, modelUsed: `${provider}:${model}` };
  } finally {
    clearTimeout(timer);
  }
}

export async function testOpenAiCompatible(options: {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}): Promise<{ success: true; message: string; model: string; provider: string; providerName: string }> {
  const { provider, apiKey, baseUrl, model } = options;
  const resolved = resolveProviderDefaults(provider, baseUrl, model, 'generation');

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
    const errObj = new Error(`${provider.toUpperCase()} Connection Error (${res.status}): ${parsedErr}`);
    (errObj as any).status = res.status;
    throw errObj;
  }

  const pName = provider === 'groq' ? 'Groq'
    : provider === 'nvidia' ? 'NVIDIA NIM'
    : provider === 'openrouter' ? 'OpenRouter'
    : provider === 'openai' ? 'OpenAI'
    : provider === 'deepseek' ? 'DeepSeek'
    : provider === 'xai' ? 'xAI Grok'
    : provider.toUpperCase();

  return {
    success: true,
    provider,
    providerName: pName,
    message: `Connected successfully to ${pName}. Using ${resolved.model}.`,
    model: `${provider}:${resolved.model}`,
  };
}
