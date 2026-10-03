import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  let phase = 'scheduled';
  const writes = [], errors = [];
  const participants = [
    { id: 'p-1', category: 'art', startNumber: 1, firstName: 'Anna', lastName: 'Rossi', projectName: 'Cart A', photo: '', raceTimeMs: 12000, voteCount: 1, totalScore: 9, averageScore: 9 },
    { id: 'p-2', category: 'classic', startNumber: 2, firstName: 'Bianca', lastName: 'Rossi', projectName: 'Cart B', photo: '', raceTimeMs: 3000, voteCount: 1, totalScore: 5, averageScore: 5 },
    { id: 'p-3', category: 'art', startNumber: 3, firstName: 'Carla', lastName: 'Rossi', projectName: 'Cart C', photo: '', raceTimeMs: null, voteCount: 0, totalScore: 0, averageScore: 0 },
  ];
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/carruleddhi/')) return request.continue();
    const body = JSON.parse(request.postData() || '{}');
    if (path.endsWith('/voting')) {
      if (body.action && body.action !== 'state') writes.push(body);
      return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, phase, status: phase,
        raceStartsAt: new Date(Date.now() + (phase === 'scheduled' ? 60000 : -60000)).toISOString(), votingEndsAt: new Date(Date.now() + 3600000).toISOString(),
        durationMinutes: 60, scoreMin: 3, scoreMax: 10, participants, podium: participants, totalVotes: 2, prizes: [], editions: [], isArchive: false }) });
    }
    return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, settings: {}, rows: [], messages: [], counts: {} }) });
  });
  await page.goto(`${process.env.OBS_TEST_ORIGIN || 'http://127.0.0.1:5199'}/votazione.html?skipIntro=1&lang=pl`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.vote-card [data-race-time]', { visible: true });
  assert.equal(await page.$$eval('.vote-card', cards => cards.length), 3);
  assert.equal(await page.$$eval('.vote-card [data-race-time]', times => times.length), 2, 'untimed riders never get a fabricated zero');
  assert.equal(await page.$('.vote-card__hit'), null, 'scheduled voting remains read-only');
  assert.equal(await page.$('.vote-card__stats'), null, 'vote scores remain hidden');
  participants[0].raceTimeMs = 12345;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(() => document.querySelector('[data-participant="p-1"] [data-race-time]')?.textContent.includes('00:12.345'));
  phase = 'voting';
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForSelector('.vote-card__hit', { visible: true });
  assert.equal(await page.$$eval('.vote-card [data-race-time]', times => times.length), 2);
  assert.equal(await page.$('.vote-card__stats'), null);
  phase = 'closed';
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForSelector('[data-vote-standings] [data-race-time]', { visible: true });
  assert.equal(await page.$('.vote-card__hit'), null, 'voting controls close when voting ends');
  const standings = await page.$$eval('[data-vote-standings] tr', rows => rows.map(row => row.textContent));
  assert.ok(standings.findIndex(text => text.includes('Cart A')) < standings.findIndex(text => text.includes('Cart B')), 'audience score order is not replaced by race-time order');
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
  console.log('PASS: public times visible before voting, no early vote controls/scores, time cache refresh, phase transition enables controls, closed results keep audience scoring.');
} finally { await browser.close(); }
