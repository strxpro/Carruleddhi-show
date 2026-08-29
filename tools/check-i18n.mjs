/**
 * Żaden język nie może mieć dziury w słowniku.
 *
 * PO CO
 *   `applyLanguage` pomija klucz, którego nie ma w słowniku: `if (typeof dict[key] === 'string')`.
 *   To dobra decyzja — brakujący klucz zostawia napis z HTML, zamiast wypisywać na ekran
 *   „form.teamName" — ale znaczy też, że literówka w nazwie klucza nie objawia się niczym.
 *   Etykieta po prostu zostaje włoska we wszystkich sześciu językach i nikt tego nie zgłosi,
 *   bo strona wygląda na sprawną.
 *
 *   Trzy takie klucze siedziały w index.html: `form.teamName`, `form.cartNotes` i
 *   `success.close`, wszystkie przy istniejących poprawnych odpowiednikach. Znalazły się
 *   dopiero wtedy, gdy ktoś ich policzył. Ten plik je liczy.
 *
 * CO SPRAWDZA
 *   1. każdy klucz użyty w znaczniku rozwiązuje się w każdym języku;
 *   2. każdy klucz, po który sięga JavaScript, też;
 *   3. tłumaczenie nie jest po cichu włoskim tekstem podstawionym przez withFallback —
 *      bo `withFallback` sprawia, że brak tłumaczenia wygląda dokładnie jak tłumaczenie.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

/* i18n.js jest IIFE, które przypisuje do window i nie eksportuje niczego, więc jest tu
   wykonywane z podstawionym `window`. Nie kopia słownika: kopia rozjechałaby się z pierwszą
   poprawką i sprawdzałaby samą siebie. */
const scope = {};
new Function('window', read('assets/js/i18n.js'))(scope);
const dictionaries = scope.CARRULEDDHI_I18N;
const locales = Object.keys(dictionaries || {});

const results = [];
const check = (label, pass, extra = '') => results.push({ label, pass, extra });

check('slownik zbudowany dla szesciu jezykow', locales.length === 6, locales.join(','));
check('wloski jest kompletem, a nie sam sobie zapasem', Object.keys(dictionaries.it || {}).length > 200);

/* --- klucze ze znaczników ------------------------------------------------ */

const pages = ['index.html'];
const markupKeys = new Map();
for (const page of pages) {
  const html = read(page);
  for (const match of html.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)) {
    markupKeys.set(match[1], page);
  }
}

const missingInMarkup = [];
for (const [key, page] of markupKeys) {
  for (const locale of locales) {
    if (typeof dictionaries[locale][key] !== 'string') missingInMarkup.push(`${key} (${locale}, ${page})`);
  }
}
check(
  `wszystkie klucze ze znacznikow rozwiazuja sie w kazdym jezyku (${markupKeys.size})`,
  missingInMarkup.length === 0,
  missingInMarkup.slice(0, 8).join('; ')
);

/* --- klucze z kodu ------------------------------------------------------- */

/* Tylko wywołania z literałem. `text(headingKey)` przez zmienną jest tu niewidoczne i tak ma
   być: zgadywanie, co trafi do zmiennej, dawałoby ostrzeżenia o kluczach, które istnieją. */
const sources = ['assets/js/app.js', 'assets/js/voting.js'];
const codeKeys = new Map();
for (const file of sources) {
  const source = read(file);
  for (const match of source.matchAll(/\btext\('([a-zA-Z0-9._]+)'\)/g)) codeKeys.set(match[1], file);
}

const missingInCode = [];
for (const [key, file] of codeKeys) {
  for (const locale of locales) {
    if (typeof dictionaries[locale][key] !== 'string') missingInCode.push(`${key} (${locale}, ${file})`);
  }
}
check(
  `wszystkie klucze z kodu rozwiazuja sie w kazdym jezyku (${codeKeys.size})`,
  missingInCode.length === 0,
  missingInCode.slice(0, 8).join('; ')
);

/* --- czy tlumaczenie naprawde jest tlumaczeniem -------------------------- */

/**
 * `withFallback` dosypuje włoski pod każdy brakujący klucz, więc brak tłumaczenia i
 * tłumaczenie wyglądają identycznie. Sprawdzane są rodziny kluczy dodane po włosku i
 * przetłumaczone w całości — gdy w jednej z nich pojawi się włoski tekst pod obcym językiem,
 * znaczy to zapomniany wpis, a nie zamierzoną zgodność.
 *
 * Nazwy własne i skróty bywają takie same w kilku językach, dlatego porównanie omija napisy
 * krótsze niż 12 znaków — „E-mail *" jest po włosku i po polsku tym samym z wyboru.
 */
const translatedFamilies = ['voting.', 'entry.samePerson', 'entry.differentPerson', 'consent.'];
const untranslated = [];
for (const key of Object.keys(dictionaries.it)) {
  if (!translatedFamilies.some((family) => key.startsWith(family))) continue;
  const italian = dictionaries.it[key];
  if (typeof italian !== 'string' || italian.length < 12) continue;
  for (const locale of locales) {
    if (locale === 'it') continue;
    if (dictionaries[locale][key] === italian) untranslated.push(`${key} (${locale})`);
  }
}
check(
  'glosowanie, zgody i duplikat osoby sa przetlumaczone, a nie podstawione wloskim',
  untranslated.length === 0,
  untranslated.slice(0, 8).join('; ')
);

/* --- wynik -------------------------------------------------------------- */

let failed = 0;
for (const { label, pass, extra } of results) {
  if (!pass) failed += 1;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${extra && !pass ? `  -> ${extra}` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
