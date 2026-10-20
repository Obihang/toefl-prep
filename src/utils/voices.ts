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

export const NEURAL_FEMALE_VOICES = [
  'en-US-AriaNeural',
  'en-US-JennyNeural',
  'en-US-MichelleNeural',
] as const;

export const NEURAL_MALE_VOICES = [
  'en-US-GuyNeural',
  'en-US-ChristopherNeural',
  'en-US-EricNeural',
] as const;

export type NeuralFemaleVoice = typeof NEURAL_FEMALE_VOICES[number];
export type NeuralMaleVoice = typeof NEURAL_MALE_VOICES[number];
export type NeuralVoiceName = NeuralFemaleVoice | NeuralMaleVoice;

export type FemaleVoice = typeof FEMALE_VOICES[number] | NeuralFemaleVoice;
export type MaleVoice = typeof MALE_VOICES[number] | NeuralMaleVoice;
export type VoiceName = FemaleVoice | MaleVoice;

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
  'kylie', 'alexandra', 'mary', 'margaret', 'lyra', 'freya', 'johanna'
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
  'randy', 'eugene', 'vincent', 'russell', 'louis', 'bobby', 'philip', 'johnny', 'bradley'
]);

export function inferGender(nameStr: string): 'female' | 'male' | 'unknown' {
  if (!nameStr) return 'unknown';

  const trimmed = nameStr.trim();
  const parenMatch = trimmed.match(/\(([^)]+)\)/);
  const insideParen = parenMatch ? parenMatch[1].trim() : '';
  const outsideParen = trimmed.replace(/\([^)]*\)/g, '').trim();

  const testPart = (part: string): 'female' | 'male' | 'unknown' => {
    if (!part) return 'unknown';
    const lower = part.toLowerCase();

    if (lower.startsWith('mr.') || lower.startsWith('mr ') || lower.startsWith('sir ')) {
      return 'male';
    }
    if (lower.startsWith('ms.') || lower.startsWith('ms ') || lower.startsWith('mrs.') || lower.startsWith('mrs ') || lower.startsWith('miss ') || lower.startsWith('madam ')) {
      return 'female';
    }

    const cleaned = lower.replace(/\b(student|professor|prof|dr|doctor|advisor|lecturer|instructor|academic|assistant)\b/g, '').trim();
    const tokens = cleaned.split(/[^a-z0-9]+/).filter(Boolean);

    for (const token of tokens) {
      if (COMMON_FEMALE_NAMES.has(token) && !COMMON_MALE_NAMES.has(token)) {
        return 'female';
      }
      if (COMMON_MALE_NAMES.has(token) && !COMMON_FEMALE_NAMES.has(token)) {
        return 'male';
      }
    }
    return 'unknown';
  };

  if (insideParen) {
    const res = testPart(insideParen);
    if (res !== 'unknown') return res;
  }

  if (outsideParen) {
    const res = testPart(outsideParen);
    if (res !== 'unknown') return res;
  }

  return 'unknown';
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededRandom(seed: number): () => number {
  let t = seed += 0x6D2B79F5;
  return function() {
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const dialogueCache = new Map<string, { A: VoiceName; B: VoiceName }>();
const singleCache = new Map<string, VoiceName>();
let lastUsedVoice: string | null = null;
const resolvedSeeds = new Set<string>();

export function pickDialogueVoices(
  seedStr: string,
  genderA: 'female' | 'male' | 'unknown',
  genderB: 'female' | 'male' | 'unknown'
): { A: VoiceName; B: VoiceName } {
  const isRandomizeEnabled = typeof localStorage === 'undefined' || localStorage.getItem('toefl_randomize_voices') !== 'false';
  if (!isRandomizeEnabled) {
    return { A: 'Kore', B: 'Puck' };
  }

  if (dialogueCache.has(seedStr)) {
    return dialogueCache.get(seedStr)!;
  }

  const seed = hashCode(seedStr);
  const rng = seededRandom(seed);

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

  const poolA = gA === 'female' ? [...FEMALE_VOICES] : [...MALE_VOICES];
  const filteredA = poolA.filter((v) => v !== lastUsedVoice);
  const finalPoolA = filteredA.length > 0 ? filteredA : poolA;
  const choiceA = finalPoolA[Math.floor(rng() * finalPoolA.length)];

  const poolB = gB === 'female' ? [...FEMALE_VOICES] : [...MALE_VOICES];
  const filteredB = poolB.filter((v) => v !== choiceA && v !== lastUsedVoice);
  const finalPoolB = filteredB.length > 0 ? filteredB : poolB.filter((v) => v !== choiceA);
  const backupPoolB = finalPoolB.length > 0 ? finalPoolB : poolB;
  const choiceB = backupPoolB[Math.floor(rng() * backupPoolB.length)];

  if (!resolvedSeeds.has(seedStr)) {
    resolvedSeeds.add(seedStr);
    lastUsedVoice = choiceB;
  }

  const result = { A: choiceA, B: choiceB };
  dialogueCache.set(seedStr, result);
  return result;
}

export function pickSingleVoice(seedStr: string, gender: 'female' | 'male' | 'unknown'): VoiceName {
  const isRandomizeEnabled = typeof localStorage === 'undefined' || localStorage.getItem('toefl_randomize_voices') !== 'false';
  if (!isRandomizeEnabled) {
    return gender === 'male' ? 'Puck' : 'Kore';
  }

  if (singleCache.has(seedStr)) {
    return singleCache.get(seedStr)!;
  }

  const seed = hashCode(seedStr);
  const rng = seededRandom(seed);

  const g = gender === 'male' ? 'male' : 'female';
  const pool = g === 'female' ? [...FEMALE_VOICES] : [...MALE_VOICES];
  const filtered = pool.filter((v) => v !== lastUsedVoice);
  const finalPool = filtered.length > 0 ? filtered : pool;
  const choice = finalPool[Math.floor(rng() * finalPool.length)];

  if (!resolvedSeeds.has(seedStr)) {
    resolvedSeeds.add(seedStr);
    lastUsedVoice = choice;
  }

  singleCache.set(seedStr, choice);
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
