import React, { useState, useEffect, useRef } from 'react';
import { SpeakingInterviewTask, InterviewQuestionItem } from '../../data/curatedQuestions';
import { Volume2, Mic, MicOff, Play, Pause, Sparkles, AlertCircle, ArrowRight, Clock, Loader2 } from 'lucide-react';
import { speakScriptLine, createVoiceSession, VoiceSession, playChime } from '../../utils/audioSpeech';
import { savePracticeRecord } from '../../utils/scoreTracker';
import { getApiHeaders } from '../../utils/apiKey';

interface Props {
  task: SpeakingInterviewTask;
  onNextTask?: () => void;
  onComplete?: (result: number) => void;
  onOpenApiKeySettings?: () => void;
}

export const SpeakingInterviewView: React.FC<Props> = ({ task, onNextTask, onComplete, onOpenApiKeySettings }) => {
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [timerMode, setTimerMode] = useState<'idle' | 'prep' | 'speaking'>('idle');
  const [timeLeft, setTimeLeft] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<any>(null);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [audioBlobs, setAudioBlobs] = useState<Record<number, Blob>>({});

  const voiceSessionRef = useRef<VoiceSession | null>(null);
  const timerIntervalRef = useRef<any>(null);

  const currentQ: InterviewQuestionItem = task.questions[currentQIndex];

  // Stop audio/timers/voice session on unmount
  useEffect(() => {
    return () => {
      clearInterval(timerIntervalRef.current);
      if (voiceSessionRef.current) {
        voiceSessionRef.current.abort();
      }
    };
  }, []);

  const handleHearQuestion = () => {
    speakScriptLine(currentQ.question, { rate: 0.95 });
  };

  // Start Official TOEFL Test Simulation for current question
  const startSimulation = () => {
    clearInterval(timerIntervalRef.current);
    if (voiceSessionRef.current) {
      voiceSessionRef.current.abort();
      voiceSessionRef.current = null;
    }
    setIsRecording(false);
    setMicNotice(null);

    // 1. Preparation Phase
    setTimerMode('prep');
    setTimeLeft(currentQ.prepTimeSeconds);
    playChime(660, 250);

    let currentSeconds = currentQ.prepTimeSeconds;

    timerIntervalRef.current = setInterval(() => {
      currentSeconds--;
      setTimeLeft(currentSeconds);

      if (currentSeconds <= 0) {
        clearInterval(timerIntervalRef.current);
        // Transition to Speaking phase
        startSpeakingPhase();
      }
    }, 1000);
  };

  const startSpeakingPhase = async () => {
    setTimerMode('speaking');
    setTimeLeft(currentQ.responseTimeSeconds);
    playChime(880, 400); // Higher tone starts recording

    const session = createVoiceSession({
      onTranscriptUpdate: (transcript) => {
        setAnswers((prev) => ({
          ...prev,
          [currentQIndex]: transcript,
        }));
      },
      onStatusChange: (status, errorMsg) => {
        if (status === 'listening') setIsRecording(true);
        if (status === 'processing') setIsTranscribing(true);
        if (status === 'idle') {
          setIsRecording(false);
          setIsTranscribing(false);
        }
        if (status === 'error') {
          setIsRecording(false);
          setIsTranscribing(false);
          if (errorMsg) setMicNotice(errorMsg);
        }
      },
    });

    voiceSessionRef.current = session;

    try {
      await session.start();
    } catch (err: any) {
      setIsRecording(false);
      setMicNotice(err.message || 'Could not start microphone');
    }

    let speakingSeconds = currentQ.responseTimeSeconds;
    timerIntervalRef.current = setInterval(async () => {
      speakingSeconds--;
      setTimeLeft(speakingSeconds);

      if (speakingSeconds <= 0) {
        clearInterval(timerIntervalRef.current);
        await stopSimulation();
      }
    }, 1000);
  };

  const stopSimulation = async () => {
    clearInterval(timerIntervalRef.current);
    if (voiceSessionRef.current) {
      setIsTranscribing(true);
      try {
        const result = await voiceSessionRef.current.stop();
        if (result.transcript) {
          setAnswers((prev) => ({
            ...prev,
            [currentQIndex]: result.transcript,
          }));
          if (result.audioBlob) {
            setAudioBlobs((prev) => ({
              ...prev,
              [currentQIndex]: result.audioBlob!,
            }));
          }
        }
      } catch (err: any) {
        console.warn('Voice session stop error:', err);
      } finally {
        voiceSessionRef.current = null;
        setIsTranscribing(false);
      }
    }
    setIsRecording(false);
    setTimerMode('idle');
    playChime(440, 500); // Beep ends
  };

  const handleManualMicToggle = async () => {
    setMicNotice(null);

    if (isRecording && voiceSessionRef.current) {
      setIsTranscribing(true);
      try {
        const result = await voiceSessionRef.current.stop();
        if (result.transcript) {
          setAnswers((prev) => ({
            ...prev,
            [currentQIndex]: result.transcript,
          }));
          if (result.audioBlob) {
            setAudioBlobs((prev) => ({
              ...prev,
              [currentQIndex]: result.audioBlob!,
            }));
          }
        }
      } catch (err: any) {
        setMicNotice(err.message || 'Failed to process voice recording');
      } finally {
        voiceSessionRef.current = null;
        setIsRecording(false);
        setIsTranscribing(false);
      }
      return;
    }

    const session = createVoiceSession({
      onTranscriptUpdate: (transcript) => {
        setAnswers((prev) => ({
          ...prev,
          [currentQIndex]: transcript,
        }));
      },
      onStatusChange: (status, errorMsg) => {
        if (status === 'listening') setIsRecording(true);
        if (status === 'processing') setIsTranscribing(true);
        if (status === 'idle') {
          setIsRecording(false);
          setIsTranscribing(false);
        }
        if (status === 'error') {
          setIsRecording(false);
          setIsTranscribing(false);
          if (errorMsg) setMicNotice(errorMsg);
        }
      },
    });

    voiceSessionRef.current = session;

    try {
      await session.start();
    } catch (err: any) {
      voiceSessionRef.current = null;
      setIsRecording(false);
      setMicNotice(err.message || 'Microphone could not be accessed. You can type your response.');
    }
  };

  const handleEvaluateAI = async () => {
    const hasAnyAnswer = Object.values(answers).some((a) => a.trim().length > 0);
    if (!hasAnyAnswer) {
      setEvalError('Please provide a spoken or typed response to at least one question before requesting AI evaluation.');
      return;
    }

    setIsEvaluating(true);
    setEvalError(null);

    const submissionData = task.questions.map((q, i) => {
      const response = answers[i] || '';
      const fillerWords = ['um', 'uh', 'like', 'er', 'ah', 'actually', 'basically'];
      const words = response.toLowerCase().match(/\b\w+\b/g) || [];
      const fillerCount = words.filter(w => fillerWords.includes(w)).length;
      const wordCount = words.length;
      // Estimate WPM based on 45s default response time if specific question time not available
      const timeInMinutes = (q.responseTimeSeconds || 45) / 60;
      const wpm = timeInMinutes > 0 ? Math.round(wordCount / timeInMinutes) : 0;
      
      return {
        question: q.question,
        studentResponse: response,
        fillerCount,
        wpm
      };
    });

    try {
      const res = await fetch('/api/evaluate-response', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({
          taskType: 'speaking-interview',
          promptData: {
            title: task.title,
            context: task.context,
            questions: task.questions.map((q) => q.question),
          },
          studentResponse: submissionData,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Evaluation service unavailable');
      }

      setEvaluationResult({ ...json.data, submissionData });

      const scaled = json.data.scaledScore || 24;
      const band6 = json.data.bandScore6 ?? (scaled >= 29 ? 6.0 : scaled >= 26 ? 5.5 : scaled >= 23 ? 5.0 : scaled >= 20 ? 4.5 : scaled >= 17 ? 4.0 : 3.5);

      savePracticeRecord({
        taskType: 'speaking-interview',
        taskTitle: task.title,
        section: 'Speaking',
        score: scaled,
        maxScore: 30,
        scaledScore30: scaled,
        bandScore6: band6,
        timeSpentSeconds: 240,
        feedbackSummary: `Speaking Interview: Band ${band6.toFixed(1)}/6.0 · Raw Rubric: ${json.data.rawRubricScore ?? json.data.bandScore}/4.0 (${json.data.performanceLevel})`,
      });

      onComplete?.(scaled);
    } catch (err: any) {
      setEvalError(err.message || 'Failed to connect to AI evaluator');
    } finally {
      setIsEvaluating(false);
    }
  };

  const currentAnswer = answers[currentQIndex] || '';

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">{task.title}</h2>
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
            <span>Speaking Section</span>
            <span aria-hidden="true">·</span>
            <span>Take an Interview</span>
            <span aria-hidden="true">·</span>
            <span>4 Questions</span>
            <span aria-hidden="true">·</span>
            <span className="capitalize">{task.level}</span>
          </div>
        </div>

        {/* Question selector tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg">
          {task.questions.map((_, i) => (
            <button
              key={i}
              onClick={() => {
                stopSimulation();
                setCurrentQIndex(i);
              }}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                currentQIndex === i
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Q{i + 1}
              {answers[i]?.trim() && <span className="ml-1 text-teal-600">✓</span>}
            </button>
          ))}
        </div>
      </div>

      {micNotice && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-xs text-amber-900 animate-in fade-in">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong className="font-semibold block mb-0.5">Microphone Notice</strong>
            <span>{micNotice}</span>
          </div>
          <button
            onClick={() => setMicNotice(null)}
            className="text-amber-700 hover:text-amber-900 text-xs font-semibold px-2 py-1 rounded-md hover:bg-amber-100 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Question Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <span className="text-xs font-semibold text-teal-700 uppercase tracking-wider">
              Question {currentQIndex + 1} of {task.questions.length}
            </span>
            <h3 className="text-base sm:text-lg font-semibold text-slate-900 leading-snug">
              {currentQ.question}
            </h3>
          </div>

          <button
            onClick={handleHearQuestion}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            <Volume2 className="w-3.5 h-3.5 text-teal-700" />
            Hear Audio
          </button>
        </div>

        {/* Timing simulation bar */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-xs text-slate-600">
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Prep: <strong className="font-mono text-slate-800">{currentQ.prepTimeSeconds}s</strong></span>
            </div>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <div>
              <span>Response: <strong className="font-mono text-slate-800">{currentQ.responseTimeSeconds}s</strong></span>
            </div>
          </div>

          {timerMode === 'idle' ? (
            <button
              onClick={startSimulation}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5" />
              Start Official Timed Response
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div
                className={`px-3 py-1 text-xs font-mono font-bold rounded-md ${
                  timerMode === 'prep'
                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                    : 'bg-rose-100 text-rose-900 border border-rose-300 animate-pulse'
                }`}
              >
                {timerMode === 'prep' ? `PREPARATION: ${timeLeft}s` : `RECORDING: ${timeLeft}s`}
              </div>

              <button
                onClick={stopSimulation}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
              >
                <Pause className="w-3 h-3" /> Stop
              </button>
            </div>
          )}
        </div>

        {/* Suggested Talking Points Accordion */}
        <div className="border border-slate-100 bg-slate-50/60 rounded-lg p-3 text-xs">
          <span className="font-semibold text-slate-700">Key Points to Address:</span>
          <ul className="list-disc list-inside mt-1 space-y-0.5 text-slate-600">
            {currentQ.suggestedPoints.map((pt, i) => (
              <li key={i}>{pt}</li>
            ))}
          </ul>
        </div>

        {/* Dictation / Input Box */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Your Spoken Response (Transcript):</span>
            <div className="flex items-center gap-2">
              {audioBlobs[currentQIndex] && (
                <button
                  onClick={() => {
                    const url = URL.createObjectURL(audioBlobs[currentQIndex]);
                    const audio = new Audio(url);
                    audio.play();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100 transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                  Play Answer
                </button>
              )}
              <button
                onClick={handleManualMicToggle}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                  isRecording
                    ? 'bg-rose-600 text-white border-rose-600 animate-pulse'
                    : isTranscribing
                    ? 'bg-slate-100 text-slate-600 border-slate-300'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {isRecording ? (
                  <>
                    <MicOff className="w-3.5 h-3.5" />
                    <span>Stop Speaking</span>
                  </>
                ) : isTranscribing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
                    <span>Transcribing audio...</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-3.5 h-3.5 text-rose-500" />
                    <span>Dictate with Mic</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {isRecording && (
            <div className="flex items-center gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping shrink-0" />
              <span>Microphone active · Speak now. Transcript updates live below.</span>
            </div>
          )}

          <textarea
            rows={4}
            value={currentAnswer}
            disabled={isTranscribing}
            onChange={(e) =>
              setAnswers((prev) => ({
                ...prev,
                [currentQIndex]: e.target.value,
              }))
            }
            placeholder={
              isRecording
                ? 'Listening to your speech...'
                : isTranscribing
                ? 'Processing & transcribing voice recording...'
                : 'Your spoken response will appear here as you speak. You can also edit or type manually...'
            }
            className={`w-full p-3.5 text-sm rounded-lg text-slate-900 outline-hidden leading-relaxed transition-colors ${
              isRecording
                ? 'bg-rose-50/40 border border-rose-300 focus:ring-2 focus:ring-rose-200'
                : 'bg-slate-50 border border-slate-300 focus:bg-white focus:border-teal-600 focus:ring-2 focus:ring-teal-100'
            }`}
          />
          
          {/* Post-answer metrics */}
          {currentAnswer.trim() && !isRecording && !isTranscribing && (
            <div className="flex gap-4 text-xs bg-white border border-slate-200 p-3 rounded-lg text-slate-600">
              {(() => {
                const words = currentAnswer.toLowerCase().match(/\b\w+\b/g) || [];
                const fillerWords = ['um', 'uh', 'like', 'er', 'ah', 'actually', 'basically'];
                const fillerCount = words.filter(w => fillerWords.includes(w)).length;
                const wordCount = words.length;
                const timeInMinutes = (currentQ.responseTimeSeconds || 45) / 60;
                const wpm = timeInMinutes > 0 ? Math.round(wordCount / timeInMinutes) : 0;
                return (
                  <>
                    <div>Fillers: <span className="font-mono font-bold text-amber-700">{fillerCount}</span></div>
                    <div>WPM: <span className="font-mono font-bold text-teal-700">{wpm}</span></div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Global Evaluation Trigger */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">TOEFL Speaking Diagnostic Evaluation</h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Submit your responses across the 4 interview questions to receive official ETS rubric scores, grammar corrections, and an exemplar response.
          </p>
        </div>

        <button
          onClick={handleEvaluateAI}
          disabled={isEvaluating}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg shadow-xs transition-colors whitespace-nowrap shrink-0"
        >
          <Sparkles className="w-4 h-4" />
          {isEvaluating ? 'Evaluating with AI Rater...' : 'Get AI Rater Feedback'}
        </button>
      </div>

      {evalError && (
        evalError.startsWith('No Gemini API key') ? (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-amber-900">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Add your free Gemini API key to use AI features</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
              {onOpenApiKeySettings && (
                <button
                  onClick={onOpenApiKeySettings}
                  className="px-3 py-1.5 bg-teal-800 hover:bg-teal-900 text-white font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Configure API Key
                </button>
              )}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-teal-700 underline hover:text-teal-900 font-medium"
              >
                https://aistudio.google.com/apikey
              </a>
            </div>
          </div>
        ) : (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-center gap-3 text-xs text-rose-800">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{evalError}</span>
          </div>
        )
      )}

      {/* AI Evaluation Diagnostic Card */}
      {evaluationResult && (
        <div className="bg-white border border-teal-200 rounded-xl p-6 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-teal-700">Official ETS Rater Assessment</span>
                <span className="text-xs text-slate-400">·</span>
                <span className="text-xs font-medium text-slate-600">{evaluationResult.performanceLevel}</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mt-1">Speaking Interview Evaluation Report</h3>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="bg-teal-50 border border-teal-200 px-3 py-1.5 rounded-lg text-center">
                <div className="text-[10px] text-teal-700 font-semibold uppercase tracking-wider">TOEFL Band (1-6)</div>
                <div className="text-base font-mono font-bold text-teal-900">
                  Band {(evaluationResult.bandScore6 ?? (evaluationResult.scaledScore >= 29 ? 6.0 : evaluationResult.scaledScore >= 26 ? 5.5 : evaluationResult.scaledScore >= 23 ? 5.0 : evaluationResult.scaledScore >= 20 ? 4.5 : 4.0)).toFixed(1)} / 6.0
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-center">
                <div className="text-[10px] text-slate-500 font-medium">Task Rubric</div>
                <div className="text-base font-mono font-bold text-slate-800">
                  {evaluationResult.rawRubricScore ?? evaluationResult.bandScore} / 4.0
                </div>
              </div>
              <div className="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-center">
                <div className="text-[10px] text-slate-300 font-medium">Scaled Score</div>
                <div className="text-base font-mono font-bold text-teal-400">
                  {evaluationResult.scaledScore} / 30
                </div>
              </div>
            </div>
          </div>

          <div className="text-sm text-slate-700 bg-slate-50 p-4 rounded-lg leading-relaxed">
            {evaluationResult.summary}
          </div>

          {/* Criteria Grid */}
          {evaluationResult.criteria && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {evaluationResult.criteria.map((crit: any, i: number) => (
                <div key={i} className="border border-slate-200 rounded-lg p-3.5 bg-white">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-900">{crit.name}</span>
                    <span className="text-xs font-mono font-bold text-teal-800">{crit.score}</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-snug">{crit.comment}</p>
                </div>
              ))}
            </div>
          )}

          {/* Metrics per Question */}
          {evaluationResult.submissionData && (
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700">Speaking Analytics</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {evaluationResult.submissionData.map((sub: any, i: number) => (
                  <div key={i} className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
                    <div className="font-semibold text-slate-800 mb-1">Q{i+1}: {sub.question.substring(0, 30)}...</div>
                    <div className="flex gap-4 text-slate-600">
                      <div>Fillers: <span className="font-mono font-bold text-amber-700">{sub.fillerCount}</span></div>
                      <div>WPM: <span className="font-mono font-bold text-teal-700">{sub.wpm}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Grammar & Language Corrections */}
          {evaluationResult.corrections && evaluationResult.corrections.length > 0 && (
            <div className="space-y-2.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                Key Language & Syntax Improvements
              </h4>
              <div className="space-y-2">
                {evaluationResult.corrections.map((corr: any, i: number) => (
                  <div key={i} className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-lg text-xs space-y-1">
                    <div className="text-slate-700">
                      <span className="text-rose-700 line-through mr-2">"{corr.original}"</span>
                      <strong className="text-emerald-800">→ "{corr.corrected}"</strong>
                    </div>
                    <div className="text-slate-500 italic">{corr.explanation}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* High-Scoring Model Response */}
          {evaluationResult.exemplar && (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-teal-800">
                High-Scoring Exemplar (Band 4.0 / 30 Scale)
              </h4>
              <div className="bg-teal-50/50 border border-teal-200/70 p-4 rounded-lg text-xs sm:text-sm text-teal-950 leading-relaxed font-normal">
                {evaluationResult.exemplar}
              </div>
            </div>
          )}
        </div>
      )}

      {onNextTask && (
        <div className="pt-2 flex justify-end">
          <button
            onClick={onNextTask}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Next Interview Set
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
