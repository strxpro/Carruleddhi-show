/**
 * Carruleddhi Show 2026 — Cloudflare Worker proxy in front of Make.com.
 *
 * Why this exists: pasting a Make webhook URL into index.html makes it public
 * and spammable. The browser only ever talks to /api/carruleddhi/<type>; the
 * webhook URL lives in a Worker secret.
 *
 * Bindings (see wrangler.toml):
 *   MAKE_WEBHOOK_URL   secret, required — https://hook.eu1.make.com/xxxxx
 *   INTAKE_SHARED_KEY  secret, optional — echoed to Make as X-Carruleddhi-Key
 *   TURNSTILE_SECRET   secret, optional — enables Cloudflare Turnstile checks
 *   RATE_LIMIT         KV namespace, optional — enables per-IP throttling
 *   SUPABASE_URL       secret, optional — enables the public wall
 *   SUPABASE_SERVICE_KEY secret, optional — service role key, wall writes/reads
 *   WALL_SALT          secret, optional — salt for the stored IP hash
 */
import { COPY_DECK } from './copy-deck.js';

const ALLOWED_TYPES = new Set([
  'registration', 'reminder', 'attendance', 'contact', 'counts', 'roster',
  // Public wall. `wall` reads approved messages, `wall-post` adds one,
  // `wall-translate` translates one on demand, `wall-admin` moderates.
  'wall', 'wall-post', 'wall-translate', 'wall-admin',
  // Live chat. `chat` is the visitor side (open a thread, send, poll);
  // `chat-admin` is the organiser side and needs the passphrase.
  'chat', 'chat-admin',
  // Unread counts for the bell in the admin panel. Passphrase too.
  'inbox'
]);

/** These never reach Make; they are served from Supabase by the Worker itself. */
const SUPABASE_TYPES = new Set([
  'wall', 'wall-post', 'wall-translate', 'wall-admin',
  'chat', 'chat-admin', 'inbox'
]);

/**
 * The wall actions the page is allowed to select with the request body.
 *
 * The site is configured with one wall endpoint, so all four arrive at the same
 * path. Keeping the set separate from SUPABASE_TYPES makes the boundary explicit:
 * this is the only place where a body may influence which handler runs.
 */
const WALL_FAMILY = new Set(['wall', 'wall-post', 'wall-translate', 'wall-admin']);

/**
 * Types the Worker answers from Supabase when it is configured, and forwards to
 * Make when it is not.
 *
 * `counts` is the reason this exists. Reading it from the Google Sheet would mean a
 * Sheets API call per visitor, against a quota measured per minute rather than per
 * visitor, so the number on the page would stop working exactly when the page got
 * popular. Supabase answers it as one indexed query.
 *
 * `attendance` is here too, because a real total needs somewhere to count. Make can
 * still have its copy — the row goes to Supabase first, then the request continues
 * to the webhook as before.
 */
const SUPABASE_FIRST = new Set(['counts', 'attendance']);

/**
 * `roster` returns participant data, so it is gated separately.
 * A shared passphrase is the minimum bar; put Cloudflare Access in front of
 * admin.html as well before using this on a public hostname.
 */
const PROTECTED_TYPES = new Set(['roster', 'wall-admin', 'chat-admin', 'inbox']);
const ROSTER_HEADER = 'X-Carruleddhi-Roster-Key';

/** Only these keys are forwarded. Anything else is dropped, not rejected. */
const FIELD_WHITELIST = {
  common: ['type', 'event', 'eventDate', 'locale', 'source', 'submittedAt'],
  registration: [
    'firstName', 'lastName', 'birthDate', 'postalCode', 'email', 'phone', 'address',
    'cartName', 'category', 'teamName', 'cartNotes', 'rulesConsent', 'privacyConsent', 'newsConsent',
    // Riders under 18 on the day of the event. `isMinor` and `riderAge` always
    // travel; the rest only when the rider is a minor. See validate().
    'isMinor', 'riderAge', 'childKind', 'guardianRelation', 'guardianName',
    'guardianEmail', 'guardianPhone', 'motherName', 'fatherName', 'guardianConsent'
  ],
  reminder: ['name', 'email', 'consent', 'reminderSchedule'],
  attendance: ['attendeeId'],
  contact: ['name', 'email', 'message'],
  counts: [],
  roster: ['since', 'limit'],
  wall: ['limit', 'before'],
  // `photo` is a data URL from the browser, already downscaled there. See wallPost.
  // The dimensions come from the browser too, and are used only to reserve the right
  // shape of space in the layout, so a wrong one costs a reflow and nothing more.
  'wall-post': ['name', 'place', 'message', 'rating', 'photo', 'photoWidth', 'photoHeight'],
  'wall-translate': ['text', 'from', 'to'],
  // Moderation, behind the same passphrase as the roster.
  'wall-admin': ['action', 'id', 'limit'],
  /* Live chat, visitor side. `token` is the browser-held thread identifier; it is
     never generated here, because a token minted server-side and handed back would
     let anyone who omits it be given somebody else's fresh thread. */
  chat: ['action', 'token', 'message', 'name', 'email', 'since'],
  // Organiser side. Same passphrase as the roster.
  'chat-admin': ['action', 'threadId', 'message', 'mode', 'limit'],
  inbox: ['action']
};

const MAX_FIELD_LENGTH = 3000;
const MAX_BODY_BYTES = 16 * 1024;
/**
 * A wall post can carry a photo, so it gets its own ceiling.
 *
 * The browser downscales to 1600 px and re-encodes as JPEG before sending, which
 * lands around 200–400 KB, base64 included. 1.5 MB leaves room for a stubborn
 * image without letting anyone stream a film through the form. The bucket itself
 * refuses anything over 5 MB, so this is the first of two limits, not the only one.
 */
const MAX_PHOTO_BODY_BYTES = 1536 * 1024;
/** Fields that are allowed to be long. Everything else is capped at 3000 chars. */
const LONG_FIELDS = new Set(['photo']);
const RATE_LIMIT_MAX = 6;
const RATE_LIMIT_WINDOW_SECONDS = 600;

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowList = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const allowed = allowList.length === 0 || allowList.includes(origin);
  return {
    'Access-Control-Allow-Origin': allowed && origin ? origin : allowList[0] || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': `Content-Type, ${ROSTER_HEADER}`,
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function json(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders
    }
  });
}

function sanitizeScalar(value) {
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value !== 'string') return undefined;
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_FIELD_LENGTH);
}

/* ============================================================================
   Public wall
   ============================================================================
   Supabase is reached only from here. The service role key bypasses row level
   security, which is exactly why it must never be handed to a browser: anything
   that can insert with it can also be persuaded to select or delete with it.

   Everything written arrives unapproved. The site shows nothing until it has been
   approved in the admin panel, because a wall on a public event page attracts spam
   and abuse faster than anyone can watch it.
*/

const WALL_MAX_MESSAGE = 280;
const WALL_MAX_NAME = 40;
const WALL_POST_WINDOW_SECONDS = 900;
const WALL_POST_MAX = 3;

function wallReady(env) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY);
}

/* ============================================================================
   Live chat
   ============================================================================
   Visitor side and organiser side, both answered from here.

   WHY THE VISITOR NEEDS NO ACCOUNT
     Their browser makes a random token and keeps it. It names one thread and grants
     nothing else, so losing it costs a conversation and not an identity. Asking
     somebody to register before they can ask "is a helmet compulsory" would end the
     conversation before it started.

   HOW ANSWERS HAPPEN
     Most questions are the five in the FAQ, and those are answered from the copy deck
     with no model involved — instantly, in the visitor's language, at no cost and
     with no chance of an invented fact. Anything else is escalated: the thread flips
     to `human`, the bell counts it, and the visitor is told a person will reply.

     If AI_API_KEY is set the unmatched question goes to an OpenAI-compatible endpoint
     first, with the FAQ and the rules as its entire knowledge and instructions to
     escalate rather than guess. Without the key the escalation happens immediately,
     which is the honest default: better a slower human answer than a confident wrong
     one about who is allowed to race.
   ============================================================================ */

