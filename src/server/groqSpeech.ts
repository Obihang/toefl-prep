import { FEMALE_VOICES, MALE_VOICES } from '../utils/voices.ts';

const GROQ_FEMALE_VOICES = ['autumn', 'diana', 'hannah'];
const GROQ_MALE_VOICES = ['austin', 'daniel', 'troy'];

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function mapToGroqVoice(voiceName?: string): { voice: string; isFemale: boolean } {
  const v = (voiceName || '').trim();
  const lower = v.toLowerCase();

  const isFemaleInList = FEMALE_VOICES.some((f) => f.toLowerCase() === lower);
  const isMaleInList = MALE_VOICES.some((m) => m.toLowerCase() === lower);

  let isFemale = true;
  if (isMaleInList) {
    isFemale = false;
  } else if (isFemaleInList) {
    isFemale = true;
  } else if (lower.includes('male') || lower.includes('puck') || lower.includes('man') || lower.includes('professor')) {
    isFemale = false;
  }

  const list = isFemale ? GROQ_FEMALE_VOICES : GROQ_MALE_VOICES;
  const index = hashCode(v || 'kore') % list.length;
  return { voice: list[index], isFemale };
}

export async function callGroqSpeech(options: {
  apiKey: string;
  text: string;
  voiceName?: string;
  model?: string;
}): Promise<{ audioBase64: string; mimeType: string; modelUsed: string }> {
  const { apiKey, text, voiceName, model = 'playai-tts' } = options;
  const cleanKey = (apiKey || '').trim();

  if (!cleanKey) {
    throw Object.assign(new Error('SPEECH_UNAVAILABLE'), { code: 'SPEECH_UNAVAILABLE' });
  }

  const { voice: initialVoice, isFemale } = mapToGroqVoice(voiceName);
  const fallbackVoice = isFemale ? GROQ_FEMALE_VOICES[0] : GROQ_MALE_VOICES[0];

  const doFetch = async (v: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);

    try {
      const res = await fetch('https://api.groq.com/openai/v1/audio/speech', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cleanKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: text,
          voice: v,
          response_format: 'wav',
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        const lowerErr = errText.toLowerCase();

        if (res.status === 403 || (res.status === 400 && lowerErr.includes('terms'))) {
          throw Object.assign(
            new Error("Groq voice model terms must be accepted once in the Groq console."),
            { code: 'TTS_TERMS_REQUIRED', status: res.status }
          );
        }

        if (res.status === 400 && lowerErr.includes('voice')) {
          throw Object.assign(new Error(`Invalid voice: ${v}`), { isVoiceError: true, status: 400 });
        }

        throw Object.assign(new Error('SPEECH_UNAVAILABLE'), { code: 'SPEECH_UNAVAILABLE', status: res.status });
      }

      const arrayBuffer = await res.arrayBuffer();
      const audioBase64 = Buffer.from(arrayBuffer).toString('base64');
      return {
        audioBase64,
        mimeType: 'audio/wav',
        modelUsed: `groq:${model} (${v})`,
      };
    } catch (err: any) {
      if (err?.code === 'TTS_TERMS_REQUIRED' || err?.isVoiceError) {
        throw err;
      }
      throw Object.assign(new Error('SPEECH_UNAVAILABLE'), { code: 'SPEECH_UNAVAILABLE' });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    return await doFetch(initialVoice);
  } catch (err: any) {
    if (err?.isVoiceError && initialVoice !== fallbackVoice) {
      return await doFetch(fallbackVoice);
    }
    throw err;
  }
}
