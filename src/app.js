import { evaluateDictation, extractDictationWords } from './core/dictation.js';
import { lookupDictionaryWord, splitDictionaryMeanings, tokenizeSubtitleLine } from './core/dictionary.js';
import { emptyCueRepeat, recordCuePlayback } from './core/cue-repeat.js';
import { formatStudyTime, StudyTimeTracker } from './core/study-time.js';
import {
  isBilingualSubtitleTrack,
  preferredSubtitleTrack,
  subtitleVariantAvailability,
} from './core/subtitle-tracks.js';
import { findCueAtOrAfter, findVisibleCueIndex, formatClock, parseSrt } from './subtitles.js';
import { createPlatformAdapter } from './platform/index.js';

const platform = createPlatformAdapter();
document.documentElement.dataset.platform = platform.kind;
document.documentElement.dataset.os = platform.os || '';

const elements = {
  desktopTitlebar: document.querySelector('#desktopTitlebar'),
  titleMenuButtons: [...document.querySelectorAll('[data-title-menu]')],
  titleMenuPopovers: [...document.querySelectorAll('[data-title-popover]')],
  titleCommandButtons: [...document.querySelectorAll('[data-title-command]')],
  recentMenuTrigger: document.querySelector('#recentMenuTrigger'),
  recentMenuPopover: document.querySelector('#recentMenuPopover'),
  bilingualSubtitleMenuItem: document.querySelector('#bilingualSubtitleMenuItem'),
  transcriptPanelMenuItem: document.querySelector('#transcriptPanelMenuItem'),
  windowFullscreenMenuItem: document.querySelector('#windowFullscreenMenuItem'),
  emptyState: document.querySelector('#emptyState'),
  workspace: document.querySelector('#workspace'),
  workspaceToolbar: document.querySelector('.workspace-toolbar'),
  emptyOpenButton: document.querySelector('#emptyOpenButton'),
  headerActions: document.querySelector('.header-actions'),
  librarySummary: document.querySelector('#librarySummary'),
  libraryName: document.querySelector('#libraryName'),
  studyTimer: document.querySelector('#studyTimer'),
  sessionStudyTime: document.querySelector('#sessionStudyTime'),
  todayStudyTime: document.querySelector('#todayStudyTime'),
  episodeSelect: document.querySelector('#episodeSelect'),
  learningLayout: document.querySelector('#learningLayout'),
  video: document.querySelector('#video'),
  videoShell: document.querySelector('#videoShell'),
  videoPlaceholder: document.querySelector('#videoPlaceholder'),
  subtitleOverlay: document.querySelector('#subtitleOverlay'),
  cueRepeatBadge: document.querySelector('#cueRepeatBadge'),
  cueRepeatCount: document.querySelector('#cueRepeatCount'),
  centerPlay: document.querySelector('#centerPlay'),
  playButton: document.querySelector('#playButton'),
  currentTime: document.querySelector('#currentTime'),
  duration: document.querySelector('#duration'),
  progress: document.querySelector('#progress'),
  fullscreenCurrentTime: document.querySelector('#fullscreenCurrentTime'),
  fullscreenProgress: document.querySelector('#fullscreenProgress'),
  fullscreenDuration: document.querySelector('#fullscreenDuration'),
  volumeButton: document.querySelector('#volumeButton'),
  volume: document.querySelector('#volume'),
  speedSelect: document.querySelector('#speedSelect'),
  fullscreenButton: document.querySelector('#fullscreenButton'),
  overlayToggle: document.querySelector('#overlayToggle'),
  modeButtons: [...document.querySelectorAll('.mode-button')],
  practiceStatus: document.querySelector('#practiceStatus'),
  practiceStatusText: document.querySelector('#practiceStatusText'),
  previousCueButton: document.querySelector('#previousCueButton'),
  nextCueButton: document.querySelector('#nextCueButton'),
  dictationPanel: document.querySelector('#dictationPanel'),
  dictationPrompt: document.querySelector('#dictationPrompt'),
  dictationResult: document.querySelector('#dictationResult'),
  dictationInputs: document.querySelector('#dictationInputs'),
  dictationReplayButton: document.querySelector('#dictationReplayButton'),
  dictationCheckButton: document.querySelector('#dictationCheckButton'),
  dictationNextButton: document.querySelector('#dictationNextButton'),
  transcriptPanel: document.querySelector('#transcriptPanel'),
  transcriptList: document.querySelector('#transcriptList'),
  cueCount: document.querySelector('#cueCount'),
  currentCueLabel: document.querySelector('#currentCueLabel'),
  scrollToCurrentButton: document.querySelector('#scrollToCurrentButton'),
  dropOverlay: document.querySelector('#dropOverlay'),
  toast: document.querySelector('#toast'),
  aboutBackdrop: document.querySelector('#aboutBackdrop'),
  aboutClose: document.querySelector('#aboutClose'),
  aboutConfirm: document.querySelector('#aboutConfirm'),
  aboutEmail: document.querySelector('#aboutEmail'),
  aboutVersion: document.querySelector('#aboutVersion'),
  wordLookupBackdrop: document.querySelector('#wordLookupBackdrop'),
  wordLookupClose: document.querySelector('#wordLookupClose'),
  wordLookupLoading: document.querySelector('#wordLookupLoading'),
  wordLookupContent: document.querySelector('#wordLookupContent'),
  wordLookupWord: document.querySelector('#wordLookupWord'),
  wordLookupPhonetic: document.querySelector('#wordLookupPhonetic'),
  wordLookupForm: document.querySelector('#wordLookupForm'),
  wordLookupMeanings: document.querySelector('#wordLookupMeanings'),
  wordLookupEmpty: document.querySelector('#wordLookupEmpty'),
  wordLookupMore: document.querySelector('#wordLookupMore'),
  wordAudio: document.querySelector('#wordAudio'),
  pronunciationButtons: [...document.querySelectorAll('[data-pronunciation]')],
};

if (platform.kind === 'electron') {
  elements.workspaceToolbar.append(elements.headerActions);
}

