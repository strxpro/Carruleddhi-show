/**
 * Zgłoszenia sponsorów z czatu: kształt wiersza i sprawdzenie tego, co przyszło z drutu.
 * ============================================================================
 * DLACZEGO OSOBNY PLIK
 *   Kształt odpowiedzi jest KONTRAKTEM z `worker/index.js` (`sponsorLeadShape`), a nie sprawą
 *   wyglądu ekranu. Nazwy pól są przepisane stąd wprost z tamtej funkcji — `logoPath` obok
 *   `logoUrl`, `siteUrl`, `decidedAt` — bo pomyłka w którejkolwiek z nich nie jest błędem
 *   kompilacji, tylko pustym miejscem na karcie zgłoszenia. Trzymane osobno od widoku,
 *   żeby dało się je zestawić z Workerem bez czytania JSX.
 *
 *   Ten plik nie importuje `api.ts`. Funkcje przyjmują najmniejszy kształt, jaki im wystarcza,
 *   więc czyta się je bez wchodzenia w warstwę sieci.
 *
 * BEZ `any` I BEZ `!`
 *   Odpowiedź jest tu `unknown` i schodzi przez dozory typu. To nie ostrożność na wyrost:
 *   panel bywa wdrażany osobno od Workera, a typ obiecujący tablicę zamieniłby starsze
 *   wdrożenie końcówki w `undefined.map(...)`, czyli biały ekran w zakładce, w której stoi
 *   też kłódka całej strony i termin zawodów.
 */

/** Status, który ta karta pokazuje. Pozostałe dwa (`approved`, `rejected`) są archiwum. */
export const LEAD_PENDING = 'pending';

/**
 * Jedno zgłoszenie po sprawdzeniu kształtu. Pola jak w `sponsorLeadShape` w Workerze.
 *
 * `logoPath` i `logoUrl` to DWIE RÓŻNE rzeczy i rozdzielenie ich jest częścią kontraktu:
 *   `logoPath` — trwała nazwa pliku w prywatnym buckecie (`sponsors/…`). To ona wraca po
 *                zatwierdzeniu do `site_settings.sponsors[].logo`, i robi to WORKER.
 *   `logoUrl`  — podpisany adres, ważny godzinę. Wyłącznie podgląd na tym ekranie.
 * Panel, który zapamiętałby `logoUrl` jako logo sponsora, zapamiętałby napis przestający
 * cokolwiek otwierać po godzinie — i nikt by tego nie powiązał ze zgłoszeniem zatwierdzonym
 * tydzień wcześniej.
 */
export interface SponsorLeadRow {
  id: string;
  /** ISO. Pokazywana przez `formatMoment`, jak każda data w panelu. */
  createdAt: string;
  /** Nazwa, która ma stanąć na carruleddhi i na liście sponsorów. Wymagana przy zgłoszeniu. */
  cartName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** Ścieżka w buckecie albo pusto. Nigdy podpisany adres — patrz komentarz nad typem. */
  logoPath: string;
  /** Podpisany adres podglądu albo pusto. Nigdy zapisywany. */
  logoUrl: string;
  /** Odsyłacz. Worker przyjmuje tu wyłącznie `https://…`, więc pusto albo pełny adres. */
  siteUrl: string;
  /** Język ROZMOWY, nie panelu: `it`, `pl`, `en`, `de`, `es`, `fr`. */
  locale: string;
  status: string;
  /** Kiedy zapadła decyzja. `null` przy oczekujących — czyli przy wszystkich na tej karcie. */
  decidedAt: string | null;
}

/** Nazwisko zgłaszającego jednym napisem. Jedno miejsce, bo używane w dwóch. */
export function leadPersonName(lead: SponsorLeadRow): string {
  return `${lead.firstName} ${lead.lastName}`.trim();
}

/**
 * Nazwa, pod którą sponsor stanie na stronie — tak jak ją wybierze Worker.
 *
 * `cart_name` jest przy zgłoszeniu wymagane (`SPONSOR_BAD_NAME` odrzuca puste), więc zapas
 * z nazwiska jest tu na jeden przypadek: wiersz poprawiony ręcznie w edytorze Supabase.
 * Pusta nazwa znaczy, że `sponsor-approve` odmówi kodem `SETTINGS_SPONSOR_NAME` — i lepiej,
 * żeby nagłówek karty pokazał wtedy nazwisko niż nic.
 */
export function leadSponsorName(lead: SponsorLeadRow): string {
  return lead.cartName.trim() || leadPersonName(lead);
}

