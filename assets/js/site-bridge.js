/**
 * Wspólny szew serwisu: wysyłka, pasek komunikatów, słownik, tłumaczenie znaczników.
 * ===========================================================================
 *
 * Powstał przy wyniesieniu głosowania na `votazione.html`. Do tej pory te cztery rzeczy stały
 * w app.js i były podawane na zewnątrz przez `window.CARRULEDDHI_API` — co wystarczało, dopóki
 * jedyną stroną z Workerem była strona główna.
 *
 * Podstrona nie może wciągnąć app.js: to 277 kB, które budują hero, galerię 3D, czat, licznik,
 * formularz i czternaście sekcji, z których żadnej tam nie ma. Ale nie może też mieć własnego
 * `postJSON` — komentarz przy tamtym szwie mówi wprost, dlaczego:
 *
 *   „post rozpoznaje »nie ma Workera« (404 bez JSON-a) i odpowiada trybem demo. To jest
 *    kilkanaście linii rozumowania nad tym, czym różni się brak backendu od backendu
 *    mówiącego »nie«, i druga kopia rozjechałaby się przy pierwszej poprawce."
 *
 * Więc zamiast drugiej kopii jest jeden plik, z którego bierze i app.js, i podstrona.
 *
 * JĘZYK JEST PODAWANY, NIE ODGADYWANY
 *   `makeText` przyjmuje funkcję zwracającą język. app.js podaje swój `state.lang`, podstrona
 *   podaje `document.documentElement.lang`. Zgadywanie tutaj znaczyłoby, że w trakcie
 *   przełączania języka na stronie głównej — gdzie `state.lang` zmienia się o dwie linie
 *   wcześniej niż atrybut w `<html>` — dwa napisy obok siebie byłyby w dwóch językach.
 */

import { DEFAULT_SITE_CONFIG } from './site-config.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/* ------------------------------------------------------- rok i data wewnątrz napisów */

/**
 * ROK I DATA W SŁOWNIKU SĄ WZORCEM, NIE LICZBĄ.
 * ===========================================================================
 *
 * JAKI BŁĄD TO NAPRAWIA
 *   Po ogłoszeniu nowej edycji w panelu strona nadal pokazywała stary rok i starą datę.
 *   Odczyt ustawień działał (`applyServerSettings` w app.js, `loadEventConfig` w
 *   voting-boot.js) i poprawnie podmieniał wszystko, co nosi `data-config-*` — ale rok siedział
 *   także w napisach ze słownika, których żaden odczyt nie rusza:
 *     `meta.title`      „Carruleddhi Show 2026 — Santa Teresa Gallura"
 *     `meta.description` „…17 ottobre 2026, Santa Teresa Gallura."
 *     `hero.kicker`      „17 ottobre 2026 · Santa Teresa Gallura"
 *     `schedule.kicker`  „17 ottobre 2026"
 *   Sześć języków razy cztery klucze to dwadzieścia cztery miejsca do ręcznej poprawki raz w
 *   roku — czyli dwadzieścia cztery miejsca, w których ktoś kiedyś zapomni. A skutek jest
 *   cichy: strona wygląda na sprawną i po prostu kłamie o dacie.
 *
 * DLACZEGO WZORZEC, A NIE PODMIANA LICZBY
 *   Podmiana liczby w słowniku to ta sama praca za rok. Wzorzec sprawia, że data ma JEDNO
 *   źródło (`config.eventDate` po odczycie ustawień) i żadnej kopii — bo napis ze słownika
 *   przestaje być datą, a staje się zdaniem z miejscem na datę.
 *
 * DLACZEGO PODSTAWIENIE SIEDZI TUTAJ, A NIE W app.js
 *   Przez ten plik przechodzą OBIE drogi napisu na ekran: `makeText` (napisy budowane w
 *   JavaScripcie) i `translateDom` (napisy w znacznikach), i to zarówno na stronie głównej,
 *   jak i na `votazione.html`. Podstawienie zrobione w app.js pomijałoby podstronę, a zrobione
 *   w i18n.js nie miałoby dostępu do konfiguracji.
 *
 * ZNACZNIKI
 *   %YEAR%   rok edycji, np. „2026"
 *   %DATE%   data edycji zapisana po ludzku w bieżącym języku, np. „17 ottobre 2026",
 *            „17 października 2026", „17. Oktober 2026"
 *   %EVENT%  nazwa edycji z panelu, np. „Carruleddhi Show 2026"
 *   %PLACE%  miejsce, np. „Santa Teresa Gallura"
 *
 * WARTOŚCI POCZĄTKOWE TO ZAPAS, A NIE ŹRÓDŁO PRAWDY
 *   Brane z `DEFAULT_SITE_CONFIG`, czyli z tej samej wartości awaryjnej, która stoi w
 *   znacznikach. Obowiązują wyłącznie do chwili, w której odczyt ustawień odpowie — a gdy nie
 *   odpowie nigdy (zimna funkcja, brak sieci), strona pokazuje wbudowaną edycję zamiast dziury
 *   w zdaniu.
 */
