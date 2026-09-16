import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dictionaryShardName, lookupDictionaryWord } from '../src/core/dictionary.js';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cache = new Map();

async function loadEntry(word) {
  const shard = dictionaryShardName(word);
  if (!cache.has(shard)) {
    const content = await readFile(path.join(projectDirectory, 'public', 'dictionary', 'shards', `${shard}.json`), 'utf8');
    cache.set(shard, JSON.parse(content));
  }
  const record = cache.get(shard)[word];
  return record ? { word: record[0], phonetic: record[1], translation: record[2], exchange: record[3] } : null;
}

test('bundled dictionary resolves common regular and irregular word forms', async () => {
  const seemed = await lookupDictionaryWord('seemed', loadEntry);
  assert.equal(seemed.lemma, 'seem');
  assert.deepEqual(seemed.formLabels, ['过去式', '过去分词']);
  assert.match(seemed.entry.translation, /似乎/);

  const apples = await lookupDictionaryWord('apples', loadEntry);
  assert.equal(apples.lemma, 'apple');
  assert.deepEqual(apples.formLabels, ['复数']);
  assert.match(apples.entry.translation, /苹果/);

  const went = await lookupDictionaryWord('went', loadEntry);
  assert.equal(went.lemma, 'go');
  assert.deepEqual(went.formLabels, ['过去式']);
});
