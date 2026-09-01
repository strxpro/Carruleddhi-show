/**
 * Rocznik edycji i odmowy, które przy jego zakładaniu naprawdę wracają z serwera.
 *
 * DLACZEGO TO STOI W OSOBNYM PLIKU, A NIE W WIDOKU
 *   Dwie rzeczy tutaj są ustaleniami o BAZIE, nie o wyglądzie ekranu: że kluczem archiwum
 *   jest rok liczony w strefie Europe/Rome (`to_char(p_event_date at time zone 'Europe/Rome',
 *   'YYYY')` w `rollover_voting_edition`, migracja 0030) i że lista kodów odmowy jest
 *   zamknięta, bo Worker wypisuje ją jawnie w `action === 'announce'`. Trzymane w komponencie
 *   rozjechałyby się z bazą przy pierwszej kopii tego kodu do drugiego miejsca — a kopia jest
 *   pewna, bo datę edycji da się dziś ustawić w dwóch miejscach panelu.
 *
 * Bez `any` i bez `!`: cała zawartość to funkcje czyste na napisach, więc nie ma tu miejsca,
 * w którym trzeba by cokolwiek obiecywać kompilatorowi na słowo.
 */

import type { TranslateKey } from '../i18n';

/**
 * Przedział roku, który wolno zapisać.
 *
 * Ten sam, co w karcie wydarzenia w `SettingsView`, i z tego samego powodu: natywny
 * `datetime-local` w Chrome oddaje wartość po każdym wpisanym znaku, więc w drodze do „2027"
 * przechodzi przez „0002" i „0202". `new Date('0002-10-17T12:30')` jest poprawną datą, nie
 * błędem, a rok 0002 zapisany jako termin zatrzymuje licznik na stronie głównej na zerach.
 */
export const EDITION_YEAR_MIN = 2020;
export const EDITION_YEAR_MAX = 2100;

/**
 * Rok, pod którym baza zapisze ten termin w archiwum.
 *
 * Liczony w strefie Europe/Rome, a NIE zegarem przeglądarki, bo dokładnie tak liczy go
 * `rollover_voting_edition`. Różnica jest jedną godziną w roku i właśnie ona boli: termin
 * ustawiony na 31 grudnia 23:30 czasu polskiego to 1 stycznia w Rzymie tylko przy innej
 * strefie urządzenia, a organizator z telefonem przestawionym na inny kraj widziałby rok
 * inny niż ten, który zaraz założy baza — i ostrzeżenie o zajętym roczniku pokazywałoby się
 * dla nie tego roku.
 *
 * Pusty napis, gdy daty nie da się odczytać. Nie zero i nie wyjątek: wywołujący ma
 * pokazywać rok jako dużą liczbę, a „" rysuje się jako brak, podczas gdy 0 rysuje się jako
 * prawdziwy rocznik zero.
 */
export function editionYearInRome(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  /* `en-CA` daje cyfry arabskie bez dodatków niezależnie od języka panelu. Formatowanie
     samego roku w słowniku „pl-PL" bywa w niektórych przeglądarkach wypisywane jako „2027 r.",
     a to jest napis do porównywania z kluczem z bazy, nie do czytania. */
  const year = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric' }).format(date);
  return /^\d{4}$/.test(year) ? year : '';
}

/** Czy rok tej daty mieści się w rozsądnym przedziale — patrz EDITION_YEAR_MIN. */
export function editionYearSane(iso: string): boolean {
  const year = Number(editionYearInRome(iso));
  return Number.isFinite(year) && year >= EDITION_YEAR_MIN && year <= EDITION_YEAR_MAX;
}

/**
 * `datetime-local` → ISO w UTC. Pusty napis, gdy pole jest w połowie wpisywania.
 *
 * Osobno od `editionYearInRome`, bo to jest przeliczenie WEJŚCIA, a tamto odczyt STREFY
 * WYDARZENIA. Sklejone w jedno wyglądałyby jak jedna operacja i pierwsza poprawka w jednej
 * połowie po cichu zmieniłaby drugą.
 */
export function localInputToIso(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

/**
 * Kody, którymi Worker odmawia ogłoszenia edycji, i zdanie do każdego z nich.
 *
 * Lista jest zamknięta i wzięta z jednego miejsca — `if (action === 'announce')` w
 * `worker/index.js`:
 *   SETTINGS_EVENT_DATE                    422, zapisana data jest nieparsowalna;
 *   VOTING_RESULT_NOTIFICATIONS_PENDING    409, czekają prywatne zgody na wynik;
 *   VOTING_EDITION_NOT_CLOSED              409, głosowanie nie jest zamknięte;
 *   VOTING_EDITION_ROLLOVER_FAILED         502, funkcja bazy odmówiła z innego powodu;
 *   EDITION_ALREADY_EXISTS                 z `rollover_voting_edition`, gdy rocznik o tym
 *                                          roku już stoi w archiwum.
 *
 * EDITION_ALREADY_EXISTS jest tu, choć dzisiejszy Worker zwija go do
 * VOTING_EDITION_ROLLOVER_FAILED: baza podnosi ten wyjątek jawnie (migracja 0030), więc gdy
 * końcówka zacznie go przepuszczać, panel od razu powie właściwe zdanie, zamiast pokazywać
 * „spróbuj ponownie" przy błędzie, którego ponawianie nigdy nie naprawi.
 *
 * Zwracany jest KLUCZ tłumaczenia, nie gotowy napis: dzięki temu ten plik nie potrzebuje
 * dostępu do słownika i nie ma jak wypisać zdania tylko po polsku.
 */
const REFUSALS: Readonly<Record<string, TranslateKey>> = {
  SETTINGS_EVENT_DATE: 'wiz.errEventDate',
  VOTING_RESULT_NOTIFICATIONS_PENDING: 'wiz.errPending',
  VOTING_EDITION_NOT_CLOSED: 'wiz.errNotClosed',
  EDITION_ALREADY_EXISTS: 'wiz.errExists',
  VOTING_EDITION_ROLLOVER_FAILED: 'wiz.errRollover',
  /* Nie z gałęzi `announce`, ale z tej samej końcówki: zapis kroku 1–4 może się nie udać
     na zapisie ustawień, a „nie udało się" bez powodu wygląda jak awaria sieci. */
  SETTINGS_WRITE_FAILED: 'wiz.errWrite'
};

/**
 * Kod odmowy → klucz zdania. Nieznany kod dostaje zdanie ogólne, nigdy sam kod.
 *
 * `Record<string, …>` przy włączonym `noUncheckedIndexedAccess` oddaje `TranslateKey |
 * undefined`, więc brak wpisu jest tu widoczny w typie i musi zostać obsłużony — dokładnie
 * dlatego ta tablica nie jest czytana bezpośrednio w widoku.
 */
export function editionRefusalKey(code: string | undefined): TranslateKey {
  if (!code) return 'wiz.errUnknown';
  return REFUSALS[code] ?? 'wiz.errUnknown';
}
