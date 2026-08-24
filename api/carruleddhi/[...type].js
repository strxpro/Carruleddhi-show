/**
 * The API, on Vercel.
 *
 * WHY THIS FILE IS THREE LINES OF LOGIC
 *   worker/index.js was written for Cloudflare, but it only ever uses web platform
 *   APIs — Request, Response, fetch, crypto, URL. No imports, no node: modules, no
 *   process. So it runs unchanged on Vercel's Edge runtime and this file is an
 *   adapter, not a rewrite. One copy of the validation, rate limiting, Supabase
 *   access and Make forwarding, running on either platform.
 *
 * WHAT THE ADAPTER TRANSLATES
 *   env — Cloudflare hands bindings in as an argument; Vercel puts them on
 *         process.env. Same names, so the variables you set in the Vercel dashboard
 *         are the ones the code already looks for.
 *   ctx — Cloudflare's waitUntil keeps a promise alive after the response is sent.
 *         Vercel's Edge runtime has no equivalent that works without a dependency,
 *         so the shim swallows rejections and lets the promise run as long as the
 *         invocation lives. Only one call site uses it: the copy of an attendance
 *         press forwarded to Make. If that copy is occasionally dropped the count in
 *         Supabase — the number the page actually shows — is unaffected.
 *
 * ROUTING
 *   The [...type] catch-all keeps the full path, so the Worker's own check for
 *   /api/carruleddhi/<type> still sees what it expects and the site's endpoint
 *   configuration does not change.
 */
import worker from '../../worker/index.js';

export const config = { runtime: 'edge' };

export default function handler(request) {
  const ctx = {
    waitUntil(promise) {
      // Nothing to hand it to. Attaching a catch is the point: an unhandled
      // rejection in the Edge runtime is logged as a crash of the whole request,
      // and this promise is a best-effort copy, not the answer.
      if (promise && typeof promise.catch === 'function') promise.catch(() => {});
    }
  };
  return worker.fetch(request, process.env, ctx);
}
