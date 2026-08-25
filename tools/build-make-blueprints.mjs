/**
 * Builds ready-to-import Make.com blueprints.
 *
 * Why a generator instead of hand-written JSON: the blueprints have to carry the
 * whole six-language copy deck and two 6 kB e-mail templates inside string
 * fields. Escaping that by hand is how you get a file Make refuses to import.
 *
 * Run:  node tools/build-make-blueprints.mjs
 * Out:  make/blueprint-1-instant.json
 *       make/blueprint-2-reminders.json
 *
 * Sheet layout assumed by both blueprints (same header row in every tab):
 *   A submittedAt  B locale   C raceNumber  D firstName  E lastName
 *   F birthDate    G postalCode  H email    I phone      J address
 *   K cartName     L category M teamName    N cartNotes  O newsConsent
 *   P rulesConsent Q lastReminder
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

const ZONE = 'eu1.make.com';
const SITE = 'https://www.carruleddhishow.com';
const ORG_EMAIL = 'info@carruleddhishow.com';

/**
 * CallMeBot pairing for the organiser's own WhatsApp number.
 * This is not a secret in the usual sense — the key only lets someone message
 * this one number, and CallMeBot ignores anything after "Stop" is sent to the
 * bot — but it is still a live credential, so keep it out of public repos.
 */
/**
 * Who gets the WhatsApp notice.
 *
 * A list, because CallMeBot pairs one key to one number and there is no way to address
 * two people with a single request — a second phone needs a second call. The generator
 * makes one HTTP module per entry, so adding an organiser is one line here rather than
 * a module cloned by hand and then forgotten about the next time the text changes.
 *
 * To add somebody: they send "I allow callmebot to send me messages" to +34 621 331 709
 * on WhatsApp, the bot replies with their personal apikey, and both values go below.
 */
const CALLMEBOT = [
  { label: 'organizator', phone: '48665626101', apikey: '2990681' },
  // No leading + and no spaces. CallMeBot reads this straight out of a query string,
  // and a "+" there is a URL-encoded space rather than a country code.
  { label: 'Santa Teresa', phone: '393284981574', apikey: '3364881' }
];

/* ---------------------------------------------------------------- copy deck */

const copyRaw = JSON.parse(read('emails/copy.json'));
delete copyRaw._readme;
const COPY = JSON.stringify(copyRaw);

/* ------------------------------------------------------------ mail bodies */

/** Strips the leading HTML comment block used as a note for the reader. */
function body(file) {
  return read(file).replace(/^<!--[\s\S]*?-->\s*/, '').trim();
}

/* Anchors that must point at a resolved field rather than at the deck.
   Each of these deck strings carries a %TOKEN% the renderer knows nothing about, so
   quoting the deck directly puts the token itself into the letter. The help line went
   out as "Napisz na %ORGEMAIL% albo zadzwoń: %ORGPHONE%." for exactly this reason: the
   rewrite below used to look for `{{3.t.regHelp}}`, an anchor from an older version of
   the template, and a String.replace that matches nothing fails silently.
   swap() throws instead, so a renamed anchor stops the build. */
const REG_TEMPLATE = swap(body('emails/make-registration.html'), '{{1.copy.regHelp}}', '{{1.help}}');

/**
 * The block about the attachments, in both bodies, pointed at precomputed fields.
 *
 * Four strings that used to be read straight out of the deck, and cannot be any more:
 * how many forms are attached now depends on the language. An Italian rider gets one
 * file, so "Two PDFs attached / print only the Italian copy" is simply untrue for
 * them — and the renderer has no if() to decide with.
 *
 * So the function decides. attachCopy() picks adult or under-18 wording and one-file
 * or two-file wording, and writes the four it settled on. The template quotes a field,
 * the same as it does for the subject.
 */
const attachmentBlock = (html) => html
  .replace(/\{\{1\.copy\.regPrintTitle\}\}/g, '{{1.printTitle}}')
  .replace(/\{\{1\.copy\.regPrintBody\}\}/g, '{{1.printBody}}')
  .replace(/\{\{1\.copy\.regPdfTitle\}\}/g, '{{1.pdfTitle}}')
  .replace(/\{\{1\.copy\.regPdfBody\}\}/g, '{{1.pdfBody}}');

const MIN_HTML = attachmentBlock(minorHtml(REG_TEMPLATE));

/* The greeting carries %FIRSTNAME%, so it has to come from the resolved field and not
   from the deck. This used to rewrite `{{3.t.regHi}}` — an anchor that stopped existing
   when the template was moved onto `{{1.copy.*}}`, so the replace matched nothing and
   every adult confirmation went out reading "Ciao %FIRSTNAME%," in full.
   Throwing on a missing anchor rather than replacing quietly, because that is the only
   difference between the bug and the fix. */
const REG_HTML = attachmentBlock(
  swap(REG_TEMPLATE, '{{1.copy.regHi}}', '{{1.hi}}').replace('<!--GUARDIAN-ROWS-->', '')
);

/** Replaces an anchor, or throws if the template no longer contains it. */
function swap(html, from, to) {
  if (!html.includes(from)) throw new Error(`anchor not found in the template: ${from}`);
  return html.split(from).join(to);
}

/**
 * The under-18 version of the same e-mail.
 *
 * Derived from the adult template rather than kept as a second file. A separate
 * 9 kB copy would look identical on the day it was written and drift the first
 * time the layout changed — and a minor's confirmation quietly looking two
 * redesigns old is worse than the duplication saving any effort.
 *
 * What changes: it is addressed to the person who signs, it says whose entry it
 * is, and it carries the guardian rows in the details table. Everything else —
 * the dates, the map link, the checklist — is the same information.
 */
function minorHtml(adultHtml) {
  const cell = 'padding:9px 0;border-bottom:1px solid #eef2fa;';
  const guardianRows = [
    ['minLabels.guardian', '{{1.guardianName}}'],
    ['minLabels.relation', '{{1.relWord}}'],
    ['minLabels.guardianEmail', '{{lower(1.guardianEmail)}}'],
    ['minLabels.guardianPhone', '{{1.guardianPhone}}'],
    ['minLabels.riderAge', '{{1.riderAge}}'],
    ['minLabels.mother', '{{ifempty(1.motherName; "—")}}'],
    ['minLabels.father', '{{ifempty(1.fatherName; "—")}}']
  ]
    .map(([label, value]) =>
      `<tr><td style="${cell}color:#5f709a;">{{1.copy.${label}}}</td>`
      + `<td style="${cell}font-weight:700;">${value}</td></tr>`)
    .join('\n      ');

  let html = adultHtml;
  const swaps = [
    // Greeting and opening line both carry placeholders, so they come from
    // module 3 where the guardian name and the child word are already resolved.
    ['{{1.copy.regHi}}', '{{1.minHi}}'],
    ['{{1.copy.regLead}}', '{{1.minLead}}'],
    ['{{1.copy.regPreheader}}', '{{1.copy.minPreheader}}'],
    /* The four attachment strings are NOT swapped here.
       They are rewritten afterwards by attachmentBlock(), for both bodies alike,
       because the choice between adult and under-18 wording is now made in the same
       breath as the choice between one attached form and two — and only the function
       knows both. See attachmentBlock() above. */
    ['{{1.copy.regCta}}', '{{1.copy.minCta}}'],
    ['<!--GUARDIAN-ROWS-->', guardianRows]
  ];
  for (const [from, to] of swaps) {
    if (!html.includes(from)) {
      // Loud rather than silent: a missed swap would ship a minor's e-mail
      // addressed to the child and signed by nobody.
      throw new Error(`minorHtml: anchor not found in the template: ${from}`);
    }
    html = html.split(from).join(to);
  }
  // The age sentence goes under the opening line, before the number block.
  return html.replace(
    '{{1.minLead}}',
    '{{1.minLead}}</p>\n    <p style="margin:8px 0 0;font-size:14px;color:#5f709a;">{{1.ageNote}}'
  );
}

