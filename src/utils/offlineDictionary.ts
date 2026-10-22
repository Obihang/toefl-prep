import { ACADEMIC_GLOSSARY } from './academicGlossary';

const DB_NAME = 'toefl_offline_dictionary';
const DB_VERSION = 1;
const STORE_NAME = 'offline_dictionary';

export interface OfflineMeaning {
  partOfSpeech: string;
  definition: string;
  example?: string;
  indexInGroup?: number;
}

export interface OfflineEntry {
  word: string;
  phonetic?: string;
  meanings: OfflineMeaning[];
  synonyms?: string[];
  antonyms?: string[];
  examples?: string[];
  source: 'indexeddb' | 'offline_glossary' | 'not_downloaded';
}

export interface DownloadProgress {
  stage: 'idle' | 'downloading' | 'indexing' | 'ready' | 'error';
  percent: number;
  message: string;
  count?: number;
  total?: number;
}

/**
 * Opens and initializes the IndexedDB database for offline dictionary storage.
 */
export function openDictionaryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not supported in this environment'));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'word' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open dictionary database'));
  });
}

/**
 * Returns total count of words indexed in IndexedDB.
 */
export async function getOfflineWordCount(): Promise<number> {
  try {
    const db = await openDictionaryDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

/**
 * Checks whether the offline dictionary is downloaded (e.g. > 10,000 words).
 */
export async function isOfflineDictionaryInstalled(): Promise<boolean> {
  const count = await getOfflineWordCount();
  return count > 10000;
}

/**
 * Clears the offline dictionary IndexedDB store.
 */
export async function clearOfflineDictionary(): Promise<void> {
  try {
    const db = await openDictionaryDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => {
        window.dispatchEvent(new CustomEvent('offlineDictionaryUpdated'));
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Failed to clear offline dictionary:', err);
  }
}

/**
 * Basic suffix lemmatization for dictionary lookups (-ing, -ed, -s, -es, -ies).
 */
export function getLookupCandidates(word: string): string[] {
  const w = word.trim().toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, '');
  if (!w) return [];
  const list = [w];

  if (w.endsWith('ly') && w.length > 4) {
    const stem = w.slice(0, -2);
    list.push(stem); // aggressively -> aggressive
    if (stem.endsWith('i')) list.push(stem.slice(0, -1) + 'y'); // happily -> happy
  } else if (w.endsWith('ing') && w.length > 4) {
    const stem = w.slice(0, -3);
    if (/([bdfgklmnprstz])\1$/.test(stem)) list.push(stem.slice(0, -1)); // running -> run
    list.push(stem); // clicking -> click
    list.push(stem + 'e'); // writing -> write
  } else if (w.endsWith('ed') && w.length > 3) {
    if (w.endsWith('ied')) list.push(w.slice(0, -3) + 'y'); // studied -> study
    const stem = w.slice(0, -2);
    if (/([bdfgklmnprstz])\1$/.test(stem)) list.push(stem.slice(0, -1)); // stopped -> stop
    list.push(stem); // walked -> walk
    list.push(w.slice(0, -1)); // liked -> like
  } else if (w.endsWith('ies') && w.length > 4) {
    list.push(w.slice(0, -3) + 'y'); // municipalities -> municipality
  } else if (w.endsWith('es') && w.length > 4) {
    list.push(w.slice(0, -2)); // watches -> watch
    list.push(w.slice(0, -1)); // zones -> zone
  } else if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) {
    list.push(w.slice(0, -1)); // words -> word
  }

  return Array.from(new Set(list));
}

/**
 * Infers Part of Speech from definition text for grouping (Noun, Verb, Adjective, etc.).
 */
function inferPosFromSense(senseText: string, word: string): string {
  const w = word.toLowerCase();
  if (w.endsWith('ly')) return 'adverb';

  const s = senseText.trim().toLowerCase();
  if (/^to\s+[a-z]/i.test(s)) return 'verb';
  if (/^(of or belonging to|belonging to|relating to|characteristic of|pertaining to|having|causing|resulting in|conferring|rashly|inattentive|heedless|useful|capable of)/i.test(s)) {
    return 'adjective';
  }
  if (/^(a|an|the|one who|one that|one holding|that which|any|state of|quality of|act of|process of)\b/i.test(s)) {
    return 'noun';
  }
  if (/\b\w+ly\b/i.test(s) && /^in a\b/i.test(s)) return 'adverb';

  if (/\b\w+(ic|al|an|ar|ive|ous|less|able|ible|ful|ial|ical|ish|ary|ent|ant)\b/i.test(word)) return 'adjective';
  if (/^(ize|ise|ify|ate)\b/i.test(word)) return 'verb';
  return 'noun';
}

/**
 * Parses Webster's Dictionary raw string into structured grouped meanings.
 */
export function parseRawWebsterDefinition(word: string, raw: string): { meanings: OfflineMeaning[]; synonyms: string[]; examples: string[] } {
  if (!raw) return { meanings: [], synonyms: [], examples: [] };

  // 1. Extract Synonyms
  let synonyms: string[] = [];
  const synMatch = raw.match(/Syn\.\s*--\s*([^.]+)/i);
  if (synMatch) {
    synonyms = synMatch[1]
      .split(/;|,/)
      .map((s) => s.trim())
      .filter((s) => s.length > 1 && !s.toLowerCase().includes('see '));
  }

  const cleanRaw = raw.replace(/Syn\.\s*--[\s\S]*$/i, '').trim();

  // 2. Split on numbered senses: "1. ... 2. ..."
  const chunks = cleanRaw.split(/(?=(?:^|\s)\d+\.\s+)/).map((c) => c.trim()).filter(Boolean);
  const rawSenses: string[] = [];

  for (const chunk of chunks) {
    const clean = chunk.replace(/^\d+\.\s*/, '').trim();
    if (clean) rawSenses.push(clean);
  }

  if (rawSenses.length === 0) {
    rawSenses.push(cleanRaw);
  }

  // 3. Group by Part of Speech (Noun 1, Noun 2, Verb 1, etc.)
  const posCounters: Record<string, number> = {};
  const meanings: OfflineMeaning[] = [];
  const examples: string[] = [];

  for (const sense of rawSenses) {
    // Extract generic example if present in quotes or "as, ..."
    let example = '';
    const quoteMatch = sense.match(/"([^"]{4,80})"/);
    if (quoteMatch) {
      example = quoteMatch[1].trim();
    } else {
      const asMatch = sense.match(/;\s*as,\s*([^.;]+)[.;]/i);
      if (asMatch) {
        example = asMatch[1].trim();
      }
    }

    if (example && !examples.includes(example)) {
      examples.push(example);
    }

    // Clean definition text by removing bracketed/parenthetical tags like (Feudal Law), (Mil.), etc.
    let cleanSense = sense
      .replace(/^\([^)]+\)\s*/g, '')
      .replace(/"[^"]*"/g, '')
      .replace(/;\s*as,\s*[^.;]+[.;]/gi, '.')
      .replace(/\s{2,}/g, ' ')
      .trim();

    // Split by first period or semicolon to get 1-liner
    const parts = cleanSense.split(/[.;]/);
    let shortDef = parts[0] ? parts[0].trim() : cleanSense;

    // Strip leading/trailing bracketed tags again if any
    shortDef = shortDef.replace(/^\([^)]+\)\s*/g, '').trim();

    // Strip trailing author references
    shortDef = shortDef.replace(/\b(?:Shak|Milton|Locke|Chaucer|Swift|Hume|Bacon|Dryden|Addison|Pope|Cowper|Spenser|Gower|Wyclif)\b\.?/gi, '').trim();

    if (!shortDef || /^(mil|obs|rare|archaic)\.?$/i.test(shortDef)) {
      continue;
    }

    // Filter out historical proper nouns / encyclopedia references
    if (/\b(Aristotle|Plato|Shakespeare|Feudal|Milton|Hume|Chaucer|Swift)\b/i.test(shortDef)) {
      continue;
    }

    if (shortDef) {
      shortDef = shortDef.charAt(0).toUpperCase() + shortDef.slice(1);
      if (!shortDef.endsWith('.')) {
        shortDef += '.';
      }
    } else {
      continue;
    }

    const pos = inferPosFromSense(shortDef, word);
    posCounters[pos] = (posCounters[pos] || 0) + 1;

    if (!meanings.some(m => m.definition.toLowerCase() === shortDef.toLowerCase())) {
      meanings.push({
        partOfSpeech: pos,
        definition: shortDef,
        example: example || undefined,
        indexInGroup: posCounters[pos],
      });
    }
  }

  return { meanings: meanings.slice(0, 4), synonyms, examples };
}

