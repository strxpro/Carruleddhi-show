/**
 * Password gate for the whole site, while it is being built.
 *
 * Vercel Edge Middleware. Runs before anything is served, so a stranger who finds
 * the URL sees a "we are working on it" card and nothing else — not the hero, not
 * the admin panel, not a half-finished gallery.
 *
 * WHAT IS AND IS NOT PROTECTED
 *   Everything except /api/carruleddhi/*. The API is excluded on purpose: the site's
 *   own fetches use `credentials: 'omit'` (see postJSON in assets/js/app.js), so the
 *   gate cookie is never sent with them and gating that path would break every form
 *   for the very people who got past the gate. The API defends itself instead —
 *   field whitelisting, rate limiting, and a passphrase on the routes that read
 *   participant data.
 *
 * WHAT THE COOKIE HOLDS
 *   A SHA-256 of the password, not the password. Somebody reading the cookie jar on
 *   a shared laptop learns nothing reusable. HttpOnly so scripts cannot read it,
 *   Secure so it never travels in clear, SameSite=Lax so it survives a normal link.
 *
 * TURNING IT OFF
 *   Delete the SITE_PASSWORD environment variable in Vercel. With no password set
 *   the gate lets everyone through, which is what you want on the day the site goes
 *   public — no code change, no redeploy of anything but the variable.
 */

/**
 * WHAT IS EXCLUDED, AND WHY IT IS DECIDED IN CODE
 *
 * There is deliberately no `export const config = { matcher: [...] }` here. Vercel
 * reads that export with a static analyser before the build is deployed, and it is
 * the most likely source of `Error: Unhandled type: "ColonToken"` — a failure that
 * happened *after* a green Vite build, so the deployment never went live and every
 * change looked like it had simply been ignored. A plain list of prefixes checked
 * inside the function cannot be mis-parsed, and costs one string comparison.
 *
 * `/emails/` is the exclusion that was missing and it cost a working scenario: the
 * registration PDF is fetched by Make, server-side, with no browser and no cookie, so
 * the gate answered 401 and the branch died before the confirmation was sent. A file
 * whose whole purpose is to be attached to an e-mail and handed to a stranger does not
 * belong behind a password — the gate hides an unfinished site, not the form somebody
 * has to print and sign.
 */
const OPEN_PREFIXES = [
  '/api/',      // the site's own endpoints; they fetch with credentials omitted
  '/emails/',   // PDFs fetched by Make and opened from an inbox
  '/_vercel/',  // platform internals
  '/assets/',   // CSS, JS and images, requested by a page that already passed
  '/favicon'
];

const COOKIE = 'car_gate';
const THIRTY_DAYS = 60 * 60 * 24 * 30;

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Length-independent compare, so a wrong guess cannot be timed. */
function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default async function middleware(request) {
  const password = process.env.SITE_PASSWORD;

  // No password configured: the gate does not exist. This is the switch that opens
  // the site to the public.
  if (!password) return;

  const url = new URL(request.url);
  if (OPEN_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return;

  const expected = await sha256(password);

  // The form posts here. Handled in the middleware so the gate needs no function of
  // its own and no route to forget about later.
  if (url.pathname === '/__gate' && request.method === 'POST') {
    const form = await request.formData().catch(() => null);
    const given = String(form?.get('password') || '');
    if (!same(await sha256(given), expected)) {
      return new Response(page({ failed: true }), {
        status: 401,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }
    return new Response(null, {
      status: 303,
      headers: {
        location: '/',
        'set-cookie': `${COOKIE}=${expected}; Path=/; Max-Age=${THIRTY_DAYS}; HttpOnly; Secure; SameSite=Lax`
      }
    });
  }

  const cookie = request.headers.get('cookie') || '';
  const held = cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`));
  if (held && same(held.slice(COOKIE.length + 1), expected)) return;

  return new Response(page({ failed: false }), {
    status: 401,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Never let a CDN or a browser keep the gate, or the first visit after the
      // password is entered would still show it.
      'cache-control': 'no-store'
    }
  });
}

/** The gate itself. Inline, because it must not depend on the site it is hiding. */
function page({ failed }) {
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Carruleddhi Show 2026</title>
<style>
  *,*::before,*::after{box-sizing:border-box}
  body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px;
    background:#071a3d;color:#fff;
    font-family:'Segoe UI',system-ui,Helvetica,Arial,sans-serif;
    background-image:
      radial-gradient(circle at 15% 20%,rgba(255,201,40,.16) 0 90px,transparent 91px),
      radial-gradient(circle at 85% 75%,rgba(246,73,79,.14) 0 120px,transparent 121px);}
  .card{width:100%;max-width:420px;background:#0d2452;border:1px solid rgba(255,255,255,.12);
    border-radius:26px;padding:34px 30px;box-shadow:0 30px 80px rgba(0,0,0,.45)}
  .tape{height:7px;border-radius:99px;margin:-10px 0 22px;
    background:repeating-linear-gradient(135deg,#ffc928 0 14px,#f6494f 14px 28px,#2469d8 28px 42px,#2fbf71 42px 56px)}
  .brand{font-size:13px;letter-spacing:.22em;text-transform:uppercase;color:#ffc928;font-weight:800}
  h1{margin:12px 0 10px;font-size:27px;line-height:1.15;letter-spacing:-.5px}
  p{margin:0 0 8px;font-size:14.5px;line-height:1.65;color:#a8c0ea}
  p.small{font-size:13px;color:#7f97c6}
  form{margin-top:22px;display:grid;gap:10px}
  input{width:100%;padding:14px 16px;border:1px solid rgba(255,255,255,.2);border-radius:14px;
    background:rgba(255,255,255,.07);color:#fff;font-size:15px}
  input:focus{outline:2px solid #ffc928;outline-offset:2px}
  button{padding:14px 16px;border:0;border-radius:99px;background:#ffc928;color:#071a3d;
    font-size:14px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}
  button:hover{background:#fff}
  .err{margin-top:4px;font-size:13.5px;color:#ffb3b3}
</style>
</head>
<body>
  <main class="card">
    <div class="tape"></div>
    <div class="brand">Carruleddhi Show 2026</div>
    <h1>Ci stiamo lavorando.<br>Pracujemy nad tym.</h1>
    <p>Il sito è in costruzione. Torna presto — oppure inserisci la password se ti è stata data.</p>
    <p class="small">Strona jest w budowie. Jeśli masz hasło, wpisz je poniżej.</p>
    <form method="POST" action="/__gate">
      <input type="password" name="password" placeholder="Password" aria-label="Password"
             autocomplete="current-password" autofocus required>
      <button type="submit">Entra / Wejdź</button>
      ${failed ? '<div class="err" role="alert">Password errata. Nieprawidłowe hasło.</div>' : ''}
    </form>
  </main>
</body>
</html>`;
}
