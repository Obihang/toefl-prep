import { parseDialogueLine } from '../../utils/voices';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ListeningTask } from '../../data/curatedQuestions';
import { Play, Pause, RotateCcw, Volume2, Eye, EyeOff, CheckCircle2, ArrowRight, AlertCircle } from 'lucide-react';
import {
  playDialogue,
  stopSpeaking,
  prefetchSpeechAudio,
  stripSpeakerAndFormatting,
  pickRandomVoice,
  inferGenderFromSpeaker,
  speakWithCloudTTS,
  chunkTextForTTS,
  fetchCloudTtsAudio,
} from '../../utils/audioSpeech';
import { convertToScaledScore, convertScaledToBand6, savePracticeRecord } from '../../utils/scoreTracker';
import { auth } from '../../firebase';
import { saveMistake } from '../../utils/mistakes';

interface Props {
  task: ListeningTask;
  onNextTask?: () => void;
  onComplete?: (result: number) => void;
}

type CanonicalSpeakerRole = 'professor' | 'student';

function classifyCanonicalRole(
  rawSpeakerLabel: string,
  lineIndex: number,
  labelA: string,
  labelB: string
): CanonicalSpeakerRole {
  const s = (rawSpeakerLabel || '').trim().toLowerCase();
  const a = (labelA || '').trim().toLowerCase();
  const b = (labelB || '').trim().toLowerCase();

  // Direct match against explicit student keywords
  if (/\b(student|undergraduate|grad student|classmate|peer|speaker\s*b|^b$)\b/i.test(s)) {
    return 'student';
  }
  // Direct match against explicit professor/staff/authority keywords
  if (
    /\b(professor|prof\.?|advisor|librarian|instructor|doctor|dr\.?|staff|dean|coordinator|director|coach|assistant|receptionist|narrator|lecturer|speaker\s*a|^a$)\b/i.test(
      s
    )
  ) {
    return 'professor';
  }

  // Match against task.speakers.A / B if provided
  if (s && b && (s === b || s.includes(b) || b.includes(s))) {
    if (/\b(professor|prof\.?|advisor|librarian|instructor|doctor|dr\.?|staff|dean)\b/i.test(b)) {
      return 'professor';
    }
    return 'student';
  }
  if (s && a && (s === a || s.includes(a) || a.includes(s))) {
    if (/\b(student|undergraduate)\b/i.test(a)) {
      return 'student';
    }
    return 'professor';
  }

  // Fallback by alternating turn order
  return lineIndex % 2 === 0 ? 'professor' : 'student';
}