const CHAT_MAX_MESSAGES = 200;

/** Answers built from the copy deck. Keys are the FAQ entries the site already has. */
function faqAnswer(deck, question) {
  const text = String(question || '').toLowerCase();
  // Deliberately crude, and crude is the point: these fire only on an unmistakable
  // word, and everything else goes to a person rather than to a guess.
  const topics = [
    { keys: ['kask', 'casco', 'helmet', 'helm', 'casque'], answer: deck.faqHelmet },
    { keys: ['koszt', 'cena', 'płac', 'plac', 'costo', 'quanto costa', 'cost', 'price', 'preis', 'precio', 'prix', 'gratis', 'free'], answer: deck.faqCost },
    { keys: ['silnik', 'motore', 'engine', 'motor', 'moteur'], answer: deck.faqEngine },
    { keys: ['kto może', 'kto moze', 'wiek', 'lat', 'chi può', 'chi puo', 'who can', 'age', 'alter', 'edad', 'âge', 'minor', 'nieletni', 'niepełnoletni'], answer: deck.faqWho },
    { keys: ['numer startowy', 'numer', 'numero', 'race number', 'startnummer', 'dorsal'], answer: deck.faqNumber },
    { keys: ['gdzie', 'kiedy', 'dojechać', 'dojechac', 'dove', 'quando', 'where', 'when', 'wann', 'wo', 'cuándo', 'dónde', 'quand', 'où'], answer: deck.faqWhen }
  ];
  for (const topic of topics) {
    if (topic.keys.some((key) => text.includes(key)) && topic.answer) return topic.answer;
  }
  return null;
}

/** Loads a thread by its browser token, creating it on first contact. */
async function chatThread(env, request, payload, create = false) {
  const token = String(payload.token || '').trim();
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return { error: 'CHAT_BAD_TOKEN', status: 422 };

  const url = new URL(`${env.SUPABASE_URL}/rest/v1/chat_threads`);
  url.searchParams.set('select', 'id,mode,locale,display_name,email,unread_for_admin');
  url.searchParams.set('visitor_token', `eq.${token}`);
  url.searchParams.set('limit', '1');
  const found = await fetch(url, { headers: supabaseHeaders(env) });
  if (!found.ok) return { error: 'CHAT_READ_FAILED', status: 502 };
  const rows = await found.json();
  if (rows[0]) return { thread: rows[0] };
  if (!create) return { error: 'CHAT_NO_THREAD', status: 404 };

  const made = await insertRow(env, 'chat_threads', {
    visitor_token: token,
    locale: localeOf(payload.locale),
    display_name: trimmed(payload.name),
    email: String(payload.email || '').trim().toLowerCase() || null,
    ip_hash: await hashIp(env, request)
  }, 'id,mode,locale,display_name,email,unread_for_admin');
  if (!made.ok) return { error: 'CHAT_WRITE_FAILED', status: 502 };
  return { thread: made.row, fresh: true };
}

async function chatMessages(env, threadId, since = '') {
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/chat_messages`);
  url.searchParams.set('select', 'id,created_at,author,body');
  url.searchParams.set('thread_id', `eq.${threadId}`);
  url.searchParams.set('order', 'created_at.asc');
  url.searchParams.set('limit', String(CHAT_MAX_MESSAGES));
  if (since) url.searchParams.set('created_at', `gt.${since}`);
  const response = await fetch(url, { headers: supabaseHeaders(env) });
  if (!response.ok) return null;
  const rows = await response.json();
  return rows.map((row) => ({
    id: row.id,
    at: row.created_at,
    author: row.author,
    body: row.body
  }));
}

/** Sets the thread's mode without touching anything else. */
function setThreadMode(env, threadId, mode, extra = {}) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/chat_threads?id=eq.${threadId}`, {
    method: 'PATCH',
    headers: supabaseHeaders(env, { Prefer: 'return=minimal' }),
    body: JSON.stringify({ mode, ...extra })
  });
}

/**
 * Asks a model, but only with what it is allowed to know.
 *
 * Returns null on anything unexpected — no key, a refusal, a timeout, an answer that
 * looks like a hedge. Null means "a person should take this", which is the safe
 * direction to fail in when the subject is who may race and what they must wear.
 */
async function askModel(env, deck, history, question) {
  if (!env.AI_API_KEY) return null;
  const facts = [deck.faqWho, deck.faqCost, deck.faqEngine, deck.faqHelmet, deck.faqNumber, deck.faqWhen]
    .filter(Boolean)
    .join('\n');
  const system = 'You answer questions about the Carruleddhi Show 2026 cart race in Santa Teresa Gallura.\n'
    + `Reply in the same language as the question. Keep it under 60 words.\n`
    + 'These are the only facts you have:\n' + facts + '\n'
    + 'If the question is not answered by those facts, reply with exactly: ESCALATE\n'
    + 'Never invent a date, a price, a rule or a safety requirement.';
  try {
    const response = await fetch(env.AI_BASE_URL || 'https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.AI_API_KEY}`
      },
      body: JSON.stringify({
        model: env.AI_MODEL || 'gpt-4o-mini',
        max_tokens: 200,
        temperature: 0.2,
        messages: [
          { role: 'system', content: system },
          ...history.slice(-6).map((m) => ({
            role: m.author === 'visitor' ? 'user' : 'assistant',
            content: m.body
          })),
          { role: 'user', content: question }
        ]
      }),
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) return null;
    const body = await response.json();
    const answer = String(body?.choices?.[0]?.message?.content || '').trim();
    if (!answer || answer.includes('ESCALATE')) return null;
    return answer;
  } catch (_) {
    return null;
  }
}

/** Visitor side: open, send, poll. */
async function chatVisitor(env, request, payload, cors) {
  const action = String(payload.action || 'open');

  if (action === 'open') {
    const { thread, error, status } = await chatThread(env, request, payload, true);
    if (error) return json({ ok: false, code: error }, status, cors);
    const messages = await chatMessages(env, thread.id) || [];
    return json({ ok: true, mode: thread.mode, messages }, 200, cors);
  }

  if (action === 'poll') {
    const { thread, error, status } = await chatThread(env, request, payload, false);
    if (error) return json({ ok: false, code: error }, status, cors);
    const messages = await chatMessages(env, thread.id, String(payload.since || '')) || [];
    return json({ ok: true, mode: thread.mode, messages }, 200, cors);
  }

  if (action !== 'send') return json({ ok: false, code: 'CHAT_UNKNOWN_ACTION' }, 400, cors);

  const body = String(payload.message || '').trim();
  if (body.length < 1 || body.length > 2000) return json({ ok: false, code: 'CHAT_BAD_MESSAGE' }, 422, cors);

  const { thread, error, status } = await chatThread(env, request, payload, true);
  if (error) return json({ ok: false, code: error }, status, cors);

  const stored = await insertRow(env, 'chat_messages', {
    thread_id: thread.id,
    author: 'visitor',
    body
  });
  if (!stored.ok) return json({ ok: false, code: 'CHAT_WRITE_FAILED' }, 502, cors);

  // A name or an address given mid-conversation is worth keeping, so the organiser
  // knows who they are talking to without asking twice.
  const details = {};
  if (payload.name && !thread.display_name) details.display_name = trimmed(payload.name);
  if (payload.email && !thread.email) details.email = String(payload.email).trim().toLowerCase();
  if (Object.keys(details).length) await setThreadMode(env, thread.id, thread.mode, details);

  // Already with a person: nothing to answer automatically, and answering anyway
  // would talk over them.
  if (thread.mode === 'human') {
    return json({ ok: true, mode: 'human', reply: null }, 200, cors);
  }

  const deck = COPY_DECK[localeOf(thread.locale)] || COPY_DECK.it;
  let reply = faqAnswer(deck, body);
  if (!reply) {
    const history = await chatMessages(env, thread.id) || [];
    reply = await askModel(env, deck, history, body);
  }

  if (!reply) {
    await setThreadMode(env, thread.id, 'human');
    const handover = deck.chatHandover || 'Przekazuję to organizatorom — odpiszą tutaj.';
    await insertRow(env, 'chat_messages', { thread_id: thread.id, author: 'ai', body: handover });
    return json({ ok: true, mode: 'human', reply: handover }, 200, cors);
  }

  await insertRow(env, 'chat_messages', { thread_id: thread.id, author: 'ai', body: reply });
  return json({ ok: true, mode: 'ai', reply }, 200, cors);
}

