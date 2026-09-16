const { app, BrowserWindow, dialog, ipcMain, Menu, protocol, shell } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { spawn } = require('node:child_process');
const {
  addRecentLibrary,
  createRecentLibrary,
  recentLibrariesFromSettings,
} = require('./recent-libraries.cjs');

const VIDEO_EXTENSIONS = new Set(['.mkv', '.mp4', '.webm', '.mov', '.m4v', '.avi']);
const MIME_TYPES = {
  '.mkv': 'video/x-matroska',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.avi': 'video/x-msvideo',
};

const mediaFiles = new Map();
const episodes = new Map();
const subtitles = new Map();
const dictionaryShards = new Map();
let currentLibrary = null;
let mainWindow = null;
const preparationJobs = new Map();
const applicationFullscreenWindows = new WeakSet();

function normalizeDictionaryWord(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.normalize('NFKC').replace(/[‘’]/g, "'");
  const match = normalized.match(/[A-Za-z]+(?:['-][A-Za-z]+)*/);
  return match ? match[0].toLowerCase() : '';
}

function dictionaryShardName(word) {
  const first = /^[a-z]$/.test(word[0]) ? word[0] : '_';
  const second = /^[a-z]$/.test(word[1] || '') ? word[1] : '_';
  return `${first}${second}`;
}

async function loadDictionaryEntry(value) {
  const word = normalizeDictionaryWord(value);
  if (!word || word.length > 80) return null;
  const shard = dictionaryShardName(word);
  if (!dictionaryShards.has(shard)) {
    const root = process.env.VITE_DEV_SERVER_URL ? 'public' : 'dist';
    const shardPath = path.join(__dirname, '..', root, 'dictionary', 'shards', `${shard}.json`);
    const request = fsp.readFile(shardPath, 'utf8')
      .then((content) => JSON.parse(content))
      .catch((error) => {
        if (error?.code === 'ENOENT') return {};
        dictionaryShards.delete(shard);
        throw error;
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

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'study-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

async function readSettings() {
  try {
    const settings = JSON.parse(await fsp.readFile(settingsPath(), 'utf8'));
    return settings && typeof settings === 'object' ? settings : {};
  } catch {
    return {};
  }
}

async function writeSettings(settings) {
  await fsp.mkdir(app.getPath('userData'), { recursive: true });
  await fsp.writeFile(settingsPath(), JSON.stringify(settings, null, 2), 'utf8');
}

async function readRecentLibraries() {
  const settings = await readSettings();
  const storedEntries = recentLibrariesFromSettings(settings);
  const availableEntries = [];

  for (const entry of storedEntries) {
    try {
      const stat = await fsp.stat(entry.path);
      if ((entry.kind === 'video' && stat.isFile()) || (entry.kind === 'folder' && stat.isDirectory())) {
        availableEntries.push(entry);
      }
    } catch {
      // Missing recent items are pruned silently.
    }
  }

  const settingsNeedMigration = Object.hasOwn(settings, 'lastFolder')
    || JSON.stringify(settings.recentLibraries || []) !== JSON.stringify(availableEntries);
  if (settingsNeedMigration) {
    const nextSettings = { ...settings, recentLibraries: availableEntries };
    delete nextSettings.lastFolder;
    await writeSettings(nextSettings);
  }
  return availableEntries;
}

async function refreshRecentLibraryMenus(entries = null) {
  const recentLibraries = entries || await readRecentLibraries();
  if (!mainWindow || mainWindow.isDestroyed()) return recentLibraries;

  const currentMenu = Menu.getApplicationMenu();
  const bilingualItem = currentMenu?.getMenuItemById('bilingual-subtitles');
  const transcriptPanelItem = currentMenu?.getMenuItemById('transcript-panel');
  const menuState = {
    bilingualChecked: Boolean(bilingualItem?.checked),
    bilingualEnabled: Boolean(bilingualItem?.enabled),
    transcriptPanelChecked: transcriptPanelItem ? Boolean(transcriptPanelItem.checked) : true,
  };
  Menu.setApplicationMenu(createApplicationMenu(mainWindow, recentLibraries, menuState));
  if (process.platform !== 'darwin') mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.send('library:recent-changed', recentLibraries);
  return recentLibraries;
}

async function rememberRecentLibrary(targetPath, kind) {
  const existing = await readRecentLibraries();
  const settings = await readSettings();
  const recentLibraries = addRecentLibrary(existing, createRecentLibrary(targetPath, kind));
  const nextSettings = { ...settings, recentLibraries };
  delete nextSettings.lastFolder;
  await writeSettings(nextSettings);
  await refreshRecentLibraryMenus(recentLibraries);
}

async function forgetRecentLibrary(targetPath) {
  const settings = await readSettings();
  const targetKey = process.platform === 'win32'
    ? path.resolve(targetPath).toLocaleLowerCase()
    : path.resolve(targetPath);
  const recentLibraries = recentLibrariesFromSettings(settings).filter((entry) => {
    const entryKey = process.platform === 'win32' ? entry.path.toLocaleLowerCase() : entry.path;
    return entryKey !== targetKey;
  });
  const nextSettings = { ...settings, recentLibraries };
  delete nextSettings.lastFolder;
  await writeSettings(nextSettings);
  await refreshRecentLibraryMenus(recentLibraries);
}

async function openRecentLibrary(recentPath) {
  try {
    return await openLibraryPath(recentPath);
  } catch (error) {
    if (error?.code === 'ENOENT') await forgetRecentLibrary(recentPath);
    throw error;
  }
}

async function clearRecentLibraries() {
  const settings = await readSettings();
  const nextSettings = { ...settings, recentLibraries: [] };
  delete nextSettings.lastFolder;
  await writeSettings(nextSettings);
  await refreshRecentLibraryMenus([]);
}

function mediaCachePath() {
  return path.join(app.getPath('userData'), 'media-cache');
}

async function removeFileIfPresent(filePath) {
  try {
    await fsp.unlink(filePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function trimMediaCache(keepPath) {
  const cachePath = mediaCachePath();
  let entries;
  try {
    entries = await fsp.readdir(cachePath, { withFileTypes: true });
  } catch {
    return;
  }

  const cachedFiles = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.mp4'))
      .map(async (entry) => {
        const filePath = path.join(cachePath, entry.name);
        const stat = await fsp.stat(filePath);
        return { filePath, modifiedAt: stat.mtimeMs };
      }),
  );

  const staleFiles = cachedFiles
    .filter((item) => item.filePath !== keepPath)
    .sort((left, right) => right.modifiedAt - left.modifiedAt)
    .slice(1);

  await Promise.all(staleFiles.map((item) => removeFileIfPresent(item.filePath)));
}

function resolveFfmpegCommand() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;

  try {
    const bundledPath = require('ffmpeg-static');
    if (app.isPackaged && bundledPath.includes('app.asar')) {
      return bundledPath.replace('app.asar', 'app.asar.unpacked');
    }
    return bundledPath;
  } catch {
    return 'ffmpeg';
  }
}

function runFfmpegRemux(sourcePath, outputPath) {
  const ffmpegCommand = resolveFfmpegCommand();
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpegCommand,
      [
        '-hide_banner',
        '-loglevel', 'error',
        '-y',
        '-i', sourcePath,
        '-map', '0:v:0',
        '-map', '0:a:0?',
        '-c', 'copy',
        '-movflags', '+faststart',
        outputPath,
      ],
      { windowsHide: true },
    );

    let errorOutput = '';
    child.stderr.on('data', (chunk) => {
      errorOutput += chunk.toString();
      if (errorOutput.length > 12000) errorOutput = errorOutput.slice(-12000);
    });
    child.on('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new Error('没有找到 FFmpeg。请重新安装应用，或通过 FFMPEG_PATH 指定 ffmpeg.exe。'));
      } else {
        reject(error);
      }
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(errorOutput.trim() || `FFmpeg 退出码：${code}`));
    });
  });
}

async function preparePlayableVideo(sourcePath) {
  const extension = path.extname(sourcePath).toLowerCase();
  if (extension !== '.mkv' && extension !== '.avi') return sourcePath;

  const stat = await fsp.stat(sourcePath);
  const fingerprint = crypto
    .createHash('sha1')
    .update(`${sourcePath}\0${stat.size}\0${stat.mtimeMs}`)
    .digest('hex');
  const cachePath = mediaCachePath();
  const outputPath = path.join(cachePath, `${fingerprint}.mp4`);

  try {
    const cachedStat = await fsp.stat(outputPath);
    if (cachedStat.size > 0) {
      await fsp.utimes(outputPath, new Date(), new Date());
      return outputPath;
    }
  } catch {
    // The cache will be created below.
  }

  if (preparationJobs.has(fingerprint)) return preparationJobs.get(fingerprint);

  const job = (async () => {
    await fsp.mkdir(cachePath, { recursive: true });
    const temporaryPath = path.join(cachePath, `${fingerprint}.${process.pid}.partial.mp4`);
    await removeFileIfPresent(temporaryPath);
    try {
      await runFfmpegRemux(sourcePath, temporaryPath);
      await fsp.rename(temporaryPath, outputPath);
      await trimMediaCache(outputPath);
      return outputPath;
    } catch (error) {
      await removeFileIfPresent(temporaryPath);
      throw error;
    }
  })();

  preparationJobs.set(fingerprint, job);
  try {
    return await job;
  } finally {
    preparationJobs.delete(fingerprint);
  }
}

function subtitleLabel(baseName, fileName) {
  const lower = fileName.toLowerCase();
  const baseLower = baseName.toLowerCase();
  if (lower === `${baseLower}.eng.srt` || lower === `${baseLower}.en.srt`) return 'English';
  if (lower === `${baseLower}.srt`) return '中英双语';

  const suffix = fileName.slice(baseName.length, -4).replace(/^\./, '').trim();
  return suffix || '字幕';
}

function isMatchingSubtitle(baseName, fileName) {
  const lower = fileName.toLowerCase();
  const baseLower = baseName.toLowerCase();
  return lower.endsWith('.srt') && (lower === `${baseLower}.srt` || lower.startsWith(`${baseLower}.`));
}

async function scanLibrary(folderPath, preferredVideoPath = null) {
  const entries = await fsp.readdir(folderPath, { withFileTypes: true });
  const fileNames = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  const videoNames = fileNames
    .filter((fileName) => VIDEO_EXTENSIONS.has(path.extname(fileName).toLowerCase()))
    .sort(naturalCompare);

  mediaFiles.clear();
  episodes.clear();
  subtitles.clear();

  const normalizedPreferredPath = preferredVideoPath
    ? path.resolve(preferredVideoPath).toLocaleLowerCase()
    : null;
  let selectedEpisodeId = null;

  const episodeSummaries = videoNames.map((videoName) => {
    const extension = path.extname(videoName);
    const baseName = path.basename(videoName, extension);
    const videoPath = path.join(folderPath, videoName);
    const mediaId = makeId('media');
    const episodeId = makeId('episode');

    mediaFiles.set(mediaId, videoPath);

    const episodeSubtitles = fileNames
      .filter((fileName) => isMatchingSubtitle(baseName, fileName))
      .sort((left, right) => {
        const leftEnglish = /\.(eng|en)\.srt$/i.test(left);
        const rightEnglish = /\.(eng|en)\.srt$/i.test(right);
        if (leftEnglish !== rightEnglish) return leftEnglish ? -1 : 1;
        return naturalCompare(left, right);
      })
      .map((fileName) => {
        const subtitleId = makeId('subtitle');
        const item = {
          id: subtitleId,
          label: subtitleLabel(baseName, fileName),
          fileName,
          path: path.join(folderPath, fileName),
        };
        subtitles.set(subtitleId, item);
        return { id: item.id, label: item.label, fileName: item.fileName };
      });

    const episode = {
      id: episodeId,
      title: baseName,
      fileName: videoName,
      path: videoPath,
      mediaId,
      subtitles: episodeSubtitles,
    };
    episodes.set(episodeId, episode);
    if (normalizedPreferredPath && path.resolve(videoPath).toLocaleLowerCase() === normalizedPreferredPath) {
      selectedEpisodeId = episodeId;
    }

    return {
      id: episodeId,
      title: baseName,
      fileName: videoName,
      subtitleCount: episodeSubtitles.length,
    };
  });

  currentLibrary = {
    folderPath,
    name: path.basename(folderPath),
    episodes: episodeSummaries,
    selectedEpisodeId: selectedEpisodeId || episodeSummaries[0]?.id || null,
  };

  return currentLibrary;
}

async function preferredVideoForSubtitle(subtitlePath) {
  const folderPath = path.dirname(subtitlePath);
  const subtitleName = path.basename(subtitlePath, path.extname(subtitlePath));
  const baseName = subtitleName.replace(/\.(eng|en|chs|cht|zh|cn|bilingual)$/i, '');
  const entries = await fsp.readdir(folderPath, { withFileTypes: true });
  const match = entries.find((entry) => {
    if (!entry.isFile()) return false;
    const extension = path.extname(entry.name).toLowerCase();
    return VIDEO_EXTENSIONS.has(extension)
      && path.basename(entry.name, extension).toLocaleLowerCase() === baseName.toLocaleLowerCase();
  });
  return match ? path.join(folderPath, match.name) : null;
}

async function openLibraryPath(inputPath) {
  if (typeof inputPath !== 'string' || inputPath.trim() === '') {
    throw new Error('没有收到可打开的文件路径');
  }

  const targetPath = path.resolve(inputPath);
  const stat = await fsp.stat(targetPath);
  let folderPath;
  let preferredVideoPath = null;
  let recentPath;
  let recentKind;

  if (stat.isDirectory()) {
    folderPath = targetPath;
    recentPath = targetPath;
    recentKind = 'folder';
  } else if (stat.isFile() && VIDEO_EXTENSIONS.has(path.extname(targetPath).toLowerCase())) {
    folderPath = path.dirname(targetPath);
    preferredVideoPath = targetPath;
    recentPath = targetPath;
    recentKind = 'video';
  } else if (stat.isFile() && path.extname(targetPath).toLowerCase() === '.srt') {
    folderPath = path.dirname(targetPath);
    preferredVideoPath = await preferredVideoForSubtitle(targetPath);
    if (!preferredVideoPath) throw new Error('没有找到与这个字幕同名的视频');
    recentPath = preferredVideoPath;
    recentKind = 'video';
  } else {
    throw new Error('请选择视频文件、SRT 字幕或包含它们的文件夹');
  }

  const library = await scanLibrary(folderPath, preferredVideoPath);
  if (library.episodes.length === 0) throw new Error('这个文件夹里没有找到支持的视频文件');
  await rememberRecentLibrary(recentPath, recentKind);
  return library;
}

async function openDroppedPaths(inputPaths) {
  if (!Array.isArray(inputPaths)) throw new Error('拖入内容无效');
  const paths = inputPaths.filter((item) => typeof item === 'string' && item.trim() !== '').slice(0, 100);

  for (const candidatePath of paths) {
    if (VIDEO_EXTENSIONS.has(path.extname(candidatePath).toLowerCase())) {
      return openLibraryPath(candidatePath);
    }
  }

  for (const candidatePath of paths) {
    try {
      if ((await fsp.stat(candidatePath)).isDirectory()) return openLibraryPath(candidatePath);
    } catch {
      // Ignore an unreadable dropped item and try the next one.
    }
  }

  const subtitlePath = paths.find((candidatePath) => path.extname(candidatePath).toLowerCase() === '.srt');
  if (subtitlePath) return openLibraryPath(subtitlePath);
  throw new Error('拖入内容中没有找到支持的视频或文件夹');
}

async function createMediaResponse(request, filePath) {
  const stat = await fsp.stat(filePath);
  const size = stat.size;
  const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  const rangeHeader = request.headers.get('range');
  const method = request.method.toUpperCase();

  const baseHeaders = {
    'Accept-Ranges': 'bytes',
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
  };

  if (method === 'HEAD') {
    return new Response(null, {
      status: 200,
      headers: { ...baseHeaders, 'Content-Length': String(size) },
    });
  }

  let start = 0;
  let end = size - 1;
  let status = 200;
  const headers = { ...baseHeaders };

  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
    if (!match) {
      return new Response(null, {
        status: 416,
        headers: { ...headers, 'Content-Range': `bytes */${size}` },
      });
    }

    if (match[1] === '' && match[2] !== '') {
      const suffixLength = Number(match[2]);
      start = Math.max(size - suffixLength, 0);
    } else {
      start = Number(match[1] || 0);
      end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    }

    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
      return new Response(null, {
        status: 416,
        headers: { ...headers, 'Content-Range': `bytes */${size}` },
      });
    }

    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }

  headers['Content-Length'] = String(end - start + 1);
  const nodeStream = fs.createReadStream(filePath, { start, end });
  request.signal.addEventListener('abort', () => nodeStream.destroy(), { once: true });

  return new Response(Readable.toWeb(nodeStream), { status, headers });
}