const TOKEN_PATTERN = /%(YEAR|DATE|EVENT|PLACE)%/g;

function fallbackTokens() {
  const date = new Date(DEFAULT_SITE_CONFIG.eventDate);
  return {
    YEAR: Number.isNaN(date.getTime()) ? '' : String(date.getFullYear()),
    /* Wbudowana etykieta zawiera już miejsce („17 ottobre 2026 · Santa Teresa Gallura"), a
       %DATE% ma być samą datą — dlatego ucinane na separatorze, a nie brane w całości. */
    DATE: DEFAULT_SITE_CONFIG.dateLabel.split(' · ')[0],
    EVENT: DEFAULT_SITE_CONFIG.eventName,
    PLACE: DEFAULT_SITE_CONFIG.eventLocation
  };
}

let copyTokens = fallbackTokens();

/**
 * Nowe wartości znaczników, po odczycie ustawień albo po zmianie języka.
 *
 * Puste i niepodane pola są POMIJANE, nie zerowane: odpowiedź serwera bez `eventLocation` nie
 * ma prawa zamienić „Santa Teresa Gallura" w pustkę w środku zdania.
 */
export function setCopyTokens(next = {}) {
  Object.entries(next).forEach(([name, value]) => {
    const clean = typeof value === 'string' ? value.trim() : '';
    if (clean) copyTokens[name] = clean;
  });
  return { ...copyTokens };
}

/**
 * Podstawienie znaczników w jednym napisie.
 *
 * Szybkie wyjście przez `includes('%')`: przez tę funkcję przechodzi KAŻDY napis ze słownika
 * przy każdym przełączeniu języka (ponad dwa tysiące wywołań), a znaczniki ma cztery z nich.
 * Uruchamianie wyrażenia regularnego na pozostałych dwóch tysiącach to praca bez skutku.
 */
export function fillCopyTokens(value) {
  if (typeof value !== 'string' || !value.includes('%')) return value;
  return value.replace(TOKEN_PATTERN, (whole, name) => copyTokens[name] ?? whole);
}

/* ------------------------------------------------------------------------------ słownik */

/**
 * Odczyt ze słownika, z zapasem na włoski.
 *
 * @param {() => string} getLang skąd wziąć aktualny język
 */
export function makeText(getLang) {
  return function text(key) {
    const all = window.CARRULEDDHI_I18N || {};
    const dict = all[getLang()] || all.it || {};
    return fillCopyTokens(dict[key] || (all.it || {})[key] || key);
  };
}

/**
 * Przepisanie znaczników na wybrany język: `data-i18n` i cztery tłumaczone atrybuty.
 *
 * `setText` jest wstrzykiwany, bo strona główna przepisuje napisy z przelotem liter (efekt
 * tekstowy), a podstrona zwykłym podstawieniem. Sama lista atrybutów i sama pętla są te same,
 * i to one były do tej pory nie do użycia poza app.js.
 */
