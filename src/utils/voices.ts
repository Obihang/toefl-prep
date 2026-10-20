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
  'en-US-AnaNeural',
  'en-US-EmmaNeural',
] as const;

export const NEURAL_MALE_VOICES = [
  'en-US-GuyNeural',
  'en-US-ChristopherNeural',
  'en-US-EricNeural',
  'en-US-RogerNeural',
  'en-US-SteffanNeural',
] as const;

export type NeuralFemaleVoice = typeof NEURAL_FEMALE_VOICES[number];
export type NeuralMaleVoice = typeof NEURAL_MALE_VOICES[number];
export type NeuralVoiceName = NeuralFemaleVoice | NeuralMaleVoice;

export type FemaleVoice = typeof FEMALE_VOICES[number] | NeuralFemaleVoice;
export type MaleVoice = typeof MALE_VOICES[number] | NeuralMaleVoice;
export type VoiceName = FemaleVoice | MaleVoice;

// Distinct Per-Speaker Neural Voice Pools
export const MALE_VOICE_POOL: readonly string[] = [
  'en-US-GuyNeural',
  'en-US-ChristopherNeural',
  'en-US-EricNeural',
  'en-US-RogerNeural',
  'en-US-SteffanNeural',
];

export const FEMALE_VOICE_POOL: readonly string[] = [
  'en-US-AriaNeural',
  'en-US-JennyNeural',
  'en-US-MichelleNeural',
  'en-US-AnaNeural',
  'en-US-EmmaNeural',
];

export const FEMALE_NAMES_SET = new Set([
  'sarah', 'emily', 'jessica', 'ashley', 'amanda', 'samantha', 'jennifer', 'elizabeth', 'taylor', 'megan',
  'hannah', 'lauren', 'olivia', 'emma', 'ava', 'sophia', 'isabella', 'mia', 'charlotte', 'amelia',
  'harper', 'evelyn', 'abigail', 'ella', 'scarlett', 'grace', 'chloe', 'victoria', 'riley', 'aria',
  'lily', 'aubrey', 'zoey', 'penelope', 'lillian', 'addison', 'layla', 'natalie', 'camila', 'brooklyn',
  'zoe', 'nora', 'leah', 'savannah', 'audrey', 'claire', 'eleanor', 'skylar', 'ellie', 'stella',
  'paisley', 'violet', 'mila', 'allison', 'alexa', 'anna', 'hazel', 'aaliyah', 'ariana', 'lucy',
  'caroline', 'genesis', 'kennedy', 'sadie', 'gabriella', 'madelyn', 'adeline', 'maya', 'autumn',
  'aurora', 'piper', 'hailey', 'arianna', 'kaylee', 'ruby', 'seren', 'eva', 'naomi', 'elena',
  'alice', 'clara', 'vivian', 'maria', 'laura', 'linda', 'lisa', 'nancy', 'karen', 'betty',
  'helen', 'sandra', 'donna', 'carol', 'ruth', 'sharon', 'michelle', 'diana', 'julie', 'joyce',
  'kelly', 'christina', 'joan', 'judith', 'cheryl', 'andrea', 'martha', 'teresa', 'gloria', 'sara',
  'janice', 'julia', 'marie', 'madison', 'judy', 'theresa', 'beverly', 'denise', 'marilyn', 'amber',
  'danielle', 'brittany', 'priya', 'mei', 'fatima', 'aisha', 'yuki', 'sora', 'minji', 'carmen',
  'rosa', 'ana', 'sofia', 'lucia', 'claudia', 'nina', 'tara', 'tanya', 'wendy', 'cindy',
  'becky', 'katie', 'kate', 'jenny', 'liz', 'beth',
]);

export const MALE_NAMES_SET = new Set([
  'james', 'john', 'robert', 'michael', 'william', 'david', 'richard', 'joseph', 'thomas', 'charles',
  'christopher', 'daniel', 'matthew', 'anthony', 'mark', 'donald', 'steven', 'paul', 'andrew', 'joshua',
  'kenneth', 'kevin', 'brian', 'george', 'timothy', 'ronald', 'edward', 'jason', 'jeffrey', 'ryan',
  'jacob', 'gary', 'nicholas', 'eric', 'jonathan', 'stephen', 'larry', 'justin', 'scott', 'brandon',
  'benjamin', 'samuel', 'gregory', 'alexander', 'patrick', 'frank', 'raymond', 'jack', 'dennis', 'jerry',
  'tyler', 'aaron', 'jose', 'adam', 'nathan', 'henry', 'zachary', 'douglas', 'peter', 'kyle',
  'noah', 'ethan', 'jeremy', 'walter', 'christian', 'keith', 'roger', 'terry', 'austin', 'sean',
  'gerald', 'carl', 'harold', 'dylan', 'arthur', 'lawrence', 'jordan', 'jesse', 'bryan', 'billy',
  'bruce', 'gabriel', 'joe', 'logan', 'alan', 'juan', 'albert', 'willie', 'elijah', 'wayne',
  'randy', 'vincent', 'mason', 'roy', 'ralph', 'eugene', 'russell', 'bobby', 'victor', 'martin',
  'ernest', 'phillip', 'todd', 'craig', 'shawn', 'clarence', 'philip', 'chris', 'mike', 'tom',
  'bob', 'bill', 'jim', 'dan', 'matt', 'steve', 'nick', 'alex', 'sam', 'ben',
  'luke', 'liam', 'lucas', 'oliver', 'leo', 'jackson', 'aiden', 'carter', 'wyatt', 'jayden',
  'owen', 'isaac', 'grayson', 'julian', 'levi', 'lincoln', 'mateo', 'jaxon', 'isaiah', 'caleb',
  'josiah', 'hunter', 'eli', 'connor', 'landon', 'adrian', 'asher', 'cameron', 'theodore', 'jeremiah',
  'hudson', 'easton', 'nolan', 'ezra', 'colton', 'carlos', 'luis', 'miguel', 'wei', 'raj',
  'arjun', 'omar', 'tariq', 'kenji', 'hiroshi', 'minho', 'marco', 'luca', 'diego',
]);

