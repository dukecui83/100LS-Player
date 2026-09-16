import { createMediaPlan, isSubtitleFileName, isVideoFileName } from '../core/media-files.js';
import { dictionaryShardName, normalizeLookupWord } from '../core/dictionary.js';

function readInputDirectory() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    let settled = false;
    const finish = (entries) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', handleWindowFocus);
      resolve(entries);
    };
    const handleWindowFocus = () => {
      setTimeout(() => {
        if (!input.files?.length) finish([]);
      }, 300);
    };
    input.type = 'file';
    input.multiple = true;
    input.setAttribute('webkitdirectory', '');
    input.addEventListener('change', () => {
      finish(Array.from(input.files || []).map((file) => ({ file, relativePath: file.webkitRelativePath || file.name })));
    }, { once: true });
    input.addEventListener('cancel', () => finish([]), { once: true });
    window.addEventListener('focus', handleWindowFocus, { once: true });
    input.click();
  });
}

async function entriesFromHandle(handle, parentPath = '') {
  const relativePath = parentPath ? `${parentPath}/${handle.name}` : handle.name;
  if (handle.kind === 'file') {
    return [{ file: await handle.getFile(), relativePath }];
  }

  const entries = [];
  for await (const child of handle.values()) {
    entries.push(...await entriesFromHandle(child, relativePath));
  }
  return entries;
}

function fileFromWebkitEntry(entry) {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function directoryChildren(entry) {
  return new Promise((resolve, reject) => {
    const reader = entry.createReader();
    const children = [];
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) resolve(children);
        else {
          children.push(...batch);
          readBatch();
        }
      }, reject);
    };
    readBatch();
  });
}

