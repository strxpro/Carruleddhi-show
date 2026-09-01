/**
 * Dwanaście nagród jury: kolejność, klucze, sprawdzenie kształtu odpowiedzi i podpisy.
 *
 * DLACZEGO OSOBNY PLIK
 *   Kolejność jest KONTRAKTEM ze stroną główną: karty w talii nagród w `index.html` czytają
 *   `prize.1`…`prize.12` ze słownika strony, a końcówka zapisuje przypisania pod `prize-1`…
 *   `prize-12`. To są dwa różne zapisy tej samej listy i jedyne, co je trzyma razem, to
 *   kolejność. Wpisana wprost w komponent, przy pierwszej zmianie układu ekranu przestawiłaby
 *   nagrody względem kart na stronie — czyli „Najszybszy Classic" pojawiłby się publicznie
 *   jako „Najwolniejszy" i nikt by tego nie zauważył w panelu.
 *
 *   Nie ma tu importu z `api.ts`. Funkcje niżej przyjmują najmniejszy kształt, jaki im
 *   wystarcza, więc ten plik kompiluje się niezależnie od tego, co dzieje się w kontrakcie
 *   końcówek — i da się go czytać bez wchodzenia w warstwę sieci.
 *
 * Bez `any` i bez `!`: sprawdzanie kształtu odpowiedzi jest tu zrobione na `unknown` i
 * dozorach typu, bo to jedyne miejsce w panelu, w którym dane naprawdę przychodzą z drutu
 * o nieznanym kształcie — Worker do tej końcówki powstaje równolegle z tym ekranem.
 */

import type { TranslateKey } from '../i18n';

export interface PrizeCategory {
  /** Klucz w bazie. Dokładnie ten, którego oczekuje `setPrize`. */
  prizeKey: string;
  /** Numer nagrody widoczny na ekranie i na karcie na stronie głównej. */
  number: number;
  /** Klucz nazwy kategorii w słowniku panelu, w obu językach. */
  label: TranslateKey;
}

/**
 * Kolejność ta sama, co talia kart na stronie głównej.
 *
 * `readonly` i jawny typ, nie `as const`: dzięki temu literówka w nazwie klucza tłumaczenia
 * jest błędem kompilacji tutaj, a nie brakującym napisem na ekranie w dniu wręczania nagród.
 */
export const PRIZE_CATEGORIES: readonly PrizeCategory[] = [
  { prizeKey: 'prize-1', number: 1, label: 'award.prize1' },
  { prizeKey: 'prize-2', number: 2, label: 'award.prize2' },
  { prizeKey: 'prize-3', number: 3, label: 'award.prize3' },
  { prizeKey: 'prize-4', number: 4, label: 'award.prize4' },
  { prizeKey: 'prize-5', number: 5, label: 'award.prize5' },
  { prizeKey: 'prize-6', number: 6, label: 'award.prize6' },
  { prizeKey: 'prize-7', number: 7, label: 'award.prize7' },
  { prizeKey: 'prize-8', number: 8, label: 'award.prize8' },
  { prizeKey: 'prize-9', number: 9, label: 'award.prize9' },
  { prizeKey: 'prize-10', number: 10, label: 'award.prize10' },
  { prizeKey: 'prize-11', number: 11, label: 'award.prize11' },
  { prizeKey: 'prize-12', number: 12, label: 'award.prize12' }
];

/** Ile nagród jest w talii. Liczone z listy, żeby „7 z 12" nie było drugą wersją prawdy. */
export const PRIZE_COUNT = PRIZE_CATEGORIES.length;

/** Jedna nagroda po sprawdzeniu kształtu. Ten sam zestaw pól, co `PrizeAssignment` w `api.ts`. */
export interface PrizeRow {
  prizeKey: string;
  participantId: string;
  winnerLabel: string;
  note: string;
  startNumber: number;
  projectName: string;
  riderName: string;
}

/** Czy ta pozycja ma w ogóle zwycięzcę. Jedno miejsce, bo warunek jest podwójny. */
export function prizeHasWinner(row: PrizeRow): boolean {
  return Boolean(row.participantId) || Boolean(row.winnerLabel.trim());
}

/* --------------------------------------------------- sprawdzanie kształtu */

/**
 * Napis z nieznanego pola. Brak, `null` i liczba schodzą do pustego napisu.
 *
 * Świadomie NIE `String(value)`: `String(null)` daje „null", a taki napis wylądowałby na
 * ekranie jako nazwa zwycięzcy. Puste pole rysuje się jako brak, czyli jako prawda.
 */
function readText(source: Record<string, unknown>, field: string): string {
  const value = source[field];
  return typeof value === 'string' ? value : '';
}

