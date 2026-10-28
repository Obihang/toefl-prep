import React, { useState, useEffect, useCallback } from 'react';
import { 
  CURATED_READING_PASSAGES, 
  CURATED_LISTENING, 
  CURATED_SPEAKING_INTERVIEWS, 
  CURATED_ACADEMIC_DISCUSSIONS,
  ReadingPassageTask,
  ListeningTask,
  SpeakingInterviewTask,
  AcademicDiscussionTask
} from '../../data/curatedQuestions';
import { ReadingPassageView } from './ReadingPassageView';
import { ListeningDialogueView } from './ListeningDialogueView';
import { AcademicDiscussionView } from './AcademicDiscussionView';
import { SpeakingInterviewView } from './SpeakingInterviewView';
import { savePracticeRecord, calculateToeflEstimate, convertScaledToBand6, convertOverall120ToBand6, getCefrFromBand6 } from '../../utils/scoreTracker';
import { stopSpeaking } from '../../utils/audioSpeech';
import { Clock, ArrowRight, Award, CheckCircle2, ShieldCheck } from 'lucide-react';

/** Official 2026 ETS Section Order: Reading -> Listening -> Writing -> Speaking (PDF Page 4) */
export interface SectionConfig {
  id: string;
  name: string;
  sectionKey: 'Reading' | 'Listening' | 'Writing' | 'Speaking';
  officialTime: number; // in seconds
  quickTime: number;     // in seconds
  type: string;
}

export const OFFICIAL_SECTIONS_2026: SectionConfig[] = [
  { id: 'reading', name: 'Reading Section', sectionKey: 'Reading', officialTime: 1800, quickTime: 900, type: 'reading-passage' },
  { id: 'listening', name: 'Listening Section', sectionKey: 'Listening', officialTime: 1740, quickTime: 900, type: 'listening-dialogue' },
  { id: 'writing', name: 'Writing Section', sectionKey: 'Writing', officialTime: 1380, quickTime: 600, type: 'academic-discussion' },
  { id: 'speaking', name: 'Speaking Section', sectionKey: 'Speaking', officialTime: 480, quickTime: 300, type: 'speaking-interview' },
];

function pickRandomTasks() {
  return {
    reading: CURATED_READING_PASSAGES[Math.floor(Math.random() * CURATED_READING_PASSAGES.length)] as ReadingPassageTask,
    listening: CURATED_LISTENING[Math.floor(Math.random() * CURATED_LISTENING.length)] as ListeningTask,
    writing: CURATED_ACADEMIC_DISCUSSIONS[Math.floor(Math.random() * CURATED_ACADEMIC_DISCUSSIONS.length)] as AcademicDiscussionTask,
    speaking: CURATED_SPEAKING_INTERVIEWS[Math.floor(Math.random() * CURATED_SPEAKING_INTERVIEWS.length)] as SpeakingInterviewTask,
  };
}

