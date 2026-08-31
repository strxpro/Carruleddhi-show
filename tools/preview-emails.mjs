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
    message: 'Frage zum Helm.',
    /* The way out, at the foot of the letters that are subscriptions. A real-looking token
       so the rendered preview shows the link the recipient actually gets; the letters that
       are receipts do not carry the footer at all, so this goes unused in them. */
    unsubUrl: 'https://www.carruleddhishow.com/#unsub=8f1c2d3e4a5b6c7d8e9f0a1b2c3d4e5f',
    codeTitle: deck.unsubCodeTitle,
    codeLead: deck.unsubCodeLead,
    codeNote: deck.unsubCodeNote,
    code: '408912',
    /* The 7-day version of the reminder that actually goes out. The three-way choice
       between 7 days, 1 day and 3 hours is made in the function, so the template quotes a
       field — which means a preview has to pick one, and the earliest is the one whose
       wording is longest and therefore worth looking at. */
    remWindow: deck.remWindow7,
    remHeading: deck.remHeading7,
    remBody: deck.remBody7,
    remRiderLine: `#041 — ${deck.remRiderNote}`,
    /* Odsyłacz do formularza z wpisanymi danymi. Prawdziwy kształt adresu, z uuid i tokenem
       HMAC długości 32 znaków, bo w podglądzie chodzi o to, żeby zobaczyć, jak przycisk
       wygląda i czy się nie zawija — a nie o to, żeby link działał. Adres liczy worker
       (patrz formUrl w handlerze i w entryManage), tutaj nie ma z czego. */
    formUrl: 'https://www.carruleddhishow.com/api/carruleddhi/form'
      + '?id=1f2e3d4c-5b6a-4798-8899-aabbccddeeff&t=8f1c2d3e4a5b6c7d8e9f0a1b2c3d4e5f',

    /* Podium Nagrody publiczności. Pierwsze miejsce, bo to jedyny wariant, w którym nagłówek
       i temat mówią „wygrałeś" — pozostałe dwa różnią się wyłącznie tymi dwoma polami, a
       votingAdminWinners() wybiera je tym samym kluczem. Kolor plakietki też przychodzi
       gotowy, z tej samej trójki co cokół w liście do głosujących. */
    winSubject: deck.winSubject1,
    winHeading: deck.winHeading1,
    winColour: '#ffca28',
    winProject: 'Fulmine di Gallura',
    place: 1,
    startNumber: 41,
    category: 'classic',
    totalScore: 268,
    voteCount: 34,
    resultsUrl: 'https://www.carruleddhishow.com/votazione.html',

    /* Potwierdzenie głosu. Wariant z imieniem, bo bez imienia różni się wyłącznie pierwszą
       linijką, a z imieniem widać, czy podstawienie %FIRSTNAME% zadziałało. */
    rcptProject: 'Fulmine di Gallura',
    rcptUrl: 'https://www.carruleddhishow.com/votazione.html#vote=8f1c2d3e4a5b6c7d',
    score: 9
  };
  /* The attachment block. One form for an Italian rider, two for everybody else, which
     is the same choice attachCopy() makes and the reason these are fields at all. */
  const oneForm = locale === 'it';
  Object.assign(p, isMinor
    ? {
      pdfTitle: deck.minPdfTitle,
      pdfBody: deck.minPdfBody,
      printTitle: deck.minPrintTitle,
      printBody: oneForm ? deck.minPrintBodyOne : deck.minPrintBody
    }
    : {
      pdfTitle: oneForm ? deck.regPdfTitleOne : deck.regPdfTitle,
      pdfBody: oneForm ? deck.regPdfBodyOne : deck.regPdfBody,
      printTitle: deck.regPrintTitle,
      printBody: oneForm ? deck.regPrintBodyOne : deck.regPrintBody
    });
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
  ['reminder', 'pl', false], ['contact', 'pl', false], ['newsletter', 'pl', false],
  // The letter that actually goes out 7 days / 1 day / 3 hours before, and the one
  // carrying an unsubscribe code. Both were only visible in production until now.
  ['reminderDue', 'pl', false], ['code', 'pl', false],
  // Dwa języki, bo `winHeading`/`winSubject` są jedynymi polami, które worker wybiera z
  // trzech wariantów — a wariant wybrany źle widać dopiero w gotowym liście.
  ['winner', 'it', false], ['winner', 'pl', false],
  ['voteReceipt', 'it', false], ['voteReceipt', 'pl', false]
];

/**
 * Every path a template asks for, and whether the payload actually has it.
 *
 * The renderer turns an unknown path into an empty string, which is the friendly
 * behaviour at runtime and useless here: a heading that silently vanished looks like a
 * design decision. This is the check that was missing — it is how "Ciao %FIRSTNAME%,"
 * shipped in full to every adult, and how four attachment headings came out blank.
 */
function missingPaths(template, payload) {
  const paths = new Set([...String(template).matchAll(/\{\{\s*1\.([A-Za-z0-9_.]+)\s*\}\}/g)].map((m) => m[1]));
  const missing = [];
  for (const path of paths) {
    let value = payload;
    for (const key of path.split('.')) {
      if (value === null || value === undefined) break;
      value = value[key];
    }
    if (value === undefined || value === null || value === '') missing.push(path);
  }
  return missing;
}

let problems = 0;
for (const [template, locale, isMinor] of wanted) {
  const payload = payloadFor({ locale, isMinor });
  const html = renderTemplate(EMAIL_TEMPLATES[template], payload);

  const gaps = [...html.matchAll(/\{\{[^}]*\}\}/g)].map((m) => m[0]);
  // A deck string reached the body without being resolved. %FIRSTNAME% printed
  // literally in a greeting is the worst-looking bug on this list.
  const tokens = [...new Set([...html.matchAll(/%[A-Z]+%/g)].map((m) => m[0]))];
  const missing = missingPaths(EMAIL_TEMPLATES[template], payload);
  const empty = [...html.matchAll(/>\s*—\s*</g)].length;

  const name = `${template}-${locale}.html`;
  writeFileSync(new URL(`../shots/emails/${name}`, import.meta.url), html, 'utf8');
  problems += gaps.length + tokens.length + missing.length;

  console.log(
    `${name.padEnd(24)} ${(html.length / 1024).toFixed(1)} kB   `
    + `nieuzupelnione: ${gaps.length ? gaps.slice(0, 3).join(' ') : 'brak'}   `
    + `%TOKEN%: ${tokens.length ? tokens.join(' ') : 'brak'}   `
    + `puste pola: ${missing.length ? missing.join(' ') : 'brak'}   `
    + `kreski: ${empty}`
  );
}

console.log(`\nshots/emails/ — otworz w przegladarce.`);
if (problems) {
  console.error(`\n${problems} problemow. Kazdy to widoczna dziura albo surowy placeholder w mailu.`);
  process.exit(1);
}
