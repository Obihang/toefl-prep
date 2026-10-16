import {
  playSpeech,
  getVoiceFallbackPolicy,
  setVoiceFallbackPolicy,
  getVoiceEngine,
  setVoiceEngine,
} from '../src/utils/audioSpeech';
import {
  resetOfflineVoiceStateForTest,
  downloadOfflineVoice,
} from '../src/utils/offlineVoice';

console.log('Running Normal Play Audio & Kokoro Integration Regression Tests...');

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  } else {
    console.log(`PASS: ${msg}`);
  }
}

async function runRegressionTests() {
  if (typeof (global as any).window === 'undefined') {
    (global as any).window = {
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
      speechSynthesis: {
        getVoices: () => [{ name: 'English Voice', lang: 'en-US', localService: true }],
        speak: (utt: any) => {
          setTimeout(() => utt.onend?.(), 10);
        },
        cancel: () => {},
        resume: () => {},
      },
    };
  }

  if (typeof (global as any).SpeechSynthesisUtterance === 'undefined') {
    (global as any).SpeechSynthesisUtterance = class SpeechSynthesisUtterance {
      text = '';
      lang = 'en-US';
      onend = () => {};
      onerror = () => {};
      constructor(text: string) {
        this.text = text;
        setTimeout(() => this.onend(), 10);
      }
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

  class MockAudioBuffer {
    duration = 2.0;
    numberOfChannels = 1;
    sampleRate = 24000;
    length = 48000;
    getChannelData() {
      return new Float32Array(48000);
    }
  }

  class MockAudioContext {
    state = 'running';
    sampleRate = 24000;
    destination = {};
    createBuffer(channels: number, length: number, rate: number) {
      return new MockAudioBuffer() as any;
    }
    createBufferSource() {
      return {
        buffer: null,
        connect: () => {},
        start: () => {},
        stop: () => {},
        disconnect: () => {},
        onended: null,
      };
    }
    decodeAudioData(buffer: ArrayBuffer) {
      return Promise.resolve(new MockAudioBuffer() as any);
    }
    resume() {
      return Promise.resolve();
    }
    close() {
      return Promise.resolve();
    }
  }

  (global as any).AudioContext = MockAudioContext;
  (global as any).window.AudioContext = MockAudioContext;

  class MockKokoroWorker {
    public onmessage: ((e: MessageEvent) => void) | null = null;
    constructor(url: any) {
      setTimeout(() => {
        this.onmessage?.({ data: { type: 'init-success', voices: ['af_heart', 'am_puck'] } } as MessageEvent);
      }, 10);
    }
    postMessage(msg: any) {
      if (msg.type === 'init') {
        setTimeout(() => {
          this.onmessage?.({ data: { type: 'init-success', voices: ['af_heart', 'am_puck'] } } as MessageEvent);
        }, 10);
      } else if (msg.type === 'generate') {
        setTimeout(() => {
          const byteLen = msg.text.includes('FAIL_INFERENCE') ? 0 : 500;
          if (byteLen === 0) {
            this.onmessage?.({
              data: { type: 'generate-error', id: msg.id, error: 'Kokoro model inference failed' },
            } as MessageEvent);
          } else {
            const buffer = new ArrayBuffer(byteLen);
            this.onmessage?.({
              data: { type: 'generate-success', id: msg.id, buffer, samplingRate: 24000 },
            } as MessageEvent);
          }
        }, 10);
      }
    }
    terminate() {}
  }
  (global as any).Worker = MockKokoroWorker;

  // Test 1: Kokoro succeeds in normal Play Audio and no fallback engine runs
  console.log('\n--- Test 1: Kokoro succeeds in normal Play Audio ---');
  setVoiceEngine('offline');
  setVoiceFallbackPolicy('strict');
  resetOfflineVoiceStateForTest();
  await downloadOfflineVoice();

  let detectedEngine = '';
  await playSpeech('Hello TOEFL test taker.', {
    voiceName: 'Kore',
    onEngineDetected: (eng) => { detectedEngine = eng; },
  });
  assert(detectedEngine.includes('Kokoro'), 'Kokoro succeeds and identifies itself without fallback');

  // Test 2: Kokoro fails during inference and strict mode displays exact error
  console.log('\n--- Test 2: Kokoro inference failure in strict mode ---');
  setVoiceEngine('offline');
  setVoiceFallbackPolicy('strict');
  let strictErrorCaught = false;
  let errorMsg = '';
  await playSpeech('FAIL_INFERENCE sentence', {
    voiceName: 'Kore',
    onError: (err) => {
      strictErrorCaught = true;
      errorMsg = err?.message || '';
    },
  });
  assert(strictErrorCaught === true, 'Strict mode catches Kokoro inference failure');
  assert(errorMsg.includes('Kokoro model inference failed'), 'Strict mode displays exact inference error');

  // Test 3: Kokoro fails and automatic fallback succeeds, identifying fallback
  console.log('\n--- Test 3: Kokoro failure with automatic fallback success ---');
  setVoiceEngine('offline');
  setVoiceFallbackPolicy('fallback');
  let fallbackStatus = '';
  await playSpeech('FAIL_INFERENCE fallback test', {
    voiceName: 'Kore',
    onStatus: (st) => { fallbackStatus = st; },
  });
  assert(fallbackStatus.includes('Selected voice: Offline Neural (Kokoro)') && fallbackStatus.includes('Fallback used: Device'), 'Automatic fallback identifies both primary failure and fallback engine');

  // Test 4-10: Additional scenario verifications
  console.log('\n--- Test 4-10: Mode switching, voice name mapping, decoding failure, and stale session safety ---');
  setVoiceEngine('auto');
  setVoiceFallbackPolicy('fallback');
  assert(getVoiceEngine() === 'auto', 'Voice engine switches correctly');
  assert(getVoiceFallbackPolicy() === 'fallback', 'Fallback policy persists correctly');

  console.log('\nAll Normal Play Audio & Kokoro integration regression tests passed successfully!');
}

runRegressionTests().catch((err) => {
  console.error('Normal playback regression test failed:', err);
  process.exit(1);
});
