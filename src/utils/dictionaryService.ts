import { ACADEMIC_GLOSSARY } from './academicGlossary';
import { getOfflineDefinition, getLookupCandidates } from './offlineDictionary';

export function lemmatizeWord(word: string): string[] {
  return getLookupCandidates(word);
}

export function detectPosInContext(word: string, contextSentence: string): 'v' | 'n' | 'adj' | 'adv' | null {
  const w = word.toLowerCase().trim();
  const c = contextSentence.toLowerCase();

  const hasAdjSuffix = /\b\w+(ic|al|an|ar|ive|ous|less|able|ible|ful|ial|ical|ish|ary|ent|ant)\b/.test(w);
  if (hasAdjSuffix) {
    if (new RegExp(`\\b${w}\\s+[a-zA-Z]+\\b`).test(c)) {
      return 'adj';
    }
    if (new RegExp(`\\b(is|are|was|were|seem|seems|seemed|become|becomes|became)\\s+${w}\\b`).test(c)) {
      return 'adj';
    }
  }

  if (new RegExp(`\\b(the|a|an|this|that|these|those|its|their|our|your)\\s+${w}\\s+[a-zA-Z]+\\b`).test(c)) {
    return 'adj';
  }

  if (w.endsWith('ing')) {
    if (
      new RegExp(`\\b(by|while|after|before|for|without|upon|when|is|was|are|were|be|been|am)\\s+${w}\\b`).test(c) ||
      new RegExp(`\\b${w}\\s+(the|a|an|this|that|these|those|your|my|his|her|its|our|their|some|any|[a-z]+)\\b`).test(c)
    ) {
      return 'v';
    }
  }

  if (new RegExp(`\\b(to|should|must|will|would|can|could|may|might|do|does|did|shall)\\s+${w}\\b`).test(c)) {
    return 'v';
  }

  if (new RegExp(`\\b(i|you|he|she|it|we|they)\\s+${w}\\b`).test(c)) {
    return 'v';
  }

  if (new RegExp(`\\b${w}\\s+(the|a|an|your|my|his|her|its|our|their|this|that|these|those)\\b`).test(c) &&
      !new RegExp(`\\b(the|a|an)\\s+${w}\\b`).test(c)) {
    return 'v';
  }

  if (new RegExp(`(?:^|[.!?]\\s+|;\\s*|then\\s+|please\\s+|now\\s+)${w}\\b`).test(c)) {
    return 'v';
  }

  if (!new RegExp(`\\b(the|a|an)\\s+${w}\\b`).test(c)) {
    if (/^(state|explain|describe|implement|define|analyze|identify|repeat|click|listen|write|read|speak|check|verify|record|evaluate)/i.test(w) ||
        /\b\w+(ize|ise|ify|ate)\b/.test(w)) {
      return 'v';
    }
  }

  if (/\b\w+(ical|ous|less|able|ible|ive)\b/.test(w)) {
    return 'adj';
  }
  if (/\b\w+(ic|al)\b/.test(w) && !/\b\w+(tion|sion|ment|ness|ity|ism)\b/.test(w)) {
    if (!new RegExp(`\\b(the|a|an)\\s+${w}(?:\\s*$)`).test(c)) {
      return 'adj';
    }
  }

  if (/\w+ly\b/.test(w)) return 'adv';

  if (
    (/\b\w+(tion|sion|ment|ness|ity|ism|ance|ence|ship|dom)\b/.test(w)) ||
    (new RegExp(`\\b(the|a|an)\\s+${w}\\b`).test(c) && !new RegExp(`\\b${w}\\s+[a-zA-Z]+\\b`).test(c))
  ) {
    return 'n';
  }

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
 * Primary 100% Offline Dictionary Lookup using IndexedDB offline_dictionary store.
 */
export async function getDefinition(word: string, context: string = '') {
  const normalized = word.trim().replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '').toLowerCase();
  if (!normalized) return null;

  const pos = detectPosInContext(word, context);

  // 1. Query IndexedDB / ACADEMIC_GLOSSARY via offlineDictionary package
  try {
    const offlineRes = await getOfflineDefinition(normalized);
    if (offlineRes && offlineRes.meanings && offlineRes.meanings.length > 0) {
      return {
        word: offlineRes.word,
        phonetic: offlineRes.phonetic || '',
        meanings: offlineRes.meanings,
        synonyms: offlineRes.synonyms || [],
        examples: offlineRes.examples || [],
        source: offlineRes.source,
        lookupWord: normalized,
        contextPos: pos,
      };
    }
  } catch (err) {
    console.warn('Offline dictionary lookup failed:', err);
  }

  // 2. Fallback offline stub if word not found in offline DB
  return {
    word: normalized,
    phonetic: '',
    meanings: [
      {
        partOfSpeech: pos || 'noun',
        definition: `Definition for "${normalized}" (Download full dictionary in Settings -> Data).`,
        example: `A simple example using the word "${normalized}".`,
      },
    ],
    synonyms: [],
    examples: [`A simple example using the word "${normalized}".`],
    source: 'offline_stub',
    lookupWord: normalized,
    contextPos: pos,
  };
}
