import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rankRaceResults, validRaceTime, createRaceScrollClock, advanceRaceScroll,
  RACE_CATEGORIES, RACE_ROW_HEIGHT, RACE_SCROLL_SPEED, RACE_HOLD_MS, RACE_PAUSE_MS, RACE_PAGE_MS,
} from '../src/obs/scenes/race-results.ts';

const rider = (index, overrides = {}) => ({ id: `id-${String(index).padStart(3, '0')}`, category: 'art',
  firstName: 'Ada', lastName: 'Rossi', projectName: 'Cart', startNumber: index + 1, raceTimeMs: 10_000 + index * 1000, ...overrides });
const layout = (maxOffset, reducedMotion = false) => ({ categories: RACE_CATEGORIES, maxOffset, pageSize: 216, reducedMotion });
const advance = (clock, milliseconds, geometry) => advanceRaceScroll(clock, milliseconds, geometry);

for (const count of [0, 1, 3, 10, 30]) test(`${count} participants: all retained, top three fixed, no input mutation`, () => {
  const input = Array.from({ length: count }, (_, i) => rider(i)).reverse();
  const before = structuredClone(input);
  const { art, classic } = rankRaceResults(input);
  assert.equal(art.length, count);
  assert.equal(classic.length, 0);
  assert.deepEqual(input, before);
  assert.deepEqual(art.map(row => row.startNumber), Array.from({ length: count }, (_, i) => i + 1));
  assert.equal(art.slice(0, 3).length, Math.min(count, 3));
  assert.equal(new Set([...art.slice(0, 3), ...art.slice(3)].map(row => row.id)).size, count);
});

test('categories and times, never audience votes, determine ranking; ties use number then ID', () => {
  const input = [rider(3, { raceTimeMs: null, totalScore: 999 }), rider(2, { raceTimeMs: 100 }),
    rider(1, { raceTimeMs: 100 }), rider(0, { raceTimeMs: 0 }), rider(4, { category: 'classic', raceTimeMs: 1 }),
    rider(5, { id: 'a', raceTimeMs: 100, startNumber: 2 }), rider(6, { category: 'unknown' })];
  const ranked = rankRaceResults(input);
  assert.deepEqual(ranked.art.map(row => row.id), ['id-000', 'a', 'id-001', 'id-002', 'id-003']);
  assert.deepEqual(ranked.classic.map(row => row.id), ['id-004']);
  assert.deepEqual(rankRaceResults([...input].reverse()), ranked, 'API reorder must not reshuffle tied rows');
});

test('zero is a recorded time; null, bad, negative and out-of-range times are untimed', () => {
  const times = [null, undefined, '', '0', -1, 1.2, Infinity, NaN, 2147483648, 0, 2147483647];
  const { art } = rankRaceResults(times.map((raceTimeMs, i) => rider(i, { raceTimeMs })));
  assert.deepEqual(art.slice(0, 2).map(row => row.raceTimeMs), [0, 2147483647]);
  assert.ok(art.slice(2).every(row => row.raceTimeMs === null));
  assert.equal(validRaceTime(0), true);
  assert.equal(validRaceTime(null), false);
});

test('empty clock is neutral and a single nonempty category does not show empty slides', () => {
  assert.deepEqual(advance(createRaceScrollClock('art'), 99_999, { ...layout(0), categories: [] }), createRaceScrollClock());
  const single = { ...layout(0), categories: ['classic'] };
  let clock = advance(createRaceScrollClock(), 0, single);
  assert.equal(clock.category, 'classic');
  clock = advance(clock, RACE_HOLD_MS, single);
  assert.equal(clock.category, 'classic');
});

test('short categories hold twelve seconds then rotate', () => {
  let clock = createRaceScrollClock('art');
  clock = advance(clock, RACE_HOLD_MS - 1, layout(0));
  assert.equal(clock.category, 'art');
  assert.equal(clock.offset, 0);
  clock = advance(clock, 1, layout(0));
  assert.equal(clock.category, 'classic');
});

for (const count of [10, 30]) test(`${count} participants finish down / pause / up / pause before changing category`, () => {
  const max = (count - 3) * RACE_ROW_HEIGHT - 216;
  const travel = max / RACE_SCROLL_SPEED * 1000;
  const geometry = layout(max);
  let clock = advance(createRaceScrollClock('art'), RACE_PAUSE_MS, geometry);
  assert.equal(clock.phase, 'down');
  clock = advance(clock, travel, geometry);
  assert.equal(clock.offset, max);
  assert.equal(clock.phase, 'bottom');
  assert.equal(clock.category, 'art');
  clock = advance(clock, RACE_PAUSE_MS, geometry);
  assert.equal(clock.phase, 'up');
  clock = advance(clock, travel, geometry);
  assert.equal(clock.offset, 0);
  assert.equal(clock.phase, 'end');
  clock = advance(clock, RACE_PAUSE_MS - 1, geometry);
  assert.equal(clock.category, 'art');
  clock = advance(clock, 1, geometry);
  assert.equal(clock.category, 'classic');
});

test('poll updates preserve position; shrink clamps and grow continues without restarting', () => {
  let clock = advance(createRaceScrollClock('art'), RACE_PAUSE_MS + 30_000, layout(1800));
  assert.equal(clock.offset, 300);
  const stable = advance(clock, 0, layout(1800));
  assert.deepEqual(stable, clock);
  clock = advance(clock, 1000, layout(2000));
  assert.equal(clock.offset, 310);
  clock = advance(clock, 0, layout(100));
  assert.equal(clock.offset, 100);
  assert.equal(clock.phase, 'bottom');
  clock = advance(clock, 1000, layout(0));
  assert.equal(clock.offset, 0);
  assert.equal(clock.phase, 'hold');
  assert.equal(clock.elapsed, 1000);
});

test('reduced motion uses static pages that eventually expose every remaining row', () => {
  const count = 30;
  const max = (count - 3) * RACE_ROW_HEIGHT - 230;
  const geometry = { ...layout(max, true), pageSize: 230 };
  let clock = advance(createRaceScrollClock('art'), 0, geometry);
  const seen = new Set();
  for (let page = 0; page < 20 && clock.category === 'art'; page++) {
    assert.equal(clock.phase, 'page');
    for (let row = 0; row < count - 3; row++) {
      if (row * 72 >= clock.offset && (row + 1) * 72 <= clock.offset + 230) seen.add(row);
    }
    const stationary = advance(clock, RACE_PAGE_MS - 1, geometry);
    assert.equal(stationary.offset, clock.offset);
    clock = advance(stationary, 1, geometry);
  }
  assert.equal(clock.category, 'classic');
  assert.equal(seen.size, count - 3);
});

test('bounds remain safe across live layout and reduced-motion preference changes', () => {
  let clock = createRaceScrollClock('art');
  for (let i = 0; i < 10_000; i++) {
    const max = i % 239;
    clock = advance(clock, 133, layout(max, i % 111 < 50));
    assert.ok(clock.offset >= 0 && clock.offset <= max);
    assert.ok(Number.isFinite(clock.offset));
  }
});
