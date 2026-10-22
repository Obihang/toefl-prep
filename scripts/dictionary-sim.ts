import fs from 'fs';
import path from 'path';

const BLOCKED_KEYS = new Set(['constructor', '__proto__', 'prototype', 'tojson', 'tostring', 'valueof', 'hasownproperty']);

function loadShard(word: string) {
  const clean = word.trim().toLowerCase();
  if (BLOCKED_KEYS.has(clean)) return null;
  const firstLetter = /^[a-z]$/i.test(clean[0]) ? clean[0].toLowerCase() : 'misc';
  const shardPath = path.resolve(process.cwd(), `public/dict/${firstLetter}.json`);
  if (!fs.existsSync(shardPath)) return null;
  const shard = JSON.parse(fs.readFileSync(shardPath, 'utf8'));
  if (Object.hasOwn(shard, clean)) {
    return shard[clean];
  }
  return null;
}

function runSim() {
  console.log('Running Dictionary Simulation Tests (WordNet shards)...');

  const testWords = ['urban', 'empirical', 'mitigate', 'allocate', 'ubiquitous', 'hypothesis', 'bank'];
  for (const w of testWords) {
    const result = loadShard(w);
    if (!result || !Array.isArray(result) || result.length === 0) {
      throw new Error(`FAIL: Expected non-empty results for word "${w}", but got none.`);
    }
    console.log(`PASS: "${w}" returned ${result.length} senses.`);
    if (w === 'bank') {
      const firstSense = result[0];
      const def = String(firstSense[1]).toLowerCase();
      console.log(`Bank 1st sense definition: "${firstSense[1]}"`);
      if (def.includes('baseball') || def.includes('batter')) {
        throw new Error(`FAIL: First noun sense of "bank" should be about financial/geographical bank, not baseball.`);
      }
    }
  }

  const dangerWords = ['constructor', '__proto__', 'toString'];
  for (const w of dangerWords) {
    const result = loadShard(w);
    if (result !== null) {
      throw new Error(`FAIL: Expected null for prototype property "${w}", but got result.`);
    }
    console.log(`PASS: "${w}" correctly returned null/empty.`);
  }

  console.log('All Dictionary Simulation Tests PASSED successfully! 🎉');
}

runSim();
