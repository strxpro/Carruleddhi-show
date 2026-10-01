import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

const origin = process.env.ROSTER_TEST_ORIGIN || process.env.OBS_TEST_ORIGIN || 'http://127.0.0.1:5199';
const browser = await puppeteer.launch({ headless: true });
const ids = Array.from({ length: 6 }, (_, i) => `10000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
const fixture = () => ['Alpha One', 'Alpha Two', 'Beta Three', 'Alpha Confirmed', 'Alpha Withdrawn', 'Alpha Missing'].map((name, i) => ({
  id: ids[i], firstName: name.split(' ')[0], lastName: name.split(' ')[1],
  status: i === 3 ? 'confirmed' : i === 4 ? 'withdrawn' : 'new', raceNumber: '007',
  createdAt: '2026-10-01T12:00:00Z', email: 'same@example.org', phone: '', cartName: 'Cart', category: 'classic',
  teamName: '', locale: 'pl', emailGroupSize: 6, isMinor: false, guardian: null,
}));
const state = { id: 'main', revision: 1, updated_at: '2026-10-01T12:00:00Z', participant: null,
  participant_visible: false, participant_mode: 'live', sponsors_enabled: true, sponsors: [] };
const realtime = { url: '', anonKey: null, ready: false, code: 'REALTIME_NOT_CONFIGURED' };
const select = i => `[data-roster-select="${ids[i]}"]`;
const button = '[data-roster-bulk-confirm]';
const count = '[data-roster-selected-count]';
let rows, writes, rosterReads, failIds, conflictIds, snapshotFailure, holdUpdate, releaseUpdate;
let accept = false, dialogs = [];
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => { dialogs.push(dialog.message()); return accept ? dialog.accept() : dialog.dismiss(); });
  await page.setViewport({ width: 1440, height: 1000 });
  await page.evaluateOnNewDocument(() => {
    sessionStorage.setItem('carruleddhi.admin.key', 'test-key');
    sessionStorage.setItem('carruleddhi.admin.tab', 'registrations');
    if (!localStorage.getItem('carruleddhi.admin.locale')) localStorage.setItem('carruleddhi.admin.locale', 'pl');
  });
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin !== origin) return request.abort();
    if (!url.pathname.startsWith('/api/carruleddhi/')) return request.continue();
    const body = JSON.parse(request.postData() || '{}');
    const respond = (data, status = 200) => request.respond({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (url.pathname.endsWith('/inbox')) return respond({ ok: true, total: 0, counts: {} });
    if (url.pathname.endsWith('/broadcast')) return respond({ ok: true, state, realtime, timingReady: true });
    if (url.pathname.endsWith('/broadcast-admin')) return respond({ ok: true, state, realtime, timingReady: true, participants: [], sponsors: [] });
    if (url.pathname.endsWith('/roster')) {
      assert.equal(request.headers()['x-carruleddhi-roster-key'], 'test-key');
      if (body.action === 'list') {
        rosterReads++;
        return snapshotFailure ? respond({ ok: false, code: 'ROSTER_READ_FAILED' }, 502) : respond({ ok: true, rows });
      }
      assert.deepEqual(body, { action: 'confirm', id: body.id }, 'confirmation only, without unrelated fields');
      writes.push(body);
      const finish = () => {
        if (failIds.has(body.id)) return respond({ ok: false, code: 'ROSTER_WRITE_FAILED' }, 502);
        const row = rows.find(row => row.id === body.id);
        if (conflictIds.has(body.id)) {
          row.status = 'withdrawn';
          return respond({ ok: false, code: 'ROSTER_STATUS_CONFLICT' }, 409);
        }
        assert.equal(row.status, 'new', 'only new UUIDs may be confirmed');
        row.status = 'confirmed';
        return respond({ ok: true, row });
      };
      if (holdUpdate) { releaseUpdate = finish; return; }
      return finish();
    }
    return respond({ ok: true });
  });
  const enabled = selector => page.waitForFunction(s => document.querySelector(s) && !document.querySelector(s).disabled, {}, selector);
  const selectedCount = value => page.waitForFunction((s, value) => document.querySelector(s)?.textContent.endsWith(`: ${value}`), {}, count, value);
  const outcome = async (succeeded, failed, skipped) => {
    await page.waitForFunction((succeeded, failed, skipped) => {
      const text = document.querySelector('[data-roster-bulk-result] p')?.textContent;
      return text === `Potwierdzone: ${succeeded}. Nieudane: ${failed}. Pominięte: ${skipped}.`;
    }, {}, succeeded, failed, skipped);
  };
  const reset = async () => {
    rows = fixture(); writes = []; rosterReads = 0; failIds = new Set(); conflictIds = new Set();
    snapshotFailure = false; holdUpdate = false; releaseUpdate = null; accept = false; dialogs = [];
    await page.goto(`${origin}/admin.html`, { waitUntil: 'networkidle0' });
    await enabled(select(0));
  };
  const filter = async text => {
    await page.$eval('input[placeholder]', el => { el.focus(); el.select(); });
    await page.keyboard.press('Backspace');
    if (text) await page.type('input[placeholder]', text);
    await selectedCount(0);
  };

  await reset();
  assert.equal(writes.length, 0, 'loading never confirms automatically');
  assert.equal(await page.$eval(button, el => el.disabled), true);
  assert.equal(await page.$(select(3)), null, 'confirmed row has no checkbox');
  assert.equal(await page.$(select(4)), null, 'withdrawn row has no checkbox');
  await page.click(select(2));
  await selectedCount(1);
  assert.equal(await page.$eval('[data-roster-select-all]', el => el.indeterminate), true);
  await filter('Alpha');
  assert.equal(await page.$(select(2)), null);
  await page.click('[data-roster-select-all]');
  await selectedCount(3);
  await page.click('[data-roster-clear-selection]');
  await selectedCount(0);
  await page.click('[data-roster-select-all]');
  await page.click(button);
  assert.equal(dialogs.length, 1);
  assert.match(dialogs[0], /\(3\)/);
  assert.equal(writes.length, 0, 'cancel sends no writes');
  assert.equal(rosterReads, 1, 'cancel sends no fresh fetch');
  await selectedCount(3);
  accept = true;
  holdUpdate = true;
  await page.click(button);
  await page.waitForFunction(() => document.querySelector('[data-roster-bulk-confirm]')?.disabled);
  for (let attempt = 0; !releaseUpdate && attempt < 1000; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(releaseUpdate, 'first batch update reached the mock');
  assert.equal(writes.length, 1, 'sequential batch has only one in-flight update');
  for (const selector of [button, select(0), '[data-roster-select-all]', '[data-roster-clear-selection]', '[data-roster-confirm]', 'button[title="Edytuj"]', 'button[title="Usuń na zawsze"]', 'input[placeholder]']) {
    assert.equal(await page.$eval(selector, el => el.disabled), true, `locked during batch: ${selector}`);
  }
  holdUpdate = false;
  await releaseUpdate();
  await outcome(3, 0, 0);
  await selectedCount(0);
  assert.equal(rosterReads, 2, 'one fresh snapshot per batch');
  assert.deepEqual(writes.map(write => write.id), [ids[0], ids[1], ids[5]], 'filtered selection preserves exact UUIDs despite reused numbers and email');
  assert.equal(rows[2].status, 'new', 'hidden row untouched');
  assert.equal(rows[4].status, 'withdrawn');
  assert.equal(state.participant, null, 'confirmation never puts anyone on air');

  await reset();
  await page.click(select(0)); await page.click(select(1));
  failIds.add(ids[1]); accept = true;
  await page.click(button);
  await outcome(1, 1, 0);
  await selectedCount(1);
  assert.equal(await page.$eval(select(1), el => el.checked), true, 'failed row retained for retry');
  assert.equal(await page.$(select(0)), null, 'successful row no longer selectable');
  failIds.clear();
  await page.click(button);
  await outcome(1, 0, 0);
  await selectedCount(0);
  assert.deepEqual(writes.map(write => write.id), [ids[0], ids[1], ids[1]], 'retry only submits failed UUID');

  await reset();
  await page.click('[data-roster-select-all]');
  rows[0].status = 'withdrawn'; rows[1].status = 'confirmed'; rows = rows.filter(row => row.id !== ids[5]);
  accept = true;
  await page.click(button);
  await outcome(1, 0, 3);
  assert.deepEqual(writes.map(write => write.id), [ids[2]], 'stale withdrawn, confirmed and missing UUIDs skipped before update');
  assert.equal(rows[0].status, 'withdrawn');

  await reset();
  await page.click(select(0)); await page.click(select(1));
  conflictIds.add(ids[0]); accept = true;
  await page.click(button);
  await outcome(1, 0, 1);
  await selectedCount(0);
  assert.equal(rows[0].status, 'withdrawn', 'concurrent backend conflict is skipped, never retried as resurrection');

  await reset();
  await page.click(select(0)); snapshotFailure = true; accept = true;
  await page.click(button);
  await outcome(0, 1, 0);
  await selectedCount(1);
  assert.equal(writes.length, 0, 'failed fresh snapshot fails closed');
  assert.match(await page.$eval('[data-roster-bulk-result]', el => el.textContent), /Nie wysłano żadnych zmian/);

  await reset();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await enabled(select(0));
  for (const selector of [select(0), '[data-roster-select-all]', button, '[data-roster-confirm]']) {
    const bounds = await page.$eval(selector, el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, viewport: innerWidth }; });
    assert.ok(bounds.left >= 0 && bounds.right <= bounds.viewport, `mobile control visible without horizontal scroll: ${selector} ${JSON.stringify(bounds)}`);
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.click(select(0)); await selectedCount(1);
  await enabled('[data-roster-confirm]');
  accept = true;
  await page.click('[data-roster-confirm]');
  await page.waitForSelector(select(0), { hidden: true });
  await selectedCount(0);
  assert.equal(writes.length, 1, 'existing single confirmation preserved');
  await page.evaluate(() => localStorage.setItem('carruleddhi.admin.locale', 'it'));
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector(button);
  assert.equal(await page.$eval(button, el => el.textContent), 'Conferma selezionate');
  await page.click(select(1)); accept = false;
  await page.click(button);
  assert.match(dialogs.at(-1), /Confermare le nuove iscrizioni selezionate \(1\)/);
  await page.click(select(2));
  accept = true;
  await page.click(button);
  await page.waitForFunction(() => document.querySelector('[data-roster-bulk-result] p')?.textContent === 'Confermate: 2. Non riuscite: 0. Ignorate: 0.');
  await selectedCount(0);
  assert.deepEqual(writes.map(write => write.id), [ids[0], ids[1], ids[2]], 'mobile batch also confirms only checked UUIDs');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, checks: ['desktop and 390px mobile', 'new-only checkboxes', 'filtered select-all and clear', 'no hidden UUID writes', 'cancel without reads/writes', 'sequential successful batch', 'edit and single-confirm locks', 'partial failures and retry', 'fresh status skip: withdrawn/confirmed/missing', 'atomic status conflict skip', 'snapshot failure fails closed', 'single confirmation preserved', 'PL/IT', 'no browser errors', 'all API requests mocked'] }, null, 2));
} finally {
  await browser.close();
}
