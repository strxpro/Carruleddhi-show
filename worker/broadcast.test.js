import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './index.js';
import { realtimeConfig, cleanBroadcastSponsor, decodeBroadcastImage, broadcastPublic, broadcastAdmin } from './broadcast.js';

const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_KEY: 'private-service-key', ROSTER_KEY: 'admin-password' };
const id = '11111111-1111-4111-8111-111111111111';
const state = { id: 'main', revision: 3, participant: null, participant_visible: false,
  participant_mode: 'live', sponsors_enabled: false, sponsors: [], updated_at: '2026-10-01T00:00:00Z', run_status: 'IDLE' };
const data = { state, participants: [], sponsors: [], serverNow: '2026-10-01T00:00:01Z' };
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const jwt = (role) => `header.${btoa(JSON.stringify({ role }))}.signature`;
const request = (route, body, authenticated = false) => new Request(`https://example.test/api/carruleddhi/${route}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { 'X-Carruleddhi-Roster-Key': env.ROSTER_KEY } : {}) },
  body: JSON.stringify(body)
});

test('Realtime exposes only an explicitly configured anon or publishable credential', () => {
  for (const key of ['', env.SUPABASE_SERVICE_KEY, 'sb_secret_nope', jwt('service_role'), jwt('authenticated'), 'invalid']) {
    const config = realtimeConfig({ ...env, SUPABASE_ANON_KEY: key });
    assert.equal(config.ready, false);
    assert.equal(config.anonKey, null);
  }
  for (const key of [jwt('anon'), 'sb_publishable_example']) {
    assert.equal(realtimeConfig({ ...env, SUPABASE_ANON_KEY: key }).anonKey, key);
    assert.equal(realtimeConfig({ ...env, SUPABASE_PUBLISHABLE_KEY: key }).ready, true);
  }
  assert.equal(realtimeConfig(env).code, 'REALTIME_NOT_CONFIGURED');
});

test('Sponsor validator strips private and unknown fields; keeps stable editing path', () => {
  assert.deepEqual(cleanBroadcastSponsor({ id: 'sponsor-one', name: ' Example ', logo: 'sponsors/a.png', url: 'https://example.org',
    active: false, order: 4, tier: 'gold', email: 'private@example.org', logoUrl: 'https://signed.invalid' }), {
    id: 'sponsor-one', name: 'Example', logo: 'sponsors/a.png', url: 'https://example.org/', active: false, order: 4, tier: 'gold'
  });
});

test('Sponsor validator rejects unsafe URLs, paths, and malformed metadata', () => {
  for (const change of [{ url: 'javascript:alert(1)' }, { url: 'https://user:pass@example.org' },
    { logo: 'sponsors/../private' }, { logo: 'https://example.org/logo.png' }, { active: 'false' },
    { order: 30 }, { order: 0.5 }, { tier: 'a'.repeat(41) }, { id: 'bad.id' }]) {
    assert.throws(() => cleanBroadcastSponsor({ name: 'Valid', ...change }), /BROADCAST_BAD_/);
  }
});

test('Prepared image requires supported MIME, size and matching magic bytes', () => {
  const png = Buffer.alloc(64); png.set([137,80,78,71,13,10,26,10]);
  assert.equal(decodeBroadcastImage(`data:image/png;base64,${png.toString('base64')}`).ext, 'png');
  for (const image of ['data:image/svg+xml;base64,PHN2Zz4=', 'https://example.org/photo.jpg',
    `data:image/jpeg;base64,${png.toString('base64')}`, 'data:image/png;base64,AA==']) {
    assert.throws(() => decodeBroadcastImage(image), /BROADCAST_BAD_PHOTO/);
  }
});

test('Public state reads only the sanitized singleton and reports realtime readiness', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push({ url, options }); return reply(data); });
  const result = await (await broadcastPublic(env, { action: 'state' }, {})).json();
  assert.deepEqual(result.state, state);
  assert.equal(result.realtime.ready, false);
  assert.equal(result.realtime.anonKey, null);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/rpc\/broadcast_snapshot$/);
  assert.equal(result.serverNow, data.serverNow);
  assert.equal(result.runReady, true);
  assert.doesNotMatch(JSON.stringify(result), /private-service-key|registration|birth|email/);
});

test('Public route cannot be promoted to admin by body action or type and needs no CAPTCHA', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return reply(data); });
  const read = await worker.fetch(request('broadcast', { action: 'state' }), { ...env, TURNSTILE_SECRET: 'enabled' }, {});
  assert.equal(read.status, 200);
  const bad = await worker.fetch(request('broadcast', { action: 'on-air', type: 'broadcast-admin', id }), env, {});
  assert.equal(bad.status, 400);
  assert.equal(calls, 1);
});

test('Protected roster mapping uses participant IDs, never reused numbers or personal data', async (t) => {
  const second = '33333333-3333-4333-8333-333333333333';
  const registration = '22222222-2222-4222-8222-222222222222';
  const otherRegistration = '44444444-4444-4444-8444-444444444444';
  const participants = [id, second].map((id) => ({ id, startNumber: 7, firstName: 'Same', lastName: 'Name' }));
  let reads = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('broadcast_admin_state')) return reply({ ...data, participants });
    reads++;
    assert.equal(options.method, 'GET');
    assert.equal(options.headers.apikey, env.SUPABASE_SERVICE_KEY);
    assert.match(url, /participants\?select=id,registration_id&id=in\./);
    // Deliberately reversed; no correspondence by position, number, or name.
    return reply([{ id: second, registration_id: otherRegistration, email: 'private@example.org' }, { id, registration_id: registration }]);
  });
  const result = await worker.fetch(request('broadcast-admin', { action: 'state' }, true), env, {});
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.deepEqual(body.participants.map((p) => p.registrationId), [registration, otherRegistration]);
  assert.deepEqual(body.state, state);
  assert.doesNotMatch(JSON.stringify(body), /private@example|registration_id|private-service-key/);
  assert.equal(reads, 1);
});

test('Missing private links remain null and mapping read failures are explicit', async (t) => {
  let failed = false;
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url.endsWith('broadcast_admin_state')) return reply({ ...data, participants: [{ id, startNumber: 7 }] });
    return failed ? reply({ message: 'private diagnostics' }, 500) : reply([]);
  });
  const body = await (await broadcastAdmin(env, { action: 'state' }, {})).json();
  assert.equal(body.participants[0].registrationId, null);
  failed = true;
  const result = await broadcastAdmin(env, { action: 'state' }, {});
  assert.equal(result.status, 502);
  assert.deepEqual(await result.json(), { ok: false, code: 'BROADCAST_UNAVAILABLE' });
});

test('Hide and show retain the selected participant and never send sponsor changes', async (t) => {
  let current = { ...state, participant: { id }, participant_visible: true, sponsors_enabled: true };
  const commands = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('broadcast_photo_source')) return reply({ id, photo: '', imagePath: '' });
    if (url.endsWith('broadcast_command')) {
      const command = JSON.parse(options.body); commands.push(command);
      current = { ...current, revision: current.revision + 1, participant_visible: command.p_action === 'show' };
      return reply(current);
    }
    return reply({ ...data, state: current });
  });
  for (const action of [{ action: 'hide' }, { action: 'show' }]) {
    const result = await (await broadcastAdmin(env, action, {})).json();
    assert.equal(result.state.participant.id, id);
    assert.equal(result.state.participant_visible, action.action === 'show');
    assert.equal(result.state.sponsors_enabled, true);
  }
  assert.deepEqual(commands, [{ p_action: 'hide', p_payload: {} }, { p_action: 'show', p_payload: {} }]);
});

test('Admin route requires the roster password before any database access', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not access DB'); });
  const result = await worker.fetch(request('broadcast-admin', { action: 'on-air', id }), env, {});
  assert.equal(result.status, 401);
  assert.equal((await result.json()).code, 'ROSTER_UNAUTHORISED');
});

test('Admin on-air sends only the participant id to the atomic RPC, never a client snapshot', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    if (url.endsWith('broadcast_photo_source')) return reply({ id, photo: '', imagePath: '' });
    return reply(url.endsWith('broadcast_command') ? state : data);
  });
  const result = await worker.fetch(request('broadcast-admin', { action: 'on-air', id,
    participant: { email: 'no@example.org' }, sponsors_enabled: true }, true), env, {});
  assert.equal(result.status, 200);
  assert.deepEqual(calls[0].body, {});
  assert.match(calls[0].url, /broadcast_snapshot$/);
  assert.deepEqual(calls[1].body, { p_id: id });
  assert.deepEqual(calls[2].body, { p_action: 'start', p_payload: { id } });
  assert.equal(calls.length, 4);
  assert.deepEqual((await result.json()).participants, []);
});

test('Sponsor-order keeps all 30 ids through router sanitization and preserves an empty list', async (t) => {
  const bodies = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('broadcast_command')) bodies.push(JSON.parse(options.body));
    return reply(url.endsWith('broadcast_command') ? state : data);
  });
  for (const ids of [Array.from({ length: 30 }, (_, i) => `sponsor-${i}`), []]) {
    assert.equal((await worker.fetch(request('broadcast-admin', { action: 'sponsor-order', ids }, true), env, {})).status, 200);
    assert.deepEqual(bodies.at(-1).p_payload.ids, ids);
  }
});

test('Admin validation rejects malformed actions before writes', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not access DB'); });
  for (const payload of [{ action: 'on-air', id: 'bad' }, { action: 'sponsors-toggle', enabled: 'false' },
    { action: 'sponsor-order', ids: ['a','a'] }, { action: 'participant-photo', id, image: 'invalid' }]) {
    assert.equal((await broadcastAdmin(env, payload, {})).status, 422);
  }
  assert.equal((await broadcastAdmin(env, { action: 'unknown' }, {})).status, 400);
});

test('Database eligibility errors and missing migrations are explicit without leaking raw errors', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => reply({ code: 'P0001', message: 'BROADCAST_PARTICIPANT_INELIGIBLE' }, 400));
  const invalid = await broadcastAdmin(env, { action: 'on-air', id }, {});
  assert.equal(invalid.status, 422);
  assert.equal((await invalid.json()).code, 'BROADCAST_PARTICIPANT_INELIGIBLE');
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async () => reply({ code: 'PGRST205', message: 'private DB diagnostics' }, 404));
  const missing = await broadcastPublic(env, {}, {});
  assert.equal(missing.status, 503);
  assert.equal((await missing.json()).code, 'BROADCAST_MIGRATION_REQUIRED');
});

test('Admin photo rejects ineligible participants before publishing any image', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url) => { calls.push(url); return reply(data); });
  const png = Buffer.alloc(64); png.set([137,80,78,71,13,10,26,10]);
  const result = await broadcastAdmin(env, { action: 'participant-photo', id, image: `data:image/png;base64,${png.toString('base64')}` }, {});
  assert.equal((await result.json()).code, 'BROADCAST_PARTICIPANT_INELIGIBLE');
  assert.equal(calls.length, 1);
  assert.match(calls[0], /broadcast_admin_state$/);
});

test('Admin sponsor response separates stable logo and public display URL', async (t) => {
  const sponsor = { id: 's1', name: 'Sponsor', logo: 'sponsors/a.png', url: '', active: true, order: 0, tier: 'partner' };
  const publicSponsor = { ...sponsor, logo: 'https://example.supabase.co/storage/v1/object/public/broadcast-assets/sponsors/a.png' };
  t.mock.method(globalThis, 'fetch', async () => reply({ ...data, state: { ...state, sponsors: [publicSponsor] }, sponsors: [sponsor] }));
  const body = await (await broadcastAdmin(env, { action: 'state' }, {})).json();
  assert.equal(body.sponsors[0].logo, 'sponsors/a.png');
  assert.equal(body.sponsors[0].logoUrl, publicSponsor.logo);
});

test('Legacy settings saves use a field-only transaction and keep canonical sponsor metadata', async (t) => {
  const sponsor = { id: 's1', name: 'Sponsor', logo: '/assets/logo.png', url: '', active: false, order: 0, tier: 'gold' };
  let settings = { sponsors: [sponsor], showWall: true };
  const writes = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    if (String(url).includes('/rpc/broadcast_command')) {
      const body = JSON.parse(options.body); writes.push(body);
      settings = { ...settings, ...body.p_payload.patch };
      return reply(state);
    }
    assert.equal(options.method, undefined);
    assert.match(String(url), /\/site_settings\?/);
    return reply([{ data: settings }]);
  });
  const toggle = await worker.fetch(request('settings-admin', { settings: { showWall: false } }, true), env, {});
  assert.equal(toggle.status, 200);
  assert.deepEqual(writes[0], { p_action: 'settings-patch', p_payload: { patch: { showWall: false } } });
  assert.equal((await toggle.json()).settings.sponsors[0].logo, '/assets/logo.png');
  const save = await worker.fetch(request('settings-admin', { settings: { sponsors: [sponsor] }, expectedSponsors: [{ ...sponsor, logoUrl: 'preview-only' }] }, true), env, {});
  assert.equal(save.status, 200);
  assert.deepEqual(writes[1].p_payload.patch.sponsors[0], sponsor);
  assert.deepEqual(writes[1].p_payload.expectedSponsors, [sponsor]);
});

test('Unavailable existing sponsor asset does not disable the live control state', async (t) => {
  const sponsor = { id: 's1', name: 'Sponsor', logo: 'sponsors/missing.png', url: '', active: true, order: 0, tier: 'partner' };
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).includes('/broadcast_assets?')) return reply([]);
    if (String(url).includes('/storage/')) return reply({}, 404);
    return reply({ ...data, state: { ...state, sponsors: [{ ...sponsor, logo: '' }] }, sponsors: [sponsor] });
  });
  const result = await broadcastAdmin(env, { action: 'state' }, {});
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.assetWarnings, [{ id: 's1', code: 'BROADCAST_ASSET_NOT_READY' }]);
});

test('ON AIR copies only the selected eligible voting photo once and reuses its stable cache', async (t) => {
  const source = { id, photo: '', imagePath: 'participants/existing.png' };
  const png = Buffer.alloc(64); png.set([137,80,78,71,13,10,26,10]);
  const storage = []; const commands = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('broadcast_photo_source')) {
      assert.deepEqual(JSON.parse(options.body), { p_id: id });
      return reply(source);
    }
    if (url.includes('/storage/')) {
      storage.push({ url, options });
      if (options.method === 'POST') {
        assert.deepEqual(options.body, new Uint8Array(png));
        return reply({});
      }
      assert.equal(url, `${env.SUPABASE_URL}/storage/v1/object/authenticated/participant-photos/participants/existing.png`);
      assert.equal(options.redirect, 'error');
      return new Response(png, { headers: { 'Content-Type': 'image/png' } });
    }
    if (url.endsWith('broadcast_command')) {
      const command = JSON.parse(options.body); commands.push(command);
      if (command.p_payload.preparedPhoto) source.photo = command.p_payload.preparedPhoto;
      return reply(state);
    }
    return reply(data);
  });
  for (let attempt=0; attempt<2; attempt++) {
    assert.equal((await broadcastAdmin(env, { action:'on-air', id }, {})).status, 200);
  }
  assert.equal(storage.length, 2);
  assert.match(source.photo, /^https:\/\/example\.supabase\.co\/storage\/v1\/object\/public\/broadcast-assets\/participants\/[a-f0-9-]+\.png$/);
  assert.deepEqual(commands[0].p_payload, { id, sourcePath: source.imagePath, preparedPhoto: source.photo });
  assert.deepEqual(commands[1].p_payload, { id });
});

test('ON AIR preserves an uploaded crop without reading or copying the original photo', async (t) => {
  const calls=[];
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(url);
    assert.doesNotMatch(url, /\/storage\//);
    if (url.endsWith('broadcast_photo_source')) return reply({ id, photo: 'https://example.supabase.co/storage/v1/object/public/broadcast-assets/participants/crop.webp', imagePath: 'participants/original.png' });
    return reply(url.endsWith('broadcast_command') ? state : data);
  });
  assert.equal((await broadcastAdmin(env, { action:'on-air', id }, {})).status, 200);
  assert.equal(calls.length, 4);
});

test('ON AIR rejects invalid stored paths without SSRF, upload, or state mutation', async (t) => {
  let path=''; let calls=0;
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url.endsWith('broadcast_snapshot')) return reply(data);
    calls++;
    assert.match(url, /broadcast_photo_source$/);
    return reply({ id, photo:'', imagePath:path });
  });
  const paths=['https://evil.example/photo.jpg','//evil.example/photo.jpg','participants/../private.jpg',
    'participants/%2e%2e/private.jpg','participants/image.jpg?token=secret','participants\\image.jpg'];
  for (path of paths) {
    const result=await broadcastAdmin(env, { action:'on-air', id }, {});
    assert.equal(result.status, 422);
    assert.equal((await result.json()).code, 'BROADCAST_BAD_PHOTO_PATH');
  }
  assert.equal(calls, paths.length);
});

test('ON AIR does not copy or activate an ineligible participant', async (t) => {
  let calls=0;
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url.endsWith('broadcast_snapshot')) return reply(data);
    calls++; assert.match(url,/broadcast_photo_source$/); return reply(null);
  });
  const result=await broadcastAdmin(env, { action:'on-air', id }, {});
  assert.equal(result.status,422);
  assert.equal((await result.json()).code,'BROADCAST_PARTICIPANT_INELIGIBLE');
  assert.equal(calls,1);
});

test('ON AIR preparation failures never send the activation command', async (t) => {
  for (const failure of ['read','upload']) {
    t.mock.restoreAll();
    const png=Buffer.alloc(64); png.set([137,80,78,71,13,10,26,10]);
    t.mock.method(globalThis,'fetch',async (url,options) => {
      if (url.endsWith('broadcast_snapshot')) return reply(data);
      if (url.endsWith('broadcast_photo_source')) return reply({id,photo:'',imagePath:'participants/original.png'});
      assert.match(url,/\/storage\//);
      if (failure==='read' || options.method==='POST') return reply({},502);
      return new Response(png,{headers:{'Content-Type':'image/png'}});
    });
    const result=await broadcastAdmin(env,{action:'on-air',id},{});
    assert.equal(result.status,502);
    assert.equal((await result.json()).code, failure==='read' ? 'BROADCAST_ASSET_READ_FAILED':'BROADCAST_ASSET_UPLOAD_FAILED');
  }
});

test('Public homepage hides inactive sponsors while admin retains the canonical list', async (t) => {
  const sponsors=[{id:'on',name:'Active',logo:'/assets/on.png',active:true},
    {id:'off',name:'Inactive',logo:'/assets/off.png',active:false},
    {id:'legacy',name:'Legacy',logo:'/assets/legacy.png'}];
  t.mock.method(globalThis,'fetch',async () => reply([{data:{sponsors}}]));
  const homepage=await worker.fetch(request('settings',{}),env,{});
  assert.deepEqual((await homepage.json()).settings.sponsors.map((s)=>s.id),['on','legacy']);
  const admin=await worker.fetch(request('settings-admin',{},true),env,{});
  assert.deepEqual((await admin.json()).settings.sponsors.map((s)=>s.id),['on','off','legacy']);
});

test('Settings sponsor CAS uses the browser baseline unchanged, never a fresh server read', async (t) => {
  const original={id:'s1',name:'Before',url:'https://example.org',logo:'/assets/logo.png',active:true,order:0,tier:'partner'};
  let calls=0;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    calls++;
    assert.match(url,/broadcast_command$/);
    const body=JSON.parse(options.body);
    assert.deepEqual(body.p_payload.expectedSponsors,[original]);
    assert.equal(body.p_payload.patch.sponsors[0].name,'My stale edit');
    return reply({code:'P0001',message:'BROADCAST_SETTINGS_CONFLICT'},400);
  });
  const result=await worker.fetch(request('settings-admin',{
    settings:{sponsors:[{...original,name:'My stale edit'}]},expectedSponsors:[{...original,logoUrl:'signed-display-url'}]
  },true),env,{});
  assert.equal(result.status,409);
  assert.equal((await result.json()).code,'BROADCAST_SETTINGS_CONFLICT');
  assert.equal(calls,1);
});

test('Sponsor writes require original baselines with no guessed compatibility values', async(t)=>{
  const sponsor={id:'s1',name:'Sponsor',url:'',logo:'/assets/logo.png',active:true,order:0,tier:'partner'};
  t.mock.method(globalThis,'fetch',async()=>{throw new Error('must reject before fetch');});
  for(const expectedSponsors of [undefined,null,{},[{}]]) {
    const result=await worker.fetch(request('settings-admin',{settings:{sponsors:[sponsor]},expectedSponsors},true),env,{});
    assert.equal(result.status,409);
    assert.equal((await result.json()).code,'BROADCAST_SETTINGS_CONFLICT');
  }
  const {id:unused,...create}=sponsor;
  for(const payload of [
    {sponsor}, {sponsor,expectedSponsor:null}, {sponsor,expectedSponsor:{...sponsor,id:'another'}},
    {sponsor:create,expectedSponsor:sponsor}, {sponsor:create,expectedSponsor:null}
  ]) {
    const result=await worker.fetch(request('broadcast-admin',{action:'sponsor-save',...payload},true),env,{});
    assert.equal(result.status,409);
    assert.equal((await result.json()).code,'BROADCAST_SPONSOR_CONFLICT');
  }
});

test('Sponsor update forwards exact original fields; create has neither id nor baseline', async(t)=>{
  const original={id:'s1',name:'Sponsor',url:'https://example.org',logo:'/assets/logo.png',active:false,order:0,tier:'partner'};
  const commands=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(url.endsWith('broadcast_command')) {commands.push(JSON.parse(options.body));return reply(state);}
    return reply(data);
  });
  const result=await worker.fetch(request('broadcast-admin',{action:'sponsor-save',
    sponsor:{...original,name:'Edited'},expectedSponsor:{...original,logoUrl:'display-only'}},true),env,{});
  assert.equal(result.status,200);
  assert.deepEqual(commands[0].p_payload.expectedSponsor,original);
  assert.equal(commands[0].p_payload.sponsor.id,original.id);
  const {id:unused,...create}=original;
  assert.equal((await worker.fetch(request('broadcast-admin',{action:'sponsor-save',sponsor:create},true),env,{})).status,200);
  assert.equal(Object.hasOwn(commands[1].p_payload.sponsor,'id'),false);
  assert.equal(Object.hasOwn(commands[1].p_payload,'expectedSponsor'),false);
});

test('Settings baseline whitelist preserves all 30 sponsors and the empty baseline', async(t)=>{
  const received=[];
  t.mock.method(globalThis,'fetch',async(url,options={})=>{
    if(String(url).endsWith('broadcast_command')) {received.push(JSON.parse(options.body).p_payload.expectedSponsors);return reply(state);}
    return reply([{data:{sponsors:[]}}]);
  });
  for(const expectedSponsors of [[],Array.from({length:30},(_,order)=>({id:`s${order}`,name:'Sponsor',url:'',logo:'',active:true,order,tier:'partner'}))]) {
    const result=await worker.fetch(request('settings-admin',{settings:{sponsors:[]},expectedSponsors},true),env,{});
    assert.equal(result.status,200);
    assert.deepEqual(received.at(-1),expectedSponsors);
  }
});
