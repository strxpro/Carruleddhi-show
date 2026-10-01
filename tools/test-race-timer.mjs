import assert from 'node:assert/strict';
import test from 'node:test';
import { RaceTimer } from './race-timer-core.mjs';
import { parseRaceTime, formatRaceTime } from '../assets/js/race-time.js';

test('time input precision, clear, invalid values and boundaries', () => {
  for (const n of [0, 1, 12345, 60000, 83456, 2147483647]) assert.equal(parseRaceTime(formatRaceTime(n)), n);
  assert.equal(parseRaceTime('1:23,4'), 83400);
  assert.equal(parseRaceTime(''), null);
  for (const s of ['1:60', '-1', '1.1234', 'x', '999999999:59']) assert.equal(parseRaceTime(s), undefined);
});
test('finish stays tied to starter, freezes before failed save and retries idempotently', async () => {
  let stored, selected = 'one', fail = false;
  const writes = [];
  const timer = new RaceTimer({ read: async () => stored, write: async s => { stored = structuredClone(s); }, api: async (route, data) => {
    if (route === 'broadcast-admin') return { timingReady: true, state: { participant: { id: selected, startNumber: 1 } }, participants: [{ id: selected }] };
    if (fail) throw new Error('offline');
    writes.push(data);
  } });
  await timer.command('start', 1000);
  await timer.command('start', 2000);
  selected = 'two'; fail = true;
  await assert.rejects(timer.command('stop', 84456), /offline/);
  assert.equal(stored.raceTimeMs, 83456);
  await assert.rejects(timer.command('start', 90000), /STOP/);
  fail = false;
  await timer.command('stop', 100000);
  await timer.command('stop', 120000);
  assert.deepEqual(writes, [{ action: 'save', id: 'one', raceTimeMs: 83456 }]);
  await timer.command('start', 130000);
  assert.equal(stored.id, 'two');
});
