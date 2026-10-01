import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RaceTimer } from './race-timer-core.mjs';
import { createRaceTimerServer } from './race-timer.mjs';
import { parseRaceTime, formatRaceTime } from '../assets/js/race-time.js';

const deferred = () => Promise.withResolvers();
const rider = id => ({ timingReady: true, state: { participant: { id, startNumber: 1, firstName: 'Test', lastName: id } }, participants: [{ id }] });
function fixture(initial) {
  let stored = initial;
  const calls = [], errors = [], writes = [];
  const f = {
    selected: 'one', lookup: null, save: null, failDisk: false,
    get stored() { return stored; }, calls, errors, writes,
  };
  f.timer = new RaceTimer({
    read: async () => structuredClone(stored),
    write: async state => {
      if (f.failDisk) throw new Error('disk unavailable');
      stored = structuredClone(state);
      writes.push(stored);
    },
    onError: error => { errors.push(error.message); },
    api: async (route, body) => {
      calls.push({ route, ...body });
      if (route === 'broadcast-admin') return f.lookup ? f.lookup.promise : rider(f.selected);
      assert.equal(stored.status, 'pending', 'pending must be durable before remote save');
      assert.equal(stored.raceTimeMs, body.raceTimeMs);
      if (f.save) return f.save.promise;
      return { ok: true };
    },
  });
  return f;
}
async function started(f, at = 1000) {
  await f.timer.command('start', at);
  await f.timer.starting;
}
async function listen(t, server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('time input precision, clear, invalid values and boundaries', () => {
  for (const n of [0, 1, 12345, 60000, 83456, 2147483647]) assert.equal(parseRaceTime(formatRaceTime(n)), n);
  assert.equal(parseRaceTime('1:23,4'), 83400);
  assert.equal(parseRaceTime(''), null);
  for (const s of ['1:60', '-1', '1.1234', 'x', '999999999:59']) assert.equal(parseRaceTime(s), undefined);
});
test('finish stays tied to starter, freezes before failed save and retries idempotently', async () => {
  const f = fixture();
  await started(f);
  await f.timer.command('start', 2000);
  f.selected = 'two'; f.save = deferred();
  const stop = await f.timer.command('stop', 84456);
  assert.equal(stop.status, 'pending');
  assert.equal(f.stored.raceTimeMs, 83456);
  f.save.reject(new Error('offline'));
  await f.timer.saving;
  assert.equal(f.stored.error, 'offline');
  await assert.rejects(f.timer.command('start', 90000), /STOP/);
  f.save = null;
  await f.timer.command('stop', 100000);
  await f.timer.saving;
  await f.timer.command('stop', 120000);
  assert.deepEqual(f.calls.filter(c => c.route === 'voting-admin'), Array(2).fill({ route: 'voting-admin', action: 'save', id: 'one', raceTimeMs: 83456 }));
  await started(f, 130000);
  assert.equal(f.stored.id, 'two');
});

test('STOP during slow START durably freezes before lookup completes; double START does not reset', async () => {
  const f = fixture(); f.lookup = deferred(); f.save = deferred();
  assert.equal((await f.timer.command('start', 1000)).status, 'starting');
  await f.timer.command('start', 2000);
  const stop = await f.timer.command('stop', 3000);
  assert.equal(stop.status, 'pending');
  assert.equal(f.stored.raceTimeMs, 2000);
  assert.equal(f.calls.length, 1);
  await f.timer.command('stop', 4000);
  f.selected = 'two';
  f.lookup.resolve(rider('one'));
  await f.timer.starting;
  assert.equal(f.stored.id, 'one');
  assert.equal((await f.timer.command('status')).raceTimeMs, 2000);
  await f.timer.command('stop', 5000);
  assert.equal(f.calls.filter(c => c.route === 'voting-admin').length, 1);
  f.save.resolve({ ok: true });
  await f.timer.saving;
  assert.equal(f.stored.status, 'saved');
});

test('pending survives process restart and retries original rider/time without a lookup', async () => {
  const f = fixture({ status: 'pending', id: 'one', startedAt: 1000, stoppedAt: 2345, raceTimeMs: 1345 });
  f.selected = 'two';
  await f.timer.command('stop', 100000);
  await f.timer.saving;
  assert.deepEqual(f.calls, [{ route: 'voting-admin', action: 'save', id: 'one', raceTimeMs: 1345 }]);
});

test('disk failure prevents remote write and retry retains first finish timestamp', async () => {
  const f = fixture(); await started(f);
  f.failDisk = true;
  await assert.rejects(f.timer.command('stop', 2345), /disk/);
  assert.equal((await f.timer.command('status')).raceTimeMs, 1345);
  assert.equal(f.calls.length, 1);
  f.failDisk = false;
  await f.timer.command('stop', 9000);
  await f.timer.saving;
  assert.equal(f.stored.raceTimeMs, 1345);
});

test('failed saved-state persistence leaves pending and retries the same remote payload', async () => {
  const f = fixture(); await started(f); f.save = deferred();
  await f.timer.command('stop', 2345);
  f.failDisk = true;
  f.save.resolve({ ok: true });
  await f.timer.saving;
  assert.equal(f.stored.status, 'pending');
  f.failDisk = false; f.save = null;
  await f.timer.command('stop', 9000);
  await f.timer.saving;
  assert.equal(f.stored.status, 'saved');
  assert.equal(f.calls[1].raceTimeMs, f.calls[2].raceTimeMs);
});

test('out-of-order START/STOP never starts a stale run or stops the next rider', async () => {
  const f = fixture();
  await f.timer.command('stop', 2000);
  await assert.rejects(f.timer.command('start', 1000), /Opóźniona/);
  await started(f, 3000);
  await f.timer.command('stop', 4000); await f.timer.saving;
  await f.timer.command('stop', 5000);
  await assert.rejects(f.timer.command('start', 4500), /Opóźniona/);
  await started(f, 6000);
  await assert.rejects(f.timer.command('stop', 4000), /Opóźniona/);
  assert.equal(f.stored.status, 'running');
  assert.equal(f.stored.startedAt, 6000);
});

test('unresolved rider after failure or restart cannot be rebound to new admin selection', async () => {
  const f = fixture(); f.lookup = deferred();
  await f.timer.command('start', 1000);
  await f.timer.command('stop', 2000);
  f.lookup.reject(new Error('lookup offline'));
  await f.timer.starting;
  f.selected = 'two'; f.lookup = null;
  await f.timer.command('stop', 3000);
  assert.equal(f.calls.length, 1);
  assert.equal(f.stored.raceTimeMs, 1000);
  assert.match(f.stored.error, /ręcznie/);
  await assert.rejects(f.timer.command('start', 4000), /STOP/);
  const restarted = fixture({ status: 'starting', startedAt: 1000 });
  await assert.rejects(restarted.timer.command('start', 5000), /Przerwany/);
  await restarted.timer.command('stop', 6000);
  assert.equal(restarted.stored.raceTimeMs, 5000);
  assert.equal(restarted.calls.length, 0);
});

test('missing selected rider and migration fail closed without saving', async () => {
  for (const data of [{ timingReady: true }, { ...rider('one'), timingReady: false }]) {
    const f = fixture(); f.lookup = deferred();
    await f.timer.command('start', 1000);
    f.lookup.resolve(data); await f.timer.starting;
    assert.equal(f.stored.status, 'failed');
    await f.timer.command('stop', 2000);
    assert.equal(f.calls.length, 1);
    assert.equal(f.stored.status, 'pending');
    assert.equal(f.stored.raceTimeMs, 1000);
    assert.ok(f.stored.error);
  }
});

test('invalid timestamps/durations fail without corrupting a running timer', async () => {
  const f = fixture(); await started(f);
  for (const at of [NaN, Infinity, -1, 1.2, 999, 2147484648]) await assert.rejects(f.timer.command('stop', at));
  assert.equal(f.stored.status, 'running');
  await assert.rejects(f.timer.command('reset', 2000), /Nieznana/);
  await f.timer.command('stop', 1000); await f.timer.saving;
  assert.equal(f.stored.raceTimeMs, 0);
});

test('HTTP STOP and status finish while remote lookup/save remain blocked', { timeout: 5000 }, async t => {
  const f = fixture(); f.lookup = deferred(); f.save = deferred();
  let now = 1000;
  const url = await listen(t, createRaceTimerServer(f.timer, { token: 'test-only', clock: () => now }));
  const send = async action => (await fetch(`${url}/${action}`, { method: 'POST', headers: { Authorization: 'Bearer test-only' } })).json();
  assert.equal((await send('start')).startedAt, 1000);
  now = 2444;
  assert.equal((await send('stop')).raceTimeMs, 1444);
  f.lookup.resolve(rider('one')); await f.timer.starting;
  now = 100000;
  assert.equal((await send('status')).status, 'pending');
  assert.equal((await send('stop')).raceTimeMs, 1444);
  assert.equal(f.calls.length, 2);
  f.save.resolve({ ok: true }); await f.timer.saving;
  assert.equal((await send('status')).status, 'saved');
});

test('HTTP authentication, browser-origin and timestamp guards reject before mutation', async t => {
  const f = fixture();
  const url = await listen(t, createRaceTimerServer(f.timer, { token: 'test-only', clock: () => 1000 }));
  for (const headers of [{}, { Authorization: 'Bearer wrong' }, { Authorization: 'Bearer test-only', Origin: 'https://example.test' }]) {
    assert.equal((await fetch(`${url}/start`, { method: 'POST', headers })).status, 403);
  }
  for (const at of ['NaN', '1001', '-1', '1.5']) {
    assert.equal((await fetch(`${url}/start`, { method: 'POST', headers: { Authorization: 'Bearer test-only', 'X-Race-Timer-At': at } })).status, 422);
  }
  assert.equal(f.calls.length, 0);
});

test('launcher preserves invocation time across handshake and refuses an old running helper', { timeout: 10000 }, async t => {
  const temp = await mkdtemp(join(tmpdir(), 'race-timer-test-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const local = join(temp, 'Carruleddhi', 'race-timer');
  await mkdir(local, { recursive: true });
  const commands = [];
  let old = false;
  const url = await listen(t, createServer((req, res) => {
    commands.push({ path: req.url, at: req.headers['x-race-timer-at'], receivedAt: Date.now() });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, status: 'pending', ...(old ? {} : { protocol: 2 }) }));
  }));
  await writeFile(join(local, 'config.json'), JSON.stringify({ port: Number(new URL(url).port), token: 'test-only', origin: 'https://unused.invalid' }));
  const run = () => promisify(execFile)(process.execPath, [fileURLToPath(new URL('./race-timer.mjs', import.meta.url)), 'stop'], { env: { ...process.env, LOCALAPPDATA: temp } });
  await run();
  assert.deepEqual(commands.map(c => c.path), ['/status', '/stop']);
  assert.equal(commands[0].at, commands[1].at);
  assert.ok(Number(commands[1].at) <= commands[0].receivedAt);
  old = true; commands.length = 0;
  await assert.rejects(run(), /starszy pomocnik/);
  assert.deepEqual(commands.map(c => c.path), ['/status']);
});
