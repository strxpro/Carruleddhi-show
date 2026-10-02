import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import puppeteer from 'puppeteer';

const origin = process.env.OBS_TEST_ORIGIN || 'http://127.0.0.1:5199';
const server = createServer();
const sockets = new WebSocketServer({ server });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const realtimeUrl = `http://127.0.0.1:${server.address().port}`;
let state = {
  id: 'main', revision: 1, updated_at: new Date().toISOString(),
  participant_visible: true, sponsors_enabled: true,
  participant: { id: 'fixture-a', firstName: 'Matteo', lastName: 'Murru', startNumber: 27, city: 'Santa Teresa Gallura', projectName: 'La Freccia del Porto', category: 'classic', photo: '' },
  sponsors: [
    { id: 'a', name: 'Shardana Nuragici', logo: '/assets/images/shardana-nuragici.jpeg', url: '', active: true, order: 0, tier: 'partner' },
    { id: 'b', name: 'Fidali 1982', logo: '/assets/images/fidali.jpeg', url: '', active: true, order: 1, tier: 'partner' },
    { id: 'c', name: 'Gallura Experience', logo: '', url: '', active: true, order: 2, tier: 'main partner' },
  ],
};
const channels = new Map();
let joins = 0;
sockets.on('connection', socket => {
  socket.on('message', buffer => {
    const raw = JSON.parse(buffer.toString());
    const [joinRef, ref, topic, event, payload] = Array.isArray(raw) ? raw : [raw.join_ref, raw.ref, raw.topic, raw.event, raw.payload];
    const reply = response => socket.send(JSON.stringify(Array.isArray(raw)
      ? [joinRef, ref, topic, 'phx_reply', { status: 'ok', response }]
      : { join_ref: joinRef, ref, topic, event: 'phx_reply', payload: { status: 'ok', response } }));
    if (event === 'phx_join') {
      joins++;
      channels.set(socket, { topic, joinRef, array: Array.isArray(raw) });
      reply({ postgres_changes: (payload.config?.postgres_changes || []).map(change => ({ ...change, id: 1 })) });
    } else reply({});
  });
  socket.on('close', () => channels.delete(socket));
});
function publish(patch, revision = state.revision + 1) {
  state = { ...state, ...patch, revision, updated_at: new Date().toISOString() };
  for (const [socket, channel] of channels) {
    const columns = Object.keys(state).map(name => ({ name, type: name === 'revision' ? 'int8' : ['participant', 'sponsors'].includes(name) ? 'jsonb' : name.endsWith('_visible') || name.endsWith('_enabled') ? 'bool' : 'text' }));
    const payload = { ids: [1], data: { schema: 'public', table: 'broadcast_state', type: 'UPDATE', columns, record: state, old_record: {}, commit_timestamp: state.updated_at } };
    socket.send(JSON.stringify(channel.array
      ? [channel.joinRef, null, channel.topic, 'postgres_changes', payload]
      : { topic: channel.topic, event: 'postgres_changes', payload, ref: null }));
  }
}

