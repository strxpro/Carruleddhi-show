import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { formatRaceTime, parseRaceTime } from '../assets/js/race-time.js';

const origin = process.env.RACE_TIME_TEST_ORIGIN || 'http://127.0.0.1:5207';
function checkParser() {
  for (const [input, expected] of [['', null], ['0:00.000', 0], ['01:23.456', 83456], ['35791:23.647', 2147483647]]) {
    assert.equal(parseRaceTime(input), expected);
  }
  for (const input of ['1:23', '1:23.4', '1:23.4567', '1:60.000', '1:2.345', '-1:23.456', '1:23,456', '35791:23.648', '1e2:00.000']) {
    assert.throws(() => parseRaceTime(input), Error, input);
  }
  assert.equal(formatRaceTime(0), '00:00.000');
  for (const value of [null, undefined, -1, 1.5, NaN, Infinity, 2147483648, '1000']) assert.equal(formatRaceTime(value), '');
}

const participants = [
  { id: 'p-a', registrationId: 'r-a', firstName: 'Anna', startNumber: 7, raceTimeMs: 83456 },
  { id: 'p-b', registrationId: 'r-b', firstName: 'Bruno', startNumber: 7, raceTimeMs: 0 },
  { id: 'p-c', registrationId: 'r-c', firstName: 'Carlo', startNumber: 8 },
  { id: 'p-d', registrationId: 'r-d', firstName: 'Dora', startNumber: 9, raceTimeMs: 95432 },
].map((p, i) => ({ ...p, lastName: 'Rossi', city: 'Gallura', category: 'classic', projectName: `Cart ${p.firstName}`,
  photo: '', imagePath: '', active: true, voteCount: 10 - i, totalScore: 100 - i * 10, averageScore: 10 }));
const rows = participants.map(p => ({ id: p.registrationId, firstName: p.firstName, lastName: p.lastName, status: 'confirmed',
  raceNumber: String(p.startNumber), createdAt: '2026-10-01T12:00:00Z', email: 'shared@example.org', phone: '',
  cartName: p.projectName, category: p.category, teamName: '', locale: 'pl', emailGroupSize: 1, isMinor: false, guardian: null }));
rows.push({ ...rows[0], id: 'r-missing', firstName: 'Unmapped' });
let timingReady = true, failSave = false, phase = 'voting', malformed = false, publicReads = 0, archive = false;
let state = { id: 'main', revision: 1, participant: null, participant_visible: false, participant_mode: 'live',
  sponsors_enabled: true, sponsors: [{ id: 's-1', name: 'Sponsor', logo: '', url: '', active: true, order: 0, tier: 'partner' }], updated_at: new Date().toISOString() };
const realtime = { url: '', anonKey: null, ready: false };
const actions = [], saves = [], errors = [];
const broadcastResponse = () => ({ ok: true, ...(timingReady === undefined ? {} : { timingReady }), state,
  participants: malformed ? [{ ...participants[0], raceTimeMs: '123' }] : participants, sponsors: state.sponsors.map(s => ({ ...s, logoUrl: '' })), realtime });
