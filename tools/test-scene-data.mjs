import test from 'node:test';
import assert from 'node:assert/strict';

let moduleId = 0;
const settings = (overrides = {}) => ({ ok: true, settings: {
  eventName: 'Carruleddhi Show', eventDate: '2026-10-17T14:30:00+02:00',
  eventYear: '2026', eventLocation: 'Santa Teresa Gallura', ...overrides,
} });
const rider = (id, overrides = {}) => ({
  id, firstName: 'Ada', lastName: 'Rossi', startNumber: 7, projectName: 'Cart',
  photo: 'https://example.test/photo.jpg?token=public-signed-photo',
  totalScore: 100, voteCount: 10, averageScore: 10, raceTimeMs: 12_345, ...overrides,
});
const state = (overrides = {}) => ({
  ok: true, phase: 'closed', isArchive: false,
  selectedEdition: { key: '2026', status: 'active', date: '2026-10-17' },
  participants: [rider('unranked')], podium: [rider('winner')], ...overrides,
});
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

async function harness(t, responses = []) {
  const adapter = await import(`../src/obs/scenes/event-data.ts?test=${++moduleId}`);
  let now = 0;
  let timerId = 0;
  const timers = new Map();
  const requests = [];
  const subscriptions = [];
  class Target extends EventTarget {
    listeners = new Set();
    addEventListener(type, listener) { super.addEventListener(type, listener); this.listeners.add(listener); }
    removeEventListener(type, listener) { super.removeEventListener(type, listener); this.listeners.delete(listener); }
  }
  const document = Object.assign(new Target(), { hidden: false });
  const window = new Target();
  const navigator = { onLine: true };
  const replacements = {
    document, window, navigator,
    setTimeout: (callback, delay = 0) => {
      const id = ++timerId;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout: id => timers.delete(id),
    fetch: async (url, options) => {
      requests.push({ url, ...options });
      assert.ok(['/api/carruleddhi/settings', '/api/carruleddhi/voting'].includes(url));
      assert.equal(options.method, 'POST');
      assert.equal(options.credentials, 'omit');
      assert.equal(options.cache, 'no-store');
      assert.deepEqual(options.headers, { 'Content-Type': 'application/json' });
      assert.deepEqual(JSON.parse(options.body), url.endsWith('/settings') ? {} : { action: 'state' });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      if (typeof next === 'function') return next(options);
      assert.notEqual(next, undefined, `Unexpected request: ${url}`);
      return { ok: true, json: async () => next };
    },
  };
  const original = Object.fromEntries(Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  t.mock.method(Date, 'now', () => now);
  t.after(() => {
    subscriptions.forEach(stop => stop());
    for (const [key, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const advance = async milliseconds => {
    const end = now + milliseconds;
    for (;;) {
      await flush();
      const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
    }
    now = end;
    await flush();
  };
  return {
    requests, responses, timers, document, window, navigator, advance,
    subscribe(voting = true) {
      const data = [];
      const statuses = [];
      const stop = adapter.subscribeSceneEvent(value => data.push(value), value => statuses.push(value), { voting });
      subscriptions.push(stop);
      return { data, statuses, stop, latest: () => data.at(-1) };
    },
  };
}

test('settings-only subscribers share one read and preserve metadata across unmounts', async t => {
  const h = await harness(t, [settings({ secret: 'never project', sponsors: [{ private: true }] })]);
  const a = h.subscribe(false);
  const b = h.subscribe(false);
  assert.equal(a.latest().phase, 'unknown');
  await h.advance(0);
  assert.equal(h.requests.length, 1);
  assert.deepEqual(a.latest(), { eventName: 'Carruleddhi Show', eventYear: '2026', eventLocation: 'Santa Teresa Gallura', phase: 'unknown', results: [] });
  assert.deepEqual(b.latest(), a.latest());
  assert.equal(a.statuses.at(-1).status, 'ready');
  assert.equal(h.timers.size, 0);
  a.stop(); b.stop();
  const c = h.subscribe(false);
  await h.advance(300_000);
  h.window.dispatchEvent(new Event('online'));
  await h.advance(0);
  assert.equal(h.requests.length, 1);
  assert.equal(c.latest().eventYear, '2026');
});

test('date year uses Rome timezone, rejects invalid dates and falls back only to configured year', async t => {
  const cases = [
    [{ eventDate: '2026-12-31T23:30:00Z', eventYear: '2026' }, '2027'],
    [{ eventDate: '2028-02-29', eventYear: '2026' }, '2028'],
    [{ eventDate: '2026-02-30', eventYear: '2030' }, '2030'],
    [{ eventDate: 'nonsense', eventYear: 2029 }, '2029'],
    [{ eventDate: null, eventYear: '' }, ''],
  ];
  for (const [input, expected] of cases) await t.test(JSON.stringify(input), async t => {
    const h = await harness(t, [settings(input)]);
    const s = h.subscribe(false);
    await h.advance(0);
    assert.equal(s.latest().eventYear, expected);
  });
});

test('scheduled and voting never expose scores, ranks, counts, prizes or device votes', async t => {
  for (const phase of ['scheduled', 'voting']) await t.test(phase, async t => {
    const h = await harness(t, [settings(), state({ phase, totalVotes: 900,
      podium: [rider('not-a-winner', { position: 1 })], results: [rider('also-private')],
      prizes: [{ winner: 'private' }], myVotes: [{ score: 10, email: 'private' }],
    })]);
    const s = h.subscribe();
    await h.advance(0);
    assert.equal(s.latest().phase, phase);
    assert.deepEqual(s.latest().results, []);
    assert.equal(s.latest().totalVotes, undefined);
    assert.doesNotMatch(JSON.stringify(s.latest()), /private|score|winner|position/i);
  });
});

test('closed canonical podium order and explicit tied positions survive without client ranking', async t => {
  const h = await harness(t, [settings(), state({
    podium: [rider('b', { totalScore: 90, position: 1, email: 'private', registrationId: 'secret' }), rider('a', { totalScore: 100, position: 1 }), rider('c', { raceTimeMs: null })],
    participants: [rider('a'), rider('b'), rider('c'), rider('not-on-podium')],
    totalVotes: 38,
  })]);
  const s = h.subscribe();
  await h.advance(0);
  assert.equal(s.latest().phase, 'closed');
  assert.deepEqual(s.latest().results.map(row => row.id), ['b', 'a', 'c']);
  assert.deepEqual(s.latest().results.map(row => row.position), [1, 1, undefined]);
  assert.equal(s.latest().totalVotes, 38);
  assert.equal(s.latest().results[2].raceTimeMs, null);
  assert.deepEqual(Object.keys(s.latest().results[0]), ['id', 'firstName', 'lastName', 'startNumber', 'projectName', 'photo', 'totalScore', 'raceTimeMs', 'position']);
  assert.doesNotMatch(JSON.stringify(s.latest()), /private|registrationId|voteCount|averageScore/);
});

test('ordered results payload is accepted; an empty podium is authoritative over participants/results', async t => {
  const h = await harness(t, [settings(), state({ podium: undefined, results: [rider('a'), rider('b')] }), state({ podium: [], results: [rider('fake')] })]);
  const s = h.subscribe();
  await h.advance(0);
  assert.deepEqual(s.latest().results.map(row => row.id), ['a', 'b']);
  assert.equal(s.latest().totalVotes, undefined, 'never sum the top-three vote counts');
  await h.advance(30_000);
  assert.deepEqual(s.latest().results, []);
  assert.equal(s.latest().phase, 'closed');
  assert.equal(s.statuses.at(-1).status, 'ready');
});

test('historical editions are never selected from archives or the editions listing', async t => {
  for (const override of [
    { isArchive: true },
    { selectedEdition: { key: '2025', status: 'archived' } },
    { selectedEdition: { key: '2025', status: 'active' } },
  ]) await t.test(JSON.stringify(override), async t => {
    const h = await harness(t, [settings(), state(override)]);
    const s = h.subscribe();
    await h.advance(0);
    assert.equal(s.latest().phase, 'unknown');
    assert.deepEqual(s.latest().results, []);
    assert.equal(s.statuses.at(-1).status, 'error');
  });
  await t.test('old editions listing ignored for an explicitly current response', async t => {
    const h = await harness(t, [settings(), state({ editions: [{ key: '2025', status: 'archived', results: [rider('old')] }] })]);
    const s = h.subscribe();
    await h.advance(0);
    assert.deepEqual(s.latest().results.map(row => row.id), ['winner']);
  });
});

test('invalid responses fail closed without coercion or invented results', async t => {
  const invalid = [
    null, [], {}, { ok: false }, state({ phase: 'CLOSED' }), state({ phase: null }),
    state({ podium: undefined }), state({ podium: {} }), state({ podium: [rider('a', { totalScore: '10' })] }),
    state({ podium: [rider('a', { totalScore: -1 })] }), state({ podium: [rider('a', { totalScore: Infinity })] }),
    state({ podium: [rider('a', { startNumber: 0 })] }), state({ podium: [rider('a', { raceTimeMs: -1 })] }),
    state({ podium: [rider('a', { position: 0 })] }), state({ podium: [rider('a'), rider('a')] }),
    state({ podium: [rider('', {})] }), state({ podium: [rider('a', { firstName: {} })] }), state({ totalVotes: '20' }),
  ];
  for (const [index, input] of invalid.entries()) await t.test(String(index), async t => {
    const h = await harness(t, [settings(), input]);
    const s = h.subscribe();
    await h.advance(0);
    assert.equal(s.latest().phase, 'unknown');
    assert.deepEqual(s.latest().results, []);
    assert.equal(s.statuses.at(-1).status, 'error');
  });
});

test('photos permit public HTTP(S)/relative URLs but strip unsafe schemes and credentials', async t => {
  for (const url of ['javascript:alert(1)', 'data:image/svg+xml,script', '//evil.test/x', '/\\evil.test/x', 'https://user:password@example.test/x']) await t.test(url, async t => {
    const h = await harness(t, [settings(), state({ podium: [rider('a', { photo: url })] })]);
    const s = h.subscribe();
    await h.advance(0);
    assert.equal(s.latest().results[0].photo, '');
  });
});

test('first network failure remains unknown and later failures retain only last validated data', async t => {
  const h = await harness(t, [settings(), new Error('private diagnostic'), state(), new Error('private diagnostic'), state({ phase: 'voting' })]);
  const s = h.subscribe();
  await h.advance(0);
  assert.equal(s.latest().phase, 'unknown');
  assert.equal(s.latest().eventName, 'Carruleddhi Show');
  assert.equal(s.statuses.at(-1).status, 'error');
  assert.doesNotMatch(s.statuses.at(-1).message, /private diagnostic/);
  await h.advance(30_000);
  const valid = structuredClone(s.latest());
  await h.advance(30_000);
  assert.deepEqual(s.latest(), valid);
  assert.equal(s.statuses.at(-1).status, 'error');
  await h.advance(30_000);
  assert.equal(s.latest().phase, 'voting');
  assert.deepEqual(s.latest().results, []);
  assert.equal(s.statuses.at(-1).status, 'ready');
});

test('failed metadata retries independently and is never replaced by empty or error payloads', async t => {
  const h = await harness(t, [{ ok: true, settings: {} }, state({ phase: 'scheduled' }), settings(), state({ phase: 'voting' })]);
  const s = h.subscribe();
  await h.advance(0);
  assert.equal(s.latest().eventName, '');
  assert.equal(s.statuses.at(-1).status, 'error');
  await h.advance(30_000);
  assert.equal(s.latest().eventName, 'Carruleddhi Show');
  assert.equal(s.latest().phase, 'voting');
  assert.equal(s.statuses.at(-1).status, 'ready');
});

test('closed scores wait for metadata validation, and an edition mismatch stays hidden', async t => {
  const h = await harness(t, [new Error('offline'), state({ selectedEdition: { key: '2025', status: 'active' } }), settings(), state()]);
  const s = h.subscribe();
  await h.advance(0);
  assert.equal(s.latest().phase, 'unknown');
  assert.deepEqual(s.latest().results, []);
  await h.advance(30_000);
  assert.equal(s.latest().eventYear, '2026');
  assert.equal(s.latest().phase, 'closed');
  assert.ok(s.data.filter(value => value.phase === 'closed').every(value => value.eventYear === '2026'));
  const metadataArrival = s.data.find(value => value.eventYear === '2026');
  assert.equal(metadataArrival.phase, 'unknown', 'previous mismatched results must not flash during metadata arrival');
  assert.deepEqual(metadataArrival.results, []);
});

test('polling is shared, 30-second, visible-only and resumes once without reading settings again', async t => {
  const h = await harness(t, [settings(), state(), state({ phase: 'voting' }), state({ phase: 'closed' }), state()]);
  const a = h.subscribe();
  const b = h.subscribe();
  await h.advance(0);
  assert.equal(h.requests.length, 2);
  assert.equal(h.timers.size, 1);
  await h.advance(29_999);
  assert.equal(h.requests.length, 2);
  await h.advance(1);
  assert.equal(h.requests.length, 3);
  assert.equal(a.latest().phase, 'voting');
  assert.deepEqual(a.latest(), b.latest());
  h.document.hidden = true;
  h.document.dispatchEvent(new Event('visibilitychange'));
  await h.advance(300_000);
  assert.equal(h.requests.length, 3);
  assert.equal(h.timers.size, 0);
  h.document.hidden = false;
  h.document.dispatchEvent(new Event('visibilitychange'));
  h.window.dispatchEvent(new Event('online'));
  await h.advance(0);
  assert.equal(h.requests.length, 4, 'simultaneous resume signals do not overlap requests');
  h.window.dispatchEvent(new Event('online'));
  await h.advance(0);
  assert.equal(h.requests.length, 5);
  a.stop(); b.stop();
  await h.advance(300_000);
  assert.equal(h.requests.length, 5);
  assert.equal(h.timers.size, 0);
  assert.equal(h.window.listeners.size, 0);
  assert.equal(h.document.listeners.size, 0);
});

test('initial hidden and offline pages make no requests until both visible and online', async t => {
  const h = await harness(t, [settings(), state()]);
  h.document.hidden = true;
  h.navigator.onLine = false;
  h.subscribe();
  await h.advance(60_000);
  assert.equal(h.requests.length, 0);
  h.document.hidden = false;
  h.document.dispatchEvent(new Event('visibilitychange'));
  await h.advance(0);
  assert.equal(h.requests.length, 0);
  h.navigator.onLine = true;
  h.window.dispatchEvent(new Event('online'));
  await h.advance(0);
  assert.equal(h.requests.length, 2);
});

test('repeated failures back off rather than making thirty-second retry storms', async t => {
  const h = await harness(t, [settings(), new Error(), new Error(), new Error(), state()]);
  const s = h.subscribe();
  await h.advance(0);
  await h.advance(30_000);
  assert.equal(h.requests.length, 3);
  await h.advance(59_999);
  assert.equal(h.requests.length, 3);
  await h.advance(1);
  assert.equal(h.requests.length, 4);
  await h.advance(119_999);
  assert.equal(h.requests.length, 4);
  await h.advance(1);
  assert.equal(h.requests.length, 5);
  assert.equal(s.statuses.at(-1).status, 'ready');
});

test('slow requests never overlap, timeout aborts them, and cleanup ignores late responses', async t => {
  let resolve;
  const h = await harness(t, [settings(), options => new Promise((accept, reject) => {
    resolve = accept;
    options.signal.addEventListener('abort', () => reject(new Error('aborted')));
  }), state()]);
  const s = h.subscribe();
  await h.advance(0);
  h.window.dispatchEvent(new Event('online'));
  h.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(h.requests.length, 2);
  await h.advance(15_000);
  assert.equal(h.requests[1].signal.aborted, true);
  assert.equal(s.statuses.at(-1).status, 'error');
  assert.equal(s.latest().phase, 'unknown');
  await h.advance(30_000);
  assert.equal(s.latest().phase, 'closed');
  s.stop(); s.stop();
  const count = s.data.length;
  resolve({ ok: true, json: async () => state({ phase: 'voting' }) });
  await h.advance(60_000);
  assert.equal(s.data.length, count);
  assert.equal(h.timers.size, 0);
});

test('cleanup aborts pending fetch and remount rejects its stale response', async t => {
  let resolveOld;
  const h = await harness(t, [() => new Promise(resolve => { resolveOld = resolve; }), settings({ eventName: 'New' }), state()]);
  const a = h.subscribe();
  await h.advance(0);
  a.stop();
  assert.equal(h.requests[0].signal.aborted, true);
  assert.equal(h.timers.size, 0, 'cleanup clears the request timeout even if fetch ignores abort');
  const aCount = a.data.length;
  const b = h.subscribe();
  await h.advance(0);
  assert.equal(b.latest().eventName, 'New');
  resolveOld({ ok: true, json: async () => settings({ eventName: 'Old' }) });
  await h.advance(0);
  assert.equal(a.data.length, aCount);
  assert.equal(b.latest().eventName, 'New');
});

test('removing the last voting subscriber stops polling without dropping settings subscribers', async t => {
  const h = await harness(t, [settings(), state(), state({ phase: 'voting' })]);
  const metadata = h.subscribe(false);
  const results = h.subscribe();
  await h.advance(0);
  results.latest().results[0].firstName = 'Consumer mutation';
  const another = h.subscribe();
  assert.equal(another.latest().results[0].firstName, 'Ada', 'consumers cannot mutate shared cached results');
  results.stop(); another.stop();
  await h.advance(300_000);
  assert.equal(h.requests.length, 2);
  assert.equal(h.timers.size, 0);
  assert.equal(metadata.latest().phase, 'unknown');
  assert.deepEqual(metadata.latest().results, []);
  const resumed = h.subscribe();
  await h.advance(0);
  assert.equal(h.requests.length, 3);
  assert.equal(resumed.latest().phase, 'voting');
});
