import assert from 'assert';
import { inferTopic } from '../src/utils/inferTopic.ts';
import { ACADEMIC_TOPICS, isValidAcademicTopic, AcademicTopic } from '../src/constants/filters.ts';

async function runTopicInferSim() {
  console.log('--- Starting Topic Inference Simulation Test Suite ---');

  // Verify that ACADEMIC_TOPICS contains only valid topics and never 'all' or 'general'
  assert.ok(!ACADEMIC_TOPICS.includes('all' as any), 'ACADEMIC_TOPICS must not include "all"');
  assert.ok(!ACADEMIC_TOPICS.includes('general' as any), 'ACADEMIC_TOPICS must not include "general"');

  const testCases: Array<{ topic: AcademicTopic; task: any; description: string }> = [
    // 1. Science & Tech (3 cases)
    {
      topic: 'science-tech',
      description: 'Astronomy & Telescope Passage',
      task: {
        title: 'Deep Space Observation',
        passage: 'Recent advances in telescope technology have enabled astronomers to observe distant galaxies and study the origins of the universe using advanced algorithms.',
      },
    },
    {
      topic: 'science-tech',
      description: 'Quantum Mechanics Lecture',
      task: {
        prompt: 'In this physics lecture, the professor discusses quantum particles, gravity, and molecular structures in a laboratory setting.',
      },
    },
    {
      topic: 'science-tech',
      description: 'Cellular Genetics & DNA',
      task: {
        situation: 'Biologists examined cellular division, genetic evolution, and DNA sequencing in microscopic organisms.',
      },
    },

    // 2. Campus Life (3 cases)
    {
      topic: 'campus-life',
      description: 'Dormitory & Roommate Policy',
      task: {
        title: 'Housing Assignment Changes',
        passage: 'Students living in the dormitory must contact the registrar and their advisor before requesting a roommate change for the upcoming semester.',
      },
    },
    {
      topic: 'campus-life',
      description: 'Office Hours & Syllabus',
      task: {
        prompt: 'The professor announced updated office hours in the course syllabus, encouraging undergraduates to discuss textbook coursework.',
      },
    },
    {
      topic: 'campus-life',
      description: 'Library & Cafeteria Facilities',
      task: {
        situation: 'Student council members met at the campus cafeteria to organize library study groups before the final exam.',
      },
    },

    // 3. Social Sciences (3 cases)
    {
      topic: 'social-sciences',
      description: 'Ancient Archaeology & Artifacts',
      task: {
        title: 'Excavation of Ancient Civilizations',
        passage: 'Archaeologists discovered historical artifacts from an ancient empire, shedding light on societal migration and cultural traditions.',
      },
    },
    {
      topic: 'social-sciences',
      description: 'Government & Constitutional Treaty',
      task: {
        prompt: 'Historians analyzed the colonial treaty and the societal impact of the revolution on government policy.',
      },
    },
    {
      topic: 'social-sciences',
      description: 'Anthropology & Cultural Dynasty',
      task: {
        situation: 'The anthropology seminar investigated medieval dynasties and demographic shifts across Eurasian civilizations.',
      },
    },

    // 4. Environment (3 cases)
    {
      topic: 'environment',
      description: 'Coral Reef & Marine Ecosystems',
      task: {
        title: 'Marine Conservation Strategies',
        passage: 'Ecosystem degradation and ocean pollution threaten marine biodiversity and coral reef habitats worldwide.',
      },
    },
    {
      topic: 'environment',
      description: 'Global Warming & Greenhouse Emissions',
      task: {
        prompt: 'Scientists monitor glacier melting, deforestation, carbon emissions, and sustainable renewable energy solutions.',
      },
    },
    {
      topic: 'environment',
      description: 'Wetland Erosion & Drought',
      task: {
        situation: 'Ecological researchers reported severe wetland drought and soil erosion due to atmospheric climate shifts.',
      },
    },

    // 5. Business & Economics (3 cases)
    {
      topic: 'business-economics',
      description: 'Market Inflation & Consumer Prices',
      task: {
        title: 'Central Bank Interest Rates',
        passage: 'Economic analysts forecast that consumer inflation and supply shortages will impact corporate profit margins and retail commerce.',
      },
    },
    {
      topic: 'business-economics',
      description: 'Startup Entrepreneurship & Investment',
      task: {
        prompt: 'The venture capital firm evaluated investment proposals from financial entrepreneurs seeking stock market funding.',
      },
    },
    {
      topic: 'business-economics',
      description: 'Corporate Fiscal Policy & Trade',
      task: {
        situation: 'Executives discussed global trade tariffs, revenue forecasts, monetary regulations, and commercial capitalism.',
      },
    },

    // 6. Arts & Humanities (3 cases)
    {
      topic: 'arts-humanities',
      description: 'Renaissance Painting & Museum Gallery',
      task: {
        title: 'Exhibition of Italian Renaissance Masterpieces',
        passage: 'The art museum opened a gallery featuring baroque oil paintings, aesthetic sculptures, and portraits by European artists.',
      },
    },
    {
      topic: 'arts-humanities',
      description: 'Literary Philosophy & Novelists',
      task: {
        prompt: 'A literature professor analyzed existential philosophy in nineteenth-century novels, examining how the novelist conveys human emotion.',
      },
    },
    {
      topic: 'arts-humanities',
      description: 'Theatrical Drama & Symphony',
      task: {
        situation: 'The composer conducted a dramatic symphony accompanied by classical poetry and theatrical stage design.',
      },
    },
  ];

  console.log(`Running ${testCases.length} targeted test cases across all 6 topics...`);
  let count = 0;
  for (const tc of testCases) {
    count++;
    const inferred = inferTopic(tc.task);
    assert.strictEqual(
      inferred,
      tc.topic,
      `[Test ${count}] Failed for "${tc.description}": expected ${tc.topic}, got ${inferred}`
    );
    assert.ok(isValidAcademicTopic(inferred), `[Test ${count}] Must be a canonical academic topic`);
    assert.notStrictEqual(inferred, 'all', `[Test ${count}] Inferred topic must never be "all"`);
    assert.notStrictEqual(inferred, 'general', `[Test ${count}] Inferred topic must never be "general"`);
    console.log(`  PASS [${count}/18]: ${tc.topic} -> "${tc.description}"`);
  }

  // Edge cases: null, undefined, empty object, random text
  console.log('[Edge Cases] Testing empty, null, and fallback behaviors...');
  const emptyRes = inferTopic({});
  assert.ok(isValidAcademicTopic(emptyRes), 'Empty object should return valid topic');
  assert.notStrictEqual(emptyRes, 'all');
  assert.notStrictEqual(emptyRes, 'general');

  const nullRes = inferTopic(null);
  assert.ok(isValidAcademicTopic(nullRes), 'Null should return valid topic');

  const undefinedRes = inferTopic(undefined);
  assert.ok(isValidAcademicTopic(undefinedRes), 'Undefined should return valid topic');

  console.log('--- All Topic Inference Simulation Tests Passed! (18+ assertions verified) ---');
}

runTopicInferSim().catch((err) => {
  console.error('Topic inference simulation failed:', err);
  process.exit(1);
});