/** Organiser side. Behind the same passphrase as the participant list. */
async function chatAdmin(env, payload, cors) {
  const action = String(payload.action || 'list');
  const threadId = String(payload.threadId || '');
  const validId = /^[0-9a-f-]{36}$/i.test(threadId);

  if (action === 'list') {
    const limit = Math.min(Math.max(Number(payload.limit) || 40, 1), 200);
    const url = new URL(`${env.SUPABASE_URL}/rest/v1/chat_threads`);
    url.searchParams.set('select', 'id,created_at,last_message_at,display_name,email,locale,mode,unread_for_admin');
    url.searchParams.set('order', 'last_message_at.desc');
    url.searchParams.set('limit', String(limit));
    const response = await fetch(url, { headers: supabaseHeaders(env) });
    if (!response.ok) return json({ ok: false, code: 'CHAT_READ_FAILED' }, 502, cors);
    const rows = await response.json();
    return json({
      ok: true,
      threads: rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        lastAt: row.last_message_at,
        name: row.display_name || '',
        email: row.email || '',
        locale: row.locale,
        mode: row.mode,
        unread: row.unread_for_admin
      }))
    }, 200, cors);
  }

  if (!validId) return json({ ok: false, code: 'CHAT_BAD_ID' }, 422, cors);

  if (action === 'messages') {
    const messages = await chatMessages(env, threadId);
    if (!messages) return json({ ok: false, code: 'CHAT_READ_FAILED' }, 502, cors);
    // Opening a thread is reading it.
    await fetch(`${env.SUPABASE_URL}/rest/v1/chat_threads?id=eq.${threadId}`, {
      method: 'PATCH',
      headers: supabaseHeaders(env, { Prefer: 'return=minimal' }),
      body: JSON.stringify({ unread_for_admin: 0 })
    }).catch(() => {});
    return json({ ok: true, messages }, 200, cors);
  }

  if (action === 'reply') {
    const body = String(payload.message || '').trim();
    if (body.length < 1 || body.length > 2000) return json({ ok: false, code: 'CHAT_BAD_MESSAGE' }, 422, cors);
    const stored = await insertRow(env, 'chat_messages', {
      thread_id: threadId,
      author: 'organiser',
      body
    });
    if (!stored.ok) return json({ ok: false, code: 'CHAT_WRITE_FAILED' }, 502, cors);
    // Once a person has spoken the bot stays out of it.
    await setThreadMode(env, threadId, 'human', { unread_for_admin: 0 });
    return json({ ok: true }, 200, cors);
  }

  if (action === 'mode') {
    const mode = ['ai', 'human', 'closed'].includes(payload.mode) ? payload.mode : null;
    if (!mode) return json({ ok: false, code: 'CHAT_BAD_MODE' }, 422, cors);
    const response = await setThreadMode(env, threadId, mode, { unread_for_admin: 0 });
    if (!response.ok) return json({ ok: false, code: 'CHAT_WRITE_FAILED' }, 502, cors);
    return json({ ok: true, mode }, 200, cors);
  }

  return json({ ok: false, code: 'CHAT_UNKNOWN_ACTION' }, 400, cors);
}

/**
 * The bell.
 *
 * Counts rather than rows: the panel wants a number next to an icon, and shipping
 * forty registrations to render "3" is forty times the payload for the same pixel.
 * `Prefer: count=exact` with a zero-row range asks Postgres for the count alone.
 */
async function inbox(env, payload, cors) {
  if (String(payload.action || 'counts') === 'seen') {
    await fetch(`${env.SUPABASE_URL}/rest/v1/admin_state?key=eq.inbox`, {
      method: 'PATCH',
      headers: supabaseHeaders(env, { Prefer: 'return=minimal' }),
      body: JSON.stringify({ seen_at: new Date().toISOString() })
    });
    return json({ ok: true }, 200, cors);
  }

  const stateUrl = new URL(`${env.SUPABASE_URL}/rest/v1/admin_state`);
  stateUrl.searchParams.set('select', 'seen_at');
  stateUrl.searchParams.set('key', 'eq.inbox');
  stateUrl.searchParams.set('limit', '1');
  const stateResponse = await fetch(stateUrl, { headers: supabaseHeaders(env) });
  const stateRows = stateResponse.ok ? await stateResponse.json() : [];
  const since = stateRows[0]?.seen_at || new Date(0).toISOString();

  async function countSince(table, column = 'created_at', extra = null) {
    const url = new URL(`${env.SUPABASE_URL}/rest/v1/${table}`);
    url.searchParams.set('select', 'id');
    url.searchParams.set(column, `gt.${since}`);
    if (extra) url.searchParams.set(extra[0], extra[1]);
    const response = await fetch(url, {
      headers: supabaseHeaders(env, { Prefer: 'count=exact', Range: '0-0' })
    });
    if (!response.ok) return 0;
    // "0-0/12" — the total is what matters, not the row.
    const range = response.headers.get('content-range') || '';
    return Number.parseInt(range.split('/')[1], 10) || 0;
  }

  const [registrations, contacts, reminders, newsletter, wall, chats] = await Promise.all([
    countSince('registrations'),
    countSince('contact_messages'),
    countSince('reminder_subscribers'),
    countSince('newsletter_subscribers'),
    countSince('wall_comments', 'created_at', ['approved', 'is.false']),
    countSince('chat_threads', 'last_message_at', ['mode', 'eq.human'])
  ]);

  return json({
    ok: true,
    since,
    counts: { registrations, contacts, reminders, newsletter, wall, chats },
    total: registrations + contacts + reminders + newsletter + wall + chats
  }, 200, cors);
}

/* ============================================================================
   Store of record
   ============================================================================
   Form submissions are written here first, then forwarded to Make for the e-mail.

   WHY THE ORDER MATTERS
     Make used to be both: it wrote the Google Sheet and sent the mail. That made the
     spreadsheet the store of record, and a spreadsheet is addressed by column
     position — insert a field in the middle and every value after it shifts one
     column to the right, silently. Ten under-18 columns went missing that way, and a
     `locale` once landed in `race_number`.

     Writing here first also means the race number comes from a sequence instead of a
     spreadsheet row, so it survives sorting and deleting, and the browser gets the
     real number in the response rather than a guess.

   WHAT MAKE IS LEFT WITH
     Sending mail. No Google connection, no column mapping, no row arithmetic.
   ============================================================================ */

const STORED_TYPES = new Set(['registration', 'reminder', 'contact']);
const LOCALES = new Set(['it', 'pl', 'en', 'de', 'es', 'fr']);

/* ============================================================================
   Wording, resolved here
   ============================================================================
   Make used to hold the whole six-language dictionary in one variable and pick from
   it with get(parseJSON(2.copy); 2.loc) in a second. Every template then quoted
   {{3.t.something}} — a variable of a variable of a variable, three modules deep,
   and Make draws those references differently from ordinary webhook fields. Hours
   went into arguing about whether that difference meant they were broken.

   It does not matter now. The language is decided here, the strings are resolved
   here, and they arrive at Make as fields of the request: {{1.copy.regLead}},
   {{1.subject}}. The same kind of field as {{1.firstName}}, which has never been in
   question. Two modules disappear from the scenario and the dictionary stays in
   emails/copy.json, where it was always edited.
   ============================================================================ */