/**
 * The reminder body, pointed at fields the function computes.
 *
 * The template was written for a Make scenario that read a Google Sheet, so it is full
 * of `switch(2.due; …)` — pick the 7-day heading, or the 1-day one, or the 3-hour one —
 * and one `if(length(race_number) > 0; …)`. Every one of those is a decision, and the
 * five-line renderer in the function makes no decisions.
 *
 * They move to attachCopy(), which already knows which reminder is going out and in
 * which language, and the template quotes the result. Same swap as the confirmation
 * bodies went through; the reason it is spelled out separately is that this file is the
 * only place the old Make expressions still existed.
 */
const REM_SWITCHES = [
  ['{{switch(2.due; "7d"; "7 dni"; "1d"; "1 dzień"; "3 godziny")}}', '{{1.remWindow}}'],
  ['{{switch(2.due; "7d"; 4.t.remHeading7; "1d"; 4.t.remHeading1; 4.t.remHeading3)}}', '{{1.remHeading}}'],
  ['{{switch(2.due; "7d"; 4.t.remBody7; "1d"; 4.t.remBody1; 4.t.remBody3)}}', '{{1.remBody}}'],
  ['{{if(length(1.race_number) > 0; "#" + 1.race_number + " — " + 4.t.remRiderNote; 4.t.footerNote)}}', '{{1.remRiderLine}}'],
  // Carries %FIRSTNAME%, so it cannot come straight from the deck.
  ['{{1.copy.regHi}}', '{{1.hi}}']
];

const REM_DUE_HTML = REM_SWITCHES.reduce((html, [from, to]) => swap(html, from, to), body('emails/make-reminder.html'));

/* There was a second copy of the reminder body here, compiled for Make instead of for the
   function: it rewrote `{{4.t.regHi}}` to pull the rider's name out of column C of a
   Google Sheet. Both things it depended on are gone — the sheet, and the Make module
   numbered 4 that held the copy deck — so it is gone with them. */

/**
 * Swaps the %RACENUMBER% placeholder for the real Make expression.
 *
 * The bodies are written with a literal placeholder because the templates are also
 * opened in a browser to check the layout, and {{1.raceNumber}} renders as noise
 * there. The substitution happens here, at build time, rather than with a runtime
 * replace() in Make: a replace() around a whole HTML document was what forced the
 * body into a variable in the first place, and that variable is what Make rejected.
 */
const withRaceNumber = (html) => html.split('%RACENUMBER%').join('{{1.raceNumber}}');

/* ------------------------------------------------------------ tiny helpers */

let seq = 0;
const at = (x, y) => ({ designer: { x, y } });

/* setVars() lived here and is gone.
   It built a Tools > Set variable module. Nothing needs one any more: the copy deck and
   every piece of resolved wording arrive as ordinary webhook fields, which is the change
   that took scenario 1 from 63 kB to 13 and scenario 2 from six modules to three. */

/** Google Sheets "Add a Row". spreadsheetId is left blank on purpose so Make
 *  makes you pick the file after import — a hard-coded id would silently point
 *  at nothing.
 *
 *  UNUSED. Kept only because the shape is hard-won — module version 2, `from: 'drive'`,
 *  `mode: 'select'`, values keyed by column index — and if a sheet is ever wanted back
 *  alongside Supabase, this is the shape that imports without a red field. Nothing calls
 *  it; Supabase is the store of record. */
function addRow(id, x, y, sheet, values, filter) {
  return {
    id,
    module: 'google-sheets:addRow',
    version: 2,
    parameters: { __IMTCONN__: null },
    ...(filter ? { filter } : {}),
    mapper: {
      from: 'drive',
      mode: 'select',
      spreadsheetId: '',
      sheetId: sheet,
      includesHeaders: true,
      insertDataOption: 'INSERT_ROWS',
      valueInputOption: 'USER_ENTERED',
      insertUnformatted: false,
      values
    },
    metadata: at(x, y)
  };
}

/**
 * Email > Send an Email.
 *
 * The exact shape matters and was guessed wrong the first time: the module is
 * version 7, not 4, and Make renders an unknown version as a grey "Module Not
 * Found" circle with no explanation. The connection also lives in `account`, not
 * the usual `__IMTCONN__`.
 *
 * `saveAfterSent` stays false on purpose. Setting it true makes the module want a
 * second, IMAP connection (`accountImap`) plus a sent-mail folder name, which is
 * one more thing to configure for no benefit — Zimbra already keeps a copy.
 */
function sendEmail(id, x, y, { to, subject, html, replyTo, attachments, filter, bcc }) {
  return {
    id,
    module: 'email:ActionSendEmail',
    version: 7,
    parameters: { account: null, saveAfterSent: false },
    ...(filter ? { filter } : {}),
    mapper: {
      to: Array.isArray(to) ? to : [to],
      subject,
      contentType: 'html',
      html,
      attachments: attachments || [],
      cc: [],
      bcc: bcc || [],
      from: '',
      sender: '',
      replyTo: replyTo || ORG_EMAIL,
      headers: [],
      priority: 'normal',
      inReplyTo: '',
      references: []
    },
    metadata: {
      ...at(x, y),
      restore: {
        expect: {
          to: { mode: 'chose', items: [null] },
          cc: { mode: 'chose' },
          bcc: { mode: 'chose' },
          priority: { label: 'Normal' },
          references: { mode: 'chose' },
          attachments: { mode: 'chose' },
          contentType: { label: 'HTML' }
        },
        parameters: { saveAfterSent: { label: 'No' } }
      },
      parameters: [
        { name: 'account', type: 'account:email', label: 'Connection', required: true },
        { name: 'saveAfterSent', type: 'boolean', label: 'Save message after sending', required: true }
      ]
    }
  };
}

function httpGetFile(id, x, y, url, filter) {
  return {
    id,
    module: 'http:ActionGetFile',
    version: 3,
    parameters: { handleErrors: false },
    ...(filter ? { filter } : {}),
    mapper: {
      url,
      method: 'get',
      headers: [],
      qs: [],
      serializeUrl: false,
      shareCookies: false,
      ca: null,
      rejectUnauthorized: true,
      followRedirect: true,
      useQuerystring: false,
      gzip: true,
      useMtls: false,
      authUser: '',
      authPass: '',
      timeout: null
    },
    metadata: at(x, y)
  };
}

