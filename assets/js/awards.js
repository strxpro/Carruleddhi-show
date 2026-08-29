/**
 * Dwanaście nagród — jedna lista dla całej strony.
 * ===========================================================================
 *
 * Publiczność ocenia pojazdy w dwunastu nagrodach, po jednym głosie na nagrodę. Klucz
 * (`prize-1`) trafia do bazy jako `votes.category`; nazwa na ekranie bierze się ze słownika
 * (`prize.1`), więc nagroda nazywa się w sześciu językach bez ani jednej linii tutaj.
 *
 * DLACZEGO KLUCZ, A NIE NAZWA
 *   Nazwa jest tłumaczona. Gdyby do bazy szło „Più veloce Classic", to ta sama nagroda
 *   zapisana z polskiej wersji strony byłaby inną nagrodą — i limit „jeden głos na nagrodę"
 *   dałby się obejść przełączeniem języka.
 *
 * DRUGI EGZEMPLARZ TEJ LISTY JEST W WORKERZE
 *   `VOTE_AWARDS` w worker/index.js. Musi tam być, bo Worker sprawdza nagrodę z żądania
 *   względem zamkniętej listy i nie może importować niczego z `assets/` (inny cel budowania).
 *   Zgodność obu list sprawdza `tools/check-voting.mjs` — rozjazd zatrzymuje `npm run check`,
 *   więc nie da się dodać nagrody w jednym miejscu i zapomnieć o drugim.
 */

/** Dokładnie te wartości leżą w `votes.category`. Kolejność jest kolejnością na ekranie. */
export const AWARDS = [
  'prize-1',
  'prize-2',
  'prize-3',
  'prize-4',
  'prize-5',
  'prize-6',
  'prize-7',
  'prize-8',
  'prize-9',
  'prize-10',
  'prize-11',
  'prize-12'
];

/** Klucz słownika z nazwą nagrody. `prize-7` → `prize.7`, czyli to, co stoi na karcie w talii. */
export const awardLabelKey = (award) => `prize.${String(award).replace(/^prize-/, '')}`;

/** Numer na plakietce: `prize-7` → `07`. Ten sam zapis co numery na kartach nagród. */
export const awardNumber = (award) => String(String(award).replace(/^prize-/, '')).padStart(2, '0');

export const isAward = (award) => AWARDS.includes(String(award));
