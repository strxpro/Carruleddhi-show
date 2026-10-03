import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { countdownDisplay, parseShowOptions, safeMusicUrl, ShowSequenceController } from '../src/obs/scenes/show-sequence.ts';

function fixture({ mode = 'starting', search = '?countdown=12&auto=1', scene = 'STARTING', level = 4, native = true, storage = new Map(), deferred = false } = {}) {
  const events = new EventTarget();
  const calls = [];
  const queue = [];
  let mono = 0;
  let wall = 1800000000000;
  const bridge = {
    getControlLevel: callback => callback(level),
    getCurrentScene: callback => deferred ? queue.push(() => callback({ name: scene })) : callback({ name: scene }),
    getScenes: callback => callback(['STARTING', 'INTRO', 'LIVE']),
    setCurrentScene: name => calls.push(name),
    startStreaming: () => assert.fail('must never stream'), stopStreaming: () => assert.fail('must never stop stream'),
    startRecording: () => assert.fail('must never record'), stopRecording: () => assert.fail('must never stop recording'),
  };
  const environment = { bridge: native ? bridge : undefined, events,
    storage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    monotonic: () => mono, wall: () => wall,
  };
  const options = parseShowOptions(search, 'https://show.example.org');
  const make = () => new ShowSequenceController(mode, options, environment, () => {});
  const controller = make(); controller.start();
  return { controller, make, calls, storage, bridge,
    step: seconds => { mono += seconds * 1000; wall += seconds * 1000; controller.tick(); },
    clockJump: seconds => { wall += seconds * 1000; },
    level: value => { level = value; },
    flush: () => { const pending = queue.splice(0); pending.forEach(callback => callback()); },
    event: (name, detail) => { if (name === 'obsSceneChanged') scene = detail.name; events.dispatchEvent(new CustomEvent(name, { detail })); },
  };
}

test('query bounds, scene names, audio opt-in and safe public HTTPS music', () => {
  const defaults = parseShowOptions('', 'https://show.example.org');
  assert.equal(defaults.countdown, 300); assert.equal(defaults.auto, false); assert.equal(defaults.sound, false); assert.equal(defaults.volume, 0.7);
  assert.equal(parseShowOptions('?countdown=0&volume=-1', 'https://show.example.org').countdown, 1);
  assert.equal(parseShowOptions('?countdown=9999&volume=4', 'https://show.example.org').countdown, 3600);
  assert.equal(parseShowOptions('?countdown=no&volume=no&startingScene=%20', 'https://show.example.org').volume, 0.7);
  assert.equal(parseShowOptions(`?startingScene=${'a'.repeat(65)}`, 'https://show.example.org').startingScene, 'STARTING');
  for (const url of ['javascript:alert(1)', 'data:audio/a', 'file:///music.mp3', 'https://u:p@example.org/a', 'http://example.org/a', 'https://localhost/a', 'https://a.local/a', 'https://127.0.0.1/a', 'https://2130706433/a', 'https://[::1]/a', 'https://10.0.0.1/a', 'https://example.org:8443/a']) {
    assert.equal(safeMusicUrl(url, 'https://show.example.org'), undefined, url);
  }
  assert.equal(safeMusicUrl('/music.mp3', 'https://show.example.org'), 'https://show.example.org/music.mp3');
  assert.equal(safeMusicUrl('https://cdn.example.org/music.mp3', 'https://show.example.org'), 'https://cdn.example.org/music.mp3');
  assert.equal(parseShowOptions('?sound=1&music=http://bad.example.org/a.mp3', 'https://show.example.org').sound, false, 'invalid custom music must not unexpectedly play embedded audio instead');
});

test('countdown has smooth bounded last-ten growth and exactly one INTRO at zero', () => {
  assert.equal(countdownDisplay(10.01, 300).urgent, false);
  assert.equal(countdownDisplay(10, 300).text, '10');
  assert.equal(countdownDisplay(61, 300).text, '1:01');
  assert.ok(countdownDisplay(0.5, 300).scale > countdownDisplay(9, 300).scale);
  assert.ok(countdownDisplay(0, 300).scale <= 1.22);
  const f = fixture(); f.step(2); assert.equal(f.controller.snapshot.remaining, 10);
  f.step(9); assert.deepEqual(f.calls, []); f.step(1); f.step(10); f.controller.ended();
  assert.deepEqual(f.calls, ['INTRO']);
});

