/**
 * Audio Signal Processing Utilities for TOEFL Prep Studio
 * Provides RMS calculation, decibel (dBFS) math, silence trimming, and noise gating.
 */

/**
 * Calculates the Root Mean Square (RMS) amplitude of audio sample data.
 */
export function calculateRms(samples: Float32Array | Int16Array | Uint8Array): number {
  if (!samples || samples.length === 0) return 0;

  let sum = 0;
  if (samples instanceof Float32Array) {
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }

  if (samples instanceof Int16Array) {
    for (let i = 0; i < samples.length; i++) {
      const normalized = samples[i] / 32768.0;
      sum += normalized * normalized;
    }
    return Math.sqrt(sum / samples.length);
  }

  // Uint8Array byte frequency or 8-bit unsigned PCM
  for (let i = 0; i < samples.length; i++) {
    const normalized = (samples[i] - 128) / 128.0;
    sum += normalized * normalized;
  }
  return Math.sqrt(sum / samples.length);
}

/**
 * Converts RMS amplitude (0.0 to 1.0) to decibels relative to full scale (dBFS).
 * Returns -100 dBFS for silence.
 */
export function calculateDbfs(rms: number): number {
  if (rms <= 0.00001) return -100;
  const db = 20 * Math.log10(rms);
  return Math.max(-100, Math.min(0, Math.round(db * 10) / 10));
}

/**
 * Converts dBFS (-100 to 0) to a linear amplitude ratio (0.0 to 1.0).
 */
export function dbfsToLinear(dbfs: number): number {
  if (dbfs <= -100) return 0;
  return Math.pow(10, dbfs / 20);
}

/**
 * Converts linear amplitude (0.0 to 1.0) to dBFS.
 */
export function linearToDbfs(linear: number): number {
  return calculateDbfs(linear);
}

/**
 * Calculates normalized audio meter level (0 to 100) from frequency or waveform data.
 */
export function calculateAudioLevel(data: Uint8Array | Float32Array): number {
  if (!data || data.length === 0) return 0;

  if (data instanceof Uint8Array) {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    const avg = sum / data.length;
    return Math.min(100, Math.round((avg / 120) * 100));
  }

  const rms = calculateRms(data);
  // Map RMS 0.0-0.5 to 0-100 meter
  return Math.min(100, Math.round((rms / 0.5) * 100));
}

/**
 * Trims leading and trailing PCM silence below threshold amplitude.
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

/**
 * Trims leading and trailing silence from Float32Array audio samples.
 */
export function trimAudioSilence(
  samples: Float32Array,
  thresholdDbfs: number = -45,
  windowSize: number = 512
): Float32Array {
  if (!samples || samples.length === 0) return samples;

  const thresholdAmp = dbfsToLinear(thresholdDbfs);
  let startIdx = 0;
  let endIdx = samples.length - 1;

  // Search forward for start of voice
  for (let i = 0; i < samples.length - windowSize; i += windowSize) {
    const chunk = samples.subarray(i, i + windowSize);
    if (calculateRms(chunk) > thresholdAmp) {
      startIdx = Math.max(0, i - windowSize); // keep a small lead-in margin
      break;
    }
  }

  // Search backward for end of voice
  for (let i = samples.length - windowSize; i > startIdx; i -= windowSize) {
    const chunk = samples.subarray(i, i + windowSize);
    if (calculateRms(chunk) > thresholdAmp) {
      endIdx = Math.min(samples.length, i + windowSize * 2); // keep a small tail margin
      break;
    }
  }

  if (startIdx >= endIdx) return samples;
  return samples.slice(startIdx, endIdx);
}

/**
 * Applies a basic noise gate: zeros out or attenuates audio below threshold dBFS.
 */
export function applyNoiseGate(
  samples: Float32Array,
  thresholdDbfs: number = -50,
  windowSize: number = 256
): Float32Array {
  if (!samples || samples.length === 0) return samples;

  const thresholdAmp = dbfsToLinear(thresholdDbfs);
  const result = new Float32Array(samples.length);

  for (let i = 0; i < samples.length; i += windowSize) {
    const end = Math.min(samples.length, i + windowSize);
    const chunk = samples.subarray(i, end);
    const rms = calculateRms(chunk);

    if (rms < thresholdAmp) {
      // Soft attenuation instead of harsh clipping to avoid popping artifacts
      const factor = Math.max(0, rms / thresholdAmp);
      for (let j = i; j < end; j++) {
        result[j] = samples[j] * factor * 0.1;
      }
    } else {
      for (let j = i; j < end; j++) {
        result[j] = samples[j];
      }
    }
  }

  return result;
}
