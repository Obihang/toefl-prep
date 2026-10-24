import assert from 'assert';
import {
  selectQuestionFromBankTiers,
  getQueryTiers,
  SharedQuestionRecord,
} from '../src/utils/sharedQuestions.ts';
import {
  LEVELS,
  ACADEMIC_TOPICS,
  isValidLevel,
  isValidAcademicTopic,
} from '../src/constants/filters.ts';

async function runFilterSimTests() {
  console.log('--- Starting Filter & Tiering Simulation Tests ---');

  // Verify filter constants
  assert.strictEqual(LEVELS.length, 4, 'LEVELS should contain 4 items');
  assert.strictEqual(ACADEMIC_TOPICS.length, 6, 'ACADEMIC_TOPICS should contain 6 items');
  assert.ok(isValidLevel('intermediate'), 'intermediate should be valid');
  assert.ok(!isValidLevel('all'), 'all is not a concrete level');
  assert.ok(isValidAcademicTopic('science-tech'), 'science-tech should be valid topic');
  assert.ok(!isValidAcademicTopic('all'), 'all is not a concrete topic');
  assert.ok(!isValidAcademicTopic('general'), 'general is not allowed');

  // Verify getQueryTiers plan
  const tiersBoth = getQueryTiers('intermediate', 'science-tech');
  assert.strictEqual(tiersBoth.length, 4, 'Concrete level and topic should yield 4 tiers');
  assert.strictEqual(tiersBoth[0].tier, 'exact');
  assert.strictEqual(tiersBoth[1].tier, 'topic-only');
  assert.strictEqual(tiersBoth[2].tier, 'level-only');
  assert.strictEqual(tiersBoth[3].tier, 'any');

  const tiersTopicOnly = getQueryTiers('all', 'campus-life');
  assert.strictEqual(tiersTopicOnly.length, 2);
  assert.strictEqual(tiersTopicOnly[0].tier, 'exact');
  assert.strictEqual(tiersTopicOnly[0].topic, 'campus-life');
  assert.strictEqual(tiersTopicOnly[1].tier, 'any');

  const tiersLevelOnly = getQueryTiers('beginner', 'all');
  assert.strictEqual(tiersLevelOnly.length, 2);
  assert.strictEqual(tiersLevelOnly[0].tier, 'exact');
  assert.strictEqual(tiersLevelOnly[0].level, 'beginner');
  assert.strictEqual(tiersLevelOnly[1].tier, 'any');

  const tiersAll = getQueryTiers('all', 'all');
  assert.strictEqual(tiersAll.length, 1);
  assert.strictEqual(tiersAll[0].tier, 'exact');

  // Mock bank with varying levels and topics
  const mockBank: SharedQuestionRecord[] = [
    {
      id: 'q1',
      taskType: 'academic-discussion',
      level: 'intermediate',
      topic: 'science-tech',
      content: { prompt: 'AI in medicine' },
      contentHash: 'hash1',
      createdBy: 'scholar1',
      useCount: 1,
      reportCount: 0,
    },
    {
      id: 'q2',
      taskType: 'academic-discussion',
      level: 'advanced',
      topic: 'science-tech',
      content: { prompt: 'Quantum computing' },
      contentHash: 'hash2',
      createdBy: 'scholar2',
      useCount: 2,
      reportCount: 0,
    },
    {
      id: 'q3',
      taskType: 'academic-discussion',
      level: 'intermediate',
      topic: 'campus-life',
      content: { prompt: 'Dormitory rules' },
      contentHash: 'hash3',
      createdBy: 'scholar3',
      useCount: 0,
      reportCount: 0,
    },
    {
      id: 'q4',
      taskType: 'academic-discussion',
      level: 'beginner',
      topic: 'arts-humanities',
      content: { prompt: 'Museum admission' },
      contentHash: 'hash4',
      createdBy: 'scholar4',
      useCount: 5,
      reportCount: 0,
    },
    {
      id: 'q5_reported',
      taskType: 'academic-discussion',
      level: 'intermediate',
      topic: 'science-tech',
      content: { prompt: 'Offensive or spam question' },
      contentHash: 'hash5',
      createdBy: 'spammer',
      useCount: 10,
      reportCount: 3, // reportCount >= 3 MUST BE SKIPPED
    },
  ];

  // Test 1: Exact match tier
  console.log('[Test 1] Exact match tier resolution...');
  const res1 = selectQuestionFromBankTiers(mockBank, [], 'intermediate', 'science-tech');
  assert.ok(res1 !== null, 'Expected match');
  assert.strictEqual(res1.tier, 'exact');
  assert.strictEqual(res1.question.id, 'q1');
  console.log('  PASS: Exact match selected correctly.');

  // Test 2: Seen question skip falls back to next tier or remaining match
  console.log('[Test 2] Seen question skipping...');
  const res2 = selectQuestionFromBankTiers(mockBank, ['q1'], 'intermediate', 'science-tech');
  assert.ok(res2 !== null, 'Expected fallback to topic-only tier');
  assert.strictEqual(res2.tier, 'topic-only');
  assert.strictEqual(res2.question.id, 'q2', 'Should match q2 which has topic science-tech');
  console.log('  PASS: Skipped seen q1, fell back to topic-only tier (q2).');

  // Test 3: Fall back to level-only tier
  console.log('[Test 3] Level-only tier fallback...');
  const res3 = selectQuestionFromBankTiers(mockBank, ['q1', 'q2'], 'intermediate', 'science-tech');
  assert.ok(res3 !== null, 'Expected fallback to level-only tier');
  assert.strictEqual(res3.tier, 'level-only');
  assert.strictEqual(res3.question.id, 'q3', 'Should match q3 which has level intermediate');
  console.log('  PASS: Skipped seen q1 and q2, fell back to level-only tier (q3).');

  // Test 4: Fall back to any tier
  console.log('[Test 4] Any tier fallback...');
  const res4 = selectQuestionFromBankTiers(mockBank, ['q1', 'q2', 'q3'], 'intermediate', 'science-tech');
  assert.ok(res4 !== null, 'Expected fallback to any tier');
  assert.strictEqual(res4.tier, 'any');
  assert.strictEqual(res4.question.id, 'q4', 'Should match q4 as remaining unseen question');
  console.log('  PASS: Fell back to any tier (q4).');

  // Test 5: ReportCount >= 3 must NEVER be returned even if exact match
  console.log('[Test 5] Skip reported questions (reportCount >= 3)...');
  const res5 = selectQuestionFromBankTiers(mockBank, ['q1', 'q2', 'q3', 'q4'], 'intermediate', 'science-tech');
  assert.strictEqual(res5, null, 'Should return null because q5 has reportCount >= 3');
  console.log('  PASS: Successfully filtered out question with reportCount >= 3.');

  console.log('--- All Filter & Tiering Simulation Tests Passed! ---');
}

runFilterSimTests().catch((err) => {
  console.error('Filter simulation failed:', err);
  process.exit(1);
});
