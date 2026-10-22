import React, { useState, useEffect } from 'react';
import { Volume2, BookmarkPlus, X, Check, Loader2, Play } from 'lucide-react';
import { playSpeech } from '../../utils/audioSpeech';
import { saveVocabularyWord } from '../../utils/vocabulary';
import { getDefinition } from '../../utils/dictionaryService';

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

  useEffect(() => {
    fetchData();
  }, [selectedText]);

  async function fetchData() {
    setLoading(true);
    setEntry(null);
    const result = await getDefinition(selectedText);
    if (result) {
      setEntry({
        word: selectedText.trim(),
        partOfSpeech: result.partOfSpeech || 'noun',
        definition: result.definition || 'Definition unavailable',
        phonetic: result.phonetic || '',
        synonyms: result.synonyms || [],
      });
    }
    setLoading(false);
  }

  const handleSave = async () => {
    if (savingStatus === 'saved') return;
    setSavingStatus('saving');
    try {
      await saveVocabularyWord(
        selectedText.trim(),
        entry?.definition || 'Manual entry',
        entry?.phonetic || '',
        entry?.partOfSpeech || 'noun',
        entry?.synonyms || [],
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
      className="fixed z-50 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 text-xs space-y-3 animate-in fade-in zoom-in-95 duration-150"
      style={{
        top: Math.min(window.innerHeight - 300, Math.max(20, position.y - 10)),
        left: Math.min(window.innerWidth - 340, Math.max(20, position.x - 160)),
      }}
    >
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-900 text-sm capitalize">{selectedText}</span>
          {entry?.phonetic && <span className="text-slate-400 font-mono">/{entry.phonetic.replace(/\//g, '')}/</span>}
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition"><X className="w-4 h-4" /></button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Looking up...</div>
      ) : entry ? (
        <div className="space-y-2.5">
          <div>
            <span className="text-[10px] font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-full uppercase">{entry.partOfSpeech}</span>
            <p className="text-slate-800 leading-relaxed mt-1">{entry.definition}</p>
          </div>
          {entry.synonyms.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {entry.synonyms.map((s: string) => <span key={s} className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-md text-slate-600">{s}</span>)}
            </div>
          )}
          <p className="text-slate-500 italic bg-slate-50 p-2 rounded-lg leading-relaxed">"{contextSentence}"</p>
          
          <div className="pt-1 flex items-center gap-2">
            {entry.audio && (
              <button onClick={() => new Audio(entry.audio).play()} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg"><Volume2 className="w-4 h-4 text-teal-700" /></button>
            )}
            <button
              onClick={handleSave}
              disabled={savingStatus === 'saved'}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 font-semibold rounded-lg transition ${savingStatus === 'saved' ? 'bg-emerald-50 text-emerald-700' : 'bg-teal-700 text-white'}`}
            >
              {savingStatus === 'saved' ? <><Check className="w-3.5 h-3.5" /> Saved</> : <><BookmarkPlus className="w-3.5 h-3.5" /> Save</>}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
            <p className="text-slate-600">Word not found. Add definition manually:</p>
            <textarea
                className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                placeholder="Enter definition..."
                onChange={(e) => setEntry({ ...entry, definition: e.target.value })}
            />
            <button onClick={handleSave} className="w-full py-2 bg-teal-700 text-white rounded-lg text-xs font-semibold">Save Word</button>
        </div>
      )}
    </div>
  );
};
