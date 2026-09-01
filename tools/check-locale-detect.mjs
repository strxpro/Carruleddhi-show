/**
 * Rozpoznawanie języka wiadomości w czacie, sprawdzane bez sieci i bez modelu.
 *
 * PO CO OSOBNY PLIK
 *   `detectLocale` rozstrzyga, w jakim języku odpowie automat. Pomyłka nie wywali się na
 *   żadnym ekranie i nie zapisze się w żadnym logu jako błąd — objawi się gościem, który
 *   napisał po polsku i dostał odpowiedź po niemiecku. Zgłoszone jako „AI nie chce działać",
 *   bo z drugiej strony ekranu wygląda to identycznie jak awaria.
 *
 *   Dokładnie to się zdarzyło: polskie „się" pisane bez ogonka to „sie", czyli niemiecki
 *   zaimek, który stał w tabeli `de` i nie stał w `pl`. Zdanie „O ktorej godzinie zaczyna sie
 *   wyscig?" wychodziło PEWNYM niemieckim, 2 punkty do 0. Sprawdzone na produkcji 01.09.2026:
 *   polskie pytanie, niemiecka odpowiedź.
 *
 * DLACZEGO FUNKCJE SĄ WYCIĄGANE ZE ŹRÓDŁA
 *   Tak samo jak w check-voting.mjs: worker/index.js jest modułem Workera i nie zaimportuje
 *   się w Node. Kopia tabel tutaj byłaby drugim słownikiem, który przestanie odpowiadać
 *   pierwszemu przy najbliższej poprawce — a to jest dokładnie ten rodzaj rozjazdu, który ten
 *   plik ma łapać. Testowany jest tekst z pliku: co jest w Workerze, to jest sprawdzane.
 *
 * CO TU NIE JEST SPRAWDZANE
 *   Nie ma tu progu „ile procent zdań ma wychodzić poprawnie". Każde zdanie na liście jest
 *   zdaniem, które gość naprawdę może napisać, więc każde ma wychodzić poprawnie — a lista
 *   rośnie o przypadek, który kiedyś nie wyszedł.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/* Bez CR: plik ma zakończenia CRLF, a znaczniki niżej są pisane z samym LF. */
const worker = readFileSync(resolve(root, 'worker/index.js'), 'utf8').split(String.fromCharCode(13)).join('');

const between = (from, to) => {
  const a = worker.indexOf(from);
  const b = worker.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error(`nie znalazlem fragmentu: ${from}`);
  return worker.slice(a, b);
};

const zrodlo = [
  between('const LOCALE_HINTS = {', '/* Jedno wyrażenie na język'),
  between('const LOCALE_WORD_RE =', '/**\n * Rozpoznaje język'),
  between('function detectLocale(text', '/* Nazwy języków po polsku'),
  between('function detectLocaleSure(text', '/** Loads a thread by its browser token'),
  'export { detectLocale, detectLocaleSure };'
].join('\n');

const { detectLocaleSure } = await import(
  'data:text/javascript;base64,' + Buffer.from(zrodlo, 'utf8').toString('base64')
);

/**
 * Zdania, które gość naprawdę może napisać.
 *
 * Polski występuje w dwóch odmianach z rozmysłem: z ogonkami i bez. Bez ogonków pisze
 * większość ludzi z telefonu, a to właśnie ta odmiana nie miała czym punktować — dopóki
 * „sie", „ktorej" i reszta nie trafiły do tabeli.
 *
 * Niemieckie zdania z „Sie" są tu po to, żeby naprawa polskiego nie zepsuła niemieckiego:
 * „sie" stoi teraz po obu stronach i samo się znosi, więc o wyniku decyduje reszta zdania.
 */
const PROBKI = [
  // polski Z OGONKAMI
  ['pl', 'O której godzinie zaczyna się wyścig?'],
  ['pl', 'Czy mogę zapisać dziecko na zawody?'],
  ['pl', 'Gdzie jest start i czy będzie parking?'],
  // polski BEZ OGONKÓW — odmiana, która się psuła
  ['pl', 'O ktorej godzinie zaczyna sie wyscig?'],
  ['pl', 'Czy moge zapisac dziecko na zawody?'],
  ['pl', 'Gdzie jest start i czy bedzie parking?'],
  ['pl', 'Ile kosztuje udzial w zawodach?'],
  ['pl', 'Kto moze wystartowac i jakie sa zasady?'],
  ['pl', 'Chcialbym sie wypisac z powiadomien'],
  ['pl', 'Jak moge zmienic swoje dane w zgloszeniu?'],
  // włoski
  ['it', 'A che ora inizia la gara?'],
  ['it', 'Posso iscrivere mio figlio alla discesa?'],
  ['it', 'Dove si trova la partenza e come arrivo?'],
  ['it', 'Vorrei sapere quanto costa la partecipazione'],
  // niemiecki
  ['de', 'Wann beginnt das Rennen?'],
  ['de', 'Kann ich mein Kind anmelden?'],
  ['de', 'Wo ist der Start und wie komme ich dorthin?'],
  ['de', 'Ich möchte mich für das Rennen anmelden'],
  ['de', 'Können Sie mir bitte helfen?'],
  ['de', 'Wo finden Sie die Anmeldung?'],
  ['de', 'Sie sind sehr nett, wann ist das Rennen?'],
  ['de', 'Ich weiss nicht wie das geht, konnen Sie mir sagen wann es losgeht?'],
  // angielski
  ['en', 'What time does the race start?'],
  ['en', 'Can I register my child for the event?'],
  ['en', 'Where is the start and is there parking?'],
  // hiszpański
  ['es', '¿A qué hora empieza la carrera?'],
  ['es', 'Puedo inscribir a mi hijo en la carrera?'],
  // francuski
  ['fr', 'À quelle heure commence la course?'],
  ['fr', 'Je voudrais inscrire mon fils à la descente'],
  ['fr', 'Où est le départ et comment y aller?']
];

const results = [];
for (const [oczekiwany, zdanie] of PROBKI) {
  /* Fallback celowo INNY niż oczekiwany język. Gdyby wynik pochodził z fallbacku, a nie
     z rozpoznania, test by tego nie zauważył. */
  const fallback = oczekiwany === 'it' ? 'de' : 'it';
  const wynik = detectLocaleSure(zdanie, fallback);
  results.push({
    label: `${oczekiwany}: ${zdanie}`,
    pass: wynik.locale === oczekiwany && wynik.sure,
    extra: wynik.sure ? `rozpoznane jako ${wynik.locale}` : `nierozpoznane, zeszlo na ${wynik.locale}`
  });
}

let failed = 0;
for (const { label, pass, extra } of results) {
  if (!pass) failed += 1;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${extra && !pass ? `  -> ${extra}` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
