import { ACADEMIC_GLOSSARY } from './academicGlossary';

export function lemmatizeWord(word: string): string[] {
  const w = word.trim().toLowerCase();
  const candidates: string[] = [w];

  // -ing forms
  if (w.endsWith('ing') && w.length > 4) {
    const stem = w.slice(0, -3);
    // Double consonant: running -> run, stopping -> stop, hitting -> hit, slipping -> slip
    if (/([bdfgklmnprstz])\1$/.test(stem)) {
      candidates.push(stem.slice(0, -1));
    } else if (stem.endsWith('ck') || stem.endsWith('ch') || stem.endsWith('sh') || stem.endsWith('ss') || stem.endsWith('th')) {
      // clicking -> click, watching -> watch, wishing -> wish, passing -> pass
      candidates.push(stem);
    } else if (w.endsWith('ying') && stem.length >= 1) {
      candidates.push(stem.slice(0, -1) + 'ie'); // tying -> tie, lying -> lie
    } else if (/[aeiou]{2}[bdfgklmnprstz]$/.test(stem)) {
      // Diphthongs: speaking -> speak, reading -> read, waiting -> wait
      candidates.push(stem);
    } else {
      // Silent e: writing -> write, creating -> create, using -> use, making -> make
      candidates.push(stem + 'e');
      candidates.push(stem);
    }
  } else if (w.endsWith('ed') && w.length > 3) {
    if (w.endsWith('ied') && w.length > 4) {
      candidates.push(w.slice(0, -3) + 'y'); // studied -> study, applied -> apply
    }
    const stem = w.slice(0, -2);
    if (/([bdfgklmnprstz])\1$/.test(stem)) {
      candidates.push(stem.slice(0, -1)); // stopped -> stop
    } else if (stem.endsWith('ck') || stem.endsWith('ch') || stem.endsWith('sh') || stem.endsWith('ss')) {
      candidates.push(stem); // clicked -> click, watched -> watch
    } else if (w.endsWith('ized') || w.endsWith('ised') || w.endsWith('ated') || w.endsWith('oned') || w.endsWith('ened') || w.endsWith('uted')) {
      candidates.push(w.slice(0, -1)); // incentivized -> incentivize, rezoned -> rezone, created -> create
    } else if (/[aeiou]{2}[bdfgklmnprstz]$/.test(stem)) {
      candidates.push(stem); // waited -> wait, looked -> look
    } else {
      candidates.push(w.slice(0, -1)); // liked -> like
      candidates.push(stem); // walked -> walk
    }
  } else if (w.endsWith('es') && w.length > 4) {
    if (w.endsWith('ies')) {
      candidates.push(w.slice(0, -3) + 'y');
    } else if (w.endsWith('shes') || w.endsWith('ches') || w.endsWith('sses') || w.endsWith('xes')) {
      candidates.push(w.slice(0, -2));
    }
  } else if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) {
    candidates.push(w.slice(0, -1));
  }

  return Array.from(new Set(candidates));
}

