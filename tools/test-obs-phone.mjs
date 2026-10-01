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
    localStorage.setItem('carruleddhi.admin.locale', 'pl');
  });
  const participants = ['Ada', 'Anna'].map((firstName, i) => ({ id: `p${i + 1}`, firstName, lastName: 'Rossi', startNumber: i + 1, city: 'Gallura', category: 'classic', projectName: 'Cart', photo: '' }));
  const state = { id: 'main', revision: 1, updated_at: new Date().toISOString(), participant: null, participant_visible: false, sponsors_enabled: false, sponsors: [] };
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
        actions.push(body);
        state.revision++;
      }
      if (body.action === 'participant-photo') participants.find(p => p.id === body.id).photo = body.image;
      if (body.action === 'on-air') {
        state.participant = { ...participants.find(p => p.id === body.id) };
        state.participant_visible = true;
      }
      return respond({ ok: true, state, participants, sponsors: [], realtime });
    }
    return respond({ ok: false });
  });
  await page.goto(`${process.env.OBS_TEST_ORIGIN || 'http://127.0.0.1:5199'}/admin.html`, { waitUntil: 'networkidle0' });
  const links = await page.$$eval('.admin-live input[readonly]', inputs => inputs.map(input => new URL(input.value).pathname));
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
    assert.match(participant.photo, /^data:image\/webp;base64,/);
  }
  assert.notEqual(participants[0].photo, participants[1].photo);
  for (const participant of participants) {
    await page.click(`button[aria-label="Zjeżdża / ON AIR: #${participant.startNumber} ${participant.firstName} Rossi"]`);
    await page.waitForFunction(name => document.querySelector('.live-current .live-rider-details strong')?.textContent === name, {}, `${participant.firstName} Rossi`);
    assert.equal(state.participant.photo, participant.photo);
    assert.deepEqual(actions.at(-1), { action: 'on-air', id: participant.id, mode: 'live' });
  }
  assert.deepEqual(errors, []);
  console.log('PASS: mobile camera input, gallery fallback, shared mask, two saved photos, save without activation, one-click rider switch, no mobile overflow. Camera hardware is not exercised.');
} finally {
  await browser.close();
}
