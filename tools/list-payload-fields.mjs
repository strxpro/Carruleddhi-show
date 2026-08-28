/**
 * Wypisuje wszystkie pola, jakie webhook Make może zobaczyć.
 *
 *     node tools/list-payload-fields.mjs
 *     node tools/list-payload-fields.mjs --markdown   > do wklejenia w dokumentację
 *
 * PO CO
 *   Make przy „Redetermine data structure" pokazuje „N values detected and ready to map".
 *   Ta lista mówi, czym te wartości są, jeszcze przed wysłaniem czegokolwiek — więc da się
 *   sprawdzić, czy Make wykrył wszystko, zamiast odkrywać brak `guardianName` tydzień
 *   później na pustym miejscu w mailu.
 *
 * SKĄD BIERZE DANE
 *   Czyta `worker/index.js`: tablicę FIELD_WHITELIST i przypisania `payload.x = ...`.
 *   Czytanie źródła, a nie druga ręcznie pisana lista — ręczna lista rozjeżdża się z kodem
 *   przy pierwszym dodanym polu i nikt tego nie zauważa.
 *
 *   Cena tego rozwiązania: to analiza tekstu, nie uruchomienie kodu. Pole nadane przez
 *   `payload[nazwa] = ...` ze zmienną w nawiasie nie zostanie znalezione. W tej chwili
 *   takiego nie ma i asercja na dole tego pilnuje.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'worker', 'index.js'), 'utf8');

/* --- 1. co przysyła przeglądarka -------------------------------------------------- */
const listBlock = source.slice(
  source.indexOf('const FIELD_WHITELIST'),
  source.indexOf('\n};', source.indexOf('const FIELD_WHITELIST'))
);
const whitelist = {};
for (const match of listBlock.matchAll(/(?:^|\n)\s*'?([a-zA-Z-]+)'?:\s*\[([^\]]*)\]/g)) {
  whitelist[match[1]] = [...match[2].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/* --- 2. co dokłada serwer --------------------------------------------------------- */
const copyStart = source.indexOf('function attachCopy');
const copyEnd = source.indexOf('/** dd.mm.yyyy', copyStart);
const copyBlock = source.slice(copyStart, copyEnd);
const rest = source.slice(0, copyStart) + source.slice(copyEnd);

const assigned = (text) => [...new Set(
  [...text.matchAll(/payload\.([A-Za-z0-9_]+)\s*=[^=]/g)].map((m) => m[1])
)];
const computed = assigned(copyBlock);
// Pola nadawane poza attachCopy, minus te, które i tak przyszły od przeglądarki.
const fromBrowser = new Set(Object.values(whitelist).flat());
const elsewhere = assigned(rest).filter((key) => !fromBrowser.has(key) && !computed.includes(key));

/* --- 3. wynik -------------------------------------------------------------------- */
const registration = [
  ...whitelist.common,
  ...whitelist.registration,
  ...elsewhere,
  ...computed
];
const unique = [...new Set(registration)];

const markdown = process.argv.includes('--markdown');
const GROUPS = [
  ['Wspólne dla każdego typu', whitelist.common],
  ['Zgłoszenie — z formularza', whitelist.registration],
  ['Dokładane przez serwer przed wysłaniem do Make', elsewhere],
  ['Wyliczane przez attachCopy() — gotowe teksty i adresy', computed]
];

if (markdown) {
  for (const [title, fields] of GROUPS) {
    console.log(`\n**${title}** (${fields.length})\n`);
    console.log(fields.map((f) => `\`${f}\``).join(' · '));
  }
  console.log(`\nRazem w zgłoszeniu nieletniego: **${unique.length} pól**.\n`);
  console.log('Pozostałe typy przysyłają mniej:\n');
  for (const [type, fields] of Object.entries(whitelist)) {
    if (type === 'common' || type === 'registration') continue;
    const total = whitelist.common.length + fields.length;
    console.log(`- \`${type}\` — ${total} pól${fields.length ? `: ${fields.map((f) => `\`${f}\``).join(', ')}` : ' (tylko wspólne)'}`);
  }
} else {
  for (const [title, fields] of GROUPS) {
    console.log(`\n${title} (${fields.length}):`);
    console.log('  ' + fields.join(', '));
  }
  console.log(`\nRAZEM w zgłoszeniu nieletniego: ${unique.length} pól`);
  console.log(`(zgłoszenie dorosłego jest krótsze — pola opiekuna nie jadą)`);
}

/* Asercje. Bez nich to narzędzie może po cichu zwrócić krótszą listę, a krótsza lista przy
   mapowaniu w Make oznacza puste miejsce w mailu. */
const problems = [];
if (!whitelist.common?.length) problems.push('nie odczytano FIELD_WHITELIST.common');
if (!whitelist.registration?.length) problems.push('nie odczytano FIELD_WHITELIST.registration');
if (computed.length < 30) problems.push(`attachCopy() dało tylko ${computed.length} pól — za mało`);
/* Tylko *przypisanie* przez nawias jest problemem. Czytanie (`!payload[key]`) i usuwanie
   (`delete payload[key]`) występuje w walidacji i w czyszczeniu pól opiekuna — to nie
   dokłada pola, którego lista mogłaby nie zauważyć. */
if (/payload\[[^\]]+\]\s*=[^=]/.test(source)) {
  problems.push('worker/index.js nadaje pole przez payload[zmienna] — regex tego nie widzi');
}
if (problems.length) {
  console.log('\n' + problems.map((p) => `FAIL  ${p}`).join('\n'));
  process.exit(1);
}
