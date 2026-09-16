import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebAdapter } from '../src/platform/web-adapter.js';

function fakeFile(name, content = '') {
  return {
    name,
    size: content.length,
    lastModified: 1,
    webkitRelativePath: '',
    text: async () => content,
  };
}

function drop(...files) {
  return { items: [], files };
}

test('web adapter accepts a video and matching subtitle in one local drop', async () => {
  const adapter = createWebAdapter();
  const library = await adapter.openDrop(drop(
    fakeFile('lesson.mp4'),
    fakeFile('lesson.eng.srt', '1\n00:00:00,000 --> 00:00:01,000\nHello'),
  ));

  assert.equal(library.episodes.length, 1);
  assert.equal(library.episodes[0].subtitleCount, 1);
  assert.equal(library.episodes[0].title, 'lesson');
});

test('web adapter can attach a subtitle dropped after its video', async () => {
  const adapter = createWebAdapter();
  const videoLibrary = await adapter.openDrop(drop(fakeFile('lesson.mp4')));
  assert.equal(videoLibrary.episodes[0].subtitleCount, 0);

  const completedLibrary = await adapter.openDrop(drop(
    fakeFile('lesson.srt', '1\n00:00:00,000 --> 00:00:01,000\nHello'),
  ));
  assert.equal(completedLibrary.episodes[0].subtitleCount, 1);
});

test('web adapter rejects a subtitle when no video has been granted', async () => {
  const adapter = createWebAdapter();
  await assert.rejects(
    adapter.openDrop(drop(fakeFile('lesson.srt'))),
    /视频和同名 SRT 字幕/,
  );
});
