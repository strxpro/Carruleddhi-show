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
 *   Inaczej niż strony prawne, ta potrzebuje słownika interfejsu, a nie czterech napisów: nazwy
 *   dwunastu nagród, wszystkie komunikaty głosowania, teksty błędów. Przepisanie ich tutaj
 *   dałoby drugi słownik do utrzymania i pierwszą rzecz, która rozjedzie się przy zmianie
 *   nazwy nagrody.
 */
import './i18n.js';
import { getPublicSiteConfig } from './site-config.js';
import { installBridge, translateDom } from './site-bridge.js';

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
    document.title = `${dict['voting.pageTitle'].replace(/[.。]$/, '')} — Carruleddhi Show 2026`;
  }

  document.querySelectorAll('[data-vote-lang]').forEach((button) => {
    const selected = button.dataset.voteLang === lang;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });

  /* Odsyłacz „wróć na stronę" niesie język dalej. Bez tego powrót ze strony po polsku na
     stronę główną gubiłby wybór u kogoś, kto wszedł tu z `?lang=` w mailu i nie ma nic
     zapisanego w przeglądarce. */
  document.querySelectorAll('[data-vote-back]').forEach((link) => {
    link.setAttribute('href', `index.html?lang=${lang}`);
  });

  if (persist) writeLang(lang);
  // To samo zdarzenie co na stronie głównej — voting-page.js przerysowuje po nim nazwy nagród.
  window.dispatchEvent(new CustomEvent('carruleddhi:language', { detail: { lang } }));
}

function paintLanguageRow() {
  const row = document.querySelector('[data-vote-languages]');
  if (!row) return;
  row.replaceChildren(...LOCALES.map((code) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'legal-langs__btn';
    button.dataset.voteLang = code;
    button.textContent = NATIVE[code];
    button.addEventListener('click', () => applyLanguage(code));
    return button;
  }));
}

function boot() {
  paintLanguageRow();
  // Bez zapisu: samo wejście na stronę nie jest wyborem języka, tylko odczytaniem go.
  applyLanguage(lang, false);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

export { text };
