// 30 TTS voices and voice assignment utilities for TOEFL Studio
export const FEMALE_VOICES = [
  'Achernar',
  'Aoede',
  'Autonoe',
  'Callirrhoe',
  'Despina',
  'Erinome',
  'Gacrux',
  'Kore',
  'Laomedeia',
  'Leda',
  'Pulcherrima',
  'Sulafat',
  'Vindemiatrix',
  'Zephyr',
] as const;

export const MALE_VOICES = [
  'Achird',
  'Algenib',
  'Algieba',
  'Alnilam',
  'Charon',
  'Enceladus',
  'Fenrir',
  'Iapetus',
  'Orus',
  'Puck',
  'Rasalgethi',
  'Sadachbia',
  'Sadaltager',
  'Schedar',
  'Umbriel',
  'Zubenelgenubi',
] as const;

export type FemaleVoice = typeof FEMALE_VOICES[number];
export type MaleVoice = typeof MALE_VOICES[number];
export type VoiceName = FemaleVoice | MaleVoice;

// Common names lists for gender inference (~150 each)
const COMMON_FEMALE_NAMES = new Set([
  'sarah', 'emily', 'jessica', 'ashley', 'amanda', 'emma', 'olivia', 'sophia', 'isabella', 'ava',
  'mia', 'charlotte', 'amelia', 'harper', 'evelyn', 'abigail', 'elizabeth', 'sofia', 'avery',
  'ella', 'scarlett', 'grace', 'chloe', 'victoria', 'riley', 'aria', 'lily', 'aubrey', 'zoey',
  'hannah', 'addison', 'leah', 'ellie', 'stella', 'natalie', 'zoe', 'hazel', 'violet',
  'aurora', 'savannah', 'audrey', 'brooklyn', 'bella', 'claire', 'skylar', 'lucy', 'paisley', 'everly',
  'anna', 'caroline', 'nova', 'genesis', 'emilia', 'kennedy', 'samantha', 'maya', 'willow', 'kinsley',
  'naomi', 'aaliyah', 'elena', 'ariana', 'allison', 'gabriella', 'alice', 'madelyn', 'cora',
  'ruby', 'eva', 'serenity', 'autumn', 'adeline', 'hailey', 'gianna', 'valentina', 'isla', 'eliana',
  'quinn', 'nevada', 'ivy', 'sadie', 'piper', 'lydia', 'alexa', 'josephine', 'emery', 'julia',
  'delilah', 'arianna', 'vivian', 'kaylee', 'sophie', 'brielle', 'madeline', 'peyton', 'rylee', 'clara',
  'hadley', 'melanie', 'mackenzie', 'reagan', 'adalynn', 'liliana', 'aubree', 'jade', 'katherine', 'isabelle',
  'natalia', 'raelynn', 'maria', 'athena', 'ximena', 'arya', 'leilani', 'taylor', 'faith', 'rose',
  'kylie', 'alexandra', 'mary', 'margaret', 'lyra', 'freya', 'johanna', 'professor', 'dr', 'ms', 'mrs', 'miss'
]);

const COMMON_MALE_NAMES = new Set([
  'james', 'robert', 'john', 'michael', 'david', 'william', 'richard', 'joseph', 'thomas', 'charles',
  'christopher', 'daniel', 'matthew', 'anthony', 'mark', 'donald', 'steven', 'paul', 'andrew', 'joshua',
  'kenneth', 'kevin', 'brian', 'george', 'timothy', 'ronald', 'edward', 'jason', 'jeffrey', 'ryan',
  'jacob', 'gary', 'nicholas', 'eric', 'jonathan', 'stephen', 'larry', 'justin', 'scott', 'brandon',
  'benjamin', 'samuel', 'gregory', 'alexander', 'frank', 'patrick', 'raymond', 'jack', 'dennis', 'jerry',
  'tyler', 'aaron', 'jose', 'adam', 'nathan', 'henry', 'zachary', 'douglas', 'peter', 'kyle',
  'noah', 'ethan', 'jeremy', 'christian', 'keith', 'roger', 'terry', 'gerald', 'harold', 'sean',
  'austin', 'carl', 'arthur', 'lawrence', 'dylan', 'jesse', 'bryan', 'joe', 'jordan', 'billy',
  'bruce', 'albert', 'willie', 'gabriel', 'logan', 'alan', 'juan', 'wayne', 'roy', 'ralph',
  'randy', 'eugene', 'vincent', 'russell', 'louis', 'bobby', 'philip', 'johnny', 'bradley', 'prof',
  'mr', 'sir', 'madam', 'henderson', 'smith', 'chen', 'garcia', 'miller', 'davis', 'rodriguez'
]);

