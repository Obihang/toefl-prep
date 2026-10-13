import React, { useEffect, useState } from 'react';
import { VocabularyWord, getVocabularyWords, updateVocabularyWordReview } from '../../utils/vocabulary';

export const VocabularyReview: React.FC = () => {
  const [words, setWords] = useState<VocabularyWord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadWords() {
      const data = await getVocabularyWords();
      // Filter words due today
      const today = new Date();
      setWords(data.filter(word => new Date(word.nextReviewDate) <= today));
      setLoading(false);
    }
    loadWords();
  }, []);

  const handleReview = async (wordId: string, correct: boolean) => {
    await updateVocabularyWordReview(wordId, correct);
    setWords(words.filter(w => w.id !== wordId));
  };

  if (loading) return <div>Loading words...</div>;

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Vocabulary Review</h2>
      {words.length === 0 ? (
        <p>No words due today!</p>
      ) : (
        <div className="grid gap-4">
          {words.map(word => (
            <div key={word.id} className="border p-4 rounded shadow">
              <p className="font-semibold text-xl">{word.word}</p>
              <p className="text-gray-700">{word.definition}</p>
              <div className="mt-4 flex gap-2">
                <button 
                  onClick={() => handleReview(word.id, true)}
                  className="bg-green-500 text-white px-2 py-1 rounded"
                >
                  Got it
                </button>
                <button 
                  onClick={() => handleReview(word.id, false)}
                  className="bg-red-500 text-white px-2 py-1 rounded"
                >
                  Need practice
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