function closeTitlebarMenus() {
  const hadOpenMenu = elements.titleMenuButtons.some((button) => button.getAttribute('aria-expanded') === 'true');
  elements.titleMenuButtons.forEach((button) => button.setAttribute('aria-expanded', 'false'));
  elements.titleMenuPopovers.forEach((popover) => { popover.hidden = true; });
  elements.recentMenuTrigger?.setAttribute('aria-expanded', 'false');
  if (elements.recentMenuPopover) elements.recentMenuPopover.hidden = true;
  return hadOpenMenu;
}

async function openAbout() {
  closeTitlebarMenus();
  state.aboutReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  elements.aboutBackdrop.hidden = false;
  elements.aboutClose.focus();
  try {
    const appInfo = await platform.getAppInfo?.();
    elements.aboutVersion.textContent = appInfo?.version ? `版本 ${appInfo.version}` : 'Web 版';
  } catch (error) {
    console.error('Unable to read application information:', error);
    elements.aboutVersion.textContent = '版本信息暂不可用';
  }
}

function closeAbout() {
  if (elements.aboutBackdrop.hidden) return;
  elements.aboutBackdrop.hidden = true;
  state.aboutReturnFocus?.focus?.();
  state.aboutReturnFocus = null;
}

function renderRecentLibraries(entries = []) {
  if (!elements.recentMenuPopover) return;
  elements.recentMenuPopover.replaceChildren();

  if (entries.length === 0) {
    const emptyItem = document.createElement('button');
    emptyItem.type = 'button';
    emptyItem.role = 'menuitem';
    emptyItem.disabled = true;
    const label = document.createElement('span');
    label.textContent = '暂无最近打开记录';
    emptyItem.append(label);
    elements.recentMenuPopover.append(emptyItem);
    return;
  }

  for (const entry of entries) {
    const button = document.createElement('button');
    button.type = 'button';
    button.role = 'menuitem';
    button.className = 'recent-menu-item';
    button.title = entry.path;

    const copy = document.createElement('span');
    copy.className = 'recent-menu-copy';
    const name = document.createElement('strong');
    name.textContent = entry.label;
    const recentPath = document.createElement('small');
    recentPath.textContent = entry.path;
    copy.append(name, recentPath);
    button.append(copy);
    button.addEventListener('click', async () => {
      closeTitlebarMenus();
      try {
        const library = await platform.openRecentLibrary(entry.path);
        if (library?.episodes?.length) await applyLibrary(library);
      } catch (error) {
        console.error('Unable to open recent library:', error);
        showToast('这个最近项目已无法打开', 'error');
        renderRecentLibraries(await platform.getRecentLibraries());
      }
    });
    elements.recentMenuPopover.append(button);
  }

  const separator = document.createElement('div');
  separator.className = 'titlebar-menu-separator';
  separator.role = 'separator';
  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.role = 'menuitem';
  const clearLabel = document.createElement('span');
  clearLabel.textContent = '清除最近记录';
  clearButton.append(clearLabel);
  clearButton.addEventListener('click', async () => {
    await platform.clearRecentLibraries();
    renderRecentLibraries([]);
    closeTitlebarMenus();
  });
  elements.recentMenuPopover.append(separator, clearButton);
}

async function refreshRecentLibraries() {
  try {
    renderRecentLibraries(await platform.getRecentLibraries());
  } catch (error) {
    console.error('Unable to read recent libraries:', error);
    renderRecentLibraries([]);
  }
}

function setWindowFullscreenState(isFullscreen) {
  document.documentElement.classList.toggle('window-fullscreen', isFullscreen);
  elements.windowFullscreenMenuItem?.setAttribute('aria-checked', String(isFullscreen));
}

function setTranscriptPanelVisible(visible) {
  const nextVisible = Boolean(visible);
  state.transcriptPanelVisible = nextVisible;
  elements.transcriptPanel.hidden = !nextVisible;
  elements.learningLayout.classList.toggle('transcript-panel-hidden', !nextVisible);
  elements.transcriptPanelMenuItem?.setAttribute('aria-checked', String(nextVisible));
  platform.setTranscriptPanelMenuState?.(nextVisible).catch((error) => {
    console.error('Unable to sync transcript panel menu state:', error);
  });
}

async function runTitlebarCommand(command) {
  closeTitlebarMenus();
  try {
    if (command === 'open-video') {
      const library = await platform.chooseVideo?.();
      if (library) await applyLibrary(library);
    } else if (command === 'open-folder') {
      await chooseLibrary();
    } else if (command === 'window-fullscreen') {
      setWindowFullscreenState(await platform.toggleWindowFullscreen());
    } else if (command === 'video-fullscreen') {
      toggleVideoFullscreen();
    } else if (command === 'toggle-bilingual') {
      await setBilingualSubtitles(!isActiveSubtitleBilingual());
    } else if (command === 'toggle-transcript-panel') {
      setTranscriptPanelVisible(!state.transcriptPanelVisible);
    } else if (command === 'about') {
      await openAbout();
    } else if (command === 'quit') {
      await platform.quitApp();
    }
  } catch (error) {
    console.error('Titlebar command failed:', error);
    showToast('操作失败，请稍后重试', 'error');
  }
}

const state = {
  library: null,
  episode: null,
  subtitleTracks: [],
  activeSubtitleId: null,
  preferBilingualSubtitles: false,
  transcriptPanelVisible: true,
  cues: [],
  mode: 'continuous',
  activeCueIndex: -1,
  sentenceCueIndex: -1,
  pendingCueSeekIndex: -1,
  cueRepeat: emptyCueRepeat(),
  sentenceRunActive: false,
  autoPaused: false,
  dictationCueIndex: -1,
  dictationWords: [],
  ignoreSyntheticClickUntil: 0,
  aboutReturnFocus: null,
  seekingWithSlider: false,
  toastTimer: null,
  dragDepth: 0,
  lookupRequestId: 0,
  lookupWord: '',
  pronunciationTimer: null,
};

let studyStorage;
try {
  studyStorage = window.localStorage;
} catch {
  studyStorage = null;
}

const studyTimeTracker = new StudyTimeTracker({
  storage: studyStorage,
  onUpdate: ({ sessionMs, todayMs }) => {
    elements.sessionStudyTime.textContent = formatStudyTime(sessionMs);
    elements.todayStudyTime.textContent = formatStudyTime(todayMs);
    elements.studyTimer.title = `本次学习 ${formatStudyTime(sessionMs)} · 今日累计 ${formatStudyTime(todayMs)} · 记录仅保存在本机`;
  },
});

