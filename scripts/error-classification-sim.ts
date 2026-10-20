import assert from 'assert';
import { getStatus, extractErrorMessage, isTransientError, isKeyError } from '../src/server/geminiErrors';

console.log('Running Error Classification Simulation Tests...');
assert.strictEqual(getStatus({ status: 429, message: 'Rate limit exceeded' }), 429, 'PASS 429 status classified correctly');
assert.strictEqual(getStatus({ status: 503, message: 'Service Unavailable' }), 503, 'PASS 503 status classified correctly');
assert.strictEqual(isKeyError({ status: 401, message: 'API key invalid' }), true, 'PASS 401 key error classified correctly');
assert.strictEqual(isTransientError({ status: 502, message: 'Bad Gateway' }), true, 'PASS 502 transient error classified correctly');
console.log('All error classification simulation tests passed successfully!');
