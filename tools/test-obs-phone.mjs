import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';

const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  const actions = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument(() => {
    sessionStorage.setItem('carruleddhi.admin.key', 'test-key');
    sessionStorage.setItem('carruleddhi.admin.tab', 'live');
    localStorage.setItem('carruleddhi.admin.locale.v2', 'pl');
  });
  const participants = ['Ada', 'Anna'].map((firstName, i) => ({ id: `p${i + 1}`, firstName, lastName: 'Rossi', startNumber: i + 1, city: 'Gallura', category: 'classic', projectName: 'Cart', photo: '' }));
  const state = { id: 'main', revision: 1, updated_at: new Date().toISOString(), participant: null, participant_visible: false,
    current_participant_id: null, last_finished_participant_id: null, last_finished_participant: null,
    run_status: 'IDLE', started_at: null, stopped_at: null, elapsed_ms: 0, run_id: null, last_finished_elapsed_ms: null,
    sponsors_enabled: false, sponsors: [] };
  const realtime = { url: '', anonKey: null, ready: false, code: 'REALTIME_NOT_CONFIGURED' };
  await page.setRequestInterception(true);
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/carruleddhi/')) return request.continue();
    const body = JSON.parse(request.postData() || '{}');
    const respond = data => request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    if (path.endsWith('/inbox')) return respond({ ok: true, total: 0, counts: {} });
    if (path.endsWith('/broadcast')) return respond({ ok: true, state, realtime });
    if (path.endsWith('/broadcast-admin')) {
      assert.equal(request.headers()['x-carruleddhi-roster-key'], 'test-key');
      if (body.action !== 'state') {
        assert.ok(['participant-photo', 'start', 'stop'].includes(body.action), `unexpected action: ${body.action}`);
        actions.push(body);
        state.revision++;
        state.updated_at = new Date().toISOString();
      }
      if (body.action === 'participant-photo') participants.find(p => p.id === body.id).photo = body.image;
      if (body.action === 'start') {
        assert.notEqual(state.run_status, 'RUNNING', 'STOP is required before starting another rider');
        state.participant = { ...participants.find(p => p.id === body.id) };
        state.participant_visible = true;
        Object.assign(state, { current_participant_id: body.id, run_status: 'RUNNING', run_id: `run-${state.revision}`,
          started_at: new Date().toISOString(), stopped_at: null, elapsed_ms: 0 });
      }
      if (body.action === 'stop') {
        assert.equal(state.run_status, 'RUNNING');
        assert.deepEqual(body, { action: 'stop', runId: state.run_id });
        const elapsed = Math.max(0, Date.now() - Date.parse(state.started_at));
        Object.assign(state, { run_status: 'FINISHED', stopped_at: new Date().toISOString(), elapsed_ms: elapsed,
          last_finished_participant_id: state.current_participant_id,
          last_finished_participant: { ...state.participant, raceTimeMs: elapsed }, last_finished_elapsed_ms: elapsed });
      }
      return respond({ ok: true, state, participants, sponsors: [], realtime, runReady: true, serverNow: new Date().toISOString() });
    }
    return respond({ ok: false });
  });
  await page.goto(`${process.env.OBS_TEST_ORIGIN || 'http://127.0.0.1:5199'}/admin.html`, { waitUntil: 'networkidle0' });
  const links = await page.$$eval('[data-obs-primary-links] input[readonly]', inputs => inputs.map(input => new URL(input.value).pathname));
  assert.deepEqual(links, ['/obs/participant', '/obs/replay', '/obs/sponsors'], 'admin provides live, replay and sponsor source links');
  for (const [index, participant] of participants.entries()) {
    await page.click(`button[aria-label="Zdjęcie zawodnika: ${participant.firstName} Rossi"]`);
    await page.waitForSelector('.live-portrait');
    assert.equal(await page.$eval('.live-portrait input[capture]', el => el.getAttribute('capture')), 'environment');
    assert.ok(await page.$('.live-portrait input[type="file"]:not([capture])'), 'gallery remains available');
    await page.$eval('.live-portrait input[capture]', input => {
      input.addEventListener('click', event => { event.preventDefault(); input.dataset.opened = 'yes'; }, { once: true });
    });
    await page.evaluate(() => [...document.querySelectorAll('.live-portrait button')].find(b => b.textContent === 'Zrób zdjęcie telefonem').click());
    assert.equal(await page.$eval('.live-portrait input[capture]', el => el.dataset.opened), 'yes');
    await page.$eval('.live-portrait input[capture]', async (input, index) => {
      const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 1200;
      const context = canvas.getContext('2d'); context.fillStyle = index ? 'blue' : 'red'; context.fillRect(0, 0, 800, 1200);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));
      const transfer = new DataTransfer(); transfer.items.add(new File([blob], 'camera.jpg', { type: 'image/jpeg' }));
      input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    }, index);
    await page.waitForSelector('canvas.broadcast-photo-mask');
    assert.notEqual(await page.$eval('canvas.broadcast-photo-mask', el => getComputedStyle(el).clipPath), 'none');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.evaluate(() => [...document.querySelectorAll('.live-portrait button')].find(b => b.textContent === 'Zapisz zdjęcie zawodnika').click());
    await page.waitForSelector('.live-portrait', { hidden: true });
    assert.equal(state.participant, null, 'preparing a photo must not activate a rider');
    assert.equal(state.run_status, 'IDLE', 'photo upload must not start a run');
    assert.match(participant.photo, /^data:image\/webp;base64,/);
  }
  assert.notEqual(participants[0].photo, participants[1].photo);
  let frozen = null;
  for (const participant of participants) {
    const start = `[data-live-start="${participant.id}"]`;
    await page.waitForFunction(selector => document.querySelector(selector)?.disabled === false, {}, start);
    await page.click(start);
    await page.waitForFunction(name => document.querySelector('[data-run-current]')?.textContent === name
      && document.querySelector('[data-run-control]')?.dataset.runStatus === 'RUNNING', {}, `#${participant.startNumber} ${participant.firstName} Rossi`);
    assert.equal(state.participant.photo, participant.photo);
    assert.deepEqual(actions.at(-1), { action: 'start', id: participant.id });
    assert.deepEqual(state.last_finished_participant, frozen, 'starting the next rider preserves the frozen replay');
    assert.equal(await page.$$eval('[data-live-start]', buttons => buttons.every(button => button.disabled)), true);
    const runId = state.run_id;
    await page.waitForFunction(() => document.querySelector('[data-run-stop]')?.disabled === false);
    await page.click('[data-run-stop]');
    await page.waitForSelector('[data-run-status="FINISHED"]');
    assert.deepEqual(actions.at(-1), { action: 'stop', runId });
    assert.equal(state.last_finished_participant.photo, participant.photo);
    assert.match(await page.$eval('[data-run-last]', el => el.textContent), new RegExp(`${participant.firstName} Rossi`));
    frozen = structuredClone(state.last_finished_participant);
  }
  assert.deepEqual(errors, []);
  console.log('PASS: mobile camera input, gallery fallback, shared mask, two saved photos, save without activation, START/STOP rider switching, frozen replay retained on next START, no mobile overflow. Camera hardware is not exercised.');
} finally {
  await browser.close();
}