function showToast(message, tone = 'normal') {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.dataset.tone = tone;
  elements.toast.classList.add('visible');
  state.toastTimer = setTimeout(() => elements.toast.classList.remove('visible'), 2600);
}

function appendLookupText(container, line) {
  for (const part of tokenizeSubtitleLine(line)) {
    if (!part.word) {
      container.append(document.createTextNode(part.text));
      continue;
    }
    const wordButton = document.createElement('button');
    wordButton.type = 'button';
    wordButton.className = 'lookup-word';
    wordButton.textContent = part.text;
    wordButton.dataset.word = part.word;
    wordButton.title = `查询 ${part.text}`;
    wordButton.disabled = state.mode === 'dictation';
    wordButton.addEventListener('click', (event) => {
      event.stopPropagation();
      openWordLookup(part.text);
    });
    container.append(wordButton);
  }
}

function closeWordLookup() {
  state.lookupRequestId += 1;
  elements.wordLookupBackdrop.hidden = true;
  document.body.classList.remove('lookup-open');
  clearTimeout(state.pronunciationTimer);
  elements.wordAudio.onerror = null;
  elements.wordAudio.pause();
  elements.wordAudio.removeAttribute('src');
  window.speechSynthesis?.cancel();
}

function setLookupLoading(word) {
  elements.wordLookupBackdrop.hidden = false;
  document.body.classList.add('lookup-open');
  elements.wordLookupLoading.hidden = false;
  elements.wordLookupLoading.textContent = `正在查询 ${word}…`;
  elements.wordLookupContent.hidden = true;
  elements.wordLookupWord.textContent = word;
  elements.wordLookupMeanings.replaceChildren();
  elements.wordLookupForm.hidden = true;
  elements.wordLookupEmpty.hidden = true;
  requestAnimationFrame(() => elements.wordLookupClose.focus());
}

function renderWordLookup(result, query) {
  elements.wordLookupLoading.hidden = true;
  elements.wordLookupContent.hidden = false;
  elements.wordLookupWord.textContent = query;
  elements.wordLookupMeanings.replaceChildren();

  if (!result) {
    elements.wordLookupPhonetic.textContent = '';
    elements.wordLookupForm.hidden = true;
    elements.wordLookupEmpty.hidden = false;
    return;
  }

  const isInflection = result.lemma && result.lemma !== result.query;
  const phonetic = result.entry.phonetic ? `/${result.entry.phonetic.replace(/^\[|\]$/g, '')}/` : '';
  elements.wordLookupPhonetic.textContent = isInflection
    ? `原形 ${result.lemma}${phonetic ? `  ${phonetic}` : ''}`
    : phonetic;

  if (isInflection) {
    const labels = result.formLabels.length > 0 ? result.formLabels.join('、') : '词形变化';
    elements.wordLookupForm.replaceChildren();
    const surface = document.createElement('strong');
    surface.textContent = result.query;
    elements.wordLookupForm.append(surface, document.createTextNode(` 是 ${result.lemma} 的${labels}`));
    elements.wordLookupForm.hidden = false;
  } else {
    elements.wordLookupForm.hidden = true;
  }

  const meanings = splitDictionaryMeanings(result.entry.translation);
  for (const meaning of meanings) {
    const item = document.createElement('li');
    item.textContent = meaning;
    elements.wordLookupMeanings.append(item);
  }
  elements.wordLookupEmpty.hidden = meanings.length > 0;
}

async function openWordLookup(rawWord) {
  if (state.mode === 'dictation') return;
  const requestId = state.lookupRequestId + 1;
  state.lookupRequestId = requestId;
  state.lookupWord = rawWord;
  elements.video.pause();
  setLookupLoading(rawWord);
  try {
    const result = await lookupDictionaryWord(rawWord, platform.lookupDictionaryEntry);
    if (requestId !== state.lookupRequestId) return;
    state.lookupWord = result?.query || rawWord;
    renderWordLookup(result, state.lookupWord);
  } catch (error) {
    console.error('Dictionary lookup failed:', error);
    if (requestId !== state.lookupRequestId) return;
    renderWordLookup(null, rawWord);
    showToast('本地词典读取失败', 'error');
  }
}

function speakWithSystem(word, language) {
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    showToast('当前系统没有可用的英文发音', 'warning');
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = language;
  utterance.rate = 0.88;
  const desiredPrefix = language.toLowerCase();
  const voice = window.speechSynthesis.getVoices().find((item) => item.lang.toLowerCase().startsWith(desiredPrefix));
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
  showToast('在线发音不可用，已切换到系统发音');
}