export interface ParsedDialogueLine {
  speakerName: string;
  speakerHint: string;
  spokenText: string;
}

export function stripStageDirectionsAndMarkdown(text: string): string {
  if (!text) return '';
  let cleaned = text.trim();
  cleaned = cleaned.replace(/\[[^\]]*\]/g, ' ');
  cleaned = cleaned.replace(
    /\((?:pauses?|sighs?|laughs?|chuckles?|clears throat|applause|cheering|coughing|sound|music|gasp|whispering|shouting|silence|interrupted)\)/gi,
    ' '
  );
  cleaned = cleaned.replace(/[*_#`>]+/g, ' ');
  return cleaned.replace(/\s+/g, ' ').trim();
}

export function parseDialogueLine(line: string): ParsedDialogueLine {
  if (!line || typeof line !== 'string') {
    return { speakerName: '', speakerHint: '', spokenText: '' };
  }
  const raw = line.trim();

  const match = raw.match(
    /^\s*(?:\*\*|__)?\[?\s*([A-Z][a-zA-Z0-9.\s'-]{0,28}?)(?:\s*\(([^)]+)\))?\s*\]?(?:\*\*|__)?\s*:\s*(.+)$/i
  );

  if (match) {
    const rawName = (match[1] || '').trim();
    const hint = (match[2] || '').trim();
    const body = (match[3] || '').trim();

    return {
      speakerName: rawName,
      speakerHint: hint,
      spokenText: stripStageDirectionsAndMarkdown(body),
    };
  }

  return {
    speakerName: '',
    speakerHint: '',
    spokenText: stripStageDirectionsAndMarkdown(raw),
  };
}

export function detectSpeakerGender(
  speakerName: string,
  speakerHint: string = ''
): 'female' | 'male' | 'unknown' {
  const combined = `${speakerHint} ${speakerName}`.trim().toLowerCase();
  if (!combined) return 'unknown';

  // 1. Explicit Hints / Keywords First
  if (/\b(female|woman|girl|ms\.|mrs\.|miss|madam|she|her)\b/i.test(combined)) {
    return 'female';
  }
  if (/\b(male|man|boy|mr\.|sir|he|him)\b/i.test(combined)) {
    return 'male';
  }

  // 2. Common First-Name Dictionary Lookup
  const cleanedName = speakerName
    .replace(/\b(dr\.|prof\.|professor|coach|advisor|student|dean|instructor|faculty|librarian|doctor)\b/gi, '')
    .trim();

  const words = cleanedName.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const firstWord = words[0] || '';

  if (firstWord) {
    if (FEMALE_NAMES_SET.has(firstWord) && !MALE_NAMES_SET.has(firstWord)) {
      return 'female';
    }
    if (MALE_NAMES_SET.has(firstWord) && !FEMALE_NAMES_SET.has(firstWord)) {
      return 'male';
    }
  }

  return 'unknown';
}

export function inferGender(nameStr: string): 'female' | 'male' | 'unknown' {
  if (!nameStr) return 'unknown';
  const parsed = parseDialogueLine(`${nameStr}: dummy`);
  return detectSpeakerGender(parsed.speakerName || nameStr, parsed.speakerHint);
}

export class DialogueVoiceManager {
  private speakerVoiceMap = new Map<string, string>();
  private usedVoices = new Set<string>();
  private lastAssignedGender: 'male' | 'female' | null = null;
  private genderCounts: Record<'male' | 'female', number> = { male: 0, female: 0 };
  private speakerIndexMap = new Map<string, number>();

  public getVoiceForSpeaker(speakerName: string, speakerHint: string = ''): string {
    const normKey = (speakerName || 'Speaker').trim().toLowerCase();
    if (this.speakerVoiceMap.has(normKey)) {
      return this.speakerVoiceMap.get(normKey)!;
    }

    let gender = detectSpeakerGender(speakerName, speakerHint);

    if (gender === 'unknown') {
      gender = this.lastAssignedGender === 'female' ? 'male' : 'female';
    }

    const pool = gender === 'female' ? FEMALE_VOICE_POOL : MALE_VOICE_POOL;

    let selectedVoice = pool.find((v) => !this.usedVoices.has(v));
    if (!selectedVoice) {
      selectedVoice = pool[this.speakerVoiceMap.size % pool.length];
    }

    this.speakerVoiceMap.set(normKey, selectedVoice);
    this.speakerIndexMap.set(normKey, this.genderCounts[gender]++);
    this.usedVoices.add(selectedVoice);
    this.lastAssignedGender = gender;

    return selectedVoice;
  }

  public getSpeakerIndex(speakerName: string): number {
    const normKey = (speakerName || 'Speaker').trim().toLowerCase();
    return this.speakerIndexMap.get(normKey) || 0;
  }
}

export function getBrowserSpeechPitchAndRate(
  speakerName: string,
  genderInput?: 'female' | 'male' | 'unknown',
  speakerIndex: number = 0
): { pitch: number; rate: number } {
  const gender = genderInput || detectSpeakerGender(speakerName);

  if (gender === 'male') {
    if (speakerIndex === 0) {
      return { pitch: 0.85, rate: 0.98 };
    }
    return { pitch: 0.75, rate: 0.94 };
  }

  // Female or unknown
  if (speakerIndex === 0) {
    return { pitch: 1.15, rate: 1.00 };
  }
  return { pitch: 1.25, rate: 1.03 };
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
  let t = (seed += 0x6d2b79f5);
  return function () {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dialogueCache = new Map<string, { A: VoiceName; B: VoiceName }>();
const singleCache = new Map<string, VoiceName>();
const resolvedSeeds = new Set<string>();

export function pickDialogueVoices(
  seedStr: string,
  genderA: 'female' | 'male' | 'unknown',
  genderB: 'female' | 'male' | 'unknown'
): { A: VoiceName; B: VoiceName } {
  const isRandomizeEnabled =
    typeof localStorage === 'undefined' || localStorage.getItem('toefl_randomize_voices') !== 'false';
  if (!isRandomizeEnabled) {
    return { A: 'en-US-JennyNeural', B: 'en-US-GuyNeural' };
  }

  if (dialogueCache.has(seedStr)) {
    return dialogueCache.get(seedStr)!;
  }

  const manager = new DialogueVoiceManager();
  const vA = manager.getVoiceForSpeaker('Speaker A', genderA !== 'unknown' ? genderA : '');
  const vB = manager.getVoiceForSpeaker('Speaker B', genderB !== 'unknown' ? genderB : '');

  const result = { A: vA as VoiceName, B: vB as VoiceName };
  dialogueCache.set(seedStr, result);
  return result;
}

export function pickSingleVoice(seedStr: string, gender: 'female' | 'male' | 'unknown'): VoiceName {
  const isRandomizeEnabled =
    typeof localStorage === 'undefined' || localStorage.getItem('toefl_randomize_voices') !== 'false';
  if (!isRandomizeEnabled) {
    return (gender === 'male' ? 'en-US-GuyNeural' : 'en-US-JennyNeural') as VoiceName;
  }

  if (singleCache.has(seedStr)) {
    return singleCache.get(seedStr)!;
  }

  const manager = new DialogueVoiceManager();
  const choice = manager.getVoiceForSpeaker(seedStr, gender !== 'unknown' ? gender : '') as VoiceName;

  singleCache.set(seedStr, choice);
  return choice;
}

export function pickBrowserVoiceForGender(
  gender: 'female' | 'male' | 'unknown',
  speakerIndex: number = 0
): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  const englishVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  if (englishVoices.length === 0) return null;

  const target = gender === 'male' ? 'male' : 'female';
  const matches = englishVoices.filter((v) => {
    const name = v.name.toLowerCase();
    if (target === 'female') {
      return (
        name.includes('female') ||
        name.includes('zira') ||
        name.includes('samantha') ||
        name.includes('victoria') ||
        name.includes('karen') ||
        name.includes('moira') ||
        name.includes('tessa') ||
        name.includes('fiona') ||
        name.includes('aria') ||
        name.includes('jenny') ||
        name.includes('google us english') ||
        name.includes('google uk english female')
      );
    } else {
      return (
        name.includes('male') ||
        name.includes('david') ||
        name.includes('mark') ||
        name.includes('george') ||
        name.includes('daniel') ||
        name.includes('oliver') ||
        name.includes('alex') ||
        name.includes('fred') ||
        name.includes('guy') ||
        name.includes('christopher') ||
        name.includes('google uk english male')
      );
    }
  });

  if (matches.length > 0) {
    return matches[speakerIndex % matches.length];
  }

  return englishVoices[speakerIndex % englishVoices.length];
}