export const MockTestView: React.FC = () => {
  const [examMode, setExamMode] = useState<'official' | 'accelerated'>('official');
  const [isStarted, setIsStarted] = useState(false);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(OFFICIAL_SECTIONS_2026[0].officialTime);
  const [isTestComplete, setIsTestComplete] = useState(false);

  const getSectionTime = useCallback((sec: SectionConfig) => {
    return examMode === 'official' ? sec.officialTime : sec.quickTime;
  }, [examMode]);

  // Stop all playing audio whenever section changes or test starts/completes
  useEffect(() => {
    stopSpeaking();
    return () => {
      stopSpeaking();
    };
  }, [currentSectionIndex, isStarted, isTestComplete]);
  
  // Real section scores and completion tracking
  const [sectionScores, setSectionScores] = useState<Record<'Reading' | 'Listening' | 'Speaking' | 'Writing', number>>({
    Reading: 0,
    Listening: 0,
    Writing: 0,
    Speaking: 0,
  });
  const [completedSections, setCompletedSections] = useState<Record<'Reading' | 'Listening' | 'Speaking' | 'Writing', boolean>>({
    Reading: false,
    Listening: false,
    Writing: false,
    Speaking: false,
  });

  // Pick random curated tasks per section
  const [testTasks, setTestTasks] = useState(pickRandomTasks);

  const currentSection = OFFICIAL_SECTIONS_2026[currentSectionIndex];

  // TEST COMMENT: Sequence sequence: when timer reaches 0 or section is completed,
  // handleNextSection increments currentSectionIndex and sets timeLeft for the new section
  // in the same synchronous handler execution, preventing double-advance race conditions.
  const handleNextSection = useCallback(() => {
    if (currentSectionIndex < OFFICIAL_SECTIONS_2026.length - 1) {
      const nextIdx = currentSectionIndex + 1;
      setCurrentSectionIndex(nextIdx);
      setTimeLeft(getSectionTime(OFFICIAL_SECTIONS_2026[nextIdx]));
    } else {
      // Complete mock test
      setIsTestComplete(true);

      // Only save practice records for sections that were NOT completed by the task view
      // (score 0 for timed out sections, avoid duplicate records)
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

  const handleSectionComplete = (section: 'Reading' | 'Listening' | 'Speaking' | 'Writing', score: number) => {
    setSectionScores((prev) => ({ ...prev, [section]: score }));
    setCompletedSections((prev) => ({ ...prev, [section]: true }));
  };

  const handleStartExam = () => {
    setTimeLeft(getSectionTime(OFFICIAL_SECTIONS_2026[0]));
    setIsStarted(true);
  };

  const handleRetake = () => {
    setSectionScores({ Reading: 0, Listening: 0, Writing: 0, Speaking: 0 });
    setCompletedSections({ Reading: false, Listening: false, Writing: false, Speaking: false });
    setTestTasks(pickRandomTasks());
    setCurrentSectionIndex(0);
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
      <div className="max-w-3xl mx-auto p-8 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-6 text-center">
        <div className="w-16 h-16 bg-teal-100 text-teal-800 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
          <Clock className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-teal-50 text-teal-800 border border-teal-200">
            <ShieldCheck className="w-3.5 h-3.5" />
            Official 2026 ETS Exam Specification
          </div>
          <h2 className="text-2xl font-bold text-slate-900">TOEFL iBT® Full Simulated Exam</h2>
          <p className="text-sm text-slate-500 max-w-lg mx-auto">
            Experience the official 4-section exam order: <strong>Reading → Listening → Writing → Speaking</strong>. The timer starts only when you click Start Exam.
          </p>
        </div>

        {/* Exam Timing Selection */}
        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={() => setExamMode('official')}
            className={`px-4 py-2 text-xs font-semibold rounded-xl border transition-all ${
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
            className={`px-4 py-2 text-xs font-semibold rounded-xl border transition-all ${
              examMode === 'accelerated'
                ? 'bg-teal-800 text-white border-teal-800 shadow-sm'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Accelerated Practice Mode (45 Mins Total)
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-left">
          {OFFICIAL_SECTIONS_2026.map((sec, idx) => {
            const secMins = Math.round(getSectionTime(sec) / 60);
            return (
              <div key={sec.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="text-[10px] font-semibold text-teal-700 uppercase">Section {idx + 1}</div>
                <div className="text-xs font-bold text-slate-900 truncate">{sec.name}</div>
                <div className="text-[11px] text-slate-500 font-mono">{secMins} mins</div>
              </div>
            );
          })}
        </div>

        <div className="pt-2">
          <button
            onClick={handleStartExam}
            className="px-8 py-3 text-sm font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-xl transition-colors shadow-md cursor-pointer"
          >
            Start Exam Simulation
          </button>
        </div>
      </div>
    );
  }

  if (isTestComplete) {
    const totalScore = sectionScores.Reading + sectionScores.Listening + sectionScores.Writing + sectionScores.Speaking;
    const readingBand = convertScaledToBand6(sectionScores.Reading, 'Reading');
    const listeningBand = convertScaledToBand6(sectionScores.Listening, 'Listening');
    const writingBand = convertScaledToBand6(sectionScores.Writing, 'Writing');
    const speakingBand = convertScaledToBand6(sectionScores.Speaking, 'Speaking');
    const overallBand = convertOverall120ToBand6(totalScore);
    const cefr = getCefrFromBand6(overallBand);

    return (
      <div className="space-y-6 max-w-2xl mx-auto p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
        <div className="text-center space-y-2 border-b border-slate-100 pb-5">
          <div className="w-12 h-12 bg-teal-100 text-teal-800 rounded-full flex items-center justify-center mx-auto">
            <Award className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Official 2026 Mock Test Score Report</h2>
          <p className="text-xs text-slate-500">Dual Reporting: 1.0–6.0 Band Scale & 0–120 Scaled Score</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-slate-900 text-white rounded-xl text-center space-y-1">
            <div className="text-xs text-slate-300 font-semibold uppercase">Overall Band Score</div>
            <div className="text-3xl font-mono font-bold text-teal-400">Band {overallBand.toFixed(1)} / 6.0</div>
            <div className="text-xs text-slate-400 font-mono">{totalScore} / 120 Total Scaled</div>
          </div>
          <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl text-center space-y-1">
            <div className="text-xs text-teal-700 font-semibold uppercase">CEFR Alignment</div>
            <div className="text-xl font-bold text-teal-950">{cefr.code} Mastery</div>
            <div className="text-xs text-teal-800 font-medium">{cefr.name}</div>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
            Official 4-Section Breakdown (Reading → Listening → Writing → Speaking)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center space-y-0.5">
              <div className="text-xs text-slate-500 font-medium">1. Reading</div>
              <div className="text-base font-mono font-bold text-slate-900">{sectionScores.Reading} / 30</div>
              <div className="text-[11px] font-bold text-teal-700">Band {readingBand.toFixed(1)}</div>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center space-y-0.5">
              <div className="text-xs text-slate-500 font-medium">2. Listening</div>
              <div className="text-base font-mono font-bold text-slate-900">{sectionScores.Listening} / 30</div>
              <div className="text-[11px] font-bold text-teal-700">Band {listeningBand.toFixed(1)}</div>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center space-y-0.5">
              <div className="text-xs text-slate-500 font-medium">3. Writing</div>
              <div className="text-base font-mono font-bold text-slate-900">{sectionScores.Writing} / 30</div>
              <div className="text-[11px] font-bold text-teal-700">Band {writingBand.toFixed(1)}</div>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center space-y-0.5">
              <div className="text-xs text-slate-500 font-medium">4. Speaking</div>
              <div className="text-base font-mono font-bold text-slate-900">{sectionScores.Speaking} / 30</div>
              <div className="text-[11px] font-bold text-teal-700">Band {speakingBand.toFixed(1)}</div>
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

  return (
    <div className="space-y-6">
      {/* Test Progress & Section Header */}
      <div className="bg-slate-900 text-white p-4 rounded-xl flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <span className="px-2.5 py-1 bg-teal-600 text-white rounded text-xs font-bold uppercase tracking-wider">
            Section {currentSectionIndex + 1} / {OFFICIAL_SECTIONS_2026.length}
          </span>
          <span className="font-semibold text-sm sm:text-base">{currentSection.name}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 font-mono text-base font-bold bg-slate-800 px-3 py-1 rounded-lg border border-slate-700 text-teal-400">
            <Clock className="w-4 h-4 text-slate-400" />
            <span>{formatTimer(timeLeft)}</span>
          </div>
          <button
            onClick={handleNextSection}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            <span>{currentSectionIndex < OFFICIAL_SECTIONS_2026.length - 1 ? 'Next Section' : 'Finish Exam'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Render Current Section Component */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
        {currentSection.id === 'reading' && (
          <ReadingPassageView 
            task={testTasks.reading} 
            onComplete={(score) => handleSectionComplete('Reading', score)} 
          />
        )}
        {currentSection.id === 'listening' && (
          <ListeningDialogueView 
            task={testTasks.listening} 
            onComplete={(score) => handleSectionComplete('Listening', score)} 
          />
        )}
        {currentSection.id === 'writing' && (
          <AcademicDiscussionView 
            task={testTasks.writing} 
            onComplete={(score) => handleSectionComplete('Writing', score)} 
          />
        )}
        {currentSection.id === 'speaking' && (
          <SpeakingInterviewView 
            task={testTasks.speaking} 
            onComplete={(score) => handleSectionComplete('Speaking', score)} 
          />
        )}
      </div>
    </div>
  );
};
