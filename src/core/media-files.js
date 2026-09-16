export const VIDEO_EXTENSIONS = Object.freeze(['.mkv', '.mp4', '.webm', '.mov', '.m4v', '.avi']);

const VIDEO_EXTENSION_SET = new Set(VIDEO_EXTENSIONS);

export function extensionOf(fileName) {
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : '';
}

export function baseNameOf(fileName) {
  const extension = extensionOf(fileName);
  return extension ? fileName.slice(0, -extension.length) : fileName;
}

export function isVideoFileName(fileName) {
  return VIDEO_EXTENSION_SET.has(extensionOf(fileName));
}

export function isSubtitleFileName(fileName) {
  return extensionOf(fileName) === '.srt';
}

export function isMatchingSubtitle(videoBaseName, subtitleFileName) {
  const lowerName = subtitleFileName.toLocaleLowerCase();
  const lowerBase = videoBaseName.toLocaleLowerCase();
  return lowerName === `${lowerBase}.srt` || lowerName.startsWith(`${lowerBase}.`) && lowerName.endsWith('.srt');
}

export function subtitleLabel(videoBaseName, subtitleFileName) {
  const lowerName = subtitleFileName.toLocaleLowerCase();
  const lowerBase = videoBaseName.toLocaleLowerCase();
  if (lowerName === `${lowerBase}.eng.srt` || lowerName === `${lowerBase}.en.srt`) return 'English';
  if (lowerName === `${lowerBase}.srt`) return '中英双语';

  const suffix = subtitleFileName.slice(videoBaseName.length, -4).replace(/^\./, '').trim();
  return suffix || '字幕';
}

export function naturalCompare(left, right) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

function normalizedEntry(entry) {
  const file = entry?.file || entry;
  if (!file || typeof file.name !== 'string') return null;
  const relativePath = String(entry?.relativePath || file.webkitRelativePath || file.name)
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  const pathParts = relativePath.split('/');
  pathParts.pop();
  return {
    file,
    fileName: file.name,
    relativePath,
    directory: pathParts.join('/').toLocaleLowerCase(),
  };
}

function libraryNameFor(entries) {
  const roots = entries
    .map((entry) => entry.relativePath.split('/'))
    .filter((parts) => parts.length > 1)
    .map((parts) => parts[0]);
  if (roots.length > 0 && roots.every((root) => root === roots[0])) return roots[0];
  return '本地文件';
}

export function createMediaPlan(inputEntries, preferredFile = null) {
  const entries = inputEntries.map(normalizedEntry).filter(Boolean);
  const videos = entries
    .filter((entry) => isVideoFileName(entry.fileName))
    .sort((left, right) => naturalCompare(left.relativePath, right.relativePath));
  const subtitleEntries = entries.filter((entry) => isSubtitleFileName(entry.fileName));

  const episodes = videos.map((video) => {
    const title = baseNameOf(video.fileName);
    const subtitles = subtitleEntries
      .filter((subtitle) => subtitle.directory === video.directory && isMatchingSubtitle(title, subtitle.fileName))
      .sort((left, right) => {
        const leftEnglish = /\.(eng|en)\.srt$/i.test(left.fileName);
        const rightEnglish = /\.(eng|en)\.srt$/i.test(right.fileName);
        if (leftEnglish !== rightEnglish) return leftEnglish ? -1 : 1;
        return naturalCompare(left.fileName, right.fileName);
      })
      .map((subtitle) => ({
        file: subtitle.file,
        fileName: subtitle.fileName,
        label: subtitleLabel(title, subtitle.fileName),
      }));

    return {
      file: video.file,
      fileName: video.fileName,
      relativePath: video.relativePath,
      title,
      subtitles,
    };
  });

  const preferredIndex = episodes.findIndex((episode) => episode.file === preferredFile);
  return {
    name: libraryNameFor(entries),
    episodes,
    selectedIndex: preferredIndex >= 0 ? preferredIndex : 0,
  };
}
