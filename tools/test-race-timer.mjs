import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RaceTimer, createBroadcastApi, controlActions } from './race-timer-core.mjs';
import { createRaceTimerServer, describeSnapshot, protocol } from './race-timer.mjs';

const personId = '11111111-1111-4111-8111-111111111111';
const firstRun = '22222222-2222-4222-8222-222222222222';
const nextRun = '33333333-3333-4333-8333-333333333333';
const headers = { Authorization: 'Bearer ipc-test-only', 'X-Race-Timer-Protocol': String(protocol) };
const person = { id: personId, startNumber: 7, firstName: 'Test', lastName: 'Rider' };
const initialState = () => ({ run_status: 'IDLE', run_id: null, current_participant_id: null, elapsed_ms: 0, participant: person });
const envelope = state => ({ ok: true, runReady: true, serverNow: '2026-10-02T00:00:00.000Z', state: structuredClone(state) });

async function listen(t, server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
}

async function fixture(t) {
  const f = { state: initialState(), calls: [], offline: false, loseStopResponse: false, holdStop: null, beforeStop: null };
  const origin = await listen(t, createServer((req, res) => {
    void (async () => {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = raw ? JSON.parse(raw) : null;
      f.calls.push({ path: req.url, method: req.method, headers: req.headers, body });
      if (f.offline) { res.destroy(); return; }
      const action = req.url.split('/').at(-1);
      if (action === 'start' && f.state.run_status !== 'RUNNING') {
        Object.assign(f.state, { run_status: 'RUNNING', current_participant_id: body.participantId, run_id: firstRun, started_at: '2026-10-02T00:00:00.000Z' });
      }
      if (action === 'stop') {
        if (f.beforeStop) f.beforeStop();
        if (f.holdStop) await f.holdStop.promise;
        if (body.runId !== f.state.run_id) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, code: 'RUN_ID_MISMATCH' })); return;
        }
        if (f.state.run_status === 'RUNNING') Object.assign(f.state, { run_status: 'FINISHED', elapsed_ms: 83456, stopped_at: '2026-10-02T00:01:23.456Z' });
        if (f.loseStopResponse) { res.destroy(); return; }
      }
      if (action.endsWith('-participant')) f.state.participant_visible = action.startsWith('show');
      if (action.endsWith('-sponsors')) f.state.sponsors_enabled = action.startsWith('show');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(envelope(f.state)));
    })().catch(error => { res.destroy(error); });
  }));
  f.api = createBroadcastApi({ origin, token: 'dedicated-test-only-token', rosterKey: 'unused-admin-test-only' });
  f.timer = new RaceTimer({ api: f.api, read: () => assert.fail('must not read local authority'), write: () => assert.fail('must not persist local authority') });
  return f;
}

test('status always reads server; Admin ON AIR and duplicate START share exactly one run', async t => {
  const f = await fixture(t);
  assert.equal((await f.timer.command('status')).state.run_status, 'IDLE');
  const started = await f.timer.command('start');
  assert.equal(started.state.run_id, firstRun);
  const again = await f.timer.command('start');
  assert.deepEqual(again, started);
  assert.equal(f.calls.filter(c => c.path.endsWith('/start')).length, 1);
  f.state.run_id = nextRun; // An admin-side change must be visible without any local restart.
  assert.equal((await f.timer.command('status')).state.run_id, nextRun);
  assert.equal((await f.timer.command('start')).state.run_id, nextRun);
  assert.equal(f.calls.filter(c => c.path.endsWith('/start')).length, 1);
  for (const call of f.calls) {
    assert.ok(call.path.startsWith('/api/broadcast/'));
    assert.equal(call.headers.authorization, 'Bearer dedicated-test-only-token');
    assert.equal(call.headers['x-carruleddhi-roster-key'], undefined);
    assert.equal(call.headers['x-race-timer-at'], undefined);
    assert.equal(call.method, call.path.endsWith('/state') ? 'GET' : 'POST');
  }
  assert.deepEqual(f.calls.find(c => c.path.endsWith('/start')).body, { participantId: personId });
});

