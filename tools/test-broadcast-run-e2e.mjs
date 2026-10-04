import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { PGlite } from '@electric-sql/pglite';
import { WebSocketServer } from 'ws';
import puppeteer from 'puppeteer';
import worker from '../worker/index.js';
import { formatRaceTime } from '../assets/js/race-time.js';

const origin = process.env.OBS_TEST_ORIGIN || 'http://127.0.0.1:5199';
const db = new PGlite();
const nativeFetch = globalThis.fetch;
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
const env = { SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_KEY: 'test-private-service',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', ROSTER_KEY: 'test-admin', BROADCAST_CONTROL_TOKEN: 'test-control-token-with-at-least-32-characters' };
await db.exec(`create role anon; create role authenticated; create role service_role;
  create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table site_settings(id boolean primary key,data jsonb not null); insert into site_settings values(true,'{"sponsors":[]}');
  create table registrations(id uuid primary key,first_name text,last_name text,town text,race_number integer,status text);
  create table participants(id uuid primary key,registration_id uuid references registrations(id),first_name text,last_name text,project_name text,category text,start_number integer,active boolean,image_path text);
  create function bump_stream_hearts(integer) returns integer language sql as 'select $1';
  create table voting_editions(id uuid primary key); create table voting_settings(id boolean primary key);`);
for (const name of ['0047_broadcast_state.sql', '0048_participant_race_time.sql', '0050_broadcast_run_control.sql']) {
  await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
}
for (const [id, number, name] of [[a, 1, 'Alessio'], [b, 2, 'Bianca']]) {
  await db.query('insert into registrations values($1,$2,\'Rossi\',\'Gallura\',$3,\'confirmed\')', [id, name, number]);
  await db.query('insert into participants(id,registration_id,first_name,last_name,project_name,category,start_number,active) values($1,$1,$2,\'Rossi\',\'Cart\',\'classic\',$3,true)', [id, name, number]);
}
const snapshot = async () => (await db.query('select broadcast_snapshot() value')).rows[0].value;
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.origin !== env.SUPABASE_URL) return nativeFetch(input, options);
  const name = url.pathname.replace('/rest/v1/', '');
  const body = options.body ? JSON.parse(options.body) : {};
  try {
    if (name === 'rpc/broadcast_snapshot') return Response.json(await snapshot());
    if (name === 'rpc/broadcast_admin_state') return Response.json((await db.query('select broadcast_admin_state() value')).rows[0].value);
    if (name === 'rpc/broadcast_photo_source') return Response.json((await db.query('select broadcast_photo_source($1) value', [body.p_id])).rows[0].value);
    if (name === 'rpc/broadcast_command') return Response.json((await db.query('select to_jsonb(broadcast_command($1,$2::jsonb)) value', [body.p_action, JSON.stringify(body.p_payload)])).rows[0].value);
    if (name === 'participants') return Response.json((await db.query('select id,registration_id from participants')).rows);
    throw new Error(`Unhandled fixture DB route: ${name}`);
  } catch (error) { return Response.json({ code: error.code || 'P0001', message: error.message }, { status: 400 }); }
};

