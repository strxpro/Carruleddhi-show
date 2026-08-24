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
const CALLMEBOT = { phone: '393284981574', apikey: '3364881' };

/* ---------------------------------------------------------------- copy deck */

const copyRaw = JSON.parse(read('emails/copy.json'));
delete copyRaw._readme;
const COPY = JSON.stringify(copyRaw);

/* ------------------------------------------------------------ mail bodies */

/** Strips the leading HTML comment block used as a note for the reader. */
function body(file) {
  return read(file).replace(/^<!--[\s\S]*?-->\s*/, '').trim();
}

const REG_TEMPLATE = body('emails/make-registration.html')
  // Module 5 in the old note is module 6 here (Sheets row lands in 5).
  .replace(/\{\{5\.raceNumber\}\}/g, '{{3.raceNumber}}')
  // These two carry %TOKEN% placeholders, so they are resolved in module 6.
  .replace(/\{\{3\.t\.regHelp\}\}/g, '{{3.help}}')
  .replace(/\{\{3\.t\.printFooter\}\}/g, '{{3.printFooter}}');

/* The minor variant is derived first, while `{{3.t.regHi}}` is still in place —
   it is one of the anchors minorHtml() swaps. Only then is the adult greeting
   pointed at module 3, and the leftover marker removed from the adult body. */
const MIN_HTML = minorHtml(REG_TEMPLATE);

const REG_HTML = REG_TEMPLATE
  .replace(/\{\{3\.t\.regHi\}\}/g, '{{3.hi}}')
  .replace('<!--GUARDIAN-ROWS-->', '');

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
    ['minLabels.relation', '{{3.relWord}}'],
    ['minLabels.guardianEmail', '{{lower(1.guardianEmail)}}'],
    ['minLabels.guardianPhone', '{{1.guardianPhone}}'],
    ['minLabels.riderAge', '{{1.riderAge}}'],
    ['minLabels.mother', '{{ifempty(1.motherName; "—")}}'],
    ['minLabels.father', '{{ifempty(1.fatherName; "—")}}']
  ]
    .map(([label, value]) =>
      `<tr><td style="${cell}color:#5f709a;">{{3.t.${label}}}</td>`
      + `<td style="${cell}font-weight:700;">${value}</td></tr>`)
    .join('\n      ');

  let html = adultHtml;
  const swaps = [
    // Greeting and opening line both carry placeholders, so they come from
    // module 3 where the guardian name and the child word are already resolved.
    ['{{3.t.regHi}}', '{{3.minHi}}'],
    ['{{3.t.regLead}}', '{{3.minLead}}'],
    ['{{3.t.regPreheader}}', '{{3.t.minPreheader}}'],
    ['{{3.t.regPrintTitle}}', '{{3.t.minPrintTitle}}'],
    ['{{3.t.regPrintBody}}', '{{3.t.minPrintBody}}'],
    ['{{3.t.regPdfTitle}}', '{{3.t.minPdfTitle}}'],
    ['{{3.t.regPdfBody}}', '{{3.t.minPdfBody}}'],
    ['{{3.t.regCta}}', '{{3.t.minCta}}'],
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
    '{{3.minLead}}',
    '{{3.minLead}}</p>\n    <p style="margin:8px 0 0;font-size:14px;color:#5f709a;">{{3.ageNote}}'
  );
}

const REM_HTML = body('emails/make-reminder.html')
  // Column C is `name` on the Reminders sheet.
  .replace(/\{\{4\.t\.regHi\}\}/g, '{{replace(4.t.regHi; "%FIRSTNAME%"; 1.`C`)}}');

/**
 * Swaps the %RACENUMBER% placeholder for the real Make expression.
 *
 * The bodies are written with a literal placeholder because the templates are also
 * opened in a browser to check the layout, and {{3.raceNumber}} renders as noise
 * there. The substitution happens here, at build time, rather than with a runtime
 * replace() in Make: a replace() around a whole HTML document was what forced the
 * body into a variable in the first place, and that variable is what Make rejected.
 */
const withRaceNumber = (html) => html.split('%RACENUMBER%').join('{{1.raceNumber}}');

/* ------------------------------------------------------------ tiny helpers */

let seq = 0;
const at = (x, y) => ({ designer: { x, y } });

function setVars(id, x, y, variables, name) {
  return {
    id,
    module: 'util:SetVariables',
    version: 1,
    parameters: {},
    mapper: { variables, scope: 'roundtrip' },
    metadata: { ...at(x, y), restore: { expect: { variables: { items: [] } } } },
    ...(name ? { label: name } : {})
  };
}

