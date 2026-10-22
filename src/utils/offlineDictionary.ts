import { openDB } from 'idb';

const shardCache = new Map<string, Record<string, any>>();

const BLOCKED_KEYS = new Set(['constructor', '__proto__', 'prototype', 'tojson', 'tostring', 'valueof', 'hasownproperty']);

const IRREGULAR_FORMS: Record<string, string> = {
  went: 'go', gone: 'go', ran: 'run', children: 'child', better: 'good', best: 'good',
  worse: 'bad', worst: 'bad', feet: 'foot', teeth: 'tooth', mice: 'mouse', geese: 'goose',
  men: 'man', women: 'woman', people: 'person', bought: 'buy', brought: 'bring', caught: 'catch',
  fought: 'fight', found: 'find', heard: 'hear', held: 'hold', kept: 'keep', knew: 'know',
  left: 'leave', lost: 'lose', made: 'make', met: 'meet', paid: 'pay', read: 'read',
  said: 'say', saw: 'see', sold: 'sell', sent: 'send', sat: 'sit', spoke: 'speak',
  stood: 'stand', took: 'take', told: 'tell', thought: 'think', understood: 'understand',
  wore: 'wear', won: 'win', wrote: 'write'
};

async function loadShard(letter: string): Promise<Record<string, any> | null> {
  const safeLetter = /^[a-z]$/i.test(letter) ? letter.toLowerCase() : 'misc';
  if (shardCache.has(safeLetter)) {
    return shardCache.get(safeLetter)!;
  }
  try {
    const res = await fetch(`/dict/${safeLetter}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    shardCache.set(safeLetter, data);
    return data;
  } catch {
    return null;
  }
}

export async function lookupOffline(word: string, contextPos?: string | null) {
  const clean = word.trim().toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, '');
  if (!clean || BLOCKED_KEYS.has(clean)) return null;

  const candidates: string[] = [];
  if (IRREGULAR_FORMS[clean]) {
    candidates.push(IRREGULAR_FORMS[clean]);
  }
  candidates.push(clean);

  if (clean.endsWith('ly') && clean.length > 3) candidates.push(clean.slice(0, -2));
  if (clean.endsWith('ing') && clean.length > 4) candidates.push(clean.slice(0, -3), clean.slice(0, -3) + 'e');
  if (clean.endsWith('ed') && clean.length > 3) candidates.push(clean.slice(0, -2), clean.slice(0, -1));
  if (clean.endsWith('s') && !clean.endsWith('ss') && clean.length > 3) candidates.push(clean.slice(0, -1));

  const uniqueCandidates = Array.from(new Set(candidates));

  for (const cand of uniqueCandidates) {
    if (!cand || BLOCKED_KEYS.has(cand)) continue;
    const firstLetter = /^[a-z]$/i.test(cand[0]) ? cand[0].toLowerCase() : 'misc';
    const shard = await loadShard(firstLetter);
    if (shard && Object.hasOwn(shard, cand)) {
      const entryArray = shard[cand]; // Array of [pos, def, ex, synonyms[]]
      if (Array.isArray(entryArray) && entryArray.length > 0) {
        const rawMeanings = entryArray.map((sense: any) => ({
          partOfSpeech: sense[0] || 'noun',
          definition: sense[1] || '',
          example: sense[2] || '',
          synonyms: sense[3] || [],
        }));

        let sortedMeanings = rawMeanings;
        if (contextPos) {
          const matchedPos = contextPos.toLowerCase();
          const matching = rawMeanings.filter((m: any) => m.partOfSpeech.toLowerCase().startsWith(matchedPos));
          const others = rawMeanings.filter((m: any) => !m.partOfSpeech.toLowerCase().startsWith(matchedPos));
          sortedMeanings = [...matching, ...others];
        }

        return {
          word: cand,
          phonetic: '',
          meanings: sortedMeanings,
          synonyms: rawMeanings.flatMap((m: any) => m.synonyms || []).slice(0, 5),
          examples: rawMeanings.map((m: any) => m.example).filter(Boolean),
          source: 'wordnet',
          lookupWord: clean,
          contextPos: contextPos || null,
        };
      }
    }
  }

  return null;
}

export interface DownloadProgress {
  stage: 'idle' | 'downloading' | 'indexing' | 'ready' | 'error';
  percent: number;
  message: string;
  count?: number;
  total?: number;
}

export async function getOfflineWordCount(): Promise<number> {
  return 115000;
}

export async function clearOfflineDictionary(): Promise<void> {
  shardCache.clear();
}

export function startOfflineDictionaryDownload(onProgress: (p: DownloadProgress) => void) {
  onProgress({ stage: 'ready', percent: 100, message: 'WordNet dictionary is built-in.' });
  return () => {};
}

export function getLookupCandidates(word: string): string[] {
  const clean = word.trim().toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, '');
  if (!clean) return [];
  return [clean];
}

const CACHE_DB = 'toefl_online_dict_cache';
const CACHE_STORE = 'cache';

async function getCacheDb() {
  return openDB(CACHE_DB, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE);
      }
    },
  });
}

export async function getCachedOnlineDefinition(word: string): Promise<any | null> {
  try {
    const db = await getCacheDb();
    return await db.get(CACHE_STORE, word.toLowerCase());
  } catch {
    return null;
  }
}

export async function cacheOnlineDefinition(word: string, data: any): Promise<void> {
  try {
    const db = await getCacheDb();
    await db.put(CACHE_STORE, data, word.toLowerCase());
  } catch {
    // ignore
  }
}
