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
import { SpeakingInterviewView } from './SpeakingInterviewView';
import { AcademicDiscussionView } from './AcademicDiscussionView';
import { savePracticeRecord, calculateToeflEstimate } from '../../utils/scoreTracker';
import { Clock, ArrowRight, Award } from 'lucide-react';

const SECTIONS = [
  { id: 'reading', name: 'Reading Section', sectionKey: 'Reading' as const, time: 900, type: 'reading-passage' },
  { id: 'listening', name: 'Listening Section', sectionKey: 'Listening' as const, time: 900, type: 'listening-dialogue' },
  { id: 'speaking', name: 'Speaking Section', sectionKey: 'Speaking' as const, time: 300, type: 'speaking-interview' },
  { id: 'writing', name: 'Writing Section (Academic Discussion)', sectionKey: 'Writing' as const, time: 600, type: 'academic-discussion' },
];

function pickRandomTasks() {
  return {
    reading: CURATED_READING_PASSAGES[Math.floor(Math.random() * CURATED_READING_PASSAGES.length)] as ReadingPassageTask,
    listening: CURATED_LISTENING[Math.floor(Math.random() * CURATED_LISTENING.length)] as ListeningTask,
    speaking: CURATED_SPEAKING_INTERVIEWS[Math.floor(Math.random() * CURATED_SPEAKING_INTERVIEWS.length)] as SpeakingInterviewTask,
    writing: CURATED_ACADEMIC_DISCUSSIONS[Math.floor(Math.random() * CURATED_ACADEMIC_DISCUSSIONS.length)] as AcademicDiscussionTask,
  };
}

