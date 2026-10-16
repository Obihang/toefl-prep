import React, { useEffect, useState } from 'react';
import { VocabularyWord, getVocabularyWords, updateVocabularyWordReview, deleteVocabularyWord } from '../../utils/vocabulary';
import { CheckCircle2, XCircle, BookOpen, Clock, RotateCcw, Download, Trash2, Volume2 } from 'lucide-react';
import { playSpeech } from '../../utils/audioSpeech';

export const VocabularyReview: React.FC = () => {
  const [allWords, setAllWords] = useState<VocabularyWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewMode, setReviewMode] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showDefinition, setShowDefinition] = useState(false);

  useEffect(() => {
    loadWords();
  }, []);

  async function loadWords() {
    setLoading(true);
    const data = await getVocabularyWords();
    setAllWords(data);
    setLoading(false);
  }

  const dueWords = allWords.filter(word => {
    const reviewDate = word.nextReviewDate?.toDate ? word.nextReviewDate.toDate() : new Date(word.nextReviewDate || Date.now());
    return reviewDate <= new Date();
  });

  const activeWordsList = reviewMode ? dueWords : allWords;

  const handleReview = async (wordId: string, correct: boolean) => {
    await updateVocabularyWordReview(wordId, correct);
    await loadWords();
    setShowDefinition(false);
    if (reviewMode && currentIndex >= dueWords.length - 1) {
      setReviewMode(false);
      setCurrentIndex(0);
    }
  };

  const handleDelete = async (wordId: string) => {
    await deleteVocabularyWord(wordId);
    setAllWords(allWords.filter(w => w.id !== wordId));
  };

  const exportCSV = () => {
    if (allWords.length === 0) return;
    const headers = ['Word', 'Definition', 'Context Sentence', 'Task Type', 'Leitner Box', 'Date Added'];
    const rows = allWords.map(w => [
      `"${(w.word || '').replace(/"/g, '""')}"`,
      `"${(w.definition || '').replace(/"/g, '""')}"`,
      `"${(w.context || '').replace(/"/g, '""')}"`,
      `"${(w.taskType || '').replace(/"/g, '""')}"`,
      w.leitnerBox || 1,
      w.createdAt?.toDate ? w.createdAt.toDate().toISOString() : new Date().toISOString()
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'toefl_vocabulary_bank.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return <div className="text-sm text-slate-500 py-6 text-center">Loading vocabulary bank...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3 flex-wrap gap-3">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-teal-700" />
          <span>Vocabulary Bank ({allWords.length} items)</span>
        </h3>
        <div className="flex items-center gap-2">
          {dueWords.length > 0 && (
            <button
              onClick={() => { setReviewMode(!reviewMode); setCurrentIndex(0); setShowDefinition(false); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{reviewMode ? 'View All Words' : `Review Due (${dueWords.length})`}</span>
            </button>
          )}
          {allWords.length > 0 && (
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-teal-700" />
              <span>Export CSV</span>
            </button>
          )}
        </div>
      </div>

      {allWords.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs space-y-2">
          <BookOpen className="w-8 h-8 mx-auto text-slate-300" />
          <p className="font-medium">No saved vocabulary words yet.</p>
          <p className="text-slate-400">Select any word or short phrase in reading passages, transcripts, or prompts to save it instantly!</p>
        </div>
      ) : reviewMode && dueWords.length > 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-5 max-w-xl mx-auto">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Due Item {currentIndex + 1} of {dueWords.length}</span>
            <span className="font-mono bg-teal-50 text-teal-800 px-2.5 py-0.5 rounded-full border border-teal-200 font-bold">
              Leitner Box {dueWords[currentIndex]?.leitnerBox || 1} / 5
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 text-center space-y-4 shadow-xs">
            <div className="flex items-center justify-center gap-2">
              <h4 className="text-2xl font-bold text-slate-900">{dueWords[currentIndex].word}</h4>
              <button
                onClick={() => playSpeech(dueWords[currentIndex].word)}
                className="p-2 text-teal-700 hover:bg-teal-50 rounded-full transition"
              >
                <Volume2 className="w-5 h-5" />
              </button>
            </div>

            {dueWords[currentIndex].context && (
              <p className="text-xs text-slate-600 italic bg-slate-50 p-3 rounded-lg">
                Context: "{dueWords[currentIndex].context}"
              </p>
            )}

            {!showDefinition ? (
              <button
                onClick={() => setShowDefinition(true)}
                className="px-4 py-2 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition"
              >
                Reveal Definition
              </button>
            ) : (
              <div className="space-y-4 animate-in fade-in">
                <p className="text-sm text-slate-800 font-medium leading-relaxed bg-slate-100 p-4 rounded-xl text-left">
                  {dueWords[currentIndex].definition}
                </p>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => handleReview(dueWords[currentIndex].id, true)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Got it (Promote)
                  </button>
                  <button
                    onClick={() => handleReview(dueWords[currentIndex].id, false)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition"
                  >
                    <XCircle className="w-4 h-4" /> Need Practice
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {allWords.map(word => (
            <div key={word.id} className="border border-slate-200 rounded-xl p-5 bg-white shadow-2xs space-y-3 relative group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-slate-900">{word.word}</span>
                  <button
                    onClick={() => playSpeech(word.word)}
                    className="p-1 text-teal-700 hover:bg-teal-50 rounded-lg transition"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full">
                    Box {word.leitnerBox || 1}
                  </span>
                  <button
                    onClick={() => handleDelete(word.id)}
                    className="text-slate-300 hover:text-rose-600 p-1 transition"
                    title="Delete word"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-lg leading-relaxed">
                {word.definition}
              </p>

              {word.context && (
                <div className="text-[11px] text-slate-500 bg-amber-50/50 border border-amber-100 p-2.5 rounded-lg space-y-0.5">
                  <strong className="text-slate-700 font-semibold block">Context Sentence:</strong>
                  <p className="italic">"{word.context}"</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
