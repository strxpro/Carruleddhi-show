export type RaceCategory = 'art' | 'classic';

/** Public race identity and timing only. Audience voting fields never belong here. */
export interface RaceResult {
  id: string;
  category: RaceCategory;
  firstName: string;
  lastName: string;
  startNumber: number;
  projectName: string;
  raceTimeMs: number | null;
}

export const RACE_CATEGORIES: readonly RaceCategory[] = ['art', 'classic'];
export const RACE_ROW_HEIGHT = 72;
export const RACE_SCROLL_SPEED = 10;
export const RACE_HOLD_MS = 12_000;
export const RACE_PAUSE_MS = 4_000;
export const RACE_PAGE_MS = 6_000;

export function validRaceTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 2147483647;
}

export function rankRaceResults(participants: readonly RaceResult[]): Record<RaceCategory, RaceResult[]> {
  const groups: Record<RaceCategory, RaceResult[]> = { art: [], classic: [] };
  for (const row of participants) {
    if (row.category !== 'art' && row.category !== 'classic') continue;
    groups[row.category].push({ ...row, raceTimeMs: validRaceTime(row.raceTimeMs) ? row.raceTimeMs : null });
  }
  for (const category of RACE_CATEGORIES) groups[category].sort((a, b) =>
    (a.raceTimeMs ?? Infinity) - (b.raceTimeMs ?? Infinity)
    || a.startNumber - b.startNumber || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return groups;
}

export type RaceScrollPhase = 'hold' | 'down' | 'bottom' | 'up' | 'end' | 'page';
export interface RaceScrollClock {
  category: RaceCategory | null;
  phase: RaceScrollPhase;
  offset: number;
  elapsed: number;
}
export interface RaceScrollLayout {
  categories: readonly RaceCategory[];
  maxOffset: number;
  pageSize: number;
  reducedMotion: boolean;
}

export function createRaceScrollClock(category: RaceCategory | null = null): RaceScrollClock {
  return { category, phase: 'hold', offset: 0, elapsed: 0 };
}

/** Incremental clock: refreshed data only clamps the offset, never restarts a lap. */
export function advanceRaceScroll(previous: RaceScrollClock, deltaMs: number, layout: RaceScrollLayout): RaceScrollClock {
  const { categories, reducedMotion } = layout;
  if (!categories.length) return createRaceScrollClock();
  const clock = categories.includes(previous.category as RaceCategory)
    ? { ...previous } : createRaceScrollClock(categories[0]);
  const max = Math.max(0, Number.isFinite(layout.maxOffset) ? layout.maxOffset : 0);
  const page = Math.max(RACE_ROW_HEIGHT, Math.floor(layout.pageSize / RACE_ROW_HEIGHT) * RACE_ROW_HEIGHT || RACE_ROW_HEIGHT);
  clock.offset = Math.min(max, Math.max(0, clock.offset));
  if (reducedMotion && clock.phase !== 'page') {
    clock.phase = 'page';
    clock.elapsed = 0;
    clock.offset = Math.min(max, Math.floor(clock.offset / page) * page);
  } else if (!reducedMotion && clock.phase === 'page') {
    clock.phase = max ? 'down' : 'hold';
    clock.elapsed = 0;
  }
  if (!max && !['hold', 'page'].includes(clock.phase)) {
    clock.phase = reducedMotion ? 'page' : 'hold';
    clock.elapsed = 0;
  }
  let remaining = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
  // Stop at a category change: its actual layout is measured on the next frame.
  const nextCategory = () => createRaceScrollClock(categories[(categories.indexOf(clock.category!) + 1) % categories.length]);
  for (let step = 0; step < 8; step++) {
    if (clock.phase === 'down' || clock.phase === 'up') {
      const down = clock.phase === 'down';
      const distance = down ? max - clock.offset : clock.offset;
      const duration = distance / RACE_SCROLL_SPEED * 1000;
      const consumed = Math.min(remaining, duration);
      clock.offset = Math.max(0, Math.min(max, clock.offset + (down ? 1 : -1) * consumed * RACE_SCROLL_SPEED / 1000));
      remaining -= consumed;
      if (consumed < duration) return clock;
      clock.phase = down ? 'bottom' : 'end';
      clock.elapsed = 0;
    } else {
      const duration = !max ? RACE_HOLD_MS : clock.phase === 'page' ? RACE_PAGE_MS : RACE_PAUSE_MS;
      const consumed = Math.min(remaining, Math.max(0, duration - clock.elapsed));
      clock.elapsed += consumed;
      remaining -= consumed;
      if (clock.elapsed < duration) return clock;
      clock.elapsed = 0;
      if (!max || clock.phase === 'end') return nextCategory();
      if (clock.phase === 'page') {
        if (clock.offset >= max) return nextCategory();
        clock.offset = Math.min(max, clock.offset + page);
      } else clock.phase = clock.phase === 'hold' ? 'down' : 'up';
    }
    if (remaining <= 0) break;
  }
  return clock;
}
