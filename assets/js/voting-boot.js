/**
 * Rozruch podstrony głosowania: konfiguracja, szew, język.
 * ===========================================================================
 *
 * Odpowiednik pierwszych stu linii app.js, bez pozostałych pięciu tysięcy. Podstrona
 * potrzebuje dokładnie czterech rzeczy, żeby `voting-page.js` mogło działać:
 *
 *   1. `window.CARRULEDDHI_ACTIVE_CONFIG` — skąd wziąć adres końcówki głosowania;
 *   2. `window.CARRULEDDHI_API` — wysyłka, pasek komunikatów, słownik (ze wspólnego szwu);
 *   3. przepisane napisy w znacznikach;
 *   4. przełącznik języka, który zapamiętuje wybór tym samym kluczem co strona główna.
 *
 * DLACZEGO NIE app.js
 *   277 kB, które budują hero, galerię 3D, czat, licznik do dnia wydarzenia, formularz zapisów
 *   i czternaście sekcji — z których na tej stronie nie ma ani jednej. Wciągnięcie go tutaj
 *   znaczyłoby najdłuższe wczytywanie w całym serwisie na stronie, na którą ludzie wchodzą z
 *   telefonu, na ulicy, w dwie minuty między zjazdami.
 *
 * DLACZEGO CAŁE i18n.js, MIMO ŻE WAŻY 137 kB
 *   Inaczej niż strony prawne, ta potrzebuje słownika interfejsu, a nie czterech napisów:
 *   wszystkie komunikaty głosowania, nazwy pól, teksty błędów, stopka. Przepisanie ich tutaj
 *   dałoby drugi słownik do utrzymania i pierwszą rzecz, która się rozjedzie.
 */
import './i18n.js';
import { getPublicSiteConfig } from './site-config.js';
import { installBridge, measureScreenHeight, postJSON, translateDom } from './site-bridge.js';
/* Flagi jako SVG: Windows nie ma kolorowych glifów flag i w ich miejsce pokazuje dwie litery.
   Ten sam moduł co na stronie głównej, więc flaga jest ta sama, a nie podobna. */
import { flagSvg } from './flags.js';

const LOCALES = ['it', 'pl', 'en', 'de', 'es', 'fr'];
const NATIVE = { it: 'Italiano', pl: 'Polski', en: 'English', de: 'Deutsch', es: 'Español', fr: 'Français' };
const LANG_KEY = 'carruleddhi.lang';

const config = getPublicSiteConfig();
window.CARRULEDDHI_ACTIVE_CONFIG = config;

const readLang = () => {
  try { return localStorage.getItem(LANG_KEY); } catch (_) { return null; }
};
const writeLang = (lang) => {
  try { localStorage.setItem(LANG_KEY, lang); } catch (_) { /* Storage may be blocked. */ }
};

/**
 * Który język pokazać.
 *
 * `?lang=` wygrywa ze wszystkim, bo to jawna prośba — tak wygląda odsyłacz w mailu, który
 * wyszedł po polsku. Potem wybór zapamiętany na stronie głównej, tym samym kluczem, którego
 * używa app.js: inaczej ktoś, kto przełączył serwis na polski, dostawałby tu włoski. Na końcu
 * język przeglądarki.
 */
function pickLocale() {
  const asked = new URLSearchParams(location.search).get('lang');
  const browser = (navigator.language || '').slice(0, 2);
  for (const candidate of [asked, readLang(), browser]) {
    const code = String(candidate || '').slice(0, 2).toLowerCase();
    if (LOCALES.includes(code)) return code;
  }
  return 'it';
}

let lang = pickLocale();

/* Szew instalowany PRZED pierwszym rysowaniem i przed importem voting-page.js: tamten plik
   czyta `window.CARRULEDDHI_API` przy pierwszym odczycie stanu, a brak szwu czyta jako brak
   Workera — czyli milczałby o tym, że nie ma czym wysłać żądania. */