test('INTRO advances once only on ended, never duration or an error', () => {
  const f = fixture({ mode: 'intro', scene: 'INTRO' });
  f.step(500); f.controller.setIntroTime(300); assert.deepEqual(f.calls, []);
  f.controller.ended(); f.controller.ended(); assert.deepEqual(f.calls, ['LIVE']);
  const failed = fixture({ mode: 'intro', scene: 'INTRO' });
  failed.controller.mediaError(); failed.controller.ended(); assert.deepEqual(failed.calls, []);
  const starting = fixture(); starting.controller.mediaError(); starting.step(30); assert.deepEqual(starting.calls, []);
  const noMedia = fixture({ mode: 'intro', scene: 'INTRO', search: '?auto=1&media=0' });
  noMedia.controller.ended(); assert.deepEqual(noMedia.calls, []);
});

test('preloaded sources wait for positive scene; hidden sources pause and resume', () => {
  const f = fixture({ deferred: true }); f.step(30);
  assert.equal(f.controller.snapshot.active, false); assert.equal(f.controller.snapshot.remaining, 12);
  f.event('obsSourceVisibleChanged', { visible: false }); f.flush(); f.step(30);
  assert.equal(f.controller.snapshot.active, false);
  f.event('obsSourceVisibleChanged', { visible: true }); f.step(2);
  assert.equal(f.controller.snapshot.remaining, 10);
  f.event('obsSourceActiveChanged', { active: false }); f.step(20); assert.equal(f.controller.snapshot.remaining, 10);
  f.event('obsSourceActiveChanged', { active: true }); f.step(1); assert.equal(f.controller.snapshot.remaining, 9);
  assert.deepEqual(f.calls, []);
  f.event('obsSourceActiveChanged', { active: false }); f.controller.dispose(); f.clockJump(120);
  const reload = f.make(); reload.start(); f.flush(); assert.equal(reload.snapshot.remaining, 9);
});

test('permissions, opt-out, wrong scene and plain preview cannot mutate OBS', () => {
  for (const options of [{ level: 0 }, { level: 1 }, { level: 2 }, { level: 3 }, { search: '?countdown=1' }, { scene: 'LIVE' }, { native: false }]) {
    const f = fixture(options); f.step(1000); f.controller.ended(); assert.deepEqual(f.calls, []);
  }
  const f = fixture(); f.level(3); f.step(12); assert.deepEqual(f.calls, []);
  const missing = fixture(); missing.bridge.getScenes = callback => callback(['STARTING']); missing.step(12); assert.deepEqual(missing.calls, []);
  const optional = fixture(); delete optional.bridge.getScenes; optional.step(12); assert.deepEqual(optional.calls, ['INTRO']);
});

test('operator scene leave clears continuity and invalidates pending callbacks', () => {
  const f = fixture(); f.step(5); assert.ok(f.storage.size);
  f.event('obsSceneChanged', { name: 'LIVE' }); f.step(100); assert.deepEqual(f.calls, []); assert.equal(f.storage.size, 0);
  f.event('obsSceneChanged', { name: 'STARTING' }); assert.equal(f.controller.snapshot.remaining, 12);
  const async = fixture({ deferred: true }); async.flush(); async.step(12);
  async.event('obsSceneChanged', { name: 'LIVE' }); async.flush(); assert.deepEqual(async.calls, []);
  const disposed = fixture({ deferred: true }); disposed.flush(); disposed.step(12); disposed.controller.dispose(); disposed.flush(); assert.deepEqual(disposed.calls, []);
});

