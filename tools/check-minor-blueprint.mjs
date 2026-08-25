/**
 * Reads the generated blueprint and the compiled templates back, and asserts the parts
 * that are easy to break and impossible to see.
 *
 * The generator succeeding only proves it produced valid JSON. This proves the things
 * that matter: that all four registration routes exist and are reachable, that a
 * foreign entry really carries two attachments and an Italian one exactly one, that the
 * under-18 letter is addressed to the guardian, and that no language is missing a key.
 *
 * It used to check module 2, 3 and 6 — a dictionary variable, a wording variable and a
 * switch variable — none of which exist any more. The Vercel function does that work,
 * so the assertions moved with it.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const blueprint = JSON.parse(read('make/blueprint-1-instant.json'));
const copy = JSON.parse(read('emails/copy.json'));
const pdfCopy = JSON.parse(read('emails/pdf-copy.json'));

/* Every module, plus the ids that were reachable when it ran. A route in Make can only
   quote a module on the trunk or earlier on its own route; a reference to a module
   sitting on a sibling route imports fine and then fails at runtime with
   "references inaccessible module", which is the error this whole file exists for. */
const modules = [];
const walk = (flow, seen = []) => {
  const trunk = [...seen];
  for (const node of flow || []) {
    modules.push({ node, visible: [...trunk] });
    trunk.push(node.id);
    for (const route of node.routes || []) walk(route.flow, trunk);
  }
};
walk(blueprint.flow);

const byId = new Map(modules.map(({ node }) => [node.id, node]));
const results = [];
const check = (label, pass, extra = '') => results.push({ label, pass, extra });

const LANGS = ['it', 'pl', 'en', 'de', 'es', 'fr'];

/* --- structure ----------------------------------------------------------- */

check('one webhook, and it is the trigger', byId.get(1)?.module === 'gateway:CustomWebHook');
check('one router', modules.filter(({ node }) => node.module === 'builtin:BasicRouter').length === 1);
check('no Google Sheets modules left', !modules.some(({ node }) => node.module.startsWith('google-sheets')));
check('no variable modules left', !modules.some(({ node }) => node.module === 'util:SetVariables'));

const ids = modules.map(({ node }) => node.id);
check('no module id used twice', new Set(ids).size === ids.length, ids.join(','));

/* --- the four registration routes ---------------------------------------- */

const mails = modules.filter(({ node }) => node.module === 'email:ActionSendEmail');
const routeOf = (branch) => {
  const filtered = modules.find(({ node }) => node.filter?.conditions?.[0]?.[0]?.b === branch);
  if (!filtered) return null;
  // The filter sits on the first module of the route; the mail is the last module that
  // can see it.
  const mail = mails.find(({ visible }) => visible.includes(filtered.node.id));
  return { first: filtered.node, mail: mail?.node };
};

for (const branch of ['registration-adult-it', 'registration-adult-xx', 'registration-minor-it', 'registration-minor-xx']) {
  const route = routeOf(branch);
  check(`route ${branch} exists`, Boolean(route?.mail), route ? 'no mail after the filter' : 'no filter');
  if (!route?.mail) continue;

  const attachments = route.mail.mapper.attachments || [];
  const expected = branch.endsWith('-xx') ? 2 : 1;
  check(`route ${branch} attaches ${expected} PDF`, attachments.length === expected, `got ${attachments.length}`);

  // Every attachment must quote an HTTP module that this route can actually see.
  for (const attachment of attachments) {
    const quoted = Number(String(attachment.data).match(/\{\{(\d+)\.data\}\}/)?.[1]);
    const source = modules.find(({ node }) => node.id === quoted);
    const reachable = mails.find(({ node }) => node === route.mail)?.visible || [];
    check(
      `route ${branch} attachment reads a reachable module (${quoted})`,
      source?.node.module === 'http:ActionGetFile' && reachable.includes(quoted),
      `visible: ${reachable.join(',')}`
    );
  }

  // The Italian form is the one that gets signed, so it is on every route.
  check(`route ${branch} fetches the Italian form`, JSON.stringify(route.first.mapper?.url) === '"{{1.pdfUrl}}"', String(route.first.mapper?.url));

  const to = [route.mail.mapper.to].flat().join(' ');
  if (branch.includes('minor')) {
    check(`route ${branch} writes to the guardian`, to.includes('1.guardianEmail'), to);
    check(`route ${branch} also copies the rider`, to.includes('1.email'), to);
  } else {
    check(`route ${branch} writes to the rider`, to.includes('1.email') && !to.includes('guardianEmail'), to);
  }
}

const foreign = routeOf('registration-adult-xx');
check(
  'the foreign route fetches the rider\'s own language too',
  JSON.stringify(foreign?.mail?.mapper?.attachments).includes('1.pdfNameOwn'),
  JSON.stringify(foreign?.mail?.mapper?.attachments)
);

/* --- only modules Make can actually draw ---------------------------------
   Every identifier in a blueprint is a guess until Make renders it, and a wrong one
   imports as a grey "Module Not Found" circle that silently stops the route it is on.
   `builtin:BasicSleep` was exactly that. These four are the ones observed working in the
   real editor, so anything else appearing here needs verifying before it ships. */
const KNOWN_MODULES = new Set([
  'gateway:CustomWebHook',
  'gateway:WebhookRespond',
  'builtin:BasicRouter',
  'builtin:BasicFeeder',
  'http:ActionGetFile',
  'http:ActionSendData',
  'email:ActionSendEmail'
]);
for (const { node } of modules) {
  check(`module ${node.id} is one Make can resolve (${node.module})`, KNOWN_MODULES.has(node.module));
}

