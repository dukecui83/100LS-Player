import test from 'node:test';
import assert from 'node:assert/strict';

import { emptyCueRepeat, recordCuePlayback } from '../src/core/cue-repeat.js';

test('cue repeat count starts at one and increments for the same cue', () => {
  const first = recordCuePlayback(emptyCueRepeat(), 4);
  const second = recordCuePlayback(first, 4);

  assert.deepEqual(first, { cueIndex: 4, count: 1 });
  assert.deepEqual(second, { cueIndex: 4, count: 2 });
});

test('cue repeat count restarts when playback moves to another cue', () => {
  const repeated = { cueIndex: 4, count: 3 };

  assert.deepEqual(recordCuePlayback(repeated, 5), { cueIndex: 5, count: 1 });
  assert.deepEqual(recordCuePlayback(repeated, -1), emptyCueRepeat());
});
