import test from 'node:test';
import assert from 'node:assert/strict';
import { formatStudyTime, StudyTimeTracker } from '../src/core/study-time.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('formatStudyTime renders an hours-first timer', () => {
  assert.equal(formatStudyTime(3_661_000), '01:01:01');
});

test('StudyTimeTracker records foreground learning and persists the daily total', () => {
  let currentTime = new Date(2026, 8, 16, 10, 0, 0).getTime();
  const storage = memoryStorage();
  const tracker = new StudyTimeTracker({ storage, now: () => currentTime });
  tracker.setLearningAvailable(true);

  currentTime += 5000;
  let snapshot = tracker.tick();
  assert.equal(snapshot.sessionMs, 2000);

  tracker.setAppActive(false);
  currentTime += 5000;
  snapshot = tracker.tick();
  assert.equal(snapshot.sessionMs, 2000);

  tracker.dispose();
  const restored = new StudyTimeTracker({ storage, now: () => currentTime });
  assert.equal(restored.getSnapshot().todayMs, 2000);
});

test('StudyTimeTracker stops an idle paused session but keeps active playback counting', () => {
  let currentTime = new Date(2026, 8, 16, 10, 0, 0).getTime();
  const tracker = new StudyTimeTracker({ now: () => currentTime, inactivityMs: 1000 });
  tracker.setLearningAvailable(true);

  currentTime += 1500;
  assert.equal(tracker.tick().sessionMs, 0);

  tracker.setPlaybackActive(true);
  currentTime += 1500;
  assert.equal(tracker.tick().sessionMs, 1500);
});
