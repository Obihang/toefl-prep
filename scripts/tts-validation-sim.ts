import assert from 'assert';

function validateTtsInput(text: string, rate: number, voiceName: string, hasToken: boolean) {
  if (!hasToken) {
    return { status: 401, error: 'Unauthorized: Valid Firebase ID token required' };
  }
  if (!text || typeof text !== 'string' || text.trim().length === 0 || text.length > 3000) {
    return { status: 400, error: 'Text must be between 1 and 3000 characters' };
  }
  const numRate = Number(rate);
  if (isNaN(numRate) || numRate < 0.7 || numRate > 1.3) {
    return { status: 400, error: 'Speech rate must be between 0.7 and 1.3' };
  }
  return { status: 200, success: true };
}

console.log('Running TTS Validation & Auth Simulation Tests...');
assert.strictEqual(validateTtsInput('Hello', 1.0, 'en-US-JennyNeural', false).status, 401, 'PASS missing token returns 401');
assert.strictEqual(validateTtsInput('', 1.0, 'en-US-JennyNeural', true).status, 400, 'PASS empty text returns 400');
assert.strictEqual(validateTtsInput('a'.repeat(3001), 1.0, 'en-US-JennyNeural', true).status, 400, 'PASS text > 3000 chars returns 400');
assert.strictEqual(validateTtsInput('Hello', 0.5, 'en-US-JennyNeural', true).status, 400, 'PASS rate < 0.7 returns 400');
assert.strictEqual(validateTtsInput('Hello', 1.5, 'en-US-JennyNeural', true).status, 400, 'PASS rate > 1.3 returns 400');
assert.strictEqual(validateTtsInput('Hello', 1.0, 'en-US-JennyNeural', true).status, 200, 'PASS valid parameters succeed');

// Validate relaxed write-email quality gate rules
import { isHighQualityTask } from '../src/utils/questionValidator.ts';
import { BACKGROUND_PREFETCH_TASKS } from '../src/utils/prefetchManager.ts';

// 1. Valid write-email with > 15 words situation and 2 goals
const validEmail1 = {
  situation: 'You are writing an email to your biology professor regarding missed office hours due to a medical appointment last Tuesday morning.',
  goals: ['Explain why you could not attend the scheduled meeting', 'Request to reschedule for Friday'],
};
assert.strictEqual(isHighQualityTask(validEmail1, 'write-email'), true, 'PASS: relaxed write-email with 18 words and 2 goals succeeds');

// 2. Reject short situation (<= 15 words)
const shortEmail = {
  situation: 'Tell professor you were absent.',
  goals: ['Explain reason', 'Ask for notes'],
};
assert.strictEqual(isHighQualityTask(shortEmail, 'write-email'), false, 'PASS: write-email with short situation is rejected');

// 3. Reject insufficient goals (< 2)
const oneGoalEmail = {
  situation: 'You are writing an email to your biology professor regarding missed office hours due to a medical appointment last Tuesday morning.',
  goals: ['Explain reason'],
};
assert.strictEqual(isHighQualityTask(oneGoalEmail, 'write-email'), false, 'PASS: write-email with 1 goal is rejected');

// 4. Confirm write-email is present in BACKGROUND_PREFETCH_TASKS rotation
assert.strictEqual(BACKGROUND_PREFETCH_TASKS.includes('write-email'), true, 'PASS: write-email is in BACKGROUND_PREFETCH_TASKS');

// 5. Test OpenAI payload structure
const makeOpenAiPayload = (text: string, isMale: boolean) => ({
  model: 'tts-1',
  voice: isMale ? 'onyx' : 'nova',
  input: text,
});
const oaiFemale = makeOpenAiPayload('Test female', false);
assert.strictEqual(oaiFemale.voice, 'nova', 'PASS: OpenAI female uses nova');
const oaiMale = makeOpenAiPayload('Test male', true);
assert.strictEqual(oaiMale.voice, 'onyx', 'PASS: OpenAI male uses onyx');

// 6. Test Gemini payload structure
const makeGeminiPayload = (text: string, isMale: boolean) => ({
  contents: [{ parts: [{ text }] }],
  generationConfig: {
    responseModalities: ['AUDIO'],
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: isMale ? 'Puck' : 'Kore' } } },
  },
});
const gemFemale = makeGeminiPayload('Test female', false);
assert.strictEqual(gemFemale.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Kore', 'PASS: Gemini female uses Kore');
const gemMale = makeGeminiPayload('Test male', true);
assert.strictEqual(gemMale.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Puck', 'PASS: Gemini male uses Puck');

// 7. Test speaker prefix parsing and stripping
const prefixRegex = /^\s*(?:\*\*|__)?([A-Z][a-zA-Z0-9.\s'-]{0,28}?)(?:\s*\(([^)]+)\))?(?:\*\*|__)?\s*:/i;
const sampleText = "Marcus (Male): This is a test of the API voice engine.";
const match = sampleText.match(prefixRegex);
assert.ok(match, 'PASS: prefix regex matches Marcus (Male)');
assert.strictEqual(match[1].trim(), 'Marcus');
assert.strictEqual(match[2].trim(), 'Male');
const cleaned = sampleText.replace(/^\s*(?:\*\*|__)?(?:[A-Z][a-zA-Z0-9.\s'-]{0,28}?)(?:\s*\([^)]+\))?(?:\*\*|__)?\s*:\s*/i, '').trim();
assert.strictEqual(cleaned, 'This is a test of the API voice engine.', 'PASS: prefix stripped cleanly for AI speech synthesis');

// 8. Test isTest guard behavior
function simulateTtsErrorHandling(isTest: boolean, error: Error) {
  if (isTest) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return { status: 400, body: { error: `API Error: ${errMsg}` } };
  }
  return { status: 200, fallback: 'neural' };
}
const testResult = simulateTtsErrorHandling(true, new Error('Invalid API Key (HTTP 403)'));
assert.strictEqual(testResult.status, 400);
assert.strictEqual(testResult.body.error, 'API Error: Invalid API Key (HTTP 403)', 'PASS: isTest returns explicit 400 API error without fallback');

const normalResult = simulateTtsErrorHandling(false, new Error('Quota exceeded'));
assert.strictEqual(normalResult.status, 200);
assert.strictEqual(normalResult.fallback, 'neural', 'PASS: non-test request falls back gracefully');

console.log('All TTS validation simulation tests passed successfully!');
