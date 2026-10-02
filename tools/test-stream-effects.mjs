import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { clampIntensity, EFFECTS, EffectEngine, MAX_FRAME_DELTA, PALETTE, STAGE } from '../src/obs/effects/engine.ts';

function advance(engine, seconds) {
  const steps = Math.round(seconds * 60);
  for (let frame = 0; frame < steps; frame++) engine.advance(1 / 60);
}

test('intensity accepts only finite values and stays within sensible bounds', () => {
  for (const value of [undefined, null, '', ' ', 'oops', 'Infinity', NaN, Infinity, {}, []]) assert.equal(clampIntensity(value), 1);
  assert.equal(clampIntensity('-20'), 0.5);
  assert.equal(clampIntensity('20'), 1.5);
  assert.equal(clampIntensity('1.2'), 1.2);
});

for (const name of Object.keys(EFFECTS)) {
  test(`${name}: fixed pool stays finite and bounded over twenty cycles`, () => {
    const engine = new EffectEngine(name, { intensity: 1.5 });
    const pool = [...engine.particles];
    let peak = 0;
    for (let frame = 0; frame < engine.period * 60 * 20; frame++) {
      engine.advance(1 / 60);
      assert.ok(engine.frameParticles <= Math.round(EFFECTS[name].count * 1.5));
      peak = Math.max(peak, engine.frameParticles);
      if (frame % 30 === 0) {
        assert.equal(engine.particles.length, pool.length);
        for (const [index, p] of engine.particles.entries()) {
          assert.equal(p, pool[index], 'pool entries are reused, never accumulated');
          assert.ok(PALETTE.includes(p.color));
          assert.ok([p.x, p.y, p.angle, p.alpha, p.scale, p.age].every(Number.isFinite));
          assert.ok(p.alpha >= 0 && p.alpha <= 1);
          assert.ok(Math.abs(p.x) < STAGE.width * 2 && Math.abs(p.y) < STAGE.height * 3);
          if (name === 'sparkles' && p.alpha > 0) {
            assert.ok(p.x < 350 || p.x > 1570 || p.y < 180 || p.y > 800, 'stars keep the central picture clear');
          }
        }
      }
    }
    assert.equal(engine.cycle, 20);
    assert.ok(peak > 0);
    assert.equal(engine.completed, false);
  });

  test(`${name}: exact active, quiet and once boundaries`, () => {
    const { duration, quiet } = EFFECTS[name];
    const loop = new EffectEngine(name);
    advance(loop, 1);
    assert.ok(loop.frameParticles > 0);
    advance(loop, duration - 1);
    assert.equal(loop.phase, 'quiet');
    assert.equal(loop.frameParticles, 0);
    assert.ok(loop.particles.every(p => p.alpha === 0));
    advance(loop, quiet - 0.1);
    assert.equal(loop.phase, 'quiet');
    advance(loop, 0.1);
    assert.equal(loop.cycle, 1);
    assert.equal(loop.phase, 'active');

    const once = new EffectEngine(name, { once: true });
    advance(once, duration - 1 / 60);
    assert.equal(once.completed, false);
    advance(once, 1 / 60);
    assert.equal(once.completed, true);
    assert.equal(once.elapsed, duration);
    assert.equal(once.frameParticles, 0);
    advance(once, 120);
    assert.equal(once.cycle, 0);
    assert.equal(once.elapsed, duration);
    assert.ok(once.particles.every(p => p.alpha === 0));
  });

  test(`${name}: suspension delta is capped; reduced motion lowers the particle budget`, () => {
    const normal = new EffectEngine(name);
    const reduced = new EffectEngine(name, { reducedMotion: true });
    normal.advance(600);
    assert.equal(normal.elapsed, MAX_FRAME_DELTA);
    for (const invalid of [-1, NaN, Infinity, -Infinity]) normal.advance(invalid);
    assert.equal(normal.elapsed, MAX_FRAME_DELTA);
    advance(normal, 1);
    advance(reduced, 1);
    assert.ok(reduced.frameParticles < normal.frameParticles);
    assert.ok(reduced.frameParticles > 0, 'reduced motion is gentler animation, not a false static claim');
    assert.equal(reduced.particleLimit, Math.round(EFFECTS[name].count * 0.45));
    normal.reducedMotion = true;
    normal.advance(0);
    assert.ok(normal.frameParticles <= reduced.particleLimit);
  });
}