/**
 * HTTP > Make a request.
 *
 * `options` exists for the one caller that needs more than a GET with a query string:
 * the reminder scenario POSTs a passphrase header and reads JSON back. Defaults are the
 * GET shape the notification modules use, so adding the parameter changed nothing for
 * them.
 */
function httpRequest(id, x, y, url, qs, filter, options = {}) {
  const method = options.method || 'get';
  const body = options.body ?? '';
  return {
    id,
    module: 'http:ActionSendData',
    version: 3,
    parameters: { handleErrors: false, useNewZLibDeCompress: true },
    ...(filter ? { filter } : {}),
    mapper: {
      url,
      method,
      headers: options.headers || [],
      qs: qs || [],
      /* `raw` and a `data` string, not a form. A JSON body in Make is the raw type with
         the Content-Type header set by hand; picking `application/json` from the body
         type list makes Make build the JSON itself out of a key/value collection, which
         is a different thing and not what an empty `{}` needs. */
      ...(body ? { bodyType: 'raw', contentType: 'application/json', data: body } : { bodyType: null }),
      parseResponse: Boolean(options.parseResponse),
      serializeUrl: false,
      shareCookies: false,
      ca: null,
      rejectUnauthorized: true,
      followRedirect: true,
      /* Make refuses to run the module without this, with a message that names it:
         "The required followAllRedirects field is missing." It is a separate switch
         from followRedirect — that one follows a redirect on the initial method, this
         one follows redirects after the method has been rewritten to GET. `false`
         because the target is a fixed API endpoint that does not redirect, and a
         notification that quietly follows a redirect somewhere else is not a
         notification worth having. */
      followAllRedirects: false,
      useQuerystring: false,
      gzip: true,
      useMtls: false,
      authUser: '',
      authPass: '',
      timeout: null
    },
    metadata: at(x, y)
  };
}

/**
 * Webhooks > Webhook response.
 *
 * Without it Make answers the browser with the bare word "Accepted" and the page
 * falls back to a number it guessed locally — which drifts from the spreadsheet
 * the moment a row is added by hand. Responding here makes the number on screen
 * the same number that is in column B and in the e-mail.
 *
 * Placed straight after the row is written and before the PDF is fetched, so the
 * participant is not left waiting on an HTTP download and an SMTP handshake.
 */
function webhookRespond(id, x, y, body) {
  return {
    id,
    module: 'gateway:WebhookRespond',
    version: 1,
    parameters: {},
    mapper: {
      status: '200',
      body,
      headers: [{ key: 'Content-Type', value: 'application/json' }]
    },
    metadata: { ...at(x, y), restore: { expect: { headers: { mode: 'chose' } } } }
  };
}

/**
 * A router.
 *
 * Needed a second time because of how Make treats filters. A filter is not an "if":
 * when it fails, the whole route stops there and nothing after it runs. So two Email
 * modules in a line, one filtered to adults and one to minors, cannot both be
 * reachable — a minor's entry fails the first filter and the route dies before it
 * ever sees the second module, taking the organiser's notification with it.
 *
 * A router is the construct that means "one of these". Each route gets its own copy
 * of the bundle and its own filter, and a route that filters out costs the others
 * nothing.
 */
function router(id, x, y, routes) {
  return { id, module: 'builtin:BasicRouter', version: 1, mapper: null, metadata: at(x, y), routes };
}

/**
 * Tools > Sleep.
 *
 * Seconds, and Make caps it at 300. Long enough for what it is needed for here: the
 * newsletter confirmation is triggered by the same form submission as the registration
 * confirmation, so without a pause two letters land in the same inbox in the same
 * second — which reads as a system that has lost track of itself, and buries the one
 * with the race number in it.
 *
 * A delay is not a queue. If Make is busy the whole route waits, which is fine for a
 * courtesy note and would not be for the confirmation; that is why the sleep is on this
 * route and not on the one that matters.
 */
function sleep(id, x, y, seconds, filter) {
  return {
    id,
    module: 'builtin:BasicSleep',
    version: 1,
    parameters: {},
    ...(filter ? { filter } : {}),
    mapper: { duration: String(Math.min(Math.max(seconds, 1), 300)) },
    metadata: {
      ...at(x, y),
      expect: [{ name: 'duration', type: 'uinteger', label: 'Delay', required: true }]
    }
  };
}

const eq = (name, a, b) => ({ name, conditions: [[{ a, b, o: 'text:equal' }]] });

/**
 * One of the four registration routes.
 *
 * `{{1.branch}}` is a single word the function computed from the birth date and the
 * chosen language: registration-adult-it, registration-adult-xx, registration-minor-it,
 * registration-minor-xx. So the filter is one text comparison, as everywhere else in
 * this scenario, and the two facts behind it were settled in one place.
 *
 * What actually differs between the four:
 *
 *   minor    who the letter goes to, and which of the two bodies the function rendered
 *   foreign  one attachment or two
 *
 * The body itself does not vary here — {{1.html}} is already the right letter in the
 * right language, because the function picked the template before sending the request.
 */
function registrationRoute({ y, minor, foreign, pdfIt, pdfOwn, mail }) {
  const branch = `registration-${minor ? 'minor' : 'adult'}-${foreign ? 'xx' : 'it'}`;
  const label = `${minor ? 'under 18' : 'adult'} — ${foreign ? 'foreign language' : 'italiano'}`;

  const flow = [
    // The Italian form. Always fetched, always attached: it is the only version the
    // organisers accept, whoever is entering.
    httpGetFile(pdfIt, 1250, y, '{{1.pdfUrl}}', eq(label, '{{1.branch}}', branch))
  ];

  const attachments = [{ fileName: '{{1.pdfName}}{{1.raceNumber}}.pdf', data: `{{${pdfIt}.data}}` }];

  if (foreign) {
    /* The same form in the rider's own language, as a second file rather than a second
       page. It is a courtesy copy — it says so on it — and keeping it separate means
       the thing they have to print and hand in is a one-page document and not page one
       of two. No filter on this module: the route it sits on is already the foreign
       one, and a second filter would be a second place for the same decision. */
    flow.push(httpGetFile(pdfOwn, 1470, y, '{{1.pdfUrlOwn}}'));
    attachments.push({ fileName: '{{1.pdfNameOwn}}{{1.raceNumber}}.pdf', data: `{{${pdfOwn}.data}}` });
  }

  flow.push(sendEmail(mail, foreign ? 1750 : 1600, y, {
    /* Under 18: both of them, openly.
       The guardian first, because they are the one who signs and the letter is written
       to them. The rider second, as a visible recipient rather than a blind copy: a
       fourteen-year-old who typed their own address in expects to hear something back,
       and "we sent it to your mother" is not that. Seeing each other on the same
       message is also the point — the form and the number are one thing they have to
       sort out together.

       If the rider left no address the second slot resolves to the organiser's, which
       is a duplicate of the blind copy and harmless. An empty recipient is not
       harmless: most servers reject the whole message for it. */
    to: minor
      ? ['{{lower(1.guardianEmail)}}', `{{ifempty(lower(1.email); "${ORG_EMAIL}")}}`]
      : '{{lower(1.email)}}',
    // Blind copy so every entry lands in the organiser's inbox as well, without the
    // rider seeing a second address on their own confirmation.
    bcc: [ORG_EMAIL],
    subject: '{{1.subject}}',
    html: '{{1.html}}',
    attachments
  }));

  return { flow };
}

