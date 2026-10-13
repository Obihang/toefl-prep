import React, { useEffect, useState } from 'react';
import { Mistake, getMistakes, deleteMistake } from '../../utils/mistakes';

export const MistakeNotebook: React.FC = () => {
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadMistakes() {
      const data = await getMistakes();
      setMistakes(data);
      setLoading(false);
    }
    loadMistakes();
  }, []);

  const handleDelete = async (id: string) => {
    await deleteMistake(id);
    setMistakes(mistakes.filter(m => m.id !== id));
  };

  if (loading) return <div>Loading mistakes...</div>;

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Mistake Notebook</h2>
      {mistakes.length === 0 ? (
        <p>No mistakes recorded yet.</p>
      ) : (
        <div className="grid gap-4">
          {mistakes.map(mistake => (
            <div key={mistake.id} className="border p-4 rounded shadow">
              <p className="font-semibold">Task: {mistake.taskType}</p>
              <p>Your answer: {mistake.userAnswer}</p>
              <p>Correct answer: {mistake.correctAnswer}</p>
              <p className="text-sm text-gray-600 mt-2">Explanation: {mistake.explanation}</p>
              <button 
                onClick={() => handleDelete(mistake.id)}
                className="mt-2 bg-red-500 text-white px-2 py-1 rounded"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
