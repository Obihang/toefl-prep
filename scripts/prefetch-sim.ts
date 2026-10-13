import { getNextTaskToPrefetch } from '../src/utils/prefetchManager';
import { TaskTypeId, TASK_DEFINITIONS } from '../src/types/taskTypes';

const MOCK_TASKS = TASK_DEFINITIONS;

async function simulate() {
  let queue: any = {};
  let cooldowns: Record<string, number> = {};
  const now = Date.now();
  const level = 'intermediate';
  const topic = 'science';

  const fetchTask = (taskId: TaskTypeId) => {
    if (!queue[taskId]) queue[taskId] = [];
    queue[taskId].push({ id: `item-${Date.now()}`, level, topic, createdAt: Date.now() });
  };

  const getNext = (nowOverride?: number) => 
    getNextTaskToPrefetch('academic-discussion', queue, level, topic, cooldowns, nowOverride || Date.now());

  console.log('Scenario A: Empty queue');
  queue = {};
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
  // Need 5 (for R1) + 8 (for R2) = 13 more
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
  const cooldownTask = MOCK_TASKS[0].id;
  const cooldownEnd = Date.now() + 600000;
  cooldowns[cooldownTask] = cooldownEnd;
  // Others should still complete (14 total)
  for (let i = 0; i < 14; i++) {
    const next = getNext();
    if (next) fetchTask(next);
  }
  if ((queue[cooldownTask] || []).length !== 0) throw new Error('Scenario D failed: Cooldown task should be skipped');
  // After cooldown
  const nextAfter = getNext(cooldownEnd + 1);
  if (nextAfter !== cooldownTask) throw new Error('Scenario D failed: Cooldown task should be fetched after cooldown');
  console.log('Scenario D passed');

  console.log('Scenario E: Failure simulation');
  queue = {};
  cooldowns = {};
  const failTask = MOCK_TASKS[0].id;
  cooldowns[failTask] = Date.now() + 300000;
  if (getNext() === failTask) throw new Error('Scenario E failed: Failed task should be in cooldown');
  console.log('Scenario E passed');

  console.log('Scenario F: Lock logic and request overlap check');
  let requestsMade = 0;
  let inFlight = false;
  const mockFetch = async () => {
    if (inFlight) throw new Error('Concurrent request detected!');
    inFlight = true;
    requestsMade++;
    await new Promise(r => setTimeout(r, 100));
    inFlight = false;
  };
  // Simulate 5 loops
  for (let i = 0; i < 5; i++) {
    const next = getNext();
    if (next) await mockFetch();
  }
  if (requestsMade !== 5) throw new Error('Scenario F failed: Incorrect requests made');
  console.log('Scenario F passed');

  console.log('All scenarios passed!');
}

simulate();