function wrap(name, flow, instant) {
  return {
    name,
    flow,
    metadata: {
      instant: Boolean(instant),
      version: 1,
      scenario: {
        roundtrips: 1,
        maxErrors: 3,
        autoCommit: true,
        autoCommitTriggerLast: true,
        sequential: false,
        slots: null,
        confidential: false,
        dataloss: false,
        dlq: false,
        freshVariables: false
      },
      designer: { orphans: [] },
      zone: ZONE
    }
  };
}

/* =============================================================== SCENARIO 1
   Instant. One webhook, one router, four routes. Fires only when data lands. */

/**
 * Column maps for the sheets that already exist in the operator's file.
 *
 * The first version of this generator invented its own 17-column layout and
 * mapped by position. The real file has different headers, so `locale` landed in
 * `race_number`, `raceNumber` in `first_name`, and every value after that was one
 * column out. Read from the published CSV and from the module screenshots, the
 * actual layouts are below. Mapping stays positional because that is what Make's
 * `values` collection is keyed by — so these lists have to stay in step with the
 * header rows. `HEADERS` is exported into the docs for exactly that reason.
 */
const HEADERS = {
  Registrations: [
    'created_at', 'race_number', 'first_name', 'last_name', 'birth_date',
    'postal_code', 'email', 'phone', 'address', 'cart_name', 'category',
    'team_name', 'cart_notes', 'locale', 'rules_consent', 'privacy_consent',
    'news_consent', 'status', 'pdf_it_url', 'pdf_translated_url', 'email_status',
    'printed_at',
    /* Under-18 riders. Appended at the end (W onwards) so every existing column
       keeps its position — Make maps by index, so inserting one of these in the
       middle would silently shift every value after it by one, which is exactly
       the bug that put `loc` into `race_number` the first time round. */
    'is_minor', 'rider_age', 'child_kind', 'guardian_relation', 'guardian_name',
    'guardian_email', 'guardian_phone', 'mother_name', 'father_name',
    'guardian_consent'
  ],
  Reminders: [
    'id', 'created_at', 'name', 'email', 'locale', 'race_number', 'consent_at',
    'unsubscribe_token', 'reminder_7d_at', 'reminder_1d_at', 'reminder_3h_at',
    'sent_7d_at', 'sent_1d_at', 'sent_3h_at', 'locked_until', 'status'
  ],
  Contacts: ['created_at', 'name', 'email', 'message', 'locale', 'status'],
  Newsletter: ['created_at', 'name', 'email', 'locale', 'source', 'status']
};

/* REMINDER_MARKER_INDEX (column Q on the Reminders sheet) was here.
   Scenario 2 used it to write "7d", "1d" or "3h" back into a spreadsheet cell by column
   number. The same fact now lives in `reminder_subscribers.last_reminder`, written by the
   function in the same call that renders the letters — a named column instead of the
   sixteenth one, which is the difference that made the guardian columns go missing the
   first time round. */

/** Builds a Make `values` collection from a header-name → expression object. */
function row(sheet, map) {
  const headers = HEADERS[sheet];
  const unknown = Object.keys(map).filter((key) => !headers.includes(key));
  if (unknown.length) throw new Error(`${sheet}: no such column ${unknown.join(', ')}`);
  const out = {};
  headers.forEach((header, index) => {
    out[String(index)] = map[header] ?? '';
  });
  return out;
}

const NOW = '{{formatDate(now; "YYYY-MM-DD HH:mm:ss"; "Europe/Rome")}}';

const regRow = row('Registrations', {
  created_at: NOW,
  // Filled in by module 10 once the row number is known.
  race_number: '',
  first_name: '{{1.firstName}}',
  last_name: '{{1.lastName}}',
  birth_date: '{{1.birthDate}}',
  postal_code: '{{1.postalCode}}',
  email: '{{lower(1.email)}}',
  phone: '{{1.phone}}',
  address: '{{1.address}}',
  cart_name: '{{1.cartName}}',
  category: '{{1.category}}',
  team_name: '{{1.teamName}}',
  cart_notes: '{{1.cartNotes}}',
  locale: '{{1.loc}}',
  rules_consent: '{{if(1.rulesConsent; "yes"; "no")}}',
  privacy_consent: '{{if(1.privacyConsent; "yes"; "no")}}',
  news_consent: '{{if(1.newsConsent; "yes"; "no")}}',
  status: 'new',
  email_status: 'pending',
  // The Worker recomputes isMinor from the birth date and strips the guardian
  // fields off adult entries, so on an adult row these all land empty.
  is_minor: '{{if(1.isMinor; "yes"; "no")}}',
  rider_age: '{{1.riderAge}}',
  child_kind: '{{1.childKind}}',
  guardian_relation: '{{1.guardianRelation}}',
  guardian_name: '{{1.guardianName}}',
  guardian_email: '{{lower(1.guardianEmail)}}',
  guardian_phone: '{{1.guardianPhone}}',
  mother_name: '{{1.motherName}}',
  father_name: '{{1.fatherName}}',
  guardian_consent: '{{if(1.guardianConsent; "yes"; "no")}}'
});

const remindRow = row('Reminders', {
  id: '{{uuid}}',
  created_at: NOW,
  name: '{{1.name}}',
  email: '{{lower(1.email)}}',
  locale: '{{1.loc}}',
  consent_at: NOW,
  // Lets a "stop sending me these" link identify the row without exposing the id.
  unsubscribe_token: '{{md5(lower(1.email))}}',
  status: 'active'
});

const contactRow = row('Contacts', {
  created_at: NOW,
  name: '{{1.name}}',
  email: '{{lower(1.email)}}',
  message: '{{1.message}}',
  locale: '{{1.loc}}',
  status: 'new'
});

const newsRow = row('Newsletter', {
  created_at: NOW,
  name: '{{trim(1.firstName)}} {{trim(1.lastName)}}',
  email: '{{lower(1.email)}}',
  locale: '{{1.loc}}',
  source: 'registration',
  status: 'active'
});

