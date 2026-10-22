import { ACADEMIC_GLOSSARY } from './academicGlossary';

export async function getDefinition(word: string) {
  const normalized = word.trim().replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '').toLowerCase();
  
  // 1. Offline Glossary
  if (ACADEMIC_GLOSSARY[normalized]) {
    return { ...ACADEMIC_GLOSSARY[normalized], source: 'offline' };
  }

  // 2. Server Proxy (Cascade in API)
  try {
    const res = await fetch(`/api/dictionary?word=${encodeURIComponent(normalized)}`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Dictionary proxy failed:', err);
  }

  return null;
}

export function stripSuffixes(word: string): string {
  return word
    .replace(/(ies)$/, 'y')
    .replace(/(es|s)$/, '')
    .replace(/(ed|ing|ly)$/, '')
    .replace(/(ial)$/, 'it')
    .replace(/(ical)$/, 'ic')
    .replace(/(tion|ment)$/, '');
}
