export async function fetchWordDefinition(word: string) {
  const cleanWord = word.trim().toLowerCase();
  
  // 1. Primary Fetch
  let data = await tryFetch(cleanWord);
  
  // 2. Stemming Fallback (if 404)
  if (!data && cleanWord.length > 3) {
    const stemmed = stripSuffixes(cleanWord);
    if (stemmed !== cleanWord) {
      data = await tryFetch(stemmed);
    }
  }

  return data;
}

async function tryFetch(word: string) {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.[0] || null;
  } catch {
    return null;
  }
}

function stripSuffixes(word: string): string {
  // Simple suffix stripping
  return word
    .replace(/(ies)$/, 'y')
    .replace(/(es|s)$/, '')
    .replace(/(ed|ing|ly|tion)$/, '')
    .replace(/(ed|ing|ly)$/, '');
}
