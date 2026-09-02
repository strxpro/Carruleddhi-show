/**
 * Dokumenty prawne w sześciu językach, z jednego pliku danych na dokument.
 * ===========================================================================
 * Obsługuje regulamin, politykę prywatności i politykę cookie. Który dokument — mówi
 * strona atrybutem `data-legal-source` na znaczniku <html>; patrz `SOURCE` niżej.
 *
 * Do tej pory `regolamento.html` był jedną stroną po włosku. Reszta serwisu chodzi w sześciu
 * językach, więc odsyłacz w stopce i link w każdym mailu — `regolamento.html?lang=pl` —
 * prowadziły kogoś, kto czyta po polsku, do ściany tekstu po włosku. Parametr `lang` w tych
 * mailach był tam od początku i nikt go nie obsługiwał.
 *
 * DLACZEGO OSOBNY PLIK, A NIE i18n.js
 * `assets/js/i18n.js` ma 137 kB i jest słownikiem interfejsu strony głównej. Strona prawna
 * potrzebuje z niego czterech napisów, więc dociągałaby 137 kB, żeby napisać „Wróć na stronę".
 * Te cztery napisy leżą niżej w tablicy `CHROME`, a treść dokumentu — jedyna rzecz tutaj, która
 * naprawdę waży — jedzie z `assets/legal/regolamento.json`.
 *
 * DLACZEGO WŁOSKI ZOSTAJE W HTML
 * Statyczny artykuł w `regolamento.html` nie jest usuwany. Jest domyślną treścią strony:
 * widać go bez JavaScriptu, widać go przy zablokowanym `fetch`, i widać go, gdy plik z
 * tłumaczeniami nie dojdzie. Ten skrypt go podmienia, a nie dostarcza — więc awaria skryptu
 * kosztuje język, a nie regulamin.
 */