const instantFlow = [
  {
    id: 1,
    module: 'gateway:CustomWebHook',
    version: 1,
    parameters: { hook: null, maxResults: 1 },
    mapper: {},
    metadata: {
      ...at(0, 0),
      restore: { parameters: { hook: { label: 'carruleddhi' } } },
      parameters: [
        { name: 'hook', type: 'hook:gateway-webhook', label: 'Webhook', required: true },
        { name: 'maxResults', type: 'number', label: 'Maximum number of results' }
      ]
    }
  },

  /* Modules 2 and 3 used to sit here.

     Module 2 carried the whole six-language copy deck in one variable; module 3
     picked the submitter's language out of it and built every subject and greeting.
     Twenty-six kilobytes of dictionary and forty expressions, inside a tool whose
     job is sending mail.

     The Vercel function does it now. It already knew the language, already had the
     deck in the repository and already had to compute the age, so it resolves the
     wording and puts it in the request: {{1.copy.regLead}}, {{1.subject}},
     {{1.minHi}}. Ordinary webhook fields, the same kind as {{1.firstName}}.

     Two fewer modules to configure after every import, one less place for the
     wording to live, and nothing left in the scenario that reads a variable of a
     variable of a variable. */

  /* Module 5 used to sit here too, holding the five e-mail bodies.

     Twenty-four kilobytes of table markup in a tool whose job is sending mail, and
     every reference inside it a variable of a variable — which is exactly why Make
     drew them differently from ordinary fields and why one missing reference was so
     hard to spot.

     The Vercel function renders them now and the finished letter arrives as one
     field: {{1.html}}. The Content box of every Email module holds that single item.

     Templates live in emails/make-registration.html and are compiled into
     worker/email-templates.js at build time. They may contain plain paths and
     nothing else; the generator throws if one still calls a Make function, and the
     value it needed gets computed in attachCopy() instead. That is what keeps the
     renderer in the function five lines long rather than an expression language. */

  /* ==========================================================================
     One router, six flat routes, no nesting.
     --------------------------------------------------------------------------
     WHAT THIS REPLACED
       A router whose registration branch held a spreadsheet write, a variable
       module, a webhook response, a PDF fetch and a second router inside it. Six
       modules deep before an e-mail went out, and every one of them a place for the
       run to stop.

       Three things let it collapse. The Worker writes the database, so the four
       Google Sheets modules are gone along with mapping by column position. The
       Worker answers the browser with the race number from the sequence, so the
       Webhook Response module is gone. And the Worker names the branch, so the
       adult / under-18 split is a filter on one field instead of a nested router.

     WHY A ROUTER AT ALL
       One webhook receives four different kinds of submission and each needs a
       different letter. A filter is not an "if" in Make: when it fails, the route
       ends and everything after it is skipped. So two filtered Email modules in a
       line cannot both be reachable — the first filter that fails takes the rest of
       the line with it. A router is the construct that means "one of these", and
       each route here is one or two modules long.

     EVERY FILTER IS ONE TEXT COMPARISON
       Against {{1.branch}}, which the Worker sets from the age it computed itself.
       No AND, no boolean quirks, nothing to misread.
     ========================================================================== */
  router(4, 900, 0, [
    /* ---- A / B: the four registration routes ----------------------------
       Two questions, so four routes: under 18 or not, Italian or not.

       The age decides which letter and which form; the language decides how many
       forms are attached. An Italian rider gets the Italian one and nothing else. A
       foreign rider gets two files — the Italian form to sign and the same form in
       their own language to read it by — which needs a second HTTP module, and a
       module cannot be skipped on a shared route: a filter in Make ends the route it
       sits on, taking the e-mail with it. Hence four routes rather than two with an
       if() in them. See registrationRoute() for what differs between them. */
    registrationRoute({ y: -760, minor: false, foreign: false, pdfIt: 7,  mail: 8 }),
    registrationRoute({ y: -560, minor: false, foreign: true,  pdfIt: 22, pdfOwn: 23, mail: 24 }),
    registrationRoute({ y: -360, minor: true,  foreign: false, pdfIt: 19, mail: 16 }),
    registrationRoute({ y: -160, minor: true,  foreign: true,  pdfIt: 25, pdfOwn: 26, mail: 27 }),

    /* ---- C: tell the organiser, either way -------------------------------
       Its own route rather than a module appended to A and B, which would have
       meant two copies of it and two places to change the number. Filtered on
       {{1.type}} so it fires for an adult and a minor alike.

       Deliberately no name, e-mail or phone: the query string travels through a
       third-party host and lands in its logs. A race number and a category are
       enough to know an entry arrived, and mean nothing to anyone else. */
    {
      flow: CALLMEBOT.map((recipient, index) => httpRequest(
        /* 9 for the first, then 30, 31… so existing module numbers do not shift when
           somebody is added and the instructions stop matching the canvas. Numbered
           from 30 rather than from 20: the registration routes now use 22 to 27, and
           the earlier `19 + index` would have handed the second organiser id 21, which
           is the Sleep module in front of the newsletter. Two modules with one id is a
           blueprint Make imports and then behaves strangely on. */
        index === 0 ? 9 : 29 + index,
        1250,
        60 + index * 130,
        'https://api.callmebot.com/whatsapp.php',
        [
          { name: 'phone', value: recipient.phone },
          { name: 'apikey', value: recipient.apikey },
          {
            /* Full details, at your request.
               Worth knowing what that costs: CallMeBot is not an official WhatsApp
               gateway, so this query string travels through somebody else's server
               and lands in their logs. A name and a phone number in there is a
               participant's data sitting somewhere neither of you controls.
               It goes to your own number and it is your call — but the earlier
               version deliberately sent only a race number for this reason, and the
               same information is one click away in the admin panel. */
            /* Italian, because this arrives on the organisers' phones and the event
               is Italian. One fact per line: a WhatsApp notification is read from a
               lock screen in two seconds, and a paragraph is not.

               *asterisks* are WhatsApp's own bold. The newlines are real newlines in
               the query string; Make percent-encodes them and CallMeBot renders them
               as line breaks.

               The last line only exists for an under-18 entry — an empty if() branch
               leaves nothing behind rather than a stray label. */
            name: 'text',
            value: '🏁 *CARRULEDDHI SHOW 2026*'
              + '\nNuova iscrizione ricevuta'
              + '\n'
              + '\n🔢 Numero di partenza: *{{1.raceNumber}}*'
              + '\n👤 {{1.firstName}} {{1.lastName}}'
              + '\n🛞 Carruleddhu: {{1.cartName}}'
              + '\n🏷️ Categoria: {{upper(1.category)}}'
              + '\n🌍 Lingua: {{upper(1.loc)}}'
              + '\n📞 {{1.phone}}'
              + '\n✉️ {{lower(1.email)}}'
              /* The age is on this line and not above it on purpose. On an adult entry
                 the whole block disappears, and a "Età: 32" floating in a notice about
                 a grown-up is noise. Where it matters — somebody who needs a signature
                 — it sits next to the name of the person who has to give it. */
              /* One expression, no nested braces. {{ }} inside {{ }} is not a thing in
                 Make — the inner pair closes the outer one and the rest of the line is
                 sent as literal text. Fields are joined with + instead. */
              + '{{if(1.isMinor; "\n\n⚠️ *MINORENNE* — " + 1.riderAge + " anni'
                + '\n✍️ Chi firma: " + 1.guardianName + "\n📧 " + lower(1.guardianEmail)'
                + ' + "\n📱 " + 1.guardianPhone; "")}}'
          }
        ],
        /* Every recipient carries the filter. A route in Make stops at the first
           failed filter, so putting it only on the first module would mean a second
           organiser is notified about reminders and contact messages too. */
        eq(`whatsapp — ${recipient.label}`, '{{1.type}}', 'registration')
      ))
    },

    /* ---- D: reminder list ----------------------------------------------- */
    {
      flow: [
        sendEmail(12, 1250, 200, {
          filter: eq('reminder', '{{1.branch}}', 'reminder'),
          to: '{{lower(1.email)}}',
          subject: '{{1.remSubject}}',
          html: '{{1.html}}'
        })
      ]
    },

    /* ---- E: contact form ------------------------------------------------- */
    {
      flow: [
        sendEmail(14, 1250, 420, {
          filter: eq('contact', '{{1.branch}}', 'contact'),
          to: ORG_EMAIL,
          replyTo: '{{lower(1.email)}}',
          subject: '{{1.contactSubject}}',
          html: '{{1.html}}'
        })
      ]
    },

    /* ---- F: "tell me about the next edition" -----------------------------
       Fires alongside A or B when the box was ticked, which is why it is a route of
       its own and not a step inside them. A row in a table is not a promise anyone
       can see; this is the one message that says the box did something, and states
       the limit out loud. */
    {
      flow: [
        /* Ninety seconds behind the confirmation.
           Both letters come from one form submission, so without this they arrive in the
           same second — and the courtesy note about next year buries the one carrying a
           race number and a form to sign. The filter is on the sleep rather than the
           e-mail so an entry without the box ticked does not sit here waiting first. */
        sleep(21, 1250, 640, 90, {
          name: 'newsletter opt-in',
          conditions: [[{ a: '{{1.newsConsent}}', o: 'boolean:equal', b: 'true' }]]
        }),
        sendEmail(18, 1580, 640, {
          to: '{{lower(1.email)}}',
          subject: '{{1.newsSubject}}',
          html: '{{1.newsletterHtml}}'
        })
      ]
    }
  ])
];

