/**
 * Local Heuristic TOEFL Rubric Evaluator for zero-API practice.
 * Calibrated against official 2026 ETS TOEFL iBT 1.0–6.0 Band anchors.
 */

export interface EvaluationOptions {
  task?: any;
  wpm?: number;
  pauseCount?: number;
  matchScore?: number;
}

export interface SubScores {
  taskFulfillment: number; // 1.0 - 6.0
  languageUse: number; // 1.0 - 6.0
  topicDevelopment: number; // 1.0 - 6.0
}

export interface EvaluationResult {
  overallBand: number;
  bandScore6: number;
  bandScore: number;
  rawRubricScore: number;
  scaledScore: number;
  performanceLevel: string;
  feedbackSummary: string;
  summary: string;
  subScores: SubScores;
  specificStrengths: string[];
  areasForImprovement: string[];
  topFixes: string[];
  modelBand6Rewrite: string;
  exemplarResponse: string;
  exemplar: string;
  benchmarkAnalysis?: {
    rhetoricalDevices: string[];
    transitionMarkers: string[];
    whyBand6: string;
  };
  errors: Array<{ original: string; corrected: string; explanation: string }>;
  corrections: Array<{ original: string; corrected: string; explanation: string }>;
  tips: string[];
  modelUsed: string;
  isLocalEvaluation: boolean;
  notice: string;
}

const TRANSITIONS = [
  'however', 'furthermore', 'moreover', 'consequently', 'therefore',
  'nevertheless', 'on the other hand', 'in contrast', 'specifically',
  'for instance', 'for example', 'in addition', 'as a result',
  'in particular', 'firstly', 'secondly', 'finally', 'thus',
  'hence', 'whereas', 'conversely', 'notwithstanding', 'subsequently'
];