function playWordPronunciation(type) {
  const word = state.lookupWord;
  if (!word) return;
  const language = type === '1' ? 'en-GB' : 'en-US';
  let fallbackUsed = false;
  const fallback = () => {
    if (fallbackUsed) return;
    fallbackUsed = true;
    clearTimeout(state.pronunciationTimer);
    elements.wordAudio.pause();
    speakWithSystem(word, language);
  };

  clearTimeout(state.pronunciationTimer);
  window.speechSynthesis?.cancel();
  elements.wordAudio.onerror = null;
  elements.wordAudio.pause();
  elements.wordAudio.onerror = fallback;
  elements.wordAudio.src = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${type}`;
  elements.wordAudio.play().catch(fallback);
  state.pronunciationTimer = setTimeout(() => {
    if (elements.wordAudio.readyState === HTMLMediaElement.HAVE_NOTHING) fallback();
  }, 4500);
}

function setLoading(isLoading, message = '正在准备视频…') {
  elements.videoPlaceholder.hidden = !isLoading;
  elements.videoPlaceholder.querySelector('span').textContent = message;
}

async function chooseLibrary() {
  try {
    const library = await platform.chooseLibrary();
    if (!library) return;
    if (library.episodes.length === 0) {
      showToast('这个文件夹里没有找到支持的视频文件', 'warning');
      return;
    }
    await applyLibrary(library);
  } catch (error) {
    console.error(error);
    showToast('读取文件夹失败，请检查文件权限', 'error');
  }
}

async function applyLibrary(library) {
  state.library = library;
  studyTimeTracker.setLearningAvailable(true);
  elements.emptyState.hidden = true;
  elements.workspace.hidden = false;
  elements.librarySummary.hidden = false;
  elements.libraryName.textContent = `${library.name} · ${library.episodes.length} 集`;
  elements.episodeSelect.replaceChildren();

  for (const episode of library.episodes) {
    const option = document.createElement('option');
    option.value = episode.id;
    option.textContent = episode.title;
    elements.episodeSelect.append(option);
  }

  const selectedEpisode = library.episodes.some((episode) => episode.id === library.selectedEpisodeId)
    ? library.selectedEpisodeId
    : library.episodes[0].id;
  await loadEpisode(selectedEpisode);
}

async function openDroppedFiles(dataTransfer) {
  try {
    const library = await platform.openDrop(dataTransfer);
    await applyLibrary(library);
    showToast(`已打开 ${library.episodes.length} 个视频`);
  } catch (error) {
    console.error(error);
    showToast(error instanceof Error ? error.message : '无法打开拖入内容', 'error');
  }
}

function toggleVideoFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else elements.videoShell.requestFullscreen();
}

document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement) return;
  setTimeout(async () => {
    try {
      setWindowFullscreenState(await platform.isWindowFullscreen());
    } catch (error) {
      console.error('Unable to resync window fullscreen state:', error);
    }
  }, 0);
});

async function loadEpisode(episodeId) {
  const summary = state.library?.episodes.find((item) => item.id === episodeId);
  setLoading(true, platform.loadingMessage(summary?.fileName));
  elements.video.pause();
  resetCueState();
  state.subtitleTracks = [];
  state.activeSubtitleId = null;
  syncBilingualSubtitleMenu();

  try {
    const episode = await platform.loadEpisode(episodeId);
    state.episode = episode;
    state.subtitleTracks = episode.subtitles;
    state.activeSubtitleId = null;
    elements.episodeSelect.value = episode.id;
    syncBilingualSubtitleMenu();
    elements.video.src = episode.mediaUrl;
    elements.video.load();

    if (episode.subtitles.length > 0) {
      const preferredTrack = preferredSubtitleTrack(episode.subtitles, state.preferBilingualSubtitles);
      await loadSubtitle(preferredTrack.id);
    } else {
      state.cues = [];
      renderTranscript();
      showToast(platform.noSubtitleMessage, 'warning');
    }
  } catch (error) {
    console.error(error);
    setLoading(true, '视频载入失败');
    showToast('视频载入失败', 'error');
  }
}

function activeSubtitleTrack() {
  return state.subtitleTracks.find((track) => track.id === state.activeSubtitleId) || null;
}

function isActiveSubtitleBilingual() {
  return isBilingualSubtitleTrack(activeSubtitleTrack());
}

function syncBilingualSubtitleMenu() {
  const availability = subtitleVariantAvailability(state.subtitleTracks);
  const menuState = {
    checked: isActiveSubtitleBilingual(),
    enabled: availability.english && availability.bilingual,
  };
  elements.bilingualSubtitleMenuItem.disabled = !menuState.enabled;
  elements.bilingualSubtitleMenuItem.setAttribute('aria-checked', String(menuState.checked));
  platform.setBilingualSubtitleMenuState(menuState).catch((error) => {
    console.error('Unable to update bilingual subtitle menu:', error);
  });
}

async function setBilingualSubtitles(enabled) {
  const availability = subtitleVariantAvailability(state.subtitleTracks);
  if ((enabled && !availability.bilingual) || (!enabled && !availability.english)) {
    showToast(enabled ? '当前视频没有匹配到双语字幕' : '当前视频没有匹配到英文字幕', 'warning');
    syncBilingualSubtitleMenu();
    return;
  }

  state.preferBilingualSubtitles = enabled;
  const target = preferredSubtitleTrack(state.subtitleTracks, enabled);
  if (!target) return;
  if (target.id !== state.activeSubtitleId) await loadSubtitle(target.id);
  else syncBilingualSubtitleMenu();
  showToast(enabled ? '已切换到双语字幕' : '已切换到英文字幕');
}

async function loadSubtitle(subtitleId) {
  try {
    const subtitle = await platform.loadSubtitle(subtitleId);
    state.cues = parseSrt(subtitle.content);
    state.activeSubtitleId = subtitleId;
    state.activeCueIndex = -1;
    state.sentenceCueIndex = findCueAtOrAfter(state.cues, elements.video.currentTime * 1000);
    resetCueRepeatTracking();
    state.dictationCueIndex = -1;
    state.dictationWords = [];
    syncBilingualSubtitleMenu();
    renderTranscript();
    if (state.mode === 'dictation') prepareDictationCue(state.sentenceCueIndex);
    updateTimeline(true);
  } catch (error) {
    console.error(error);
    showToast('字幕载入失败', 'error');
  }
}

function renderTranscript() {
  const fragment = document.createDocumentFragment();
  state.cues.forEach((cue, index) => {
    const row = document.createElement('div');
    row.className = 'cue-row';
    row.dataset.index = String(index);
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', `${formatClock(cue.start)} ${cue.text}`);

    const meta = document.createElement('span');
    meta.className = 'cue-meta';
    meta.innerHTML = `<span class="cue-number">${String(index + 1).padStart(2, '0')}</span><span class="cue-time">${formatClock(cue.start)}</span>`;

    const text = document.createElement('span');
    text.className = 'cue-text';
    cue.lines.forEach((line, lineIndex) => {
      const lineElement = document.createElement('span');
      lineElement.className = `subtitle-line ${lineIndex === cue.lines.length - 1 ? 'primary-line' : 'secondary-line'}`;
      appendLookupText(lineElement, line);
      text.append(lineElement);
    });

    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'cue-play';
    play.textContent = '▶';
    play.setAttribute('aria-label', `播放第 ${index + 1} 句`);
    play.addEventListener('click', (event) => {
      event.stopPropagation();
      playCue(index);
    });

    row.append(meta, text, play);
    row.addEventListener('click', () => playCue(index));
    fragment.append(row);
  });

  elements.transcriptList.replaceChildren(fragment);
  elements.cueCount.textContent = `${state.cues.length} 句`;
  elements.currentCueLabel.textContent = state.cues.length ? '尚未开始' : '没有字幕';
}

function resetCueState() {
  state.cues = [];
  state.activeCueIndex = -1;
  state.sentenceCueIndex = -1;
  state.pendingCueSeekIndex = -1;
  resetCueRepeatTracking();
  state.autoPaused = false;
  state.dictationCueIndex = -1;
  state.dictationWords = [];
  elements.subtitleOverlay.replaceChildren();
  elements.transcriptList.replaceChildren();
  elements.dictationInputs.replaceChildren();
  elements.dictationResult.textContent = '逐词输入你听到的内容';
  elements.cueCount.textContent = '0 句';
  elements.currentCueLabel.textContent = '尚未开始';
}

function isSentenceMode(mode = state.mode) {
  return mode === 'practice' || mode === 'dictation';
}

function updateCueRepeatBadge() {
  const visible = isSentenceMode() && state.cueRepeat.count > 0;
  elements.cueRepeatBadge.hidden = !visible;
  elements.cueRepeatCount.textContent = String(state.cueRepeat.count);
}

function resetCueRepeatTracking() {
  state.cueRepeat = emptyCueRepeat();
  state.sentenceRunActive = false;
  updateCueRepeatBadge();
}

function recordSentencePlayback(index) {
  if (!isSentenceMode() || index < 0 || index >= state.cues.length) return;
  state.cueRepeat = recordCuePlayback(state.cueRepeat, index);
  state.sentenceRunActive = true;
  updateCueRepeatBadge();
}

function dictationInputElements() {
  return [...elements.dictationInputs.querySelectorAll('.dictation-word')];
}

function dictationAnswerElement(input) {
  return input.closest('.dictation-word-slot')?.querySelector('.dictation-answer');
}

function clearDictationWordFeedback(input) {
  input.classList.remove('correct', 'incorrect');
  input.removeAttribute('aria-invalid');
  const answer = dictationAnswerElement(input);
  if (answer) answer.hidden = true;
}

function setDictationInputsDisabled(disabled) {
  dictationInputElements().forEach((input) => { input.disabled = disabled; });
}

function focusFirstEmptyDictationWord() {
  const inputs = dictationInputElements();
  const target = inputs.find((input) => input.value.trim() === '') || inputs[0];
  target?.focus();
}

function prepareDictationCue(index) {
  if (index < 0 || index >= state.cues.length) return;
  if (state.dictationCueIndex === index && elements.dictationInputs.childElementCount > 0) return;

  const words = extractDictationWords(state.cues[index].text);
  state.dictationCueIndex = index;
  state.dictationWords = words;
  elements.dictationInputs.replaceChildren();
  elements.dictationResult.textContent = words.length > 0
    ? `共 ${words.length} 个单词`
    : '本句没有可听写的英文单词';

  words.forEach((word, wordIndex) => {
    const slot = document.createElement('label');
    slot.className = 'dictation-word-slot';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'dictation-word';
    input.dataset.index = String(wordIndex);
    input.placeholder = String(wordIndex + 1);
    input.autocomplete = 'off';
    input.autocapitalize = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', `第 ${wordIndex + 1} 个单词`);

    const answer = document.createElement('span');
    answer.className = 'dictation-answer';
    answer.id = `dictation-answer-${wordIndex}`;
    answer.textContent = `正确：${word}`;
    answer.hidden = true;
    input.setAttribute('aria-describedby', answer.id);

    input.addEventListener('input', () => {
      clearDictationWordFeedback(input);
      const pastedWords = input.value.trim().split(/\s+/).filter(Boolean);
      if (pastedWords.length <= 1) return;
      const inputs = dictationInputElements();
      pastedWords.forEach((value, offset) => {
        const target = inputs[wordIndex + offset];
        if (!target) return;
        target.value = value;
        clearDictationWordFeedback(target);
      });
      inputs[Math.min(wordIndex + pastedWords.length, inputs.length - 1)]?.focus();
    });

    input.addEventListener('keydown', (event) => {
      const inputs = dictationInputElements();
      if (event.key === 'Enter') {
        event.preventDefault();
        checkDictation();
      } else if (event.key === ' ' || (event.key === 'ArrowRight' && input.selectionStart === input.value.length)) {
        event.preventDefault();
        inputs[wordIndex + 1]?.focus();
      } else if ((event.key === 'Backspace' && input.value === '') || (event.key === 'ArrowLeft' && input.selectionStart === 0)) {
        event.preventDefault();
        inputs[wordIndex - 1]?.focus();
      }
    });
    slot.append(input, answer);
    elements.dictationInputs.append(slot);
  });

  setDictationInputsDisabled(!elements.video.paused);
}

function checkDictation() {
  const inputs = dictationInputElements();
  const score = evaluateDictation(state.dictationWords, inputs.map((input) => input.value));
  score.results.forEach((result, index) => {
    const input = inputs[index];
    if (!input) return;
    input.classList.toggle('correct', result.correct);
    input.classList.toggle('incorrect', !result.correct);
    input.setAttribute('aria-invalid', String(!result.correct));
    const answer = dictationAnswerElement(input);
    if (answer) answer.hidden = result.correct;
  });
  elements.dictationResult.textContent = `正确 ${score.correctCount} / ${score.totalCount}`;
  if (score.totalCount > 0 && score.correctCount === score.totalCount) showToast('本句听写全部正确');
}

function setMode(mode) {
  state.mode = mode;
  state.autoPaused = false;
  state.sentenceCueIndex = findCueAtOrAfter(state.cues, elements.video.currentTime * 1000);
  resetCueRepeatTracking();
  elements.modeButtons.forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
  elements.practiceStatus.hidden = mode !== 'practice';
  elements.dictationPanel.hidden = mode !== 'dictation';
  document.body.classList.toggle('dictation-mode', mode === 'dictation');
  document.querySelectorAll('.lookup-word').forEach((button) => { button.disabled = mode === 'dictation'; });
  if (mode === 'dictation' && !elements.wordLookupBackdrop.hidden) closeWordLookup();
  elements.overlayToggle.disabled = mode === 'dictation';
  elements.overlayToggle.closest('.toggle-control')?.classList.toggle('disabled', mode === 'dictation');

  if (mode === 'practice') {
    elements.practiceStatusText.textContent = '逐句模式：播放到本句结尾后自动暂停';
    showToast('已切换到逐句跟读模式');
  } else if (mode === 'dictation') {
    elements.video.pause();
    prepareDictationCue(state.sentenceCueIndex);
    elements.dictationPrompt.textContent = '播放本句，句尾会自动暂停';
    showToast('已切换到听写模式，字幕答案已隐藏');
  } else {
    showToast('已切换到连续播放模式');
  }
}

function getControlCueIndex() {
  if (isSentenceMode() && state.sentenceCueIndex >= 0) return state.sentenceCueIndex;
  if (state.activeCueIndex >= 0) return state.activeCueIndex;
  return findCueAtOrAfter(state.cues, elements.video.currentTime * 1000);
}

async function safePlay() {
  try {
    await elements.video.play();
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);
    setLoading(true, `无法播放：${message}`);
    showToast(`无法开始播放：${message}`, 'error');
  }
}

async function playCue(index, { preserveDictation = false } = {}) {
  if (index < 0 || index >= state.cues.length) return;
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  const cue = state.cues[index];
  state.sentenceCueIndex = index;
  state.pendingCueSeekIndex = index;
  state.autoPaused = false;
  recordSentencePlayback(index);
  if (state.mode === 'dictation' && (!preserveDictation || state.dictationCueIndex !== index)) {
    state.dictationCueIndex = -1;
    prepareDictationCue(index);
  }
  elements.video.currentTime = cue.start / 1000;
  setActiveCue(index, true);
  await safePlay();
}

function replayCurrentCue() {
  const index = getControlCueIndex();
  if (index >= 0) playCue(index, { preserveDictation: true });
}

function playPreviousCue() {
  const index = getControlCueIndex();
  if (index < 0) return;
  playCue(Math.max(index - 1, 0));
}

function playNextCue() {
  const index = getControlCueIndex();
  if (index < 0) return;
  playCue(Math.min(index + 1, state.cues.length - 1));
}

function togglePlayback() {
  if (!elements.video.src) return;
  if (!elements.video.paused) {
    state.autoPaused = false;
    elements.video.pause();
    return;
  }

  if (isSentenceMode() && state.autoPaused) {
    replayCurrentCue();
    return;
  }

  if (isSentenceMode()) {
    state.sentenceCueIndex = findCueAtOrAfter(state.cues, elements.video.currentTime * 1000);
    if (!state.sentenceRunActive || state.cueRepeat.cueIndex !== state.sentenceCueIndex) {
      recordSentencePlayback(state.sentenceCueIndex);
    }
  }
  state.autoPaused = false;
  safePlay();
}

function setActiveCue(index, forceScroll = false) {
  if (state.activeCueIndex === index && !forceScroll) return;

  if (state.activeCueIndex >= 0) {
    elements.transcriptList.querySelector(`[data-index="${state.activeCueIndex}"]`)?.classList.remove('active');
  }

  state.activeCueIndex = index;
  const cue = state.cues[index];
  if (!cue) {
    elements.subtitleOverlay.replaceChildren();
    return;
  }

  const row = elements.transcriptList.querySelector(`[data-index="${index}"]`);
  row?.classList.add('active');
  if (row && (forceScroll || !isElementMostlyVisible(row, elements.transcriptList))) {
    row.scrollIntoView({ behavior: forceScroll ? 'smooth' : 'auto', block: 'center' });
  }

  elements.subtitleOverlay.replaceChildren();
  cue.lines.forEach((line, lineIndex) => {
    const lineElement = document.createElement('div');
    lineElement.className = `subtitle-line ${lineIndex === cue.lines.length - 1 ? 'overlay-primary' : 'overlay-secondary'}`;
    appendLookupText(lineElement, line);
    elements.subtitleOverlay.append(lineElement);
  });
  elements.currentCueLabel.textContent = `第 ${index + 1} / ${state.cues.length} 句`;
}

function isElementMostlyVisible(element, container) {
  const elementRect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  return elementRect.top >= containerRect.top + 24 && elementRect.bottom <= containerRect.bottom - 24;
}

function updateTimeline(force = false) {
  if (!Number.isFinite(elements.video.duration)) return;
  const positionMs = elements.video.currentTime * 1000;
  let pausedAtCueEnd = false;

  if (isSentenceMode() && !elements.video.paused && state.sentenceCueIndex >= 0) {
    const targetCue = state.cues[state.sentenceCueIndex];
    if (targetCue && positionMs >= targetCue.end - 12) {
      state.autoPaused = true;
      state.sentenceRunActive = false;
      pausedAtCueEnd = true;
      elements.video.pause();
      if (positionMs >= targetCue.end) {
        const finalFrameTime = Math.max(targetCue.start, targetCue.end - 20);
        elements.video.currentTime = finalFrameTime / 1000;
      }
      if (state.mode === 'practice') {
        elements.practiceStatusText.textContent = '本句已完成。按空格重播，按 ↓ 播放下一句';
      } else if (state.mode === 'dictation') {
        elements.dictationPrompt.textContent = '本句已暂停，请逐词输入听到的内容';
        setTimeout(focusFirstEmptyDictationWord, 0);
      }
    }
  }

  const heldCueIndex = isSentenceMode() && state.autoPaused
    ? state.sentenceCueIndex
    : -1;
  const cueIndex = findVisibleCueIndex(state.cues, positionMs, heldCueIndex);
  setActiveCue(cueIndex, force || pausedAtCueEnd);

  const currentClock = formatClock(positionMs);
  const durationClock = formatClock(elements.video.duration * 1000);
  elements.currentTime.textContent = currentClock;
  elements.fullscreenCurrentTime.textContent = currentClock;
  elements.duration.textContent = durationClock;
  elements.fullscreenDuration.textContent = durationClock;
  if (!state.seekingWithSlider) {
    const progressValue = String(Math.round((elements.video.currentTime / elements.video.duration) * 1000) || 0);
    elements.progress.value = progressValue;
    elements.fullscreenProgress.value = progressValue;
  }

}

function updatePlaybackUi() {
  const isPlaying = !elements.video.paused;
  studyTimeTracker.setPlaybackActive(isPlaying);
  document.body.classList.toggle('is-playing', isPlaying);
  elements.centerPlay.hidden = isPlaying;
  elements.playButton.setAttribute('aria-label', isPlaying ? '暂停' : '播放');
  if (isPlaying && state.mode === 'practice') {
    elements.practiceStatusText.textContent = '正在播放本句，句末将自动暂停';
  } else if (!state.autoPaused && state.mode === 'practice') {
    elements.practiceStatusText.textContent = '逐句模式：播放到本句结尾后自动暂停';
  }
  if (state.mode === 'dictation') {
    elements.dictationPrompt.textContent = isPlaying
      ? '正在播放本句，句尾将自动暂停'
      : state.autoPaused
        ? '本句已暂停，请逐词输入听到的内容'
        : '播放本句，句尾会自动暂停';
    setDictationInputsDisabled(isPlaying);
  }
}

function startFrameLoop() {
  if (!('requestVideoFrameCallback' in elements.video)) return;
  const onFrame = () => {
    updateTimeline();
    elements.video.requestVideoFrameCallback(onFrame);
  };
  elements.video.requestVideoFrameCallback(onFrame);
}

elements.emptyOpenButton.addEventListener('click', chooseLibrary);
elements.titleMenuButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const menuName = button.dataset.titleMenu;
    const popover = elements.titleMenuPopovers.find((item) => item.dataset.titlePopover === menuName);
    const shouldOpen = button.getAttribute('aria-expanded') !== 'true';
    closeTitlebarMenus();
    if (!shouldOpen || !popover) return;
    button.setAttribute('aria-expanded', 'true');
    popover.hidden = false;
    if (menuName === 'file') refreshRecentLibraries();
  });
});
elements.recentMenuTrigger?.addEventListener('click', (event) => {
  event.stopPropagation();
  const shouldOpen = elements.recentMenuTrigger.getAttribute('aria-expanded') !== 'true';
  elements.recentMenuTrigger.setAttribute('aria-expanded', String(shouldOpen));
  elements.recentMenuPopover.hidden = !shouldOpen;
  if (shouldOpen) refreshRecentLibraries();
});
elements.titleCommandButtons.forEach((button) => {
  button.addEventListener('click', () => runTitlebarCommand(button.dataset.titleCommand));
});
document.addEventListener('pointerdown', (event) => {
  if (!(event.target instanceof Element) || !event.target.closest('.titlebar-menu-group')) closeTitlebarMenus();
});
elements.episodeSelect.addEventListener('change', (event) => loadEpisode(event.target.value));
elements.modeButtons.forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
elements.overlayToggle.addEventListener('change', () => {
  elements.subtitleOverlay.classList.toggle('hidden', !elements.overlayToggle.checked);
});
elements.playButton.addEventListener('click', togglePlayback);
elements.centerPlay.addEventListener('click', togglePlayback);
elements.video.addEventListener('click', togglePlayback);
elements.video.addEventListener('play', updatePlaybackUi);
elements.video.addEventListener('pause', updatePlaybackUi);
elements.video.addEventListener('timeupdate', updateTimeline);
elements.video.addEventListener('loadedmetadata', () => {
  setLoading(false);
  elements.duration.textContent = formatClock(elements.video.duration * 1000);
  elements.fullscreenDuration.textContent = formatClock(elements.video.duration * 1000);
  state.sentenceCueIndex = findCueAtOrAfter(state.cues, 0);
  if (state.mode === 'dictation') prepareDictationCue(state.sentenceCueIndex);
  updateTimeline(true);
});
elements.video.addEventListener('error', () => {
  const mediaError = elements.video.error;
  const detail = mediaError ? `错误 ${mediaError.code}：${mediaError.message || '媒体格式无法解码'}` : '未知媒体错误';
  console.error('Video playback error:', detail);
  setLoading(true, detail);
  showToast(`视频播放失败（${detail}）`, 'error');
});
elements.video.addEventListener('seeked', () => {
  if (state.pendingCueSeekIndex >= 0) {
    state.sentenceCueIndex = state.pendingCueSeekIndex;
    state.pendingCueSeekIndex = -1;
  } else if (!state.autoPaused) {
    state.sentenceCueIndex = findCueAtOrAfter(state.cues, elements.video.currentTime * 1000);
  }
  if (state.mode === 'dictation') prepareDictationCue(state.sentenceCueIndex);
  updateTimeline(true);
});
function bindProgressControl(progressElement, currentTimeElement) {
  progressElement.addEventListener('pointerdown', () => { state.seekingWithSlider = true; });
  progressElement.addEventListener('input', () => {
    if (!Number.isFinite(elements.video.duration)) return;
    const target = (Number(progressElement.value) / 1000) * elements.video.duration;
    currentTimeElement.textContent = formatClock(target * 1000);
  });
  progressElement.addEventListener('change', () => {
    if (Number.isFinite(elements.video.duration)) {
      state.pendingCueSeekIndex = -1;
      state.autoPaused = false;
      const targetTime = (Number(progressElement.value) / 1000) * elements.video.duration;
      state.sentenceCueIndex = findCueAtOrAfter(state.cues, targetTime * 1000);
      resetCueRepeatTracking();
      if (state.mode === 'dictation') {
        state.dictationCueIndex = -1;
        prepareDictationCue(state.sentenceCueIndex);
      }
      elements.video.currentTime = targetTime;
    }
    state.seekingWithSlider = false;
  });
}

bindProgressControl(elements.progress, elements.currentTime);
bindProgressControl(elements.fullscreenProgress, elements.fullscreenCurrentTime);
elements.volume.addEventListener('input', () => {
  elements.video.volume = Number(elements.volume.value);
  elements.video.muted = false;
});
elements.volumeButton.addEventListener('click', () => {
  elements.video.muted = !elements.video.muted;
  elements.volumeButton.classList.toggle('muted', elements.video.muted);
});
elements.speedSelect.addEventListener('change', () => {
  elements.video.playbackRate = Number(elements.speedSelect.value);
});
elements.fullscreenButton.addEventListener('click', () => {
  toggleVideoFullscreen();
});
elements.previousCueButton.addEventListener('click', playPreviousCue);
elements.nextCueButton.addEventListener('click', playNextCue);
elements.dictationReplayButton.addEventListener('click', replayCurrentCue);
elements.dictationCheckButton.addEventListener('click', checkDictation);
elements.dictationNextButton.addEventListener('click', playNextCue);
elements.scrollToCurrentButton.addEventListener('click', () => {
  if (state.activeCueIndex >= 0) setActiveCue(state.activeCueIndex, true);
});
elements.aboutClose.addEventListener('click', closeAbout);
elements.aboutConfirm.addEventListener('click', closeAbout);
elements.aboutBackdrop.addEventListener('click', (event) => {
  if (event.target === elements.aboutBackdrop) closeAbout();
});
elements.aboutEmail.addEventListener('click', async () => {
  try {
    await platform.openExternal('mailto:cuitongliang@gmail.com');
  } catch (error) {
    console.error('Unable to open email client:', error);
    showToast('无法打开邮件应用', 'error');
  }
});
elements.wordLookupClose.addEventListener('click', closeWordLookup);
elements.wordLookupBackdrop.addEventListener('click', (event) => {
  if (event.target === elements.wordLookupBackdrop) closeWordLookup();
});
elements.pronunciationButtons.forEach((button) => {
  button.addEventListener('click', () => playWordPronunciation(button.dataset.pronunciation));
});
elements.wordLookupMore.addEventListener('click', async () => {
  const word = state.lookupWord;
  if (!word) return;
  try {
    await platform.openExternal(`https://dict.youdao.com/w/${encodeURIComponent(word)}/`);
  } catch (error) {
    console.error('Unable to open dictionary source:', error);
    showToast('无法打开有道词典', 'error');
  }
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && closeTitlebarMenus()) {
    event.preventDefault();
    return;
  }
  if (!elements.aboutBackdrop.hidden) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeAbout();
    }
    return;
  }
  if (!elements.wordLookupBackdrop.hidden) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeWordLookup();
    }
    return;
  }
  const target = event.target;
  const isFormControl = target instanceof HTMLInputElement
    || target instanceof HTMLSelectElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLButtonElement
    || target instanceof HTMLAnchorElement;
  if (isFormControl) return;

  const action =
    (platform.kind === 'web' && (event.ctrlKey || event.metaKey) && event.code === 'KeyB') ? 'bilingual' :
    (event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar') ? 'toggle' :
    (event.code === 'ArrowUp' || event.key === 'ArrowUp') ? 'previous' :
    (event.code === 'ArrowDown' || event.key === 'ArrowDown') ? 'next' :
    (event.code === 'KeyS' || event.key?.toLowerCase() === 's') ? 'subtitles' :
    null;
  if (!action) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  state.ignoreSyntheticClickUntil = performance.now() + 500;
  if (target instanceof HTMLElement) target.blur();

  if (action === 'toggle') {
    togglePlayback();
  } else if (action === 'previous') {
    playPreviousCue();
  } else if (action === 'next') {
    playNextCue();
  } else if (action === 'subtitles') {
    if (state.mode === 'dictation') return;
    elements.overlayToggle.checked = !elements.overlayToggle.checked;
    elements.overlayToggle.dispatchEvent(new Event('change'));
  } else if (action === 'bilingual') {
    setBilingualSubtitles(!isActiveSubtitleBilingual());
  }
}, { capture: true });

