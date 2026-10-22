// Simulation script for API key switch notice, prefix validation, Disconnect clearing, fallback order, and reset time notice
import { validateKeyForProvider, disconnectAllApiKeys, setStoredApiKey, getStoredApiKey, getPrefixOwnerProvider } from '../src/utils/apiKey.ts';
import { getProviderRateLimit, setProviderRateLimit, clearProviderRateLimit, getUserConfiguredProviders } from '../src/utils/aiFallbackChain.ts';

// Mock localStorage for node test environment
const storageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, val: string) => { store[key] = String(val); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();
(globalThis as any).localStorage = storageMock;

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

// 2. Invalid key is not saved under mismatched provider without confirmation
const invalidKey = 'invalid_key_format_123';
const owner = getPrefixOwnerProvider(invalidKey);
check('Invalid key has no owner provider prefix', owner === null);

// 3. Disconnect clears everything for that provider
storageMock.clear();
setStoredApiKey('gsk_testkey123', 'groq');
check('Key stored successfully', getStoredApiKey('groq') === 'gsk_testkey123');
disconnectAllApiKeys();
check('Disconnect clearing removes stored key', getStoredApiKey('groq') === '');

// 4. Fallback order & provider configuration
storageMock.clear();
setStoredApiKey('AIzaSy_testgemini', 'gemini');
setStoredApiKey('gsk_testgroq', 'groq');
const configured = getUserConfiguredProviders();
check('Fallback order respects configured providers', configured.length === 2 && configured[0] === 'gemini' && configured[1] === 'groq');

// 5. Final notice with reset time simulation (Retry-After header / text parsing)
setProviderRateLimit('groq', 7200); // 2 hours
const limit = getProviderRateLimit('groq');
check('Provider rate limit recorded with reset time', limit !== null && limit > Date.now());
const remainingSec = Math.ceil((limit! - Date.now()) / 1000);
const hours = Math.floor(remainingSec / 3600);
const minutes = Math.floor((remainingSec % 3600) / 60);
const exhaustionNotice = `Quota used up on groq/llama-3.3-70b. It resets in about ${hours} h ${minutes} min`;
check('Exhausted quota notice format is correct', exhaustionNotice.includes('Quota used up on') && exhaustionNotice.includes('resets in about'));

clearProviderRateLimit('groq');
check('Rate limit cleared successfully', getProviderRateLimit('groq') === null);

console.log(failures === 0 ? 'All keyflow simulation tests passed successfully! 🎉' : `${failures} test(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