export function translateDom(dict, { setText } = {}) {
  const write = setText || ((element, value) => { element.textContent = value; });

  $$('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n;
    /* `fillCopyTokens` na każdym napisie, nie tylko na tych z datą: lista kluczy z rokiem
       zmieniałaby się przy każdej poprawce tekstu, a napis bez znacznika wraca z tej funkcji
       nietknięty i za darmo — patrz szybkie wyjście na `includes('%')`. */
    if (typeof dict[key] === 'string') write(element, fillCopyTokens(dict[key]));
  });

  const translatedAttributes = [
    ['data-i18n-placeholder', 'placeholder'],
    ['data-i18n-alt', 'alt'],
    ['data-i18n-aria-label', 'aria-label'],
    ['data-i18n-title', 'title']
  ];
  translatedAttributes.forEach(([dataAttribute, attribute]) => {
    $$(`[${dataAttribute}]`).forEach((element) => {
      const key = element.getAttribute(dataAttribute);
      if (typeof dict[key] === 'string') element.setAttribute(attribute, fillCopyTokens(dict[key]));
    });
  });
}

/* ---------------------------------------------------------------------------- komunikaty */

/**
 * Jeden pasek komunikatów, trzy odmiany.
 *
 * `tone` jest trzecim argumentem z wartością domyślną, więc wszystkie dotychczasowe
 * wywołania — `showToast(text)` i `showToast(text, 7000)` — działają bez zmian i wyglądają
 * jak dotąd. Odmiana zmienia kolor, ikonę i to, jak zachowa się czytnik ekranu:
 *
 *   info     zwykła informacja, czeka na przerwę w czytaniu
 *   success  potwierdzenie czynności, też czeka
 *   error    przerywa czytanie, bo mówi, że coś się NIE stało
 *
 * `assertive` tylko dla błędu z rozmysłem: gdyby każde potwierdzenie przerywało lektor, ktoś
 * czytający stronę czytnikiem byłby przerywany za każdym kliknięciem.
 */
export function showToast(message, duration = 4200, tone = 'info') {
  const toast = $('[data-toast]');
  if (!toast) return;
  const slot = $('[data-toast-text]', toast) || toast;
  const icon = $('[data-toast-icon]', toast);

  slot.textContent = message;
  toast.dataset.toastTone = ['info', 'success', 'error'].includes(tone) ? tone : 'info';
  // Znak, nie obrazek: trzy znaki Unicode zamiast trzech plików do wczytania.
  if (icon) icon.textContent = { success: '✓', error: '!', info: 'i' }[toast.dataset.toastTone];
  toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  toast.setAttribute('aria-live', tone === 'error' ? 'assertive' : 'polite');

  /* Zdejmowane, wymuszone przeliczenie układu, dołożone z powrotem — i to wszystko w tej
     samej klatce.
     ---------------------------------------------------------------------------
     Chodzi o to, żeby drugi komunikat pod rząd zagrał animacją od początku; bez tego dwa
     błędy z rzędu wyglądają jak jeden, który się nie zmienił, i nikt nie zauważa, że treść
     jest inna.

     Pierwsza wersja robiła to przez requestAnimationFrame i sonda ją złapała: pasek nie
     pojawiał się wcale. rAF nie jest gwarantowany — w karcie w tle nie odpala w ogóle, a w
     przeglądarce bez odświeżania obrazu bywa głodzony. Uzależnianie od niego POKAZANIA
     czegokolwiek znaczy komunikat, który czasem nie przychodzi.

     Odczyt offsetWidth jest tu czynnością, nie pomiarem: wymusza przeliczenie układu, dzięki
     któremu przeglądarka widzi stan bez klasy i traktuje jej dołożenie jako nowe przejście.
     Działa synchronicznie i zawsze. */
  toast.classList.remove('is-visible');
  window.clearTimeout(showToast.timer);
  void toast.offsetWidth;
  toast.classList.add('is-visible');
  showToast.timer = window.setTimeout(() => toast.classList.remove('is-visible'), duration);
}

/* ------------------------------------------------------------------- wysokość ekranu */

let svhProbe = null;
let screenHeightPx = 0;

