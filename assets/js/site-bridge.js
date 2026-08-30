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

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

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
    return dict[key] || (all.it || {})[key] || key;
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
    if (typeof dict[key] === 'string') write(element, dict[key]);
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
      if (typeof dict[key] === 'string') element.setAttribute(attribute, dict[key]);
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
