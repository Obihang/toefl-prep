export const GENERATION_CHAIN = [
  'gemini-3.7-flash',
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-2.5-flash',
];

export const EVALUATION_CHAIN = [
  'gemini-3.7-flash',
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-2.5-flash',
];

export const TTS_CHAIN = [
  'gemini-3.8-flash-lite-tts',
  'gemini-3.8-flash-tts',
];

export const TRANSCRIBE_CHAIN = [
  'gemini-3.5-transcribe',
  'gemini-2.5-flash',
];

export const MODELS = {
  GENERATION: GENERATION_CHAIN[0],
  EVALUATION: EVALUATION_CHAIN[0],
  TTS: TTS_CHAIN[0],
  TRANSCRIBE_PRIMARY: TRANSCRIBE_CHAIN[0],
  TRANSCRIBE_FALLBACK: TRANSCRIBE_CHAIN[1] || 'gemini-2.5-flash',
  TRANSCRIBE_LAST_RESORT: 'gemini-3.8-flash',
};
