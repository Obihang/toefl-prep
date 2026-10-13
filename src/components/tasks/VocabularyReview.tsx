import React, { useEffect, useState } from 'react';
import { VocabularyWord, getVocabularyWords, updateVocabularyWordReview } from '../../utils/vocabulary';
import { CheckCircle2, XCircle, BookOpen, Clock } from 'lucide-react';

export const VocabularyReview: React.FC = () => {
  const [words, setWords] = useState<VocabularyWord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWords();
  }, []);

  async function loadWords() {
    setLoading(true);
    const data = await getVocabularyWords();
    const today = new Date();
    // Filter words where nextReviewDate <= today
    const dueWords = data.filter(word => {
      const reviewDate = word.nextReviewDate?.toDate ? word.nextReviewDate.toDate() : new Date(word.nextReviewDate || Date.now());
      return reviewDate <= today;
    });
    setWords(dueWords);
    setLoading(false);
  }

  const handleReview = async (wordId: string, correct: boolean) => {
    await updateVocabularyWordReview(wordId, correct);
    setWords(words.filter(w => w.id !== wordId));
  };

  if (loading) return <div className="text-sm text-slate-500 py-6 text-center">Loading vocabulary due today...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-teal-700" />
          <span>Vocabulary Leitner Review (Due Today)</span>
        </h3>
        <span className="text-xs font-mono font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded">
          {words.length} words due
        </span>
      </div>

      {words.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs space-y-2">
          <Clock className="w-8 h-8 mx-auto text-slate-300" />
          <p className="font-medium">All caught up! No vocabulary words due for review today.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {words.map(word => (
            <div key={word.id} className="border border-slate-200 rounded-xl p-5 bg-white shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-slate-900">{word.word}</span>
                <span className="text-[11px] font-semibold text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full">
                  Leitner Box {word.leitnerBox || 1} / 5
                </span>
              </div>

              <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg leading-relaxed">
                {word.definition}
              </p>

              {word.context && (
                <p className="text-xs text-slate-500 italic">
                  Context: "{word.context}"
                </p>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button 
                  onClick={() => handleReview(word.id, true)}
                  className="flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" /> Got it (Promote Box)
                </button>
                <button 
                  onClick={() => handleReview(word.id, false)}
                  className="flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors"
                >
                  <XCircle className="w-4 h-4" /> Need Practice (Reset Box 1)
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