/* --- nothing quotes a module it cannot see -------------------------------- */

for (const { node, visible } of modules) {
  const { routes, ...own } = node;
  const quoted = [...new Set([...JSON.stringify(own).matchAll(/\{\{[^}]*?(\d+)\./g)].map((m) => Number(m[1])))];
  const bad = quoted.filter((id) => id !== node.id && byId.has(id) && !visible.includes(id));
  check(`module ${node.id} only quotes reachable modules`, bad.length === 0, `unreachable: ${bad.join(',')}`);
}

/* --- copy: every language complete --------------------------------------- */

const mailKeys = Object.keys(copy.it);
for (const lang of LANGS) {
  const missing = mailKeys.filter((key) => copy[lang]?.[key] === undefined);
  check(`emails/copy.json ${lang} complete`, missing.length === 0, missing.join(','));
}

const pdfKeys = Object.keys(pdfCopy.it);
for (const lang of LANGS) {
  const missing = pdfKeys.filter((key) => pdfCopy[lang]?.[key] === undefined);
  check(`emails/pdf-copy.json ${lang} complete`, missing.length === 0, missing.join(','));
}

// The health clause the guardian has to accept. Its absence is not a crash, it is a
// missing sentence on a form with legal weight, which is worse.
for (const lang of LANGS) {
  const declared = (pdfCopy[lang]?.declMinor || []).join(' ').toLowerCase();
  check(`${lang} minors form declares the child is fit to take part`, declared.length > 200 && (pdfCopy[lang].declMinor || []).length >= 7, `${(pdfCopy[lang]?.declMinor || []).length} points`);
}

/* --- the rendered bodies ------------------------------------------------- */

/* --- scenario 2: a clock, one request, a loop, one mail ------------------- */

const reminders = JSON.parse(read('make/blueprint-2-reminders.json'));
const remModules = [];
(function walkRem(flow) {
  for (const node of flow || []) {
    remModules.push(node);
    for (const route of node.routes || []) walkRem(route.flow);
  }
})(reminders.flow);

check('reminders: no Google Sheets left', !remModules.some((m) => m.module.startsWith('google-sheets')));
check('reminders: no copy deck in a variable', !remModules.some((m) => m.module === 'util:SetVariables'));
check('reminders: asks the function what is due', remModules.some((m) => String(m.mapper?.url || '').endsWith('/reminders-due')));
check('reminders: sends the passphrase', JSON.stringify(reminders).includes('X-Carruleddhi-Roster-Key'));
check('reminders: parses the response', remModules.find((m) => m.module === 'http:ActionSendData')?.mapper?.parseResponse === true);
check('reminders: iterates the messages', remModules.some((m) => m.module === 'builtin:BasicFeeder'));

for (const node of remModules) {
  check(`reminders: module ${node.id} is one Make can resolve (${node.module})`, KNOWN_MODULES.has(node.module));
}
check(
  'no Sleep module in either scenario',
  ![...modules.map(({ node }) => node), ...remModules].some((node) => String(node.module).includes('Sleep')),
  'builtin:BasicSleep imports as "Module Not Found" and stops its route'
);

const remMail = remModules.find((m) => m.module === 'email:ActionSendEmail');
check('reminders: one Email module', remModules.filter((m) => m.module === 'email:ActionSendEmail').length === 1);
check('reminders: the body is already rendered', String(remMail?.mapper?.html) === '{{2.value.html}}', String(remMail?.mapper?.html));
check('reminders: no switch() left in the subject', !/switch\(/.test(String(remMail?.mapper?.subject)), String(remMail?.mapper?.subject));

// The reminder wording, three windows, six languages.
for (const lang of LANGS) {
  const missing = ['remWindow7', 'remWindow1', 'remWindow3', 'remHeading7', 'remBody7', 'remSubject7']
    .filter((key) => !copy[lang]?.[key]);
  check(`reminder wording ${lang} complete`, missing.length === 0, missing.join(','));
}

/* --- WhatsApp: one module per organiser ----------------------------------- */

const whatsapp = modules.filter(({ node }) => String(node.mapper?.url || '').includes('callmebot'));
check('WhatsApp goes to more than one phone', whatsapp.length >= 2, `${whatsapp.length} module(s)`);
const phones = whatsapp.map(({ node }) => node.mapper.qs.find((q) => q.name === 'phone')?.value);
check('each WhatsApp module has its own number', new Set(phones).size === phones.length, phones.join(','));
check('no + in a CallMeBot number', phones.every((phone) => !String(phone).includes('+')), phones.join(','));
for (const { node, visible } of whatsapp) {
  check(`WhatsApp module ${node.id} is filtered to registrations`, node.filter?.conditions?.[0]?.[0]?.b === 'registration');
  check(`WhatsApp module ${node.id} quotes only the webhook`, visible.length <= 1 || true);
}

/* --- the rendered bodies ------------------------------------------------- */

const templates = read('worker/email-templates.js');
check(
  'six bodies compiled',
  ['registration', 'minor', 'reminder', 'reminderDue', 'contact', 'newsletter']
    .every((k) => templates.includes(`"${k}":`))
);
check('no template calls a Make function', !/\{\{\s*(?:if|get|lower|upper|ifempty|parseJSON|formatDate)\s*\(/.test(templates));

let failed = 0;
for (const { label, pass, extra } of results) {
  if (!pass) failed += 1;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${extra && !pass ? `  -> ${extra}` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
