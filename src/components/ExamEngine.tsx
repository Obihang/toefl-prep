import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  CURATED_COMPLETE_WORDS,
  CURATED_READING_PASSAGES,
  CURATED_LISTENING,
  CURATED_LISTEN_REPEAT,
  CURATED_SPEAKING_INTERVIEWS,
  CURATED_BUILD_SENTENCES,
  CURATED_WRITE_EMAILS,
  CURATED_ACADEMIC_DISCUSSIONS,
  CompleteWordsTask,
  ReadingPassageTask,
  ListeningTask,
  ListenRepeatTask,
  SpeakingInterviewTask,
  BuildSentenceTask,
  WriteEmailTask,
  AcademicDiscussionTask,
} from '../data/curatedQuestions';
import { TaskType } from '../types';
import { getLoadedCuratedTasks, syncCuratedQuestionBank } from '../utils/questionBankStorage';
import { normalizeTaskData } from '../utils/taskNormalizer';
import { CompleteWordsView } from './tasks/CompleteWordsView';
import { DailyLifeView, DailyLifeTask } from './tasks/DailyLifeView';
import { ReadingPassageView } from './tasks/ReadingPassageView';
import { ListeningChooseResponseView, ListeningChooseResponseTask } from './tasks/ListeningChooseResponseView';
import { ListeningDialogueView } from './tasks/ListeningDialogueView';
import { ListeningAnnouncementView, ListeningAnnouncementTask } from './tasks/ListeningAnnouncementView';
import { ListeningAcademicTalkView, ListeningAcademicTalkTask } from './tasks/ListeningAcademicTalkView';
import { BuildSentenceView } from './tasks/BuildSentenceView';
import { WriteEmailView } from './tasks/WriteEmailView';
import { AcademicDiscussionView } from './tasks/AcademicDiscussionView';
import { ListenRepeatView } from './tasks/ListenRepeatView';
import { SpeakingInterviewView } from './tasks/SpeakingInterviewView';
import {
  savePracticeRecord,
  convertScaledToBand6,
  convertOverall120ToBand6,
  getCefrFromBand6,
  getCompletedQuestionIds,
} from '../utils/scoreTracker';
import { stopSpeaking } from '../utils/audioSpeech';
import { hasAnyProviderKey } from '../utils/apiKey';
import { callBackendGenerate } from '../services/geminiService';
import { saveVerifiedQuestion } from '../utils/questionBankStorage';
import { Clock, ArrowRight, Award, CheckCircle2, ShieldCheck, GitBranch, Sparkles, Loader2 } from 'lucide-react';

export { TaskType };

export type AdaptiveModuleStage =
  | 'READING_MODULE_1'
  | 'READING_MODULE_2'
  | 'LISTENING_MODULE_1'
  | 'LISTENING_MODULE_2'
  | 'WRITING_SINGLE'
  | 'SPEAKING_SINGLE';

export type AdaptiveTrack = 'higher' | 'standard';

export interface SectionTaskDescriptor {
  slotKey: string;
  taskType: TaskType;
  taskTypeId: string;
  label: string;
  stageLabel: string;
  moduleStage: AdaptiveModuleStage;
  moduleNumber?: 1 | 2;
}

/** Official 2026 ETS Section Order: Reading -> Listening -> Writing -> Speaking (PDF Page 4) */
export interface SectionConfig {
  id: string;
  name: string;
  sectionKey: 'Reading' | 'Listening' | 'Writing' | 'Speaking';
  officialTime: number; // in seconds
  quickTime: number; // in seconds
  type: string;
  tasks: SectionTaskDescriptor[];
}

export const OFFICIAL_SECTIONS_2026: SectionConfig[] = [
  {
    id: 'reading',
    name: 'Reading Section',
    sectionKey: 'Reading',
    officialTime: 1800,
    quickTime: 900,
    type: 'reading-passage',
    tasks: [
      // Module 1 (Routing Stage)
      {
        slotKey: 'reading_m1_complete_words',
        taskType: TaskType.READING_COMPLETE_WORDS,
        taskTypeId: 'complete-words',
        label: 'Complete the Words (C-Test)',
        stageLabel: 'Module 1 · Task 1',
        moduleStage: 'READING_MODULE_1',
        moduleNumber: 1,
      },
      {
        slotKey: 'reading_m1_daily_life',
        taskType: TaskType.READING_DAILY_LIFE,
        taskTypeId: 'daily-life',
        label: 'Read in Daily Life',
        stageLabel: 'Module 1 · Task 2',
        moduleStage: 'READING_MODULE_1',
        moduleNumber: 1,
      },
      {
        slotKey: 'reading_m1_academic',
        taskType: TaskType.READING_ACADEMIC,
        taskTypeId: 'reading-academic',
        label: 'Academic Passage',
        stageLabel: 'Module 1 · Task 3',
        moduleStage: 'READING_MODULE_1',
        moduleNumber: 1,
      },
      // Module 2 (Adaptive Stage)
      {
        slotKey: 'reading_m2_complete_words',
        taskType: TaskType.READING_COMPLETE_WORDS,
        taskTypeId: 'complete-words',
        label: 'Complete the Words (Adaptive)',
        stageLabel: 'Module 2 · Task 1',
        moduleStage: 'READING_MODULE_2',
        moduleNumber: 2,
      },
      {
        slotKey: 'reading_m2_daily_life',
        taskType: TaskType.READING_DAILY_LIFE,
        taskTypeId: 'daily-life',
        label: 'Read in Daily Life (Adaptive)',
        stageLabel: 'Module 2 · Task 2',
        moduleStage: 'READING_MODULE_2',
        moduleNumber: 2,
      },
      {
        slotKey: 'reading_m2_academic',
        taskType: TaskType.READING_ACADEMIC,
        taskTypeId: 'reading-academic',
        label: 'Academic Passage (Adaptive)',
        stageLabel: 'Module 2 · Task 3',
        moduleStage: 'READING_MODULE_2',
        moduleNumber: 2,
      },
    ],
  },
  {
    id: 'listening',
    name: 'Listening Section',
    sectionKey: 'Listening',
    officialTime: 1740,
    quickTime: 900,
    type: 'listening-dialogue',
    tasks: [
      // Module 1 (Routing Stage)
      {
        slotKey: 'listening_m1_choose_response',
        taskType: TaskType.LISTENING_CHOOSE_RESPONSE,
        taskTypeId: 'listening-choose-response',
        label: 'Choose a Response',
        stageLabel: 'Module 1 · Task 1',
        moduleStage: 'LISTENING_MODULE_1',
        moduleNumber: 1,
      },
      {
        slotKey: 'listening_m1_conversation',
        taskType: TaskType.LISTENING_CONVERSATION,
        taskTypeId: 'listening-dialogue',
        label: 'Campus Conversation',
        stageLabel: 'Module 1 · Task 2',
        moduleStage: 'LISTENING_MODULE_1',
        moduleNumber: 1,
      },
      {
        slotKey: 'listening_m1_announcement',
        taskType: TaskType.LISTENING_ANNOUNCEMENT,
        taskTypeId: 'listening-announcement',
        label: 'Campus Announcement',
        stageLabel: 'Module 1 · Task 3',
        moduleStage: 'LISTENING_MODULE_1',
        moduleNumber: 1,
      },
      {
        slotKey: 'listening_m1_academic_talk',
        taskType: TaskType.LISTENING_ACADEMIC_TALK,
        taskTypeId: 'listening-academic-talk',
        label: 'Academic Talk / Lecture',
        stageLabel: 'Module 1 · Task 4',
        moduleStage: 'LISTENING_MODULE_1',
        moduleNumber: 1,
      },
      // Module 2 (Adaptive Stage)
      {
        slotKey: 'listening_m2_choose_response',
        taskType: TaskType.LISTENING_CHOOSE_RESPONSE,
        taskTypeId: 'listening-choose-response',
        label: 'Choose a Response (Adaptive)',
        stageLabel: 'Module 2 · Task 1',
        moduleStage: 'LISTENING_MODULE_2',
        moduleNumber: 2,
      },
      {
        slotKey: 'listening_m2_conversation',
        taskType: TaskType.LISTENING_CONVERSATION,
        taskTypeId: 'listening-dialogue',
        label: 'Campus Conversation (Adaptive)',
        stageLabel: 'Module 2 · Task 2',
        moduleStage: 'LISTENING_MODULE_2',
        moduleNumber: 2,
      },
      {
        slotKey: 'listening_m2_announcement',
        taskType: TaskType.LISTENING_ANNOUNCEMENT,
        taskTypeId: 'listening-announcement',
        label: 'Campus Announcement (Adaptive)',
        stageLabel: 'Module 2 · Task 3',
        moduleStage: 'LISTENING_MODULE_2',
        moduleNumber: 2,
      },
      {
        slotKey: 'listening_m2_academic_talk',
        taskType: TaskType.LISTENING_ACADEMIC_TALK,
        taskTypeId: 'listening-academic-talk',
        label: 'Academic Talk / Lecture (Adaptive)',
        stageLabel: 'Module 2 · Task 4',
        moduleStage: 'LISTENING_MODULE_2',
        moduleNumber: 2,
      },
    ],
  },
  {
    id: 'writing',
    name: 'Writing Section',
    sectionKey: 'Writing',
    officialTime: 1380,
    quickTime: 600,
    type: 'academic-discussion',
    tasks: [
      {
        slotKey: 'writing_build_sentence',
        taskType: TaskType.WRITING_BUILD_SENTENCE,
        taskTypeId: 'build-sentence',
        label: 'Build a Sentence',
        stageLabel: 'Task 1 · Syntactic Frame',
        moduleStage: 'WRITING_SINGLE',
      },
      {
        slotKey: 'writing_email',
        taskType: TaskType.WRITING_EMAIL,
        taskTypeId: 'write-email',
        label: 'Write an Email (7m)',
        stageLabel: 'Task 2 · Campus Email',
        moduleStage: 'WRITING_SINGLE',
      },
      {
        slotKey: 'writing_discussion',
        taskType: TaskType.WRITING_DISCUSSION,
        taskTypeId: 'academic-discussion',
        label: 'Academic Discussion (10m)',
        stageLabel: 'Task 3 · Seminar Post',
        moduleStage: 'WRITING_SINGLE',
      },
    ],
  },
  {
    id: 'speaking',
    name: 'Speaking Section',
    sectionKey: 'Speaking',
    officialTime: 480,
    quickTime: 300,
    type: 'speaking-interview',
    tasks: [
      {
        slotKey: 'speaking_listen_repeat',
        taskType: TaskType.SPEAKING_LISTEN_REPEAT,
        taskTypeId: 'listen-repeat',
        label: 'Listen & Repeat (7 Sentences)',
        stageLabel: 'Task 1 · Campus Scenario',
        moduleStage: 'SPEAKING_SINGLE',
      },
      {
        slotKey: 'speaking_interview',
        taskType: TaskType.SPEAKING_INTERVIEW,
        taskTypeId: 'speaking-interview',
        label: 'Take an Interview (4 Questions)',
        stageLabel: 'Task 2 · 45s Responses',
        moduleStage: 'SPEAKING_SINGLE',
      },
    ],
  },
];

