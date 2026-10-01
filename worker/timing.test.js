import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './index.js';
import { isMissingTimingColumn } from './broadcast.js';

const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_KEY: 'private-service-key', ROSTER_KEY: 'admin-password' };
const id = '11111111-1111-4111-8111-111111111111';
const row = { id, registration_id: '22222222-2222-4222-8222-222222222222', category: 'art', start_number: 7,
  first_name: 'First', last_name: 'Last', project_name: 'Cart', image_path: '', active: true };
const state = { id: 'main', revision: 3, participant: null, participant_visible: false,
  sponsors_enabled: true, sponsors: [], updated_at: '2026-10-01T00:00:00Z' };
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const missing = (column, code = '42703') => ({ code, message: `column public.participants.${column} does not exist` });
const call = (route, body, authenticated = route.endsWith('-admin')) => worker.fetch(new Request(`https://example.test/api/carruleddhi/${route}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { 'X-Carruleddhi-Roster-Key': env.ROSTER_KEY } : {}) },
  body: JSON.stringify(body)
}), env, {});

test('Only precise new-column schema errors enable fallback', () => {
  for (const code of ['42703', 'PGRST204']) assert.equal(isMissingTimingColumn(missing('race_time_ms', code)), true);
  for (const error of [missing('image_path'), missing('race_time_ms', '42501'), missing('race_time_ms', 'XX000'),
    missing('not_race_time_ms'), null, {}]) assert.equal(isMissingTimingColumn(error), false);
});

test('Sanitizer retains explicit null/zero/invalid timing types for strict validation', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('invalid input must not read/write'); });
  for (const raceTimeMs of ['0', '123', '', '  ', true, false, 1.5, -1, 2147483648, {}, [], [0]]) {
    const result = await call('voting-admin', { action: 'save', id, raceTimeMs });
    assert.equal(result.status, 422, JSON.stringify(raceTimeMs));
    assert.equal((await result.json()).code, 'VOTING_BAD_RACE_TIME');
  }
  const absent = await call('voting-admin', { action: 'save', id });
  assert.equal((await absent.json()).code, 'VOTING_NOTHING_TO_SAVE');
});

test('Protected timing save accepts zero/max/null and omitted property preserves stored time', async (t) => {
  let saved = { ...row, race_time_ms: 4567 };
  const patches = [];
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = new URL(input);
    assert.match(url.pathname, /\/participants$/);
    if (options.method === 'PATCH') {
      const patch = JSON.parse(options.body); patches.push(patch);
      saved = { ...saved, ...patch };
      return reply([saved]);
    }
    assert.equal(url.searchParams.get('limit'), '0');
    assert.match(url.searchParams.get('select'), /race_time_ms/);
    return reply([]);
  });
  for (const raceTimeMs of [0, 2147483647, null, 54321]) {
    const response = await call('voting-admin', { action: 'save', id, raceTimeMs, totalScore: 999 });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).participant.raceTimeMs, raceTimeMs);
    assert.deepEqual(patches.at(-1), { race_time_ms: raceTimeMs });
  }
  const edit = await call('voting-admin', { action: 'save', id, projectName: 'New cart' });
  assert.equal((await edit.json()).participant.raceTimeMs, 54321);
  assert.deepEqual(patches.at(-1), { project_name: 'New cart' });
});

test('New participant save persists timing and returns raceTimeMs', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    if (options.method !== 'POST') return reply([]);
    const [inserted] = JSON.parse(options.body);
    assert.equal(inserted.race_time_ms, 0);
    assert.equal(inserted.start_number, 8);
    return reply([{ ...row, ...inserted }]);
  });
  const result = await call('voting-admin', { action: 'save', firstName: 'First', lastName: 'Last', category: 'art', startNumber: 8, raceTimeMs: 0 });
  assert.equal(result.status, 200);
  assert.equal((await result.json()).participant.raceTimeMs, 0);
});

test('Timing mutations require admin credentials and public voting cannot write times', async (t) => {
  let writes = 0;
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    if (options.method) writes++;
    return reply([]);
  });
  assert.equal((await call('voting-admin', { action: 'save', id, raceTimeMs: 0 }, false)).status, 401);
  assert.equal((await call('voting', { action: 'save', id, raceTimeMs: 0 })).status, 400);
  assert.equal(writes, 0);
});

for (const old of [false, true]) test(`Voting public/admin state preserves score privacy and nullable timing (${old ? '0047' : '0048'})`, async (t) => {
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/participants')) {
      if (old && url.searchParams.get('select').includes('race_time_ms')) return reply(missing('race_time_ms'), 400);
      return reply([{ ...row, ...(old ? {} : { race_time_ms: 0 }) }]);
    }
    if (url.pathname.endsWith('/voting_ranking')) return reply([{ participant_id: id, vote_count: 2, total_score: 18, average_score: 9 }]);
    return reply([]);
  });
  const admin = await (await call('voting-admin', { action: 'state' })).json();
  assert.equal(admin.timingReady, !old);
  assert.equal(admin.participants[0].raceTimeMs, old ? null : 0);
  assert.equal(admin.participants[0].totalScore, 18);
  assert.equal(admin.participants[0].registrationId, row.registration_id);
  const publicState = await (await call('voting', { action: 'state' })).json();
  assert.equal(publicState.participants[0].raceTimeMs, old ? null : 0);
  assert.equal(publicState.participants[0].totalScore, 0);
  assert.equal(publicState.participants[0].voteCount, 0);
  assert.doesNotMatch(JSON.stringify(publicState), /registration_id|registrationId|image_path|private-service-key/);
});

test('Archived edition DTO returns recorded time and null for historical missing time', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input);
    if (url.searchParams.has('edition_key')) return reply([{ id, edition_key: '2025', status: 'archived', results: [
      { id: 'a', raceTimeMs: 0, totalScore: 20, voteCount: 2 }, { id: 'b', totalScore: 10, voteCount: 1 },
      { id: 'c', raceTimeMs: 54321, totalScore: 9, voteCount: 1 }
    ], prizes: [] }]);
    return reply([]);
  });
  const body = await (await call('voting', { action: 'state', edition: '2025' })).json();
  assert.equal(body.isArchive, true);
  assert.deepEqual(body.participants.map(p => p.raceTimeMs), [0, null, 54321]);
  assert.deepEqual(body.podium.map(p => p.id), ['a', 'b', 'c']);
});

test('0047 rollout keeps ordinary saves/creates but blocks timing before any mutation', async (t) => {
  const writes = [];
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = new URL(input);
    if (url.searchParams.get('select').includes('race_time_ms')) return reply(missing('race_time_ms', 'PGRST204'), 400);
    if (!options.method) return reply([]);
    writes.push(JSON.parse(options.body));
    return reply([row]);
  });
  for (const raceTimeMs of [null, 0, 123]) {
    const response = await call('voting-admin', { action: 'save', id, raceTimeMs, projectName: 'Do not partially save' });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'VOTING_TIMING_MIGRATION_REQUIRED');
  }
  assert.equal(writes.length, 0);
  const edit = await call('voting-admin', { action: 'save', id, projectName: 'Ordinary edit' });
  assert.equal(edit.status, 200);
  assert.equal((await edit.json()).participant.raceTimeMs, null);
  assert.deepEqual(writes[0], { project_name: 'Ordinary edit' });
  assert.equal((await call('voting-admin', { action: 'save', firstName: 'First', lastName: 'Last', category: 'art', startNumber: 8 })).status, 200);
});

test('0047 rollout still accepts a public vote via participant lookup fallback', async (t) => {
  let vote;
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/voting_settings')) return reply([{ status: 'voting', race_starts_at: '2020-01-01T00:00:00Z' }]);
    if (url.pathname.endsWith('/participants')) {
      if (url.searchParams.get('select').includes('race_time_ms')) return reply(missing('race_time_ms'), 400);
      return reply([row]);
    }
    if (url.pathname.endsWith('/votes') && options.method === 'POST') {
      [vote] = JSON.parse(options.body);
      return reply([{ edit_token: 'token' }]);
    }
    return reply([]);
  });
  const result = await call('voting', { action: 'vote', participantId: id, deviceId: '33333333-3333-4333-8333-333333333333', score: 8 });
  assert.equal(result.status, 200);
  assert.equal(vote.score, 8);
  assert.equal(vote.category, 'public-choice');
});

test('Unrelated participant failures are not retried as missing timing schema', async (t) => {
  for (const error of [missing('image_path'), missing('race_time_ms', '42501')]) {
    let participantReads = 0;
    t.mock.method(globalThis, 'fetch', async (input) => {
      if (new URL(input).pathname.endsWith('/participants')) { participantReads++; return reply(error, 400); }
      return reply([]);
    });
    const response = await call('voting-admin', { action: 'state' });
    assert.equal(response.status, 502);
    assert.equal((await response.json()).code, 'VOTING_READ_FAILED');
    assert.equal(participantReads, 1);
    t.mock.restoreAll();
  }
});

test('0047 broadcast reads default live/null, rejects replay, and preserves base on-air/settings actions', async (t) => {
  const commands = [];
  const reads = [];
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = new URL(input); reads.push(url.pathname);
    if (url.pathname.endsWith('/broadcast_state')) {
      if (url.searchParams.get('select').includes('participant_mode')) return reply(missing('participant_mode'), 400);
      return reply([{ ...state, participant: { id } }]);
    }
    if (url.pathname.endsWith('/broadcast_command')) {
      commands.push(JSON.parse(options.body)); return reply(state);
    }
    if (url.pathname.endsWith('/broadcast_photo_source')) return reply({ id, photo: '', imagePath: '' });
    if (url.pathname.endsWith('/broadcast_admin_state')) return reply({ state: { ...state, participant: { id } }, participants: [{ id }], sponsors: [] });
    if (url.pathname.endsWith('/participants')) return reply([{ id, registration_id: row.registration_id }]);
    return reply([{ data: { sponsors: [], showWall: true } }]);
  });
  const publicBody = await (await call('broadcast', { action: 'state' })).json();
  assert.equal(publicBody.timingReady, false);
  assert.equal(publicBody.state.participant_mode, 'live');
  assert.equal(publicBody.state.participant.raceTimeMs, null);
  const before = reads.length;
  const replay = await call('broadcast-admin', { action: 'on-air', id, mode: 'replay' });
  assert.equal(replay.status, 503);
  assert.equal((await replay.json()).code, 'BROADCAST_TIMING_MIGRATION_REQUIRED');
  assert.equal(commands.length, 0);
  assert.ok(reads.slice(before).every(path => path.endsWith('/broadcast_state')));
  for (const body of [{ action: 'on-air', id }, { action: 'on-air', id, mode: 'live' }, { action: 'hide' },
    { action: 'clear' }, { action: 'sponsors-toggle', enabled: false }]) {
    const response = await call('broadcast-admin', body);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.timingReady, false);
    assert.equal(data.state.participant_mode, 'live');
    assert.equal(data.participants[0].raceTimeMs, null);
  }
  assert.equal((await call('settings-admin', { settings: { showWall: false } })).status, 200);
  assert.equal(commands.at(-1).p_action, 'settings-patch');
});

test('0048 replay forwards mode only with the selected id and includes timing in broadcast DTOs', async (t) => {
  const commands = [];
  const current = { ...state, participant_mode: 'replay', participant: { id, raceTimeMs: 12345 } };
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/broadcast_state')) return reply([current]);
    if (url.pathname.endsWith('/broadcast_command')) { commands.push(JSON.parse(options.body)); return reply(current); }
    if (url.pathname.endsWith('/broadcast_photo_source')) return reply({ id, photo: '', imagePath: '' });
    if (url.pathname.endsWith('/participants')) return reply([{ id, registration_id: row.registration_id }]);
    return reply({ state: current, participants: [{ id, raceTimeMs: 12345 }], sponsors: [] });
  });
  for (const mode of ['replay', 'live']) {
    const response = await call('broadcast-admin', { action: 'on-air', id, mode, raceTimeMs: 999, participant: { id: 'wrong' } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.timingReady, true);
    assert.equal(body.participants[0].raceTimeMs, 12345);
    assert.equal(body.state.participant.raceTimeMs, 12345);
    assert.deepEqual(commands.at(-1).p_payload, { id, mode });
  }
  const body = await (await call('broadcast', { action: 'state' })).json();
  assert.equal(body.state.participant_mode, 'replay');
  assert.equal(body.timingReady, true);
});

test('Mode validation rejects null/invalid types before reads; unrelated broadcast errors never fallback', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not read'); });
  for (const mode of [null, '', ' live ', 'LIVE', 'unknown', true, 1, {}, []]) {
    const response = await call('broadcast-admin', { action: 'on-air', id, mode });
    assert.equal(response.status, 422);
    assert.equal((await response.json()).code, 'BROADCAST_BAD_MODE');
  }
  t.mock.restoreAll();
  let count = 0;
  t.mock.method(globalThis, 'fetch', async () => { count++; return reply(missing('participant_mode', '42501'), 403); });
  const response = await call('broadcast', { action: 'state' });
  assert.equal(response.status, 502);
  assert.equal(count, 1);
});
