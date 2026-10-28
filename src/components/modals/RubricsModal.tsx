import React, { useState } from 'react';
import {
  X,
  Award,
  Clock,
  Calculator,
  BookOpen,
  CheckCircle2,
  Download,
  ExternalLink,
  Layers,
  FileText,
  Sparkles,
  Volume2,
  PenTool,
  Mic,
} from 'lucide-react';
import {
  TOEFL_CONCORDANCE_TABLE_2026,
  OFFICIAL_TASK_RUBRICS,
  convertScaledToBand6,
  convertOverall120ToBand6,
  getCefrFromBand6,
} from '../../utils/toeflScoring';

export interface RubricsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type GuideTab = 'structure' | 'tasks' | 'concordance' | 'rubrics';
type SectionFilter = 'all' | 'Reading' | 'Listening' | 'Writing' | 'Speaking';

interface OfficialSectionOverview {
  order: number;
  section: 'Reading' | 'Listening' | 'Writing' | 'Speaking';
  adaptiveBadge: string;
  tasks: string[];
  items: number;
  timeMinutes: number;
  notes: string;
}

const OFFICIAL_SECTIONS_2026: OfficialSectionOverview[] = [
  {
    order: 1,
    section: 'Reading',
    adaptiveBadge: 'Multistage Adaptive',
    tasks: ['Complete the Words', 'Read in Daily Life', 'Read an Academic Passage'],
    items: 50,
    timeMinutes: 30,
    notes: 'Adapts between Stage 1 (Router) and Stage 2 based on test-taker accuracy across academic and everyday reading tasks.',
  },
  {
    order: 2,
    section: 'Listening',
    adaptiveBadge: 'Multistage Adaptive',
    tasks: [
      'Listen and Choose a Response',
      'Listen to a Conversation',
      'Listen to an Announcement',
      'Listen to an Academic Talk',
    ],
    items: 47,
    timeMinutes: 29,
    notes: 'Features authentic North American, UK, and Australian English accents across campus, everyday, and university lecture contexts.',
  },
  {
    order: 3,
    section: 'Writing',
    adaptiveBadge: 'Linear Fixed Form',
    tasks: ['Build a Sentence', 'Write an Email', 'Write for an Academic Discussion'],
    items: 12,
    timeMinutes: 23,
    notes: 'Combines 10 sentence-construction items with 2 extended communicative writing tasks (7-minute Email + 10-minute Academic Discussion).',
  },
  {
    order: 4,
    section: 'Speaking',
    adaptiveBadge: 'Linear Fixed Form',
    tasks: ['Listen and Repeat', 'Take an Interview'],
    items: 11,
    timeMinutes: 8,
    notes: 'Assesses intelligible pronunciation and prosody across 7 progressively longer sentences and spontaneous fluency across 4 interview questions.',
  },
];

interface OfficialTaskBreakdown {
  section: 'Reading' | 'Listening' | 'Writing' | 'Speaking';
  name: string;
  itemCountLabel: string;
  timingOrLength: string;
  formatDescription: string;
  textOrTopicTypes: string[];
  questionOrSkillTypes: string[];
}

