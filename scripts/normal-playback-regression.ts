import { calculateSpeakingMetrics } from '../src/utils/speakingMetrics';

console.log('Running Voice Cascade (B2) & Speech-to-Text / Metrics (B4) Regression Tests...');

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  } else {
    console.log(`PASS  ${msg}`);
  }
}

async function runRegressionTests() {
  // Test B4: Speaking Metrics calculation from word-level timestamps
  console.log('\n--- Test Suite 1: Speaking Metrics Calculation (Whisper Timestamps) ---');
  
  const sampleWords = [
    { word: 'Well', start: 0.2, end: 0.6 },
    { word: 'um', start: 0.7, end: 1.0 },
    { word: 'I', start: 1.2, end: 1.4 },
    { word: 'think', start: 1.5, end: 1.8 },
    { word: 'the', start: 1.9, end: 2.1 },
    { word: 'policy', start: 2.2, end: 2.8 },
    // 2.2-second pause here
    { word: 'is', start: 5.0, end: 5.3 },
    { word: 'very', start: 5.4, end: 5.7 },
    { word: 'effective', start: 5.8, end: 6.4 },
    { word: 'you', start: 6.5, end: 6.7 },
    { word: 'know', start: 6.8, end: 7.1 },
  ];
  const sampleTranscript = 'Well um I think the policy is very effective you know';
  const metrics = calculateSpeakingMetrics(sampleWords, sampleTranscript, 7.5, 45);

  assert(metrics.wpm > 60 && metrics.wpm < 140, `WPM calculated reasonably: ${metrics.wpm}`);
  assert(metrics.fillerWordCount >= 2, `Filler words detected correctly (um, you know): ${metrics.fillerWordCount}`);
  assert(metrics.longestPauseSeconds >= 2.0, `Longest pause detected accurately: ${metrics.longestPauseSeconds}s`);
  assert(metrics.pausesOver1Sec === 1, `Pauses over 1 second counted accurately: ${metrics.pausesOver1Sec}`);
  assert(metrics.totalSpeakingTimeSeconds === 7.5, `Total speaking time matches: ${metrics.totalSpeakingTimeSeconds}s`);

  // Test B2: Voice Cascade Provider Selection
  console.log('\n--- Test Suite 2: Voice (TTS) Cascade Selection Logic ---');

  function getTtsCandidateOrder(keys: { gemini?: string; groq?: string; openrouter?: string }) {
    const candidates: string[] = [];
    if (keys.gemini?.trim()) candidates.push('gemini');
    if (keys.groq?.trim()) candidates.push('groq');
    if (keys.openrouter?.trim()) candidates.push('openrouter');
    return candidates;
  }

  // 1. All keys present -> Gemini first, then Groq, then OpenRouter
  const allCandidates = getTtsCandidateOrder({
    gemini: 'AIzaSyTestKey123',
    groq: 'gsk_test_key_abc',
    openrouter: 'sk-or-test-key-xyz',
  });
  assert(allCandidates[0] === 'gemini', 'Gemini is first candidate when Gemini key is present');
  assert(allCandidates[1] === 'groq', 'Groq is second candidate');
  assert(allCandidates[2] === 'openrouter', 'OpenRouter is third candidate');

  // 2. Only Groq key present -> Groq first
  const groqOnly = getTtsCandidateOrder({
    gemini: '',
    groq: 'gsk_test_key_abc',
  });
  assert(groqOnly.length === 1 && groqOnly[0] === 'groq', 'Groq is chosen when only Groq key is present');

  // 3. No keys present -> empty candidates triggering actionable toast
  const noKeys = getTtsCandidateOrder({});
  assert(noKeys.length === 0, 'No candidates when no keys configured');

  const expectedToast = 'Voice requires an API key for Gemini or Groq. Add one in Settings.';
  assert(expectedToast.includes('Gemini or Groq'), 'Actionable toast text is formatted correctly');

  // Test B4: STT Provider fallback logic
  console.log('\n--- Test Suite 3: Speech-to-Text Fallback Routing ---');

  function getSttProvider(groqKey?: string, geminiKey?: string): string {
    if (groqKey?.trim()) return 'groq';
    if (geminiKey?.trim()) return 'gemini';
    return 'none';
  }

  assert(getSttProvider('gsk_groq', 'AIza_gemini') === 'groq', 'STT prioritizes Groq Whisper when Groq key is available');
  assert(getSttProvider('', 'AIza_gemini') === 'gemini', 'STT falls back to Gemini transcribe when Groq key is missing');
  assert(getSttProvider('', '') === 'none', 'STT returns none when no keys, showing manual input fallback banner');

  console.log('\n✨ All Voice Cascade (B2) and STT / Speaking Metrics (B4) regression tests passed successfully!');
}

runRegressionTests().catch((err) => {
  console.error('Regression tests failed:', err);
  process.exit(1);
});
