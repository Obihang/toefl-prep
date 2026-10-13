import React, { useState, useEffect } from 'react';
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
import { Clock, ArrowRight, Award, CheckCircle2, AlertCircle } from 'lucide-react';

const SECTIONS = [
  { id: 'reading', name: 'Reading Section', time: 900, type: 'reading-passage' },
  { id: 'listening', name: 'Listening Section', time: 900, type: 'listening-dialogue' },
  { id: 'speaking', name: 'Speaking Section', time: 300, type: 'speaking-interview' },
  { id: 'writing', name: 'Writing Section (Academic Discussion)', time: 600, type: 'academic-discussion' },
];

export const MockTestView: React.FC = () => {
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(SECTIONS[0].time);
  const [isTestComplete, setIsTestComplete] = useState(false);
  const [sectionScores, setSectionScores] = useState<Record<string, number>>({
    Reading: 24,
    Listening: 25,
    Speaking: 23,
    Writing: 25,
  });

  const currentSection = SECTIONS[currentSectionIndex];

  useEffect(() => {
    if (isTestComplete) return;
    setTimeLeft(currentSection.time);
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleNextSection();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [currentSectionIndex, isTestComplete]);

  const handleNextSection = () => {
    if (currentSectionIndex < SECTIONS.length - 1) {
      setCurrentSectionIndex((prev) => prev + 1);
    } else {
      // Complete mock test
      setIsTestComplete(true);
      // Save practice records for each section
      savePracticeRecord({
        taskType: 'reading-passage',
        taskTitle: 'Full Mock Test - Reading',
        section: 'Reading',
        score: sectionScores.Reading,
        maxScore: 30,
        scaledScore30: sectionScores.Reading,
        timeSpentSeconds: 900,
        feedbackSummary: `Mock Test Reading Score: ${sectionScores.Reading}/30`,
      });
      savePracticeRecord({
        taskType: 'listening-dialogue',
        taskTitle: 'Full Mock Test - Listening',
        section: 'Listening',
        score: sectionScores.Listening,
        maxScore: 30,
        scaledScore30: sectionScores.Listening,
        timeSpentSeconds: 900,
        feedbackSummary: `Mock Test Listening Score: ${sectionScores.Listening}/30`,
      });
      savePracticeRecord({
        taskType: 'speaking-interview',
        taskTitle: 'Full Mock Test - Speaking',
        section: 'Speaking',
        score: sectionScores.Speaking,
        maxScore: 30,
        scaledScore30: sectionScores.Speaking,
        timeSpentSeconds: 300,
        feedbackSummary: `Mock Test Speaking Score: ${sectionScores.Speaking}/30`,
      });
      savePracticeRecord({
        taskType: 'academic-discussion',
        taskTitle: 'Full Mock Test - Writing',
        section: 'Writing',
        score: sectionScores.Writing,
        maxScore: 30,
        scaledScore30: sectionScores.Writing,
        timeSpentSeconds: 600,
        feedbackSummary: `Mock Test Writing Score: ${sectionScores.Writing}/30`,
      });
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (isTestComplete) {
    const totalScore = sectionScores.Reading + sectionScores.Listening + sectionScores.Speaking + sectionScores.Writing;
    const est = calculateToeflEstimate([
      { id: '1', taskType: 'reading', taskTitle: 'Mock', section: 'Reading', date: '', score: 24, maxScore: 30, scaledScore30: sectionScores.Reading, timeSpentSeconds: 0 },
      { id: '2', taskType: 'listening', taskTitle: 'Mock', section: 'Listening', date: '', score: 25, maxScore: 30, scaledScore30: sectionScores.Listening, timeSpentSeconds: 0 },
      { id: '3', taskType: 'speaking', taskTitle: 'Mock', section: 'Speaking', date: '', score: 23, maxScore: 30, scaledScore30: sectionScores.Speaking, timeSpentSeconds: 0 },
      { id: '4', taskType: 'writing', taskTitle: 'Mock', section: 'Writing', date: '', score: 25, maxScore: 30, scaledScore30: sectionScores.Writing, timeSpentSeconds: 0 },
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
            onClick={() => {
              setIsTestComplete(false);
              setCurrentSectionIndex(0);
            }}
            className="px-6 py-2.5 text-sm font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-lg transition-colors"
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
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors"
          >
            <span>{currentSectionIndex === SECTIONS.length - 1 ? 'Finish & View Report' : 'Next Section'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Render Active Section Component */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs">
        {currentSectionIndex === 0 && (
          <ReadingPassageView task={CURATED_READING_PASSAGES[0] as ReadingPassageTask} onNextTask={handleNextSection} />
        )}
        {currentSectionIndex === 1 && (
          <ListeningDialogueView task={CURATED_LISTENING[0] as ListeningTask} onNextTask={handleNextSection} />
        )}
        {currentSectionIndex === 2 && (
          <SpeakingInterviewView task={CURATED_SPEAKING_INTERVIEWS[0] as SpeakingInterviewTask} onNextTask={handleNextSection} />
        )}
        {currentSectionIndex === 3 && (
          <AcademicDiscussionView task={CURATED_ACADEMIC_DISCUSSIONS[0] as AcademicDiscussionTask} onNextTask={handleNextSection} />
        )}
      </div>
    </div>
  );
};