export function evaluateLocally(
  taskType: string,
  promptData: any,
  studentResponse: any,
  options?: EvaluationOptions
): EvaluationResult {
  const text = typeof studentResponse === 'string' 
    ? studentResponse 
    : String(studentResponse?.response || studentResponse?.text || studentResponse?.transcript || '');

  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const lowerText = text.toLowerCase();

  const specificStrengths: string[] = [];
  const areasForImprovement: string[] = [];

  // 1. Task Fulfillment Metric (1.0 - 6.0)
  let taskFulfillmentScore = 3.5;
  let fulfillmentNotes: string[] = [];

  if (taskType === 'academic-discussion') {
    // Target 100 - 130 words
    if (wordCount >= 100 && wordCount <= 160) {
      taskFulfillmentScore = 5.5;
      specificStrengths.push(`Optimal response volume (${wordCount} words) comfortably fulfills the ETS 100–130 word standard.`);
    } else if (wordCount >= 80) {
      taskFulfillmentScore = 4.5;
      fulfillmentNotes.push(`Your length (${wordCount} words) is slightly below the 100-word target benchmark.`);
      areasForImprovement.push('Expand response length to at least 100 words to explore counterarguments.');
    } else if (wordCount >= 50) {
      taskFulfillmentScore = 3.0;
      fulfillmentNotes.push(`Word count (${wordCount} words) is noticeably brief for an academic discussion.`);
      areasForImprovement.push('Add supporting concrete examples to build an authentic academic paragraph.');
    } else {
      taskFulfillmentScore = 2.0;
      fulfillmentNotes.push(`Response is too short (${wordCount} words) to develop an academic argument.`);
      areasForImprovement.push('Aim for 100+ words with multiple supporting points.');
    }

    // Check if referenced classmate names or ideas
    const s1Name = String(options?.task?.s1?.name || promptData?.s1 || '').toLowerCase();
    const s2Name = String(options?.task?.s2?.name || promptData?.s2 || '').toLowerCase();
    const hasNameRef = (s1Name && lowerText.includes(s1Name.split(' ')[0])) || 
                       (s2Name && lowerText.includes(s2Name.split(' ')[0])) ||
                       lowerText.includes('classmate') || lowerText.includes('student');

    if (hasNameRef) {
      taskFulfillmentScore = Math.min(6.0, taskFulfillmentScore + 0.5);
      specificStrengths.push('Directly engaged with peer viewpoints, contributing effectively to the ongoing academic exchange.');
    } else {
      fulfillmentNotes.push('Explicitly acknowledge a classmate (e.g., "While Marcus makes a valid point...") to demonstrate conversational integration.');
      areasForImprovement.push('Reference a classmate\'s specific claim before advancing your own thesis.');
    }
  } else if (taskType === 'write-email') {
    // Target 100 - 130 words with salutation and sign-off
    if (wordCount >= 95 && wordCount <= 150) {
      taskFulfillmentScore = 5.5;
      specificStrengths.push(`Ideal email length (${wordCount} words) addressing campus scenario requirements.`);
    } else if (wordCount >= 70) {
      taskFulfillmentScore = 4.0;
      areasForImprovement.push('Flesh out each required scenario bullet point with practical details.');
    } else {
      taskFulfillmentScore = 3.0;
      areasForImprovement.push('Expand email body to fully address all three prompt tasks.');
    }

    const hasSalutation = /^(dear|hello|hi|good\s(morning|afternoon)|to)/i.test(text.trim());
    const hasSignOff = /(sincerely|best regards|regards|thank you|warmly|respectfully)/i.test(text);

    if (hasSalutation && hasSignOff) {
      taskFulfillmentScore = Math.min(6.0, taskFulfillmentScore + 0.5);
      specificStrengths.push('Proper email etiquette with professional greeting and formal closing.');
    } else {
      fulfillmentNotes.push('Include an academic salutation (e.g., "Dear Professor...") and formal sign-off ("Best regards").');
      areasForImprovement.push('Include both a formal greeting (e.g. "Dear Professor...") and courteous sign-off.');
    }
  } else if (taskType === 'speaking-interview') {
    const wpm = options?.wpm || (wordCount > 0 ? Math.round((wordCount / 45) * 60) : 120);
    if (wpm >= 115 && wpm <= 165) {
      taskFulfillmentScore = 5.5;
      specificStrengths.push(`Natural speech pacing (${wpm} WPM) within the target TOEFL delivery range.`);
    } else if (wpm >= 90) {
      taskFulfillmentScore = 4.0;
      areasForImprovement.push(`Speech rate (${wpm} WPM) is moderate; aim for 120–150 WPM for maximum fluency.`);
    } else {
      taskFulfillmentScore = 2.5;
      fulfillmentNotes.push(`Speech rate (${wpm} WPM) is on the lower side; target 120-150 WPM for natural fluency.`);
      areasForImprovement.push('Reduce long pauses between thoughts to elevate vocal confidence.');
    }
  } else {
    taskFulfillmentScore = wordCount >= 30 ? 5.0 : 3.0;
  }

  // 2. Language Use Metric (1.0 - 6.0)
  // Lexical Sophistication & Variety
  const uniqueWords = new Set(words.map((w) => w.toLowerCase().replace(/[^a-z]/g, ''))).size;
  const ttr = wordCount > 0 ? uniqueWords / wordCount : 0.5;
  const avgWordLen = wordCount > 0 ? words.reduce((acc, w) => acc + w.length, 0) / wordCount : 4.5;

  let languageUseScore = 3.5;
  if (ttr >= 0.55 && avgWordLen >= 4.7) {
    languageUseScore = 5.5;
    specificStrengths.push(`Rich lexical diversity (${Math.round(ttr * 100)}% unique words) with advanced academic vocabulary.`);
  } else if (ttr >= 0.45) {
    languageUseScore = 4.5;
    specificStrengths.push('Good foundational vocabulary with clear sentence structures.');
  } else {
    languageUseScore = 3.0;
    areasForImprovement.push('Replace repeated simple words with formal academic synonyms.');
  }

  // 3. Topic Development & Coherence (1.0 - 6.0)
  const transitionsUsed = TRANSITIONS.filter((t) => lowerText.includes(t));
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 3);
  let topicDevScore = 3.5;

  if (transitionsUsed.length >= 3 && sentences.length >= 3) {
    topicDevScore = 5.5;
    specificStrengths.push(`Smooth discourse coherence utilizing transitions (${transitionsUsed.slice(0, 3).join(', ')}).`);
  } else if (transitionsUsed.length >= 1) {
    topicDevScore = 4.5;
    specificStrengths.push('Logical progression of ideas connecting claims to reasons.');
    areasForImprovement.push('Incorporate additional discourse connectors like "furthermore" or "conversely".');
  } else {
    topicDevScore = 3.0;
    fulfillmentNotes.push('Incorporate formal transition markers (e.g., "consequently", "furthermore", "in contrast") to link ideas.');
    areasForImprovement.push('Use transitional markers to clearly guide the rater through your arguments.');
  }

  // Syntactic structure balance check
  if (sentences.length >= 3) {
    const lengths = sentences.map((s) => s.trim().split(/\s+/).length);
    const hasComplex = lengths.some((l) => l >= 15);
    const hasConcise = lengths.some((l) => l <= 12);
    if (hasComplex && hasConcise) {
      topicDevScore = Math.min(6.0, topicDevScore + 0.3);
      languageUseScore = Math.min(6.0, languageUseScore + 0.2);
    }
  }

  // Overall Band (1.0 - 6.0)
  const subScores: SubScores = {
    taskFulfillment: Math.round(Math.min(6.0, Math.max(1.0, taskFulfillmentScore)) * 10) / 10,
    languageUse: Math.round(Math.min(6.0, Math.max(1.0, languageUseScore)) * 10) / 10,
    topicDevelopment: Math.round(Math.min(6.0, Math.max(1.0, topicDevScore)) * 10) / 10,
  };

  const composite = (subScores.taskFulfillment * 0.4) + (subScores.languageUse * 0.3) + (subScores.topicDevelopment * 0.3);
  let overallBand = Math.round(composite * 2) / 2;
  overallBand = Math.min(6.0, Math.max(1.0, overallBand));

  // Determine performance level and scaled score out of 30
  let performanceLevel = 'Advanced';
  let scaled = 30;
  if (overallBand >= 5.5) {
    performanceLevel = 'Advanced';
    scaled = overallBand === 6.0 ? 30 : 28;
  } else if (overallBand >= 4.0) {
    performanceLevel = 'High-Intermediate';
    scaled = overallBand === 5.0 ? 25 : overallBand === 4.5 ? 22 : 19;
  } else if (overallBand >= 2.5) {
    performanceLevel = 'Low-Intermediate';
    scaled = overallBand === 3.5 ? 17 : overallBand === 3.0 ? 14 : 11;
  } else {
    performanceLevel = 'Basic';
    scaled = 8;
  }

  const rawRubric = Math.round((overallBand / 6.0) * (taskType.includes('speaking') ? 4.0 : 5.0) * 10) / 10;

  // Curated Model Band 6 Response from task or fallback
  const curatedModel = options?.task?.modelResponse || 
                       options?.task?.sampleResponse || 
                       options?.task?.sampleAnswer || 
                       promptData?.modelResponse || 
                       promptData?.sampleResponse ||
                       `An exemplary Band 6.0 response addresses every element of the prompt with nuanced conceptual reasoning, academic transitional markers, and precise lexical variety.`;

  // Top Fixes
  const topFixes: string[] = [];
  if (fulfillmentNotes.length > 0) {
    topFixes.push(`1. ${fulfillmentNotes[0]}`);
  } else {
    topFixes.push('1. Excellent task fulfillment! Maintain this balance of supporting examples and clear topic sentence focus.');
  }

  if (fulfillmentNotes.length > 1) {
    topFixes.push(`2. ${fulfillmentNotes[1]}`);
  } else if (transitionsUsed.length < 3) {
    topFixes.push('2. Elevate syntactic maturity by linking consecutive points with transitions like "conversely", "specifically", or "notwithstanding".');
  } else {
    topFixes.push('2. Continue refining academic register by substituting common descriptive terms with domain-specific terminology.');
  }

  const summary = `Local Rubric Assessment: Your response earned a Band ${overallBand.toFixed(1)}/6.0 (${performanceLevel}, approx. ${scaled}/30). It features ${wordCount} words across ${sentences.length} sentences with ${uniqueWords} unique lexical terms (${Math.round(ttr * 100)}% vocabulary variation) and ${transitionsUsed.length} discourse markers.`;

  // Suggested grammar and lexical corrections
  const corrections: Array<{ original: string; corrected: string; explanation: string }> = [];
  if (lowerText.includes('a lot of')) {
    corrections.push({
      original: 'a lot of',
      corrected: 'a substantial amount of / numerous',
      explanation: 'In academic writing, replace colloquial quantifiers like "a lot of" with formal precision.'
    });
  }
  if (lowerText.includes('thing') || lowerText.includes('things')) {
    corrections.push({
      original: 'things',
      corrected: 'factors / aspects / considerations',
      explanation: 'Vague nouns weaken academic arguments; specify the concrete factor or element.'
    });
  }
  if (lowerText.includes('i think that')) {
    corrections.push({
      original: 'I think that',
      corrected: 'In my view, / Evidence suggests that',
      explanation: 'Opening with academic discourse markers projects authoritative scholarship.'
    });
  }

  return {
    overallBand,
    bandScore6: overallBand,
    bandScore: overallBand,
    rawRubricScore: rawRubric,
    scaledScore: scaled,
    performanceLevel,
    feedbackSummary: summary,
    summary,
    subScores,
    specificStrengths,
    areasForImprovement,
    topFixes,
    modelBand6Rewrite: curatedModel,
    exemplarResponse: curatedModel,
    exemplar: curatedModel,
    benchmarkAnalysis: {
      rhetoricalDevices: [
        'Nuanced concession acknowledging counterarguments before asserting position',
        'Topical topic sentences establishing distinct analytical boundaries',
        'Precise domain vocabulary avoiding colloquial idioms'
      ],
      transitionMarkers: [
        'Cohesive ties: "Consequently", "In contrast", "Furthermore"',
        'Logical consequence markers linking evidence to claims'
      ],
      whyBand6: 'Directly addresses all aspects of the academic prompt with clear syntactic complexity, seamless discourse markers, and zero grammatical ambiguity.'
    },
    errors: corrections,
    corrections,
    tips: [
      'Aim for 100–130 words to comfortably reach the upper score band',
      'Use at least 3 distinct academic transition markers',
      'Compare your structure against the Band 6.0 model response below'
    ],
    modelUsed: 'TOEFL Authentic Heuristic Scoring Engine (Zero-API)',
    isLocalEvaluation: true,
    notice: 'Evaluated via Local Offline TOEFL Rubric (Zero API)',
  };
}