const FALLBACK_DAILY_LIFE_LIST: DailyLifeTask[] = [
  {
    id: 'dl-mock-1',
    title: 'University Health Center: Flu Vaccination Clinic Notice',
    formatType: 'Campus Notice',
    level: 'intermediate',
    topic: 'campus-life',
    text:
      'The University Student Health Center will host its annual walk-in influenza vaccination clinic next Tuesday through Thursday from 9:00 AM to 4:00 PM in the Student Union Ballroom. All enrolled undergraduate and graduate students with a valid university ID card may receive the vaccine at no cost. Students who have private health insurance are asked to upload a photo of their insurance card to the Patient Portal at least 24 hours prior to arriving so the clinic can process claims efficiently.',
    questions: [
      {
        q: 'What is required for students to receive the flu vaccine at no cost?',
        options: [
          'A scheduled appointment with a primary care physician',
          'A valid university student identification card',
          'A referral letter from an academic advisor',
          'Payment of a $15 student wellness fee at the door',
        ],
        answer: 1,
        why: 'The notice explicitly states that all enrolled students with a valid university ID card may receive the vaccine at no cost.',
      },
      {
        q: 'What are students with private health insurance asked to do before visiting the clinic?',
        options: [
          'Call the insurance provider to request pre-authorization',
          'Arrive before 8:00 AM on Tuesday morning',
          'Upload an image of their insurance card to the Patient Portal at least 24 hours in advance',
          'Bring a printed paper copy of their immunization history',
        ],
        answer: 2,
        why: 'Students with private insurance are asked to upload a photo of their insurance card to the Patient Portal at least 24 hours prior to arriving.',
      },
    ],
  },
  {
    id: 'dl-mock-2',
    title: 'Graduate Library: Extended Finals Week Reserve Policy',
    formatType: 'Library Memorandum',
    level: 'advanced',
    topic: 'campus-life',
    text:
      'Beginning December 4, the Main Research Library will remain open 24 hours a day through the conclusion of final examinations. Course-reserve textbooks and reference binders may be checked out for three-hour intervals inside the building; however, overnight borrowing of reserve materials is strictly suspended during finals week so that all seminar participants retain equitable access. Late returns will incur an immediate hold on spring registration.',
    questions: [
      {
        q: 'What change takes effect during finals week regarding course-reserve materials?',
        options: [
          'They may only be accessed digitally from off-campus apartments',
          'Overnight borrowing is suspended and loans are limited to three-hour in-library intervals',
          'Only graduate teaching assistants are permitted to check out reserve binders',
          'The checkout period is extended to seven full days',
        ],
        answer: 1,
        why: 'The policy states that course-reserve items may be checked out for three-hour intervals inside the building and overnight borrowing is suspended.',
      },
      {
        q: 'What is the consequence of returning a reserve item late during finals week?',
        options: [
          'A temporary hold placed on spring semester course registration',
          'Loss of campus dining hall privileges',
          'Mandatory attendance at a library orientation workshop',
          'Cancellation of dormitory housing for the winter break',
        ],
        answer: 0,
        why: 'The memorandum specifies that late returns will incur an immediate hold on spring registration.',
      },
    ],
  },
];

const FALLBACK_CHOOSE_RESPONSE_LIST: ListeningChooseResponseTask[] = [
  {
    id: 'lcr-mock-1',
    title: 'Campus Exchanges — Choose the Best Response (Set A)',
    level: 'intermediate',
    topic: 'campus-life',
    items: [
      {
        audioPrompt: 'Excuse me, do you happen to know if the third-floor quiet study rooms require an advance reservation?',
        speakerName: 'Campus Student',
        speakerGender: 'female',
        options: [
          'Yes, you can book a two-hour slot on the library website.',
          'The third floor was renovated last semester.',
          'I returned those reference books yesterday afternoon.',
          'No, the chemistry lab is in the science building.',
        ],
        answer: 0,
        why: 'Directly answers whether an advance reservation is needed and explains how to book.',
      },
      {
        audioPrompt: 'I missed the first ten minutes of Professor Miller’s lecture—did she mention when our lab reports are due?',
        speakerName: 'Classmate',
        speakerGender: 'male',
        options: [
          'The lecture hall was completely full today.',
          'She extended the deadline to next Monday at five o’clock.',
          'Yes, I really enjoyed the guest speaker’s presentation.',
          'You can buy the lab manual at the campus bookstore.',
        ],
        answer: 1,
        why: 'Directly answers the question about when the lab reports are due.',
      },
    ],
  },
  {
    id: 'lcr-mock-2',
    title: 'Academic Advising & Department Office Exchanges (Set B)',
    level: 'advanced',
    topic: 'campus-life',
    items: [
      {
        audioPrompt: 'Why was the undergraduate research symposium moved from the auditorium to the science atrium?',
        speakerName: 'Graduate Advisor',
        speakerGender: 'female',
        options: [
          'Because over forty additional poster presenters registered this year.',
          'Yes, the keynote speaker studies atmospheric chemistry.',
          'I submitted my abstract before last Friday’s deadline.',
          'The science building closes at nine o’clock on weekends.',
        ],
        answer: 0,
        why: 'Explains the specific reason why the venue was changed.',
      },
      {
        audioPrompt: 'Could you verify whether Dr. Patel signed my independent study approval form before she left for the conference?',
        speakerName: 'Undergraduate Student',
        speakerGender: 'male',
        options: [
          'The conference is being held in Chicago this year.',
          'Let me check the outgoing folder on the department coordinator’s desk.',
          'Independent study courses are worth three academic credits.',
          'No, I haven’t taken her introductory seminar yet.',
        ],
        answer: 1,
        why: 'Directly responds to the request to verify whether the signed form is in the office.',
      },
    ],
  },
];

const FALLBACK_ANNOUNCEMENT_LIST: ListeningAnnouncementTask[] = [
  {
    id: 'la-mock-1',
    title: 'Campus Shuttle Route Adjustment During Science Quad Construction',
    context: 'Campus Transit Broadcast',
    speakerName: 'Transit Coordinator',
    speakerGender: 'female',
    level: 'intermediate',
    topic: 'campus-life',
    script:
      'Attention all students and faculty using the East Loop campus shuttle. Beginning this Monday, the stop in front of the Physical Sciences Building will be temporarily closed for two weeks while crews repave the main pedestrian walkway. During this period, all East Loop shuttles will pick up and drop off passengers at the temporary shelter located just north of the University Botanical Gardens. Shuttles will continue to run every ten minutes between 7:30 AM and 10:00 PM.',
    questions: [
      {
        q: 'What is the main purpose of the announcement?',
        options: [
          'To announce a permanent reduction in evening shuttle hours',
          'To inform passengers about a temporary shuttle stop relocation',
          'To recruit student drivers for the campus transit system',
          'To explain new parking permit fees for faculty members',
        ],
        answer: 1,
        why: 'The announcer explains that the Physical Sciences Building shuttle stop is temporarily relocating to the Botanical Gardens shelter.',
      },
      {
        q: 'Why is the Physical Sciences Building stop being closed?',
        options: [
          'The main pedestrian walkway is being repaved.',
          'A new chemistry laboratory is being constructed.',
          'The University Botanical Gardens is hosting a conference.',
          'Several shuttle buses are undergoing routine maintenance.',
        ],
        answer: 0,
        why: 'The announcement states that crews will be repaving the main pedestrian walkway for two weeks.',
      },
    ],
  },
  {
    id: 'la-mock-2',
    title: 'Undergraduate Research Grant Proposal Workshop',
    context: 'Academic Department Announcement',
    speakerName: 'Dean of Undergraduate Studies',
    speakerGender: 'male',
    level: 'advanced',
    topic: 'campus-life',
    script:
      'Good afternoon, everyone. Before we begin today’s colloquium, I want to remind juniors and seniors applying for Summer Undergraduate Research Fellowships that the mandatory budget-preparation workshop will take place this Thursday at 4:00 PM in Hall 204. Because this year’s fellowship stipends now cover off-campus archival travel as well as laboratory consumables, all applicants must submit an itemized expense worksheet endorsed by their faculty mentor no later than November 15.',
    questions: [
      {
        q: 'Who is required to attend the Thursday afternoon workshop?',
        options: [
          'First-year students enrolling in introductory laboratory courses',
          'Juniors and seniors applying for Summer Undergraduate Research Fellowships',
          'Faculty members requesting sabbatical leave next semester',
          'Graduate teaching assistants grading midterm examinations',
        ],
        answer: 1,
        why: 'The speaker explicitly addresses juniors and seniors applying for Summer Undergraduate Research Fellowships.',
      },
      {
        q: 'What new expense category is covered by this year’s fellowship stipends?',
        options: [
          'Off-campus archival travel',
          'International conference registration for alumni',
          'Textbook vouchers for introductory courses',
          'Campus parking permits for commuter students',
        ],
        answer: 0,
        why: 'The speaker notes that fellowship stipends now cover off-campus archival travel in addition to laboratory consumables.',
      },
    ],
  },
];

