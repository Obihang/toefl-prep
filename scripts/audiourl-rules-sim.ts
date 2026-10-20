import assert from 'assert';
import { isValidBlobUrl, BLOB_URL_REGEX } from '../src/utils/audioUrlValidator.ts';

console.log('Running AudioURL / AudioClips Rules Simulation Tests...');
console.log('Using shared regex:', BLOB_URL_REGEX);

assert.strictEqual(isValidBlobUrl('https://xyz.blob.vercel-storage.com/audio.mp3'), true, 'PASS valid blob https url accepted');
assert.strictEqual(isValidBlobUrl('http://xyz.blob.vercel-storage.com/audio.mp3'), false, 'PASS http url rejected');
assert.strictEqual(isValidBlobUrl('data:audio/mp3;base64,...'), false, 'PASS data url rejected');
assert.strictEqual(isValidBlobUrl('https://evil.com/?blob.vercel-storage.com/x.mp3'), false, 'PASS evil query trick url rejected');
assert.strictEqual(isValidBlobUrl('https://evil.com/blob.vercel-storage.com/x.mp3'), false, 'PASS evil path trick url rejected');
assert.strictEqual(isValidBlobUrl('https://evil.com/audio.mp3'), false, 'PASS non-blob domain url rejected');

console.log('All audioURL / audioClips rules simulation tests passed successfully!');