export function inferGender(nameStr: string): 'female' | 'male' | 'unknown' {
  if (!nameStr) return 'unknown';

  let cleaned = nameStr.trim();
  // Strip roles in parentheses e.g. "Sarah (student)" -> "Sarah"
  cleaned = cleaned.replace(/\s*\([^)]*\)/g, '').trim();

  const lower = cleaned.toLowerCase();
  const tokens = lower.split(/[^a-z0-9]+/);

  // Check titles first
  if (lower.startsWith('mr.') || lower.startsWith('mr ') || lower.startsWith('sir ')) {
    return 'male';
  }
  if (lower.startsWith('ms.') || lower.startsWith('ms ') || lower.startsWith('mrs.') || lower.startsWith('mrs ') || lower.startsWith('miss ')) {
    return 'female';
  }

  for (const token of tokens) {
    if (COMMON_FEMALE_NAMES.has(token) && !COMMON_MALE_NAMES.has(token)) {
      return 'female';
    }
    if (COMMON_MALE_NAMES.has(token) && !COMMON_FEMALE_NAMES.has(token)) {
      return 'male';
    }
  }

  // Heuristic based on ending
  const firstName = tokens[0] || '';
  if (firstName.endsWith('a') || firstName.endsWith('i') || firstName.endsWith('ine') || firstName.endsWith('elle') || firstName.endsWith('ette')) {
    return 'female';
  }
  if (firstName.endsWith('os') || firstName.endsWith('o') || firstName.endsWith('us') || firstName.endsWith('er') || firstName.endsWith('en')) {
    return 'male';
  }

  return 'unknown';
}

// Simple deterministic hash for seeded RNG
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

// Seeded PRNG (Mulberry32)
function seededRandom(seed: number): () => number {
  let t = seed += 0x6D2B79F5;
  return function() {
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

let lastUsedVoice: string | null = null;

export function pickDialogueVoices(
  seedStr: string,
  genderA: 'female' | 'male' | 'unknown',
  genderB: 'female' | 'male' | 'unknown'
): { A: VoiceName; B: VoiceName } {
  const isRandomizeEnabled = typeof localStorage === 'undefined' || localStorage.getItem('toefl_randomize_voices') !== 'false';
  if (!isRandomizeEnabled) {
    return { A: 'Kore', B: 'Puck' };
  }

  const seed = hashCode(seedStr);
  const rng = seededRandom(seed);

  // Resolve genders
  let gA = genderA;
  let gB = genderB;

  if (gA === 'unknown' && gB === 'unknown') {
    gA = 'female';
    gB = 'male';
  } else if (gA === 'unknown') {
    gA = gB === 'female' ? 'male' : 'female';
  } else if (gB === 'unknown') {
    gB = gA === 'female' ? 'male' : 'female';
  }

  // Pick pool A
  const poolA = gA === 'female' ? [...FEMALE_VOICES] : [...MALE_VOICES];
  // Filter out last used voice if possible
  const filteredA = poolA.filter((v) => v !== lastUsedVoice);
  const finalPoolA = filteredA.length > 0 ? filteredA : poolA;
  const choiceA = finalPoolA[Math.floor(rng() * finalPoolA.length)];

  // Pick pool B (opposite gender pool)
  const poolB = gB === 'female' ? [...FEMALE_VOICES] : [...MALE_VOICES];
  // Filter out choiceA and lastUsedVoice
  const filteredB = poolB.filter((v) => v !== choiceA && v !== lastUsedVoice);
  const finalPoolB = filteredB.length > 0 ? filteredB : poolB.filter((v) => v !== choiceA);
  const backupPoolB = finalPoolB.length > 0 ? finalPoolB : poolB;
  const choiceB = backupPoolB[Math.floor(rng() * backupPoolB.length)];

  lastUsedVoice = choiceB;

  return { A: choiceA, B: choiceB };
}

export function pickSingleVoice(seedStr: string, gender: 'female' | 'male' | 'unknown'): VoiceName {
  const isRandomizeEnabled = typeof localStorage === 'undefined' || localStorage.getItem('toefl_randomize_voices') !== 'false';
  if (!isRandomizeEnabled) {
    return gender === 'male' ? 'Puck' : 'Kore';
  }

  const seed = hashCode(seedStr);
  const rng = seededRandom(seed);

  const g = gender === 'male' ? 'male' : 'female';
  const pool = g === 'female' ? [...FEMALE_VOICES] : [...MALE_VOICES];
  const filtered = pool.filter((v) => v !== lastUsedVoice);
  const finalPool = filtered.length > 0 ? filtered : pool;
  const choice = finalPool[Math.floor(rng() * finalPool.length)];

  lastUsedVoice = choice;
  return choice;
}

export function pickBrowserVoiceForGender(gender: 'female' | 'male' | 'unknown'): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  const target = gender === 'male' ? 'male' : 'female';
  const match = voices.find((v) => {
    const name = v.name.toLowerCase();
    if (target === 'female') {
      return name.includes('female') || name.includes('zira') || name.includes('samantha') || name.includes('victoria') || name.includes('karen') || name.includes('moira');
    } else {
      return name.includes('male') || name.includes('david') || name.includes('mark') || name.includes('george') || name.includes('daniel') || name.includes('oliver');
    }
  });

  return match || voices[0] || null;
}