window.addEventListener('keyup', (event) => {
  if (performance.now() < state.ignoreSyntheticClickUntil) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, { capture: true });

window.addEventListener('click', (event) => {
  if (performance.now() < state.ignoreSyntheticClickUntil) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, { capture: true });

window.addEventListener('dragenter', (event) => {
  if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
  event.preventDefault();
  state.dragDepth += 1;
  elements.dropOverlay.hidden = false;
});

window.addEventListener('dragover', (event) => {
  if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
});

window.addEventListener('dragleave', (event) => {
  if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
  state.dragDepth = Math.max(0, state.dragDepth - 1);
  if (state.dragDepth === 0) elements.dropOverlay.hidden = true;
});

window.addEventListener('drop', (event) => {
  event.preventDefault();
  state.dragDepth = 0;
  elements.dropOverlay.hidden = true;
  if (event.dataTransfer?.files?.length || event.dataTransfer?.items?.length) openDroppedFiles(event.dataTransfer);
});

async function initialize() {
  studyTimeTracker.start();
  studyTimeTracker.setAppActive(document.visibilityState === 'visible' && document.hasFocus());
  startFrameLoop();
  platform.onLibraryOpened(async (library) => {
    if (library?.episodes?.length) await applyLibrary(library);
  });
  platform.onRecentLibrariesChanged(renderRecentLibraries);
  platform.onToggleVideoFullscreen(toggleVideoFullscreen);
  platform.onSetBilingualSubtitles(setBilingualSubtitles);
  platform.onSetTranscriptPanel(setTranscriptPanelVisible);
  platform.onShowAbout(openAbout);
  platform.onWindowFullscreenChanged(setWindowFullscreenState);
  try {
    setTranscriptPanelVisible(true);
    setWindowFullscreenState(await platform.isWindowFullscreen());
    await refreshRecentLibraries();
  } catch (error) {
    console.error('Unable to initialize desktop state:', error);
  }
}

for (const eventName of ['pointerdown', 'keydown', 'wheel', 'input']) {
  window.addEventListener(eventName, () => studyTimeTracker.noteActivity(), { capture: true, passive: true });
}
window.addEventListener('focus', () => studyTimeTracker.setAppActive(true));
window.addEventListener('blur', () => studyTimeTracker.setAppActive(false));
document.addEventListener('visibilitychange', () => {
  studyTimeTracker.setAppActive(document.visibilityState === 'visible' && document.hasFocus());
});
window.addEventListener('beforeunload', () => {
  clearTimeout(state.pronunciationTimer);
  window.speechSynthesis?.cancel();
  studyTimeTracker.dispose();
  platform.dispose?.();
});

initialize();