(function () {
  'use strict';

  /**
   * KTORY DOKUMENT — pyta o to strona, nie ten plik.
   * ---------------------------------------------------------------------------
   * Ten sam skrypt obsluguje teraz trzy strony prawne: regulamin, polityke prywatnosci
   * i polityke cookie. Rozniva je wylacznie plik z trescia, wiec nazwa pliku jest jedyna
   * rzecza, ktora strona musi podac — przez `data-legal-source` na znaczniku <html>.
   *
   * Domyslny regulamin zostaje dla zgodnosci: strona, ktora tego atrybutu nie ma, zachowuje
   * sie dokladnie tak, jak przed rozdzieleniem.
   */
  const SOURCE = document.documentElement.dataset.legalSource || 'assets/legal/regolamento.json';
  const DEFAULT_LOCALE = 'it';

  /* Te same sześć języków co i18n.js i co LOCALES w Workerze. Kolejność jest kolejnością
     przycisków na ekranie: włoski pierwszy, bo jest wersją oficjalną. */
  const LOCALES = ['it', 'pl', 'en', 'de', 'es', 'fr'];
  const NATIVE = { it: 'Italiano', pl: 'Polski', en: 'English', de: 'Deutsch', es: 'Español', fr: 'Français' };

  /** Cztery napisy ramki strony. Wszystko poza nimi przychodzi z pliku z treścią. */
  const CHROME = {
    it: { back: 'Torna al sito', language: 'Lingua', loading: 'Carico il documento…', failed: 'Non riesco a caricare la traduzione. Sotto trovi il testo italiano, che è la versione ufficiale.' },
    pl: { back: 'Wróć na stronę', language: 'Język', loading: 'Wczytuję dokument…', failed: 'Nie udało się wczytać tłumaczenia. Poniżej jest tekst włoski, czyli wersja oficjalna.' },
    en: { back: 'Back to the site', language: 'Language', loading: 'Loading the document…', failed: 'The translation could not be loaded. Below is the Italian text, which is the official version.' },
    de: { back: 'Zurück zur Seite', language: 'Sprache', loading: 'Dokument wird geladen…', failed: 'Die Übersetzung konnte nicht geladen werden. Unten steht der italienische Text, die amtliche Fassung.' },
    es: { back: 'Volver al sitio', language: 'Idioma', loading: 'Cargando el documento…', failed: 'No se ha podido cargar la traducción. Abajo está el texto italiano, que es la versión oficial.' },
    fr: { back: 'Retour au site', language: 'Langue', loading: 'Chargement du document…', failed: 'La traduction n’a pas pu être chargée. Ci-dessous le texte italien, la version officielle.' }
  };

  const chromeOf = (locale) => CHROME[locale] || CHROME[DEFAULT_LOCALE];

  /**
   * Który język pokazać.
   *
   * `?lang=` wygrywa ze wszystkim, bo to jawna prośba: tak wygląda link w mailu, który
   * wyszedł po polsku, i tak wygląda link wysłany komuś ręcznie. Potem wybór zapamiętany na
   * stronie głównej, tym samym kluczem, którego używa app.js — inaczej ktoś, kto przełączył
   * serwis na polski, dostawałby tu włoski przy każdym wejściu. Na końcu język przeglądarki.
   */
  function pickLocale() {
    const asked = new URLSearchParams(location.search).get('lang');
    const stored = (() => {
      try { return localStorage.getItem('carruleddhi.lang'); } catch (_) { return null; }
    })();
    const browser = (navigator.language || '').slice(0, 2);
    for (const candidate of [asked, stored, browser]) {
      const code = String(candidate || '').slice(0, 2).toLowerCase();
      if (LOCALES.includes(code)) return code;
    }
    return DEFAULT_LOCALE;
  }

  /**
   * Treść dokumentu, pobierana raz.
   *
   * Obietnica, nie wynik: przełączenie języka przy zamontowanej stronie ma przerysować ekran
   * z tego, co już jest w pamięci, a nie sięgać po plik jeszcze raz.
   */
  let pending = null;
  function documents() {
    if (!pending) {
      pending = fetch(SOURCE, { credentials: 'same-origin' })
        .then((response) => {
          if (!response.ok) throw new Error(String(response.status));
          return response.json();
        })
        .catch((error) => {
          /* Wyzerowane, żeby kolejne kliknięcie w język spróbowało ponownie. Zapamiętana
             odrzucona obietnica zamieniłaby jedną nieudaną prośbę w trwale zepsutą stronę. */
          pending = null;
          throw error;
        });
    }
    return pending;
  }

  /**
   * Odsyłacze w treści dokumentu.
   *
   * `privacy.html` i `cookies.html` dostają ten sam `?lang`, bo czytelnik jest w środku
   * jednego czytania i przejście do polityki prywatności nie jest powodem, żeby wrócić do
   * włoskiego. Adresy zewnętrzne, `mailto:` i `tel:` zostają nietknięte.
   */
  function carryLanguage(root, locale) {
    root.querySelectorAll('a[href]').forEach((link) => {
      const href = link.getAttribute('href') || '';
      if (!/^(privacy|cookies|regolamento|index)\.html/.test(href)) return;
      const [path, hash = ''] = href.split('#');
      const url = new URL(path, location.href);
      url.searchParams.set('lang', locale);
      link.setAttribute('href', `${url.pathname.split('/').pop()}${url.search}${hash ? `#${hash}` : ''}`);
    });
  }

  function render(doc, locale) {
    const head = document.querySelector('.legal-page__head');
    const article = document.querySelector('.legal-content');
    if (!article) return;

    document.documentElement.lang = locale;
    if (doc.pageTitle) document.title = doc.pageTitle;

    if (head) {
      const eyebrow = head.querySelector('.eyebrow');
      const title = head.querySelector('h1');
      const lead = head.querySelector('.lead');
      if (eyebrow && doc.eyebrow) eyebrow.textContent = doc.eyebrow;
      /* Kropka z projektu graficznego, nie z treści: nagłówki na tej stronie są pisane
         „Regolamento." i plik z treścią nie ma powodu jej nosić w każdym języku. */
      if (title && doc.title) title.textContent = `${doc.title}.`;
      if (lead && doc.lead) lead.textContent = doc.lead;
    }

    /* Treść pochodzi z pliku, który leży w tym repozytorium i jest wdrażany razem z nim, a
       nie od użytkownika ani z zewnętrznego API — dlatego innerHTML. Nadal przechodzi przez
       DOMParser i wycięcie elementów wykonywalnych, bo dokument prawny jest tekstem i nie ma
       żadnego powodu, żeby cokolwiek uruchamiał; gdyby kiedyś ktoś wklejał go z panelu, ta
       bariera będzie już na miejscu. */
    const parsed = new DOMParser().parseFromString(`<div>${doc.html || ''}</div>`, 'text/html');
    const body = parsed.body.firstElementChild;
    if (!body) return;
    body.querySelectorAll('script, style, iframe, object, embed, form, link, meta').forEach((node) => node.remove());
    body.querySelectorAll('*').forEach((node) => {
      [...node.attributes].forEach((attribute) => {
        if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name);
      });
    });
    carryLanguage(body, locale);
    article.replaceChildren(...body.childNodes);
  }

  function paintChrome(locale) {
    const copy = chromeOf(locale);
    document.querySelectorAll('[data-legal-back]').forEach((link) => {
      link.textContent = `← ${copy.back}`;
      const url = new URL('index.html', location.href);
      url.searchParams.set('lang', locale);
      link.setAttribute('href', `${url.pathname.split('/').pop()}${url.search}`);
    });
    const picker = document.querySelector('[data-legal-languages]');
    if (picker) picker.setAttribute('aria-label', copy.language);
    document.querySelectorAll('[data-legal-language]').forEach((button) => {
      const active = button.dataset.legalLanguage === locale;
      button.setAttribute('aria-current', active ? 'true' : 'false');
      button.classList.toggle('is-active', active);
    });
  }

  function buildPicker(onPick) {
    const picker = document.querySelector('[data-legal-languages]');
    if (!picker) return;
    picker.replaceChildren(...LOCALES.map((locale) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'legal-lang';
      button.dataset.legalLanguage = locale;
      button.lang = locale;
      button.textContent = NATIVE[locale];
      button.addEventListener('click', () => onPick(locale));
      return button;
    }));
  }

  function notice(message) {
    let element = document.querySelector('[data-legal-notice]');
    if (!element) {
      element = document.createElement('p');
      element.className = 'legal-note';
      element.dataset.legalNotice = '';
      element.setAttribute('role', 'status');
      document.querySelector('.legal-content')?.prepend(element);
    }
    element.textContent = message;
  }

  async function show(locale, { persist = false } = {}) {
    paintChrome(locale);
    if (persist) {
      try { localStorage.setItem('carruleddhi.lang', locale); } catch (_) { /* Storage may be blocked. */ }
      const url = new URL(location.href);
      url.searchParams.set('lang', locale);
      history.replaceState(null, '', url);
    }
    try {
      const all = await documents();
      const doc = all[locale] || all[DEFAULT_LOCALE];
      if (!doc) throw new Error('locale missing');
      render(doc, locale);
    } catch (error) {
      console.warn('Legal document could not be translated:', error);
      /* Włoski artykuł nadal stoi w HTML, więc na ekranie jest regulamin — brakuje tylko
         tłumaczenia, i to jest jedyna rzecz, o której trzeba powiedzieć. */
      if (locale !== DEFAULT_LOCALE) notice(chromeOf(locale).failed);
    }
  }

  function start() {
    buildPicker((locale) => show(locale, { persist: true }));
    show(pickLocale());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
