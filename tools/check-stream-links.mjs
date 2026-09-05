/**
 * Adresy transmisji: czy panel rozumie to, co ludzie naprawdę wklejają.
 * ===========================================================================
 * Ten kawałek Workera nie miał ani jednego testu, a przeszedł już przez kilka rund poprawek
 * pod dyktando zgłoszeń „wklejam link i nie działa". Dopóki nie ma tu listy prawdziwych
 * formatów, każda kolejna poprawka jest zgadywaniem — działa dla tego jednego linku, który
 * akurat sprawdzono ręcznie.
 *
 * Najważniejsza pozycja na liście to `youtu.be/ID?si=...`. Tak wygląda WSZYSTKO, co wychodzi
 * dziś z przycisku „Udostępnij" w YouTube — a `?si=` to parametr śledzący doklejany od 2023
 * roku, więc to jest domyślna postać linku, nie przypadek brzegowy.
 *
 * Funkcje są wycinane ze źródła Workera i uruchamiane tutaj, bo worker/index.js jest modułem
 * Workera z jednym `export default` — nie da się zaimportować z niego pojedynczej funkcji bez
 * przebudowy pliku. Wycinek jest brany po nazwach stałych i funkcji, więc gdy któraś zniknie
 * albo zmieni nazwę, ten skrypt padnie z jasnym komunikatem zamiast po cichu testować pustkę.
 */
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../worker/index.js', import.meta.url), 'utf8');

const wytnij = (odKotwicy, doKotwicy, nazwa) => {
  const start = src.indexOf(odKotwicy);
  const stop = src.indexOf(doKotwicy, start + odKotwicy.length);
  if (start < 0 || stop < 0) {
    console.error(`check-stream-links: nie znalazlem fragmentu „${nazwa}" w worker/index.js.`);
    console.error('Jesli funkcje zmienily nazwe, popraw kotwice w tym skrypcie — nie usuwaj testu.');
    process.exit(1);
  }
  return src.slice(start, stop);
};

const kod = wytnij('const YOUTUBE_ID_RE', '\nasync function streamAdmin', 'pomocnicze funkcje transmisji');

const scope = {};
// eslint-disable-next-line no-new-func
new Function('exports', `${kod}\nexports.streamIdFrom = streamIdFrom; exports.embedUrl = embedUrl; exports.watchUrl = typeof watchUrl === 'function' ? watchUrl : null;`)(scope);
const { streamIdFrom, embedUrl } = scope;

const ID = 'dQw4w9WgXcQ';
const przypadki = [
  // ---------------------------------------------------------------- YouTube
  ['youtube', 'https://www.youtube.com/watch?v=' + ID, ID, 'zwykly watch'],
  ['youtube', 'https://www.youtube.com/watch?v=' + ID + '&ab_channel=Kanal', ID, 'watch z ab_channel'],
  ['youtube', 'https://www.youtube.com/watch?v=' + ID + '&t=42s', ID, 'watch ze znacznikiem czasu'],
  ['youtube', 'https://youtu.be/' + ID, ID, 'krotki youtu.be'],
  ['youtube', 'https://youtu.be/' + ID + '?si=AbCdEfGhIjKl', ID, 'przycisk Udostepnij (?si=)'],
  ['youtube', 'https://www.youtube.com/live/' + ID, ID, 'transmisja /live/'],
  ['youtube', 'https://www.youtube.com/live/' + ID + '?si=AbCdEfGh', ID, '/live/ z ?si='],
  ['youtube', 'https://www.youtube.com/embed/' + ID, ID, 'osadzenie /embed/'],
  ['youtube', 'https://m.youtube.com/watch?v=' + ID, ID, 'youtube z telefonu'],
  ['youtube', 'www.youtube.com/watch?v=' + ID, ID, 'bez https'],
  ['youtube', '  https://www.youtube.com/watch?v=' + ID + '  ', ID, 'ze spacjami dokola'],
  ['youtube', ID, ID, 'sam identyfikator'],
  ['youtube', 'https://www.youtube.com/@carruleddhi/live', '@channel', 'odsylacz do kanalu, nie do transmisji'],
  ['youtube', 'https://example.com/cokolwiek', '', 'obcy adres'],
  ['youtube', '', '', 'puste pole'],
  // ---------------------------------------------------------------- Twitch
  ['twitch', 'https://www.twitch.tv/carruleddhi', 'carruleddhi', 'kanal Twitch'],
  ['twitch', 'twitch.tv/carruleddhi', 'carruleddhi', 'Twitch bez https'],
  ['twitch', 'carruleddhi', 'carruleddhi', 'sama nazwa kanalu']
];

let zle = 0;
for (const [provider, wejscie, oczekiwane, opis] of przypadki) {
  let wynik;
  try {
    wynik = streamIdFrom(wejscie, provider);
  } catch (problem) {
    wynik = `WYJATEK: ${problem.message}`;
  }
  if (wynik !== oczekiwane) {
    zle += 1;
    console.error(`  ZLE  ${opis}`);
    console.error(`       wejscie:     ${JSON.stringify(wejscie)}`);
    console.error(`       oczekiwane:  ${JSON.stringify(oczekiwane)}`);
    console.error(`       otrzymane:   ${JSON.stringify(wynik)}`);
  }
}

/* Adres osadzenia musi byc pusty dla smiecia, a nie „prawie dobry": ramka z bledna
   sciezka pokazuje widzom komunikat YouTube o niedostepnym filmie, czyli gorzej niz
   brak zakladki. */
const osadzenia = [
  ['youtube', ID, true, 'poprawny identyfikator daje adres'],
  ['youtube', 'zakrotkie', false, 'za krotki identyfikator nie daje adresu'],
  ['youtube', '', false, 'pusty identyfikator nie daje adresu'],
  ['twitch', 'carruleddhi', true, 'kanal Twitch daje adres']
];
for (const [provider, id, maByc, opis] of osadzenia) {
  const wynik = embedUrl(provider, id, 'carruleddhishow.com');
  if (Boolean(wynik) !== maByc) {
    zle += 1;
    console.error(`  ZLE  ${opis} -> ${JSON.stringify(wynik)}`);
  }
}

const razem = przypadki.length + osadzenia.length;
if (zle) {
  console.error(`\ncheck-stream-links: ${zle} z ${razem} nie przeszlo.`);
  process.exit(1);
}
console.log(`${razem}/${razem} passed (adresy transmisji)`);
