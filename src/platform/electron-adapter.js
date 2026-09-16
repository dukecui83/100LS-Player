export function createElectronAdapter(electronApi) {
  return {
    kind: 'electron',
    os: electronApi.getPlatform(),
    supportsAutomaticSiblingDiscovery: true,

    chooseLibrary: () => electronApi.chooseFolder(),
    chooseVideo: () => electronApi.chooseVideo(),

    async openDrop(dataTransfer) {
      const paths = Array.from(dataTransfer.files || [])
        .map((file) => electronApi.getPathForFile(file))
        .filter(Boolean);
      if (paths.length === 0) throw new Error('没有识别到可打开的本地文件');
      return electronApi.openPaths(paths);
    },

    getRecentLibraries: () => electronApi.getRecentLibraries(),
    openRecentLibrary: (recentPath) => electronApi.openRecentLibrary(recentPath),
    clearRecentLibraries: () => electronApi.clearRecentLibraries(),
    loadEpisode: (episodeId) => electronApi.loadEpisode(episodeId),
    loadSubtitle: (subtitleId) => electronApi.loadSubtitle(subtitleId),
    lookupDictionaryEntry: (word) => electronApi.lookupDictionaryEntry(word),
    openExternal: (url) => electronApi.openExternal(url),
    getAppInfo: () => electronApi.getAppInfo(),
    onShowAbout: (callback) => electronApi.onShowAbout(callback),
    onLibraryOpened: (callback) => electronApi.onLibraryOpened(callback),
    onRecentLibrariesChanged: (callback) => electronApi.onRecentLibrariesChanged(callback),
    onToggleVideoFullscreen: (callback) => electronApi.onToggleVideoFullscreen(callback),
    onSetBilingualSubtitles: (callback) => electronApi.onSetBilingualSubtitles(callback),
    setBilingualSubtitleMenuState: (value) => electronApi.setBilingualSubtitleMenuState(value),
    onSetTranscriptPanel: (callback) => electronApi.onSetTranscriptPanel(callback),
    setTranscriptPanelMenuState: (visible) => electronApi.setTranscriptPanelMenuState(visible),
    isWindowFullscreen: () => electronApi.isWindowFullscreen(),
    toggleWindowFullscreen: () => electronApi.toggleWindowFullscreen(),
    quitApp: () => electronApi.quitApp(),
    onWindowFullscreenChanged: (callback) => electronApi.onWindowFullscreenChanged(callback),

    loadingMessage(fileName) {
      return /\.(mkv|avi)$/i.test(fileName || '')
        ? '正在准备 MKV 播放缓存，首次打开会稍等…'
        : '正在准备视频…';
    },

    noSubtitleMessage: '这个视频没有匹配到 SRT 字幕',
  };
}
