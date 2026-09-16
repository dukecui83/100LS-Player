const path = require('node:path');

const DEFAULT_RECENT_LIMIT = 8;

function recentPathKey(value) {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLocaleLowerCase() : resolved;
}

function createRecentLibrary(targetPath, kind = 'folder', openedAt = Date.now()) {
  const resolvedPath = path.resolve(targetPath);
  return {
    path: resolvedPath,
    kind: kind === 'video' ? 'video' : 'folder',
    label: path.basename(resolvedPath) || resolvedPath,
    openedAt: Number.isFinite(openedAt) ? openedAt : Date.now(),
  };
}

function normalizeRecentLibraries(entries, limit = DEFAULT_RECENT_LIMIT) {
  if (!Array.isArray(entries)) return [];

  const normalized = [];
  const seen = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry.path !== 'string' || entry.path.trim() === '') continue;
    const item = createRecentLibrary(entry.path, entry.kind, Number(entry.openedAt));
    const key = recentPathKey(item.path);
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(item);
    if (normalized.length >= limit) break;
  }
  return normalized;
}

function recentLibrariesFromSettings(settings, limit = DEFAULT_RECENT_LIMIT) {
  if (!settings || typeof settings !== 'object') return [];
  if (Array.isArray(settings.recentLibraries)) {
    return normalizeRecentLibraries(settings.recentLibraries, limit);
  }
  if (typeof settings.lastFolder === 'string' && settings.lastFolder.trim() !== '') {
    return [createRecentLibrary(settings.lastFolder, 'folder')];
  }
  return [];
}

function addRecentLibrary(entries, entry, limit = DEFAULT_RECENT_LIMIT) {
  return normalizeRecentLibraries([entry, ...(Array.isArray(entries) ? entries : [])], limit);
}

module.exports = {
  DEFAULT_RECENT_LIMIT,
  addRecentLibrary,
  createRecentLibrary,
  normalizeRecentLibraries,
  recentLibrariesFromSettings,
};