test('STOP waits for backend, duplicate posts keep same runId and server final time', async t => {
  const f = await fixture(t);
  await f.timer.command('start');
  f.holdStop = Promise.withResolvers();
  let completed = false;
  const stopping = f.timer.command('stop').then(result => { completed = true; return result; });
  const during = await f.timer.command('status');
  assert.equal(during.state.run_status, 'RUNNING');
  assert.equal(completed, false);
  assert.equal(describeSnapshot(during).split('\n')[0], '#7 Test Rider: RUNNING');
  f.holdStop.resolve();
  const stopped = await stopping;
  assert.equal(stopped.state.elapsed_ms, 83456);
  assert.equal(stopped.state.run_status, 'FINISHED');
  await f.timer.command('stop', { runId: firstRun });
  assert.deepEqual(f.calls.filter(c => c.path.endsWith('/stop')).map(c => c.body), [{ runId: firstRun }, { runId: firstRun }]);
  assert.equal(f.state.elapsed_ms, 83456);
});

test('lost STOP acknowledgement is unknown, never frozen locally; explicit retry targets original run', async t => {
  const f = await fixture(t);
  await f.timer.command('start');
  f.loseStopResponse = true;
  await assert.rejects(f.timer.command('stop'), error => /Stan nieznany/.test(error.message) && error.message.includes(firstRun));
  assert.equal(f.calls.filter(c => c.path.endsWith('/stop')).length, 1, 'no automatic retry');
  f.loseStopResponse = false;
  assert.equal((await f.timer.command('status')).state.run_status, 'FINISHED');
  await f.timer.command('stop', { runId: firstRun });
  assert.equal(f.state.elapsed_ms, 83456);
  f.state.run_id = nextRun; f.state.run_status = 'RUNNING'; f.state.elapsed_ms = 0;
  const count = f.calls.filter(c => c.path.endsWith('/stop')).length;
  await assert.rejects(f.timer.command('stop', { runId: firstRun }), /RUN_ID_MISMATCH/);
  assert.equal(f.calls.filter(c => c.path.endsWith('/stop')).length, count);
  assert.equal(f.state.run_status, 'RUNNING');
});

test('backend runId guard catches a new run between GET and STOP POST', async t => {
  const f = await fixture(t); await f.timer.command('start');
  f.beforeStop = () => { f.state.run_id = nextRun; };
  await assert.rejects(f.timer.command('stop'), /RUN_ID_MISMATCH/);
  assert.equal(f.state.run_status, 'RUNNING');
  assert.deepEqual(f.calls.at(-1).body, { runId: firstRun });
});

test('offline lookup/status fails without cached success or any mutation', async t => {
  const f = await fixture(t); await f.timer.command('start');
  f.offline = true;
  for (const action of ['status', 'start', 'stop']) await assert.rejects(f.timer.command(action), /CONNECTION_FAILED/);
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
  assert.equal(f.state.run_status, 'RUNNING');
});

test('visibility actions are remote-only and cannot write elapsed or restart run', async t => {
  const f = await fixture(t); await f.timer.command('start');
  for (const action of controlActions.filter(a => a.includes('-'))) await f.timer.command(action);
  assert.equal(f.state.run_id, firstRun);
  assert.equal(f.state.run_status, 'RUNNING');
  for (const c of f.calls.filter(c => c.method === 'POST' && !c.path.endsWith('/start'))) assert.deepEqual(c.body, {});
});

