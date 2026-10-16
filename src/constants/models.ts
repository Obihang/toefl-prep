export const GENERATION_CHAIN = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-flash-latest',
];

export const EVALUATION_CHAIN = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-flash-latest',
];

export const TTS_CHAIN = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-flash-latest',
];

export const TRANSCRIBE_CHAIN = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-flash-latest',
];

export const MODELS = {
  GENERATION: GENERATION_CHAIN[0],
  EVALUATION: EVALUATION_CHAIN[0],
  TTS: TTS_CHAIN[0],
  TRANSCRIBE_PRIMARY: TRANSCRIBE_CHAIN[0],
  TRANSCRIBE_FALLBACK: TRANSCRIBE_CHAIN[1] || 'gemini-2.5-flash-lite',
  TRANSCRIBE_LAST_RESORT: 'gemini-flash-latest',
};