async function entriesFromWebkitEntry(entry) {
  if (entry.isFile) {
    return [{ file: await fileFromWebkitEntry(entry), relativePath: entry.fullPath.replace(/^\//, '') }];
  }
  if (!entry.isDirectory) return [];

  const results = [];
  for (const child of await directoryChildren(entry)) {
    results.push(...await entriesFromWebkitEntry(child));
  }
  return results;
}

async function collectDroppedEntries(dataTransfer) {
  const items = Array.from(dataTransfer.items || []).filter((item) => item.kind === 'file');

  if (items.some((item) => typeof item.getAsFileSystemHandle === 'function')) {
    try {
      const handles = await Promise.all(items.map((item) => item.getAsFileSystemHandle?.()));
      const entries = [];
      for (const handle of handles.filter(Boolean)) entries.push(...await entriesFromHandle(handle));
      if (entries.length > 0) return entries;
    } catch {
      // Fall through to the legacy entry API or FileList.
    }
  }

  if (items.some((item) => typeof item.webkitGetAsEntry === 'function')) {
    const entries = [];
    for (const item of items) {
      const entry = item.webkitGetAsEntry?.();
      if (entry) entries.push(...await entriesFromWebkitEntry(entry));
    }
    if (entries.length > 0) return entries;
  }

  return Array.from(dataTransfer.files || []).map((file) => ({
    file,
    relativePath: file.webkitRelativePath || file.name,
  }));
}

async function chooseDirectoryEntries() {
  if (typeof window.showDirectoryPicker !== 'function') return readInputDirectory();
  try {
    const handle = await window.showDirectoryPicker({ mode: 'read' });
    return entriesFromHandle(handle);
  } catch (error) {
    if (error?.name === 'AbortError') return [];
    throw error;
  }
}

function entryIdentity(entry) {
  const file = entry.file;
  return `${entry.relativePath || file.webkitRelativePath || file.name}\0${file.size}\0${file.lastModified}`;
}

export function createWebAdapter() {
  let episodeRecords = new Map();
  let subtitleRecords = new Map();
  let retainedEntries = [];
  let currentMediaUrl = null;
  let sequence = 0;
  const dictionaryShards = new Map();

  async function loadDictionaryEntry(value) {
    const word = normalizeLookupWord(value);
    if (!word) return null;
    const shard = dictionaryShardName(word);
    if (!dictionaryShards.has(shard)) {
      const shardUrl = new URL(`./dictionary/shards/${shard}.json`, document.baseURI);
      const request = fetch(shardUrl).then(async (response) => {
        if (response.status === 404) return {};
        if (!response.ok) throw new Error(`Dictionary shard failed: ${response.status}`);
        return response.json();
      });
      dictionaryShards.set(shard, request);
    }
    const records = await dictionaryShards.get(shard);
    const record = records[word];
    if (!record) return null;
    return {
      word: record[0],
      phonetic: record[1],
      translation: record[2],
      exchange: record[3],
    };
  }

  function releaseMediaUrl() {
    if (currentMediaUrl) URL.revokeObjectURL(currentMediaUrl);
    currentMediaUrl = null;
  }

  function buildLibrary(entries, preferredFile = null) {
    const plan = createMediaPlan(entries, preferredFile);
    if (plan.episodes.length === 0) throw new Error('没有找到支持的视频文件');

    episodeRecords = new Map();
    subtitleRecords = new Map();
    const episodes = plan.episodes.map((episode) => {
      const episodeId = `web-episode-${sequence += 1}`;
      const subtitles = episode.subtitles.map((subtitle) => {
        const subtitleId = `web-subtitle-${sequence += 1}`;
        subtitleRecords.set(subtitleId, subtitle);
        return { id: subtitleId, label: subtitle.label, fileName: subtitle.fileName };
      });
      episodeRecords.set(episodeId, { ...episode, id: episodeId, subtitles });
      return {
        id: episodeId,
        title: episode.title,
        fileName: episode.fileName,
        subtitleCount: subtitles.length,
      };
    });

    return {
      folderPath: null,
      name: plan.name,
      episodes,
      selectedEpisodeId: episodes[plan.selectedIndex]?.id || episodes[0].id,
    };
  }

  function mergeSubtitleEntries(entries) {
    const byIdentity = new Map(retainedEntries.map((entry) => [entryIdentity(entry), entry]));
    for (const entry of entries) byIdentity.set(entryIdentity(entry), entry);
    retainedEntries = [...byIdentity.values()];
  }

  return {
    kind: 'web',
    os: 'web',
    supportsAutomaticSiblingDiscovery: false,

    async chooseLibrary() {
      const entries = await chooseDirectoryEntries();
      if (entries.length === 0) return null;
      retainedEntries = entries;
      return buildLibrary(retainedEntries);
    },

    async openDrop(dataTransfer) {
      const entries = await collectDroppedEntries(dataTransfer);
      if (entries.length === 0) throw new Error('没有识别到可打开的本地文件');

      const preferredFile = entries.find((entry) => isVideoFileName(entry.file.name))?.file || null;
      const hasVideo = entries.some((entry) => isVideoFileName(entry.file.name));
      const onlySubtitles = entries.every((entry) => isSubtitleFileName(entry.file.name));
      if (hasVideo) retainedEntries = entries;
      else if (onlySubtitles && retainedEntries.some((entry) => isVideoFileName(entry.file.name))) mergeSubtitleEntries(entries);
      else throw new Error('请同时拖入视频和同名 SRT 字幕，或拖入整个文件夹');

      return buildLibrary(retainedEntries, preferredFile);
    },

    getRecentLibraries: async () => [],
    openRecentLibrary: async () => null,
    clearRecentLibraries: async () => false,

    async loadEpisode(episodeId) {
      const episode = episodeRecords.get(episodeId);
      if (!episode) throw new Error('Episode not found');
      releaseMediaUrl();
      currentMediaUrl = URL.createObjectURL(episode.file);
      return {
        id: episode.id,
        title: episode.title,
        fileName: episode.fileName,
        mediaUrl: currentMediaUrl,
        subtitles: episode.subtitles,
      };
    },

    async loadSubtitle(subtitleId) {
      const subtitle = subtitleRecords.get(subtitleId);
      if (!subtitle) throw new Error('Subtitle not found');
      return {
        id: subtitleId,
        label: subtitle.label,
        fileName: subtitle.fileName,
        content: await subtitle.file.text(),
      };
    },

    lookupDictionaryEntry: loadDictionaryEntry,
    openExternal(url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    getAppInfo: async () => ({ version: null }),
    onShowAbout: () => () => {},

    onLibraryOpened: () => () => {},
    onRecentLibrariesChanged: () => () => {},
    onToggleVideoFullscreen: () => () => {},
    onSetBilingualSubtitles: () => () => {},
    setBilingualSubtitleMenuState: async () => false,
    onSetTranscriptPanel: () => () => {},
    setTranscriptPanelMenuState: async () => false,
    isWindowFullscreen: async () => false,
    toggleWindowFullscreen: async () => false,
    quitApp: async () => {},
    onWindowFullscreenChanged: () => () => {},
    loadingMessage: () => '正在读取本地视频…',
    noSubtitleMessage: '未匹配到字幕，请把同名 SRT 再拖入窗口',
    dispose: releaseMediaUrl,
  };
}