/**
 * Wysokość jednego ekranu, zmierzona i wpisana do CSS jako `--screen-h`.
 *
 * TO JEST NAPRAWA TELEPORTOWANIA PRZY PRZEWIJANIU PALCEM
 *   Układ strony opiera się na wysokości ekranu: czternaście sekcji ma `min-height` jednego
 *   ekranu, a rozmiary pisma i odstępy są liczone z tej samej wielkości. Według specyfikacji
 *   `svh` jest stałe — to wysokość okna przy WIDOCZNYM pasku adresu. Na przeglądarce
 *   zgłaszającego nie jest.
 *
 *   ZMIERZONE, rejestrator z `?jump=1`:
 *     okno 797 → 615 px  (pasek adresu wyjeżdża, −182)
 *     dokument 13095 → 11143 px  (−1952), i tak dziewięć razy w osiemnaście sekund.
 *   Odtworzone w Chrome przy oknie 844 → 662: rozrzut dokumentu 1891 px. Po zamrożeniu: 0.
 *
 *   Każde przeciągnięcie palcem zmieniało więc wysokość dokumentu o dwa tysiące pikseli, a to
 *   przesuwa wszystko poniżej bieżącego miejsca. Dyskusja „która jednostka jest właściwa" nie
 *   ma tu wyjścia, bo ta przeglądarka wiąże każdą z nich z bieżącym widokiem. Więc wysokość
 *   ekranu przestaje być jednostką CSS i staje się liczbą wpisaną raz.
 *
 * DLACZEGO POMIAR, A NIE OBLICZENIE
 *   `svh` nie da się policzyć z niczego, co jest w JS. Trzeba dać przeglądarce pudełko o
 *   wysokości `100svh` i zapytać, ile to wyszło. Element jest bezwymiarowy w poziomie,
 *   `visibility: hidden` i poza kolejnością malowania, więc niczego nie zasłania.
 *
 * `Math.min` Z innerHeight
 *   Zabezpieczenie na wypadek, gdyby sonda `100svh` oddała wartość „dużego" widoku — czyli przy
 *   schowanym pasku. Przy wejściu na stronę pasek jest widoczny, więc `innerHeight` to wtedy
 *   właśnie mały widok. Bierzemy mniejszą z dwóch: sekcja nigdy nie będzie wyższa od tego, co
 *   widać, więc dolna krawędź treści nie schowa się pod paskiem.
 *
 * KTO TO WOŁA
 *   app.js przy starcie i przy zmianie szerokości okna (tam ta sama liczba rozstrzyga też
 *   werdykt `pinned` / `flow`), a voting-boot.js na podstronie głosowania. Jedna
 *   implementacja, bo dwie rozjechałyby się przy pierwszej poprawce.
 */
export function measureScreenHeight() {
  if (!(window.CSS && CSS.supports && CSS.supports('height', '100svh'))) {
    // Przeglądarka bez svh (starsze WebView): innerHeight jest jedyną liczbą, jaką mamy.
    screenHeightPx = window.innerHeight;
  } else {
    if (!svhProbe) {
      svhProbe = document.createElement('div');
      svhProbe.setAttribute('aria-hidden', 'true');
      svhProbe.style.cssText =
        'position:absolute;top:0;left:0;width:0;height:100svh;visibility:hidden;pointer-events:none;';
      document.body.appendChild(svhProbe);
    }
    screenHeightPx = svhProbe.getBoundingClientRect().height || window.innerHeight;
  }

  const stable = Math.max(320, Math.min(screenHeightPx || Infinity, window.innerHeight || Infinity));
  if (Number.isFinite(stable)) {
    screenHeightPx = Math.round(stable);
    document.documentElement.style.setProperty('--screen-h', `${screenHeightPx}px`);
  }
  return screenHeightPx;
}

/** Ostatnio zmierzona wysokość ekranu, bez ponownego pomiaru. */
export const screenHeight = () => screenHeightPx;

/* ------------------------------------------------------- rezerwa na środku paska */

