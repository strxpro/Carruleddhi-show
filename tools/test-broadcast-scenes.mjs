import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { SCENES, CAMERA, VOTE_URL } from '../src/obs/scenes/presets.ts';

const origin = process.env.OBS_TEST_ORIGIN || 'http://127.0.0.1:5199';
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [], calls = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 1920, height: 1080 });
  let phase = 'voting';
  const podium = ['Alessia', 'Bruno', 'Carla'].map((firstName, index) => ({ id: `person-${index}`, firstName, lastName: 'Rossi',
    startNumber: index + 1, projectName: 'Carruleddhu', photo: '', totalScore: 100 - index * 10, raceTimeMs: 23456 + index * 1000, position: index + 1 }));
  const broadcast = { id: 'main', revision: 1, participant: null, participant_visible: false, sponsors_enabled: true, sponsors: [], updated_at: new Date().toISOString() };
  await page.setRequestInterception(true);
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/')) return request.continue();
    calls.push(path);
    let data;
    if (path.endsWith('/broadcast')) data = { ok: true, state: broadcast, realtime: { url: '', anonKey: null } };
    else if (path.endsWith('/settings')) data = { ok: true, settings: { eventName: 'Carruleddhi Show', eventLocation: 'Santa Teresa Gallura', eventDate: '2026-09-20T12:00:00+02:00' } };
    else if (path.endsWith('/voting')) data = { ok: true, phase, isArchive: false, selectedEdition: { status: 'active', key: '2026' }, podium, totalVotes: 100 };
    else return request.respond({ status: 404, body: '{}' });
    return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  const open = async path => {
    await page.goto(`${origin}${path}`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.scene-poster')).opacity === '1');
  };
  const pixels = async () => sharp(await page.screenshot({ omitBackground: true })).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = (image, x, y) => image.data[(y * image.info.width + x) * 4 + 3];

  for (const id of Object.keys(SCENES)) {
    await open(`/obs/${id}`);
    await page.waitForSelector('.obs-sponsor-slot');
    const geometry = await page.evaluate(() => {
      const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
      const content = document.querySelector('.scene-poster-content');
      return { camera: rect('[data-camera-window]'), qr: rect('[data-vote-qr]'), sponsor: rect('.obs-sponsors'), poster: rect('.scene-poster'),
        fits: content.scrollHeight <= content.clientHeight + 1, headingFits: [...document.querySelectorAll('.scene-title span')].every(el => el.scrollWidth <= el.clientWidth + 1) };
    });
    assert.deepEqual(geometry.camera, { x: CAMERA.x, y: CAMERA.y, width: CAMERA.width, height: CAMERA.height, right: 1824, bottom: 800 });
    assert.ok(geometry.poster.right < geometry.camera.x);
    assert.ok(geometry.qr.y >= geometry.camera.bottom && geometry.qr.x > geometry.sponsor.right);
    assert.ok(geometry.sponsor.bottom <= 1026 && geometry.qr.bottom <= 1026);
    assert.ok(geometry.fits && geometry.headingFits, `${id}: panel text must fit without clipping ${JSON.stringify(geometry)}`);
    assert.equal(await page.$eval('body', element => getComputedStyle(element).backgroundColor), 'rgba(0, 0, 0, 0)');
    if (id === 'results') assert.equal(await page.$('.scene-result'), null, 'scores supplied early by an API must not leak before closure');
  }

  await open('/obs/break');
  const image = await pixels();
  assert.equal(alpha(image, 1184, 440), 0, 'camera center is truly transparent');
  assert.equal(alpha(image, 10, 10), 0, 'background is transparent by default');
  assert.ok(alpha(image, 120, 400) > 250, 'brand panel provides readable contrast');
  const qrElement = await page.$('[data-vote-qr]');
  const qrImage = await sharp(await qrElement.screenshot()).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const decoded = jsQR(new Uint8ClampedArray(qrImage.data), qrImage.info.width, qrImage.info.height);
  assert.equal(decoded?.data, VOTE_URL, 'real rendered QR decodes to the public voting page');
  const firstCue = await page.$eval('.scene-vote-cue strong', el => el.textContent);
  await page.waitForFunction(text => document.querySelector('.scene-vote-cue strong')?.textContent !== text, { timeout: 15000 }, firstCue);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.scene-vote-cue > div')).opacity === '1');
  await page.evaluate(async () => {
    const asset = new Image(); asset.src = '/assets/images/zjazd.webp'; await asset.decode();
    const image = document.createElement('div');
    image.style.cssText = 'position:absolute;left:544px;top:80px;width:1280px;height:720px;background:url(/assets/images/zjazd.webp) center/cover;z-index:-1';
    document.querySelector('.broadcast-scene').prepend(image);
  });
  await page.screenshot({ path: 'shots/scene-break-camera.png' });

  await open('/obs/break?background=solid');
  const solid = await pixels();
  assert.equal(alpha(solid, 1184, 440), 0, 'solid frame still leaves the camera opening transparent');
  assert.equal(alpha(solid, 10, 10), 255);
  await open('/obs/ending?background=solid&camera=0&qr=0&sponsors=0');
  assert.equal(await page.$('[data-camera-window]'), null);
  assert.equal(await page.$('[data-vote-qr]'), null);
  assert.equal(await page.$('.obs-sponsors'), null);
  assert.equal(alpha(await pixels(), 1184, 440), 255, 'no-camera solid variant is a complete holding background');

  for (const id of Object.keys(SCENES)) {
    await open(`/obs/${id}?lang=pl&sponsors=0`);
    assert.ok(await page.$eval('.scene-poster-content', el => el.scrollHeight <= el.clientHeight + 1), `Polish ${id} must fit`);
    assert.ok(await page.$$eval('.scene-title span', els => els.every(el => el.scrollWidth <= el.clientWidth + 1)), `Polish ${id} title must fit`);
  }
  phase = 'closed';
  await open('/obs/results');
  await page.waitForSelector('.scene-result');
  assert.deepEqual(await page.$$eval('.scene-result strong', els => els.map(el => el.textContent)), ['Alessia Rossi', 'Bruno Rossi', 'Carla Rossi']);
  assert.match(await page.$eval('.scene-result-points', el => el.textContent), /100 PUNTI.*00:23.456/);
  await page.screenshot({ path: 'shots/scene-results.png', omitBackground: true });
  for (const result of podium) {
    result.firstName = 'Alessandro Giovanni Maria Antonio '.repeat(3).slice(0, 80);
    result.lastName = 'Della Valle Di Monte San Giovanni '.repeat(3).slice(0, 80);
  }
  await open('/obs/results');
  await page.waitForSelector('.scene-poster-compact');
  assert.ok(await page.$eval('.scene-poster-content', el => el.scrollHeight <= el.clientHeight + 1), 'long public names stay within the results panel');
  await open('/obs/voting');
  await page.waitForSelector('[data-vote-phase="closed"]');
  assert.match(await page.$eval('.scene-title', el => el.textContent), /GRAZIE/);
  await page.setViewport({ width: 960, height: 540 });
  await page.waitForFunction(() => Math.abs(document.querySelector('[data-camera-window]').getBoundingClientRect().width - 640) < .1);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, checks: ['7 scene routes', 'Italian/Polish layout', '1280x720 camera opening', 'no overlaps', 'true alpha transparency', 'decoded voting QR', 'periodic CTA motion', 'solid/transparent controls', 'optional camera/QR/sponsors', 'no premature scores', 'real ranking order and time', 'closed voting labels', '960x540 scale'], requests: calls.length }, null, 2));
} finally { await browser.close(); }
