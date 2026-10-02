import { broadcastPublic, broadcastRunCommand, broadcastCommand, readBroadcastState, realtimeConfig, broadcastFail, timingState } from './broadcast.js';

const ACTIONS = new Set(['start','stop','hide-participant','show-participant','hide-sponsors','show-sponsors']);
const MAX_BODY = 2048;
const encoder = new TextEncoder();

// WebCrypto verifies equal-length MACs in native code, not an early-return JS string loop.
export async function controlSecretsMatch(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string' || !actual || !expected
      || actual.length > 4096 || expected.length > 4096) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode('broadcast-control-token-comparison-v1'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign','verify']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(expected));
  return crypto.subtle.verify('HMAC', key, signature, encoder.encode(actual));
}

export async function broadcastControl(request, env, cors = {}) {
  const url = new URL(request.url);
  const action = url.pathname.slice('/api/broadcast/'.length);
  const headers = { ...cors, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Carruleddhi-Roster-Key',
    'Content-Type': 'application/json;charset=utf-8', 'Cache-Control': 'no-store' };
  const reply = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...headers, ...extra } });
  if (action !== 'state' && !ACTIONS.has(action)) return reply({ ok: false, code: 'NOT_FOUND' }, 404);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  const method = action === 'state' ? 'GET' : 'POST';
  if (request.method !== method) return reply({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405, { Allow: method });
  // No credential query strings, alternate body actions or arbitrary RPC forwarding.
  if (url.search) return reply({ ok: false, code: 'BROADCAST_QUERY_NOT_ALLOWED' }, 400);
  if (action === 'state') return broadcastPublic(env, {}, headers);
  const authorization = request.headers.get('Authorization');
  const roster = request.headers.get('X-Carruleddhi-Roster-Key');
  const token = env.BROADCAST_CONTROL_TOKEN;
  const configured = typeof token === 'string' && /^[\x21-\x7e]{32,4096}$/.test(token)
    && token !== env.SUPABASE_SERVICE_KEY && token !== env.ROSTER_KEY;
  const bearer = /^Bearer ([\x21-\x7e]{1,4096})$/i.exec(authorization || '')?.[1];
  const authorised = authorization
    ? configured && await controlSecretsMatch(bearer, token)
    : env.ROSTER_KEY && env.ROSTER_KEY !== env.SUPABASE_SERVICE_KEY
      && await controlSecretsMatch(roster, env.ROSTER_KEY);
  if (!authorised) return reply({ ok: false, code: 'BROADCAST_UNAUTHORISED' }, 401,
    { 'WWW-Authenticate': 'Bearer' });
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get('Content-Type') || '')) {
    return reply({ ok: false, code: 'UNSUPPORTED_MEDIA_TYPE' }, 415);
  }
  if (Number(request.headers.get('Content-Length')) > MAX_BODY) return reply({ ok: false, code: 'PAYLOAD_TOO_LARGE' }, 413);
  let input;
  try {
    const chunks = []; let length = 0;
    const reader = request.body?.getReader();
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_BODY) {
          await reader.cancel();
          return reply({ ok: false, code: 'PAYLOAD_TOO_LARGE' }, 413);
        }
        chunks.push(value);
      }
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { return reply({ ok: false, code: 'INVALID_JSON' }, 400); }
  const fields = action === 'start' ? ['participantId','runId'] : action === 'stop' ? ['runId'] : [];
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).some((key) => !fields.includes(key))) return reply({ ok: false, code: 'BROADCAST_BAD_PAYLOAD' }, 422);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return reply({ ok: false, code: 'BROADCAST_UNAVAILABLE' }, 503);
  try {
    const state = ['start','stop','show-participant'].includes(action)
      ? await broadcastRunCommand(env, action, input)
      : await broadcastCommand(env, action === 'hide-participant' ? 'hide' : 'sponsors-toggle',
        action === 'hide-participant' ? {} : { enabled: action === 'show-sponsors' });
    const snapshot = await readBroadcastState(env);
    return reply({ ok: true, ...snapshot, state: timingState(state), realtime: realtimeConfig(env) });
  } catch (error) { return broadcastFail(error, headers); }
}