/**
 * Odsyłacz ze zgłoszenia → adres, który wolno wstawić w `href`. Pusto znaczy „to nie adres".
 *
 * DLACZEGO PANEL SPRAWDZA TO DRUGI RAZ
 *   Worker sprawdza adres przy przyjmowaniu zgłoszenia (`sponsorSiteUrl`) i wpuszcza wyłącznie
 *   `https://` z nazwą hosta z kropką. Tu jest to samo sprawdzenie, bo między jednym a drugim
 *   leży wiersz w bazie — a wiersz da się poprawić ręcznie w edytorze Supabase. Ten napis
 *   trafia do atrybutu `href` w panelu z hasłem w pamięci przeglądarki, więc `javascript:`
 *   w tym miejscu nie jest literówką do posprzątania później.
 *
 * DLACZEGO TYLKO `https:` I DLACZEGO NIE DOPISUJEMY SCHEMATU
 *   Jedno i drugie po to, żeby panel pokazywał adres, który NAPRAWDĘ leży w bazie. Dopisanie
 *   brakującego „https://" do „mojafirma.it" zrobiłoby z niepoprawnego wiersza klikalny
 *   odsyłacz, a po zatwierdzeniu Worker zapisze wiersz taki, jaki ma — czyli panel obiecywałby
 *   coś innego, niż stanie na stronie. Napis, którego nie rozumiemy, pokazujemy jako napis.
 */
export function leadLink(siteUrl: string): string {
  const text = siteUrl.trim();
  if (!text) return '';
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== 'https:') return '';
    if (!parsed.hostname.includes('.')) return '';
    return parsed.toString();
  } catch (_) {
    return '';
  }
}

/* --------------------------------------------------- sprawdzanie kształtu */

/**
 * Napis z nieznanego pola. Brak, `null` i liczba schodzą do pustego napisu.
 *
 * Świadomie NIE `String(value)`: `String(null)` daje „null", a taki napis wylądowałby na
 * ekranie jako nazwa firmy — i, po zatwierdzeniu, na stronie głównej.
 */
function readText(source: Record<string, unknown>, field: string): string {
  const value = source[field];
  return typeof value === 'string' ? value : '';
}

/**
 * Odpowiedź końcówki → lista oczekujących zgłoszeń, albo `null` gdy nie da się jej odczytać.
 *
 * DLACZEGO `null`, A NIE PUSTA LISTA
 *   To dwa różne zdania dla organizatora i nie mają prawa wyglądać tak samo. Pusta lista
 *   znaczy „nikt się nie zgłosił" — stan normalny, nie awaria. `null` znaczy „nie wiem, czy
 *   ktoś się zgłosił", i wtedy trzeba to powiedzieć wprost: cisza w tym miejscu wygląda
 *   identycznie jak brak zgłoszeń, a za nią stoi rozmowa z firmą, która czeka na odpowiedź.
 *
 * DLACZEGO FILTR STATUSU JEST TU, MIMO ŻE ŻĄDANIE PROSI O `pending`
 *   Bo `sponsorLeads` w Workerze przyjmuje też `status: 'all'` i wtedy oddaje archiwum —
 *   wystarczy, że kiedyś ktoś zmieni domyślną wartość albo panel wywoła to bez `status`, żeby
 *   karta „do zatwierdzenia" pokazała zgłoszenia już odrzucone, z żywym guzikiem „Zatwierdź"
 *   obok. Filtr po stronie ekranu jest tańszy niż ta pomyłka.
 *
 * Wiersz bez `id` jest pomijany: identyfikator jest jedyną rzeczą, którą jadą `sponsor-approve`
 * i `sponsor-reject`, więc wiersz bez niego to wiersz z dwoma guzikami, które nie mają na co
 * wskazać.
 */
export function normaliseSponsorLeads(raw: unknown): SponsorLeadRow[] | null {
  if (!Array.isArray(raw)) return null;

  const rows: SponsorLeadRow[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const source = item as Record<string, unknown>;
    const id = readText(source, 'id');
    if (!id) continue;
    const status = readText(source, 'status');
    if (status !== '' && status !== LEAD_PENDING) continue;
    const decidedAt = readText(source, 'decidedAt');

    rows.push({
      id,
      createdAt: readText(source, 'createdAt'),
      cartName: readText(source, 'cartName'),
      firstName: readText(source, 'firstName'),
      lastName: readText(source, 'lastName'),
      email: readText(source, 'email'),
      phone: readText(source, 'phone'),
      logoPath: readText(source, 'logoPath'),
      logoUrl: readText(source, 'logoUrl'),
      siteUrl: readText(source, 'siteUrl'),
      locale: readText(source, 'locale'),
      status: status || LEAD_PENDING,
      decidedAt: decidedAt || null
    });
  }

  /* Od najnowszego. Worker już tak sortuje (`order=created_at.desc`), a to tutaj jest
     zabezpieczeniem: kolejność „najnowsze na górze" jest własnością TEGO ekranu i nie ma
     zależeć od tego, czy końcówka pamiętała o parametrze. */
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Liczba oczekujących zgłoszeń z bloku `counts`, albo `null` gdy jej nie ma.
 *
 * DLACZEGO NIE `leads.length`
 *   Bo lista jest przycięta do stu wierszy (`SPONSOR_LEADS_LIMIT` w Workerze), a `counts`
 *   liczone jest z całej tabeli — dokładnie po to, żeby „3 oczekuje" nie przestało być prawdą
 *   przy sto pierwszym zgłoszeniu. `null` znaczy „końcówka tego nie przysłała" i wtedy widok
 *   pokazuje długość listy, mówiąc mniej, ale nie mówiąc nieprawdy.
 */
export function normalisePendingCount(raw: unknown): number | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = (raw as Record<string, unknown>)[LEAD_PENDING];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
