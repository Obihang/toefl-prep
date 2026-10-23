import { pickDialogueVoices, inferGender, parseDialogueLine, detectSpeakerGender, DialogueVoiceManager, assignTaskSpeakerVoices } from '../../utils/voices';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ListeningTask } from '../../data/curatedQuestions';
import { Play, Pause, RotateCcw, Volume2, Eye, EyeOff, CheckCircle2, ArrowRight, AlertCircle } from 'lucide-react';
import { playDialogue, stopSpeaking, prefetchSpeechAudio, stripSpeakerAndFormatting } from '../../utils/audioSpeech';
import { convertToScaledScore, convertScaledToBand6, savePracticeRecord } from '../../utils/scoreTracker';
import { auth, db } from '../../firebase';
import { saveMistake } from '../../utils/mistakes';
import { getAuthHeaders, getApiHeaders } from '../../utils/apiKey';
import { updateDoc, doc } from 'firebase/firestore';

interface Props {
  task: ListeningTask;
  onNextTask?: () => void;
  onComplete?: (result: number) => void;
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
  const lines = scriptText.split(/\n+/).filter(Boolean);

  const seedStr = `${task.title}-${task.script || ''}`;
  const gA = (task as any).speakerGenderA || (task as any).speakerGenders?.A || inferGender(task.speakers?.A || 'A');
  const gB = (task as any).speakerGenderB || (task as any).speakerGenders?.B || inferGender(task.speakers?.B || 'B');
  const voices = pickDialogueVoices(seedStr, gA, gB);

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
    // Silent background pre-synthesis of dialogue lines
    lines.forEach((line, i) => {
      const isA = i % 2 === 0;
      const cleanLine = stripSpeakerAndFormatting(line);
      prefetchSpeechAudio(cleanLine, isA ? voices.A : voices.B).catch(() => {});
    });
    return () => {
      stopAllAudio();
    };
  }, [task.id, task.title, stopAllAudio]);

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
              const spk = audioClips[i]?.speaker || (i % 2 === 0 ? task.speakers?.A : task.speakers?.B) || '';
              const seedString = spk || lines[i]?.slice(0, 20) || '';
              const hash = seedString.split('').reduce((acc: number, char: string) => char.charCodeAt(0) + acc, 0);
              const dynamicRate = 0.92 + ((hash % 100) / 100) * 0.14;
              audio.preservesPitch = false;
              audio.playbackRate = dynamicRate;
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
        // 3. No saved audio -> call /api/tts with getAuthHeaders(), save once, then play
        let generatedClips: Array<{ speaker: string; url: string }> = [];
        try {
          const authHdrs = await getAuthHeaders();
          const headers = { ...getApiHeaders(), ...authHdrs };

          const speakerVoices = assignTaskSpeakerVoices(task);
          const voiceManager = new DialogueVoiceManager();

          for (let i = 0; i < lines.length; i++) {
            if (playbackSessionIdRef.current !== currentSession || isPausedRef.current) break;
            setActiveLine(i);
            const line = lines[i];
            const parsed = parseDialogueLine(line);
            if (!parsed.spokenText) continue;

            const speakerName = parsed.speakerName || (i % 2 === 0 ? (task.speakers?.A || 'Speaker A') : (task.speakers?.B || 'Speaker B'));
            const isMaleSpeaker = /male/i.test(parsed.speakerHint) ||
              detectSpeakerGender(speakerName, parsed.speakerHint) === 'male' ||
              (task.speakerGenders && ((i % 2 === 0 && task.speakerGenders.A === 'male') || (i % 2 === 1 && task.speakerGenders.B === 'male')));
            const speakerGender = isMaleSpeaker ? 'male' : 'female';
            const voice = speakerVoices[speakerName] || speakerVoices[i % 2 === 0 ? 'A' : 'B'] || voiceManager.getVoiceForSpeaker(speakerName, parsed.speakerHint);

            const ttsRes = await fetch('/api/tts', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                text: parsed.spokenText,
                voice,
                voiceName: voice,
                gender: speakerGender,
                speaker: speakerName,
                speakerHint: parsed.speakerHint,
                isMale: isMaleSpeaker,
              }),
            });
            const ttsJson = await ttsRes.json();
            const audioSrc = ttsJson.audioUrl || (ttsJson.audioBase64 ? `data:audio/mpeg;base64,${ttsJson.audioBase64}` : null);

            if (playbackSessionIdRef.current !== currentSession || isPausedRef.current) break;

            if (ttsRes.ok && ttsJson.success && audioSrc) {
              if (ttsJson.audioUrl && ttsJson.audioUrl.startsWith('https://') && ttsJson.audioUrl.includes('blob.vercel-storage.com')) {
                generatedClips.push({ speaker: speakerName, url: ttsJson.audioUrl });
              }
              await new Promise<void>((resolve) => {
                if (playbackSessionIdRef.current !== currentSession || isPausedRef.current) {
                  resolve();
                  return;
                }
                const audio = new Audio(audioSrc);
                activeAudioRef.current = audio;
                const isNeuralFallback = !ttsJson.modelUsed || ttsJson.modelUsed.includes('Neural Stream') || ttsJson.providerUsed === 'fallback';
                // Generate a stable float between 0.92 and 1.06 based on text/name
                const seedString = speakerName || parsed.spokenText.slice(0, 20);
                const hash = seedString.split('').reduce((acc: number, char: string) => char.charCodeAt(0) + acc, 0);
                const dynamicRate = 0.92 + ((hash % 100) / 100) * 0.14;

                audio.preservesPitch = false;
                audio.playbackRate = isNeuralFallback ? dynamicRate : 1.0;
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
              // Fallback to unified playDialogue for this line
              await playDialogue([parsed.spokenText], undefined, () => {});
            }

            if (playbackSessionIdRef.current !== currentSession || isPausedRef.current) break;
          }

          // Save to Firestore if we have generatedClips and questionDocId
          const docId = (task as any).questionDocId || (task as any).id;
          if (docId && docId.startsWith('q_') && generatedClips.length > 0) {
            const firstUrl = generatedClips[0].url;
            const cappedClips = generatedClips.slice(0, 10);
            try {
              await updateDoc(doc(db, 'questions', docId), { audioUrl: firstUrl });
              await updateDoc(doc(db, 'questions', docId), { audioClips: cappedClips });
              (task as any).audioUrl = firstUrl;
              (task as any).audioClips = cappedClips;
            } catch (saveErr) {
              console.warn('Failed to save generated audio to question doc:', saveErr);
            }
          }
        } catch (ttsErr) {
          console.warn('TTS API generation failed, falling back to Web Speech:', ttsErr);
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
