import assert from 'assert';
import { redactKey, redactSensitiveInfo, scrubSentryEvent } from '../src/utils/redact.ts';

console.log('Running Key Redaction simulation tests...');

// 1. Redact Gemini keys
const geminiStr = 'Error: invalid key AIzaSyD3xAmPlEKey1234567890 in request';
const geminiRedacted = redactKey(geminiStr);
assert(!geminiRedacted.includes('AIzaSyD3xAmPlEKey1234567890'), 'Gemini key was not redacted');
assert(geminiRedacted.includes('[REDACTED]'), 'Redaction placeholder missing for Gemini');

// 2. Redact Groq keys
const groqStr = 'Unauthorized gsk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
const groqRedacted = redactKey(groqStr);
assert(!groqRedacted.includes('gsk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'), 'Groq key was not redacted');
assert(groqRedacted.includes('[REDACTED]'), 'Redaction placeholder missing for Groq');

// 3. Redact OpenAI / OpenRouter / NVIDIA keys
const multiStr = 'Keys: sk-proj-1234567890abcdef and sk-or-v1-9876543210fedcba and nvapi-abcdef1234567890';
const multiRedacted = redactKey(multiStr);
assert(!multiRedacted.includes('sk-proj-1234567890abcdef'), 'OpenAI proj key was not redacted');
assert(!multiRedacted.includes('sk-or-v1-9876543210fedcba'), 'OpenRouter key was not redacted');
assert(!multiRedacted.includes('nvapi-abcdef1234567890'), 'NVIDIA key was not redacted');

// 4. Redact URL query parameters
const urlStr = 'https://api.groq.com/v1/models?api_key=gsk_test1234567890&foo=bar';
const urlRedacted = redactSensitiveInfo(urlStr);
assert(!urlRedacted.includes('gsk_test1234567890'), 'URL query key was not redacted');

// 5. Redact Authorization Bearer token
const authStr = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdefghijk';
const authRedacted = redactSensitiveInfo(authStr);
assert(!authRedacted.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'), 'Bearer token was not redacted');

// 6. Redact Sentry event
const fakeEvent = {
  message: 'Failed with key AIzaSyD3xAmPlEKey1234567890',
  breadcrumbs: [
    {
      message: 'Calling https://api.openai.com/v1?key=sk-proj-secret123456',
      data: { key: 'gsk_supersecret12345' },
    },
  ],
  exception: {
    values: [
      {
        value: 'NetworkError when using nvapi-secretkey999999',
      },
    ],
  },
  request: {
    url: 'http://localhost:3000/api/test-key?key=AIzaSyD3xAmPlEKey1234567890',
  },
};

const scrubbed = scrubSentryEvent(fakeEvent);
assert(!scrubbed.message.includes('AIzaSyD3xAmPlEKey1234567890'), 'Sentry event message not scrubbed');
assert(!scrubbed.breadcrumbs[0].message.includes('sk-proj-secret123456'), 'Sentry breadcrumb message not scrubbed');
assert(!scrubbed.breadcrumbs[0].data.key.includes('gsk_supersecret12345'), 'Sentry breadcrumb data not scrubbed');
assert(!scrubbed.exception.values[0].value.includes('nvapi-secretkey999999'), 'Sentry exception not scrubbed');
assert(!scrubbed.request.url.includes('AIzaSyD3xAmPlEKey1234567890'), 'Sentry request URL not scrubbed');

console.log('✓ All Key Redaction simulation tests passed successfully!');
