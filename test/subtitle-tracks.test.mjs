import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isBilingualSubtitleTrack,
  isEnglishSubtitleTrack,
  preferredSubtitleTrack,
  subtitleVariantAvailability,
} from '../src/core/subtitle-tracks.js';

const tracks = [
  { id: 'english', label: 'English', fileName: 'S01E01.eng.srt' },
  { id: 'bilingual', label: '中英双语', fileName: 'S01E01.srt' },
];

test('subtitle tracks identify English and bilingual variants', () => {
  assert.equal(isEnglishSubtitleTrack(tracks[0]), true);
  assert.equal(isBilingualSubtitleTrack(tracks[1]), true);
  assert.deepEqual(subtitleVariantAvailability(tracks), { english: true, bilingual: true });
});

test('preferred subtitle track follows the requested language variant', () => {
  assert.equal(preferredSubtitleTrack(tracks, false)?.id, 'english');
  assert.equal(preferredSubtitleTrack(tracks, true)?.id, 'bilingual');
  assert.equal(preferredSubtitleTrack([tracks[0]], true)?.id, 'english');
  assert.equal(preferredSubtitleTrack([], true), null);
});
