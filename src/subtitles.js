function timestampToMilliseconds(value) {
  const match = /^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/.exec(value.trim());
  if (!match) return null;

  const [, hours, minutes, seconds, fraction] = match;
  const milliseconds = Number(fraction.padEnd(3, '0').slice(0, 3));
  return (((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000) + milliseconds;
}

function cleanSubtitleLine(line) {
  return line
    .replace(/^\{\\[^}]+\}/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim();
}

export function parseSrt(content) {
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];

  const cues = [];
  const blocks = normalized.split(/\n{2,}/);

  for (const block of blocks) {
    const lines = block.split('\n');
    const timelineIndex = lines.findIndex((line) => line.includes('-->'));
    if (timelineIndex < 0) continue;

    const timeline = lines[timelineIndex].split('-->');
    if (timeline.length !== 2) continue;

    const start = timestampToMilliseconds(timeline[0]);
    const endToken = timeline[1].trim().split(/\s+/)[0];
    const end = timestampToMilliseconds(endToken);
    if (start === null || end === null || end <= start) continue;

    const textLines = lines
      .slice(timelineIndex + 1)
      .flatMap((line) => cleanSubtitleLine(line).split('\n'))
      .map((line) => line.trim())
      .filter(Boolean);
    if (textLines.length === 0) continue;

    cues.push({
      id: cues.length,
      start,
      end,
      lines: textLines,
      text: textLines.join('\n'),
    });
  }

  return cues.sort((left, right) => left.start - right.start || left.end - right.end);
}

export function findCueAt(cues, positionMs) {
  let low = 0;
  let high = cues.length - 1;
  let candidate = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (cues[middle].start <= positionMs) {
      candidate = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  if (candidate >= 0 && positionMs <= cues[candidate].end) return candidate;
  return -1;
}

export function findCueAtOrAfter(cues, positionMs) {
  const active = findCueAt(cues, positionMs);
  if (active >= 0) return active;

  let low = 0;
  let high = cues.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (cues[middle].start < positionMs) low = middle + 1;
    else high = middle;
  }
  return low < cues.length ? low : Math.max(cues.length - 1, -1);
}

export function findVisibleCueIndex(cues, positionMs, heldCueIndex = -1) {
  if (heldCueIndex >= 0 && heldCueIndex < cues.length) return heldCueIndex;
  return findCueAt(cues, positionMs);
}

export function formatClock(milliseconds, includeHours = false) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (includeHours || hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
