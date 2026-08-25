/**
 * Renders every e-mail the way the Vercel function does and writes them to shots/.
 * Open the files in a browser to see exactly what a recipient gets.
 *
 * Read-only apart from the output files. This exists because the letters were only
 * ever visible after a real submission through Make, which is a slow and expensive way
 * to notice that a sentence is in the wrong language or a table has an empty cell.
 *
 * Usage: node tools/preview-emails.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { COPY_DECK } from '../worker/copy-deck.js';
import { EMAIL_TEMPLATES } from '../worker/email-templates.js';

/* The same three helpers as the function. Copied, not imported: they are internal to
   worker/index.js and a preview has no business widening its surface. If one drifts
   this file is wrong, which is why the assertion at the bottom checks for leftovers. */
const fill = (text, values) =>
  String(text || '').replace(/%([A-Z]+)%/g, (_, key) => String(values[key] ?? ''));

const escapeHtml = (value) =>
  String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const RAW_FIELDS = new Set(['checklistHtml']);

function renderTemplate(template, payload) {
  return String(template).replace(/\{\{\s*1\.([A-Za-z0-9_.]+)\s*\}\}/g, (_, path) => {
    let value = payload;
    for (const key of path.split('.')) {
      if (value === null || value === undefined) break;
      value = value[key];
    }
    if (value === null || value === undefined) return '';
    return RAW_FIELDS.has(path) ? String(value) : escapeHtml(value);
  });
}

function payloadFor({ locale, isMinor }) {
  const deck = COPY_DECK[locale];
  const first = isMinor ? 'Sara' : 'Marco';
  const p = {
    copy: deck,
    ev: COPY_DECK._event,
    loc: locale,
    localeUpper: locale.toUpperCase(),
    raceNumber: isMinor ? '042' : '041',
    firstName: first,
    lastName: 'Rossi',
    fullName: `${first} Rossi`,
    birthDateLabel: isMinor ? '04.03.2012' : '12.04.1994',
    postalCode: '07028',
    email: 'marco.rossi@example.com',
    emailLower: 'marco.rossi@example.com',
    phone: '+39 333 111 2233',
    address: 'Via Roma 4, 07028 Santa Teresa Gallura (SS)',
    cartName: 'Fulmine di Gallura',
    categoryUpper: 'CLASSIC',
    teamLabel: 'Squadra Nord',
    notesLabel: 'Freno a leva',
    generatedAt: '25.08.2026 09:14',
    isMinor,
    riderAge: isMinor ? '14' : '32',
    hi: fill(deck.regHi, { FIRSTNAME: first }),
    help: fill(deck.regHelp, { ORGEMAIL: COPY_DECK._event.email, ORGPHONE: COPY_DECK._event.phone }),
    printFooter: fill(deck.printFooter, { GENERATEDAT: '25.08.2026 09:14' }),
    checklistHtml: (deck.regChecklist || []).map(escapeHtml).join('</li><li>'),
    newsHi: fill(deck.newsHi, { FIRSTNAME: first }),
    name: 'Hans Probe',
    message: 'Frage zum Helm.'
  };
  if (isMinor) {
    const childWord = deck.minChild.daughter;
    Object.assign(p, {
      guardianName: 'Anna Rossi',
      guardianEmail: 'anna.rossi@example.com',
      guardianEmailLower: 'anna.rossi@example.com',
      guardianPhone: '+39 333 444 5566',
      motherLabel: 'Anna Rossi',
      fatherLabel: 'Luca Rossi',
      childWord,
      relWord: deck.minRel.mother,
      minHi: fill(deck.minHi, { GUARDIAN: 'Anna Rossi' }),
      minLead: fill(deck.minLead, { CHILD: childWord, FIRSTNAME: first }),
      ageNote: fill(deck.minAgeNote, { FIRSTNAME: first, AGE: '14' })
    });
  }
  return p;
}

mkdirSync(new URL('../shots/emails/', import.meta.url), { recursive: true });

const wanted = [
  ['registration', 'it', false], ['registration', 'pl', false],
  ['minor', 'pl', true], ['minor', 'de', true],
  ['reminder', 'pl', false], ['contact', 'pl', false], ['newsletter', 'pl', false]
];

let leftovers = 0;
for (const [template, locale, isMinor] of wanted) {
  const html = renderTemplate(EMAIL_TEMPLATES[template], payloadFor({ locale, isMinor }));
  const gaps = [...html.matchAll(/\{\{[^}]*\}\}/g)].map((m) => m[0]);
  const empty = [...html.matchAll(/>\s*—\s*</g)].length;
  const name = `${template}-${locale}.html`;
  writeFileSync(new URL(`../shots/emails/${name}`, import.meta.url), html, 'utf8');
  leftovers += gaps.length;
  console.log(
    `${name.padEnd(24)} ${(html.length / 1024).toFixed(1)} kB   `
    + `nieuzupelnione: ${gaps.length ? gaps.slice(0, 3).join(' ') : 'brak'}   pola z kreska: ${empty}`
  );
}

console.log(`\nshots/emails/ — otworz w przegladarce.`);
if (leftovers) {
  console.error(`\n${leftovers} nieuzupelnionych miejsc. Kazde to puste miejsce w mailu.`);
  process.exit(1);
}
