const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SPONSOR_ID = /^[A-Za-z0-9_-]{1,80}$/;
const ASSET_PATH = /^sponsors\/[A-Za-z0-9._/-]+$/;
const PARTICIPANT_PATH = /^participants\/[A-Za-z0-9._/-]+$/;
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_IMAGE = 1024 * 1024;

function response(body, status, cors) {
  return new Response(JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json;charset=utf-8', 'Cache-Control': 'no-store', ...cors
  } });
}

function headers(env) {
  return { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json' };
}

export function realtimeConfig(env) {
  const key = String(env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || '').trim();
  let publicKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
  if (!publicKey && key.split('.').length === 3) {
    try {
      const encoded = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      publicKey = JSON.parse(atob(encoded)).role === 'anon';
    } catch { /* Invalid or private credentials must never reach the browser. */ }
  }
  publicKey = publicKey && key !== env.SUPABASE_SERVICE_KEY;
  const url = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const ready = Boolean(publicKey && /^https:\/\//.test(url));
  return { url, anonKey: ready ? key : null, ready,
    ...(!ready ? { code: key ? 'REALTIME_INVALID_PUBLIC_KEY' : 'REALTIME_NOT_CONFIGURED' } : {}) };
}

async function db(env, path, body) {
  let res;
  try {
    res = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`, {
      method: body === undefined ? 'GET' : 'POST', headers: headers(env),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000)
    });
  } catch { throw Object.assign(new Error('BROADCAST_UNAVAILABLE'), { status: 502 }); }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const known = String(data?.message || '').match(/\b(?:BROADCAST|RUN)_[A-Z_]+\b/)?.[0];
    const missing = ['PGRST202', 'PGRST205', '42P01', '42883'].includes(data?.code);
    throw Object.assign(new Error(known || (missing ? 'BROADCAST_MIGRATION_REQUIRED' : 'BROADCAST_UNAVAILABLE')),
      { status: known ? (known.startsWith('RUN_') || known.includes('CONFLICT') ? 409 : 422) : missing ? 503 : 502,
        missingSchema: missing,
        missingTimingMode: isMissingTimingColumn(data, 'participant_mode') });
  }
  return data;
}

// Only the new column's schema/cache error permits the staged-rollout fallback.
export function isMissingTimingColumn(error, column = 'race_time_ms') {
  return ['42703', 'PGRST204'].includes(error?.code)
    && new RegExp(`\\b${column}\\b`).test(String(error?.message || ''));
}

export function timingState(state) {
  const fields = ['id','revision','participant_visible','sponsors_enabled','sponsors','updated_at',
    'current_participant_id','last_finished_participant_id','run_status','started_at','stopped_at',
    'elapsed_ms','run_id','last_finished_elapsed_ms'];
  const person = (value) => value ? { ...Object.fromEntries(
    ['id','firstName','lastName','startNumber','city','projectName','category','photo']
      .filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]])), raceTimeMs: value.raceTimeMs ?? null } : null;
  return { ...Object.fromEntries(fields.filter((key) => Object.hasOwn(state, key)).map((key) => [key, state[key]])),
    participant_mode: state.participant_mode ?? 'live', participant: person(state.participant),
    ...(Object.hasOwn(state, 'last_finished_participant') ? { last_finished_participant: person(state.last_finished_participant) } : {}) };
}

export async function readBroadcastState(env) {
  try {
    const snapshot = await db(env, 'rpc/broadcast_snapshot', {});
    if (!snapshot?.state || !snapshot.serverNow) throw new Error('BROADCAST_UNAVAILABLE');
    return { state: timingState(snapshot.state), serverNow: snapshot.serverNow,
      timingReady: Object.hasOwn(snapshot.state, 'participant_mode'),
      runReady: Object.hasOwn(snapshot.state, 'run_status') };
  } catch (error) {
    if (!error.missingSchema) throw error;
  }
  // Only a missing 0050 RPC permits base reads against deployed 0047/0048.
  const columns = 'id,revision,participant,participant_visible,sponsors_enabled,sponsors,updated_at';
  let rows;
  try {
    rows = await db(env, `broadcast_state?id=eq.main&select=${columns},participant_mode&limit=1`);
  } catch (error) {
    if (!error.missingTimingMode) throw error;
    rows = await db(env, `broadcast_state?id=eq.main&select=${columns}&limit=1`);
  }
  if (!rows?.[0]) throw Object.assign(new Error('BROADCAST_MIGRATION_REQUIRED'), { status: 503 });
  return { state: timingState(rows[0]), timingReady: Object.hasOwn(rows[0], 'participant_mode'),
    runReady: false, serverNow: null };
}

export function broadcastCommand(env, action, payload = {}) {
  return db(env, 'rpc/broadcast_command', { p_action: action, p_payload: payload });
}

export async function broadcastRunCommand(env, action, payload = {}) {
  if (payload.runId !== undefined && (typeof payload.runId !== 'string' || !UUID.test(payload.runId))) {
    throw new Error('BROADCAST_BAD_RUN_ID');
  }
  const id = payload.participantId ?? payload.id;
  if (['start','on-air'].includes(action) && (typeof id !== 'string' || !UUID.test(id))) throw new Error('BROADCAST_BAD_ID');
  const before = await readBroadcastState(env);
  if (!before.runReady) throw Object.assign(new Error('RUN_MIGRATION_REQUIRED'), { status: 503 });
  const command = { ...(id ? { id } : {}), ...(payload.runId !== undefined ? { runId: payload.runId } : {}) };
  if (['start','on-air'].includes(action) && before.state.run_status !== 'RUNNING'
      && !(payload.runId && payload.runId === before.state.run_id)) {
    const source = await db(env, 'rpc/broadcast_photo_source', { p_id: id });
    if (!source || source.id !== id) throw new Error('BROADCAST_PARTICIPANT_INELIGIBLE');
    if (!source.photo && source.imagePath) {
      const path = source.imagePath;
      if (typeof path !== 'string' || path.length > 240 || !PARTICIPANT_PATH.test(path) || path.includes('..')) {
        throw new Error('BROADCAST_BAD_PHOTO_PATH');
      }
      const image = await storedImage(env, 'participant-photos', path, 5 * MAX_IMAGE);
      command.preparedPhoto = await upload(env, image, 'participants');
      command.sourcePath = path;
    }
  }
  // Eligibility, photo source and run identity are rechecked under the DB row locks.
  return broadcastCommand(env, action === 'on-air' ? 'start' : action, command);
}

export function decodeBroadcastImage(value) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(value || ''));
  if (!match || match[2].length > Math.ceil(MAX_IMAGE / 3) * 4) throw new Error('BROADCAST_BAD_PHOTO');
  let raw;
  try { raw = atob(match[2]); } catch { throw new Error('BROADCAST_BAD_PHOTO'); }
  const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  return validateImage(bytes, match[1], MAX_IMAGE);
}

function validateImage(bytes, mime, limit) {
  const signature = mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : mime === 'image/png' ? [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b)
      : [82,73,70,70].every((b,i) => bytes[i] === b) && [87,69,66,80].every((b,i) => bytes[i+8] === b);
  if (!TYPES[mime] || !signature || bytes.length < 64 || bytes.length > limit) throw new Error('BROADCAST_BAD_PHOTO');
  return { bytes, mime, ext: TYPES[mime] };
}

async function storedImage(env, bucket, path, limit) {
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/authenticated/${bucket}/${path}`, {
    headers: headers(env), redirect: 'error', signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error('BROADCAST_ASSET_READ_FAILED');
  const mime = (res.headers.get('Content-Type') || '').split(';')[0];
  if (!TYPES[mime] || Number(res.headers.get('Content-Length') || 0) > limit) throw new Error('BROADCAST_BAD_PHOTO');
  const reader = res.body.getReader();
  const chunks = []; let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) { await reader.cancel(); throw new Error('BROADCAST_BAD_PHOTO'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return validateImage(bytes, mime, limit);
}

async function upload(env, image, folder) {
  const path = `${folder}/${crypto.randomUUID()}.${image.ext}`;
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/broadcast-assets/${path}`, {
    method: 'POST', headers: { ...headers(env), 'Content-Type': image.mime, 'Cache-Control': 'max-age=31536000' },
    body: image.bytes, signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error('BROADCAST_ASSET_UPLOAD_FAILED');
  return `${env.SUPABASE_URL}/storage/v1/object/public/broadcast-assets/${path}`;
}

// Call only for approved canonical settings or an explicit organiser sponsor save.
// No URL fetch from the client and no private submissions scan: prevents SSRF and
// accidental publication of rejected submissions.
export async function prepareBroadcastLogos(env, sponsors) {
  for (const sponsor of sponsors) {
    const path = sponsor.logo || '';
    if (!path || path.startsWith('/assets/')) continue;
    if (!ASSET_PATH.test(path) || path.includes('..')) throw new Error('BROADCAST_BAD_ASSET');
    const existing = await db(env, `broadcast_assets?source_path=eq.${encodeURIComponent(path)}&select=public_url&limit=1`);
    if (existing?.[0]?.public_url) continue;
    const image = await storedImage(env, 'wall-photos', path, MAX_IMAGE);
    const url = await upload(env, image, 'sponsors');
    await broadcastCommand(env, 'asset', { path, url });
  }
}

export function cleanBroadcastSponsor(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('BROADCAST_BAD_SPONSOR');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const logo = typeof input.logo === 'string' ? input.logo.trim() : '';
  const id = input.id || crypto.randomUUID();
  const tier = input.tier === undefined ? 'partner' : String(input.tier).trim();
  if (!name || name.length > 80 || !SPONSOR_ID.test(id) || !tier || tier.length > 40
    || logo.length > 240 || logo.includes('..')
    || (logo && !ASSET_PATH.test(logo) && !/^\/assets\/[A-Za-z0-9._/-]+$/.test(logo))
    || (input.active !== undefined && typeof input.active !== 'boolean')
    || (input.order !== undefined && (!Number.isInteger(input.order) || input.order < 0 || input.order > 29))) {
    throw new Error('BROADCAST_BAD_SPONSOR');
  }
  let url = '';
  if (input.url) {
    try {
      const parsed = new URL(input.url);
      if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
      url = parsed.href;
      if (url.length > 2048) throw new Error();
    } catch { throw new Error('BROADCAST_BAD_SPONSOR_URL'); }
  }
  return { id, name, logo, url, active: input.active ?? true, order: input.order ?? 0, tier };
}

// Preserve the browser's exact canonical values; URL normalization or defaults
// here would change the baseline. Display-only logoUrl is deliberately excluded.
export function broadcastSponsorBaseline(input, code = 'BROADCAST_SPONSOR_CONFLICT') {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || !['id','name','url','logo','tier'].every((key) => typeof input[key] === 'string')
      || !input.id || typeof input.active !== 'boolean' || !Number.isInteger(input.order)) throw new Error();
    cleanBroadcastSponsor(input);
    return Object.fromEntries(['id','name','url','logo','active','order','tier'].map((key) => [key,input[key]]));
  } catch { throw Object.assign(new Error(code), { status: 409 }); }
}

export async function broadcastPublic(env, payload, cors) {
  if ((payload.action || 'state') !== 'state') return response({ ok: false, code: 'BROADCAST_UNKNOWN_ACTION' }, 400, cors);
  try {
    return response({ ok: true, ...await readBroadcastState(env), realtime: realtimeConfig(env) }, 200, cors);
  } catch (error) { return broadcastFail(error, cors); }
}

export function broadcastFail(error, cors) {
  const code = /^(?:BROADCAST|RUN)_[A-Z_]+$/.test(error.message) ? error.message : 'BROADCAST_UNAVAILABLE';
  return response({ ok: false, code }, error.status || (code.includes('BAD_') || code.includes('INELIGIBLE') ? 422 : 502), cors);
}

export async function broadcastAdmin(env, payload, cors) {
  const action = payload.action || 'state';
  try {
    let commandState;
    if (action === 'participant-photo' && !UUID.test(payload.id || '')) throw new Error('BROADCAST_BAD_ID');
    if (action === 'on-air' || action === 'start') {
      if (Object.hasOwn(payload, 'mode') && !['live','replay'].includes(payload.mode)) throw new Error('BROADCAST_BAD_MODE');
      // Compatibility replay buttons are read-only; replay has its own frozen source.
      if (payload.mode !== 'replay') commandState = await broadcastRunCommand(env, action, payload);
    } else if (['stop','show','show-participant'].includes(action)) {
      commandState = await broadcastRunCommand(env, action, payload);
    } else if (action === 'participant-photo') {
      const image = decodeBroadcastImage(payload.image);
      const before = await db(env, 'rpc/broadcast_admin_state', {});
      if (!before?.participants?.some((p) => p.id === payload.id)) throw new Error('BROADCAST_PARTICIPANT_INELIGIBLE');
      const photo = await upload(env, image, 'participants');
      await broadcastCommand(env, action, { id: payload.id, photo });
    } else if (action === 'sponsor-save') {
      const sponsor = cleanBroadcastSponsor(payload.sponsor);
      const updating = Object.hasOwn(payload.sponsor, 'id');
      let expectedSponsor;
      if (updating) {
        expectedSponsor = broadcastSponsorBaseline(payload.expectedSponsor);
        if (expectedSponsor.id !== payload.sponsor.id) throw Object.assign(new Error('BROADCAST_SPONSOR_CONFLICT'), { status: 409 });
      } else {
        if (payload.expectedSponsor !== undefined) throw Object.assign(new Error('BROADCAST_SPONSOR_CONFLICT'), { status: 409 });
        delete sponsor.id;
      }
      await prepareBroadcastLogos(env, [sponsor]);
      await broadcastCommand(env, action, { sponsor, ...(updating ? { expectedSponsor } : {}) });
    } else if (action === 'sponsor-order') {
      if (!Array.isArray(payload.ids) || payload.ids.length > 30 || new Set(payload.ids).size !== payload.ids.length
        || payload.ids.some((id) => typeof id !== 'string' || !SPONSOR_ID.test(id))) throw new Error('BROADCAST_BAD_ORDER');
      await broadcastCommand(env, action, { ids: payload.ids });
    } else if (action === 'sponsor-delete') {
      if (!SPONSOR_ID.test(payload.id || '')) throw new Error('BROADCAST_BAD_ID');
      await broadcastCommand(env, action, { id: payload.id });
    } else if (action === 'sponsors-toggle') {
      if (typeof payload.enabled !== 'boolean') throw new Error('BROADCAST_BAD_ENABLED');
      await broadcastCommand(env, action, { enabled: payload.enabled });
    } else if (['hide','hide-participant','clear','show-sponsors','hide-sponsors'].includes(action)) {
      commandState = await broadcastCommand(env, action, {});
    } else if (action !== 'state') {
      return response({ ok: false, code: 'BROADCAST_UNKNOWN_ACTION' }, 400, cors);
    }
    let data = await db(env, 'rpc/broadcast_admin_state', {});
    // One-time preparation of existing approved logos; never runs on public reads
    // or on-air commands (which must stay fast and deterministic).
    const assetWarnings = [];
    if (action === 'state') {
      const pending = data.sponsors.filter((s) => s.logo && !s.logo.startsWith('/assets/')
        && !data.state.sponsors.find((v) => v.id === s.id)?.logo);
      for (const sponsor of pending) {
        try { await prepareBroadcastLogos(env, [sponsor]); }
        catch { assetWarnings.push({ id: sponsor.id, code: 'BROADCAST_ASSET_NOT_READY' }); }
      }
      if (pending.length) {
        data = await db(env, 'rpc/broadcast_admin_state', {});
      }
    }
    // Private roster identity only. Never add registration IDs to broadcast_state
    // or infer a link from a reusable race number/name/email.
    const registrations = new Map();
    const ids = data.participants.map((p) => p.id).filter((id) => UUID.test(id));
    for (let offset = 0; offset < ids.length; offset += 100) {
      const links = await db(env, `participants?select=id,registration_id&id=in.(${ids.slice(offset, offset + 100).join(',')})`);
      if (!Array.isArray(links)) throw new Error('BROADCAST_UNAVAILABLE');
      for (const link of links) {
        if (UUID.test(link.id) && UUID.test(link.registration_id)) registrations.set(link.id, link.registration_id);
      }
    }
    return response({ ok: true, ...data, state: timingState(commandState || data.state),
      runReady: Object.hasOwn(data.state, 'run_status'), serverNow: data.serverNow ?? null,
      timingReady: Object.hasOwn(data.state, 'participant_mode'),
      participants: data.participants.map((p) => ({ ...p, raceTimeMs: p.raceTimeMs ?? null, registrationId: registrations.get(p.id) || null })),
      sponsors: data.sponsors.map((s) => ({ ...s,
      logoUrl: data.state.sponsors.find((v) => v.id === s.id)?.logo || '' })),
      assetWarnings, realtime: realtimeConfig(env) }, 200, cors);
  } catch (error) { return broadcastFail(error, cors); }
}
