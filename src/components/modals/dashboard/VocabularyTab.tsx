import React from 'react';
import { Trash2 } from 'lucide-react';
import { VocabularyWord } from '../../../utils/vocabulary';

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
  return (
    <div className="space-y-6">
      <form onSubmit={handleAddVocab} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
        <h3 className="font-semibold text-slate-900 text-sm">Add New Vocabulary Word</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            value={newWord}
            onChange={(e) => setNewWord(e.target.value)}
            placeholder="Word (e.g. Ubiquitous)"
            className="text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 outline-hidden focus:border-teal-600"
          />
          <input
            type="text"
            value={newDef}
            onChange={(e) => setNewDef(e.target.value)}
            placeholder="Definition / Context"
            className="text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 outline-hidden focus:border-teal-600"
          />
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            className="px-3 py-1.5 bg-teal-800 hover:bg-teal-900 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Save Word
          </button>
        </div>
      </form>

      <div className="space-y-2">
        <h3 className="font-semibold text-slate-900 text-sm">Saved Words ({vocab.length})</h3>
        {vocab.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">No vocabulary saved yet. Save challenging words from practice questions!</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto">
            {vocab.map((v) => (
              <div key={v.id} className="p-3 border border-slate-200 rounded-xl flex items-start justify-between gap-2 bg-white">
                <div>
                  <p className="font-bold text-sm text-slate-900">{v.word}</p>
                  <p className="text-xs text-slate-600">{v.definition}</p>
                </div>
                <button
                  onClick={() => handleDeleteVocab(v.id)}
                  className="text-slate-400 hover:text-rose-600 p-1 rounded-lg transition-colors cursor-pointer"
                  title="Delete word"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
