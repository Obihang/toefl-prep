// Pure audio and transcript helper utilities for TOEFL Prep Studio

/**
 * Detects if byte array starts with ASCII "RIFF" (WAV file header)
 */
export function isRiffWav(bytes: Uint8Array | Buffer | ArrayBuffer): boolean {
  if (!bytes) return false;
  let view: Uint8Array;
  if (bytes instanceof ArrayBuffer) {
    view = new Uint8Array(bytes);
  } else {
    view = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  if (view.length < 4) return false;
  return view[0] === 82 && view[1] === 73 && view[2] === 70 && view[3] === 70;
}

/**
 * Parses rate=<number> from mimeType string or returns default rate
 */
export function parseSampleRateFromMime(mimeType?: string, defaultRate = 24000): number {
  if (!mimeType) return defaultRate;
  const match = mimeType.match(/rate=(\d+)/i);
  if (match) {
    const parsed = parseInt(match[1], 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return defaultRate;
}

/**
 * Creates standard 44-byte WAV header for PCM 16-bit audio unless already RIFF
 */
export function wrapWavHeaderIfNeeded(
  pcmBuffer: Buffer | Uint8Array,
  sampleRate = 24000,
  numChannels = 1,
  bitsPerSample = 16
): Buffer {
  const isBuffer = Buffer.isBuffer(pcmBuffer);
  const buf = isBuffer ? (pcmBuffer as Buffer) : Buffer.from(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.byteLength);

  if (isRiffWav(buf)) {
    return buf;
  }

  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = buf.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(header.length + dataSize - 8, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // Uncompressed PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, buf]);
}

/**
 * Helper to normalize words for overlap matching (remove punctuation and lowercase)
 */
function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Stitches array of audio segment transcriptions into a coherent sentence,
 * removing overlapping duplicated words at joins (comparing up to last 3 words).
 */
export function stitchTranscripts(segments: string[]): string {
  const valid = segments.map((s) => s.trim()).filter(Boolean);
  if (valid.length === 0) return '';
  if (valid.length === 1) return valid[0];

  let result = valid[0];

  for (let i = 1; i < valid.length; i++) {
    const prevText = result;
    const nextText = valid[i];

    const prevWords = prevText.split(/\s+/).filter(Boolean);
    const nextWords = nextText.split(/\s+/).filter(Boolean);

    let overlapCount = 0;

    // Check 3-word overlap first, then 2, then 1
    const maxOverlap = Math.min(3, prevWords.length, nextWords.length);
    for (let k = maxOverlap; k >= 1; k--) {
      const prevTail = prevWords.slice(-k).map(normalizeWord).join(' ');
      const nextHead = nextWords.slice(0, k).map(normalizeWord).join(' ');

      if (prevTail && nextHead && prevTail === nextHead) {
        overlapCount = k;
        break;
      }
    }

    if (overlapCount > 0) {
      const remainingNextWords = nextWords.slice(overlapCount);
      if (remainingNextWords.length > 0) {
        result += ' ' + remainingNextWords.join(' ');
      }
    } else {
      result += ' ' + nextText;
    }
  }

  return result.replace(/\s+/g, ' ').trim();
}

/**
 * Trims leading and trailing PCM silence below threshold amplitude
 */
export function trimPcmSilence(pcm: Uint8Array | Int16Array, threshold = 300): Uint8Array {
  let view: Int16Array;
  if (pcm instanceof Int16Array) {
    view = pcm;
  } else {
    view = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
  }

  let start = 0;
  let end = view.length - 1;

  while (start < view.length && Math.abs(view[start]) < threshold) {
    start++;
  }

  while (end > start && Math.abs(view[end]) < threshold) {
    end--;
  }

  if (start >= end) {
    return new Uint8Array(0);
  }

  const sliced = view.subarray(start, end + 1);
  return new Uint8Array(sliced.buffer, sliced.byteOffset, sliced.byteLength);
}