const OFFICIAL_12_TASKS_BREAKDOWN: OfficialTaskBreakdown[] = [
  // READING (3 Tasks)
  {
    section: 'Reading',
    name: 'Complete the Words',
    itemCountLabel: '10 blanks per paragraph',
    timingOrLength: '70–100 word academic paragraph',
    formatDescription:
      'The first sentence of the academic paragraph remains completely intact to establish context. Starting in the second sentence, the second half of every second word is deleted for 10 words total.',
    textOrTopicTypes: [
      'University-level expository paragraphs',
      'Natural sciences, social sciences, humanities, business, and arts',
    ],
    questionOrSkillTypes: [
      'Lexical precision & academic vocabulary in context',
      'Morphological inflection (plural, tense, derivational suffixes)',
      'Syntactic & discourse-level reading comprehension',
    ],
  },
  {
    section: 'Reading',
    name: 'Read in Daily Life',
    itemCountLabel: '2 or 3 questions per text (based on length)',
    timingOrLength: '15–150 word nonacademic text',
    formatDescription:
      'Presents authentic everyday and campus texts ranging from 15 to 150 words, followed by 2 multiple-choice questions for shorter texts (15–70 words) or 3 multiple-choice questions for longer texts (75–150 words).',
    textOrTopicTypes: [
      'Posters, signs, notices, and menus',
      'Social media posts, web pages, and schedules',
      'Emails, text-message chains, and advertisements',
      'News articles, forms, invoices, and receipts',
    ],
    questionOrSkillTypes: [
      'Main purpose & communicative intent',
      'Reading nonlinear formats (tables, schedules, itemized receipts)',
      'Understanding informal, idiomatic, or telegraphic language',
      'Making pragmatic inferences & skimming/scanning for specific details',
    ],
  },
  {
    section: 'Reading',
    name: 'Read an Academic Passage',
    itemCountLabel: '5 questions per passage',
    timingOrLength: '~200-word expository academic passage',
    formatDescription:
      'Concise, information-dense university-level expository passages (~200 words) followed by 5 multiple-choice comprehension questions.',
    textOrTopicTypes: [
      'History & world civilizations',
      'Art, music, & architecture',
      'Business & economics',
      'Life science, physical science, & social science',
    ],
    questionOrSkillTypes: [
      'Factual & Negative Factual Information',
      'Vocabulary in Context',
      'Inference & Implied Relationships',
      'Relationship Between Ideas & Rhetorical Purpose / Passage Structure',
    ],
  },

  // LISTENING (4 Tasks)
  {
    section: 'Listening',
    name: 'Listen and Choose a Response',
    itemCountLabel: '1 spoken utterance + 4 written options per item',
    timingOrLength: 'Short single-sentence question or statement',
    formatDescription:
      'Test takers hear a short spoken question or statement (only heard via audio, never written on screen) and select the most appropriate reply from 4 written options.',
    textOrTopicTypes: [
      'Everyday social interactions & campus inquiries',
      'Scheduling, coursework, library, dining, and office-hour exchanges',
    ],
    questionOrSkillTypes: [
      'Social appropriateness & pragmatic meaning',
      'Literal vs. implied conversational intent',
      'Grammatical alignment (tense, pronoun reference, question type)',
      'Prosody & intonation interpretation',
    ],
  },
  {
    section: 'Listening',
    name: 'Listen to a Conversation',
    itemCountLabel: '2 questions per conversation',
    timingOrLength: 'Short 2-speaker dialogue',
    formatDescription:
      'A natural 2-speaker conversation set in campus or daily life contexts, followed by 2 multiple-choice questions.',
    textOrTopicTypes: [
      'Campus dining, housing, and student services',
      'Academic advising, education, and coursework planning',
      'Health services, travel arrangements, and campus employment',
    ],
    questionOrSkillTypes: [
      'Main idea / conversational gist',
      'Key factual details & idiomatic expressions',
      'Speaker purpose, attitude, & pragmatic inference',
      'Predicting future actions or next steps',
    ],
  },
  {
    section: 'Listening',
    name: 'Listen to an Announcement',
    itemCountLabel: '2 questions per announcement',
    timingOrLength: '40–85 word spoken announcement',
    formatDescription:
      'A single-speaker academic, classroom, or campus announcement (40–85 words) followed by 2 multiple-choice questions.',
    textOrTopicTypes: [
      'Course schedule changes & syllabus updates',
      'Laboratory or facility rules & safety guidelines',
      'Guest lectures, symposiums, & student achievements',
    ],
    questionOrSkillTypes: [
      'Main purpose of the announcement',
      'Specific logistical details (deadlines, locations, requirements)',
      'Required attendee actions & implied policies',
    ],
  },
  {
    section: 'Listening',
    name: 'Listen to an Academic Talk',
    itemCountLabel: '4 questions per talk',
    timingOrLength: '100–250 word educator talk or podcast',
    formatDescription:
      'A single-speaker university lecture segment, educator talk, or academic podcast (100–250 words) followed by 4 multiple-choice questions.',
    textOrTopicTypes: [
      'Life & physical sciences (biology, astronomy, environmental science)',
      'Social sciences (psychology, sociology, anthropology)',
      'Business, economics, history, and arts',
    ],
    questionOrSkillTypes: [
      'Main idea & core supporting evidence',
      'Conceptual inference & application of theories',
      'Lecture organization, examples, & rhetorical structure',
      'Domain vocabulary & terminology in context',
    ],
  },

  // WRITING (3 Tasks)
  {
    section: 'Writing',
    name: 'Build a Sentence',
    itemCountLabel: '10 items',
    timingOrLength: '2-speaker exchange with scrambled reply',
    formatDescription:
      'Presents a 2-speaker exchange where the first speaker’s sentence is intact and the second speaker’s reply consists of scrambled words and phrases that must be arranged in the proper syntactic order.',
    textOrTopicTypes: [
      'Academic & campus conversations',
      'Everyday scheduling, feedback, and collaborative study exchanges',
    ],
    questionOrSkillTypes: [
      'Word order & English clause architecture',
      'Indirect/embedded questions & relative clauses',
      'Auxiliary verbs, modals, and prepositional phrasing',
    ],
  },
  {
    section: 'Writing',
    name: 'Write an Email',
    itemCountLabel: '1 extended task (Score 0–5)',
    timingOrLength: '7 minutes',
    formatDescription:
      'Test takers read an academic or social scenario with pre-filled To: and Subject: headers and compose a clear, well-organized email addressing 3 specific bulleted communicative goals.',
    textOrTopicTypes: [
      'Writing to a professor, advisor, internship coordinator, or campus office',
      'Proposing solutions, requesting accommodations, or providing structured feedback',
    ],
    questionOrSkillTypes: [
      'Task fulfillment across all 3 communicative bullet points',
      'Audience-appropriate register, politeness, and tone',
      'Logical organization, syntactic variety, and lexical precision',
    ],
  },
  {
    section: 'Writing',
    name: 'Write for an Academic Discussion',
    itemCountLabel: '1 extended task (Score 0–5)',
    timingOrLength: '10 minutes · Minimum 100 words recommended',
    formatDescription:
      'Simulates an online university course discussion board featuring a professor’s question and 2 contrasting student posts. Test takers write a substantive response contributing their own perspective.',
    textOrTopicTypes: [
      'Public policy, education, technology, economics, sociology, and environmental debates',
    ],
    questionOrSkillTypes: [
      'Expressing and elaborating a clear, well-reasoned academic argument',
      'Building upon or contrasting with classmates’ points without mere repetition',
      'Syntactic variety, academic vocabulary range, and discourse cohesion',
    ],
  },

  // SPEAKING (2 Tasks)
  {
    section: 'Speaking',
    name: 'Listen and Repeat',
    itemCountLabel: '7 sentences (Score 0–5 per sentence)',
    timingOrLength: '8–12 seconds response window per sentence',
    formatDescription:
      'Test takers view a visual campus or workplace setting and hear 7 progressively longer sentences (no text shown on screen), repeating each sentence verbatim immediately after the audio cue.',
    textOrTopicTypes: [
      'University orientation, library tours, lab briefings, and student center scenarios',
    ],
    questionOrSkillTypes: [
      'Exact lexical and syntactic reproduction in proper word order',
      'Intelligible segmentals (vowels/consonants) and word-level stress',
      'Natural sentence-level rhythm, chunking, and intonation',
    ],
  },
  {
    section: 'Speaking',
    name: 'Take an Interview',
    itemCountLabel: '4 questions (Score 0–5 per question)',
    timingOrLength: '45 seconds per question · 0 seconds prep time',
    formatDescription:
      'A prerecorded interviewer asks 4 sequential questions on a shared theme, moving from personal experience and preferences to broader analytical or societal opinions.',
    textOrTopicTypes: [
      'Education, career readiness, technology habits, community life, and campus policy',
    ],
    questionOrSkillTypes: [
      'Spontaneous topical development & relevant elaboration',
      'Conversational fluency, pacing, and natural transitions (natural fillers like "um"/"uh" are accepted when speech remains fluent)',
      'Lexical precision, syntactic variety, and overall intelligibility',
    ],
  },
];

