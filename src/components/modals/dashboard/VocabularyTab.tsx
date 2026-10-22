import React, { useState } from 'react';
import { Trash2, Loader2, Sparkles, Volume2, RotateCcw } from 'lucide-react';
import { VocabularyWord } from '../../../utils/vocabulary';
import { getDefinition } from '../../../utils/dictionaryService';

interface VocabularyTabProps {
  vocab: VocabularyWord[];
  newWord: string;
  newDef: string;
  setNewWord: (val: string) => void;
  setNewDef: (val: string) => void;
  handleAddVocab: (e: React.FormEvent) => void;
  handleDeleteVocab: (id: string) => void;
}

export const VocabularyTab: React.FC<VocabularyTabProps> = ({
  vocab,
  newWord,
  newDef,
  setNewWord,
  setNewDef,
  handleAddVocab,
  handleDeleteVocab,
}) => {
  const [isAutoDefining, setIsAutoDefining] = useState(false);
  const [practiceMode, setPracticeMode] = useState<string | null>(null); // 'flashcards' | null
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});

  const handleAutoDefine = async () => {
    if (!newWord) return;
    setIsAutoDefining(true);
    const result = await getDefinition(newWord);
    if (result) {
      const def = `${result.partOfSpeech || 'noun'}: ${result.definition || ''}`;
      setNewDef(def);
    }
    setIsAutoDefining(false);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleAddVocab} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 text-sm">Add New Vocabulary Word</h3>
            <button
                type="button"
                onClick={handleAutoDefine}
                disabled={isAutoDefining || !newWord}
                className="flex items-center gap-1.5 text-xs font-semibold text-teal-800 hover:text-teal-900 cursor-pointer disabled:opacity-50"
            >
                {isAutoDefining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Auto-Define
            </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input type="text" value={newWord} onChange={(e) => setNewWord(e.target.value)} placeholder="Word (e.g. Ubiquitous)" className="text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 outline-hidden focus:border-teal-600" />
          <input type="text" value={newDef} onChange={(e) => setNewDef(e.target.value)} placeholder="Definition / Context" className="text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 outline-hidden focus:border-teal-600" />
        </div>
        <div className="flex justify-end"><button type="submit" className="px-3 py-1.5 bg-teal-800 hover:bg-teal-900 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer">Save Word</button></div>
      </form>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 text-sm">Saved Words ({vocab.length})</h3>
            <button onClick={() => setPracticeMode(practiceMode === 'flashcards' ? null : 'flashcards')} className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer">
                <RotateCcw className="w-3.5 h-3.5" /> {practiceMode === 'flashcards' ? 'List View' : 'Flashcards'}
            </button>
        </div>
        
        {vocab.length === 0 ? <p className="text-xs text-slate-400 py-4 text-center">No vocabulary saved yet.</p> : (
          <div className={`grid gap-2 ${practiceMode === 'flashcards' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
            {vocab.map((v) => (
              <div key={v.id} className={`p-4 border border-slate-200 rounded-xl bg-white ${practiceMode === 'flashcards' ? 'h-32 cursor-pointer transition-transform duration-300' : 'flex items-start justify-between gap-2'}`}
                   onClick={practiceMode === 'flashcards' ? () => setFlipped(prev => ({ ...prev, [v.id]: !prev[v.id] })) : undefined}>
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-sm text-slate-900">{flipped[v.id] ? v.definition : v.word}</p>
                    {v.phonetic && <span className="text-xs font-mono text-slate-400">/{v.phonetic.replace(/\//g, '')}/</span>}
                  </div>
                  {!flipped[v.id] && <p className="text-xs text-slate-600 mt-1 truncate">{v.definition}</p>}
                  {v.context && !flipped[v.id] && <p className="text-[10px] text-slate-400 italic mt-1 truncate">"{v.context}"</p>}
                </div>
                {practiceMode !== 'flashcards' && (
                    <button onClick={() => handleDeleteVocab(v.id)} className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
