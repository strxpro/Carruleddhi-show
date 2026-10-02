import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import worker from './index.js';
import intake from '../api/intake.js';
import { controlSecretsMatch } from './broadcast-control.js';

const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_KEY: 'private-service-key',
  ROSTER_KEY: 'admin-password', BROADCAST_CONTROL_TOKEN: 'control-secret-not-for-browser-000000000000' };
const a = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const state = { id: 'main', revision: 10, participant: { id: a, firstName: 'First', raceTimeMs: null },
  participant_visible: true, participant_mode: 'live', sponsors: [], sponsors_enabled: true,
  current_participant_id: a, run_status: 'RUNNING', started_at: '2026-10-02T00:00:00Z',
  stopped_at: null, elapsed_ms: 0, run_id: runId, last_finished_participant: null,
  last_finished_participant_id: null, last_finished_elapsed_ms: null, updated_at: '2026-10-02T00:00:00Z' };
const snapshot = { state, serverNow: '2026-10-02T00:00:01.234Z' };
const reply = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const request = (action, body = {}, options = {}) => new Request(`https://example.test/api/broadcast/${action}`, {
  method: options.method || (action === 'state' ? 'GET' : 'POST'),
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.BROADCAST_CONTROL_TOKEN}`, ...options.headers },
  ...((options.method || (action === 'state' ? 'GET' : 'POST')) === 'GET' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) })
});

test('Control credential comparison and revocable token bounds reject empty/short/private/shared credentials', async (t) => {
  assert.equal(await controlSecretsMatch('a', 'a'), true);
  assert.equal(await controlSecretsMatch('a', 'b'), false);
  assert.equal(await controlSecretsMatch('', ''), false);
  assert.equal(await controlSecretsMatch('a'.repeat(4097), 'a'.repeat(4097)), false);
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not access DB'); });
  for (const token of ['', 'x'.repeat(31), ' '.repeat(32), ` ${'x'.repeat(32)}`, 'x'.repeat(4097), env.SUPABASE_SERVICE_KEY, env.ROSTER_KEY]) {
    const response = await worker.fetch(request('stop', {}, { headers: { Authorization: `Bearer ${token}` } }), { ...env, BROADCAST_CONTROL_TOKEN: token }, {});
    assert.equal(response.status, 401);
  }
  for (const headers of [{ Authorization: '' }, { Authorization: 'Bearer wrong' },
    { Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` }, { Authorization: `Bearer ${env.ROSTER_KEY}` },
    { Authorization: '', 'X-Carruleddhi-Roster-Key': env.SUPABASE_SERVICE_KEY }]) {
    assert.equal((await worker.fetch(request('stop', {}, { headers }), env, {})).status, 401);
  }
  // Environment rotation immediately invalidates the old token.
  assert.equal((await worker.fetch(request('stop'), { ...env, BROADCAST_CONTROL_TOKEN: 'rotated-000000000000000000000000000000' }, {})).status, 401);
});