interface RawScoreTableRow {
  section: 'Reading' | 'Listening' | 'Writing' | 'Speaking';
  rawRange: string;
  scoringBreakdown: string;
  reportedScale: string;
}

const TABLE_1_RAW_SCORE_RANGES: RawScoreTableRow[] = [
  {
    section: 'Reading',
    rawRange: '0–30',
    scoringBreakdown: '50 scored/adaptive items across Complete the Words, Read in Daily Life, and Read an Academic Passage',
    reportedScale: 'Band 1.0–6.0 (0.5 increments) & Scaled 0–30',
  },
  {
    section: 'Listening',
    rawRange: '0–30',
    scoringBreakdown: '47 scored/adaptive items across Response, Conversation, Announcement, and Academic Talk tasks',
    reportedScale: 'Band 1.0–6.0 (0.5 increments) & Scaled 0–30',
  },
  {
    section: 'Writing',
    rawRange: '0–20',
    scoringBreakdown: 'Build a Sentence (10 items, 0–10 pts) + Write an Email (0–5 rubric) + Academic Discussion (0–5 rubric)',
    reportedScale: 'Band 1.0–6.0 (0.5 increments) & Scaled 0–30',
  },
  {
    section: 'Speaking',
    rawRange: '0–55',
    scoringBreakdown: 'Listen and Repeat (7 sentences × 0–5 rubric = 0–35 pts) + Take an Interview (4 questions × 0–5 rubric = 0–20 pts)',
    reportedScale: 'Band 1.0–6.0 (0.5 increments) & Scaled 0–30',
  },
];

interface CefrMappingRow {
  cefr: string;
  levelName: string;
  toeflBand: string;
  descriptor: string;
  badgeStyle: string;
}