/** Google Sheets "Add a Row". spreadsheetId is left blank on purpose so Make
 *  makes you pick the file after import — a hard-coded id would silently point
 *  at nothing. */
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

function httpRequest(id, x, y, url, qs, filter) {
  return {
    id,
    module: 'http:ActionSendData',
    version: 3,
    parameters: { handleErrors: false, useNewZLibDeCompress: true },
    ...(filter ? { filter } : {}),
    mapper: {
      url,
      method: 'get',
      headers: [],
      qs: qs || [],
      bodyType: null,
      parseResponse: false,
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

const eq = (name, a, b) => ({ name, conditions: [[{ a, b, o: 'text:equal' }]] });

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

/**
 * One extra column on the Reminders sheet, added at the end so nothing shifts:
 * Q `last_reminder`. Scenario 2 writes "7d", "1d" or "3h" there and refuses to
 * send the same one twice.
 *
 * It could have gone into the existing sent_7d_at / sent_1d_at / sent_3h_at
 * columns, but Make's "Update a Row" takes a fixed set of column indexes, so
 * writing only the one that is due means sending blanks to the other two and
 * wiping them. One column with a static index is the honest fit.
 */
const REMINDER_MARKER_INDEX = 16; // column Q

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
  locale: '{{2.loc}}',
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
  locale: '{{2.loc}}',
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
  locale: '{{2.loc}}',
  status: 'new'
});

const newsRow = row('Newsletter', {
  created_at: NOW,
  name: '{{trim(1.firstName)}} {{trim(1.lastName)}}',
  email: '{{lower(1.email)}}',
  locale: '{{2.loc}}',
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

  setVars(2, 300, 0, [
    {
      name: 'loc',
      value:
        '{{switch(lower(substring(ifempty(1.locale; "it"); 0; 2)); "it"; "it"; "pl"; "pl"; ' +
        '"en"; "en"; "de"; "de"; "es"; "es"; "fr"; "fr"; "it")}}'
    },
    { name: 'copy', value: COPY }
  ]),

  /**
   * Module 3 is the only place any e-mail text lives.
   *
   * Before this, the wording was spread across four Email modules and changing a
   * sentence meant finding it four times. Now all three bodies and all three
   * subjects are built here as variables, and the Email modules downstream just
   * point at them — one module to open when you want to change what people read.
   *
   * The registration body still needs the race number, which does not exist until
   * the sheet row does. So it carries a literal %RACENUMBER% placeholder, and
   * module 6 does a single replace() once the row number is known. That keeps the
   * text here without inventing a separate numbering source.
   */
  setVars(3, 600, 0, [
    { name: 't', value: '{{get(parseJSON(2.copy); 2.loc)}}' },
    { name: 'tit', value: '{{get(parseJSON(2.copy); "it")}}' },
    { name: 'ev', value: '{{get(parseJSON(2.copy); "_event")}}' },
    { name: 'fullName', value: '{{trim(1.firstName)}} {{trim(1.lastName)}}' },
    { name: 'generatedAt', value: '{{formatDate(now; "DD.MM.YYYY HH:mm"; "Europe/Rome")}}' },

    { name: 'hi', value: '{{replace(get(parseJSON(2.copy); 2.loc).regHi; "%FIRSTNAME%"; trim(1.firstName))}}' },
    {
      name: 'help',
      value: '{{replace(replace(get(parseJSON(2.copy); 2.loc).regHelp; "%ORGEMAIL%"; '
        + 'get(parseJSON(2.copy); "_event").email); "%ORGPHONE%"; '
        + 'get(parseJSON(2.copy); "_event").phone)}}'
    },
    {
      name: 'printFooter',
      value: '{{replace(get(parseJSON(2.copy); 2.loc).printFooter; "%GENERATEDAT%"; '
        + 'formatDate(now; "DD.MM.YYYY HH:mm"; "Europe/Rome"))}}'
    },

    /* --- subjects ---------------------------------------------------------- */
    { name: 'regSubject', value: '{{get(parseJSON(2.copy); 2.loc).regSubject}}' },
    { name: 'minSubject', value: '{{get(parseJSON(2.copy); 2.loc).minSubject}}' },
    { name: 'remSubject', value: '{{get(parseJSON(2.copy); 2.loc).remSubject7}}' },
    { name: 'contactSubject', value: 'Kontakt ze strony — {{1.name}}' },
    { name: 'newsSubject', value: '{{get(parseJSON(2.copy); 2.loc).newsSubject}}' },
    {
      name: 'newsHi',
      value: '{{replace(get(parseJSON(2.copy); 2.loc).newsHi; "%FIRSTNAME%"; trim(1.firstName))}}'
    },

    /* --- wording for an under-18 entry -------------------------------------
       These used to live in a module downstream of the spreadsheet write, because
       they were computed next to the race number and the race number *was* the row
       number of the sheet that had just been written. The number now arrives from a
       database sequence as {{1.raceNumber}}, so nothing here waits for anything, and
       all of it belongs in the one module that holds text.

       minChild is a map, so the word for son / daughter / child is looked up by the
       submitted value and falls back to the neutral form. An unknown value gives
       "your child", never an empty gap in the middle of a sentence. */
    {
      name: 'childWord',
      value: '{{get(get(parseJSON(2.copy); 2.loc).minChild; ifempty(1.childKind; "child"))}}'
    },
    {
      name: 'relWord',
      value: '{{get(get(parseJSON(2.copy); 2.loc).minRel; ifempty(1.guardianRelation; "guardian"))}}'
    },
    {
      name: 'minHi',
      value: '{{replace(get(parseJSON(2.copy); 2.loc).minHi; "%GUARDIAN%"; trim(1.guardianName))}}'
    },
    {
      name: 'minLead',
      value: '{{replace(replace(get(parseJSON(2.copy); 2.loc).minLead; "%CHILD%"; '
        + 'get(get(parseJSON(2.copy); 2.loc).minChild; ifempty(1.childKind; "child"))); '
        + '"%FIRSTNAME%"; trim(1.firstName))}}'
    },
    {
      name: 'ageNote',
      value: '{{replace(replace(get(parseJSON(2.copy); 2.loc).minAgeNote; "%FIRSTNAME%"; '
        + 'trim(1.firstName)); "%AGE%"; 1.riderAge)}}'
    },

    /* --- the attachment ---------------------------------------------------- */
    {
      name: 'pdfUrl',
      value: `{{if(1.isMinor; "${SITE}/emails/Carruleddhi-modulo-minori.pdf"; `
        + `"${SITE}/emails/Carruleddhi-modulo.pdf")}}`
    },
    { name: 'pdfName', value: '{{if(1.isMinor; "Carruleddhi-minori-"; "Carruleddhi-modulo-")}}' }

    /* --- bodies are NOT here, and that is deliberate -----------------------
       Four more variables used to hold a whole e-mail each. Make refused the
       scenario:

         [module ID 3] references inaccessible module [module ID 3]

       and it was right. The bodies quote {{3.t.…}} for their wording, which is a
       variable this very module is still defining. A variable is evaluated when its
       own module runs, so the value does not exist yet.

       Each body now sits in the Content field of the Email module that sends it —
       downstream of here, which is where every reference resolves, and where Make
       expects an e-mail body anyway. */
  ]),

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
    /* ---- A: adult entry ------------------------------------------------- */
    {
      flow: [
        httpGetFile(7, 1250, -520, '{{3.pdfUrl}}', eq('adult', '{{1.branch}}', 'registration-adult')),
        sendEmail(8, 1600, -520, {
          to: '{{lower(1.email)}}',
          // Blind copy so every entry lands in the organiser's inbox as well,
          // without the rider seeing a second address on their own confirmation.
          bcc: [ORG_EMAIL],
          subject: '{{replace(3.regSubject; "%RACENUMBER%"; 1.raceNumber)}}',
          html: withRaceNumber(REG_HTML),
          attachments: [{ fileName: '{{3.pdfName}}{{1.raceNumber}}.pdf', data: '{{7.data}}' }]
        })
      ]
    },

    /* ---- B: under-18 entry ---------------------------------------------- */
    {
      flow: [
        httpGetFile(19, 1250, -280, '{{3.pdfUrl}}', eq('under 18', '{{1.branch}}', 'registration-minor')),
        /* Addressed to the guardian, because they are the one who signs. The rider
           gets a blind copy so they still see their number without becoming a second
           visible recipient on a letter written to their parent. */
        sendEmail(16, 1600, -280, {
          to: '{{lower(1.guardianEmail)}}',
          bcc: ['{{"' + ORG_EMAIL + ', " + lower(1.email)}}'],
          subject: '{{replace(3.minSubject; "%RACENUMBER%"; 1.raceNumber)}}',
          html: withRaceNumber(MIN_HTML),
          attachments: [{ fileName: '{{3.pdfName}}{{1.raceNumber}}.pdf', data: '{{19.data}}' }]
        })
      ]
    },

    /* ---- C: tell the organiser, either way -------------------------------
       Its own route rather than a module appended to A and B, which would have
       meant two copies of it and two places to change the number. Filtered on
       {{1.type}} so it fires for an adult and a minor alike.

       Deliberately no name, e-mail or phone: the query string travels through a
       third-party host and lands in its logs. A race number and a category are
       enough to know an entry arrived, and mean nothing to anyone else. */
    {
      flow: [
        httpRequest(9, 1250, -40, 'https://api.callmebot.com/whatsapp.php', [
          { name: 'phone', value: CALLMEBOT.phone },
          { name: 'apikey', value: CALLMEBOT.apikey },
          {
            name: 'text',
            value: 'Carruleddhi: nowe zgloszenie nr {{1.raceNumber}}, kategoria {{1.category}}'
          }
        ], eq('any entry', '{{1.type}}', 'registration'))
      ]
    },

    /* ---- D: reminder list ----------------------------------------------- */
    {
      flow: [
        sendEmail(12, 1250, 200, {
          filter: eq('reminder', '{{1.branch}}', 'reminder'),
          to: '{{lower(1.email)}}',
          subject: '{{3.remSubject}}',
          html: reminderOptInHtml()
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
          subject: '{{3.contactSubject}}',
          html: contactHtml()
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
        sendEmail(18, 1250, 640, {
          filter: {
            name: 'newsletter opt-in',
            conditions: [[{ a: '{{1.newsConsent}}', o: 'boolean:equal', b: 'true' }]]
          },
          to: '{{lower(1.email)}}',
          subject: '{{3.newsSubject}}',
          html: newsletterOptInHtml()
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
    '<tr><td style="background:#071a3d;padding:20px 32px;font-size:12px;line-height:1.6;color:#8fb0e8;">',
    '{{3.t.footerNote}}<br>',
    `<a href="mailto:${ORG_EMAIL}" style="color:#ffc928;">${ORG_EMAIL}</a>`,
    '</td></tr></table></td></tr></table></body></html>'
  ].join('');
}

function reminderOptInHtml() {
  return shell(
    [
      '<tr><td style="padding:32px 32px 8px;">',
      '<h1 style="margin:0 0 14px;font-size:30px;line-height:1.1;color:#071a3d;font-weight:800;',
      'letter-spacing:-1px;">{{3.t.remHeading7}}</h1>',
      '<div style="font-size:15px;line-height:1.7;color:#43516f;">{{3.t.remBody7}}</div>',
      '</td></tr>',
      '<tr><td align="center" style="padding:22px 32px 30px;">',
      '<a href="{{3.ev.map}}" style="display:inline-block;background:#2469d8;color:#ffffff;',
      'font-size:14px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;',
      'text-decoration:none;padding:14px 26px;border-radius:999px;">{{3.t.remCta}} &rarr;</a>',
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
      '<div style="font-size:15px;line-height:1.7;color:#43516f;">{{3.newsHi}}</div>',
      '<h1 style="margin:10px 0 14px;font-size:27px;line-height:1.15;color:#071a3d;font-weight:800;',
      'letter-spacing:-1px;">{{3.t.newsSubject}}</h1>',
      '<div style="font-size:15px;line-height:1.7;color:#43516f;">{{3.t.newsLead}}</div>',
      '</td></tr>',
      '<tr><td style="padding:6px 32px 4px;">',
      '<div style="background:#fff8e1;border:2px solid #ffc928;border-radius:14px;padding:16px 18px;',
      'font-size:14px;line-height:1.6;color:#5b4708;">{{3.t.newsBody}}</div>',
      '</td></tr>',
      '<tr><td align="center" style="padding:22px 32px 12px;">',
      `<a href="${SITE}" style="display:inline-block;background:#2469d8;color:#ffffff;`,
      'font-size:14px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;',
      'text-decoration:none;padding:14px 26px;border-radius:999px;">{{3.t.newsCta}} &rarr;</a>',
      '</td></tr>',
      '<tr><td align="center" style="padding:0 32px 28px;font-size:12px;color:#8091b5;">',
      `<a href="mailto:${ORG_EMAIL}?subject=STOP%20newsletter" style="color:#8091b5;">`,
      '{{3.t.newsUnsub}}</a></td></tr>'
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
      'text-transform:uppercase;">{{upper(2.loc)}} &middot; {{formatDate(now; "DD.MM.YYYY HH:mm"; "Europe/Rome")}}</div>',
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

const remindersFlow = [
  /**
   * Reads the Reminders sheet, not Registrations. It is the one that already has
   * `sent_7d_at`, `sent_1d_at` and `sent_3h_at` columns, so there is somewhere to
   * record what went out and no chance of sending the same reminder twice.
   * Columns: A id, B created_at, C name, D email, E locale, F race_number,
   * G consent_at, H unsubscribe_token, I-K reminder_*_at, L-N sent_*_at,
   * O locked_until, P status.
   */
  {
    id: 1,
    module: 'google-sheets:filterRows',
    version: 2,
    parameters: { __IMTCONN__: null },
    mapper: {
      from: 'drive',
      mode: 'select',
      spreadsheetId: '',
      sheetId: 'Reminders',
      includesHeaders: true,
      filter: [],
      sortOrder: 'asc',
      limit: '500',
      valueRenderOption: 'FORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING'
    },
    metadata: at(0, 0)
  },

  setVars(2, 300, 0, [
    {
      name: 'hoursLeft',
      value: '{{round(dateDifference(parseDate("2026-10-17 14:30"; "YYYY-MM-DD HH:mm"; "Europe/Rome"); now) / 3600000)}}'
    },
    {
      name: 'due',
      value:
        '{{switch(round(dateDifference(parseDate("2026-10-17 14:30"; "YYYY-MM-DD HH:mm"; "Europe/Rome"); now) / 3600000); ' +
        '168; "7d"; 24; "1d"; 3; "3h"; "")}}'
    },

    {
      // Column E is `locale` on the Reminders sheet.
      name: 'loc',
      value:
        '{{switch(lower(substring(ifempty(1.`E`; "it"); 0; 2)); "it"; "it"; "pl"; "pl"; ' +
        '"en"; "en"; "de"; "de"; "es"; "es"; "fr"; "fr"; "it")}}'
    }
  ]),

  setVars(3, 600, 0, [{ name: 'copy', value: COPY }]),

  setVars(4, 900, 0, [
    { name: 't', value: '{{get(parseJSON(3.copy); 2.loc)}}' },
    { name: 'ev', value: '{{get(parseJSON(3.copy); "_event")}}' }
  ]),

  /**
   * Column D is `email`. The three conditions are AND-ed (each in its own array):
   * something is due now, this particular reminder has not been sent to this row
   * yet, the address looks like an address, and the row has not opted out.
   */
  sendEmail(5, 1200, 0, {
    to: '{{lower(1.`D`)}}',
    subject: '{{switch(2.due; "7d"; 4.t.remSubject7; "1d"; 4.t.remSubject1; 4.t.remSubject3)}}',
    html: REM_HTML,
    filter: {
      name: 'due now and not sent yet',
      conditions: [
        [{ a: '{{2.due}}', o: 'text:notequal', b: '' }],
        // Column Q holds the last reminder sent to this row.
        [{ a: '{{1.`Q`}}', o: 'text:notequal', b: '{{2.due}}' }],
        [{ a: '{{1.`D`}}', o: 'text:contain', b: '@' }],
        [{ a: '{{1.`P`}}', o: 'text:notequal', b: 'unsubscribed' }]
      ]
    }
  }),

  /**
   * Marks which reminder has gone out to this row.
   *
   * This is "Update a Row", not "Update a Cell". The cell version arrived on import
   * with an empty red `Cell` field — its mapper key is not what this generator
   * guessed. This shape is copied from a real Make export, so `rowNumber` plus
   * index-keyed `values` is known to bind correctly.
   */
  {
    id: 6,
    module: 'google-sheets:updateRow',
    version: 2,
    parameters: { __IMTCONN__: null },
    mapper: {
      from: 'drive',
      mode: 'select',
      spreadsheetId: '',
      sheetId: 'Reminders',
      rowNumber: '{{1.`__ROW_NUMBER__`}}',
      includesHeaders: true,
      valueInputOption: 'USER_ENTERED',
      values: { [String(REMINDER_MARKER_INDEX)]: '{{2.due}}' }
    },
    metadata: at(1500, 0)
  }
];

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
    JSON.stringify(own).replace(/\{\{\s*(\d+)\./g, (_, n) => refs.add(Number(n)));
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
