import {
  rankModelsForRole,
  markModelDead,
  clearDeadModels,
  clearModelChainsCache,
  resolveModelChains,
} from '../src/server/modelRoles.ts';

console.log('Running Model Resolution & Discovery Simulation...');

async function main() {
  clearDeadModels();
  clearModelChainsCache();

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

  // gpt-oss is top family, generation prefers 20b
  if (!genRanked[0]?.includes('20b') && !genRanked[0]?.includes('8b')) {
    console.error('FAIL: Generation role did not prefer cheapest/fastest model.');
    process.exit(1);
  }

  // evaluation prefers 120b
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
  clearDeadModels();

  // Test 3: Retired IDs ban check
  const retiredIds = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'google/gemini-2.5-flash-lite:free'];
  for (const retId of retiredIds) {
    if (genRanked.includes(retId) || evalRanked.includes(retId)) {
      console.error(`FAIL: Retired ID ${retId} was selected!`);
      process.exit(1);
    }
  }

  // Requirement 2 Cases:
  // Case 1: "gemini-4-argon" and "deep-research-pro-preview-12-2025" must never be chosen when stable gemini-*-flash/pro models exist
  console.log('\n[Case 1] gemini-4-argon and deep-research-pro-preview must never be chosen over stable models');
  const geminiMixedList = [
    'gemini-4-argon',
    'deep-research-pro-preview-12-2025',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
  ];
  const geminiGenRanked = rankModelsForRole('gemini', geminiMixedList, 'generation');
  const geminiEvalRanked = rankModelsForRole('gemini', geminiMixedList, 'evaluation');
  console.log('Gemini Mixed Generation Ranked:', geminiGenRanked);
  console.log('Gemini Mixed Evaluation Ranked:', geminiEvalRanked);

  if (geminiGenRanked[0] === 'gemini-4-argon' || geminiGenRanked[0] === 'deep-research-pro-preview-12-2025') {
    console.error('FAIL: Excluded codename was chosen over stable Gemini models in generation!');
    process.exit(1);
  }
  if (geminiEvalRanked[0] === 'gemini-4-argon' || geminiEvalRanked[0] === 'deep-research-pro-preview-12-2025') {
    console.error('FAIL: Excluded codename was chosen over stable Gemini models in evaluation!');
    process.exit(1);
  }
  console.log('PASS: Excluded codenames dropped, stable Gemini models chosen.');

  // Case 2: A Gemini list containing only preview models must still choose something
  console.log('\n[Case 2] A Gemini list containing only preview models must still choose something');
  const previewOnly = ['gemini-2.0-flash-preview', 'gemini-1.5-pro-preview'];
  const previewGen = rankModelsForRole('gemini', previewOnly, 'generation');
  const previewEval = rankModelsForRole('gemini', previewOnly, 'evaluation');
  console.log('Preview only Generation:', previewGen);
  console.log('Preview only Evaluation:', previewEval);

  if (previewGen.length === 0 || !previewGen[0]) {
    console.error('FAIL: Preview-only Gemini list did not choose any model in generation!');
    process.exit(1);
  }
  if (previewEval.length === 0 || !previewEval[0]) {
    console.error('FAIL: Preview-only Gemini list did not choose any model in evaluation!');
    process.exit(1);
  }
  if (previewGen[0] !== 'gemini-2.0-flash-preview') {
    console.error(`FAIL: Preview generation expected gemini-2.0-flash-preview, got ${previewGen[0]}`);
    process.exit(1);
  }
  console.log('PASS: Preview-only Gemini list chose valid preview model.');

  // Case 3: "ai21labs/jamba-1.5-large-instruct" must lose to a llama or gpt-oss model
  console.log('\n[Case 3] ai21labs/jamba-1.5-large-instruct must lose to a llama or gpt-oss model');
  const jambaVsLlama = ['ai21labs/jamba-1.5-large-instruct', 'meta/llama-3.1-8b-instruct'];
  const jambaRanked = rankModelsForRole('nvidia', jambaVsLlama, 'generation');
  console.log('Jamba vs Llama Generation Ranked:', jambaRanked);
  if (jambaRanked[0] !== 'meta/llama-3.1-8b-instruct') {
    console.error(`FAIL: Jamba did not lose to llama model! Winner was ${jambaRanked[0]}`);
    process.exit(1);
  }

  const jambaVsGptOss = ['ai21labs/jamba-1.5-large-instruct:free', 'openai/gpt-oss-20b:free'];
  const jambaGptRanked = rankModelsForRole('openrouter', jambaVsGptOss, 'generation');
  console.log('Jamba vs GPT-OSS Generation Ranked:', jambaGptRanked);
  if (jambaGptRanked[0] !== 'openai/gpt-oss-20b:free') {
    console.error(`FAIL: Jamba did not lose to gpt-oss model! Winner was ${jambaGptRanked[0]}`);
    process.exit(1);
  }
  console.log('PASS: Jamba model loses to Llama and GPT-OSS models as required.');

  // Case 4: An OpenRouter entry with name "Google: Gemma 4 26B A4B (free)" and id "google/gemma-4-26b-a4b-it:free" must produce the id
  console.log('\n[Case 4] OpenRouter entry with display name and model id must produce the id');
  const origFetch = globalThis.fetch;
  try {
    (globalThis as any).fetch = async () => {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: 'google/gemma-4-26b-a4b-it:free',
              name: 'Google: Gemma 4 26B A4B (free)',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    clearModelChainsCache();
    const chains = await resolveModelChains('openrouter', 'sk-or-v1-mock-test-key-or', true);
    console.log('OpenRouter resolved chains:', chains);

    if (!chains.all.includes('google/gemma-4-26b-a4b-it:free')) {
      console.error('FAIL: OpenRouter model id was not extracted into chains.all!');
      process.exit(1);
    }
    if (chains.all.includes('Google: Gemma 4 26B A4B (free)')) {
      console.error('FAIL: OpenRouter human display name was used as model ID!');
      process.exit(1);
    }
    if (chains.generation[0] !== 'google/gemma-4-26b-a4b-it:free') {
      console.error(`FAIL: OpenRouter did not pick the id google/gemma-4-26b-a4b-it:free, got: ${chains.generation[0]}`);
      process.exit(1);
    }
    console.log('PASS: OpenRouter entry produced model ID, never display name.');
  } finally {
    globalThis.fetch = origFetch;
  }

  console.log('\nPASS: All Model Resolution & Discovery Simulation tests completed successfully! 🎉');
  process.exit(0);
}

main().catch((err) => {
  console.error('FATAL ERROR in simulation:', err);
  process.exit(1);
});