/* --------------------------------------------------- small inline templates */

function shell(inner) {
  return [
    '<!doctype html><html><body style="margin:0;padding:0;background:#e9f1ff;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"',
    ' style="background:#e9f1ff;"><tr><td align="center" style="padding:24px 12px;">',
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"',
    ' style="width:600px;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;',
    "font-family:'Segoe UI',Helvetica,Arial,sans-serif;\">",
    '<tr><td style="background:#071a3d;padding:24px 32px;font-size:19px;font-weight:800;color:#ffffff;">',
    'CARRULEDDHI <span style="color:#ffc928;">SHOW 2026</span></td></tr>',
    inner,

    /* "Any questions" — on every letter, above the small print.
       Reply is offered first because it is the least work for the reader and it lands
       in the same inbox; the button is for whoever has lost the message or would
       rather use a form. Both go to a person. A letter that gives somebody a race
       number and a document to sign has to say how to ask about it. */
    '<tr><td style="background:#f2f6ff;padding:20px 32px;border-top:1px solid #dbe6fb;">',
    '<div style="font-size:14px;line-height:1.6;color:#20304f;">{{1.copy.askAny}}</div>',
    '<div style="margin-top:12px;">',
    `<a href="mailto:${ORG_EMAIL}" style="display:inline-block;background:#071a3d;color:#ffffff;`,
    'font-size:13px;font-weight:700;text-decoration:none;padding:11px 18px;border-radius:999px;',
    `margin:0 8px 8px 0;">&#9993;&nbsp; ${ORG_EMAIL}</a>`,
    `<a href="${SITE}/#contact" style="display:inline-block;background:#ffffff;color:#071a3d;`,
    'border:2px solid #071a3d;font-size:13px;font-weight:700;text-decoration:none;',
    'padding:9px 18px;border-radius:999px;margin:0 0 8px 0;">{{1.copy.askCta}} &rarr;</a>',
    '</div></td></tr>',

    '<tr><td style="background:#071a3d;padding:20px 32px;font-size:12px;line-height:1.6;color:#8fb0e8;">',
    '{{1.copy.footerNote}}<br>',
    `<a href="mailto:${ORG_EMAIL}" style="color:#ffc928;">${ORG_EMAIL}</a>`,
    ` &middot; <a href="${SITE}/#contact" style="color:#ffc928;">{{1.copy.askCta}}</a>`,
    '</td></tr></table></td></tr></table></body></html>'
  ].join('');
}

function reminderOptInHtml() {
  return shell(
    [
      '<tr><td style="padding:32px 32px 8px;">',
      '<h1 style="margin:0 0 14px;font-size:30px;line-height:1.1;color:#071a3d;font-weight:800;',
      'letter-spacing:-1px;">{{1.copy.remHeading7}}</h1>',
      '<div style="font-size:15px;line-height:1.7;color:#43516f;">{{1.copy.remBody7}}</div>',
      '</td></tr>',
      '<tr><td align="center" style="padding:22px 32px 30px;">',
      '<a href="{{1.ev.map}}" style="display:inline-block;background:#2469d8;color:#ffffff;',
      'font-size:14px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;',
      'text-decoration:none;padding:14px 26px;border-radius:999px;">{{1.copy.remCta}} &rarr;</a>',
      '</td></tr>'
    ].join('')
  );
}

/**
 * "Tell me about the next edition" — confirmation.
 *
 * There was a newsletterHtml() here that was never wired to anything and borrowed
 * its wording from the reminder deck: it greeted a future subscriber with "one week
 * to go" and used the event footer as the body. It has its own strings now
 * (newsHi / newsLead / newsBody in copy.json, six languages).
 *
 * The yellow panel states the limit rather than burying it in a footer. Somebody who
 * ticks a box on a race form is not expecting a mailing list, so the mail says out
 * loud that it is one message, once, when a date exists.
 */
function newsletterOptInHtml() {
  return shell(
    [
      '<tr><td style="padding:32px 32px 10px;">',
      '<div style="font-size:15px;line-height:1.7;color:#43516f;">{{1.newsHi}}</div>',
      '<h1 style="margin:10px 0 14px;font-size:27px;line-height:1.15;color:#071a3d;font-weight:800;',
      'letter-spacing:-1px;">{{1.copy.newsSubject}}</h1>',
      '<div style="font-size:15px;line-height:1.7;color:#43516f;">{{1.copy.newsLead}}</div>',
      '</td></tr>',
      '<tr><td style="padding:6px 32px 4px;">',
      '<div style="background:#fff8e1;border:2px solid #ffc928;border-radius:14px;padding:16px 18px;',
      'font-size:14px;line-height:1.6;color:#5b4708;">{{1.copy.newsBody}}</div>',
      '</td></tr>',
      '<tr><td align="center" style="padding:22px 32px 12px;">',
      `<a href="${SITE}" style="display:inline-block;background:#2469d8;color:#ffffff;`,
      'font-size:14px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;',
      'text-decoration:none;padding:14px 26px;border-radius:999px;">{{1.copy.newsCta}} &rarr;</a>',
      '</td></tr>',
      '<tr><td align="center" style="padding:0 32px 28px;font-size:12px;color:#8091b5;">',
      `<a href="mailto:${ORG_EMAIL}?subject=STOP%20newsletter" style="color:#8091b5;">`,
      '{{1.copy.newsUnsub}}</a></td></tr>'
    ].join('')
  );
}

