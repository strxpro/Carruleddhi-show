import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

const origin = process.env.OBS_TEST_ORIGIN || 'http://127.0.0.1:5199';
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [], writes = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewport({ width: 1440, height: 1000 });
  await page.evaluateOnNewDocument(() => {
    sessionStorage.setItem('carruleddhi.admin.key', 'test-key');
    if (!sessionStorage.getItem('carruleddhi.admin.tab')) sessionStorage.setItem('carruleddhi.admin.tab', 'settings');
    localStorage.setItem('carruleddhi.admin.locale', 'pl');
  });
  let settings = { siteLocked: true, sponsors: [], showGallery: true, showWall: true, showPrizes: true,
    showCounters: true, eventName: 'Carruleddhi Show', eventDate: '2026-10-17T12:30:00.000Z',
    eventLocation: 'Santa Teresa Gallura', galleryImages: [], galleryCaptions: [], galleryPreviewUrls: [], announcementEventDate: '' };
  const state = { id: 'main', revision: 1, updated_at: new Date().toISOString(), participant: null,
    participant_visible: false, current_participant_id: null, last_finished_participant_id: null,
    last_finished_participant: null, run_status: 'IDLE', started_at: null, stopped_at: null,
    elapsed_ms: 0, run_id: null, last_finished_elapsed_ms: null, participant_mode: 'live', sponsors_enabled: true, sponsors: [] };
  const realtime = { url: '', anonKey: null, ready: false, code: 'REALTIME_NOT_CONFIGURED' };
  let failSave = true;
  await page.setRequestInterception(true);
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/carruleddhi/')) return request.continue();
    const body = JSON.parse(request.postData() || '{}');
    const respond = (data, status = 200) => request.respond({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (path.endsWith('/inbox')) return respond({ ok: true, total: 0, counts: {} });
    if (path.endsWith('/settings-admin')) {
      if (body.settings) {
        writes.push(body);
        if (failSave) return respond({ ok: false, code: 'BROADCAST_ASSET_READ_FAILED' }, 502);
        settings = { ...settings, ...body.settings };
      }
      return respond({ ok: true, settings, submissions: [], counts: {} });
    }
    if (path.endsWith('/broadcast') || path.endsWith('/broadcast-admin')) {
      if (body.action === 'sponsor-save') {
        writes.push(body);
        settings.sponsors.push({ ...body.sponsor, id: 'live-sponsor' });
        state.revision++;
      }
      return respond({ ok: true, state, realtime, timingReady: true, runReady: true,
        serverNow: new Date().toISOString(), participants: [], sponsors: settings.sponsors.map((s, i) => ({
          id: `sponsor-${i}`, logo: '', logoUrl: '', tier: 'partner', active: true, order: i, ...s,
        })) });
    }
    return respond({ ok: true });
  });
  const clickText = text => page.evaluate(text => {
    const button = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === text && !el.disabled);
    if (!button) throw new Error(`Missing enabled button: ${text}`);
    button.click();
  }, text);
  await page.goto(`${origin}/admin.html`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.body.textContent.includes('Aggiungi sponsor'));
  assert.equal(await page.evaluate(() => localStorage.getItem('carruleddhi.admin.locale.v2')), 'it');
  await clickText('Aggiungi sponsor');
  await page.type('[data-sponsor-fields] input', 'Sponsor prova');
  await page.type('[data-sponsor-fields] input[inputmode="url"]', 'example.org');
  await page.click('[data-sponsor-fields] input');
  assert.equal(await page.$eval('[data-sponsor-fields] input[inputmode="url"]', el => el.value), 'https://example.org');
  await clickText('Salva');
  await page.waitForFunction(() => document.body.textContent.includes('BROADCAST_ASSET_READ_FAILED'));
  assert.equal(await page.$eval('[data-sponsor-fields] input', el => el.value), 'Sponsor prova');
  failSave = false;
  await clickText('Salva');
  await page.waitForFunction(() => !document.body.textContent.includes('BROADCAST_ASSET_READ_FAILED'));
  assert.equal(settings.sponsors[0].name, 'Sponsor prova');
  settings.sponsors = [{ ...settings.sponsors[0], name: 'Aggiornato altrove' }];
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => document.querySelector('[data-sponsor-fields] input')?.value === 'Aggiornato altrove');
  await page.type('[data-sponsor-fields] input', ' bozza');
  settings.sponsors = [{ ...settings.sponsors[0], name: 'Modifica concorrente' }];
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await new Promise(resolve => setTimeout(resolve, 600));
  assert.equal(await page.$eval('[data-sponsor-fields] input', el => el.value), 'Aggiornato altrove bozza');
  settings.sponsors = Array.from({ length: 9 }, (_, order) => ({ id: `s${order}`, name: `Sponsor ${order + 1}`,
    logo: '', url: '', active: true, order, tier: 'partner' }));
  await page.reload({ waitUntil: 'networkidle0' });
  for (let count = 10; count <= 12; count++) {
    await clickText('Aggiungi sponsor');
    await page.waitForFunction(count => document.querySelectorAll('[data-settings-sponsors] li').length === count, {}, count);
    await page.type('[data-settings-sponsors] li:last-child input', `Sponsor ${count}`);
    assert.equal(await page.$eval('[data-settings-sponsors] li:last-child input', el => document.activeElement === el), true);
  }
  const geometry = await page.$eval('[data-settings-sponsors]', el => ({ height: el.clientHeight, content: el.scrollHeight,
    viewport: innerHeight, controlsBeforeList: [...el.parentElement.querySelectorAll('button')].some(button =>
      button.textContent.trim() === 'Aggiungi sponsor' && !!(button.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) }));
  assert.ok(geometry.content > geometry.height && geometry.height <= geometry.viewport * 0.61);
  assert.equal(geometry.controlsBeforeList, true);
  await clickText('Salva');
  await page.waitForFunction(() => !document.body.textContent.includes('Modifiche non salvate'));
  assert.equal(settings.sponsors.length, 12);
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(await page.$$eval('[data-settings-sponsors] li', rows => rows.length), 12);
  await page.evaluate(() => sessionStorage.setItem('carruleddhi.admin.tab', 'live'));
  await page.reload({ waitUntil: 'networkidle0' });
  try { await page.waitForSelector('#live-sponsors-title', { timeout: 10000 }); }
  catch (error) { console.log(await page.$eval('body', el => el.innerText)); throw error; }
  await clickText('Aggiungi sponsor');
  await page.type('[data-sponsor-fields] input', 'Sponsor diretta');
  await page.click('form.live-editor button[type="submit"]');
  await page.waitForSelector('[data-sponsor-fields]', { hidden: true });
  assert.equal(settings.sponsors.at(-1).name, 'Sponsor diretta');
  assert.equal(writes.filter(w => w.action === 'sponsor-save').length, 1);
  assert.deepEqual(errors, []);
  console.log('PASS: Italian default, sponsor save/retry/sync, draft preservation, 9 to 12 sponsors with save/reload, scrollable list and accessible controls, LIVE creation');
} finally { await browser.close(); }