/** Fills in %PLACEHOLDER% style markers. Missing values become an empty string. */
function fill(text, values) {
  return String(text || '').replace(/%([A-Z]+)%/g, (_, key) => String(values[key] ?? ''));
}

/**
 * Adds the resolved wording to the payload.
 *
 * `copy` is the whole language block, so a template can reach any string without a
 * new field being invented for it here. The handful alongside it are the ones that
 * need a value substituted, which a template cannot do on its own.
 */
function attachCopy(payload) {
  const locale = localeOf(payload.locale);
  const deck = COPY_DECK[locale] || COPY_DECK.it;
  const event = COPY_DECK._event || {};

  const firstName = String(payload.firstName || '').trim();
  const raceNumber = payload.raceNumber || '';

  payload.copy = deck;
  payload.ev = event;
  payload.loc = locale;
  payload.fullName = `${firstName} ${String(payload.lastName || '').trim()}`.trim();
  payload.generatedAt = new Intl.DateTimeFormat('pl-PL', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date()).replace(',', '');

  payload.hi = fill(deck.regHi, { FIRSTNAME: firstName });
  payload.help = fill(deck.regHelp, { ORGEMAIL: event.email, ORGPHONE: event.phone });
  payload.printFooter = fill(deck.printFooter, { GENERATEDAT: payload.generatedAt });

  // The subject the branch will actually use, with the number already in it. One
  // field instead of a replace() in five different Email modules.
  payload.subject = payload.isMinor
    ? fill(deck.minSubject, { FIRSTNAME: firstName, RACENUMBER: raceNumber })
    : fill(deck.regSubject, { FIRSTNAME: firstName, RACENUMBER: raceNumber });
  payload.remSubject = deck.remSubject7;
  payload.newsSubject = deck.newsSubject;
  payload.contactSubject = `Kontakt ze strony — ${String(payload.name || '').trim()}`;
  payload.newsHi = fill(deck.newsHi, { FIRSTNAME: firstName });

  /* The attachment. Decided here rather than with an if() in Make, for the same
     reason as everything else on this list: the flag it depends on was computed here
     from the birth date, and a copy of that decision in a second place is a copy that
     can disagree. */
  const base = (COPY_DECK._event?.site || 'https://www.carruleddhishow.com').replace(/\/+$/, '');
  payload.pdfUrl = payload.isMinor
    ? `${base}/emails/Carruleddhi-modulo-minori.pdf`
    : `${base}/emails/Carruleddhi-modulo.pdf`;
  payload.pdfName = payload.isMinor ? 'Carruleddhi-minori-' : 'Carruleddhi-modulo-';

  if (!payload.isMinor) return;

  // Under-18 wording. The inflected words come out of the deck by key, so an unknown
  // value gives the neutral form rather than an empty gap in a sentence.
  const childWord = deck.minChild?.[payload.childKind] || deck.minChild?.child || '';
  payload.childWord = childWord;
  payload.relWord = deck.minRel?.[payload.guardianRelation] || deck.minRel?.guardian || '';
  payload.minHi = fill(deck.minHi, { GUARDIAN: String(payload.guardianName || '').trim() });
  payload.minLead = fill(deck.minLead, { CHILD: childWord, FIRSTNAME: firstName });
  payload.ageNote = fill(deck.minAgeNote, { FIRSTNAME: firstName, AGE: payload.riderAge });
}

/** The database has a check constraint on locale; a browser can send anything. */
function localeOf(value) {
  const two = String(value || 'it').slice(0, 2).toLowerCase();
  return LOCALES.has(two) ? two : 'it';
}

const trimmed = (value, fallback = null) => {
  const text = String(value ?? '').trim();
  return text ? text : fallback;
};

/**
 * POST one row. Returns the inserted row when `select` is asked for.
 *
 * `upsertOn` names a column with a unique index, and turns the insert into "leave the
 * existing row alone". Three tables here have a unique index on email, and the right
 * answer to a duplicate differs by table:
 *
 *   reminder_subscribers, newsletter_subscribers — asking to be reminded twice is
 *     the same wish twice. Silently fine.
 *   registrations — a second entry on one address is a real conflict. It is not
 *     upserted; the caller is told, and tells the person.
 *
 * Without this, a duplicate came back as a bare 502 with no explanation, which is how
 * a returning visitor would have met the form.
 */
