import {
  isRiffWav,
  parseSampleRateFromMime,
  wrapWavHeaderIfNeeded,
  stitchTranscripts,
  trimPcmSilence,
} from '../src/utils/audioHelpers.ts';

console.log('Running audio helper simulation tests...');

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  } else {
    console.log(`PASS  ${msg}`);
  }
}

// 1. RIFF detection
const riffBytes = new Uint8Array([82, 73, 70, 70, 36, 0, 0, 0, 87, 65, 86, 69]); // "RIFF...WAVE"
const nonRiffBytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8]);

assert(isRiffWav(riffBytes) === true, 'isRiffWav returns true for RIFF bytes');
assert(isRiffWav(nonRiffBytes) === false, 'isRiffWav returns false for non-RIFF bytes');

// 2. Rate parsing
assert(parseSampleRateFromMime('audio/pcm;rate=16000') === 16000, 'parseSampleRateFromMime extracts 16000 rate');
assert(parseSampleRateFromMime('audio/L16;rate=24000') === 24000, 'parseSampleRateFromMime extracts 24000 rate');
assert(parseSampleRateFromMime('audio/webm') === 24000, 'parseSampleRateFromMime uses default 24000 rate');

// 3. No double header logic
const rawPcm = new Uint8Array([10, 0, 20, 0, 30, 0, 40, 0]);
const wrapped = wrapWavHeaderIfNeeded(rawPcm, 24000);
assert(wrapped.length === 44 + rawPcm.length, 'wrapWavHeaderIfNeeded adds 44-byte WAV header to raw PCM');
assert(isRiffWav(wrapped) === true, 'Wrapped audio has RIFF signature');

const reWrapped = wrapWavHeaderIfNeeded(wrapped, 24000);
assert(reWrapped.length === wrapped.length, 'wrapWavHeaderIfNeeded does not add double header to RIFF file');

// 4. Segment stitching with overlap removal
const seg1 = 'The professor discussed climate change';
const seg2 = 'climate change and global warming impacts';
const stitched1 = stitchTranscripts([seg1, seg2]);
assert(
  stitched1 === 'The professor discussed climate change and global warming impacts',
  'stitchTranscripts removes 2-word overlap at join'
);

const segA = 'In this lecture we will analyze academic writing';
const segB = 'analyze academic writing for the TOEFL test';
const stitched2 = stitchTranscripts([segA, segB]);
assert(
  stitched2 === 'In this lecture we will analyze academic writing for the TOEFL test',
  'stitchTranscripts removes 3-word overlap at join'
);

const segX = 'Listening section starts now.';
const segY = 'Please answer the following questions.';
const stitched3 = stitchTranscripts([segX, segY]);
assert(
  stitched3 === 'Listening section starts now. Please answer the following questions.',
  'stitchTranscripts joins non-overlapping segments cleanly'
);

// 5. Silence detection / trimming
const pcmWithSilence = new Int16Array([0, 5, 0, 1000, 2000, 1500, 0, 10]);
const trimmed = trimPcmSilence(pcmWithSilence, 300);
assert(trimmed.length === 6, 'trimPcmSilence trims leading and trailing silence samples');

console.log('All audio simulation tests passed successfully!');