export const ListeningDialogueView: React.FC<Props> = ({ task, onNextTask, onComplete }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [playCount, setPlayCount] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const playbackSessionIdRef = useRef<number>(0);
  const isPausedRef = useRef<boolean>(false);

  const scriptText = task?.script || '';
  const lines = useMemo(() => scriptText.split(/\n+/).filter(Boolean), [scriptText]);

  // Assign strictly locked voices per canonical speaker role ('professor' vs 'student') once when the task loads:
  // - Conversations: ONE locked voiceId+gender for 'professor' and ONE distinct locked voiceId+gender for 'student'
  // - Announcements / Academic Talks (Lectures): ONE consistent voiceId+gender for the entire passage
  const dialogueVoices = useMemo(() => {
    const taskSubType = String((task as any).type || '').toLowerCase();
    const isSingleSpeakerPassage =
      taskSubType === 'announcement' ||
      taskSubType === 'academic_talk' ||
      taskSubType === 'lecture' ||
      (lines.length <= 2 && !/speaker b|^b:|student:/im.test(scriptText));

    const labelA = task.speakers?.A || '';
    const labelB = task.speakers?.B || '';

    if (isSingleSpeakerPassage) {
      const inferred =
        inferGenderFromSpeaker(`${labelA} ${task.context || ''} ${scriptText.slice(0, 160)}`) ||
        ((task as any).speakerGenderA as 'male' | 'female' | undefined) ||
        ((task as any).speakerGenders?.A as 'male' | 'female' | undefined);
      const singleVoice = pickRandomVoice(inferred || undefined);
      return {
        isSingleSpeaker: true,
        professor: singleVoice,
        student: singleVoice,
        A: singleVoice,
        B: singleVoice,
      };
    }

    // Collect all speaker labels across turns that map to 'professor' vs 'student' to infer gender accurately
    const profLabels: string[] = [];
    const studentLabels: string[] = [];
    if (classifyCanonicalRole(labelA, 0, labelA, labelB) === 'professor') {
      profLabels.push(labelA);
    } else {
      studentLabels.push(labelA);
    }
    if (classifyCanonicalRole(labelB, 1, labelA, labelB) === 'student') {
      studentLabels.push(labelB);
    } else {
      profLabels.push(labelB);
    }

    lines.forEach((line, idx) => {
      const parsed = parseDialogueLine(line);
      if (parsed.speakerName) {
        const role = classifyCanonicalRole(parsed.speakerName, idx, labelA, labelB);
        if (role === 'professor') profLabels.push(parsed.speakerName);
        else studentLabels.push(parsed.speakerName);
      }
    });

    const explicitGA = (task as any).speakerGenderA || (task as any).speakerGenders?.A;
    const explicitGB = (task as any).speakerGenderB || (task as any).speakerGenders?.B;

    const inferredProfGender =
      explicitGA === 'male' || explicitGA === 'female'
        ? explicitGA
        : inferGenderFromSpeaker(`${profLabels.join(' ')} ${task.context || ''}`);
    const inferredStudentGender =
      explicitGB === 'male' || explicitGB === 'female'
        ? explicitGB
        : inferGenderFromSpeaker(studentLabels.join(' '));

    const profVoice = pickRandomVoice(inferredProfGender || undefined);
    const targetStudentGender: 'male' | 'female' =
      inferredStudentGender || (profVoice.gender === 'male' ? 'female' : 'male');
    const studentVoice = pickRandomVoice(targetStudentGender, profVoice.voiceId);

    return {
      isSingleSpeaker: false,
      professor: profVoice,
      student: studentVoice,
      A: profVoice,
      B: studentVoice,
    };
  }, [task.id, task.title, scriptText, lines.length]);

  const dialogueLines = useMemo(() => {
    const labelA = task.speakers?.A || 'Professor';
    const labelB = task.speakers?.B || 'Student';

    return lines.map((line, idx) => {
      const parsed = parseDialogueLine(line);
      const rawSpeaker = parsed.speakerName || '';
      const spokenText = parsed.spokenText || stripSpeakerAndFormatting(line);

      if (dialogueVoices.isSingleSpeaker) {
        return {
          rawLine: line,
          spokenText,
          role: 'professor' as CanonicalSpeakerRole,
          gender: dialogueVoices.professor.gender,
          voiceId: dialogueVoices.professor.voiceId,
          speakerName: rawSpeaker || labelA || 'Narrator',
        };
      }

      const role = classifyCanonicalRole(rawSpeaker, idx, labelA, labelB);
      const lockedVoice =
        role === 'student' ? dialogueVoices.student : dialogueVoices.professor;
      const defaultDisplayName = role === 'student' ? labelB : labelA;

      return {
        rawLine: line,
        spokenText,
        role,
        gender: lockedVoice.gender,
        voiceId: lockedVoice.voiceId,
        speakerName: rawSpeaker || defaultDisplayName,
      };
    });
  }, [lines, dialogueVoices, task.speakers]);

  const voices = useMemo(
    () => ({
      A: dialogueVoices.professor.voiceId,
      B: dialogueVoices.student.voiceId,
    }),
    [dialogueVoices]
  );

  const stopAllAudio = useCallback(() => {
    playbackSessionIdRef.current++;
    isPausedRef.current = true;
    if (activeAudioRef.current) {
      try {
        activeAudioRef.current.pause();
        activeAudioRef.current.currentTime = 0;
        activeAudioRef.current.src = '';
      } catch {}
      activeAudioRef.current = null;
    }
    stopSpeaking();
  }, []);

  useEffect(() => {
    if (dialogueLines.length === 0) return;
    let cancelled = false;

    // 1. Immediately pre-warm the very first chunk of Turn 0 so Play starts with 0ms delay
    const firstTurn = dialogueLines[0];
    if (firstTurn?.spokenText) {
      const firstChunks = chunkTextForTTS(firstTurn.spokenText);
      if (firstChunks.length > 0) {
        fetchCloudTtsAudio(firstChunks[0], firstTurn.gender, firstTurn.voiceId).catch(() => {});
      }
    }

    // 2. Pre-warm all dialogue lines in order using their strictly locked voiceId and gender
    (async () => {
      for (const turn of dialogueLines) {
        if (cancelled) break;
        if (!turn.spokenText) continue;
        await prefetchSpeechAudio(turn.spokenText, turn.voiceId, turn.gender).catch(() => {});
      }
    })();

    return () => {
      cancelled = true;
      stopAllAudio();
    };
  }, [dialogueLines, stopAllAudio]);

  const startPlayback = async () => {
    stopAllAudio();
    const currentSession = ++playbackSessionIdRef.current;
    isPausedRef.current = false;
    setIsPlaying(true);
    setPlayCount((prev) => prev + 1);
    setActiveLine(0);

    try {
      const audioClips = (task as any).audioClips;
      const audioUrl = (task as any).audioUrl;

      // 1. Play saved audioClips if present
      if (Array.isArray(audioClips) && audioClips.length > 0) {
        for (let i = 0; i < audioClips.length; i++) {
          if (playbackSessionIdRef.current !== currentSession || isPausedRef.current) break;
          setActiveLine(i);
          const clipUrl = audioClips[i].url;
          if (clipUrl) {
            await new Promise<void>((resolve) => {
              if (playbackSessionIdRef.current !== currentSession || isPausedRef.current) {
                resolve();
                return;
              }
              const audio = new Audio(clipUrl);
              activeAudioRef.current = audio;
              audio.playbackRate = 1.0;
              audio.onended = () => {
                if (activeAudioRef.current === audio) activeAudioRef.current = null;
                resolve();
              };
              audio.onerror = () => {
                if (activeAudioRef.current === audio) activeAudioRef.current = null;
                resolve();
              };
              audio.play().catch(() => {
                if (activeAudioRef.current === audio) activeAudioRef.current = null;
                resolve();
              });
            });
          }
          if (playbackSessionIdRef.current !== currentSession || isPausedRef.current) break;
        }
      } else if (audioUrl && audioUrl.startsWith('https://') && audioUrl.includes('blob.vercel-storage.com')) {
        // 2. Play single audioUrl if present
        await new Promise<void>((resolve) => {
          if (playbackSessionIdRef.current !== currentSession || isPausedRef.current) {
            resolve();
            return;
          }
          const audio = new Audio(audioUrl);
          activeAudioRef.current = audio;
          audio.onended = () => {
            if (activeAudioRef.current === audio) activeAudioRef.current = null;
            resolve();
          };
          audio.onerror = () => {
            if (activeAudioRef.current === audio) activeAudioRef.current = null;
            resolve();
          };
          audio.play().catch(() => {
            if (activeAudioRef.current === audio) activeAudioRef.current = null;
            resolve();
          });
        });
      } else {
        // 3. Play each turn through cached speakWithCloudTTS using the strictly locked voiceId per role
        try {
          for (let i = 0; i < dialogueLines.length; i++) {
            if (playbackSessionIdRef.current !== currentSession || isPausedRef.current) break;
            setActiveLine(i);
            const turn = dialogueLines[i];
            if (!turn.spokenText) continue;

            // Pre-warm the next turn's first chunk in parallel while this turn plays
            if (i + 1 < dialogueLines.length && dialogueLines[i + 1].spokenText) {
              const nextTurn = dialogueLines[i + 1];
              const nextChunks = chunkTextForTTS(nextTurn.spokenText);
              if (nextChunks.length > 0) {
                fetchCloudTtsAudio(nextChunks[0], nextTurn.gender, nextTurn.voiceId).catch(
                  () => {}
                );
              }
            }

            await speakWithCloudTTS(
              turn.spokenText,
              turn.gender,
              {
                voice: turn.voiceId,
                voiceName: turn.voiceId,
                gender: turn.gender,
                speaker: turn.speakerName,
                skipStop: true,
              },
              turn.voiceId
            );

            if (playbackSessionIdRef.current !== currentSession || isPausedRef.current) break;
          }
        } catch (ttsErr) {
          console.warn('TTS playback failed, falling back to playDialogue:', ttsErr);
          await playDialogue(
            lines,
            voices,
            (idx) => {
              setActiveLine(idx);
            }
          );
        }
      }
    } catch {
      // Audio completed or stopped
    } finally {
      if (playbackSessionIdRef.current === currentSession) {
        setIsPlaying(false);
        setActiveLine(null);
      }
    }
  };

  const handlePauseAudio = () => {
    isPausedRef.current = true;
    playbackSessionIdRef.current++;
    if (activeAudioRef.current) {
      try {
        activeAudioRef.current.pause();
      } catch {}
      activeAudioRef.current = null;
    }
    stopSpeaking();
    setIsPlaying(false);
    setActiveLine(null);
  };

  const handleRestartAudio = () => {
    stopAllAudio();
    setIsPlaying(false);
    setActiveLine(null);
    startPlayback();
  };

  const handleSelectOption = (qIdx: number, optIdx: number) => {
    if (submitted) return;
    setSelectedAnswers((prev) => ({ ...prev, [qIdx]: optIdx }));
  };

  const calculateScore = () => {
    let correct = 0;
    task.questions.forEach((q, i) => {
      if (selectedAnswers[i] === q.answer) correct++;
    });
    return correct;
  };

  const handleSubmit = () => {
    setSubmitted(true);
    const correctCount = calculateScore();
    const total = task.questions.length;
    const scaledScore = convertToScaledScore(correctCount, total);

    if (auth.currentUser) {
      task.questions.forEach((q, i) => {
        if (selectedAnswers[i] !== q.answer) {
          saveMistake(
            task.title,
            'listening-dialogue',
            q.options[selectedAnswers[i]] ?? 'No answer',
            q.options[q.answer],
            q.why
          );
        }
      });
    }

    savePracticeRecord({
      taskType: 'listening-dialogue',
      taskTitle: task.title,
      section: 'Listening',
      score: correctCount,
      maxScore: total,
      scaledScore30: scaledScore,
      timeSpentSeconds: 150,
      feedbackSummary: `Listening comprehension: scored ${correctCount}/${total} (${Math.round((correctCount / total) * 100)}%)`,
    });
    onComplete?.(scaledScore);
  };

  const handleReset = () => {
    setSelectedAnswers({});
    setSubmitted(false);
  };

  const score = submitted ? calculateScore() : 0;
  const total = task.questions.length;
  const allAnswered = task.questions.every((_, i) => selectedAnswers[i] !== undefined);

  const missedIndices = React.useMemo(() => {
    if (!submitted) return [];
    return task.questions
      .map((q, i) => (selectedAnswers[i] !== q.answer ? i : -1))
      .filter((i) => i !== -1);
  }, [submitted, selectedAnswers, task.questions]);

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">{task.title}</h2>
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 flex-wrap">
            <span>Listening Section</span>
            <span aria-hidden="true">·</span>
            <span>Academic Dialogue & Lecture</span>
            <span aria-hidden="true">·</span>
            <span>{((task as any).source === 'ai') ? `✨ Generated by @${(task as any).generatedBy || 'Scholar'}` : '📚 Curated Bank'}</span>
            <span aria-hidden="true">·</span>
            <span>{task.questions.length} Questions</span>
            <span aria-hidden="true">·</span>
            <span className="capitalize">{task.level}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>Plays: <strong className="font-mono text-slate-800">{playCount}</strong></span>
          <span aria-hidden="true">·</span>
          <span>(TOEFL allows 1 play)</span>
        </div>
      </div>

      {/* Audio Player Deck */}
      <div className="bg-slate-900 text-white rounded-xl p-6 shadow-md">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-medium tracking-wider text-teal-400">Audio Track</span>
              <span className="text-xs text-slate-400">· {task.context}</span>
            </div>
            <div className="text-sm text-slate-300">
              Speakers: <strong className="text-slate-100">{task.speakers.A}</strong> & <strong className="text-slate-100">{task.speakers.B}</strong>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2.5">
            {/* Primary Play / Pause Button */}
            <button
              onClick={isPlaying ? handlePauseAudio : startPlayback}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-xs whitespace-nowrap shrink-0 ${
                isPlaying
                  ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 ring-2 ring-amber-300'
                  : 'bg-teal-500 hover:bg-teal-400 text-slate-950'
              }`}
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
              {isPlaying ? 'Pause Audio' : 'Play Audio'}
            </button>

            {/* Separate, Dedicated Restart Button */}
            <button
              onClick={handleRestartAudio}
              className="flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 active:bg-slate-900 rounded-lg transition-colors whitespace-nowrap shrink-0 border border-slate-700 shadow-xs"
              title="Restart dialogue from the beginning"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restart</span>
            </button>

            {/* Transcript Toggle Button */}
            <button
              onClick={() => setShowTranscript(!showTranscript)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 border border-slate-700/60"
              title="Toggle transcript text"
            >
              {showTranscript ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showTranscript ? 'Hide Script' : 'Show Script'}
            </button>
          </div>
        </div>

        {/* Animated Waveform Visualizer */}
        <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Volume2 className={`w-4 h-4 ${isPlaying ? 'text-teal-400' : playCount > 0 ? 'text-amber-400' : 'text-slate-500'}`} />
            <span className="text-xs font-mono text-slate-300">
              {isPlaying
                ? `Playing Line ${(activeLine ?? 0) + 1} of ${lines.length}...`
                : playCount > 0
                ? 'Audio Paused (click Play or Restart)'
                : `Audio Ready (${lines.length} lines)`}
            </span>
          </div>

          <div className="flex items-end gap-1 h-6">
            {[4, 12, 8, 16, 22, 14, 9, 20, 15, 6, 18, 11, 24, 17, 8, 14, 5].map((h, i) => (
              <div
                key={i}
                className={`w-1 rounded-full transition-all duration-150 ${
                  isPlaying ? 'bg-teal-400 animate-pulse' : 'bg-slate-700'
                }`}
                style={{
                  height: isPlaying ? `${Math.max(4, (h * (i % 2 === 0 ? 1 : 0.7)))}px` : '4px',
                  animationDelay: `${i * 70}ms`,
                }}
              />
            ))}
          </div>
        </div>

        {/* Optional Transcript */}
        {showTranscript && (
          <div className="mt-4 pt-4 border-t border-slate-800 bg-slate-950/60 rounded-lg p-4 space-y-2.5 max-h-56 overflow-y-auto text-xs sm:text-sm">
            {lines.map((line, idx) => {
              const parsed = parseDialogueLine(line);
              const isSpeakerB =
                (parsed.speakerName && (parsed.speakerName.toLowerCase().includes('student') || parsed.speakerName.toLowerCase() === (task.speakers?.B || '').toLowerCase())) ||
                line.startsWith('Speaker B:') ||
                line.startsWith('B:') ||
                line.toLowerCase().startsWith('student:') ||
                idx % 2 === 1;
              const isCurrent = activeLine === idx;
              const speakerLabel = parsed.speakerName || (isSpeakerB ? task.speakers.B : task.speakers.A);
              const spokenText = parsed.spokenText || line.replace(/^(Speaker [AB]:|[AB]:|Professor.*?:|Student.*?:)\s*/i, '');

              return (
                <div
                  key={idx}
                  className={`p-2 rounded transition-colors ${
                    isCurrent
                      ? 'bg-teal-900/40 text-teal-200 border-l-2 border-teal-400'
                      : 'text-slate-300'
                  }`}
                >
                  <strong className={isSpeakerB ? 'text-cyan-400' : 'text-emerald-400'}>
                    {speakerLabel}:
                  </strong>{' '}
                  <span>{spokenText}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Comprehension Questions */}
      <div className="space-y-5">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Listening Comprehension</span>
          <span className="text-xs text-slate-500 font-mono">
            {Object.keys(selectedAnswers).length}/{total} Answered
          </span>
        </div>

        {task.questions.map((q, qIdx) => {
          const userChoice = selectedAnswers[qIdx];
          const isCorrect = userChoice === q.answer;

          return (
            <div
              key={qIdx}
              id={`lis-question-${qIdx}`}
              className={`bg-white border rounded-xl p-5 shadow-xs transition-colors ${
                submitted
                  ? isCorrect
                    ? 'border-emerald-200 bg-emerald-50/20'
                    : 'border-rose-200 bg-rose-50/20'
                  : 'border-slate-200'
              }`}
            >
              <div className="flex items-start gap-2.5 mb-3.5">
                <span className="flex items-center justify-center w-6 h-6 rounded-md bg-slate-100 text-slate-700 text-xs font-semibold shrink-0">
                  {qIdx + 1}
                </span>
                <p className="text-sm font-semibold text-slate-900 leading-snug">{q.q}</p>
              </div>

              <div className="space-y-2">
                {q.options.map((opt, optIdx) => {
                  const isSelected = userChoice === optIdx;
                  const isRightOption = q.answer === optIdx;

                  let optionClasses =
                    'border-slate-200 bg-slate-50/50 hover:bg-slate-100/70 text-slate-800';

                  if (submitted) {
                    if (isRightOption) {
                      optionClasses = 'border-emerald-500 bg-emerald-50 text-emerald-900 font-medium';
                    } else if (isSelected && !isRightOption) {
                      optionClasses = 'border-rose-400 bg-rose-50 text-rose-900';
                    } else {
                      optionClasses = 'border-slate-200 bg-white text-slate-400 opacity-60';
                    }
                  } else if (isSelected) {
                    optionClasses =
                      'border-teal-600 bg-teal-50/60 text-teal-950 ring-1 ring-teal-600 font-medium';
                  }

                  return (
                    <label
                      key={optIdx}
                      onClick={() => handleSelectOption(qIdx, optIdx)}
                      className={`flex items-start gap-3 p-3 rounded-lg border text-xs sm:text-sm cursor-pointer transition-all ${optionClasses}`}
                    >
                      <input
                        type="radio"
                        name={`lis-q-${qIdx}`}
                        checked={isSelected}
                        disabled={submitted}
                        onChange={() => handleSelectOption(qIdx, optIdx)}
                        className="mt-0.5 text-teal-700 focus:ring-teal-500 shrink-0"
                      />
                      <span className="leading-snug">{opt}</span>
                    </label>
                  );
                })}
              </div>

              {submitted && (
                <div className="mt-3.5 pt-3 border-t border-slate-200/80 text-xs leading-relaxed">
                  <strong className={isCorrect ? 'text-emerald-700' : 'text-slate-800'}>
                    {isCorrect ? 'Correct!' : 'Official Explanation:'}
                  </strong>{' '}
                  <span className="text-slate-700">{q.why}</span>
                </div>
              )}
            </div>
          );
        })}

        {/* Footer controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          {!submitted ? (
            <button
              onClick={handleSubmit}
              disabled={!allAnswered}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 disabled:hover:bg-teal-700 rounded-lg shadow-xs transition-colors whitespace-nowrap"
            >
              <CheckCircle2 className="w-4 h-4" />
              Check Listening Answers
            </button>
          ) : (
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-4 h-4" />
                Retake
              </button>
              {submitted && missedIndices.length > 0 && (
                <button
                  onClick={() => {
                    const firstMissed = document.getElementById(`lis-question-${missedIndices[0]}`);
                    firstMissed?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <AlertCircle className="w-4 h-4" />
                  Review Mistakes
                </button>
              )}
              {onNextTask && (
                <button
                  onClick={onNextTask}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  Next Listening Track
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {submitted && (
            <div className="flex items-center gap-3 text-xs sm:text-sm bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-lg">
              <span>
                Score: <strong className="font-mono text-slate-900">{score}</strong>/{total}
              </span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span>
                Est. Scaled: <strong className="font-mono text-teal-800">Band {convertScaledToBand6(convertToScaledScore(score, total)).toFixed(1)} / 6.0</strong> <span className="font-mono text-slate-500 text-xs">({convertToScaledScore(score, total)}/30)</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