const votingResponse = () => ({ ok: true, ...(timingReady === undefined ? {} : { timingReady }), phase, status: phase,
  raceStartsAt: new Date(Date.now() - 60000).toISOString(), votingEndsAt: new Date(Date.now() + 3600000).toISOString(),
  durationMinutes: 60, scoreMin: 3, scoreMax: 10, totalVotes: 34,
  participants: malformed ? [{ ...participants[0], raceTimeMs: 1.2 }] : participants,
  podium: participants.slice(0, 3), prizes: [], editions: [], isArchive: archive,
  ...(archive ? { selectedEdition: { key: '2025', name: '2025', date: '2025-10-01', status: 'archived' } } : {}) });
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
page.on('pageerror', error => errors.push(error.message));
page.setDefaultTimeout(15000);
await page.setRequestInterception(true);
page.on('request', request => {
  const path = new URL(request.url()).pathname;
  if (!path.startsWith('/api/carruleddhi/')) return request.continue();
  const body = JSON.parse(request.postData() || '{}');
  const respond = (data, status = 200) => request.respond({ status, contentType: 'application/json', body: JSON.stringify(data) });
  if (path.endsWith('/inbox')) return respond({ ok: true, total: 0, counts: {} });
  if (path.endsWith('/roster')) return respond({ ok: true, rows });
  if (path.endsWith('/broadcast')) return respond({ ok: true, state, realtime, timingReady });
  if (path.endsWith('/broadcast-admin')) {
    if (body.action !== 'state') {
      actions.push(body);
      if (body.action === 'on-air') state = { ...state, participant: participants.find(p => p.id === body.id), participant_visible: true, participant_mode: body.mode };
      if (body.action === 'hide') state.participant_visible = false;
      if (body.action === 'clear') state = { ...state, participant: null, participant_visible: false, participant_mode: 'live' };
      state.revision++;
    }
    return respond(broadcastResponse());
  }
  if (path.endsWith('/voting-admin')) {
    if (body.action === 'save') {
      saves.push(body);
      assert.equal(request.headers()['x-carruleddhi-roster-key'], 'test-key');
      if (failSave) return respond({ ok: false, code: 'VOTING_TIMING_MIGRATION_REQUIRED' }, 503);
      Object.assign(participants.find(p => p.id === body.id), { raceTimeMs: body.raceTimeMs });
      state.revision++;
      return respond({ ok: true });
    }
    return respond(votingResponse());
  }
  if (path.endsWith('/voting')) { publicReads++; return respond(votingResponse()); }
  return respond({ ok: true, settings: {}, rows: [], messages: [], counts: {} });
});
const enabled = selector => page.waitForFunction(s => document.querySelector(s)?.disabled === false, {}, selector);
const inputValue = selector => page.$eval(selector, el => el.value);
async function fill(selector, value) {
  await page.$eval(selector, (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}
async function admin(tab) {
  const script = await page.evaluateOnNewDocument(tab => {
    sessionStorage.setItem('carruleddhi.admin.key', 'test-key');
    sessionStorage.setItem('carruleddhi.admin.tab', tab);
    localStorage.setItem('carruleddhi.admin.locale.v2', 'pl');
  }, tab);
  await page.goto(`${origin}/admin.html`, { waitUntil: 'networkidle0' });
  await page.removeScriptToEvaluateOnNewDocument(script.identifier);
}
try {
  await page.setViewport({ width: 390, height: 844 });
  await admin('registrations');
  const row = '[data-roster-registration="r-a"]';
  const input = `${row} [data-race-time]`, save = `${row} [data-race-time-save]`;
  await enabled(input);
  assert.equal(await inputValue(input), formatRaceTime(83456));
  assert.equal(await page.$('[data-roster-registration="r-missing"] [data-race-time]'), null, 'no guess by reused number/email');
  await fill(input, '02:03.456');
  participants[0].raceTimeMs = 77777; state.revision++;
  await page.$eval('[data-roster-live]', el => [...el.querySelectorAll('button')].find(b => b.textContent.includes('Odśwież')).click());
  await enabled(save);
  assert.equal(await inputValue(input), '02:03.456', 'dirty input survives refreshed metadata');
  await page.click(save);
  await page.waitForFunction((s, value) => document.querySelector(s)?.value === value && document.querySelector(s)?.disabled === false, {}, input, formatRaceTime(123456));
  assert.deepEqual(saves.at(-1), { action: 'save', id: 'p-a', raceTimeMs: 123456 });
  await fill(input, '1:99.000');
  assert.equal(await page.$eval(save, el => el.disabled), true);
  assert.equal(await page.$eval(input, el => el.getAttribute('aria-invalid')), 'true');
  await fill(input, ''); await enabled(save); await page.click(save); await enabled(input);
  assert.deepEqual(saves.at(-1), { action: 'save', id: 'p-a', raceTimeMs: null });
  await fill(input, '00:00.000'); await enabled(save); await page.click(save); await enabled(input);
  assert.equal(saves.at(-1).raceTimeMs, 0);
  failSave = true;
  await fill(input, '00:12.345'); await enabled(save); await page.click(save);
  await page.waitForSelector(`${row} [data-race-time-editor] [role="alert"]`);
  assert.equal(await inputValue(input), '00:12.345', 'failed save keeps draft');
  failSave = false; await enabled(save); await page.click(save); await enabled(input);
  await page.click(`${row} [data-roster-replay]`); await enabled('[data-roster-hide]');
  assert.deepEqual(actions.at(-1), { action: 'on-air', id: 'p-a', mode: 'replay' });
  await page.click('[data-roster-hide]'); await enabled('[data-roster-show]');
  await page.click('[data-roster-show]'); await enabled('[data-roster-hide]');
  assert.equal(actions.at(-1).mode, 'replay', 'show preserves replay');
  await page.click(`${row} [data-roster-activate]`); await enabled('[data-roster-hide]');
  assert.equal(actions.at(-1).mode, 'live', 'normal ride explicitly returns live');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'roster mobile has no overflow');

  for (const ready of [false, undefined]) {
    timingReady = ready; await admin('registrations');
    await page.waitForSelector(input);
    assert.equal(await page.$eval(input, el => el.disabled), true);
    assert.equal(await page.$eval(`${row} [data-roster-replay]`, el => el.disabled), true);
    await enabled('[data-roster-registration="r-b"] [data-roster-activate]');
  }
  timingReady = true;
  await admin('voting');
  await enabled('[data-race-time]');
  const scores = participants.map(p => [p.voteCount, p.totalScore, p.averageScore]);
  await fill('[data-race-time]', '00:09.999'); await enabled('[data-race-time-save]');
  await page.click('[data-race-time-save]'); await enabled('[data-race-time]');
  assert.deepEqual(saves.at(-1), { action: 'save', id: 'p-a', raceTimeMs: 9999 });
  assert.deepEqual(participants.map(p => [p.voteCount, p.totalScore, p.averageScore]), scores, 'time save never changes scores');
  malformed = true;
  const validation = await page.evaluate(async () => {
    const api = await import('/src/admin/api.ts');
    return Promise.all([api.fetchVoting('test-key'), api.broadcastAdmin('test-key', { action: 'state' })].map(p => p.then(() => '', e => e.code)));
  });
  assert.deepEqual(validation, ['VOTING_INVALID_RESPONSE', 'BROADCAST_INVALID_RESPONSE']);
  malformed = false;

  timingReady = false; await admin('voting');
  await page.waitForSelector('[data-race-time]');
  assert.equal(await page.$eval('[data-race-time]', el => el.disabled), true, 'voting time disabled on old schema');
  timingReady = true;
  await page.setViewport({ width: 1440, height: 1000 });
  await admin('live');
  const currentPanel = 'section[aria-labelledby="live-current-title"]';
  const participantPanel = 'section[aria-labelledby="live-participants-title"]';
  await page.waitForSelector(`${participantPanel} .live-list-row`);
  await page.$eval(`${participantPanel} .live-list-row`, el => [...el.querySelectorAll('button')].find(b => b.textContent === 'Powtórka').click());
  await page.waitForFunction(() => document.querySelector('[data-live-mode]')?.textContent === 'Powtórka');
  assert.equal(actions.at(-1).mode, 'replay');
  await page.$eval(currentPanel, el => [...el.querySelectorAll('button')].find(b => b.textContent.includes('HIDE')).click());
  await page.waitForFunction(selector => [...document.querySelector(selector).querySelectorAll('button')].find(b => b.textContent.includes('SHOW'))?.disabled === false, {}, currentPanel);
  await page.$eval(currentPanel, el => [...el.querySelectorAll('button')].find(b => b.textContent.includes('SHOW')).click());
  await page.waitForFunction(selector => [...document.querySelector(selector).querySelectorAll('button')].find(b => b.textContent.includes('HIDE'))?.disabled === false, {}, currentPanel);
  assert.equal(actions.at(-1).mode, 'replay', 'LIVE summary show preserves replay');
  await page.$eval(`${participantPanel} .live-list-row`, el => [...el.querySelectorAll('button')].find(b => b.textContent.includes('ON AIR')).click());
  await page.waitForFunction(() => document.querySelector('[data-live-mode]')?.textContent === 'Na żywo');
  assert.equal(actions.at(-1).mode, 'live');
  assert.equal(await page.$eval('section[aria-labelledby="live-sponsors-title"]', el => [...el.querySelectorAll('button')].some(b => b.textContent === 'Powtórka')), false, 'sponsor IDs never get replay actions');

  await page.setViewport({ width: 390, height: 844 });
  await page.goto(`${origin}/votazione.html?skipIntro=1&lang=pl`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.vote-card [data-race-time]');
  assert.ok((await page.$eval('.vote-card [data-race-time]', el => el.textContent)).includes(formatRaceTime(9999)));
  participants[0].raceTimeMs = 11111;
  const reads = publicReads;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(value => document.querySelector('.vote-card [data-race-time]')?.textContent.includes(value), {}, formatRaceTime(11111));
  assert.ok(publicReads > reads, 'card cache updates duration on refresh');
  phase = 'closed';
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForSelector('[data-vote-podium] [data-race-time]');
  assert.equal(await page.$$eval('[data-vote-podium] [data-race-time]', els => els.length), 2, 'absent old time never fabricated as zero');
  assert.equal(await page.$$eval('[data-vote-standings] [data-race-time]', els => els.length), 3);
  archive = true;
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-vote-podium] [data-race-time]');
  assert.equal(await page.$$eval('[data-vote-podium] [data-race-time]', els => els.length), 2, 'archive missing duration remains absent');
  archive = false;
  await page.goto(`${origin}/index.html?skipIntro=1&lang=pl`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-podium-winners] [data-race-time]');
  assert.equal(await page.$$eval('[data-podium-winners] [data-race-time]', els => els.length), 2);
  assert.ok((await page.$eval('[data-podium-field-list] [data-race-time]', el => el.textContent)).includes(formatRaceTime(95432)));
  assert.deepEqual(errors, [], 'no browser runtime errors');
  console.log('PASS browser: time-only save/null/zero/error/dirty refresh, exact mapping, replay/live/show, rolling schema gating, strict DTOs, public cache/podium/tables/archives, unchanged scores');
  checkParser();
  console.log('PASS strict race-time parser and formatter');
} catch (error) {
  console.error({ url: page.url(), errors, text: await page.$eval('body', el => el.innerText.slice(0, 500)) });
  throw error;
} finally { await browser.close(); }
