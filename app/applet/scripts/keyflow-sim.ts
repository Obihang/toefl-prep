// Simulation script for API key switch notice, prefix validation, Disconnect clearing, and fallback order
import { validateKeyForProvider, disconnectAllApiKeys, setStoredApiKey, getStoredApiKey } from '../src/utils/apiKey';
import { getProviderRateLimit, setProviderRateLimit, clearProviderRateLimit } from '../src/utils/aiFallbackChain';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + detail}`);
  if (!ok) failures++;
}

console.log('Running keyflow simulation tests...');

// 1. Switch notice & prefix validation
const mismatch = validateKeyForProvider('gsk_123456789012345678901234567890', 'gemini');
check(
  'Switch notice triggered when Groq key pasted under Gemini provider',
  !mismatch.valid && mismatch.mismatchedProvider === 'groq' && !!mismatch.message
);

const validGemini = validateKeyForProvider('AIzaSyD-123456789012345678901234567890', 'gemini');
check('Gemini AIza key valid for gemini', validGemini.valid);

const validGeminiAuth = validateKeyForProvider('AQ.Ab8RN6Inn3jqhzqyr1234567890', 'gemini');
check('Gemini AQ. auth key valid for gemini', validGeminiAuth.valid);

// 2. Disconnect clearing
setStoredApiKey('gsk_testkey123', 'groq');
check('Key stored successfully', getStoredApiKey('groq') === 'gsk_testkey123');
disconnectAllApiKeys();
check('Disconnect clearing removes stored key', getStoredApiKey('groq') === '');

// 3. Fallback order & rate limiting / reset time simulation
setProviderRateLimit('groq', 120);
const limit = getProviderRateLimit('groq');
check('Provider rate limit recorded with reset time', limit !== null && limit > Date.now());
clearProviderRateLimit('groq');
check('Rate limit cleared successfully', getProviderRateLimit('groq') === null);

console.log(failures === 0 ? 'All keyflow simulation tests passed successfully! 🎉' : `${failures} test(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