/**
 * ILE MIEJSCA NA ŚRODKU PASKA JEST NAPRAWDĘ WOLNE.
 * ===========================================================================
 *
 * NA CZYM STOI CAŁY PROBLEM
 *   Trzy rzeczy mogą stanąć na środku paska nawigacji i wszystkie trzy są pozycjonowane
 *   bezwzględnie na `left: 50%`: chip z nazwą sekcji, zadokowane odliczanie i — od tej zmiany
 *   — zadokowany zegar głosowania. Środek jest wtedy środkiem PASKA, nie środkiem tego, co
 *   zostało między sąsiadami, i to jest dobra decyzja (powód w całości przy `.nav-current`
 *   w experience.css). Ma jednak skutek: element na środku NIE WIE, ile miejsca zostało.
 *
 * CO ZMIERZONO
 *   Rezerwa była wpisana na sztywno: `max-width: min(260px, calc(100% - 300px))`, gdzie 300 to
 *   dwa razy szerokość marki. Prawa strona paska nie ma jednak stałej szerokości — rośnie o
 *   przycisk „Zagłosuj", który pojawia się w niej na czas głosowania, i o długość napisu w
 *   danym języku.
 *
 *   Sonda tools/probe-podium-prizes.mjs, 1440x900, język niemiecki, faza `voting`:
 *     pasek zwinięty            chip × .nav-actions  = 42 px nachodzenia
 *     pasek zwinięty odsłonięty chip × „Zagłosuj"    = 11 px, chip × .nav-actions = 71 px
 *   W fazach `scheduled` i `closed` zera — bo wtedy tego przycisku w pasku nie ma. Czyli
 *   dokładnie to, co zgłoszono: „przy dochodzących przyciskach głosowania pasek zasłania".
 *
 * DLACZEGO POMIAR, A NIE WYŁĄCZENIE CHIPU NA CZAS GŁOSOWANIA
 *   Zgaszenie chipu w fazie `voting` naprawiłoby te dwa pomiary i nic więcej. Ta sama rezerwa
 *   jest zła przy każdym dłuższym napisie w pasku — po niemiecku, francusku, przy dłuższej
 *   nazwie sekcji, przy następnym przycisku, który tam kiedyś stanie. Liczba wzięta z POMIARU
 *   jest odpowiedzią na wszystkie te przypadki naraz i nie wymaga pamiętania o niej przy
 *   następnej zmianie w pasku.
 *
 * PIERWSZEŃSTWO NA ŚRODKU — ROZSTRZYGNIĘTE ŚWIADOMIE, OPISANE W experience.css
 *   1. zegar głosowania      czynność z terminem: „ile mam czasu, żeby zagłosować"
 *   2. zadokowane odliczanie jedna liczba, po którą ktoś wraca na górę strony
 *   3. chip z nazwą sekcji   tylko informuje, gdzie jesteś
 *   Przy otwartym menu wygrywa chip: wtedy wybiera się, GDZIE iść. Dwie rzeczy nigdy nie stoją
 *   tam naraz — pilnują tego reguły `[data-clock-docked]`, a sonda liczy `centreCount`.
 *
 * NAMALOWANY NAPIS MARKI, NIE JEJ PUDEŁKO
 *   W stanie zwiniętym `.brand` ma `flex: 1`, więc jej prostokąt ciągnie się przez pół paska,
 *   choć napis „Carruleddhi" zajmuje w nim około stu pikseli. Rezerwa liczona z pudełka
 *   wyszłaby dwa razy za duża i skasowałaby chip na ekranach, na których jest na niego miejsce.
 *
 * BEZ NASŁUCHU PRZEWIJANIA I BEZ PĘTLI
 *   Woła to `ResizeObserver` na pasku i na rzędzie przycisków — czyli po układzie, nie w jego
 *   środku. Zapis zmienia `max-width` elementu pozycjonowanego BEZWZGLĘDNIE, więc nie zmienia
 *   rozmiaru paska i nie budzi obserwatora jeszcze raz. Dodatkowo zapis następuje tylko wtedy,
 *   gdy liczba się zmieniła.
 */
let lastNavReserve = -1;

function paintedWidth(element) {
  if (!element) return 0;
  const range = document.createRange();
  range.selectNodeContents(element);
  const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
  if (!rects.length) return 0;
  return Math.max(...rects.map((rect) => rect.right)) - Math.min(...rects.map((rect) => rect.left));
}

