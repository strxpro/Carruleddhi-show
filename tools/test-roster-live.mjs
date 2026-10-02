import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import puppeteer from 'puppeteer';

const origin = process.env.ROSTER_TEST_ORIGIN || process.env.OBS_TEST_ORIGIN || 'http://127.0.0.1:5199';
const server = createServer();
const sockets = new WebSocketServer({ server });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const realtime = { url: `http://127.0.0.1:${server.address().port}`, anonKey: 'test-public-key', ready: true };
const channels = new Map();
sockets.on('connection', socket => {
  socket.on('message', buffer => {
    const raw = JSON.parse(buffer.toString());
    const [joinRef, ref, topic, event, payload] = Array.isArray(raw) ? raw : [raw.join_ref, raw.ref, raw.topic, raw.event, raw.payload];
    const response = event === 'phx_join' ? { postgres_changes: (payload.config?.postgres_changes || []).map(change => ({ ...change, id: 1 })) } : {};
    if (event === 'phx_join') channels.set(socket, { topic, joinRef, array: Array.isArray(raw) });
    socket.send(JSON.stringify(Array.isArray(raw) ? [joinRef, ref, topic, 'phx_reply', { status: 'ok', response }]
      : { join_ref: joinRef, ref, topic, event: 'phx_reply', payload: { status: 'ok', response } }));
  });
  socket.on('close', () => channels.delete(socket));
});
const participants = [
  { id: 'p-new', registrationId: 'r-new', firstName: 'New', startNumber: 7 },
  { id: 'p-old', registrationId: 'r-old', firstName: 'Old', startNumber: 7 },
  { id: 'p-pending', registrationId: 'r-pending', firstName: 'Pending', startNumber: 8 },
  { id: 'p-next', registrationId: 'r-next', firstName: 'Next', startNumber: 9 },
  { id: 'p-unknown', registrationId: 'r-unknown', firstName: 'Unknown', startNumber: 10 },
  { id: 'p-duplicate-a', registrationId: 'r-duplicate', firstName: 'Duplicate', startNumber: 11 },
  { id: 'p-duplicate-b', registrationId: 'r-duplicate', firstName: 'Duplicate', startNumber: 11 },
].map(p => ({ ...p, lastName: 'Rossi', city: 'Gallura', category: 'classic', projectName: 'Cart', photo: '' }));
const publicParticipant = id => { const { registrationId: _private, ...person } = participants.find(p => p.id === id); return person; };
const rows = [
  ['r-new', 'New', 'confirmed', 7], ['r-old', 'Old', 'withdrawn', 7], ['r-missing', 'Missing', 'confirmed', 7],
  ['r-pending', 'Pending', 'new', 8], ['r-next', 'Next', 'confirmed', 9], ['r-unknown', 'Unknown', 'unexpected', 10],
  ['r-duplicate', 'Duplicate', 'confirmed', 11],
].map(([id, firstName, status, number]) => ({ id, firstName, lastName: 'Rossi', status, raceNumber: String(number).padStart(3, '0'),
  createdAt: '2026-10-01T12:00:00Z', email: 'same@example.org', phone: '', cartName: 'Cart', category: 'classic',
  teamName: '', locale: 'pl', emailGroupSize: 1, isMinor: false, guardian: null }));
let state = { id: 'main', revision: 1, updated_at: new Date().toISOString(), participant: null,
  current_participant_id: null, last_finished_participant_id: null, last_finished_participant: null,
  run_status: 'IDLE', started_at: null, stopped_at: null, elapsed_ms: 0, run_id: null, last_finished_elapsed_ms: null,
  participant_visible: false, sponsors_enabled: true, sponsors: [{ id: 'sponsor', name: 'Keep running', logo: '', url: '', active: true, order: 0, tier: 'partner' }] };
function publish(patch, revision = state.revision + 1) {
  state = { ...state, ...patch, revision, updated_at: new Date().toISOString() };
  for (const [socket, channel] of channels) {
    const columns = Object.keys(state).map(name => ({ name, type: ['revision', 'elapsed_ms', 'last_finished_elapsed_ms'].includes(name) ? 'int8' : ['participant', 'last_finished_participant', 'sponsors'].includes(name) ? 'jsonb' : name.endsWith('_visible') || name.endsWith('_enabled') ? 'bool' : 'text' }));
    const payload = { ids: [1], data: { schema: 'public', table: 'broadcast_state', type: 'UPDATE', columns, record: state, old_record: {}, commit_timestamp: state.updated_at } };
    socket.send(JSON.stringify(channel.array ? [channel.joinRef, null, channel.topic, 'postgres_changes', payload]
      : { topic: channel.topic, event: 'postgres_changes', payload, ref: null }));
  }
}
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
const errors = [], actions = [];
let adminReads = 0, publicReads = 0, failure = false, readFailure = false, hold = false, held;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const activate = registration => `[data-roster-registration="${registration}"] [data-roster-activate]`;
const waitRevision = revision => page.waitForFunction(value => document.querySelector('[data-roster-live]')?.dataset.revision === String(value), {}, revision);
const waitEnabled = selector => page.waitForFunction(selector => document.querySelector(selector)?.disabled === false, {}, selector);
const adminResponse = () => ({ ok: true, state, participants, sponsors: state.sponsors.map(s => ({ ...s, logoUrl: '' })), realtime,
  runReady: true, serverNow: new Date().toISOString() });
