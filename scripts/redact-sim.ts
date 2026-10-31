import assert from 'assert';
import { redactKey, redactSensitiveInfo, scrubSentryEvent } from '../src/utils/redact.ts';

console.log('Running Key Redaction simulation tests...');

// 1. Redact Gemini keys
const mockGemKey = 'AIza' + 'SyD3xAmPlEKey1234567890';
const geminiStr = `Error: invalid key ${mockGemKey} in request`;
const geminiRedacted = redactKey(geminiStr);
assert(!geminiRedacted.includes(mockGemKey), 'Gemini key was not redacted');
assert(geminiRedacted.includes('[REDACTED]'), 'Redaction placeholder missing for Gemini');

// 2. Redact Groq keys
const mockGroqKey = 'gsk_' + 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
const groqStr = `Unauthorized ${mockGroqKey}`;
const groqRedacted = redactKey(groqStr);
assert(!groqRedacted.includes(mockGroqKey), 'Groq key was not redacted');
assert(groqRedacted.includes('[REDACTED]'), 'Redaction placeholder missing for Groq');

// 3. Redact OpenAI / OpenRouter / NVIDIA keys
const mockProjKey = 'sk-proj-' + '1234567890abcdef';
const mockOrKey = 'sk-or-' + 'v1-9876543210fedcba';
const mockNvKey = 'nvapi-' + 'abcdef1234567890';
const multiStr = `Keys: ${mockProjKey} and ${mockOrKey} and ${mockNvKey}`;
const multiRedacted = redactKey(multiStr);
assert(!multiRedacted.includes(mockProjKey), 'OpenAI proj key was not redacted');
assert(!multiRedacted.includes(mockOrKey), 'OpenRouter key was not redacted');
assert(!multiRedacted.includes(mockNvKey), 'NVIDIA key was not redacted');

// 4. Redact URL query parameters
const urlStr = 'https://api.groq.com/v1/models?api_key=' + 'gsk_' + 'test1234567890&foo=bar';
const urlRedacted = redactSensitiveInfo(urlStr);
assert(!urlRedacted.includes('gsk_' + 'test1234567890'), 'URL query key was not redacted');

// 5. Redact Authorization Bearer token
const authStr = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdefghijk';
const authRedacted = redactSensitiveInfo(authStr);
assert(!authRedacted.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'), 'Bearer token was not redacted');

// 6. Redact Sentry event
const fakeEvent = {
  message: `Failed with key ${mockGemKey}`,
  breadcrumbs: [
    {
      message: 'Calling https://api.openai.com/v1?key=' + 'sk-proj-' + 'secret123456',
      data: { key: 'gsk_' + 'supersecret12345' },
    },
  ],
  exception: {
    values: [
      {
        value: 'NetworkError when using ' + 'nvapi-' + 'secretkey999999',
      },
    ],
  },
  request: {
    url: `http://localhost:3000/api/test-key?key=${mockGemKey}`,
  },
};

const scrubbed = scrubSentryEvent(fakeEvent);
assert(!scrubbed.message.includes(mockGemKey), 'Sentry event message not scrubbed');
assert(!scrubbed.breadcrumbs[0].message.includes('sk-proj-' + 'secret123456'), 'Sentry breadcrumb message not scrubbed');
assert(!scrubbed.breadcrumbs[0].data.key.includes('gsk_' + 'supersecret12345'), 'Sentry breadcrumb data not scrubbed');
assert(!scrubbed.exception.values[0].value.includes('nvapi-' + 'secretkey999999'), 'Sentry exception not scrubbed');
assert(!scrubbed.request.url.includes(mockGemKey), 'Sentry request URL not scrubbed');

// 7. Mock SentryNode proof: Error containing both Gemini and Groq keys is reported to Sentry without them
const geminiKeySample = 'AIza' + 'SyC98765432109876543210';
const groqKeySample = 'gsk_' + 'Z1X2C3V4B5N6M7L8K9J0H1G2';
const rawErrorWithBothKeys = new Error(
  `Provider failover from Gemini key ${geminiKeySample} to Groq key ${groqKeySample} failed: 401 Unauthorized`
);
rawErrorWithBothKeys.stack = `Error: Provider failover from Gemini key ${geminiKeySample} to Groq key ${groqKeySample}\n    at processRequest (/app/server.ts:42:15)`;

const capturedReports: any[] = [];
const mockSentryNode = {
  beforeSend: (event: any) => event,
  init(config: any) {
    if (config.beforeSend) this.beforeSend = config.beforeSend;
  },
  withScope(cb: (scope: any) => void) {
    const scope = { setTag: () => {} };
    cb(scope);
  },
  captureException(err: Error) {
    const redactedMsg = redactSensitiveInfo(err.message);
    const redactedErr = new Error(redactedMsg);
    if (err.stack) {
      redactedErr.stack = redactSensitiveInfo(err.stack);
    }

    const event = {
      exception: {
        values: [
          {
            type: redactedErr.name,
            value: redactedErr.message,
            stacktrace: { frames: [{ filename: redactedErr.stack }] },
          },
        ],
      },
    };

    const finalEvent = this.beforeSend(event);
    capturedReports.push({ reportedError: redactedErr, sentryEvent: finalEvent });
  },
};

mockSentryNode.init({
  beforeSend: (event: any) => scrubSentryEvent(event),
});

// Trigger error reporting simulation
mockSentryNode.captureException(rawErrorWithBothKeys);

assert.strictEqual(capturedReports.length, 1, 'Mock SentryNode capture failed');
const report = capturedReports[0];

assert(!report.reportedError.message.includes(geminiKeySample), 'Gemini key leaked in reported Error message!');
assert(!report.reportedError.message.includes(groqKeySample), 'Groq key leaked in reported Error message!');
assert(!report.reportedError.stack.includes(geminiKeySample), 'Gemini key leaked in reported Error stack!');
assert(!report.reportedError.stack.includes(groqKeySample), 'Groq key leaked in reported Error stack!');
assert(!report.sentryEvent.exception.values[0].value.includes(geminiKeySample), 'Gemini key leaked in Sentry event!');
assert(!report.sentryEvent.exception.values[0].value.includes(groqKeySample), 'Groq key leaked in Sentry event!');

console.log('✓ All Key Redaction simulation tests passed successfully!');