/**
 * The contact form, as it reaches the organiser.
 *
 * It used to be two bare tags — a <p>, an <hr>, another <p> — which is fine for a
 * machine and unpleasant on a phone, where the sender's address and their question
 * ran together in the same grey block. Same shell as every other mail, so the reply
 * comes from something that looks like the event and not like a log line.
 *
 * Reply-To is set on the module to the sender, so hitting Reply answers them, not us.
 */
function contactHtml() {
  return shell(
    [
      '<tr><td style="padding:30px 32px 6px;">',
      '<div style="font-family:monospace;font-size:12px;letter-spacing:.08em;color:#8091b5;',
      'text-transform:uppercase;">{{upper(1.loc)}} &middot; {{formatDate(now; "DD.MM.YYYY HH:mm"; "Europe/Rome")}}</div>',
      '<h1 style="margin:8px 0 4px;font-size:26px;line-height:1.15;color:#071a3d;font-weight:800;',
      'letter-spacing:-1px;">{{1.name}}</h1>',
      '<a href="mailto:{{lower(1.email)}}" style="font-size:14px;color:#2469d8;">{{lower(1.email)}}</a>',
      '</td></tr>',
      '<tr><td style="padding:16px 32px 30px;">',
      '<div style="background:#f2f6ff;border-left:5px solid #ffc928;border-radius:0 14px 14px 0;',
      'padding:16px 18px;font-size:15px;line-height:1.7;color:#20304f;white-space:pre-wrap;">',
      '{{1.message}}</div>',
      '</td></tr>'
    ].join('')
  );
}

/* =============================================================== SCENARIO 2
   Scheduled. Runs every hour, sends 7 days / 1 day / 3 hours before the start.
   A browser cannot do this: it is closed. Only a clock on a server can. */

/**
 * Four modules: a clock, one request, a loop, one Email.
 *
 * WHAT THIS REPLACED
 *   Six modules, and every one of them doing work that does not belong in Make: a
 *   Google Sheets read of 500 rows, date arithmetic with parseDate and dateDifference
 *   against a hard-coded timestamp, the whole 26 kB copy deck in a variable, a second
 *   variable module to pick a language out of it, four AND-ed filter conditions, and a
 *   Sheets row update addressed by column index.
 *
 *   All of it now happens in one call to the Vercel function, which already knows the
 *   event date, already has the deck, already renders the other five letters, and can
 *   read the reminder list with one indexed query instead of pulling the sheet down.
 *   What comes back is a list of finished messages: `to`, `subject`, `html`.
 *
 * WHY AN ITERATOR AND NOT A SECOND WEBHOOK
 *   Make sends one e-mail per bundle. One request returning fifty messages is fifty
 *   bundles, which is exactly what Iterator is for. The alternative — the function
 *   calling a webhook once per subscriber — would be fifty HTTP round trips and fifty
 *   chances for one of them to be the one that fails.
 *
 * WHY THE CLOCK STILL RUNS HOURLY
 *   The function decides which reminder is due from how much time is left, in windows
 *   rather than exact hours: 7 days or less and more than a day away is the 7-day one,
 *   and so on. A missed run therefore costs nothing — the next one catches up — and
 *   somebody who signs up two days before the race gets the 1-day reminder rather than
 *   nothing at all, which the exact-hour version got wrong.
 */
const remindersFlow = [
  /* Asks the function what is due.
     `reminders-due` both decides and records: it marks each subscriber with the reminder
     it just handed over, in the same call. That means an SMTP failure in module 4 loses
     one reminder for one person rather than sending it to everybody again on the next
     tick, which is the failure mode worth choosing between the two. A run that failed is
     in Make's history, and the column can be cleared by hand from the admin panel. */
  httpRequest(1, 0, 0, `${SITE}/api/carruleddhi/reminders-due`, [], null, {
    method: 'post',
    headers: [
      { name: 'Content-Type', value: 'application/json' },
      // The same passphrase as the roster. Without it this endpoint would let anybody
      // on the internet burn through the reminder list.
      { name: 'X-Carruleddhi-Roster-Key', value: 'WSTAW_ROSTER_KEY' }
    ],
    body: '{}',
    parseResponse: true
  }),

  /* Turns `messages` into one bundle per letter. */
  {
    id: 2,
    module: 'builtin:BasicFeeder',
    version: 1,
    parameters: {},
    mapper: { array: '{{1.data.messages}}' },
    metadata: { ...at(340, 0), designer: { x: 340, y: 0, messages: [] } }
  },

  /* One letter, already finished. No switch, no language lookup, no deck. */
  sendEmail(4, 680, 0, {
    to: '{{2.value.to}}',
    subject: '{{2.value.subject}}',
    html: '{{2.value.html}}',
    filter: {
      name: 'ma adres',
      conditions: [[{ a: '{{2.value.to}}', o: 'text:contain', b: '@' }]]
    }
  })
];

/* ------------------------------------------- e-mail templates for the Worker
   The bodies used to live in a Make variable — five of them, twenty-four kilobytes
   of table markup in a tool whose job is sending mail. Every reference inside them
   was a variable of a variable, which is the whole reason Make drew them differently
   from ordinary fields and why a missing one was so hard to see.

   They are rendered in the Vercel function now and arrive as one field, {{1.html}}.
   For that the templates may contain only plain paths, so the five expressions that
   called a Make function are swapped for fields the function precomputes. The assert
   below refuses to ship a template with anything left that a five-line renderer
   cannot handle. */
const TEMPLATE_SUBSTITUTIONS = [
  ['{{formatDate(1.birthDate; "DD.MM.YYYY")}}', '{{1.birthDateLabel}}'],
  ['{{lower(1.email)}}', '{{1.emailLower}}'],
  ['{{lower(1.guardianEmail)}}', '{{1.guardianEmailLower}}'],
  ['{{upper(1.category)}}', '{{1.categoryUpper}}'],
  ['{{upper(1.loc)}}', '{{1.localeUpper}}'],
  ['{{ifempty(1.teamName; "—")}}', '{{1.teamLabel}}'],
  ['{{ifempty(1.cartNotes; "—")}}', '{{1.notesLabel}}'],
  ['{{ifempty(1.motherName; "—")}}', '{{1.motherLabel}}'],
  ['{{ifempty(1.fatherName; "—")}}', '{{1.fatherLabel}}'],
  ['{{join(1.copy.regChecklist; "</li><li>")}}', '{{1.checklistHtml}}'],
  // attachCopy() already formats this one, in Europe/Rome, for the printed footer.
  ['{{formatDate(now; "DD.MM.YYYY HH:mm"; "Europe/Rome")}}', '{{1.generatedAt}}']
];

