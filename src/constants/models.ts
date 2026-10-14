export const GENERATION_CHAIN = [
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-3.1-flash-lite',
  'gemini-3.1-pro-preview',
];

export const EVALUATION_CHAIN = [
  'gemini-flash-latest',
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.1-pro-preview',
];

export const TTS_CHAIN = [
  'gemini-3.8-flash-lite-tts',
  'gemini-3.8-flash-tts',
];

export const TRANSCRIBE_CHAIN = [
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-3.1-flash-lite',
];

export const MODELS = {
  GENERATION: GENERATION_CHAIN[0],
  EVALUATION: EVALUATION_CHAIN[0],
  TTS: TTS_CHAIN[0],
  TRANSCRIBE_PRIMARY: TRANSCRIBE_CHAIN[0],
  TRANSCRIBE_FALLBACK: TRANSCRIBE_CHAIN[1] || 'gemini-flash-latest',
  TRANSCRIBE_LAST_RESORT: 'gemini-3.8-flash',
};

