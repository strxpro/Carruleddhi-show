import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

const origin = new URL(process.env.OBS_TEST_ORIGIN || 'http://127.0.0.1:5199').origin;
const scenes = ['starting', 'intro', 'break', 'voting', 'results', 'standby', 'ending'];
const effects = ['confetti', 'ribbons', 'sparkles'];
const catalog = '[data-obs-scene-catalog]';
const source = id => `[data-obs-catalog-source="${id}"]`;
const browser = await puppeteer.launch({ headless: true });

try {
  for (const [locale, width] of [['pl', 390], ['it', 1440]]) {
    const page = await browser.newPage();
    const errors = [];
    const writes = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width, height: 900 });
    await page.evaluateOnNewDocument(locale => {
      sessionStorage.setItem('carruleddhi.admin.key', 'test-key');
      sessionStorage.setItem('carruleddhi.admin.tab', 'live');
      localStorage.setItem('carruleddhi.admin.locale', locale);
      window.catalogCopied = [];
      window.catalogCopyFails = false;
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async text => {
          if (window.catalogCopyFails) throw new Error('Clipboard denied');
          window.catalogCopied.push(text);
        },
      } });
    }, locale);
    const state = {
      id: 'main', revision: 1, updated_at: new Date().toISOString(), participant: null, participant_visible: false,
      current_participant_id: null, last_finished_participant_id: null, last_finished_participant: null,
      run_status: 'IDLE', started_at: null, stopped_at: null, elapsed_ms: 0, run_id: null, last_finished_elapsed_ms: null,
      sponsors_enabled: false, sponsors: [],
    };
    const realtime = { url: '', anonKey: null, ready: false, code: 'REALTIME_NOT_CONFIGURED' };
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.origin !== origin && !['data:', 'blob:'].includes(url.protocol)) return request.abort();
      if (!url.pathname.startsWith('/api/')) return request.continue();
      const body = JSON.parse(request.postData() || '{}');
      const respond = data => request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      if (url.pathname.endsWith('/inbox')) return respond({ ok: true, total: 0, counts: {} });
      if (body.action !== 'state') writes.push({ path: url.pathname, body });
      if (url.pathname.endsWith('/broadcast-admin')) return respond({
        ok: true, state, realtime, participants: [], sponsors: [], runReady: true, timingReady: true, serverNow: new Date().toISOString(),
      });
      if (url.pathname.endsWith('/broadcast')) return respond({ ok: true, state, realtime });
      return respond({ ok: false });
    });

    await page.goto(`${origin}/admin.html`, { waitUntil: 'networkidle0' });
    await page.waitForSelector(catalog);
    const primaryLinks = await page.$$eval('[data-obs-primary-links] input[readonly]', inputs => inputs.map(input => input.value));
    assert.deepEqual(primaryLinks, ['/obs/participant', '/obs/replay', '/obs/sponsors'].map(path => origin + path));
    assert.equal(await page.$eval(catalog, el => el.open), false, 'catalog starts closed');
    assert.equal(await page.$eval(`${catalog} summary`, el => el.textContent), locale === 'pl' ? 'Sceny i efekty OBS' : 'Scene ed effetti OBS');
    await page.focus(`${catalog} summary`);
    await page.keyboard.press('Enter');
    assert.equal(await page.$eval(catalog, el => el.open), true, 'keyboard opens native disclosure');
    assert.equal(await page.$eval('[name="scene-language"]', el => el.value), 'it', 'scene default is Italian even in Polish admin');
    assert.equal(await page.$eval('[name="scene-background"]', el => el.value), 'transparent');
    for (const name of ['camera', 'qr', 'sponsors']) assert.equal(await page.$eval(`[name="scene-${name}"]`, el => el.checked), true);
    assert.equal(await page.$eval('[name="effect-once"]', el => el.checked), false);

    async function checkUrls(sceneParams = {}, once = false) {
      const rows = await page.$$eval(`${catalog} [data-obs-catalog-source]`, elements => elements.map(el => ({
        id: el.dataset.obsCatalogSource, value: el.querySelector('input').value,
        readonly: el.querySelector('input').readOnly, labeled: el.querySelector('input').labels.length > 0,
        preview: el.querySelector('a').href, target: el.querySelector('a').target, rel: el.querySelector('a').rel,
      })));
      assert.deepEqual(rows.map(row => row.id), [...scenes, ...effects]);
      for (const row of rows) {
        const effect = effects.includes(row.id);
        const url = new URL(`${origin}/obs/${effect ? 'effects/' : ''}${row.id}`);
        const params = effect ? (once ? { once: '1' } : {}) : sceneParams;
        for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
        assert.equal(row.value, url.href, `${row.id} exact generated URL`);
        if (!effect) url.searchParams.set('guides', '1');
        assert.equal(row.preview, url.href, `${row.id} preview parameters`);
        assert.equal(row.readonly && row.labeled, true, `${row.id} accessible read-only address`);
        assert.equal(row.target, '_blank');
        assert.match(row.rel, /noopener/);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `no overflow at ${width}px`);
    }

    await checkUrls();
    const storage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
    await page.select('[name="scene-language"]', 'pl');
    await checkUrls({ lang: 'pl' });
    await page.select('[name="scene-language"]', 'it');
    for (const name of ['camera', 'qr', 'sponsors']) {
      await page.click(`[name="scene-${name}"]`);
      await checkUrls({ [name]: '0' });
      await page.click(`[name="scene-${name}"]`);
      await checkUrls();
    }
    await page.select('[name="scene-background"]', 'solid');
    await checkUrls({ background: 'solid' });
    await page.select('[name="scene-language"]', 'pl');
    for (const name of ['camera', 'qr', 'sponsors']) await page.click(`[name="scene-${name}"]`);
    const allOptions = { lang: 'pl', background: 'solid', camera: '0', qr: '0', sponsors: '0' };
    await checkUrls(allOptions);
    await page.click('[name="effect-once"]');
    await checkUrls(allOptions, true);
    await page.click('[name="effect-once"]');
    await checkUrls(allOptions);

    for (const id of ['starting', 'confetti']) {
      const value = await page.$eval(`${source(id)} input`, input => input.value);
      await page.click(`${source(id)} button`);
      await page.waitForFunction(value => window.catalogCopied.includes(value), {}, value);
      assert.equal(await page.$eval(`${source(id)} [role="status"]`, el => el.textContent), locale === 'pl' ? 'Skopiowano adres.' : 'Indirizzo copiato.');
    }
    await page.evaluate(() => { window.catalogCopyFails = true; });
    await page.click(`${source('intro')} button`);
    await page.waitForSelector(`${source('intro')} [role="status"]`);
    assert.equal(await page.$eval(`${source('intro')} input`, input => document.activeElement === input && input.selectionStart === 0 && input.selectionEnd === input.value.length), true, 'failed clipboard selects full address for manual copy');
    assert.match(await page.$eval(`${source('intro')} [role="status"]`, el => el.textContent), locale === 'pl' ? /ręcznie/ : /manualmente/);
    assert.ok(await page.$(`${catalog} a[href="https://www.carruleddhishow.com/votazione"]`), 'instructions link to real public voting');
    const help = await page.$eval(catalog, el => el.textContent);
    assert.match(help, /x 544, y 80, 1280 x 720/);
    assert.match(help, /SPONSORZY/);
    assert.deepEqual(await page.$$eval('[data-obs-primary-links] input[readonly]', inputs => inputs.map(input => input.value)), primaryLinks);
    assert.deepEqual(await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } })), storage, 'options do not persist a second broadcast state');
    assert.deepEqual(writes, [], 'no API mutations from catalog controls');
    assert.equal(state.revision, 1);
    await page.focus(`${catalog} summary`);
    await page.keyboard.press('Enter');
    assert.equal(await page.$eval(catalog, el => el.open), false);
    await page.reload({ waitUntil: 'networkidle0' });
    assert.equal(await page.$eval(catalog, el => el.open), false);
    await checkUrls();
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS: PL/IT Admin scene catalog, collapsed keyboard disclosure, Italian clean defaults, all URL toggles, isolated effects/once, guide-only scene previews, mocked clipboard success/fallback, unchanged primary links, no API/storage mutations, 390px/1440px without overflow. Preview route rendering and real clipboard permissions are not exercised.');
} finally {
  await browser.close();
}
