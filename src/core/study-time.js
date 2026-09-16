const STORAGE_KEY = 'echoline.study-time.v1';

export function studyDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatStudyTime(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function loadLedger(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed.days === 'object' ? parsed.days : {};
  } catch {
    return {};
  }
}

export class StudyTimeTracker {
  constructor({
    storage,
    now = () => Date.now(),
    inactivityMs = 2 * 60 * 1000,
    onUpdate = () => {},
  } = {}) {
    this.storage = storage;
    this.now = now;
    this.inactivityMs = inactivityMs;
    this.onUpdate = onUpdate;
    this.days = loadLedger(storage);
    this.sessionMs = 0;
    this.learningAvailable = false;
    this.appActive = true;
    this.playbackActive = false;
    this.lastActivityAt = this.now();
    this.lastTickAt = this.now();
    this.intervalId = null;
    this.unsavedMs = 0;
  }

  getSnapshot(at = this.now()) {
    const key = studyDateKey(new Date(at));
    return {
      sessionMs: this.sessionMs,
      todayMs: Number(this.days[key] || 0),
    };
  }

  setLearningAvailable(value) {
    this.learningAvailable = Boolean(value);
    this.noteActivity();
  }

  setAppActive(value) {
    this.tick();
    this.appActive = Boolean(value);
    this.lastTickAt = this.now();
  }

  setPlaybackActive(value) {
    this.tick();
    this.playbackActive = Boolean(value);
    if (this.playbackActive) this.noteActivity();
  }

  noteActivity() {
    this.lastActivityAt = this.now();
  }

  shouldCount(at) {
    return this.learningAvailable
      && this.appActive
      && (this.playbackActive || at - this.lastActivityAt <= this.inactivityMs);
  }

  tick(at = this.now()) {
    const elapsed = Math.max(0, Math.min(at - this.lastTickAt, 2000));
    this.lastTickAt = at;
    if (elapsed > 0 && this.shouldCount(at)) {
      const key = studyDateKey(new Date(at));
      this.sessionMs += elapsed;
      this.days[key] = Number(this.days[key] || 0) + elapsed;
      this.unsavedMs += elapsed;
      if (this.unsavedMs >= 10000) this.persist();
    }
    const snapshot = this.getSnapshot(at);
    this.onUpdate(snapshot);
    return snapshot;
  }

  persist() {
    try {
      const recentEntries = Object.entries(this.days).sort(([left], [right]) => right.localeCompare(left)).slice(0, 90);
      this.days = Object.fromEntries(recentEntries);
      this.storage?.setItem(STORAGE_KEY, JSON.stringify({ days: this.days }));
      this.unsavedMs = 0;
    } catch {
      // A private browser profile can deny storage; the current session still works.
    }
  }

  start() {
    if (this.intervalId !== null) return;
    this.onUpdate(this.getSnapshot());
    this.intervalId = setInterval(() => this.tick(), 1000);
  }

  dispose() {
    if (this.intervalId !== null) clearInterval(this.intervalId);
    this.intervalId = null;
    this.tick();
    this.persist();
  }
}