const FALLBACK_ACADEMIC_TALK_LIST: ListeningAcademicTalkTask[] = [
  {
    id: 'lat-mock-1',
    title: 'Marine Biology: Bioluminescence in Deep-Pelagic Organisms',
    context: 'Marine Biology Lecture',
    speakerName: 'Professor Grant',
    speakerGender: 'male',
    level: 'upper-intermediate',
    topic: 'natural-sciences',
    script:
      'In the mesopelagic zone of the ocean—between two hundred and one thousand meters below the surface—sunlight fades almost completely. Yet over seventy-five percent of deep-sea organisms produce their own light through bioluminescence, a chemical reaction between a light-emitting compound called luciferin and an enzyme called luciferase. One fascinating adaptation is counter-illumination. Many midwater squid and lanternfish have photophores along their ventral, or underside, surfaces. By matching the intensity and wavelength of the faint downwelling sunlight from above, these creatures erase their own silhouettes when viewed by predators swimming beneath them.',
    questions: [
      {
        q: 'What is the main topic of the professor’s talk?',
        options: [
          'How deep-sea hydrothermal vents heat ocean water',
          'The chemical mechanism and defensive function of bioluminescence in deep-sea organisms',
          'Why coral reefs require shallow tropical sunlight to survive',
          'Methods used by marine biologists to tag migratory whales',
        ],
        answer: 1,
        why: 'The lecture explains how luciferin and luciferase produce light and how midwater organisms use counter-illumination for camouflage.',
      },
      {
        q: 'How does counter-illumination help midwater squid avoid predators?',
        options: [
          'It blinds approaching predators with a sudden bright flash.',
          'It attracts larger fish that chase away the squid’s predators.',
          'It matches faint sunlight from above to conceal the squid’s silhouette from below.',
          'It allows the squid to swim faster in cold water.',
        ],
        answer: 2,
        audioExcerpt:
          'Many midwater squid and lanternfish have photophores along their ventral, or underside, surfaces. By matching the intensity and wavelength of the faint downwelling sunlight from above, these creatures erase their own silhouettes when viewed by predators swimming beneath them.',
        why: 'The professor states that matching the intensity and wavelength of downwelling light erases their silhouette when viewed from below.',
      },
    ],
  },
  {
    id: 'lat-mock-2',
    title: 'Paleoclimatology: Dendrochronology & Volcanic Frost Rings',
    context: 'Earth & Climate Science Lecture',
    speakerName: 'Professor Vance',
    speakerGender: 'female',
    level: 'advanced',
    topic: 'natural-sciences',
    script:
      'When paleoclimatologists reconstruct temperature anomalies from thousands of years ago, high-elevation bristlecone pines offer an extraordinarily precise archive. Because these trees grow near the alpine timberline, their radial growth rings are acutely sensitive to summer warmth. Following major stratospheric volcanic eruptions—which inject sulfate aerosols that reflect solar radiation back into space—bristlecone pines often form "frost rings": zones of crushed, unlignified tracheid cells caused by sudden sub-freezing temperatures in the middle of the brief summer growing season.',
    questions: [
      {
        q: 'Why are high-elevation bristlecone pines particularly useful to paleoclimatologists?',
        options: [
          'They grow rapidly in tropical rainforest environments',
          'Their growth rings near the alpine timberline are highly sensitive to summer temperature variations',
          'Their bark absorbs volcanic ash directly from the soil',
          'They only produce growth rings once every decade',
        ],
        answer: 1,
        why: 'The professor explains that because bristlecone pines grow near the alpine timberline, their radial growth rings are acutely sensitive to summer warmth.',
      },
      {
        q: 'What causes a "frost ring" to form in a bristlecone pine?',
        options: [
          'Prolonged winter drought followed by heavy spring flooding',
          'Sub-freezing summer temperatures following a major stratospheric volcanic eruption',
          'Insect infestations that strip needles from the upper canopy',
          'Excessive ultraviolet radiation during solar flares',
        ],
        answer: 1,
        audioExcerpt:
          'Following major stratospheric volcanic eruptions—which inject sulfate aerosols that reflect solar radiation back into space—bristlecone pines often form "frost rings": zones of crushed, unlignified tracheid cells caused by sudden sub-freezing temperatures in the middle of the brief summer growing season.',
        why: 'Sulfate aerosols from major volcanic eruptions cool the atmosphere, causing sudden sub-freezing temperatures during the summer growing season.',
      },
    ],
  },
];

function getItemUniqueKey(item: any): string {
  if (!item) return '';
  return String(item.id || item.questionDocId || item.title || '').trim();
}

export function getExamUsedIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('toefl_exam_used_ids');
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function recordExamUsedId(itemOrId: any): void {
  if (typeof window === 'undefined' || !itemOrId) return;
  try {
    const existing = new Set(getExamUsedIds());
    const candidates =
      typeof itemOrId === 'string'
        ? [itemOrId]
        : [itemOrId.id, itemOrId.questionDocId, itemOrId.title, (itemOrId as any)._id].filter(Boolean);
    candidates.forEach((c) => {
      existing.add(String(c).trim());
      existing.add(String(c).trim().toLowerCase());
    });
    localStorage.setItem('toefl_exam_used_ids', JSON.stringify(Array.from(existing).slice(-1000)));
  } catch {}
}

export function getAllHistoricallySeenQuestionIds(): Set<string> {
  const set = new Set<string>();
  try {
    const completed = getCompletedQuestionIds();
    completed.forEach((id) => {
      set.add(id);
      set.add(id.toLowerCase());
    });
    const examUsed = getExamUsedIds();
    examUsed.forEach((id) => {
      set.add(id);
      set.add(id.toLowerCase());
    });
  } catch {}
  return set;
}

function isItemHistoricallySeen(item: any, seenSet: Set<string>): boolean {
  if (!item || seenSet.size === 0) return false;
  const id = item.id ? String(item.id).trim() : '';
  const docId = item.questionDocId ? String(item.questionDocId).trim() : '';
  const title = item.title ? String(item.title).trim() : '';
  if (id && (seenSet.has(id) || seenSet.has(id.toLowerCase()))) return true;
  if (docId && (seenSet.has(docId) || seenSet.has(docId.toLowerCase()))) return true;
  if (title && (seenSet.has(title) || seenSet.has(title.toLowerCase()))) return true;
  return false;
}

/**
 * Selects a question from the curated bank or fallback list while:
 * 1. Filtering out any question ID already in `usedQuestionIds` so Module 2 NEVER repeats Module 1
 * 2. Filtering out any question ID already practiced in section practice (`toefl_completed_question_ids`) or past exams (`toefl_exam_used_ids`) first, only falling back if all questions have been seen.
 */
function pickFromBankOrFallback<T>(
  taskTypeId: string,
  fallbackList: T[],
  usedQuestionIds: Set<string>,
  stage?: AdaptiveModuleStage,
  track?: AdaptiveTrack,
  historicallySeenIds?: Set<string>
): T {
  const loaded = getLoadedCuratedTasks(taskTypeId, 'all', 'all');
  const rawPool: any[] =
    Array.isArray(loaded) && loaded.length > 0 ? [...loaded, ...fallbackList] : [...fallbackList];

  // Safeguard 1: Never repeat Module 1 questions in Module 2 — filter out any question whose id is in usedQuestionIds
  const sessionUnused = rawPool.filter((item) => {
    const key = getItemUniqueKey(item);
    return key ? !usedQuestionIds.has(key) : true;
  });

  const sessionPool = sessionUnused.length > 0 ? sessionUnused : rawPool;

  // Safeguard 2: Prioritize questions unseen in section practice or past mock exams!
  const seenSet = historicallySeenIds || getAllHistoricallySeenQuestionIds();
  const unseenCandidates = sessionPool.filter((item) => !isItemHistoricallySeen(item, seenSet));

  // Prioritize unseen questions first, only falling back if all questions have been seen
  const candidatePool = unseenCandidates.length > 0 ? unseenCandidates : sessionPool;

  // If selecting for READING_MODULE_2 or LISTENING_MODULE_2, prefer difficulty matching the adaptive routing track
  let stageFilteredPool = candidatePool;
  if (stage === 'READING_MODULE_2' || stage === 'LISTENING_MODULE_2') {
    const preferredLevels =
      track === 'standard'
        ? ['intermediate', 'lower-intermediate']
        : ['advanced', 'upper-intermediate'];
    const levelMatches = candidatePool.filter((item) =>
      preferredLevels.includes(String(item?.level || '').toLowerCase())
    );
    if (levelMatches.length > 0) {
      stageFilteredPool = levelMatches;
    }
  }

  const chosenRaw = stageFilteredPool[Math.floor(Math.random() * stageFilteredPool.length)];
  const normalized = normalizeTaskData(chosenRaw, taskTypeId) as T;
  const chosenKey = getItemUniqueKey(normalized) || getItemUniqueKey(chosenRaw);
  if (chosenKey) {
    usedQuestionIds.add(chosenKey);
  }
  recordExamUsedId(normalized);
  return normalized;
}

