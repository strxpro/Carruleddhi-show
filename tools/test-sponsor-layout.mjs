import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  const svg = (width, height, text) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#174ea6"/><text x="50%" y="55%" fill="white" text-anchor="middle" font-size="${Math.min(width, height) * .4}">${text}</text></svg>`)}`;
  const logos = [svg(1600, 120, 'WIDE'), svg(120, 1600, 'T'), svg(400, 400, 'LOGO')];
  let state;
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (new URL(request.url()).pathname !== '/api/carruleddhi/broadcast') return request.continue();
    return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, state, realtime: { url: '', anonKey: null } }) });
  });
  for (const count of [0, 1, 3, 10]) {
    state = { id: 'main', revision: count + 1, participant: null, participant_visible: false, sponsors_enabled: true, updated_at: new Date().toISOString(),
      sponsors: Array.from({ length: count }, (_, i) => ({ id: `real-${i}`, name: `Sponsor ${i}`, logo: logos[i % logos.length], url: '', active: true, order: i, tier: 'partner' })) };
    await page.goto(`${process.env.OBS_TEST_ORIGIN || 'http://127.0.0.1:5199'}/obs/sponsors`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.querySelector('.obs-sponsor-slot') && getComputedStyle(document.querySelector('.obs-sponsors')).opacity === '1');
    const marks = await page.$$eval('.obs-sponsor-mark img', images => images.map(img => ({ fit: getComputedStyle(img).objectFit, loaded: img.complete && img.naturalWidth > 0, width: img.clientWidth, height: img.clientHeight })));
    for (const mark of marks) { assert.equal(mark.fit, 'contain'); assert.ok(mark.loaded && mark.width > 0 && mark.height > 0); }
    if (count < 3) assert.ok(await page.$('.obs-house')); else assert.equal(await page.$('.obs-house'), null);
    assert.equal(await page.$eval('body', el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
    if (count === 0 || count === 3) await page.screenshot({ path: `shots/obs-sponsors-${count}.png`, omitBackground: true });
  }
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const x = await page.$eval('.obs-sponsor-slot', el => el.style.transform);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.notEqual(await page.$eval('.obs-sponsor-slot', el => el.style.transform), x, 'all logos remain in rotation with reduced motion');
  assert.deepEqual(errors, []);
  console.log('PASS sponsor layouts: 0/1/3/10, wide/tall/square image containment, branded fallback, transparency and continuous essential motion.');
} finally { await browser.close(); }