test('Control token is confined to exact broadcast endpoints, not roster/admin/photo/sponsor CRUD', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not access DB'); });
  for (const route of ['roster','broadcast-admin','settings-admin','voting-admin','sponsor-admin']) {
    const response = await worker.fetch(new Request(`https://example.test/api/carruleddhi/${route}`, {
      method: 'POST', headers: { Authorization: `Bearer ${env.BROADCAST_CONTROL_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'participant-photo', id: a, type: 'broadcast-admin' })
    }), env, {});
    assert.equal(response.status, 401, route);
  }
  for (const action of ['roster','sponsor-save','participant-photo','start/extra','START']) {
    assert.equal((await worker.fetch(request(action, { type: 'roster' }), env, {})).status, 404);
  }
  assert.equal((await worker.fetch(request('start?token=secret', { participantId: a }), env, {})).status, 400);
});

test('Public GET snapshot is sanitized, DB clock supplied, and methods/JSON/body bounds fail closed', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls++; assert.match(url, /broadcast_snapshot$/);
    return reply({ ...snapshot, state: { ...state, registration_id: 'private', participant: { ...state.participant, email: 'private@example.test' } }, participants: [{ email: 'private@example.test' }] });
  });
  const result = await worker.fetch(request('state', {}, { headers: { Authorization: '' } }), env, {});
  const body = await result.json();
  assert.equal(body.serverNow, snapshot.serverNow);
  assert.equal(body.runReady, true);
  assert.equal(body.state.run_id, runId);
  assert.doesNotMatch(JSON.stringify(body), /private|participants|admin-password|control-secret/);
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  for (const [req, status] of [
    [request('state', {}, { method: 'POST' }), 405], [request('start', {}, { method: 'GET' }), 405],
    [request('stop', {}, { headers: { 'Content-Type': 'text/plain' } }), 415],
    [request('stop', '{'), 400], [request('stop', 'null'), 422], [request('stop', '[]'), 422],
    [request('stop', { elapsed_ms: 123 }), 422], [request('stop', { startedAt: '2000-01-01' }), 422],
    [request('stop', { action: 'sponsor-delete' }), 422], [request('stop', { runId: null }), 422],
    [request('stop', { runId: [] }), 422], [request('start', { participantId: [a] }), 422],
    [request('stop', ' '.repeat(2049)), 413], [request('stop', {}, { headers: { 'Content-Length': '99999' } }), 413]
  ]) assert.equal((await worker.fetch(req, env, {})).status, status);
  const streamed = new Request('https://example.test/api/broadcast/stop', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.BROADCAST_CONTROL_TOKEN}` },
    body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(2049)); controller.close(); } }), duplex: 'half'
  });
  assert.equal((await worker.fetch(streamed, env, {})).status, 413);
  assert.equal(calls, 1);
  const preflight = await worker.fetch(request('start', {}, { method: 'OPTIONS' }), env, {});
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /Authorization/);
});

test('Bearer and roster controls call the same service-only commands and return no admin roster', async (t) => {
  const commands = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.headers.apikey, env.SUPABASE_SERVICE_KEY);
    if (url.endsWith('broadcast_command')) { commands.push(JSON.parse(options.body)); return reply(state); }
    assert.match(url, /broadcast_snapshot$/); // Duplicate current START needs no photo or roster query.
    return reply(snapshot);
  });
  for (const [action, payload] of [['start', { participantId: a }], ['stop', { runId }], ['stop', {}],
    ['show-participant', {}], ['hide-participant', {}], ['show-sponsors', {}], ['hide-sponsors', {}]]) {
    const response = await worker.fetch(request(action, payload), env, {});
    assert.equal(response.status, 200, action);
    const body = await response.json();
    assert.equal(body.state.run_id, runId);
    assert.equal(body.serverNow, snapshot.serverNow);
    assert.equal(body.participants, undefined);
  }
  assert.deepEqual(commands.map(c => c.p_action), ['start','stop','stop','show-participant','hide','sponsors-toggle','sponsors-toggle']);
  assert.deepEqual(commands[0].p_payload, { id: a });
  assert.deepEqual(commands[1].p_payload, { runId });
  assert.deepEqual(commands[2].p_payload, {});
  assert.equal((await worker.fetch(request('stop', {}, { headers: { Authorization: '', 'X-Carruleddhi-Roster-Key': env.ROSTER_KEY } }), env, {})).status, 200);
  for (const length of [32, 4096]) {
    const token = 'x'.repeat(length);
    assert.equal((await worker.fetch(request('stop', {}, { headers: { Authorization: `Bearer ${token}` } }), { ...env, BROADCAST_CONTROL_TOKEN: token }, {})).status, 200);
  }
});

test('Current run conflicts are409; mutation result stays pinned despite a later snapshot', async (t) => {
  let conflict = true;
  const finished = { ...state, run_status: 'FINISHED', elapsed_ms: 1234 };
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url.endsWith('broadcast_snapshot')) return reply(snapshot);
    assert.match(url, /broadcast_command$/);
    return conflict ? reply({ code: 'P0001', message: 'RUN_ID_MISMATCH private diagnostics' }, 400) : reply(finished);
  });
  const failed = await worker.fetch(request('stop', { runId: a }), env, {});
  assert.equal(failed.status, 409);
  assert.deepEqual(await failed.json(), { ok: false, code: 'RUN_ID_MISMATCH' });
  conflict = false;
  const success = await worker.fetch(request('stop', { runId }), env, {});
  assert.equal((await success.json()).state.elapsed_ms, 1234);
});