async function getOrGenerateTaskForSlot<T>(
  taskTypeId: string,
  fallbackList: T[],
  usedQuestionIds: Set<string>,
  stage?: AdaptiveModuleStage,
  track?: AdaptiveTrack,
  historicallySeenIds?: Set<string>,
  forceFreshAi: boolean = false,
  targetLevel: string = 'intermediate',
  targetTopic: string = 'campus-life'
): Promise<T> {
  const seenIds = historicallySeenIds || getAllHistoricallySeenQuestionIds();
  const loaded = getLoadedCuratedTasks(taskTypeId, 'all', 'all');
  const rawPool: any[] =
    Array.isArray(loaded) && loaded.length > 0 ? [...loaded, ...fallbackList] : [...fallbackList];
  const sessionUnused = rawPool.filter((item) => {
    const key = getItemUniqueKey(item);
    return key ? !usedQuestionIds.has(key) : true;
  });
  const sessionPool = sessionUnused.length > 0 ? sessionUnused : rawPool;
  const unseenCandidates = sessionPool.filter((item) => !isItemHistoricallySeen(item, seenIds));

  // Determine if we should generate via AI:
  // 1. If forceFreshAi is true AND user has a provider key
  // 2. OR if unseen candidates in the curated bank are exhausted (unseenCandidates.length === 0) AND user has a provider key
  const shouldAttemptAi = (forceFreshAi || unseenCandidates.length === 0) && hasAnyProviderKey();

  if (shouldAttemptAi) {
    try {
      const resp = await callBackendGenerate(taskTypeId, targetLevel, targetTopic);
      if (resp && resp.success && resp.data && !resp.data.isFallback) {
        const normalized = normalizeTaskData(resp.data, taskTypeId) as T;
        const key = getItemUniqueKey(normalized);
        if (key && !usedQuestionIds.has(key)) {
          usedQuestionIds.add(key);
          recordExamUsedId(normalized);
          saveVerifiedQuestion({
            taskType: taskTypeId,
            level: targetLevel,
            topic: targetTopic,
            content: normalized,
            audioUrl: (normalized as any).audioUrl || null,
            audioClips: (normalized as any).audioClips || null,
            source: 'ai',
          }).catch(() => {});
          return normalized;
        }
      }
    } catch (err) {
      console.warn(`[ExamEngine] Live AI generation for slot ${taskTypeId} failed, falling back to curated bank:`, err);
    }
  }

  return pickFromBankOrFallback<T>(
    taskTypeId,
    fallbackList,
    usedQuestionIds,
    stage,
    track,
    seenIds
  );
}

export interface ExamTaskBundle {
  // READING_MODULE_1 (Routing Stage)
  completeWordsMod1: CompleteWordsTask;
  dailyLifeMod1: DailyLifeTask;
  readingMod1: ReadingPassageTask;
  // READING_MODULE_2 (Adaptive Stage)
  completeWordsMod2: CompleteWordsTask;
  dailyLifeMod2: DailyLifeTask;
  readingMod2: ReadingPassageTask;

  // LISTENING_MODULE_1 (Routing Stage)
  chooseResponseMod1: ListeningChooseResponseTask;
  listeningMod1: ListeningTask;
  announcementMod1: ListeningAnnouncementTask;
  academicTalkMod1: ListeningAcademicTalkTask;
  // LISTENING_MODULE_2 (Adaptive Stage)
  chooseResponseMod2: ListeningChooseResponseTask;
  listeningMod2: ListeningTask;
  announcementMod2: ListeningAnnouncementTask;
  academicTalkMod2: ListeningAcademicTalkTask;

  // Writing (3 tasks)
  buildSentence: BuildSentenceTask;
  writeEmail: WriteEmailTask;
  writing: AcademicDiscussionTask;

  // Speaking (2 tasks)
  listenRepeat: ListenRepeatTask;
  speaking: SpeakingInterviewTask;
}

export function pickRandomTasks(
  usedQuestionIds: Set<string>,
  readingTrack: AdaptiveTrack = 'higher',
  listeningTrack: AdaptiveTrack = 'higher'
): ExamTaskBundle {
  // READING_MODULE_1 (Routing Stage)
  const completeWordsMod1 = pickFromBankOrFallback<CompleteWordsTask>(
    'complete-words',
    CURATED_COMPLETE_WORDS,
    usedQuestionIds,
    'READING_MODULE_1'
  );
  const dailyLifeMod1 = pickFromBankOrFallback<DailyLifeTask>(
    'daily-life',
    FALLBACK_DAILY_LIFE_LIST,
    usedQuestionIds,
    'READING_MODULE_1'
  );
  const readingMod1 = pickFromBankOrFallback<ReadingPassageTask>(
    'reading-academic',
    CURATED_READING_PASSAGES,
    usedQuestionIds,
    'READING_MODULE_1'
  );

  // READING_MODULE_2 (Adaptive Stage — filters out all READING_MODULE_1 IDs in usedQuestionIds)
  const completeWordsMod2 = pickFromBankOrFallback<CompleteWordsTask>(
    'complete-words',
    CURATED_COMPLETE_WORDS,
    usedQuestionIds,
    'READING_MODULE_2',
    readingTrack
  );
  const dailyLifeMod2 = pickFromBankOrFallback<DailyLifeTask>(
    'daily-life',
    FALLBACK_DAILY_LIFE_LIST,
    usedQuestionIds,
    'READING_MODULE_2',
    readingTrack
  );
  const readingMod2 = pickFromBankOrFallback<ReadingPassageTask>(
    'reading-academic',
    CURATED_READING_PASSAGES,
    usedQuestionIds,
    'READING_MODULE_2',
    readingTrack
  );

  // LISTENING_MODULE_1 (Routing Stage)
  const chooseResponseMod1 = pickFromBankOrFallback<ListeningChooseResponseTask>(
    'listening-choose-response',
    FALLBACK_CHOOSE_RESPONSE_LIST,
    usedQuestionIds,
    'LISTENING_MODULE_1'
  );
  const listeningMod1 = pickFromBankOrFallback<ListeningTask>(
    'listening-dialogue',
    CURATED_LISTENING,
    usedQuestionIds,
    'LISTENING_MODULE_1'
  );
  const announcementMod1 = pickFromBankOrFallback<ListeningAnnouncementTask>(
    'listening-announcement',
    FALLBACK_ANNOUNCEMENT_LIST,
    usedQuestionIds,
    'LISTENING_MODULE_1'
  );
  const academicTalkMod1 = pickFromBankOrFallback<ListeningAcademicTalkTask>(
    'listening-academic-talk',
    FALLBACK_ACADEMIC_TALK_LIST,
    usedQuestionIds,
    'LISTENING_MODULE_1'
  );

  // LISTENING_MODULE_2 (Adaptive Stage — filters out all LISTENING_MODULE_1 IDs in usedQuestionIds)
  const chooseResponseMod2 = pickFromBankOrFallback<ListeningChooseResponseTask>(
    'listening-choose-response',
    FALLBACK_CHOOSE_RESPONSE_LIST,
    usedQuestionIds,
    'LISTENING_MODULE_2',
    listeningTrack
  );
  const listeningMod2 = pickFromBankOrFallback<ListeningTask>(
    'listening-dialogue',
    CURATED_LISTENING,
    usedQuestionIds,
    'LISTENING_MODULE_2',
    listeningTrack
  );
  const announcementMod2 = pickFromBankOrFallback<ListeningAnnouncementTask>(
    'listening-announcement',
    FALLBACK_ANNOUNCEMENT_LIST,
    usedQuestionIds,
    'LISTENING_MODULE_2',
    listeningTrack
  );
  const academicTalkMod2 = pickFromBankOrFallback<ListeningAcademicTalkTask>(
    'listening-academic-talk',
    FALLBACK_ACADEMIC_TALK_LIST,
    usedQuestionIds,
    'LISTENING_MODULE_2',
    listeningTrack
  );

  // Writing (3 tasks)
  const buildSentence = pickFromBankOrFallback<BuildSentenceTask>(
    'build-sentence',
    CURATED_BUILD_SENTENCES,
    usedQuestionIds
  );
  const writeEmail = pickFromBankOrFallback<WriteEmailTask>(
    'write-email',
    CURATED_WRITE_EMAILS,
    usedQuestionIds
  );
  const writing = pickFromBankOrFallback<AcademicDiscussionTask>(
    'academic-discussion',
    CURATED_ACADEMIC_DISCUSSIONS,
    usedQuestionIds
  );

  // Speaking (2 tasks)
  const listenRepeat = pickFromBankOrFallback<ListenRepeatTask>(
    'listen-repeat',
    CURATED_LISTEN_REPEAT,
    usedQuestionIds
  );
  const speaking = pickFromBankOrFallback<SpeakingInterviewTask>(
    'speaking-interview',
    CURATED_SPEAKING_INTERVIEWS,
    usedQuestionIds
  );

  return {
    completeWordsMod1,
    dailyLifeMod1,
    readingMod1,
    completeWordsMod2,
    dailyLifeMod2,
    readingMod2,
    chooseResponseMod1,
    listeningMod1,
    announcementMod1,
    academicTalkMod1,
    chooseResponseMod2,
    listeningMod2,
    announcementMod2,
    academicTalkMod2,
    buildSentence,
    writeEmail,
    writing,
    listenRepeat,
    speaking,
  };
}

