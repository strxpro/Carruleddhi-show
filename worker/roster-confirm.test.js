import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './index.js';

const id = '11111111-1111-4111-8111-111111111111';
const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_KEY: 'private-test-key', ROSTER_KEY: 'test-admin' };
const request = (body, authenticated = true) => new Request('https://example.test/api/carruleddhi/roster', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { 'X-Carruleddhi-Roster-Key': env.ROSTER_KEY } : {}) },
  body: JSON.stringify(body),
});

test('confirmation atomically changes only NEW status and ignores unrelated fields', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: new URL(url), options });
    return Response.json([{ id, status: 'confirmed', first_name: 'Test', last_name: 'Rider', race_number: 7 }]);
  });
  const response = await worker.fetch(request({ action: 'confirm', id, status: 'withdrawn', firstName: 'Changed', raceNumber: 99 }), env, {});
  assert.equal(response.status, 200);
  assert.equal((await response.json()).row.status, 'confirmed');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.searchParams.get('id'), `eq.${id}`);
  assert.equal(calls[0].url.searchParams.get('status'), 'eq.new');
  assert.deepEqual(JSON.parse(calls[0].options.body), { status: 'confirmed' });
});

test('concurrent withdrawal, existing confirmation or deletion produces conflict, not success', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json([]));
  const response = await worker.fetch(request({ action: 'confirm', id }), env, {});
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'ROSTER_STATUS_CONFLICT');
});

test('confirmation requires admin authentication and valid id before any database calls', async t => {
  let reads = 0;
  t.mock.method(globalThis, 'fetch', async () => { reads++; return Response.json([]); });
  assert.equal((await worker.fetch(request({ action: 'confirm', id }, false), env, {})).status, 401);
  assert.equal((await worker.fetch(request({ action: 'confirm', id: 'wrong' }), env, {})).status, 422);
  assert.equal(reads, 0);
});

test('ordinary roster editing keeps its existing behavior', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(new URL(url).searchParams.has('status'), false);
    assert.deepEqual(JSON.parse(options.body), { first_name: 'Corrected' });
    return Response.json([{ id, status: 'confirmed', first_name: 'Corrected', last_name: 'Rider' }]);
  });
  assert.equal((await worker.fetch(request({ action: 'update', id, firstName: 'Corrected' }), env, {})).status, 200);
});