async function insertRow(env, table, row, select = '', upsertOn = '') {
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/${table}`);
  if (select) url.searchParams.set('select', select);
  if (upsertOn) url.searchParams.set('on_conflict', upsertOn);

  const prefer = [select ? 'return=representation' : 'return=minimal'];
  // "ignore" and not "merge": a second signup must not overwrite the name and locale
  // recorded the first time, which may well be the better data.
  if (upsertOn) prefer.push('resolution=ignore-duplicates');

  const response = await fetch(url, {
    method: 'POST',
    headers: supabaseHeaders(env, { Prefer: prefer.join(',') }),
    body: JSON.stringify([row])
  });

  if (!response.ok) {
    // Postgres says useful things here — a violated constraint names itself — and
    // 23505 is specifically "that already exists", which the caller can act on.
    const detail = await response.text().catch(() => '');
    return {
      ok: false,
      status: response.status,
      duplicate: detail.includes('23505') || detail.includes('duplicate key'),
      detail: detail.slice(0, 400)
    };
  }
  if (!select) return { ok: true, row: null };
  const rows = await response.json().catch(() => []);
  return { ok: true, row: Array.isArray(rows) ? rows[0] : null };
}

/**
 * Writes a submission and, for a registration, returns the race number.
 *
 * `newsConsent` on a registration also adds a newsletter row. That is one form
 * producing two records on purpose: the entry is for this year and the subscription
 * outlives it, so withdrawing from the race must not silently unsubscribe them, and
 * unsubscribing must not touch the entry.
 */
async function storeIntake(env, request, type, payload) {
  const locale = localeOf(payload.locale);

  if (type === 'contact') {
    const stored = await insertRow(env, 'contact_messages', {
      name: trimmed(payload.name, ''),
      email: String(payload.email || '').trim().toLowerCase(),
      message: trimmed(payload.message, ''),
      locale,
      status: 'new',
      ip_hash: await hashIp(env, request)
    });
    return stored.ok ? { ok: true } : { ok: false, ...stored };
  }

  if (type === 'reminder') {
    const stored = await insertRow(env, 'reminder_subscribers', {
      name: trimmed(payload.name, ''),
      email: String(payload.email || '').trim().toLowerCase(),
      locale,
      consent_at: new Date().toISOString(),
      // Lets a future "stop these" link identify the row without exposing its id.
      unsubscribe_token: crypto.randomUUID().replace(/-/g, ''),
      status: 'active'
    }, '', 'email');
    return stored.ok ? { ok: true } : { ok: false, ...stored };
  }

  // registration
  const row = {
    first_name: trimmed(payload.firstName, ''),
    last_name: trimmed(payload.lastName, ''),
    birth_date: trimmed(payload.birthDate),
    postal_code: trimmed(payload.postalCode),
    email: String(payload.email || '').trim().toLowerCase(),
    phone: trimmed(payload.phone),
    address: trimmed(payload.address),
    cart_name: trimmed(payload.cartName, ''),
    category: payload.category === 'art' ? 'art' : 'classic',
    team_name: trimmed(payload.teamName),
    cart_notes: trimmed(payload.cartNotes),
    locale,
    rules_consent: Boolean(payload.rulesConsent),
    privacy_consent: Boolean(payload.privacyConsent),
    news_consent: Boolean(payload.newsConsent),
    status: 'new',
    email_status: 'pending',
    is_minor: Boolean(payload.isMinor),
    rider_age: Number.parseInt(payload.riderAge, 10) || null
  };

  // Guardian block only on a minor entry. The handler has already stripped these
  // from an adult one; sending nulls keeps the row honest either way.
  if (payload.isMinor) {
    Object.assign(row, {
      child_kind: ['son', 'daughter', 'child'].includes(payload.childKind) ? payload.childKind : 'child',
      guardian_relation: ['mother', 'father', 'guardian'].includes(payload.guardianRelation)
        ? payload.guardianRelation
        : 'guardian',
      guardian_name: trimmed(payload.guardianName),
      guardian_email: String(payload.guardianEmail || '').trim().toLowerCase() || null,
      guardian_phone: trimmed(payload.guardianPhone),
      mother_name: trimmed(payload.motherName),
      father_name: trimmed(payload.fatherName),
      guardian_consent: Boolean(payload.guardianConsent)
    });
  }

  const stored = await insertRow(env, 'registrations', row, 'race_number');
  if (!stored.ok) {
    /* A second entry on one address is not a server fault, it is a fact the person
       needs to hear. Told apart here so the API can answer 409 with something the
       form can put on screen, instead of the 502 they used to get. */
    return { ok: false, ...stored, code: stored.duplicate ? 'ALREADY_REGISTERED' : 'STORE_FAILED' };
  }

  // Best effort: a failed newsletter row must not fail the registration. They ticked
  // a box about next year; the entry for this year is the thing that matters.
  if (payload.newsConsent) {
    await insertRow(env, 'newsletter_subscribers', {
      name: `${row.first_name} ${row.last_name}`.trim(),
      email: row.email,
      locale,
      source: 'registration',
      status: 'active'
    }, '', 'email').catch(() => {});
  }

  return { ok: true, raceNumber: stored.row?.race_number ?? null };
}

function supabaseHeaders(env, extra = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

/** Salted hash of the caller's address. The address itself is never stored. */
async function hashIp(env, request) {
  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const data = new TextEncoder().encode(`${env.WALL_SALT || 'carruleddhi'}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

/**
 * A short-lived link to a photo in the private bucket.
 *
 * The bucket is private so an unapproved upload is unreachable even by URL. Approved
 * rows get a signed link, valid for an hour: long enough for a visit, short enough
 * that a copied link stops working before it can be passed around.
 */
async function signPhoto(env, path) {
  if (!path) return '';
  const response = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/sign/wall-photos/${encodeURI(path)}`,
    {
      method: 'POST',
      headers: supabaseHeaders(env),
      body: JSON.stringify({ expiresIn: 3600 })
    }
  );
  if (!response.ok) return '';
  const body = await response.json().catch(() => null);
  const signed = body && body.signedURL;
  if (!signed) return '';
  return `${env.SUPABASE_URL}/storage/v1${signed.startsWith('/') ? '' : '/'}${signed}`;
}

async function wallList(env, payload, cors) {
  const limit = Math.min(Math.max(Number(payload.limit) || 12, 1), 50);
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/wall_comments`);
  url.searchParams.set(
    'select',
    'id,created_at,display_name,place,message,locale,rating,photo_path,photo_width,photo_height'
  );
  url.searchParams.set('approved', 'eq.true');
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('limit', String(limit + 1));
  // Keyset pagination: cheaper and stable while new rows are being approved.
  if (payload.before) url.searchParams.set('created_at', `lt.${payload.before}`);

  const response = await fetch(url, { headers: supabaseHeaders(env) });
  if (!response.ok) return json({ ok: false, code: 'WALL_READ_FAILED' }, 502, cors);
  const rows = await response.json();
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);

  // Signing is one request per photo, so they go in parallel rather than in a loop.
  const photos = await Promise.all(page.map((row) => signPhoto(env, row.photo_path)));

  // The average is a separate one-row read from a view that only ever returns
  // aggregates, so it costs nothing worth caching.
  let rating = null;
  const ratingResponse = await fetch(
    `${env.SUPABASE_URL}/rest/v1/wall_rating?select=votes,average&limit=1`,
    { headers: supabaseHeaders(env) }
  ).catch(() => null);
  if (ratingResponse && ratingResponse.ok) {
    const summary = await ratingResponse.json().catch(() => null);
    if (Array.isArray(summary) && summary[0]) {
      rating = { votes: Number(summary[0].votes) || 0, average: Number(summary[0].average) || 0 };
    }
  }

  return json({
    ok: true,
    comments: page.map((row, index) => ({
      id: row.id,
      createdAt: row.created_at,
      name: row.display_name,
      place: row.place || '',
      message: row.message,
      locale: row.locale,
      rating: row.rating || null,
      photo: photos[index] || '',
      photoWidth: row.photo_width || null,
      photoHeight: row.photo_height || null
    })),
    rating,
    hasMore
  }, 200, cors);
}

/**
 * Translates one message on request.
 *
 * MyMemory is used because it is documented, free and needs no key. It is also rate
 * limited and its quality is ordinary, so translation is a button the visitor
 * presses rather than something done to every message on load: nobody pays for a
 * translation nobody asked for, and the original stays the source of truth.
 *
 * Anything longer than 500 characters is refused rather than truncated — half a
 * translated sentence is worse than none.
 */
async function wallTranslate(env, payload, cors) {
  const source = String(payload.text || '').trim().slice(0, 500);
  const from = String(payload.from || '').slice(0, 2).toLowerCase() || 'it';
  const to = String(payload.to || '').slice(0, 2).toLowerCase() || 'en';
  if (source.length < 2) return json({ ok: false, code: 'TRANSLATE_EMPTY' }, 422, cors);
  if (from === to) return json({ ok: true, text: source, same: true }, 200, cors);

  const url = new URL('https://api.mymemory.translated.net/get');
  url.searchParams.set('q', source);
  url.searchParams.set('langpair', `${from}|${to}`);

  const response = await fetch(url, { signal: AbortSignal.timeout(9000) }).catch(() => null);
  if (!response || !response.ok) return json({ ok: false, code: 'TRANSLATE_FAILED' }, 502, cors);
  const body = await response.json().catch(() => null);
  const translated = body?.responseData?.translatedText;
  if (!translated) return json({ ok: false, code: 'TRANSLATE_FAILED' }, 502, cors);

  return json({ ok: true, text: String(translated).slice(0, 800), provider: 'MyMemory' }, 200, cors);
}

/**
 * Moderation, behind the same passphrase as the participant roster.
 *
 * `list` returns everything including unapproved rows, which is the whole point: a
 * moderator has to see what has not been shown yet. That is also why this sits in
 * PROTECTED_TYPES — without the header it never runs.
 */
