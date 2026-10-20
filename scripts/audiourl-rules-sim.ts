import assert from 'assert';

const BLOB_DOMAIN = 'blob.vercel-storage.com';

function isValidBlobUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  return url.startsWith('https://') && url.includes(BLOB_DOMAIN);
}

console.log('Running AudioURL / AudioClips Rules Simulation Tests...');
assert.strictEqual(isValidBlobUrl('https://xyz.blob.vercel-storage.com/audio.mp3'), true, 'PASS valid blob https url accepted');
assert.strictEqual(isValidBlobUrl('http://xyz.blob.vercel-storage.com/audio.mp3'), false, 'PASS http url rejected');
assert.strictEqual(isValidBlobUrl('https://evil.com/audio.mp3'), false, 'PASS non-blob domain url rejected');
assert.strictEqual(isValidBlobUrl('data:audio/mp3;base64,...'), false, 'PASS data url rejected');
console.log('All audioURL / audioClips rules simulation tests passed successfully!');
