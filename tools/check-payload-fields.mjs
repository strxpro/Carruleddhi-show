/**
 * Czy każda końcówka dostaje pola, o które pyta.
 * ===========================================================================
 * `sanitizePayload` przepisuje z żądania TYLKO pola wymienione w `FIELD_WHITELIST` — pod
 * własnym typem albo w `common`. Wszystko inne wypada po cichu: bez błędu, bez wpisu w logu,
 * bez śladu w odpowiedzi.
 *
 * To już dwa razy zatrzymało całą zakładkę, oba razy meldując sukces:
 *   - zapis ustawień: `settings` nie przechodziło przez sanitizer, więc `settingsAdmin`
 *     wchodziło w gałąź „nic nie podano, oddaj bieżące" i odpowiadało `ok: true`;
 *   - transmisja: `stream-admin` nie miało wpisu w ogóle, więc `payload.action` było zawsze
 *     `undefined`, a `streamAdmin` traktował KAŻDE żądanie jak odczyt stanu. Zapis, otwarcie
 *     transmisji, wysyłka powiadomień — wszystko zwracało 200 i nie robiło nic.
 *
 * Wspólny mianownik: brakujące pole nie wygląda jak awaria. Wygląda jak sukces. Żaden test
 * jednostkowy tego nie łapie, bo funkcja obsługująca działa poprawnie — po prostu dostaje
 * pusty ładunek.
 *
 * Ten skrypt czyta źródło Workera, dla każdej końcówki znajduje jej funkcję obsługującą,
 * wypisuje wszystkie pola, których ta funkcja czyta z `payload`, i sprawdza, czy każde z nich
 * przejdzie przez sanitizer.
 */
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../worker/index.js', import.meta.url), 'utf8');

/* ------------------------------------------------------------ lista dozwolonych pól */
const wlStart = src.indexOf('const FIELD_WHITELIST = {');
if (wlStart < 0) {
  console.error('check-payload-fields: nie znalazlem FIELD_WHITELIST w worker/index.js.');
  process.exit(1);
}
/* Koniec obiektu: pierwsza linia zaczynajaca sie od `};` po jego poczatku. */
const wlEnd = src.indexOf('\n};', wlStart);
const wlSrc = src.slice(wlStart, wlEnd + 3);

const whitelist = {};
for (const m of wlSrc.matchAll(/^\s*(?:'([^']+)'|([A-Za-z_$][\w$]*)):\s*\[([^\]]*)\]/gms)) {
  const nazwa = m[1] || m[2];
  whitelist[nazwa] = [...m[3].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}
const common = whitelist.common || [];
if (!common.length) {
  console.error('check-payload-fields: nie odczytalem listy `common` — popraw wzorzec w tym skrypcie.');
  process.exit(1);
}

/* ------------------------------------------------------------ końcówka -> funkcja */
const trasy = [...src.matchAll(/if \(type === '([a-z-]+)'\)\s*return\s+([A-Za-z_$][\w$]*)\(/g)]
  .map((m) => ({ typ: m[1], fn: m[2] }));

if (!trasy.length) {
  console.error('check-payload-fields: nie znalazlem zadnej trasy `if (type === ...) return ...`.');
  process.exit(1);
}

/* Wycina cialo funkcji od jej deklaracji do nastepnej deklaracji na poziomie pliku. */
const cialoFunkcji = (nazwa) => {
  const dekl = new RegExp('^(?:async )?function ' + nazwa + '\\b', 'm');
  const trafienie = dekl.exec(src);
  if (!trafienie) return '';
  const start = trafienie.index;
  const nastepna = /^(?:async )?function [A-Za-z_$]/m.exec(src.slice(start + 10));
  return nastepna ? src.slice(start, start + 10 + nastepna.index) : src.slice(start);
};

/* Pola, ktore handler czyta z ladunku. `payload.x`, `payload.x ?? payload.y`, `payload['x']`. */
const czytanePola = (kod) => {
  const pola = new Set();
  for (const m of kod.matchAll(/payload\.([A-Za-z_$][\w$]*)/g)) pola.add(m[1]);
  for (const m of kod.matchAll(/payload\['([^']+)'\]/g)) pola.add(m[1]);
  return pola;
};

/* `type` jest dopisywany do ladunku przez router juz PO sanitizacji, wiec nie musi byc
   na liscie. `turnstileToken` jest czytany z surowego wejscia, nie z ladunku. */
const zawszeDostepne = new Set(['type', 'turnstileToken']);

let bledow = 0;
let sprawdzonych = 0;

for (const { typ, fn } of trasy) {
  const kod = cialoFunkcji(fn);
  if (!kod) continue;
  const czytane = czytanePola(kod);
  if (!czytane.size) continue;
  sprawdzonych += 1;
  const dozwolone = new Set([...common, ...(whitelist[typ] || [])]);
  const brakujace = [...czytane].filter((p) => !dozwolone.has(p) && !zawszeDostepne.has(p));
  if (brakujace.length) {
    bledow += 1;
    console.error(`  ZLE  ${typ} -> ${fn}()`);
    console.error(`       czyta z ladunku pola, ktorych sanitizer nie przepusci: ${brakujace.join(', ')}`);
    console.error(`       dopisz je do FIELD_WHITELIST['${typ}'] w worker/index.js`);
    if (!whitelist[typ]) {
      console.error(`       UWAGA: '${typ}' nie ma W OGOLE wpisu w FIELD_WHITELIST —`);
      console.error('              ta koncowka dostaje tylko pola z `common` i po cichu nic nie robi.');
    }
  }
}

if (bledow) {
  console.error(`\ncheck-payload-fields: ${bledow} z ${sprawdzonych} koncowek nie dostanie swoich pol.`);
  process.exit(1);
}
console.log(`${sprawdzonych}/${sprawdzonych} passed (pola ladunku koncowek)`);
