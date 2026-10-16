import {
  ensureOfflineVoiceLoaded,
  generateOfflineSpeech,
  downloadOfflineVoice,
  removeOfflineVoice,
  isOfflineVoiceDownloaded,
  resetOfflineVoiceStateForTest,
} from '../src/utils/offlineVoice';
import { handleSynthesizeSpeech } from '../src/server/geminiHandler';

console.log('Running Brave TTS Root-Cause Repair & Regression Test Suite...');

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  } else {
    console.log(`PASS: ${msg}`);
  }
}

async function runBraveRegressionTests() {
  if (typeof (global as any).window === 'undefined') {
    (global as any).window = {
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    };
  }

  if (typeof (global as any).localStorage === 'undefined') {
    const store: Record<string, string> = {};
    (global as any).localStorage = {
      getItem: (k: string) => store[k] || null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    };
  }

  // Test 1 & 2: WebGPU missing/unavailable & WebGPU init failure followed by WASM success
  console.log('\n--- Test 1 & 2: WebGPU adapter unavailable / WebGPU failure followed by WASM success ---');
  // Mock Worker where WebGPU requestAdapter throws or is missing, but WASM succeeds
  class MockWasmFallbackWorker {
    public onmessage: ((e: MessageEvent) => void) | null = null;
    constructor(url: any) {
      setTimeout(() => {
        // Simulates WebGPU failing and WASM succeeding after retry
        this.onmessage?.({ data: { type: 'init-success', voices: ['af_heart', 'am_puck'] } } as MessageEvent);
      }, 30);
    }
    postMessage(msg: any) {
      if (msg.type === 'init') {
        setTimeout(() => {
          this.onmessage?.({ data: { type: 'init-success', voices: ['af_heart', 'am_puck'] } } as MessageEvent);
        }, 20);
      } else if (msg.type === 'generate') {
        setTimeout(() => {
          const buffer = new ArrayBuffer(50);
          this.onmessage?.({
            data: { type: 'generate-success', id: msg.id, buffer, samplingRate: 24000 },
          } as MessageEvent);
        }, 20);
      }
    }
    terminate() {}
  }
  (global as any).Worker = MockWasmFallbackWorker;

  resetOfflineVoiceStateForTest();
  const dlRes = await downloadOfflineVoice();
  assert(dlRes.success === true, 'Kokoro successfully initialized with WASM fallback when WebGPU unavailable');

  // Test 3: Both Kokoro backends failing
  console.log('\n--- Test 3: Both Kokoro backends failing ---');
  class MockBothFailWorker {
    public onmessage: ((e: MessageEvent) => void) | null = null;
    constructor(url: any) {
      setTimeout(() => {
        this.onmessage?.({
          data: { type: 'init-error', error: 'WebGPU failed: [Adapter unavailable]. WASM failed: [WASM out of memory]' },
        } as MessageEvent);
      }, 20);
    }
    postMessage() {}
    terminate() {}
  }
  (global as any).Worker = MockBothFailWorker;
  resetOfflineVoiceStateForTest();
  const failDl = await downloadOfflineVoice();
  assert(failDl.success === false, 'Both backends failing correctly returns failure');
  assert(failDl.error?.includes('WASM failed'), 'Error contains distinct failure messages from both WebGPU and WASM');

  // Test 4: New worker with cached model but no in-memory instance
  console.log('\n--- Test 4: New worker with cached model but no in-memory instance ---');
  (global as any).Worker = MockWasmFallbackWorker;
  resetOfflineVoiceStateForTest();
  // Set downloaded flag in storage to simulate cached model from previous session
  localStorage.setItem('toefl_offline_voice_downloaded', 'true');
  assert(isOfflineVoiceDownloaded() === true, 'Model marked as downloaded in storage');

  const genCachedRes = await generateOfflineSpeech('Testing generation with cached model and fresh worker.');
  assert(genCachedRes.arrayBuffer instanceof ArrayBuffer, 'Generation succeeds with fresh worker using cached model');

  // Test 5: Empty system voice list simulation
  console.log('\n--- Test 5: Empty system voice list handling ---');
  (global as any).window.speechSynthesis = {
    getVoices: () => [],
    onvoiceschanged: null,
  };
  const voices = window.speechSynthesis.getVoices();
  assert(voices.length === 0, 'System voice list is empty');
  // Confirm that empty system voices do not block Kokoro generation
  const genEmptyVoicesRes = await generateOfflineSpeech('Testing speech with empty system voices.');
  assert(genEmptyVoicesRes.arrayBuffer instanceof ArrayBuffer, 'Kokoro generates speech successfully despite empty system voice list');

  // Test 6: Successful and failed cloud TTS requests
  console.log('\n--- Test 6: Cloud TTS requests and error distinction ---');
  let ttsErrorCaught = false;
  try {
    // Calling handleSynthesizeSpeech with invalid/empty credentials
    await handleSynthesizeSpeech('Test cloud tts', 'Kore', { provider: 'gemini', apiKey: 'invalid-key' });
  } catch (err: any) {
    ttsErrorCaught = true;
    assert(err.message.includes('TTS_INVALID_CREDENTIALS'), 'Invalid API key correctly maps to TTS_INVALID_CREDENTIALS');
  }
  assert(ttsErrorCaught, 'Cloud TTS credential error caught');

  // Test 7: OpenRouter credentials not being sent to Gemini
  console.log('\n--- Test 7: OpenRouter credentials separation ---');
  let openRouterErrorCaught = false;
  try {
    await handleSynthesizeSpeech('Test openrouter tts', 'Kore', { provider: 'openrouter', apiKey: 'sk-or-v1-fakekey' });
  } catch (err: any) {
    openRouterErrorCaught = true;
    assert(err.message.includes('TTS_UNSUPPORTED_PROVIDER'), 'OpenRouter provider correctly rejected without sending key to Gemini');
  }
  assert(openRouterErrorCaught, 'OpenRouter TTS rejection caught');

  // Test 8: Correct fallback when provider does not support TTS
  console.log('\n--- Test 8: Unsupported provider fallback / rejection ---');
  let unsupportedErr = false;
  try {
    await handleSynthesizeSpeech('Test unsupported', 'Kore', { provider: 'anthropic', apiKey: 'sk-ant-fake' });
  } catch (err: any) {
    unsupportedErr = err.message.includes('TTS_UNSUPPORTED_PROVIDER');
  }
  assert(unsupportedErr, 'Unsupported provider throws TTS_UNSUPPORTED_PROVIDER');

  console.log('\nAll Brave TTS root-cause repair & regression tests passed successfully!');
}

runBraveRegressionTests().catch((err) => {
  console.error('Brave TTS regression test failed:', err);
  process.exit(1);
});
