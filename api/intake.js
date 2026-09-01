/**
 * The API, on Vercel.
 *
 * WHY THIS FILE IS AN ADAPTER AND NOT AN IMPLEMENTATION
 *   worker/index.js was written for Cloudflare but only ever uses web platform APIs —
 *   Request, Response, fetch, crypto, URL. No node: modules, no process. So it runs
 *   unchanged here, and there is one copy of the validation, Supabase access and Make
 *   forwarding rather than two to keep in step.
 *
 *   JEDNA RZECZ NIE PRZENOSI SIĘ RAZEM Z KODEM: limitowanie po IP.
 *   `overRateLimit` w worker/index.js chodzi po powiązaniu `RATE_LIMIT`, czyli po namespace
 *   KV Cloudflare. Tutaj `env` to `process.env` — zwykły obiekt napisów — więc tego powiązania
 *   nie ma i tamta funkcja zwraca `false` dla wszystkiego. Ten nagłówek wymieniał kiedyś
 *   „rate limiting" wśród rzeczy wspólnych, co było nieprawdą i uspokajało bez powodu.
 *
 *   Co naprawdę broni wrażliwych końcówek na tej platformie: `overCodeSendLimit` (sufit na
 *   listy z kodem wysyłane na jeden adres) i licznik świeżych wierszy przy `wall-post`. Oba
 *   liczą w Supabase, więc działają wszędzie, gdzie ta funkcja stoi.
 *
 * WHY IT HANDLES TWO CALLING CONVENTIONS
 *   This cost a day, so it is worth writing down. Vercel decides a function's runtime
 *   from an exported marker, and the two spellings are not interchangeable:
 *
 *     export const config = { runtime: 'edge' }   Vercel Functions
 *     export const runtime = 'edge'               Next.js App Router
 *
 *   Using the second one in a project that is not Next means the marker is ignored and
 *   the file runs on Node — where the handler is called as (req, res) with Node
 *   streams, not with a Request. Passing an IncomingMessage to worker.fetch() throws,
 *   and the whole thing surfaces as a bare HTTP 500 with no clue in it.
 *
 *   Rather than pick a spelling and hope, this detects which convention it was called
 *   with. On Edge it hands the Request straight through. On Node it builds a Request
 *   from the stream and writes the Response back out. Node 18+ on Vercel has Request,
 *   Response and Headers as globals, so the conversion needs no dependency.
 *
 *   The result cannot be broken by a change of runtime, which is exactly the property
 *   this file was missing.
 */
import worker from '../worker/index.js';

// The Vercel Functions spelling. Kept because Edge is what this should run on: it is
// faster to start and closer to what the code was written for. If the platform ignores
// it, the Node branch below still works.
export const config = { runtime: 'edge' };

/**
 * `waitUntil` has nothing to hand a promise to here.
 *
 * The catch is the point: an unhandled rejection is logged as a crash of the whole
 * request. One call site uses it — the copy of an attendance press forwarded to Make —
 * and if that copy is dropped the count in Supabase, which is the number the page
 * actually shows, is unaffected.
 */
const ctx = {
  waitUntil(promise) {
    if (promise && typeof promise.catch === 'function') promise.catch(() => {});
  }
};

/** Collects a Node request body. Returns undefined for GET, which may not have one. */
function readBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return Promise.resolve(undefined);
  // Vercel's Node runtime often parses JSON for us; when it has, re-reading the
  // stream yields nothing and the body has to come back from req.body.
  if (req.body !== undefined && req.body !== null) {
    return Promise.resolve(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Puts the request type back into the path.
 *
 * The rewrite in vercel.json sends /api/carruleddhi/registration here as
 * /api/intake?type=registration, so by the time the code runs the path no longer says
 * what was asked for. That matters more than it looks: worker/index.js deliberately
 * takes the type from the path rather than the body, so a request that claims
 * "type": "roster" in its JSON cannot reach the participant list through the
 * registration endpoint. Losing the path would hand that decision to the body.
 *
 * The query parameter is filled in by the platform from the path pattern, not by the
 * caller, so it keeps the same property. This restores the URL the Worker expects and
 * leaves that file untouched.
 */
function normalise(rawUrl, origin) {
  const url = new URL(rawUrl, origin);
  if (url.pathname === '/api/intake' || url.pathname === '/api/intake/') {
    const type = url.searchParams.get('type') || '';
    // Letters and dashes only. The pattern cannot produce anything else, and a path
    // built from an unchecked value is not worth the saving.
    if (/^[a-z-]{1,24}$/.test(type)) {
      url.pathname = `/api/carruleddhi/${type}`;
      url.searchParams.delete('type');
    }
  }
  return url.toString();
}

export default async function handler(first, second) {
  // Edge: one argument, a Request. Node: (IncomingMessage, ServerResponse).
  const isEdge = typeof first?.headers?.get === 'function' && typeof first?.url === 'string';

  if (isEdge) {
    const request = new Request(normalise(first.url, first.url), first);
    return worker.fetch(request, process.env, ctx);
  }

  const req = first;
  const res = second;
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const origin = `${proto}://${host}`;

  const request = new Request(normalise(req.url, origin), {
    method: req.method,
    headers: new Headers(
      Object.entries(req.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : String(value)])
    ),
    body: await readBody(req)
  });

  const response = await worker.fetch(request, process.env, ctx);
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
  return undefined;
}
