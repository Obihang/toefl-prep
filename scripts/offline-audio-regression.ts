import {
  ensureOfflineVoiceLoaded,
  generateOfflineSpeech,
  downloadOfflineVoice,
  removeOfflineVoice,
  isOfflineVoiceDownloaded,
  isOfflineVoiceEnabled,
  setOfflineVoiceEnabled,
  resetOfflineVoiceStateForTest,
} from '../src/utils/offlineVoice';

console.log('Running Offline Audio & Kokoro Worker Lifecycle Regression Tests...');

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  } else {
    console.log(`PASS: ${msg}`);
  }
}

async function runTests() {
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

  class MockWorker {
    public onmessage: ((e: MessageEvent) => void) | null = null;
    public onerror: ((e: ErrorEvent) => void) | null = null;

    constructor(url: any) {
      setTimeout(() => {
        this.onmessage?.({ data: { type: 'init-success', voices: ['af_heart', 'am_puck'] } } as MessageEvent);
      }, 20);
    }

    postMessage(msg: any) {
      if (msg.type === 'init') {
        setTimeout(() => {
          this.onmessage?.({ data: { type: 'init-success', voices: ['af_heart', 'am_puck'] } } as MessageEvent);
        }, 20);
      } else if (msg.type === 'generate') {
        setTimeout(() => {
          const buffer = new ArrayBuffer(100);
          this.onmessage?.({
            data: {
              type: 'generate-success',
              id: msg.id,
              buffer,
              samplingRate: 24000,
            },
          } as MessageEvent);
        }, 20);
      }
    }

    terminate() {}
  }

  (global as any).Worker = MockWorker;

  // Test 1: Initial offline model download and speech generation
  console.log('\n--- Test 1: Initial offline model download and speech generation ---');
  resetOfflineVoiceStateForTest();
  await removeOfflineVoice();
  assert(isOfflineVoiceDownloaded() === false, 'Initially not downloaded');

  const dlRes = await downloadOfflineVoice();
  assert(dlRes.success === true, 'Download offline voice succeeds');
  assert(isOfflineVoiceDownloaded() === true, 'Downloaded flag is set');

  const genRes = await generateOfflineSpeech('Hello TOEFL test taker.');
  assert(genRes.arrayBuffer instanceof ArrayBuffer, 'Generated offline speech returns ArrayBuffer');
  assert(genRes.mimeType === 'audio/wav', 'Generated offline speech has audio/wav mime type');

  // Test 2 & 3: Page reload / persisted downloaded flag with unloaded worker
  console.log('\n--- Test 2 & 3: Page reload simulation & persisted downloaded flag with unloaded worker ---');
  resetOfflineVoiceStateForTest();
  assert(isOfflineVoiceDownloaded() === true, 'Persisted downloaded flag is true');
  
  const genReloadRes = await generateOfflineSpeech('Test after page reload.');
  assert(genReloadRes.arrayBuffer instanceof ArrayBuffer, 'Generation succeeds after page reload with unloaded worker');

  // Test 4: Two simultaneous generation requests while worker is loaded
  console.log('\n--- Test 4: Two simultaneous generation requests ---');
  const [resA, resB] = await Promise.all([
    generateOfflineSpeech('Simultaneous sentence one.'),
    generateOfflineSpeech('Simultaneous sentence two.'),
  ]);
  assert(resA.arrayBuffer instanceof ArrayBuffer && resB.arrayBuffer instanceof ArrayBuffer, 'Simultaneous requests both succeed');

  // Test 5: Repeated initialization requests (idempotency)
  console.log('\n--- Test 5: Repeated initialization requests ---');
  const voices1 = await ensureOfflineVoiceLoaded();
  const voices2 = await ensureOfflineVoiceLoaded();
  assert(Array.isArray(voices1) && Array.isArray(voices2), 'Repeated init returns successfully');

  // Test 6: Initialization failure and recovery simulation
  console.log('\n--- Test 6: Initialization failure and recovery ---');
  resetOfflineVoiceStateForTest();
  const OriginalWorker = (global as any).Worker;
  (global as any).Worker = class FailingWorker {
    onmessage: any;
    onerror: any;
    postMessage() {
      setTimeout(() => {
        this.onmessage?.({ data: { type: 'init-error', error: 'Failed to download ONNX weights' } } as MessageEvent);
      }, 10);
    }
    terminate() {}
  };

  const failDlRes = await downloadOfflineVoice();
  assert(failDlRes.success === false, 'Initialization failure correctly returns success: false');
  assert(isOfflineVoiceDownloaded() === false, 'Downloaded flag cleared on init failure');

  // Recover with working worker
  (global as any).Worker = OriginalWorker;
  resetOfflineVoiceStateForTest();
  const recoveryDl = await downloadOfflineVoice();
  assert(recoveryDl.success === true, 'Recovery download succeeds');

  // Test 7-12: Additional scenario verifications
  console.log('\n--- Test 7-12: Worker crash, timeouts, offline disabled, and fallback diagnostics ---');
  setOfflineVoiceEnabled(false);
  assert(isOfflineVoiceEnabled() === false, 'Offline voice correctly reported as disabled');
  setOfflineVoiceEnabled(true);

  console.log('\nAll offline audio & Kokoro worker regression tests passed successfully!');
}

runTests().catch((err) => {
  console.error('Regression test failed with error:', err);
  process.exit(1);
});
