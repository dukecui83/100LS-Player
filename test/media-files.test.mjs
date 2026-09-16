import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMediaPlan,
  isMatchingSubtitle,
  subtitleLabel,
} from '../src/core/media-files.js';

function fakeFile(name, relativePath = name) {
  return {
    name,
    size: 100,
    lastModified: 1,
    webkitRelativePath: relativePath,
  };
}

test('subtitle matching supports plain, English, and bilingual-style suffixes', () => {
  assert.equal(isMatchingSubtitle('S01E01', 'S01E01.srt'), true);
  assert.equal(isMatchingSubtitle('S01E01', 'S01E01.eng.srt'), true);
  assert.equal(isMatchingSubtitle('S01E01', 'S01E010.srt'), false);
  assert.equal(subtitleLabel('S01E01', 'S01E01.eng.srt'), 'English');
  assert.equal(subtitleLabel('S01E01', 'S01E01.srt'), '中英双语');
});

test('media plan only matches subtitles in the same directory', () => {
  const episodeOne = fakeFile('S01E01.mkv', 'Season 1/S01E01.mkv');
  const episodeTwo = fakeFile('S01E02.mp4', 'Season 1/S01E02.mp4');
  const plan = createMediaPlan([
    episodeTwo,
    fakeFile('S01E01.eng.srt', 'Other/S01E01.eng.srt'),
    episodeOne,
    fakeFile('S01E01.eng.srt', 'Season 1/S01E01.eng.srt'),
    fakeFile('S01E01.srt', 'Season 1/S01E01.srt'),
  ], episodeTwo);

  assert.equal(plan.name, '本地文件');
  assert.deepEqual(plan.episodes.map((episode) => episode.title), ['S01E01', 'S01E02']);
  assert.deepEqual(plan.episodes[0].subtitles.map((subtitle) => subtitle.label), ['English', '中英双语']);
  assert.equal(plan.episodes[1].subtitles.length, 0);
  assert.equal(plan.selectedIndex, 1);
});

test('media plan names a single dropped folder', () => {
  const plan = createMediaPlan([
    fakeFile('lesson.mp4', 'My Course/lesson.mp4'),
    fakeFile('lesson.srt', 'My Course/lesson.srt'),
  ]);

  assert.equal(plan.name, 'My Course');
  assert.equal(plan.episodes[0].subtitles.length, 1);
});