// Opt-in integration: STREAM_EFFECTS_BROWSER=1 node --test tools/test-stream-effects.mjs
// Uses an in-process plain Vite server and direct HTML files, never the worker/config/routes.
test('Chromium: transparency, lifecycle, resize and no API traffic', {
  skip: process.env.STREAM_EFFECTS_BROWSER !== '1', timeout: 120000,
}, async () => {
  const { createServer } = await import('vite');
  const { default: puppeteer } = await import('puppeteer');
  const server = await createServer({
    configFile: false, envFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error',
  });
  let browser;
  try {
    await server.listen();
    const origin = server.resolvedUrls.local[0].replace(/\/$/, '');
    const systemChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const executablePath = process.env.CHROME_PATH || (existsSync(systemChrome) ? systemChrome : undefined);
    browser = await puppeteer.launch({ headless: true, executablePath, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    const forbiddenRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/') || (url.protocol.startsWith('http') && url.origin !== origin)) forbiddenRequests.push(request.url());
    });
    await page.evaluateOnNewDocument(() => {
      let now = 0;
      let sequence = 0;
      const frames = new Map();
      window.requestAnimationFrame = callback => { frames.set(++sequence, callback); return sequence; };
      window.cancelAnimationFrame = id => frames.delete(id);
      window.__effectClock = {
        step(seconds) {
          for (let index = 0; index < Math.round(seconds * 60); index++) {
            now += 1000 / 60;
            const pending = [...frames.values()];
            frames.clear();
            for (const callback of pending) callback(now);
          }
        },
        pending: () => frames.size,
      };
    });
    const step = seconds => page.evaluate(value => window.__effectClock.step(value), seconds);
    const inspect = () => page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let visible = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) visible++;
      const box = canvas.getBoundingClientRect();
      return {
        data: { ...canvas.dataset }, visible, coverage: visible / (pixels.length / 4),
        width: box.width, height: box.height, backingWidth: canvas.width,
        background: getComputedStyle(document.body).backgroundColor,
        overflow: getComputedStyle(document.body).overflow,
        canvases: document.querySelectorAll('canvas').length,
        media: document.querySelectorAll('audio,video,img,iframe').length,
        pending: window.__effectClock.pending(),
      };
    });
    for (const name of Object.keys(EFFECTS)) {
      for (const width of [1920, 960]) {
        await page.setViewport({ width, height: width * 9 / 16, deviceScaleFactor: 1 });
        await page.goto(`${origin}/obs-effect-${name}.html?once=1&intensity=1.5`, { waitUntil: 'networkidle0' });
        let state = await inspect();
        assert.equal(state.visible, 0, 'initial frame is fully transparent');
        assert.equal(state.background, 'rgba(0, 0, 0, 0)');
        assert.equal(state.overflow, 'hidden');
        assert.equal(state.data.effect, name);
        assert.equal(state.canvases, 1);
        assert.equal(state.media, 0);
        assert.equal(state.width, width);
        assert.equal(state.height, width * 9 / 16);
        assert.equal(state.backingWidth, width);
        if (width === 960) {
          await page.setViewport({ width: 720, height: 960, deviceScaleFactor: 3 });
          await page.waitForFunction(() => document.querySelector('canvas').getBoundingClientRect().width === 720, { polling: 50 });
          const portrait = await inspect();
          assert.equal(portrait.width, 720);
          assert.equal(portrait.height, 405);
          assert.ok(portrait.backingWidth <= 1920, 'high-DPI backing store remains bounded');
          await page.setViewport({ width, height: width * 9 / 16, deviceScaleFactor: 1 });
          await page.waitForFunction(() => document.querySelector('canvas').getBoundingClientRect().width === 960, { polling: 50 });
        }
        await step(2.5);
        state = await inspect();
        assert.ok(state.visible > 100);
        assert.ok(state.coverage < 0.15, 'effect never forms an opaque full-frame wash');
        assert.ok(Number(state.data.frameParticles) > 0);
        if (process.env.STREAM_EFFECTS_SHOTS && width === 1920) {
          await page.screenshot({ path: `${process.env.STREAM_EFFECTS_SHOTS}/${name}.png`, omitBackground: true });
        }
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('obsSourceVisibleChanged', { detail: { visible: false } })));
        state = await inspect();
        assert.equal(state.visible, 0);
        assert.equal(state.pending, 0);
        assert.equal(state.data.phase, 'suspended');
        await step(40);
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('obsSourceVisibleChanged', { detail: { visible: true } })));
        await step(0.1);
        assert.ok((await inspect()).visible > 0, 'resume preserves the burst, ignoring hidden wall time');
        await step(EFFECTS[name].duration);
        state = await inspect();
        assert.equal(state.visible, 0);
        assert.equal(state.data.completed, 'true');
        assert.equal(state.data.frameParticles, '0');
        assert.equal(state.pending, 0, 'once completion cancels RAF');
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('obsSourceVisibleChanged', { detail: { visible: false } })));
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('obsSourceVisibleChanged', { detail: { visible: true } })));
        await step(30);
        assert.equal((await inspect()).pending, 0, 'visibility alone does not retrigger once');
        await page.reload({ waitUntil: 'networkidle0' });
        await step(2);
        assert.ok((await inspect()).visible > 0, 'refresh retriggers once');
      }

      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await page.goto(`${origin}/obs-effect-${name}.html?intensity=99`, { waitUntil: 'networkidle0' });
      await step(2);
      let state = await inspect();
      assert.equal(state.data.reducedMotion, 'true');
      assert.equal(state.data.intensity, '1.5');
      assert.ok(Number(state.data.frameParticles) <= Math.round(Math.round(EFFECTS[name].count * 1.5) * 0.45));
      await step(EFFECTS[name].duration - 2 + 0.1);
      state = await inspect();
      assert.equal(state.visible, 0);
      assert.equal(state.data.phase, 'quiet');
      await step(EFFECTS[name].quiet - 0.2);
      assert.equal((await inspect()).visible, 0);
      await step(2);
      state = await inspect();
      assert.equal(state.data.cycle, '1');
      assert.ok(state.visible > 0);
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      assert.equal((await inspect()).pending, 0);
      assert.equal((await inspect()).visible, 0);
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: false });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await step(0.1);
      assert.equal((await inspect()).pending, 1, 'document visibility restarts only one RAF chain');
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
      assert.equal((await inspect()).pending, 0);
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
      await step(0.1);
      assert.equal((await inspect()).pending, 1, 'BFCache restore creates exactly one RAF chain');
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
      assert.equal(await page.$$eval('canvas', canvases => canvases.length), 0, 'page disposal removes its canvas');
      assert.equal(await page.evaluate(() => window.__effectClock.pending()), 0);
      await page.emulateMediaFeatures([]);
    }
    const nativePage = await browser.newPage();
    nativePage.on('pageerror', error => errors.push(error.message));
    await nativePage.goto(`${origin}/obs-effect-sparkles.html?once=1`, { waitUntil: 'networkidle0' });
    await nativePage.waitForFunction(() => Number(document.querySelector('canvas')?.dataset.frameParticles) > 0);
    await nativePage.waitForFunction(() => document.querySelector('canvas')?.dataset.completed === 'true', { timeout: 15000 });
    assert.equal(await nativePage.$eval('canvas', canvas => canvas.dataset.running), 'false', 'native RAF stops on completion');
    await nativePage.close();
    assert.deepEqual(forbiddenRequests, []);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server.close();
  }
});