export function syncNavCentreReserve() {
  const header = $('.site-header');
  const shell = $('.nav-shell', header || document);
  const actions = $('.nav-actions', header || document);
  if (!header || !shell) return;

  const shellBox = shell.getBoundingClientRect();
  const brand = $('.brand', header);
  const brandBox = brand?.getBoundingClientRect();
  const brandText = paintedWidth($('.brand__name', header)) || 0;
  const brandDate = paintedWidth($('.brand__date', header)) || 0;
  /* Odstęp marki od krawędzi paska plus szerokość jej NAPISU (dłuższego z dwóch wierszy). */
  const leftUsed = (brandBox ? brandBox.left - shellBox.left : 0) + Math.max(brandText, brandDate);
  const rightUsed = actions ? shellBox.right - actions.getBoundingClientRect().left : 0;

  /* Czternaście pikseli oddechu z każdej strony: „nie nachodzi" i „dotyka" wyglądają na
     ekranie tak samo źle, a `pointer-events: none` na chipie ratuje tylko kliknięcia. */
  const reserve = Math.max(0, Math.round(Math.max(leftUsed, rightUsed))) + 14;
  if (reserve === lastNavReserve) return;
  lastNavReserve = reserve;
  header.style.setProperty('--nav-side', `${reserve}px`);
}

/**
 * Podłączenie pomiaru. Wołane raz, ze strony głównej i z podstrony głosowania.
 *
 * Trzy źródła zmian, bo pasek zmienia szerokość na trzy różne sposoby: okno (`resize`),
 * zawartość (`ResizeObserver` — zwinięcie w pigułkę, dojście przycisku „Zagłosuj") i język
 * (`carruleddhi:language` — ten sam przycisk po niemiecku jest o połowę szerszy).
 */
export function watchNavCentreReserve() {
  syncNavCentreReserve();
  window.addEventListener('resize', syncNavCentreReserve, { passive: true });
  window.addEventListener('load', syncNavCentreReserve);
  window.addEventListener('carruleddhi:language', syncNavCentreReserve);
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(syncNavCentreReserve);
    ['.nav-shell', '.nav-actions', '.brand'].forEach((selector) => {
      const element = $(selector);
      if (element) observer.observe(element);
    });
  }
}

/* -------------------------------------------------------------------------------- sieć */

export async function postJSON(endpoint, payload) {
  if (!endpoint) return { ok: true, demo: true };
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    mode: 'cors',
    credentials: 'omit'
  });
  const raw = await response.text();
  if (!response.ok) {
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (_) { /* not JSON — see below */ }

    /**
     * No backend at all, as opposed to a backend saying no.
     *
     * On `npm run dev` there is no Worker, so /api/carruleddhi/* falls through to
     * Vite, which answers 404 with the SPA's HTML. Every form then threw and
     * showed the contact form's "check the fields" toast — with the fields
     * perfectly valid, on a page where filling the form in is the only thing
     * there is to test. So the form looked broken while nothing was wrong with it.
     *
     * A 404 whose body is not JSON means nothing is listening on that path: the
     * real Worker answers JSON for every outcome, including its own errors, and
     * in production it claims /api/carruleddhi/* before static assets can
     * (run_worker_first in wrangler.toml), so it cannot produce this shape.
     * Treated as demo mode, exactly like an unconfigured endpoint, and logged so
     * it is never silent.
     */
    if (response.status === 404 && !parsed) {
      console.warn(`No API at ${endpoint} — running in demo mode. Deploy the Worker to store data for real.`);
      return { ok: true, demo: true };
    }

    // Still a throw, because every existing caller treats a throw as failure and
    // a returned object as success. But the body is carried along on the error, so
    // callers that want to tell "rate limited" from "broken" can, and the ones
    // that do not keep behaving exactly as before.
    const error = new Error(`Webhook returned ${response.status}`);
    error.status = response.status;
    error.payload = parsed;
    throw error;
  }
  if (!raw) return { ok: true };
  try { return JSON.parse(raw); } catch (_) { return { ok: true, response: raw }; }
}

