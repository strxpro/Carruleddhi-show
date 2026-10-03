import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

// Isolated real-browser harness: no worker, photos, production reads or mutations.
const fixture = '/__race_results_fixture__.tsx';
const server = await createServer({
  configFile: false, root: process.cwd(),
  cacheDir: 'node_modules/.vite-race-results-test',
  optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] },
  plugins: [react(), {
    name: 'race-results-test-fixture',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/') return next();
        const html = await server.transformIndexHtml('/', `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module" src="${fixture}"></script></body></html>`);
        res.setHeader('Content-Type', 'text/html');
        res.end(html);
      });
    },
    resolveId(id) { if (id === fixture) return '\0race-results-fixture.tsx'; },
    load(id) {
      if (id !== '\0race-results-fixture.tsx') return;
      return `import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {flushSync} from 'react-dom';
        import {RaceResults} from '/src/obs/scenes/RaceResults.tsx';
        import '/src/obs/overlay.css';
        let time=1, id=0, pending=new Map();
        window.requestAnimationFrame=callback=>{pending.set(++id,callback);return id};
        window.cancelAnimationFrame=id=>pending.delete(id);
        const root=createRoot(document.getElementById('root'));
        let props={participants:[],active:true,language:'it'};
        const render=()=>flushSync(()=>root.render(React.createElement(RaceResults,props)));
        window.raceTest={
          set(value){props={...props,...value};render()},
          advance(ms){for(let left=ms;left>0;){const step=Math.min(100,left);time+=step;left-=step;
            const callbacks=[...pending.values()];pending.clear();flushSync(()=>callbacks.forEach(callback=>callback(time)));}},
          pending(){return pending.size},
          unmount(){flushSync(()=>root.unmount())}
        };
        render();`;
    },
  }],
  server: { host: '127.0.0.1', port: 0 },
});
await server.listen();
const address = server.httpServer.address();
const browser = await puppeteer.launch({ headless: true });
const rider = (index, category = 'art', overrides = {}) => ({ id: `${category}-${index}`, category,
  firstName: ['Alessia', 'Bruno', 'Carla', 'Daniele'][index % 4], lastName: 'Della Valle',
  startNumber: index + 1, projectName: `Carruleddhu ${index + 1}`, raceTimeMs: index * 1000, ...overrides });
