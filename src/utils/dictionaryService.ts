import { ACADEMIC_GLOSSARY } from './academicGlossary';
import { lookupOffline, getCachedOnlineDefinition, cacheOnlineDefinition, getLookupCandidates } from './offlineDictionary';

export function lemmatizeWord(word: string): string[] {
  return getLookupCandidates(word);
}

export function detectPosInContext(word: string, contextSentence: string): 'v' | 'n' | 'adj' | 'adv' | null {
  const w = word.toLowerCase().trim();
  const c = contextSentence.toLowerCase();

  const hasAdjSuffix = /\b\w+(ic|al|an|ar|ive|ous|less|able|ible|ful|ial|ical|ish|ary|ent|ant)\b/.test(w);
  if (hasAdjSuffix) {
    if (new RegExp(`\\b${w}\\s+[a-zA-Z]+\\b`).test(c)) return 'adj';
    if (new RegExp(`\\b(is|are|was|were|seem|seems|seemed|become|becomes|became)\\s+${w}\\b`).test(c)) return 'adj';
  }

  if (new RegExp(`\\b(the|a|an|this|that|these|those|its|their|our|your)\\s+${w}\\s+[a-zA-Z]+\\b`).test(c)) return 'adj';

  if (w.endsWith('ing')) {
    if (
      new RegExp(`\\b(by|while|after|before|for|without|upon|when|is|was|are|were|be|been|am)\\s+${w}\\b`).test(c) ||
      new RegExp(`\\b${w}\\s+(the|a|an|this|that|these|those|your|my|his|her|its|our|their|some|any|[a-z]+)\\b`).test(c)
    ) {
      return 'v';
    }
  }

  if (new RegExp(`\\b(to|should|must|will|would|can|could|may|might|do|does|did|shall)\\s+${w}\\b`).test(c)) return 'v';
  if (new RegExp(`\\b(i|you|he|she|it|we|they)\\s+${w}\\b`).test(c)) return 'v';
  if (w.endsWith('ly')) return 'adv';

  if (/\b\w+(tion|sion|ment|ness|ity|ism|ance|ence|ship|dom)\b/.test(w)) return 'n';
  return null;
}

export function matchesPos(itemPos: string, detectedPos: 'v' | 'n' | 'adj' | 'adv' | null): boolean {
  if (!detectedPos) return false;
  const p = (itemPos || '').toLowerCase().trim();
  if (detectedPos === 'v') return p === 'v' || p.startsWith('verb');
  if (detectedPos === 'n') return p === 'n' || p.startsWith('noun');
  if (detectedPos === 'adj') return p === 'adj' || p.startsWith('adj');
  if (detectedPos === 'adv') return p === 'adv' || p.startsWith('adv');
  return false;
}

export async function getDefinition(word: string, context: string = '') {
  const cleanWord = word.trim().replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '').toLowerCase();
  if (!cleanWord) return null;

  const contextPos = detectPosInContext(word, context);

  // 1. ACADEMIC_GLOSSARY
  if (ACADEMIC_GLOSSARY[cleanWord]) {
    const item = ACADEMIC_GLOSSARY[cleanWord];
    return {
      word: cleanWord,
      phonetic: '',
      meanings: [{ partOfSpeech: item.partOfSpeech || 'noun', definition: item.definition, example: '', synonyms: item.synonyms || [] }],
      synonyms: item.synonyms || [],
      examples: [],
      source: 'academic_glossary',
      lookupWord: cleanWord,
      contextPos,
    };
  }

  // 2. Offline WordNet
  try {
    const wordNetRes = await lookupOffline(cleanWord, contextPos);
    if (wordNetRes && wordNetRes.meanings && wordNetRes.meanings.length > 0) {
      return wordNetRes;
    }
  } catch {
    // proceed
  }

  // 3. Cached online result in IndexedDB
  try {
    const cached = await getCachedOnlineDefinition(cleanWord);
    if (cached && cached.meanings && cached.meanings.length > 0) {
      return cached;
    }
  } catch {
    // proceed
  }

  // 4. Server /api/dictionary
  try {
    const res = await fetch(`/api/dictionary?word=${encodeURIComponent(cleanWord)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.meanings && data.meanings.length > 0) {
        const formatted = {
          word: cleanWord,
          phonetic: data.phonetic || '',
          meanings: data.meanings.map((m: any) => ({
            partOfSpeech: m.partOfSpeech || 'noun',
            definition: m.definition || '',
            example: m.example || '',
            synonyms: m.synonyms || [],
          })),
          synonyms: data.synonyms || [],
          examples: data.examples || [],
          source: data.source || 'server',
          lookupWord: cleanWord,
          contextPos,
        };
        await cacheOnlineDefinition(cleanWord, formatted);
        return formatted;
      }
    }
  } catch {
    // proceed
  }

  // 5. Direct dictionaryapi call
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const entry = data[0];
        const phonetic = entry.phonetic || (entry.phonetics && entry.phonetics.find((p: any) => p.text)?.text) || '';
        const meanings: Array<{ partOfSpeech: string; definition: string; example: string; synonyms: string[] }> = [];

        if (Array.isArray(entry.meanings)) {
          for (const m of entry.meanings) {
            const pos = m.partOfSpeech || 'noun';
            if (Array.isArray(m.definitions)) {
              for (const d of m.definitions) {
                if (d.definition) {
                  let shortDef = d.definition.split(/[.;]/)[0].trim();
                  if (shortDef) {
                    shortDef = shortDef.charAt(0).toUpperCase() + shortDef.slice(1);
                    if (!shortDef.endsWith('.')) shortDef += '.';
                  }
                  meanings.push({
                    partOfSpeech: pos,
                    definition: shortDef,
                    example: typeof d.example === 'string' ? d.example.trim() : '',
                    synonyms: [],
                  });
                }
              }
            }
          }
        }

        if (meanings.length > 0) {
          const formatted = {
            word: entry.word || cleanWord,
            phonetic: phonetic.replace(/\//g, ''),
            meanings: meanings.slice(0, 3),
            synonyms: [],
            examples: [],
            source: 'dictionaryapi.dev',
            lookupWord: cleanWord,
            contextPos,
          };
          await cacheOnlineDefinition(cleanWord, formatted);
          return formatted;
        }
      }
    }
  } catch {
    // ignore
  }

  return null;
}

export async function fetchWordDefinition(word: string) {
  return getDefinition(word);
}