try {
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument(() => {
    sessionStorage.setItem('carruleddhi.admin.key', 'test-key');
    sessionStorage.setItem('carruleddhi.admin.tab', 'registrations');
    if (!localStorage.getItem('carruleddhi.admin.locale')) localStorage.setItem('carruleddhi.admin.locale', 'pl');
  });
  await page.setRequestInterception(true);
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/carruleddhi/')) return request.continue();
    const body = JSON.parse(request.postData() || '{}');
    const respond = (data, status = 200) => request.respond({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (path.endsWith('/inbox')) return respond({ ok: true, total: 0, counts: {} });
    if (path.endsWith('/roster')) return respond({ ok: true, rows });
    if (path.endsWith('/broadcast')) {
      publicReads++;
      assert.equal(request.headers()['x-carruleddhi-roster-key'], undefined);
      assert.doesNotMatch(JSON.stringify(state), /registrationId|same@example/);
      return respond({ ok: true, state, realtime });
    }
    if (path.endsWith('/broadcast-admin')) {
      assert.equal(request.headers()['x-carruleddhi-roster-key'], 'test-key');
      if (body.action === 'state') {
        adminReads++;
        return readFailure ? respond({ ok: false, code: 'BROADCAST_UNAVAILABLE' }, 502) : respond(adminResponse());
      }
      assert.ok(['start', 'stop', 'show', 'hide', 'participant-photo'].includes(body.action), `unexpected action: ${body.action}`);
      actions.push(body);
      if (failure) return respond({ ok: false, code: 'BROADCAST_UNAVAILABLE' }, 502);
      if (body.action === 'start') {
        assert.notEqual(state.run_status, 'RUNNING', 'STOP is required before switching riders');
        publish({ participant: publicParticipant(body.id), participant_visible: true, current_participant_id: body.id,
          run_status: 'RUNNING', started_at: new Date().toISOString(), stopped_at: null, elapsed_ms: 0, run_id: `run-${state.revision + 1}` });
      }
      if (body.action === 'stop') {
        assert.equal(state.run_status, 'RUNNING');
        assert.deepEqual(body, { action: 'stop', runId: state.run_id });
        const elapsed = Math.max(0, Date.now() - Date.parse(state.started_at));
        participants.find(p => p.id === state.current_participant_id).raceTimeMs = elapsed;
        publish({ run_status: 'FINISHED', stopped_at: new Date().toISOString(), elapsed_ms: elapsed,
          participant: publicParticipant(state.current_participant_id), last_finished_participant_id: state.current_participant_id,
          last_finished_participant: { ...state.participant, raceTimeMs: elapsed }, last_finished_elapsed_ms: elapsed });
      }
      if (body.action === 'show') publish({ participant_visible: state.participant !== null });
      if (body.action === 'hide') publish({ participant_visible: false });
      if (body.action === 'participant-photo') {
        participants.find(p => p.id === body.id).photo = body.image;
        publish(state.participant?.id === body.id ? { participant: publicParticipant(body.id) } : {});
      }
      if (hold) { const response = structuredClone(adminResponse()); held = () => respond(response); return; }
      return respond(adminResponse());
    }
    return respond({ ok: false });
  });
  await page.goto(`${origin}/admin.html`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-roster-live] [data-connection="live"]');
  await waitEnabled(activate('r-new'));
  for (const registration of ['r-old', 'r-missing', 'r-pending', 'r-unknown', 'r-duplicate']) {
    assert.equal(await page.$eval(activate(registration), el => el.disabled), true, registration);
  }
  assert.equal(adminReads, 1, 'one protected initial mapping read, no per-roster-row requests');
  assert.equal(await page.$eval('[data-run-show]', el => el.disabled), true, 'no selection cannot be shown');
  const bounds = await page.$eval(activate('r-new'), el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, viewport: innerWidth }; });
  assert.ok(bounds.left >= 0 && bounds.right <= bounds.viewport, `mobile action under name visible without horizontal scrolling: ${JSON.stringify(bounds)}`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.ok(await page.$('a[href="/obs/participant"]'));
  assert.ok(await page.$('a[href="/obs/sponsors"]'));
  assert.ok(await page.$('a[href^="/obs/overlay?preview=1"]'));
  const sponsors = structuredClone(state.sponsors);

  await page.click(activate('r-new'));
  await waitRevision(2);
  assert.deepEqual(actions.at(-1), { action: 'start', id: 'p-new' });
  assert.match(await page.$eval('[data-run-current]', el => el.textContent), /#7 New Rossi/);
  assert.equal(await page.$eval(activate('r-next'), el => el.disabled), true, 'cannot replace a running rider');
  const firstRun = { id: state.run_id, startedAt: state.started_at };
  await waitEnabled('[data-run-hide]');
  await page.click('[data-run-hide]');
  await waitRevision(3);
  assert.deepEqual(actions.at(-1), { action: 'hide' });
  assert.equal(state.participant.id, 'p-new');
  assert.equal(state.participant_visible, false);
  await waitEnabled('[data-run-show]');
  await page.click('[data-run-show]');
  await waitRevision(4);
  assert.deepEqual(actions.at(-1), { action: 'show' });
  assert.equal(state.participant_visible, true);
  assert.equal(state.run_status, 'RUNNING');
  assert.deepEqual({ id: state.run_id, startedAt: state.started_at }, firstRun, 'SHOW/HIDE do not restart the run');
  await waitEnabled('[data-run-stop]');
  await page.click('[data-run-stop]');
  await waitRevision(5);
  assert.deepEqual(actions.at(-1), { action: 'stop', runId: firstRun.id });
  const firstReplay = structuredClone(state.last_finished_participant);
  await waitEnabled(activate('r-next'));
  await page.click(activate('r-next'));
  await waitRevision(6);
  assert.deepEqual(actions.at(-1), { action: 'start', id: 'p-next' });
  assert.equal(state.participant.id, 'p-next');
  assert.deepEqual(state.last_finished_participant, firstReplay);
  assert.match(await page.$eval('[data-run-last]', el => el.textContent), /#7 New Rossi/);
  const nextRunId = state.run_id;
  await waitEnabled('[data-run-stop]');
  await page.click('[data-run-stop]');
  await waitRevision(7);
  assert.deepEqual(actions.at(-1), { action: 'stop', runId: nextRunId });

  // A public realtime update received before an older command response must win.
  await waitEnabled(activate('r-new'));
  hold = true;
  await waitEnabled('[data-run-hide]');
  await page.click('[data-run-hide]');
  await waitRevision(8);
  assert.equal(await page.$eval(activate('r-new'), el => el.disabled), true, 'all actions locked during a pending mutation');
  publish({ participant: publicParticipant('p-new'), participant_visible: true, current_participant_id: 'p-new',
    run_status: 'RUNNING', run_id: 'run-remote', started_at: new Date().toISOString(), stopped_at: null, elapsed_ms: 0 });
  await waitRevision(9);
  await held(); hold = false;
  await waitEnabled('[data-run-hide]');
  assert.match(await page.$eval('[data-run-current]', el => el.textContent), /New Rossi/);
  assert.equal(await page.$eval('[data-roster-live]', el => el.dataset.revision), '9');
  assert.equal(await page.$eval('[data-run-control]', el => el.dataset.runStatus), 'RUNNING', 'stale FINISHED command response cannot replace realtime START');
  const saved = structuredClone(state);
  publish({ participant_visible: false }, 3);
  await sleep(200);
  assert.equal(await page.$eval('[data-roster-live]', el => el.dataset.revision), '9');
  assert.equal(await page.$eval('[data-run-show]', el => el.disabled), true, 'stale realtime cannot hide the rider');
  state = saved;

  failure = true;
  await page.click('[data-run-hide]');
  await page.waitForSelector('[data-roster-live] [role="alert"]');
  assert.equal(state.participant_visible, true, 'server failure never optimistically hides');
  assert.equal(await page.$eval('[data-run-hide]', el => el.disabled), true);
  failure = false;
  await page.$eval('[data-roster-live] [role="alert"] button', el => el.click());
  await waitEnabled('[data-run-hide]');
  await page.waitForSelector('[data-roster-live] [data-connection="live"]');
  await page.click('[data-run-hide]');
  await waitRevision(10);
  assert.equal(state.participant_visible, false);
  assert.equal(state.sponsors_enabled, true);
  assert.deepEqual(state.sponsors, sponsors);
  await waitEnabled('[data-run-stop]');
  await page.click('[data-run-stop]');
  await waitRevision(11);
  assert.deepEqual(actions.at(-1), { action: 'stop', runId: 'run-remote' });
  assert.equal(state.participant_visible, false, 'STOP preserves hidden visibility');
  const frozenReplay = structuredClone(state.last_finished_participant);
  const frozenElapsed = state.last_finished_elapsed_ms;
  assert.ok(actions.every(action => ['start', 'stop', 'show', 'hide'].includes(action.action)));
  await waitEnabled('[data-run-show]');
  const counts = { adminReads, publicReads };
  await sleep(2200);
  assert.deepEqual({ adminReads, publicReads }, counts, 'healthy realtime does not poll');

  // Reusable phone portrait is available from the roster, not only the LIVE tab.
  await page.$eval('[data-roster-registration="r-next"]', el => [...el.querySelectorAll('button')].find(b => b.textContent === 'Zdjęcie zawodnika').click());
  await page.waitForSelector('.live-portrait input[capture="environment"]');
  assert.ok(await page.$('.live-portrait input[type="file"]:not([capture])'));
  await page.$eval('.live-portrait input[capture]', async input => {
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 1000;
    const context = canvas.getContext('2d'); context.fillStyle = 'red'; context.fillRect(0, 0, 800, 1000);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));
    const transfer = new DataTransfer(); transfer.items.add(new File([blob], 'camera.jpg', { type: 'image/jpeg' }));
    input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForSelector('.live-portrait canvas');
  await page.$eval('.live-portrait', el => [...el.querySelectorAll('button')].find(b => b.textContent === 'Zapisz zdjęcie zawodnika').click());
  await page.waitForSelector('.live-portrait', { hidden: true });
  assert.equal(actions.at(-1).id, 'p-next');
  assert.equal(actions.at(-1).action, 'participant-photo');
  assert.match(actions.at(-1).image, /^data:image\/webp;base64,/);
  assert.equal(state.participant.id, 'p-new', 'saving a roster portrait does not switch participant');
  assert.equal(state.participant_visible, false, 'saving a roster portrait does not activate');
  assert.equal(state.run_status, 'FINISHED', 'portrait save does not restart a finished run');
  assert.equal(await page.$('[data-roster-clear], [data-run-clear]'), null, 'no destructive clear control');
  await waitEnabled('[data-run-show]');
  await page.click('[data-run-show]');
  await waitRevision(13);
  assert.deepEqual(actions.at(-1), { action: 'show' });
  assert.equal(state.run_status, 'FINISHED', 'SHOW does not start a new run');
  await waitEnabled('[data-run-hide]');
  await page.click('[data-run-hide]');
  await waitRevision(14);
  await waitEnabled('[data-run-show]');
  assert.equal(state.participant.id, 'p-new', 'hiding preserves the show target');
  assert.equal(state.participant_visible, false);
  assert.deepEqual(state.last_finished_participant, frozenReplay, 'upload and visibility changes preserve frozen replay');
  assert.equal(state.last_finished_elapsed_ms, frozenElapsed);
  assert.match(await page.$eval('[data-run-last]', el => el.textContent), /#7 New Rossi/);
  assert.ok(await page.$('[data-run-replay]'));
  assert.equal(state.sponsors_enabled, true);
  assert.deepEqual(state.sponsors, sponsors);
  await page.setViewport({ width: 1440, height: 900 });
  await page.waitForSelector('[data-roster-registration="r-new"]');
  assert.ok(await page.$('button[title="Edytuj"]'), 'roster editing preserved');
  assert.ok(await page.$('button[title="Usuń na zawsze"]'), 'roster deletion preserved');
  readFailure = true;
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-roster-live] [role="alert"]');
  assert.equal(await page.$eval(activate('r-new'), el => el.disabled), true, 'initial mapping fetch failure disables activation');
  readFailure = false;
  await page.$eval('[data-roster-live] [role="alert"] button', el => el.click());
  await waitEnabled(activate('r-new'));
  await page.evaluate(() => localStorage.setItem('carruleddhi.admin.locale', 'it'));
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-run-show]');
  assert.equal(await page.$eval('[data-run-show]', el => el.textContent), 'SHOW / Mostra selezionato');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, checks: ['exact private mapping despite reused numbers/email', 'withdrawn/pending/unknown/missing/ambiguous blocked', 'mobile under-name controls', 'START/STOP/switch and visibility-only SHOW/HIDE', 'frozen replay preservation without clear', 'pending guard', 'stale command and realtime revision guards', 'server failure and retry', 'initial mapping failure and retry', 'sponsors unchanged', 'source/preview links', 'phone portrait save without activation', 'PL/IT labels', 'no broadcast polling', 'no browser errors'], adminReads, publicReads }, null, 2));
} finally {
  await browser.close();
  for (const socket of sockets.clients) socket.terminate();
  await new Promise(resolve => sockets.close(resolve));
  await new Promise(resolve => server.close(resolve));
}
