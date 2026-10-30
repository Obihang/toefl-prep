import { ACADEMIC_GLOSSARY } from './academicGlossary';
import { lookupOffline, getCachedOnlineDefinition, cacheOnlineDefinition, getLookupCandidates } from './offlineDictionary';

export function generateLemmaCandidates(rawWord: string): string[] {
  const w = rawWord.trim().toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, '');
  if (!w) return [];
  const candidates: string[] = [w];

  // 1. If ending in 'ies' -> w.slice(0, -3) + 'y' (e.g. cavities -> cavity)
  if (w.endsWith('ies') && w.length > 4) {
    candidates.push(w.slice(0, -3) + 'y');
  }
  // 2. If ending in 'es' -> w.slice(0, -2) and w.slice(0, -1) (e.g. classes -> class, boxes -> box, juices -> juice)
  if (w.endsWith('es') && w.length > 3) {
    candidates.push(w.slice(0, -2));
    candidates.push(w.slice(0, -1));
  }
  // 3. If ending in 's' (and not 'ss', 'us', 'is') -> w.slice(0, -1) (e.g. fosters -> foster)
  if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is') && w.length > 3) {
    candidates.push(w.slice(0, -1));
  }
  // 4. If ending in 'ed' -> w.slice(0, -2) and w.slice(0, -1) (e.g. juxtaposed -> juxtapose, mitigated -> mitigate)
  if (w.endsWith('ed') && w.length > 4) {
    candidates.push(w.slice(0, -2));
    candidates.push(w.slice(0, -1));
    if (w.length > 5 && w[w.length - 3] === w[w.length - 4]) {
      candidates.push(w.slice(0, -3)); // stopped -> stop
    }
  }
  // 5. If ending in 'ing' -> w.slice(0, -3) and w.slice(0, -3) + 'e' (e.g. fostering -> foster, making -> make)
  if (w.endsWith('ing') && w.length > 5) {
    candidates.push(w.slice(0, -3));
    candidates.push(w.slice(0, -3) + 'e');
    if (w.length > 6 && w[w.length - 4] === w[w.length - 5]) {
      candidates.push(w.slice(0, -4)); // running -> run
    }
  }
  // 6. If ending in 'ly' -> w.slice(0, -2) (e.g. empirically -> empirical)
  if (w.endsWith('ly') && w.length > 4) {
    candidates.push(w.slice(0, -2));
  }

  return Array.from(new Set(candidates.filter((c) => c && c.length >= 2)));
}

export function lemmatizeWord(word: string): string[] {
  return generateLemmaCandidates(word);
}

export const ACADEMIC_FALLBACK_DICT: Record<
  string,
  { definition: string; partOfSpeech: string; example?: string; synonyms?: string[] }
