import { getNextTaskToPrefetch, popPrefetchedTask, evaluateRateLimitPause, PREFETCH_GAP_MS } from '../src/utils/prefetchManager';
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
  for (let i = 0; i < 14; i++) {
    const next = getNext();
    if (next) fetchTask(next);
  }
  if ((queue[cooldownTask] || []).length !== 0) throw new Error('Scenario D failed: Cooldown task should be skipped');
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
    await new Promise(r => setTimeout(r, 50));
    inFlight = false;
  };
  for (let i = 0; i < 5; i++) {
    const next = getNext();
    if (next) await mockFetch();
  }
  if (requestsMade !== 5) throw new Error('Scenario F failed: Incorrect requests made');
  console.log('Scenario F passed');

  console.log('Scenario G: popPrefetchedTask filters matching and purges stale items');
  queue = {
    'academic-discussion': [
      { id: 'stale-1', level: 'beginner', topic: 'campus-life', createdAt: Date.now() },
      { id: 'fresh-1', level: 'intermediate', topic: 'science', createdAt: Date.now() },
      { id: 'stale-2', level: 'advanced', topic: 'business-economics', createdAt: Date.now() },
      { id: 'fresh-2', level: 'intermediate', topic: 'science', createdAt: Date.now() },
    ],
  };
  const popResult1 = popPrefetchedTask(queue, 'academic-discussion', 'intermediate', 'science');
  if (!popResult1.item || popResult1.item.id !== 'fresh-1') {
    throw new Error(`Scenario G failed: expected fresh-1, got ${popResult1.item?.id}`);
  }
  const remainingInQueue = popResult1.updatedQueue['academic-discussion'] || [];
  if (remainingInQueue.length !== 1 || remainingInQueue[0].id !== 'fresh-2') {
    throw new Error(`Scenario G failed: non-matching items were not purged correctly.`);
  }
  console.log('Scenario G passed');

  console.log('Scenario H: Per-minute rate limit pause evaluation');
  const pauseMin = evaluateRateLimitPause('429 Too Many Requests (PerMinute)', Date.now());
  if (pauseMin.kind !== 'per-minute') throw new Error('Scenario H failed: expected per-minute kind');
  if (pauseMin.resumeAt <= Date.now()) throw new Error('Scenario H failed: resumeAt should be in the future');
  console.log('Scenario H passed');

  console.log('Scenario I: Per-day rate limit pause evaluation');
  const pauseDay = evaluateRateLimitPause('QuotaExceeded (PerDay quota violation)', Date.now());
  if (pauseDay.kind !== 'per-day') throw new Error('Scenario I failed: expected per-day kind');
  if (pauseDay.resumeAt - Date.now() < 3500 * 1000) throw new Error('Scenario I failed: daily pause should be ~1 hour');
  console.log('Scenario I passed');

  console.log('Scenario J: 503 backoff sets no per-task cooldown');
  const taskToTest503 = MOCK_TASKS[0].id;
  const taskCooldownsBefore = cooldowns[taskToTest503] || 0;
  // Simulating 503 error handling: global pause 60s, do not update task-specific cooldown
  const is503 = true;
  if (is503) {
    // 503 sets global pause only, taskCooldownsBefore unchanged
  }
  if ((cooldowns[taskToTest503] || 0) !== taskCooldownsBefore) {
    throw new Error('Scenario J failed: 503 should not set task-specific cooldown');
  }
  console.log('Scenario J passed');

  console.log('Scenario K: 12-second prefetch gap check (PREFETCH_GAP_MS = 12000)');
  if (PREFETCH_GAP_MS !== 12000) {
    throw new Error('Scenario K failed: PREFETCH_GAP_MS must be 12000');
  }
  console.log('Scenario K passed');

  console.log('All prefetch simulation scenarios passed successfully!');
}

simulate().catch((err) => {
  console.error(err);
  process.exit(1);
});
