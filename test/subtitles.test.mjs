import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findCueAt,
  findCueAtOrAfter,
  findVisibleCueIndex,
  formatClock,
  parseSrt,
} from '../src/subtitles.js';

const sample = `0
00:00:00,000 --> 00:00:03,000
{\\an8}制作信息

1
00:00:16,680 --> 00:00:19,370
我叫玛丽·艾莉丝·杨
My name is Mary Alice Young.

2
00:00:19.450 --> 00:00:21.160
When you read this morning's paper,
`;

test('parseSrt parses commas, dots, bilingual text, and strips alignment tags', () => {
  const cues = parseSrt(sample);
  assert.equal(cues.length, 3);
  assert.equal(cues[0].text, '制作信息');
  assert.equal(cues[1].start, 16680);
  assert.equal(cues[1].end, 19370);
  assert.deepEqual(cues[1].lines, ['我叫玛丽·艾莉丝·杨', 'My name is Mary Alice Young.']);
  assert.equal(cues[2].start, 19450);
});

test('findCueAt returns only a cue that contains the current time', () => {
  const cues = parseSrt(sample);
  assert.equal(findCueAt(cues, 17000), 1);
  assert.equal(findCueAt(cues, 19390), -1);
  assert.equal(findCueAt(cues, 22000), -1);
});

test('findCueAtOrAfter selects the next cue while in a gap', () => {
  const cues = parseSrt(sample);
  assert.equal(findCueAtOrAfter(cues, 10000), 1);
  assert.equal(findCueAtOrAfter(cues, 19390), 2);
  assert.equal(findCueAtOrAfter(cues, 99999), 2);
});

test('findVisibleCueIndex keeps the completed practice cue visible after its end time', () => {
  const cues = [
    { start: 1000, end: 2000 },
    { start: 2000, end: 4000 },
  ];

  assert.equal(findVisibleCueIndex(cues, 2015), 1);
  assert.equal(findVisibleCueIndex(cues, 2015, 0), 0);
  assert.equal(findVisibleCueIndex(cues, 2500, 1), 1);
});

test('formatClock produces player-friendly timestamps', () => {
  assert.equal(formatClock(16680), '00:16');
  assert.equal(formatClock(3661000), '01:01:01');
});
