import { scoreTrend, projectedTrend, sectionAverages, weeklyActivity, streak, recentAttempts, todaysPlan } from '../src/utils/dashboardStats';
import { PracticeRecord } from '../src/utils/scoreTracker';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${msg}`);
    process.exit(1);
  } else {
    console.log(`✅ Passed: ${msg}`);
  }
}

console.log('Running Dashboard Stats Simulation...');

// Fixtures
const emptyHistory: PracticeRecord[] = [];
const singleRecord: PracticeRecord[] = [
  { id: '1', taskType: 'reading', taskTitle: 'Test', section: 'Reading', date: new Date().toISOString(), score: 25, maxScore: 30, scaledScore30: 25, timeSpentSeconds: 100 }
];
const gapHistory: PracticeRecord[] = [
  { id: '1', taskType: 'reading', taskTitle: 'Test 1', section: 'Reading', date: new Date(Date.now() - 10 * 86400000).toISOString(), score: 20, maxScore: 30, scaledScore30: 20, timeSpentSeconds: 100 },
  { id: '2', taskType: 'listening', taskTitle: 'Test 2', section: 'Listening', date: new Date().toISOString(), score: 28, maxScore: 30, scaledScore30: 28, timeSpentSeconds: 100 }
];

// Test scoreTrend
assert(scoreTrend(emptyHistory).length === 0, 'scoreTrend handles empty history');
assert(scoreTrend(singleRecord).length === 1, 'scoreTrend handles single record');
assert(scoreTrend(gapHistory, 'total', 'all').length === 2, 'scoreTrend handles history with gap');

// Test projectedTrend
assert(projectedTrend(emptyHistory).length === 0, 'projectedTrend handles empty history');
assert(projectedTrend(singleRecord).length === 1, 'projectedTrend handles single record');

// Test sectionAverages
const avgs = sectionAverages(singleRecord);
assert(avgs.Reading.average === 25, 'sectionAverages computes correct average');

// Test weeklyActivity
const activity = weeklyActivity(singleRecord, 7);
assert(activity.length === 7, 'weeklyActivity returns 7 days');

// Test streak
const st = streak([new Date().toISOString().split('T')[0]]);
assert(st.current === 1, 'streak calculates current streak');

// Test recentAttempts
const rec = recentAttempts(gapHistory, 1);
assert(rec.length === 1, 'recentAttempts respects limit N');

// Test todaysPlan
const plan = todaysPlan(singleRecord, 5, 2);
assert(plan.length > 0 && plan.length <= 3, 'todaysPlan returns up to 3 items');

console.log('✨ All dashboard stats simulations passed successfully!');
process.exit(0);
