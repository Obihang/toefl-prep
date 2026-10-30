import React, { useEffect, useState } from 'react';
import { Mistake, getMistakes, deleteMistake, updateMistakeReview } from '../../utils/mistakes';
import { CheckCircle, XCircle, RotateCcw, Trash2, BookOpen } from 'lucide-react';

export const MistakeNotebook: React.FC = () => {
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewMode, setReviewMode] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswerInput, setUserAnswerInput] = useState('');
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);

  useEffect(() => {
    loadMistakes();
    const handleReset = () => {
      setMistakes([]);
      setReviewMode(false);
    };
    window.addEventListener('toefl_progress_reset', handleReset);
    window.addEventListener('toefl_mistakes_updated', loadMistakes);
    return () => {
      window.removeEventListener('toefl_progress_reset', handleReset);
      window.removeEventListener('toefl_mistakes_updated', loadMistakes);
    };
  }, []);

  async function loadMistakes() {
    setLoading(true);
    const data = await getMistakes();
    setMistakes(data);
    setLoading(false);
  }

  const handleDelete = async (id: string) => {
    await deleteMistake(id);
    setMistakes(mistakes.filter(m => m.id !== id));
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mistakes.length === 0) return;
    const current = mistakes[currentIndex];
    const isCorrect = userAnswerInput.trim().toLowerCase() === current.correctAnswer.trim().toLowerCase() || userAnswerInput.trim().length > 0; // flexible check or exact

    await updateMistakeReview(current.id, isCorrect);
    setFeedback(isCorrect ? 'correct' : 'incorrect');

    setTimeout(async () => {
      setFeedback(null);
      setUserAnswerInput('');
      await loadMistakes();
      if (currentIndex >= mistakes.length - 1) {
        setCurrentIndex(0);
        setReviewMode(false);
      }
    }, 1500);
  };

  if (loading) return <div className="text-sm text-slate-500 py-6 text-center">Loading mistake notebook...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-slate-900">Mistake Notebook ({mistakes.length} items)</h3>
        {mistakes.length > 0 && (
          <button
            onClick={() => { setReviewMode(!reviewMode); setCurrentIndex(0); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{reviewMode ? 'Exit Review Mode' : 'Review Mistakes (Quiz)'}</span>
          </button>
        )}
      </div>

      {mistakes.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
          No mistakes recorded yet. Errors and feedback corrections will automatically appear here for spaced review!
        </div>
      ) : reviewMode ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Question {currentIndex + 1} of {mistakes.length}</span>
            <span>Streak to master: {mistakes[currentIndex]?.correctStreak || 0}/2</span>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
            <div className="text-xs font-semibold text-teal-800 uppercase tracking-wider">Task: {mistakes[currentIndex].taskType}</div>
            <p className="text-sm text-slate-900 font-medium">Correct Answer / Correction needed:</p>
            <p className="text-sm font-mono bg-slate-100 p-2.5 rounded text-slate-800">{mistakes[currentIndex].correctAnswer}</p>
            <p className="text-xs text-slate-600">Explanation: {mistakes[currentIndex].explanation}</p>
          </div>

          <form onSubmit={handleReviewSubmit} className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Your Retake Answer:</label>
              <input
                type="text"
                value={userAnswerInput}
                onChange={(e) => setUserAnswerInput(e.target.value)}
                placeholder="Type your corrected response or answer..."
                disabled={feedback !== null}
                className="w-full p-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:border-teal-600 outline-hidden"
              />
            </div>

            {feedback === 'correct' && (
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 p-3 rounded-lg">
                <CheckCircle className="w-4 h-4 shrink-0" /> Correct! Streak incremented. (2 correct in a row removes item)
              </div>
            )}

            {feedback === 'incorrect' && (
              <div className="flex items-center gap-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 p-3 rounded-lg">
                <XCircle className="w-4 h-4 shrink-0" /> Incorrect. Streak reset to 0.
              </div>
            )}

            {feedback === null && (
              <button
                type="submit"
                className="w-full py-2.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors"
              >
                Submit Answer
              </button>
            )}
          </form>
        </div>
      ) : (
        <div className="grid gap-3 max-h-96 overflow-y-auto">
          {mistakes.map((mistake) => (
            <div key={mistake.id} className="border border-slate-200 rounded-xl p-4 bg-white space-y-2 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded uppercase tracking-wider">
                  {mistake.taskType}
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  Mastery Streak: {mistake.correctStreak || 0}/2
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="bg-rose-50/60 border border-rose-100 p-2 rounded text-slate-800">
                  <span className="font-semibold text-rose-700 block mb-0.5">Your Error:</span>
                  {mistake.userAnswer}
                </div>
                <div className="bg-emerald-50/60 border border-emerald-100 p-2 rounded text-slate-800">
                  <span className="font-semibold text-emerald-700 block mb-0.5">Correction:</span>
                  {mistake.correctAnswer}
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-snug">
                <strong>Explanation:</strong> {mistake.explanation}
              </p>

              <div className="flex justify-end pt-1">
                <button
                  onClick={() => handleDelete(mistake.id)}
                  className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-800 transition-colors font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove from Notebook
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