const browser = await puppeteer.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', args: ['--no-sandbox'] });
const errors = [];
const page = await browser.newPage();
page.on('pageerror', error => errors.push(error.message));
let reads = 0;
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.setRequestInterception(true);
const interceptRequest = request => {
  if (new URL(request.url()).pathname === '/api/carruleddhi/broadcast') {
    reads++;
    return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, state, realtime: { url: realtimeUrl, anonKey: 'test-public-key' } }) });
  }
  return request.continue();
};
page.on('request', interceptRequest);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await page.goto(`${origin}/obs/overlay`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.obs-stage[data-connection="live"]', { timeout: 15000 });
  await page.waitForSelector('.obs-participant h1');
  await page.evaluate(() => document.fonts.ready);
  await sleep(700);
  assert.equal(await page.$eval('.obs-participant h1', el => el.textContent), 'Murru');
  assert.ok(await page.$eval('.obs-participant h1', el => parseFloat(getComputedStyle(el).fontSize) >= 28), 'short surnames retain readable display typography');
  assert.equal(await page.$eval('body', el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
  const geometry = await page.evaluate(() => {
    const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; };
    return { participant: rect('.obs-participant'), sponsors: rect('.obs-sponsors') };
  });
  assert.ok(geometry.participant.x >= 96 && geometry.participant.bottom < geometry.sponsors.y);
  assert.ok(geometry.participant.x >= 1500 && geometry.participant.right <= 1824.1, 'participant template stays on the right within the safe area');
  assert.ok(geometry.participant.right - geometry.participant.x <= 285, 'participant template remains compact');
  assert.ok(await page.$eval('.obs-participant-meta', el => parseFloat(getComputedStyle(el).fontSize) >= 18), 'metadata is readable without scaling down the whole card');
  assert.ok(geometry.sponsors.right <= 1824 && geometry.sponsors.bottom <= 1026);
  assert.ok(Math.abs(geometry.sponsors.x - 384) < .1 && geometry.sponsors.right - geometry.sponsors.x <= 1152, 'sponsor belt keeps equal side margins');
  assert.ok(Math.abs((geometry.sponsors.x + geometry.sponsors.right) / 2 - 960) < .1, 'sponsor belt is centered independently of the right-side participant');
  await page.screenshot({ path: 'shots/obs-overlay-transparent.png', omitBackground: true });
  await page.addStyleTag({ content: 'body::before{content:"";position:fixed;inset:0;background:linear-gradient(0deg,rgba(7,26,61,.15),transparent 65%),url(/assets/images/zjazd.webp) center/cover;z-index:-1}' });
  await sleep(400);
  await page.screenshot({ path: 'shots/obs-overlay-camera.png' });

  const before = await page.$$eval('.obs-sponsor-slot', els => els.map(el => ({ id: el.firstElementChild.dataset.sponsorId, x: new DOMMatrixReadOnly(el.style.transform).m41 })));
  publish({ sponsors: [...state.sponsors, { ...state.sponsors[2], id: 'd', name: 'Nuovo Partner', order: 3 }] });
  await sleep(150);
  const after = await page.$$eval('.obs-sponsor-slot', els => els.map(el => ({ id: el.firstElementChild.dataset.sponsorId, x: new DOMMatrixReadOnly(el.style.transform).m41 })));
  assert.equal(after[1].id, before[1].id);
  assert.ok(after[1].x < before[1].x && before[1].x - after[1].x < 25, 'sponsor update must not reset phase');

  publish({ participant_visible: false });
  await page.waitForFunction(() => !document.querySelector('.obs-participant'));
  assert.equal(await page.$eval('.obs-sponsors', el => getComputedStyle(el).opacity), '1');
  publish({ participant_visible: true, participant: { ...state.participant, id: 'fixture-b', firstName: 'Alessandro Giovanni', lastName: 'Della Valle Di Monte', startNumber: 128, photo: '/assets/images/card-classic-800.webp' } });
  await page.waitForFunction(() => document.querySelector('.obs-participant h1')?.textContent === 'Della Valle Di Monte');
  await sleep(600);
  await page.screenshot({ path: 'shots/obs-overlay-long-name.png' });
  const currentRevision = state.revision;
  publish({ participant_visible: false }, currentRevision - 1);
  await sleep(600);
  assert.ok(await page.$('.obs-participant'), 'stale revision must not hide participant');
  state = { ...state, revision: currentRevision, participant_visible: true };

  publish({ sponsors_enabled: false });
  await sleep(500);
  assert.equal(await page.$eval('.obs-sponsors', el => getComputedStyle(el).opacity), '0');
  assert.ok(await page.$('.obs-participant'));
  publish({ sponsors_enabled: true, participant: null, participant_visible: false });
  await page.waitForFunction(() => !document.querySelector('.obs-participant'));

  const readsBefore = reads;
  await sleep(2200);
  assert.equal(reads, readsBefore, 'healthy realtime must not poll snapshots');
  const previousJoins = joins;
  for (const socket of sockets.clients) socket.terminate();
  state = { ...state, revision: state.revision + 1, participant_visible: true, participant: { id: 'recovered', firstName: 'Connessione', lastName: 'Ripristinata', startNumber: 7, city: '', projectName: '', category: '', photo: '' } };
  await page.waitForFunction(() => document.querySelector('.obs-participant h1')?.textContent === 'Ripristinata', { timeout: 20000 });
  assert.ok(joins > previousJoins);
  assert.ok(reads > readsBefore, 'reconnect must resnapshot missed events');

  const longName = 'Della Valle Di Monte San Giovanni Della Costa Di Santa Teresa Gallura'.slice(0, 80);
  publish({ participant: { ...state.participant, id: 'long', firstName: 'Alessandro Giovanni Maria Antonio', lastName: longName } });
  await page.waitForFunction((name) => document.querySelector('.obs-participant h1')?.textContent === name, {}, longName);
  await sleep(600);
  assert.ok(await page.$eval('.obs-participant h1', el => el.scrollHeight <= el.clientHeight + 1), 'long surnames must fit without clipping');

  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  publish({ sponsors: [{ ...state.sponsors[0], name: 'Updated static sponsor', logo: '' }] });
  await page.waitForFunction(() => [...document.querySelectorAll('.obs-sponsor-fallback')].some(el => el.textContent === 'Updated static sponsor'));
  publish({ sponsors: [] });
  await page.waitForFunction(() => !!document.querySelector('.obs-house'));
  assert.equal(await page.$eval('.obs-sponsors', el => getComputedStyle(el).opacity), '1', 'house cards keep an enabled empty belt intentional');

  await page.setViewport({ width: 960, height: 540 });
  await sleep(200);
  const scaled = await page.$eval('.obs-sponsors', el => el.getBoundingClientRect().width);
  assert.ok(Math.abs(scaled - 576) < .1);
  state = { ...state, revision: state.revision + 1, participant_visible: true, sponsors_enabled: true,
    sponsors: [{ id: 'separate', name: 'Independent sponsor', logo: '', url: '', active: true, order: 0, tier: 'partner' }] };
  await page.goto(`${origin}/obs/participant`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.obs-stage[data-connection="live"]');
  await page.waitForSelector('.obs-participant');
  assert.equal(await page.$('.obs-sponsors'), null, 'participant source must never render sponsors');
  const sponsorPage = await browser.newPage();
  sponsorPage.on('pageerror', error => errors.push(error.message));
  await sponsorPage.setRequestInterception(true);
  sponsorPage.on('request', interceptRequest);
  await sponsorPage.goto(`${origin}/obs/sponsors`, { waitUntil: 'networkidle0' });
  await sponsorPage.waitForSelector('.obs-stage[data-connection="live"]');
  await sponsorPage.waitForSelector('.obs-sponsor-slot');
  assert.equal(await sponsorPage.$('.obs-participant-anchor'), null, 'sponsor source must never render participant');
  publish({ participant_visible: false });
  await page.waitForFunction(() => !document.querySelector('.obs-participant'));
  await sponsorPage.waitForFunction(revision => document.querySelector('.obs-stage')?.dataset.revision === String(revision), {}, state.revision);
  assert.equal(await sponsorPage.$eval('.obs-sponsors', el => getComputedStyle(el).opacity), '1');
  await page.close();
  publish({ sponsors_enabled: false });
  await sponsorPage.waitForFunction(() => getComputedStyle(document.querySelector('.obs-sponsors')).opacity === '0');
  publish({ sponsors_enabled: true });
  await sponsorPage.waitForFunction(() => getComputedStyle(document.querySelector('.obs-sponsors')).opacity === '1');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, checks: ['initial state', 'real WebSocket delivery', 'transparent 1920x1080', 'safe areas', 'sponsor update phase', 'participant hide/show/clear', 'independent modules', 'stale revision guard', 'no healthy polling', 'disconnect/resubscribe/resnapshot', 'long name fitting', 'reduced motion live edits/removal', 'viewport scaling', 'two isolated source URLs', 'sponsors keep updating after participant source closes', 'no browser errors'], reads, joins, screenshots: ['shots/obs-overlay-transparent.png', 'shots/obs-overlay-camera.png', 'shots/obs-overlay-long-name.png'] }, null, 2));
} finally {
  await browser.close();
  for (const socket of sockets.clients) socket.terminate();
  await new Promise(resolve => sockets.close(resolve));
  await new Promise(resolve => server.close(resolve));
}
