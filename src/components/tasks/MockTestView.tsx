import React, { useState } from 'react';
import { TaskTypeId } from '../../App';

export const MockTestView: React.FC = () => {
  const tasks: TaskTypeId[] = [
    'reading-passage',
    'listening-dialogue',
    'speaking-interview',
    'academic-discussion',
  ];
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Full Mock Test</h2>
      <p>Task {currentTaskIndex + 1} of {tasks.length}</p>
      {/* ... render current task ... */}
    </div>
  );
};
