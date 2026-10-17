import {
  recordVoiceEngineFailure,
  recordVoiceEngineSuccess,
  getVoiceEngineFailureCount,
  resetVoiceEngineFailureCounts,
  normalizeEngineName,
  VoiceFallbackEventDetail,
} from '../src/utils/voiceDiagnostics';

console.log('Running Automatic Voice Engine Diagnostic simulation tests...');

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  } else {
    console.log(`PASS  ${msg}`);
  }
}

// Mock localStorage and window events for node environment
const storage: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => storage[k] || null,
  setItem: (k: string, v: string) => {
    storage[k] = String(v);
  },
  removeItem: (k: string) => {
    delete storage[k];
  },
};

let lastDispatchedToast: VoiceFallbackEventDetail | null = null;
let lastDispatchedEngine: string | null = null;

(globalThis as any).window = {
  dispatchEvent: (event: any) => {
    if (event.type === 'toefl_voice_fallback_toast') {
      lastDispatchedToast = event.detail;
    }
    if (event.type === 'toefl_voice_engine_changed') {
      lastDispatchedEngine = event.detail?.engine;
    }
  },
};

(globalThis as any).CustomEvent = class CustomEvent {
  type: string;
  detail: any;
  constructor(type: string, params?: { detail: any }) {
    this.type = type;
    this.detail = params?.detail;
  }
};

// 1. Normalization tests
assert(normalizeEngineName('kokoro') === 'Kokoro', 'normalizeEngineName maps kokoro to Kokoro');
assert(normalizeEngineName('offline') === 'Kokoro', 'normalizeEngineName maps offline to Kokoro');
assert(normalizeEngineName('aivoice') === 'AI Voice', 'normalizeEngineName maps aivoice to AI Voice');
assert(normalizeEngineName('cloud') === 'AI Voice', 'normalizeEngineName maps cloud to AI Voice');
assert(normalizeEngineName('device') === 'Web Speech', 'normalizeEngineName maps device to Web Speech');

// 2. Incremental failure tracking for Kokoro
resetVoiceEngineFailureCounts();
storage['toefl_voice_engine'] = 'offline';
lastDispatchedToast = null;

const f1 = recordVoiceEngineFailure('kokoro', 'WASM worker failed to load');
assert(f1.triggeredFallback === false, 'First failure does not trigger fallback');
assert(f1.attempts === 1, 'First failure records attempt #1');
assert(getVoiceEngineFailureCount('kokoro') === 1, 'getVoiceEngineFailureCount returns 1');
assert(storage['toefl_voice_engine'] === 'offline', 'Engine setting is still offline after 1 failure');

const f2 = recordVoiceEngineFailure('kokoro', 'Model weights corrupted');
assert(f2.triggeredFallback === false, 'Second failure does not trigger fallback');
assert(f2.attempts === 2, 'Second failure records attempt #2');
assert(getVoiceEngineFailureCount('kokoro') === 2, 'getVoiceEngineFailureCount returns 2');
assert(storage['toefl_voice_engine'] === 'offline', 'Engine setting is still offline after 2 failures');

// 3. Third failure triggers automatic fallback
const f3 = recordVoiceEngineFailure('kokoro', 'Audio decode error');
assert(f3.triggeredFallback === true, 'Third consecutive failure triggers fallback');
assert(f3.attempts === 3, 'Third failure records attempt #3');
assert(storage['toefl_voice_engine'] === 'device', 'Engine setting automatically toggled to device (Web Speech)');
assert(lastDispatchedToast !== null, 'Toast notification event dispatched');
assert(lastDispatchedToast?.failedEngine === 'Kokoro', 'Toast indicates Kokoro as failed engine');
assert(lastDispatchedToast?.fallbackEngine === 'Web Speech', 'Toast indicates Web Speech as fallback engine');
assert(lastDispatchedToast?.attempts === 3, 'Toast details specify 3 attempts');
assert(lastDispatchedEngine === 'device', 'Engine change event dispatched for UI synchronization');
assert(getVoiceEngineFailureCount('kokoro') === 0, 'Failure counter resets to 0 after triggering fallback');

// 4. Success resets counter before reaching 3
resetVoiceEngineFailureCounts();
storage['toefl_voice_engine'] = 'cloud';
lastDispatchedToast = null;

recordVoiceEngineFailure('cloud', 'API 429 Rate limit');
recordVoiceEngineFailure('cloud', 'Network timeout');
assert(getVoiceEngineFailureCount('cloud') === 2, 'AI Voice failure count is 2');

recordVoiceEngineSuccess('cloud');
assert(getVoiceEngineFailureCount('cloud') === 0, 'recordVoiceEngineSuccess resets counter to 0');
assert(storage['toefl_voice_engine'] === 'cloud', 'Engine remains cloud after recovery');

// 5. 3 consecutive AI Voice failures trigger fallback
recordVoiceEngineFailure('cloud', 'Invalid key');
recordVoiceEngineFailure('cloud', 'Model unavailable');
const fCloud3 = recordVoiceEngineFailure('cloud', '503 Service unavailable');

assert(fCloud3.triggeredFallback === true, 'Third AI Voice failure triggers fallback');
assert(storage['toefl_voice_engine'] === 'device', 'Engine setting automatically toggled to device (Web Speech)');
assert(lastDispatchedToast?.failedEngine === 'AI Voice', 'Toast indicates AI Voice as failed engine');
assert(lastDispatchedToast?.fallbackEngine === 'Web Speech', 'Toast indicates Web Speech as fallback engine');

console.log('✨ All voice engine diagnostic simulation tests passed successfully!');