function forWorker(html) {
  let out = html;
  for (const [from, to] of TEMPLATE_SUBSTITUTIONS) out = out.split(from).join(to);
  const leftovers = [...out.matchAll(/\{\{([^}]*)\}\}/g)]
    .map((m) => m[1].trim())
    .filter((expression) => !/^1\.[A-Za-z0-9_.]+$/.test(expression));
  if (leftovers.length) {
    throw new Error(
      'e-mail template still contains expressions the Worker cannot render:\n  '
      + [...new Set(leftovers)].join('\n  ')
      + '\nEither add a substitution above or precompute the value in attachCopy().'
    );
  }
  return out;
}

const EMAIL_TEMPLATES = {
  registration: forWorker(withRaceNumber(REG_HTML)),
  minor: forWorker(withRaceNumber(MIN_HTML)),
  reminder: forWorker(reminderOptInHtml()),
  /* Two different letters, and they were being confused.
     `reminder` is the "you are on the list" note that goes out the moment somebody ticks
     the box. `reminderDue` is the actual reminder, sent 7 days / 1 day / 3 hours before
     the start by the scheduled scenario — which until now rendered it inside Make out of
     a Google Sheet row. */
  reminderDue: forWorker(REM_DUE_HTML),
  contact: forWorker(contactHtml()),
  newsletter: forWorker(newsletterOptInHtml())
};

writeFileSync(
  resolve(root, 'worker/email-templates.js'),
  '/* GENERATED by tools/build-make-blueprints.mjs. Do not edit — change the HTML in\n'
    + '   emails/make-registration.html or the small builders in the generator. */\n'
    + '/* eslint-disable */\n'
    + `export const EMAIL_TEMPLATES = ${JSON.stringify(EMAIL_TEMPLATES, null, 1)};\n`,
  'utf8'
);
console.log(
  `worker/email-templates.js  ${Object.entries(EMAIL_TEMPLATES)
    .map(([name, html]) => `${name}=${(html.length / 1024).toFixed(1)}kB`)
    .join(' ')}`
);

/* ------------------------------------------------- copy deck for the Worker
   The Vercel function resolves the wording for the submitter's language and sends it
   in the webhook payload, so Make holds no dictionary of its own and every reference
   in the scenario is a plain webhook field.

   Written as a JS module rather than imported as JSON: the function is bundled for
   the Edge runtime, and a JSON import assertion is one more thing that can differ
   between bundlers. A generated .js file imports the same everywhere. */
writeFileSync(
  resolve(root, 'worker/copy-deck.js'),
  '/* GENERATED by tools/build-make-blueprints.mjs from emails/copy.json. Do not edit. */\n'
    + '/* eslint-disable */\n'
    // Indented, not minified. It is imported by the Edge function, and a 26 kB single
    // line is the sort of thing a bundler's parser trips over for reasons that show up
    // as an error nowhere near the cause. Nothing here is size-sensitive.
    + `export const COPY_DECK = ${JSON.stringify(copyRaw, null, 2)};\n`,
  'utf8'
);
console.log(`worker/copy-deck.js  ${(Buffer.byteLength(JSON.stringify(copyRaw), 'utf8') / 1024).toFixed(1)} kB`);

/* ------------------------------------------------------------------ write */

mkdirSync(resolve(root, 'make'), { recursive: true });

const files = [
  ['make/blueprint-1-instant.json', wrap('Carruleddhi — 1 — natychmiastowe (webhook)', instantFlow, true)],
  ['make/blueprint-2-reminders.json', wrap('Carruleddhi — 2 — przypomnienia (co godzine)', remindersFlow, false)]
];

for (const [file, data] of files) {
  writeFileSync(resolve(root, file), JSON.stringify(data, null, 2), 'utf8');
  const kb = (Buffer.byteLength(JSON.stringify(data), 'utf8') / 1024).toFixed(1);
  console.log(`${file}  ${kb} kB`);
}

/* ------------------------------------------------------------------ verify
   The old check here only asked whether a referenced module existed anywhere in
   the file. It passed a blueprint Make refused to run, with two warnings:

     [module ID 3] references inaccessible module [module ID 3]
     [module ID 3] references inaccessible module [module ID 6]

   Existing is not the same as being reachable. A module may only quote modules
   that have already produced output by the time it runs: earlier siblings, and
   anything on the trunk before the router it hangs off. Never itself, never
   something downstream. That is what is checked below, so this specific mistake
   cannot ship again. */

/** Walks the flow and yields every module with the set of ids visible to it. */
function* withVisibility(flow, inherited = []) {
  const seen = [...inherited];
  for (const module of flow) {
    yield { module, visible: new Set(seen) };
    // A router contributes no output of its own; each route starts from the trunk
    // as it stood at the router, plus the router's own id for completeness.
    for (const route of module.routes || []) {
      yield* withVisibility(route.flow, [...seen, module.id]);
    }
    seen.push(module.id);
  }
}

let failures = 0;
for (const [file, data] of files) {
  const problems = [];
  let count = 0;

  for (const { module, visible } of withVisibility(data.flow)) {
    count += 1;
    // routes are validated on their own pass; excluding them here keeps a router
    // from being blamed for what its children quote.
    const { routes, ...own } = module;
    const refs = new Set();
    /* Every module number inside {{ }}, not only the ones sitting right after the
       braces. The version that only matched /\{\{(\d+)\./ passed a blueprint Make
       then refused with "references non-existing module [module ID 2]", because a
       real expression buries them in function calls:

         {{get(parseJSON(2.copy); 2.loc)}}
         {{join(3.t.regChecklist; "</li><li>")}}

       Guarded on both sides so a colour like rgba(0,0,0,.16) or a size like 1.5
       inside an e-mail's inline CSS is not read as a module reference. */
    for (const [, expression] of JSON.stringify(own).matchAll(/\{\{([^}]*)\}\}/g)) {
      for (const [, n] of expression.matchAll(/(?:^|[^\w.])(\d+)\.(?=[A-Za-z_`])/g)) refs.add(Number(n));
    }
    for (const ref of refs) {
      if (ref === module.id) problems.push(`module ${module.id} references itself`);
      else if (!visible.has(ref)) problems.push(`module ${module.id} references ${ref}, which runs later or on another route`);
    }
  }

  if (problems.length) {
    failures += problems.length;
    console.error(`${file}  modules=${count}  FAIL`);
    for (const problem of [...new Set(problems)]) console.error(`    ${problem}`);
  } else {
    console.log(`${file}  modules=${count}  references=ok`);
  }
}
if (failures) {
  console.error('\nBlueprint would be rejected by Make. Not shipping it.');
  process.exit(1);
}
console.log(`copy deck embedded: ${(Buffer.byteLength(COPY, 'utf8') / 1024).toFixed(1)} kB, locales=${Object.keys(copyRaw).filter((k) => k[0] !== '_').join(',')}`);
