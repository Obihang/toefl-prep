import { ACADEMIC_GLOSSARY } from './academicGlossary';

export function detectPosInContext(word: string, contextSentence: string): 'v' | 'n' | 'adj' | 'adv' | null {
  const w = word.toLowerCase();
  const c = contextSentence.toLowerCase();
  
  // Verb
  if (new RegExp(`\\b(to|should|must|will|would|can|could|may|might|do|does|did)\\s+${w}\\b`).test(c) ||
      new RegExp(`\\b${w}\\s+(the|a|an|your|my|his|her|its|our|their)\\b`).test(c) ||
      /\b(i|you|we|they|cities|corporations|municipalities)\s+/.test(c) && c.includes(w) ||
      /^(state|explain|describe|implement|define|analyze|identify)/i.test(w) ||
      /\b\w+(ize|ify|ate)\b/.test(w)) {
    return 'v';
  }

  // Adjective
  if (/\b(is|are|was|were|seem|become)\s+/.test(c) && c.includes(w) ||
      new RegExp(`\\b${w}\\s+(preservation|conversion|evidence|policy|strategy)\\b`).test(c) ||
      /\b\w+(ial|ical|ous|ful|less|able|ible|ive)\b/.test(w)) {
    return 'adj';
  }

  // Adverb
  if (/\w+ly\b/.test(w)) return 'adv';

  // Noun
  if (/\b(the|a|an|of|in|for|with|into|by)\s+/.test(c) && c.includes(w) ||
      /\b\w+(tion|sion|ment|ness|ity|ism)\b/.test(w)) {
    return 'n';
  }

  return null;
}

export async function getDefinition(word: string, context: string = '') {
  const normalized = word.trim().replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '').toLowerCase();
  const pos = detectPosInContext(word, context);
  
  // 1. Offline Glossary
  if (ACADEMIC_GLOSSARY[normalized]) {
    return { ...ACADEMIC_GLOSSARY[normalized], source: 'offline' };
  }

  // 2. Server Proxy
  try {
    const res = await fetch(`/api/dictionary?word=${encodeURIComponent(normalized)}`);
    if (res.ok) {
      const data = await res.json();
      // Sort meanings based on detected POS
      if (pos && data.meanings) {
        data.meanings.sort((a: any, b: any) => {
          if (a.partOfSpeech === pos && b.partOfSpeech !== pos) return -1;
          if (a.partOfSpeech !== pos && b.partOfSpeech === pos) return 1;
          return 0;
        });
      }
      return { ...data, contextPos: pos };
    }
  } catch (err) {
    console.warn('Dictionary proxy failed:', err);
  }

  return null;
}
