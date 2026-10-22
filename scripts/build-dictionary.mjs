import fs from 'fs';
const dir = 'node_modules/wordnet-db/dict/';
const POS = { noun: 'n', verb: 'v', adj: 'a', adv: 'r' };
const NAME = { n: 'noun', v: 'verb', a: 'adjective', r: 'adverb' };
const synsets = Object.create(null);

for (const [file, p] of Object.entries(POS)) {
  for (const line of fs.readFileSync(dir + 'data.' + file, 'utf8').split('\n')) {
    if (!line || line.startsWith('  ')) continue;
    const [head, gloss] = line.split(' | ');
    if (!gloss) continue;
    const f = head.split(' ');
    const wcnt = parseInt(f[3], 16);
    const words = [];
    for (let i = 0; i < wcnt; i++) words.push(f[4 + i * 2].replace(/\(.*\)$/, '').replace(/_/g, ' '));
    const parts = gloss.split(';').map(s => s.trim());
    const def = parts.filter(s => !s.startsWith('"'))[0];
    const ex = (gloss.match(/"([^"]+)"/) || [])[1] || '';
    synsets[p + f[0]] = { words, def, ex };
  }
}

const dict = Object.create(null);
for (const [file, p] of Object.entries(POS)) {
  for (const line of fs.readFileSync(dir + 'index.' + file, 'utf8').split('\n')) {
    if (!line || line.startsWith('  ')) continue;
    const f = line.split(' ');
    const lemma = f[0].toLowerCase();
    if (lemma.includes('_') || lemma.includes('-')) continue;
    const synCnt = parseInt(f[2], 10), ptrCnt = parseInt(f[3], 10);
    const offsets = f.slice(6 + ptrCnt, 6 + ptrCnt + synCnt);
    const senses = offsets.slice(0, 4).map(o => {
      const s = synsets[p + o];
      if (!s) return null;
      return [NAME[p], s.def, s.ex, s.words.filter(w => w.toLowerCase() !== lemma).slice(0, 4)];
    }).filter(Boolean);
    if (senses.length > 0) {
      (dict[lemma] ||= []).push(...senses);
    }
  }
}

const shards = Object.create(null);
for (const [k, v] of Object.entries(dict)) {
  // Group non-a-z characters into a 'misc' shard
  const firstLetter = /^[a-z]/i.test(k[0]) ? k[0] : 'misc';
  (shards[firstLetter] ||= Object.create(null))[k] = v;
}

fs.mkdirSync('public/dict', { recursive: true });
for (const [l, d] of Object.entries(shards)) {
  fs.writeFileSync('public/dict/' + l + '.json', JSON.stringify(d));
}
console.log('WordNet dictionary build completed successfully.');