test('legacy state, missing readiness, participant and timestamp options fail closed', async () => {
  for (const data of [{ ok: true, state: { status: 'saved' } }, { ...envelope(initialState()), runReady: false }, { ...envelope(initialState()), state: { ...initialState(), elapsed_ms: -1 } }]) {
    const timer = new RaceTimer({ api: async () => data });
    await assert.rejects(timer.command('start'), /BROADCAST_STATE_INVALID/);
  }
  const timer = new RaceTimer({ api: async () => envelope({ ...initialState(), participant: null }) });
  await assert.rejects(timer.command('start'), /wybierz zawodnika/);
  await assert.rejects(timer.command('stop'), /RUN_NOT_RUNNING/);
  for (const options of [1000, { elapsed_ms: 123 }, { startedAt: 1000 }, { runId: 'not-uuid' }]) await assert.rejects(timer.command('stop', options), /opcje/);
  await assert.rejects(timer.command('save'), /Nieznana/);
});

test('API constrains origin/routes and auth; dedicated token never downgrades after rejection', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify({ ok: false, code: 'UNAUTHORIZED', error: 'sensitive-body' }), { status: 401 }); };
  for (const origin of ['http://example.test', 'https://user:password@example.test', 'https://example.test/path', 'https://example.test/?token=x']) {
    assert.throws(() => createBroadcastApi({ origin, token: 'test' }), /origin/);
  }
  assert.throws(() => createBroadcastApi({ origin: 'https://example.test' }), /Brak/);
  const api = createBroadcastApi({ origin: 'https://example.test', token: 'dedicated', rosterKey: 'admin', fetchImpl });
  await assert.rejects(api('state'), /UNAUTHORIZED/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer dedicated');
  assert.equal(calls[0].options.headers['X-Carruleddhi-Roster-Key'], undefined);
  assert.equal(calls[0].options.redirect, 'error');
  await assert.rejects(api('voting-admin', { action: 'save' }), /Niedozwolona/);
  const fallback = createBroadcastApi({ origin: 'https://example.test', rosterKey: 'admin', fetchImpl });
  await assert.rejects(fallback('state'));
  assert.deepEqual(calls.at(-1).options.headers, { 'X-Carruleddhi-Roster-Key': 'admin' });
});

test('IPC requires token, no browser origin, new protocol and pinned STOP; health is not backend state', async t => {
  const f = await fixture(t);
  const url = await listen(t, createRaceTimerServer(f.timer, { token: 'ipc-test-only' }));
  const send = (action, options = {}) => fetch(`${url}/${action}`, { method: 'POST', headers, ...options });
  for (const bad of [{}, { ...headers, Authorization: 'Bearer wrong' }, { ...headers, Origin: 'https://example.test' }]) assert.equal((await send('start', { headers: bad })).status, 403);
  for (const bad of [{ Authorization: headers.Authorization }, { ...headers, 'X-Race-Timer-Protocol': '2' }, { ...headers, 'X-Race-Timer-At': '123' }]) assert.equal((await send('start', { headers: bad })).status, 409);
  assert.equal((await send('stop')).status, 422);
  assert.equal((await send('start', { body: '{bad' })).status, 422);
  assert.equal((await send('start', { body: 'x'.repeat(1025) })).status, 422);
  const health = await (await send('health')).json();
  assert.equal(health.protocol, 3);
  assert.equal(health.authority, 'remote-db');
  assert.equal(health.state, undefined);
  assert.equal(f.calls.length, 0);
  await send('start');
  f.offline = true;
  const failed = await (await send('stop', { body: JSON.stringify({ runId: firstRun }) })).json();
  assert.equal(failed.ok, false);
  assert.equal(failed.state, undefined);
  assert.equal(failed.connection, 'unconfirmed');
});

