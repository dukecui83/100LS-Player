import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateDictation,
  extractDictationWords,
  normalizeDictationWord,
} from '../src/core/dictation.js';

test('extractDictationWords keeps contractions as one word and drops punctuation', () => {
  assert.deepEqual(
    extractDictationWords("When you read this morning's paper, don't panic."),
    ['When', 'you', 'read', 'this', "morning's", 'paper', "don't", 'panic'],
  );
});

test('normalizeDictationWord ignores case and normalizes curly apostrophes', () => {
  assert.equal(normalizeDictationWord('Morning’s,'), "morning's");
});

test('evaluateDictation scores each word independently', () => {
  const score = evaluateDictation(['Hello', 'world'], ['hello', 'word']);
  assert.equal(score.correctCount, 1);
  assert.deepEqual(score.results.map((result) => result.correct), [true, false]);
});
