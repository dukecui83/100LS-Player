const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('echoLine', {
  chooseFolder: () => ipcRenderer.invoke('library:choose-folder'),
  chooseVideo: () => ipcRenderer.invoke('library:choose-video'),
  openPaths: (paths) => ipcRenderer.invoke('library:open-paths', paths),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  getRecentLibraries: () => ipcRenderer.invoke('library:get-recent'),
  openRecentLibrary: (recentPath) => ipcRenderer.invoke('library:open-recent', recentPath),
  clearRecentLibraries: () => ipcRenderer.invoke('library:clear-recent'),
  loadEpisode: (episodeId) => ipcRenderer.invoke('library:load-episode', episodeId),
  loadSubtitle: (subtitleId) => ipcRenderer.invoke('library:load-subtitle', subtitleId),
  lookupDictionaryEntry: (word) => ipcRenderer.invoke('dictionary:lookup-entry', word),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  onShowAbout: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('app:show-about', listener);
    return () => ipcRenderer.removeListener('app:show-about', listener);
  },
  onLibraryOpened: (callback) => {
    const listener = (_event, library) => callback(library);
    ipcRenderer.on('library:opened', listener);
    return () => ipcRenderer.removeListener('library:opened', listener);
  },
  onRecentLibrariesChanged: (callback) => {
    const listener = (_event, entries) => callback(entries);
    ipcRenderer.on('library:recent-changed', listener);
    return () => ipcRenderer.removeListener('library:recent-changed', listener);
  },
  onToggleVideoFullscreen: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('view:toggle-video-fullscreen', listener);
    return () => ipcRenderer.removeListener('view:toggle-video-fullscreen', listener);
  },
  onSetBilingualSubtitles: (callback) => {
    const listener = (_event, enabled) => callback(Boolean(enabled));
    ipcRenderer.on('view:set-bilingual-subtitles', listener);
    return () => ipcRenderer.removeListener('view:set-bilingual-subtitles', listener);
  },
  setBilingualSubtitleMenuState: (value) => ipcRenderer.invoke('view:set-bilingual-subtitle-menu-state', value),
  onSetTranscriptPanel: (callback) => {
    const listener = (_event, visible) => callback(Boolean(visible));
    ipcRenderer.on('view:set-transcript-panel', listener);
    return () => ipcRenderer.removeListener('view:set-transcript-panel', listener);
  },
  setTranscriptPanelMenuState: (visible) => ipcRenderer.invoke('view:set-transcript-panel-menu-state', visible),
  isWindowFullscreen: () => ipcRenderer.invoke('window:is-fullscreen'),
  toggleWindowFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
  quitApp: () => ipcRenderer.invoke('window:quit'),
  onWindowFullscreenChanged: (callback) => {
    const listener = (_event, isFullscreen) => callback(Boolean(isFullscreen));
    ipcRenderer.on('window:fullscreen-changed', listener);
    return () => ipcRenderer.removeListener('window:fullscreen-changed', listener);
  },
  getPlatform: () => process.platform,
});