async function wallAdmin(env, payload, cors) {
  const action = String(payload.action || 'list');

  if (action === 'list') {
    const limit = Math.min(Math.max(Number(payload.limit) || 40, 1), 200);
    const url = new URL(`${env.SUPABASE_URL}/rest/v1/wall_comments`);
    url.searchParams.set(
      'select',
      'id,created_at,display_name,place,message,locale,rating,approved,photo_path'
    );
    url.searchParams.set('order', 'created_at.desc');
    url.searchParams.set('limit', String(limit));
    const response = await fetch(url, { headers: supabaseHeaders(env) });
    if (!response.ok) return json({ ok: false, code: 'WALL_READ_FAILED' }, 502, cors);
    const rows = await response.json();
    const photos = await Promise.all(rows.map((row) => signPhoto(env, row.photo_path)));
    return json({
      ok: true,
      comments: rows.map((row, index) => ({
        id: row.id,
        createdAt: row.created_at,
        name: row.display_name,
        place: row.place || '',
        message: row.message,
        locale: row.locale,
        rating: row.rating || null,
        approved: Boolean(row.approved),
        photo: photos[index] || ''
      }))
    }, 200, cors);
  }

  const id = String(payload.id || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ ok: false, code: 'WALL_BAD_ID' }, 422, cors);

  if (action === 'approve' || action === 'hide') {
    const approving = action === 'approve';
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/wall_comments?id=eq.${id}`,
      {
        method: 'PATCH',
        headers: supabaseHeaders(env, { Prefer: 'return=minimal' }),
        body: JSON.stringify({
          approved: approving,
          approved_at: approving ? new Date().toISOString() : null
        })
      }
    );
    if (!response.ok) return json({ ok: false, code: 'WALL_WRITE_FAILED' }, 502, cors);
    return json({ ok: true, id, approved: approving }, 200, cors);
  }

  if (action === 'delete') {
    // `return=representation` so the row comes back on the way out. Deleting the row
    // first and then asking for its photo path would mean asking a row that is gone;
    // the file would stay in the bucket with nothing left pointing at it.
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/wall_comments?id=eq.${id}&select=photo_path`,
      { method: 'DELETE', headers: supabaseHeaders(env, { Prefer: 'return=representation' }) }
    );
    if (!response.ok) return json({ ok: false, code: 'WALL_WRITE_FAILED' }, 502, cors);
    const removed = await response.json().catch(() => []);
    const path = Array.isArray(removed) && removed[0] ? removed[0].photo_path : '';
    await removePhoto(env, path);
    return json({ ok: true, id, deleted: true }, 200, cors);
  }

  return json({ ok: false, code: 'WALL_UNKNOWN_ACTION' }, 400, cors);
}

/**
 * Turns the browser's data URL into bytes, or refuses it.
 *
 * Two checks, not one. The declared media type decides what the bucket will accept,
 * so it is checked against the allow list — but a declaration is just a string a
 * caller chose. The first bytes of the file are checked as well, because that is the
 * part that cannot be claimed: a script renamed to .jpg still starts with the wrong
 * bytes. Without the second check the bucket would happily store arbitrary content
 * under an image media type, and something downstream would eventually serve it.
 */
const PHOTO_TYPES = {
  'image/jpeg': { ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
  'image/png': { ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] },
  'image/webp': { ext: 'webp', magic: null } // RIFF....WEBP, checked separately.
};
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

function decodePhoto(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!match) return { error: 'WALL_PHOTO_FORMAT' };
  const spec = PHOTO_TYPES[match[1]];
  if (!spec) return { error: 'WALL_PHOTO_FORMAT' };

  let binary;
  try {
    binary = atob(match[2]);
  } catch (_) {
    return { error: 'WALL_PHOTO_FORMAT' };
  }
  if (binary.length > PHOTO_MAX_BYTES) return { error: 'WALL_PHOTO_TOO_LARGE' };
  if (binary.length < 64) return { error: 'WALL_PHOTO_FORMAT' };

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);

  const looksRight = spec.magic
    ? spec.magic.every((byte, index) => bytes[index] === byte)
    // WebP: "RIFF" at 0, "WEBP" at 8.
    : bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  if (!looksRight) return { error: 'WALL_PHOTO_FORMAT' };

  return { bytes, contentType: match[1], ext: spec.ext };
}

/** Stores the file and returns its path, or an empty string if the upload failed. */
async function uploadPhoto(env, photo) {
  // Random name, not the visitor's: a predictable path in a bucket is a directory
  // listing waiting to happen, and a caller-supplied one is a path traversal.
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${photo.ext}`;
  const response = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/wall-photos/${path}`,
    {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': photo.contentType,
        'Cache-Control': 'max-age=31536000'
      },
      body: photo.bytes
    }
  );
  return response.ok ? path : '';
}

async function removePhoto(env, path) {
  if (!path) return;
  await fetch(`${env.SUPABASE_URL}/storage/v1/object/wall-photos/${path}`, {
    method: 'DELETE',
    headers: supabaseHeaders(env)
  }).catch(() => {});
}

async function wallPost(env, request, payload, cors) {
  const name = String(payload.name || '').trim().slice(0, WALL_MAX_NAME);
  const place = String(payload.place || '').trim().slice(0, WALL_MAX_NAME);
  const message = String(payload.message || '').trim().slice(0, WALL_MAX_MESSAGE);
  if (name.length < 1 || message.length < 2) {
    return json({ ok: false, code: 'WALL_VALIDATION' }, 422, cors);
  }

  // A score is optional. Anything outside 1–5 is dropped rather than clamped: a
  // clamped 9 would be recorded as a five-star review nobody left.
  const ratingRaw = Number(payload.rating);
  const rating = Number.isInteger(ratingRaw) && ratingRaw >= 1 && ratingRaw <= 5 ? ratingRaw : null;

  const width = Math.min(Math.max(Number(payload.photoWidth) || 0, 0), 20000) || null;
  const height = Math.min(Math.max(Number(payload.photoHeight) || 0, 0), 20000) || null;

  const ipHash = await hashIp(env, request);

  // Three messages per quarter of an hour per address. Checked against the table
  // rather than KV so the limit survives a Worker restart and applies even when
  // the optional KV namespace is not bound.
  const since = new Date(Date.now() - WALL_POST_WINDOW_SECONDS * 1000).toISOString();
  const countUrl = new URL(`${env.SUPABASE_URL}/rest/v1/wall_comments`);
  countUrl.searchParams.set('select', 'id');
  countUrl.searchParams.set('ip_hash', `eq.${ipHash}`);
  countUrl.searchParams.set('created_at', `gte.${since}`);
  const recent = await fetch(countUrl, { headers: supabaseHeaders(env, { Prefer: 'count=exact' }) });
  if (recent.ok) {
    const rows = await recent.json();
    if (Array.isArray(rows) && rows.length >= WALL_POST_MAX) {
      return json({ ok: false, code: 'WALL_RATE_LIMITED' }, 429, {
        ...cors,
        'Retry-After': String(WALL_POST_WINDOW_SECONDS)
      });
    }
  }

  // The file goes up before the row, so a row never points at an object that is not
  // there. The reverse order would put a broken image on the wall the moment a
  // moderator approved it.
  let photoPath = '';
  if (payload.photo) {
    const photo = decodePhoto(payload.photo);
    if (photo.error) return json({ ok: false, code: photo.error }, 422, cors);
    photoPath = await uploadPhoto(env, photo);
    if (!photoPath) return json({ ok: false, code: 'WALL_PHOTO_FAILED' }, 502, cors);
  }

  const insert = await fetch(`${env.SUPABASE_URL}/rest/v1/wall_comments`, {
    method: 'POST',
    headers: supabaseHeaders(env, { Prefer: 'return=minimal' }),
    body: JSON.stringify([{
      display_name: name,
      place: place || null,
      message,
      locale: payload.locale || 'it',
      rating,
      photo_path: photoPath || null,
      photo_width: photoPath ? width : null,
      photo_height: photoPath ? height : null,
      approved: false,
      ip_hash: ipHash,
      user_agent: String(request.headers.get('User-Agent') || '').slice(0, 300)
    }])
  });
  if (!insert.ok) {
    // Nothing references the file now, so it is removed instead of being left to sit
    // in the bucket forever consuming quota nobody can account for.
    await removePhoto(env, photoPath);
    return json({ ok: false, code: 'WALL_WRITE_FAILED' }, 502, cors);
  }

  // `pending: true` is the honest answer: the message exists but nobody can see it
  // yet. Telling the visitor it is live would be a lie they would notice.
  return json({ ok: true, pending: true, photo: Boolean(photoPath), rating }, 200, cors);
}

/**
 * Two totals and up to five sets of initials, in one request.
 *
 * Reads the `public_counts` view, never the tables. The view runs with its owner's
 * rights and returns only aggregates and two-letter initials, so even if this
 * response were somehow cached or logged there is no name, address or e-mail in it.
 */