try {
  const page = await browser.newPage();
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.raceTest, { polling: 100 });
  await page.evaluate(() => document.fonts.ready);
  const set = value => page.evaluate(value => window.raceTest.set(value), value);
  const advance = ms => page.evaluate(ms => window.raceTest.advance(ms), ms);
  const measure = () => page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      if (animation.effect?.target?.matches?.('[data-race-results]')) animation.finish();
    }
    const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom }; };
    const panel = document.querySelector('[data-race-results]');
    const viewport = panel.querySelector('.race-results__viewport');
    const track = panel.querySelector('.race-results__track');
    return { panel: rect(panel), category: panel.dataset.category, top: [...panel.querySelectorAll('.race-results__top li')].map(el => ({ id: el.dataset.raceId, rect: rect(el) })),
      rows: [...panel.querySelectorAll('[data-race-id]')].map(el => el.dataset.raceId),
      offset: track ? -new DOMMatrixReadOnly(getComputedStyle(track).transform).m42 : 0,
      max: track ? track.scrollHeight - viewport.clientHeight : 0, viewport: viewport && rect(viewport),
      phase: track?.dataset.scrollPhase, clipping: viewport && getComputedStyle(viewport).overflowY,
      visible: [...panel.querySelectorAll('.race-results__track li')].filter(el => el.getBoundingClientRect().top >= viewport.getBoundingClientRect().top - .1 && el.getBoundingClientRect().bottom <= viewport.getBoundingClientRect().bottom + .1).map(el => el.dataset.raceId),
    };
  });

  for (const count of [0, 1, 3, 10, 30]) {
    await set({ participants: Array.from({ length: count }, (_, i) => rider(i)) });
    await advance(100);
    const geometry = await measure();
    assert.equal(geometry.rows.length, count);
    assert.equal(geometry.top.length, Math.min(3, count));
    assert.deepEqual(geometry.panel, { x: 1370, y: 170, width: 454, height: 660, bottom: 830 });
    assert.ok(geometry.panel.bottom < 900 && geometry.panel.bottom < 942);
    assert.equal(await page.$('img'), null, 'no sample photos or fallback people');
    if (count) assert.equal(geometry.clipping, 'clip');
    else assert.match(await page.$eval('.race-results__empty', el => el.textContent), /In attesa/);
  }

  // Return to neutral once, then verify a complete measured-layout cycle.
  await set({ participants: [] }); await advance(100);
  const participants = [...Array.from({ length: 30 }, (_, i) => rider(i)), ...Array.from({ length: 10 }, (_, i) => rider(i, 'classic'))];
  await set({ participants }); await advance(100);
  const initial = await measure();
  assert.equal(initial.category, 'art');
  await advance(34_000);
  const scrolling = await measure();
  assert.ok(scrolling.offset > 290 && scrolling.offset < 310);
  assert.deepEqual(scrolling.top, initial.top, 'top three are outside the moving track');
  await set({ participants: structuredClone(participants).reverse() });
  await advance(100);
  const refreshed = await measure();
  assert.ok(refreshed.offset >= scrolling.offset && refreshed.offset <= scrolling.offset + 2, 'same data and API reorder never restart scrolling');
  assert.deepEqual(refreshed.top, initial.top);
  await set({ active: false });
  assert.equal(await page.$eval('[data-race-results]', el => getComputedStyle(el).display), 'none');
  await advance(30_000);
  await set({ active: true }); await advance(100);
  assert.ok(Math.abs((await measure()).offset - refreshed.offset) < 2, 'inactive scenes pause rather than jumping');
  const beforeHidden = (await measure()).offset;
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await advance(30_000);
  assert.equal((await measure()).offset, beforeHidden);
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await advance(100);
  assert.equal((await measure()).offset, beforeHidden, 'document resume does not catch up hidden time');

  const current = await measure();
  await advance((current.max - current.offset) / 10 * 1000);
  const bottom = await measure();
  assert.ok(Math.abs(bottom.offset - bottom.max) < 1);
  assert.equal(bottom.category, 'art');
  assert.ok(bottom.visible.includes('art-29'), 'last participant becomes fully visible');
  await advance(4000);
  assert.equal((await measure()).category, 'art');
  await advance(bottom.max / 10 * 1000);
  assert.equal((await measure()).offset, 0);
  assert.equal((await measure()).category, 'art');
  await advance(4000);
  assert.equal((await measure()).category, 'classic');

  await set({ participants: [] }); await advance(100);
  await set({ participants: [rider(1, 'art', { raceTimeMs: null }), rider(0, 'art'), rider(2, 'art', { raceTimeMs: -1 })] });
  await advance(100);
  assert.deepEqual((await measure()).rows, ['art-0', 'art-1', 'art-2']);
  assert.equal(await page.$eval('[data-race-id="art-0"] .race-results__time', el => el.textContent), '00:00.000');
  assert.equal(await page.$$eval('.race-results__untimed', els => els.filter(el => el.textContent === 'Senza tempo').length), 2);
  await set({ language: 'pl' });
  assert.equal(await page.$eval('.race-results__untimed', el => el.textContent), 'Bez czasu');

  await set({ participants: [] }); await advance(100);
  await set({ participants: [rider(0), rider(0, 'classic')] }); await advance(100);
  await advance(11_800);
  assert.equal((await measure()).category, 'art');
  await advance(100);
  assert.equal((await measure()).category, 'classic', 'non-overflow category holds twelve seconds');

  await set({ participants: [rider(0, 'art', { raceTimeMs: 2147483647, firstName: 'Alessandro Giovanni Maria Antonio', lastName: 'Della Valle Di Monte San Giovanni' })] });
  await advance(100);
  assert.ok(await page.$eval('.race-results__time', el => el.scrollWidth <= el.clientWidth), 'maximum valid duration remains readable');
  assert.ok(await page.$eval('.race-results__identity', el => el.scrollWidth <= el.clientWidth), 'long names do not overlap the time');

  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.waitForFunction(() => document.querySelector('[data-race-results]').dataset.reducedMotion === 'true', { polling: 100 });
  await set({ participants: [] }); await advance(100);
  await set({ participants, language: 'it' }); await advance(100);
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    const frame = await measure();
    if (frame.category !== 'art') break;
    for (const id of frame.visible) seen.add(id);
    await advance(1000);
    assert.equal((await measure()).offset, frame.offset, 'reduced-motion page has no continuous motion');
    await advance(5000);
  }
  assert.equal(seen.size, 27, 'reduced-motion pages expose every non-podium participant');
  assert.equal((await measure()).category, 'classic');

  await set({ participants: participants.slice(0, 10) }); await advance(100);
  if (process.env.RACE_RESULTS_SCREENSHOT) await page.screenshot({ path: process.env.RACE_RESULTS_SCREENSHOT, omitBackground: true });
  await page.evaluate(() => window.raceTest.unmount());
  assert.equal(await page.evaluate(() => window.raceTest.pending()), 0, 'unmount cancels frame loop');
  assert.deepEqual(errors, []);
  assert.ok(requests.every(url => !url.includes('/api/')), 'isolated test does not touch live data');
  console.log(JSON.stringify({ ok: true, checks: ['0/1/3/10/30 participants', 'safe panel geometry', 'full down/pause/up/pause cycle', 'fixed top three', 'stable refresh and visibility', 'last row visible', 'zero and missing times', 'IT/PL labels', 'reduced-motion pages', 'no API or sample photos', 'cleanup'] }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