async function launcher(t, handler) {
  const temp = await mkdtemp(join(tmpdir(), 'race-control-test-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const local = join(temp, 'Carruleddhi', 'race-timer');
  await mkdir(local, { recursive: true });
  const url = await listen(t, typeof handler === 'function' ? createServer(handler) : handler);
  const config = JSON.stringify({ port: Number(new URL(url).port), token: 'ipc-test-only', origin: 'https://unused.invalid' });
  await writeFile(join(local, 'config.json'), config);
  const run = (...args) => promisify(execFile)(process.execPath, [fileURLToPath(new URL('./race-timer.mjs', import.meta.url)), ...args], { env: { ...process.env, LOCALAPPDATA: temp } });
  return { local, run, config };
}

test('launcher pins runId from server handshake, preserves files, rejects legacy helper before mutation', async t => {
  const calls = []; let old = false;
  const state = { ...initialState(), run_status: 'RUNNING', run_id: firstRun, current_participant_id: personId };
  const f = await launcher(t, (req, res) => {
    void (async () => {
      let raw = ''; for await (const chunk of req) raw += chunk;
      calls.push({ path: req.url, headers: req.headers, body: JSON.parse(raw) });
      res.end(JSON.stringify({ ...envelope(state), protocol: old ? 2 : protocol }));
    })();
  });
  const legacy = '{"status":"pending","raceTimeMs":9876}';
  await writeFile(join(f.local, 'state.json'), legacy);
  await f.run('stop');
  assert.deepEqual(calls.map(c => c.path), ['/status', '/stop']);
  assert.deepEqual(calls[1].body, { runId: firstRun });
  assert.ok(calls.every(c => c.headers['x-race-timer-at'] === undefined));
  assert.equal(await readFile(join(f.local, 'state.json'), 'utf8'), legacy);
  assert.equal(await readFile(join(f.local, 'config.json'), 'utf8'), f.config);
  assert.match(await readFile(join(f.local, 'status.txt'), 'utf8'), /DIAGNOSTYKA, NIE ZEGAR/);
  old = true; calls.length = 0;
  await assert.rejects(f.run('stop'), /starszy pomocnik/);
  assert.deepEqual(calls.map(c => c.path), ['/status']);
  assert.equal(await readFile(join(f.local, 'state.json'), 'utf8'), legacy);
});

test('launcher status creates no authority file and errors replace stale success diagnostic', async t => {
  let offline = false;
  const f = await launcher(t, (req, res) => {
    res.end(JSON.stringify(offline ? { protocol, ok: false, error: 'BROADCAST_CONNECTION_FAILED' } : { ...envelope(initialState()), protocol }));
  });
  await f.run('status');
  assert.deepEqual((await readdir(f.local)).sort(), ['config.json', 'status.txt']);
  offline = true;
  await assert.rejects(f.run('status'), /CONNECTION_FAILED/);
  const diagnostic = await readFile(join(f.local, 'status.txt'), 'utf8');
  assert.match(diagnostic, /STAN NIEZNANY/);
  assert.doesNotMatch(diagnostic, /FINISHED|RUNNING|IDLE/);
});

test('launcher explicit old-run retry cannot stop new backend run; normal STOP awaits actual backend', async t => {
  const remote = await fixture(t);
  await remote.timer.command('start');
  const f = await launcher(t, createRaceTimerServer(remote.timer, { token: 'ipc-test-only' }));
  const result = await f.run('stop');
  assert.match(result.stdout, /FINISHED 01:23\.456/);
  assert.equal(remote.state.elapsed_ms, 83456);
  remote.state.run_id = nextRun; remote.state.run_status = 'RUNNING'; remote.state.elapsed_ms = 0;
  await assert.rejects(f.run('stop', '--run-id', firstRun), /RUN_ID_MISMATCH/);
  assert.equal(remote.state.run_status, 'RUNNING');
  assert.equal(remote.calls.filter(c => c.path.endsWith('/stop')).length, 1);
  assert.ok(!(await readdir(f.local)).includes('state.json'));
});

test('implementation has no local clock authority, result save route, detached child or state file access', async () => {
  for (const file of ['./race-timer.mjs', './race-timer-core.mjs']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /Date\.now|performance\.now|process\.hrtime|setInterval|child_process|spawn\(|voting-admin|state\.json|raceTimeMs\s*:/);
  }
});