const text = installBridge({
  eventName: config.eventName,
  eventDate: config.eventDate,
  preview: config.preview,
  getLang: () => lang
});

function eventYear() {
  const date = new Date(config.eventDate);
  return Number.isNaN(date.getTime()) ? String(new Date().getFullYear()) : String(date.getFullYear());
}

function eventDateLabel() {
  const date = new Date(config.eventDate);
  if (Number.isNaN(date.getTime())) return config.eventLocation || '';
  let formatted;
  try {
    formatted = new Intl.DateTimeFormat(lang, {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome'
    }).format(date);
  } catch (_) {
    formatted = config.eventDate.slice(0, 10);
  }
  return [formatted, config.eventLocation].filter(Boolean).join(' · ');
}

function applyEventConfig() {
  const parts = String(config.eventDate || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  const headerDate = parts ? `${parts[3]} · ${parts[2]} · ${parts[1]}` : eventYear();
  document.querySelectorAll('[data-config-event-name]').forEach((element) => {
    element.textContent = config.eventName;
  });
  document.querySelectorAll('[data-header-date]').forEach((element) => {
    element.textContent = headerDate;
  });
  document.querySelectorAll('[data-config-date-label]').forEach((element) => {
    element.textContent = eventDateLabel();
  });
  document.querySelectorAll('[data-config-event-year]').forEach((element) => {
    element.textContent = eventYear();
  });
  document.querySelectorAll('[data-config-event-location]').forEach((element) => {
    element.textContent = config.eventLocation || '';
  });
}

async function loadEventConfig() {
  if (!config.endpoints.settings) return;
  try {
    const result = await postJSON(config.endpoints.settings, {});
    const settings = result?.settings;
    if (!settings) return;
    if (typeof settings.eventName === 'string' && settings.eventName.trim()) config.eventName = settings.eventName.trim();
    if (typeof settings.eventDate === 'string' && !Number.isNaN(new Date(settings.eventDate).getTime())) config.eventDate = settings.eventDate;
    if (typeof settings.eventLocation === 'string' && settings.eventLocation.trim()) config.eventLocation = settings.eventLocation.trim();
    applyLanguage(lang, false);
  } catch (_) {
    /* The built-in edition remains fully usable if settings are temporarily unavailable. */
  }
}

function applyLanguage(next, persist = true) {
  const available = Object.keys(window.CARRULEDDHI_I18N || {});
  lang = available.includes(next) ? next : 'it';
  const all = window.CARRULEDDHI_I18N || {};
  const dict = all[lang] || all.it || {};

  translateDom(dict);
  document.documentElement.lang = lang;
  /* Kropka zdejmowana: nagłówek na stronie jest zdaniem („Zagłosuj na uczestnika."), a tytuł
     karty przeglądarki nie — „Zagłosuj na uczestnika. — Carruleddhi Show 2026" ma w środku
     kropkę i kreskę obok siebie. */
  if (dict['voting.pageTitle']) {
    document.title = `${dict['voting.pageTitle'].replace(/[.。]$/, '')} — ${config.eventName}`;
  }

  applyEventConfig();
  paintPicker();

  /* Odsyłacz „wróć na stronę" niesie język dalej. Bez tego powrót ze strony po polsku na
     stronę główną gubiłby wybór u kogoś, kto wszedł tu z `?lang=` w mailu i nie ma nic
     zapisanego w przeglądarce. */
  document.querySelectorAll('[data-vote-back]').forEach((link) => {
    link.setAttribute('href', `index.html?lang=${lang}`);
  });

  /* Dokumenty prawne dostają ten sam parametr, dokładnie tak jak w app.js: regulamin ma się
     otworzyć w języku, w którym ktoś właśnie głosował. */
  document.querySelectorAll('[data-legal-link]').forEach((link) => {
    const base = link.getAttribute('href').split('?')[0];
    link.setAttribute('href', `${base}?lang=${lang}`);
  });

  if (persist) writeLang(lang);
  // To samo zdarzenie co na stronie głównej — voting-page.js przerysowuje po nim nazwy nagród.
  window.dispatchEvent(new CustomEvent('carruleddhi:language', { detail: { lang } }));
}

/* ------------------------------------------------------------ przełącznik języka */

/**
 * Ten sam przełącznik co w nagłówku strony głównej: flaga, skrót, lista rozwijana.
 *
 * Stał tu wcześniej rząd sześciu przycisków z nazwami języków — czyli coś, czego nie ma na
 * żadnej innej stronie serwisu. Znacznik jest teraz ten sam co w index.html, więc styl
 * przychodzi z arkusza bez ani jednej nowej reguły; brakowało tylko zachowania, bo tamto
 * mieszka w app.js, którego ta strona nie wciąga.
 *
 * Flagi jako SVG, nie emoji: Windows nie ma kolorowych glifów flag i pokazuje w ich miejsce
 * dwie litery. Ten sam moduł co na stronie głównej, więc flaga jest ta sama, nie podobna.
 */
function paintPicker() {
  const trigger = document.querySelector('[data-language-trigger]');
  const flag = document.querySelector('[data-language-flag]');
  const code = document.querySelector('[data-language-code]');
  if (flag) flag.innerHTML = flagSvg(lang, { size: 26 });
  if (code) code.textContent = lang.toUpperCase();
  if (trigger) trigger.setAttribute('aria-label', `Lingua / Language: ${NATIVE[lang] || lang}`);

  document.querySelectorAll('[data-language-option]').forEach((option) => {
    const value = option.dataset.languageOption;
    const selected = value === lang;
    option.setAttribute('aria-selected', String(selected));
    option.tabIndex = selected ? 0 : -1;
    const mark = option.firstElementChild;
    if (mark && !mark.dataset.svgFlag) {
      mark.innerHTML = flagSvg(value, { size: 22 });
      mark.dataset.svgFlag = '1';
    }
  });
}

function setupPicker() {
  const picker = document.querySelector('[data-language-picker]');
  const trigger = document.querySelector('[data-language-trigger]');
  const menu = document.querySelector('[data-language-menu]');
  if (!picker || !trigger || !menu) return;

  const setOpen = (open) => {
    picker.classList.toggle('is-open', open);
    trigger.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-hidden', String(!open));
    if (open) menu.querySelector('[aria-selected="true"]')?.focus();
  };

  trigger.addEventListener('click', () => setOpen(!picker.classList.contains('is-open')));

  menu.addEventListener('click', (event) => {
    const option = event.target.closest('[data-language-option]');
    if (!option) return;
    applyLanguage(option.dataset.languageOption);
    setOpen(false);
    trigger.focus();
  });

  /* Strzałki wędrują po liście, Escape zamyka i wraca na przycisk. `role="listbox"` obiecuje
     czytnikowi ekranu dokładnie takie zachowanie — obietnica bez obsługi jest gorsza niż
     zwykła lista przycisków. */
  menu.addEventListener('keydown', (event) => {
    const options = Array.from(menu.querySelectorAll('[data-language-option]'));
    const at = options.indexOf(document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      trigger.focus();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      options[(at + step + options.length) % options.length]?.focus();
    }
  });

  // Kliknięcie poza listą zamyka ją — inaczej zostaje otwarta na cały czas głosowania.
  document.addEventListener('click', (event) => {
    if (!picker.contains(event.target)) setOpen(false);
  });
}

/**
 * Baner DEMO na górze strony, dokładnie jak na stronie głównej.
 *
 * Brakowało go tutaj, i to była dziura w regule obowiązującej w całym projekcie: treść z demo
 * musi mówić na ekranie, że jest z demo. Strona główna dokłada ten pasek w app.js, którego ta
 * podstrona nie wciąga — więc do tej pory podstrona z `?demo=1` pokazywała osiemnastu
 * wymyślonych uczestników bez ani jednego słowa o tym, że są wymyśleni. Zrzut ekranu takiej
 * strony nie różnił się niczym od zrzutu z dnia zawodów.
 *
 * Budowany z JavaScriptu, nie wpisany w znacznik: czego nie ma w znaczniku, to nie może
 * pojawić się bez parametru w adresie.
 */
function paintDemoBanner() {
  if (new URLSearchParams(location.search).get('demo') !== '1') return;
  document.documentElement.classList.add('is-demo');
  const banner = document.createElement('div');
  banner.className = 'demo-banner';
  banner.setAttribute('role', 'status');
  banner.textContent = 'DEMO — uczestnicy i głosy są przykładowe / partecipanti e voti sono di esempio';
  document.body.prepend(banner);
}

function setupScrollEffects() {
  const progress = document.querySelector('[data-scroll-progress]');
  const navProgress = document.querySelector('[data-nav-progress]');
  const glow = document.querySelector('[data-footer-glow]');
  if (!progress && !navProgress && !glow) return;

  let frame = 0;
  let documentHeight = 1;
  let glowHeight = 1;
  const measure = () => {
    documentHeight = document.documentElement.scrollHeight;
    glowHeight = glow?.offsetHeight || 1;
  };
  const paint = () => {
    frame = 0;
    const max = Math.max(1, documentHeight - window.innerHeight);
    const ratio = Math.min(1, Math.max(0, window.scrollY / max));
    if (progress) progress.style.width = `${(ratio * 100).toFixed(2)}%`;
    if (navProgress) navProgress.textContent = `${String(Math.round(ratio * 100)).padStart(2, '0')}%`;
    if (glow) {
      const left = documentHeight - window.innerHeight - window.scrollY;
      const reveal = Math.min(1, Math.max(0, (glowHeight - left) / glowHeight));
      glow.style.setProperty('--footer-glow-progress', (0.05 + 0.95 * reveal).toFixed(4));
    }
  };
  const schedule = () => {
    if (!frame) frame = window.requestAnimationFrame(paint);
  };
  const remeasure = () => { measure(); schedule(); };

  measure();
  paint();
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', remeasure, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(remeasure).observe(document.body);
}

function boot() {
  paintDemoBanner();
  setupPicker();
  setupScrollEffects();
  // Rok w stopce z zegara, nie wpisany: strona przeżyje sylwestra.
  document.querySelectorAll('[data-current-year]').forEach((slot) => {
    slot.textContent = String(new Date().getFullYear());
  });
  // Bez zapisu: samo wejście na stronę nie jest wyborem języka, tylko odczytaniem go.
  applyLanguage(lang, false);
  void loadEventConfig();

  /**
   * Wysokość ekranu zamrożona w `--screen-h`, tak samo jak na stronie głównej.
   *
   * Ta strona nie ma sekcji na całą wysokość, ale ma odstępy i rozmiary pisma liczone z
   * wysokości okna — i to wystarczyło. ZMIERZONE sondą probe-urlbar-doc.mjs przed tą zmianą:
   * przy oknie 844 → 662 dokument podstrony ruszał się o 76 px za każdym ruchem paska adresu.
   * Mniej niż 1891 px na stronie głównej, ale przewijanie szarpie się tak samo.
   *
   * Przeliczane wyłącznie przy zmianie SZEROKOŚCI okna — chowanie paska nie zmienia
   * szerokości. Tu bez opóźnionego przyjmowania zmiany wysokości, które ma app.js: tam chodzi
   * o sekcje wypełniające ekran, a tu nic takiego nie ma, więc nie ma czego dopasowywać.
   */
  measureScreenHeight();
  let lastWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    measureScreenHeight();
  }, { passive: true });
  window.addEventListener('orientationchange', () => {
    lastWidth = window.innerWidth;
    measureScreenHeight();
    requestAnimationFrame(measureScreenHeight);
  }, { passive: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

export { text };

/* ===========================================================================
   Menu podstrony
   ===========================================================================
   Te same klasy co na stronie głównej (`.mobile-nav.is-open`, `.menu-backdrop.is-open`,
   `body.is-menu-open`), więc CSS i przejście są wspólne — tu jest tylko otwieranie.

   Nie da się tego wziąć z app.js: tamta obsługa jest wpleciona w system przypiętych paneli,
   blokadę przewijania i pułapkę fokusu całej strony głównej. Podstrona ma jeden ekran treści,
   więc powtórzenie trzydziestu linijek jest tańsze niż wciągnięcie tamtego modułu.

   Escape i kliknięcie w tło zamykają, a fokus wraca na przycisk — bez tego zamknięcie menu
   z klawiatury zostawia kursor w panelu, którego już nie widać.
*/
function setupMenu() {
  const toggle = document.querySelector('[data-menu-toggle]');
  const menu = document.querySelector('[data-mobile-menu]');
  const backdrop = document.querySelector('[data-menu-backdrop]');
  if (!toggle || !menu) return;

  const setOpen = (open) => {
    menu.classList.toggle('is-open', open);
    menu.setAttribute('aria-hidden', String(!open));
    backdrop?.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    document.querySelector('.site-header')?.classList.toggle('is-menu-open', open);
    document.body.classList.toggle('is-menu-open', open);
    /* Blokada przewijania tła, ta sama klasa co na stronie głównej: bez niej lista wozów
       jedzie pod otwartym panelem przy każdym ruchu palca. */
    document.body.classList.toggle('is-locked', open);
  };

  toggle.addEventListener('click', () => setOpen(!menu.classList.contains('is-open')));
  backdrop?.addEventListener('click', () => { setOpen(false); toggle.focus(); });
  /* Odsyłacze wychodzą na inną stronę, ale zamknięcie i tak jest potrzebne: powrót
     przyciskiem wstecz pokazuje stronę z pamięci, razem z otwartym menu. */
  menu.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menu.classList.contains('is-open')) {
      setOpen(false);
      toggle.focus();
    }
  });
}

