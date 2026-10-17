import React, { useState, useEffect } from 'react';
import { Cpu, Check } from 'lucide-react';
import { getPurposeModels, setPurposeModel, PurposeModelMapping, AVAILABLE_MODEL_CHOICES } from '../../../../utils/aiModelsConfig';

export const AIModelsSection: React.FC = () => {
  const [models, setModels] = useState<PurposeModelMapping>(getPurposeModels());
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    const update = () => setModels(getPurposeModels());
    update();
    window.addEventListener('apiKeyUpdated', update);
    return () => window.removeEventListener('apiKeyUpdated', update);
  }, []);

  const handleModelChange = (purpose: keyof PurposeModelMapping, val: string) => {
    setPurposeModel(purpose, val);
    setModels(getPurposeModels());
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const modelPurposeList: Array<{ key: keyof PurposeModelMapping; label: string; desc: string }> = [
    { key: 'speakingWritingFeedback', label: 'Speaking/Writing feedback and scoring', desc: 'Evaluates essays and speech transcripts against TOEFL rubrics.' },
    { key: 'readingListeningGeneration', label: 'Reading and Listening question generation', desc: 'Generates passage questions, dialogues, and distractor choices.' },
    { key: 'vocabularyBank', label: 'Vocabulary Bank definitions and examples', desc: 'Provides contextual definitions, synonyms, and example sentences.' },
    { key: 'mistakeNotebook', label: 'Mistake Notebook explanations', desc: 'Analyzes user errors and provides targeted grammar tips.' },
    { key: 'scoreProjectionStudyPlan', label: 'Score projection / study plan', desc: 'Calculates scaled estimates, CEFR band, and daily study items.' },
    { key: 'voiceTranscription', label: 'Voice transcription (speech to text)', desc: 'Transcribes recorded microphone audio into text.' },
    { key: 'voiceSynthesis', label: 'Voice synthesis (text to speech)', desc: 'Converts generated dialogue text into spoken audio.' },
  ];

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-bold text-slate-900 text-sm">AI Models &amp; Purpose Routing</h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Centralized configuration showing which model handles each task. You can optionally override models per task below.
          </p>
        </div>
        {savedNotice && (
          <div className="flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
            <Check className="w-3.5 h-3.5" />
            <span>Model updated</span>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {modelPurposeList.map((item) => (
          <div key={item.key} className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="font-bold text-xs text-slate-900">{item.label}</div>
                <div className="text-[11px] text-slate-500">{item.desc}</div>
              </div>
              <div className="w-full sm:w-auto">
                <select
                  value={models[item.key]}
                  onChange={(e) => handleModelChange(item.key, e.target.value)}
                  className="w-full sm:w-60 text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 outline-hidden focus:border-teal-600 font-medium"
                >
                  {AVAILABLE_MODEL_CHOICES.map((m, idx) => (
                    <option key={idx} value={m}>{m}</option>
                  ))}
                  <option value={models[item.key]}>{models[item.key]}</option>
                </select>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
