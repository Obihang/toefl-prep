import React, { useState, useEffect, useRef } from 'react';
import { Volume2, BookmarkPlus, X, Check, Loader2, Sparkles } from 'lucide-react';
import { playSpeech } from '../../utils/audioSpeech';
import { saveVocabularyWord } from '../../utils/vocabulary';
import { getDefinition } from '../../utils/dictionaryService';
import { getApiHeaders, getAuthHeaders } from '../../utils/apiKey';
import { safeFetchJson } from '../../utils/apiHelper';

interface Props {
  selectedText: string;
  contextSentence: string;
  taskType: string;
  position: { x: number; y: number };
  onClose: () => void;
}

export const VocabularyPopover: React.FC<Props> = ({
  selectedText,
  contextSentence,
  taskType,
  position,
  onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [entry, setEntry] = useState<any | null>(null);
  const [savingStatus, setSavingStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    fetchData();
  }, [selectedText]);

  async function fetchData() {
    setLoading(true);
    setEntry(null);
    setSavingStatus('idle');
    const result = await getDefinition(selectedText, contextSentence);
    if (result) {
      setEntry(result);
    }
    setLoading(false);
  }

  const handleSave = async (targetEntry?: any) => {
    const entryToSave = targetEntry || entry;
    if (!entryToSave) return;
    setSavingStatus('saving');
    try {
      const primary = entryToSave?.meanings?.[0];
      await saveVocabularyWord(
        (entryToSave.word || selectedText).trim(),
        primary?.definition || 'Manual entry',
        entryToSave?.phonetic || '',
        primary?.partOfSpeech || 'noun',
        entryToSave?.synonyms || [],
        contextSentence,
        taskType
      );
      setSavingStatus('saved');
    } catch {
      setSavingStatus('idle');
    }
  };

  const handleAiDefine = async () => {
    if (aiLoading) return;
    setAiLoading(true);
    try {
      const authHeaders = await getAuthHeaders();
      const headers = { ...getApiHeaders(), ...authHeaders };
      const json = await safeFetchJson('/api/generate-task', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          taskType: 'vocabulary_explanation',
          promptData: {
            word: selectedText.trim(),
            context: contextSentence.trim(),
          },
        }),
      });

      if (json?.success && json?.data) {
        setEntry(json.data);
        await handleSave(json.data);
      }
    } catch (err) {
      console.warn('AI Define request failed:', err);
    } finally {
      setAiLoading(false);
    }
  };



  const wordLabel = (entry?.word || selectedText).trim();
  const simpleExample =
    entry?.meanings?.find((m: any) => typeof m.example === 'string' && m.example.trim().length > 0)?.example ||
    (Array.isArray(entry?.examples) && entry.examples.find((ex: string) => typeof ex === 'string' && ex.trim().length > 0)) ||
    `A simple example using the word "${wordLabel}".`;

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 w-96 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 text-xs space-y-3 animate-in fade-in zoom-in-95 duration-150"
      style={{
        top: Math.min(window.innerHeight - 440, Math.max(20, position.y - 10)),
        left: Math.min(window.innerWidth - 420, Math.max(20, position.x - 160)),
      }}
    >
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-900 text-sm capitalize">{entry?.word || selectedText}</span>
          {entry?.phonetic && <span className="text-slate-400 font-mono">/{entry.phonetic.replace(/\//g, '')}/</span>}
          <button
            onClick={() => playSpeech(entry?.word || selectedText)}
            title="Listen to pronunciation"
            className="text-slate-400 hover:text-teal-600 transition-colors p-0.5 rounded"
          >
            <Volume2 className="w-3.5 h-3.5" />
          </button>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-4 h-4" /></button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 gap-2 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Looking up...
        </div>
      ) : entry ? (
        <div className="space-y-3 max-h-[350px] overflow-y-auto pr-0.5">
          {/* Clean flat list of meanings (max 4 distinct items) */}
          {entry.meanings?.length > 0 && (
            <div className="space-y-2">
              <p className="font-bold text-slate-900">Meanings:</p>
              {entry.meanings.slice(0, 4).map((m: any, i: number) => (
                <div key={i} className="text-slate-700 border-l-2 border-teal-500 pl-2.5 py-1 bg-slate-50/50 rounded-r-lg">
                  <span className="font-bold text-slate-900 uppercase text-[10px] bg-slate-200 px-1.5 py-0.5 rounded mr-1.5">{m.partOfSpeech}</span>
                  <span>{m.definition}</span>
                </div>
              ))}

              {entry.synonyms && entry.synonyms.length > 0 && (
                <p className="text-slate-600 text-[11px] font-medium pt-1">
                  <span className="font-semibold text-slate-800">Synonyms:</span> {entry.synonyms.slice(0, 4).join(', ')}
                </p>
              )}
            </div>
          )}

          {/* Simple Example block */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <p className="font-semibold text-slate-700 text-xs mb-1">📝 Simple Example:</p>
            <p className="italic text-slate-800 text-xs leading-relaxed">
              "{simpleExample}"
            </p>
          </div>

          <div className="pt-2 flex items-center gap-2">
            <button
              onClick={() => handleSave()}
              disabled={savingStatus === 'saved' || savingStatus === 'saving'}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 font-semibold rounded-lg transition-colors ${
                savingStatus === 'saved'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-teal-700 text-white hover:bg-teal-800'
              }`}
            >
              {savingStatus === 'saved' ? (
                <><Check className="w-3.5 h-3.5" /> Saved</>
              ) : savingStatus === 'saving' ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</>
              ) : (
                <><BookmarkPlus className="w-3.5 h-3.5" /> Save</>
              )}
            </button>
            <button
              onClick={handleAiDefine}
              disabled={aiLoading || savingStatus === 'saving'}
              className="flex items-center justify-center gap-1.5 py-2 px-3 font-semibold rounded-lg bg-teal-50 text-teal-800 hover:bg-teal-100 transition-colors disabled:opacity-50"
            >
              {aiLoading ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Defining...</>
              ) : (
                <><Sparkles className="w-3.5 h-3.5 text-teal-600" /> AI Define</>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <p className="font-semibold text-slate-700 text-xs mb-1">📝 Simple Example:</p>
            <p className="italic text-slate-800 text-xs leading-relaxed">
              "A simple example using the word \"{selectedText.trim()}\"."
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-slate-600">Word not found. Add definition manually:</p>
            <textarea
              className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500"
              placeholder="Enter definition..."
              onChange={(e) => setEntry({ meanings: [{ definition: e.target.value, partOfSpeech: 'noun', example: '' }] })}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleSave()}
                className="flex-1 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold"
              >
                Save Word
              </button>
              <button
                onClick={handleAiDefine}
                disabled={aiLoading}
                className="py-2 px-3 font-semibold rounded-lg bg-teal-50 text-teal-800 hover:bg-teal-100 text-xs flex items-center gap-1.5"
              >
                {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-teal-600" />} AI Define
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