export const MockTestView: React.FC = () => {
  const [isStarted, setIsStarted] = useState(false);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(SECTIONS[0].time);
  const [isTestComplete, setIsTestComplete] = useState(false);
  
  // Real section scores and completion tracking
  const [sectionScores, setSectionScores] = useState<Record<'Reading' | 'Listening' | 'Speaking' | 'Writing', number>>({
    Reading: 0,
    Listening: 0,
    Speaking: 0,
    Writing: 0,
  });
  const [completedSections, setCompletedSections] = useState<Record<'Reading' | 'Listening' | 'Speaking' | 'Writing', boolean>>({
    Reading: false,
    Listening: false,
    Speaking: false,
    Writing: false,
  });

  // Pick random curated tasks per section
  const [testTasks, setTestTasks] = useState(pickRandomTasks);

  const currentSection = SECTIONS[currentSectionIndex];

  // TEST COMMENT: Sequence sequence: when timer reaches 0 or section is completed,
  // handleNextSection increments currentSectionIndex and sets timeLeft for the new section
  // in the same synchronous handler execution, preventing double-advance race conditions.
  const handleNextSection = useCallback(() => {
    if (currentSectionIndex < SECTIONS.length - 1) {
      const nextIdx = currentSectionIndex + 1;
      setCurrentSectionIndex(nextIdx);
      setTimeLeft(SECTIONS[nextIdx].time);
    } else {
      // Complete mock test
      setIsTestComplete(true);

      // Only save practice records for sections that were NOT completed by the task view
      // (score 0 for timed out sections, avoid duplicate records)
      SECTIONS.forEach((sec) => {
        const key = sec.sectionKey;
        if (!completedSections[key]) {
          savePracticeRecord({
            taskType: sec.type,
            taskTitle: `Full Mock Test - ${key} (Timed Out)`,
            section: key,
            score: 0,
            maxScore: 30,
            scaledScore30: 0,
            timeSpentSeconds: sec.time,
            feedbackSummary: `Mock Test ${key} Section: timed out unfinished (0/30)`,
          });
        }
      });
    }
  }, [currentSectionIndex, completedSections]);

  // Handle section timer countdown without calling state triggers inside updater
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

  const handleRetake = () => {
    setSectionScores({ Reading: 0, Listening: 0, Speaking: 0, Writing: 0 });
    setCompletedSections({ Reading: false, Listening: false, Speaking: false, Writing: false });
    setTestTasks(pickRandomTasks());
    setCurrentSectionIndex(0);
    setTimeLeft(SECTIONS[0].time);
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
      <div className="max-w-2xl mx-auto p-8 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-6 text-center">
        <div className="w-16 h-16 bg-teal-100 text-teal-800 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
          <Clock className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-slate-900">Full TOEFL iBT Simulated Exam</h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Experience a complete 4-section TOEFL exam simulation under official time constraints. Timer begins only after you click Start.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-left">
          {SECTIONS.map((sec, idx) => (
            <div key={sec.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="text-[10px] font-semibold text-teal-700 uppercase">Section {idx + 1}</div>
              <div className="text-xs font-bold text-slate-900 truncate">{sec.name}</div>
              <div className="text-[11px] text-slate-500 font-mono">{Math.round(sec.time / 60)} mins</div>
            </div>
          ))}
        </div>

        <div className="pt-2">
          <button
            onClick={() => setIsStarted(true)}
            className="px-8 py-3 text-sm font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-xl transition-colors shadow-md cursor-pointer"
          >
            Start Full Mock Test
          </button>
        </div>
      </div>
    );
  }

  if (isTestComplete) {
    const totalScore = sectionScores.Reading + sectionScores.Listening + sectionScores.Speaking + sectionScores.Writing;
    const est = calculateToeflEstimate([
      { id: '1', taskType: 'reading-passage', taskTitle: 'Mock Reading', section: 'Reading', date: new Date().toISOString(), score: sectionScores.Reading, maxScore: 30, scaledScore30: sectionScores.Reading, timeSpentSeconds: 900 },
      { id: '2', taskType: 'listening-dialogue', taskTitle: 'Mock Listening', section: 'Listening', date: new Date().toISOString(), score: sectionScores.Listening, maxScore: 30, scaledScore30: sectionScores.Listening, timeSpentSeconds: 900 },
      { id: '3', taskType: 'speaking-interview', taskTitle: 'Mock Speaking', section: 'Speaking', date: new Date().toISOString(), score: sectionScores.Speaking, maxScore: 30, scaledScore30: sectionScores.Speaking, timeSpentSeconds: 300 },
      { id: '4', taskType: 'academic-discussion', taskTitle: 'Mock Writing', section: 'Writing', date: new Date().toISOString(), score: sectionScores.Writing, maxScore: 30, scaledScore30: sectionScores.Writing, timeSpentSeconds: 600 },
    ]);

    return (
      <div className="space-y-6 max-w-2xl mx-auto p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
        <div className="text-center space-y-2 border-b border-slate-100 pb-5">
          <div className="w-12 h-12 bg-teal-100 text-teal-800 rounded-full flex items-center justify-center mx-auto">
            <Award className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Full Mock Test Score Report</h2>
          <p className="text-xs text-slate-500">Official 2026 TOEFL iBT Simulated Exam Completed</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-slate-900 text-white rounded-xl text-center">
            <div className="text-xs text-slate-300 font-semibold uppercase">Total Scaled Score</div>
            <div className="text-3xl font-mono font-bold text-teal-400 mt-1">{totalScore} / 120</div>
          </div>
          <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl text-center">
            <div className="text-xs text-teal-700 font-semibold uppercase">CEFR Level</div>
            <div className="text-xl font-mono font-bold text-teal-950 mt-1">{est.cefrLevel}</div>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Section Breakdown</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
              <div className="text-xs text-slate-500 font-medium">Reading</div>
              <div className="text-lg font-mono font-bold text-slate-900">{sectionScores.Reading} / 30</div>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
              <div className="text-xs text-slate-500 font-medium">Listening</div>
              <div className="text-lg font-mono font-bold text-slate-900">{sectionScores.Listening} / 30</div>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
              <div className="text-xs text-slate-500 font-medium">Speaking</div>
              <div className="text-lg font-mono font-bold text-slate-900">{sectionScores.Speaking} / 30</div>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
              <div className="text-xs text-slate-500 font-medium">Writing</div>
              <div className="text-lg font-mono font-bold text-slate-900">{sectionScores.Writing} / 30</div>
            </div>
          </div>
        </div>

        <div className="pt-4 flex justify-center">
          <button
            onClick={handleRetake}
            className="px-6 py-2.5 text-sm font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-lg transition-colors shadow-xs"
          >
            Retake Full Mock Test
          </button>
        </div>
      </div>
    );
  }

  const progressPercent = ((currentSectionIndex + 1) / SECTIONS.length) * 100;

  return (
    <div className="space-y-6">
      {/* Top Bar with Timer and Progress */}
      <div className="bg-slate-900 text-white rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs text-teal-400 font-semibold uppercase tracking-wider">
            Section {currentSectionIndex + 1} of {SECTIONS.length}: {currentSection.name}
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full mt-2 overflow-hidden w-48">
            <div className="bg-teal-400 h-full transition-all duration-300" style={{ width: `${progressPercent}%` }}></div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-mono text-lg font-bold bg-slate-800 px-3 py-1 rounded-lg text-teal-300">
            <Clock className="w-4 h-4" />
            <span>{formatTimer(timeLeft)}</span>
          </div>

          <button
            onClick={handleNextSection}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors shadow-xs"
          >
            <span>{currentSectionIndex === SECTIONS.length - 1 ? 'Finish & View Report' : 'Next Section'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Render Active Section Component */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs">
        {currentSectionIndex === 0 && (
          <ReadingPassageView 
            task={testTasks.reading} 
            onNextTask={handleNextSection} 
            onComplete={(score) => handleSectionComplete('Reading', score)} 
          />
        )}
        {currentSectionIndex === 1 && (
          <ListeningDialogueView 
            task={testTasks.listening} 
            onNextTask={handleNextSection} 
            onComplete={(score) => handleSectionComplete('Listening', score)} 
          />
        )}
        {currentSectionIndex === 2 && (
          <SpeakingInterviewView 
            task={testTasks.speaking} 
            onNextTask={handleNextSection} 
            onComplete={(score) => handleSectionComplete('Speaking', score)} 
          />
        )}
        {currentSectionIndex === 3 && (
          <AcademicDiscussionView 
            task={testTasks.writing} 
            onNextTask={handleNextSection} 
            onComplete={(score) => handleSectionComplete('Writing', score)} 
          />
        )}
      </div>
    </div>
  );
};