async function readCounts(env, cors) {
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/public_counts`);
  url.searchParams.set('select', 'attendees,pilots,initials');
  url.searchParams.set('limit', '1');

  const response = await fetch(url, { headers: supabaseHeaders(env) });
  if (!response.ok) return json({ ok: false, code: 'COUNTS_FAILED' }, 502, cors);

  const rows = await response.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return json({ ok: true, attendees: 0, pilots: 0, initials: [] }, 200, cors);

  return json({
    ok: true,
    attendees: Number(row.attendees) || 0,
    pilots: Number(row.pilots) || 0,
    initials: Array.isArray(row.initials) ? row.initials.filter(Boolean).slice(0, 5) : []
  }, 200, cors);
}

/**
 * Records one press of the big button.
 *
 * The visitor id is generated in the browser and kept in localStorage. It is not an
 * account and not a fingerprint; it exists so a second press from the same person
 * does not count twice. The unique index does the enforcing, and a duplicate comes
 * back as 409, which is a success from the visitor's point of view — they are
 * already counted.
 */
async function recordAttendance(env, request, payload, cors) {
  const visitorId = String(payload.attendeeId || '').trim();
  if (visitorId.length < 8 || visitorId.length > 64) {
    return json({ ok: false, code: 'ATTENDANCE_BAD_ID' }, 422, cors);
  }

  const insert = await fetch(`${env.SUPABASE_URL}/rest/v1/attendance`, {
    method: 'POST',
    headers: supabaseHeaders(env, { Prefer: 'return=minimal,resolution=ignore-duplicates' }),
    body: JSON.stringify([{
      visitor_id: visitorId,
      locale: payload.locale || null,
      ip_hash: await hashIp(env, request)
    }])
  });
  // 409 means this visitor already pressed it. Nothing to report.
  if (!insert.ok && insert.status !== 409) {
    return json({ ok: false, code: 'ATTENDANCE_FAILED' }, 502, cors);
  }
  // Answer with the fresh total so the counter on the page is right immediately.
  return readCounts(env, cors);
}

function sanitizePayload(type, input) {
  const allowed = [...FIELD_WHITELIST.common, ...(FIELD_WHITELIST[type] || [])];
  const output = {};
  for (const key of allowed) {
    const value = input[key];
    if (value === undefined || value === null) continue;
    // A data URL is hundreds of kilobytes, so the 3000 character cap would quietly
    // truncate it into a corrupt image. It is passed through untouched here and
    // validated properly in wallPost, where the format is actually known.
    if (LONG_FIELDS.has(key)) {
      if (typeof value === 'string' && value) output[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      const items = value.map(sanitizeScalar).filter((item) => item !== undefined).slice(0, 10);
      if (items.length) output[key] = items;
      continue;
    }
    const scalar = sanitizeScalar(value);
    if (scalar !== undefined && scalar !== '') output[key] = scalar;
  }
  output.type = type;
  return output;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ADULT_AGE = 18;
const CHILD_KINDS = new Set(['child', 'son', 'daughter']);
const GUARDIAN_RELATIONS = new Set(['mother', 'father', 'guardian']);

/**
 * Whole years completed on `onDate`. Kept identical to the browser's version.
 *
 * The browser decides which fields to show; this decides whether the submission is
 * acceptable. Both have to reach the same answer from the same birth date, or a
 * form that looked complete would be rejected — so the rule is duplicated on
 * purpose rather than trusted from the request.
 */
function ageOn(birthISO, onDate) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(birthISO || ''))) return null;
  const birth = new Date(`${String(birthISO).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  let years = onDate.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    onDate.getUTCMonth() < birth.getUTCMonth() ||
    (onDate.getUTCMonth() === birth.getUTCMonth() && onDate.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) years -= 1;
  return years;
}

function validate(type, payload, env) {
  if (type === 'registration') {
    const required = ['firstName', 'lastName', 'email', 'phone', 'address', 'cartName', 'birthDate', 'postalCode'];
    const missing = required.filter((key) => !payload[key]);
    if (missing.length) return `Missing fields: ${missing.join(', ')}`;
    if (!EMAIL_PATTERN.test(payload.email)) return 'Invalid email';
    if (payload.rulesConsent !== true || payload.privacyConsent !== true) return 'Consent required';

    /* Minors.
       The age is recomputed here from the birth date rather than read from
       `isMinor`. A caller that sets `isMinor: false` by hand would otherwise skip
       the guardian requirement entirely, which is the one rule on this form with
       legal weight behind it. */
    const eventDate = new Date(env.EVENT_DATE || '2026-10-17T14:30:00+02:00');
    const age = ageOn(payload.birthDate, Number.isNaN(eventDate.getTime()) ? new Date() : eventDate);
    if (age === null || age < 0 || age > 120) return 'Invalid birthDate';

    if (age < ADULT_AGE) {
      const guardianMissing = ['guardianName', 'guardianEmail', 'guardianPhone']
        .filter((key) => !payload[key]);
      if (guardianMissing.length) return `Minor rider, missing: ${guardianMissing.join(', ')}`;
      if (!EMAIL_PATTERN.test(payload.guardianEmail)) return 'Invalid guardianEmail';
      if (payload.guardianConsent !== true) return 'Guardian consent required';
      if (!GUARDIAN_RELATIONS.has(String(payload.guardianRelation))) return 'Invalid guardianRelation';
      if (payload.childKind && !CHILD_KINDS.has(String(payload.childKind))) return 'Invalid childKind';
    }
    return null;
  }
  if (type === 'reminder') {
    if (!payload.name || !EMAIL_PATTERN.test(payload.email || '')) return 'Invalid name or email';
    if (payload.consent !== true) return 'Consent required';
    return null;
  }
  if (type === 'contact') {
    if (!payload.name || !EMAIL_PATTERN.test(payload.email || '')) return 'Invalid name or email';
    if (!payload.message || payload.message.length < 10) return 'Message too short';
    return null;
  }
  if (type === 'attendance') {
    if (!payload.attendeeId || payload.attendeeId.length > 80) return 'Invalid attendeeId';
    return null;
  }
  return null;
}

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
}

/** Read-modify-write in KV is not atomic; good enough to stop casual flooding. */
async function overRateLimit(env, request, type) {
  if (!env.RATE_LIMIT || type === 'counts') return false;
  const key = `rl:${type}:${clientIp(request)}`;
  const ceiling = type === 'roster' ? 12 : RATE_LIMIT_MAX;
  const current = Number.parseInt((await env.RATE_LIMIT.get(key)) || '0', 10) || 0;
  if (current >= ceiling) return true;
  await env.RATE_LIMIT.put(key, String(current + 1), { expirationTtl: RATE_LIMIT_WINDOW_SECONDS });
  return false;
}

/** Constant-time-ish comparison so a wrong key cannot be guessed byte by byte. */
function secretsMatch(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

async function turnstileOk(env, request, token) {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET);
  body.append('response', token);
  body.append('remoteip', clientIp(request));
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const result = await response.json().catch(() => ({ success: false }));
  return result.success === true;
}