export function detectPosInContext(word: string, contextSentence: string): 'v' | 'n' | 'adj' | 'adv' | null {
  const w = word.toLowerCase().trim();
  const c = contextSentence.toLowerCase();

  // 1. Attributive Adjective check:
  // If a word ends in -ic, -al, -an, -ar, -ive, -ous, -less, -able, -ible, -ful, -ial, -ical, -ish, -ary, -ent, -ant
  // AND it sits right before another word (a noun) in the context phrase:
  // e.g. "Academic Topic", "urban environment", "scientific evidence", "residential area", "specific question"
  const hasAdjSuffix = /\b\w+(ic|al|an|ar|ive|ous|less|able|ible|ful|ial|ical|ish|ary|ent|ant)\b/.test(w);
  if (hasAdjSuffix) {
    // Sits before another word in the context phrase (e.g. "academic topic", "urban environment")
    if (new RegExp(`\\b${w}\\s+[a-zA-Z]+\\b`).test(c)) {
      return 'adj';
    }
    // Preceded by copula (is/are/was/were/seem/become)
    if (new RegExp(`\\b(is|are|was|were|seem|seems|seemed|become|becomes|became)\\s+${w}\\b`).test(c)) {
      return 'adj';
    }
  }

  // Preceded by determiner and immediately followed by another word (attributive position)
  // e.g. "the urban environment", "a local resident", "this academic study"
  if (new RegExp(`\\b(the|a|an|this|that|these|those|its|their|our|your)\\s+${w}\\s+[a-zA-Z]+\\b`).test(c)) {
    return 'adj';
  }

  // 2. Contextual Participle / Gerund Verb check for -ing:
  // If preceded by 'by', 'while', 'after', 'before', 'for', 'without', 'upon', or aux verbs ('is', 'was', 'are', 'were', 'be', 'been')
  // AND/OR followed by a direct object or determiner (e.g. "by clicking the Mic button", "while reading the prompt")
  if (w.endsWith('ing')) {
    if (
      new RegExp(`\\b(by|while|after|before|for|without|upon|when|is|was|are|were|be|been|am)\\s+${w}\\b`).test(c) ||
      new RegExp(`\\b${w}\\s+(the|a|an|this|that|these|those|your|my|his|her|its|our|their|some|any|[a-z]+)\\b`).test(c)
    ) {
      return 'v';
    }
  }

  // 3. Preceded by modal, auxiliary, or infinitive 'to'
  if (new RegExp(`\\b(to|should|must|will|would|can|could|may|might|do|does|did|shall)\\s+${w}\\b`).test(c)) {
    return 'v';
  }

  // 4. Preceded by subject pronoun (I, you, he, she, it, we, they)
  if (new RegExp(`\\b(i|you|he|she|it|we|they)\\s+${w}\\b`).test(c)) {
    return 'v';
  }

  // 5. Followed by a direct object determiner (when not preceded by an article): e.g. "repeat the sentence"
  if (new RegExp(`\\b${w}\\s+(the|a|an|your|my|his|her|its|our|their|this|that|these|those)\\b`).test(c) &&
      !new RegExp(`\\b(the|a|an)\\s+${w}\\b`).test(c)) {
    return 'v';
  }

  // 6. Imperative command at clause / sentence start: "Click Check", "Repeat the sentence", "Then repeat"
  if (new RegExp(`(?:^|[.!?]\\s+|;\\s*|then\\s+|please\\s+|now\\s+)${w}\\b`).test(c)) {
    return 'v';
  }

  // 7. Common action verbs or verbal suffixes
  if (!new RegExp(`\\b(the|a|an)\\s+${w}\\b`).test(c)) {
    if (/^(state|explain|describe|implement|define|analyze|identify|repeat|click|listen|write|read|speak|check|verify|record|evaluate)/i.test(w) ||
        /\b\w+(ize|ise|ify|ate)\b/.test(w)) {
      return 'v';
    }
  }

  // 8. Inherent Adjectives
  if (/\b\w+(ical|ous|less|able|ible|ive)\b/.test(w)) {
    return 'adj';
  }
  if (/\b\w+(ic|al)\b/.test(w) && !/\b\w+(tion|sion|ment|ness|ity|ism)\b/.test(w)) {
    if (!new RegExp(`\\b(the|a|an)\\s+${w}(?:\\s*$)`).test(c)) {
      return 'adj';
    }
  }

  // 9. Adverb
  if (/\w+ly\b/.test(w)) return 'adv';

  // 10. Noun: noun suffixes, or preceded by articles without verbal patterns and not modifying a following word
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

export function scoreDefinition(definition: string): number {
  if (!definition) return -100;
  const d = definition.toLowerCase();
  let score = 0;

  // Negative tags (-50 points each): slang, music, hip-hop, informal, archaic, obsolete, etc.
  const penaltyRegex = /\b(slang|music|hip-hop|african american|informal|derogatory|obsolete|archaic|historical|dated|rare|vulgar|offensive|colloquial|jargon|surname|given name|christian|bible|sect|plato|platonist|misspelling of|alternative form of|urine)\b/gi;
  const penalties = d.match(penaltyRegex);
  if (penalties) {
    score -= 50 * penalties.length;
  }

  // Academic / Standard keywords (+10 points each)
  const rewardKeywords = [
    'city', 'town', 'relating to', 'characteristic of', 'study of',
    'process', 'system', 'science', 'art', 'education', 'learning',
    'school', 'university', 'pertaining to', 'denoting', 'constituting',
    'scholarly', 'institution', 'principle', 'method', 'theory',
    'living in', 'inhabitant'
  ];

  for (const kw of rewardKeywords) {
    if (d.includes(kw)) {
      score += 10;
    }
  }

  return score;
}

export function cleanAndFilterMeanings(
  meanings: Array<{ partOfSpeech: string; definition: string; example?: string }>,
  detectedPos?: 'v' | 'n' | 'adj' | 'adv' | null
): Array<{ partOfSpeech: string; definition: string; example: string }> {
  if (!meanings || meanings.length === 0) return [];

  const isArchaicOrPlato = (def: string) =>
    /\b(plato|platonist|sect|obsolete|archaic|historical|dated|rare|misspelling of|alternative form of|urine)\b/i.test(def);

  // If we have modern definitions, completely filter out archaic/Plato definitions
  const modernOnly = meanings.filter((m) => !isArchaicOrPlato(m.definition));
  const pool = modernOnly.length > 0 ? modernOnly : meanings;

  const formatted = pool.map((m) => ({
    partOfSpeech: m.partOfSpeech || 'noun',
    definition: m.definition.replace(/^\([^)]+\)\s*/, '').trim(),
    example: typeof m.example === 'string' ? m.example.trim() : '',
  }));

  return formatted.sort((a, b) => {
    // 1. Detected POS match
    if (detectedPos) {
      const aMatches = matchesPos(a.partOfSpeech, detectedPos);
      const bMatches = matchesPos(b.partOfSpeech, detectedPos);
      if (aMatches && !bMatches) return -1;
      if (!aMatches && bMatches) return 1;
    }

    // 2. Score heuristic (+10 academic words, -50 informal/slang/music)
    const aScore = scoreDefinition(a.definition);
    const bScore = scoreDefinition(b.definition);
    if (aScore !== bScore) {
      return bScore - aScore;
    }

    // 3. Definitions with examples
    if (a.example && !b.example) return -1;
    if (!a.example && b.example) return 1;

    return 0;
  });
}