> = {
  foster: {
    definition: "encourage or promote the development of (something, typically regarded as good)",
    partOfSpeech: "verb",
    example: "The university aims to foster critical thinking and collaborative research among undergraduates.",
    synonyms: ["encourage", "promote", "nurture", "cultivate"]
  },
  mitigate: {
    definition: "make less severe, serious, or painful",
    partOfSpeech: "verb",
    example: "New solar shading was installed to mitigate heat accumulation in the campus library.",
    synonyms: ["alleviate", "reduce", "lessen", "diminish"]
  },
  cavity: {
    definition: "an empty space within a solid object or body, especially in a tooth or geological formation",
    partOfSpeech: "noun",
    example: "Fluoride treatments help prevent oral cavities from developing along enamel surfaces.",
    synonyms: ["hollow", "hole", "crater", "void"]
  },
  empirical: {
    definition: "based on, concerned with, or verifiable by observation or experience rather than theory or pure logic",
    partOfSpeech: "adjective",
    example: "The research team provided substantial empirical evidence supporting their climate projection model.",
    synonyms: ["observed", "experimental", "factual", "verifiable"]
  },
  juxtapose: {
    definition: "place or deal with close together for contrasting effect",
    partOfSpeech: "verb",
    example: "The exhibition juxtaposed traditional oil paintings with contemporary digital installations.",
    synonyms: ["compare", "contrast", "collocate"]
  },
  ubiquitous: {
    definition: "present, appearing, or found everywhere simultaneously",
    partOfSpeech: "adjective",
    example: "Smartphones and high-speed wireless networks have become ubiquitous on modern college campuses.",
    synonyms: ["omnipresent", "pervasive", "universal"]
  },
  plasticity: {
    definition: "the adaptability of an organism or synaptic system to changes in its environment or differences between various states",
    partOfSpeech: "noun",
    example: "Neural plasticity allows the human brain to rewire and recover after localized injuries.",
    synonyms: ["malleability", "flexibility", "adaptability"]
  },
  pedagogical: {
    definition: "relating to the methods and theory of teaching and education",
    partOfSpeech: "adjective",
    example: "Faculty members explored modern pedagogical strategies to boost student classroom participation.",
    synonyms: ["educational", "instructional", "scholastic"]
  },
  alleviate: {
    definition: "make (suffering, deficiency, or a problem) less severe",
    partOfSpeech: "verb",
    example: "The city council implemented traffic diversions to alleviate downtown road congestion.",
    synonyms: ["relieve", "ease", "mitigate", "lessen"]
  },
  corroborate: {
    definition: "confirm or give support to (a statement, theory, or finding)",
    partOfSpeech: "verb",
    example: "Independent laboratory trials corroborated the findings reported in the journal publication.",
    synonyms: ["confirm", "verify", "substantiate", "validate"]
  },
  substantiate: {
    definition: "provide evidence to support or prove the truth of",
    partOfSpeech: "verb",
    example: "The student was asked to substantiate their thesis claims with peer-reviewed secondary sources.",
    synonyms: ["prove", "support", "justify", "authenticate"]
  },
  delineate: {
    definition: "describe or portray (something) precisely or outline border boundaries",
    partOfSpeech: "verb",
    example: "The professor clearly delineated the expectations for the upcoming semester capstone project.",
    synonyms: ["outline", "describe", "define", "specify"]
  },
  disseminate: {
    definition: "spread or disperse (information or knowledge) widely",
    partOfSpeech: "verb",
    example: "Public health agencies utilized digital media to disseminate preventative safety guidelines.",
    synonyms: ["broadcast", "circulate", "distribute", "propagate"]
  },
  synthesize: {
    definition: "combine (a number of things) into a coherent whole, or produce chemically",
    partOfSpeech: "verb",
    example: "Students must synthesize arguments from both lecture slides and textbook readings in their essay.",
    synonyms: ["combine", "integrate", "blend", "amalgamate"]
  },
  disparate: {
    definition: "essentially different in kind; not allowing comparison",
    partOfSpeech: "adjective",
    example: "The seminar brought together disparate perspectives from economics, sociology, and ethics.",
    synonyms: ["contrasting", "different", "divergent", "distinct"]
  },
  ambivalent: {
    definition: "having mixed feelings or contradictory ideas about something or someone",
    partOfSpeech: "adjective",
    example: "Surveys showed that community residents were ambivalent regarding the proposed municipal rezoning.",
    synonyms: ["uncertain", "undecided", "conflicted", "equivocal"]
  },
  pragmatic: {
    definition: "dealing with things sensibly and realistically in a way that is based on practical rather than theoretical considerations",
    partOfSpeech: "adjective",
    example: "The department took a pragmatic approach to budget reductions while preserving student tutoring services.",
    synonyms: ["practical", "sensible", "realistic", "utilitarian"]
  },
  tenuous: {
    definition: "very weak or slight; having little substance or validity",
    partOfSpeech: "adjective",
    example: "The historical link between the archaeological artifact and the ancient dynasty remains tenuous.",
    synonyms: ["flimsy", "fragile", "shaky", "doubtful"]
  },
  proliferate: {
    definition: "increase rapidly in numbers; multiply",
    partOfSpeech: "verb",
    example: "Online academic learning platforms proliferated significantly throughout the last decade.",
    synonyms: ["multiply", "burgeon", "escalate", "expand"]
  },
  resilient: {
    definition: "able to withstand or recover quickly from difficult conditions",
    partOfSpeech: "adjective",
    example: "Forest ecosystems proved remarkably resilient following the mild seasonal wildfires.",
    synonyms: ["tough", "hardy", "adaptable", "durable"]
  },
  paradigm: {
    definition: "a typical example or pattern of something; a model or overarching theoretical framework",
    partOfSpeech: "noun",
    example: "The discovery of tectonic plate movement caused a massive paradigm shift in geological science.",
    synonyms: ["model", "framework", "standard", "prototype"]
  },
  anomaly: {
    definition: "something that deviates from what is standard, normal, or expected",
    partOfSpeech: "noun",
    example: "Astronomers detected an unexplained temperature anomaly in the outer sensor recordings.",
    synonyms: ["irregularity", "abnormality", "deviation", "exception"]
  },
  catalyst: {
    definition: "a substance that increases the rate of a chemical reaction, or a person/event that precipitates change",
    partOfSpeech: "noun",
    example: "The prime minister's announcement acted as a catalyst for immediate economic and tax reforms.",
    synonyms: ["stimulus", "spark", "incentive", "activator"]
  },
  ephemeral: {
    definition: "lasting for a very short time; transitory",
    partOfSpeech: "adjective",
    example: "Spring blooms in the desert are notoriously ephemeral, vanishing within a few days of dry wind.",
    synonyms: ["fleeting", "transitory", "short-lived", "momentary"]
  },
  scrutinize: {
    definition: "examine or inspect closely and thoroughly",
    partOfSpeech: "verb",
    example: "Scholars must carefully scrutinize historical manuscripts for signs of later textual alteration.",
    synonyms: ["examine", "inspect", "investigate", "audit"]
  },
  lucid: {
    definition: "expressed clearly; easy to understand, or having clear mental cognition",
    partOfSpeech: "adjective",
    example: "The guest speaker delivered a lucid summary of quantum mechanics accessible to introductory students.",
    synonyms: ["clear", "coherent", "transparent", "articulate"]
  },
  cogent: {
    definition: "clear, logical, and convincing",
    partOfSpeech: "adjective",
    example: "She presented a cogent defense of renewable energy subsidies that swayed committee opinions.",
    synonyms: ["compelling", "persuasive", "convincing", "sound"]
  },
  prevalent: {
    definition: "widespread in a particular area or at a particular time",
    partOfSpeech: "adjective",
    example: "Vitamin D deficiency is especially prevalent among populations living in high northern latitudes.",
    synonyms: ["widespread", "common", "pervasive", "frequent"]
  },
  innate: {
    definition: "inborn; natural; originating in the mind rather than learned from experience",
    partOfSpeech: "adjective",
    example: "Linguists debate whether humans possess an innate universal grammar framework from birth.",
    synonyms: ["inborn", "natural", "inherent", "intrinsic"]
  },
  intrinsic: {
    definition: "belonging naturally; essential; originating from within",
    partOfSpeech: "adjective",
    example: "Curiosity is an intrinsic motivator that fuels genuine academic mastery in young researchers.",
    synonyms: ["inherent", "fundamental", "essential", "built-in"]
  },
  extrinsic: {
    definition: "not part of the essential nature of someone or something; coming or operating from outside",
    partOfSpeech: "adjective",
    example: "Financial awards provide extrinsic motivation but may not sustain lifelong intellectual curiosity.",
    synonyms: ["external", "exterior", "secondary"]
  },
  comprehensive: {
    definition: "complete; including or dealing with all or nearly all elements or aspects of something",
    partOfSpeech: "adjective",
    example: "The handbook provides a comprehensive overview of university research ethics and procedures.",
    synonyms: ["thorough", "exhaustive", "extensive", "complete"]
  },
  feasible: {
    definition: "possible to do easily or conveniently; capable of being carried out successfully",
    partOfSpeech: "adjective",
    example: "Engineers confirmed that constructing the geothermal heating plant was financially feasible.",
    synonyms: ["practicable", "workable", "viable", "achievable"]
  },
  plausible: {
    definition: "seeming reasonable or probable, but not guaranteed to be true",
    partOfSpeech: "adjective",
    example: "The geologist proposed a plausible explanation for the sudden rise in lake mineral levels.",
    synonyms: ["credible", "believable", "likely", "feasible"]
  },
  imperative: {
    definition: "of vital importance; crucial; an essential duty or requirement",
    partOfSpeech: "adjective",
    example: "It is imperative that lab technicians wear protective gear during volatile chemical synthesis.",
    synonyms: ["vital", "crucial", "essential", "urgent"]
  },
  subsequent: {
    definition: "coming after something in time; following",
    partOfSpeech: "adjective",
    example: "Initial clinical trials showed promise, which was confirmed in all subsequent peer experiments.",
    synonyms: ["following", "ensuing", "succeeding", "later"]
  },
  precedent: {
    definition: "an earlier event or action regarded as an example or guide to be considered in subsequent similar circumstances",
    partOfSpeech: "noun",
    example: "The landmark court decision established a major precedent for campus intellectual property rights.",
    synonyms: ["model", "example", "benchmark", "standard"]
  },
  arbitrary: {
    definition: "based on random choice or personal whim, rather than any reason or system",
    partOfSpeech: "adjective",
    example: "Students protested the arbitrary enforcement of strict dorm curfew hours without committee review.",
    synonyms: ["random", "capricious", "whimsical", "unreasoned"]
  },
  coherent: {
    definition: "logical and consistent; forming a unified whole",
    partOfSpeech: "adjective",
    example: "A coherent essay connects topic sentences systematically to the overarching central thesis.",
    synonyms: ["logical", "consistent", "lucid", "articulate"]
  },
  inherent: {
    definition: "existing in something as a permanent, essential, or characteristic attribute",
    partOfSpeech: "adjective",
    example: "Uncertainty is an inherent element of scientific field exploration and statistical forecasting.",
    synonyms: ["intrinsic", "innate", "ingrained", "deep-seated"]
  },
  constitute: {
    definition: "be (a part) of a whole; establish or set up by legal authority",
    partOfSpeech: "verb",
    example: "International graduate students constitute over twenty percent of the student body.",
    synonyms: ["comprise", "form", "compose", "represent"]
  },
  derive: {
    definition: "obtain something from (a specified source); base a concept on a logical deduction",
    partOfSpeech: "verb",
    example: "Many contemporary pharmaceutical compounds are originally derived from tropical plant extracts.",
    synonyms: ["obtain", "extract", "originate", "stem"]
  },
  facilitate: {
    definition: "make (an action or process) easy or easier",
    partOfSpeech: "verb",
    example: "Dedicated seminar rooms facilitate lively debate between graduate students and guest professors.",
    synonyms: ["ease", "assist", "help", "expedite"]
  },
  integrate: {
    definition: "combine (one thing) with another so that they become a whole",
    partOfSpeech: "verb",
    example: "The new curriculum successfully integrates digital literacy with classical humanities courses.",
    synonyms: ["combine", "incorporate", "amalgamate", "merge"]
  },
  fluctuate: {
    definition: "rise and fall irregularly in number or amount",
    partOfSpeech: "verb",
    example: "Consumer commodity prices fluctuate according to global seasonal demand and supply shortages.",
    synonyms: ["vary", "shift", "oscillate", "alternate"]
  },
  diminish: {
    definition: "make or become less",
    partOfSpeech: "verb",
    example: "Taking regular study breaks prevented student concentration from diminishing during finals week.",
    synonyms: ["decrease", "lessen", "reduce", "subside"]
  },
  augment: {
    definition: "make (something) greater by adding to it; increase",
    partOfSpeech: "verb",
    example: "The university received an alumni grant to augment its biological microscopy facility.",
    synonyms: ["increase", "expand", "boost", "enhance"]
  },
  culminate: {
    definition: "reach a climax or point of highest development",
    partOfSpeech: "verb",
    example: "Years of interdisciplinary research culminated in the discovery of a potent new antibiotic.",
    synonyms: ["peak", "climax", "conclude", "terminate"]
  },
  deter: {
    definition: "discourage (someone) from doing something by instilling doubt or fear of the consequences",
    partOfSpeech: "verb",
    example: "Strict honor code penalties deter academic misconduct and plagiarism among undergraduates.",
    synonyms: ["discourage", "dissuade", "inhibit", "prevent"]
  },
  inhibit: {
    definition: "hinder, restrain, or prevent (an action or process)",
    partOfSpeech: "verb",
    example: "High acidity levels in the soil sample inhibited the natural growth of nitrogen-fixing bacteria.",
    synonyms: ["impede", "hinder", "retard", "obstruct"]
  },
  provoke: {
    definition: "stimulate or give rise to (a reaction or emotion, typically a strong or unwelcome one)",
    partOfSpeech: "verb",
    example: "The controversial editorial provoked intense campus discussions regarding free expression.",
    synonyms: ["trigger", "arouse", "stimulate", "instigate"]
  },
  reinforce: {
    definition: "strengthen or support (an object or substance), or provide encouragement for a belief or idea",
    partOfSpeech: "verb",
    example: "Weekly laboratory sessions reinforce theoretical principles introduced during lecture hours.",
    synonyms: ["strengthen", "fortify", "bolster", "support"]
  },
  transcend: {
    definition: "be or go beyond the range or limits of (something abstract, typically a conceptual sphere or division)",
    partOfSpeech: "verb",
    example: "Great scientific works often transcend their historical era and inspire subsequent generations.",
    synonyms: ["surpass", "exceed", "outdo", "eclipse"]
  },
  undermine: {
    definition: "lessen the effectiveness, power, or ability of, especially gradually or insidiously",
    partOfSpeech: "verb",
    example: "Faulty sample calibration threatens to undermine the validity of the final experimental conclusions.",
    synonyms: ["weaken", "subvert", "compromise", "sabotage"]
  },
  viable: {
    definition: "capable of working successfully; feasible; capable of surviving or thriving",
    partOfSpeech: "adjective",
    example: "Geothermal energy represents a long-term viable alternative to traditional coal power plants.",
    synonyms: ["feasible", "workable", "practical", "tenable"]
  },
  versatile: {
    definition: "able to adapt or be adapted to many different functions or activities",
    partOfSpeech: "adjective",
    example: "Carbon fiber is a remarkably versatile material utilized in aircraft and prosthetic engineering.",
    synonyms: ["adaptable", "flexible", "multipurpose", "resourceful"]
  }
};

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
  const candidates = generateLemmaCandidates(cleanWord);

  // 1. Check ACADEMIC_GLOSSARY and ACADEMIC_FALLBACK_DICT for exact word & lemma candidates
  for (const cand of candidates) {
    if (ACADEMIC_GLOSSARY[cand]) {
      const item = ACADEMIC_GLOSSARY[cand];
      return {
        word: cand,
        phonetic: '',
        meanings: [{
          partOfSpeech: item.partOfSpeech || 'noun',
          definition: item.definition,
          example: '',
          synonyms: item.synonyms || []
        }],
        synonyms: item.synonyms || [],
        examples: [],
        source: 'academic_glossary',
        lookupWord: cleanWord,
        contextPos,
      };
    }
    if (ACADEMIC_FALLBACK_DICT[cand]) {
      const item = ACADEMIC_FALLBACK_DICT[cand];
      return {
        word: cand,
        phonetic: '',
        meanings: [{
          partOfSpeech: item.partOfSpeech || 'noun',
          definition: item.definition,
          example: item.example || '',
          synonyms: item.synonyms || []
        }],
        synonyms: item.synonyms || [],
        examples: item.example ? [item.example] : [],
        source: 'academic_fallback_dict',
        lookupWord: cleanWord,
        contextPos,
      };
    }
  }

  // 2. Offline WordNet for candidates
  for (const cand of candidates) {
    try {
      const wordNetRes = await lookupOffline(cand, contextPos);
      if (wordNetRes && wordNetRes.meanings && wordNetRes.meanings.length > 0) {
        return wordNetRes;
      }
    } catch {
      // proceed
    }
  }

  // 3. Cached online result in IndexedDB
  for (const cand of candidates) {
    try {
      const cached = await getCachedOnlineDefinition(cand);
      if (cached && cached.meanings && cached.meanings.length > 0) {
        return cached;
      }
    } catch {
      // proceed
    }
  }

  // 4. Server /api/dictionary
  try {
    const res = await fetch(`/api/dictionary?word=${encodeURIComponent(cleanWord)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.meanings && data.meanings.length > 0) {
        const formatted = {
          word: data.word || cleanWord,
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

  // 5. Direct dictionaryapi call for candidates
  for (const cand of candidates) {
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cand)}`);
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
              word: entry.word || cand,
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
  }

  // Final check: ACADEMIC_FALLBACK_DICT
  for (const cand of candidates) {
    if (ACADEMIC_FALLBACK_DICT[cand]) {
      const item = ACADEMIC_FALLBACK_DICT[cand];
      return {
        word: cand,
        phonetic: '',
        meanings: [{
          partOfSpeech: item.partOfSpeech || 'noun',
          definition: item.definition,
          example: item.example || '',
          synonyms: item.synonyms || []
        }],
        synonyms: item.synonyms || [],
        examples: item.example ? [item.example] : [],
        source: 'academic_fallback_dict',
        lookupWord: cleanWord,
        contextPos,
      };
    }
  }

  return null;
}

export async function lookupWord(word: string, context: string = '') {
  return getDefinition(word, context);
}

export async function fetchWordDefinition(word: string) {
  return getDefinition(word);
}