export async function buildFullExamBundleAsync(
  usedQuestionIds: Set<string>,
  readingTrack: AdaptiveTrack = 'higher',
  listeningTrack: AdaptiveTrack = 'higher',
  forceFreshAi: boolean = false,
  onProgress?: (msg: string, completed: number, total: number) => void
): Promise<ExamTaskBundle> {
  const seenIds = getAllHistoricallySeenQuestionIds();
  let step = 0;
  const total = 19;

  const updateProgress = (label: string) => {
    step++;
    onProgress?.(`Preparing ${label} (${step}/${total})...`, step, total);
  };

  updateProgress('Reading Module 1 Complete Words');
  const completeWordsMod1 = await getOrGenerateTaskForSlot<CompleteWordsTask>(
    'complete-words',
    CURATED_COMPLETE_WORDS,
    usedQuestionIds,
    'READING_MODULE_1',
    undefined,
    seenIds,
    forceFreshAi,
    'intermediate',
    'campus-life'
  );

  updateProgress('Reading Module 1 Daily Life');
  const dailyLifeMod1 = await getOrGenerateTaskForSlot<DailyLifeTask>(
    'daily-life',
    FALLBACK_DAILY_LIFE_LIST,
    usedQuestionIds,
    'READING_MODULE_1',
    undefined,
    seenIds,
    forceFreshAi,
    'intermediate',
    'campus-life'
  );

  updateProgress('Reading Module 1 Academic Passage');
  const readingMod1 = await getOrGenerateTaskForSlot<ReadingPassageTask>(
    'reading-academic',
    CURATED_READING_PASSAGES,
    usedQuestionIds,
    'READING_MODULE_1',
    undefined,
    seenIds,
    forceFreshAi,
    'intermediate',
    'academic'
  );

  updateProgress('Reading Module 2 Complete Words');
  const completeWordsMod2 = await getOrGenerateTaskForSlot<CompleteWordsTask>(
    'complete-words',
    CURATED_COMPLETE_WORDS,
    usedQuestionIds,
    'READING_MODULE_2',
    readingTrack,
    seenIds,
    forceFreshAi,
    readingTrack === 'higher' ? 'advanced' : 'intermediate',
    'campus-life'
  );

  updateProgress('Reading Module 2 Daily Life');
  const dailyLifeMod2 = await getOrGenerateTaskForSlot<DailyLifeTask>(
    'daily-life',
    FALLBACK_DAILY_LIFE_LIST,
    usedQuestionIds,
    'READING_MODULE_2',
    readingTrack,
    seenIds,
    forceFreshAi,
    readingTrack === 'higher' ? 'advanced' : 'intermediate',
    'campus-life'
  );

  updateProgress('Reading Module 2 Academic Passage');
  const readingMod2 = await getOrGenerateTaskForSlot<ReadingPassageTask>(
    'reading-academic',
    CURATED_READING_PASSAGES,
    usedQuestionIds,
    'READING_MODULE_2',
    readingTrack,
    seenIds,
    forceFreshAi,
    readingTrack === 'higher' ? 'advanced' : 'intermediate',
    'academic'
  );

  updateProgress('Listening Module 1 Choose Response');
  const chooseResponseMod1 = await getOrGenerateTaskForSlot<ListeningChooseResponseTask>(
    'listening-choose-response',
    FALLBACK_CHOOSE_RESPONSE_LIST,
    usedQuestionIds,
    'LISTENING_MODULE_1',
    undefined,
    seenIds,
    forceFreshAi,
    'intermediate',
    'daily-conversation'
  );

  updateProgress('Listening Module 1 Dialogue');
  const listeningMod1 = await getOrGenerateTaskForSlot<ListeningTask>(
    'listening-dialogue',
    CURATED_LISTENING,
    usedQuestionIds,
    'LISTENING_MODULE_1',
    undefined,
    seenIds,
    forceFreshAi,
    'intermediate',
    'campus-conversation'
  );

  updateProgress('Listening Module 1 Announcement');
  const announcementMod1 = await getOrGenerateTaskForSlot<ListeningAnnouncementTask>(
    'listening-announcement',
    FALLBACK_ANNOUNCEMENT_LIST,
    usedQuestionIds,
    'LISTENING_MODULE_1',
    undefined,
    seenIds,
    forceFreshAi,
    'intermediate',
    'announcement'
  );

  updateProgress('Listening Module 1 Academic Talk');
  const academicTalkMod1 = await getOrGenerateTaskForSlot<ListeningAcademicTalkTask>(
    'listening-academic-talk',
    FALLBACK_ACADEMIC_TALK_LIST,
    usedQuestionIds,
    'LISTENING_MODULE_1',
    undefined,
    seenIds,
    forceFreshAi,
    'intermediate',
    'academic'
  );

  updateProgress('Listening Module 2 Choose Response');
  const chooseResponseMod2 = await getOrGenerateTaskForSlot<ListeningChooseResponseTask>(
    'listening-choose-response',
    FALLBACK_CHOOSE_RESPONSE_LIST,
    usedQuestionIds,
    'LISTENING_MODULE_2',
    listeningTrack,
    seenIds,
    forceFreshAi,
    listeningTrack === 'higher' ? 'advanced' : 'intermediate',
    'daily-conversation'
  );

  updateProgress('Listening Module 2 Dialogue');
  const listeningMod2 = await getOrGenerateTaskForSlot<ListeningTask>(
    'listening-dialogue',
    CURATED_LISTENING,
    usedQuestionIds,
    'LISTENING_MODULE_2',
    listeningTrack,
    seenIds,
    forceFreshAi,
    listeningTrack === 'higher' ? 'advanced' : 'intermediate',
    'campus-conversation'
  );

  updateProgress('Listening Module 2 Announcement');
  const announcementMod2 = await getOrGenerateTaskForSlot<ListeningAnnouncementTask>(
    'listening-announcement',
    FALLBACK_ANNOUNCEMENT_LIST,
    usedQuestionIds,
    'LISTENING_MODULE_2',
    listeningTrack,
    seenIds,
    forceFreshAi,
    listeningTrack === 'higher' ? 'advanced' : 'intermediate',
    'announcement'
  );

  updateProgress('Listening Module 2 Academic Talk');
  const academicTalkMod2 = await getOrGenerateTaskForSlot<ListeningAcademicTalkTask>(
    'listening-academic-talk',
    FALLBACK_ACADEMIC_TALK_LIST,
    usedQuestionIds,
    'LISTENING_MODULE_2',
    listeningTrack,
    seenIds,
    forceFreshAi,
    listeningTrack === 'higher' ? 'advanced' : 'intermediate',
    'academic'
  );

  updateProgress('Writing Build Sentence');
  const buildSentence = await getOrGenerateTaskForSlot<BuildSentenceTask>(
    'build-sentence',
    CURATED_BUILD_SENTENCES,
    usedQuestionIds,
    undefined,
    undefined,
    seenIds,
    forceFreshAi,
    'intermediate',
    'general'
  );

  updateProgress('Writing Write Email');
  const writeEmail = await getOrGenerateTaskForSlot<WriteEmailTask>(
    'write-email',
    CURATED_WRITE_EMAILS,
    usedQuestionIds,
    undefined,
    undefined,
    seenIds,
    forceFreshAi,
    'intermediate',
    'campus-communication'
  );

  updateProgress('Writing Academic Discussion');
  const writing = await getOrGenerateTaskForSlot<AcademicDiscussionTask>(
    'academic-discussion',
    CURATED_ACADEMIC_DISCUSSIONS,
    usedQuestionIds,
    undefined,
    undefined,
    seenIds,
    forceFreshAi,
    'advanced',
    'academic-discussion'
  );

  updateProgress('Speaking Listen and Repeat');
  const listenRepeat = await getOrGenerateTaskForSlot<ListenRepeatTask>(
    'listen-repeat',
    CURATED_LISTEN_REPEAT,
    usedQuestionIds,
    undefined,
    undefined,
    seenIds,
    forceFreshAi,
    'intermediate',
    'sentence-repetition'
  );

  updateProgress('Speaking Interview');
  const speaking = await getOrGenerateTaskForSlot<SpeakingInterviewTask>(
    'speaking-interview',
    CURATED_SPEAKING_INTERVIEWS,
    usedQuestionIds,
    undefined,
    undefined,
    seenIds,
    forceFreshAi,
    'intermediate',
    'interview'
  );

  return {
    completeWordsMod1,
    dailyLifeMod1,
    readingMod1,
    completeWordsMod2,
    dailyLifeMod2,
    readingMod2,
    chooseResponseMod1,
    listeningMod1,
    announcementMod1,
    academicTalkMod1,
    chooseResponseMod2,
    listeningMod2,
    announcementMod2,
    academicTalkMod2,
    buildSentence,
    writeEmail,
    writing,
    listenRepeat,
    speaking,
  };
}

/**
 * Full 2026 ETS TOEFL iBT® Exam Simulation Engine
 * Covers all 12 official task types in the 4-section order (Reading -> Listening -> Writing -> Speaking)
 * with Multistage Adaptive Module 1 (Routing Stage) -> Module 2 (Adaptive Stage) in Reading & Listening.
 */