const channels = new Map();
let lastRevision = -1;
const server = createServer(async (request, response) => {
  try {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    const result = await worker.fetch(new Request(`https://fixture.test${request.url}`, {
      method: request.method, headers: { 'Content-Type': 'application/json', ...(request.headers.authorization ? { Authorization: request.headers.authorization } : {}),
        ...(request.headers['x-carruleddhi-roster-key'] ? { 'X-Carruleddhi-Roster-Key': request.headers['x-carruleddhi-roster-key'] } : {}) },
      ...(request.method === 'GET' ? {} : { body }),
    }), env, { waitUntil() {} });
    response.writeHead(result.status, { 'Content-Type': 'application/json' });
    response.end(await result.text());
    const { state } = await snapshot();
    if (state.revision <= lastRevision) return;
    lastRevision = state.revision;
    const columns = Object.keys(state).map(name => ({ name, type: typeof state[name] === 'object' && state[name] !== null ? 'jsonb' : typeof state[name] === 'number' ? 'int8' : typeof state[name] === 'boolean' ? 'bool' : 'text' }));
    const payload = { ids: [1], data: { schema: 'public', table: 'broadcast_state', type: 'UPDATE', columns, record: state, old_record: {}, commit_timestamp: state.updated_at } };
    for (const [socket, channel] of channels) socket.send(JSON.stringify(channel.array ? [channel.joinRef, null, channel.topic, 'postgres_changes', payload] : { topic: channel.topic, event: 'postgres_changes', payload, ref: null }));
  } catch (error) { response.writeHead(500); response.end(JSON.stringify({ error: error.message })); }
});
const ws = new WebSocketServer({ server });
ws.on('connection', socket => {
  socket.on('message', buffer => {
    const raw = JSON.parse(buffer.toString());
    const [joinRef, ref, topic, event, payload] = Array.isArray(raw) ? raw : [raw.join_ref, raw.ref, raw.topic, raw.event, raw.payload];
    if (event === 'phx_join') channels.set(socket, { joinRef, topic, array: Array.isArray(raw) });
    const response = event === 'phx_join' ? { postgres_changes: (payload.config?.postgres_changes || []).map(change => ({ ...change, id: 1 })) } : {};
    socket.send(JSON.stringify(Array.isArray(raw) ? [joinRef, ref, topic, 'phx_reply', { status: 'ok', response }] : { join_ref: joinRef, ref, topic, event: 'phx_reply', payload: { status: 'ok', response } }));
  });
  socket.on('close', () => channels.delete(socket));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const apiOrigin = `http://127.0.0.1:${server.address().port}`;
const control = async (action, body = {}) => {
  const response = await nativeFetch(`${apiOrigin}/api/broadcast/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.BROADCAST_CONTROL_TOKEN}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result)); return result;
};
const browser = await puppeteer.launch({ headless: true, protocolTimeout: 30000,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const errors = [];
async function pageFor(path, admin = false) {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 1920, height: 1080 });
  if (admin) await page.evaluateOnNewDocument(() => {
    sessionStorage.setItem('carruleddhi.admin.key', 'test-admin'); sessionStorage.setItem('carruleddhi.admin.tab', 'live'); localStorage.setItem('carruleddhi.admin.locale.v2', 'pl');
  });
  await page.setRequestInterception(true);
  page.on('request', async request => {
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/')) return request.continue();
    if (path.endsWith('/inbox')) return request.respond({ status: 200, contentType: 'application/json', body: '{"ok":true,"total":0,"counts":{}}' });
    const response = await nativeFetch(`${apiOrigin}${path}`, { method: request.method(), headers: request.headers(), body: request.postData() });
    const data = await response.json();
    if (data.realtime) data.realtime = { ...data.realtime, url: apiOrigin };
    return request.respond({ status: response.status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto(`${origin}${path}`, { waitUntil: 'networkidle0' });
  return page;
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  const admin = await pageFor('/admin.html', true);
  const live = await pageFor('/obs/participant');
  const replay = await pageFor('/obs/replay');
  const sponsors = await pageFor('/obs/sponsors');
  await admin.waitForSelector('[data-run-status="IDLE"]');
  console.log('PASS initial DB state and all four browser clients');
  assert.equal(await replay.$('.obs-participant'), null);
  await control('show-sponsors');
  await sponsors.waitForSelector('.obs-house');
  console.log('PASS sponsor house cards after external control');
  const start = async name => {
    await admin.bringToFront();
    const selector = `[data-live-start="${name === 'Alessio' ? a : b}"]`;
    await admin.waitForFunction(selector => document.querySelector(selector) && !document.querySelector(selector).disabled, {}, selector);
    await admin.$eval(selector, button => button.click());
    await admin.waitForSelector('[data-run-status="RUNNING"]');
    await live.bringToFront();
    await live.waitForFunction(name => document.querySelector('.obs-first-name')?.textContent === name, {}, name);
  };
  await start('Alessio');
  console.log('PASS Admin START A');
  let current = (await snapshot()).state;
  const runA = current.run_id, startedA = current.started_at;
  const timerBefore = await admin.$eval('[data-run-elapsed]', el => el.textContent);
  await wait(2000);
  assert.notEqual(await admin.$eval('[data-run-elapsed]', el => el.textContent), timerBefore);
  await admin.bringToFront();
  await admin.$eval('[data-run-control]', el => el.scrollIntoView({ block: 'center' }));
  await admin.screenshot({ path: 'shots/broadcast-central-admin-running.png' });
  assert.equal((await control('start', { participantId: a })).state.started_at, startedA, 'duplicate hardware START does not reset admin run');
  const finishA = (await control('stop', { runId: runA })).state;
  console.log('PASS external STOP A committed');
  await admin.waitForSelector('[data-run-status="FINISHED"]');
  await replay.bringToFront();
  await replay.waitForSelector('.obs-race-time');
  assert.equal(await admin.$eval('[data-run-elapsed]', el => el.textContent), formatRaceTime(finishA.elapsed_ms));
  assert.equal(await replay.$eval('.obs-race-time strong', el => el.textContent), formatRaceTime(finishA.elapsed_ms));
  assert.equal((await db.query('select race_time_ms from participants where id=$1', [a])).rows[0].race_time_ms, finishA.elapsed_ms);
  await wait(250);
  assert.equal(await replay.$eval('.obs-race-time strong', el => el.textContent), formatRaceTime(finishA.elapsed_ms));
  await start('Bianca');
  console.log('PASS Admin START B');
  assert.equal(await replay.$eval('.obs-first-name', el => el.textContent), 'Alessio');
  assert.equal(await replay.$eval('.obs-race-time strong', el => el.textContent), formatRaceTime(finishA.elapsed_ms));
  const runB = (await snapshot()).state.run_id;
  await control('hide-participant');
  await live.bringToFront();
  await live.waitForFunction(() => !document.querySelector('.obs-participant'));
  assert.equal((await snapshot()).state.run_status, 'RUNNING');
  await control('show-participant');
  await live.waitForFunction(() => document.querySelector('.obs-first-name')?.textContent === 'Bianca');
  assert.equal((await snapshot()).state.run_id, runB, 'SHOW must not start another run');
  await admin.bringToFront();
  await admin.$eval('[data-run-stop]', button => button.click());
  await admin.waitForSelector('[data-run-status="FINISHED"]');
  await replay.bringToFront();
  await replay.waitForFunction(() => document.querySelector('.obs-first-name')?.textContent === 'Bianca');
  current = (await snapshot()).state;
  console.log('PASS Admin STOP B');
  assert.equal(await replay.$eval('.obs-race-time strong', el => el.textContent), formatRaceTime(current.elapsed_ms));
  assert.equal((await control('stop', { runId: runB })).state.elapsed_ms, current.elapsed_ms);
  await admin.reload({ waitUntil: 'networkidle0' });
  await admin.waitForSelector('[data-run-status="FINISHED"]');
  assert.equal(await admin.$eval('[data-run-final]', el => el.textContent), formatRaceTime(current.elapsed_ms));
  await replay.reload({ waitUntil: 'networkidle0' });
  await replay.waitForSelector('.obs-race-time');
  assert.equal(await replay.$eval('.obs-race-time strong', el => el.textContent), formatRaceTime(current.elapsed_ms));
  await sponsors.bringToFront();
  for (const socket of ws.clients) socket.terminate();
  await control('hide-sponsors');
  await sponsors.waitForFunction(() => document.querySelector('.obs-stage')?.dataset.connection === 'live' && getComputedStyle(document.querySelector('.obs-sponsors')).opacity === '0', { timeout: 20000 });
  assert.equal(await replay.$eval('.obs-first-name', el => el.textContent), 'Bianca');
  await admin.setViewport({ width: 390, height: 844 });
  await admin.bringToFront();
  const sidebarVisible = await admin.evaluate(() => (document.querySelector('aside')?.getBoundingClientRect().width ?? 0) > 65);
  if (sidebarVisible) await admin.$eval('header button[aria-label="Menu"]', button => button.click());
  await admin.waitForFunction(() => (document.querySelector('aside')?.getBoundingClientRect().width ?? 0) <= 65);
  await admin.$eval('[data-run-control]', el => el.scrollIntoView({ block: 'start' }));
  await admin.screenshot({ path: 'shots/broadcast-central-admin-mobile.png' });
  const overflow = await admin.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
    elements: [...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 1; }).slice(0, 12).map(el => ({ tag: el.tagName, class: el.className, width: el.getBoundingClientRect().width })) }));
  assert.ok(overflow.scroll <= overflow.width, JSON.stringify(overflow));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, database: 'PGlite/PostgreSQL executing migrations and real worker handlers', checks: ['Admin START A', 'server-anchored running display', 'external START idempotency', 'external STOP A', 'exact frozen result across DB/Admin/replay', 'START B preserves replay A', 'HIDE/SHOW no timer reset', 'Admin STOP B', 'duplicate STOP', 'Admin refresh', 'OBS refresh', 'WebSocket reconnect/resnapshot', 'mobile layout'], elapsedA: finishA.elapsed_ms, elapsedB: current.elapsed_ms }, null, 2));
} catch (error) { console.error(error); throw error; } finally {
  await browser.close();
  for (const socket of ws.clients) socket.terminate();
  await new Promise(resolve => ws.close(resolve));
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  globalThis.fetch = nativeFetch;
  await db.close();
}
