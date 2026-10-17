import { getSectionForTaskType, TASK_SECTION_MAP } from '../src/types/taskTypes';
import { redactKey, extractErrorMessage } from '../src/server/geminiErrors';
import { normalizeTask } from '../src/server/geminiHandler';

function runRegressionTests() {
  console.log('Running Master Regression Test Suite...');

  // 1. Task Type Section Mapping Test
  console.log('Test 1: Task Type Section Mappings');
  const expectedMappings: Record<string, string> = {
    'complete-words': 'Reading',
    'reading-passage': 'Reading',
    'listening-dialogue': 'Listening',
    'listen-repeat': 'Speaking',
    'speaking-interview': 'Speaking',
    'build-sentence': 'Writing',
    'write-email': 'Writing',
    'academic-discussion': 'Writing',
  };

  for (const [taskType, expectedSection] of Object.entries(expectedMappings)) {
    const section = getSectionForTaskType(taskType);
    if (section !== expectedSection) {
      throw new Error(`Mapping failed for ${taskType}: expected ${expectedSection}, got ${section}`);
    }
  }

  // Unknown task types must NOT be mapped to Reading
  if (getSectionForTaskType('unknown-task-xyz') !== null) {
    throw new Error('Unknown task type should return null, not Reading!');
  }
  console.log('PASS: All task types mapped to canonical sections correctly.');

  // 2. Secret / API Key Redaction Test
  console.log('Test 2: Key Redaction Test');
  const sampleLog = 'Error with key AIzaSyABC1234567890XYZ and AQ.Ab8RN1234567890 and gsk_12345678901234567890 and nvapi-12345678901234567890 and sk-or-12345678901234567890 and sk-12345678901234567890';
  const redacted = redactKey(sampleLog);
  if (redacted.includes('AIzaSyABC') || redacted.includes('AQ.Ab8RN') || redacted.includes('gsk_123') || redacted.includes('nvapi-123') || redacted.includes('sk-or-123') || redacted.includes('sk-123')) {
    throw new Error(`Key redaction failed: ${redacted}`);
  }
  if (!redacted.includes('[REDACTED]')) {
    throw new Error('Key redaction did not insert [REDACTED]');
  }
  console.log('PASS: All secrets completely redacted from log strings.');

  // 3. Exact Question Validation & Strict Normalizer Tests
  console.log('Test 3: Exact Question Validation & Error Rejections');

  // Reading: must have exactly 3 questions, each with 4 options and valid answer (0-3)
  let threw = false;
  try {
    normalizeTask('reading-passage', {
      title: 'Test',
      passage: 'This is a long enough academic passage for testing reading validation rules correctly.',
      questions: [
        { q: 'Q1', options: ['A', 'B', 'C', 'D'], answer: 0, why: 'Ok' },
        { q: 'Q2', options: ['A', 'B', 'C', 'D'], answer: 1, why: 'Ok' }
        // Insufficient questions (2 instead of 3)
      ],
    });
  } catch {
    threw = true;
  }
  if (!threw) throw new Error('FAIL: Reading passage with 2 questions should be rejected');

  // Reading: invalid answer index (5)
  threw = false;
  try {
    normalizeTask('reading-passage', {
      title: 'Test',
      passage: 'This is a long enough academic passage for testing reading validation rules correctly.',
      questions: [
        { q: 'Q1', options: ['A', 'B', 'C', 'D'], answer: 5, why: 'Ok' },
        { q: 'Q2', options: ['A', 'B', 'C', 'D'], answer: 1, why: 'Ok' },
        { q: 'Q3', options: ['A', 'B', 'C', 'D'], answer: 2, why: 'Ok' },
      ],
    });
  } catch {
    threw = true;
  }
  if (!threw) throw new Error('FAIL: Reading passage with invalid answer index (5) should be rejected');

  // Unknown task type rejection
  threw = false;
  try {
    normalizeTask('unknown-task-type', { title: 'Test' });
  } catch {
    threw = true;
  }
  if (!threw) throw new Error('FAIL: Unknown task type should be explicitly rejected');

  // Complete words: reconcile totalBlanks when model says 10 but created 6 blanks
  const normCW = normalizeTask('complete-words', {
    title: 'Ecology Test',
    text: 'Forests play a crit[[ical]] role in our glob[[al]] ecos[[ystem]]. Trees abs[[orb]] carb[[on]] and rele[[ase]] oxygen.',
    totalBlanks: 10,
  });
  if (normCW.totalBlanks !== 6) {
    throw new Error(`FAIL: Complete words totalBlanks should reconcile to 6, got ${normCW.totalBlanks}`);
  }

  // Complete words: reject when insufficient blanks (< 3)
  threw = false;
  try {
    normalizeTask('complete-words', {
      title: 'Too few blanks',
      text: 'Only one bl[[ank]] here.',
      totalBlanks: 1,
    });
  } catch {
    threw = true;
  }
  if (!threw) throw new Error('FAIL: Complete words with < 3 blanks should be rejected');

  console.log('PASS: Exact question validation and error rejections verified successfully.');

  // 4. Provider-specific Quota Error Message Test
  console.log('Test 4: Provider-specific Error Messages');
  const orErr = extractErrorMessage(new Error('OPENROUTER API Error (429): Rate limit exceeded'));
  if (orErr.includes('midnight Pacific time')) {
    throw new Error(`FAIL: OpenRouter error should not mention midnight Pacific time: ${orErr}`);
  }
  if (!orErr.toLowerCase().includes('openrouter')) {
    throw new Error(`FAIL: OpenRouter error should mention OpenRouter: ${orErr}`);
  }
  console.log('PASS: Provider-specific quota errors formatted accurately.');

  console.log('All regression tests passed successfully!');
}

runRegressionTests();
