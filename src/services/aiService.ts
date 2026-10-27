import { GENERATION_MODELS, ModelProvider } from '../config/models';
import { getAllProviderKeys, getApiHeaders, getStoredApiKey, getStoredProvider } from '../utils/apiKey';
import { safeFetchJson } from '../utils/apiHelper';

export async function fetchDynamicModels(provider: ModelProvider, apiKey: string): Promise<string[]> {
  if (provider !== 'gemini') {
    return GENERATION_MODELS[provider] || [];
  }

  const trimmedKey = (apiKey || '').trim();
  if (!trimmedKey) {
    return GENERATION_MODELS.gemini;
  }

  try {
    const res = await fetch('/api/models', {
      headers: {
        'x-gemini-key': trimmedKey,
        'x-api-key': trimmedKey,
        'x-api-provider': 'gemini',
      },
    });
    if (!res.ok) {
      return GENERATION_MODELS.gemini;
    }
    const json = await res.json();
    if (json && Array.isArray(json.models) && json.models.length > 0) {
      return json.models;
    }
  } catch {
    // Fallback to static configured Gemini models
  }

  return GENERATION_MODELS.gemini;
}

export async function callBackendGenerate(
  taskType: string,
  level: string,
  topic: string,
  promptData?: any,
  extraOptions?: Record<string, any>
): Promise<any> {
  const provider = getStoredProvider();
  const apiKey = getStoredApiKey(provider);
  const providerKeys = getAllProviderKeys();

  const options = {
    provider,
    apiKey,
    providerKeys,
    availableKeys: providerKeys,
    ...(extraOptions || {}),
  };

  return safeFetchJson('/api/generate-task', {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify({
      taskType,
      level,
      topic,
      promptData,
      provider,
      apiKey,
      providerKeys,
      availableKeys: providerKeys,
      options,
    }),
  });
}

export async function evaluateResponse(
  taskType: string,
  promptData: any,
  studentResponse: any,
  extraOptions?: Record<string, any>
): Promise<any> {
  const provider = getStoredProvider();
  const apiKey = getStoredApiKey(provider);
  const providerKeys = getAllProviderKeys();

  const options = {
    provider,
    apiKey,
    providerKeys,
    availableKeys: providerKeys,
    ...(extraOptions || {}),
  };

  return safeFetchJson('/api/evaluate-response', {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify({
      taskType,
      promptData,
      studentResponse,
      provider,
      apiKey,
      providerKeys,
      availableKeys: providerKeys,
      options,
    }),
  });
}