/**
 * Looks up a word strictly in IndexedDB offline dictionary, falling back to ACADEMIC_GLOSSARY.
 */
export async function getOfflineDefinition(word: string): Promise<OfflineEntry | null> {
  const normalized = word.trim().toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, '');
  if (!normalized) return null;

  // 1. Check local ACADEMIC_GLOSSARY first for instantaneous curated TOEFL entries
  if (ACADEMIC_GLOSSARY[normalized]) {
    const item = ACADEMIC_GLOSSARY[normalized];
    return {
      word: normalized,
      phonetic: '',
      meanings: [
        {
          partOfSpeech: item.partOfSpeech || 'adjective',
          definition: item.definition,
          indexInGroup: 1,
        },
      ],
      synonyms: item.synonyms || [],
      examples: [`A standard academic usage of "${normalized}".`],
      source: 'offline_glossary',
    };
  }

  // 2. Query IndexedDB
  const candidates = getLookupCandidates(normalized);
  try {
    const db = await openDictionaryDb();
    for (const cand of candidates) {
      const rawText = await new Promise<string | null>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(cand);
        req.onsuccess = () => resolve(req.result?.definition || null);
        req.onerror = () => resolve(null);
      });

      if (rawText) {
        const { meanings, synonyms, examples } = parseRawWebsterDefinition(cand, rawText);
        return {
          word: cand,
          phonetic: '',
          meanings,
          synonyms,
          examples,
          source: 'indexeddb',
        };
      }
    }
  } catch (err) {
    console.warn('Offline dictionary IndexedDB query error:', err);
  }

  // 3. Fallback: check candidate stems in ACADEMIC_GLOSSARY
  for (const cand of candidates) {
    if (cand !== normalized && ACADEMIC_GLOSSARY[cand]) {
      const item = ACADEMIC_GLOSSARY[cand];
      return {
        word: cand,
        phonetic: '',
        meanings: [
          {
            partOfSpeech: item.partOfSpeech || 'verb',
            definition: item.definition,
            indexInGroup: 1,
          },
        ],
        synonyms: item.synonyms || [],
        examples: [`A standard academic usage of "${cand}".`],
        source: 'offline_glossary',
      };
    }
  }

  return null;
}