test('refresh preserves deadline, clamps backward wall jumps and never repeats a command', () => {
  const f = fixture(); f.step(5); f.controller.dispose(); f.clockJump(2);
  const refreshed = f.make(); refreshed.start(); assert.equal(refreshed.snapshot.remaining, 5); refreshed.dispose();
  f.clockJump(-500); const backwards = f.make(); backwards.start(); assert.equal(backwards.snapshot.remaining, 5); backwards.dispose();
  const complete = fixture(); complete.step(12); complete.controller.dispose();
  const reload = complete.make(); reload.start(); reload.tick(); assert.deepEqual(complete.calls, ['INTRO']);
  const intro = fixture({ mode: 'intro', scene: 'INTRO' }); intro.controller.setIntroTime(4.25); intro.controller.dispose();
  const introReload = intro.make(); introReload.start(); assert.equal(introReload.snapshot.introTime, 4.25);
  const inactiveReload = fixture({ storage: f.storage, scene: 'LIVE' });
  assert.equal(inactiveReload.storage.size, 0);
  inactiveReload.event('obsSceneChanged', { name: 'STARTING' }); assert.equal(inactiveReload.controller.snapshot.remaining, 12);
});

test('Chromium component: transparent contain video, native lifecycle, audio and real ended guard', { timeout: 120000 }, async () => {
  const { createServer } = await import('vite');
  const { default: puppeteer } = await import('puppeteer');
  const server = await createServer({ configFile: false, envFile: false,
    root: fileURLToPath(new URL('../', import.meta.url)), optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'] },
    server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error',
    plugins: [{ name: 'show-test-harness', configureServer(vite) {
      vite.middlewares.use('/__show-test', async (_request, response) => {
        response.setHeader('Content-Type', 'text/html');
        response.end(await vite.transformIndexHtml('/__show-test', `<!doctype html><html><body style="margin:0;background:transparent"><div id="root" style="position:relative;width:1920px;height:1080px"></div><script type="module">
          import React from 'react';
          import {createRoot} from 'react-dom/client';
          import {ShowSequence} from '/src/obs/scenes/ShowSequence.tsx';
          window.__root=createRoot(document.getElementById('root'));
          window.__root.render(React.createElement(React.StrictMode,null,React.createElement(ShowSequence,{mode:new URLSearchParams(location.search).get('mode')||'starting',language:'it',guides:true})));
        </script></body></html>`));
      });
    } }],
  });
  let browser;
  try {
    await server.listen();
    const origin = server.resolvedUrls.local[0].replace(/\/$/, '');
    const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME_PATH || (existsSync(chrome) ? chrome : undefined), args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    const apiRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
      if (request.url().startsWith(origin)) void request.continue();
      else void request.abort();
    });
    await page.evaluateOnNewDocument(() => {
      const query = new URLSearchParams(location.search);
      let now = 0; let id = 0; const frames = new Map();
      Object.defineProperty(performance, 'now', { value: () => now });
      window.requestAnimationFrame = callback => { frames.set(++id, callback); return id; };
      window.cancelAnimationFrame = value => frames.delete(value);
      window.__step = seconds => { now += seconds * 1000; const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(now)); };
      window.__calls = []; window.__scene = query.get('scene') || 'STARTING';
      if (!query.has('preview')) window.obsstudio = {
        getControlLevel: callback => callback(4), getCurrentScene: callback => callback({ name: window.__scene }),
        getScenes: callback => callback(['STARTING', 'INTRO', 'LIVE']), setCurrentScene: name => window.__calls.push(name),
      };
      const prototype = HTMLMediaElement.prototype;
      Object.defineProperties(prototype, {
        duration: { get() { return 4; } }, currentTime: { get() { return this.__time || 0; }, set(value) { this.__time = value; } },
        paused: { get() { return this.__paused !== false; } }, ended: { get() { return this.__ended === true; } },
        readyState: { get() { return 1; } }, error: { get() { return null; } },
      });
      prototype.play = function () { this.__paused = false; return Promise.resolve(); };
      prototype.pause = function () { this.__paused = true; };
      // Native decoding is intentionally replaced; manual ended/error events test the component handlers.
      for (const name of ['error', 'ended', 'loadedmetadata']) document.addEventListener(name, event => {
        if (event.isTrusted && event.target instanceof HTMLMediaElement) event.stopImmediatePropagation();
      }, true);
    });
    const load = async query => {
      await page.goto(`${origin}/__show-test?${query}`);
      try { await page.waitForSelector('.show-sequence', { timeout: 10000 }); }
      catch (error) { assert.deepEqual(errors, []); throw error; }
    };
    const step = async seconds => { await page.evaluate(value => window.__step(value), seconds); };
    const inspect = () => page.evaluate(() => { const v = document.querySelector('video'); return {
      calls: window.__calls, paused: v.paused, muted: v.muted, volume: v.volume, loop: v.loop,
      fit: getComputedStyle(v).objectFit, background: getComputedStyle(v).backgroundColor,
      number: document.querySelector('.show-countdown-number')?.textContent,
      status: document.querySelector('.show-sequence').dataset.sequenceStatus,
    }; });
    await load('countdown=12&auto=1&sound=1'); await step(1.2);
    let state = await inspect(); assert.equal(state.fit, 'contain'); assert.equal(state.background, 'rgba(0, 0, 0, 0)'); assert.equal(state.loop, true);
    assert.equal(state.paused, false); assert.equal(state.muted, false); assert.ok(Math.abs(state.volume - 0.7) < 0.001);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('obsSourceActiveChanged', { detail: { active: false } })));
    await step(30); state = await inspect(); assert.equal(state.paused, true); assert.equal(state.muted, true); assert.deepEqual(state.calls, []);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('obsSourceActiveChanged', { detail: { active: true } })));
    await step(10.3); state = await inspect(); assert.ok(state.volume < 0.7); await step(0.5); await step(5);
    assert.deepEqual((await inspect()).calls, ['INTRO']);
    await load('mode=intro&scene=INTRO&auto=1&sound=1'); await step(30);
    assert.deepEqual((await inspect()).calls, []);
    await page.evaluate(() => document.querySelector('video').dispatchEvent(new Event('ended')));
    assert.deepEqual((await inspect()).calls, [], 'event without actual ended flag is not completion');
    await page.evaluate(() => { const v = document.querySelector('video'); v.__ended = true; v.dispatchEvent(new Event('ended')); v.dispatchEvent(new Event('ended')); });
    assert.deepEqual((await inspect()).calls, ['LIVE']);
    await page.evaluate(() => sessionStorage.clear());
    await load('mode=intro&scene=INTRO&auto=1&sound=1&introScene=INTRO&liveScene=LIVE');
    await page.evaluate(() => { const v = document.querySelector('video'); v.dispatchEvent(new Event('error')); v.__ended = true; v.dispatchEvent(new Event('ended')); });
    assert.deepEqual((await inspect()).calls, []);
    await load('preview=1&countdown=1&auto=1&sound=1'); await step(1);
    state = await inspect(); assert.equal(state.muted, true); assert.deepEqual(state.calls, []);
    await load('countdown=30&sound=1&music=https%3A%2F%2Fcdn.example.org%2Fmusic.mp3'); await step(1.2);
    assert.deepEqual(await page.evaluate(() => [document.querySelector('video').muted, document.querySelector('audio').muted]), [true, false]);
    await page.evaluate(() => { window.__media = [...document.querySelectorAll('video,audio')]; window.__root.unmount(); });
    assert.equal(await page.evaluate(() => window.__media.every(item => item.paused && item.muted && item.volume === 0)), true);
    await load('mode=intro&scene=INTRO&auto=1&media=0'); await step(60);
    assert.deepEqual(await page.evaluate(() => [document.querySelectorAll('video,audio').length, window.__calls.length]), [0, 0]);
    await page.evaluate(() => sessionStorage.clear());
    await load('countdown=12&media=0'); await step(2);
    assert.equal(await page.$eval('.show-countdown-number', element => element.textContent), '10');
    assert.deepEqual(errors, []);
    assert.deepEqual(apiRequests, []);
  } finally { await browser?.close(); await server.close(); }
});
