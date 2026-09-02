/**
 * Rozpoznawanie SPRAWY w wiadomości gościa, sprawdzane bez sieci i bez modelu.
 *
 * PO CO OSOBNY PLIK
 *   `dataIntent` rozstrzyga, czy zdanie otwiera kreator — wycofania, zmiany danych, wypisania
 *   z powiadomień albo zmiany decyzji o wydruku — czy leci dalej, do słownika i do modelu.
 *   Pomyłka nie wywali się na żadnym ekranie: objawi się gościem, który poprosił o jedną
 *   rzecz i dostał odpowiedź o innej. Tak właśnie wyglądały dwa błędy zapisane w komentarzach
 *   przy tych tabelach: „chcę zrezygnować z wyścigu" nie trafiało w nic i model odpowiadał
 *   ceną sponsoringu, a „zmienić numer telefonu w MOIM zgłoszeniu" dostawało regułkę
 *   o numerze STARTOWYM.
 *
 *   Tabele rosną przy każdej takiej pomyłce, a każde dosypane słowo może odebrać zdanie innej
 *   sprawie. Ten plik jest po to, żeby to było widać od razu, a nie po wdrożeniu.
 *
 * DLACZEGO FUNKCJE SĄ WYCIĄGANE ZE ŹRÓDŁA
 *   Tak samo jak w check-voting.mjs i check-locale-detect.mjs: worker/index.js jest modułem
 *   Workera i nie zaimportuje się w Node. Kopia tabel tutaj byłaby drugim słownikiem, który
 *   przestanie odpowiadać pierwszemu przy najbliższej poprawce — czyli dokładnie tym
 *   rozjazdem, który ten plik ma łapać.
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
  between('const DATA_INTENTS = [', 'const DATA_INTENT_PATTERNS'),
  between('const DATA_INTENT_PATTERNS', '/* Słowa, bez których'),
  between('const DATA_SELF_PATTERNS', '/* DRUGI SYGNAŁ TYLKO'),
  between('const DATA_RACE_PATTERNS', '/**\n * Czy ktoś pyta o sponsorowanie'),
  between('function dataIntent(question)', '/**\n * Answers built from the copy deck'),
  'export { dataIntent };'
].join('\n');

const { dataIntent } = await import(
  'data:text/javascript;base64,' + Buffer.from(zrodlo, 'utf8').toString('base64')
);

/**
 * Zdania, które gość naprawdę może napisać, i sprawa, którą każde otwiera.
 *
 * `null` znaczy „żadna" — czyli zdanie ma pojechać do słownika i do modelu. Te przypadki są
 * tu równie ważne jak trafienia: kreator otwarty na zwykłe pytanie o godzinę startu byłby
 * gorszy niż brak kreatora.
 */
const PROBKI = [
  // wydruk formularza — sprawa dodana razem z kolumną wants_print
  ['print', 'Nie mam drukarki, wydrukujcie za mnie formularz'],
  ['print', 'Chce sam wydrukowac formularz, nie drukujcie'],
  ['print', 'Non ho una stampante, potete stampare voi il modulo?'],
  ['print', 'I have no printer, can you print the form for me?'],
  ['print', 'Ich habe keinen Drucker, koennt ihr das Formular drucken?'],
  ['print', 'No tengo impresora, podeis imprimir el formulario?'],
  ['print', 'Je n ai pas d imprimante, pouvez-vous imprimer le formulaire ?'],
  // wycofanie — wskazaniem jest wyścig, nie słowo „moje"
  ['withdraw', 'chce zrezygnowac z wyscigu'],
  ['withdraw', 'wycofajcie mnie z zawodow'],
  ['withdraw', 'vorrei ritirare la mia iscrizione'],
  // zmiana danych — wymaga wskazania siebie
  ['edit', 'chce zmienic numer telefonu w moim zgloszeniu'],
  ['edit', 'vorrei correggere i miei dati'],
  // powiadomienia — jednoznaczne same z siebie
  ['notifications', 'nie chce powiadomien'],
  ['notifications', 'non voglio piu le notifiche'],
  // ŻADNA sprawa: zwykłe pytania, które mają pojechać dalej
  [null, 'o ktorej godzinie zaczyna sie wyscig?'],
  [null, 'ile kosztuje udzial w zawodach?'],
  [null, 'czy moge zmienic kola w wozku przed startem?'],
  [null, 'gdzie jest start i czy bedzie parking?']
];

const results = PROBKI.map(([oczekiwana, zdanie]) => {
  const wynik = dataIntent(zdanie);
  return {
    label: `${oczekiwana === null ? '(zadna)' : oczekiwana}: ${zdanie}`,
    pass: wynik === oczekiwana,
    extra: `wyszlo ${wynik === null ? '(zadna)' : wynik}`
  };
});

let failed = 0;
for (const { label, pass, extra } of results) {
  if (!pass) failed += 1;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${pass ? '' : `  -> ${extra}`}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