export async function getDefinition(word: string, context: string = '') {
  const normalized = word.trim().replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '').toLowerCase();
  if (!normalized) return null;

  const pos = detectPosInContext(word, context);
  const candidates = lemmatizeWord(normalized);
  const baseVerb = candidates.find((c) => c !== normalized);

  // 1. Offline Glossary
  if (ACADEMIC_GLOSSARY[normalized]) {
    return { ...ACADEMIC_GLOSSARY[normalized], source: 'offline', contextPos: pos, lookupWord: normalized };
  }
  if (pos === 'v' && baseVerb && ACADEMIC_GLOSSARY[baseVerb]) {
    return { ...ACADEMIC_GLOSSARY[baseVerb], source: 'offline', contextPos: pos, lookupWord: baseVerb };
  }

  // Query order: If contextual POS is VERB and we have a base verb (e.g. clicking -> click),
  // prioritize the base verb so we get rich verb definitions instead of acoustic noun clicks!
  const wordsToTry = pos === 'v' && baseVerb
    ? [baseVerb, normalized]
    : [normalized, ...(baseVerb ? [baseVerb] : [])];

  // 2. Server Proxy (calls api.dictionaryapi.dev first, then Datamuse with strict exact-word matching)
  for (const queryWord of wordsToTry) {
    try {
      const res = await fetch(`/api/dictionary?word=${encodeURIComponent(queryWord)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.meanings) && data.meanings.length > 0) {
          const sorted = cleanAndFilterMeanings(data.meanings, pos);
          return {
            ...data,
            meanings: sorted,
            lookupWord: queryWord,
            contextPos: pos,
          };
        }
      }
    } catch (err) {
      console.warn('Dictionary proxy lookup failed for', queryWord, err);
    }
  }

  // 3. Fallback direct client call to api.dictionaryapi.dev if server proxy was unavailable
  for (const queryWord of wordsToTry) {
    try {
      const directRes = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(queryWord)}`);
      if (directRes.ok) {
        const directData = await directRes.json();
        if (Array.isArray(directData) && directData[0]?.meanings) {
          const rawMeanings: Array<{ partOfSpeech: string; definition: string; example: string }> = [];
          for (const m of directData[0].meanings) {
            const p = m.partOfSpeech || 'noun';
            for (const d of (m.definitions || [])) {
              if (!d.definition) continue;
              rawMeanings.push({
                partOfSpeech: p,
                definition: String(d.definition),
                example: typeof d.example === 'string' ? d.example.trim() : '',
              });
            }
          }
          const sorted = cleanAndFilterMeanings(rawMeanings, pos);
          if (sorted.length > 0) {
            return {
              meanings: sorted,
              phonetic: directData[0].phonetic || directData[0].phonetics?.find((p: any) => p.text)?.text || '',
              source: 'dictionaryapi-direct',
              lookupWord: queryWord,
              contextPos: pos,
            };
          }
        }
      }
    } catch {}
  }

  return null;
}
