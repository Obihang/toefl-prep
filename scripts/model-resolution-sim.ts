import { getRoleModels, markModelDead, rankModelsForRole } from '../src/server/modelRoles.ts';

console.log('Running Model Resolution & Discovery Simulation...');

// Test 1: Scoring rules and role preference
const groqIds = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'llama-3.1-8b-instruct', 'whisper-large-v3'];
const genRanked = rankModelsForRole('groq', groqIds, 'generation');
const evalRanked = rankModelsForRole('groq', groqIds, 'evaluation');

console.log('Groq Generation Ranked:', genRanked);
console.log('Groq Evaluation Ranked:', evalRanked);

if (genRanked.includes('llama-3.3-70b-versatile') || genRanked.includes('llama-3.1-8b-instant')) {
  console.error('FAIL: Retired model found in Groq generation ranking!');
  process.exit(1);
}

if (!genRanked[0]?.includes('8b') && !genRanked[0]?.includes('20b') && !genRanked[0]?.includes('oss-20b')) {
  console.error('FAIL: Generation role did not prefer cheapest/fastest model.');
  process.exit(1);
}

if (!evalRanked[0]?.includes('120b') && !evalRanked[0]?.includes('oss-120b')) {
  console.error('FAIL: Evaluation role did not prefer strongest model.');
  process.exit(1);
}

// Test 2: Dead model skipping
markModelDead('openai/gpt-oss-20b');
const genAfterDead = rankModelsForRole('groq', groqIds, 'generation');
console.log('Groq Generation after marking openai/gpt-oss-20b dead:', genAfterDead);

if (genAfterDead.includes('openai/gpt-oss-20b')) {
  console.error('FAIL: Dead model was not skipped.');
  process.exit(1);
}

// Test 3: Retired IDs ban check
const retiredIds = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'google/gemini-2.5-flash-lite:free'];
for (const retId of retiredIds) {
  if (genRanked.includes(retId) || evalRanked.includes(retId)) {
    console.error(`FAIL: Retired ID ${retId} was selected!`);
    process.exit(1);
  }
}

console.log('PASS: Model resolution and discovery simulation completed successfully! 🎉');
process.exit(0);
