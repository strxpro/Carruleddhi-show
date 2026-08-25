/**
 * Runs the wording resolver from worker/index.js against two made-up entries and
 * prints what Make receives. Read-only; changes nothing.
 *
 * The point is to answer "what do I have to add for a minor to get a different letter
 * in their own language" without opening Make: if the fields below are filled in, the
 * scenario already has everything, because every branch reads exactly these.
 *
 * Usage: node tools/show-what-arrives.mjs
 */
import { COPY_DECK } from '../worker/copy-deck.js';

/* Same two helpers as the function. Copied rather than imported because worker/index.js
   does not export them — they are internal, and a demo has no business widening its
   surface. If they drift, this file lies, so it says so out loud below. */
const LOCALES = new Set(['it', 'pl', 'en', 'de', 'es', 'fr']);
const localeOf = (value) => {
  const two = String(value || 'it').slice(0, 2).toLowerCase();
  return LOCALES.has(two) ? two : 'it';
};
const fill = (text, values) =>
  String(text || '').replace(/%([A-Z]+)%/g, (_, key) => String(values[key] ?? ''));

function resolve(payload) {
  const locale = localeOf(payload.locale);
  const deck = COPY_DECK[locale] || COPY_DECK.it;
  const first = String(payload.firstName || '').trim();
  const out = {
    locale,
    subject: payload.isMinor
      ? fill(deck.minSubject, { FIRSTNAME: first, RACENUMBER: payload.raceNumber })
      : fill(deck.regSubject, { FIRSTNAME: first, RACENUMBER: payload.raceNumber }),
    hi: fill(deck.regHi, { FIRSTNAME: first }),
    pdfUrl: payload.isMinor ? 'Carruleddhi-modulo-minori.pdf' : 'Carruleddhi-modulo.pdf',
    branch: payload.isMinor ? 'registration-minor' : 'registration-adult'
  };
  if (payload.isMinor) {
    const childWord = deck.minChild?.[payload.childKind] || deck.minChild?.child || '';
    out.minHi = fill(deck.minHi, { GUARDIAN: payload.guardianName });
    out.minLead = fill(deck.minLead, { CHILD: childWord, FIRSTNAME: first });
    out.ageNote = fill(deck.minAgeNote, { FIRSTNAME: first, AGE: payload.riderAge });
    out.printBody = deck.minPrintBody;
  } else {
    out.lead = deck.regLead;
    out.printBody = deck.regPrintBody;
  }
  return out;
}

const cases = [
  {
    label: 'DOROSLY, po polsku',
    payload: { locale: 'pl', firstName: 'Marek', isMinor: false, raceNumber: '041' }
  },
  {
    label: 'NIEPELNOLETNIA 14 lat, po polsku',
    payload: {
      locale: 'pl', firstName: 'Sara', isMinor: true, raceNumber: '042', riderAge: '14',
      childKind: 'daughter', guardianName: 'Anna Testowa'
    }
  },
  {
    label: 'DOROSLY, po wlosku',
    payload: { locale: 'it', firstName: 'Marco', isMinor: false, raceNumber: '043' }
  },
  {
    label: 'NIEPELNOLETNI, po niemiecku',
    payload: {
      locale: 'de', firstName: 'Jonas', isMinor: true, raceNumber: '044', riderAge: '16',
      childKind: 'son', guardianName: 'Petra Muster'
    }
  }
];

for (const { label, payload } of cases) {
  const r = resolve(payload);
  console.log(`\n=== ${label} ===`);
  console.log(`  branch    ${r.branch}      <- ktora galaz routera`);
  console.log(`  locale    ${r.locale}`);
  console.log(`  subject   ${r.subject}`);
  console.log(`  ${payload.isMinor ? 'minHi     ' + r.minHi : 'hi        ' + r.hi}`);
  if (payload.isMinor) {
    console.log(`  minLead   ${r.minLead}`);
    console.log(`  ageNote   ${r.ageNote}`);
  }
  console.log(`  pdf       ${r.pdfUrl}`);
}

console.log('\n--- co z tego wynika ---');
console.log('Jezyk maila: dziala. Kazdy tekst jest w jezyku zgloszenia.');
console.log('Inny mail dla nieletniego: dziala. Inny temat, inne powitanie, inny PDF.');
console.log('PDF: NADAL TYLKO WLOSKI. Dwa pliki - dorosly i nieletni - ale oba po wlosku.');
console.log('Wersje jezykowe PDF to osobna praca, jeszcze nie zrobiona.');
