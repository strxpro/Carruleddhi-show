import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './index.js';

const env = { SUPABASE_URL: 'https://db.invalid', SUPABASE_SERVICE_KEY: 'test-service', WALL_SALT: 'test-salt' };
const id = '11111111-1111-4111-8111-111111111111';
const token = 'visitor-token-12345678';
const entry = { id, email: 'rider@example.org', first_name: 'Legal', last_name: 'Identity',
  status: 'confirmed', is_minor: false, phone: '123', address: 'Old address', town: 'Old town',
  cart_name: 'Cart', team_name: 'Team', cart_notes: 'Notes', category: 'classic',
  race_number: 12, locale: 'en', wants_print: true };
const thread = { id, mode: 'ai', locale: 'en', display_name: 'Old Name', email: 'old@example.org' };
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });
async function call(route, body, config = env) {
  const response = await worker.fetch(new Request(`https://site.invalid/api/carruleddhi/${route}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }), config, {});
  return { status: response.status, body: await response.json() };
}
const manage = (body, config) => call('entry-manage', { email: entry.email, code: '123456', entryId: id, ...body }, config);

test('print accepts entryId and boolean false, and makes only an atomic authorized RPC', async (t) => {
  const writes = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    if (String(url).includes('/registrations?')) return reply([entry, { ...entry, id: 'other' }]);
    assert.match(String(url), /rpc\/entry_manage_with_code$/);
    writes.push(JSON.parse(options.body));
    return reply({ ok: true });
  });
  assert.deepEqual(await manage({ action: 'print', wantsPrint: false }), { status: 200, body: { ok: true, wantsPrint: false } });
  assert.equal(writes[0].p_entry_id, id);
  assert.deepEqual(writes[0].p_patch, { wants_print: false });
  assert.match(writes[0].p_code_hash, /^[a-f0-9]{64}$/);
  for (const wantsPrint of ['false', 0, null, {}, []]) {
    assert.equal((await manage({ action: 'print', wantsPrint })).body.code, 'ENTRY_BAD_PRINT');
  }
  assert.equal((await manage({ action: 'print' })).body.code, 'ENTRY_BAD_PRINT');
  assert.equal((await manage({ action: 'print', wantsPrint: true, entryId: undefined, id })).body.code, 'ENTRY_ID_REQUIRED');
  assert.equal(writes.length, 1);
});

test('entry clears survive sanitizer/receipt, forbidden identity is dropped, and mail is only queued', async (t) => {
  let patch;
  let letter;
  let makeStatus = 200;
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    if (String(url).includes('/registrations?')) return reply([entry]);
    if (String(url).endsWith('/entry_manage_with_code')) {
      patch = JSON.parse(options.body).p_patch;
      return reply({ ok: true });
    }
    assert.equal(url, 'https://make.invalid');
    letter = JSON.parse(options.body);
    return reply({}, makeStatus);
  });
  const payload = { action: 'update', phone: '', address: null, town: ' ', teamName: null, cartNotes: '',
    wantsPrint: false, firstName: 'Not allowed', lastName: 'No', birthDate: '2000-01-01', consent: true };
  const result = await manage(payload, { ...env, MAKE_WEBHOOK_URL: 'https://make.invalid' });
  assert.equal(result.status, 200);
  assert.equal(result.body.mailed, true);
  assert.equal(result.body.mailStatus, 'queued');
  for (const key of ['phone', 'address', 'town', 'team_name', 'cart_notes']) assert.equal(patch[key], null);
  assert.equal(patch.wants_print, false);
  for (const key of ['phone', 'address', 'town', 'teamName', 'cartNotes']) assert.equal(letter[key], '');
  assert.equal(letter.firstName, 'Legal');
  assert.equal(letter.wantsPrint, false);
  assert.ok(!Object.hasOwn(patch, 'first_name'));
  makeStatus = 502;
  const failedMail = await manage({ action: 'update', phone: '456' }, { ...env, MAKE_WEBHOOK_URL: 'https://make.invalid' });
  assert.equal(failedMail.status, 200);
  assert.equal(failedMail.body.mailed, false);
  assert.equal(failedMail.body.mailStatus, 'failed');
  assert.equal((await manage({ action: 'update', phone: [] })).body.code, 'ENTRY_BAD_FIELD');
});

test('missing migration and transaction failure never fall back to consume/PATCH or send mail', async (t) => {
  let error = { code: 'PGRST202' };
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls++;
    if (String(url).includes('/registrations?')) return reply([entry]);
    assert.match(String(url), /rpc\/entry_manage_with_code$/);
    return reply(error, 404);
  });
  assert.equal((await manage({ action: 'update', phone: '456' })).body.code, 'ENTRY_MIGRATION_REQUIRED');
  error = { code: '23514' };
  assert.equal((await manage({ action: 'withdraw' })).body.code, 'ENTRY_WRITE_FAILED');
  assert.equal(calls, 4);
});

test('minor/withdrawn mutations are rejected without writes; view still requires a code', async (t) => {
  let row = { ...entry, is_minor: true };
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).includes('/registrations?')) return reply([row]);
    assert.match(String(url), /rpc\/verification_code_check$/);
    return reply({ ok: true, id });
  });
  for (const action of ['update', 'withdraw', 'print']) {
    assert.equal((await manage({ action, wantsPrint: false, phone: 'new' })).body.code, 'ENTRY_MINOR_ORGANISER');
  }
  row = { ...entry, status: 'withdrawn' };
  assert.equal((await manage({ action: 'update', phone: 'new' })).body.code, 'ENTRY_WITHDRAWN');
  const view = await manage({ action: 'view' });
  assert.equal(view.status, 200);
  assert.equal(view.body.entry.status, 'withdrawn');
});

test('profile validates raw values, resolves token, confirms saved DTO and changes only chat fields', async (t) => {
  let writes = 0;
  let patchOk = true;
  let found = true;
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const parsed = new URL(url);
    assert.equal(parsed.pathname, '/rest/v1/chat_threads');
    if (options.method !== 'PATCH') {
      assert.equal(parsed.searchParams.get('visitor_token'), `eq.${token}`);
      return reply(found ? [thread] : []);
    }
    assert.equal(parsed.searchParams.get('visitor_token'), `eq.${token}`);
    assert.equal(parsed.searchParams.get('id'), `eq.${id}`);
    assert.deepEqual(JSON.parse(options.body), { display_name: 'New Name', email: 'new@example.org' });
    writes++;
    return reply(patchOk ? [{ display_name: 'New Name', email: 'new@example.org' }] : [], patchOk ? 200 : 500);
  });
  const payload = { action: 'profile', token, name: ' New Name ', email: 'NEW@example.org', threadId: 'someone-else', firstName: 'No' };
  assert.deepEqual((await call('chat', payload)).body, { ok: true, profile: { name: 'New Name', email: 'new@example.org' } });
  for (const bad of [{ name: '' }, { name: null }, { name: 'a'.repeat(81) }, { name: 'A\nB' },
    { email: '' }, { email: 'bad' }, { email: [] }]) {
    assert.equal((await call('chat', { ...payload, ...bad })).body.code, 'CHAT_BAD_PROFILE');
  }
  assert.equal(writes, 1);
  patchOk = false;
  assert.equal((await call('chat', payload)).body.code, 'CHAT_WRITE_FAILED');
  found = false;
  assert.equal((await call('chat', payload)).body.code, 'CHAT_NO_THREAD');
  assert.equal((await call('chat', { ...payload, token: 'bad' })).body.code, 'CHAT_BAD_TOKEN');
});

test('shipped gate can initialize a blank thread once from explicit fields, never message prose', async (t) => {
  let saved = { ...thread, display_name: null, email: null };
  let writes = 0;
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    if (String(url).includes('/chat_threads?')) {
      if (options.method !== 'PATCH') return reply([saved]);
      assert.match(String(url), /display_name=is.null&email=is.null/);
      const patch = JSON.parse(options.body);
      assert.deepEqual(patch, { display_name: 'Gate Name', email: 'gate@example.org' });
      saved = { ...saved, ...patch };
      writes++;
      return reply([saved]);
    }
    assert.match(String(url), /\/chat_messages/);
    return reply([{ id: 'message', created_at: '2026-10-01T00:00:00Z' }]);
  });
  assert.equal((await call('chat', { action: 'open', token })).body.profile.name, '');
  const send = { action: 'send', token, message: 'sponsorship', name: 'Gate Name', email: 'gate@example.org' };
  assert.equal((await call('chat', send)).body.selfService, 'sponsor');
  assert.equal((await call('chat', { ...send, name: 'Ignored', email: 'ignored@example.org' })).body.selfService, 'sponsor');
  assert.equal(writes, 1);
  assert.deepEqual((await call('chat', { action: 'open', token })).body.profile,
    { name: 'Gate Name', email: 'gate@example.org' });
});

function mockChat(t, model = null, facts = null) {
  const writes = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/chat_threads')) {
      if (options.method === 'PATCH') { writes.push(JSON.parse(options.body)); return reply([]); }
      return reply([thread]);
    }
    if (parsed.pathname.endsWith('/chat_messages')) {
      if (options.method === 'POST') return reply([{ id: 'new-message', created_at: '2026-10-01T00:00:00Z' }]);
      if (parsed.searchParams.get('order') === 'created_at.desc,id.desc') {
        assert.equal(parsed.searchParams.get('limit'), '6');
        assert.equal(parsed.searchParams.get('id'), 'neq.new-message');
        assert.equal(parsed.searchParams.get('author'), 'in.(visitor,ai,organiser)');
        return reply([6, 5, 4, 3, 2, 1].map((n) => ({ id: `m${n}`, author: n % 2 ? 'visitor' : 'organiser', body: `recent ${n}` })));
      }
      assert.equal(parsed.searchParams.get('order'), 'created_at.asc');
      return reply([]);
    }
    if (url === 'https://model.invalid') return model(JSON.parse(options.body));
    if (/\/(voting_settings|stream_state|prize_winners|public_counts)$/.test(parsed.pathname)) {
      return facts ? reply(facts[parsed.pathname.split('/').pop()] || []) : reply({}, 503);
    }
    assert.fail(`Unexpected network request: ${url}`);
  });
  return writes;
}

test('explicit human wins over sponsor, legal name correction guides organiser, prose never edits profile', async (t) => {
  const writes = mockChat(t);
  for (const message of ['I want to speak to a human about sponsorship', 'CHCĘ POROZMAWIAĆ Z CZŁOWIEKIEM O SPONSORINGU',
    'Nie chcę automatu, poproszę człowieka o sponsorowanie']) {
    const result = await call('chat', { action: 'send', token, message, name: 'Other', email: 'other@example.org' });
    assert.equal(result.body.mode, 'human');
    assert.equal(result.body.selfService, undefined);
  }
  const identity = await call('chat', { action: 'send', token, message: 'Change my name', locale: 'en' });
  assert.equal(identity.body.mode, 'human');
  assert.match(identity.body.reply, /chat profile|profilo|profil/);
  assert.ok(writes.every((patch) => !Object.hasOwn(patch, 'display_name') && !Object.hasOwn(patch, 'email')));
});

test('negated human and name requests do not trigger a handover or data wizard', async (t) => {
  mockChat(t);
  for (const message of ['I do not want to speak to a human, please.', 'Do not change my name',
    'Non voglio parlare con un operatore', 'Nie chcę rozmawiać z organizatorem']) {
    const result = await call('chat', { action: 'send', token, message });
    assert.equal(result.body.mode, 'ai');
    assert.equal(result.body.selfService, undefined);
  }
});

test('model receives newest six in chronological order; unavailable live facts do not assert false; poll unchanged', async (t) => {
  let prompt;
  mockChat(t, (body) => { prompt = body; return reply({ choices: [{ message: { content: 'An answer' } }] }); });
  const result = await call('chat', { action: 'send', token, message: 'Tell me something unusual about today' },
    { ...env, AI_API_KEY: 'test', AI_API_URL: 'https://model.invalid' });
  assert.equal(result.status, 200);
  assert.deepEqual(prompt.messages.slice(1, -1).map((m) => m.content), [1, 2, 3, 4, 5, 6].map((n) => `recent ${n}`));
  assert.doesNotMatch(prompt.messages[0].content, /STAN NA TERAZ: transmisja na żywo nie trwa|STAN NA TERAZ: wyniki NIE/);
  assert.ok(!prompt.tools);
  assert.equal((await call('chat', { action: 'poll', token, since: '2026-10-01T00:00:00Z' })).status, 200);
});

test('successful live facts use the actual voting status and do not coerce unknown counts to zero', async (t) => {
  const now = Date.now();
  t.mock.method(Date, 'now', () => now + 120000);
  let prompt;
  mockChat(t, (body) => { prompt = body; return reply({ choices: [{ message: { content: 'An answer' } }] }); }, {
    voting_settings: [{ status: 'voting' }], stream_state: [{ is_live: false }],
    prize_winners: [], public_counts: [{ registrations: null, riders: null }]
  });
  await call('chat', { action: 'send', token, message: 'Tell me something unusual about today' },
    { ...env, AI_API_KEY: 'test', AI_API_URL: 'https://model.invalid' });
  assert.match(prompt.messages[0].content, /głosowanie publiczności jest OTWARTE/);
  assert.match(prompt.messages[0].content, /STAN NA TERAZ: transmisja na żywo nie trwa/);
  assert.doesNotMatch(prompt.messages[0].content, /zgłoszonych zawodników: 0/);
});
