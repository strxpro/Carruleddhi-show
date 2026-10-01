import test from 'node:test';
import assert from 'node:assert/strict';
import middleware from '../middleware.js';

test('OBS bypasses construction gate without opening admin or unrelated pages', async () => {
  const previousPassword = process.env.SITE_PASSWORD;
  const previousUrl = process.env.SUPABASE_URL;
  process.env.SITE_PASSWORD = 'test-construction-password';
  delete process.env.SUPABASE_URL;
  try {
    for (const module of ['overlay', 'participant', 'sponsors']) {
      for (const path of [`/obs/${module}`, `/obs/${module}?diagnostics=1`, `/obs/${module}/`, `/obs-${module}`, `/obs-${module}.html`]) {
        assert.equal(await middleware(new Request(`https://example.test${path}`)), undefined, path);
      }
    }
    for (const path of ['/admin', '/admin.html', '/', '/obs/overlay/secret', '/obs-overlay-secret', '/obs/participant/secret', '/obs-sponsors-secret']) {
      assert.equal((await middleware(new Request(`https://example.test${path}`))).status, 401, path);
    }
  } finally {
    if (previousPassword === undefined) delete process.env.SITE_PASSWORD; else process.env.SITE_PASSWORD = previousPassword;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
  }
});