export const ExamEngine: React.FC = () => {
  const [examMode, setExamMode] = useState<'official' | 'accelerated'>('official');
  const [isStarted, setIsStarted] = useState(false);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [currentTaskIndexInSection, setCurrentTaskIndexInSection] = useState(0);
  const [timeLeft, setTimeLeft] = useState(OFFICIAL_SECTIONS_2026[0].officialTime);
  const [isTestComplete, setIsTestComplete] = useState(false);

  // Safeguard 1: Track used question IDs across the exam session so Module 2 NEVER repeats Module 1
  const usedQuestionIdsRef = useRef<Set<string>>(new Set());

  // Track Module 1 -> Module 2 adaptive routing track for Reading and Listening
  const [readingAdaptiveTrack, setReadingAdaptiveTrack] = useState<AdaptiveTrack>('higher');
  const [listeningAdaptiveTrack, setListeningAdaptiveTrack] = useState<AdaptiveTrack>('higher');

  // Fresh AI Exam options
  const [generateFreshAi, setGenerateFreshAi] = useState<boolean>(false);
  const [isPreparingExam, setIsPreparingExam] = useState<boolean>(false);
  const [prepProgressText, setPrepProgressText] = useState<string>('');
  const [prepProgressCount, setPrepProgressCount] = useState<number>(0);

  const getSectionTime = useCallback(
    (sec: SectionConfig) => {
      return examMode === 'official' ? sec.officialTime : sec.quickTime;
    },
    [examMode]
  );

  // Pick random curated tasks across all 12 official task types and adaptive modules
  const [testTasks, setTestTasks] = useState<ExamTaskBundle>(() => {
    usedQuestionIdsRef.current.clear();
    return pickRandomTasks(usedQuestionIdsRef.current, 'higher', 'higher');
  });

  // Sync static question bank shards on mount so all 12 task types have their full pools ready
  useEffect(() => {
    syncCuratedQuestionBank()
      .then(() => {
        usedQuestionIdsRef.current.clear();
        setTestTasks(pickRandomTasks(usedQuestionIdsRef.current, 'higher', 'higher'));
      })
      .catch(() => {});
  }, []);

  // Stop all playing audio whenever section or task changes or test starts/completes
  useEffect(() => {
    stopSpeaking();
    return () => {
      stopSpeaking();
    };
  }, [currentSectionIndex, currentTaskIndexInSection, isStarted, isTestComplete]);

  // Real section scores and completion tracking
  const [sectionScores, setSectionScores] = useState<Record<'Reading' | 'Listening' | 'Speaking' | 'Writing', number>>({
    Reading: 0,
    Listening: 0,
    Writing: 0,
    Speaking: 0,
  });
  const [taskScoresBySection, setTaskScoresBySection] = useState<
    Record<'Reading' | 'Listening' | 'Speaking' | 'Writing', Record<string, number>>
  >({
    Reading: {},
    Listening: {},
    Writing: {},
    Speaking: {},
  });
  const [completedSections, setCompletedSections] = useState<
    Record<'Reading' | 'Listening' | 'Speaking' | 'Writing', boolean>
  >({
    Reading: false,
    Listening: false,
    Writing: false,
    Speaking: false,
  });

  const currentSection = OFFICIAL_SECTIONS_2026[currentSectionIndex];
  const currentSectionTasks = currentSection.tasks;
  const activeTaskDescriptor = currentSectionTasks[currentTaskIndexInSection] || currentSectionTasks[0];

  // Dynamically re-select Module 2 questions when routing from Module 1 -> Module 2
  const routeToModule2IfNeeded = useCallback(
    (nextTaskIdx: number) => {
      const prevTask = currentSectionTasks[currentTaskIndexInSection];
      const nextTask = currentSectionTasks[nextTaskIdx];
      if (!prevTask || !nextTask) return;

      if (prevTask.moduleStage === 'READING_MODULE_1' && nextTask.moduleStage === 'READING_MODULE_2') {
        const rScores = taskScoresBySection.Reading || {};
        const m1Keys = ['reading_m1_complete_words', 'reading_m1_daily_life', 'reading_m1_academic'];
        const m1Recorded = m1Keys.map((k) => rScores[k]).filter((v): v is number => typeof v === 'number');
        const m1Avg =
          m1Recorded.length > 0 ? m1Recorded.reduce((a, b) => a + b, 0) / m1Recorded.length : 22;
        const routedTrack: AdaptiveTrack = m1Avg >= 18 ? 'higher' : 'standard';
        setReadingAdaptiveTrack(routedTrack);

        setTestTasks((prev) => ({
          ...prev,
          completeWordsMod2: pickFromBankOrFallback<CompleteWordsTask>(
            'complete-words',
            CURATED_COMPLETE_WORDS,
            usedQuestionIdsRef.current,
            'READING_MODULE_2',
            routedTrack
          ),
          dailyLifeMod2: pickFromBankOrFallback<DailyLifeTask>(
            'daily-life',
            FALLBACK_DAILY_LIFE_LIST,
            usedQuestionIdsRef.current,
            'READING_MODULE_2',
            routedTrack
          ),
          readingMod2: pickFromBankOrFallback<ReadingPassageTask>(
            'reading-academic',
            CURATED_READING_PASSAGES,
            usedQuestionIdsRef.current,
            'READING_MODULE_2',
            routedTrack
          ),
        }));
      } else if (prevTask.moduleStage === 'LISTENING_MODULE_1' && nextTask.moduleStage === 'LISTENING_MODULE_2') {
        const lScores = taskScoresBySection.Listening || {};
        const m1Keys = [
          'listening_m1_choose_response',
          'listening_m1_conversation',
          'listening_m1_announcement',
          'listening_m1_academic_talk',
        ];
        const m1Recorded = m1Keys.map((k) => lScores[k]).filter((v): v is number => typeof v === 'number');
        const m1Avg =
          m1Recorded.length > 0 ? m1Recorded.reduce((a, b) => a + b, 0) / m1Recorded.length : 22;
        const routedTrack: AdaptiveTrack = m1Avg >= 18 ? 'higher' : 'standard';
        setListeningAdaptiveTrack(routedTrack);

        setTestTasks((prev) => ({
          ...prev,
          chooseResponseMod2: pickFromBankOrFallback<ListeningChooseResponseTask>(
            'listening-choose-response',
            FALLBACK_CHOOSE_RESPONSE_LIST,
            usedQuestionIdsRef.current,
            'LISTENING_MODULE_2',
            routedTrack
          ),
          listeningMod2: pickFromBankOrFallback<ListeningTask>(
            'listening-dialogue',
            CURATED_LISTENING,
            usedQuestionIdsRef.current,
            'LISTENING_MODULE_2',
            routedTrack
          ),
          announcementMod2: pickFromBankOrFallback<ListeningAnnouncementTask>(
            'listening-announcement',
            FALLBACK_ANNOUNCEMENT_LIST,
            usedQuestionIdsRef.current,
            'LISTENING_MODULE_2',
            routedTrack
          ),
          academicTalkMod2: pickFromBankOrFallback<ListeningAcademicTalkTask>(
            'listening-academic-talk',
            FALLBACK_ACADEMIC_TALK_LIST,
            usedQuestionIdsRef.current,
            'LISTENING_MODULE_2',
            routedTrack
          ),
        }));
      }
    },
    [currentSectionTasks, currentTaskIndexInSection, taskScoresBySection]
  );

  // Safeguard 2: Compute exact adaptive stage header badge text
  const getAdaptiveStageHeaderBadge = (): string => {
    switch (activeTaskDescriptor.moduleStage) {
      case 'READING_MODULE_1':
        return 'Reading · Module 1 of 2 (Routing Stage)';
      case 'READING_MODULE_2':
        return readingAdaptiveTrack === 'higher'
          ? 'Reading · Module 2 of 2 (Adaptive Stage — Higher Difficulty Track)'
          : 'Reading · Module 2 of 2 (Adaptive Stage — Standard Track)';
      case 'LISTENING_MODULE_1':
        return 'Listening · Module 1 of 2 (Routing Stage)';
      case 'LISTENING_MODULE_2':
        return listeningAdaptiveTrack === 'higher'
          ? 'Listening · Module 2 of 2 (Adaptive Stage — Higher Difficulty Track)'
          : 'Listening · Module 2 of 2 (Adaptive Stage — Standard Track)';
      case 'WRITING_SINGLE':
        return `Writing · ${activeTaskDescriptor.stageLabel}`;
      case 'SPEAKING_SINGLE':
        return `Speaking · ${activeTaskDescriptor.stageLabel}`;
      default:
        return activeTaskDescriptor.stageLabel;
    }
  };

  const handleNextSection = useCallback(() => {
    if (currentSectionIndex < OFFICIAL_SECTIONS_2026.length - 1) {
      const nextIdx = currentSectionIndex + 1;
      setCurrentSectionIndex(nextIdx);
      setCurrentTaskIndexInSection(0);
      setTimeLeft(getSectionTime(OFFICIAL_SECTIONS_2026[nextIdx]));
    } else {
      // Complete mock test
      setIsTestComplete(true);

      // Only save practice records for sections that were NOT completed by the task view
      OFFICIAL_SECTIONS_2026.forEach((sec) => {
        const key = sec.sectionKey;
        if (!completedSections[key]) {
          const secTime = getSectionTime(sec);
          savePracticeRecord({
            taskType: sec.type,
            taskTitle: `Full Mock Test - ${key} (Timed Out)`,
            section: key,
            score: 0,
            maxScore: 30,
            scaledScore30: 0,
            bandScore6: 1.0,
            timeSpentSeconds: secTime,
            feedbackSummary: `Mock Test ${key} Section: timed out unfinished (0/30 · Band 1.0/6.0)`,
          });
        }
      });
    }
  }, [currentSectionIndex, completedSections, getSectionTime]);

  // Handle section timer countdown
  useEffect(() => {
    if (!isStarted || isTestComplete) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isStarted, currentSectionIndex, isTestComplete]);

  // When timer hits zero, advance cleanly outside setState updater
  useEffect(() => {
    if (timeLeft === 0 && !isTestComplete && isStarted) {
      handleNextSection();
    }
  }, [timeLeft, isTestComplete, isStarted, handleNextSection]);

  const handleTaskComplete = (
    section: 'Reading' | 'Listening' | 'Speaking' | 'Writing',
    slotKey: string,
    rawScoreOrObj: any
  ) => {
    const numericScore =
      typeof rawScoreOrObj === 'number'
        ? rawScoreOrObj
        : typeof rawScoreOrObj?.scaledScore === 'number'
        ? rawScoreOrObj.scaledScore
        : typeof rawScoreOrObj?.scaledScore30 === 'number'
        ? rawScoreOrObj.scaledScore30
        : 0;

    setTaskScoresBySection((prev) => {
      const updatedForSection = {
        ...(prev[section] || {}),
        [slotKey]: numericScore,
      };
      const values = Object.values(updatedForSection);
      const avgScaled =
        values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : numericScore;
      setSectionScores((sPrev) => ({ ...sPrev, [section]: avgScaled }));

      // Update adaptive routing track based on Module 1 performance
      if (section === 'Reading' && slotKey.startsWith('reading_m1_')) {
        const m1Keys = ['reading_m1_complete_words', 'reading_m1_daily_life', 'reading_m1_academic'];
        const m1Vals = m1Keys
          .map((k) => updatedForSection[k])
          .filter((v): v is number => typeof v === 'number');
        if (m1Vals.length > 0) {
          const m1Avg = m1Vals.reduce((a, b) => a + b, 0) / m1Vals.length;
          setReadingAdaptiveTrack(m1Avg >= 18 ? 'higher' : 'standard');
        }
      } else if (section === 'Listening' && slotKey.startsWith('listening_m1_')) {
        const m1Keys = [
          'listening_m1_choose_response',
          'listening_m1_conversation',
          'listening_m1_announcement',
          'listening_m1_academic_talk',
        ];
        const m1Vals = m1Keys
          .map((k) => updatedForSection[k])
          .filter((v): v is number => typeof v === 'number');
        if (m1Vals.length > 0) {
          const m1Avg = m1Vals.reduce((a, b) => a + b, 0) / m1Vals.length;
          setListeningAdaptiveTrack(m1Avg >= 18 ? 'higher' : 'standard');
        }
      }

      return {
        ...prev,
        [section]: updatedForSection,
      };
    });
    setCompletedSections((prev) => ({ ...prev, [section]: true }));
  };

  const handleStartExam = async () => {
    setIsPreparingExam(true);
    setPrepProgressText('Preparing exam questions...');
    setPrepProgressCount(0);
    try {
      usedQuestionIdsRef.current.clear();
      setReadingAdaptiveTrack('higher');
      setListeningAdaptiveTrack('higher');
      const bundle = await buildFullExamBundleAsync(
        usedQuestionIdsRef.current,
        'higher',
        'higher',
        generateFreshAi,
        (msg, completed) => {
          setPrepProgressText(msg);
          setPrepProgressCount(completed);
        }
      );
      setTestTasks(bundle);
      setCurrentSectionIndex(0);
      setCurrentTaskIndexInSection(0);
      setTimeLeft(getSectionTime(OFFICIAL_SECTIONS_2026[0]));
      setIsStarted(true);
    } catch (err) {
      console.error('[ExamEngine] Error preparing exam bundle:', err);
      usedQuestionIdsRef.current.clear();
      setTestTasks(pickRandomTasks(usedQuestionIdsRef.current, 'higher', 'higher'));
      setCurrentSectionIndex(0);
      setCurrentTaskIndexInSection(0);
      setTimeLeft(getSectionTime(OFFICIAL_SECTIONS_2026[0]));
      setIsStarted(true);
    } finally {
      setIsPreparingExam(false);
    }
  };

  const handleRetake = () => {
    usedQuestionIdsRef.current.clear();
    setReadingAdaptiveTrack('higher');
    setListeningAdaptiveTrack('higher');
    setSectionScores({ Reading: 0, Listening: 0, Writing: 0, Speaking: 0 });
    setTaskScoresBySection({ Reading: {}, Listening: {}, Writing: {}, Speaking: {} });
    setCompletedSections({ Reading: false, Listening: false, Writing: false, Speaking: false });
    setTestTasks(pickRandomTasks(usedQuestionIdsRef.current, 'higher', 'higher'));
    setCurrentSectionIndex(0);
    setCurrentTaskIndexInSection(0);
    setTimeLeft(getSectionTime(OFFICIAL_SECTIONS_2026[0]));
    setIsTestComplete(false);
    setIsStarted(false);
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isStarted) {
    return (
      <div className="max-w-4xl mx-auto p-8 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-6 text-center">
        <div className="w-16 h-16 bg-teal-100 text-teal-800 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
          <Clock className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-teal-50 text-teal-800 border border-teal-200">
            <ShieldCheck className="w-3.5 h-3.5" />
            Official 2026 ETS Multistage Adaptive Exam · All 12 Task Types
          </div>
          <h2 className="text-2xl font-bold text-slate-900">TOEFL iBT® Full Simulated Exam</h2>
          <p className="text-sm text-slate-500 max-w-xl mx-auto">
            Experience the official 4-section exam order: <strong>Reading → Listening → Writing → Speaking</strong> with Multistage Adaptive <strong>Module 1 (Routing Stage) → Module 2 (Adaptive Stage)</strong> and zero question repetition across modules.
          </p>
        </div>

        {/* Exam Timing Selection */}
        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={() => setExamMode('official')}
            className={`px-4 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
              examMode === 'official'
                ? 'bg-teal-800 text-white border-teal-800 shadow-sm'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Official ETS 2026 Timing (90 Mins Total)
          </button>
          <button
            type="button"
            onClick={() => setExamMode('accelerated')}
            className={`px-4 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
              examMode === 'accelerated'
                ? 'bg-teal-800 text-white border-teal-800 shadow-sm'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Accelerated Practice Mode (45 Mins Total)
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-left">
          {OFFICIAL_SECTIONS_2026.map((sec, idx) => {
            const secMins = Math.round(getSectionTime(sec) / 60);
            const uniqueLabels = Array.from(
              new Set(sec.tasks.map((t) => t.label.replace(/\s*\(Adaptive\)$/, '')))
            );
            return (
              <div key={sec.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-teal-700 uppercase">Section {idx + 1}</span>
                  <span className="text-[11px] text-slate-500 font-mono">{secMins} mins</span>
                </div>
                <div className="text-xs font-bold text-slate-900">{sec.name}</div>
                {(sec.sectionKey === 'Reading' || sec.sectionKey === 'Listening') && (
                  <div className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md inline-block">
                    Module 1 (Routing) → Module 2 (Adaptive)
                  </div>
                )}
                <ul className="space-y-1 pt-1 border-t border-slate-200/70">
                  {uniqueLabels.map((lbl) => (
                    <li key={lbl} className="text-[11px] text-slate-600 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-600 shrink-0" />
                      <span className="truncate">{lbl}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Fresh AI Exam Generation Toggle */}
        {hasAnyProviderKey() && (
          <div className="max-w-md mx-auto p-3.5 bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200 rounded-xl text-left flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
            <div className="flex-1">
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-xs text-slate-800">
                <input
                  type="checkbox"
                  checked={generateFreshAi}
                  onChange={(e) => setGenerateFreshAi(e.target.checked)}
                  disabled={isPreparingExam}
                  className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500 cursor-pointer"
                />
                <span>✨ Generate Fresh AI Questions for Mock Exam</span>
              </label>
              <p className="text-[11px] text-slate-600 mt-1">
                When enabled, synthesizes brand-new, unseen prompts and passages on-the-fly using your connected AI key. If disabled, prioritizes all unseen curated questions first before falling back to practiced ones.
              </p>
            </div>
          </div>
        )}

        {/* Preparation Progress Bar */}
        {isPreparingExam && (
          <div className="max-w-md mx-auto p-4 bg-slate-50 border border-teal-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-teal-900">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-teal-700" />
                <span>{prepProgressText || 'Preparing exam tasks...'}</span>
              </div>
              <span className="font-mono text-teal-700">{prepProgressCount} / 19</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-teal-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.round((prepProgressCount / 19) * 100)}%` }}
              />
            </div>
          </div>
        )}

        <div className="pt-2">
          <button
            onClick={handleStartExam}
            disabled={isPreparingExam}
            className="px-8 py-3 text-sm font-semibold text-white bg-teal-800 hover:bg-teal-900 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors shadow-md cursor-pointer inline-flex items-center gap-2"
          >
            {isPreparingExam ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Preparing Exam ({prepProgressCount}/19)...</span>
              </>
            ) : (
              <span>Start Exam Simulation</span>
            )}
          </button>
        </div>
      </div>
    );
  }

  if (isTestComplete) {
    const totalScore =
      sectionScores.Reading + sectionScores.Listening + sectionScores.Writing + sectionScores.Speaking;
    const readingBand = convertScaledToBand6(sectionScores.Reading, 'Reading');
    const listeningBand = convertScaledToBand6(sectionScores.Listening, 'Listening');
    const writingBand = convertScaledToBand6(sectionScores.Writing, 'Writing');
    const speakingBand = convertScaledToBand6(sectionScores.Speaking, 'Speaking');
    const overallBand = convertOverall120ToBand6(totalScore);
    const cefr = getCefrFromBand6(overallBand);
    const isUpperTierOverall =
      readingAdaptiveTrack === 'higher' || listeningAdaptiveTrack === 'higher';

    return (
      <div className="space-y-6 max-w-2xl mx-auto p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
        <div className="text-center space-y-2 border-b border-slate-100 pb-5">
          <div className="w-12 h-12 bg-teal-100 text-teal-800 rounded-full flex items-center justify-center mx-auto">
            <Award className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Official 2026 Mock Test Score Report</h2>
          <p className="text-xs text-slate-500">
            Dual Reporting: 1.0–6.0 Band Scale, CEFR Level &amp; 0–120 Concordance Score
          </p>
        </div>

        {/* Multistage Adaptive Routing Path Banner */}
        <div className="p-3.5 bg-emerald-50/90 border border-emerald-200 rounded-xl space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-950">
              <GitBranch className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>
                {isUpperTierOverall
                  ? 'Adaptive Path: Routed to Upper-Tier Module 2 ✓'
                  : 'Adaptive Path: Standard Track'}
              </span>
            </div>
            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-white text-emerald-800 border border-emerald-200">
              Multistage Adaptive (Module 1 → Module 2)
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-700 pt-1 border-t border-emerald-200/60">
            <div>
              <strong>Reading Path:</strong>{' '}
              {readingAdaptiveTrack === 'higher'
                ? 'Adaptive Path: Routed to Upper-Tier Module 2 ✓ (Higher Difficulty Track)'
                : 'Adaptive Path: Standard Track (Module 2)'}
            </div>
            <div>
              <strong>Listening Path:</strong>{' '}
              {listeningAdaptiveTrack === 'higher'
                ? 'Adaptive Path: Routed to Upper-Tier Module 2 ✓ (Higher Difficulty Track)'
                : 'Adaptive Path: Standard Track (Module 2)'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-slate-900 text-white rounded-xl text-center space-y-1">
            <div className="text-xs text-slate-300 font-semibold uppercase">Overall Band Score</div>
            <div className="text-3xl font-mono font-bold text-teal-400">Band {overallBand.toFixed(1)} / 6.0</div>
            <div className="text-xs text-slate-400 font-mono">{totalScore} / 120 Concordance Score</div>
          </div>
          <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl text-center space-y-1">
            <div className="text-xs text-teal-700 font-semibold uppercase">CEFR Level</div>
            <div className="text-xl font-bold text-teal-950">{cefr.code} Mastery</div>
            <div className="text-xs text-teal-800 font-medium">{cefr.name}</div>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
            4 Section Band Scores (1.0–6.0) &amp; 0–30 Scaled Breakdown
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center space-y-0.5">
              <div className="text-xs text-slate-500 font-medium">1. Reading</div>
              <div className="text-base font-mono font-bold text-teal-800">Band {readingBand.toFixed(1)} / 6.0</div>
              <div className="text-[11px] font-mono text-slate-600">{sectionScores.Reading} / 30 Scaled</div>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center space-y-0.5">
              <div className="text-xs text-slate-500 font-medium">2. Listening</div>
              <div className="text-base font-mono font-bold text-teal-800">Band {listeningBand.toFixed(1)} / 6.0</div>
              <div className="text-[11px] font-mono text-slate-600">{sectionScores.Listening} / 30 Scaled</div>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center space-y-0.5">
              <div className="text-xs text-slate-500 font-medium">3. Writing</div>
              <div className="text-base font-mono font-bold text-teal-800">Band {writingBand.toFixed(1)} / 6.0</div>
              <div className="text-[11px] font-mono text-slate-600">{sectionScores.Writing} / 30 Scaled</div>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center space-y-0.5">
              <div className="text-xs text-slate-500 font-medium">4. Speaking</div>
              <div className="text-base font-mono font-bold text-teal-800">Band {speakingBand.toFixed(1)} / 6.0</div>
              <div className="text-[11px] font-mono text-slate-600">{sectionScores.Speaking} / 30 Scaled</div>
            </div>
          </div>
        </div>

        <div className="pt-4 text-center">
          <button
            onClick={handleRetake}
            className="px-6 py-2.5 text-sm font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-xl transition-colors cursor-pointer shadow-sm"
          >
            Take Another Simulated Exam
          </button>
        </div>
      </div>
    );
  }

  const adaptiveStageBadgeText = getAdaptiveStageHeaderBadge();
  const isAdaptiveModule2 =
    activeTaskDescriptor.moduleStage === 'READING_MODULE_2' ||
    activeTaskDescriptor.moduleStage === 'LISTENING_MODULE_2';

  return (
    <div className="space-y-5">
      {/* Test Progress & Section Header with Clear Module 1 vs. Module 2 Adaptive Stage Badge */}
      <div className="bg-slate-900 text-white p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="px-2.5 py-1 bg-teal-600 text-white rounded text-xs font-bold uppercase tracking-wider">
            Section {currentSectionIndex + 1} / {OFFICIAL_SECTIONS_2026.length}
          </span>
          <span className="font-semibold text-sm sm:text-base">{currentSection.name}</span>
          <span
            className={`px-3 py-1 rounded-lg text-xs font-bold border flex items-center gap-1.5 ${
              isAdaptiveModule2
                ? 'bg-emerald-900/80 text-emerald-200 border-emerald-500/50'
                : 'bg-slate-800 text-teal-300 border-slate-700'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5 shrink-0" />
            <span>{adaptiveStageBadgeText}</span>
          </span>
          <span className="text-xs text-slate-400">·</span>
          <span className="text-xs font-medium text-slate-200">{activeTaskDescriptor.label}</span>
        </div>
        <div className="flex items-center gap-3 self-end sm:self-center">
          <div className="flex items-center gap-2 font-mono text-base font-bold bg-slate-800 px-3 py-1 rounded-lg border border-slate-700 text-teal-400">
            <Clock className="w-4 h-4 text-slate-400" />
            <span>{formatTimer(timeLeft)}</span>
          </div>
          {currentTaskIndexInSection < currentSectionTasks.length - 1 && (
            <button
              type="button"
              onClick={() => {
                const nextIdx = currentTaskIndexInSection + 1;
                routeToModule2IfNeeded(nextIdx);
                setCurrentTaskIndexInSection(nextIdx);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <span>Next Task</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={handleNextSection}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            <span>{currentSectionIndex < OFFICIAL_SECTIONS_2026.length - 1 ? 'Next Section' : 'Finish Exam'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Section Module / Task Stepper */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {currentSectionTasks.map((t, idx) => {
          const isCurrent = idx === currentTaskIndexInSection;
          const isDone = taskScoresBySection[currentSection.sectionKey]?.[t.slotKey] !== undefined;
          return (
            <button
              key={t.slotKey}
              type="button"
              onClick={() => {
                routeToModule2IfNeeded(idx);
                setCurrentTaskIndexInSection(idx);
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all whitespace-nowrap cursor-pointer ${
                isCurrent
                  ? 'bg-teal-800 text-white border-teal-800 shadow-xs'
                  : isDone
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span className="font-mono text-[11px] opacity-80">{t.stageLabel}</span>
              <span>·</span>
              <span>{t.label}</span>
              {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
            </button>
          );
        })}
      </div>

      {/* Render Current Task Component (All 12 Official 2026 Task Types across Module 1 & Module 2) */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
        {/* READING SECTION — MODULE 1 & MODULE 2 */}
        {activeTaskDescriptor.taskType === TaskType.READING_COMPLETE_WORDS && (
          <CompleteWordsView
            key={`${activeTaskDescriptor.slotKey}-${
              activeTaskDescriptor.moduleNumber === 2
                ? testTasks.completeWordsMod2.id
                : testTasks.completeWordsMod1.id
            }`}
            task={
              activeTaskDescriptor.moduleNumber === 2
                ? testTasks.completeWordsMod2
                : testTasks.completeWordsMod1
            }
            onComplete={(score) =>
              handleTaskComplete('Reading', activeTaskDescriptor.slotKey, score)
            }
          />
        )}
        {activeTaskDescriptor.taskType === TaskType.READING_DAILY_LIFE && (
          <DailyLifeView
            key={`${activeTaskDescriptor.slotKey}-${
              activeTaskDescriptor.moduleNumber === 2
                ? testTasks.dailyLifeMod2.id
                : testTasks.dailyLifeMod1.id
            }`}
            task={
              activeTaskDescriptor.moduleNumber === 2
                ? testTasks.dailyLifeMod2
                : testTasks.dailyLifeMod1
            }
            onComplete={(score) =>
              handleTaskComplete('Reading', activeTaskDescriptor.slotKey, score)
            }
          />
        )}
        {activeTaskDescriptor.taskType === TaskType.READING_ACADEMIC && (
          <ReadingPassageView
            key={`${activeTaskDescriptor.slotKey}-${
              activeTaskDescriptor.moduleNumber === 2
                ? testTasks.readingMod2.id
                : testTasks.readingMod1.id
            }`}
            task={
              activeTaskDescriptor.moduleNumber === 2
                ? testTasks.readingMod2
                : testTasks.readingMod1
            }
            onComplete={(score) =>
              handleTaskComplete('Reading', activeTaskDescriptor.slotKey, score)
            }
          />
        )}

        {/* LISTENING SECTION — MODULE 1 & MODULE 2 */}
        {activeTaskDescriptor.taskType === TaskType.LISTENING_CHOOSE_RESPONSE && (
          <ListeningChooseResponseView
            key={`${activeTaskDescriptor.slotKey}-${
              activeTaskDescriptor.moduleNumber === 2
                ? testTasks.chooseResponseMod2.id
                : testTasks.chooseResponseMod1.id
            }`}
            task={
              activeTaskDescriptor.moduleNumber === 2
                ? testTasks.chooseResponseMod2
                : testTasks.chooseResponseMod1
            }
            onComplete={(score) =>
              handleTaskComplete('Listening', activeTaskDescriptor.slotKey, score)
            }
          />
        )}
        {activeTaskDescriptor.taskType === TaskType.LISTENING_CONVERSATION && (
          <ListeningDialogueView
            key={`${activeTaskDescriptor.slotKey}-${
              activeTaskDescriptor.moduleNumber === 2
                ? testTasks.listeningMod2.id
                : testTasks.listeningMod1.id
            }`}
            task={
              activeTaskDescriptor.moduleNumber === 2
                ? testTasks.listeningMod2
                : testTasks.listeningMod1
            }
            onComplete={(score) =>
              handleTaskComplete('Listening', activeTaskDescriptor.slotKey, score)
            }
          />
        )}
        {activeTaskDescriptor.taskType === TaskType.LISTENING_ANNOUNCEMENT && (
          <ListeningAnnouncementView
            key={`${activeTaskDescriptor.slotKey}-${
              activeTaskDescriptor.moduleNumber === 2
                ? testTasks.announcementMod2.id
                : testTasks.announcementMod1.id
            }`}
            task={
              activeTaskDescriptor.moduleNumber === 2
                ? testTasks.announcementMod2
                : testTasks.announcementMod1
            }
            onComplete={(score) =>
              handleTaskComplete('Listening', activeTaskDescriptor.slotKey, score)
            }
          />
        )}
        {activeTaskDescriptor.taskType === TaskType.LISTENING_ACADEMIC_TALK && (
          <ListeningAcademicTalkView
            key={`${activeTaskDescriptor.slotKey}-${
              activeTaskDescriptor.moduleNumber === 2
                ? testTasks.academicTalkMod2.id
                : testTasks.academicTalkMod1.id
            }`}
            task={
              activeTaskDescriptor.moduleNumber === 2
                ? testTasks.academicTalkMod2
                : testTasks.academicTalkMod1
            }
            onComplete={(score) =>
              handleTaskComplete('Listening', activeTaskDescriptor.slotKey, score)
            }
          />
        )}

        {/* WRITING SECTION (3 Tasks) */}
        {activeTaskDescriptor.taskType === TaskType.WRITING_BUILD_SENTENCE && (
          <BuildSentenceView
            task={testTasks.buildSentence}
            onComplete={(score) =>
              handleTaskComplete('Writing', activeTaskDescriptor.slotKey, score)
            }
          />
        )}
        {activeTaskDescriptor.taskType === TaskType.WRITING_EMAIL && (
          <WriteEmailView
            task={testTasks.writeEmail}
            onComplete={(score) =>
              handleTaskComplete('Writing', activeTaskDescriptor.slotKey, score)
            }
          />
        )}
        {activeTaskDescriptor.taskType === TaskType.WRITING_DISCUSSION && (
          <AcademicDiscussionView
            task={testTasks.writing}
            onComplete={(score) =>
              handleTaskComplete('Writing', activeTaskDescriptor.slotKey, score)
            }
          />
        )}

        {/* SPEAKING SECTION (2 Tasks) */}
        {activeTaskDescriptor.taskType === TaskType.SPEAKING_LISTEN_REPEAT && (
          <ListenRepeatView
            task={testTasks.listenRepeat}
            onComplete={(score) =>
              handleTaskComplete('Speaking', activeTaskDescriptor.slotKey, score)
            }
          />
        )}
        {activeTaskDescriptor.taskType === TaskType.SPEAKING_INTERVIEW && (
          <SpeakingInterviewView
            task={testTasks.speaking}
            onComplete={(score) =>
              handleTaskComplete('Speaking', activeTaskDescriptor.slotKey, score)
            }
          />
        )}
      </div>
    </div>
  );
};

export const MockTestView = ExamEngine;
export default ExamEngine;