test('Missing0050 blocks START/STOP without legacy writes; public and sponsor controls still work', async (t) => {
  let commands = 0;
  const old = { id: 'main', participant: null, sponsors: [], participant_visible: false, sponsors_enabled: false, participant_mode: 'live' };
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url.endsWith('broadcast_snapshot')) return reply({ code: 'PGRST202', message: 'Could not find broadcast_snapshot' }, 404);
    if (url.endsWith('broadcast_command')) { commands++; return reply(old); }
    assert.match(url, /broadcast_state\?/);
    return reply([old]);
  });
  const publicBody = await (await worker.fetch(request('state'), env, {})).json();
  assert.equal(publicBody.runReady, false);
  assert.equal(publicBody.serverNow, null);
  for (const action of ['start','stop']) {
    const response = await worker.fetch(request(action, action === 'start' ? { participantId: a } : {}), env, {});
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'RUN_MIGRATION_REQUIRED');
  }
  assert.equal(commands, 0);
  assert.equal((await worker.fetch(request('show-sponsors'), env, {})).status, 200);
  assert.equal(commands, 1);
});

test('Vercel Edge and Node adapters restore scoped routes and enforce the small body bound', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.match(url, /broadcast_snapshot$/); return reply(snapshot);
  });
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  try {
    const edge = await intake(new Request('https://example.test/api/intake?broadcastAction=state'));
    assert.equal(edge.status, 200);
    assert.equal((await edge.json()).serverNow, snapshot.serverNow);
    const preserved = await intake(new Request('https://example.test/api/broadcast/state?broadcastAction=state'));
    assert.equal(preserved.status, 200);
    assert.equal((await preserved.json()).serverNow, snapshot.serverNow);
    for (const query of ['broadcastAction=stop', 'broadcastAction=state&broadcastAction=state', 'broadcastAction=state&token=bad']) {
      const rejected = await intake(new Request(`https://example.test/api/broadcast/state?${query}`));
      assert.equal(rejected.status, 400);
      assert.equal((await rejected.json()).code, 'BROADCAST_QUERY_NOT_ALLOWED');
    }
    const unauthorized = await intake(new Request('https://example.test/api/broadcast/stop?broadcastAction=stop', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    }));
    assert.equal(unauthorized.status, 401);
    let nodeOutput;
    const nodeResponse = { setHeader() {}, end(value) { nodeOutput = value; } };
    await intake({ url: '/api/broadcast/state?broadcastAction=state', method: 'GET', headers: { host: 'example.test' } }, nodeResponse);
    assert.equal(nodeResponse.statusCode, 200);
    assert.equal(JSON.parse(nodeOutput).serverNow, snapshot.serverNow);
    const req = new EventEmitter();
    Object.assign(req, { url: '/api/intake?broadcastAction=stop', method: 'POST',
      headers: { host: 'example.test', 'content-type': 'application/json', authorization: `Bearer ${env.BROADCAST_CONTROL_TOKEN}` }, body: ' '.repeat(2049) });
    let output;
    const res = { setHeader() {}, end(value) { output = value; } };
    await intake(req, res);
    assert.equal(res.statusCode, 413);
    assert.equal(JSON.parse(output).code, 'PAYLOAD_TOO_LARGE');
    const stream = new EventEmitter(); Object.assign(stream, { url: req.url, method: 'POST', headers: req.headers });
    const pending = intake(stream, res);
    stream.emit('data', Buffer.alloc(2049)); stream.emit('end');
    await pending;
    assert.equal(res.statusCode, 413);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('Admin runId validation cannot silently drop a malformed guard; active timing conflict is typed', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    calls++;
    return options.method === 'PATCH' ? reply({ code: 'P0001', message: 'RUN_ALREADY_RUNNING' }, 400) : reply([]);
  });
  const admin = (route, payload) => worker.fetch(new Request(`https://example.test/api/carruleddhi/${route}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Carruleddhi-Roster-Key': env.ROSTER_KEY }, body: JSON.stringify(payload)
  }), env, {});
  for (const value of [null, [], {}, true, 1, '', 'invalid']) {
    const response = await admin('broadcast-admin', { action: 'stop', runId: value });
    assert.equal(response.status, 422);
    assert.equal((await response.json()).code, 'BROADCAST_BAD_RUN_ID');
  }
  assert.equal(calls, 0);
  const response = await admin('voting-admin', { action: 'save', id: a, raceTimeMs: 123 });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'RUN_ALREADY_RUNNING');
});