/** Liczba z nieznanego pola. Wszystko, co nie jest skończoną liczbą, schodzi na zero. */
function readNumber(source: Record<string, unknown>, field: string): number {
  const value = source[field];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  /* Napis też, bo REST czasem oddaje liczby w cudzysłowach — `Number('')` to 0, więc puste
     pole nie zamienia się w NaN, które sformatowałoby się na ekranie jako „NaN". */
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/**
 * Odpowiedź końcówki → dwanaście wierszy, albo `null` gdy odpowiedzi nie da się odczytać.
 *
 * DLACZEGO `null`, A NIE PUSTA LISTA
 *   Pusta lista i nieczytelna odpowiedź to dwa różne komunikaty dla organizatora: pierwsze
 *   znaczy „nikomu jeszcze nie przypisano", drugie „nie wiem, co jest przypisane". Zwinięcie
 *   ich w jedno pokazałoby dwanaście pustych wierszy w chwili, w której końcówka jeszcze nie
 *   istnieje — czyli zaproszenie do przypisania nagród po raz drugi.
 *
 * DLACZEGO WYNIK JEST ZAWSZE PEŁNĄ DWUNASTKĄ
 *   Kontrakt mówi, że końcówka oddaje dwanaście pozycji, ale ekran nie może na tym stać:
 *   pierwsze wdrożenie może oddać osiem, bo tyle jest wierszy w bazie. Wiersze bez
 *   odpowiednika w odpowiedzi są dopełniane pustymi, a pozycje o nieznanym `prizeKey` są
 *   pomijane — inaczej `prize-13` z pomyłki w Workerze dorysowałby trzynasty wiersz bez
 *   nazwy.
 */
export function normalisePrizes(raw: unknown): PrizeRow[] | null {
  if (!Array.isArray(raw)) return null;

  const byKey = new Map<string, PrizeRow>();
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const source = item as Record<string, unknown>;
    const prizeKey = readText(source, 'prizeKey');
    if (!prizeKey) continue;
    byKey.set(prizeKey, {
      prizeKey,
      participantId: readText(source, 'participantId'),
      winnerLabel: readText(source, 'winnerLabel'),
      note: readText(source, 'note'),
      startNumber: readNumber(source, 'startNumber'),
      projectName: readText(source, 'projectName'),
      riderName: readText(source, 'riderName')
    });
  }

  return PRIZE_CATEGORIES.map(
    (category) =>
      byKey.get(category.prizeKey) ?? {
        prizeKey: category.prizeKey,
        participantId: '',
        winnerLabel: '',
        note: '',
        startNumber: 0,
        projectName: '',
        riderName: ''
      }
  );
}

/* ------------------------------------------------------------- podpisy */

/**
 * „003 · Tuono · Claudio Taras" — jeden podpis uczestnika na całym ekranie nagród.
 *
 * Numer startowy na początku i z wiodącymi zerami, bo tak jest wołany przez mikrofon i tak
 * stoi na tabliczce przy wózku. Nazwa pojazdu w środku, nazwisko na końcu: dwa wozy tej samej
 * rodziny mają to samo nazwisko i różne nazwy, więc szukanie po nazwisku trafiałoby w oba.
 *
 * Puste części są pomijane, a nie zastępowane kreską: uczestnik dopisany w pośpiechu ma tylko
 * numer i imię, a „003 · — · Claudio Taras" wygląda jak brakujące dane, nie jak dane, których
 * nikt nie potrzebował.
 */
export function participantLabel(row: {
  startNumber: number;
  projectName: string;
  firstName: string;
  lastName: string;
}): string {
  const rider = `${row.firstName} ${row.lastName}`.trim();
  return [String(row.startNumber).padStart(3, '0'), row.projectName.trim(), rider]
    .filter((part) => part !== '')
    .join(' · ');
}

/**
 * Podpis zwycięzcy TAK, JAK GO ODDAŁA KOŃCÓWKA.
 *
 * Osobno od `participantLabel`, bo dane są innego pochodzenia: tu przychodzi `riderName`
 * jednym napisem, a nie imię i nazwisko osobno, i może w ogóle nie być uczestnika — wtedy
 * liczy się `winnerLabel` wpisany z ręki. Sklejenie obu funkcji w jedną wymagałoby rozbijania
 * `riderName` po spacji, czyli zgadywania, co jest imieniem u kogoś o dwuczłonowym nazwisku.
 */
export function prizeWinnerLabel(row: PrizeRow): string {
  if (row.participantId) {
    return [
      row.startNumber > 0 ? String(row.startNumber).padStart(3, '0') : '',
      row.projectName.trim(),
      row.riderName.trim()
    ]
      .filter((part) => part !== '')
      .join(' · ');
  }
  return row.winnerLabel.trim();
}

/**
 * Ile nagród ma już każdy numer startowy.
 *
 * PO NUMERZE STARTOWYM, NIE PO IDENTYFIKATORZE
 *   Kontrakt oddaje `startNumber` obok `participantId`, a numer startowy jest w żywej tabeli
 *   unikalny (baza ma na nim więz i panel zna kod `VOTING_START_NUMBER_TAKEN`), więc jako
 *   klucz łączenia z listą startową jest jednoznaczny i czytelny na ekranie. Łączenie po
 *   imieniu i nazwisku byłoby błędem: dwóch kuzynów o tym samym nazwisku to na tej imprezie
 *   normalna sytuacja.
 *
 * Ten sam wóz MOŻE mieć kilka nagród — najszybszy i najładniejszy to bywa jeden carruleddhu —
 * więc to nie jest wykrywanie kolizji, tylko liczba do pokazania przy nazwisku. Blokada byłaby
 * tu błędem, nie zabezpieczeniem.
 *
 * Zwycięzcy wpisani z ręki nie mają numeru startowego i schodzą na zero, dlatego zero jest
 * pomijane: bez tego wszyscy wpisani ręcznie zliczyliby się jako jedna osoba.
 */
export function prizeCountByStartNumber(
  prizes: readonly { startNumber: number; participantId: string }[]
): ReadonlyMap<number, number> {
  const counts = new Map<number, number>();
  for (const prize of prizes) {
    if (!prize.participantId || prize.startNumber <= 0) continue;
    counts.set(prize.startNumber, (counts.get(prize.startNumber) ?? 0) + 1);
  }
  return counts;
}
