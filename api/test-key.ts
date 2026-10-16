import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getApiConfig } from '../src/server/apiConfig.ts';
import { detectProviderFromKey } from '../src/utils/keyDetect.ts';
import { probeProvider } from '../src/server/providerProbe.ts';
import { handleTestApiKey } from '../src/server/geminiHandler.ts';
import { extractErrorMessage, isKeyError } from '../src/server/geminiErrors.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  try {
    const config = getApiConfig(req.headers, req.body);

    if (config.provider === 'auto') {
      const detected = detectProviderFromKey(config.apiKey);
      if (!detected.provider) {
        return res.status(400).json({
          success: false,
          error: detected.note || 'Unsupported or incomplete key format.',
          detected,
        });
      }
      config.provider = detected.provider;
    }

    if (config.provider === 'gemini' && config.apiKey) {
      const detected = detectProviderFromKey(config.apiKey);
      if (detected.provider && detected.provider !== 'gemini') {
        config.provider = detected.provider;
      } else if (/^sk-/.test(config.apiKey)) {
        config.provider = 'openai';
      }
    }

    if (config.provider === 'nvidia' || config.provider === 'groq' || config.provider === 'openrouter') {
      const probeResult = await probeProvider(config.provider, config.apiKey, config.model);
      return res.status(200).json(probeResult);
    }

    if (config.provider === 'gemini') {
      const apiKey = config.apiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({
          success: false,
          error: 'No API key provided. Add yours in Dashboard > Settings & API Key',
        });
      }
      const result = await handleTestApiKey(apiKey);
      return res.status(200).json({
        ...result,
        provider: 'gemini',
        providerName: 'Google Gemini',
      });
    }

    // Custom or fallback provider
    const result = await handleTestApiKey(config);
    return res.status(200).json(result);
  } catch (error: any) {
    const errMsg = extractErrorMessage(error);
    const rawStatus = typeof error?.status === 'number' ? error.status : 400;

    let httpStatus = 400;
    if (isKeyError(error) || rawStatus === 401 || rawStatus === 402 || rawStatus === 429) {
      httpStatus = isKeyError(error) ? 401 : rawStatus;
    } else if (rawStatus >= 500 && rawStatus <= 599) {
      httpStatus = 502;
    }

    return res.status(httpStatus).json({ success: false, error: errMsg });
  }
}