export default {
  // `ctx` is needed for waitUntil: the attendance forward to Make must outlive the
  // response, so a slow webhook never delays the counter coming back.
  async fetch(request, env, ctx) {
    const cors = corsHeaders(request, env);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!url.pathname.startsWith('/api/carruleddhi')) return new Response('Not found', { status: 404, headers: cors });
    if (request.method !== 'POST') return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405, cors);

    // The ceiling depends on the route, and the route is in the path, so it is read
    // before the body. Only the wall may carry an image.
    const pathType = url.pathname.replace(/^\/api\/carruleddhi\/?/, '').replace(/\/+$/, '');
    const bodyCeiling = WALL_FAMILY.has(pathType) ? MAX_PHOTO_BODY_BYTES : MAX_BODY_BYTES;

    const raw = await request.text();
    if (raw.length > bodyCeiling) return json({ ok: false, code: 'PAYLOAD_TOO_LARGE' }, 413, cors);

    let input;
    try {
      input = JSON.parse(raw || '{}');
    } catch (_) {
      return json({ ok: false, code: 'INVALID_JSON' }, 400, cors);
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return json({ ok: false, code: 'INVALID_JSON' }, 400, cors);
    }

    // The path segment wins over the body so a spoofed "type" cannot cross routes.
    //
    // The wall is the one exception, and a deliberate one: the page is configured
    // with a single wall endpoint, so reading, posting, translating and moderating
    // all arrive at /wall and are told apart by the body. The refinement is closed
    // to the wall family, so a body cannot reach `roster` or `registration` from
    // here, and `wall-admin` still has to clear the passphrase check below.
    const segment = pathType;
    const bodyType = String(input.type || '').toLowerCase();
    let type;
    if (segment === 'wall' && WALL_FAMILY.has(bodyType)) {
      type = bodyType;
    } else if (ALLOWED_TYPES.has(segment)) {
      type = segment;
    } else {
      type = bodyType;
    }
    if (!ALLOWED_TYPES.has(type)) return json({ ok: false, code: 'UNKNOWN_TYPE' }, 400, cors);

    if (PROTECTED_TYPES.has(type)) {
      if (!env.ROSTER_KEY) return json({ ok: false, code: 'ROSTER_DISABLED' }, 503, cors);
      if (!secretsMatch(request.headers.get(ROSTER_HEADER), env.ROSTER_KEY)) {
        return json({ ok: false, code: 'ROSTER_UNAUTHORISED' }, 401, cors);
      }
    } else if (!(await turnstileOk(env, request, input.turnstileToken))) {
      return json({ ok: false, code: 'CAPTCHA_FAILED' }, 403, cors);
    }
    if (await overRateLimit(env, request, type)) {
      return json({ ok: false, code: 'RATE_LIMITED' }, 429, { ...cors, 'Retry-After': String(RATE_LIMIT_WINDOW_SECONDS) });
    }

    const payload = sanitizePayload(type, input);
    // The path segment is the only trustworthy source of the type, and the Make
    // router branches on payload.type. Copying it in means the scenario keeps
    // working even if the browser omits the field or sends a spoofed one.
    payload.type = type;

    // The wall lives in Supabase and never reaches Make, so it is answered here,
    // after the shared rate limit and captcha checks above have already run.
    if (SUPABASE_TYPES.has(type)) {
      if (!wallReady(env)) return json({ ok: false, code: 'WALL_DISABLED' }, 503, cors);
      if (type === 'wall') return wallList(env, payload, cors);
      if (type === 'wall-post') return wallPost(env, request, payload, cors);
      if (type === 'wall-translate') return wallTranslate(env, payload, cors);
      if (type === 'chat') return chatVisitor(env, request, payload, cors);
      if (type === 'chat-admin') return chatAdmin(env, payload, cors);
      if (type === 'inbox') return inbox(env, payload, cors);
      return wallAdmin(env, payload, cors);
    }

    // Counts and attendance come from Supabase when it is configured. Without it the
    // request falls through to Make exactly as before, so nothing breaks if only
    // half the stack is set up.
    if (SUPABASE_FIRST.has(type) && wallReady(env)) {
      if (type === 'counts') return readCounts(env, cors);
      const recorded = await recordAttendance(env, request, payload, cors);
      // The press is also forwarded to Make so the organiser's own automations keep
      // seeing it, but a webhook failure must not lose a recorded press: the answer
      // is already on its way back.
      if (env.MAKE_WEBHOOK_URL) {
        const forward = { 'Content-Type': 'application/json' };
        if (env.INTAKE_SHARED_KEY) forward['X-Carruleddhi-Key'] = env.INTAKE_SHARED_KEY;
        ctx.waitUntil(
          fetch(env.MAKE_WEBHOOK_URL, {
            method: 'POST',
            headers: forward,
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(10000)
          }).catch(() => {})
        );
      }
      return recorded;
    }

    if (!env.MAKE_WEBHOOK_URL) return json({ ok: false, code: 'NOT_CONFIGURED' }, 503, cors);
    const problem = validate(type, payload, env);
    if (problem) return json({ ok: false, code: 'VALIDATION_FAILED', detail: problem }, 422, cors);

    // Make branches on `isMinor` and picks a different template and PDF from it, so
    // it is overwritten here with the value computed from the birth date. Trusting
    // the browser's flag would let a crafted request pick the adult liberatoria for
    // a child.
    if (type === 'registration') {
      const eventDate = new Date(env.EVENT_DATE || '2026-10-17T14:30:00+02:00');
      const age = ageOn(payload.birthDate, Number.isNaN(eventDate.getTime()) ? new Date() : eventDate);
      payload.riderAge = String(age);
      payload.isMinor = age < ADULT_AGE;
      if (!payload.isMinor) {
        // A guardian on an adult entry is either a mistake or an attempt to get a
        // second address onto the mailing. Dropped rather than forwarded.
        for (const key of ['childKind', 'guardianRelation', 'guardianName', 'guardianEmail', 'guardianPhone', 'motherName', 'fatherName', 'guardianConsent']) {
          delete payload[key];
        }
      }
    }

    /* Database first, Make second.
       If the row cannot be written the request fails here, before any e-mail goes
       out. The alternative — mail sent, nothing stored — produces a rider holding a
       number that exists in no list, which is worse than a visible error they can
       act on by trying again. */
    if (STORED_TYPES.has(type) && wallReady(env)) {
      const stored = await storeIntake(env, request, type, payload);
      if (!stored.ok) {
        // 409 for "you are already on the list", 502 for anything actually broken.
        // Same shape either way, so the form can branch on the code.
        const duplicate = stored.code === 'ALREADY_REGISTERED';
        return json(
          { ok: false, code: stored.code || 'STORE_FAILED', detail: duplicate ? null : stored.detail || null },
          duplicate ? 409 : 502,
          cors
        );
      }
      // Make no longer counts spreadsheet rows to find this. It arrives as a field.
      if (stored.raceNumber) payload.raceNumber = String(stored.raceNumber).padStart(3, '0');
    }

    /**
     * One field that names the branch Make should take.
     *
     * Make's filters compare one value at a time, and combining two conditions with
     * AND — "a registration AND under 18" — is where its blueprint format is easiest
     * to get subtly wrong, because a failed filter ends the whole route rather than
     * skipping a module. Deciding it here turns every filter in the scenario into a
     * single text comparison against this field, which cannot be misread.
     *
     * It is also the honest place for the decision: the age was computed above from
     * the birth date, so the branch is derived from the same fact rather than from a
     * flag the browser sent.
     */
    payload.branch = type === 'registration'
      ? (payload.isMinor ? 'registration-minor' : 'registration-adult')
      : type;

    attachCopy(payload);

    const headers = { 'Content-Type': 'application/json' };
    if (env.INTAKE_SHARED_KEY) headers['X-Carruleddhi-Key'] = env.INTAKE_SHARED_KEY;

    let upstream;
    try {
      upstream = await fetch(env.MAKE_WEBHOOK_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(25000)
      });
    } catch (error) {
      return json({ ok: false, code: 'UPSTREAM_UNREACHABLE' }, 502, cors);
    }

    const text = await upstream.text();
    if (!upstream.ok) {
      return json({ ok: false, code: 'UPSTREAM_ERROR', status: upstream.status }, 502, cors);
    }

    /* Make often answers "Accepted" in plain text when no Webhook Response module
       runs — and it no longer needs one. The race number comes from the database
       sequence, which this Worker already has, so the answer is authoritative here
       and Make is free to be nothing but a mailer. */
    const answer = { ok: true };
    if (payload.raceNumber) answer.raceNumber = payload.raceNumber;

    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return json({ ...answer, rows: parsed }, 200, cors);
      if (parsed && typeof parsed === 'object') {
        // Our own number wins. Make cannot know it better than the sequence does.
        return json({ ...parsed, ...answer }, 200, cors);
      }
      return json(answer, 200, cors);
    } catch (_) {
      return json(answer, 200, cors);
    }
  }
};
