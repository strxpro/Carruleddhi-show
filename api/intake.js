/**
 * The API, on Vercel.
 *
 * WHY THIS FILE IS SIX LINES OF LOGIC
 *   worker/index.js was written for Cloudflare, but it only ever uses web platform
 *   APIs — Request, Response, fetch, crypto, URL. No imports of its own, no node:
 *   modules, no process. So it runs unchanged on Vercel's Edge runtime and this file
 *   is an adapter, not a second implementation to keep in step.
 *
 * WHY IT IS NOT api/carruleddhi/[...type].js ANY MORE
 *   It was, and a deployment failed after a green build with `Error: Unhandled type:
 *   "ColonToken"` — which never reached the site, so every change looked ignored while
 *   an older deployment stayed live. A catch-all filename and an exported `config`
 *   object are both read by Vercel's static analyser before deploy, and neither is
 *   worth the risk when a rewrite in vercel.json does the same routing with a plain
 *   filename. The path the code sees is unchanged, so worker/index.js and the site's
 *   endpoint configuration did not have to move.
 *
 * WHAT THE ADAPTER TRANSLATES
 *   env — Cloudflare passes bindings as an argument, Vercel puts them on process.env.
 *         Same names, so the variables set in the dashboard are the ones the code
 *         already looks for.
 *   ctx — Cloudflare's waitUntil keeps a promise alive past the response. There is no
 *         dependency-free equivalent here, so the shim swallows rejections and lets it
 *         run as long as the invocation does. One call site uses it: the copy of an
 *         attendance press forwarded to Make. If that copy is dropped, the count in
 *         Supabase — the number the page actually shows — is unaffected.
 */
import worker from '../worker/index.js';

export const runtime = 'edge';

export default function handler(request) {
  const ctx = {
    waitUntil(promise) {
      // Nothing to hand it to. The catch is the point: an unhandled rejection in the
      // Edge runtime is logged as a crash of the whole request, and this promise is a
      // best-effort copy, not the answer.
      if (promise && typeof promise.catch === 'function') promise.catch(() => {});
    }
  };
  return worker.fetch(request, process.env, ctx);
}