async function chooseVideoFile(ownerWindow) {
  const result = await dialog.showOpenDialog(ownerWindow, {
    title: '打开视频',
    properties: ['openFile'],
    filters: [
      { name: '视频文件', extensions: [...VIDEO_EXTENSIONS].map((extension) => extension.slice(1)) },
      { name: '所有文件', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return openLibraryPath(result.filePaths[0]);
}

async function chooseVideoFolder(ownerWindow) {
  const result = await dialog.showOpenDialog(ownerWindow, {
    title: '选择包含视频和字幕的文件夹',
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return openLibraryPath(result.filePaths[0]);
}

async function openFromMenu(ownerWindow, chooser) {
  try {
    const library = await chooser(ownerWindow);
    if (library && !ownerWindow.isDestroyed()) ownerWindow.webContents.send('library:opened', library);
  } catch (error) {
    await dialog.showMessageBox(ownerWindow, {
      type: 'error',
      title: '无法打开',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function setApplicationFullscreenState(ownerWindow, isFullscreen) {
  if (!ownerWindow || ownerWindow.isDestroyed()) return;
  if (isFullscreen) applicationFullscreenWindows.add(ownerWindow);
  else applicationFullscreenWindows.delete(ownerWindow);
  const menuItem = Menu.getApplicationMenu()?.getMenuItemById('fullscreen-window');
  if (menuItem) menuItem.checked = isFullscreen;
  ownerWindow.webContents.send('window:fullscreen-changed', isFullscreen);
}

function recentLibrarySubmenu(ownerWindow, recentLibraries) {
  const entries = recentLibraries.length > 0
    ? recentLibraries.map((entry) => ({
        label: entry.label,
        sublabel: entry.path,
        toolTip: entry.path,
        click: () => openFromMenu(ownerWindow, () => openRecentLibrary(entry.path)),
      }))
    : [{ label: '暂无最近打开记录', enabled: false }];

  return [
    ...entries,
    { type: 'separator' },
    {
      label: '清除最近记录',
      enabled: recentLibraries.length > 0,
      click: () => clearRecentLibraries().catch((error) => console.error('Unable to clear recent libraries:', error)),
    },
  ];
}

function createApplicationMenu(ownerWindow, recentLibraries = [], menuState = {}) {
  return Menu.buildFromTemplate([
    {
      label: '文件',
      submenu: [
        {
          label: '打开视频…',
          accelerator: 'CmdOrCtrl+O',
          click: () => openFromMenu(ownerWindow, chooseVideoFile),
        },
        {
          label: '打开视频文件夹…',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => openFromMenu(ownerWindow, chooseVideoFolder),
        },
        {
          label: '最近打开',
          submenu: recentLibrarySubmenu(ownerWindow, recentLibraries),
        },
        { type: 'separator' },
        { label: '退出', role: 'quit' },
      ],
    },
    {
      label: '视图',
      submenu: [
        {
          id: 'bilingual-subtitles',
          label: '显示双语字幕',
          accelerator: 'CmdOrCtrl+B',
          type: 'checkbox',
          checked: Boolean(menuState.bilingualChecked),
          enabled: Boolean(menuState.bilingualEnabled),
          click: (menuItem) => ownerWindow.webContents.send('view:set-bilingual-subtitles', menuItem.checked),
        },
        {
          id: 'transcript-panel',
          label: '显示字幕列表',
          accelerator: 'CmdOrCtrl+Shift+L',
          type: 'checkbox',
          checked: menuState.transcriptPanelChecked !== false,
          click: (menuItem) => ownerWindow.webContents.send('view:set-transcript-panel', menuItem.checked),
        },
        { type: 'separator' },
        {
          id: 'fullscreen-window',
          label: '全屏窗口',
          accelerator: 'F11',
          type: 'checkbox',
          checked: applicationFullscreenWindows.has(ownerWindow),
          click: (menuItem) => {
            const nextValue = !applicationFullscreenWindows.has(ownerWindow);
            ownerWindow.setFullScreen(nextValue);
            menuItem.checked = nextValue;
            setApplicationFullscreenState(ownerWindow, nextValue);
          },
        },
        {
          label: '视频全屏',
          accelerator: 'CmdOrCtrl+Enter',
          click: () => ownerWindow.webContents.send('view:toggle-video-fullscreen'),
        },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于 100LS跟读播放器',
          click: () => ownerWindow.webContents.send('app:show-about'),
        },
      ],
    },
  ]);
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: '#0b1020',
    title: '100LS跟读播放器',
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'darwin' ? {} : {
      titleBarOverlay: {
        color: '#080c18',
        symbolColor: '#cbd4e6',
        height: 40,
      },
    }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = window;
  const recentLibraries = await readRecentLibraries();
  const applicationMenu = createApplicationMenu(window, recentLibraries);
  Menu.setApplicationMenu(applicationMenu);
  if (process.platform !== 'darwin') window.setMenuBarVisibility(false);
  let htmlFullscreenActive = false;
  let applicationFullscreenBeforeHtml = false;
  window.webContents.on('enter-html-full-screen', () => {
    applicationFullscreenBeforeHtml = applicationFullscreenWindows.has(window);
    htmlFullscreenActive = true;
  });
  window.webContents.on('leave-html-full-screen', () => {
    htmlFullscreenActive = false;
    if (!applicationFullscreenBeforeHtml) setApplicationFullscreenState(window, false);
  });
  window.on('enter-full-screen', () => {
    setTimeout(() => {
      if (!htmlFullscreenActive && !applicationFullscreenWindows.has(window)) {
        setApplicationFullscreenState(window, true);
      }
    }, 0);
  });
  window.on('leave-full-screen', () => {
    setTimeout(() => {
      if (!htmlFullscreenActive && applicationFullscreenWindows.has(window)) {
        setApplicationFullscreenState(window, false);
      }
    }, 0);
  });
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(async () => {
  protocol.handle('study-media', async (request) => {
    try {
      const url = new URL(request.url);
      const mediaId = decodeURIComponent(url.pathname.replace(/^\//, ''));
      const filePath = mediaFiles.get(mediaId);
      if (!filePath) return new Response('Media not found', { status: 404 });
      return await createMediaResponse(request, filePath);
    } catch (error) {
      console.error('Unable to stream media:', error);
      return new Response('Unable to stream media', { status: 500 });
    }
  });

  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('library:choose-folder', async (event) => {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender);
  return chooseVideoFolder(ownerWindow);
});

ipcMain.handle('library:choose-video', async (event) => {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender);
  return chooseVideoFile(ownerWindow);
});

ipcMain.handle('library:open-paths', async (_event, inputPaths) => openDroppedPaths(inputPaths));

ipcMain.handle('library:get-recent', async () => readRecentLibraries());

ipcMain.handle('library:open-recent', async (_event, recentPath) => openRecentLibrary(recentPath));

ipcMain.handle('library:clear-recent', async () => {
  await clearRecentLibraries();
  return true;
});

ipcMain.handle('library:load-episode', async (_event, episodeId) => {
  const episode = episodes.get(episodeId);
  if (!episode) throw new Error('Episode not found');
  const playablePath = await preparePlayableVideo(episode.path);
  mediaFiles.set(episode.mediaId, playablePath);
  return {
    id: episode.id,
    title: episode.title,
    fileName: episode.fileName,
    mediaUrl: `study-media://video/${encodeURIComponent(episode.mediaId)}`,
    subtitles: episode.subtitles,
  };
});

ipcMain.handle('library:load-subtitle', async (_event, subtitleId) => {
  const subtitle = subtitles.get(subtitleId);
  if (!subtitle) throw new Error('Subtitle not found');
  return {
    id: subtitle.id,
    label: subtitle.label,
    fileName: subtitle.fileName,
    content: await fsp.readFile(subtitle.path, 'utf8'),
  };
});

ipcMain.handle('dictionary:lookup-entry', async (_event, word) => loadDictionaryEntry(word));

ipcMain.handle('app:get-info', () => ({
  name: app.getName(),
  version: app.getVersion(),
}));

ipcMain.handle('app:open-external', async (_event, value) => {
  const target = new URL(value);
  const isDictionaryUrl = target.protocol === 'https:' && target.hostname === 'dict.youdao.com';
  const isAuthorEmail = target.toString().toLowerCase() === 'mailto:cuitongliang@gmail.com';
  if (!isDictionaryUrl && !isAuthorEmail) {
    throw new Error('External URL is not allowed');
  }
  await shell.openExternal(target.toString());
});

ipcMain.handle('view:set-bilingual-subtitle-menu-state', (_event, value) => {
  const menuItem = Menu.getApplicationMenu()?.getMenuItemById('bilingual-subtitles');
  if (!menuItem) return false;
  menuItem.checked = Boolean(value?.checked);
  menuItem.enabled = Boolean(value?.enabled);
  return true;
});

ipcMain.handle('view:set-transcript-panel-menu-state', (_event, visible) => {
  const menuItem = Menu.getApplicationMenu()?.getMenuItemById('transcript-panel');
  if (!menuItem) return false;
  menuItem.checked = Boolean(visible);
  return true;
});

ipcMain.handle('window:is-fullscreen', (event) => {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender);
  return Boolean(ownerWindow && applicationFullscreenWindows.has(ownerWindow));
});

ipcMain.handle('window:toggle-fullscreen', (event) => {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender);
  if (!ownerWindow) return false;
  const nextValue = !applicationFullscreenWindows.has(ownerWindow);
  ownerWindow.setFullScreen(nextValue);
  setApplicationFullscreenState(ownerWindow, nextValue);
  return nextValue;
});

ipcMain.handle('window:quit', () => {
  app.quit();
});
