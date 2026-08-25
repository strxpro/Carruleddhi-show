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
const CALLMEBOT = { phone: '48665626101', apikey: '2990681' };

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
  .replace(/\{\{5\.raceNumber\}\}/g, '{{1.raceNumber}}')
  // These two carry %TOKEN% placeholders, so they are resolved in module 6.
  .replace(/\{\{3\.t\.regHelp\}\}/g, '{{1.help}}')
  .replace(/\{\{3\.t\.printFooter\}\}/g, '{{1.printFooter}}');

/* The minor variant is derived first, while `{{1.copy.regHi}}` is still in place —
   it is one of the anchors minorHtml() swaps. Only then is the adult greeting
   pointed at module 3, and the leftover marker removed from the adult body. */
const MIN_HTML = minorHtml(REG_TEMPLATE);

const REG_HTML = REG_TEMPLATE
  .replace(/\{\{3\.t\.regHi\}\}/g, '{{1.hi}}')
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
    ['{{1.copy.regPrintTitle}}', '{{1.copy.minPrintTitle}}'],
    ['{{1.copy.regPrintBody}}', '{{1.copy.minPrintBody}}'],
    ['{{1.copy.regPdfTitle}}', '{{1.copy.minPdfTitle}}'],
    ['{{1.copy.regPdfBody}}', '{{1.copy.minPdfBody}}'],
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

const REM_HTML = body('emails/make-reminder.html')
  // Column C is `name` on the Reminders sheet.
  .replace(/\{\{4\.t\.regHi\}\}/g, '{{replace(4.t.regHi; "%FIRSTNAME%"; 1.`C`)}}');

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

  /**
   * Module 5 — the five e-mail bodies, one variable each.
   *
   * WHY IT IS A MODULE OF ITS OWN
   *   The bodies were pasted straight into each Email module's Content field, which
   *   worked and was horrible to live with: nine kilobytes of table markup in a
   *   four-line text area, and the same header and footer repeated five times with
   *   no way to see that they were the same. Opening an Email module to change a
   *   recipient meant scrolling past a document.
   *
   *   Here, the Content field of every Email module is one item — {{5.regHtml}} —
   *   and the markup is in one place. Which is where it was before, except that
   *   place was module 3, and module 3 is where the wording the markup quotes is
   *   still being defined. Module 5 sits after 3, so {{1.copy.regPreheader}} and
   *   {{1.minHi}} are both resolved by the time these are built. Same idea, one
   *   module further along, and Make accepts it.
   */
  setVars(5, 1150, 0, [
    { name: 'regHtml', value: withRaceNumber(REG_HTML) },
    { name: 'minHtml', value: withRaceNumber(MIN_HTML) },
    { name: 'remHtml', value: reminderOptInHtml() },
    { name: 'contactHtml', value: contactHtml() },
    { name: 'newsHtml', value: newsletterOptInHtml() }
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
        httpGetFile(7, 1250, -520, '{{1.pdfUrl}}', eq('adult', '{{1.branch}}', 'registration-adult')),
        sendEmail(8, 1600, -520, {
          to: '{{lower(1.email)}}',
          // Blind copy so every entry lands in the organiser's inbox as well,
          // without the rider seeing a second address on their own confirmation.
          bcc: [ORG_EMAIL],
          subject: '{{1.subject}}',
          html: '{{5.regHtml}}',
          attachments: [{ fileName: '{{1.pdfName}}{{1.raceNumber}}.pdf', data: '{{7.data}}' }]
        })
      ]
    },

    /* ---- B: under-18 entry ---------------------------------------------- */
    {
      flow: [
        httpGetFile(19, 1250, -280, '{{1.pdfUrl}}', eq('under 18', '{{1.branch}}', 'registration-minor')),
        /* Both of them, openly.
           The guardian first, because they are the one who signs and the letter is
           written to them. The rider second, as a visible recipient rather than a
           blind copy: a fourteen-year-old who typed their own address in expects to
           hear something back, and "we sent it to your mother" is not that. Seeing
           each other on the same message is also the point — the form and the number
           are one thing they have to sort out together.

           If the rider left no address the second slot resolves to the organiser's,
           which is a duplicate of the blind copy and harmless. An empty recipient is
           not harmless: most servers reject the whole message for it. */
        sendEmail(16, 1600, -280, {
          to: [
            '{{lower(1.guardianEmail)}}',
            `{{ifempty(lower(1.email); "${ORG_EMAIL}")}}`
          ],
          bcc: [ORG_EMAIL],
          subject: '{{1.subject}}',
          html: '{{5.minHtml}}',
          attachments: [{ fileName: '{{1.pdfName}}{{1.raceNumber}}.pdf', data: '{{19.data}}' }]
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
        ], eq('any entry', '{{1.type}}', 'registration'))
      ]
    },

    /* ---- D: reminder list ----------------------------------------------- */
    {
      flow: [
        sendEmail(12, 1250, 200, {
          filter: eq('reminder', '{{1.branch}}', 'reminder'),
          to: '{{lower(1.email)}}',
          subject: '{{1.remSubject}}',
          html: '{{5.remHtml}}'
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
          html: '{{5.contactHtml}}'
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
          subject: '{{1.newsSubject}}',
          html: '{{5.newsHtml}}'
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
    '{{1.copy.footerNote}}<br>',
    `<a href="mailto:${ORG_EMAIL}" style="color:#ffc928;">${ORG_EMAIL}</a>`,
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