/** Wspólny kształt żądania: rodzaj, wydarzenie, język, źródło, znacznik czasu. */
export function makePayload({ eventName, eventDate, preview, getLang }) {
  return function eventPayload(type, data = {}) {
    return {
      type,
      event: eventName,
      eventDate,
      locale: getLang(),
      source: preview ? 'website-preview' : 'website',
      submittedAt: new Date().toISOString(),
      ...data
    };
  };
}

/**
 * Cztery rzeczy podane na zewnątrz, dla modułów głosowania.
 *
 * Cztery funkcje, nie cały moduł: to jest szew, a nie drzwi na oścież.
 */
export function installBridge({ eventName, eventDate, preview, getLang }) {
  const text = makeText(getLang);
  window.CARRULEDDHI_API = Object.freeze({
    post: postJSON,
    payload: makePayload({ eventName, eventDate, preview, getLang }),
    text,
    toast: showToast
  });
  return text;
}

/* ------------------------------------------------------------------------- popouts for legal pages */
function setupLegalPopouts() {
  document.addEventListener('click', async (event) => {
    const link = event.target.closest('a');
    if (!link) return;
    const href = link.getAttribute('href') || '';
    if (href.startsWith('privacy.html') || href.startsWith('cookies.html') || href.startsWith('regolamento.html')) {
      event.preventDefault();
      let dialog = document.querySelector('.legal-popout');
      if (!dialog) {
        const style = document.createElement('style');
        style.textContent = `
          .legal-popout { max-width: 800px; width: 90vw; max-height: 90vh; border: 3px solid var(--navy-950, #071a3d); border-radius: 12px; padding: 0; background: #fff; box-shadow: 0 20px 50px rgba(0,0,0,0.3); overflow: hidden; }
          .legal-popout::backdrop { background: rgba(7, 26, 61, 0.6); backdrop-filter: blur(5px); }
          .legal-popout__surface { display: flex; flex-direction: column; height: 100%; max-height: 90vh; position: relative; }
          .legal-popout__close { position: absolute; top: 12px; right: 12px; width: 32px; height: 32px; background: #f0f0f0; border: none; border-radius: 50%; cursor: pointer; z-index: 10; transition: background 0.2s; }
          .legal-popout__close:hover { background: #e0e0e0; }
          .legal-popout__close::before, .legal-popout__close::after { content: ''; position: absolute; top: 50%; left: 50%; width: 16px; height: 2px; background: #333; margin: -1px 0 0 -8px; }
          .legal-popout__close::before { transform: rotate(45deg); }
          .legal-popout__close::after { transform: rotate(-45deg); }
          .legal-popout__content { overflow-y: auto; padding: 48px 24px 24px; color: #333; }
        `;
        document.head.appendChild(style);

        dialog = document.createElement('dialog');
        dialog.className = 'legal-popout';
        dialog.innerHTML = `
          <div class="legal-popout__surface">
            <button type="button" class="legal-popout__close" aria-label="Close"></button>
            <div class="legal-popout__content"></div>
          </div>
        `;
        document.body.appendChild(dialog);
        dialog.querySelector('.legal-popout__close').addEventListener('click', () => dialog.close());
        dialog.addEventListener('click', (e) => {
          if (e.target === dialog) dialog.close();
        });
      }
      
      const content = dialog.querySelector('.legal-popout__content');
      content.innerHTML = '<p>Loading...</p>';
      dialog.showModal();
      document.body.style.overflow = 'hidden';
      dialog.addEventListener('close', () => { document.body.style.overflow = ''; }, { once: true });
      
      try {
        const response = await fetch(link.href);
        if (!response.ok) throw new Error();
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        // Extract main content from legal pages
        const main = doc.querySelector('.legal-doc') || doc.querySelector('main') || doc.body;
        content.innerHTML = main.innerHTML;
        // Strip any absolute positioning or large margins from inner elements
        const title = content.querySelector('h1');
        if (title) title.style.marginTop = '0';
      } catch (e) {
        content.innerHTML = '<p>Error loading content.</p>';
      }
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupLegalPopouts);
} else {
  setupLegalPopouts();
}
