export type ShowMode = 'starting' | 'intro';

// Only the native obs-browser surface needed here; no streaming/recording API.
export interface NativeObsBridge {
  getControlLevel?: (callback: (level: number) => void) => void;
  getCurrentScene?: (callback: (scene: { name: string; width?: number; height?: number }) => void) => void;
  getScenes?: (callback: (scenes: string[]) => void) => void;
  setCurrentScene?: (name: string) => void;
}
export interface ShowSequenceWindow extends Window { obsstudio?: NativeObsBridge }

export interface ShowOptions {
  countdown: number;
  auto: boolean;
  sound: boolean;
  media: boolean;
  volume: number;
  music?: string;
  startingScene: string;
  introScene: string;
  liveScene: string;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const numeric = (value: string | null, fallback: number, min: number, max: number) =>
  value?.trim() && Number.isFinite(Number(value)) ? clamp(Number(value), min, max) : fallback;

export function safeMusicUrl(value: string | null, origin: string): string | undefined {
  if (!value || value.length > 2048) return undefined;
  try {
    const url = new URL(value, origin);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443') return undefined;
    // Reject local/intranet names and IP literals, including alternate numeric IPv4 forms.
    if (!host.includes('.') || host.includes(':') || host.includes('[') || /^[\d.]+$/.test(host)
      || /(^|\.)(localhost|local|internal|lan|home|test|invalid)$/.test(host)) return undefined;
    return url.href;
  } catch { return undefined; }
}

export function parseShowOptions(search: string, origin: string): ShowOptions {
  const query = new URLSearchParams(search);
  const requestedMusic = query.get('music')?.trim();
  const music = safeMusicUrl(requestedMusic ?? null, origin);
  const scene = (key: string, fallback: string) => {
    const value = query.get(key)?.trim();
    return value && value.length <= 64 && ![...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ? value : fallback;
  };
  return {
    countdown: numeric(query.get('countdown'), 300, 1, 3600),
    auto: query.get('auto') === '1', sound: query.get('sound') === '1' && (!requestedMusic || !!music), media: query.get('media') !== '0',
    volume: numeric(query.get('volume'), 0.7, 0, 1),
    music,
    startingScene: scene('startingScene', 'STARTING'),
    introScene: scene('introScene', 'INTRO'), liveScene: scene('liveScene', 'LIVE'),
  };
}

export function countdownDisplay(remaining: number, total: number) {
  const seconds = Math.ceil(Math.max(0, remaining));
  return {
    seconds, urgent: seconds <= 10,
    text: seconds <= 10 ? String(seconds) : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
    progress: clamp(remaining / total, 0, 1),
    scale: seconds <= 10 ? 1 + 0.22 * clamp((10 - remaining) / 10, 0, 1) : 1,
  };
}

export interface SequenceSnapshot {
  active: boolean;
  remaining: number;
  introTime: number;
  transitioned: boolean;
  status: 'preview' | 'waiting' | 'ready' | 'manual' | 'blocked' | 'complete' | 'media-error';
}
interface SavedSequence { remaining: number; savedAt: number; deadline: number; introTime: number; transitioned: boolean; paused: boolean }
interface SequenceEnvironment {
  bridge?: NativeObsBridge;
  events: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  monotonic: () => number;
  wall: () => number;
  storageKey?: string;
}

export class ShowSequenceController {
  readonly mode: ShowMode;
  readonly options: ShowOptions;
  readonly environment: SequenceEnvironment;
  snapshot: SequenceSnapshot;
  private expected: string;
  private key: string;
  private currentScene?: string;
  private sourceActive?: boolean;
  private sourceVisible?: boolean;
  private control = 0;
  private epoch = 0;
  private sceneVersion = 0;
  private disposed = false;
  private pending = false;
  private failed = false;
  private initialized = false;
  private lastTick = 0;
  private lastSave = -Infinity;
  private notify: (snapshot: SequenceSnapshot) => void;

  constructor(mode: ShowMode, options: ShowOptions, environment: SequenceEnvironment, notify: (snapshot: SequenceSnapshot) => void) {
    this.mode = mode; this.options = options; this.environment = environment; this.notify = notify;
    this.expected = mode === 'starting' ? options.startingScene : options.introScene;
    this.key = environment.storageKey ?? `obs-show:v1:${mode}:${this.expected}:${options.countdown}`;
    this.snapshot = { active: false, remaining: options.countdown, introTime: 0, transitioned: false, status: environment.bridge ? 'waiting' : 'preview' };
  }

  start() {
    this.environment.events.addEventListener('obsSceneChanged', this.onScene);
    this.environment.events.addEventListener('obsSourceActiveChanged', this.onActive);
    this.environment.events.addEventListener('obsSourceVisibleChanged', this.onVisible);
    if (!this.environment.bridge) { this.reconcile(); return; }
    try {
      this.environment.bridge.getControlLevel?.(level => {
        if (this.disposed) return;
        this.control = level;
        if (level < 2) { this.snapshot.status = 'blocked'; this.publish(); return; }
        const sceneVersion = this.sceneVersion;
        this.environment.bridge?.getCurrentScene?.(scene => {
          if (this.disposed || sceneVersion !== this.sceneVersion) return;
          if (scene.name !== this.expected) this.clear();
          this.currentScene = scene.name; this.reconcile();
        });
      });
    } catch { this.snapshot.status = 'blocked'; this.publish(); }
  }

  private onScene = (event: Event) => {
    const name: unknown = (event as CustomEvent<{ name?: unknown }>).detail?.name;
    if (typeof name !== 'string' || name === this.currentScene) return;
    this.epoch++; this.sceneVersion++; this.pending = false;
    if (name !== this.expected) {
      this.clear(); this.initialized = false; this.pending = false; this.failed = false;
      this.snapshot = { ...this.snapshot, remaining: this.options.countdown, introTime: 0, transitioned: false };
    }
    this.currentScene = name; this.reconcile();
  };
  private onActive = (event: Event) => {
    const active: unknown = (event as CustomEvent<{ active?: unknown }>).detail?.active;
    if (typeof active === 'boolean' && active !== this.sourceActive) { this.sourceActive = active; this.epoch++; this.pending = false; this.reconcile(); }
  };
  private onVisible = (event: Event) => {
    const visible: unknown = (event as CustomEvent<{ visible?: unknown }>).detail?.visible;
    if (typeof visible === 'boolean' && visible !== this.sourceVisible) { this.sourceVisible = visible; this.epoch++; this.pending = false; this.reconcile(); }
  };

  private reconcile() {
    if (this.disposed) return;
    const active = !this.environment.bridge || (this.control >= 2 && this.currentScene === this.expected
      && this.sourceActive !== false && this.sourceVisible !== false);
    if (active && !this.initialized) { this.restore(); this.initialized = true; }
    if (active !== this.snapshot.active) {
      if (!active && this.initialized) this.save(true);
      this.lastTick = this.environment.monotonic();
    }
    this.snapshot.active = active;
    this.snapshot.status = this.failed ? 'media-error' : this.snapshot.transitioned ? 'complete'
      : !this.environment.bridge ? 'preview' : !active ? 'waiting'
        : !this.options.auto ? 'manual' : this.control < 4 ? 'blocked' : 'ready';
    this.publish();
  }

  tick() {
    if (this.disposed || !this.snapshot.active) return;
    const now = this.environment.monotonic();
    const elapsed = Math.max(0, now - this.lastTick) / 1000;
    this.lastTick = Math.max(now, this.lastTick);
    if (this.mode === 'starting' && !this.failed) this.snapshot.remaining = Math.max(0, this.snapshot.remaining - elapsed);
    if (now - this.lastSave >= 1000) { this.save(); this.lastSave = now; }
    if (this.mode === 'starting' && this.snapshot.remaining === 0) this.transition();
    this.publish();
  }

  setIntroTime(time: number) {
    if (this.snapshot.active && Number.isFinite(time) && time >= 0) this.snapshot.introTime = time;
  }
  ended() { if (this.mode === 'intro' && this.options.media) this.transition(); }
  mediaError() { this.failed = true; this.epoch++; this.pending = false; this.snapshot.status = 'media-error'; this.publish(); }

  private transition() {
    const bridge = this.environment.bridge;
    if (!bridge || !this.options.auto || !this.snapshot.active || this.failed || this.snapshot.transitioned || this.pending || this.disposed) return;
    if (this.control < 4 || !bridge.getControlLevel || !bridge.getCurrentScene || !bridge.setCurrentScene) {
      this.snapshot.status = 'blocked'; return;
    }
    this.pending = true;
    const epoch = this.epoch;
    const valid = () => !this.disposed && epoch === this.epoch && this.snapshot.active && !this.failed && !this.snapshot.transitioned;
    const blocked = () => { if (valid()) { this.snapshot.status = 'blocked'; this.publish(); } };
    const target = this.mode === 'starting' ? this.options.introScene : this.options.liveScene;
    try {
      bridge.getControlLevel(level => {
        if (!valid()) return;
        if (level < 4) { blocked(); return; }
        const commit = () => bridge.getCurrentScene?.(scene => {
          if (!valid()) return;
          if (scene.name !== this.expected || target === this.expected) { blocked(); return; }
          // Persist before the native command: refresh and repeated EOF must not replay it.
          this.snapshot.transitioned = true; this.snapshot.status = 'complete'; this.save(); this.publish();
          try { bridge.setCurrentScene?.(target); } catch { this.snapshot.status = 'blocked'; this.publish(); }
        });
        if (bridge.getScenes) bridge.getScenes(scenes => {
          if (!valid()) return;
          if (!Array.isArray(scenes) || !scenes.includes(target) || !scenes.includes(this.expected)) { blocked(); return; }
          commit();
        });
        else commit();
      });
    } catch { blocked(); }
  }

  private restore() {
    try {
      const raw = this.environment.storage?.getItem(this.key);
      if (!raw) return;
      const saved = JSON.parse(raw) as SavedSequence;
      if (![saved.remaining, saved.savedAt, saved.deadline, saved.introTime].every(Number.isFinite)
        || saved.remaining < 0 || saved.remaining > this.options.countdown || saved.introTime < 0) return;
      this.snapshot.remaining = saved.paused === true ? saved.remaining
        : clamp(Math.min(saved.remaining, (saved.deadline - this.environment.wall()) / 1000), 0, this.options.countdown);
      this.snapshot.introTime = saved.introTime;
      this.snapshot.transitioned = saved.transitioned === true;
    } catch { /* Storage can be disabled in browser sources. */ }
  }
  private save(paused = false) {
    if (!this.initialized) return;
    const now = this.environment.wall();
    try { this.environment.storage?.setItem(this.key, JSON.stringify({ remaining: this.snapshot.remaining, savedAt: now,
      deadline: now + this.snapshot.remaining * 1000, introTime: this.snapshot.introTime, transitioned: this.snapshot.transitioned, paused })); } catch { /* Optional refresh continuity. */ }
  }
  private clear() { try { this.environment.storage?.removeItem(this.key); } catch { /* Optional storage. */ } }
  private publish() { this.notify({ ...this.snapshot }); }
  dispose() {
    if (this.snapshot.active) this.save();
    this.disposed = true; this.epoch++;
    this.environment.events.removeEventListener('obsSceneChanged', this.onScene);
    this.environment.events.removeEventListener('obsSourceActiveChanged', this.onActive);
    this.environment.events.removeEventListener('obsSourceVisibleChanged', this.onVisible);
  }
}
