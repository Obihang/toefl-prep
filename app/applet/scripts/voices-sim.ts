import { inferGender, pickDialogueVoices, pickSingleVoice, NEURAL_FEMALE_VOICES, NEURAL_MALE_VOICES } from '../src/utils/voices.ts';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`Assertion failed: ${msg}`);
    process.exit(1);
  }
}

console.log('Running voices simulation tests...');

// 1. Specific name test cases
assert(inferGender('Professor Vance') === 'male', 'Professor Vance should be male');
assert(inferGender('Mr. Vance') === 'male', 'Mr. Vance should be male');
assert(inferGender('Male Professor') === 'male', 'Male Professor should be male');
assert(inferGender('Student (Chloe)') === 'female', 'Student (Chloe) should be female');
assert(inferGender('Dr. Campbell') === 'unknown', 'Dr. Campbell should be unknown');
assert(inferGender('Ms. Patel') === 'female', 'Ms. Patel should be female');
assert(inferGender('Mr. Chen') === 'male', 'Mr. Chen should be male');
assert(inferGender('Madam Curie') === 'female', 'Madam Curie should be female');
console.log('Name inference test cases passed.');

// 2. Determinism and stability tests
const seed = 'test-task-123';
const call1 = pickDialogueVoices(seed, 'female', 'male');
const call2 = pickDialogueVoices(seed, 'female', 'male');
const call3 = pickDialogueVoices(seed, 'female', 'male');

assert(call1.A === call2.A && call1.B === call2.B, 'Call 1 and 2 must match');
assert(call2.A === call3.A && call2.B === call3.B, 'Call 2 and 3 must match');
assert(call1.A !== call1.B, 'Speaker A and B must differ');

assert((NEURAL_FEMALE_VOICES as readonly string[]).includes(call1.A), 'Speaker A must be female voice');
assert((NEURAL_MALE_VOICES as readonly string[]).includes(call1.B), 'Speaker B must be male voice');

const single1 = pickSingleVoice('single-123', 'female');
const single2 = pickSingleVoice('single-123', 'female');
assert(single1 === single2, 'Single voice pick must be deterministic');
assert((NEURAL_FEMALE_VOICES as readonly string[]).includes(single1), 'Single voice must be in NEURAL_FEMALE_VOICES');

console.log('All voices simulation tests passed successfully!');

// 3. Consistency across sentence indexes (using same seed)
const taskSeed = 'ConsistencyTask|ProfX';
const vA = pickSingleVoice(taskSeed, 'male');
const vB = pickSingleVoice(taskSeed, 'male'); // simulate different sentence call
assert(vA === vB, 'Same seed should return consistent voice across sentence calls');

process.exit(0);
