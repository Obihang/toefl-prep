import React, { useState, useEffect } from 'react';
import { Volume2, BookmarkPlus, Sparkles, X, Check, Loader2 } from 'lucide-react';
import { playSpeech } from '../../utils/audioSpeech';
import { saveVocabularyWord } from '../../utils/vocabulary';
import { getApiHeaders } from '../../utils/apiKey';
import { safeFetchJson } from '../../utils/apiHelper';

interface Props {
  selectedText: string;
  contextSentence: string;
  taskType: string;
  position: { x: number; y: number };
  onClose: () => void;
}

interface DictionaryEntry {
  word: string;
  partOfSpeech: string;
  meaning: string;
  example: string;
}

export const VocabularyPopover: React.FC<Props> = ({
  selectedText,
  contextSentence,
  taskType,
  position,
  onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [entry, setEntry] = useState<DictionaryEntry | null>(null);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [explainingAI, setExplainingAI] = useState(false);
  const [engineLabel, setEngineLabel] = useState<string>('');
  const [audioError, setAudioError] = useState<string | null>(null);

  useEffect(() => {
    fetchDictionaryData();
  }, [selectedText]);

  async function fetchDictionaryData() {
    setLoading(true);
    setEntry(null);
    setAiExplanation(null);
    setAudioError(null);
    const cleanWord = selectedText.trim().toLowerCase();

    // Check local cache first
    const cacheKey = `dict_${cleanWord}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setEntry(parsed);
        setLoading(false);
        return;
      } catch {}
    }

    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`);
      if (!res.ok) {
        throw new Error('Not found in dictionary API');
      }
      const data = await res.json();
      const firstMeaning = data[0]?.meanings?.[0];
      const definitionObj = firstMeaning?.definitions?.[0];

      const partOfSpeech = firstMeaning?.partOfSpeech || 'noun';
      const meaning = definitionObj?.definition || 'Definition unavailable';
      const example = definitionObj?.example || contextSentence;

      const result: DictionaryEntry = {
        word: selectedText.trim(),
        partOfSpeech,
        meaning,
        example,
      };

      localStorage.setItem(cacheKey, JSON.stringify(result));
      setEntry(result);
    } catch {
      // Fallback or trigger AI explanation automatically if dictionary has no entry
      handleExplainWithAI(selectedText, contextSentence);
    } finally {
      setLoading(false);
    }
  }

  async function handleExplainWithAI(word: string, context: string) {
    setExplainingAI(true);
    try {
      const json = await safeFetchJson('/api/evaluate-response', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({
          taskType: 'vocabulary_explanation',
          promptData: { word, context },
          studentResponse: 'Explain the meaning of this word in the given context clearly and concisely with part of speech and 1 example sentence.',
        }),
      });
      if (json.success && json.data?.feedbackSummary) {
        setAiExplanation(json.data.feedbackSummary);
      } else {
        setAiExplanation(`Definition of "${word}" in context: ${context}`);
      }
    } catch {
      setAiExplanation(`Definition of "${word}" in context: ${context}`);
    } finally {
      setExplainingAI(false);
    }
  }

  const handleSave = async () => {
    if (savingStatus === 'saved') return;
    setSavingStatus('saving');
    try {
      const def = entry ? `${entry.partOfSpeech}: ${entry.meaning} (e.g. "${entry.example}")` : aiExplanation || selectedText;
      await saveVocabularyWord(selectedText.trim(), def, contextSentence, taskType);
      setSavingStatus('saved');
    } catch (err) {
      console.warn('Failed to save vocabulary word:', err);
      setSavingStatus('idle');
    }
  };

  return (
    <div
      className="fixed z-50 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 text-xs space-y-3 animate-in fade-in zoom-in-95 duration-150"
      style={{
        top: Math.min(window.innerHeight - 300, Math.max(20, position.y - 10)),
        left: Math.min(window.innerWidth - 340, Math.max(20, position.x - 160)),
      }}
    >
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-900 text-sm capitalize">{selectedText}</span>
          {entry?.partOfSpeech && (
            <span className="text-[10px] font-medium text-teal-800 bg-teal-50 px-2 py-0.5 rounded-full uppercase">
              {entry.partOfSpeech}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 gap-2 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin text-teal-700" />
          <span>Looking up definition...</span>
        </div>
      ) : (
        <div className="space-y-2.5">
          {entry ? (
            <div className="space-y-1.5">
              <p className="text-slate-800 font-medium leading-relaxed">{entry.meaning}</p>
              {entry.example && (
                <p className="text-slate-500 italic bg-slate-50 p-2 rounded-lg">
                  "{entry.example}"
                </p>
              )}
            </div>
          ) : aiExplanation ? (
            <div className="space-y-1.5 bg-teal-50/50 border border-teal-100 p-2.5 rounded-xl text-teal-900">
              <span className="font-semibold flex items-center gap-1 text-teal-800">
                <Sparkles className="w-3.5 h-3.5" /> AI Explanation:
              </span>
              <p className="leading-relaxed">{aiExplanation}</p>
            </div>
          ) : null}

          {explainingAI && (
            <div className="flex items-center gap-2 text-slate-500 py-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-700" />
              <span>Generating AI context explanation...</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="pt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                setAudioError(null);
                try {
                  await playSpeech(selectedText, {
                    onEngineDetected: (label) => setEngineLabel(label),
                    onError: (err) => setAudioError(err?.message || String(err)),
                  });
                } catch (err: any) {
                  setAudioError(err?.message || String(err));
                }
              }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition cursor-pointer"
            >
              <Volume2 className="w-3.5 h-3.5 text-teal-700" />
              <span>Hear</span>
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={savingStatus === 'saved' || savingStatus === 'saving'}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 font-semibold rounded-xl transition ${
                savingStatus === 'saved'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-teal-700 hover:bg-teal-800 text-white'
              }`}
            >
              {savingStatus === 'saved' ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Saved</span>
                </>
              ) : savingStatus === 'saving' ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  <span>Save</span>
                </>
              )}
            </button>
          </div>

          {audioError && (
            <div className="text-[11px] text-rose-600 font-mono mt-1">
              Audio failure: {audioError}
            </div>
          )}

          {!entry && !explainingAI && (
            <button
              type="button"
              onClick={() => handleExplainWithAI(selectedText, contextSentence)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 text-teal-800 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 font-medium rounded-lg transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Explain with AI</span>
            </button>
          )}

          {engineLabel && (
            <div className="text-[10px] text-slate-400 text-center">{engineLabel}</div>
          )}
        </div>
      )}
    </div>
  );
};