setupMenu();

/* ===========================================================================
   Licznik parkuje POD nagłówkiem, nie za nim
   ===========================================================================
   `.site-header` jest `position: fixed` z `z-index: 900`, a licznik `sticky top: 0` z
   `z-index: 60`. Przy przewijaniu licznik dojeżdżał więc do samej góry i chował się pod
   paskiem — na telefonie znikał prawie w całości, czyli jedyna liczba, która w tych
   kilkudziesięciu minutach jest pilna, była niewidoczna.

   Wysokość paska liczona w JS, a nie wpisana w CSS: pasek zmienia wysokość razem z
   szerokością ekranu, długością nazwy i tym, czy zawija się w dwie linie. Każda liczba
   wpisana na sztywno byłaby poprawna dla jednego telefonu i zła dla następnego.
*/
function syncHeaderOffset() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const bottom = Math.round(header.getBoundingClientRect().bottom);
  /* `bottom`, nie `height`: pasek stoi 16 px od góry, więc sama wysokość zostawiłaby
     licznik schowany dokładnie o ten odstęp. */
  document.documentElement.style.setProperty('--vote-header-bottom', `${Math.max(bottom, 0)}px`);
}

syncHeaderOffset();
window.addEventListener('resize', syncHeaderOffset, { passive: true });
window.addEventListener('load', syncHeaderOffset);
/* Pasek zmienia wysokość także bez zmiany okna — po przełączeniu języka albo gdy nazwa
   sekcji się zawinie. ResizeObserver łapie to, czego `resize` nie widzi. */
if (typeof ResizeObserver === 'function') {
  const header = document.querySelector('.site-header');
  if (header) new ResizeObserver(syncHeaderOffset).observe(header);
}
