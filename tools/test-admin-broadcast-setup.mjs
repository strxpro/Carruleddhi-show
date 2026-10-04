import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

const origin = process.env.OBS_TEST_ORIGIN || 'http://127.0.0.1:5199';
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [], writes = [];
  page.on('pageerror', error => errors.push(error.message));
  const row = { id: 'r-one', firstName: 'Giovanni', lastName: 'Rossi', status: 'new', raceNumber: '007',
    createdAt: '2026-10-01T12:00:00Z', email: 'fixture@example.org', phone: '', cartName: 'La Freccia', category: 'classic',
    teamName: '', locale: 'it', emailGroupSize: 1, isMinor: false, guardian: null };
  const person = { id: 'p-one', registrationId: row.id, firstName: row.firstName, lastName: row.lastName, startNumber: 7,
    city: 'Gallura', category: 'classic', projectName: row.cartName, photo: '', imagePath: '', active: true,
    voteCount: 0, totalScore: 0, averageScore: 0, raceTimeMs: null };
  const state = { id: 'main', revision: 1, updated_at: new Date().toISOString(), participant: null, participant_visible: false,
    current_participant_id: null, last_finished_participant_id: null, last_finished_participant: null,
    run_status: 'IDLE', started_at: null, stopped_at: null, elapsed_ms: 0, run_id: null, last_finished_elapsed_ms: null,
    participant_mode: 'live', sponsors_enabled: true, sponsors: [] };
  const realtime = { url: '', anonKey: null, ready: false, code: 'REALTIME_NOT_CONFIGURED' };
  let failConfirm = true, acceptConfirm = false;
  let runSetup = 'migration';
  page.on('dialog', dialog => acceptConfirm ? dialog.accept() : dialog.dismiss());
  await page.setViewport({ width: 1440, height: 1000 });
  await page.evaluateOnNewDocument(() => {
    sessionStorage.setItem('carruleddhi.admin.key', 'test-key');
    if (!sessionStorage.getItem('carruleddhi.admin.tab')) sessionStorage.setItem('carruleddhi.admin.tab', 'registrations');
    if (!localStorage.getItem('carruleddhi.admin.locale.v2')) localStorage.setItem('carruleddhi.admin.locale.v2', 'pl');
  });
  await page.setRequestInterception(true);
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/carruleddhi/')) return request.continue();
    const body = JSON.parse(request.postData() || '{}');
    const respond = (data, status = 200) => request.respond({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (path.endsWith('/inbox')) return respond({ ok: true, total: 0, counts: {} });
    if (path.endsWith('/roster')) {
      if (body.action === 'confirm') {
        writes.push(body);
        assert.deepEqual(body, { action: 'confirm', id: row.id });
        if (failConfirm) return respond({ ok: false, code: 'ROSTER_WRITE_FAILED' }, 502);
        row.status = 'confirmed'; state.revision++;
        return respond({ ok: true, row });
      }
      return respond({ ok: true, rows: [row] });
    }
    if (path.endsWith('/broadcast')) return respond({ ok: true, state, realtime, timingReady: true });
    if (path.endsWith('/broadcast-admin')) {
      assert.equal(request.headers()['x-carruleddhi-roster-key'], 'test-key');
      assert.ok(['state', 'start'].includes(body.action), `unexpected action: ${body.action}`);
      if (body.action === 'start') {
        assert.equal(runSetup, 'ready');
        assert.deepEqual(body, { action: 'start', id: person.id });
        writes.push(body); state.revision++; state.participant_visible = true;
        const { registrationId: _private, ...visible } = person; state.participant = visible;
        Object.assign(state, { current_participant_id: person.id, run_status: 'RUNNING', run_id: 'run-one',
          started_at: new Date().toISOString(), stopped_at: null, elapsed_ms: 0 });
      }
      const response = { ok: true, state: { ...state }, realtime, timingReady: true, runReady: runSetup !== 'migration',
        serverNow: new Date().toISOString(), participants: row.status === 'confirmed' ? [person] : [], sponsors: [] };
      if (runSetup === 'missing-clock') delete response.serverNow;
      if (runSetup === 'partial-state') delete response.state.last_finished_participant;
      return respond(response);
    }
    if (path.endsWith('/voting-admin')) return respond({ ok: true, timingReady: true, status: 'voting', phase: 'voting',
      participants: [person], podium: [], prizes: [], editions: [], totalVotes: 0, scoreMin: 3, scoreMax: 10, durationMinutes: 60,
      raceStartsAt: new Date().toISOString(), votingEndsAt: new Date(Date.now() + 60000).toISOString() });
    return respond({ ok: true });
  });
  const ready = selector => page.waitForFunction(selector => document.querySelector(selector) && !document.querySelector(selector).disabled, {}, selector);
  await page.goto(`${origin}/admin.html`, { waitUntil: 'networkidle0' });
  await ready('[data-roster-confirm]');
  assert.equal(await page.$eval('[data-roster-activate]', el => el.disabled), true);
  await page.waitForFunction(() => document.body.textContent.includes('SUPABASE_ANON_KEY'));
  await page.click('[data-roster-confirm]');
  assert.equal(writes.length, 0, 'cancelling confirmation must not write');
  acceptConfirm = true;
  await page.click('[data-roster-confirm]');
  await ready('[data-roster-confirm]');
  assert.equal(row.status, 'new', 'failed save retains new status');
  assert.equal(await page.$eval('[data-roster-activate]', el => el.disabled), true);
  failConfirm = false;
  await page.click('[data-roster-confirm]');
  await page.waitForSelector('[data-roster-confirm]', { hidden: true });
  assert.equal(state.participant, null, 'confirming does not automatically go on air');
  const writesBeforeSetup = writes.length;
  for (const setup of ['migration', 'missing-clock', 'partial-state']) {
    runSetup = setup;
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('[data-run-unavailable]');
    assert.match(await page.$eval('[data-run-unavailable]', el => el.textContent), /0050_broadcast_run_control\.sql.*RUN_MIGRATION_REQUIRED/);
    assert.equal(await page.$eval('[data-roster-activate]', el => el.disabled), true, `${setup} disables roster START`);
    assert.equal(await page.$eval('[data-run-start]', el => el.disabled), true);
    assert.equal(await page.$eval('[data-run-stop]', el => el.disabled), true);
    assert.equal(await page.$eval('[data-run-elapsed]', el => el.textContent), '--:--.---', 'no fallback local clock');
    await page.click('[data-roster-activate]');
    assert.equal(writes.length, writesBeforeSetup, `${setup} must not send a run command`);
  }
  runSetup = 'ready';
  await page.reload({ waitUntil: 'networkidle0' });
  await ready('[data-roster-activate]');
  assert.equal(await page.$('[data-run-unavailable]'), null);
  await page.click('[data-roster-activate]');
  await page.waitForFunction(() => document.querySelector('[data-run-current]')?.textContent === '#7 Giovanni Rossi');
  assert.deepEqual(writes.at(-1), { action: 'start', id: person.id });
  await ready('[data-run-stop]');
  await page.click('header button[title="Italiano"]');
  await page.waitForFunction(() => document.documentElement.lang === 'it' && document.body.textContent.includes('Confermata'));
  assert.ok((await page.$eval('body', el => el.textContent)).includes('Manca la chiave pubblica'));

  await page.evaluate(() => sessionStorage.setItem('carruleddhi.admin.tab', 'voting'));
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-race-time-editor]');
  const checkLayout = () => page.$eval('[data-race-time-editor]', editor => {
    const item = editor.closest('li');
    const actions = item.lastElementChild;
    const bounds = item.getBoundingClientRect(), a = actions.getBoundingClientRect(), e = editor.getBoundingClientRect();
    return { fits: a.left >= bounds.left && a.right <= bounds.right, below: a.top >= e.bottom, width: a.width, labels: item.textContent };
  });
  let layout = await checkLayout();
  assert.ok(layout.fits && layout.below && layout.width > 400, JSON.stringify(layout));
  assert.ok(layout.labels.includes('Tempo di discesa'));
  await page.$eval('[data-race-time-editor]', el => el.closest('li').scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: 'shots/admin-voting-it.png' });
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  layout = await checkLayout();
  assert.ok(layout.fits && layout.below, JSON.stringify(layout));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.$eval('[data-race-time-editor]', el => el.closest('li').scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: 'shots/admin-voting-it-mobile.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: explicit confirmation/cancel/failure/retry, no automatic ON AIR, migration/clock/partial-state gating, exact START identity, missing-key guidance, header IT switch, voting layout desktop/mobile, Italian labels.');
} finally { await browser.close(); }