/**
 * Downloads comprehensive 100,000+ word dictionary JSON in a Web Worker and bulk-indexes into IndexedDB.
 */
export function startOfflineDictionaryDownload(
  onProgress: (progress: DownloadProgress) => void
): () => void {
  // Web Worker script as self-contained inline code
  const workerCode = `
    const DB_NAME = 'toefl_offline_dictionary';
    const DB_VERSION = 1;
    const STORE_NAME = 'offline_dictionary';
    const DICT_URL = 'https://raw.githubusercontent.com/matthewreagan/WebstersEnglishDictionary/master/dictionary_compact.json';

    function openDb() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'word' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    async function run() {
      try {
        self.postMessage({ type: 'PROGRESS', stage: 'downloading', percent: 10, message: 'Downloading dictionary package (~5MB)...' });
        
        const response = await fetch(DICT_URL);
        if (!response.ok) {
          throw new Error('Failed to fetch dictionary: HTTP ' + response.status);
        }

        self.postMessage({ type: 'PROGRESS', stage: 'downloading', percent: 40, message: 'Parsing 100,000+ English words...' });
        const data = await response.json();
        const keys = Object.keys(data);
        const total = keys.length;

        if (total === 0) {
          throw new Error('Dictionary JSON contained no entries');
        }

        self.postMessage({ type: 'PROGRESS', stage: 'indexing', percent: 50, message: 'Opening database...', total, count: 0 });
        const db = await openDb();

        const BATCH_SIZE = 2500;
        let inserted = 0;

        for (let i = 0; i < total; i += BATCH_SIZE) {
          const batchKeys = keys.slice(i, i + BATCH_SIZE);
          await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            
            for (const key of batchKeys) {
              const cleanWord = key.toLowerCase().trim();
              const def = data[key];
              if (cleanWord && def) {
                store.put({ word: cleanWord, definition: String(def) });
              }
            }

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });

          inserted += batchKeys.length;
          const pct = Math.min(99, 50 + Math.floor((inserted / total) * 49));
          self.postMessage({
            type: 'PROGRESS',
            stage: 'indexing',
            percent: pct,
            message: 'Indexing Database ' + pct + '% (' + inserted.toLocaleString() + ' / ' + total.toLocaleString() + ' words)...',
            count: inserted,
            total
          });
        }

        self.postMessage({
          type: 'SUCCESS',
          stage: 'ready',
          percent: 100,
          message: 'Cached Offline ✅ (' + total.toLocaleString() + ' words)',
          total
        });
      } catch (err) {
        self.postMessage({
          type: 'ERROR',
          stage: 'error',
          percent: 0,
          message: err?.message || 'Download failed'
        });
      }
    }

    run();
  `;

  let worker: Worker | null = null;
  try {
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    worker = new Worker(blobUrl);

    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'PROGRESS') {
        onProgress({
          stage: msg.stage,
          percent: msg.percent,
          message: msg.message,
          count: msg.count,
          total: msg.total,
        });
      } else if (msg.type === 'SUCCESS') {
        window.dispatchEvent(new CustomEvent('offlineDictionaryUpdated'));
        onProgress({
          stage: 'ready',
          percent: 100,
          message: msg.message,
          total: msg.total,
          count: msg.total,
        });
      } else if (msg.type === 'ERROR') {
        onProgress({
          stage: 'error',
          percent: 0,
          message: msg.message,
        });
      }
    };

    worker.onerror = (err) => {
      onProgress({
        stage: 'error',
        percent: 0,
        message: err.message || 'Worker error during dictionary download',
      });
    };
  } catch (err: any) {
    onProgress({
      stage: 'error',
      percent: 0,
      message: err?.message || 'Unable to start background download worker',
    });
  }

  // Return cancel function
  return () => {
    if (worker) {
      worker.terminate();
      worker = null;
    }
  };
}