const TABLE_2_CEFR_MAPPING: CefrMappingRow[] = [
  {
    cefr: 'C2',
    levelName: 'Proficient — Mastery',
    toeflBand: '6.0',
    descriptor: 'Understands with ease virtually everything heard or read; expresses ideas spontaneously, very fluently, and precisely in complex academic situations.',
    badgeStyle: 'bg-purple-50 text-purple-800 border-purple-200',
  },
  {
    cefr: 'C1',
    levelName: 'Advanced — Effective Operational Proficiency',
    toeflBand: '5.0 – 5.5',
    descriptor: 'Understands a wide range of demanding, longer academic texts and recognizes implicit meaning; produces clear, well-structured, detailed text on complex subjects.',
    badgeStyle: 'bg-teal-50 text-teal-800 border-teal-200',
  },
  {
    cefr: 'B2',
    levelName: 'Upper-Intermediate — Vantage',
    toeflBand: '4.0 – 4.5',
    descriptor: 'Understands the main ideas of complex text on both concrete and abstract topics; interacts with a degree of fluency and spontaneity suitable for university study.',
    badgeStyle: 'bg-blue-50 text-blue-800 border-blue-200',
  },
  {
    cefr: 'B1',
    levelName: 'Intermediate — Threshold',
    toeflBand: '3.0 – 3.5',
    descriptor: 'Understands the main points of clear standard input on familiar matters regularly encountered in work, school, and campus life.',
    badgeStyle: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  {
    cefr: 'A2',
    levelName: 'Elementary — Waystage',
    toeflBand: '2.0 – 2.5',
    descriptor: 'Understands sentences and frequently used expressions related to areas of most immediate relevance (basic personal, shopping, local campus geography).',
    badgeStyle: 'bg-orange-50 text-orange-800 border-orange-200',
  },
  {
    cefr: 'A1',
    levelName: 'Beginner — Breakthrough',
    toeflBand: '1.0 – 1.5',
    descriptor: 'Understands and uses familiar everyday expressions and very basic phrases aimed at the satisfaction of concrete needs.',
    badgeStyle: 'bg-rose-50 text-rose-800 border-rose-200',
  },
];

/**
 * Generates a self-contained printable HTML/PDF-ready Official 2026 TOEFL iBT® Guide document
 * and triggers a reliable file download if `/Updated-TOEFL-iBT-Test-Overview.pdf` is not statically hosted.
 */
async function downloadOfficialToeflGuide(): Promise<void> {
  try {
    const res = await fetch('/Updated-TOEFL-iBT-Test-Overview.pdf', { method: 'HEAD' });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.toLowerCase().includes('application/pdf')) {
      const link = document.createElement('a');
      link.href = '/Updated-TOEFL-iBT-Test-Overview.pdf';
      link.download = 'Updated-TOEFL-iBT-Test-Overview.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }
  } catch {
    // Fallback to generating the complete offline downloadable guide
  }

  const concordanceRowsHtml = TOEFL_CONCORDANCE_TABLE_2026.map(
    (r) => `
      <tr>
        <td><strong>${r.band.toFixed(1)}</strong></td>
        <td>${r.cefr}</td>
        <td>${r.reading[0]}–${r.reading[1]}</td>
        <td>${r.listening[0]}–${r.listening[1]}</td>
        <td>${r.writing[0]}–${r.writing[1]}</td>
        <td>${r.speaking[0]}–${r.speaking[1]}</td>
        <td><strong>${r.overall[0]}–${r.overall[1]}</strong></td>
      </tr>`
  ).join('');

  const tasksHtml = OFFICIAL_12_TASKS_BREAKDOWN.map(
    (t) => `
      <div class="card">
        <h3>[${t.section}] ${t.name} — <span>${t.itemCountLabel} (${t.timingOrLength})</span></h3>
        <p>${t.formatDescription}</p>
        <p><strong>Topics & Formats:</strong> ${t.textOrTopicTypes.join('; ')}</p>
        <p><strong>Skills Tested:</strong> ${t.questionOrSkillTypes.join('; ')}</p>
      </div>`
  ).join('');

  const htmlDoc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Official 2026 TOEFL iBT Test Guide & Scoring Reference</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; line-height: 1.5; max-width: 920px; margin: 28px auto; padding: 0 20px; }
    h1 { color: #0f766e; border-bottom: 2px solid #0f766e; padding-bottom: 8px; }
    h2 { color: #1e293b; margin-top: 28px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 13px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
    th { background: #f1f5f9; font-weight: 700; }
    .card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 16px; margin-bottom: 10px; background: #f8fafc; }
    .card h3 { margin: 0 0 6px 0; font-size: 15px; color: #0f766e; }
    .card h3 span { color: #475569; font-weight: 500; font-size: 13px; }
    .card p { margin: 4px 0; font-size: 13px; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <h1>Official 2026 TOEFL iBT® Test Guide & Scoring Reference</h1>
  <p><strong>Overview:</strong> Multistage adaptive design in Reading and Listening · Under 2 hours total test time · Official scores reported in 3 days with MyBest® Scores · Scored on the 1.0–6.0 Band Scale (0.5 increments) aligned with CEFR alongside 0–30 section and 0–120 total scores.</p>

  <h2>1. Official Section Order & Timing</h2>
  <table>
    <thead>
      <tr><th>Order</th><th>Section</th><th>Delivery</th><th>Official Tasks</th><th>Items</th><th>Time</th></tr>
    </thead>
    <tbody>
      <tr><td>1</td><td>Reading</td><td>Multistage Adaptive</td><td>Complete the Words, Read in Daily Life, Read an Academic Passage</td><td>50</td><td>30 mins</td></tr>
      <tr><td>2</td><td>Listening</td><td>Multistage Adaptive</td><td>Listen and Choose a Response, Listen to a Conversation, Listen to an Announcement, Listen to an Academic Talk (North American, UK & Australian accents)</td><td>47</td><td>29 mins</td></tr>
      <tr><td>3</td><td>Writing</td><td>Linear</td><td>Build a Sentence, Write an Email, Write for an Academic Discussion</td><td>12</td><td>23 mins</td></tr>
      <tr><td>4</td><td>Speaking</td><td>Linear</td><td>Listen and Repeat, Take an Interview</td><td>11</td><td>8 mins</td></tr>
    </tbody>
  </table>

  <h2>2. All 12 Official Task Types Breakdown</h2>
  ${tasksHtml}

  <h2>3. Table 1 (Raw Score Ranges), Table 2 (CEFR) & Table 3 (Score Concordance)</h2>
  <table>
    <thead>
      <tr><th>Section</th><th>Raw Score Range</th><th>Component Breakdown</th><th>Reported Scale</th></tr>
    </thead>
    <tbody>
      <tr><td>Reading</td><td>0–30</td><td>50 items across 3 task types</td><td>Band 1.0–6.0 & Scaled 0–30</td></tr>
      <tr><td>Listening</td><td>0–30</td><td>47 items across 4 task types</td><td>Band 1.0–6.0 & Scaled 0–30</td></tr>
      <tr><td>Writing</td><td>0–20</td><td>Build a Sentence (0–10) + Email (0–5) + Academic Discussion (0–5)</td><td>Band 1.0–6.0 & Scaled 0–30</td></tr>
      <tr><td>Speaking</td><td>0–55</td><td>Listen & Repeat (7 × 0–5 = 0–35) + Take an Interview (4 × 0–5 = 0–20)</td><td>Band 1.0–6.0 & Scaled 0–30</td></tr>
    </tbody>
  </table>

  <table>
    <thead>
      <tr><th>Band (1.0–6.0)</th><th>CEFR</th><th>Reading (0–30)</th><th>Listening (0–30)</th><th>Writing (0–30)</th><th>Speaking (0–30)</th><th>Overall (0–120)</th></tr>
    </thead>
    <tbody>
      ${concordanceRowsHtml}
    </tbody>
  </table>
</body>
</html>`;

  const blob = new Blob([htmlDoc], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Official-2026-TOEFL-iBT-Test-Guide-and-Rubrics.html';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const RubricsModal: React.FC<RubricsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<GuideTab>('structure');
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>('all');
  const [selectedTaskRubric, setSelectedTaskRubric] = useState<
    'write-email' | 'academic-discussion' | 'listen-repeat' | 'speaking-interview'
  >('write-email');

  // Interactive Calculator State
  const [calcReading, setCalcReading] = useState<number>(28);
  const [calcListening, setCalcListening] = useState<number>(27);
  const [calcWriting, setCalcWriting] = useState<number>(26);
  const [calcSpeaking, setCalcSpeaking] = useState<number>(26);

  if (!isOpen) return null;

  const readingBand = convertScaledToBand6(calcReading, 'Reading');
  const listeningBand = convertScaledToBand6(calcListening, 'Listening');
  const writingBand = convertScaledToBand6(calcWriting, 'Writing');
  const speakingBand = convertScaledToBand6(calcSpeaking, 'Speaking');

  const totalScore = calcReading + calcListening + calcWriting + calcSpeaking;
  const overallBand = convertOverall120ToBand6(totalScore);
  const cefr = getCefrFromBand6(overallBand);

  const filteredTasks =
    sectionFilter === 'all'
      ? OFFICIAL_12_TASKS_BREAKDOWN
      : OFFICIAL_12_TASKS_BREAKDOWN.filter((t) => t.section === sectionFilter);

  const getSectionIcon = (sec: 'Reading' | 'Listening' | 'Writing' | 'Speaking') => {
    switch (sec) {
      case 'Reading':
        return <BookOpen className="w-4 h-4 text-teal-700" />;
      case 'Listening':
        return <Volume2 className="w-4 h-4 text-blue-700" />;
      case 'Writing':
        return <PenTool className="w-4 h-4 text-indigo-700" />;
      case 'Speaking':
        return <Mic className="w-4 h-4 text-amber-700" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[92vh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 px-6 py-4 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-700 text-white flex items-center justify-center shadow-xs shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Official 2026 TOEFL iBT® Test Guide &amp; Scoring Reference
              </h2>
              <p className="text-xs text-slate-500">
                Multistage Adaptive Test Design · All 12 Task Specifications · Band 1–6 &amp; CEFR Concordance · 0–5 Scoring Guides
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={downloadOfficialToeflGuide}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
              title="Download printable Official 2026 TOEFL iBT Test Guide & Scoring Reference"
            >
              <Download className="w-3.5 h-3.5" />
              <span>📥 Download Official Guide (PDF)</span>
            </button>
            <a
              href="https://www.ets.org/toefl/test-takers/ibt/about.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors"
              title="Visit Official ETS TOEFL iBT Resource Page"
            >
              <span>ETS Resource</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
            </a>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 4 Clean Interactive Tabs */}
        <div className="flex border-b border-slate-200 px-6 bg-slate-50 text-xs font-semibold overflow-x-auto gap-1.5">
          <button
            onClick={() => setActiveTab('structure')}
            className={`py-3 px-3.5 border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'structure'
                ? 'border-teal-700 text-teal-800 font-bold bg-white -mb-px rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>1. Test Structure &amp; What&apos;s on the Test</span>
          </button>

          <button
            onClick={() => setActiveTab('tasks')}
            className={`py-3 px-3.5 border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'tasks'
                ? 'border-teal-700 text-teal-800 font-bold bg-white -mb-px rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>2. Task, Paragraph &amp; Question Types (All 12)</span>
          </button>

          <button
            onClick={() => setActiveTab('concordance')}
            className={`py-3 px-3.5 border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'concordance'
                ? 'border-teal-700 text-teal-800 font-bold bg-white -mb-px rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            <span>3. Band Scale (1–6), CEFR &amp; Concordance Tables</span>
          </button>

          <button
            onClick={() => setActiveTab('rubrics')}
            className={`py-3 px-3.5 border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'rubrics'
                ? 'border-teal-700 text-teal-800 font-bold bg-white -mb-px rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>4. Official 0–5 Writing &amp; Speaking Scoring Guides</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: TEST STRUCTURE & WHAT'S ON THE TEST */}
          {activeTab === 'structure' && (
            <div className="space-y-6">
              {/* Key Highlights Banner */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border border-teal-200 bg-teal-50/50 rounded-xl p-4 space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-xs text-teal-900">
                    <Sparkles className="w-4 h-4 text-teal-700 shrink-0" />
                    <span>Multistage Adaptive Design</span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    The <strong>Reading</strong> and <strong>Listening</strong> sections use a multistage adaptive design that adjusts in real time based on test-taker performance to provide a tailored, accurate measurement of proficiency.
                  </p>
                </div>

                <div className="border border-blue-200 bg-blue-50/40 rounded-xl p-4 space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-xs text-blue-900">
                    <Clock className="w-4 h-4 text-blue-700 shrink-0" />
                    <span>Under 2 Hours Total Time</span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    Total active testing time is <strong>90 minutes</strong> (under 2 hours overall session time) across <strong>120 total items/tasks</strong>, following the fixed order: <strong>Reading → Listening → Writing → Speaking</strong>.
                  </p>
                </div>

                <div className="border border-indigo-200 bg-indigo-50/40 rounded-xl p-4 space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-xs text-indigo-900">
                    <CheckCircle2 className="w-4 h-4 text-indigo-700 shrink-0" />
                    <span>Scores in 3 Days &amp; MyBest® Scores</span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    Official score reports are delivered within <strong>3 days</strong> and include both test-date scores and <strong>MyBest® scores</strong> (combining highest section scores from valid tests over the past 2 years).
                  </p>
                </div>
              </div>

              {/* Official Section Order & Timing Table */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">
                    Official Section Order, Task Composition &amp; Timing
                  </h3>
                  <span className="text-xs text-slate-500 font-medium">
                    Total: 120 Items · 90 Minutes Active Testing
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Order &amp; Section</th>
                        <th className="py-3 px-4">Format</th>
                        <th className="py-3 px-4">Official Task Types</th>
                        <th className="py-3 px-4">Items</th>
                        <th className="py-3 px-4">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-slate-800">
                      {OFFICIAL_SECTIONS_2026.map((sec) => (
                        <tr key={sec.section} className="hover:bg-slate-50/80">
                          <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 text-[11px] font-bold flex items-center justify-center">
                                {sec.order}
                              </span>
                              <span>{sec.section}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap text-slate-600 font-medium">
                            {sec.adaptiveBadge}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-900">
                              {sec.tasks.join(' · ')}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                              {sec.notes}
                            </p>
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {sec.items} items
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-teal-800 whitespace-nowrap">
                            {sec.timeMinutes} minutes
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TASK, PARAGRAPH & QUESTION TYPES BREAKDOWN */}
          {activeTab === 'tasks' && (
            <div className="space-y-5">
              {/* Filter Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div className="text-xs text-slate-600">
                  Complete specifications for all <strong>12 official task types</strong> across Reading, Listening, Writing, and Speaking.
                </div>
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                  {(['all', 'Reading', 'Listening', 'Writing', 'Speaking'] as SectionFilter[]).map((sec) => (
                    <button
                      key={sec}
                      onClick={() => setSectionFilter(sec)}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                        sectionFilter === sec
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {sec === 'all' ? 'All 12 Tasks' : sec}
                    </button>
                  ))}
                </div>
              </div>

              {/* Task Breakdown Cards */}
              <div className="grid grid-cols-1 gap-4">
                {filteredTasks.map((task) => (
                  <div
                    key={`${task.section}-${task.name}`}
                    className="border border-slate-200 rounded-xl p-4 bg-white shadow-xs space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                      <div className="flex items-center gap-2">
                        {getSectionIcon(task.section)}
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          {task.section}
                        </span>
                        <span className="text-slate-300">·</span>
                        <h4 className="text-sm font-bold text-slate-900">{task.name}</h4>
                      </div>
                      <div className="text-xs font-mono text-slate-600">
                        <span>{task.itemCountLabel}</span>
                        <span className="mx-1.5 text-slate-300">·</span>
                        <span className="font-semibold text-teal-800">{task.timingOrLength}</span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed">
                      {task.formatDescription}
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                      <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 space-y-1.5">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Text Formats, Topics &amp; Contexts
                        </div>
                        <ul className="text-xs text-slate-700 space-y-1 list-disc list-inside">
                          {task.textOrTopicTypes.map((item) => (
                            <li key={item} className="leading-relaxed">
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="bg-teal-50/40 rounded-lg p-3 border border-teal-100 space-y-1.5">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-teal-800">
                          Question Types &amp; Skills Assessed
                        </div>
                        <ul className="text-xs text-slate-700 space-y-1 list-disc list-inside">
                          {task.questionOrSkillTypes.map((skill) => (
                            <li key={skill} className="leading-relaxed">
                              {skill}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: BAND SCALE (1–6), CEFR & SCORE CONCORDANCE TABLES */}
          {activeTab === 'concordance' && (
            <div className="space-y-6">
              {/* Table 1: Raw Score Ranges */}
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Table 1: Section Raw Score Ranges &amp; Band Scale Reporting
                </h3>
                <p className="text-xs text-slate-600">
                  Raw scores from each section are mapped to the intuitive <strong>1.0–6.0 Band Scale</strong> (in half-band 0.5 increments) alongside the 0–30 scaled section score.
                </p>
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-4">Section</th>
                        <th className="py-2.5 px-4">Raw Score Range</th>
                        <th className="py-2.5 px-4">Component Breakdown</th>
                        <th className="py-2.5 px-4">Reported Score Scale</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-slate-800">
                      {TABLE_1_RAW_SCORE_RANGES.map((row) => (
                        <tr key={row.section}>
                          <td className="py-2.5 px-4 font-bold text-slate-900">{row.section}</td>
                          <td className="py-2.5 px-4 font-mono font-bold text-teal-800">{row.rawRange}</td>
                          <td className="py-2.5 px-4 text-slate-600">{row.scoringBreakdown}</td>
                          <td className="py-2.5 px-4 font-medium text-slate-900">{row.reportedScale}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Table 2: CEFR Level Mapping */}
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Table 2: Official CEFR Alignment to TOEFL Band Scale (1.0–6.0)
                </h3>
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-4">CEFR Level</th>
                        <th className="py-2.5 px-4">Proficiency Classification</th>
                        <th className="py-2.5 px-4">TOEFL iBT Band (1–6)</th>
                        <th className="py-2.5 px-4">Proficiency Descriptor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-slate-800">
                      {TABLE_2_CEFR_MAPPING.map((row) => (
                        <tr key={row.cefr}>
                          <td className="py-2.5 px-4 font-bold text-slate-900">{row.cefr}</td>
                          <td className="py-2.5 px-4 font-semibold text-slate-800">{row.levelName}</td>
                          <td className="py-2.5 px-4 font-mono font-bold text-teal-800 whitespace-nowrap">
                            Band {row.toeflBand}
                          </td>
                          <td className="py-2.5 px-4 text-slate-600 leading-relaxed">{row.descriptor}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Table 3: Full Score Concordance Table */}
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Table 3: Full 1.0–6.0 Band to 0–30 Section &amp; 0–120 Overall Score Concordance Table
                </h3>
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Band (1.0–6.0)</th>
                        <th className="py-2.5 px-3">CEFR Level</th>
                        <th className="py-2.5 px-3">Reading (0–30)</th>
                        <th className="py-2.5 px-3">Listening (0–30)</th>
                        <th className="py-2.5 px-3">Writing (0–30)</th>
                        <th className="py-2.5 px-3">Speaking (0–30)</th>
                        <th className="py-2.5 px-3 font-extrabold text-slate-900">Overall (0–120)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-slate-800">
                      {TOEFL_CONCORDANCE_TABLE_2026.map((row) => (
                        <tr
                          key={row.band}
                          className={
                            row.band >= 5.5
                              ? 'bg-teal-50/40'
                              : row.band >= 4.0
                              ? 'bg-blue-50/30'
                              : ''
                          }
                        >
                          <td className="py-2.5 px-3 font-bold text-teal-800">{row.band.toFixed(1)}</td>
                          <td className="py-2.5 px-3 font-sans font-semibold text-slate-900">{row.cefr}</td>
                          <td className="py-2.5 px-3">
                            {row.reading[0] === row.reading[1]
                              ? row.reading[0]
                              : `${row.reading[0]}–${row.reading[1]}`}
                          </td>
                          <td className="py-2.5 px-3">
                            {row.listening[0] === row.listening[1]
                              ? row.listening[0]
                              : `${row.listening[0]}–${row.listening[1]}`}
                          </td>
                          <td className="py-2.5 px-3">
                            {row.writing[0] === row.writing[1]
                              ? row.writing[0]
                              : `${row.writing[0]}–${row.writing[1]}`}
                          </td>
                          <td className="py-2.5 px-3">
                            {row.speaking[0] === row.speaking[1]
                              ? row.speaking[0]
                              : `${row.speaking[0]}–${row.speaking[1]}`}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-950 bg-slate-50/60">
                            {row.overall[0]}–{row.overall[1]}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Interactive Concordance Calculator */}
              <div className="border border-slate-200 rounded-xl p-5 bg-slate-50/60 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      Interactive Concordance Score Calculator
                    </h4>
                    <p className="text-xs text-slate-600">
                      Slide any 0–30 section score to preview its exact Band (1.0–6.0) and CEFR proficiency level.
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-sm font-extrabold text-teal-800">
                      Overall: {totalScore} / 120 · Band {overallBand.toFixed(1)} ({cefr.code})
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="border border-slate-200 rounded-lg p-3 bg-white space-y-1.5">
                    <div className="flex justify-between items-center text-xs font-semibold">
                      <span>Reading</span>
                      <span className="font-mono text-teal-800">
                        {calcReading}/30 → {readingBand.toFixed(1)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="30"
                      value={calcReading}
                      onChange={(e) => setCalcReading(Number(e.target.value))}
                      className="w-full accent-teal-600"
                    />
                  </div>

                  <div className="border border-slate-200 rounded-lg p-3 bg-white space-y-1.5">
                    <div className="flex justify-between items-center text-xs font-semibold">
                      <span>Listening</span>
                      <span className="font-mono text-teal-800">
                        {calcListening}/30 → {listeningBand.toFixed(1)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="30"
                      value={calcListening}
                      onChange={(e) => setCalcListening(Number(e.target.value))}
                      className="w-full accent-teal-600"
                    />
                  </div>

                  <div className="border border-slate-200 rounded-lg p-3 bg-white space-y-1.5">
                    <div className="flex justify-between items-center text-xs font-semibold">
                      <span>Writing</span>
                      <span className="font-mono text-teal-800">
                        {calcWriting}/30 → {writingBand.toFixed(1)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="30"
                      value={calcWriting}
                      onChange={(e) => setCalcWriting(Number(e.target.value))}
                      className="w-full accent-teal-600"
                    />
                  </div>

                  <div className="border border-slate-200 rounded-lg p-3 bg-white space-y-1.5">
                    <div className="flex justify-between items-center text-xs font-semibold">
                      <span>Speaking</span>
                      <span className="font-mono text-teal-800">
                        {calcSpeaking}/30 → {speakingBand.toFixed(1)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="30"
                      value={calcSpeaking}
                      onChange={(e) => setCalcSpeaking(Number(e.target.value))}
                      className="w-full accent-teal-600"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: OFFICIAL 0–5 WRITING & SPEAKING SCORING GUIDES */}
          {activeTab === 'rubrics' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setSelectedTaskRubric('write-email')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      selectedTaskRubric === 'write-email'
                        ? 'bg-teal-700 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Writing: Write an Email (0–5)
                  </button>
                  <button
                    onClick={() => setSelectedTaskRubric('academic-discussion')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      selectedTaskRubric === 'academic-discussion'
                        ? 'bg-teal-700 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Writing: Write for an Academic Discussion (0–5)
                  </button>
                  <button
                    onClick={() => setSelectedTaskRubric('listen-repeat')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      selectedTaskRubric === 'listen-repeat'
                        ? 'bg-teal-700 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Speaking: Listen and Repeat (0–5)
                  </button>
                  <button
                    onClick={() => setSelectedTaskRubric('speaking-interview')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      selectedTaskRubric === 'speaking-interview'
                        ? 'bg-teal-700 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Speaking: Take an Interview (0–5)
                  </button>
                </div>
              </div>

              {selectedTaskRubric === 'speaking-interview' && (
                <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-950">
                  <strong>Official ETS Conversational Fluency Note:</strong> Natural conversational pauses and fillers such as <em>&ldquo;um&rdquo;</em> and <em>&ldquo;uh&rdquo;</em> are normal features of spontaneous spoken English and <strong>do not prevent a test taker from earning a Score of 5</strong> when speech is clear, fluent, coherent, and well elaborated.
                </div>
              )}

              <div className="space-y-3">
                {OFFICIAL_TASK_RUBRICS[selectedTaskRubric].map((rubric) => (
                  <div
                    key={rubric.score}
                    className={`p-4 rounded-xl border transition-colors ${
                      rubric.score >= 4
                        ? 'bg-teal-50/50 border-teal-200'
                        : rubric.score >= 3
                        ? 'bg-blue-50/40 border-blue-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-xs text-slate-900">{rubric.title}</span>
                      <span className="font-mono text-xs font-extrabold text-teal-800">
                        Score {rubric.score} / 5
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed font-normal">
                      {rubric.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-3 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            Official 2026 ETS Updated TOEFL iBT® Test Overview &amp; Scoring Standards Reference
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={downloadOfficialToeflGuide}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold transition-colors cursor-pointer"
            >
              📥 Download Official Guide (PDF)
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
