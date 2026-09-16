import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  addRecentLibrary,
  createRecentLibrary,
  recentLibrariesFromSettings,
} = require('../electron/recent-libraries.cjs');

const showsRoot = path.join(process.cwd(), 'test-fixtures', 'shows');

test('legacy lastFolder becomes the first recent library', () => {
  const entries = recentLibrariesFromSettings({ lastFolder: path.join(showsRoot, 'Season 1') });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, 'folder');
  assert.equal(entries[0].label, 'Season 1');
});

test('reopening a library moves it to the front without duplicates', () => {
  const seasonOne = createRecentLibrary(path.join(showsRoot, 'Season 1'), 'folder', 1);
  const episode = createRecentLibrary(path.join(showsRoot, 'Season 2', 'S02E01.mkv'), 'video', 2);
  const reordered = addRecentLibrary([seasonOne, episode], createRecentLibrary(seasonOne.path, 'folder', 3));

  assert.equal(reordered.length, 2);
  assert.equal(reordered[0].path, seasonOne.path);
  assert.equal(reordered[0].openedAt, 3);
  assert.equal(reordered[1].path, episode.path);
});

test('recent library history is capped at the requested size', () => {
  const entries = Array.from({ length: 10 }, (_, index) => (
    createRecentLibrary(path.join(showsRoot, `Season ${index + 1}`), 'folder', index)
  ));
  const result = addRecentLibrary(entries, createRecentLibrary(path.join(showsRoot, 'Newest'), 'folder', 20), 8);

  assert.equal(result.length, 8);
  assert.equal(result[0].label, 'Newest');
});
