import { getOfflineDefinition, getLookupCandidates } from './offlineDictionary';

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

/**
 * Primary Dictionary Lookup using api.dictionaryapi.dev with strict stem fallback,
 * falling back to offline IndexedDB/Academic Glossary. No junk APIs, no examples.
 */
export async function getDefinition(word: string, context: string = '') {
  const cleanWord = word.trim().replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '').toLowerCase();
  if (!cleanWord) return null;

  const stems = Array.from(new Set([
    cleanWord,
    cleanWord.replace(/s$/, ''),
    cleanWord.replace(/es$/, ''),
    cleanWord.replace(/ies$/, 'y'),
    cleanWord.replace(/ly$/, ''),
    cleanWord.replace(/ing$/, ''),
    cleanWord.replace(/ed$/, ''),
    cleanWord.replace(/d$/, ''),
  ])).filter(s => s.length > 1);

  // 1. Try api.dictionaryapi.dev for each stem
  for (const stem of stems) {
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(stem)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const entry = data[0];
          const phonetic = entry.phonetic || (entry.phonetics && entry.phonetics.find((p: any) => p.text)?.text) || '';
          const meanings: { partOfSpeech: string; definition: string }[] = [];

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
                    if (shortDef && !meanings.some(x => x.definition.toLowerCase() === shortDef.toLowerCase())) {
                      meanings.push({
                        partOfSpeech: pos,
                        definition: shortDef,
                      });
                    }
                  }
                }
              }
            }
          }

          if (meanings.length > 0) {
            return {
              word: entry.word || stem,
              phonetic: phonetic.replace(/\//g, ''),
              meanings: meanings.slice(0, 3), // Max 3 meanings
              synonyms: [],
              examples: [],
              source: 'dictionaryapi.dev',
              lookupWord: cleanWord,
            };
          }
        }
      }
    } catch {
      // ignore network errors and proceed to offline fallback
    }
  }

  // 2. Fall back to offline dictionary / ACADEMIC_GLOSSARY / IndexedDB
  for (const stem of stems) {
    try {
      const offlineRes = await getOfflineDefinition(stem);
      if (offlineRes && offlineRes.meanings && offlineRes.meanings.length > 0) {
        const cleanMeanings = offlineRes.meanings.map(m => {
          let shortDef = m.definition.split(/[.;]/)[0].trim();
          if (shortDef) {
            shortDef = shortDef.charAt(0).toUpperCase() + shortDef.slice(1);
            if (!shortDef.endsWith('.')) shortDef += '.';
          }
          return {
            partOfSpeech: m.partOfSpeech || 'noun',
            definition: shortDef || m.definition,
          };
        }).filter(m => m.definition);

        if (cleanMeanings.length > 0) {
          return {
            word: offlineRes.word || stem,
            phonetic: offlineRes.phonetic || '',
            meanings: cleanMeanings.slice(0, 3), // Max 3 meanings
            synonyms: offlineRes.synonyms || [],
            examples: [],
            source: offlineRes.source,
            lookupWord: cleanWord,
          };
        }
      }
    } catch {
      // ignore offline error
    }
  }

  return null; // Not found anywhere
}
