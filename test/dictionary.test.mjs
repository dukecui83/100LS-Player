import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dictionaryShardName,
  lookupDictionaryWord,
  normalizeLookupWord,
  parseExchange,
  tokenizeSubtitleLine,
} from '../src/core/dictionary.js';

test('subtitle tokenizer preserves punctuation and exposes English words', () => {
  assert.deepEqual(tokenizeSubtitleLine("Well, apples aren't bad."), [
    { text: 'Well', word: 'well' },
    { text: ', ', word: null },
    { text: 'apples', word: 'apples' },
    { text: ' ', word: null },
    { text: "aren't", word: "aren't" },
    { text: ' ', word: null },
    { text: 'bad', word: 'bad' },
    { text: '.', word: null },
  ]);
});

test('lookup normalization handles curly apostrophes and shard names', () => {
  assert.equal(normalizeLookupWord('“Apple’s,”'), "apple's");
  assert.equal(dictionaryShardName('Seemed'), 'se');
  assert.equal(dictionaryShardName('a'), 'a_');
});

test('exchange parser finds lemma and word-form labels', () => {
  assert.deepEqual(parseExchange('0:seem/1:pd'), { lemma: 'seem', formCodes: ['p', 'd'] });
});

test('dictionary lookup resolves stored inflections to their lemma', async () => {
  const entries = new Map([
    ['seemed', { word: 'seemed', phonetic: '', translation: 'seem 的过去式', exchange: '0:seem/1:pd' }],
    ['seem', { word: 'seem', phonetic: 'si:m', translation: 'vi. 似乎；好像', exchange: 'p:seemed/d:seemed' }],
  ]);
  const result = await lookupDictionaryWord('seemed', async (word) => entries.get(word) || null);
  assert.equal(result.lemma, 'seem');
  assert.equal(result.entry.translation, 'vi. 似乎；好像');
  assert.deepEqual(result.formLabels, ['过去式', '过去分词']);
});

test('dictionary lookup falls back to a verified possessive base', async () => {
  const entries = new Map([
    ['apple', { word: 'apple', phonetic: 'æpl', translation: 'n. 苹果', exchange: 's:apples' }],
  ]);
  const result = await lookupDictionaryWord("apple's", async (word) => entries.get(word) || null);
  assert.equal(result.lemma, 'apple');
  assert.deepEqual(result.formLabels, ['所有格']);
});
