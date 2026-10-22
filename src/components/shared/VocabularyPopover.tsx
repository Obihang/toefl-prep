import React, { useState, useEffect, useRef } from 'react';
import { Volume2, BookmarkPlus, X, Check, Loader2, Play, Sparkles } from 'lucide-react';
import { playSpeech } from '../../utils/audioSpeech';
import { saveVocabularyWord } from '../../utils/vocabulary';
import { getDefinition } from '../../utils/dictionaryService';
import { getApiHeaders } from '../../utils/apiKey';
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
    const result = await getDefinition(selectedText, contextSentence);
    if (result) {
      if (result.source === 'offline') {
        setEntry({
          meanings: [{ partOfSpeech: result.partOfSpeech || 'noun', definition: result.definition || 'Definition unavailable', example: '' }],
          phonetic: ''
        });
      } else {
        setEntry(result);
      }
    }
    setLoading(false);
  }

  const handleSave = async () => {
    if (savingStatus === 'saved') return;
    setSavingStatus('saving');
    try {
      const primary = entry?.meanings?.[0];
      await saveVocabularyWord(
        selectedText.trim(),
        primary?.definition || 'Manual entry',
        entry?.phonetic || '',
        primary?.partOfSpeech || 'noun',
        [],
        contextSentence,
        taskType
      );
      setSavingStatus('saved');
    } catch {
      setSavingStatus('idle');
    }
  };

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 w-96 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 text-xs space-y-3 animate-in fade-in zoom-in-95 duration-150"
      style={{
        top: Math.min(window.innerHeight - 400, Math.max(20, position.y - 10)),
        left: Math.min(window.innerWidth - 420, Math.max(20, position.x - 160)),
      }}
    >
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-900 text-sm capitalize">{selectedText}</span>
          {entry?.phonetic && <span className="text-slate-400 font-mono">/{entry.phonetic.replace(/\//g, '')}/</span>}
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-4 h-4" /></button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Looking up...</div>
      ) : entry ? (
        <div className="space-y-4 max-h-[300px] overflow-y-auto">
          {/* Context Meaning */}
          {entry.meanings.length > 0 && (
            <div className="bg-teal-50 p-3 rounded-xl border border-teal-100">
              <p className="font-bold text-teal-900 mb-1">✓ Used in this sentence as: {entry.meanings[0].partOfSpeech.toUpperCase()}</p>
              <p className="text-teal-950 font-medium">{entry.meanings[0].definition}</p>
              {(entry.meanings[0].example) ? (
                 <p className="text-teal-800 italic mt-2">"{entry.meanings[0].example}"</p>
              ) : (
                <p className="text-teal-800 italic mt-2">"{selectedText.charAt(0).toUpperCase() + selectedText.slice(1)} is often used in this context in academic writing."</p>
              )}
            </div>
          )}
          
          {/* Other Meanings */}
          {entry.meanings.length > 1 && (
            <div className="space-y-2">
                <p className="font-bold text-slate-900">Other Meanings:</p>
                {entry.meanings.slice(1, 3).map((m: any, i: number) => (
                    <div key={i} className="text-slate-600 border-l-2 border-slate-200 pl-2">
                        <span className="font-semibold text-slate-800 capitalize">{m.partOfSpeech}:</span> {m.definition}
                    </div>
                ))}
            </div>
          )}

          <div className="pt-2 flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={savingStatus === 'saved'}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 font-semibold rounded-lg ${savingStatus === 'saved' ? 'bg-emerald-50 text-emerald-700' : 'bg-teal-700 text-white'}`}
            >
              {savingStatus === 'saved' ? <><Check className="w-3.5 h-3.5" /> Saved</> : <><BookmarkPlus className="w-3.5 h-3.5" /> Save</>}
            </button>
            <button
              onClick={async () => {
                setSavingStatus('saving');
                const json = await safeFetchJson('/api/generate-task', {
                    method: 'POST',
                    headers: getApiHeaders(),
                    body: JSON.stringify({ taskType: 'vocabulary_explanation', promptData: { word: selectedText, context: contextSentence }, studentResponse: 'Provide definition, example sentences, synonyms, and other meanings in structured JSON' })
                });
                if(json.success) {
                    setEntry(json.data);
                    handleSave();
                } else {
                    setSavingStatus('idle');
                }
              }}
              disabled={savingStatus === 'saving' || savingStatus === 'saved'}
              className="flex items-center justify-center gap-1.5 py-2 px-3 font-semibold rounded-lg bg-teal-50 text-teal-800 hover:bg-teal-100"
            >
              <Sparkles className="w-3.5 h-3.5" /> AI Define
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
            <p className="text-slate-600">Word not found. Add definition manually:</p>
            <textarea
                className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                placeholder="Enter definition..."
                onChange={(e) => setEntry({ meanings: [{ definition: e.target.value, partOfSpeech: 'noun', example: '' }] })}
            />
            <button onClick={handleSave} className="w-full py-2 bg-teal-700 text-white rounded-lg text-xs font-semibold">Save Word</button>
        </div>
      )}
    </div>
  );
};
