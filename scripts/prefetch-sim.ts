import { getNextTaskToPrefetch } from '../src/utils/prefetchManager';
import { TaskTypeId, TASK_DEFINITIONS } from '../src/types/taskTypes';

// Mock TASK_DEFINITIONS for simulation
const MOCK_TASKS = TASK_DEFINITIONS;

function simulate() {
  let queue: any = {};
  let cooldowns: Record<string, number> = {};
  const now = Date.now();
  const level = 'intermediate';
  const topic = 'science';

  const fetchTask = (taskId: TaskTypeId) => {
    if (!queue[taskId]) queue[taskId] = [];
    queue[taskId].push({ id: `item-${Date.now()}`, level, topic, createdAt: Date.now() });
  };

  const getNext = () => getNextTaskToPrefetch('academic-discussion', queue, level, topic, cooldowns, Date.now());

  console.log('Scenario A: Empty queue');
  for (let i = 0; i < 16; i++) {
    const next = getNext();
    if (next) fetchTask(next);
  }
  let total = 0;
  for (const t of MOCK_TASKS) total += (queue[t.id] || []).length;
  console.log(`Total: ${total}`);
  if (total !== 16) throw new Error('Scenario A failed');

  console.log('Scenario B: Three tasks have 1');
  queue = {};
  for (let i = 0; i < 3; i++) fetchTask(MOCK_TASKS[i].id);
  // Need 5 + 8 = 13 more
  for (let i = 0; i < 13; i++) {
    const next = getNext();
    if (next) fetchTask(next);
  }
  total = 0;
  for (const t of MOCK_TASKS) total += (queue[t.id] || []).length;
  console.log(`Total: ${total}`);
  if (total !== 16) throw new Error('Scenario B failed');

  console.log('Scenario C: Every task has 2');
  queue = {};
  for (const t of MOCK_TASKS) { fetchTask(t.id); fetchTask(t.id); }
  if (getNext() !== null) throw new Error('Scenario C failed');

  console.log('Scenario D: One task in cooldown');
  queue = {};
  cooldowns[MOCK_TASKS[0].id] = Date.now() + 600000;
  // Others should still complete
  for (let i = 0; i < 14; i++) {
    const next = getNext();
    if (next) fetchTask(next);
  }
  // MOCK_TASKS[0] should still have 0
  if ((queue[MOCK_TASKS[0].id] || []).length !== 0) throw new Error('Scenario D failed');
  console.log('All scenarios passed!');
}

simulate();
