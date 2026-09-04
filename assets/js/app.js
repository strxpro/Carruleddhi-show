import { DEFAULT_SITE_CONFIG, GALLERY_MAX, getPublicSiteConfig } from './site-config.js';
import { DEMO_SPONSORS, demoComments, demoRating } from './demo-content.js';
import { ROUTE_VIEWBOX, buildDashPathData, buildRoutePathData } from './route-path.js';
import { flagSvg } from './flags.js';
/* Cztery rzeczy, które od wyniesienia głosowania na osobną podstronę mają jedną, wspólną
   wersję: wysyłka, pasek komunikatów, odczyt ze słownika i przepisanie znaczników na język.
   Stały tutaj i były podawane na zewnątrz przez window.CARRULEDDHI_API — patrz nagłówek
   site-bridge.js, w którym opisane jest, dlaczego druga kopia `postJSON` byłaby błędem. */
/* `screenHeight` pod aliasem, bo `setupPanels` ma własną lokalną zmienną o tej nazwie
   trzymającą tę samą liczbę. Alias jest tańszy niż przemianowanie tamtej i nie zostawia dwóch
   nazw znaczących to samo w jednym pliku. */
import {
  makeText, makePayload, measureScreenHeight, postJSON,
  screenHeight as frozenScreenHeight, setCopyTokens, showToast, translateDom,
  watchNavCentreReserve
} from './site-bridge.js';

(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  /* Ekran dotykowy. `(hover: none)` zamiast `maxTouchPoints`, bo pyta o to, o co naprawdę
     chodzi — o brak wskaźnika, który mógłby najechać — i nie łapie laptopa z ekranem
     dotykowym jako telefonu. setupPanels ma własną, starszą flagę na `maxTouchPoints`; obie
     odpowiadają tam, gdzie są używane, i nie warto ich scalać za cenę zmiany zachowania w
     miejscu, które działa. */
  const touchScreen = window.matchMedia('(hover: none)').matches;
  const config = getPublicSiteConfig();

  /**
   * Demo mode: `?demo=1`.
   *
   * Fills the sponsor band and the comment wall with placeholders so the design can be
   * judged before the real ones exist. Read from the address and stored nowhere, because the
   * standing rule here is that every number on the page is real — and a persisted "show
   * demo content" switch is one forgotten click away from a live site showing invented
   * reviews of a race that has not happened yet. See assets/js/demo-content.js.
   */
  const demoMode = new URLSearchParams(window.location.search).get('demo') === '1';

  /* Said on screen, not just in a comment.
     If a screenshot of a preview ever leaves this machine, the word DEMO is in it. Built in
     JavaScript rather than written into index.html so it cannot possibly appear without the
     query parameter that put it there. */
  if (demoMode) {
    document.documentElement.classList.add('is-demo');
    const banner = document.createElement('div');
    banner.className = 'demo-banner';
    banner.setAttribute('role', 'status');
    banner.textContent = 'DEMO — sponsorzy i komentarze są przykładowe / sponsor e commenti sono di esempio';
    document.addEventListener('DOMContentLoaded', () => document.body.prepend(banner), { once: true });
    if (document.readyState !== 'loading') document.body?.prepend(banner);
  }
  window.CARRULEDDHI_ACTIVE_CONFIG = config;

  const storage = {
    get(key, fallback = null) {
      try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : value;
      } catch (_) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (_) {
        return false;
      }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch (_) { /* Storage may be blocked. */ }
    }
  };

  const state = {
    lang: 'it',
    formStep: 1,
    deckIndex: 0,
    deckLocked: false,
    attended: storage.get('carruleddhi.attended') === '1',
    registrations: Number.parseInt(storage.get('carruleddhi.registrations', '0'), 10) || 0,
    remoteAttendees: null,
    // Two-letter initials of the first riders, for the avatar row. Empty until the
    // counts endpoint answers; the markup carries placeholders until then.
    riderInitials: [],
    remotePilots: null,
    lastRegistration: null,
    lastFocused: null
  };

  function dictionary() {
    const all = window.CARRULEDDHI_I18N || {};
    return all[state.lang] || all.it || {};
  }

  /* Ze wspólnego szwu, z językiem podanym wprost. `state.lang`, nie atrybut w `<html>`:
     applyLanguage ustawia jedno o kilkanaście linii wcześniej niż drugie, a w tym okienku dwa
     napisy obok siebie wyszłyby w dwóch językach.

     Deklaracja funkcji, nie `const` ze strzałką: `text` jest wołane z kilkudziesięciu miejsc
     tego pliku, w tym z funkcji zdefiniowanych wyżej, a `const` nie jest wyciągane na górę
     zasięgu. Zamiana na stałą dawała ReferenceError przy pierwszym wywołaniu z góry pliku. */
  let translate = null;
  function text(key) {
    if (!translate) translate = makeText(() => state.lang);
    return translate(key);
  }

  function formatHeaderDate(value) {
    const parts = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return parts ? `${parts[3]} · ${parts[2]} · ${parts[1]}` : config.dateLabel;
  }

  /**
   * Sama data po ludzku, bez miejsca: „17 ottobre 2026", „17 października 2026".
   *
   * Wyciągnięte z `formatEventDateLabel`, bo te dwa napisy stoją w różnych miejscach: kicker w
   * hero chce datę Z miejscem, a kicker programu i znacznik %DATE% chcą samej daty. Jedna
   * funkcja z parametrem „czy dokładać miejsce" znaczyłaby, że każde wywołanie trzeba czytać
   * razem z tym parametrem, żeby wiedzieć, co wyjdzie.
   */
  function formatEventDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return DEFAULT_SITE_CONFIG.dateLabel.split(' · ')[0];
    try {
      return new Intl.DateTimeFormat(state.lang || 'it', {
        day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome'
      }).format(date);
    } catch (_) {
      return formatHeaderDate(value).replaceAll(' · ', '/');
    }
  }

  function formatEventDateLabel(value, location) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return config.dateLabel;
    return [formatEventDate(value), location].filter(Boolean).join(' · ');
  }

  /** Rok edycji z `config.eventDate`. Zapas na bieżący rok, żeby nigdy nie wyszło „NaN". */
  function eventYear() {
    const date = new Date(config.eventDate);
    return String(Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear());
  }

  /**
   * DANE STRUKTURALNE (JSON-LD) PO ODCZYCIE USTAWIEŃ.
   * ===========================================================================
   * `startDate` i `endDate` w `<script type="application/ld+json">` były wpisane na sztywno.
   * To jest napis, którego nie widzi nikt na ekranie — i właśnie dlatego przeżyłby każdą
   * przeprowadzkę edycji bez poprawki, a wyszukiwarka i podglądy odsyłaczy pokazywałyby
   * zeszłoroczny termin jako fakt o wydarzeniu.
   *
   * PODMIANA PRZEZ `textContent`, NIE PRZEZ WSTAWIANIE HTML-a.
   *   Zawartość tego znacznika nie jest znacznikiem, tylko danymi. `innerHTML` przepuszczałby
   *   `<` i `>` z nazwy edycji wpisanej w panelu jako składnię — a `JSON.stringify` i
   *   `textContent` razem nie mają na to żadnej drogi.
   *
   * GODZINY 12:00–22:00 ZOSTAJĄ RAMĄ DNIA, NIE GODZINĄ STARTU.
   *   `config.eventDate` to chwila startu wyścigu (14:30) i tym karmi się licznik.
   *   `startDate` w danych strukturalnych opisuje CAŁE wydarzenie, które zaczyna się
   *   prezentacją wozów w południe i kończy zabawą wieczorem — tak stoi w sekcji programu.
   *   Brany jest więc sam DZIEŃ z konfiguracji, a godziny i strefa zostają.
   */
  function applyStructuredData() {
    const script = $('script[type="application/ld+json"]');
    if (!script) return;
    const parts = String(config.eventDate || '').match(/^(\d{4}-\d{2}-\d{2})T[\d:.]+(Z|[+-]\d{2}:\d{2})?/);
    if (!parts) return;
    const day = parts[1];
    const zone = parts[2] === 'Z' ? 'Z' : (parts[2] || '+02:00');
    let data;
    try {
      data = JSON.parse(script.textContent);
    } catch (_) {
      /* Zepsuty JSON w znaczniku to błąd do naprawienia w index.html, nie w czasie działania —
         nadpisanie go tutaj ukryłoby literówkę, którą powinien złapać przegląd pliku. */
      return;
    }
    data.name = config.eventName;
    data.startDate = `${day}T12:00:00${zone}`;
    data.endDate = `${day}T22:00:00${zone}`;
    script.textContent = JSON.stringify(data, null, 2);
  }

  /* ==========================================================================
     Galeria o dowolnej liczbie kadrów
     ==========================================================================
     Było: pięć `<figure>` wpisanych w index.html z `data-gallery-image="0".."4"` i pętla,
     która podstawiała im adresy z konfiguracji. Znaczyło to, że liczba zdjęć na stronie
     jest liczbą WPISANĄ W ZNACZNIK, a nie liczbą zdjęć w ustawieniach:
       - cztery zdjęcia → piąty kafelek zostawał z ilustracją demonstracyjną z repozytorium
         i gość widział obcy obrazek między prawdziwymi;
       - osiem zdjęć → trzy ostatnie nie miały gdzie się pokazać;
       - zero zdjęć → pięć ilustracji zamiast braku sekcji.
     Teraz siatka jest budowana z tablicy i jej długość JEST liczbą zdjęć.
     ======================================================================== */

  /**
   * Czy ten adres to jedna z pięciu ilustracji demonstracyjnych z repozytorium.
   *
   * PO CO PO ADRESIE, A NIE PO POZYCJI
   *   Słownik ma `gallery.caption1..5` i `gallery.alt1..5` — przetłumaczone na sześć języków
   *   opisy KONKRETNYCH pięciu ilustracji, które jadą w repozytorium („Napięcie tuż przed
   *   startem", „Ilustracja carruleddhi na linii startu"). Wcześniejsza wersja brała je po
   *   numerze kafelka, więc po podmianie pierwszego zdjęcia na prawdziwe zdjęcie z zawodów
   *   pod nim nadal stało „Napięcie tuż przed startem", a czytnik ekranu ogłaszał
   *   „Ilustracja carruleddhi na linii startu" o fotografii mety. Opis alternatywny, który
   *   opisuje inny obrazek, jest gorszy niż ogólny.
   *
   *   Dopasowanie po adresie znaczy: te napisy działają dokładnie dla tych plików, dla
   *   których zostały napisane, a każde wgrane zdjęcie dostaje podpis organizatora albo nic.
   */
  function galleryDemoIndex(source) {
    return DEFAULT_SITE_CONFIG.media.galleryImages.indexOf(source);
  }

  /**
   * Podpisy pod kadrami, dokładnie tyle, ile jest zdjęć.
   *
   * Pierwszeństwo ma podpis z panelu. Puste pole to świadomy brak podpisu — kafelek pokazuje
   * wtedy sam numer, a nie zmyślony napis. Wyjątkiem są ilustracje demonstracyjne, dla
   * których podpis jest w słowniku (patrz `galleryDemoIndex`).
   */
  function galleryCaptionList() {
    const captions = Array.isArray(config.media.galleryCaptions) ? config.media.galleryCaptions : [];
    return config.media.galleryImages.map((image, index) => {
      const own = String(captions[index] || '').trim();
      if (own) return own;
      const demo = galleryDemoIndex(image);
      return demo >= 0 ? text(`gallery.caption${demo + 1}`) : '';
    });
  }

  /**
   * Szerokości kart w siatce zapasowej, tak żeby każdy RZĄD był pełny.
   *
   * Siatka ma dwanaście kolumn (patrz `.gallery__grid` w main.css), a wzór 8+4 | 6+6 | 12
   * domyka się co pięć kart. Ostatnia karta dostaje resztę rzędu, bo inaczej przy liczbie
   * zdjęć niepodzielnej przez wzór ostatni rząd kończyłby się pustym miejscem szerokości
   * jednej karty — a puste miejsce w siatce zdjęć czyta się jak brakujące zdjęcie.
   * Zmierzone: przy trzech zdjęciach było 8+4, potem 6 i cztery kolumny dziury.
   */
  const GALLERY_SPAN_PATTERN = [8, 4, 6, 6, 12];
  const GALLERY_SPAN_CLASS = { 8: 'gallery-card--hero', 4: 'gallery-card--portrait', 12: 'gallery-card--wide' };

  function gallerySpanClasses(count) {
    const classes = [];
    let used = 0;
    for (let index = 0; index < count; index += 1) {
      let span = GALLERY_SPAN_PATTERN[index % GALLERY_SPAN_PATTERN.length];
      if (index === count - 1 && used + span < 12) span = 12 - used;
      used = (used + span) % 12;
      classes.push(GALLERY_SPAN_CLASS[span] || '');
    }
    return classes;
  }

  /**
   * Buduje siatkę zapasową i decyduje, czy sekcja galerii ma w ogóle istnieć.
   *
   * ZERO ZDJĘĆ TO BRAK SEKCJI, NIE PUSTA SIATKA
   *   Sekcja galerii ma nagłówek, wstęp i zastrzeżenie o ilustracjach. Bez zdjęć zostaje
   *   z tego pół ekranu tekstu o zdjęciach, których nie ma, i przewijanie przez panel,
   *   który nic nie pokazuje. Ukrywany jest cały `[data-feature="gallery"]` razem z
   *   odsyłaczem w menu — dokładnie tak, jak przy wyłączonym przełączniku „Galeria zdjęć".
   *
   * KAFELKI DOSTAJĄ `is-visible` OD RAZU
   *   `setupReveal` zakłada swojego obserwatora RAZ, na starcie, na elementach, które wtedy
   *   istniały. Kafelek zbudowany później nie jest przez nikogo obserwowany, więc zostałby
   *   na `opacity: 0` na zawsze — czyli siatka zdjęć niewidoczna, mimo że jest w DOM.
   *   Tracimy animację wejścia dla tych kafelków; galeria, której nie widać, to nie
   *   kompromis, który warto rozważać.
   */
  function renderGalleryGrid() {
    const grid = $('[data-gallery-fallback]');
    const section = document.getElementById('gallery');
    const images = config.media.galleryImages;
    const captions = galleryCaptionList();

    /* Zero zdjęć: sekcja i odsyłacz w menu schodzą ze strony. Warunek jest tu, a nie w
       pętli przełączników, bo to nie jest decyzja organizatora o sekcji — to brak treści. */
    if (images.length === 0) {
      if (section) section.hidden = true;
      $$('[data-feature-link="gallery"]').forEach((element) => { element.hidden = true; });
      $('[data-gallery3d]')?.setAttribute('hidden', '');
      if (grid) grid.replaceChildren();
      return;
    }
    if (section && config.features.gallery) section.hidden = false;

    if (!grid) return;
    const spans = gallerySpanClasses(images.length);
    const cards = images.map((source, index) => {
      const figure = document.createElement('figure');
      /* `is-visible` razem z `reveal` — patrz komentarz nad tą funkcją. */
      figure.className = ['gallery-card', spans[index], 'reveal', 'is-visible'].filter(Boolean).join(' ');

      const media = document.createElement('div');
      media.className = 'gallery-card__media';
      const image = document.createElement('img');
      image.src = source;
      /* Opis dla czytnika ekranu, w trzech krokach: podpis od organizatora, potem opis
         przypisany tej konkretnej ilustracji demonstracyjnej (`gallery.alt1..5`), a na
         końcu jedno ogólne zdanie. Puste `alt` znaczyłoby „obrazek dekoracyjny", a zdjęcie
         z wyścigu dekoracją nie jest. */
      const demo = galleryDemoIndex(source);
      image.alt = captions[index]
        || (demo >= 0 ? text(`gallery.alt${demo + 1}`) : text('gallery.photoAlt'));
      image.width = 1200;
      image.height = 800;
      /* Pierwsze dwa kadry mogą trafić na ekran od razu przy wejściu z odsyłacza
         `#gallery`; resztę pobiera przeglądarka, kiedy uzna, że są blisko. */
      image.loading = index < 2 ? 'eager' : 'lazy';
      image.decoding = 'async';
      media.appendChild(image);

      const caption = document.createElement('figcaption');
      const number = document.createElement('span');
      number.textContent = String(index + 1).padStart(2, '0');
      const label = document.createElement('strong');
      /* `textContent`, nie `innerHTML`: podpis jest danymi z panelu, nie znacznikiem. */
      label.textContent = captions[index] || '';
      caption.append(number, label);

      figure.append(media, caption);
      return figure;
    });
    grid.replaceChildren(...cards);
  }

  function applyPublicConfig() {
    /* NAJPIERW ZNACZNIKI W NAPISACH, POTEM NAPISY.
       ---------------------------------------------------------------------------
       `%YEAR%`, `%DATE%`, `%EVENT%` i `%PLACE%` w słowniku podstawia site-bridge.js, a wartości
       bierze stąd. Ustawiane przed każdym odczytem ze słownika w tej funkcji — inaczej pierwszy
       `text('meta.title')` po odpowiedzi serwera złożyłby tytuł ze starą datą. */
    setCopyTokens({
      YEAR: eventYear(),
      DATE: formatEventDate(config.eventDate),
      EVENT: config.eventName,
      PLACE: config.eventLocation
    });
    $$('[data-config-event-name]').forEach((element) => { element.textContent = config.eventName; });
    $$('[data-header-date]').forEach((element) => { element.textContent = formatHeaderDate(config.eventDate); });
    $$('[data-config-date-label]').forEach((element) => {
      element.textContent = formatEventDateLabel(config.eventDate, config.eventLocation);
    });
    /* ROK I DATA Z JEDNEGO ŹRÓDŁA, TAKŻE W TYCH MIEJSCACH, KTÓRE NIE SĄ ZDANIEM.
       ---------------------------------------------------------------------------
       `hero__year` w tytule strony, rok w stopce i data w kickerze programu były wpisane w
       znacznik i nie ruszał ich żaden odczyt. Ten sam atrybut i ta sama nazwa co na podstronie
       głosowania (`applyEventConfig` w voting-boot.js) — dwie różne nazwy dla tego samego
       znaczyłyby, że poprawka na jednej stronie nie działa na drugiej. */
    $$('[data-config-event-year]').forEach((element) => { element.textContent = eventYear(); });
    $$('[data-config-event-date]').forEach((element) => {
      element.textContent = formatEventDate(config.eventDate);
    });
    $$('[data-config-event-location]').forEach((element) => {
      element.textContent = config.eventLocation || '';
    });
    /* `<time datetime="…">` w programie. Nie widzi tego nikt na ekranie — czyta to czytnik
       ekranu i wyszukiwarka — więc zeszłoroczna data siedziałaby tam do końca świata. Godzina
       zostaje w znaczniku, bo to ona jest treścią wiersza; z konfiguracji bierzemy sam dzień. */
    const eventDay = String(config.eventDate || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(eventDay)) {
      $$('[data-config-schedule-time]').forEach((element) => {
        element.setAttribute('datetime', `${eventDay}T${element.dataset.configScheduleTime}`);
      });
    }
    const configurableText = [
      ['[data-config-tagline]', config.tagline, DEFAULT_SITE_CONFIG.tagline],
      ['[data-config-route-distance]', config.route.distance, DEFAULT_SITE_CONFIG.route.distance],
      ['[data-config-route-road]', config.route.road, DEFAULT_SITE_CONFIG.route.road]
    ];
    configurableText.forEach(([selector, value, defaultValue]) => {
      if (value === defaultValue) return;
      $$(selector).forEach((element) => { element.textContent = value; });
    });
    /* TYTUŁ KARTY I OPISY DO UDOSTĘPNIENIA — Z TEJ SAMEJ DATY CO RESZTA STRONY.
       ---------------------------------------------------------------------------
       Było: `document.title = config.eventName` i tylko wtedy, gdy nazwa różni się od
       wbudowanej. Po ogłoszeniu nowej edycji tytuł karty gubił miejsce („Carruleddhi Show 2027"
       zamiast „… — Santa Teresa Gallura"), a gdy nazwa się nie zmieniła, zostawał tytuł z
       zeszłorocznym rokiem wpisany w `<title>` w pliku.

       Teraz idzie ze słownika, ze znacznikami podstawionymi wyżej — więc tytuł, opis dla
       wyszukiwarki i opis dla podglądu odsyłacza mówią jedną datę, w języku, w którym ktoś
       właśnie czyta stronę. `applyLanguage` woła tę funkcję po każdym przełączeniu języka. */
    document.title = text('meta.title');
    const description = $('meta[name="description"]');
    if (description) description.content = text('meta.description');
    const ogTitle = $('meta[property="og:title"]');
    if (ogTitle) ogTitle.content = config.eventName;
    const ogDescription = $('meta[property="og:description"]');
    if (ogDescription) {
      /* Hasło, potem data i miejsce — ten sam kształt, który stał w znaczniku. Nie ten sam
         napis co `meta.description`: tam jest zdanie dla wyszukiwarki, tu jednolinijkowy podpis
         pod obrazkiem w komunikatorze. */
      ogDescription.content = `${config.tagline} ${formatEventDate(config.eventDate)} — ${config.eventLocation}`;
    }
    applyStructuredData();

    $$('[data-contact-email]').forEach((link) => {
      link.textContent = config.contact.email;
      link.href = `mailto:${config.contact.email}`;
    });
    $$('[data-contact-phone]').forEach((link) => {
      link.textContent = config.contact.phone;
      link.href = `tel:${config.contact.phone.replace(/[^+\d]/g, '')}`;
    });
    $$('[data-route-map-link]').forEach((link) => { link.href = config.route.mapUrl; });

    /* Only when the configuration actually differs from what is in the markup.
       Writing the same URL back into `src` restarts the element's loading decision, and
       these images are marked `loading="lazy"` precisely so the browser gets to make it
       once, near the section, rather than during the first-screen rush. */
    const setImage = (image, source) => {
      if (!image || !source) return;
      const current = image.getAttribute('src');
      if (current !== source) image.src = source;
    };

    setImage($('[data-route-image]'), config.media.routeImage);

    Object.entries(config.features).forEach(([feature, enabled]) => {
      $$(`[data-feature="${feature}"]`).forEach((element) => { element.hidden = !enabled; });
      $$(`[data-feature-link="${feature}"]`).forEach((element) => { element.hidden = !enabled; });
    });

    /* PO pętli przełączników sekcji, nie przed nią. Ta funkcja może ukryć całą sekcję
       galerii (zero zdjęć), a pętla wyżej ustawia `hidden` z konfiguracji — odwrotna
       kolejność znaczyłaby, że przełącznik „Galeria zdjęć: włączona" odsłania sekcję,
       w której nie ma ani jednego kadru. */
    renderGalleryGrid();

    if (config.preview && !$('[data-config-preview-banner]')) {
      const banner = document.createElement('div');
      banner.className = 'config-preview-banner';
      banner.dataset.configPreviewBanner = '';
      banner.setAttribute('role', 'status');
      banner.innerHTML = `<strong>${text('preview.title')}</strong><span>${text('preview.text')}</span><a href="admin.html">${text('preview.back')}</a>`;
      document.body.appendChild(banner);
      document.body.classList.add('is-config-preview');
    }
  }

  /* Pasek komunikatów i wysyłka przychodzą teraz ze wspólnego szwu — patrz import na górze
     pliku. Wywołania w tym pliku (`showToast(text('…'))`, `postJSON(endpoint, …)`) zostają
     dokładnie takie, jakie były; zmieniło się tylko to, że nie ma drugiej kopii. */

  let payloadFor = null;
  function eventPayload(type, data = {}) {
    if (!payloadFor) {
      payloadFor = makePayload({
        eventName: config.eventName,
        eventDate: config.eventDate,
        preview: config.preview,
        getLang: () => state.lang
      });
    }
    return payloadFor(type, data);
  }

  /**
   * Szew dla modułów głosowania: post, payload, text, toast.
   *
   * Cztery funkcje, nie cały moduł. Ta sama czwórka stoi na podstronie głosowania, tylko z
   * innym źródłem języka — patrz installBridge w site-bridge.js.
   */
  window.CARRULEDDHI_API = Object.freeze({
    post: postJSON,
    payload: eventPayload,
    text,
    toast: showToast
  });

  const languageMeta = Object.freeze({
    it: { code: 'IT', name: 'Italiano' },
    pl: { code: 'PL', name: 'Polski' },
    en: { code: 'EN', name: 'English' },
    de: { code: 'DE', name: 'Deutsch' },
    es: { code: 'ES', name: 'Español' },
    fr: { code: 'FR', name: 'Français' }
  });

  /** Swaps every emoji flag for an inline SVG: Windows has no colour flag glyphs. */
  function paintFlags() {
    const trigger = $('[data-language-flag]');
    if (trigger && !trigger.dataset.svgFlag) trigger.dataset.svgFlag = '1';
    $$('[data-language-option]').forEach((option) => {
      const locale = option.dataset.languageOption;
      const slot = option.firstElementChild;
      if (!slot || slot.dataset.svgFlag === locale) return;
      slot.innerHTML = flagSvg(locale, { size: 26 });
      slot.dataset.svgFlag = locale;
    });
  }

  /**
   * Writes a translation into an element, letter by letter, like a fairground sign
   * flipping over.
   *
   * Only worth doing where it can be seen and afforded, so three gates:
   *   - the element must be on screen, or nothing is animated at all;
   *   - the text must be short (headlines, labels, buttons), because splitting a
   *     paragraph into 300 spans and animating each one costs a layout per letter;
   *   - reduced motion switches the whole thing off.
   * Everything else gets a plain textContent write, which is what used to happen
   * everywhere. The surrounding fade in experience.css still covers those.
   *
   * The letters are plain spans with a staggered CSS animation and are replaced by
   * a flat string once it finishes, so the DOM does not slowly fill with wrappers
   * after a few language switches.
   */
  const LETTER_LIMIT = 46;

  /**
   * Only display copy is animated. Buttons, chips and dock labels are deliberately
   * excluded: they are narrow boxes, and a run of inline-block letters can break
   * across lines at any letter, so "ZAPISZ SIĘ" inside a 174 px button came apart
   * into stray characters. Restricting the effect to headings and intro copy
   * removes that whole class of bug instead of patching each control.
   */
  const FLIP_SELECTOR = [
    '.hero__title', '.hero__tagline', '.section-title', '.eyebrow',
    '.stack-card h3', '.prize-card h3', '.form-step h3', '.modal h2',
    '.attendance__title', '.attendance__label', '.footer__brand',
    '.g3d__caption', '.story-number span', '.schedule-row strong'
  ].join(',');

  /**
   * Które napisy były na ekranie, gdy zaczynało się tłumaczenie.
   * ===========================================================================
   * WSZYSTKIE ODCZYTY PRZED PIERWSZYM ZAPISEM — I TO JEST NAJWIĘKSZA CZĘŚĆ NAPRAWY
   * ZACINANIA SIĘ PRZY ZMIANIE JĘZYKA.
   *
   * `setTranslatedText` pytał o `getBoundingClientRect()` KAŻDEGO elementu, w pętli, w której
   * co drugi krok był zapisem (`replaceChildren` z setką nowych `<span>`). Odczyt położenia po
   * zapisie zmusza przeglądarkę do przeliczenia układu, zanim odda liczbę — a tu takich par
   * jest 354, na dokumencie o trzynastu tysiącach pikseli i czternastu przypiętych panelach.
   * To jest layout thrashing w czystej postaci, ten sam wzorzec, który ma już własny akapit
   * przy `measure()` w setupPanels i przy `updateCardStack`.
   *
   * Zmierzone na 390x844 przy dławieniu CPU 4x: `getBoundingClientRect` zjadał 229 ms jednego
   * kliknięcia w zmianę języka.
   *
   * Teraz widoczność rozstrzyga się RAZ, przed tłumaczeniem: jeden przebieg samych odczytów,
   * czyli jedno przeliczenie układu zamiast trzystu pięćdziesięciu. Zbiór jest ważny tylko na
   * czas jednego przełączenia — po nim wraca `null`, więc pojedyncze późniejsze wywołanie
   * (a takich jest kilka, przy odświeżaniu etykiet) mierzy się samo, jak dotąd.
   */
  let flipVisible = null;

  function markVisibleForFlip() {
    const height = window.innerHeight;
    const seen = new WeakSet();
    for (const element of $$('[data-i18n]')) {
      if (!element.matches(FLIP_SELECTOR)) continue;
      const box = element.getBoundingClientRect();
      if (box.bottom > 0 && box.top < height && box.width > 0) seen.add(element);
    }
    flipVisible = seen;
  }

  function setTranslatedText(element, value) {
    if (element.textContent === value) return;

    if (reducedMotion || value.length > LETTER_LIMIT || !element.isConnected
      || !element.matches(FLIP_SELECTOR)) {
      element.textContent = value;
      return;
    }
    /* Z gotowego zbioru, gdy trwa przełączanie języka; własnym pomiarem, gdy to pojedyncze
       wywołanie spoza tamtej pętli. */
    let onScreen;
    if (flipVisible) {
      onScreen = flipVisible.has(element);
    } else {
      const box = element.getBoundingClientRect();
      onScreen = box.bottom > 0 && box.top < window.innerHeight && box.width > 0;
    }
    if (!onScreen) {
      element.textContent = value;
      return;
    }

    /**
     * Two levels of wrapper. The outer one holds a whole word and is the only
     * thing a line break is allowed to happen between; the inner ones are the
     * letters. Without the word wrapper every letter is its own inline-level box
     * and the browser will happily break a word in half.
     */
    const fragment = document.createDocumentFragment();
    let index = 0;
    const words = value.split(' ');

    words.forEach((word, wordIndex) => {
      if (wordIndex > 0) fragment.appendChild(document.createTextNode(' '));
      if (!word) return;
      const wrapper = document.createElement('span');
      wrapper.className = 'flip-word';
      for (const character of word) {
        const span = document.createElement('span');
        span.className = 'flip-letter';
        span.textContent = character;
        // Capped so even the longest allowed string finishes inside half a second.
        span.style.animationDelay = `${Math.min(index * 22, 420)}ms`;
        wrapper.appendChild(span);
        index += 1;
      }
      fragment.appendChild(wrapper);
    });

    element.replaceChildren(fragment);
    window.clearTimeout(element._flipTimer);
    element._flipTimer = window.setTimeout(() => {
      // Flatten back to a plain string so repeated switches cannot leave the DOM
      // full of wrappers. Skipped if something else has rewritten the element.
      if (element.textContent === value) element.textContent = value;
    }, Math.min(index * 22, 420) + 460);
  }

  /** Holds the last scroll position the header peek logic reacted to. */
  function updateHeaderPeek() {}

  /**
   * Shrinks any heading whose text does not fit its own box until it does.
   *
   * Why this is done by measurement rather than by CSS. At 1440 px, thirteen
   * headings held a single word wider than the box it had to live in — CARRULEDDHI
   * needed 812 px of a 707 px column, "Najzabawniejszy" 355 px of about 250. With
   * `hyphens: auto` the browser broke them mid-word, which is what produced
   * "CARRULED-DHI". Turning hyphenation off alone just converts a broken word into
   * an overflowing one.
   *
   * A CSS answer needs one multiplier per heading per container, and the container
   * is often a grid cell far narrower than any element that can be named. Six
   * languages and a fluid layout multiply that out into something nobody will keep
   * correct. Measuring is exact and self-maintaining: read the base size once, then
   * scale it by how much room the text actually needs (see `fitMany`).
   *
   * Cost is a forced layout per probe, so it runs on load, on resize and on language
   * change — never on scroll.
   */
  const FIT_SELECTOR = [
    '.hero__title', '.hero__tagline', '.section-title',
    '.stack-card h3', '.prize-card h3', '.form-step h3', '.modal h2',
    '.g3d__heading', '.attendance__title', '.footer__brand', '.wall-note__text'
  ].join(',');

  /**
   * Kolejka nagłówków do dopasowania, opróżniana raz na klatkę.
   * ===========================================================================
   * Obserwatory rozmiaru i widoczności przynoszą nagłówki POJEDYNCZO, a przy zmianie języka
   * przynoszą ich kilkadziesiąt w jednej chwili: zmienia się każdy napis, więc zmienia się
   * wysokość wszystkiego, więc wszystko przesuwa się przez próg widoczności naraz.
   *
   * Dopasowanie każdego z osobna to zapis `font-size`, po którym natychmiast pada pytanie o
   * `scrollWidth` — a takie pytanie zmusza przeglądarkę do PRZELICZENIA STYLÓW CAŁEGO
   * DOKUMENTU, zanim odpowie. Zmierzone na 390x844 przy dławieniu CPU 4x: jedno kliknięcie
   * w przełącznik języka wywoływało 108 przeliczeń stylów i 1100 ms samego przeliczania,
   * przy zaledwie 313 ms właściwego układania. Przeliczeń, nie układania — to była ta zwłoka.
   *
   * Zebrane w paczkę i puszczone raz na klatkę liczą się tyle razy, ile jest rund bisekcji,
   * a nie tyle razy ile rund razy nagłówków.
   */
  const fitQueue = new Set();
  let fitFrame = 0;

  function fitLater(element) {
    fitQueue.add(element);
    if (fitFrame) return;
    fitFrame = requestAnimationFrame(() => {
      fitFrame = 0;
      const batch = [...fitQueue];
      fitQueue.clear();
      fitMany(batch);
    });
  }

  /**
   * Dopasowuje paczkę nagłówków. Zawsze mierzy — bez skrótów.
   *
   * Wcześniejsza wersja pomijała element, którego pudełko nie zmieniło szerokości od ostatniego
   * przebiegu. Wyglądało to na rozsądną oszczędność i było błędem: szerokość TREŚCI zmienia się
   * i wtedy, gdy pudełko stoi w miejscu. Kiedy doszedł webfont, szersze glify Bungee wypchnęły
   * "Carruleddhi Classic" 139 px poza jego pudełko — a pudełko miało tę samą szerokość co
   * przedtem, więc skrót je przepuścił.
   *
   * Pomiar idzie WSZERZ, nie w głąb: najpierw wszystkie zapisy jednej rundy, potem wszystkie
   * odczyty tej rundy. Każdy nagłówek dostaje swój własny rozmiar, dokładnie taki jak przy
   * dopasowywaniu pojedynczo — różnica jest wyłącznie w liczbie przeliczeń stylów, patrz
   * komentarz przy `fitLater` i przy samym liczeniu rozmiaru niżej.
   */
  function fitMany(elements) {
    // Rozmiar, którego chcą style, zapamiętywany raz, żeby kolejne przebiegi nie schodziły
    // coraz niżej. Zdjęcie inline'a i odczyt rozdzielone, by `getComputedStyle` nie przeplatał
    // się z zapisami.
    const fresh = elements.filter((element) => !element.dataset.fitBase);
    for (const element of fresh) element.style.removeProperty('font-size');
    for (const element of fresh) {
      element.dataset.fitBase = String(parseFloat(getComputedStyle(element).fontSize) || 0);
    }

    // Nagłówki bez pudełka są pomijane — jeszcze się nie ułożyły, każda ich miara byłaby
    // zmyślona. Odczyt idzie przed jakimkolwiek zapisem rozmiaru.
    const jobs = [];
    for (const element of elements) {
      const base = Number(element.dataset.fitBase);
      if (base && element.clientWidth >= 8) jobs.push({ element, low: base * 0.45, high: base, size: base });
    }
    if (!jobs.length) return;

    for (const job of jobs) job.element.style.fontSize = `${job.high}px`;

    /* PROPORCJA ZAMIAST POŁOWIENIA.
       ---------------------------------------------------------------------------
       Wcześniej szło tu osiem rund bisekcji między 45% a 100% rozmiaru ze stylów. Każda runda
       to zapis `font-size` i zaraz potem odczyt `scrollWidth`, czyli osiem wymuszonych
       przeliczeń stylu i układu — na jeden nagłówek. Zmierzone na 390x844 przy dławieniu CPU
       4x: przy zmianie języka jeden zbyt szeroki nagłówek kosztował 158 ms, w ośmiu parach po
       9 ms przeliczenia i 13 ms układania.

       Szerokość jednej linijki tekstu jest wprost proporcjonalna do rozmiaru czcionki, więc
       odpowiedzi nie trzeba szukać po omacku — wystarczy ją policzyć: rozmiar razy stosunek
       miejsca, które jest, do miejsca, które napis zajmuje. Mnożnik 0.995 zostawia pół procent
       zapasu na zaokrąglenia i kerning.

       Dwie rundy sprawdzające są dla przypadków, w których proporcja nie trzyma: łamanie
       wyrazów, `text-transform`, odstępy między literami. Każda schodzi o 3%. Razem najwyżej
       cztery przeliczenia zamiast dziewięciu, a w typowym przypadku trzy.

       Dolne 45% zostaje bez zmian: napis patologicznie długi ma zrobić się mały, a nie po
       cichu nieczytelny. */
    const tight = [];
    for (const job of jobs) {
      const room = job.element.clientWidth + 1;
      const need = job.element.scrollWidth;
      if (need <= room) continue;
      job.size = Math.max(job.low, job.high * (room / need) * 0.995);
      tight.push(job);
    }
    if (!tight.length) return;

    let left = tight;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      for (const job of left) job.element.style.fontSize = `${job.size.toFixed(2)}px`;
      if (attempt === 2) break;

      const again = [];
      for (const job of left) {
        if (job.element.scrollWidth <= job.element.clientWidth + 1) continue;
        if (job.size <= job.low + 0.01) continue;
        job.size = Math.max(job.low, job.size * 0.97);
        again.push(job);
      }
      if (!again.length) break;
      left = again;
    }
  }

  function fitHeadings() {
    fitMany($$(FIT_SELECTOR));
  }

  function setupHeadingFit() {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fitHeadings);
    };

    /**
     * A ResizeObserver on each heading rather than only window resize.
     *
     * Several of these live inside things that change size after the page has
     * settled — the card stack measures itself, the prize deck lays itself out, the
     * gallery pins. Fitting once on load left those headings at full size and
     * overflowing by up to 263 px, because at the moment they were measured their
     * boxes were still the wrong width.
     */
    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          // Setting font-size changes the element's height, which fires this
          // observer again. Acting only when the inline size actually moved is what
          // stops that becoming an endless loop.
          const width = Math.round(entry.contentRect.width);
          if (entry.target.dataset.fitWidth === String(width)) continue;
          entry.target.dataset.fitWidth = String(width);
          fitLater(entry.target);
        }
      });
      $$(FIT_SELECTOR).forEach((element) => observer.observe(element));
    }

    /**
     * And once more when the heading actually comes into view.
     *
     * Everything above measures headings that may be several screens away, inside
     * sections that have not been laid out the way they will be when you get there —
     * the card stack scales its cards, the prize deck stacks them, the gallery pins.
     * Measured early, "Carruleddhi Classic" reported as fitting and was left at its
     * full 76 px; by the time it was on screen it was 139 px too wide. Intersection
     * is the one moment the box is guaranteed to be real.
     */
    if ('IntersectionObserver' in window) {
      const seen = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          fitLater(entry.target);
        }
      }, { rootMargin: '200px 0px' });
      $$(FIT_SELECTOR).forEach((element) => seen.observe(element));
    }

    schedule();
    // The webfont changes every measurement, so this has to run again once it lands.
    document.fonts?.ready?.then(schedule).catch(() => {});

    /* ONLY WHEN THE WINDOW GOT WIDER OR NARROWER, NOT WHEN IT GOT SHORTER.
       ---------------------------------------------------------------------------
       `fitHeadings()` walks every heading on the page, writes `font-size` and reads
       `scrollWidth` back — a forced style recalculation and layout per pass. That is fine as
       an answer to "the column is a different width now".
       It is not fine as an answer to a phone's address bar, which fires `resize` every time
       the reader changes direction and does not change any heading's width by a single pixel.
       Measured at 4x CPU throttling it was about 90 ms of the work a `resize` did, spent to
       arrive at exactly the font sizes already on screen.

       Nothing is lost by the gate. A heading whose box changes width for any other reason —
       the card stack settling, the deck laying out, a section switching between pinned and
       flow — is caught by the per-heading ResizeObserver above, which is the more precise
       instrument anyway: it knows which heading moved, and it already ignores a change that
       is not a change of inline size. The window listener only ever added the case where
       every heading moves at once, and that is a width change.

       `orientationchange` is not gated the same way: on some devices it arrives before the
       new width is readable, so it always schedules and refreshes the remembered width after
       the frame. */
    let fitWidth = window.innerWidth;
    window.addEventListener('resize', () => {
      const width = window.innerWidth;
      if (width === fitWidth) return;
      fitWidth = width;
      schedule();
    }, { passive: true });
    window.addEventListener('orientationchange', () => {
      schedule();
      requestAnimationFrame(() => { fitWidth = window.innerWidth; });
    }, { passive: true });
    // New text, new widths: everything has to be measured again.
    window.addEventListener('carruleddhi:language', schedule);
  }

  function applyLanguage(language, persist = true) {
    const available = Object.keys(window.CARRULEDDHI_I18N || {});
    const lang = available.includes(language) ? language : 'it';
    state.lang = lang;
    const dict = dictionary();

    /* Przelot po znacznikach jest wspólny z podstroną głosowania; różni się tylko sposób
       wpisania napisu. Tu z przelotem liter (`setTranslatedText`), tam zwykłym podstawieniem —
       na podstronie nie ma efektów tekstowych, bo nie ma nagłówków, które by je nosiły. */
    /* Jeden przebieg odczytów przed pierwszym zapisem — patrz markVisibleForFlip(). Zbiór
       zwalniany zaraz po, żeby pojedyncze późniejsze wywołania mierzyły się same. */
    markVisibleForFlip();
    translateDom(dict, { setText: setTranslatedText });
    flipVisible = null;

    document.documentElement.lang = lang;
    /* Tytuł karty i `meta[name=description]` ustawia teraz `applyPublicConfig` na końcu tej
       funkcji, bo oba napisy zawierają znaczniki `%DATE%`/`%EVENT%`/`%PLACE%` i muszą być
       złożone PO podstawieniu. Wpisywanie tu surowego `dict['meta.title']` dawało tytuł karty
       „%EVENT% — %PLACE%" — czyli wzorzec zamiast nazwy. */

    const metadata = languageMeta[lang] || languageMeta.it;
    const languageTrigger = $('[data-language-trigger]');
    const languageFlag = $('[data-language-flag]');
    const languageCode = $('[data-language-code]');
    if (languageFlag) languageFlag.innerHTML = flagSvg(lang, { size: 26 });
    if (languageCode) languageCode.textContent = metadata.code;
    paintFlags();
    if (languageTrigger) languageTrigger.setAttribute('aria-label', `Lingua / Language: ${metadata.name}`);
    $$('[data-language-option]').forEach((option) => {
      const selected = option.dataset.languageOption === lang;
      option.setAttribute('aria-selected', String(selected));
      option.tabIndex = selected ? 0 : -1;
    });

    const menuToggle = $('[data-menu-toggle]');
    if (menuToggle) menuToggle.setAttribute('aria-label', dict['a11y.menu'] || 'Menu');

    $$('a[href^="privacy.html"], a[href^="cookies.html"], a[href^="regolamento.html"]').forEach((link) => {
      const base = link.getAttribute('href').split('?')[0];
      link.setAttribute('href', `${base}?lang=${lang}`);
    });

    if (persist) storage.set('carruleddhi.lang', lang);
    refreshAttendanceLabels();
    applyPublicConfig();
    window.dispatchEvent(new CustomEvent('carruleddhi:language', { detail: { lang } }));
  }

  function setupLanguage() {
    const picker = $('[data-language-picker]');
    const trigger = $('[data-language-trigger]');
    const menu = $('[data-language-menu]');
    const options = $$('[data-language-option]', menu || document);
    const browserLanguage = (navigator.language || 'it').slice(0, 2).toLowerCase();
    const saved = storage.get('carruleddhi.lang');
    let transitionTimer = 0;

    applyLanguage(saved || browserLanguage, false);
    if (!picker || !trigger || !menu || !options.length) return;
    menu.inert = true;

    function setPickerOpen(open, moveFocus = false) {
      picker.classList.toggle('is-open', open);
      menu.classList.toggle('is-open', open);
      trigger.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-hidden', String(!open));
      menu.inert = !open;
      if (open && moveFocus) {
        const selected = $('[aria-selected="true"]', menu) || options[0];
        requestAnimationFrame(() => selected?.focus({ preventScroll: true }));
      } else if (!open && moveFocus) {
        trigger.focus({ preventScroll: true });
      }
    }

    function focusOption(index) {
      const target = options[(index + options.length) % options.length];
      options.forEach((option) => { option.tabIndex = option === target ? 0 : -1; });
      target?.focus({ preventScroll: true });
    }

    /**
     * Applied immediately, on purpose.
     *
     * This used to blur and fade the whole page out for 180 ms, swap the text, then
     * fade back. That reads as a loading state, and it hid the thing worth
     * watching: setTranslatedText now flips every short string letter by letter,
     * and a blurred, half-transparent parent makes that invisible. The letters are
     * the transition, so the curtain in front of them is gone.
     *
     * `is-language-transitioning` stays on the body for one frame because the
     * mobile menu and the section chip hang their own timing off it.
     */
    function changeLanguage(lang) {
      if (!languageMeta[lang] || lang === state.lang) return;
      window.clearTimeout(transitionTimer);
      document.body.classList.add('is-language-transitioning');
      document.body.setAttribute('aria-busy', 'true');
      applyLanguage(lang);
      transitionTimer = window.setTimeout(() => {
        document.body.classList.remove('is-language-transitioning');
        document.body.removeAttribute('aria-busy');
      }, reducedMotion ? 0 : 620);
    }

    /**
     * A touchscreen has no hover, so the collapsed header needed a way in. Tapping
     * the brand opens the pill out to the full bar for a few seconds. Only the
     * brand: the menu button and the language picker keep their own jobs.
     */
    const header = $('.site-header');
    const brand = $('.site-header .brand');
    if (header && brand) {
      let peekTimer = 0;
      brand.addEventListener('click', (event) => {
        if (!header.classList.contains('is-compact')) return;
        // The brand is a link to the top of the page; the first tap opens the bar
        // instead, which is the less destructive of the two meanings.
        event.preventDefault();
        header.classList.add('is-peeked');
        window.clearTimeout(peekTimer);
        peekTimer = window.setTimeout(() => header.classList.remove('is-peeked'), 4200);
      });
      window.addEventListener('scroll', () => {
        if (header.classList.contains('is-peeked')) {
          window.clearTimeout(peekTimer);
          peekTimer = window.setTimeout(() => header.classList.remove('is-peeked'), 900);
        }
      }, { passive: true });
    }

    trigger.addEventListener('click', () => {
      const open = !picker.classList.contains('is-open');
      setPickerOpen(open, open);
    });
    trigger.addEventListener('keydown', (event) => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      setPickerOpen(true);
      const selectedIndex = Math.max(0, options.findIndex((option) => option.getAttribute('aria-selected') === 'true'));
      const targetIndex = event.key === 'ArrowUp' || event.key === 'End'
        ? options.length - 1
        : event.key === 'Home' ? 0 : selectedIndex;
      window.setTimeout(() => focusOption(targetIndex), 0);
    });
    menu.addEventListener('click', (event) => {
      const option = event.target.closest('[data-language-option]');
      if (!option) return;
      changeLanguage(option.dataset.languageOption);
      /* Fokus wraca na przycisk W NASTĘPNEJ KLATCE, nie natychmiast.
         ---------------------------------------------------------------------------
         `changeLanguage()` przed chwilą wymieniło tekst w 354 elementach, wstawiając w
         kilkadziesiąt z nich po kilkanaście `<span>` z animacją. `focus()` wywołane zaraz po
         tym musi PRZELICZYĆ CAŁY ten układ synchronicznie, zanim ustawi ognisko — przeglądarka
         nie ma jak go ustawić, nie wiedząc, gdzie co leży.

         Zmierzone na 390x844 przy dławieniu CPU 4x: samo `focus` kosztowało 508 ms, czyli
         więcej niż jakakolwiek inna pojedyncza rzecz w tym kliknięciu. Przełożone o klatkę
         trafia na układ, który przeglądarka i tak już policzyła — dla niej samej, raz.

         Ognisko musi wrócić, nie jest opcjonalne: lista dostaje `inert`, więc zostawione
         w niej byłoby ogniskiem na elemencie wyjętym z obsługi klawiatury. */
      requestAnimationFrame(() => setPickerOpen(false, true));
    });
    menu.addEventListener('keydown', (event) => {
      const current = Math.max(0, options.indexOf(document.activeElement));
      if (event.key === 'ArrowDown') { event.preventDefault(); focusOption(current + 1); }
      if (event.key === 'ArrowUp') { event.preventDefault(); focusOption(current - 1); }
      if (event.key === 'Home') { event.preventDefault(); focusOption(0); }
      if (event.key === 'End') { event.preventDefault(); focusOption(options.length - 1); }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        setPickerOpen(false, true);
      }
      if (event.key === 'Tab') setPickerOpen(false);
    });
    document.addEventListener('pointerdown', (event) => {
      if (!picker.contains(event.target)) setPickerOpen(false);
    });
    window.addEventListener('blur', () => setPickerOpen(false));
  }

  /**
   * Intro overlay.
   *
   * It must never be able to trap the page. Three independent safeguards:
   *  1. the fill bar is a CSS animation, so a throttled or stalled
   *     requestAnimationFrame cannot freeze the progress;
   *  2. a watchdog timer dismisses the overlay even if this function is
   *     interrupted halfway through;
   *  3. `assets/css/experience.css` hides the overlay with a pure CSS animation,
   *     so the page stays usable even when JavaScript never runs at all
   *     (opening the file over file:// blocks ES modules, for example).
   */
  function setupPreloader() {
    const preloader = $('[data-preloader]');
    if (!preloader) return;
    const skipIntro = new URLSearchParams(window.location.search).has('skipIntro');

    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      preloader.classList.add('is-done');
      document.body.classList.remove('is-locked');
      // Take it out of the layout for good: relying on a delayed visibility
      // transition left the overlay hit-testable on slow paints.
      window.setTimeout(() => { preloader.hidden = true; }, reducedMotion ? 0 : 900);
    };

    if (reducedMotion || skipIntro) {
      preloader.hidden = true;
      document.body.classList.remove('is-locked');
      return;
    }

    /* How long this lasts is now decided by the page, not by a constant.
       ---------------------------------------------------------------------------
       It used to be a flat 1250 ms. That is wrong in both directions: on a warm cache the
       page was ready in 200 ms and the visitor watched a progress bar for a second with
       nothing loading behind it, and on a cold 3G load the overlay left at 1250 ms onto a
       page still missing its fonts and its hero image — which is the worse of the two,
       because the first thing you see is the layout settling.

       So: the bar tracks real progress, and the overlay leaves when `window.load` fires.

       MIN and MAX are the two guards that make that safe.
         MIN  A load that finishes in 150 ms would otherwise flash the overlay on and off,
              which reads as a glitch rather than as speed. Below this it is not worth
              having shown it at all, so it stays for a moment.
         MAX  `load` waits for every image, and one stalled request from a third party can
              hold it for half a minute. Past this point the page is usable and waiting for
              the last byte is no longer honest. */
    const MIN = 650;
    const MAX = 6000;
    document.body.classList.add('is-locked');
    preloader.classList.add('is-running');

    // Hard stop: whatever happens, the overlay is gone by this point.
    const watchdog = window.setTimeout(dismiss, MAX + 400);

    /**
     * The bar and the number, from one clock.
     *
     * WHY THIS IS HERE AT ALL
     *   The bar was not moving. Three stylesheets had an opinion about it and none of them
     *   won cleanly: main.css sets `width: 0` and a width transition, expecting JavaScript
     *   to drive it; experience.css declares a `preloader-fill` keyframe animation instead;
     *   carnival.css repaints the background. Nothing in JavaScript ever touched the width,
     *   so whether anything moved depended on which rule survived the cascade — and the
     *   number counted up beside a bar that sat still.
     *
     *   One writer now. The keyframe animation is gone from experience.css and this loop
     *   sets both values from the same elapsed time, so they cannot disagree.
     *
     * rAF, not setInterval
     *   A 40 ms interval paints at whatever moment it fires, which is not when the browser
     *   is about to draw — on a busy first load that shows as a bar that jumps in steps.
     *   requestAnimationFrame is one write per frame, in the frame.
     */
    const number = $('[data-preloader-number]', preloader);
    const bar = $('[data-preloader-bar]', preloader);
    const started = performance.now();

    /* Ready means: the browser fired `load`, or we ran out of patience.
       Written as a promise-free flag because this has to work when `load` already happened
       before this script ran — a cached page can reach `readyState === 'complete'` before
       a deferred module executes, and an event listener added after the event never fires.
       That is the whole bug class the earlier fixed timer was quietly hiding. */
    let ready = document.readyState === 'complete';
    let readyAt = ready ? started : 0;
    const markReady = () => {
      if (ready) return;
      ready = true;
      readyAt = performance.now();
    };
    window.addEventListener('load', markReady, { once: true });
    window.setTimeout(markReady, MAX);

    /**
     * One loop drives the bar, the number and the dismissal.
     *
     * WHY THE BAR CANNOT SIMPLY SHOW ELAPSED TIME
     *   The honest number — bytes loaded — is not available to a page about itself. So the
     *   bar does what every progress bar without a total does: it approaches a ceiling it
     *   never reaches on its own. `1 - 1/(1 + t)` climbs quickly, then crawls, and sits
     *   just under 90% however long the load takes. It cannot reach 100 by waiting, which
     *   means it can never claim to be finished while the page is still loading.
     *
     *   When `load` arrives, the remaining distance is covered in 260 ms. That jump to 100
     *   is the part that reads as "done", and it is the only part that is telling the truth
     *   about anything.
     *
     * rAF, not setInterval
     *   A 40 ms interval paints whenever it fires, which is not when the browser is about
     *   to draw — on a busy first load that shows as a bar moving in steps.
     */
    // Approaches 0.9 and never gets there. 900 ms is the half-life-ish scale: about 47% by
    // then, ~64% at two seconds, still short of 90% at ten.
    const creep = (ms) => 0.9 * (1 - 1 / (Math.max(ms, 0) / 900 + 1));

    const step = (now) => {
      if (dismissed) {
        // Reached when the watchdog dismissed the overlay instead of this loop. Without it
        // the interval below would keep firing for the rest of the visit.
        window.clearInterval(ticker);
        return;
      }
      const elapsed = now - started;

      let value;
      if (ready) {
        // Where the creeping curve had got to when `load` landed, then a fast run to 1.
        const atReady = creep(readyAt - started);
        value = atReady + (1 - atReady) * clamp((now - readyAt) / 260, 0, 1);
      } else {
        value = creep(elapsed);
      }

      value = clamp(value, 0, 1);
      if (bar) bar.style.width = `${(value * 100).toFixed(1)}%`;
      if (number) number.textContent = String(Math.round(value * 100)).padStart(2, '0');

      // Gone once the bar has actually arrived and the overlay has been up long enough to
      // have been seen. Both conditions, so a fast load still gets a beat and a slow one
      // is not cut off mid-bar.
      if (value >= 1 && elapsed >= MIN) {
        window.clearTimeout(watchdog);
        window.clearInterval(ticker);
        dismiss();
        return;
      }
      requestAnimationFrame(step);
    };

    /* A timer running the same step function, as the path of last resort.
       ---------------------------------------------------------------------------
       This is a progress bar for a page that is loading, so the frames it needs are exactly
       the frames the load is competing for. On a heavy first paint requestAnimationFrame can
       be deferred for hundreds of milliseconds at a time, and a bar that only advances on
       frames then sits still through the part of the load it exists to describe — measured at
       a flat 0% in headless Chrome, where frames are starved hardest.
       
       50 ms is deliberately coarse. When frames are arriving this does nothing visible
       (step() is idempotent — it derives everything from the clock, so being called twice in
       a frame writes the same value twice). When they are not, it is the difference between a
       bar that moves and an overlay that only leaves on the watchdog. */
    const ticker = window.setInterval(() => step(performance.now()), 50);
    requestAnimationFrame(step);
  }

  function setupReveal() {
    const elements = $$('.reveal');
    if (reducedMotion || !('IntersectionObserver' in window)) {
      elements.forEach((element) => element.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -7% 0px' });
    elements.forEach((element) => observer.observe(element));
  }

  /* Dwa progi zwijania nagłówka, rozsunięte o 60 px — patrz komentarz przy ich użyciu
     w updateScroll(). Nazwane stałe, a nie liczby w warunku, bo jedna z nich występuje
     w dwóch miejscach i rozjechanie ich znaczyłoby pasek rozwijający się w innym punkcie
     niż ten, w którym gaśnie „peek". */
  const HEADER_COLLAPSE_Y = 150;
  const HEADER_EXPAND_Y = 90;

  function setupNavigation() {
    const header = $('[data-header]');
    const menuToggle = $('[data-menu-toggle]');
    const menu = $('[data-mobile-menu]');
    const backdrop = $('[data-menu-backdrop]');
    const currentLabel = $('[data-current-section]');
    const currentProgress = $('[data-nav-progress]');
    const sections = $$('main section[id]').filter((section) => !section.hidden);
    const labelKeys = {
      live: 'stream.cta',
      story: 'nav.race',
      categories: 'nav.categories',
      route: 'nav.route',
      schedule: 'nav.program',
      gallery: 'nav.gallery',
      prizes: 'nav.prizes',
      attendance: 'nav.attend',
      signup: 'nav.signup',
      faq: 'nav.faq',
      contact: 'nav.contact'
    };
    let currentSectionId = 'hero';
    let ticking = false;
    let menuFocusTimer = 0;

    function sectionName(id) {
      return id === 'hero' ? 'Carruleddhi' : text(labelKeys[id] || 'nav.race');
    }

    function setCurrentSection(id) {
      if (!id) return;
      currentSectionId = id;
      if (currentLabel) currentLabel.textContent = sectionName(id);
      /* NA SAMEJ GÓRZE CHIP SIĘ NIE POKAZUJE.
         ---------------------------------------------------------------------------
         W hero `sectionName()` zwraca „Carruleddhi", czyli dokładnie to, co stoi trzy
         centymetry w lewo w marce. Pasek czytał się wtedy „CARRULEDDHI · 0% · CARRULEDDHI"
         — ta sama nazwa dwa razy i procent, który na górze strony zawsze wynosi zero.
         Zgłoszone jako „brzydko wygląda".

         Chip istnieje, żeby powiedzieć „gdzie jesteś i ile zostało". Na górze nie ma jeszcze
         czego powiedzieć, więc go nie ma. Od pierwszej prawdziwej sekcji pojawia się sam.

         Atrybut na nagłówku, nie klasa na chipie: stan „gdzie jesteśmy" należy do paska, a
         chip ma już cztery reguły zmieniające jego szerokość między stanami i piąty warunek
         w tym samym miejscu byłby piątym miejscem do pomylenia. */
      header?.toggleAttribute('data-nav-at-top', id === 'hero');
      $$('[data-section-link]', menu || document).forEach((link) => {
        const active = link.dataset.sectionLink === id;
        link.classList.toggle('is-active', active);
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
    }

    function updateActiveSection() {
      const focusLine = window.innerHeight * 0.38;
      let active = sections[0]?.id || 'hero';
      sections.forEach((section) => {
        if (section.getBoundingClientRect().top <= focusLine) active = section.id;
      });
      if (active !== currentSectionId) setCurrentSection(active);
    }

    function menuBackgroundElements() {
      return $$('body > *').filter((element) => ![header, menu, backdrop].includes(element) && element.tagName !== 'SCRIPT');
    }

    function setMenuBackgroundInert(open) {
      menuBackgroundElements().forEach((element) => {
        if (open) {
          element.dataset.menuWasInert = String(element.inert);
          element.inert = true;
        } else if ('menuWasInert' in element.dataset) {
          element.inert = element.dataset.menuWasInert === 'true';
          delete element.dataset.menuWasInert;
        }
      });
    }

    function menuFocusable() {
      const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      return [header, menu]
        .filter(Boolean)
        .flatMap((root) => $$(selector, root))
        .filter((element) => !element.closest('[aria-hidden="true"]') && !element.closest('[inert]') && element.getClientRects().length > 0);
    }

    function setMenu(open, restoreFocus = true) {
      if (!menu || !menuToggle) return;
      window.clearTimeout(menuFocusTimer);
      menu.classList.toggle('is-open', open);
      menu.inert = !open;
      backdrop?.classList.toggle('is-open', open);
      header?.classList.toggle('is-menu-open', open);
      /* Ten sam próg co w updateScroll, i to ten „wejściowy": przy otwartym menu pasek jest
         rozwinięty, więc po zamknięciu obowiązuje warunek zwinięcia, nie utrzymania. Wpisana
         tu wcześniej liczba 120 nie należała już do żadnego z dwóch progów — zamknięcie menu
         na wysokości 100 px rozwijało pasek, a najbliższe przewinięcie natychmiast zwijało go
         z powrotem, bo dla logiki przewijania 100 jest wciąż „zwinięte". Kolejne mignięcie. */
      header?.classList.toggle('is-compact', !open && window.scrollY > HEADER_COLLAPSE_Y);
      menuToggle.classList.toggle('is-open', open);
      menuToggle.setAttribute('aria-expanded', String(open));
      menuToggle.setAttribute('aria-label', text(open ? 'a11y.close' : 'a11y.menu'));
      menu.setAttribute('aria-hidden', String(!open));
      document.body.classList.toggle('is-menu-open', open);
      document.body.classList.toggle('is-locked', open || Boolean($('.modal.is-open')));
      setMenuBackgroundInert(open);

      if (open) {
        const active = $(`[data-section-link="${currentSectionId}"]`, menu) || $('a', menu);
        menuFocusTimer = window.setTimeout(() => active?.focus({ preventScroll: true }), reducedMotion ? 0 : 240);
      } else if (restoreFocus || menu.contains(document.activeElement)) {
        menuToggle.focus({ preventScroll: true });
      }
    }

    function updateScroll() {
      const y = window.scrollY;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const ratio = clamp(y / max, 0, 1);
      const progress = $('[data-scroll-progress]');
      if (progress) progress.style.width = `${ratio * 100}%`;
      /* ILE ZOSTAŁO, CO PIĘĆ PROCENT — a nie ile przewinięto, co jeden.
         ---------------------------------------------------------------------------
         Dwie zmiany naraz, bo są tą samą zmianą. Licznik idący w dół odpowiada na pytanie,
         które ktoś zadaje w połowie długiej strony — „ile jeszcze" — a nie na to, które już
         sobie odpowiedział, patrząc gdzie jest.

         Skok co pięć procent zamiast co jeden ma drugie dno: przy kroku jednoprocentowym
         napis zmieniał się kilkadziesiąt razy na jedno przewinięcie ekranu, czyli migotał
         w kącie oka przez cały czas czytania. Co pięć procent zmienia się dwadzieścia razy
         na całą stronę i daje się przeczytać.

         Zapis tylko przy faktycznej zmianie. `updateScroll` chodzi w każdej klatce
         przewijania, a wpisanie tego samego napisu do `textContent` i tak unieważnia układ
         — teraz dzieje się to dwadzieścia razy na stronę, nie kilkaset. */
      if (currentProgress) {
        const left = Math.round((100 - ratio * 100) / 5) * 5;
        const label = `${String(left).padStart(2, '0')}%`;
        if (currentProgress.textContent !== label) currentProgress.textContent = label;
      }

      /**
       * Scrolling back up opens the header out again, the way it looks over the
       * hero, language picker included. There is no hover on a phone, so upward
       * movement is the gesture that means "I want the controls back". Removed as
       * soon as you head down again so it never covers what you are reading.
       */
      if (header) {
        // lastY has to be seeded on the very first call. Leaving it undefined made
        // `goingUp` compare y against y, which is never true, so the reference was
        // never written and the whole thing deadlocked at "not moving".
        if (updateHeaderPeek.lastY === undefined) updateHeaderPeek.lastY = y;
        /* 24 px w gore, nie 3.
           ---------------------------------------------------------------------------
           To jest połowa naprawy mignięcia „Będę tam". Komentarz w experience.css opisywał
           ten objaw i nazywał przyczynę: „przy najmniejszym ruchu kółkiem w górę (app.js
           dodaje `is-peeked` już przy 3 px) cała sekwencja szła od nowa w drugą stronę".
           Poprawiono wtedy czasy przejść, ale nie próg, który to wywołuje.

           Trzy piksele to nie gest, to drgnienie: gaśnięcie bezwładności po rzucie palcem,
           odbicie na końcu strony, mikroruch gładzika. Każde takie drgnienie rozwijało pasek
           i po 900 ms zwijało go z powrotem — czyli mignięcie.

           24 px to ruch, który ktoś wykonał świadomie. W dół nadal wystarczy 3 px, bo
           zamknięcie paska w reakcji na czytanie w dół jest tanie w skutkach i nikt go nie
           odbiera jako migotania. */
        const goingUp = y < updateHeaderPeek.lastY - 24;
        const goingDown = y > updateHeaderPeek.lastY + 3;
        if (goingUp) header.classList.add('is-peeked');
        else if (goingDown || y < HEADER_EXPAND_Y) header.classList.remove('is-peeked');
        if (goingUp || goingDown) updateHeaderPeek.lastY = y;
      }

      /* Histereza na zwijaniu paska — druga połowa naprawy mignięcia.
         ---------------------------------------------------------------------------
         Stał tu jeden próg: `y > 120`. Jeden próg znaczy, że pozycja przewinięcia oscylująca
         wokół niego przełącza stan tyle razy, ile razy go przekroczy — a wokół 120 px kręci
         się każdy, kto zatrzymał się chwilę po zejściu z hero, i każde gaśnięcie bezwładności
         po rzucie palcem. Za każdym przełączeniem „Będę tam" gra pełną animację pojawienia
         się albo zniknięcia (0,42 s), więc jedna oscylacja to jedno widoczne mignięcie.

         Dwa progi rozsunięte o 60 px: pasek zwija się po przekroczeniu 150 i rozwija dopiero
         poniżej 90. Między nimi zostaje w stanie, w którym jest. To ta sama konstrukcja co w
         termostacie i z tego samego powodu: żeby nie klekotał na granicy. */
      const wasCompact = header?.classList.contains('is-compact');
      const compactWanted = y > (wasCompact ? HEADER_EXPAND_Y : HEADER_COLLAPSE_Y);
      header?.classList.toggle('is-compact', compactWanted && !menu?.classList.contains('is-open'));
      updateActiveSection();
      updateCardStack();
      ticking = false;
    }

    /* Once per frame, with a timer for the frames that do not come.
       ---------------------------------------------------------------------------
       Same shape as the route zoom and the panel measurement, and here for the same reason:
       `ticking` stays raised if the callback is starved, and then every later scroll is
       discarded. This handler carries the reading progress bar, the compact header, the
       active menu item and the card stack, so a starved frame does not just drop an
       animation — it leaves the header expanded over the page and the wrong section
       highlighted, and it stays that way because the flag is never lowered.

       Measured in headless Chrome, where frames are starved hardest: the header never
       compacted at all. A phone with a busy main thread on first load is the same situation,
       less severely. */
    let tickFallback = 0;
    const runScroll = () => {
      window.clearTimeout(tickFallback);
      updateScroll();
    };
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(runScroll);
      tickFallback = window.setTimeout(runScroll, 100);
    }, { passive: true });

    menuToggle?.addEventListener('click', () => setMenu(!menu.classList.contains('is-open')));
    backdrop?.addEventListener('click', () => setMenu(false));
    $$('a[href^="#"]', menu || document).forEach((link) => link.addEventListener('click', () => setMenu(false, false)));
    $$('[data-open-reminder]', menu || document).forEach((button) => button.addEventListener('click', () => setMenu(false, false)));
    document.addEventListener('keydown', (event) => {
      if (!menu?.classList.contains('is-open')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenu(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = menuFocusable();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !focusable.includes(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !focusable.includes(active))) {
        event.preventDefault();
        first.focus();
      }
    });
    window.addEventListener('carruleddhi:language', () => {
      if (currentLabel) currentLabel.textContent = sectionName(currentSectionId);
      menuToggle?.setAttribute('aria-label', text(menu?.classList.contains('is-open') ? 'a11y.close' : 'a11y.menu'));
    });

    if (menu) menu.inert = true;
    setCurrentSection('hero');
    updateScroll();
  }

  /**
   * Card stack metrics.
   *
   * getComputedStyle forces a style recalculation, so it must never run inside the
   * scroll loop. These values only change on resize, so they are cached here and
   * refreshed from setupCardStack().
   */
  const stackMetrics = { top: 96, gap: 16, sticky: false, influence: 420 };

  function measureCardStack() {
    const cards = $$('.stack-card');
    if (!cards.length) return;
    const first = getComputedStyle(cards[0]);
    stackMetrics.sticky = first.position === 'sticky';
    stackMetrics.top = Number.parseFloat(first.top) || 96;
    const secondTop = cards[1] ? Number.parseFloat(getComputedStyle(cards[1]).top) : NaN;
    stackMetrics.gap = Number.isFinite(secondTop) ? Math.max(4, secondTop - stackMetrics.top) : 16;
    stackMetrics.influence = Math.max(240, Math.min(window.innerHeight * 0.62, 560));
  }

  function updateCardStack() {
    const stack = $('[data-card-stack]');
    const cards = $$('.stack-card', stack || document);
    if (!stack || !cards.length) return;

    if (reducedMotion || !stackMetrics.sticky) {
      cards.forEach((card) => {
        card.style.removeProperty('transform');
        card.style.removeProperty('filter');
        card.classList.remove('is-covered', 'is-active-stack-card');
      });
      return;
    }

    const { top: stickyTop, gap: stickyGap, influence } = stackMetrics;
    // Read every rect first, write afterwards: interleaving reads and writes
    // forces a layout on each card and is what made the stack stutter.
    const tops = cards.map((card) => card.getBoundingClientRect().top);
    let activeIndex = 0;

    cards.forEach((card, index) => {
      const cardTop = stickyTop + index * stickyGap;
      if (tops[index] <= cardTop + stickyGap) activeIndex = index;
      if (index === cards.length - 1) {
        card.style.transform = 'translate3d(0,0,0) scale(1)';
        card.style.removeProperty('filter');
        card.classList.remove('is-covered');
        return;
      }
      const progress = clamp((cardTop + influence - tops[index + 1]) / influence, 0, 1);
      const eased = progress * progress * (3 - 2 * progress);
      // Only transform and brightness: an animated blur on a card this large
      // repaints the whole layer every frame and drops the framerate.
      card.style.transform = `translate3d(0,${(-eased * 12).toFixed(2)}px,0) scale(${(1 - eased * 0.085).toFixed(4)})`;
      /* PRZYCIEMNIANIE TYLKO TAM, GDZIE JEST NA NIE MOC.
         ---------------------------------------------------------------------------
         `transform` składa się na GPU: przeglądarka bierze gotową teksturę warstwy i przesuwa
         ją, nie rysując zawartości od nowa. `filter` tego nie robi. Każda zmiana wartości to
         przebieg filtra po CAŁEJ warstwie karty, a karta ma tu wysokość niemal ekranu. Dwanaście
         kart razy jeden przebieg na klatkę.

         Do tego samo ISTNIENIE `filter` — nawet przy `brightness(1)` — wymusza dla elementu
         osobną warstwę kompozytora z własną teksturą. Dwanaście przypiętych kart wysokości
         ekranu to dwanaście takich tekstur trzymanych w pamięci graficznej przez cały czas, obok
         czternastu warstw sekcji. To jest ten sam rachunek, z którego wypisano `backdrop-filter`
         poniżej 760 px (blok w carnival.css) — i ta sama odpowiedź.

         Głębia na telefonie zostaje, tylko robi ją co innego: `transform` powyżej nadal cofa i
         zmniejsza kartę, a klasa `is-covered` niżej przestawia jej cień na płaski. Ubytkiem jest
         samo ściemnienie o 26%.

         Na pulpicie nic się nie zmienia. `filter` jest tam widoczną częścią efektu i nie ma
         powodu go zabierać. */
      if (touchScreen) card.style.removeProperty('filter');
      else card.style.filter = `brightness(${(1 - eased * 0.26).toFixed(3)})`;
      card.classList.toggle('is-covered', progress > 0.15);
    });

    cards.forEach((card, index) => {
      card.classList.toggle('is-active-stack-card', index === activeIndex);
      card.setAttribute('aria-current', index === activeIndex ? 'step' : 'false');
    });
    stack.style.setProperty('--stack-active', String(activeIndex));
  }

  function setupCardStack() {
    const stack = $('[data-card-stack]');
    if (!stack) return;
    stack.style.setProperty('--stack-count', String($$('.stack-card', stack).length));
    let frame = 0;
    const scheduleUpdate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        measureCardStack();
        updateCardStack();
      });
    };
    window.addEventListener('resize', scheduleUpdate, { passive: true });
    window.addEventListener('orientationchange', scheduleUpdate, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(scheduleUpdate).observe(stack);

    /* ============================================================
       STOS KART POZA WIDOKIEM ODDAJE SWOJE WARSTWY KOMPOZYTORA.
       ============================================================
       OBJAW, KTÓREGO TO DOTYCZY
         „Strona na telefonie sama się odświeża w okolicy sekcji nagród." Nie ma tu ani jednego
         `location.reload()` ani service workera, a sonda błędów przechodzi tę okolicę czysto —
         więc przeładowanie jest ubiciem procesu renderującego z braku pamięci. Rachunek
         zbierany jest w czterech miejscach naraz: `backdrop-filter` i cienie paneli
         (carnival.css), cień rysunku nagrody (main.css), warstwy karuzeli (gallery-3d.js).
         To jest piąte.

       CO TU BYŁO, ZMIERZONE
         `will-change: transform` na `.stack-card` (experience.css) stało bezwarunkowo. To jest
         jawna prośba o osobną warstwę kompozytora i przeglądarka spełnia ją NATYCHMIAST, nie
         dopiero wtedy, gdy coś się rusza.

         Pomiar tools/probe-c-prizes-memory.js na 390x844, snapshot „sekcja nagrod w widoku",
         czyli w chwili gdy stos kart jest już dawno za plecami czytelnika:
           elementy z niezerowym `will-change`:   6
           z tego karty stosu:                    3  (335x551, 335x551, 366x602)
           suma ich pudełek:                      589 502 px2 (0,59 Mpx)
         Czyli połowa wszystkich warstw z `will-change` i 0,59 Mpx pamięci graficznej trzymanej
         dla sekcji, której nie ma na ekranie.

       DLACZEGO TO NIE JEST TO SAMO CO ZDJĘCIE `will-change` NA STAŁE
         Gdy stos JEST na ekranie, `updateCardStack` pisze mu `transform` w każdej klatce
         przewijania. Tam podpowiedź zarabia na siebie i nie ma powodu jej zabierać — bez niej
         każda klatka byłaby przemalowaniem karty wielkości ekranu. Chodzi wyłącznie o to, żeby
         nie płacić za nią przez pozostałe kilka tysięcy pikseli przewijania.

       DLACZEGO `IntersectionObserver`, A NIE NASŁUCH `scroll`
         Wersja na `scroll` musiałaby wołać `getBoundingClientRect()` na stosie przy każdym
         zdarzeniu, czyli wymuszać przeliczenie układu w trakcie przewijania — dokładnie ten
         błąd, który jest rozpisany przy `measure()` w setupPanels i przy dokowaniu licznika.
         Obserwator odpowiada na to samo pytanie bez ani jednego pomiaru w naszym kodzie.

       `rootMargin` HOJNY Z ROZMYSŁU
         Warstwa musi być gotowa, ZANIM karta wjedzie na ekran, bo pierwsza klatka po powrocie
         jest tą, w której czytelnik patrzy na stos. Pół ekranu zapasu w każdą stronę znaczy, że
         podpowiedź wraca zawczasu, a mimo to nie obowiązuje przy sekcji nagród, która leży
         kilka ekranów niżej. */
    if ('IntersectionObserver' in window) {
      const nearby = new IntersectionObserver((entries) => {
        const onScreen = entries.some((entry) => entry.isIntersecting);
        stack.classList.toggle('is-offscreen', !onScreen);
      }, { rootMargin: '50% 0px 50% 0px', threshold: 0 });
      nearby.observe(stack);
    }

    scheduleUpdate();
  }

  /**
   * Zdjecie na karcie nagrody pokazuje sie DOPIERO, gdy plik naprawde sie wczytal.
   * ===========================================================================
   * Karty maja dzis rysunki wektorowe i maja dzialac dalej, takze zanim powstanie
   * `prize-01.webp` … `prize-12.webp`. Dlatego oba stoja w znaczniku obok siebie, a o tym,
   * ktore widac, rozstrzyga wynik wczytania — nie osobne wdrozenie i nie recznie
   * przepisany znacznik.
   *
   * Zdjecie jest w HTML jako `hidden`, wiec przy braku pliku nie miga ani przez klatke:
   * `hidden` odejmuje je z ukladu, a `complete && naturalWidth` mowi wprost, czy przegladarka
   * ma obrazek, czy 404. Rysunek chowa sie dopiero PO tym sprawdzeniu, wiec karta nigdy nie
   * zostaje pusta.
   *
   * Bez tej funkcji strona zachowuje sie tak jak dotad — a to jest wlasciwy stan zapasowy:
   * rysunki sa gotowe i dobre, zdjecia sa ulepszeniem.
   */
  function setupPrizePhotos() {
    $$('[data-prize-photo]').forEach((photo) => {
      const pokaz = () => {
        if (!photo.naturalWidth) return;
        photo.classList.add('is-ready');
        const rysunek = photo.parentElement?.querySelector('svg');
        if (rysunek) rysunek.hidden = true;
      };
      if (photo.complete) pokaz();
      else photo.addEventListener('load', pokaz, { once: true });
    });
  }

  function setupPrizeDeck() {
    const deck = $('[data-prize-deck]');
    const cards = $$('[data-prize-card]', deck || document);
    if (!deck || !cards.length) return;
    deck.tabIndex = 0;
    deck.setAttribute('aria-label', 'Interactive prize cards');

    /**
     * @param {-1|0} peek  -1 podkłada pod wierzchnią kartę tę POPRZEDNIĄ, nie następną.
     *
     * TO JEST NAPRAWA „WIDZĘ 7, PUSZCZAM I MAM 6".
     * ---------------------------------------------------------------------------
     * Stos był układany raz, po animacji, i zawsze w jedną stronę: pod kartą numer N leżała
     * karta N+1. Przeciągnięcie w PRAWO cofa talię (`advance(-1)`, patrz `release`), więc na
     * wierzch wchodziła karta N-1 — a użytkownik przez cały czas przeciągania patrzył na
     * N+1 wystającą spod krawędzi. Karta, na którą patrzył, nie była kartą, którą dostawał.
     *
     * Kierunek nie jest tu do zmiany: przeciągnięcie w prawo ma cofać, bo karta odjeżdża w tę
     * stronę, w którą ją rzucono. Do zmiany jest to, co pokazujemy pod spodem — i stąd ten
     * parametr. `pointermove` przestawia go, gdy tylko znak `dx` się ustali.
     */
    function layout(peek = 0) {
      const total = cards.length;
      const previous = (state.deckIndex - 1 + total) % total;
      cards.forEach((card, index) => {
        let relative = (index - state.deckIndex + total) % total;
        /* Poprzednia karta wskakuje na pozycję drugą, a wszystko, co za wierzchnią, przesuwa
           się o jedno w głąb. Liczba kart w stosie zostaje ta sama — zmienia się tylko
           kolejność, więc żadna nie znika i nie ma dziury w środku. */
        if (peek === -1 && total > 1) {
          if (index === previous) relative = 1;
          else if (relative >= 1) relative += 1;
        }
        card.style.setProperty('--deck-i', String(Math.min(relative, 7)));
        card.style.zIndex = String(total - relative);
        card.style.opacity = relative > 7 ? '0' : String(Math.max(0.55, 1 - relative * 0.055));
        // `filter: saturate()` used to be set here on seven stacked cards. Every
        // frame of the floating artwork then forced each of them to re-filter a
        // 440x540 surface, and that is what made the deck judder. Opacity and
        // transform composite; filter does not.
        card.style.pointerEvents = relative === 0 ? 'auto' : 'none';
        card.setAttribute('aria-hidden', relative === 0 ? 'false' : 'true');

        /* ============================================================
           KARTY, KTÓRYCH NIE WIDAĆ, PRZESTAJĄ BYĆ MALOWANE.
           ============================================================
           OBJAW, KTÓREGO TO DOTYCZY
             „Strona na telefonie sama się odświeża w okolicy sekcji nagród." Sonda
             tools/probe-c-errors.js przechodzi tę okolicę bez wyjątku, bez odrzuconej obietnicy
             i bez spadku liczby klatek, więc to nie jest awaria kodu — to przeglądarka mobilna
             ubijająca proces renderujący z braku pamięci i wczytująca dokument od nowa. Takie
             zabicie NIE ZOSTAWIA ŚLADU W KONSOLI, więc jedyne, co da się zmierzyć i obniżyć,
             to zużycie, które do niego prowadzi.

           CO TU BYŁO
             `opacity: 0` na kartach głębszych niż ósma. Zerowa przezroczystość NIE ZWALNIA
             malowania: element dalej ma układ, dalej jest rasteryzowany i dalej zajmuje
             teksturę — po prostu składa się z wagą zero. Cztery karty po 328x380 px razem z
             rysunkami z prizes.svg były więc malowane po to, żeby ich nie było widać.

           ZMIERZONE, tools/probe-c-prizes-memory.js oraz test trafiania po siatce 3x3 px
           (`elementFromPoint`, 17 568 punktów) na 390x844, karta 01 na wierzchu:
             karta na wierzchu                  4 548 punktów, z tego rysunek 2 996
             karty 2-8 w stosie                 256, 305, 198, 142, 80, 47, 22 punktów krawędzi
             karty 9-12                         ZERO punktów — nie widać z nich nic
             rysunek widoczny w ogóle           tylko na kartach 1, 3 i 4 (2 996, 47, 14 punktów)
           Czyli: cztery karty malowane na darmo w całości, a rysunek — osobne poddrzewo
           `<use>` z jednego pliku SVG na każdą kartę — malowany dwanaście razy po to, żeby
           widać go było na jednej i w śladowych ilościach na dwóch dalszych (razem ~549 px2
           z 540 325 px2 wszystkich rysunków, czyli 0,1%).

           CO ROBIMY
             1. `visibility: hidden` dla kart poza stosem (głębsze niż ósma). Zmierzone zero
                widocznych punktów, więc to jest usunięcie z malowania czegoś, czego nie ma na
                ekranie — nie zmiana wyglądu.
             2. Klasa `is-art-hidden` od czwartej karty w głąb zdejmuje z malowania sam
                rysunek, zostawiając korpus karty. Krawędzie kart, z których zbudowany jest
                stos, zostają widoczne co do piksela — schodzi tylko rysunek, którego test
                trafiania nie znalazł na ekranie ani w jednym punkcie.

           DLACZEGO `visibility`, A NIE `display: none` ANI `content-visibility`
             `display: none` wyjmuje pudełko z układu, więc karta wracająca na wierzch musiałaby
             przeliczyć swój układ w tej samej klatce, w której wjeżdża — najgorszej możliwej.
             `content-visibility: hidden` pomija układ POTOMKÓW, więc wysokość karty spadłaby do
             `min-height` i wróciłaby skokiem. `visibility: hidden` nie rusza układu, a jest
             wystarczające: przeglądarka nie maluje ukrytego poddrzewa.

           DLACZEGO PRÓG 4, A NIE 2
             Karty 3 i 4 mają zmierzone 47 i 14 punktów widocznego rysunku. Są to skrawki za
             obróconą krawędzią karty przed nimi, ale są NIEZEROWE, a próg ma wynikać z pomiaru,
             nie z zaokrąglenia pomiaru w wygodną stronę. Od czwartej w głąb pomiar daje zero.

           KOSZT, KTÓREGO NIE UKRYWAM
             Karta wracająca na wierzch przy cofaniu talii (`advance(-1)`) idzie z pozycji poza
             stosem, więc jej rysunek trzeba zrasteryzować w chwili powrotu. To jeden rysunek
             259x166 px w tej samej klatce, w której i tak zmienia się układ całego stosu —
             nieporównywalnie mniej niż trzymanie dwunastu naraz przez całą wizytę. */
        card.style.visibility = relative > 7 ? 'hidden' : '';
        card.classList.toggle('is-art-hidden', relative >= 4);
      });
      const current = $('[data-deck-current]');
      if (current) current.textContent = String(state.deckIndex + 1).padStart(2, '0');
    }

    /**
     * @param {number} direction  1 sends the top card away to the left and brings
     *                            the next one up, -1 goes back.
     */
    function advance(direction = 1, { fromDrag = false } = {}) {
      if (state.deckLocked) return false;
      state.deckLocked = true;
      const outgoing = cards[state.deckIndex];

      /* Two ways in, and they must not be handled the same way.
         ---------------------------------------------------------------------------
         From a button or the keyboard the card is sitting at centre with no inline
         styles, so clearing them and forcing a reflow costs nothing and guarantees a
         clean starting point.

         From a throw the card is already out under the finger — often most of the way
         to the edge. Wiping the transform and flushing it (`void offsetWidth`) commits
         centre as the "before" style, so the card snaps back for one frame and only
         then flies away. That backwards jump was the ugliest frame in the interaction.

         So on a throw both inline properties come off and the class goes on inside the
         same task, with nothing in between that forces a style flush. The browser sees
         one change — dragged position to off screen — and interpolates it in one go. */
      outgoing.style.removeProperty('transition');
      outgoing.style.removeProperty('transform');
      if (!fromDrag) void outgoing.offsetWidth;
      outgoing.classList.add(direction < 0 ? 'is-gone-back' : 'is-gone');

      /* Wait for the throw to actually finish, then reset without animating.
         ---------------------------------------------------------------------------
         TWO BUGS WERE STACKED HERE, AND TOGETHER THEY WERE THE "IT STICKS" REPORT.

         1. The wait was 300 ms and the CSS transition is 380 ms (carnival.css shortened it
            from .7s and this number was not updated with it). So the class came off while
            the card was about four fifths of the way off screen, and the card jumped back
            from there.

         2. Removing `is-gone` puts the card at the back of the stack — and it went there
            *through the transition*, because the transition is on `.prize-card` itself.
            So every advance ended with the outgoing card visibly flying from off-screen
            back into the deck, on top of the next card coming forward. Two cards moving in
            opposite directions across each other is what read as juddering.

         `transitionend` rather than a timer, with a timer as the way out. A transition that
         never fires its event is the same failure mode as a rAF that never runs, and this
         page has been bitten by that three times; the escape hatch is written in from the
         start rather than added after somebody reports a deck that has stopped responding. */
      const settle = () => {
        state.deckIndex = (state.deckIndex + direction + cards.length) % cards.length;
        // No animation for the trip back to the rear of the stack: it is bookkeeping, not
        // something anybody should watch.
        outgoing.classList.add('is-resetting');
        outgoing.classList.remove('is-gone', 'is-gone-back');
        layout();
        void outgoing.offsetWidth;
        requestAnimationFrame(() => outgoing.classList.remove('is-resetting'));
        window.setTimeout(() => { state.deckLocked = false; }, 60);
      };

      if (reducedMotion) {
        window.setTimeout(settle, 10);
        return true;
      }

      let done = false;
      const once = () => {
        if (done) return;
        done = true;
        outgoing.removeEventListener('transitionend', onEnd);
        settle();
      };
      const onEnd = (event) => {
        // Only the transform, and only this card's own — `transitionend` bubbles, and
        // opacity finishes 80 ms earlier than the movement does.
        if (event.target === outgoing && event.propertyName === 'transform') once();
      };
      outgoing.addEventListener('transitionend', onEnd);
      /* Escape hatch only. It used to be the actual mechanism, because the stylesheet had
         no transform transition on these cards and so `transitionend` could never fire —
         every swipe was followed by 460 ms of a deck that ignored you. carnival.css puts
         the transition back; this timer is now just insurance against a transition that
         is interrupted before it ends, sat comfortably past the .42s it should take. */
      window.setTimeout(once, 560);
      return true;
    }

    /**
     * Drag handling.
     *
     * Two things were wrong. The transform was written straight from pointermove,
     * which on a 1000 Hz mouse is a thousand style writes a second and reads as
     * shaking. And the release always called advance(1), so a card thrown to the
     * right still went forward — the deck could never be shuffled back.
     *
     * The write is now batched into one requestAnimationFrame, and the throw
     * direction decides which way the deck moves. The threshold is low (52 px) so
     * a quick flick is enough.
     */
    let drag = null;
    let dragFrame = 0;

    /** Sideways travel that commits to a throw on its own, with no flick behind it. */
    const THROW_PX = 52;
    /** Where the card stops following the finger one-for-one, in px. */
    const SOFT_PX = 150;
    /** px per ms. A deliberate swipe runs well over 1; a careful drag stays under .2. */
    const FLICK_SPEED = 0.6;
    /** A flick still has to move the card visibly, or a twitch would throw it. */
    const FLICK_MIN_PX = 24;
    /** A flick has to be the last thing that happened, not something from a second ago. */
    const FLICK_MAX_AGE = 90;

    const paint = () => {
      dragFrame = 0;
      if (!drag) return;
      const { dx, dy } = drag;
      /* Past SOFT_PX the card gives about a third of what the finger gives. The throw has
         already committed by then (52 px), so this changes nothing about what happens —
         it is only so the card reads as an object with some weight rather than something
         glued to the cursor, and so a long drag cannot fling it a screen and a half wide. */
      const magnitude = Math.abs(dx);
      const pull = Math.sign(dx) * (magnitude <= SOFT_PX ? magnitude : SOFT_PX + (magnitude - SOFT_PX) * 0.35);
      /* translate3d rather than translate: it asks for the card to be composited, which
         together with the will-change set on pointerdown keeps the whole drag off the
         paint path. The card is 500x430 with a 70 px shadow — repainting that per frame
         is exactly the cost this is avoiding. */
      drag.card.style.transform =
        `translate(-50%, -50%) translate3d(${pull.toFixed(1)}px, ${(dy * 0.2).toFixed(1)}px, 0)`
        + ` rotate(${(pull * 0.028).toFixed(2)}deg)`;
    };

    deck.addEventListener('pointerdown', (event) => {
      const card = event.target.closest('[data-prize-card]');
      if (!card || card !== cards[state.deckIndex] || state.deckLocked) return;
      const now = event.timeStamp || performance.now();
      drag = {
        card, startX: event.clientX, startY: event.clientY,
        dx: 0, dy: 0, moved: false,
        // Smoothed pointer speed, so the release can tell a flick from a slow shove.
        vx: 0, lastAt: now, lastMoveAt: now,
        // Którą kartę podłożyliśmy pod spód. Trzymane, żeby nie przekładać stosu na każdy
        // ruch wskaźnika — patrz `layout(peek)`.
        peek: 0
      };
      card.setPointerCapture?.(event.pointerId);
      // Narrower than leaving the transition out of the stylesheet, which is what used to
      // be done here — see the note on `.prize-deck .prize-card` in carnival.css. Off for
      // the drag, back on the moment the finger lifts, so the card can ease home or fly.
      card.style.transition = 'none';
      card.style.willChange = 'transform';
      // Freezes the floating artwork so the card feels like a solid object.
      deck.classList.add('is-dragging');
    });

    deck.addEventListener('pointermove', (event) => {
      if (!drag) return;
      const now = event.timeStamp || performance.now();
      const dx = event.clientX - drag.startX;
      const elapsed = now - drag.lastAt;
      if (elapsed > 0) {
        /* Weighted average, not the raw sample. A 1000 Hz mouse delivers moves 1 ms apart
           and a single jittery one is enough to read as a flick if taken on its own. */
        drag.vx = drag.vx * 0.6 + ((dx - drag.dx) / elapsed) * 0.4;
        drag.lastAt = now;
      }
      if (dx !== drag.dx) drag.lastMoveAt = now;
      drag.dx = dx;
      drag.dy = event.clientY - drag.startY;
      drag.moved ||= Math.abs(drag.dx) > 4 || Math.abs(drag.dy) > 4;

      /* Pod spodem ma leżeć karta, która naprawdę wejdzie na wierzch.
         Próg 4 px to ten sam, który decyduje o `moved`: poniżej niego nie ma jeszcze kierunku,
         tylko drgnienie palca, a przekładanie stosu na drgnienie byłoby migotaniem. Przekładamy
         wyłącznie przy ZMIANIE strony, nie na każdy ruch — `layout()` przechodzi po dwunastu
         kartach i pisze im cztery właściwości, więc na każdą klatkę byłoby to widoczne. */
      const wanted = Math.abs(dx) > 4 && dx > 0 ? -1 : 0;
      if (wanted !== drag.peek) {
        drag.peek = wanted;
        layout(wanted);
      }
      if (!dragFrame) dragFrame = requestAnimationFrame(paint);
    }, { passive: true });

    /** Puts the card back under the stylesheet's control; it eases home from wherever it is. */
    const settleHome = (card) => {
      card.style.removeProperty('transition');
      card.style.removeProperty('transform');
    };

    const release = () => {
      if (!drag) return;
      const { card, dx, moved, vx, peek } = drag;
      const stale = (performance.now() - drag.lastMoveAt) > FLICK_MAX_AGE;
      drag = null;
      cancelAnimationFrame(dragFrame);
      dragFrame = 0;
      deck.classList.remove('is-dragging');
      card.style.removeProperty('will-change');

      // A tap, not a drag: same meaning as the next button.
      if (!moved) { settleHome(card); advance(1); return; }

      /* Two ways to commit. Distance is the obvious one. Speed is the one that matters on
         a phone, where a flick is over in 80 ms and covers barely 30 px — under the old
         distance-only rule those swipes did nothing at all and the deck felt dead. The
         flick has to still be in progress at release and to agree with which way the card
         actually went, so a drag out and back does not count as a throw. */
      const flick = !stale && Math.abs(vx) > FLICK_SPEED && Math.sign(vx) === Math.sign(dx);
      const thrown = Math.abs(dx) >= THROW_PX || (flick && Math.abs(dx) >= FLICK_MIN_PX);

      // Left sends the deck forward, right sends it back — the card leaves the side it was
      // thrown towards, so the flick and the movement always agree.
      /* Rzut zostawia stos w kolejności podglądu z rozmysłu: karta, którą było widać pod
         spodem, zostaje pod spodem przez cały lot wierzchniej, a `settle()` przelicza układ
         dopiero na końcu. Tak podglądana karta jest tą, która zostaje. */
      if (thrown && advance(dx < 0 ? 1 : -1, { fromDrag: true })) return;
      // Not far enough, or the deck was already busy: ease back to centre.
      settleHome(card);
      // Podgląd był obietnicą, która się nie spełniła — stos wraca do zwykłej kolejności.
      if (peek) layout(0);
    };

    /* `pointercancel` is not a release, it is the browser saying the gesture is no longer
       ours — a vertical pan taking over, a phone call, a palm on the screen. Committing a
       throw on it would mean the deck moved on a gesture the reader never finished, so the
       card always eases back to centre instead. */
    const abort = () => {
      if (!drag) return;
      const { card, peek } = drag;
      drag = null;
      cancelAnimationFrame(dragFrame);
      dragFrame = 0;
      deck.classList.remove('is-dragging');
      card.style.removeProperty('will-change');
      settleHome(card);
      if (peek) layout(0);
    };

    deck.addEventListener('pointerup', release);
    deck.addEventListener('pointercancel', abort);
    // Fires after both of the above, by which point `drag` is already null and this is a
    // no-op. It is here for the case they do not fire at all — capture lost to a
    // disappearing element leaves the card stranded mid-drag otherwise.
    deck.addEventListener('lostpointercapture', release);
    deck.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight' || event.key === ' ') { event.preventDefault(); advance(1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); advance(-1); }
    });
    $('[data-deck-next]')?.addEventListener('click', () => advance(1));
    $('[data-deck-prev]')?.addEventListener('click', () => advance(-1));

    if ('IntersectionObserver' in window) {
      const section = deck.closest('.prizes');
      if (section) {
        const observer = new IntersectionObserver((entries) => {
          section.classList.toggle('is-offscreen', !entries[0].isIntersecting);
        }, { threshold: 0.02 });
        observer.observe(section);
      }
    }

    layout();
  }

  /**
   * Odliczanie do wydarzenia — JEDEN timer na wszystkie widoki licznika.
   * ===========================================================================
   * Było `$('[data-days]')`, czyli PIERWSZY element z tym atrybutem. Odliczanie jest teraz
   * w dwóch miejscach: duże w hero i zadokowane w pasku (`[data-nav-clock]`), a jutro może
   * dojść trzecie — w stopce albo w oknie przypomnienia. Przy zapisie do pierwszego
   * znalezionego elementu każdy nowy widok wymagałby własnego `setInterval`, a dwa
   * niezależne interwały liczące to samo NIE TYKAJĄ RÓWNO: startują w innej milisekundzie,
   * `setInterval` dryfuje pod obciążeniem, a przeglądarka dławi timery inaczej w każdej
   * karcie w tle. Skończyłoby się tym, że w pasku stoi 20:41:03, a w hero 20:41:02 — na tej
   * samej stronie, w jednym spojrzeniu. Tego nie da się naprawić inaczej niż jednym źródłem.
   *
   * Był tu jeszcze drugi, cichszy błąd tej samej natury: pasek stoi w dokumencie PRZED hero,
   * więc `$('[data-days]')` po dodaniu kopii wskazywałby kopię, a duży licznik w hero
   * zostałby na „00" na zawsze. Zapis do wszystkich elementów usuwa całą tę klasę pomyłek.
   *
   * Lista jest zbierana raz: oba widoki stoją w `index.html` od początku i żaden nie jest
   * dobudowywany w trakcie życia strony.
   */
  function setupCountdown() {
    const units = {
      days: $$('[data-days]'), hours: $$('[data-hours]'),
      minutes: $$('[data-minutes]'), seconds: $$('[data-seconds]')
    };
    /* Zapis tylko wtedy, gdy liczba naprawdę się zmieniła. Dni zmieniają się raz na dobę, a
       bezwarunkowe `textContent` unieważnia układ tekstu w każdym z ośmiu elementów co
       sekundę. Sekundy i tak przechodzą przez ten warunek, więc nic tu nie tracimy. */
    const paint = (nodes, value) => {
      const digits = String(value).padStart(2, '0');
      nodes.forEach((node) => { if (node.textContent !== digits) node.textContent = digits; });
    };
    function update() {
      const target = new Date(config.eventDate).getTime();
      const difference = Number.isNaN(target) ? 0 : Math.max(0, target - Date.now());
      paint(units.days, Math.floor(difference / 86400000));
      paint(units.hours, Math.floor((difference % 86400000) / 3600000));
      paint(units.minutes, Math.floor((difference % 3600000) / 60000));
      paint(units.seconds, Math.floor((difference % 60000) / 1000));
    }
    update();
    window.setInterval(update, 1000);
  }

  /**
   * Dokowanie odliczania w pasku nawigacji.
   * ===========================================================================
   * Pasek jest `position: fixed`, więc kopia licznika, która w nim stoi, jest przyklejona do
   * ekranu za darmo — nie ma tu ani jednej linii przeliczającej pozycję. Cała robota polega
   * na jednym pytaniu: czy duży licznik z hero jest jeszcze widoczny.
   *
   * DLACZEGO `IntersectionObserver`, A NIE NASŁUCH `scroll`
   * Wersja na `scroll` musiałaby przy każdym zdarzeniu wołać `getBoundingClientRect()` na
   * liczniku w hero, czyli wymuszać przeliczenie układu w trakcie przewijania — na stronie z
   * czternastoma przypiętymi panelami i stosem kart, które robią to samo. Ten błąd ma tu
   * własny akapit przy `measure()` w setupPanels. Obserwator odpowiada na to samo pytanie
   * bez ani jednego pomiaru w naszym kodzie.
   *
   * DLACZEGO `rootMargin` UJEMNY OD GÓRY
   * Pasek zasłania górne ~80 px ekranu. Bez tej poprawki licznik z hero „jest widoczny"
   * jeszcze wtedy, gdy w rzeczywistości leży pod paskiem, i kopia wjeżdżałaby osiemdziesiąt
   * pikseli za późno — z przerwą, w której odliczania nie ma nigdzie.
   *
   * DLACZEGO `boundingClientRect.top < 0`
   * Sam brak przecięcia nie mówi, z której strony ekranu licznik wyszedł. Bez tego warunku
   * kopia dokowałaby się także wtedy, gdy hero jest PONIŻEJ widoku — czyli w chwili powrotu
   * na górę strony, gdzie zostawałaby zadokowana kopia nad widocznym dużym licznikiem.
   *
   * DLACZEGO DWA OBSERWATORY — I TO JEST NAJWAŻNIEJSZA CZĘŚĆ TEJ FUNKCJI
   * Jeden obserwator na `[data-countdown]` wystarcza tylko tam, gdzie sekcje przewijają się
   * normalnie. Zmierzone sondą na 1440x900: licznik w hero ma
   * `getBoundingClientRect().top === 364` przy KAŻDEJ pozycji przewinięcia — 0, 400, 900,
   * 1600, 2600, 4200. Pomiar jest dobry, to układ jest inny, niż się wydaje: hero to panel
   * `position: sticky; top: 0` przypięty na całą długość `#main` (patrz komentarz przy
   * `#main > section.section-card` w experience.css), więc geometrycznie nigdy nie wychodzi z
   * ekranu — po prostu następny panel WJEŻDŻA NA NIEGO. Dla obserwatora przecięć licznik
   * jest wtedy widoczny, choć na ekranie nie ma go od dawna, i kopia nie zadokowałaby się
   * nigdy. Ta sama sonda na 390x844 daje `top: -337` przy 900 px przewinięcia, bo tam
   * setupPanels wypuszcza hero w przepływ. Ten sam kod potrzebuje więc obu odpowiedzi.
   *
   * Przesłonięcia `IntersectionObserver` nie widzi (v2 `trackVisibility` widzi, ale tylko w
   * Chrome — na Firefoksie i Safari kopia nie pojawiłaby się wcale), więc drugi obserwator
   * patrzy na PANEL, KTÓRY PRZYKRYWA hero, i pyta, czy jego górna krawędź doszła już do
   * wysokości licznika. To ta sama informacja powiedziana od drugiej strony, nadal bez
   * jednego nasłuchu przewijania. Warunki są łączone przez „lub": wystarczy, że którykolwiek
   * z dwóch układów powie „tego licznika już nie widać".
   */
  function setupNavClock() {
    const header = $('[data-header]');
    const clock = $('[data-nav-clock]');
    const hero = $('[data-countdown]');
    if (!header || !clock) return;

    /* Ograniczony ruch: bez wjeżdżania, samo pojawienie się. Klasa dopięta tutaj, a nie
       osobne `@media` w arkuszu, bo `reducedMotion` jest na tej stronie jedynym miejscem, w
       którym pyta się o zgodę na animację, i ma nim zostać. */
    if (reducedMotion) clock.classList.add('nav-clock--still');

    /**
     * W dniu zjazdu odliczanie do wydarzenia przestaje istnieć: voting.js ustawia
     * `[data-countdown].hidden` i na jego miejsce wchodzi zegar głosowania (patrz komentarz
     * przy `hero__aside` w index.html). Kopia w pasku pokazywałaby wtedy 00/00/00/00 przez
     * cały dzień wydarzenia, w najbardziej widocznym miejscu strony. Licznik na zerach jest
     * gorszy niż brak licznika, więc kopia znika razem z oryginałem.
     */
    const heroUsable = () => Boolean(hero) && !hero.hidden && hero.getClientRects().length > 0;

    let heroAbove = false;    // wyszedł górą z widoku — układ przepływowy (telefon)
    let heroCovered = false;  // przykryty następnym panelem — układ przypięty (desktop)
    const sync = () => {
      const usable = heroUsable();
      /* `hidden`, a nie wygaszenie: to nie jest stan przejściowy, który ma się ładnie
         zamknąć, to „tego licznika dzisiaj nie ma". */
      clock.hidden = !usable;
      header.toggleAttribute('data-clock-docked', usable && (heroAbove || heroCovered));
    };

    if (!hero || !('IntersectionObserver' in window)) {
      /* Bez oryginału albo bez obserwatora nie ma czym rozstrzygnąć, kiedy kopia ma się
         pokazać. Kopia stojąca w pasku zawsze — także nad widocznym dużym licznikiem — to ta
         sama liczba dwa razy na jednym ekranie. Więc nie ma jej wcale. */
      clock.hidden = true;
      header.removeAttribute('data-clock-docked');
      return;
    }

    /* Wysokość paska liczona z paska, nie wpisana. Pasek zwija się o kilka pikseli, ale to
       jest margines wykrywania, a nie pozycja czegokolwiek. */
    const barLine = () => Math.round(header.getBoundingClientRect().bottom) + 8;

    const flowObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        heroAbove = !entry.isIntersecting && entry.boundingClientRect.top < 0;
      });
      sync();
    }, { root: null, rootMargin: `-${barLine()}px 0px 0px 0px`, threshold: 0 });
    flowObserver.observe(hero);

    /* Panel, który przykrywa hero. Pierwsza NIEUKRYTA sekcja za hero, a nie po prostu
       następna: zaraz za hero stoi `#podium`, które przez jedenaście miesięcy w roku ma
       atrybut `hidden` i nigdy nie przykryje niczego. Obserwowanie go znaczyłoby brak
       dokowania przez cały ten czas. */
    const heroSection = hero.closest('section');
    let cover = heroSection?.nextElementSibling || null;
    while (cover && (cover.tagName !== 'SECTION' || cover.hidden)) cover = cover.nextElementSibling;

    let coverObserver = null;
    const watchCover = () => {
      coverObserver?.disconnect();
      coverObserver = null;
      if (!cover || !heroUsable()) return;
      /* Linia, na której duży licznik przestaje być widoczny: jego własna górna krawędź.
         Kopia pojawia się dokładnie wtedy, gdy oryginał znika pod nadjeżdżającym panelem —
         przekazanie bez przerwy i bez dwóch liczników naraz.

         Dolne obcięcie korzenia zamienia widok na wąski pas [pasek, licznik]. Panel wchodzi
         w ten pas w tej samej chwili, w której jego krawędź dochodzi do licznika.

         Zabezpieczenie na wypadek układu, w którym licznik leży poza ekranem albo pod samym
         paskiem: pas musi mieć dodatnią wysokość, inaczej obserwator nie zgłosi nigdy
         niczego (albo, co gorsze, zgłosi natychmiast). */
      const line = clamp(Math.round(hero.getBoundingClientRect().top), barLine() + 24, window.innerHeight);
      const bottomInset = Math.max(0, window.innerHeight - line);
      coverObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => { heroCovered = entry.isIntersecting; });
        sync();
      }, { root: null, rootMargin: `-${barLine()}px 0px -${bottomInset}px 0px`, threshold: 0 });
      coverObserver.observe(cover);
    };
    watchCover();

    /* Zmiana `hidden` nie jest zdarzeniem, na które da się nasłuchiwać, a voting.js ustawia
       je asynchronicznie — po odczycie fazy z serwera, czyli długo po tym, jak ten kod się
       wykonał. Bez tego obserwatora kopia zostałaby w pasku w dniu wydarzenia. */
    new MutationObserver(() => { watchCover(); sync(); })
      .observe(hero, { attributes: true, attributeFilter: ['hidden', 'class', 'style'] });

    /* Pas obserwacji jest policzony z pozycji licznika, więc każda zmiana układu go
       unieważnia. `carruleddhi:relayout` to sygnał, który setupPanels już wysyła po
       rozstrzygnięciu `pinned`/`flow` — a to właśnie ono decyduje, który z dwóch
       obserwatorów w ogóle ma coś do powiedzenia. */
    const relayout = () => { watchCover(); sync(); };
    window.addEventListener('resize', relayout, { passive: true });
    window.addEventListener('orientationchange', relayout, { passive: true });
    window.addEventListener('carruleddhi:relayout', relayout);

    sync();
  }

  function formatNumber(number) {
    try { return new Intl.NumberFormat(state.lang).format(number); } catch (_) { return String(number); }
  }

  function animateNumber(element, from, to, duration = 950) {
    if (!element) return;
    if (reducedMotion || from === to) {
      element.textContent = formatNumber(to);
      return;
    }
    const start = performance.now();
    function tick(now) {
      const progress = clamp((now - start) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      element.textContent = formatNumber(Math.round(from + (to - from) * eased));
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function attendeeTotal() {
    return Number.isFinite(state.remoteAttendees)
      ? state.remoteAttendees
      : Number(config.attendeesBase) + (state.attended ? 1 : 0);
  }

  function pilotTotal() {
    return Number.isFinite(state.remotePilots)
      ? state.remotePilots
      : Number(config.pilotsBase) + state.registrations;
  }

  /**
   * Paints the avatar row from the initials the server sent.
   *
   * Two letters per rider, in the order they signed up, and the last circle is
   * always the remainder. The markup ships with AM / LG / SR / FC / MB as
   * placeholders so the row is never empty on first paint; the moment real initials
   * arrive they replace them. Only initials ever leave the database — see the
   * public_counts view in 0002_event_data.sql for why that matters.
   */
  function paintAvatars() {
    const stack = $('.avatar-stack');
    if (!stack) return;
    const circles = $$('.avatar', stack);
    if (!circles.length) return;

    const initials = Array.isArray(state.riderInitials) ? state.riderInitials : [];
    const slots = circles.length - 1;

    circles.slice(0, slots).forEach((circle, index) => {
      const value = initials[index];
      // No real value for this slot yet: leave whatever is there rather than
      // blanking a circle, which would read as a loading glitch.
      if (value) circle.textContent = value;
      circle.hidden = initials.length > 0 && index >= initials.length;
    });

    /* The remainder counts riders, not attendees.
       ---------------------------------------------------------------------------
       This read attendeeTotal(), which is the "I'll be there" tally — a different set of
       people from the ones whose initials fill the circles. With 3 attendees and 5 real
       riders the row said "+0" next to five faces, and once attendance overtook the entry
       list the number was simply a different quantity from the one the circles implied.

       The circles come from `registrations`; so does the remainder. Four faces and "+46"
       now means what it looks like it means: fifty riders. */
    const shown = initials.length ? Math.min(initials.length, slots) : slots;
    const rest = Math.max(0, pilotTotal() - shown);
    const last = circles[circles.length - 1];
    /**
     * Skrócone, żeby zmieściło się w kółku.
     *
     * To kółko było elipsą, bo rozciągało się do treści — cztery okrągłe awatary i piąty owalny
     * w jednym rzędzie czytają się jako zepsuty układ. Kółko jest teraz kółkiem (patrz
     * carnival.css, sekcja 28), więc to treść musi zmieścić się w pudełku, a nie odwrotnie.
     *
     * Do 999 pełna liczba. Wyżej tysiące z jedną cyfrą po przecinku: „+1,2k" zamiast „+1240".
     * Przy pięćdziesięciu zawodnikach na wyścigu to gałąź, która się nie uruchomi — jest po to,
     * żeby dzień, w którym ktoś wpisze do bazy tysiąc wierszy testowych, nie skończył się
     * rozjechanym rzędem.
     *
     * `toLocaleString` dla separatora dziesiętnego: po polsku i po włosku jest to przecinek, po
     * angielsku kropka, a to jest liczba widoczna na ekranie w sześciu językach.
     */
    const shortRest = rest < 1000
      ? formatNumber(rest)
      : `${(rest / 1000).toLocaleString(state.lang, { maximumFractionDigits: 1 })}k`;
    last.textContent = `+${shortRest}`;
    last.hidden = rest <= 0;
  }

  /**
   * Oba liczniki, z opcjonalnym przebiegiem cyfr od poprzedniej wartości do nowej.
   *
   * `previous` MUSI być podane przez wołającego i nie ma tu wartości domyślnej. Wcześniej
   * miało — `previousAttendance = attendeeTotal()` — i to był błąd, który sprawiał, że licznik
   * nigdy nie tykał:
   *
   *   loadGlobalCounts() zapisywało nową liczbę do `state`, a POTEM wołało paintCounters(true).
   *   Domyślny argument jest wyliczany w chwili wywołania, więc „poprzednia" wartość była już
   *   nową. animateNumber(element, 42, 42) przebiega od czterdziestu dwóch do czterdziestu
   *   dwóch, czyli nie robi nic — a wyglądało to jak działający kod z włączoną animacją.
   *
   * To ta sama klasa błędu, którą ten projekt złapał już pięć razy: funkcja zgłasza sukces i nic
   * nie robi. Brak domyślnej wartości znaczy, że nie da się jej pominąć przez pomyłkę.
   *
   * Liczba zawodników przebiega tak samo jak liczba obecnych. Wcześniej była przypisywana na
   * sztywno, więc „zapisał się kolejny" nie było niczym widoczne, choć liczba się zmieniała.
   */
  function paintCounters(animate = false, previous = null) {
    const attendees = attendeeTotal();
    const pilots = pilotTotal();
    const fromAttendees = previous && Number.isFinite(previous.attendees) ? previous.attendees : attendees;
    const fromPilots = previous && Number.isFinite(previous.pilots) ? previous.pilots : pilots;

    $$('[data-attendee-count]').forEach((element) => {
      if (animate && fromAttendees !== attendees) animateNumber(element, fromAttendees, attendees);
      else element.textContent = formatNumber(attendees);
    });
    $$('[data-pilots-count]').forEach((element) => {
      if (animate && fromPilots !== pilots) animateNumber(element, fromPilots, pilots);
      else element.textContent = formatNumber(pilots);
    });
    paintAvatars();
  }

  /** Obie liczby w jednej migawce — do przekazania jako `previous` po zmianie stanu. */
  const countsSnapshot = () => ({ attendees: attendeeTotal(), pilots: pilotTotal() });

  function refreshAttendanceLabels() {
    const button = $('[data-attendance-button]');
    const label = button ? $('span', button) : null;
    if (label) label.textContent = text(state.attended ? 'attendance.done' : 'attendance.press');
    if (button) {
      // Deliberately not disabled. A disabled button cannot be focused, reads as
      // broken rather than finished, and would swallow the click that reopens the
      // reminder dialog. The sunken red `is-done` state carries the meaning, and
      // it is restored here so a reload does not make the press look undone.
      button.classList.toggle('is-done', state.attended);
      button.setAttribute('aria-pressed', String(state.attended));
    }
    $$('[data-quick-attend]').forEach((quickButton) => {
      const quickLabel = $('[data-attendance-quick-label]', quickButton);
      if (quickLabel) quickLabel.textContent = text(state.attended ? 'quick.attended' : 'quick.attend');
      quickButton.classList.toggle('is-complete', state.attended);
      quickButton.setAttribute('aria-pressed', String(state.attended));
    });
    $$('.nav-attend').forEach((navButton) => {
      /* W PASKU ZAWSZE KROTKI NAPIS — NIGDY `nav.attended`.
         =====================================================================
         Po nacisnieciu przycisk zamienial napis na cale zdanie: „Bede tam na wielkim
         widowisku". W hero, gdzie przycisk zajmuje pol ekranu, to sie broni. W pasku na
         telefonie zdanie nie miesci sie w 100 px, wiec albo lamie sie na dwie linie i
         rozpycha pasek na wysokosc, albo nachodzi na sasiada. Zgloszone jako „guzik jest
         wielki i rozwalony, najezdza na siebie".

         Fakt, ze ktos juz nacisnal, niesie `is-complete` — kolor, nie dluzsze zdanie.
         Kontrolka w pasku ma zostac tej samej szerokosci przed i po nacisnieciu; element
         interfejsu, ktory rosnie od klikniecia, przestawia wszystko obok siebie. */
      navButton.textContent = text('nav.attend');
      navButton.classList.toggle('is-complete', state.attended);
    });
  }

  function createBurst(origin) {
    if (reducedMotion || !origin) return;
    const rect = origin.getBoundingClientRect();
    const colors = ['#ffc928', '#f6494f', '#ffffff', '#3f82f7', '#28b67a'];
    for (let index = 0; index < 52; index += 1) {
      const piece = document.createElement('span');
      piece.className = 'burst-piece';
      const angle = Math.random() * Math.PI * 2;
      const distance = 110 + Math.random() * 300;
      piece.style.left = `${rect.left + rect.width / 2}px`;
      piece.style.top = `${rect.top + rect.height / 2}px`;
      piece.style.background = colors[index % colors.length];
      piece.style.borderRadius = index % 3 === 0 ? '50%' : '2px';
      piece.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
      piece.style.setProperty('--dy', `${Math.sin(angle) * distance + 150}px`);
      piece.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
      piece.style.animationDelay = `${Math.random() * 0.12}s`;
      document.body.appendChild(piece);
      window.setTimeout(() => piece.remove(), 1600);
    }
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.left = `${rect.left + rect.width / 2 - 10}px`;
    ripple.style.top = `${rect.top + rect.height / 2 - 10}px`;
    document.body.appendChild(ripple);
    window.setTimeout(() => ripple.remove(), 1000);
  }

  /**
   * Takes the press back.
   *
   * Local only: the counter, the label and localStorage. The server is not told,
   * because the attendance endpoint has no "remove" operation and inventing one
   * would let anyone decrement the public counter by replaying a request. The
   * optimistic local number is corrected the next time loadGlobalCounts() runs.
   */
  function undoAttendance() {
    const button = $('[data-attendance-button]');
    // Migawka obu liczb, nie sama liczba obecnych: paintCounters przebiega teraz także licznik
    // zawodników, a przekazanie liczby zamiast obiektu cicho wyłączyłoby oba przebiegi.
    const previous = countsSnapshot();
    state.attended = false;
    if (Number.isFinite(state.remoteAttendees)) state.remoteAttendees = Math.max(0, state.remoteAttendees - 1);
    storage.remove('carruleddhi.attended');
    paintCounters(true, previous);
    refreshAttendanceLabels();
    button?.classList.remove('is-done');
    button?.classList.add('is-releasing');
    window.setTimeout(() => button?.classList.remove('is-releasing'), 420);
    showToast(text('attendance.undone'));
  }

  async function registerAttendance(openReminderAfter = false, origin = null) {
    const button = $('[data-attendance-button]');
    // Second press on an already-pressed button lets it back up. The reminder
    // dialog is reachable from the quick-action bar and from the footer link, so
    // nothing becomes unreachable by giving this click the un-press meaning.
    if (state.attended) {
      undoAttendance();
      return;
    }
    const previous = countsSnapshot();
    state.attended = true;
    if (Number.isFinite(state.remoteAttendees)) state.remoteAttendees += 1;
    storage.set('carruleddhi.attended', '1');
    paintCounters(true, previous);
    refreshAttendanceLabels();
    button?.classList.add('is-pressed');
    createBurst(origin || button);
    if (!navigator.userActivation || navigator.userActivation.isActive) navigator.vibrate?.(35);
    // `is-pressed` is the 450 ms squash. `is-done` stays for good: the button sinks
    // into the page and turns deep red, so the answer to "did my press count?" is
    // visible for the rest of the visit and after a reload.
    window.setTimeout(() => button?.classList.remove('is-pressed'), 450);
    button?.classList.add('is-done');

    postJSON(config.endpoints.attendance, eventPayload('attendance', {
      attendeeId: storage.get('carruleddhi.visitorId') || createVisitorId()
    })).then((result) => {
      if (result.attendees !== null && result.attendees !== undefined && Number.isFinite(Number(result.attendees))) {
        const optimistic = countsSnapshot();
        state.remoteAttendees = Number(result.attendees);
        // The attendance answer carries the fresh totals and initials too, so the
        // row of faces updates on the press rather than on the next page load.
        if (Array.isArray(result.initials)) {
          state.riderInitials = result.initials
            .filter((value) => typeof value === 'string')
            .map((value) => value.trim().toUpperCase().slice(0, 2))
            .filter(Boolean);
        }
        paintCounters(true, optimistic);
      }
    }).catch((error) => {
      // Silent on purpose. The count was already updated optimistically and the
      // press is recorded locally, so there is nothing for the visitor to do about
      // a background sync failing. It used to raise "check the fields and try
      // again", which is both wrong (there are no fields) and it overwrote the
      // confirmation toast that had just appeared.
      console.warn('Attendance sync failed, keeping the local count:', error);
    });

    showToast(text('attendance.seeYou'), 4200, 'success');

    // Straight after the press, not a second later. The old 1050 ms delay felt
    // like the click had been ignored; 260 ms is just long enough for the button
    // to visibly sink before the dialog takes over.
    if (openReminderAfter && storage.get('carruleddhi.reminder') !== '1') {
      window.setTimeout(openReminder, reducedMotion ? 0 : 260);
    }
  }

  function createVisitorId() {
    const value = globalThis.crypto?.randomUUID?.() || `visitor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    storage.set('carruleddhi.visitorId', value);
    return value;
  }

  /* ADRES, KTÓRY GOŚĆ JUŻ NAM PODAŁ
     ---------------------------------------------------------------------------
     Zapis na wyścig, włączenie przypomnień i czat pytają o to samo: imię i adres. Każde
     z nich trzymało odpowiedź u siebie albo wcale, więc ktoś, kto właśnie się zapisał,
     w czacie dostawał puste pole „E-mail *". To jest pytanie „czy pamiętasz, co przed
     chwilą wpisałeś".

     Jedno miejsce na tę parę, wspólne dla wszystkich trzech dróg. Zostaje w tej
     przeglądarce i nigdzie indziej — nic tego nie wysyła, a czat i tak potwierdza adres
     pastylką, zanim go użyje (patrz `knownGateOffer`). Zapisywane DOPIERO po udanym
     żądaniu: adres, którego serwer nie przyjął, nie jest adresem, który znamy. */
  const PERSON_NAME_KEY = 'carruleddhi.person.name';
  const PERSON_EMAIL_KEY = 'carruleddhi.person.email';

  function rememberPerson(name, email) {
    const address = String(email || '').trim().toLowerCase();
    /* Ten sam wzorzec, którym pilnują się formularz zapisu i brama czatu. Bez niego
       zapamiętalibyśmy literówkę i podsuwali ją do potwierdzenia przy każdej rozmowie. */
    if (!/^[^s@]+@[^s@]+.[^s@]{2,}$/.test(address)) return;
    storage.set(PERSON_EMAIL_KEY, address);
    const person = String(name || '').trim().slice(0, 40);
    if (person) storage.set(PERSON_NAME_KEY, person);
  }

  function knownPerson() {
    return {
      name: storage.get(PERSON_NAME_KEY, '') || '',
      email: storage.get(PERSON_EMAIL_KEY, '') || ''
    };
  }

  async function loadGlobalCounts() {
    if (!config.endpoints.counts) return;
    /* Zdjęte PRZED zapisem nowych wartości. To jest cała naprawa tykającego licznika —
       patrz komentarz nad paintCounters. */
    const before = countsSnapshot();
    try {
      const result = await postJSON(config.endpoints.counts, eventPayload('counts'));
      const attendees = Number(result.attendees);
      const pilots = Number(result.pilots);
      if (result.attendees !== null && result.attendees !== undefined && Number.isFinite(attendees)) state.remoteAttendees = attendees;
      if (result.pilots !== null && result.pilots !== undefined && Number.isFinite(pilots)) state.remotePilots = pilots;
      // Two-letter initials for the avatar row. Filtered rather than trusted: this
      // is rendered with textContent, but keeping the shape tight means a change at
      // the other end cannot quietly turn a circle into a paragraph.
      if (Array.isArray(result.initials)) {
        state.riderInitials = result.initials
          .filter((value) => typeof value === 'string')
          .map((value) => value.trim().toUpperCase().slice(0, 2))
          .filter(Boolean);
      }
      paintCounters(true, before);
    } catch (error) {
      console.warn('Global counters are temporarily unavailable:', error);
    }
  }

  /**
   * Live counters.
   *
   * Polling only runs while a counter is actually on screen and the tab is in
   * the foreground. That keeps the numbers current without hammering the
   * backend.
   *
   * PIĘTNAŚCIE SEKUND, NIE CZTERDZIEŚCI PIĘĆ
   *   Czterdzieści pięć wzięło się z uzasadnienia, które przestało obowiązywać: „każde
   *   odpytanie kosztuje kredyty Make, więc stały licznik co pięć sekund wyczerpałby darmowy
   *   plan w ciągu dnia". To była prawda, gdy `counts` szło do Make'a. Dziś nie idzie —
   *   `counts` jest w SUPABASE_FIRST i odpowiada na nie Worker jednym zapytaniem do widoku
   *   `public_counts`, a nie zewnętrzna automatyka. Zostawiony argument o kredytach trzymał
   *   licznik trzy razy wolniejszym, niż musiał być.
   *
   *   Piętnaście, a nie pięć: to nadal jest widok agregujący, a różnica między „na żywo" i
   *   „co piętnaście sekund" jest dla człowieka patrzącego na licznik zapisów żadna. Odpytywanie
   *   chodzi tylko wtedy, gdy licznik jest na ekranie i karta jest z przodu, więc koszt
   *   ponosi wyłącznie ten, kto na to patrzy.
   */
  function setupLiveCounts() {
    if (!config.endpoints.counts) return;
    const targets = $$('[data-attendee-count], [data-pilots-count]');
    if (!targets.length) return;

    const intervalMs = 15000;
    let timer = 0;
    let visibleCount = 0;
    let lastFetch = 0;

    const refresh = () => {
      const now = Date.now();
      if (now - lastFetch < 5000) return;
      lastFetch = now;
      loadGlobalCounts();
    };

    function start() {
      if (timer) return;
      refresh();
      timer = window.setInterval(() => {
        if (document.hidden) return;
        refresh();
      }, intervalMs);
    }

    function stop() {
      window.clearInterval(timer);
      timer = 0;
    }

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          visibleCount += entry.isIntersecting ? 1 : -1;
        });
        visibleCount = Math.max(0, visibleCount);
        if (visibleCount > 0) start();
        else stop();
      }, { threshold: 0.1 });
      targets.forEach((target) => observer.observe(target));
    } else {
      start();
    }

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && visibleCount > 0) refresh();
    });
    window.addEventListener('pagehide', stop);
  }

  /**
   * Throws a short burst of paper from a point on screen.
   *
   * Pieces are position:fixed, animated by CSS only, and each one removes itself
   * on animationend. A safety timer removes it anyway in case the tab is hidden
   * mid-animation and animationend never arrives, otherwise a background tab
   * would slowly fill up with orphan nodes.
   */
  function burstConfetti(origin, count = 26) {
    if (reducedMotion || !origin) return;
    const box = origin.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const colours = ['#ffc928', '#f6494f', '#3f82f7', '#1fbf78', '#ffffff'];

    for (let i = 0; i < count; i += 1) {
      const piece = document.createElement('i');
      piece.className = 'confetti-piece';
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const distance = 110 + Math.random() * 190;
      const life = 1000 + Math.random() * 900;
      piece.style.left = `${cx}px`;
      piece.style.top = `${cy}px`;
      piece.style.background = colours[i % colours.length];
      piece.style.setProperty('--confetti-dx', `${Math.cos(angle) * distance}px`);
      piece.style.setProperty('--confetti-dy', `${Math.sin(angle) * distance + 200}px`);
      piece.style.setProperty('--confetti-spin', `${Math.round(Math.random() * 900 - 450)}deg`);
      piece.style.setProperty('--confetti-life', `${Math.round(life)}ms`);

      const remove = () => piece.remove();
      piece.addEventListener('animationend', remove, { once: true });
      window.setTimeout(remove, life + 400);
      document.body.appendChild(piece);
    }
  }

  /**
   * Drives the rainbow band at the bottom of the page.
   *
   * The band measures how much scroll is left before the end of the document. Once
   * that is within its own height it starts rising, and it is at full height
   * exactly when the page bottoms out. One custom property is written per frame and
   * only `transform: scaleY()` reads it, so this never triggers layout.
   *
   * offsetHeight is used rather than getBoundingClientRect because the element is
   * already scaled — the rect would report the squashed height and the maths would
   * feed on its own output.
   */
  function setupFooterGlow() {
    const band = $('[data-footer-glow]');
    if (!band) return;
    const minimum = 0.05;
    let frame = 0;

    /* WYSOKOŚĆ DOKUMENTU I PASA JEST PAMIĘTANA, NIE CZYTANA NA KLATKĘ.
       ---------------------------------------------------------------------------
       Stało tu `document.documentElement.scrollHeight` i `band.offsetHeight`, oba w funkcji
       wołanej z każdego zdarzenia przewijania. To są odczyty WYMUSZAJĄCE przeliczenie układu: żeby
       oddać wysokość dokumentu, przeglądarka musi policzyć pozycje wszystkiego, co w nim jest —
       a tu jest czternaście przypiętych paneli i trzynaście tysięcy pikseli.

       Komentarz wyżej mówi „only `transform: scaleY()` reads it, so this never triggers layout"
       i to jest prawda o ZAPISIE. Odczyt dwie linie wcześniej wymuszał układ i tak, więc funkcja
       robiła dokładnie to, czego wedle swojego opisu nie robiła.

       Żadna z tych dwóch liczb nie zmienia się w trakcie przewijania — zmienia je zmiana okna i
       zmiana wysokości treści, czyli dokładnie te trzy zdarzenia, które i tak są tu obsłużone.
       Więc pomiar idzie tam, a pętla przewijania czyta z pamięci i wykonuje jeden zapis. */
    let bandHeight = 1;
    let documentHeight = 0;
    const remeasure = () => {
      bandHeight = band.offsetHeight || 1;
      documentHeight = document.documentElement.scrollHeight;
    };

    const paint = () => {
      frame = 0;
      const left = documentHeight - window.innerHeight - window.scrollY;
      const progress = clamp((bandHeight - left) / bandHeight, 0, 1);
      band.style.setProperty(
        '--footer-glow-progress',
        (minimum + (1 - minimum) * progress).toFixed(4)
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const remeasureAndPaint = () => { remeasure(); schedule(); };

    remeasure();
    paint();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', remeasureAndPaint, { passive: true });
    /* Obserwator na `body` łapie każdą zmianę wysokości dokumentu, także tę z werdyktu
       `pinned`/`flow` w setupPanels — czyli jedyny przypadek, w którym wysokość zmienia się bez
       zmiany okna. */
    if ('ResizeObserver' in window) new ResizeObserver(remeasureAndPaint).observe(document.body);
  }

  /**
   * Public wall.
   *
   * Reads through the Worker, never straight from the database: the browser has no
   * key and should not have one. If the endpoint is not configured the whole
   * section removes itself rather than showing an empty box with a dead form —
   * a visible feature that cannot work is worse than one that is not there.
   */
  function setupWall() {
    const section = $('#wall');
    if (!section) return;
    const form = $('[data-wall-form]', section);
    const list = $('[data-wall-list]', section);
    const empty = $('[data-wall-empty]', section);
    const more = $('[data-wall-more]', section);
    const status = $('[data-wall-status]', section);
    const counter = $('[data-wall-count]', section);
    const messageField = form?.elements.namedItem('message');
    const endpoint = config.endpoints.wall || '';

    /**
     * The form, folded away behind a button.
     *
     * Most visitors are here to read what other people wrote, and the form is three fields, a
     * star picker and a photo upload. Open by default it was the first thing in a section
     * about reading.
     *
     * Animated by max-height on a wrapper rather than by `hidden`, because `height: auto` is
     * not animatable and a panel that snaps open reads as a bug on a page where everything
     * else eases. The inner div is what holds the padding, so the outer one can go to exactly
     * zero without leaving a sliver.
     */
    const openButton = $('[data-wall-open]', section);
    const fold = $('[data-wall-fold]', section);
    if (openButton && fold) {
      openButton.addEventListener('click', () => {
        const open = fold.classList.toggle('is-open');
        openButton.setAttribute('aria-expanded', String(open));
        openButton.classList.toggle('is-open', open);

        /* Tell the panel layout the section just changed height.
           ---------------------------------------------------------------------------
           This is the fix for "the next card lies on top of the form". Sections on this page
           are sticky panels, and setupPanels() decides per section whether it is short enough
           to pin (`position: sticky`, one screen tall, overflow hidden) or has to scroll
           normally. That decision was made once, at load, when this form was 0 px tall.

           Opening it adds about 540 px. The section then needed more than a screen while
           still marked as pinnable, so it stayed stuck at the top of the viewport with its
           lower half — the form — under the next panel, which sits above it in the z-order by
           construction.

           Fired twice on purpose: now, because the height changes the moment the class lands
           and the sooner the verdict is right the less there is to see, and again after the
           420 ms unfold so the final measurement is taken against the settled height rather
           than a value the transition was still moving through. */
        const relayout = () => window.dispatchEvent(new Event('carruleddhi:relayout'));
        relayout();
        window.setTimeout(relayout, 460);

        if (open) {
          /* Focus the first field, but only after the panel has somewhere to put it —
             focusing inside a zero-height box scrolls the page to the wrong place.

             `preventScroll` z tego samego powodu, co przy czacie (ef2949a): sekcje na tej
             stronie to przypięte panele, a `focus()` bez tej flagi przewija stronę do
             elementu tak, jak liczy to przeglądarka — czyli nie tam, gdzie widzi go
             człowiek. Ognisko ma postawić kursor w polu, a nie ruszać stroną; formularz
             i tak jest w kadrze, bo właśnie się rozwinął pod przyciskiem, który ktoś
             przed chwilą nacisnął. */
          window.setTimeout(() => $('#wall-name', section)?.focus({ preventScroll: true }), 260);
        }
      });
    }

    /* Demo mode keeps the section on the page even with no endpoint configured — the whole
       point is to look at it before anything is wired up. */
    if (!endpoint && !demoMode) {
      section.hidden = true;
      section.dataset.wallState = 'no-endpoint';
      return;
    }

    const starsBox = $('[data-wall-stars]', section);
    const starsClear = $('[data-wall-stars-clear]', section);
    const fileInput = $('#wall-file', section);
    const photoBox = $('[data-wall-photo]', section);
    const photoPreview = $('[data-wall-photo-preview]', section);
    const photoImage = $('[data-wall-photo-image]', section);
    const photoClear = $('[data-wall-photo-clear]', section);
    const photoHint = $('[data-wall-photo-hint]', section);
    const score = $('[data-wall-score]', section);
    const scoreValue = $('[data-wall-score-value]', section);
    const scoreStars = $('[data-wall-score-stars]', section);
    const scoreVotes = $('[data-wall-score-votes]', section);
    const lightbox = $('[data-wall-lightbox]', section);
    const lightboxImage = $('[data-wall-lightbox-image]', section);
    const lightboxCaption = $('[data-wall-lightbox-caption]', section);
    const lightboxClose = $('[data-wall-lightbox-close]', section);

    /**
     * postJSON, but a rejected request comes back as its body instead of throwing.
     *
     * The wall needs to tell "you posted a minute ago" from "the wall is broken", and
     * both arrive as a non-2xx status. Everything here goes through this wrapper so
     * that distinction survives.
     */
    const ask = (payload) => postJSON(endpoint, payload)
      .catch((error) => error?.payload || null);

    let oldest = '';
    let loading = false;
    /** The downscaled data URL waiting to be sent, and its size after downscaling. */
    let pendingPhoto = null;
    /**
     * Translations already fetched, keyed by comment id and target language.
     *
     * Kept for the life of the page so pressing translate, then the original, then
     * translate again costs one request rather than three. It is deliberately not
     * persisted: a cache in storage would outlive a corrected message.
     */
    const translations = new Map();

    /* --- photo, downscaled in the browser ---------------------------------------
       A phone photo is 3–5 MB and 4000 px wide. Sending it as-is would mean a slow
       upload on the mobile connection these are taken on, a bucket full of images
       nobody will ever view at full size, and a request most likely rejected for
       being too large. Resizing here costs a few milliseconds of canvas work.

       `imageOrientation: 'from-image'` matters more than it looks: without it every
       photo taken in portrait on a phone arrives rotated, because the sensor writes
       it landscape and leaves the rotation in the EXIF header that canvas ignores. */
    const PHOTO_MAX_EDGE = 1600;
    const PHOTO_QUALITY = 0.82;

    async function loadBitmap(file) {
      if ('createImageBitmap' in window) {
        try {
          return await createImageBitmap(file, { imageOrientation: 'from-image' });
        } catch (_) { /* Safari below 15 lacks the option; fall through. */ }
        try {
          return await createImageBitmap(file);
        } catch (_) { /* fall through to the <img> path */ }
      }
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
        image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
        image.src = url;
      });
    }

    async function shrinkPhoto(file) {
      const source = await loadBitmap(file);
      const sourceWidth = source.width || source.naturalWidth;
      const sourceHeight = source.height || source.naturalHeight;
      if (!sourceWidth || !sourceHeight) throw new Error('empty image');

      const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(sourceWidth, sourceHeight));
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      context.drawImage(source, 0, 0, width, height);
      if (source.close) source.close();

      // Always JPEG on the way out, whatever came in. A 12 MP PNG re-encodes to
      // several megabytes; the same picture as JPEG is a few hundred kilobytes and
      // indistinguishable at the size it is shown.
      const dataUrl = canvas.toDataURL('image/jpeg', PHOTO_QUALITY);
      return { dataUrl, width, height, bytes: Math.round((dataUrl.length - 23) * 0.75) };
    }

    function dropPhoto() {
      pendingPhoto = null;
      if (fileInput) fileInput.value = '';
      if (photoImage) photoImage.removeAttribute('src');
      if (photoPreview) photoPreview.hidden = true;
      if (photoBox) photoBox.dataset.state = 'empty';
      if (photoHint) photoHint.textContent = text('wall.photoHint');
    }

    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return dropPhoto();
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
        if (photoHint) photoHint.textContent = text('wall.photoType');
        fileInput.value = '';
        return;
      }
      if (photoBox) photoBox.dataset.state = 'working';
      if (photoHint) photoHint.textContent = text('wall.photoWorking');
      try {
        pendingPhoto = await shrinkPhoto(file);
        if (photoImage) photoImage.src = pendingPhoto.dataUrl;
        if (photoPreview) photoPreview.hidden = false;
        if (photoBox) photoBox.dataset.state = 'ready';
        if (photoHint) {
          photoHint.textContent = text('wall.photoReady')
            .replace('%KB%', String(Math.max(1, Math.round(pendingPhoto.bytes / 1024))));
        }
      } catch (_) {
        dropPhoto();
        if (photoHint) photoHint.textContent = text('wall.photoFailed');
      }
    });

    photoClear?.addEventListener('click', dropPhoto);

    /* --- stars ---------------------------------------------------------------- */
    function currentRating() {
      const picked = form ? form.querySelector('.wall-stars__input:checked') : null;
      return picked ? Number(picked.value) : 0;
    }
    function paintStarState() {
      const value = currentRating();
      if (starsBox) starsBox.dataset.value = String(value);
      if (starsClear) starsClear.hidden = value === 0;
    }
    starsBox?.addEventListener('change', paintStarState);
    starsClear?.addEventListener('click', () => {
      $$('.wall-stars__input', section).forEach((input) => { input.checked = false; });
      paintStarState();
    });
    paintStarState();

    /* --- the average, shown only once somebody has voted ---------------------- */
    function paintScore(summary) {
      if (!score) return;
      const votes = Number(summary?.votes) || 0;
      const average = Number(summary?.average) || 0;
      if (!votes) { score.hidden = true; return; }
      score.hidden = false;
      if (scoreValue) scoreValue.textContent = average.toLocaleString(state.lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      // Rounded to halves, so 4.3 reads as four and a half rather than as five.
      if (scoreStars) {
        const filled = Math.round(average * 2) / 2;
        scoreStars.replaceChildren();
        for (let index = 1; index <= 5; index += 1) {
          const star = document.createElement('i');
          star.className = 'wall-score__star';
          star.dataset.fill = filled >= index ? 'full' : (filled >= index - 0.5 ? 'half' : 'none');
          scoreStars.appendChild(star);
        }
      }
      if (scoreVotes) scoreVotes.textContent = text('wall.votes').replace('%N%', String(votes));
    }

    const relative = (iso) => {
      const then = new Date(iso).getTime();
      if (!Number.isFinite(then)) return '';
      const minutes = Math.round((Date.now() - then) / 60000);
      if (minutes < 1) return text('wall.justNow');
      if (minutes < 60) return `${minutes} min`;
      const hours = Math.round(minutes / 60);
      if (hours < 24) return `${hours} h`;
      return new Date(iso).toLocaleDateString(state.lang, { day: 'numeric', month: 'short' });
    };

    /* --- lightbox -------------------------------------------------------------
       Opened with showModal(), so the browser supplies the focus trap, the backdrop
       and Escape. The only thing left to do by hand is the click on the backdrop,
       which lands on the dialog element itself rather than on its contents. */
    function openLightbox(src, caption) {
      if (!lightbox || !lightboxImage) return;
      lightboxImage.src = src;
      if (lightboxCaption) lightboxCaption.textContent = caption || '';
      if (typeof lightbox.showModal === 'function') lightbox.showModal();
      else lightbox.setAttribute('open', '');
    }
    function closeLightbox() {
      if (!lightbox) return;
      if (typeof lightbox.close === 'function') lightbox.close();
      else lightbox.removeAttribute('open');
      // Dropped on the way out so a large image is not held in memory, and so the
      // next open never shows the previous photo for a frame.
      if (lightboxImage) lightboxImage.removeAttribute('src');
    }
    lightboxClose?.addEventListener('click', closeLightbox);
    lightbox?.addEventListener('click', (event) => {
      if (event.target === lightbox) closeLightbox();
    });
    lightbox?.addEventListener('close', () => {
      if (lightboxImage) lightboxImage.removeAttribute('src');
    });

    /** Five static stars for one comment's score. */
    function starRow(value) {
      const row = document.createElement('span');
      row.className = 'wall-note__stars';
      row.setAttribute('role', 'img');
      row.setAttribute('aria-label', text('wall.ratedAs').replace('%N%', String(value)));
      for (let index = 1; index <= 5; index += 1) {
        const star = document.createElement('i');
        star.dataset.fill = index <= value ? 'full' : 'none';
        row.appendChild(star);
      }
      return row;
    }

    /**
     * Translation is a button, not something done on load.
     *
     * Translating every message automatically would mean one API call per message per
     * visitor against a free, rate-limited service, and would replace what somebody
     * actually wrote with a machine's guess at it. Pressing it again puts the original
     * back, and the original is what stays in the DOM until then.
     */
    function attachTranslate(item, comment, body) {
      if (!comment.message || comment.message.length < 3) return null;
      const target = state.lang;
      const from = (comment.locale || 'it').slice(0, 2);
      if (from === target) return null;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'wall-note__translate';
      button.textContent = text('wall.translate');

      let showing = 'original';
      button.addEventListener('click', async () => {
        if (showing === 'translated') {
          body.textContent = comment.message;
          item.dataset.translated = 'false';
          button.textContent = text('wall.translate');
          showing = 'original';
          return;
        }

        const key = `${comment.id}:${target}`;
        if (translations.has(key)) {
          body.textContent = translations.get(key);
          item.dataset.translated = 'true';
          button.textContent = text('wall.showOriginal');
          showing = 'translated';
          return;
        }

        button.disabled = true;
        button.textContent = text('wall.translating');
        const result = await ask({
          type: 'wall-translate',
          text: comment.message,
          from,
          to: target
        });
        button.disabled = false;

        if (result?.ok && result.text) {
          translations.set(key, result.text);
          body.textContent = result.text;
          item.dataset.translated = 'true';
          button.textContent = text('wall.showOriginal');
          showing = 'translated';
        } else {
          button.textContent = text('wall.translateFailed');
          // Back to the offer after a moment, so a single failure is not permanent.
          window.setTimeout(() => { button.textContent = text('wall.translate'); }, 2600);
        }
      });
      return button;
    }

    /** textContent everywhere: these strings come from strangers. */
    function render(comments, append) {
      if (!append) list.replaceChildren();
      for (const comment of comments) {
        const item = document.createElement('li');
        item.className = 'wall-note';
        /* Karteczki stoją prosto.
           ---------------------------------------------------------------------------
           Był tu losowy kąt od -1,2° do +1,2°, żeby wyglądały jak przypięte do korkowej
           tablicy. Zgłoszone jako „komentarze są krzywe i ucięte" — i oba objawy pochodzą
           stąd. Krzywe, bo taki był zamiar. Ucięte, bo obrócony prostokąt jest szerszy i
           wyższy niż nieobrócony, więc jego rogi wychodzą za kontener i tam znikają.

           Przekrzywienie zostawało już wcześniej wyłączane na telefonie osobną regułą, co
           samo w sobie było przyznaniem, że efekt przeszkadza. Teraz nie ma go nigdzie i nie
           ma czego wyłączać — pinezka nad karteczką wystarcza, żeby to była tablica
           ogłoszeniowa, a nie lista.

           Zmienna zostaje w CSS z wartością domyślną `0deg`, więc nic nie trzeba zmieniać w
           arkuszu, a przywrócenie efektu to jedna linijka tutaj. */

        if (comment.rating) item.appendChild(starRow(comment.rating));

        const body = document.createElement('p');
        body.className = 'wall-note__text';
        body.textContent = comment.message;
        item.appendChild(body);

        if (comment.photo) {
          const figure = document.createElement('button');
          figure.type = 'button';
          figure.className = 'wall-note__photo';
          figure.setAttribute('aria-label', text('wall.openPhoto'));
          const thumb = document.createElement('img');
          thumb.src = comment.photo;
          thumb.alt = '';
          thumb.loading = 'lazy';
          thumb.decoding = 'async';
          // Known up front, so the note does not jump when the image arrives.
          if (comment.photoWidth && comment.photoHeight) {
            thumb.width = comment.photoWidth;
            thumb.height = comment.photoHeight;
          }
          figure.appendChild(thumb);
          figure.addEventListener('click', () => {
            openLightbox(comment.photo, `${comment.name}${comment.place ? ` — ${comment.place}` : ''}`);
          });
          item.appendChild(figure);
        }

        const meta = document.createElement('div');
        meta.className = 'wall-note__meta';

        /* An avatar for everybody, generated rather than uploaded.
           ---------------------------------------------------------------------------
           Initials in a coloured disc, and the colour comes from the name — not from
           Math.random(). Random would mean the same person is a different colour on every
           repaint, and this list repaints on sort, on "load more" and on a language change,
           so somebody would visibly change identity while being read.

           A tiny hash over the characters gives one of six palette slots: stable for a given
           name, spread evenly enough across different ones. Nothing is stored and nothing is
           requested over the network — no service, no tracking pixel, no image to wait for. */
        const avatar = document.createElement('span');
        avatar.className = 'wall-note__avatar';
        avatar.setAttribute('aria-hidden', 'true');
        const initials = String(comment.name || '?')
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part[0] || '')
          .join('')
          .toUpperCase() || '?';
        avatar.textContent = initials;
        /* FNV-1a, not `(h * 31 + c) % 997`.
           The multiply-and-take-a-prime version spread badly here: 997 mod 6 is 1, so the
           final `% 6` inherited that bias and six different names came out in two colours.
           Measured on the demo set — two tones out of six. FNV mixes every bit of the input
           into the accumulator, so the low bits are usable on their own. */
        let hash = 2166136261;
        for (const char of String(comment.name || '')) {
          hash ^= char.codePointAt(0);
          hash = Math.imul(hash, 16777619);
        }
        avatar.dataset.tone = String(Math.abs(hash) % 6);
        meta.appendChild(avatar);

        const who = document.createElement('div');
        who.className = 'wall-note__who';
        const name = document.createElement('strong');
        name.textContent = comment.name;
        who.appendChild(name);
        if (comment.place) {
          const where = document.createElement('span');
          where.textContent = comment.place;
          who.appendChild(where);
        }
        meta.appendChild(who);

        const when = document.createElement('time');
        when.dateTime = comment.createdAt;
        when.textContent = relative(comment.createdAt);
        meta.appendChild(when);

        item.appendChild(meta);

        /* The translate link goes after the footer, not inside it.
           The footer is a fixed three-column grid now — avatar, name, time — so a fourth
           child would either land in an implicit column and squash the name, or wrap the row
           onto two lines in exactly the notes that have a translation available. */
        const translate = attachTranslate(item, comment, body);
        if (translate) item.appendChild(translate);
        list.appendChild(item);
      }
      const total = list.children.length;
      if (empty) empty.hidden = total > 0;
      list.setAttribute('aria-busy', 'false');
    }

    /* --- sorting -------------------------------------------------------------
       Done here rather than in the query. The endpoint returns the newest twelve and
       paginates by timestamp, so "highest rated first" cannot be a server sort without
       either fetching everything or a second index and a second code path. Sorting what is
       already on screen is honest about what it does — it reorders the loaded comments, and
       "load more" keeps adding older ones underneath. */
    let sortMode = 'new';
    let loaded = [];

    /**
     * How many notes are on screen.
     *
     * The board used to be a fixed-height box with its own scrollbar — a scrolling box inside
     * a scrolling page, which on a phone means the wrong thing moves depending on where your
     * thumb lands. The cap is on the number rendered instead, and "show more" raises it.
     *
     * Six to start, because the list is three masonry columns on a wide screen: four notes
     * leaves the third column holding one, which looks like something failed to load rather
     * than like a choice. Six fills every column at least twice and is still short enough that
     * the section is not a wall of text before you have decided to read any of it.
     */
    const FIRST_BATCH = 6;
    const NEXT_BATCH = 6;
    let shown = FIRST_BATCH;

    const sorters = {
      new: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
      old: (a, b) => String(a.createdAt).localeCompare(String(b.createdAt)),
      best: (a, b) => (b.rating || 0) - (a.rating || 0)
        // A tie on stars falls back to newest, so the order is stable and not accidental.
        || String(b.createdAt).localeCompare(String(a.createdAt))
    };

    function repaint() {
      const ordered = [...loaded].sort(sorters[sortMode] || sorters.new);
      render(ordered.slice(0, shown), false);

      /* The sort controls only earn their space once there is something to sort. Decided here
         rather than after the fetch, so demo mode — which never fetches — gets them too, and
         there is one place that knows instead of two. */
      const bar = $('[data-wall-sortbar]', section);
      if (bar) bar.hidden = loaded.length < 3;

      /* "Show more" now means two different things and has to tell them apart: there may be
         notes already loaded but not yet rendered, and there may be older ones still on the
         server. Local first, because it costs nothing. */
      if (more) more.hidden = shown >= ordered.length && !serverHasMore;

      /* WYSOKOŚĆ SEKCJI WŁAŚNIE SIĘ ZMIENIŁA — TRZEBA TO POWIEDZIEĆ.
         ---------------------------------------------------------------------------
         To jest przyczyna zgłoszenia „wysyłam komentarz i przeskakuje mnie gdzieś wyżej".
         `#wall` jest przypiętym panelem: setupPanels() rozstrzyga po JEGO WYSOKOŚCI, czy
         sekcja mieści się na ekranie i ma zostać `sticky`, czy przewija się normalnie. Ten
         werdykt zapada raz i jest odświeżany wyłącznie na `carruleddhi:relayout`.

         Każde przerysowanie listy zmienia tę wysokość — dodany komentarz, inne sortowanie,
         „pokaż więcej". Dotąd nikt o tym nie mówił, więc panel zostawał z werdyktem policzonym
         dla poprzedniej wysokości, a przy najbliższym przeliczeniu przeskakiwał do właściwego
         układu, zabierając ze sobą pozycję przewijania.

         Jedno miejsce, nie cztery: `repaint()` jest wspólnym wyjściem wszystkich tych ścieżek.
         Ta sama poprawka co przy rozwijaniu formularza wyżej, tylko tam była już zrobiona. */
      window.dispatchEvent(new Event('carruleddhi:relayout'));
    }

    /** Whether the server said there are older notes past what has been fetched. */
    let serverHasMore = false;

    $$('[data-wall-sort]', section).forEach((button) => {
      button.addEventListener('click', () => {
        sortMode = button.dataset.wallSort;
        $$('[data-wall-sort]', section).forEach((other) => {
          const active = other === button;
          other.classList.toggle('is-active', active);
          other.setAttribute('aria-pressed', String(active));
        });
        repaint();
      });
    });

    async function load(append = false) {
      if (loading) return;

      /* Demo mode answers locally. Not a mock of the endpoint — the same render() and the
         same score bar, given a fixed list, so what you are looking at is the real layout
         with placeholder words in it. */
      if (demoMode) {
        loaded = demoComments();
        serverHasMore = false;
        repaint();
        paintScore(demoRating());
        return;
      }

      loading = true;
      const result = await ask({
        type: 'wall',
        limit: 12,
        ...(append && oldest ? { before: oldest } : {})
      });
      loading = false;

      if (!result?.ok || !Array.isArray(result.comments)) {
        list.setAttribute('aria-busy', 'false');
        if (empty) {
          empty.hidden = false;
          empty.textContent = text('wall.error');
        }
        return;
      }
      // Kept so the sort buttons have something to reorder without asking again.
      loaded = append ? [...loaded, ...result.comments] : result.comments;
      serverHasMore = Boolean(result.hasMore);
      if (result.comments.length) oldest = result.comments[result.comments.length - 1].createdAt;
      repaint();
      paintScore(result.rating);
    }

    messageField?.addEventListener('input', () => {
      if (counter) counter.textContent = String(messageField.value.length);
    });

    /* Reveal what is already here first, and only ask the server once there is nothing left to
       reveal. Pressing this should never cost a request it did not need to make. */
    more?.addEventListener('click', () => {
      const ordered = loaded.length;
      if (shown < ordered) {
        shown += NEXT_BATCH;
        repaint();
        return;
      }
      shown += NEXT_BATCH;
      load(true);
    });

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = String(form.elements.namedItem('name').value || '').trim();
      const message = String(messageField.value || '').trim();
      if (name.length < 1 || message.length < 2) {
        if (status) status.textContent = text('validation.required');
        return;
      }

      /* E-mail sprawdzany TYLKO wtedy, gdy ktoś coś wpisał.
         ---------------------------------------------------------------------------
         Pole jest opcjonalne, więc puste jest poprawne. Ale adres z literówką jest gorszy
         niż brak adresu: wygląda na drogę odpowiedzi, której nie ma, a organizator dowie się
         o tym dopiero po odbiciu wiadomości — czyli wtedy, gdy nie ma już jak dopytać.

         Zaznaczane na polu przez `is-invalid`, a nie tylko w pasku statusu na dole: pasek jest
         wspólny dla całego formularza i przy trzech polach nie mówi, które z nich poprawić. */
      const emailField = form.elements.namedItem('email');
      const email = String(emailField?.value || '').trim();
      const emailHolder = emailField?.closest('[data-field]');
      emailHolder?.classList.remove('is-invalid');
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        emailHolder?.classList.add('is-invalid');
        if (status) status.textContent = text('validation.email');
        emailField?.focus({ preventScroll: true });
        return;
      }
      const submit = $('button[type="submit"]', form);
      if (submit) submit.disabled = true;
      if (status) status.textContent = text('wall.sending');

      const rating = currentRating();
      const result = await ask({
        type: 'wall-post',
        name,
        place: String(form.elements.namedItem('place').value || '').trim(),
        message,
        // Pusty adres nie jedzie wcale, zamiast jechać jako pusty napis — inaczej w bazie
        // rosłaby kolumna pełna `''`, których nie da się odróżnić od „nie podano".
        ...(email ? { email } : {}),
        ...(rating ? { rating } : {}),
        ...(pendingPhoto
          ? {
            photo: pendingPhoto.dataUrl,
            photoWidth: pendingPhoto.width,
            photoHeight: pendingPhoto.height
          }
          : {})
      });

      if (submit) submit.disabled = false;
      if (result?.ok) {
        form.reset();
        dropPhoto();
        paintStarState();
        if (counter) counter.textContent = '0';
        /* "It is on the wall", not "it is waiting to be read".
           The server approves on insert since migration 0015, and the old wording promised a
           review that no longer happens — so somebody would look for their message, not find
           the notice they had been told to expect, and write it again. `pending` is still
           read from the response rather than assumed, so a return to moderation needs no
           change here. */
        if (status) status.textContent = text(result.pending ? 'wall.pending' : 'wall.published');
        burstConfetti(submit, 18);
        /* And it appears without reloading the page. Posting into a list that does not change
           is the other half of the same problem: the confirmation says it is up, and the wall
           right underneath still does not show it.
           `load(false)` and not `load(true)`: the new message is the newest, so the first page
           has to be fetched again rather than an older page appended. */
        if (!result.pending) {
          /* CZYTAJĄCY ZOSTAJE TAM, GDZIE BYŁ.
             Nowy komentarz wchodzi na początek listy, czyli NAD formularzem, w który ktoś
             właśnie pisał — a lista rośnie o kilkadziesiąt pikseli. Bez zakotwiczenia strona
             zjeżdża o tę różnicę i potwierdzenie „jest na tablicy" ląduje poza kadrem, razem
             z komentarzem, o który cała rzecz szła.

             Pozycja przywracana tylko wtedy, gdy naprawdę uciekła: skok o kilka pikseli bywa
             zwykłym zaokrągleniem, a `scrollTo` na każde wysłanie byłoby ruchem strony w
             odpowiedzi na coś, co się nie stało. */
          const anchor = window.scrollY;
          await load(false);
          if (Math.abs(window.scrollY - anchor) > 8) {
            window.scrollTo({ top: anchor, behavior: 'instant' });
          }
        }
      } else if (result?.code === 'WALL_RATE_LIMITED') {
        if (status) status.textContent = text('wall.tooMany');
      } else if (result?.code === 'WALL_PHOTO_TOO_LARGE' || result?.code === 'PAYLOAD_TOO_LARGE') {
        if (status) status.textContent = text('wall.photoTooBig');
      } else if (result?.code === 'WALL_PHOTO_FORMAT' || result?.code === 'WALL_PHOTO_FAILED') {
        if (status) status.textContent = text('wall.photoFailed');
      } else {
        if (status) status.textContent = text('wall.error');
      }
    });

    /* Loaded when the section gets close, not at startup: nobody needs a database round
       trip to read the hero.
       The timer is not padding. The same pattern in the text effects turned out to leave
       six headings invisible because the observer callback never ran, and here the failure
       is a comment wall that is permanently empty while the endpoint is fine. Whichever
       comes first wins, and `once` makes sure only one of them loads. */
    let started = false;
    const once = () => {
      if (started) return;
      started = true;
      load(false);
    };

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        once();
      }, { rootMargin: '600px 0px' });
      observer.observe(section);
      // Six seconds is longer than any scroll down to this section and short enough that a
      // starved observer costs a late list rather than no list.
      window.setTimeout(once, 6000);
    } else {
      once();
    }
  }

  function setupAttendance() {
    paintCounters(false);
    refreshAttendanceLabels();
    loadGlobalCounts();
    const press = $('[data-attendance-button]');
    press?.addEventListener('click', () => {
      burstConfetti(press, 34);
      registerAttendance(true);
    });
    $$('[data-quick-attend]').forEach((button) => {
      button.addEventListener('click', () => {
        burstConfetti(button, 16);
        registerAttendance(false, button);
      });
    });
  }

  function setupQuickActions() {
    const dock = $('[data-quick-actions]');
    if (!dock) return;
    /**
     * The dock hides while a real button for the same thing is on screen.
     *
     * It used to watch the #signup and #contact sections, which is nearly right and
     * wrong at the top of the page: the hero has "Iscriviti alla gara" and "Ci sarò"
     * in view, and the dock sat underneath offering exactly those two again. Two of
     * the same button on one screen makes both look like a guess.
     *
     * Watching the controls instead of the sections also means the dock reappears the
     * moment the hero scrolls away, which is the point at which it starts being useful
     * rather than redundant.
     */
    /* Lista obejmuje WSZYSTKIE fazy, nie tylko tę przed startem.
       Odkąd dok zmienia się z fazą wyścigu, „to samo, co na ekranie" znaczy co innego w
       każdej z nich: w trakcie rywalem jest zaproszenie do głosowania w hero, po dekoracji
       — przejście na cokół. Przeoczenie ich dawałoby dokładnie to masło maślane, które ten
       kod miał usuwać: „Zagłosuj teraz" na dole ekranu, na którym „Zagłosuj" stoi już w
       hero.

       Ukryte elementy nie przecinają się z widokiem, więc obserwator sam pomija te, których
       akurat nie ma — lista może być zbudowana raz, przed pierwszym odczytem fazy. */
    const rivals = [
      ...$$('a[href="#signup"]'),
      ...$$('[data-open-reminder]'),
      ...$$('[data-vote-cta]'),
      ...$$('[data-race-podium], a[href="#podium"]')
    ].filter(Boolean).filter((element) => !dock.contains(element));

    /* Przyciski wymienione po cichu wyglądają na usterkę odświeżania. Gdy faza się zmienia —
       zamknięto głosowanie, otwarto je — skład doku jest inny niż sekundę wcześniej, więc
       niech wjedzie tak samo, jak wjeżdża po rozwinięciu. Ta sama klasa, ta sama animacja,
       to samo `440 ms + zapas`, więc nie ma tu drugiego czasu do pilnowania. */
    document.addEventListener('carruleddhi:phase', () => {
      dock.classList.remove('is-expanding');
      void dock.offsetWidth;
      dock.classList.add('is-expanding');
      window.setTimeout(() => dock.classList.remove('is-expanding'), 460);
    });

    const onScreen = new Set();

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) onScreen.add(entry.target);
          else onScreen.delete(entry.target);
        });
        dock.classList.toggle('is-over-form', onScreen.size > 0);
      }, { threshold: 0.08 });
      rivals.forEach((element) => observer.observe(element));
    }

    const formControlSelector = 'input, textarea, select, [contenteditable="true"]';
    document.addEventListener('focusin', (event) => {
      if (event.target.matches?.(formControlSelector)) dock.classList.add('is-keyboard-hidden');
    });
    document.addEventListener('focusout', () => {
      window.setTimeout(() => {
        if (!document.activeElement?.matches?.(formControlSelector)) dock.classList.remove('is-keyboard-hidden');
      }, 80);
    });

    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', () => {
      dock.classList.toggle('is-keyboard-hidden', viewport.height < window.innerHeight * 0.72);
    }, { passive: true });

    /**
     * The dock shrinks to two icons while you are reading, and one tap brings the
     * labels back.
     *
     * The first tap on a shrunken dock must not also press the button underneath
     * it. Icon-only targets are ambiguous — you cannot tell "I'll be there" from
     * "sign up" at a glance — and firing an action from a guess is worse than
     * asking for a second tap. The listener runs in the capture phase so it can
     * swallow that first tap before either control sees it.
     *
     * It re-shrinks after eight seconds of no interaction, and immediately when
     * you scroll again, so it never sits there covering content.
     */
    const MINI_AFTER = 180;
    const EXPANDED_FOR = 8000;
    let expandTimer = 0;
    let lastY = window.scrollY;
    let pinnedOpen = false;

    const shrink = () => {
      pinnedOpen = false;
      window.clearTimeout(expandTimer);
      dock.classList.add('is-mini');
      dock.setAttribute('aria-expanded', 'false');
    };
    const expand = (sticky) => {
      const wasMini = dock.classList.contains('is-mini');
      dock.classList.remove('is-mini');
      dock.setAttribute('aria-expanded', 'true');
      window.clearTimeout(expandTimer);
      if (wasMini) {
        dock.classList.add('is-expanding');
        window.setTimeout(() => dock.classList.remove('is-expanding'), 460);
      }
      if (!sticky) return;
      pinnedOpen = true;
      expandTimer = window.setTimeout(shrink, EXPANDED_FOR);
    };

    dock.addEventListener('click', (event) => {
      if (!dock.classList.contains('is-mini')) return;
      event.preventDefault();
      event.stopPropagation();
      expand(true);
    }, true);

    // Keyboard users never get a mini dock they cannot read.
    dock.addEventListener('focusin', () => expand(true));
    document.addEventListener('pointerdown', (event) => {
      if (pinnedOpen && !dock.contains(event.target)) shrink();
    }, { passive: true });

    /**
     * Shrinks only after you have been scrolling down for a while, not on the first
     * pixel. Snapping shut the instant a finger moves is what made it feel twitchy;
     * 420 ms of continuous downward scrolling is long enough to mean "I am reading",
     * short enough not to feel laggy.
     */
    let scrollFrame = 0;
    let downSince = 0;
    const SHRINK_DELAY = 420;

    const onScroll = () => {
      scrollFrame = 0;
      const y = window.scrollY;
      const goingDown = y > lastY + 2;
      const goingUp = y < lastY - 2;
      lastY = y;
      if (pinnedOpen) return;

      if (y < MINI_AFTER || goingUp) {
        downSince = 0;
        dock.classList.remove('is-mini');
        dock.setAttribute('aria-expanded', 'true');
        return;
      }
      if (!goingDown) return;
      if (!downSince) { downSince = performance.now(); return; }
      if (performance.now() - downSince > SHRINK_DELAY) shrink();
    };
    window.addEventListener('scroll', () => {
      if (!scrollFrame) scrollFrame = requestAnimationFrame(onScroll);
    }, { passive: true });
    onScroll();

    /**
     * Hold and it gives a little, release and it springs home.
     *
     * The movement is damped to a third of the finger's travel and capped, so it
     * reads as elastic resistance rather than a draggable panel — it is not meant
     * to be repositioned, just to feel alive under the thumb. A drag beyond 6 px
     * cancels the click, otherwise nudging the dock would fire whichever button was
     * underneath.
     */
    let hold = null;
    let holdFrame = 0;

    const paintHold = () => {
      holdFrame = 0;
      if (!hold) return;
      const damp = 0.34;
      const limit = 16;
      const dx = clamp(hold.dx * damp, -limit, limit);
      const dy = clamp(hold.dy * damp, -limit, limit);
      dock.style.setProperty('--dock-nudge-x', `${dx.toFixed(1)}px`);
      dock.style.setProperty('--dock-nudge-y', `${dy.toFixed(1)}px`);
    };

    dock.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      hold = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0, moved: false };
      dock.classList.add('is-held');
      try { dock.setPointerCapture(event.pointerId); } catch (_) { /* unsupported pointer */ }
    });

    dock.addEventListener('pointermove', (event) => {
      if (!hold || event.pointerId !== hold.id) return;
      hold.dx = event.clientX - hold.x;
      hold.dy = event.clientY - hold.y;
      if (Math.abs(hold.dx) > 6 || Math.abs(hold.dy) > 6) hold.moved = true;
      if (!holdFrame) holdFrame = requestAnimationFrame(paintHold);
    });

    const releaseHold = () => {
      if (!hold) return;
      const moved = hold.moved;
      hold = null;
      cancelAnimationFrame(holdFrame);
      holdFrame = 0;
      dock.classList.remove('is-held');
      // Springs back through the CSS transition, which only applies without .is-held.
      dock.style.setProperty('--dock-nudge-x', '0px');
      dock.style.setProperty('--dock-nudge-y', '0px');
      if (moved) {
        // Swallow the click that would otherwise follow the drag.
        const swallow = (event) => { event.preventDefault(); event.stopPropagation(); };
        dock.addEventListener('click', swallow, { capture: true, once: true });
        window.setTimeout(() => dock.removeEventListener('click', swallow, { capture: true }), 60);
      }
    };
    dock.addEventListener('pointerup', releaseHold);
    dock.addEventListener('pointercancel', releaseHold);
    dock.addEventListener('lostpointercapture', releaseHold);
  }

  function modalFocusable(modal) {
    return $$('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]', modal)
      .filter((element) => element.offsetParent !== null);
  }

  function modalBackgroundElements(modal) {
    return $$('body > *').filter((element) => element !== modal && element.tagName !== 'SCRIPT');
  }

  function openReminder() {
    const modal = $('[data-reminder-modal]');
    if (!modal) return;
    state.lastFocused = document.activeElement;
    state.reminderScrollY = window.scrollY;
    const subscribed = storage.get('carruleddhi.reminder') === '1';
    $('[data-reminder-form-view]', modal)?.classList.toggle('is-hidden', subscribed);
    $('[data-reminder-success]', modal)?.classList.toggle('is-visible', subscribed);
    modalBackgroundElements(modal).forEach((element) => {
      element.dataset.modalWasInert = String(element.inert);
      element.inert = true;
    });
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-locked', 'is-modal-open');
    window.setTimeout(() => {
      modalFocusable(modal)[0]?.focus({ preventScroll: true });
      if (Math.abs(window.scrollY - state.reminderScrollY) > 1) {
        window.scrollTo({ top: state.reminderScrollY, behavior: 'auto' });
      }
    }, 30);
  }

  function closeReminder() {
    const modal = $('[data-reminder-modal]');
    if (!modal) return;
    const savedY = Number.isFinite(state.reminderScrollY) ? state.reminderScrollY : window.scrollY;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    modalBackgroundElements(modal).forEach((element) => {
      const wasInert = element.dataset.modalWasInert === 'true';
      element.inert = wasInert;
      delete element.dataset.modalWasInert;
    });
    document.body.classList.toggle('is-locked', Boolean($('[data-mobile-menu].is-open')));
    document.body.classList.remove('is-modal-open');
    const focusTarget = state.lastFocused?.closest?.('[data-mobile-menu]')
      ? $('[data-menu-toggle]')
      : state.lastFocused;
    focusTarget?.focus?.({ preventScroll: true });
    if (Math.abs(window.scrollY - savedY) > 1) {
      window.scrollTo({ top: savedY, behavior: 'auto' });
    }
  }

  function focusControl(control) {
    if (!control) return;
    const picker = control.matches?.('[data-date-input]') ? control.closest('[data-date-picker]') : null;
    const dateTrigger = picker ? $('[data-date-trigger]', picker) : null;
    const target = dateTrigger && !dateTrigger.hidden ? dateTrigger : control;
    target?.focus({ preventScroll: true });
  }

  function markField(control, valid) {
    const field = control.closest('[data-field]');
    field?.classList.toggle('is-invalid', !valid);
    control.setAttribute('aria-invalid', String(!valid));
    return valid;
  }

  /**
   * CYFRA W IMIENIU I NAZWISKU — JEDEN WZORZEC NA CAŁĄ STRONĘ
   * ---------------------------------------------------------------------------
   * `\p{Nd}` z flagą `u`: dziesiętna cyfra w JAKIMKOLWIEK piśmie, a nie tylko `0-9`.
   *
   * DLACZEGO NIE `[^A-Za-z\s'-]`, CZYLI „WSZYSTKO POZA LITERAMI ŁACIŃSKIMI"
   *   Bo to odrzuciłoby połowę nazwisk na tej stronie. Zapisy przychodzą z Sardynii, z Polski,
   *   z Hiszpanii i z Niemiec: D'Angelo, Sanna-Pinna, Niño, Łukasz, Müller, Ó Séaghdha. Lista
   *   dozwolonych znaków jest ZAWSZE za krótka — po tygodniu ktoś dopisuje do niej ligaturę,
   *   po miesiącu spację nierozdzielającą. Zakaz jest dokładnie jeden i wąski: CYFRA. Wszystko
   *   inne, co ktoś potrafi wpisać jako swoje nazwisko, przechodzi.
   *
   * Skąd się wziął zakaz: „Jan1" i „Kowalski 2" trafiały na podpisany formularz i na listę
   * startową, a numer startowy w polu nazwiska nie da się odkręcić po wydruku.
   */
  const DIGIT_IN_TEXT = /\p{Nd}/u;

  /**
   * Podmienia zdanie pod polem, zostawiając je przetłumaczalnym.
   *
   * Napis jedzie razem z `data-i18n`, a nie samym `textContent`: `applyLanguage` przechodzi po
   * wszystkim, co nosi ten atrybut, więc po zmianie języka komunikat o cyfrze zostaje
   * komunikatem o cyfrze. Wpisanie samego tekstu dawałoby zdanie, które przy przełączeniu na
   * inny język wraca do „uzupełnij to pole" — i mówi wtedy coś nieprawdziwego.
   */
  function setFieldErrorKey(control, key) {
    const slot = control.closest('[data-field]')?.querySelector('.field__error, [data-error]');
    if (!slot || slot.dataset.i18n === key) return;
    slot.dataset.i18n = key;
    slot.textContent = text(key) || '';
  }

  function validateControl(control) {
    /* Pola oznaczone `data-no-digits` (imię i nazwisko) sprawdzane PRZED resztą: komunikat
       o cyfrze jest dokładniejszy niż „uzupełnij to pole", a wywołanie siedzi w obsłudze
       zdarzenia `input`, więc błąd staje na ekranie przy pierwszej wpisanej cyfrze — nie po
       wysłaniu i nie po zejściu z pola. */
    if (control.dataset.noDigits !== undefined) {
      const dirty = DIGIT_IN_TEXT.test(String(control.value || ''));
      setFieldErrorKey(control, dirty ? 'validation.noDigits' : 'validation.required');
      if (dirty) return markField(control, false);
      return markField(control, control.checkValidity());
    }
    if (control.type === 'email') {
      const valid = !control.required && !control.value ? true : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(control.value.trim());
      return markField(control, valid);
    }
    return markField(control, control.checkValidity());
  }

  function validateContainer(container) {
    const controls = $$('input, select, textarea', container).filter((control) => control.required && control.type !== 'checkbox');
    let valid = true;
    let firstInvalid = null;
    controls.forEach((control) => {
      const current = validateControl(control);
      if (!current && !firstInvalid) firstInvalid = control;
      valid = current && valid;
    });
    focusControl(firstInvalid);
    return valid;
  }

  function setupReminderModal() {
    const modal = $('[data-reminder-modal]');
    const form = $('[data-reminder-form]');
    if (!modal || !form) return;
    $$('[data-open-reminder]').forEach((button) => button.addEventListener('click', openReminder));
    $$('[data-close-reminder]', modal).forEach((button) => button.addEventListener('click', closeReminder));
    modal.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeReminder();
      if (event.key !== 'Tab') return;
      const focusable = modalFocusable(modal);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    $$('input', form).forEach((control) => control.addEventListener('input', () => validateControl(control)));

    /* The privacy consent here opens the same scroll-to-the-end dialog as the signup
       form, rather than linking to another page. The checkbox is still the thing the
       submit checks; the dialog just ticks it once the text has been read. */
    const consentGate = $('[data-reminder-consent-gate]', form);
    const consentInput = $('[data-reminder-consent-input]', form);
    const consentLabel = $('[data-reminder-consent-label]', form);

    function paintReminderConsent() {
      const done = Boolean(consentInput?.checked);
      consentGate?.classList.toggle('is-accepted', done);
      consentGate?.setAttribute('aria-pressed', String(done));
      if (consentLabel) consentLabel.textContent = text(done ? 'consent.gateDone' : 'consent.gateAction');
    }

    consentGate?.addEventListener('click', () => {
      // The gate presses first and the dialog opens a moment later, for the same
      // reason as the signup one: opening a modal in the same frame as the click
      // steals focus and repaints before the button can show it was pressed.
      consentGate.classList.add('is-pressing');
      window.setTimeout(() => consentGate.classList.remove('is-pressing'), 380);
      const run = () => {
        if (!openConsentDocuments) {
          // No dialog wired: rather than dead-end the visitor, fall back to ticking
          // the box directly. Better a working form than a button that does nothing.
          if (consentInput) consentInput.checked = true;
          paintReminderConsent();
          return;
        }
        openConsentDocuments(() => {
          if (consentInput) consentInput.checked = true;
          paintReminderConsent();
          $('[data-reminder-consent-error]', form)?.style.setProperty('display', 'none');
          consentGate.focus({ preventScroll: true });
        });
      };
      if (reducedMotion) run();
      else window.setTimeout(run, 170);
    });

    window.addEventListener('carruleddhi:language', paintReminderConsent);
    paintReminderConsent();

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const consent = consentInput || $('[name="consent"]', form);
      const consentError = $('[data-reminder-consent-error]', form);
      const fieldsValid = validateContainer(form);
      const consentValid = Boolean(consent?.checked);
      consentError?.style.setProperty('display', consentValid ? 'none' : 'block');
      if (!consentValid) {
        consentGate?.classList.add('is-nudged');
        window.setTimeout(() => consentGate?.classList.remove('is-nudged'), 600);
      }
      if (!fieldsValid || !consentValid) return;

      const submit = $('button[type="submit"]', form);
      submit.disabled = true;
      const original = submit.textContent;
      submit.textContent = text('form.sending');
      const values = Object.fromEntries(new FormData(form).entries());
      try {
        const result = await postJSON(config.endpoints.reminder, eventPayload('reminder', {
          name: String(values.name || '').trim(),
          email: String(values.email || '').trim().toLowerCase(),
          consent: true,
          reminderSchedule: ['P7D', 'P1D', 'PT3H']
        }));
        storage.set('carruleddhi.reminder', '1');
        rememberPerson(String(values.name || '').trim(), String(values.email || '').trim());
        $('[data-reminder-form-view]', modal)?.classList.add('is-hidden');
        $('[data-reminder-success]', modal)?.classList.add('is-visible');
        if (!state.attended) registerAttendance(false);
        if (result.demo) showToast(text('common.webhookDemo'));
      } catch (error) {
        console.error('Reminder webhook failed:', error);
        showToast(text('contact.error'), 4200, 'error');
      } finally {
        submit.disabled = false;
        submit.textContent = original;
      }
    });
  }

  function interpolate(key, values = {}) {
    return Object.entries(values).reduce(
      (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
      text(key)
    );
  }

  /**
   * Progress bar driven by how much of the form is actually filled in, not by
   * which step is open. Jumping 33% at a time felt disconnected from the work;
   * this moves on every field the visitor completes.
   */
  function paintFormFill() {
    const form = $('[data-registration-form]');
    const shell = $('[data-form-shell]');
    if (!form || !shell) return;

    const controls = $$('input, select, textarea', form)
      .filter((control) => control.required && control.type !== 'checkbox' && control.type !== 'hidden');
    const consents = $$('[data-consent-input]');
    const total = controls.length + (consents.length ? 1 : 0);
    if (!total) return;

    const filled = controls.filter((control) => {
      const value = String(control.value || '').trim();
      if (!value) return false;
      // A wrong e-mail should not count as progress.
      if (control.type === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
      return true;
    }).length + (consents.length && consents.every((input) => input.checked) ? 1 : 0);

    // Never fully empty: a bar at 0 looks broken rather than "not started".
    const ratio = Math.max(0.06, filled / total);
    shell.style.setProperty('--form-fill', `${(ratio * 100).toFixed(1)}%`);
    shell.dataset.formFilled = String(filled);
    shell.dataset.formTotal = String(total);
  }

  function setFormStep(step, { focus = true, announce = true } = {}) {
    const form = $('[data-registration-form]');
    const shell = $('[data-form-shell]');
    const sections = $$('[data-form-step]', form || document);
    const indicators = $$('[data-step-indicator]', shell || document);
    const total = Math.max(1, sections.length);
    state.formStep = clamp(step, 1, total);

    sections.forEach((section) => {
      const active = Number(section.dataset.formStep) === state.formStep;
      section.hidden = !active;
      section.classList.toggle('is-active', active);
      section.setAttribute('aria-hidden', String(!active));
    });
    indicators.forEach((indicator) => {
      const number = Number(indicator.dataset.stepIndicator);
      const active = number === state.formStep;
      indicator.classList.toggle('is-active', active);
      indicator.classList.toggle('is-complete', number < state.formStep);
      if (active) indicator.setAttribute('aria-current', 'step');
      else indicator.removeAttribute('aria-current');
    });

    const activeSection = $(`[data-form-step="${state.formStep}"]`, form || document);
    const activeTitle = $('h3', activeSection || document)?.textContent?.trim() || '';
    const statusText = interpolate('stepper.status', {
      current: state.formStep,
      total,
      title: activeTitle
    });
    const progress = $('[data-form-progress]', shell || document);
    const percentage = (state.formStep / total) * 100;
    if (progress) {
      progress.setAttribute('aria-valuenow', String(state.formStep));
      progress.setAttribute('aria-valuemax', String(total));
      progress.setAttribute('aria-valuetext', statusText);
    }
    if (shell) {
      shell.dataset.formActive = String(state.formStep);
      shell.style.setProperty('--form-step-progress', `${percentage}%`);
    }
    paintFormFill();
    const liveStatus = $('[data-form-step-status]', shell || document);
    if (liveStatus && announce) liveStatus.textContent = statusText;
    if (focus) $('h3', activeSection || document)?.focus({ preventScroll: true });

    // Keep the whole step in view when moving between steps: a step that starts
    // half off-screen is the main reason people miss fields further down.
    if (focus && shell) {
      const box = shell.getBoundingClientRect();
      const off = box.top < 8 || box.bottom > window.innerHeight - 8;
      if (off) shell.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    }
  }

  /* ==========================================================================
     Riders under 18
     ==========================================================================
     Age is measured AT THE EVENT, never today. Somebody who turns 18 the week
     before the race is an adult on the start line, and checking against today
     would demand a guardian from an adult. The reverse case matters more: a
     seventeen-year-old signing up eleven months early is still seventeen on the
     day, and a "today" check would let them through as an adult and produce a
     liberatoria nobody can legally sign.
  */

  /** Whole years completed on `onDate`. Returns null when the date is unusable. */
  function ageOn(birthISO, onDate) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(birthISO || ''))) return null;
    const birth = new Date(`${String(birthISO).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(birth.getTime())) return null;
    let years = onDate.getFullYear() - birth.getFullYear();
    // Not yet had this year's birthday on the event date.
    const beforeBirthday =
      onDate.getMonth() < birth.getMonth() ||
      (onDate.getMonth() === birth.getMonth() && onDate.getDate() < birth.getDate());
    if (beforeBirthday) years -= 1;
    return years;
  }

  const ADULT_AGE = 18;

  function eventDay() {
    const day = new Date(config.eventDate);
    return Number.isNaN(day.getTime()) ? new Date() : day;
  }

  /**
   * How old the rider will be at the start, and whether that makes them a minor.
   *
   * An unparseable or empty date returns `isMinor: false`. Guessing "probably a
   * minor" from a blank field would spring seven required inputs on somebody who
   * has simply not filled the date in yet.
   */
  function riderAge(form) {
    const value = form?.elements?.namedItem('birthDate')?.value || '';
    const years = ageOn(value, eventDay());
    return { years, isMinor: years !== null && years >= 0 && years < ADULT_AGE };
  }

  function registrationData(form) {
    const raw = Object.fromEntries(new FormData(form).entries());
    const { years, isMinor } = riderAge(form);
    const base = {
      firstName: String(raw.firstName || '').trim(),
      lastName: String(raw.lastName || '').trim(),
      birthDate: String(raw.birthDate || ''),
      // Was `taxCode` here long after the field became a postal code, so the
      // payload carried an empty tax code and no postal code at all — and the
      // Worker requires postalCode, which made every submit fail with 422.
      postalCode: String(raw.postalCode || '').trim().toUpperCase(),
      email: String(raw.email || '').trim().toLowerCase(),
      phone: String(raw.phone || '').trim(),
      address: String(raw.address || '').trim(),
      cartName: String(raw.cartName || '').trim(),
      category: raw.category || 'classic',
      teamName: String(raw.teamName || '').trim(),
      cartNotes: String(raw.cartNotes || '').trim(),
      rulesConsent: raw.rulesConsent === 'on',
      privacyConsent: raw.privacyConsent === 'on',
      newsConsent: raw.newsConsent === 'on',
      // Always sent, both ways. Make branches on it, and a field that only appears
      // for minors would leave the adult branch guessing from an absence.
      isMinor,
      riderAge: years === null ? '' : String(years),
      /* Skąd ta osoba przyszła na stronę PIERWSZY raz — zapamiętane przez sondę odwiedzin,
         więc istnieje tylko wtedy, gdy była zgoda na analitykę. Bez zgody lecą puste napisy
         i zgłoszenie ląduje w panelu jako „nieznane", zamiast być doliczone byle gdzie.
         Kanału nie nazywa przeglądarka: to robi serwer, jedną regułą dla wejść i zapisów. */
      refHost: firstTouch()?.ref || '',
      utmSource: firstTouch()?.utmSource || '',
      utmCampaign: firstTouch()?.utmCampaign || '',
      /* Prosba o wydruk. Jedzie w KAZDYM zgloszeniu, takze niezaznaczona: `false` znaczy
         „drukuje sam" i jest odpowiedzia tak samo jak `true`. */
      wantsPrint: raw.wantsPrint === 'on'
    };

    if (!isMinor) return base;

    return {
      ...base,
      childKind: String(raw.childKind || 'child'),
      guardianRelation: String(raw.guardianRelation || 'guardian'),
      guardianName: String(raw.guardianName || '').trim(),
      guardianEmail: String(raw.guardianEmail || '').trim().toLowerCase(),
      guardianPhone: String(raw.guardianPhone || '').trim(),
      motherName: String(raw.motherName || '').trim(),
      fatherName: String(raw.fatherName || '').trim(),
      guardianConsent: raw.guardianConsent === 'on'
    };
  }

  /**
   * Shows or hides the guardian block and moves `required` with it.
   *
   * Returning the state lets the caller avoid recomputing it. Called on every
   * change to the birth date, on language change (the age sentence is translated)
   * and after a reset.
   */
  function paintMinorState(form) {
    const box = $('[data-minor-box]', form);
    const clause = $('[data-minor-clause]');
    const { years, isMinor } = riderAge(form);
    if (!box) return { years, isMinor };

    box.hidden = !isMinor;
    if (clause) clause.hidden = !isMinor;

    $$('[data-minor-field]', box).forEach((control) => {
      if (isMinor) control.setAttribute('required', '');
      else {
        control.removeAttribute('required');
        // Leaving a red outline on a field that has just been hidden means it is
        // still red the next time the block opens.
        control.closest('[data-field]')?.classList.remove('is-invalid');
        control.removeAttribute('aria-invalid');
      }
    });

    if (!isMinor) {
      const consent = $('[data-minor-consent]', box);
      if (consent) consent.checked = false;
      const error = $('[data-minor-consent-error]', box);
      if (error) error.style.display = 'none';
    }

    const note = $('[data-minor-age]', box);
    if (note && isMinor) {
      note.textContent = text('minor.intro').replace('%AGE%', String(years));
    }
    return { years, isMinor };
  }

  /**
   * Opens the shared consent dialog from somewhere other than the signup form.
   *
   * Assigned by setupConsentGate once the dialog is wired. Anything that needs the
   * documents — the reminder pop-up, for one — calls this instead of linking to
   * regolamento.html in a new tab. A link away from the page loses the half-filled
   * form behind it and gives back a document with no way to accept it, so the
   * visitor reads it, comes back, and still has to find the checkbox.
   *
   * `onAccept` runs only after the reader has actually reached the end of the text.
   */
  let openConsentDocuments = null;

  /* ==========================================================================
     Dokumenty prawne: sześć języków i pobieranie z wyprzedzeniem
     ==========================================================================
     Dwie rzeczy naprawiane tu naraz, bo obie dotyczą tego samego momentu.

     JĘZYK. Dialog zgody wciągał `regolamento.html`, czyli jedną stronę po włosku, i pokazywał
     ją tak samo komuś, kto przestawił serwis na polski. Regulamin przychodzi teraz z
     `assets/legal/regolamento.json` — ten sam plik, z którego korzysta strona regulaminu — i
     jest wybierany po `state.lang`. Włoski zostaje wersją oficjalną i każde tłumaczenie mówi
     to w pierwszym akapicie; chodzi o to, żeby dało się je przeczytać, a nie o to, żeby
     zastąpiły oryginał.

     CZAS. Pobieranie startowało dopiero po naciśnięciu „Przeczytaj i zaakceptuj regulamin",
     więc każdy widział „Wczytuję dokumenty…" i czekał na dwa żądania sieciowe w chwili, w
     której już chciał czytać. Teraz startuje, gdy ktoś dotknie pierwszego pola formularza —
     wtedy nikt nie czeka, bo nikt jeszcze nie patrzy. Do dialogu docierają obietnice, które
     najczęściej są już rozwiązane, i spinner nie pojawia się w ogóle.

     Obietnice w pamięci, nie wyniki: przełączenie języka ma przerysować ekran z tego, co już
     jest, a nie sięgnąć po plik po raz drugi.
     ======================================================================== */
  const LEGAL_RULES_SOURCE = 'assets/legal/regolamento.json';
  const LEGAL_PRIVACY_SOURCE = 'assets/legal/privacy.json';
  const legalCache = { rules: null, privacy: null };

  /**
   * Wycina z dokumentu wszystko, co mogłoby cokolwiek wykonać, i otwiera odsyłacze w nowej karcie.
   *
   * Oba dokumenty jadą z tego samego origin i z tego repozytorium, więc to nie jest bariera
   * przed napastnikiem — to bariera przed przyszłością, w której regulamin zacznie być
   * wklejany z panelu. Dokument prawny jest tekstem i nie ma powodu niczego uruchamiać.
   */
  function sanitizeLegal(root) {
    root.querySelectorAll('script, style, iframe, form, object, embed, link, meta').forEach((node) => node.remove());
    root.querySelectorAll('*').forEach((node) => {
      [...node.attributes].forEach((attribute) => {
        if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name);
      });
    });
    root.querySelectorAll('a[href]').forEach((link) => {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    });
    return root;
  }

  /** Odrzucona obietnica nie zostaje w pamięci, bo zamieniłaby jedną awarię sieci w trwale zepsuty dialog. */
  function legalOnce(slot, load) {
    if (!legalCache[slot]) {
      legalCache[slot] = load().catch((error) => {
        legalCache[slot] = null;
        throw error;
      });
    }
    return legalCache[slot];
  }

  /** Regulamin we wszystkich sześciu językach, jeden plik JSON. */
  const legalRules = () => legalOnce('rules', () => fetch(LEGAL_RULES_SOURCE, { credentials: 'same-origin' })
    .then((response) => {
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    }));

  /* Polityka prywatności we wszystkich sześciu językach, dokładnie tak samo jak regulamin.
     ---------------------------------------------------------------------------
     Wcześniej była tu inna droga: `fetch('privacy.html')` i wycięcie `.legal-content` ze
     strony. Nie z lenistwa — po prostu przetłumaczonej wersji nie było, a strona jest po
     włosku. Skutkiem było okno zgody, w którym regulamin szedł w języku gościa, a polityka
     prywatności zaraz pod nim po włosku. Zapowiedź stała w tym komentarzu: „gdy powstanie
     assets/legal/privacy.json, ta funkcja zmieni się w bliźniaka powyższej". Powstał.

     Bliźniak znaczy tu dosłownie to samo zachowanie: jeden plik JSON z sześcioma językami,
     wybór po `state.lang`, włoski jako wersja oficjalna i jako zapas, gdy tłumaczenia dla
     danego języka nie ma. Dzięki temu oba dokumenty w oknie zgody wczytują się tą samą
     drogą i nie mogą się rozjechać — a `privacyBlock()` niżej jest teraz odbiciem
     `rulesBlock()`, zamiast być osobnym przypadkiem. */
  const legalPrivacy = () => legalOnce('privacy', () => fetch(LEGAL_PRIVACY_SOURCE, { credentials: 'same-origin' })
    .then((response) => {
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    }));

  let legalPrefetched = false;

  /**
   * Zaczyna pobierać oba dokumenty, nie czekając na nic.
   *
   * Wołane, gdy ktoś dotknie formularza — czyli kilkadziesiąt sekund przed tym, gdy dojdzie
   * do zgód. Błędy są tu połykane celowo: to jest przygotowanie, a nie próba. Gdy coś nie
   * wyjdzie, `legalOnce` zapomina o nieudanej obietnicy i dialog spróbuje jeszcze raz,
   * tym razem mając komu pokazać komunikat.
   */
  function prefetchLegalDocuments() {
    if (legalPrefetched) return;
    legalPrefetched = true;
    legalRules().catch(() => {});
    legalPrivacy().catch(() => {});
  }

  /**
   * Single consent gate.
   *
   * The two mandatory checkboxes are replaced by one button that opens the real
   * documents. Accepting requires reaching the end of the text, so the consent is
   * informed rather than a reflex click. The checkboxes still exist in the form,
   * so the submitted payload is unchanged.
   */
  function setupConsentGate() {
    const gate = $('[data-consent-gate]');
    const dialog = $('[data-consent-dialog]');
    if (!gate || !dialog) return;

    /** Set while the dialog was opened by something other than the signup gate. */
    let externalAccept = null;

    const scroller = $('[data-consent-scroll]', dialog);
    const content = $('[data-consent-content]', dialog);
    const loading = $('[data-consent-loading]', dialog);
    const accept = $('[data-consent-accept]', dialog);
    const status = $('[data-consent-status]', dialog);
    const progress = $('[data-consent-progress]', dialog);
    const progressFill = $('[data-consent-progress-fill]', dialog);
    const inputs = $$('[data-consent-input]');
    const label = $('[data-consent-gate-label]');
    const hint = $('[data-consent-gate-hint]');
    /** Język, w którym zbudowano treść dialogu. Puste, dopóki nic nie zbudowano. */
    let renderedLang = '';
    let unlocked = false;

    function accepted() {
      return inputs.every((input) => input.checked);
    }

    function paintGate() {
      const done = accepted();
      gate.classList.toggle('is-accepted', done);
      gate.setAttribute('aria-pressed', String(done));
      if (label) label.textContent = text(done ? 'consent.gateDone' : 'consent.gateAction');
      if (hint) hint.textContent = text(done ? 'consent.gateDoneHint' : 'consent.gateHint');
    }

    function setUnlocked(value) {
      unlocked = value;
      accept.disabled = !value;
      if (status) status.textContent = text(value ? 'consent.readyToAccept' : 'consent.scrollMore');
      status?.classList.toggle('is-ready', value);
    }

    function trackScroll() {
      if (!scroller) return;
      const max = scroller.scrollHeight - scroller.clientHeight;
      // A document shorter than the viewport is already fully read.
      const ratio = max <= 8 ? 1 : clamp(scroller.scrollTop / max, 0, 1);
      const percent = Math.round(ratio * 100);
      if (progressFill) progressFill.style.width = `${percent}%`;
      progress?.setAttribute('aria-valuenow', String(percent));
      if (ratio >= 0.985 && !unlocked) setUnlocked(true);
    }

    function docBlock(headingKey, body) {
      const block = document.createElement('section');
      block.className = 'consent-doc';
      const heading = document.createElement('h3');
      heading.textContent = text(headingKey);
      block.append(heading, body);
      return block;
    }

    /** Nie udało się wciągnąć dokumentu: zostaje odsyłacz, który go otwiera osobno. */
    function docFallback(url) {
      const fallback = document.createElement('p');
      fallback.className = 'consent-doc__fallback';
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = url;
      fallback.append(`${text('consent.error')} `, link);
      return fallback;
    }

    async function rulesBlock() {
      const lang = state.lang;
      try {
        const all = await legalRules();
        // Włoski, gdy tłumaczenia dla tego języka nie ma. Regulamin po włosku jest
        // regulaminem; brak regulaminu nie jest niczym.
        const doc = all[lang] || all.it;
        if (!doc?.html) throw new Error(`no rules for ${lang}`);
        const parsed = new DOMParser().parseFromString(`<article class="legal-content">${doc.html}</article>`, 'text/html');
        return docBlock('consent.rulesHeading', sanitizeLegal(parsed.querySelector('.legal-content')));
      } catch (error) {
        console.warn('Consent rules could not be inlined:', error);
        return docFallback(`regolamento.html?lang=${lang}`);
      }
    }

    async function privacyBlock() {
      const lang = state.lang;
      try {
        const all = await legalPrivacy();
        /* Włoski, gdy tłumaczenia dla tego języka nie ma — z tego samego powodu co przy
           regulaminie: polityka prywatności po włosku jest polityką prywatności, a jej brak
           nie jest niczym. */
        const doc = all[lang] || all.it;
        if (!doc?.html) throw new Error(`no privacy for ${lang}`);
        /* Świeży rozbiór przy każdym otwarciu, więc nie ma czego klonować: w pamięci leży
           teraz tekst dokumentu, a nie gotowy węzeł DOM, który wstawienie do dialogu
           przenosiłoby z pamięci na ekran. */
        const parsed = new DOMParser().parseFromString(`<article class="legal-content">${doc.html}</article>`, 'text/html');
        return docBlock('consent.privacyHeading', sanitizeLegal(parsed.querySelector('.legal-content')));
      } catch (error) {
        console.warn('Consent privacy could not be inlined:', error);
        return docFallback(`privacy.html?lang=${lang}`);
      }
    }

    /**
     * Buduje treść dialogu w aktualnym języku.
     *
     * `renderedLang` zamiast dawnego `loaded`: pytanie nie brzmi już „czy zbudowano", ale „w
     * jakim języku zbudowano". Bez tego ktoś, kto otworzy dokumenty, zamknie je, przestawi
     * serwis na inny język i otworzy ponownie, zostałby przy poprzednim tekście.
     *
     * Oba dokumenty równolegle. Dawna pętla `for` z `await` w środku ładowała je po kolei,
     * czyli czekała na regulamin, żeby zacząć pobierać prywatność, bez żadnej zależności
     * między nimi. Przy wcześniejszym pobraniu oba są zwykle już w pamięci i nie ma tu
     * żadnego czekania.
     */
    async function loadDocuments() {
      if (renderedLang === state.lang) return;
      const lang = state.lang;
      const parts = await Promise.all([rulesBlock(), privacyBlock()]);
      // Język zmienił się jeszcze raz, kiedy te dwa były w drodze. Ekran należy do
      // późniejszego wywołania, więc to jest już nieaktualna odpowiedź.
      if (lang !== state.lang) return;
      renderedLang = lang;
      loading?.remove();
      if (content) {
        content.hidden = false;
        content.replaceChildren(...parts);
      }
      /* Nowy tekst czyta się od początku, a pasek postępu musi mówić prawdę o tym, ile z
         niego przeczytano. Bez tego przewinięcie zostaje na dole i podmieniony dokument
         wygląda na przeczytany w całości. */
      if (scroller) scroller.scrollTop = 0;
      requestAnimationFrame(trackScroll);
    }

    function open() {
      state.lastFocused = document.activeElement;
      // An external caller starts locked even if the signup form was already
      // accepted: the reader has to reach the end of the text for their own consent,
      // not inherit somebody else's.
      setUnlocked(externalAccept ? false : accepted());
      dialog.showModal();
      document.body.classList.add('is-locked');
      loadDocuments();
      requestAnimationFrame(() => scroller?.focus({ preventScroll: true }));
    }

    openConsentDocuments = (onAccept) => {
      externalAccept = typeof onAccept === 'function' ? onAccept : null;
      open();
    };

    /**
     * Odblokowanie tła po zamkniętych dokumentach.
     *
     * Wołane z `close()`, a nie tylko ze zdarzenia `close`. Sonda głosowania (probe-voting.mjs)
     * pokazała `dialog.close()` wykonane raz, okno zamknięte i ani jednego zdarzenia `close` —
     * a to zdarzenie było tu jedynym miejscem, w którym zdejmowana jest blokada przewijania.
     * Skutkiem byłaby strona, której nie da się przewinąć, bez niczego na ekranie, co by to
     * tłumaczyło: objaw wygląda dokładnie jak zawieszona witryna.
     *
     * Zdarzenie zostaje jako siatka na zamknięcia, których nie robi ten kod — Escape i
     * kliknięcie w tło. Wywołanie dwa razy nic nie psuje.
     *
     * `toggle` z warunkiem, a nie `remove`: okno przypomnień jest zwykłym `.modal` i może stać
     * otwarte pod tym dialogiem, więc blokada musi wtedy zostać.
     */
    function releaseDialog() {
      externalAccept = null;
      document.body.classList.toggle('is-locked', Boolean($('.modal.is-open')));
    }

    function close() {
      if (dialog.open) dialog.close();
      releaseDialog();
    }

    /**
     * Press first, dialog second. Opening a <dialog> synchronously on click steals
     * focus and repaints the whole overlay in the same frame, so the button never
     * got to render its active state — the press felt like nothing happened and
     * the pop-up appeared out of nowhere. 170 ms is one visible squash.
     */
    gate.addEventListener('click', () => {
      gate.classList.add('is-pressing');
      window.setTimeout(() => gate.classList.remove('is-pressing'), 380);
      if (reducedMotion) open();
      else window.setTimeout(open, 170);
    });
    scroller?.addEventListener('scroll', trackScroll, { passive: true });
    $('[data-consent-close]', dialog)?.addEventListener('click', close);

    accept.addEventListener('click', () => {
      if (!unlocked) return;
      const external = externalAccept;
      // Only the signup form's own checkboxes are ticked here. An external caller
      // gets its callback and decides what accepting means for it.
      if (!external) {
        inputs.forEach((input) => { input.checked = true; });
        paintGate();
        paintFormFill();
        $('[data-consent-error]')?.style.setProperty('display', 'none');
      }
      accept.classList.add('is-filling');
      window.setTimeout(() => {
        accept.classList.remove('is-filling');
        close();
        if (external) external();
        else gate.focus({ preventScroll: true });
        showToast(text('consent.savedToast'), 4200, 'success');
      }, reducedMotion ? 0 : 520);
    });

    dialog.addEventListener('close', releaseDialog);
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      close();
    });

    window.addEventListener('carruleddhi:language', () => {
      paintGate();
      setUnlocked(unlocked);
    });
    paintGate();
  }

  /* ==========================================================================
     An address that is already entered
     ==========================================================================
     Wired up by setupExistingEntry(), opened by existingEntryGate() from the "Continue"
     button on step 1. Three ways out; two of them need a code from the inbox first.

     The state that has to survive between the button presses lives in this closure rather
     than in the DOM: which of the two things they chose, and the code they typed. Reading it
     back off the panel each time would mean the panel's markup is the source of truth for a
     security decision, which is a worse place for it than a variable nobody else can reach.
     ======================================================================== */
  let entryIntent = '';
  let selectedEntryId = '';
  let selectedEntry = null;
  let openEntryManager = null;
  /* Raised once somebody has said "yes, I know, I am adding another rider".
     Without it the gate opens again on every press of "Continue" with the same address in the
     field — it would be asking a question it has already had answered, and the only way past
     would be to keep pressing the same button. Reset when the address changes, because then it
     is a different question. */
  let entryGateCleared = false;

  function setupExistingEntry(form) {
    const panel = $('[data-entry-found]', form);
    if (!panel) return;

    const choices = $('[data-entry-choices]', panel);
    const personList = $('[data-entry-person-list]', panel);
    const resultStep = $('[data-entry-result]', panel);
    const codeStep = $('[data-entry-code-step]', panel);
    const editStep = $('[data-entry-edit-step]', panel);
    const status = $('[data-entry-status]', panel);
    const codeField = $('#entry-code', panel);
    const codeError = $('[data-entry-code-error]', panel);
    const emailOf = () => String(form.elements.namedItem('email')?.value || '').trim().toLowerCase();

    /* POTWIERDZENIE PRZYNIESIONE Z BRAMKI W ROZMOWIE
       ---------------------------------------------------------------------------
       `{ intent, email, code, entryId }` albo `null`. Ustawiane przez `openEntryManager`, gdy
       czat przeprowadził gościa przez bramkę (`verify-start` / `verify-code`) i ma już
       sprawdzone sześć cyfr dla TEGO adresu i TEGO zawodnika. Panel bierze wtedy ten kod
       zamiast wysyłać drugi list i prosić o te same cyfry po raz drugi (3.3).

       Cztery pola, nie samo `code`, bo kod jest wystawiony na jedną sprawę i na jedno
       zgłoszenie: kod na zmianę danych nie wycofuje nikogo z wyścigu, a kod niosący `entry_id`
       brata nie otworzy zgłoszenia siostry. Niezgodność któregokolwiek pola znaczy „to nie ten
       kod" i panel wraca do swojej własnej drogi, czyli wysyła kod tak jak zawsze. */
    let entryPreset = null;

    /* A different address is a different question, so the "I know, another rider" answer stops
       counting. Without this, changing the address after clearing the gate once would skip the
       check for the new one — and that is the case where somebody really is entering twice.

       Imię i nazwisko są tu z tego samego powodu. Odkąd brama pyta „czy TA OSOBA jest już
       zapisana", odpowiedź przestaje obowiązywać także wtedy, gdy ktoś zostawi adres i zmieni
       nazwisko — a to jest dokładnie sposób, w jaki rodzic zapisuje drugie dziecko: cofa się,
       przepisuje imię i naciska dalej. Bez tego drugie dziecko przechodziłoby bez sprawdzenia,
       łącznie z sytuacją, w której zostało wpisane dwa razy. */
    ['email', 'firstName', 'lastName'].forEach((field) => {
      form.elements.namedItem(field)?.addEventListener('input', () => {
        entryGateCleared = false;
        selectedEntryId = '';
        selectedEntry = null;
        /* Kod z rozmowy dotyczył adresu, który był w tym polu chwilę temu. Po zmianie adresu
           jest cudzym poświadczeniem leżącym w pamięci karty i nie ma prawa być użyty. */
        entryPreset = null;
      });
    });

    const show = (which) => {
      if (choices) choices.hidden = which !== 'choices';
      if (personList) personList.hidden = which !== 'choices' || personList.childElementCount < 2;
      if (codeStep) codeStep.hidden = which !== 'code';
      if (editStep) editStep.hidden = which !== 'edit';
      if (resultStep) resultStep.hidden = which !== 'result';
      // The panel changes height every time, and #signup is a sticky panel that sizes itself.
      window.dispatchEvent(new Event('carruleddhi:relayout'));
    };

    const say = (key, extra = '') => {
      if (status) status.textContent = `${text(key) || ''}${extra}`;
    };

    /** Turns a server code into something a person can act on. */
    const explain = (result) => {
      const map = {
        ENTRY_CODE_WRONG: 'entry.codeWrong',
        ENTRY_CODE_EXPIRED: 'entry.codeExpired',
        ENTRY_TOO_MANY_TRIES: 'entry.codeBlocked',
        /* Osobny tekst, nie `codeBlocked`. Tamten mówi „za dużo prób, poproś o nowy kod" —
           tu właśnie o nowy kod poprosić nie można, bo to jego wysyłka ma sufit. Ta sama
           rada w obu znaczyłaby pętlę: poproś o coś, czego odmawiamy. */
        ENTRY_CODE_TOO_OFTEN: 'entry.codeTooOften',
        ENTRY_NO_CODE: 'entry.codeExpired',
        ENTRY_BAD_CODE: 'entry.codeShort',
        ENTRY_NOT_FOUND: 'entry.gone',
        ENTRY_MAIL_FAILED: 'entry.mailFailed'
      };
      return map[result?.code] || 'entry.failed';
    };

    const paintSelection = () => {
      $$('[data-entry-person]', personList).forEach((button) => {
        const active = button.dataset.entryId === selectedEntryId;
        button.classList.toggle('is-selected', active);
        button.setAttribute('aria-pressed', String(active));
      });
      const blocked = !selectedEntry || selectedEntry.withdrawn || selectedEntry.minor;
      $$('[data-entry-action]', panel).forEach((button) => {
        if (button.dataset.entryAction === 'other') return;
        button.hidden = Boolean(selectedEntry && blocked);
        button.disabled = !selectedEntry;
      });
      say(selectedEntry?.withdrawn
        ? 'entry.alreadyOut'
        : (selectedEntry?.minor ? 'entry.minorHelp' : ''));
    };

    const finish = (mode, key) => {
      const title = $('[data-entry-result-title]', resultStep);
      const body = $('[data-entry-result-body]', resultStep);
      if (resultStep) resultStep.dataset.resultMode = mode;
      if (title) title.textContent = mode === 'withdrawn'
        ? (text('entry.withdrawn') || '')
        : (text('entry.saved') || '');
      if (body) body.textContent = text(key) || '';
      say('');
      show('result');
      resultStep?.focus?.({ preventScroll: true });
    };

    const afterConsent = (callback) => {
      if (typeof openConsentDocuments === 'function') openConsentDocuments(callback);
      else callback();
    };

    const selectEntry = (entry) => {
      selectedEntry = entry || null;
      selectedEntryId = entry?.id || '';
      paintSelection();
    };

    personList?.addEventListener('click', (event) => {
      const button = event.target.closest?.('[data-entry-person]');
      if (button && personList.contains(button)) selectEntry(button.entryRecord);
    });

    /* ------------------------------------------------------- another rider, same address
       The address stays. That is the whole change: since migration 0020 one inbox can hold
       several riders, so a family entering a second child carries on with the form they are
       already filling in.

       The previous version cleared the field and asked for a different address, which was
       asking somebody to work around our database schema by inventing an e-mail — and half of
       them would type one they cannot read, which is where the confirmation with the race
       number and the form to sign would then go. */
    $('[data-entry-action="other"]', panel)?.addEventListener('click', () => {
      panel.hidden = true;
      show('choices');
      say('');
      // Remembered, so the gate does not stop the same person again on the next press of
      // "Continue" — they have already answered the question it asks.
      entryGateCleared = true;
      window.dispatchEvent(new Event('carruleddhi:relayout'));
      setFormStep(state.formStep + 1);
    });

    /* ------------------------------------------------------- edit / withdraw: send code */
    const askForCode = async (intent, button) => {
      if (!selectedEntryId) {
        personList?.classList.add('is-nudged');
        window.setTimeout(() => personList?.classList.remove('is-nudged'), 600);
        return;
      }
      entryIntent = intent;
      const email = emailOf();

      /* KOD JUŻ POTWIERDZONY W ROZMOWIE — ŻADNEGO DRUGIEGO LISTU I ŻADNEGO DRUGIEGO PYTANIA
         ------------------------------------------------------------------------------------
         Cztery warunki, wszystkie konieczne: ta sama czynność, ten sam adres, ten sam zawodnik
         i komplet sześciu cyfr. `verify-code` kodu nie zużyło, więc ten sam wiersz otworzy tu
         zgłoszenie i dokończy czynność — dokładnie tak, jak kod wpisany w to pole ręcznie (3.3).

         Kod zdejmowany z pamięci przy pierwszym użyciu. Zostawiony przeżyłby swój kwadrans
         i po „Anuluj" wracałby jako cyfry, które już nie działają — czyli pętla „wygasł,
         spróbuj jeszcze raz tym samym". Bez niego drugie naciśnięcie wysyła nowy list, tak
         jak zawsze. */
      const preset = entryPreset;
      if (preset && preset.intent === intent && preset.email === email
        && preset.entryId && preset.entryId === selectedEntryId) {
        entryPreset = null;
        if (codeField) codeField.value = preset.code;
        if (codeError) codeError.textContent = '';
        say('');
        show('code');
        await confirmCode(button);
        return;
      }

      const original = button.textContent;
      button.disabled = true;
      say('entry.sending');
      try {
        /* `intent` decides which of the two codes goes out, and what the letter says it is
           for. Since migration 0018 they are separate purposes: a code sent to correct a phone
           number cannot withdraw anybody from the race, and the e-mail names which one it is —
           so nobody types six digits without knowing what they are confirming. */
        const result = await postJSON(config.endpoints.entryCode, eventPayload('entry-code', {
          email,
          intent,
          entryId: selectedEntryId
        }));
        if (!result?.ok) throw Object.assign(new Error('code'), { payload: result });
        const sent = $('[data-entry-sent]', panel);
        // The masked address comes from the server, so it is the address the letter went to
        // rather than the one on screen — which is the same thing right up until it is not.
        if (sent) sent.textContent = `${text('entry.codeSent') || ''} ${result.email || ''}`.trim();
        say('');
        show('code');
        codeField?.focus({ preventScroll: true });
      } catch (error) {
        say(explain(error.payload));
      } finally {
        button.disabled = false;
        button.textContent = original;
      }
    };

    $('[data-entry-action="edit"]', panel)?.addEventListener('click', (event) => {
      askForCode('edit', event.currentTarget);
    });
    $('[data-entry-action="withdraw"]', panel)?.addEventListener('click', (event) => {
      askForCode('withdraw', event.currentTarget);
    });

    $$('[data-entry-cancel]', panel).forEach((button) => button.addEventListener('click', () => {
      entryIntent = '';
      if (codeField) codeField.value = '';
      if (codeError) codeError.textContent = '';
      say('');
      show('choices');
    }));

    /* ------------------------------------------------------------- code confirmed
       Osobna funkcja, a nie ciało nasłuchu, bo wchodzi się tu z dwóch stron: z przycisku pod
       polem na kod oraz z kodem przyniesionym z bramki w rozmowie, gdzie te sześć cyfr zostało
       już wpisane raz. `button` bywa więc przyciskiem „Potwierdź", przyciskiem czynności albo
       niczym — blokada na czas żądania dotyczy tego, co ktoś nacisnął. */
    async function confirmCode(button) {
      const code = String(codeField?.value || '').replace(/\D/g, '');
      if (codeError) codeError.textContent = '';
      if (code.length !== 6) {
        if (codeError) codeError.textContent = text('entry.codeShort') || '';
        /* preventScroll — pole jest tuż pod palcem, bo ktoś właśnie w nie wpisywał.
           Bez tej flagi `focus()` w przypiętej sekcji przerzuca stronę gdzie indziej. */
        codeField?.focus({ preventScroll: true });
        return;
      }

      if (button) button.disabled = true;
      say('entry.checking');
      try {
        /* First verify and read the selected row. `view` does not consume the code, so the
           same code can complete exactly the requested edit or withdrawal after the reader
           accepts the regulations. */
        const result = await postJSON(config.endpoints.entryManage, eventPayload('entry-manage', {
          email: emailOf(),
          code,
          action: 'view',
          entryId: selectedEntryId
        }));
        if (!result?.ok) throw Object.assign(new Error('view'), { payload: result });
        const entry = result.entry || {};

        if (entryIntent === 'withdraw') {
          afterConsent(async () => {
            say('entry.checking');
            try {
              const withdrawn = await postJSON(config.endpoints.entryManage, eventPayload('entry-manage', {
                email: emailOf(),
                code,
                action: 'withdraw',
                entryId: selectedEntryId
              }));
              if (!withdrawn?.ok) throw Object.assign(new Error('withdraw'), { payload: withdrawn });
              finish('withdrawn', 'entry.withdrawn');
            } catch (error) {
              say(explain(error.payload));
              show('code');
            }
          });
          return;
        }

        /* The edit form is revealed only after the regulations/privacy reader has been
           accepted. Fields are filled from the verified selected row, never from another
           registration sharing the inbox. */
        afterConsent(() => {
          const put = (id, value) => {
            const field = $(id, panel);
            if (field) field.value = value || '';
          };
          put('#entry-phone', entry.phone);
          put('#entry-postal', entry.postalCode);
          put('#entry-address', entry.address);
          put('#entry-cart', entry.cartName);
          put('#entry-team', entry.teamName);
          put('#entry-notes', entry.cartNotes);
          say('entry.showing', entry.raceNumber ? ` ${entry.raceNumber}` : '');
          show('edit');
        });
      } catch (error) {
        const key = explain(error.payload);
        if (codeError && key.startsWith('entry.code')) codeError.textContent = text(key) || '';
        else say(key);
        if (error.payload?.left !== undefined && codeError) {
          codeError.textContent = `${text('entry.codeWrong') || ''} ${error.payload.left}`;
        }
      } finally {
        if (button) button.disabled = false;
      }
    }

    $('[data-entry-confirm]', panel)?.addEventListener('click', (event) => {
      void confirmCode(event.currentTarget);
    });

    /* ------------------------------------------------------------------- save edits */
    $('[data-entry-save]', panel)?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      say('entry.saving');
      try {
        const result = await postJSON(config.endpoints.entryManage, eventPayload('entry-manage', {
          email: emailOf(),
          code: String(codeField?.value || '').replace(/\D/g, ''),
          action: 'update',
          entryId: selectedEntryId,
          phone: $('#entry-phone', panel)?.value || '',
          postalCode: $('#entry-postal', panel)?.value || '',
          address: $('#entry-address', panel)?.value || '',
          cartName: $('#entry-cart', panel)?.value || '',
          teamName: $('#entry-team', panel)?.value || '',
          cartNotes: $('#entry-notes', panel)?.value || ''
        }));
        if (!result?.ok) throw Object.assign(new Error('update'), { payload: result });
        /* The final screen explicitly says that the corrected confirmation and PDFs have
           been sent again, so the visitor knows which copy to print. */
        finish('updated', result.mailed ? 'entry.savedMailed' : 'entry.saved');
      } catch (error) {
        say(explain(error.payload));
      } finally {
        button.disabled = false;
      }
    });

    /**
     * Otwiera panel zarządzania zgłoszeniem na podanym adresie.
     *
     * @param {string} email adres, na którym szukamy zgłoszeń
     * @param {'edit'|'withdraw'|''} intent czynność, której przycisk dostaje skupienie
     * @param {HTMLElement|null} trigger przycisk, który tego zażądał — na czas sprawdzania
     * @param {{ code: string, entryId: string }|null} [confirmed] potwierdzenie z bramki
     *   w rozmowie: sześć cyfr sprawdzonych przez `verify-code` razem ze zgłoszeniem, do
     *   którego kod należy. Bez niego panel prosi o kod sam, jak dotąd.
     */
    openEntryManager = async (email, intent, trigger, confirmed = null) => {
      const emailField = form.elements.namedItem('email');
      if (!emailField || !email) return false;
      emailField.value = email;
      emailField.dispatchEvent(new Event('input', { bubbles: true }));
      /* Po zdarzeniu `input`, nie przed: ten nasłuch wyżej czyści właśnie `entryPreset`,
         bo zmiana adresu unieważnia kod. Tutaj adres nie jest zmieniany przez człowieka,
         tylko wpisywany razem z kodem, który do niego należy. */
      const digits = String(confirmed?.code || '').replace(/\D/g, '');
      entryPreset = digits.length === 6 && confirmed?.entryId
        ? {
            intent,
            email: String(email).trim().toLowerCase(),
            code: digits,
            entryId: String(confirmed.entryId)
          }
        : null;
      entryGateCleared = false;
      setFormStep(1);
      const signup = $('#signup');
      signup?.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
      const stopped = await existingEntryGate(form, trigger || $('[data-form-next]', form));
      if (!stopped) return false;
      /* A single rider is already selected. The visitor still presses the clearly-labelled
         action button; with several riders they first choose the matching pill.

         Naciśnięcie zostaje także wtedy, gdy kod z rozmowy jest już potwierdzony — zmienia się
         tylko to, że po nim nie ma pytania o cyfry. Samoczynne uruchomienie czynności
         otwierałoby czytnik regulaminu, którego nikt nie zażądał, a przy „wycofaj mnie" byłoby
         to okno wyskakujące przed decyzją, nie po niej. */
      if (intent && selectedEntryId) {
        $('[data-entry-action="' + intent + '"]', panel)?.focus({ preventScroll: true });
      }
      return true;
    };
  }

  /**
   * Asks whether the typed address is already entered, and shows the panel if it is.
   *
   * @returns {Promise<boolean>} true when the form must not advance.
   */
  async function existingEntryGate(form, button) {
    const panel = $('[data-entry-found]', form);
    const endpoint = config.endpoints.entryLookup;
    if (!panel || !endpoint) return false;

    const email = String(form.elements.namedItem('email')?.value || '').trim().toLowerCase();
    if (!email) return false;
    // Already answered for this address. Asking again would be a button that does nothing.
    if (entryGateCleared) return false;

    /* Imię i nazwisko jadą razem z adresem, bo bez nich nie da się powiedzieć „ta osoba jest
       już zapisana" — a to jedyna wersja tego komunikatu, która kogoś zatrzymuje. Adres sam
       jest prawdziwy przy każdym kolejnym dziecku w rodzinie. */
    const firstName = String(form.elements.namedItem('firstName')?.value || '').trim();
    const lastName = String(form.elements.namedItem('lastName')?.value || '').trim();

    const original = button.textContent;
    button.disabled = true;
    button.textContent = text('form.checking') || original;
    try {
      const result = await postJSON(endpoint, eventPayload('entry-lookup', { email, firstName, lastName }));
      if (!result?.ok || !result.exists) return false;

      const entries = Array.isArray(result.entries) && result.entries.length
        ? result.entries
        : [{
            id: '',
            initials: result.initials || '',
            raceNumber: result.raceNumber || null,
            withdrawn: Boolean(result.withdrawn),
            minor: Boolean(result.minor),
            samePerson: Boolean(result.duplicate)
          }];

      /* Ta sama osoba, czy tylko ta sama skrzynka.
         ---------------------------------------------------------------------------
         Od tego zależy, co panel mówi i co robi domyślny przycisk. Bez tego podziału
         rodzina zapisująca czwarte dziecko czytała ostrzeżenie skierowane do kogoś, kto
         zapisuje się drugi raz, a osoba zapisująca się drugi raz czytała zaproszenie do
         zapisania kolejnego uczestnika. */
      const samePerson = Boolean(result.duplicate) || entries.some((entry) => entry.samePerson);
      panel.classList.toggle('is-same-person', samePerson);
      $$('[data-entry-lead]', panel).forEach((lead) => {
        lead.hidden = (lead.dataset.entryLead === 'person') !== samePerson;
      });
      $$('[data-entry-other-label]', panel).forEach((label) => {
        label.hidden = (label.dataset.entryOtherLabel === 'person') !== samePerson;
      });

      selectedEntryId = '';
      selectedEntry = null;
      const initials = $('[data-entry-initials]', panel);
      if (initials) {
        initials.textContent = entries.length > 1
          ? `${text('entry.initials') || ''} ${entries.length}`.trim()
          : '';
        initials.hidden = entries.length < 2;
      }

      const personList = $('[data-entry-person-list]', panel);
      if (personList) {
        const buttons = entries.map((entry) => {
          const choice = document.createElement('button');
          choice.type = 'button';
          choice.className = entry.samePerson ? 'entry-person is-same' : 'entry-person';
          choice.dataset.entryPerson = '';
          choice.dataset.entryId = entry.id || '';
          choice.setAttribute('aria-pressed', 'false');
          /* Inicjały dwóch braci wyglądają identycznie, więc przy trafionym duplikacie sam
             kafelek musi powiedzieć, który to. W etykiecie, nie tylko w kolorze obwódki —
             czytnik ekranu nie widzi klasy CSS. */
          const sameNote = entry.samePerson ? `, ${text('entry.samePersonMark')}` : '';
          choice.setAttribute('aria-label', `${entry.initials || '—'}${entry.raceNumber ? `, #${entry.raceNumber}` : ''}${sameNote}`);
          choice.entryRecord = entry;

          const avatar = document.createElement('span');
          avatar.className = 'entry-person__avatar';
          avatar.setAttribute('aria-hidden', 'true');
          avatar.textContent = entry.initials || '—';
          const copy = document.createElement('span');
          copy.className = 'entry-person__copy';
          const name = document.createElement('strong');
          name.textContent = entry.initials || '—';
          const number = document.createElement('small');
          number.textContent = entry.raceNumber ? `#${entry.raceNumber}` : '—';
          copy.append(name, number);
          if (entry.samePerson) {
            const badge = document.createElement('em');
            badge.className = 'entry-person__same';
            badge.textContent = text('entry.samePersonMark');
            copy.append(badge);
          }
          const mark = document.createElement('span');
          mark.className = 'entry-person__mark';
          mark.setAttribute('aria-hidden', 'true');
          mark.textContent = '✓';
          choice.append(avatar, copy, mark);
          return choice;
        });
        personList.replaceChildren(...buttons);
        personList.hidden = entries.length < 2;
      }

      const choices = $('[data-entry-choices]', panel);
      if (choices) choices.hidden = false;
      $$('[data-entry-action]', panel).forEach((choice) => {
        if (choice.dataset.entryAction === 'other') return;
        choice.hidden = false;
        choice.disabled = entries.length > 1;
      });
      $('[data-entry-code-step]', panel).hidden = true;
      $('[data-entry-edit-step]', panel).hidden = true;
      $('[data-entry-result]', panel).hidden = true;
      const status = $('[data-entry-status]', panel);
      if (status) status.textContent = '';

      /* One rider needs no extra question. More than one deliberately starts unselected, so
         edit/withdraw cannot target whoever happened to be returned first.

         Trafiony duplikat jest trzecim przypadkiem i też nie wymaga pytania: wiadomo, o kogo
         chodzi, bo imię i nazwisko zgadzają się dokładnie. To nie „ten, który wrócił
         pierwszy" — to ten, którego nazwisko właśnie wpisano. */
      if (personList) {
        const pills = $$('[data-entry-person]', personList);
        const preselect = result.duplicateId
          ? pills.find((pill) => pill.dataset.entryId === result.duplicateId)
          : (entries.length === 1 ? pills[0] : null);
        preselect?.click();
      }

      panel.hidden = false;
      window.dispatchEvent(new Event('carruleddhi:relayout'));
      panel.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
      return true;
    } catch (_) {
      /* A failed lookup lets the form through. The duplicate is still caught on submit with
         a 409, so nothing can be entered twice — the cost of a failure here is a returning
         rider filling in three steps for nothing, and the cost of the opposite choice would
         be a new rider unable to enter at all. */
      return false;
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  function setupRegistrationForm() {
    /** Interval id for the thank-you screen countdown. 0 when nothing is pending. */
    let successTimer = 0;
    const form = $('[data-registration-form]');
    if (!form) return;

    const focusRegistrationControl = (control) => {
      const dateTrigger = control?.matches?.('[data-date-input]')
        ? $('[data-date-trigger]', control.closest('[data-date-picker]'))
        : null;
      (dateTrigger && !dateTrigger.hidden ? dateTrigger : control)?.focus({ preventScroll: true });
    };

    $$('input, select, textarea', form).forEach((control) => {
      const eventName = control.tagName === 'SELECT' || control.type === 'checkbox' ? 'change' : 'input';
      control.addEventListener(eventName, () => {
        if (control.required && control.type !== 'checkbox') validateControl(control);
        if (control.type === 'checkbox') $('[data-consent-error]', form)?.style.setProperty('display', 'none');
        paintFormFill();
      });
    });

    /* Regulamin zaczyna się pobierać, gdy ktoś dotknie formularza.
       ---------------------------------------------------------------------------
       Zgody są w kroku trzecim, a to jest krok pierwszy — między jednym a drugim jest
       kilkadziesiąt sekund pisania, w których sieć nie robi nic. Dwa dokumenty zdejmowane
       właśnie wtedy nie kosztują nikogo ani chwili czekania, a naciśnięcie „Przeczytaj i
       zaakceptuj regulamin" zastaje je gotowe i nie pokazuje już „Wczytuję dokumenty…".

       `focusin` z `once`, nie `input`: liczy się moment, w którym ktoś zabiera się do
       wypełniania, a nie chwila, w której wpisze pierwszą literę — a przy `input`
       przygotowanie startowałoby ułamek sekundy później, po pierwszym naciśnięciu klawisza.
       Jedno wywołanie na życie strony, resztą zajmuje się prefetchLegalDocuments. */
    form.addEventListener('focusin', prefetchLegalDocuments, { once: true });
    /* Druga furtka, dla kogoś, kto przewinął prosto do zgód i niczego nie wpisał — na
       przykład wracającego zawodnika albo kogoś, kto chce tylko przeczytać regulamin.
       `pointerenter` wyprzedza kliknięcie o tyle, ile trwa ruch palca do przycisku. */
    const gateButton = $('[data-consent-gate]');
    gateButton?.addEventListener('pointerenter', prefetchLegalDocuments, { once: true });
    gateButton?.addEventListener('focus', prefetchLegalDocuments, { once: true });

    /**
     * The guardian block follows the birth date.
     *
     * Bound with `change` as well as `input` because the custom calendar writes the
     * value straight into the hidden native input and dispatches `change` — an
     * `input`-only listener would miss every date picked from the dialog, which is
     * how most people on a phone will pick it.
     */
    const birthControl = form.elements.namedItem('birthDate');
    const repaintMinor = () => {
      paintMinorState(form);
      paintFormFill();
    };
    birthControl?.addEventListener('input', repaintMinor);
    birthControl?.addEventListener('change', repaintMinor);
    $('[data-minor-consent]', form)?.addEventListener('change', () => {
      const error = $('[data-minor-consent-error]', form);
      if (error) error.style.display = 'none';
    });
    // The age sentence carries a translated string, so it is repainted on switch.
    window.addEventListener('carruleddhi:language', () => paintMinorState(form));
    paintMinorState(form);
    setupExistingEntry(form);

    $$('[data-form-next]', form).forEach((button) => button.addEventListener('click', async () => {
      const current = $(`[data-form-step="${state.formStep}"]`, form);
      if (!validateContainer(current)) return;

      /* On the way out of step 1, ask whether this address is already entered.
         ---------------------------------------------------------------------------
         It used to be discovered at the very end: fill in three steps, press send, get a
         409 and a toast saying "already registered". Everything typed after the address was
         wasted, and the two things somebody in that position actually wants — correct it, or
         withdraw — were not offered at all.

         One request, on one button press, on the step where the address lives. `await` is
         fine here: the button is the only thing waiting, and it says so. If the lookup fails
         for any reason the form carries on exactly as before, because a returning rider being
         sent through the form is a nuisance and a new rider being blocked by a failed lookup
         would be a broken page. */
      if (state.formStep === 1) {
        const held = await existingEntryGate(form, button);
        if (held) return;
      }
      setFormStep(state.formStep + 1);
    }));
    $$('[data-form-back]', form).forEach((button) => button.addEventListener('click', () => setFormStep(state.formStep - 1)));

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const requiredControls = $$('input, select, textarea', form)
        .filter((control) => control.required && control.type !== 'checkbox');
      let firstInvalid = null;
      requiredControls.forEach((control) => {
        if (!validateControl(control) && !firstInvalid) firstInvalid = control;
      });
      if (firstInvalid) {
        const invalidStep = Number(firstInvalid.closest('[data-form-step]')?.dataset.formStep) || 1;
        setFormStep(invalidStep, { focus: false });
        requestAnimationFrame(() => focusRegistrationControl(firstInvalid));
        return;
      }

      const data = registrationData(form);

      // The guardian authorisation is checked before the two document consents,
      // because it lives in step 1: sending somebody back to step 3 first and then
      // to step 1 would make them cross the whole form twice.
      if (data.isMinor && !data.guardianConsent) {
        const error = $('[data-minor-consent-error]', form);
        if (error) error.style.display = 'block';
        setFormStep(1, { focus: false });
        const consent = $('[data-minor-consent]', form);
        requestAnimationFrame(() => consent?.focus({ preventScroll: true }));
        return;
      }

      const consentValid = data.rulesConsent && data.privacyConsent;
      const consentError = $('[data-consent-error]', form);
      if (consentError) consentError.style.display = consentValid ? 'none' : 'block';
      if (!consentValid) {
        setFormStep(3, { focus: false });
        const gate = $('[data-consent-gate]');
        gate?.classList.add('is-nudged');
        window.setTimeout(() => gate?.classList.remove('is-nudged'), 600);
        gate?.focus({ preventScroll: true });
        return;
      }

      const submit = $('button[type="submit"]', form);
      const original = submit.innerHTML;
      submit.disabled = true;
      submit.textContent = text('form.sending');
      try {
        const result = await postJSON(config.endpoints.registration, eventPayload('registration', data));
        /* Zdjęte przed inkrementacją, żeby licznik zawodników przebiegł cyframi do nowej
           wartości. Dotąd stało tu `paintCounters(false)`, czyli podmiana liczby bez ruchu —
           a to jest jedyna chwila na całej stronie, w której ten licznik rośnie z powodu
           czynności odwiedzającego, i najlepszy moment, żeby to było widać. */
        const beforeEntry = countsSnapshot();
        const proposed = Number(config.pilotsBase) + state.registrations + 1;
        const raceNumber = String(result.raceNumber || proposed).padStart(3, '0');
        state.registrations += 1;
        if (Number.isFinite(state.remotePilots)) state.remotePilots += 1;
        state.lastRegistration = { ...data, raceNumber, submittedAt: new Date().toISOString() };
        storage.set('carruleddhi.registrations', String(state.registrations));
        /* Po UDANYM zapisie, nie przed: czat ma potem potwierdzić ten adres, a nie adres,
           którego serwer odrzucił. Imię, nie imię z nazwiskiem — brama czatu pyta o to
           samo, o co pole `given-name` w formularzu. */
        rememberPerson(data.firstName, data.email);
        const number = $('[data-race-number]');
        if (number) number.textContent = raceNumber;
        form.hidden = true;
        $('[data-form-success]')?.classList.add('is-active');
        paintCounters(true, beforeEntry);
        createBurst($('[data-race-number]')?.closest('.race-number'));
        if (result.demo) showToast(text('common.webhookDemo'));
        startSuccessReturn();
      } catch (error) {
        console.error('Registration webhook failed:', error);
        // Its own message. This used to borrow contact.error — "check the fields and
        // try again" — which is a lie here: the fields were already validated three
        // times above, and the only way to reach this line is the request failing.
        /* Three different failures, three different things to say. The duplicate is
           the one that matters: it is not a fault at all, it is the person already
           being on the list, and telling them "connection failed" would send them
           round the form again for nothing. */
        const key = error.payload?.code === 'ALREADY_REGISTERED'
          ? 'form.duplicate'
          : (error.status === 429 ? 'form.tooMany' : 'form.sendError');
        /* Duplikat to nie awaria: ta osoba jest już na liście i to jest fakt, nie usterka.
           Ostrzeżenie, nie czerwony błąd — a „nie udało się wysłać" i „za dużo prób" tak. */
        showToast(text(key), 7000, key === 'form.duplicate' ? 'info' : 'error');
        if (key === 'form.duplicate') {
          const emailField = form.elements.namedItem('email');
          setFormStep(1, { focus: false });
          requestAnimationFrame(() => focusRegistrationControl(emailField));
        }
      } finally {
        submit.disabled = false;
        submit.innerHTML = original;
      }
    });

    /**
     * Puts the empty form back.
     *
     * Used by the "new entry" button and by the timer that runs after the thank-you
     * screen, so both paths leave the form in exactly the same state — a reset that
     * exists in two places drifts apart.
     */
    function resetRegistrationForm() {
      window.clearInterval(successTimer);
      successTimer = 0;
      const note = $('[data-success-countdown]');
      if (note) note.textContent = '';
      form.reset();
      form.hidden = false;
      $('[data-form-success]')?.classList.remove('is-active');
      $$('[data-field]', form).forEach((field) => field.classList.remove('is-invalid'));
      $$('[aria-invalid]', form).forEach((control) => control.removeAttribute('aria-invalid'));
      // `form.reset()` empties the birth date but does not fire an event, so the
      // guardian block would stay open with seven required fields for the next
      // person, who has not typed a date at all.
      paintMinorState(form);
      setFormStep(1);
    }

    /**
     * Counts the thank-you screen down and then hands the form back.
     *
     * Twelve seconds: long enough to read the race number and the three reminder
     * dates, short enough that the next person in a queue at a stand is not left
     * looking for a button. The remaining seconds are shown rather than the form
     * vanishing without warning, and any click or key press cancels it — being
     * interrupted while reading your own race number would be worse than waiting.
     */
    /**
     * The thank-you screen now stays until it is dismissed.
     *
     * It used to count down from twelve and put the empty form back by itself. That is
     * wrong for what this screen is: it carries the race number, and the person
     * reading it is often reaching for a phone to photograph it. Removing itself
     * mid-sentence is the one thing it must not do.
     *
     * Two ways out, both deliberate: the cross closes it, "new registration" hands
     * back an empty form. The countdown element stays in the markup and stays empty —
     * it is announced by aria-live, and text appearing there would be read aloud for
     * no reason.
     */
    function startSuccessReturn() {
      window.clearInterval(successTimer);
      successTimer = 0;
      const note = $('[data-success-countdown]');
      if (note) note.textContent = '';
    }

    $('[data-new-registration]')?.addEventListener('click', resetRegistrationForm);
    $('[data-form-success-close]')?.addEventListener('click', resetRegistrationForm);

    $('[data-download-summary]')?.addEventListener('click', () => {
      const data = state.lastRegistration;
      if (!data) return;
      const lines = [
        'CARRULEDDHI SHOW 2026',
        '17 ottobre 2026 · Santa Teresa Gallura',
        '',
        `${text('success.number')}: ${data.raceNumber}`,
        `${text('form.firstName').replace(' *', '')}: ${data.firstName}`,
        `${text('form.lastName').replace(' *', '')}: ${data.lastName}`,
        `${text('form.email').replace(' *', '')}: ${data.email}`,
        `${text('form.cartName').replace(' *', '')}: ${data.cartName}`,
        `${text('nav.categories')}: ${data.category.toUpperCase()}`,
        '',
        'Documento riepilogativo — il modulo ufficiale firmabile sarà generato dal flusso Make.com.'
      ];
      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `carruleddhi-${data.raceNumber}.txt`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    window.addEventListener('carruleddhi:language', () => {
      setFormStep(state.formStep, { focus: false, announce: false });
    });
    setFormStep(1, { focus: false, announce: false });
  }

  function setupContactForm() {
    const form = $('[data-contact-form]');
    if (!form) return;
    $$('input, textarea', form).forEach((control) => control.addEventListener('input', () => validateControl(control)));
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = $('[data-contact-status]', form);
      if (!validateContainer(form)) {
        if (status) status.textContent = text('contact.error');
        return;
      }
      const submit = $('button[type="submit"]', form);
      const original = submit.textContent;
      submit.disabled = true;
      submit.textContent = text('form.sending');
      const values = Object.fromEntries(new FormData(form).entries());
      try {
        const result = await postJSON(config.endpoints.contact, eventPayload('contact', {
          name: String(values.name || '').trim(),
          email: String(values.email || '').trim().toLowerCase(),
          message: String(values.message || '').trim()
        }));
        if (status) status.textContent = text('contact.success');
        form.reset();
        if (result.demo) showToast(text('common.webhookDemo'));
      } catch (error) {
        console.error('Contact webhook failed:', error);
        if (status) status.textContent = text('contact.error');
      } finally {
        submit.disabled = false;
        submit.textContent = original;
      }
    });
  }

  function setupAccordion() {
    $$('[data-accordion] .accordion__button').forEach((button) => {
      button.addEventListener('click', () => {
        const currentlyOpen = button.getAttribute('aria-expanded') === 'true';
        $$('[data-accordion] .accordion__button').forEach((item) => item.setAttribute('aria-expanded', 'false'));
        button.setAttribute('aria-expanded', String(!currentlyOpen));
      });
    });
  }

  /**
   * Sonda odwiedzin — jedno żądanie na wejście, wyłącznie za zgodą.
   * ===========================================================================
   * PO CO
   *   Żeby dało się odpowiedzieć „ile osób przyszło z Instagrama, a ile z Google", zanim
   *   ktokolwiek wyda złotówkę na reklamę. Panel rysuje z tego wykresy — patrz zakładka
   *   Statystyki i migracja 0033.
   *
   * ZGODA JEST WARUNKIEM, NIE USTAWIENIEM
   *   Baner na tej stronie obiecuje „analityczne uruchomimy wyłącznie za Twoją zgodą".
   *   Dopóki jej nie ma, ta funkcja nie wysyła ANI JEDNEGO żądania — nie „wysyła mniej"
   *   i nie „wysyła bez identyfikatora". Nic.
   *
   *   Kto zgodzi się w trakcie wizyty, zostaje policzony od tej chwili: nasłuch na
   *   `carruleddhi:consent` istnieje po to, żeby kliknięcie „Akceptuj" działało od razu,
   *   a nie dopiero przy następnym wejściu.
   *
   * CO IDZIE NA SERWER
   *   Ścieżka, odsyłacz, ciąg zapytania (dla utm_*), język i szerokość okna. Ani adresu
   *   e-mail, ani niczego wpisanego w formularz, ani ciasteczka. Kto to jest, serwer liczy
   *   sam jako skrót wygasający po dobie — patrz recordVisit() w worker/index.js.
   *
   * PIERWSZE DOTKNIĘCIE ZOSTAJE W PRZEGLĄDARCE
   *   Ktoś klika reklamę na Instagramie, wraca po trzech dniach z wyszukiwarki i dopiero
   *   wtedy się zapisuje. Zapisany „google" powiedziałby, że reklama nic nie dała. Dlatego
   *   pierwszy odsyłacz i pierwsza kampania lądują w `localStorage` i jadą razem ze
   *   zgłoszeniem — raz zapisane, nigdy nadpisywane.
   */
  const FIRST_TOUCH_KEY = 'carruleddhi.firstTouch';

  /** Pierwsze dotknięcie tej przeglądarki, albo `null`. Czytane też przez formularz zapisu. */
  function firstTouch() {
    try { return JSON.parse(storage.get(FIRST_TOUCH_KEY, 'null')); } catch (_) { return null; }
  }

  function setupVisitBeacon() {
    const consented = () => {
      try { return JSON.parse(storage.get('carruleddhi.cookies', 'null'))?.analytics === true; }
      catch (_) { return false; }
    };

    let sent = false;
    const send = () => {
      if (sent || !consented()) return;
      sent = true;

      const search = window.location.search || '';
      const params = new URLSearchParams(search);

      /* Zapisywane tylko wtedy, gdy jeszcze nic tam nie stoi. Druga wizyta z innego źródła
         nie ma prawa nadpisać tego, co przyprowadziło tę osobę pierwszy raz. */
      if (!firstTouch()) {
        let host = '';
        try { host = new URL(document.referrer).hostname; } catch (_) { host = ''; }
        storage.set(FIRST_TOUCH_KEY, JSON.stringify({
          ref: host,
          utmSource: params.get('utm_source') || '',
          utmCampaign: params.get('utm_campaign') || '',
          at: new Date().toISOString()
        }));
      }

      const body = JSON.stringify({
        path: window.location.pathname || '/',
        ref: document.referrer || '',
        q: search,
        lang: document.documentElement.lang || '',
        width: window.innerWidth || 0
      });

      /* `sendBeacon` przeżywa zamknięcie karty, czego zwykły `fetch` nie gwarantuje — a to
         jest żądanie, które ma nie opóźnić ani nie zablokować niczego, co robi człowiek.
         `fetch` z `keepalive` jest zapasem dla przeglądarek bez `sendBeacon`. */
      const url = `${config.endpoints.counts.replace(/\/counts$/, '')}/visit`;
      try {
        if (navigator.sendBeacon?.(url, new Blob([body], { type: 'application/json' }))) return;
      } catch (_) { /* zablokowane rozszerzeniem albo trybem prywatnym */ }
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true })
        .catch(() => { /* licznik odwiedzin nie ma prawa niczego zepsuć */ });
    };

    send();
    // Zgoda kliknięta w trakcie wizyty liczy się od razu.
    window.addEventListener('carruleddhi:consent', send);
  }

  function setupCookieConsent() {
    const banner = $('[data-cookie-banner]');
    const panel = $('[data-cookie-panel]');
    const analytics = $('[data-cookie-analytics]');
    const save = $('[data-cookie-save]');
    if (!banner) return;
    let saved = null;
    try { saved = JSON.parse(storage.get('carruleddhi.cookies', 'null')); } catch (_) { saved = null; }

    function applyConsent(consent) {
      storage.set('carruleddhi.cookies', JSON.stringify({ version: 1, necessary: true, analytics: Boolean(consent.analytics), savedAt: new Date().toISOString() }));
      banner.classList.remove('is-visible');
      banner.setAttribute('aria-hidden', 'true');
      window.dispatchEvent(new CustomEvent('carruleddhi:consent', { detail: consent }));
    }
    function openSettings() {
      let current = null;
      try { current = JSON.parse(storage.get('carruleddhi.cookies', 'null')); } catch (_) { current = null; }
      if (analytics) analytics.checked = Boolean(current?.analytics);
      banner.classList.add('is-visible');
      banner.setAttribute('aria-hidden', 'false');
      panel?.classList.add('is-open');
      if (save) save.hidden = false;
    }

    $('[data-cookie-accept]')?.addEventListener('click', () => applyConsent({ analytics: true }));
    $('[data-cookie-reject]')?.addEventListener('click', () => applyConsent({ analytics: false }));
    $('[data-cookie-customize]')?.addEventListener('click', () => {
      panel?.classList.toggle('is-open');
      if (save) save.hidden = !panel?.classList.contains('is-open');
    });
    save?.addEventListener('click', () => applyConsent({ analytics: Boolean(analytics?.checked) }));
    $$('[data-cookie-settings]').forEach((button) => button.addEventListener('click', openSettings));

    if (!saved || saved.version !== 1) {
      window.setTimeout(() => {
        banner.classList.add('is-visible');
        banner.setAttribute('aria-hidden', 'false');
      }, reducedMotion ? 50 : 1700);
    }
  }

  function setupCursor() {
    if (!finePointer || reducedMotion) return;
    const dot = $('[data-cursor-dot]');
    const ring = $('[data-cursor-ring]');
    if (!dot || !ring) return;

    /* Systemowy kursor chowamy dopiero TUTAJ, nie w arkuszu stylów.
       ---------------------------------------------------------------------------
       Do tej pory widać było dwa kursory naraz: systemową strzałkę i żółtą kropkę
       z pierścieniem.

       Kusi, żeby dopisać `cursor: none` do `body` w CSS i mieć spokój. To jest pułapka:
       ta funkcja kończy się przedwcześnie na trzy sposoby — urządzenie bez precyzyjnego
       wskaźnika (`finePointer`), włączone ograniczenie ruchu (`reducedMotion`) i brak
       elementów w HTML-u. W każdym z nich reguła z CSS nadal by działała, a własny kursor
       już nie — czyli użytkownik z włączonym „ogranicz animacje" zostawałby bez
       jakiegokolwiek kursora. To nie jest efekt, to jest niesprawna strona.

       Klasa zakładana po przejściu wszystkich trzech warunków wiąże ukrycie z istnieniem
       zamiennika. Zdejmowana nie jest, bo `setupCursor` uruchamia się raz. */
    document.documentElement.classList.add('has-custom-cursor');

    /* KURSOR SYSTEMOWY NA CZAS OKIENEK PRZEGLĄDARKI.
       ---------------------------------------------------------------------------
       Zgłoszone jako „przy wybieraniu daty nie widać kursora", i tak właśnie było.
       Kalendarz `input[type=date]` rysuje przeglądarka NAD stroną, poza dokumentem. Póki
       jest otwarty, strona nie dostaje ani jednego `pointermove` — kropka i pierścień stoją
       zamrożone w miejscu, w którym były w chwili kliknięcia, zwykle pod samym okienkiem.
       `cursor: none` obowiązuje dalej, bo to reguła założona na stronę. Kursora nie ma
       nigdzie i nie da się trafić w dzień w kalendarzu.

       Samego okienka nie da się wykryć: nie emituje zdarzeń, nie jest elementem, nie rusza
       fokusu. Da się natomiast wykryć jego POWÓD — fokus na kontrolce, która je otwiera.
       Lista niżej to wszystkie takie kontrolki na tej stronie: pola daty i czasu, wybór
       koloru, wybór pliku i `select`. Póki któraś z nich ma fokus, oddajemy kursor systemowi.

       DLACZEGO FOKUS, A NIE KLIKNIĘCIE
         Kalendarz otwiera też klawiatura (spacja na polu daty) i strzałka w dół na
         `select`. Warunek na kliknięciu przegapiłby oba, a to są drogi, którymi chodzi
         każdy, kto nie używa myszy.

       DLACZEGO PRZY OKAZJI `blur` OKNA
         Wybór pliku otwiera okno systemowe, które zabiera fokus całej karcie. Wtedy
         `focusout` nie przyjdzie, dopóki okno się nie zamknie — a przez ten czas kursor
         i tak należy do systemu. Jeden warunek więcej, ta sama klasa. */
    const nativeCursorFields = 'input[type="date"], input[type="time"], input[type="month"],'
      + ' input[type="week"], input[type="datetime-local"], input[type="color"],'
      + ' input[type="file"], select';
    const nativeCursor = (on) => document.documentElement.classList.toggle('native-cursor', on);
    const insidePicker = () => Boolean(document.activeElement?.closest?.(nativeCursorFields));

    document.addEventListener('focusin', () => nativeCursor(insidePicker()));
    document.addEventListener('focusout', () => {
      /* Po `focusout` `activeElement` jest jeszcze starym elementem — odczyt w następnej
         mikropauzie widzi już nowy fokus (albo `body`). Bez tego przejście z pola daty na
         sąsiednie pole tekstowe zostawiałoby kursor systemowy do końca wizyty. */
      setTimeout(() => nativeCursor(insidePicker()), 0);
    });
    window.addEventListener('blur', () => nativeCursor(true));
    window.addEventListener('focus', () => nativeCursor(insidePicker()));

    let pointerX = -100;
    let pointerY = -100;
    let ringX = -100;
    let ringY = -100;
    let cursorFrame = 0;

    /* `transform`, not `left`/`top`.
       ---------------------------------------------------------------------------
       Both of these elements used to be positioned by writing `left` and `top`: the dot on
       every pointermove, which on a 1000 Hz mouse is a thousand style writes a second, and
       the ring on every frame of the follow loop below, forever. Those two properties are
       laid out and painted; `transform` is composited, so the same movement costs the main
       thread nothing once the layer exists.

       The `translate(-50%, -50%)` stays on the end and keeps doing what it did in the
       stylesheet — centring each element on the pointer. It has to be the second function,
       not the first, because it is relative to the element's own size and the ring changes
       size between its five states. */
    const place = (element, x, y) => {
      element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    };

    window.addEventListener('pointermove', (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      dot.style.opacity = '1';
      ring.style.opacity = '1';
      // The loop parks itself when the ring catches up, so every move has to restart it.
      if (!cursorFrame) cursorFrame = requestAnimationFrame(animate);
    }, { passive: true });
    /* What the ring says about what is under it.
       ---------------------------------------------------------------------------
       It had one state: over-something-clickable or not. Everything from a text field to a
       prize card to the big red button got the same ring, which meant the ring was decoration
       rather than information — it moved, but it never told you anything.

       Four states now, and each one is a different kind of thing you can do:
         is-hover  something to press or type in
         is-drag   the prize deck, which responds to being thrown sideways
         is-text   a field that takes typing, so the ring narrows to a caret
         is-press  the pointer is down, on anything
       The label is set from a data attribute so a card can say "przeciągnij" without this
       function knowing the word — the copy stays in the markup and the translations. */
    const MODES = [
      ['is-drag', '[data-prize-card], [data-gallery-track]'],
      ['is-text', 'input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea'],
      ['is-hover', 'a, button, select, label, [role="button"], summary, [data-wall-open]']
    ];
    document.addEventListener('pointerover', (event) => {
      const target = event.target;
      // First match wins, so the more specific kinds are listed before the general one.
      const mode = MODES.find(([, selector]) => target.closest?.(selector));
      ring.classList.toggle('is-drag', mode?.[0] === 'is-drag');
      ring.classList.toggle('is-text', mode?.[0] === 'is-text');
      ring.classList.toggle('is-hover', mode?.[0] === 'is-hover');
    });

    // Pressed state on the ring itself, so a click is acknowledged even on something that
    // does not move — a card mid-throw, or an area with no hover style of its own.
    window.addEventListener('pointerdown', () => ring.classList.add('is-press'), { passive: true });
    window.addEventListener('pointerup', () => ring.classList.remove('is-press'), { passive: true });
    // A pointer that leaves the window never gets its `pointerup`, and the ring would stay
    // shrunk for the rest of the visit.
    window.addEventListener('pointercancel', () => ring.classList.remove('is-press'), { passive: true });
    document.addEventListener('mouseleave', () => {
      dot.style.opacity = '0';
      ring.style.opacity = '0';
      ring.classList.remove('is-press');
    });

    /* Runs only while there is something left to move.
       ---------------------------------------------------------------------------
       This used to be an unconditional `requestAnimationFrame(animate)` at the end of every
       frame: a loop that started on load and never stopped, on every desktop visit, for the
       whole visit. It kept running with the pointer parked, with the window scrolled to a
       section that has no cursor in it, and with the ring already exactly where it belongs —
       waking the main thread sixty times a second to write two values that had not changed.

       Now the last frame is the one where the ring arrives. A tenth of a pixel is below what
       `place()` even writes out, so stopping there is invisible, and the next pointermove
       starts it again. Idle costs nothing. */
    function animate() {
      cursorFrame = 0;
      ringX += (pointerX - ringX) * 0.16;
      ringY += (pointerY - ringY) * 0.16;
      place(dot, pointerX, pointerY);
      place(ring, ringX, ringY);
      if (Math.abs(pointerX - ringX) > 0.1 || Math.abs(pointerY - ringY) > 0.1) {
        cursorFrame = requestAnimationFrame(animate);
      }
    }
    cursorFrame = requestAnimationFrame(animate);
  }

  function setupMagneticButtons() {
    if (!finePointer || reducedMotion) return;
    $$('.magnetic').forEach((button) => {
      button.addEventListener('pointermove', (event) => {
        const rect = button.getBoundingClientRect();
        const x = (event.clientX - rect.left - rect.width / 2) * 0.14;
        const y = (event.clientY - rect.top - rect.height / 2) * 0.18;
        button.style.transform = `translate(${x}px, ${y}px)`;
      });
      button.addEventListener('pointerleave', () => button.style.removeProperty('transform'));
    });
  }

  function setupHeroMotion() {
    if (!finePointer || reducedMotion) return;
    const hero = $('.hero');
    const content = $('.hero__content');
    if (!hero || !content) return;
    hero.addEventListener('pointermove', (event) => {
      const x = (event.clientX / window.innerWidth - 0.5) * 12;
      const y = (event.clientY / window.innerHeight - 0.5) * 8;
      content.style.transform = `translate(${x}px, ${y}px)`;
    });
    hero.addEventListener('pointerleave', () => { content.style.transform = 'translate(0, 0)'; });
  }

  /**
   * HERO POZA WIDOKIEM PRZESTAJE SIĘ ANIMOWAĆ (TELEFON).
   * ===========================================================================
   * OBJAW, KTÓREGO TO DOTYCZY
   *   „Strona na telefonie sama się odświeża w okolicy sekcji dwunastu nagród." W kodzie nie ma
   *   ani jednego `location.reload()` ani service workera, a sonda błędów przechodzi tę okolicę
   *   bez wyjątku, bez odrzuconej obietnicy i bez spadku liczby klatek (36 klatek na 600 ms w
   *   każdym punkcie pomiaru). Zostaje jedno: przeglądarka mobilna ubija proces renderujący z
   *   braku pamięci i wczytuje dokument od nowa. Takie zabicie nie zostawia śladu w konsoli,
   *   więc jedyne, co da się zmierzyć i obniżyć, to ZUŻYCIE, które do niego prowadzi. Rachunek
   *   jest zbierany w kilku miejscach naraz — `backdrop-filter`, cienie paneli i ziarno na całym
   *   ekranie (carnival.css), cień rysunku nagrody (main.css), warstwy karuzeli (gallery-3d.js),
   *   warstwy stosu kart (wyżej w tym pliku). To jest pozycja, która trwa NAJDŁUŻEJ: do końca
   *   wizyty.
   *
   * CO TU BYŁO, ZMIERZONE
   *   Hero ma cztery animacje NIESKOŃCZONE i żadna z nich nie pyta, czy hero jest na ekranie.
   *   Pomiar (tools/probe-c-prizes-memory.js na 390x844 plus osobny przebieg liczący animacje po
   *   nazwie; ekran ustawiony na sekcji nagród, scrollY 7324, próbki po 1,4 s / 3 s / 6 s):
   *
   *     animacji `running` w 1,4 s po dojściu do sekcji:   180  (162 poza ekranem)
   *     w 3 s i w 6 s, czyli w stanie spokoju:              16  (wszystkie nieskończone)
   *     z tych 16 poza ekranem, w hero:                      4
   *       float-orb  @ section.hero          390x869 = 338 892 px2
   *       marquee    @ div.marquee__track   2108x24  =  50 598 px2
   *       fx-jitter  @ span.fx-jitter        119x44  =   5 088 px2
   *       spin       @ span.hero__kicker-dot  30x30  =   1 030 px2
   *     suma:                                              395 608 px2 (0,40 Mpx)
   *
   *   Czyli jedna czwarta wszystkich animacji działających w chwili, gdy czytelnik stoi w talii
   *   nagród, należy do sekcji sprzed kilku tysięcy pikseli — a `float-orb` animuje pudełko
   *   wielkości całego hero (0,34 Mpx z tych 0,40). Trwająca animacja transformacji dostaje w
   *   Chrome własną warstwę kompozytora i przelicza ją w każdej klatce; nieskończona nie kończy
   *   się nigdy.
   *
   * DLACZEGO `IntersectionObserver`, A NIE NASŁUCH `scroll`
   *   Wersja na `scroll` musiałaby wołać `getBoundingClientRect()` na hero przy każdym zdarzeniu,
   *   czyli wymuszać przeliczenie układu w trakcie przewijania — dokładnie ten błąd, który jest
   *   rozpisany przy `measure()` w setupPanels i przy dokowaniu licznika. Obserwator odpowiada na
   *   to samo pytanie bez ani jednego pomiaru w naszym kodzie.
   *
   * `rootMargin` HOJNY Z ROZMYSŁU
   *   Trzydzieści procent ekranu zapasu: ruch wraca, ZANIM hero wjedzie w kadr, więc pierwsza
   *   klatka, którą czytelnik widzi po powrocie na górę, jest już animowana. Przy sekcji nagród,
   *   która leży kilka ekranów niżej, ten zapas nie obowiązuje.
   *
   * TYLKO WĄSKI EKRAN ALBO PALEC
   *   Na pulpicie pamięci i mocy jest dość, a strona ma tam wyglądać dokładnie tak jak dotąd —
   *   ten sam warunek stawiają wszystkie bloki obniżające koszt warstw w carnival.css. Zapytanie
   *   jest czytane RAZ, bez nasłuchu na zmianę: obrót telefonu nie przenosi nikogo z jednej
   *   klasy urządzeń do drugiej, a nasłuch to kolejny stan do utrzymania.
   */
  function setupHeroAmbient() {
    const hero = $('.section-card--hero');
    if (!hero || !('IntersectionObserver' in window)) return;
    if (!window.matchMedia('(max-width: 760px), (pointer: coarse)').matches) return;
    const nearby = new IntersectionObserver((entries) => {
      hero.classList.toggle('is-offscreen', !entries.some((entry) => entry.isIntersecting));
    }, { rootMargin: '30% 0px 30% 0px', threshold: 0 });
    nearby.observe(hero);
  }

  /* Set by setupRouteDraw once the road geometry is known, called by setupRouteZoom on every
     frame the section is on screen. Null until then, and null for good if the route has no
     path configured — the zoom checks before calling, so a missing road costs a missing cart
     and nothing else. */
  let routeCartPlacer = null;
  let routeCart = null;

  function setupRouteDraw() {
    const frame = $('[data-route-frame]');
    const svg = $('[data-route-svg]');
    const core = $('[data-route-core]');
    const mask = $('[data-route-mask]');
    const ribbonCasing = $('[data-route-ribbon-casing]');
    const ribbonFill = $('[data-route-ribbon-fill]');
    const dash = $('[data-route-dash]');
    const startNode = $('[data-route-node="start"]');
    const finishNode = $('[data-route-node="finish"]');
    if (!frame || !svg || !core || !mask || !ribbonCasing || !ribbonFill || !dash) return;

    if (!config.route.path.length) {
      frame.classList.add('is-route-hidden');
      return;
    }

    const startPin = $('.route__pin--start', frame);
    const finishPin = $('.route__pin--end', frame);
    routeCart = $('[data-route-cart]', frame);
    let viewHeight = ROUTE_VIEWBOX;
    let total = 0;

    /** The box the current road was built for, as "WxH". Empty until the first build. */
    let builtFor = '';

    /**
     * The viewBox height tracks the frame's real aspect ratio. With a matching
     * aspect and preserveAspectRatio="none", one user unit is the same length on
     * both axes, so the ribbon normals are not skewed.
     *
     * @returns {'no'|'same'|'built'} — 'same' means the box has not moved and nothing was
     *   touched, which is what almost every call is.
     */
    function layout() {
      /* `offsetWidth`/`offsetHeight`, NOT `getBoundingClientRect()`, and both reasons matter.
         ---------------------------------------------------------------------------
         1. IT IS THE CONDITION FOR REBUILDING AT ALL. Everything below is derived from the
            frame's own box and from nothing else, so a call that finds the same box is 120 ms
            of work with an identical result. `getBoundingClientRect()` cannot answer "has the
            box changed" here, because route-zoom.css puts a scroll-driven `scale()` and
            `rotate()` on this element on a phone: its client rect changes on every frame of
            the zoom while its layout box sits still.

         2. IT IS ALSO THE RIGHT NUMBER. The aspect ratio wanted here is the element's own, and
            the client rect of a rotated element is its *bounding* box — wider and shorter than
            the element really is. On a phone the frame carries `rotate(-2.2deg)` at rest, so
            the viewBox was built from a ratio the element never had and
            `preserveAspectRatio="none"` stretched the road to fit it. */
      const width = frame.offsetWidth;
      const height = frame.offsetHeight;
      if (!width || !height) return 'no';

      const key = `${width}x${height}`;
      if (key === builtFor) return 'same';

      viewHeight = Math.round((height / width) * ROUTE_VIEWBOX);
      svg.setAttribute('viewBox', `0 0 ${ROUTE_VIEWBOX} ${viewHeight}`);

      const data = buildRoutePathData(config.route.path, ROUTE_VIEWBOX, viewHeight);
      if (!data) return 'no';
      core.setAttribute('d', data);
      mask.setAttribute('d', data);
      dash.setAttribute('d', data);
      total = core.getTotalLength();

      const near = clamp(Number(config.route.width?.near) || 26, 4, 80);
      const far = clamp(Number(config.route.width?.far) || 5, 1, 40);
      mask.setAttribute('stroke-width', String(Math.max(24, near * 3.2)));
      // Road markings: an outlined dash run instead of one solid ribbon. One walk of the path
      // for both widths — see the note on `passes` in route-path.js.
      const [casing, fill] = buildDashPathData(core, {
        near, far, height: viewHeight,
        passes: [{ widthScale: 1, widthPad: 2.6 }, { widthScale: 1, widthPad: 0 }]
      });
      ribbonCasing.setAttribute('d', casing);
      ribbonFill.setAttribute('d', fill);
      builtFor = key;
      return 'built';
    }

    const place = (element, length, insetPercent = 0) => {
      if (!element || !total) return null;
      const point = core.getPointAtLength(clamp(length, 0, total));
      const x = (point.x / ROUTE_VIEWBOX) * 100;
      const y = (point.y / viewHeight) * 100;
      element.style.left = `${clamp(x, insetPercent, 100 - insetPercent)}%`;
      element.style.top = `${clamp(y, insetPercent, 100 - insetPercent)}%`;
      return point;
    };

    function placeMarkers() {
      place(startNode, 0);
      place(finishNode, total);
      // 1.2, nie 22. Wieksze wciecie odsuwalo napis od punktu, ktory nazywa: trasa
      // zaczyna sie na x = 100 %, wiec PARTENZA ladowala o jedna piata kadru dalej.
      // Tyle zostaje, zeby kropka nie zostala przycieta krawedzia zdjecia.
      place(startPin, 0, 1.2);
      place(finishPin, total, 1.2);
    }

    /* Hand the cart placer to setupRouteZoom.
       ---------------------------------------------------------------------------
       The scroll position is known there; the shape of the road is known here. Rather than
       have the zoom re-derive the geometry — a second copy of the path maths that could
       disagree with the pins — this exposes the one thing it needs: "put the cart at
       fraction t along the route".

       A shared closure variable rather than an event per frame. The zoom runs on every frame
       the section is visible, and dispatching a DOM event that often to move one emoji is
       paying for a message bus we do not need; both functions already live in the same
       closure. */
    routeCartPlacer = (t) => {
      if (!routeCart) return;
      place(routeCart, clamp(t, 0, 1) * total);
    };
    routeCartPlacer(0);

    if (layout() === 'no') {
      frame.classList.add('is-route-hidden');
      return;
    }
    placeMarkers();

    // Static state first: if motion is reduced the finished line is what matters.
    mask.style.strokeDasharray = `${total}`;
    mask.style.strokeDashoffset = reducedMotion ? '0' : `${total}`;

    let relayoutFrame = 0;
    const relayout = () => {
      cancelAnimationFrame(relayoutFrame);
      relayoutFrame = requestAnimationFrame(() => {
        const drawn = frame.classList.contains('is-route-drawn');
        // 'same' means the frame is exactly where it was: nothing to rebuild, and nothing to
        // re-place either, so the markers are left alone as well.
        if (layout() !== 'built') return;
        mask.style.strokeDasharray = `${total}`;
        mask.style.strokeDashoffset = drawn || reducedMotion ? '0' : `${total}`;
        placeMarkers();
      });
    };

    /* THIS LISTENER IS WHY THE PAGE JUMPED UNDER A THUMB. THE GUARD IS IN `layout()`.
       ---------------------------------------------------------------------------
       On a phone `resize` is not a rare event. Every time the browser's address bar slides
       away or comes back — which is every time somebody changes scroll direction — the window
       fires it. This listener answered each one by rebuilding the road: a new `d` on three
       paths, `getTotalLength()`, and a walk of the path sampling it hundreds of times.

       MEASURED on 390x844 at 4x CPU throttling, twelve address-bar movements: twelve long
       tasks, 2204 ms in total, 156 to 231 ms each. A long task is a main thread that answers
       nothing — while it runs the fling carries on in the compositor and the page arrives
       somewhere else the moment it ends. That is the "it teleports"; swiping faster moves the
       address bar more often, which is the "and it is worse when I do it quickly".

       setupPanels a few hundred lines down has this exact trap written up twice and guards
       against it by looking at the window's WIDTH. This function never got the guard. It is
       not repeated here as a device check, because the honest condition is narrower and does
       not need to know what kind of device it is on: the road is derived from the frame's box,
       so a call that finds the same box has nothing to do. An address bar does not change
       that box.

       The listener stays, and so does the observer: between them they catch a rotation, a
       desktop window drag, and the frame changing size for a reason of its own. They simply no
       longer cost anything when nothing has happened. */
    window.addEventListener('resize', relayout, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(relayout).observe(frame);

    if (reducedMotion) {
      frame.classList.add('is-route-drawn');
      return;
    }

    /**
     * The travelling cart used to be animated here on its own rAF loop. It has
     * been removed: it landed on top of the finish badge in the bottom-left
     * corner, and a 40x30 illustration on a photographed street read as clutter
     * rather than information. The marching dashes already carry the direction
     * of travel, and they cost nothing because the browser animates
     * stroke-dashoffset on the compositor.
     */
    function draw() {
      mask.style.transition = 'stroke-dashoffset 2.5s cubic-bezier(.16,1,.3,1)';
      mask.style.strokeDashoffset = '0';
      frame.classList.add('is-route-drawn');
    }

    if (!('IntersectionObserver' in window)) {
      draw();
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      observer.disconnect();
      draw();
    }, { threshold: 0.28 });
    observer.observe(frame);
  }

  /**
   * Sticky panels only work when the content fits the viewport. Anything taller
   * is demoted to a flow section so its lower half stays reachable.
   */
  function setupPanels() {
    const panels = $$('#main > section.section-card');
    if (!panels.length) return;
    /* Sections whose own sticky children need more than one screen of scroll.
       `contact` is declared here rather than measured because its height is not a property of
       the page, it is a property of what somebody is doing: the chat log grows with the
       conversation, the composer grows with the message being typed, and the name/e-mail card
       disappears when it is filled in. Measuring that meant the panel could flip between
       `pinned` (sticky) and `flow` (relative) mid-sentence, which changes its position and
       moves the page under the cursor. One verdict, taken once, is worth more here than an
       accurate one taken repeatedly.

       `wall` is here for the same reason and it was a visible fault: a pinned section is
       `overflow: hidden` and one screen tall, so once the comments were longer than the
       viewport — which one comment with a photograph in it already is — the rest of them were
       clipped and there was nothing to scroll to. The list grows with every message, grows
       again when somebody attaches a picture, and grows a third time when "show more" is
       pressed, so measuring it once was never going to hold. */
    /* `voting` i `podium` są tu z trzeciego powodu: w chwili pomiaru są ukryte.
       ---------------------------------------------------------------------------
       Obie sekcje startują z atrybutem `hidden` i pokazuje je dopiero odczyt fazy z serwera.
       Ukryta sekcja ma zerową wysokość, więc pomiar orzekał „mieści się na jednym ekranie" i
       nadawał jej tryb `pinned` — a `pinned` znaczy `position: sticky` plus `overflow: hidden`
       i jeden ekran wysokości. Kilkadziesiąt kafelków uczestników zostałoby wtedy ucięte
       dokładnie tak, jak wcześniej były ucinane komentarze, i z tego samego powodu.

       Podium na telefonie też: trzy karty zwycięzców układają się w kolumnę, więc razem z
       rysunkiem cokołu wychodzi więcej niż ekran.

       Deklaracja, nie pomiar — jak `contact` i `wall`. Jeden werdykt podjęty raz jest tu wart
       więcej niż trafny werdykt podejmowany wielokrotnie, bo przełączenie trybu w trakcie
       przesuwa stronę pod palcem. */
    const alwaysFlow = new Set([
      'categories', 'prizes', 'signup', 'contact', 'wall', 'voting', 'podium'
    ]);

    /* On a phone the route section gets its own scroll length.
       ---------------------------------------------------------------------------
       The photograph's zoom, the copy sliding away and the cart running down the road all
       happen across `--route-progress`, and on a phone that whole sequence had barely half a
       screen of scrolling to happen in — because the section is one screen tall and the next
       panel starts covering it as soon as it is scrolled past. So it was over before it read
       as anything, and the next card arrived on top of a picture still growing.

       As a flow section it can be two screens tall with its contents pinned inside (the same
       arrangement the categories and prizes sections already use), which gives the sequence a
       screen of travel and puts the next panel after it rather than during it. The height and
       the inner sticky wrapper are in route-zoom.css, scoped to the same 760px.

       Not applied on a desktop, where the section is wide, the copy sits beside the picture
       rather than above it, and one screen is enough. */
    const routeFlowsBelow = 760;

    // The gallery is the one section with a hard `height: 100svh` and
    // `overflow: hidden` in CSS, so it can never need more than one screen no
    // matter what the copy does. Measuring it is not just unnecessary, it is
    // unreliable: the probe runs before the webfont settles and once read the
    // section too tall, which parked it as a flow section for the rest of the
    // visit. It is declared instead.
    const alwaysPinned = new Set(['gallery']);

    /* Raised while measure() is running and for the rest of that frame.
       Explained in full at the ResizeObserver below: the measurement itself resizes every
       panel it looks at, so without this the observer would report our own work back to us
       for ever. */
    let selfInflicted = false;

    /**
     * Wysokość jednego ekranu — mierzona TĄ SAMĄ jednostką, której użyje CSS.
     *
     * TO JEST WŁAŚCIWA PRZYCZYNA PRZESKAKIWANIA, A NIE JEJ OBJAW
     *   Sekcja przypięta dostaje z CSS `min-height: 100svh`. Werdykt „mieści się na jednym
     *   ekranie czy nie" musi więc być liczony względem `100svh` — bo to jest ta wysokość,
     *   którą sekcja naprawdę dostanie, jeśli ją przypniemy.
     *
     *   Wcześniej porównanie szło do `window.innerHeight`. Na telefonie to są dwie różne
     *   liczby: `svh` to wysokość przy WIDOCZNYM pasku adresu i jest **stała**, a
     *   `window.innerHeight` puchnie i chudnie o 60–100 px za każdym razem, gdy pasek się
     *   chowa. Kod decydował więc o układzie rządzonym stałą, porównując go z liczbą, która
     *   się rusza — i sekcja stojąca blisko granicy dostawała inny werdykt zależnie od tego,
     *   w którym momencie przewijania akurat wypadł pomiar. Zmiana `pinned` na `flow` to
     *   zmiana `position` ze `sticky` na `relative`, czyli przestawienie sekcji w układzie:
     *   strona szarpie pod palcem.
     *
     *   Histereza 90 px, dodana wcześniej, jest opatrunkiem dokładnie tej samej wielkości co
     *   ruch paska adresu — więc go maskuje, ale sekcje blisko progu dalej stoją na krawędzi.
     *   Zostaje, bo chroni przed drganiem treści (font, obrazek, tłumaczenie o linijkę
     *   dłuższe), ale nie musi już udawać, że rozwiązuje tamto.
     *
     * DLACZEGO POMIAR, A NIE OBLICZENIE
     *   `svh` nie da się policzyć z niczego, co jest w JS. Trzeba dać przeglądarce pudełko
     *   o wysokości `100svh` i zapytać, ile to wyszło. Element jest bezwymiarowy w poziomie,
     *   `visibility: hidden` i poza kolejnością malowania, więc niczego nie zasłania ani nie
     *   przesuwa.
     *
     * KIEDY SIĘ TO ZMIENIA
     *   Przy obrocie telefonu i przy prawdziwej zmianie okna — czyli dokładnie wtedy, gdy
     *   `onResize` niżej i tak przelicza wszystko od nowa. Chowanie paska adresu tego nie
     *   rusza, i o to chodzi.
     */
    /* Pomiar i wpisanie `--screen-h` stoją w site-bridge.js, bo robi to samo podstrona
       głosowania, która nie wciąga tego pliku. Ta sama liczba rozstrzyga tutaj werdykt
       `pinned` / `flow`, a w CSS wysokość sekcji — i musi być jedna. */
    let screenHeight = measureScreenHeight();

    /* ============================================================
       POMIAR W TRZECH PRZEBIEGACH, NIE W JEDNYM — I TO JEST NAJWIĘKSZA NAPRAWA KLATKOWANIA.
       ============================================================
       CO TU BYŁO
         Jedna pętla po czternastu sekcjach, a w każdym obrocie po kolei: ZAPIS
         (`data-panel='measure'`, co zdejmuje `position: sticky`, `min-height` i `overflow`),
         ODCZYT (`panel.scrollHeight`) i znowu ZAPIS (werdykt).

       DLACZEGO TO JEST DROŻSZE, NIŻ WYGLĄDA
         Odczyt `scrollHeight` po zapisie, który unieważnił układ, WYMUSZA przeliczenie układu:
         przeglądarka nie może oddać liczby, dopóki nie policzy pozycji od nowa. Zapis dotyczył
         `position` i `min-height` sekcji o wysokości ekranu w stosie czternastu przypiętych
         paneli, więc przeliczenie obejmowało cały trzynastotysięczny dokument. Czternaście
         obrotów pętli to czternaście takich przeliczeń, jedno po drugim, synchronicznie,
         w jednym wywołaniu funkcji.

         To jest wzorzec zwany layout thrashing i jest tu w najczystszej postaci. Ta sama pułapka
         jest już rozpoznana i naprawiona w `updateCardStack` kilka tysięcy linii wyżej —
         komentarz brzmi tam „read every rect first, write afterwards: interleaving reads and
         writes forces a layout on each card and is what made the stack stutter". Ten sam błąd,
         ta sama naprawa, o jeden poziom wyżej: tam chodziło o dwanaście kart, tu o czternaście
         sekcji, z których każda jest wysokości ekranu.

       CO SIĘ ZMIENIA NA MOBILE
         Ten przebieg jest wywoływany z ResizeObserverów na `.container` każdej sekcji, czyli
         wtedy, gdy dojdzie obrazek, zamieni się font albo wejdzie tłumaczenie — a to zdarza się
         W TRAKCIE przewijania. Czternaście wymuszonych przeliczeń w jednej klatce na telefonie
         to kilkaset milisekund zajętego wątku głównego: przewijanie stoi, bezwładność leci
         dalej, a po odblokowaniu strona jest w innym miejscu. Stąd i „zacina się", i część
         „teleportacji".

       DLACZEGO WSZYSTKIE NARAZ DAJĄ TEN SAM WYNIK
         `scrollHeight` sekcji zależy od jej własnej treści, a nie od tego, gdzie stoją sekcje
         obok. Są rodzeństwem w normalnym przepływie; zdjęcie `sticky` z sąsiada nie zmienia
         wysokości treści tej. Więc trzy przebiegi (wszystkie w tryb pomiarowy, wszystkie
         odczytać, wszystkie rozstrzygnąć) dają te same liczby co czternaście przeplotów, przy
         jednym wymuszonym przeliczeniu zamiast czternastu.
       ============================================================ */
    function measure() {
      selfInflicted = true;
      const viewport = screenHeight || window.innerHeight;
      const routeFlows = window.innerWidth <= routeFlowsBelow;

      /* PRZEBIEG 1 — same zapisy. Sekcje z góry rozstrzygnięte dostają werdykt od razu i nie
         wchodzą do pomiaru; pozostałe idą w tryb pomiarowy. Ani jednego odczytu układu, więc
         przeglądarka może zebrać to wszystko w jedno unieważnienie. */
      const pending = [];
      panels.forEach((panel) => {
        if (alwaysFlow.has(panel.id) || (panel.id === 'route' && routeFlows)) {
          panel.dataset.panel = 'flow';
          return;
        }
        if (alwaysPinned.has(panel.id)) {
          panel.dataset.panel = 'pinned';
          return;
        }
        // Measure without the sticky/clip constraints, then restore.
        pending.push({ panel, previous: panel.dataset.panel });
        panel.dataset.panel = 'measure';
      });

      /* PRZEBIEG 2 — same odczyty. Pierwszy `scrollHeight` opłaca przeliczenie za wszystkie
         zapisy z przebiegu 1; każdy następny czyta z tego samego, już policzonego układu, bo nic
         między nimi go nie unieważnia. Jedno przeliczenie na cały pomiar. */
      pending.forEach((entry) => { entry.needed = entry.panel.scrollHeight; });

      /* PRZEBIEG 3 — werdykty. Znowu same zapisy. */
      pending.forEach(({ panel, previous, needed }) => {
        /* Histereza, a nie jeden próg.
           ---------------------------------------------------------------------------
           Warunek `needed > viewport + 4` ma jedną granicę, a `window.innerHeight` na
           telefonie nie jest stałą: pasek adresu zmienia go o kilkadziesiąt pikseli w trakcie
           przewijania. Sekcja, której treść wypada blisko wysokości ekranu — a takich jest tu
           kilka, bo prawie wszystkie są projektowane na jeden ekran — przy każdym takim ruchu
           przeskakiwała między `pinned` i `flow`. Zmiana z `sticky` na `relative` przestawia
           pozycję sekcji w układzie, więc strona szarpie się pod palcem. To jest to
           „teleportowanie".

           Teraz są dwie granice, oddalone o 90 px — trochę więcej niż wysokość paska adresu.
           Żeby przejść na `flow`, treść musi wyraźnie nie mieścić się w ekranie. Żeby wrócić na
           `pinned`, musi wyraźnie się mieścić. Między nimi verdykt zostaje ten, co był, więc
           samo chowanie się paska adresu nie jest już powodem do zmiany czegokolwiek.

           Cena: sekcja, której treść siedzi dokładnie w tym pasie, zostaje przy pierwszym
           verdykcie. Przy `flow` znaczy to jeden ekran z zapasem u dołu; przy `pinned` — że
           kilkadziesiąt pikseli treści zostaje przycięte. Dlatego pas jest asymetryczny wokół
           progu: pierwszy pomiar (przy `previous === undefined`) rozstrzyga ostro, a histereza
           dotyczy tylko zmieniania już podjętej decyzji. */
        const HYSTERESIS = 90;
        let verdict;
        if (!previous || previous === 'measure') {
          verdict = needed > viewport + 4 ? 'flow' : 'pinned';
        } else if (previous === 'pinned') {
          verdict = needed > viewport + HYSTERESIS ? 'flow' : 'pinned';
        } else {
          verdict = needed < viewport - HYSTERESIS ? 'pinned' : 'flow';
        }
        panel.dataset.panel = verdict;
      });
      updateCardStack();
      /* Released after the browser has delivered the notifications this pass caused.
         The order within a frame is: rAF callbacks (this function), then layout, then
         ResizeObserver delivery, then paint — and a timeout runs after all of it. So a
         setTimeout is the first moment at which lowering the flag cannot let our own
         changes back in. */
      window.setTimeout(() => { selfInflicted = false; }, 0);
    }

    /* One measurement per frame, with a way out if the frame never comes.
       ---------------------------------------------------------------------------
       The rAF-only version has the failure mode this page has now hit four times: when the
       main thread is busy the callback is deferred, and everything waiting on it is simply
       not done. Here that means a section keeps a stale `pinned` verdict — it stays
       `position: sticky` with `overflow: hidden` while its content has grown — which is the
       exact fault this observer was added to fix.

       And the moment it matters most is the moment rAF is least likely to run: first load,
       fonts settling, images decoding. Measured in headless Chrome, where frames are starved
       hard, the rAF-only version never measured at all.

       So the timer is not a belt-and-braces extra, it is the path that runs when the page is
       under load. 80 ms is late enough that the frame usually wins and early enough that a
       clipped form is not on screen long enough to be seen. */
    let frame = 0;
    let fallback = 0;
    const run = () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(fallback);
      measure();
    };
    const scheduleNow = () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(fallback);
      frame = requestAnimationFrame(run);
      fallback = window.setTimeout(run, 80);
    };

    /* ============================================================
       ANI JEDNEGO POMIARU, DOPÓKI STRONA JEST W RUCHU POD PALCEM.
       ============================================================
       OSTATNIA DROGA DO „TELEPORTACJI", KTÓRA ZOSTAŁA OTWARTA
         Zabezpieczenia wyżej pilnują, żeby pomiar nie ruszał z powodu paska adresu: `onResize`
         patrzy na szerokość, a ResizeObserver obserwuje `.container`, nie sekcję. Oba dotyczą
         POWODU wywołania. Żadne nie dotyczy MOMENTU.

         A powody, które zostały, są prawdziwe i wypadają w najgorszej chwili: dochodzi leniwie
         ładowany obrazek w sekcji, zamienia się font, wchodzi tłumaczenie o linijkę dłuższe.
         Wszystkie zdarzają się w trakcie przewijania, bo właśnie przewijanie ściąga te rzeczy na
         ekran. Wtedy `measure()` może przestawić werdykt sekcji z `pinned` na `flow` — czyli
         `position` ze `sticky` na `relative` — a to przesuwa tę sekcję i wszystko pod nią,
         w trakcie trwającej bezwładności. Z zewnątrz: strona przeskakuje w inne miejsce.

       ROZWIĄZANIE: POMIAR CZEKA NA CISZĘ
         Na urządzeniu dotykowym pomiar jest odkładany, dopóki strona się rusza, i wykonywany
         160 ms po ostatnim zdarzeniu przewijania. Zamiar nie ginie — jest kolejkowany, więc
         rozwinięty formularz i tak zostanie zmierzony, tylko wtedy, gdy przestawienie układu
         nikogo nie szarpnie.

       160 ms, I DLACZEGO LICZONE OD `scroll`, A NIE OD `touchend`
         Bezwładność po rzucie palcem trwa długo po oderwaniu palca — `touchend` przychodzi na
         jej początku, nie na końcu. Jedyny sygnał, który naprawdę mówi „strona stanęła", to brak
         kolejnych zdarzeń `scroll`. 160 ms to około dziesięć klatek: dłużej niż przerwa między
         zdarzeniami w trakcie rzutu, krócej niż zauważalne opóźnienie po zatrzymaniu.

       NA PULPICIE BEZ ZMIAN
         Tam nie ma bezwładności do zepsucia, kółko daje przewijanie krok po kroku, a odłożenie
         pomiaru o 160 ms przy każdym ruchu kółkiem oznaczałoby przyciętą treść widoczną dłużej.
         Warunek jest więc na `touchDevice`, tak jak przy `heightSettle` niżej i z tego samego
         powodu.
       ============================================================ */
    const SCROLL_QUIET_MS = 160;
    let lastScrollAt = 0;
    let quietTimer = 0;
    let deferred = false;

    const schedule = () => {
      if (!touchDevice) {
        scheduleNow();
        return;
      }
      if (performance.now() - lastScrollAt >= SCROLL_QUIET_MS) {
        scheduleNow();
        return;
      }
      /* Strona jest w ruchu. Zapamiętujemy zamiar i sprawdzamy ponownie, gdy cisza mogła już
         nastąpić; jeden timer na wszystkie odłożone zamiary, bo pomiar i tak jest jeden. */
      deferred = true;
      window.clearTimeout(quietTimer);
      quietTimer = window.setTimeout(flushDeferred, SCROLL_QUIET_MS);
    };

    function flushDeferred() {
      quietTimer = 0;
      if (!deferred) return;
      if (performance.now() - lastScrollAt < SCROLL_QUIET_MS) {
        quietTimer = window.setTimeout(flushDeferred, SCROLL_QUIET_MS);
        return;
      }
      deferred = false;
      scheduleNow();
    }

    /**
     * Re-measure on resize, but not on a phone's address bar.
     *
     * Scrolling on a mobile browser hides and shows the URL bar, and every one of those
     * fires `resize` with a viewport 60 to 100 px shorter or taller. That re-ran the
     * measurement mid-scroll, and a section sitting near the boundary flipped between
     * `pinned` (position: sticky) and `flow` (position: relative) — which changes its
     * layout, moves everything below it, and yanks the page under your thumb. That is the
     * "scrolling jumps and goes backwards" this section is responsible for.
     *
     * Width is the honest trigger: it changes when the window is actually resized or the
     * phone is turned, and not when the browser chrome slides. Orientation is listened
     * for separately because on some devices it lands before the new width is readable.
     */
    let lastWidth = window.innerWidth;
    let heightSettle = 0;

    /**
     * Zmiana samej wysokości: raz to pasek adresu, raz człowiek ciągnący krawędź okna.
     *
     * Szerokość jest odpowiedzią uczciwą i wystarczającą na telefonie, ale na komputerze
     * przeciągnięcie dolnej krawędzi okna zmienia tylko wysokość — i wtedy `--screen-h`
     * zostałoby przy starej liczbie aż do pierwszej zmiany szerokości. Sekcje byłyby wyższe
     * albo niższe od okna, i to widać.
     *
     * Rozróżnienie: pasek adresu rusza się WYŁĄCZNIE w trakcie przewijania. Więc zmiana
     * wysokości jest przyjmowana z opóźnieniem, a każde przewinięcie w tym czasie ją odwołuje.
     * Na urządzeniu dotykowym nie jest przyjmowana wcale — tam każda zmiana wysokości bez
     * zmiany szerokości to pasek albo klawiatura, nigdy zmiana rozmiaru okna.
     */
    const touchDevice = (navigator.maxTouchPoints || 0) > 0;
    let settleY = 0;
    const cancelHeightSettle = () => { window.clearTimeout(heightSettle); heightSettle = 0; };
    /* Odwołanie po PRZESUNIĘCIU, nie po samym zdarzeniu.
       Zmierzone: zmiana wysokości widoku sama wysyła `scroll` z tą samą pozycją, więc warunek
       „przyszło zdarzenie scroll" odwoływał pomiar także wtedy, gdy nikt nie przewinął — i na
       komputerze `--screen-h` nie aktualizowało się nigdy.

       Ten sam listener znakuje czas ostatniego przewinięcia dla bramki ciszy wyżej. Jeden
       listener na dwie rzeczy, bo obie potrzebują dokładnie tego samego zdarzenia — a każdy
       kolejny listener `scroll` to kolejne wywołanie w czasie rzutu palcem, czyli dokładnie ten
       koszt, który ta funkcja ma obniżać. */
    window.addEventListener('scroll', () => {
      lastScrollAt = performance.now();
      if (!heightSettle) return;
      if (Math.abs(window.scrollY - settleY) > 2) cancelHeightSettle();
    }, { passive: true });

    const onResize = () => {
      const width = window.innerWidth;
      if (width !== lastWidth) {
        lastWidth = width;
        cancelHeightSettle();
        // Szerokość naprawdę się zmieniła, więc jeden ekran ma teraz inną wysokość.
        // Przeliczane tutaj, a nie w measure(), żeby zostało kosztem zmiany okna,
        // a nie kosztem każdego pomiaru.
        screenHeight = measureScreenHeight();
        schedule();
        return;
      }
      if (touchDevice) return;
      cancelHeightSettle();
      settleY = window.scrollY;
      heightSettle = window.setTimeout(() => {
        heightSettle = 0;
        screenHeight = measureScreenHeight();
        schedule();
      }, 420);
    };

    /**
     * Content that grows after the first measurement.
     *
     * WHAT WAS BROKEN
     *   measure() ran once and then only on a width change. The comment wall's "leave a
     *   message" panel unfolds to about 520 px of form, which happens long after that — so
     *   the section was still marked `pinned`, and a pinned section is `position: sticky`
     *   with `overflow: hidden` and `min-height: 100svh`. It cannot grow. The form opened
     *   into a box that was not allowed to get taller, the overflow clipped it, and the next
     *   sticky panel — which has a higher z-index by construction — slid straight over the
     *   part that stuck out. That is the "the card lies on top of it" report.
     *
     * WHY A ResizeObserver AND NOT A CALLBACK ON THE TOGGLE
     *   The fold is one of several things that change height after load: the FAQ accordion,
     *   the chat panel, a validation message appearing under a field, a translated string
     *   that wraps onto a third line. Wiring each of them to call measure() means every
     *   future one has to remember to. Observing the sections themselves catches all of it,
     *   including the cases nobody has thought of yet.
     *
     * WHY IT NEEDS THE FLAG TO NOT SPIN FOR EVER
     *   Being idempotent is not enough here, and assuming it was is the trap. measure()
     *   does not just write a verdict — it puts every panel into `data-panel="measure"`
     *   first, which drops `position: sticky` and `min-height`, reads scrollHeight, and puts
     *   the panel back. That resizes the observed box on every single pass, whatever the
     *   verdict, so the observer would report our own measurement back to us and we would
     *   measure again, for ever. The browser caps that with "ResizeObserver loop completed
     *   with undelivered notifications" rather than freezing, which is worse than a freeze:
     *   it is a page quietly burning a core, which is what "it feels laggy" is made of.
     *
     *   `selfInflicted` is raised for the duration of a pass and lowered in a timeout, by
     *   which point the notifications that pass caused have already been dropped. A real
     *   resize landing inside that one-frame window is lost, and that is fine: the fold
     *   animates over 420 ms and fires dozens of notifications, so the next one is 16 ms
     *   away.
     */
    /* OBSERWOWANA JEST TREŚĆ, NIE PANEL — i to jest naprawa przeskakiwania pod palcem.
       ---------------------------------------------------------------------------
       Pierwsza wersja obserwowała same sekcje. Każda z nich ma `min-height: 100svh`, a `svh`
       na telefonie **nie jest stałą**: chowający się pasek adresu zmienia go o 60–100 px w
       trakcie przewijania. Czyli przy każdym ruchu palcem wszystkie panele zmieniały wysokość,
       obserwator to zgłaszał, `measure()` liczył od nowa — i sekcja stojąca blisko granicy
       jednego ekranu przeskakiwała między `pinned` (position: sticky) i `flow`
       (position: relative). To zmienia jej pozycję w układzie i szarpie stroną pod ręką.

       Ten sam błąd jest już opisany kilkadziesiąt linii wyżej, przy `onResize`: tam zdarzenie
       `resize` z telefonu było celowo ignorowane, jeśli szerokość się nie zmieniła. Obserwator
       dodany później obszedł to zabezpieczenie od drugiej strony, bo patrzył na wysokość
       pudełka, a właśnie ta wysokość jest tym, co pasek adresu rusza.

       `.container` w środku sekcji nie zależy od `svh` — jej wysokość bierze się z tekstu,
       obrazków i rozwiniętych formularzy, czyli z rzeczy, których pomiar naprawdę dotyczy.
       Rozwinięcie formularza tablicy nadal jest łapane; schowanie paska adresu już nie. */
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(() => {
        if (selfInflicted) return;
        schedule();
      });
      panels.forEach((panel) => {
        const content = panel.querySelector(':scope > .container') || panel.firstElementChild;
        if (content) observer.observe(content);
      });
    }

    measure();
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', () => {
      lastWidth = window.innerWidth;
      /* Po obrocie `100svh` to inna liczba, a pomiar musi poczekać, aż przeglądarka poda
         nowe wymiary — na części urządzeń `orientationchange` przychodzi wcześniej.
         Stąd pomiar i tutaj, i w rAF-ie: pierwszy łapie urządzenia, które są już gotowe,
         drugi te, które jeszcze nie. */
      screenHeight = measureScreenHeight();
      requestAnimationFrame(() => {
        screenHeight = measureScreenHeight();
        schedule();
      });
      schedule();
    }, { passive: true });
    window.addEventListener('carruleddhi:language', schedule);
    /* Explicit "I just changed my height" signal.
       ---------------------------------------------------------------------------
       The ResizeObserver above should catch this on its own, and in a real browser it does.
       This exists because the ResizeObserver is the general case and the wall's form is the
       one that has to work: measured in headless Chrome, the observer's notification for the
       fold opening never arrived, while this event does. Two paths to the same measurement is
       cheap — measure() collapses into one rAF either way — and the one that is explicit is
       the one that can be reasoned about when something goes wrong.

       Anything that grows a section after load should fire it. */
    window.addEventListener('carruleddhi:relayout', schedule);
    if (document.fonts?.ready) document.fonts.ready.then(schedule).catch(() => {});
  }

  /** Keeps the decorative ring pattern centred on the attendance button. */
  function setupAttendanceRings() {
    const section = $('.attendance');
    const button = $('[data-attendance-button]');
    if (!section || !button) return;
    function place() {
      const sectionBox = section.getBoundingClientRect();
      const buttonBox = button.getBoundingClientRect();
      if (!sectionBox.height || !buttonBox.height) return;
      const x = ((buttonBox.left + buttonBox.width / 2) - sectionBox.left) / sectionBox.width;
      const y = ((buttonBox.top + buttonBox.height / 2) - sectionBox.top) / sectionBox.height;
      section.style.setProperty('--press-x', `${(x * 100).toFixed(2)}%`);
      section.style.setProperty('--press-y', `${(y * 100).toFixed(2)}%`);
    }
    place();
    window.addEventListener('resize', place, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(place).observe(section);
  }

  /**
   * In-page jumps get a short wipe so landing on a pinned panel does not look
   * like a hard cut. Desktop and mobile share the same behaviour.
   */
  function setupSectionTransition() {
    const wipe = document.createElement('div');
    wipe.className = 'page-wipe';
    wipe.dataset.pageWipe = '';
    wipe.setAttribute('aria-hidden', 'true');
    // Five confetti stripes plus a spinning wheel. The jump happens behind the
    // cover, so by the time it clears you are already at the section.
    wipe.innerHTML = '<span class="page-wipe__bars">'
      + '<i></i><i></i><i></i><i></i><i></i>'
      + '</span><span class="page-wipe__mark"><i></i><i></i><i></i></span>';
    document.body.appendChild(wipe);
    let busy = false;

    function jump(target) {
      const scrollTo = () => {
        /* The first section means the top of the document, not the top of the section.
           Clicking the wordmark is "take me home", and scrollIntoView on #hero leaves
           the page a few pixels down — below the progress bar, under the sticky header —
           which reads as "the logo is broken". */
        if (target === $('main > section')) {
          window.scrollTo({ top: 0, behavior: 'instant' });
          history.replaceState(null, '', window.location.pathname);
          return;
        }
        // `instant`, not `auto`. `auto` means "whatever scroll-behavior says", so a
        // single CSS declaration elsewhere could turn this back into an animation
        // happening behind a wipe that is already lifting.
        target.scrollIntoView({ behavior: 'instant', block: 'start' });
        history.replaceState(null, '', `#${target.id}`);
      };
      if (reducedMotion) {
        scrollTo();
        return;
      }
      if (busy) return;
      busy = true;

      /**
       * The timings here must match the CSS, or the loader looks broken.
       *
       * It did: the bars take 4 x 35 ms of stagger plus 260 ms to travel, so the
       * screen is not covered until 400 ms. The old code scrolled at 380 ms and
       * started clearing immediately, so the last bars were still arriving while
       * the first were already leaving, and then both classes were pulled at
       * 520 ms — mid-transition — which snapped everything back. That is the
       * "gets to half and jams".
       *
       * COVER_MS and CLEAR_MS below are the real durations. Keep them in step with
       * .page-wipe in carnival.css.
       */
      const COVER_MS = 420;
      const CLEAR_MS = 420;

      window.setTimeout(() => {
        // Fully covered: safe to jump without the visitor seeing it.
        scrollTo();
        wipe.classList.add('is-clearing');
        window.setTimeout(() => {
          wipe.classList.remove('is-covering', 'is-clearing');
          busy = false;
          const focusable = $('h1, h2, [tabindex="-1"]', target);
          focusable?.setAttribute?.('tabindex', '-1');
          focusable?.focus?.({ preventScroll: true });
        }, CLEAR_MS);
      }, COVER_MS);

      wipe.classList.add('is-covering');
    }

    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;
      const id = link.getAttribute('href').slice(1);
      if (!id || id === 'main') return;
      const target = document.getElementById(id);
      if (!target || target.hidden) return;
      event.preventDefault();
      jump(target);
    });
  }

  /**
   * Sponsor logo strip.
   *
   * The track is duplicated so the CSS translateX(-50%) loop is seamless, and the
   * animation duration scales with the number of logos to keep a constant speed.
   * The hero's bottom padding is grown by the real strip height, so the band can
   * never sit on top of the headline.
   */
  function setupSponsors() {
    const band = $('[data-sponsor-band]');
    const track = $('[data-sponsor-track]');
    const hero = $('.section-card--hero');
    if (!band || !track) return;

    /* Demo placeholders only when there is nothing real to show. A demo that hides the
       sponsor you actually added would be worse than no demo. */
    const configured = Array.isArray(config.sponsors) ? config.sponsors : [];
    const sponsors = demoMode && configured.length === 0 ? DEMO_SPONSORS : configured;
    track.replaceChildren();

    if (!sponsors.length) {
      band.hidden = true;
      return;
    }

    const build = (sponsor, duplicate) => {
      const linked = Boolean(sponsor.url);
      const item = document.createElement(linked ? 'a' : 'span');
      item.className = 'sponsor-logo';
      if (linked) {
        item.href = sponsor.url;
        item.target = '_blank';
        item.rel = 'noopener noreferrer sponsored';
      }
      // The duplicated half is decoration only: never announced, never focusable.
      if (duplicate) {
        item.setAttribute('aria-hidden', 'true');
        if (linked) item.tabIndex = -1;
      }
      /* A file if there is one, the name set in type if there is not.
         An <img> with an empty src is a broken-image icon in a strip meant to thank somebody,
         so the two cases get different elements rather than one element and a fallback. */
      if (sponsor.image) {
        const image = document.createElement('img');
        image.src = sponsor.image;
        image.alt = duplicate ? '' : (sponsor.name || 'Sponsor');
        /* The real pass loads eagerly, every repeat of it stays lazy.
           ---------------------------------------------------------------------------
           How many passes fit in the strip is worked out from how wide one pass is, and a
           lazy logo four screens down is 0 px wide until somebody scrolls to it. Measured
           then, a pass is nothing but its gaps and the count comes out several times too
           high. These are a handful of small marks and every repeat is the same URL, so
           eager here is n requests in total, not n × passes — and `low` keeps them behind
           everything above the fold. */
        image.loading = duplicate ? 'lazy' : 'eager';
        image.fetchPriority = 'low';
        image.decoding = 'async';
        item.appendChild(image);
      } else {
        const wordmark = document.createElement('span');
        wordmark.className = 'sponsor-logo__name';
        wordmark.textContent = sponsor.name;
        item.appendChild(wordmark);
      }
      return item;
    };

    /** One pass over the sponsor list. Its own trailing gap lives in CSS, on `.sponsor-band__rep`. */
    const buildRep = (decorative) => {
      const rep = document.createElement('div');
      rep.className = 'sponsor-band__rep';
      if (decorative) rep.setAttribute('aria-hidden', 'true');
      sponsors.forEach((sponsor) => rep.appendChild(build(sponsor, decorative)));
      return rep;
    };

    /* How many passes go into each half.
       ---------------------------------------------------------------------------
       There used to be exactly one, twice: the list, then the same list marked decorative.
       Four sponsors do not fill a 1200 px strip twice over, so the second copy ran out before
       the first came back round and a stretch of empty white scrolled through the middle of
       the thank-you strip. Filling each half past the width of the strip means there is never
       a moment when nothing is under any part of it. */
    let passes = 0;

    const fill = (count) => {
      if (count === passes) return false;
      passes = count;
      const halves = [0, 1].map((index) => {
        const half = document.createElement('div');
        half.className = 'sponsor-band__half';
        // Everything except the first pass of the first half is the same list said again:
        // never announced, never focusable. The second half is the loop's own copy.
        if (index === 1) half.setAttribute('aria-hidden', 'true');
        for (let pass = 0; pass < count; pass += 1) half.appendChild(buildRep(index === 1 || pass > 0));
        return half;
      });
      track.replaceChildren(...halves);
      /* Re-wired on every fill, not once at the end. The listeners have to sit on the images
         that are actually in the document, and this function throws the previous set away —
         attaching them once meant that after the first refill nothing was left to tell us the
         logos had finished loading, and the strip kept whatever width it had guessed from
         images of zero. */
      track.querySelectorAll('img').forEach((image) => {
        if (image.complete) return;
        image.addEventListener('load', schedule, { once: true });
        image.addEventListener('error', schedule, { once: true });
      });
      return true;
    };

    /** Pixels a second. Constant on purpose: the strip should read at the same pace whether
        there are three sponsors in it or thirty, which a duration measured in seconds cannot
        do once the number of passes changes with the width. */
    const SPEED = 55;
    let frame = 0;
    let lastSpeed = 0;

    function remeasure() {
      frame = 0;
      const bandWidth = band.clientWidth;
      const firstRep = track.firstElementChild?.firstElementChild;
      const repWidth = firstRep ? firstRep.getBoundingClientRect().width : 0;
      // Nothing laid out yet — a hidden card, or images that have not settled. Try again when
      // something tells us it has changed rather than guessing now.
      if (bandWidth < 1 || repWidth < 1) return;
      /* And a pass whose logos have not arrived is a row of gaps with nothing between them.
         `complete` turns true on a failed load as well as a successful one, so a sponsor whose
         file is missing holds nothing up — fill() wires both events. */
      const pending = [...firstRep.querySelectorAll('img')].some((image) => !image.complete);
      if (pending) return;

      // A little over the strip's own width, so a pass never ends exactly on the edge.
      fill(Math.max(1, Math.ceil((bandWidth * 1.15) / repWidth)));

      const halfWidth = track.firstElementChild?.getBoundingClientRect().width || 0;
      if (halfWidth < 1) return;
      const seconds = Math.max(14, halfWidth / SPEED);
      /* Writing this restarts the animation, which is a visible jump. Only when it actually
         differs, and only past a hundredth — a resize of a few pixels must not make the strip
         stutter. */
      if (Math.abs(seconds - lastSpeed) > 0.01) {
        lastSpeed = seconds;
        band.style.setProperty('--sponsor-speed', `${seconds.toFixed(2)}s`);
      }
    }

    /* rAF with a timer behind it, the same shape as the scroll handler further up.
       ---------------------------------------------------------------------------
       A `requestAnimationFrame` that never runs is not a theoretical failure on this page —
       there are three comments elsewhere in this file recording it. Here it would mean a strip
       that is never measured: one pass per half, a loop shorter than the strip it is inside,
       and a hole scrolling through it. The escape hatch is written in rather than added after
       somebody reports it. */
    let fallback = 0;
    const run = () => {
      window.clearTimeout(fallback);
      cancelAnimationFrame(frame);
      frame = 0;
      remeasure();
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(run);
      fallback = window.setTimeout(run, 120);
    };

    /* First pass only. remeasure() below turns it into as many as the strip needs — it cannot
       run before there is something to measure, and `schedule` has to exist before fill() can
       hand it to an image. */
    band.hidden = false;
    fill(1);

    /* Two more things change the width of a pass, and both arrive late: the display face swaps
       in under the wordmarks, and the window is resized. (The third, images finishing, is wired
       inside fill().) */
    document.fonts?.ready.then(schedule).catch(() => {});

    /* setupSponsors() runs again whenever the panel sends new settings, so a fresh observer
       every time would mean one more callback per re-render for the life of the page. The
       previous one is taken down first; the handle lives on the element because that is the
       thing whose lifetime it is tied to. */
    band._sponsorResize?.disconnect();
    band._sponsorResize = null;
    if ('ResizeObserver' in window) {
      // The band, not the track: the track's width is what this function writes, and observing
      // it would be a loop feeding itself.
      const observer = new ResizeObserver(schedule);
      observer.observe(band);
      band._sponsorResize = observer;
    } else if (!band._sponsorResizeFallback) {
      band._sponsorResizeFallback = true;
      window.addEventListener('resize', schedule, { passive: true });
    }

    /* Once now, synchronously, so the strip is right on the first paint rather than one frame
       into it; and once more on the next frame, because a logo that is already in the cache
       reports its size only after layout has run. */
    remeasure();
    schedule();

    /* The band used to sit at the foot of the hero, so its height had to be pushed back into
       the hero's bottom padding and into the marquee — otherwise the strip covered the
       headline. It is above the route heading now, in ordinary flow, so it takes its own
       space and there is nothing to compensate for. Both of those variables are gone rather
       than left writing values nothing reads. */
    void hero;
  }

  /**
   * Hands the gallery images and captions to the 3D carousel module.
   * Loaded lazily so a GSAP failure cannot take the rest of the page down, and so
   * the ~60 kB of GSAP is only fetched when the gallery is actually enabled.
   */
  /* Karuzela jest budowana raz, ale liczba zdjęć może się zmienić PO jej zbudowaniu —
     ustawienia z serwera przychodzą po całej inicjalizacji strony. Trzymamy więc uchwyt do
     instancji i odcisk tego, z czego ją zbudowano; gdy odcisk się zmieni, stara instancja
     jest rozbierana i stawiana od nowa. Bez rozbierania każde przestawienie zostawiłoby
     drugą pętlę autoodtwarzania i podwójne nasłuchy na strzałkach — kliknięcie „dalej"
     przeskakiwałoby o dwa kadry. */
  let galleryModulePromise = null;
  let galleryInstance = null;
  let gallerySignature = '';
  /* Czy budowa jest w locie. Moduł karuzeli wczytuje się z sieci, więc między decyzją
     „buduj" i gotową karuzelą mija czas, w którym mogą przyjść ustawienia z panelu z inną
     liczbą zdjęć. Bez tej flagi taka odpowiedź trafiała w `galleryInstance === null`, była
     uznawana za „karuzeli jeszcze nie ma, nie ma czego przestawiać" — i budowa kończyła się
     kadrami z konfiguracji wbudowanej, na zawsze. */
  let galleryBuilding = false;

  /**
   * Stawia (albo przestawia) karuzelę na aktualnej zawartości `config.media`.
   *
   * Wołane z dwóch miejsc: leniwego wyzwalacza przy pierwszym zbliżeniu do sekcji oraz
   * `applyServerSettings`, gdy ustawienia z panelu przyniosły INNĄ liczbę zdjęć niż ta,
   * z której karuzela stoi. Drugie wywołanie jest tym, czego wcześniej nie było: kod
   * podmieniał wtedy `src` w istniejących kartach, więc szóste zdjęcie nie miało gdzie się
   * pokazać, a po usunięciu jednego zostawała karta z adresem zdjęcia, którego już nie ma.
   *
   * Odcisk obejmuje też podpisy, bo one też są treścią kart (etykieta dla czytnika ekranu
   * i tekst pod zdjęciem). Zmiana samego podpisu bez przebudowy zostawiłaby stary napis.
   */
  function galleryContentSignature() {
    return JSON.stringify([config.media.galleryImages, galleryCaptionList()]);
  }

  /** Rozbiera karuzelę i zapomina, z czego stała. Używane przy zerze zdjęć. */
  function teardownGalleryCarousel() {
    galleryInstance?.destroy?.();
    galleryInstance = null;
    gallerySignature = '';
  }

  function buildGalleryCarousel(section) {
    const signature = galleryContentSignature();
    if (signature === gallerySignature && (galleryInstance || galleryBuilding)) return;
    gallerySignature = signature;
    galleryBuilding = true;

    section.dataset.g3dState = 'loading';
    /* Moduł pobierany raz. `import()` sam pamięta wynik, ale trzymanie obietnicy tutaj
       znaczy też, że dwa szybkie przestawienia nie wystawią dwóch żądań sieciowych. */
    galleryModulePromise = galleryModulePromise || import('./gallery-3d.js');
    galleryModulePromise
      .then(({ setupGallery3D }) => {
        galleryBuilding = false;
        /* Zawartość czytana TERAZ, a nie w chwili wywołania. Między wywołaniem i tym
           miejscem jest pobranie modułu z sieci, w którego trakcie mogły dojść ustawienia
           z panelu — budowanie z wartości zapamiętanych wcześniej znaczyłoby karuzelę
           z poprzedniej liczby zdjęć i odcisk, który kłamie. */
        const images = config.media.galleryImages;
        const captions = galleryCaptionList();
        gallerySignature = galleryContentSignature();

        /* Rozbiórka PRZED budową. `setupGallery3D` czyści zawartość pierścienia, ale nie
           zdejmuje nasłuchów ze wspólnej scenki, strzałek i kropek — a te elementy żyją
           w znaczniku i przetrwają każdą przebudowę. */
        galleryInstance?.destroy?.();
        galleryInstance = null;
        section.dataset.g3dState = 'module-ready';
        /* Karuzela mogła się wcześniej ukryć, bo zdjęć było mniej niż dwa. Odsłaniamy ją
           przed próbą, żeby dodanie drugiego zdjęcia w panelu ją przywróciło. */
        section.hidden = false;
        const instance = setupGallery3D({ images, captions, reducedMotion });
        galleryInstance = instance;
        const grid = document.querySelector('[data-gallery-fallback]');
        if (instance) {
          grid?.setAttribute('hidden', '');
          section.dataset.ready = '1';
          section.dataset.g3dState = 'ready';
        } else {
          /* Odmowa (mniej niż dwa kadry — karuzela z jednym zdjęciem nie ma czego
             przewijać). Siatka MUSI wtedy wrócić, inaczej jedno zdjęcie znika ze strony
             razem z karuzelą, która się nie zbudowała. */
          grid?.removeAttribute('hidden');
          delete section.dataset.ready;
          section.dataset.g3dState = 'declined';
        }
      })
      .catch((error) => {
        galleryBuilding = false;
        console.warn('3D gallery unavailable, keeping the grid:', error);
        section.dataset.g3dState = `failed: ${error?.message || error}`;
        section.hidden = true;
        document.querySelector('[data-gallery-fallback]')?.removeAttribute('hidden');
      });
  }

  function setupGalleryCarousel() {
    const section = $('[data-gallery3d]');
    if (!section) return;
    // Lifecycle marker: makes it obvious in DevTools whether this step ran,
    // whether the lazy chunk was requested, and whether it initialised.
    section.dataset.g3dState = 'init';
    if (!config.features.gallery || config.media.galleryImages.length === 0) {
      section.hidden = true;
      section.dataset.g3dState = config.features.gallery ? 'no-images' : 'feature-off';
      return;
    }

    const start = () => buildGalleryCarousel(section);

    /**
     * Deliberately three independent triggers. IntersectionObserver is the
     * cheapest, but it can be starved in embedded and automated browsers, and a
     * gallery that silently never loads is worse than 118 kB fetched early.
     * Whichever fires first wins; the rest are torn down.
     */
    let started = false;
    let observer = null;
    let fallbackTimer = 0;

    const kickOff = () => {
      if (started) return;
      started = true;
      observer?.disconnect();
      window.clearTimeout(fallbackTimer);
      start();
    };

    /* WYWOŁYWANE RAZ NA START, NIE Z KAŻDEGO ZDARZENIA PRZEWIJANIA.
       ---------------------------------------------------------------------------
       Ta funkcja była podpięta pod `scroll` bez żadnego throttlingu ani rAF-a, a robi
       `getBoundingClientRect()` — odczyt WYMUSZAJĄCY przeliczenie układu. W trakcie rzutu palcem
       zdarzeń `scroll` przychodzi kilkadziesiąt na sekundę, więc było to kilkadziesiąt wymuszonych
       przeliczeń trzynastotysięcznego dokumentu na sekundę, przez cały czas do momentu, w którym
       galeria wystartuje.

       I było zbędne: `IntersectionObserver` z `rootMargin: 700px` odpowiada na dokładnie to samo
       pytanie, poza wątkiem głównym i bez wymuszania układu. Komentarz wyżej mówi, że trzy
       niezależne wyzwalacze są celowe, bo obserwator „can be starved in embedded and automated
       browsers" — więc trzecia droga zostaje, tylko już nie w pętli przewijania: jedno sprawdzenie
       na start łapie przypadek „sekcja jest widoczna od razu", a timer 2600 ms łapie wszystko
       inne. Zagłodzony obserwator kończy więc galerią wczytaną z opóźnieniem, a nie brakiem
       galerii, i to jest ta gwarancja, o którą tamten komentarz chodził. */
    function checkVisibleNow() {
      const box = section.getBoundingClientRect();
      if (box.top < window.innerHeight * 2.2) kickOff();
    }

    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) kickOff();
      }, { rootMargin: '700px 0px' });
      observer.observe(section);
    }
    fallbackTimer = window.setTimeout(kickOff, 2600);
    checkVisibleNow();
  }

  function setupFooterYear() {
    $$('[data-current-year]').forEach((element) => { element.textContent = String(new Date().getFullYear()); });
  }

  /**
   * Settings the organiser changed in the admin panel.
   *
   * WHY THIS IS A FETCH AND NOT PART OF THE BUILD
   *   Sponsors arrive one at a time over weeks, and a section whose photos have not
   *   turned up yet should not be on the page. Both used to live in the config baked
   *   into the bundle, which meant every one of them was a git push by whoever had the
   *   laptop. They are rows in Supabase now, written by the panel and read here.
   *
   * WHY IT RUNS AFTER EVERYTHING ELSE AND NOT BEFORE
   *   The page must be complete and usable before this answers, because it might never
   *   answer — a slow network, a cold function, Supabase having a bad minute. So the
   *   built-in config renders first and this refines it. The visible cost is a sponsor
   *   band that appears a moment late, which is the right thing to lose.
   *
   * A failure is silent on purpose. There is nothing a visitor could do about it, and
   * the page they already have is the whole page.
   */
  async function applyServerSettings() {
    const endpoint = config.endpoints.settings;
    if (!endpoint) return;

    let settings;
    try {
      const result = await postJSON(endpoint, {});
      if (!result || result.ok !== true || !result.settings) return;
      settings = result.settings;
    } catch (_) {
      return;
    }

    /* One event source for the visible page, countdown and form payloads. The timer reads
       config.eventDate on every tick, so an async settings response updates it immediately. */
    if (typeof settings.eventName === 'string' && settings.eventName.trim()) {
      config.eventName = settings.eventName.trim();
    }
    if (typeof settings.eventDate === 'string' && !Number.isNaN(new Date(settings.eventDate).getTime())) {
      config.eventDate = settings.eventDate;
    }
    if (typeof settings.eventLocation === 'string' && settings.eventLocation.trim()) {
      config.eventLocation = settings.eventLocation.trim();
    }

    /* GALERIA O DOWOLNEJ DŁUGOŚCI.
       ---------------------------------------------------------------------------
       Było: `settings.galleryImages.length === 5`. To był twardy warunek na liczbę zdjęć
       i najgorszy rodzaj błędu — CICHY. Organizator dodawał szóste zdjęcie, panel je
       zapisywał, worker oddawał sześć adresów, a ta linijka je porzucała i strona zostawała
       przy pięciu ilustracjach z repozytorium. Nic nie mówiło, że odpowiedź serwera została
       wyrzucona do kosza; galeria po prostu nie reagowała na zmiany w panelu.

       Teraz przyjmowana jest każda długość do sufitu. Sufit jest tu drugi raz (worker już go
       pilnuje), bo ta funkcja przyjmuje odpowiedź z sieci, a nie z zaufanego źródła.

       Sprawdzenie pojedynczego wpisu zostaje: to są adresy do wstawienia w `src`. Zmiana
       jest jedna — z `every` na `filter`. `every` znaczyło „jeden zły adres unieważnia całą
       galerię", czyli jedno zdjęcie usunięte z bucketa gasiło pozostałe jedenaście. */
    if (Array.isArray(settings.galleryImages)) {
      const usableImages = settings.galleryImages
        .map((image) => String(image || '').trim())
        .filter((image) => image.startsWith('/') || /^https:\/\//i.test(image))
        .slice(0, GALLERY_MAX);
      const captions = Array.isArray(settings.galleryCaptions) ? settings.galleryCaptions : [];
      config.media.galleryImages = usableImages;
      /* Podpisy przycinane do liczby zdjęć — ten sam warunek, co w workerze i w
         site-config.js. Trzy miejsca, bo trzy niezależne wejścia tych danych; jedno
         zdanie w każdym z nich jest tańsze niż jedno pytanie „czemu podpis jest pod
         obcym zdjęciem". */
      config.media.galleryCaptions = usableImages.map((_image, index) => String(captions[index] || '').trim());
    }

    payloadFor = null;
    applyPublicConfig();
    /* Karuzela przebudowywana, a nie łatana po adresach.
       ---------------------------------------------------------------------------
       Było: pętla po `.g3d__card img` podmieniająca `src`. Działało dokładnie dla pięciu
       kadrów — przy sześciu szósta karta nie istniała, przy czterech zostawała piąta karta
       ze starym zdjęciem. `buildGalleryCarousel` sam sprawdza, czy coś się zmieniło, więc
       wywołanie przy niezmienionej galerii nic nie kosztuje. */
    const carouselSection = $('[data-gallery3d]');
    if (config.media.galleryImages.length === 0) {
      /* Zero zdjęć po odpowiedzi serwera: karuzela musi ZNIKNĄĆ razem z sekcją, którą
         `renderGalleryGrid` właśnie ukrył. Samo ukrycie zostawiłoby żywe odliczanie
         autoodtwarzania i tweeny GSAP-a mielące niewidoczne karty do końca wizyty. */
      teardownGalleryCarousel();
    } else if (carouselSection && (galleryInstance || galleryBuilding)) {
      buildGalleryCarousel(carouselSection);
    }

    /* Sponsors. The panel stores a bucket path and the function hands back a signed URL,
       so what arrives here is ready to put in a src. `image` is the name the renderer
       already uses; renaming it there would touch the CSS as well for no gain. */
    if (Array.isArray(settings.sponsors)) {
      /* A name is enough. A file is not required.
         ---------------------------------------------------------------------------
         This filter used to demand `sponsor.logo` as well, which put the page and the server
         at odds: cleanSettings() accepts an empty logo on purpose (see the comment there), so
         the panel would save "Cantina Gallura" with no file, the database would hold it, and
         this line would silently drop it. The organiser sees a saved sponsor and an empty
         strip, with nothing anywhere saying why.

         Most of these are a favour from somebody in town who does not have a PNG to hand. A
         name set in the display face is a perfectly good thank-you, and it means the strip can
         go up the day the first sponsor says yes rather than the day their logo arrives. */
      const usable = settings.sponsors
        .filter((sponsor) => sponsor && sponsor.name)
        .map((sponsor) => ({
          name: String(sponsor.name),
          url: String(sponsor.url || ''),
          image: String(sponsor.logo || '')
        }));
      // Only replace the built-in list once there is something to replace it with. An
      // empty list from a half-configured database should not blank a working band.
      if (usable.length) {
        config.sponsors = usable;
        try {
          setupSponsors();
        } catch (error) {
          console.error('Carruleddhi: sponsors failed to re-render.', error);
        }
      }
    }

    /* Section switches. `showCounters` has no data-feature attribute of its own, so it
       is handled by the same selector the counters already carry. */
    const switches = [
      ['showGallery', 'gallery'],
      ['showWall', 'wall'],
      ['showPrizes', 'prizes'],
      ['showCounters', 'counters']
    ];
    switches.forEach(([field, feature]) => {
      if (typeof settings[field] !== 'boolean') return;
      const enabled = settings[field];
      config.features[feature] = enabled;
      $$(`[data-feature="${feature}"]`).forEach((element) => { element.hidden = !enabled; });
      $$(`[data-feature-link="${feature}"]`).forEach((element) => { element.hidden = !enabled; });
    });

    // Prizes has an id but no data-feature marker, and adding one would mean the
    // built-in config could hide it too — which is not what that config is for.
    if (typeof settings.showPrizes === 'boolean') {
      const prizes = document.getElementById('prizes');
      if (prizes) prizes.hidden = !settings.showPrizes;
    }
  }

  /* ==========================================================================
     Text effects
     ==========================================================================
     Five effects, driven by attributes in the markup:

       data-text-effect="rise"          each character lifts into place
       data-text-effect="jump"          each word springs in, rotated
       data-text-unit="char|word|line"  what to split by; the effects have defaults
       data-text-jitter                 a word that will not sit still
       data-text-ghost                  the word twice, faint behind and solid in front
       data-text-roll                   a label that rolls over on hover

     WHY IT IS BUILT HERE INSTEAD OF INSTALLED
       The components these come from are React, and they bring `motion` with them. The
       public page has no React: adding it to animate six headings would cost more than
       every other script on the page put together. What is left after taking React out
       is a function that wraps characters in spans and a stylesheet.

     WHAT THE SPLITTING HAS TO SURVIVE
       A language change. i18n rewrites the text of anything carrying `data-i18n`, which
       throws the spans away — so the original text is kept on the element and the whole
       thing is rebuilt when `carruleddhi:language` fires. Rebuilt, not patched: the new
       language has a different number of characters.

     WHAT IS DELIBERATELY NOT HERE
       The flipping word list and the counting number. The flip needs a list of words per
       language, which is copy in six languages for one decoration. The counter would
       have to write into the two numbers in the hero — and those are written by
       loadGlobalCounts() from the real totals, so a count-up animation would be two
       pieces of code fighting over the same element and the visitor watching the loser.
     ======================================================================== */

  /**
   * Rebuilds a heading as animatable pieces.
   *
   * WORDS ARE WRAPPED, ALWAYS.
   *   An animated piece has to be `inline-block` to be transformable, and a line of
   *   `inline-block` characters can be broken between any two of them — so a
   *   per-character effect on a heading gives you "CARRULEDD" on one line and "HI" on
   *   the next, which is the exact bug that took an afternoon to find in the menu. Each
   *   word therefore gets an `inline-block` wrapper of its own, and only the spaces
   *   between the wrappers are ordinary text the browser may break at.
   *
   *   Spaces stay text nodes rather than becoming units. A space that is a unit consumes
   *   a stagger step, and the wave then has a gap in it wherever the sentence does.
   */
  function buildTextEffect(element) {
    // Remembered the first time, because after a build the element's textContent is the
    // concatenation of the spans — right today, and wrong the moment an effect adds
    // anything of its own.
    if (element.dataset.textOriginal === undefined) {
      element.dataset.textOriginal = element.textContent || '';
    }
    const text = element.dataset.textOriginal;
    const effect = element.dataset.textEffect;
    const unit = element.dataset.textUnit || (effect === 'jump' ? 'word' : 'char');

    const fragment = document.createDocumentFragment();
    let index = 0;

    const makeUnit = (piece, extra = '') => {
      const span = document.createElement('span');
      span.className = extra ? `fx-unit ${extra}` : 'fx-unit';
      span.textContent = piece;
      span.style.setProperty('--i', String(index));
      index += 1;
      return span;
    };

    if (unit === 'line') {
      for (const line of String(text).split('\n')) fragment.appendChild(makeUnit(line, 'fx-unit--line'));
      element.replaceChildren(fragment);
      return;
    }

    for (const piece of String(text).match(/\S+|\s+/g) || []) {
      if (!/\S/.test(piece)) {
        // A real space, breakable, outside every wrapper.
        fragment.appendChild(document.createTextNode(piece));
        continue;
      }
      if (unit === 'word') {
        fragment.appendChild(makeUnit(piece));
        continue;
      }
      const word = document.createElement('span');
      word.className = 'fx-word';
      for (const character of piece) word.appendChild(makeUnit(character));
      fragment.appendChild(word);
    }

    element.replaceChildren(fragment);
  }

  function setupTextEffects() {
    /* ---- entrance effects: rise and jump ------------------------------- */
    const entrances = $$('[data-text-effect]');
    entrances.forEach(buildTextEffect);

    /**
     * Arming and playing, in that order, with a way out of both.
     *
     * The hidden start state lives behind `is-armed` (see text-effects.css) so that
     * nothing here is load-bearing for whether the words are readable. This code adds
     * `is-armed` only when it has also set up two ways to remove it: the observer, and a
     * timer for when the observer does not fire.
     *
     * That timer is not defensive padding — it was needed. Measured in a real browser:
     * spans built, stylesheet loaded, headings on screen, and the observer callback never
     * ran, so `is-playing` was never added and six headings sat at opacity 0. Whatever
     * starves the callback (a throttled background tab, a headless renderer, a device
     * under load), the text has to appear anyway.
     */
    if (!('IntersectionObserver' in window) || reducedMotion) {
      // Nothing to animate with, or motion turned down: leave the text exactly as it is.
      return;
    }

    /**
     * WEJŚCIE LITER, KTÓREGO NIKT NIE WIDZI, KOŃCZY SIĘ NATYCHMIAST (TELEFON).
     * =========================================================================
     * OBJAW, KTÓREGO TO DOTYCZY
     *   „Strona na telefonie sama się odświeża w okolicy sekcji dwunastu nagród." To nie jest
     *   awaria kodu — sonda błędów przechodzi tę okolicę czysto — a ubicie karty z braku pamięci,
     *   które nie zostawia śladu w konsoli. Mierzalne jest tylko zużycie prowadzące do niego, a
     *   TU jest jego SZCZYT, i to z dużym odstępem od wszystkiego innego.
     *
     * ZMIERZONE, tools/probe-c-prizes-memory.js na 390x844, ekran ustawiony na sekcji nagród:
     *   liczba animacji `running`         1,4 s po dojściu:  180
     *                                     3 s i 6 s później:  16
     *   z tych 180 poza ekranem:                             162
     *   liczba elementów proszących o własną warstwę
     *   kompozytora, w tej samej chwili:                     227  (z tego 193 to animacje)
     *
     *   Rozbicie tych 162 po sekcjach, których w danej chwili NIE MA na ekranie:
     *     attendance 37, story 25, categories 25, route 19, faq 19, contact 19, signup 6,
     *     gallery 4, wall 4 — wszystko `fx-rise`/`fx-jump` na `span.fx-unit`, czyli po jednej
     *     animacji NA LITERĘ albo NA SŁOWO nagłówka.
     *
     * SKĄD SIĘ BIERZE 180 NARAZ
     *   Sekcje tej strony są `position: sticky` i przy szybkim przewijaniu wchodzą w kadr niemal
     *   jednocześnie. Obserwator wyżej odpala wtedy wejście liter w kilku nagłówkach w tej samej
     *   klatce, każde trwa 0,62 s plus opóźnienie do 0,96 s — i przez te ~1,6 s kompozytor trzyma
     *   po jednej warstwie na każdą literę. To jest dokładnie ten kształt zdarzenia, który tłumaczy
     *   objaw: nie stałe wysokie zużycie, ale kilkusekundowy skok w chwili szybkiego przewijania,
     *   po którym karta wraca odświeżona.
     *
     * CO ROBIMY
     *   Nagłówek, który zaczął wejście, a NIE JEST na ekranie, dostaje `is-settled` — klasę, którą
     *   text-effects.css definiuje jako „tekst na miejscu, w stanie końcowym, bez animacji". To
     *   jest zdjęcie animacji z czegoś, czego w tej chwili nie widać, a nie zmiana wyglądu: litery
     *   są wtedy widoczne (`opacity: 1`), więc nagłówek nigdy nie zostaje pusty.
     *
     * DLACZEGO `is-settled`, A NIE ZDJĘCIE `is-playing`
     *   `is-playing` to klasa, która NADAJE animację, ale reszta kodu czyta ją jako „ten nagłówek
     *   ma już swoje wejście za sobą" (patrz przebudowa po zmianie języka niżej). Zdjęcie jej
     *   znaczyłoby, że po zmianie języka nagłówek animuje się od zera. `is-settled` stoi OBOK i
     *   mówi tylko o animacji — dokładnie to, o co tu chodzi.
     *
     * DLACZEGO TO NIE PSUJE NAGŁÓWKA, KTÓRY DOPIERO WEJDZIE W KADR
     *   Obserwator wyżej odpala wejście z `rootMargin: 0px 0px -10% 0px`, czyli gdy nagłówek jest
     *   już naprawdę w kadrze. Ten obserwator pyta o to samo pudełko bez marginesu, więc
     *   nagłówek, do którego czytelnik dojechał normalnie, animuje się w całości. Gasną tylko te,
     *   które przemknęły — i te, które odpalił awaryjny timer 2,5 s przy zagłodzonym obserwatorze,
     *   gdzie „widoczny tekst od razu" jest zachowaniem pożądanym, nie stratą.
     *
     * TYLKO WĄSKI EKRAN ALBO PALEC
     *   Ten sam warunek, co we wszystkich blokach obniżających koszt warstw w carnival.css: na
     *   pulpicie pamięci jest dość i strona ma tam działać dokładnie jak dotąd. Zapytanie czytane
     *   raz — obrót telefonu nie przenosi nikogo między klasami urządzeń.
     */
    const narrowOrTouch = window.matchMedia('(max-width: 760px), (pointer: coarse)').matches;
    const settler = narrowOrTouch
      ? new IntersectionObserver((records) => {
        for (const record of records) {
          if (record.isIntersecting) continue;
          record.target.classList.add('is-settled');
          settler.unobserve(record.target);
        }
      }, { threshold: 0 })
      : null;

    const play = (element) => {
      element.classList.add('is-playing');
      window.clearTimeout(Number(element.dataset.fxTimer) || 0);
      delete element.dataset.fxTimer;
      /* Po `is-playing`, nigdy przed: `is-settled` bez `is-playing` przegrywa specyficznością z
         regułą `is-armed:not(.is-playing) .fx-unit { opacity: 0 }` (0,4,0 wobec 0,3,0) i litery
         zostałyby niewidoczne. Kolejność tych dwóch linijek jest tu warunkiem czytelności tekstu. */
      settler?.observe(element);
    };

    const watcher = new IntersectionObserver((records) => {
      for (const record of records) {
        if (!record.isIntersecting) continue;
        play(record.target);
        watcher.unobserve(record.target);
      }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.01 });

    entrances.forEach((element) => {
      if (element.classList.contains('is-playing')) return;
      element.classList.add('is-armed');
      /* Two and a half seconds is longer than any scroll a visitor makes to reach the
         first heading and short enough that a stuck observer is a late animation rather
         than missing text. */
      element.dataset.fxTimer = String(window.setTimeout(() => play(element), 2500));
      watcher.observe(element);
    });

    /* ---- jitter -------------------------------------------------------- */
    $$('[data-text-jitter]').forEach((element) => {
      if (element.querySelector('.fx-jitter')) return;
      const inner = document.createElement('span');
      inner.className = 'fx-jitter';
      inner.textContent = element.textContent || '';
      element.replaceChildren(inner);
    });

    /* ---- ghost (bold-copy) --------------------------------------------- */
    $$('[data-text-ghost]').forEach((element) => {
      const label = (element.dataset.textOriginal ?? element.textContent ?? '').trim();
      if (!label) return;
      element.dataset.textOriginal = label;
      element.classList.add('fx-ghost');

      const back = document.createElement('span');
      back.className = 'fx-ghost__back';
      back.setAttribute('aria-hidden', 'true');
      back.textContent = label;

      const front = document.createElement('span');
      front.className = 'fx-ghost__front';
      front.setAttribute('aria-hidden', 'true');
      front.textContent = label;

      const read = document.createElement('span');
      read.className = 'fx-sr';
      read.textContent = label;

      element.replaceChildren(back, front, read);
    });

    /* ---- roll ---------------------------------------------------------- */
    $$('[data-text-roll]').forEach((element) => {
      const label = (element.dataset.textOriginal ?? element.textContent ?? '').trim();
      if (!label) return;
      element.dataset.textOriginal = label;
      element.classList.add('fx-roll');

      // The sizer is what gives the clipped box the text's own width and baseline.
      const sizer = document.createElement('span');
      sizer.className = 'fx-roll__sizer';
      sizer.setAttribute('aria-hidden', 'true');
      sizer.textContent = label;

      const stack = document.createElement('span');
      stack.className = 'fx-roll__stack';
      stack.setAttribute('aria-hidden', 'true');
      for (let copy = 0; copy < 2; copy += 1) {
        const line = document.createElement('span');
        line.className = 'fx-roll__line';
        line.textContent = label;
        stack.appendChild(line);
      }

      const read = document.createElement('span');
      read.className = 'fx-sr';
      read.textContent = label;

      element.replaceChildren(sizer, stack, read);
    });
  }

  /* New words, new spans. The elements carrying an effect are also the ones i18n
     rewrites, so everything above has to be built again — and the entrance effects have
     already played, so they are marked as playing straight away rather than made to
     animate a second time for somebody who only changed language. */
  window.addEventListener('carruleddhi:language', () => {
    try {
      /* A heading that has already played keeps that state: somebody switching language
         is not arriving at the section for the first time, and replaying the entrance
         under their cursor is a flicker, not a flourish. Marked before the rebuild so the
         new spans are visible from their first frame. */
      const played = $$('[data-text-effect].is-playing');
      $$('[data-text-effect], [data-text-jitter], [data-text-ghost], [data-text-roll]')
        .forEach((element) => { delete element.dataset.textOriginal; });
      /* `is-settled` obok `is-playing`, i to jest tutaj cała rzecz.
         ---------------------------------------------------------------------------
         Samo `is-playing` robiło coś przeciwnego do zamiaru opisanego wyżej: spany są po
         przebudowie nowe, a `is-playing` to właśnie ta klasa, która nadaje im animację
         wejścia — więc każdy startował od zera. Zmierzone na 390x844 przy dławieniu CPU 4x:
         197 animacji naraz i sekunda przeliczania stylów 200-370 elementów co klatkę,
         41 przeliczeń i 659 ms, po każdym kliknięciu w przełącznik języka.

         `is-settled` stawia nowe spany od razu w stanie końcowym. `is-playing` zostaje, bo
         czyta je reszta kodu jako „ten nagłówek ma już swoje wejście za sobą". */
      played.forEach((element) => element.classList.add('is-playing', 'is-settled'));
      setupTextEffects();
    } catch (error) {
      console.error('Carruleddhi: text effects failed to rebuild.', error);
    }
  });

  /**
   * Gives every panel a z-index from its real position in the page.
   *
   * The sections are sticky and pinned at the top, so each one has to paint over the one
   * before it. That is a written-out ladder in experience.css, and a written-out ladder
   * can run out — it did, at eleven, and #contact is the twelfth section. It got
   * `z-index: auto`, which on a sticky element puts it below anything with a number, so
   * #faq and #wall painted over it. The section was there: laid out, announced, reachable
   * by its anchor, and completely invisible.
   *
   * This makes the position the source of the number, so adding a section is adding a
   * section and not also remembering to add a line of CSS. The CSS ladder stays as the
   * no-JavaScript fallback.
   *
   * Runs before everything else, because a panel in the wrong layer is not a detail that
   * can wait for the rest of the page to finish.
   */
  /**
   * The three reminder windows, and which of them are still ahead.
   *
   * A reminder is sent only to somebody who was on the list before it fell due — that is
   * the whole rule, and it is the same one the function applies when sending (see
   * remindersStillAhead in worker/index.js). Read from this side it answers a different
   * question: what can this visitor still be promised?
   *
   * Five days before the race, "7 days before" is not a reminder anybody can receive, so
   * the chip is removed. Twenty hours before, only "3 hours before" is left. Two hours
   * before, nothing is, and the form says that instead of taking an address and sending
   * nothing — which is the version that looks like a bug to the person who filled it in.
   *
   * Hard-coded nowhere: the hours come from the same list as the sender, and the date from
   * the site config.
   */
  const REMINDER_WINDOWS = [
    { code: '7d', hours: 168 },
    { code: '1d', hours: 24 },
    { code: '3h', hours: 3 }
  ];

  function remindersStillAhead(now = Date.now()) {
    const start = new Date(config.eventDate).getTime();
    if (Number.isNaN(start)) return REMINDER_WINDOWS.map((window) => window.code);
    return REMINDER_WINDOWS
      .filter((window) => now <= start - window.hours * 3600000)
      .map((window) => window.code);
  }

  function setupReminderWindows() {
    const ahead = new Set(remindersStillAhead());
    $$('[data-reminder-window]').forEach((chip) => {
      chip.hidden = !ahead.has(chip.dataset.reminderWindow);
    });

    const none = ahead.size === 0;
    $$('[data-reminder-times]').forEach((list) => { list.hidden = none; });
    $$('[data-reminder-none]').forEach((note) => { note.hidden = !none; });

    /* Nothing left to promise: the form is closed rather than left looking willing.
       The "I'll be there" button keeps working — turning up is still a thing you can do
       three hours before the start. */
    $$('[data-reminder-form]').forEach((form) => {
      form.hidden = none;
      form.querySelectorAll('input, button, textarea, select').forEach((field) => {
        field.disabled = none;
      });
    });

    // Recomputed on a language change because the chips carry translated text, and once
    // an hour so a page left open overnight does not keep offering a passed window.
    return ahead;
  }

  /**
   * Turning reminders off, in three steps.
   *
   * Arrives as `#unsub=<token>` — the link at the foot of every reminder and newsletter.
   * A fragment rather than a query string, so the token never reaches a server log and is
   * never sent in a Referer header to anything the page loads. It is read once and wiped
   * from the address bar immediately, so a shared screenshot of the URL is worth nothing.
   *
   * Step 1 shows the masked address the server resolved and offers to send a code. Step 2
   * takes the six digits. Step 3 says it is done. A code rather than one click because an
   * unsubscribe link in an e-mail gets forwarded, and gets prefetched by mail clients, and
   * then somebody else's reminders are off and nobody knows why.
   *
   * The panel stays hidden for every other visitor. Nobody arrives at the contact section
   * wanting to see an unsubscribe form.
   */
  function setupUnsubscribe() {
    const panel = $('[data-unsub-panel]');
    if (!panel) return;

    const match = /(?:^|[#&])unsub=([a-f0-9]{16,64})/i.exec(window.location.hash);
    if (!match) return;
    const token = match[1];

    /* Cleared from the address bar before anything else happens. replaceState so the back
       button does not walk back into a URL carrying the token. */
    try {
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}#contact`);
    } catch (_) {
      /* Not worth failing the flow over; the token is single-purpose anyway. */
    }

    const steps = {
      start: $('[data-unsub-step="start"]', panel),
      code: $('[data-unsub-step="code"]', panel),
      done: $('[data-unsub-step="done"]', panel)
    };
    const emailOut = $('[data-unsub-email]', panel);
    const status = $('[data-unsub-status]', panel);
    const codeField = $('[data-unsub-code]', panel);
    const sendButton = $('[data-unsub-send]', panel);
    const confirmButton = $('[data-unsub-confirm]', panel);

    const show = (name) => {
      Object.entries(steps).forEach(([key, element]) => {
        if (element) element.hidden = key !== name;
      });
    };
    const say = (key, fallback = '') => {
      if (!status) return;
      status.textContent = key ? (text(key) || fallback) : '';
    };

    panel.hidden = false;
    show('start');
    // The panel is below the fold of a long section, and somebody who pressed a link in an
    // e-mail should not have to hunt for what it opened.
    requestAnimationFrame(() => panel.scrollIntoView({ block: 'center' }));

    const endpoint = (name) => `/api/carruleddhi/${name}`;

    async function post(name, body) {
      const response = await fetch(endpoint(name), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'omit'
      });
      const payload = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, payload };
    }

    /* The address is asked for straight away, before any button is pressed: the first thing
       somebody needs to see is which address this is about, in case it is not theirs. */
    (async () => {
      const { ok, payload } = await post('unsub-start', { token, peek: true });
      if (!ok) {
        say('unsub.badLink', 'Ten link już nie działa.');
        return;
      }
      if (emailOut) emailOut.textContent = payload.email || '';
      if (payload.already) {
        show('done');
        say('unsub.alreadyOff', '');
      }
    })().catch(() => say('unsub.offline', ''));

    sendButton?.addEventListener('click', async () => {
      sendButton.disabled = true;
      say('unsub.sending', '');
      try {
        const { ok, payload } = await post('unsub-start', { token });
        if (payload.already) {
          show('done');
          say('unsub.alreadyOff', '');
          return;
        }
        if (!ok) {
          say('unsub.sendFailed', '');
          sendButton.disabled = false;
          return;
        }
        show('code');
        say('unsub.sent', '');
        /* preventScroll: krok z kodem odsłania się w tym samym miejscu, w którym stał
           przycisk „wyślij kod", więc nie ma dokąd przewijać — a `focus()` bez tej flagi
           i tak by przewinął, bo sekcja kontaktu jest przypięta. */
        codeField?.focus({ preventScroll: true });
      } catch (_) {
        say('unsub.offline', '');
        sendButton.disabled = false;
      }
    });

    confirmButton?.addEventListener('click', async () => {
      const code = String(codeField?.value || '').replace(/\D/g, '');
      if (code.length !== 6) {
        say('unsub.codeShort', '');
        return;
      }
      confirmButton.disabled = true;
      say('unsub.checking', '');
      try {
        const { ok, payload } = await post('unsub-confirm', { token, code });
        if (ok) {
          show('done');
          say('', '');
          return;
        }
        /* The server says how many tries are left. Showing it is the difference between
           "wrong code" and "wrong code, and you have two goes before you need a new one". */
        const left = Number(payload.left);
        say(
          payload.code === 'UNSUB_CODE_EXPIRED' ? 'unsub.codeExpired'
            : payload.code === 'UNSUB_TOO_MANY_TRIES' ? 'unsub.codeBlocked'
              : 'unsub.codeWrong',
          ''
        );
        if (Number.isFinite(left) && left > 0 && status) {
          status.textContent = `${status.textContent} (${left})`;
        }
        confirmButton.disabled = false;
      } catch (_) {
        say('unsub.offline', '');
        confirmButton.disabled = false;
      }
    });

    // Enter is what somebody does after typing six digits.
    codeField?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        confirmButton?.click();
      }
    });
  }

  /* ==========================================================================
     Live chat, visitor side
     ==========================================================================
     The backend has been finished for a while — threads, messages, the six automatic
     answers, the handover to a person, and the organiser's half in the admin panel. This
     is the part that was missing, so none of it could be reached.

     WHAT ANSWERS WHAT
       Six questions get asked constantly: who can enter, what it costs, whether an engine
       is allowed, whether a helmet is needed, when and where, and how the start number
       arrives. Those are answered from the copy deck without anybody being involved.
       Everything else switches the thread to `human`, tells the visitor so, and lights the
       bell in the admin panel. There is no guessing in between.

     THE TOKEN IS THE BROWSER'S, NOT THE SERVER'S
       Generated here and kept in localStorage. The server never mints one, because a
       token handed back on request is a token anybody who omits theirs can be given —
       and that is somebody else's conversation.

     POLLING, NOT REALTIME
       One request every four seconds while the panel is open and the tab is in front, and
       nothing at all otherwise. Supabase Realtime would be fewer requests and one more
       moving part with its own connection state; for a conversation where the other side
       is a person typing on a phone, four seconds is indistinguishable from instant.
     ======================================================================== */

  const CHAT_TOKEN_KEY = 'carruleddhi.chatToken';
  const CHAT_POLL_MS = 4000;

  function chatToken() {
    let token = storage.get(CHAT_TOKEN_KEY);
    if (token && /^[A-Za-z0-9_-]{16,64}$/.test(token)) return token;
    // 32 hex characters: inside the server's accepted range and generated where the
    // randomness is real rather than from Math.random.
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    token = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    storage.set(CHAT_TOKEN_KEY, token);
    return token;
  }

  function setupChat() {
    const panel = $('[data-chat]');
    const tabs = $$('[data-contact-tab]');
    if (!panel || !tabs.length) return;

    const formPanel = $('[data-contact-panel="form"]');

    /* ------------------------------------------- A3: jeden czat zamiast dwóch dróg */
    /**
     * Zakładka „szybka wiadomość" schodzi z ekranu.
     *
     * Formularz kontaktowy i czat robiły to samo — zostawiały wiadomość, na którą organizator
     * odpisuje mailem — a czat robi to lepiej: odpowiada od razu na pytania, które wracają
     * codziennie, i przekazuje człowiekowi dopiero to, czego nie wie. Dwie drogi do tej samej
     * rzeczy znaczą wybór, którego nikt nie umie podjąć, i dwa miejsca, w których wiadomość
     * może się zgubić.
     *
     * Ukrywane stąd, a nie usuwane ze znacznika, i to jest świadome:
     *
     *   — trasa `contact` w Make i handler w Workerze zostają nietknięte, bo z nich korzysta
     *     mailhook. Kasowanie znacznika nie miałoby na nie wpływu, ale zostawienie go czyni
     *     oczywistym, że ta droga nadal istnieje po stronie serwera;
     *   — bez JavaScriptu nie ma czatu, bo czat jest w całości obsługiwany stąd. Wtedy
     *     zakładki zostają widoczne i formularz kontaktowy jest jedyną drogą — czyli
     *     dokładnie tym, czym był. Ukrycie z JS znaczy „ukryte tam, gdzie jest zamiennik".
     */
    const tabStrip = $('[data-contact-tabs]');
    if (tabStrip) tabStrip.hidden = true;
    if (formPanel) formPanel.hidden = true;
    const log = $('[data-chat-log]', panel);
    const form = $('[data-chat-form]', panel);
    const input = $('[data-chat-input]', panel);
    const sendButton = $('[data-chat-send]', panel);
    const endpoint = config.endpoints.chat || '/api/carruleddhi/chat';

    const gate = $('[data-chat-gate]', panel);
    const gateForm = $('[data-chat-gate-form]', panel);
    const chips = $('[data-chat-chips]', panel);
    const chipsList = $('[data-chat-chips-list]', panel);
    const chipsToggle = $('[data-chat-chips-toggle]', panel);
    const chipsLabel = $('[data-chat-chips-label]', panel);

    /* `let`, nie `const`: „nowa rozmowa" wymienia token na świeży.
       Wątek zamknięty i zapisany tym samym tokenem wróciłby na `human` przez trigger z
       migracji 0005 — czyli dokładnie do stanu, z którego chcemy wyjść. */
    let token = chatToken();
    let opened = false;
    let polling = 0;
    let lastAt = '';
    let mode = 'ai';
    /** Rozmowa zakończona przez gościa. Trzeci stan panelu, obok bramy i rozmowy. */
    let ended = false;
    /**
     * ROZMOWA PRZEKAZANA CZŁOWIEKOWI — STAN WĄTKU, NIE STAN TEJ KARTY.
     * ---------------------------------------------------------------------------
     * Ta zmienna jest wyłącznie ODBICIEM `mode` z serwera (`chat_threads.mode === 'human'`),
     * a nie zapisem po stronie strony — i to jest cała różnica. Gość, który poprosił
     * o człowieka, odświeża stronę, zamyka kartę, wraca wieczorem z tym samym tokenem: stan
     * musi przeżyć każdą z tych rzeczy. W `localStorage` przeżyłby tylko w tej jednej
     * przeglądarce i rozjechałby się z tym, co widzi organizator w panelu.
     *
     * Dopóki trwa, automat MILCZY (decyduje o tym Worker, patrz `chatVisitor`), a wyjściem
     * jest jeden przycisk: „chcę porozmawiać z automatem".
     */
    let handedOver = false;
    const seen = new Set();

    /* Who we are talking to.
       Kept in this browser next to the thread token, because the two only make sense
       together: the token names the conversation, this names the person in it. Nothing here
       is trusted — the server stores it against the thread and never reads it back as
       identity. */
    const visitor = {
      name: storage.get('carruleddhi.chat.name', '') || '',
      email: storage.get('carruleddhi.chat.email', '') || ''
    };
    const identified = () => Boolean(visitor.name && visitor.email);

    /* ---------------------------------------------------------------- tabs */
    const selectTab = (name) => {
      tabs.forEach((tab) => {
        const active = tab.dataset.contactTab === name;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', String(active));
      });
      panel.hidden = name !== 'chat';
      if (formPanel) formPanel.hidden = name !== 'form';
      if (name === 'chat') {
        applyGate();
        // The thread is only opened once we know who is in it, so a conversation never
        // exists in the database with nobody to answer.
        if (identified()) {
          openThread();
          startPolling();
          /* preventScroll, bo #contact jest sekcja sticky z overflow:hidden.

                       Bez tego przegladarka "przewija do elementu", ktory z jej punktu widzenia

                       stoi gdzie indziej niz widzi go uzytkownik — i strona teleportuje sie do

                       stopki albo do komentarzy. To jest zglaszane "klikam wyslij i przenosi mnie

                       do komentarzy". Fokus ma ustawic kursor, nie ruszac strona. */
          input?.focus({ preventScroll: true });
        } else {
          $('#chat-gate-name', panel)?.focus({ preventScroll: true });
        }
      } else {
        stopPolling();
      }
    };

    /* ------------------------------------------------- koniec rozmowy i nowa rozmowa */
    /**
     * Dwa elementy dobudowane tutaj, a nie wpisane w index.html.
     *
     * Pasek z „zakończ rozmowę" nad dziennikiem i karta „rozmowa zakończona" z przyciskiem
     * „nowa rozmowa". Budowane z JavaScriptu, bo bez niego nie ma czatu w ogóle — panel czatu
     * jest w całości obsługiwany stąd, więc przycisk zamykający rozmowę w statycznym znaczniku
     * byłby przyciskiem widocznym u kogoś, kto nie ma czym go obsłużyć.
     */
    const tools = document.createElement('div');
    tools.className = 'chat__tools';
    tools.dataset.chatTools = '';
    tools.hidden = true;
    const endButton = document.createElement('button');
    endButton.type = 'button';
    endButton.className = 'chat__end';
    endButton.dataset.chatEnd = '';

    /**
     * „Chcę porozmawiać z automatem" — jedyne wyjście ze stanu „przekazana człowiekowi".
     *
     * DLACZEGO PRZYCISK, A NIE SŁOWA W WIADOMOŚCI
     *   Wcześniej wyjście rozpoznawała lista słów po stronie Workera („automat", „bot",
     *   „asystent"). Znaczyło to, że zdanie „nie chcę automatu, poproszę człowieka" —
     *   najczęstsze zdanie w tej sytuacji — wyprowadzało z kolejki, do której właśnie się
     *   ustawiono, bo zawiera słowo „automat". Rozpoznawanie zamiaru z pojedynczych słów
     *   działa w jedną stronę (wejście do kolejki jest łagodne w skutkach), a w drugą nie.
     *
     * DLACZEGO OBOK „ZAKOŃCZ ROZMOWĘ", A NIE W RZĘDZIE PASTYLEK
     *   Rząd pastylek jest przemalowywany po każdej odpowiedzi i przez kreator, więc przycisk
     *   wyjścia ze stanu wątku ginąłby tam przy pierwszym kroku sprawy. Pasek narzędzi stoi
     *   nad dziennikiem i nie zależy od tego, co się w rozmowie dzieje.
     *
     * Widoczny TYLKO w tym stanie: przycisk „wróć do automatu" w rozmowie, którą i tak
     * prowadzi automat, jest przyciskiem bez znaczenia.
     */
    const botButton = document.createElement('button');
    botButton.type = 'button';
    botButton.className = 'chat__tobot';
    botButton.dataset.chatToBot = '';
    botButton.hidden = true;

    tools.append(botButton, endButton);

    const endedCard = document.createElement('div');
    endedCard.className = 'chat-ended';
    endedCard.dataset.chatEnded = '';
    endedCard.hidden = true;
    const endedTitle = document.createElement('strong');
    const endedLead = document.createElement('p');
    const restartButton = document.createElement('button');
    restartButton.type = 'button';
    restartButton.className = 'btn btn--small btn--yellow';
    restartButton.dataset.chatRestart = '';
    endedCard.append(endedTitle, endedLead, restartButton);

    /** Etykiety przez słownik, więc przełączenie języka je przerysowuje. */
    function paintChatChrome() {
      // Zbrojony przycisk nosi pytanie, nie własną nazwę — przełączenie języka nie może go
      // rozbroić bez wiedzy człowieka, który właśnie na nie patrzy.
      if (endButton.classList.contains('is-armed')) endButton.textContent = text('chat.endConfirm');
      else endButton.textContent = text('chat.end');
      botButton.textContent = text('chat.toBot');
      endedTitle.textContent = text('chat.endedTitle');
      endedLead.textContent = text('chat.endedLead');
      restartButton.textContent = text('chat.restart');
    }
    paintChatChrome();
    window.addEventListener('carruleddhi:language', paintChatChrome);

    // Pasek nad dziennikiem, karta na jego miejscu — oba wewnątrz panelu czatu.
    if (log) {
      log.before(tools);
      log.after(endedCard);
    } else {
      panel.append(tools, endedCard);
    }

    /* ---------------------------------------------------------------- gate */
    /** Shows the two fields, the conversation, or the closing card — never two at once. */
    function applyGate() {
      const done = identified();
      const live = done && !ended;
      if (gate) gate.hidden = done || ended;
      if (log) log.hidden = !done;
      if (form) form.hidden = !live;
      if (chips) chips.hidden = !live;
      tools.hidden = !live;
      /* Przycisk powrotu do automatu należy do stanu wątku, nie do stanu panelu — ale nie ma
         go po co pokazywać nad kartą z imieniem ani nad kartą „rozmowa zakończona". */
      botButton.hidden = !live || !handedOver;
      endedCard.hidden = !ended;
      panel.dataset.chatReady = ended ? 'ended' : (done ? 'yes' : 'no');
    }

    /**
     * Zakończenie rozmowy.
     *
     * Odpytywanie zatrzymywane pierwsze, żeby odpowiedź w drodze nie dorysowała wiadomości do
     * dziennika, który właśnie schodzi z ekranu. Żądanie nie jest warunkiem: gdy padnie, po
     * stronie gościa rozmowa i tak jest skończona, bo o tym decyduje on, a nie sieć. Serwer
     * dowie się przy następnej okazji, a wątek bez zamknięcia to wątek widoczny w panelu —
     * czyli błąd po bezpiecznej stronie.
     */
    async function endConversation() {
      stopPolling();
      try {
        await postJSON(endpoint, eventPayload('chat', { action: 'close', token }));
      } catch (error) {
        console.warn('Chat close failed; ending locally anyway:', error);
      }
      ended = true;
      /* Kolejka zdań automatu unieważniona: zadanie, które w niej stoi, dorysowałoby zdanie
         z zamkniętej rozmowy do karty „rozmowa zakończona". Patrz `sayLater`. */
      sayEpoch += 1;
      hideTyping();
      /* Sprawa w toku kończy się razem z rozmową: kod i potwierdzenie nie mają po co przeżywać
         dziennika, który właśnie schodzi z ekranu. */
      endFlow();
      applyGate();
      window.dispatchEvent(new Event('carruleddhi:relayout'));
      restartButton.focus({ preventScroll: true });
    }

    /**
     * Nowa rozmowa: nowy token, nowa tożsamość, czysty dziennik.
     *
     * Imię i adres są pytane ponownie z rozmysłu. Przycisk „nowa rozmowa" naciska też ktoś, kto
     * podaje komuś telefon albo pisze w innej sprawie z innego adresu — a odpowiedź organizatora
     * poszłaby wtedy pod adres poprzedniej osoby. Jedno pytanie jest tańsze niż odpowiedź
     * wysłana nie tam.
     */
    function startFresh() {
      storage.remove(CHAT_TOKEN_KEY);
      storage.remove('carruleddhi.chat.name');
      storage.remove('carruleddhi.chat.email');
      // chatToken() nie znajdzie zapisanego i wygeneruje nowy, zapisując go po drodze.
      token = chatToken();
      visitor.name = '';
      visitor.email = '';
      ended = false;
      opened = false;
      lastAt = '';
      seen.clear();
      /* Nowa rozmowa to nowy wątek, więc i nowy tryb: stan „przekazana człowiekowi" należał do
         tokenu, którego już nie ma. Kolejka zdań unieważniona razem z dziennikiem. */
      sayEpoch += 1;
      hideTyping();
      handedOver = false;
      mode = 'ai';
      panel.dataset.chatMode = 'ai';
      // Załącznik wybrany, ale niewysłany, należał do poprzedniej rozmowy.
      dropAttachment();
      /* Kreator i bramka też należały do poprzedniej rozmowy. Bez tego nowa rozmowa startuje
         z otwartym krokiem cudzej sprawy: wpisana wiadomość byłaby przechwycona jako odpowiedź
         bramce, a adres i kod z tamtej sprawy zostałyby w pamięci. */
      endFlow();
      if (log) log.replaceChildren();
      $$('[data-field]', gate).forEach((holder) => {
        holder.classList.remove('is-invalid');
        const slot = $('[data-error]', holder);
        if (slot) slot.textContent = '';
      });
      const nameField = $('#chat-gate-name', panel);
      const emailField = $('#chat-gate-email', panel);
      if (nameField) nameField.value = '';
      if (emailField) emailField.value = '';
      applyGate();
      window.dispatchEvent(new Event('carruleddhi:relayout'));
      nameField?.focus({ preventScroll: true });
    }

    /* Potwierdzenie na samym przycisku, nie w okienku systemowym.
       ---------------------------------------------------------------------------
       Stało tu `window.confirm`. Zamknięcia nie da się cofnąć, więc pytanie jest na miejscu —
       ale systemowe okno wygląda jak komunikat przeglądarki, nie jak część tej strony, na
       telefonie zakrywa pół ekranu, i nie da się go przetłumaczyć ani ostylować.

       Pierwsze naciśnięcie zbroi przycisk i zmienia jego napis na pytanie, drugie kończy
       rozmowę. Cofnięcie samo po pięciu sekundach — kto nacisnął przez pomyłkę, nie musi nic
       robić. To ta sama konstrukcja co „naciśnij dwa razy, żeby usunąć" i nie zabiera ekranu. */
    let armedTimer = 0;
    const disarm = () => {
      window.clearTimeout(armedTimer);
      armedTimer = 0;
      endButton.classList.remove('is-armed');
      endButton.textContent = text('chat.end');
    };
    endButton.addEventListener('click', () => {
      if (armedTimer) {
        disarm();
        void endConversation();
        return;
      }
      endButton.classList.add('is-armed');
      endButton.textContent = text('chat.endConfirm');
      armedTimer = window.setTimeout(disarm, 5000);
    });
    restartButton.addEventListener('click', startFresh);

    /**
     * Jedno miejsce, w którym tryb wątku z serwera zamienia się w stan panelu.
     *
     * Wołane po `open`, po `send` i po każdym odczycie — bo tryb potrafi się zmienić bez
     * naszego udziału: wystarczy, że organizator odpisze w panelu. Bez tego przycisk
     * „chcę porozmawiać z automatem" pojawiałby się dopiero po odświeżeniu strony, czyli
     * dokładnie wtedy, gdy nikt go już nie szuka.
     *
     * `chat.handedOver` mówione RAZ, na przejściu. Przy każdym odczycie byłoby to zdanie
     * powtarzane co cztery sekundy — czyli automat wtrącający się w rozmowę, z której właśnie
     * się wycofał.
     */
    function setMode(next) {
      const value = next || mode;
      const was = handedOver;
      mode = value;
      handedOver = value === 'human';
      panel.dataset.chatMode = handedOver ? 'human' : 'ai';
      botButton.hidden = !handedOver || ended;
      if (handedOver && !was) noteLine(text('chat.handedOver') || '');
    }

    /**
     * Powrót do automatu: jedno żądanie, które zmienia stan WĄTKU.
     *
     * Idzie na serwer, a nie tylko do tej karty, bo stan „przekazana człowiekowi" mieszka
     * w wątku — patrz komentarz przy `handedOver`. Odmowa nie zmienia niczego po stronie
     * strony: udawany powrót do automatu skończyłby się ciszą przy następnym pytaniu, a to
     * jest dokładnie ten objaw, od którego cała ta zmiana się zaczęła.
     *
     * `unread_for_admin` zostaje nietknięte (decyduje o tym Worker): gość mógł zapytać
     * o coś, na co człowiek wciąż ma odpowiedzieć, a powrót do automatu nie jest
     * odpowiedzią na jego pytanie.
     */
    botButton.addEventListener('click', async () => {
      keepFocus();
      botButton.disabled = true;
      try {
        const result = await postJSON(endpoint, eventPayload('chat', { action: 'bot', token }));
        if (!result || result.ok === false) throw new Error(result?.code || 'chat');
        setMode(result.mode || 'ai');
        noteLine(text('chat.toBotDone') || '');
        paintChips();
      } catch (error) {
        console.warn('Chat handover could not be lifted:', error);
        note('chat.dataFailed');
      } finally {
        botButton.disabled = false;
      }
    });

    gateForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      const nameField = $('#chat-gate-name', panel);
      const emailField = $('#chat-gate-email', panel);
      const name = String(nameField?.value || '').trim();
      const email = String(emailField?.value || '').trim().toLowerCase();

      /* Checked here as well as by the browser, because `novalidate` is on the form — the
         page does its own validation everywhere else and two different error styles in one
         card is worse than one that is slightly more work. */
      const showError = (field, key) => {
        const holder = field?.closest('[data-field]');
        const slot = holder ? $('[data-error]', holder) : null;
        if (slot) slot.textContent = text(key) || '';
        holder?.classList.add('is-invalid');
        field?.focus({ preventScroll: true });
      };
      $$('[data-field]', gate).forEach((holder) => {
        holder.classList.remove('is-invalid');
        const slot = $('[data-error]', holder);
        if (slot) slot.textContent = '';
      });

      if (name.length < 2) { showError(nameField, 'chat.gateBadName'); return; }
      // The same pattern the registration form uses, and for the same reason: an address that
      // cannot receive a reply makes the whole conversation pointless.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { showError(emailField, 'chat.gateBadEmail'); return; }

      visitor.name = name;
      visitor.email = email;
      storage.set('carruleddhi.chat.name', name);
      storage.set('carruleddhi.chat.email', email);
      /* Ta sama para, co po zapisie i po przypomnieniach — żeby następna droga do adresu
         też już go znała. */
      rememberPerson(name, email);
      applyGate();
      openThread();
      startPolling();
      input?.focus({ preventScroll: true });
      // The card disappearing changes the section's height, and #contact is a sticky panel
      // that decides whether to pin from its own height.
      window.dispatchEvent(new Event('carruleddhi:relayout'));
    });

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => selectTab(tab.dataset.contactTab));
    });

    /* -------------------------------------------------------------- render */
    const bubble = (author, body, pending, image = '') => {
      const row = document.createElement('div');
      row.className = `chat-msg chat-msg--${author}${pending ? ' is-pending' : ''}`;
      if (image) row.classList.add('has-photo');
      const who = document.createElement('span');
      who.className = 'chat-msg__who';
      who.textContent = author === 'visitor'
        ? (text('chat.you') || 'Ty')
        : author === 'organiser'
          ? (text('chat.them') || 'Organizator')
          : (text('chat.bot') || 'Automat');
      row.append(who);

      /* Zdjęcie nad tekstem, bo tekst je zwykle komentuje: „to koło" pod obrazkiem czyta się,
         a nad nim wisi w powietrzu. Adres jest podpisany przez workera i wygasa po godzinie —
         patrz migracja 0024; przeglądarka nigdy nie widzi ścieżki w buckecie. */
      if (image) {
        const figure = document.createElement('figure');
        figure.className = 'chat-msg__photo';
        const picture = document.createElement('img');
        picture.src = image;
        picture.alt = text('chat.photoAlt');
        picture.loading = 'lazy';
        picture.decoding = 'async';
        figure.append(picture);
        row.append(figure);
      }

      /* Akapit tylko wtedy, gdy jest co w nim napisać. Puste `<p>` pod zdjęciem to pasek
         odstępu bez powodu, a zdjęcie bez podpisu jest normalną wiadomością. */
      if (body) {
        const said = document.createElement('p');
        said.className = 'chat-msg__body';
        // textContent, not innerHTML: this string came from a stranger, and the organiser's
        // half came out of a database that a stranger can write to.
        said.textContent = body;
        row.append(said);
      }
      return row;
    };

    /* ========================================================================
       DOCIĄGANIE DZIENNIKA DO DOŁU — JEDNO MIEJSCE NA CAŁY CZAT
       ========================================================================
       ZGŁOSZENIE: „jak się wysyła wiadomość, to okienko jest zawsze tam na ostatniej
       wiadomości na dole". Czyli: po dopisaniu czegokolwiek widok ma stać na najnowszym
       wierszu, a nie tam, gdzie stał przed dopisaniem.

       CO BYŁO ZŁE — I DLACZEGO DZIAŁAŁO DOKŁADNIE ODWROTNIE, NIŻ MIAŁO
         Ta sama para linijek („zapamiętaj, czy jesteśmy na dole" / „appendChild" / „jeśli
         tak, to na dół") była PRZEPISANA SZEŚĆ RAZY: w `append`, w `noteLine`, w
         `showTyping`, przy wierszu z polem na kod, przy odsyłaczach do dokumentów i przy
         podsumowaniu zgłoszenia. Dwie z tych kopii różniły się od pozostałych — `noteLine`
         ciągnęła na dół BEZ WARUNKU — a skutek dał się zmierzyć i był idealnie odwrotny do
         zgłoszenia:

         ZMIERZONE (`tools/probe-chat-flows.mjs`, okno 390x844, PRZED zmianą; „brak" to
         `scrollHeight - clientHeight - scrollTop`, czyli ile brakuje do dołu):
           po wysłaniu WŁASNEJ wiadomości            brak 2279 px   <-- widok został w górze
           po wiadomości organizatora, gdy czytający
             przewinął dziennik w górę                brak    0 px   <-- widok mu wyrwany
         Czyli jedyny wiersz, przy którym dociągnięcie jest OCZYWISTE (własna wysyłka), nie
         dociągał; a jedyny, przy którym trzeba spytać, czy nie przerywamy komuś czytania,
         dociągał zawsze. Pierwsze brało się z tego, że `atBottom()` pytano PRZED dopisaniem,
         a przy „wysyłam z pozycji przewiniętej w górę" odpowiedź jest „nie". Drugie —
         z bezwarunkowego `toBottom()` w `noteLine`, którą woła `setMode`, gdy odczyt
         przynosi wieść o przekazaniu rozmowy człowiekowi.

       CO JEST TERAZ
         Jeden pomocnik, `addRow`, i jedna reguła w jednym miejscu. Nie ma już ani jednego
         `log.appendChild` poza nim, więc kolejny rodzaj wiersza (bramka, kreator, cokolwiek)
         dostaje właściwe zachowanie z samego faktu, że przechodzi tą drogą.

       REGUŁA, I DLACZEGO MA WYJĄTEK, A NIE JEST BEZWARUNKOWA
         Dociągamy, gdy czytający BYŁ JUŻ BLISKO DOŁU (60 px) — albo gdy wiersz jest jego
         własną wypowiedzią (`force`). Bezwarunkowe „zawsze na dół" wyrywałoby widok komuś,
         kto przewinął dziennik w górę, żeby przeczytać starsze wiadomości: dokładnie w chwili,
         w której organizator odpisze, tekst uciekałby mu w pół zdania. Własna wysyłka jest
         wyjątkiem, bo to on właśnie ją napisał i chce ją zobaczyć — a nie ma innego sposobu,
         żeby zobaczyć, czy poszła.

       PRZEWIJANY JEST WYŁĄCZNIE `.chat__log`, NIGDY DOKUMENT
         `.chat__log` ma własne `overflow-y: auto`, więc `scrollTop` na nim nie rusza strony.
         `scrollIntoView` na bąbelku albo na kompozytorze przewinąłby DOKUMENT — a to jest
         dokładnie usterka „czat przeskakuje do góry", którą naprawia `--chat-vh` i stała
         wysokość panelu (patrz `.chat[data-chat-ready='yes']` w chat.css). Jedna usterka
         zamieniona na drugą nie jest naprawą.
       ======================================================================== */
    const atBottom = () => !log || log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    const toBottom = () => {
      if (!log) return;
      log.scrollTop = log.scrollHeight;
      /* Druga próba w następnej klatce, bo wysokość wiersza nie zawsze jest już znana.
         Bąbelek ze zdjęciem rośnie, gdy obrazek się zdekoduje, a `<dl>` podsumowania
         dostaje ostateczną wysokość po przeliczeniu układu. Bez tej drugiej próby
         najwyższe wiersze czatu — te ze zdjęciem — kończyły o kilkadziesiąt pikseli
         poniżej widocznego dołu. Klatka później, więc nikt nie zdąży w tym czasie
         przewinąć dziennika ręcznie. */
      requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
    };

    /**
     * Jedyna droga, którą cokolwiek trafia do dziennika.
     *
     * @param {Node|null} node wiersz do dopisania
     * @param {boolean} force dociągnij na dół nawet wtedy, gdy czytający był wyżej.
     *        Prawda tylko dla wypowiedzi gościa: to on właśnie nacisnął „wyślij".
     */
    const addRow = (node, force) => {
      if (!log || !node) return node;
      const stick = force || atBottom();
      log.appendChild(node);
      if (stick) toBottom();
      return node;
    };

    const append = (message, pending) => {
      if (!log) return null;
      if (message.id && seen.has(message.id)) return null;
      /* Drugi bezpiecznik, na wypadek gdyby `seen` zostało wyczyszczone albo bąbelek trafił
         na ekran wcześniej niż jego identyfikator: sprawdzany jest sam dziennik. */
      if (message.id && log.querySelector(`[data-mid="${message.id}"]`)) return null;
      if (message.id) seen.add(message.id);
      const node = bubble(message.author, message.body, pending, message.image || '');
      if (message.id) node.dataset.mid = message.id;
      /* Autor rozstrzyga o wyjątku, i nie potrzeba do tego drugiego argumentu w kilkunastu
         wywołaniach: bąbelek gościa powstaje TYLKO wtedy, gdy gość coś zrobił — nacisnął
         „wyślij" albo pastylkę. Wiadomość automatu i organizatora przychodzi sama. */
      addRow(node, message.author === 'visitor');
      if (message.at && message.at > lastAt) lastAt = message.at;
      return node;
    };

    /* WIERSZ SYSTEMOWY — OD STRONY, NIE OD AUTOMATU I NIE OD ORGANIZATORA
       ---------------------------------------------------------------------------
       `.chat__system` jest wyśrodkowany, mniejszy i bez podpisu autora, więc nie udaje
       wypowiedzi w rozmowie. Bramka weryfikacyjna mówi wyłącznie tak: „wysłałem kod" nie jest
       zdaniem automatu, tylko stanem strony, a bąbelek automatu obiecywałby, że po drugiej
       stronie ktoś to napisał.

       Dwa wejścia, bo bramka podstawia w swoje teksty zamaskowany adres i liczbę pozostałych
       prób: `noteLine` bierze gotowe zdanie, `note` zostaje dla wywołań z samym kluczem. */
    const noteLine = (line) => {
      if (!log) return;
      const row = document.createElement('p');
      row.className = 'chat__system';
      row.textContent = line || '';
      /* Przez `addRow`, czyli z tą samą regułą co wszystko inne. Wcześniej stało tu
         bezwarunkowe `toBottom()` i to ono wyrywało widok czytającemu: `setMode` woła tę
         funkcję, gdy ODCZYT przynosi wieść o przekazaniu rozmowy człowiekowi, czyli
         w chwili, której gość nie wywołał. Wiersz systemowy po własnej czynności gościa
         i tak trafia na dół, bo jego wypowiedź przed chwilą tam widok ustawiła. */
      addRow(row);
    };

    const note = (key) => noteLine(text(key) || '');

    /* ---------------------------------------------------------------- open */
    async function openThread() {
      if (opened) return;
      opened = true;
      try {
        const result = await postJSON(endpoint, eventPayload('chat', { action: 'open', token }));
        if (!result || result.ok === false) throw new Error(result?.code || 'chat');
        (result.messages || []).forEach((message) => append(message, false));
        // A thread with no history opens with a greeting rather than a blank box: an empty
        // chat looks broken, and nobody types the first message into a void.
        /* Powitanie przez kolejkę — z kropkami. Wiadomość automatu, która stoi na ekranie
           w tej samej milisekundzie, w której odsłania się panel, wygląda jak nagłówek, a nie
           jak pierwsze zdanie rozmowy. */
        if (!(result.messages || []).length) {
          sayLater(() => append({ author: 'ai', body: text('chat.greeting') || '', at: '' }, false));
        }
        /* Tryb ustawiany PO wypisaniu historii: `setMode` dokłada wiersz o przekazaniu rozmowy
           i ma on stanąć pod wątkiem, a nie nad nim. Przy wejściu w wątek już przekazany to
           jedyne zdanie, które tłumaczy ciszę automatu i pokazuje przycisk powrotu — czyli
           właśnie to, co ma przeżyć odświeżenie strony. */
        setMode(result.mode || 'ai');
        toBottom();
      } catch (_) {
        opened = false;
        note('chat.offline');
      }
    }

    /* ------------------------------------------------------------- typing */
    /**
     * Three dots while the other side is composing.
     *
     * Between pressing send and the answer landing there is a model call — up to a couple of
     * seconds. Nothing marked that time, so the chat looked like it had swallowed the
     * question. This is one row that is added and removed; it never enters `seen`, so a poll
     * cannot mistake it for a message.
     */
    let typingRow = null;
    const showTyping = () => {
      if (!log || typingRow) return;
      typingRow = document.createElement('div');
      typingRow.className = 'chat-msg chat-msg--ai chat-typing';
      typingRow.setAttribute('aria-hidden', 'true');
      const dots = document.createElement('span');
      dots.className = 'chat-typing__dots';
      dots.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
      typingRow.appendChild(dots);
      addRow(typingRow);
    };
    const hideTyping = () => {
      typingRow?.remove();
      typingRow = null;
    };

    /* ========================================================================
       KROPKI PRZY KAŻDEJ ODPOWIEDZI AUTOMATU — TAKŻE PRZY TEJ Z PAMIĘCI
       ========================================================================
       CO BYŁO
         `showTyping()` stało w jednym miejscu: w `send()`, przed żądaniem do serwera. Czyli
         kropki widział tylko ten, kto NAPISAŁ wiadomość i czekał na model. Wszystko, co
         automat mówi z pamięci strony — kroki kreatora, komunikaty bramki, odpowiedzi po
         naciśnięciu pastylki — pojawiało się w tej samej milisekundzie, w której się kliknęło.
         Trzy zdania automatu wskakujące naraz nie czytają się jak rozmowa, tylko jak wydruk.

       CO JEST TERAZ
         Każda wypowiedź automatu przechodzi przez `sayLater`: kropki, krótka chwila, dopiero
         potem bąbelek. Kolejka jest JEDNA i szeregowa, więc dwa zdania pod rząd (pytanie
         o zgodę i odsyłacze do dokumentów) nie wyprzedzają się wzajemnie — a to jest cały
         powód, dla którego to jest kolejka, a nie `setTimeout` przy każdym wywołaniu.

       DLACZEGO 280 ms, A NIE SEKUNDA
         Tyle, żeby dało się zauważyć, że ktoś „pisze", i nie tyle, żeby czekać. Rozmowa
         z kreatorem ma kilkanaście kroków; przy sekundzie na krok samo przeklikanie sprawy
         sponsora kosztowałoby kwadrans cierpliwości. Ta liczba jest też sufitem dla sond:
         `tools/probe-chat-gate.mjs` odczytuje dziennik po 450 ms od naciśnięcia, więc jedno
         zadanie kolejki musi się w tym zmieścić — i dlatego zdanie z odsyłaczami maluje się
         w TYM SAMYM zadaniu co pytanie o zgodę, a nie w następnym.

       EPOKA
         „Nowa rozmowa" i „zakończ rozmowę" czyszczą dziennik. Zadanie, które czekało w
         kolejce, dorysowałoby wtedy zdanie z poprzedniej rozmowy do pustej karty — licznik
         epok jest po to, żeby takie zadanie po prostu nic nie zrobiło.
       ====================================================================== */
    const THINK_MS = 280;
    let sayEpoch = 0;
    let sayChain = Promise.resolve();

    function sayLater(paint) {
      const epoch = sayEpoch;
      sayChain = sayChain.then(async () => {
        if (epoch !== sayEpoch) return;
        showTyping();
        await new Promise((done) => window.setTimeout(done, THINK_MS));
        /* Kropki gasną także wtedy, gdy rozmowa zmieniła się w trakcie czekania: wiersz
           wskaźnika nie należy do żadnej wiadomości i nikt inny go nie zdejmie. */
        hideTyping();
        if (epoch !== sayEpoch) return;
        paint();
      });
      return sayChain;
    }

    /**
     * FOKUS NIGDY NIE SPADA NA `<body>`.
     * ---------------------------------------------------------------------------
     * To jest naprawa zgłoszenia „kliknięcie czegokolwiek w czacie przewija stronę".
     *
     * Zmierzone prawdziwymi dotknięciami przez CDP (390x844, `document.activeElement` po
     * kliknięciu): przy dwóch kontrolkach fokus lądował na `<body>` — po naciśnięciu pastylki,
     * bo `flowChoices`/`paintChips` podmieniają cały rząd i USUWAJĄ z drzewa przycisk, który
     * właśnie ma fokus, oraz po naciśnięciu „wyślij", bo `sendButton.disabled = true` odbiera
     * fokus wciśniętemu przyciskowi. Element z fokusem zabrany z drzewa albo zablokowany to
     * jedyny mechanizm w tym panelu, który potrafi ruszyć stronę: przeglądarka na telefonie
     * zwija wtedy klawiaturę, a zwinięcie klawiatury zmienia wysokość dokumentu, którego
     * sekcje mają wysokość liczoną od wysokości ekranu.
     *
     * Dlatego fokus jest PRZEKŁADANY na pole wiadomości, zanim kontrolka zniknie — a nie
     * przywracany potem przewijaniem. `preventScroll`, bo cała reszta tego pliku robi to samo
     * i z tego samego powodu: fokus ma ustawić kursor, nie ruszać strony.
     */
    const keepFocus = () => {
      if (!input || input.hidden) return;
      const active = document.activeElement;
      if (active === input) return;
      // Fokus przekładamy tylko z wnętrza czatu: kliknięcie w czacie nie ma prawa zabierać
      // kursora z pola w innej sekcji strony.
      if (active && active !== document.body && !panel.contains(active)) return;
      input.focus({ preventScroll: true });
    };

    /* ---------------------------------------------------------------- send */
    let sending = false;

    /* ------------------------------------------------------------ załącznik */
    /**
     * Zdjęcie zmniejszone w przeglądarce, zanim gdziekolwiek pojedzie.
     *
     * Telefon robi dziś dwanaście megapikseli, a bąbelek w czacie ma dwieście pikseli
     * szerokości. Wysłanie oryginału to kilka megabajtów przez transmisję komórkową po to, żeby
     * serwer i tak je pomniejszył — a limit ciała żądania odrzuciłby je wcześniej, pokazując
     * błąd o za dużym żądaniu zamiast o za dużym zdjęciu.
     *
     * 1400 px po dłuższej krawędzi i JPEG 0.8: mniej niż przy zgłoszeniach, bo tu nikt nie
     * drukuje tego zdjęcia — ma być czytelne w rozmowie i wystarczające dla modelu.
     */
    async function shrinkPhoto(file) {
      const bitmap = await createImageBitmap(file);
      const longest = Math.max(bitmap.width, bitmap.height);
      const scale = longest > 1400 ? 1400 / longest : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('no 2d context');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      return canvas.toDataURL('image/jpeg', 0.8);
    }

    /* Wybrane zdjęcie czeka tutaj do wysłania razem z wiadomością — jako data URL, bo to jest
       postać, w której workera to przyjmuje, i sprawdzona już raz przy wyborze pliku. */
    let attached = null;

    const fileField = document.createElement('input');
    fileField.type = 'file';
    fileField.accept = 'image/jpeg,image/png,image/webp';
    fileField.hidden = true;
    fileField.dataset.chatFile = '';

    const attachButton = document.createElement('button');
    attachButton.type = 'button';
    attachButton.className = 'chat__attach';
    attachButton.dataset.chatAttach = '';
    attachButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">'
      + '<path d="M9 12.5V7a3 3 0 0 1 6 0v9a5 5 0 0 1-10 0V8" fill="none" stroke="currentColor"'
      + ' stroke-width="2.2" stroke-linecap="round"/></svg>';

    /* Podgląd nad polem tekstowym: kto dołączył zdjęcie, ma je widzieć przed wysłaniem, i mieć
       jak je zdjąć. Bez tego jedyną drogą wycofania się jest wysłanie i żałowanie. */
    const preview = document.createElement('div');
    preview.className = 'chat__preview';
    preview.dataset.chatPreview = '';
    preview.hidden = true;
    const previewImage = document.createElement('img');
    previewImage.alt = '';
    const previewDrop = document.createElement('button');
    previewDrop.type = 'button';
    previewDrop.className = 'chat__preview-drop';
    previewDrop.innerHTML = '<span aria-hidden="true">×</span>';
    preview.append(previewImage, previewDrop);

    function paintAttach() {
      attachButton.setAttribute('aria-label', text('chat.attach'));
      attachButton.title = text('chat.attach');
      previewDrop.setAttribute('aria-label', text('chat.attachDrop'));
      preview.hidden = !attached;
      attachButton.classList.toggle('is-set', Boolean(attached));
      if (attached) previewImage.src = attached;
    }

    const dropAttachment = () => {
      attached = null;
      fileField.value = '';
      paintAttach();
      window.dispatchEvent(new Event('carruleddhi:relayout'));
    };

    /* SPINACZ WCHODZI DO ZNACZNIKA TYLKO PRZY WŁĄCZONEJ FLADZE.
       ---------------------------------------------------------------------------
       `features.chatPhotos` stoi dziś na `false` — powód jest wypisany przy samej fladze w
       site-config.js: cała droga zdjęcia działa oprócz modelu wizyjnego, którego to konto
       Groqa nie ma. Spinacz zapraszał więc do wysłania zdjęcia z pytaniem „czy takie koło
       przejdzie?", po czym rozmowa milkła do godzin pracy organizatora.

       Wyłączone przez NIEDODANIE do znacznika, nie przez `hidden` ani `display: none`:
       ukryty przycisk zostaje w kolejności tabulacji dopóki ktoś nie doda `hidden`, a ukryte
       `input[type=file]` nadal da się kliknąć skryptem z konsoli. Czego nie ma w drzewie, tego
       nie da się nacisnąć ani przypadkiem, ani celowo.

       `attached`, `paintAttach` i `dropAttachment` zostają zdefiniowane wyżej z rozmysłu.
       Woła je `send()` i `startFresh()`, a przy wyłączonej fladze `attached` zostaje na zawsze
       `null` — czyli te wywołania robią dokładnie to, co robiły, gdy nikt nie wybrał zdjęcia.
       Owijanie ich w warunki znaczyłoby trzy nowe rozgałęzienia po to, żeby schować przycisk.

       Serwer nie jest ruszany. Obsługa zdjęcia w workerze i bucket z migracji 0024 zostają
       na miejscu, przetestowane; gdy pojawi się model wizyjny, wraca to jednym `true`. */
    if (config.features.chatPhotos) {
      attachButton.addEventListener('click', () => fileField.click());
      previewDrop.addEventListener('click', dropAttachment);
      fileField.addEventListener('change', async () => {
        const file = fileField.files?.[0];
        if (!file) return;
        try {
          attached = await shrinkPhoto(file);
          paintAttach();
          window.dispatchEvent(new Event('carruleddhi:relayout'));
          input?.focus({ preventScroll: true });
        } catch (error) {
          console.warn('Chat attachment could not be prepared:', error);
          dropAttachment();
          note('chat.attachFailed');
        }
      });

      if (form) {
        form.prepend(attachButton);
        form.append(fileField);
        form.before(preview);
      }
      paintAttach();
      window.addEventListener('carruleddhi:language', paintAttach);
    }

    /* ========================================================================
       ZDJĘCIE ALBO LOGO SPONSORA — WŁASNE UKRYTE POLE PLIKU
       ========================================================================
       Osobne od `fileField` wyżej i to jest rozmyślne. Tamto należy do spinacza w kompozytorze,
       który stoi za flagą `features.chatPhotos` i jest dziś wyłączony (powód przy fladze: brak
       modelu wizyjnego). Logo sponsora nie ma z modelem nic wspólnego — to pole formularza
       zadane zdaniem w rozmowie — więc nie może zależeć od tej flagi, bo wtedy krok kreatora
       byłby ślepy w chwili, w której ktoś tę flagę przestawi.

       `hidden`, a nie `display: none` z arkusza: element ukryty tym atrybutem wypada z drzewa
       dostępności i z kolejności tabulacji, czyli nie da się w niego trafić tabulatorem
       w drodze do przycisku wysyłki. Otwiera je NACIŚNIĘCIE PASTYLKI („Wybierz obraz"), więc
       widocznym celem dotykowym jest pastylka, a nie surowe `input[type=file]`, które w każdej
       przeglądarce wygląda inaczej i w żadnej nie wygląda jak reszta tej strony.

       Zmniejszanie: `shrinkPhoto` z tego samego zasięgu, ta jedna droga dla obu przypadków.
       ====================================================================== */
    const logoField = document.createElement('input');
    logoField.type = 'file';
    logoField.accept = 'image/jpeg,image/png,image/webp';
    logoField.hidden = true;
    logoField.dataset.chatLogo = '';

    logoField.addEventListener('change', async () => {
      const file = logoField.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await shrinkPhoto(file);
        /* Kreator mógł się w tym czasie skończyć — wybór pliku trwa tyle, ile trwa grzebanie
           w galerii telefonu, a „rezygnuję" jest naciskane także wtedy. */
        if (!flow || flow.intent !== 'sponsor') return;
        flow.logo = dataUrl;
        /* Bąbelek gościa z samym obrazem, bez podpisu: to jest jego odpowiedź na pytanie
           o zdjęcie i ma po niej zostać ślad w rozmowie — a „dołączone" powiedziane słowem
           nie mówi, KTÓRE zdjęcie się dołączyło. Z galerii łatwo trafić w sąsiedni plik. */
        append({ author: 'visitor', body: '', at: '', image: dataUrl }, false);
        flowSay('chat.sponsorLogoDone');
        sponsorNext(sponsorAskLink);
      } catch (error) {
        console.warn('Chat sponsor logo could not be prepared:', error);
        if (flow?.intent === 'sponsor') flowSay('chat.sponsorLogoFailed');
      } finally {
        /* Wyczyszczone, żeby wybranie TEGO SAMEGO pliku drugi raz znowu wywołało `change`.
           Bez tego druga próba po nieudanym zmniejszaniu nie robi nic i wygląda na zawieszenie. */
        logoField.value = '';
      }
    });

    /* ========================================================================
       OSTRZEŻENIE NAD KOMPOZYTOREM — CYFRA W IMIENIU WIDAĆ OD PIERWSZEGO ZNAKU
       ========================================================================
       Wiersz nad polem wiadomości, a nie zdanie w wątku. Zdanie w wątku po każdym naciśnięciu
       klawisza znaczyłoby dziesięć bąbelków na dziesięć liter, a jedno na końcu — komunikat po
       wysłaniu, czyli dokładnie to, co miało przestać być jedyną informacją zwrotną.

       Ostrzeżenie nie blokuje wysłania. Blokada stoi w `sponsorStep`, gdzie odpowiedź z cyfrą
       jest odrzucana zdaniem automatu — bo pole wiadomości w czacie służy też do zwykłej
       rozmowy i odbieranie mu przycisku wysyłki na podstawie zgadywania, co gość właśnie pisze,
       zamieniłoby ostrzeżenie w awarię.

       `hidden`, gdy nie ma co powiedzieć: pusty akapit nad kompozytorem to pasek odstępu, który
       w przypiętej karcie czatu zjada wysokość dziennika przy każdej wysokości ekranu.
       ====================================================================== */
    const warnRow = document.createElement('p');
    warnRow.className = 'chat__warn';
    warnRow.dataset.chatWarn = '';
    warnRow.hidden = true;
    /* `role="status"` z `aria-live="polite"`: czytnik ekranu przeczyta ostrzeżenie, gdy się
       pojawi, i NIE przerwie tego, co właśnie mówi. `assertive` przerywałby literowanie
       wpisywanego imienia przy każdej cyfrze. */
    warnRow.setAttribute('role', 'status');
    warnRow.setAttribute('aria-live', 'polite');

    const setWarn = (key) => {
      const line = key ? (text(key) || '') : '';
      if (warnRow.textContent === line) return;
      warnRow.textContent = line;
      warnRow.hidden = !line;
    };

    /**
     * Czy w tym, co teraz stoi w polu wiadomości, jest cyfra — i czy to w ogóle krok, w którym
     * cyfra jest błędem.
     *
     * Warunek na `flow.step` jest tu po to, żeby ostrzeżenie NIE pojawiało się przy zwykłej
     * rozmowie: „ile kosztuje numer 7" to poprawne pytanie i nie ma o czym ostrzegać.
     */
    const watchPersonDigits = () => {
      const said = String(input?.value || '');
      const wrong = flow?.intent === 'sponsor' && flow.step === 'person' && DIGIT_IN_TEXT.test(said);
      setWarn(wrong ? 'chat.sponsorNoDigits' : '');
    };

    if (form) {
      form.append(logoField);
      form.before(warnRow);
    }
    input?.addEventListener('input', watchPersonDigits);
    /* Zmiana języka w trakcie kroku: ostrzeżenie stojące na ekranie ma się przetłumaczyć razem
       z resztą, a nie zostać w poprzednim języku do następnego naciśnięcia klawisza. */
    window.addEventListener('carruleddhi:language', watchPersonDigits);

    /* ========================================================================
       SAMOOBSŁUGA WŁASNYCH DANYCH W ROZMOWIE
       ========================================================================
       Cztery rzeczy, o które ludzie piszą najczęściej i na które dotąd odpowiadał człowiek
       nazajutrz: pokaż moje dane, popraw je, wycofaj mnie z wyścigu, przestań pisać.

       Kreator NIE jest drugą implementacją niczego. Wywołuje dokładnie te końcówki, których
       używa formularz „zarządzaj zgłoszeniem": `entry-lookup`, `entry-code`, `entry-manage`,
       a kod ze skrzynki bierze jedną bramką (`verify-start`/`verify-code`) i oddaje go czynności
       — `notify-off` dla powiadomień, `sponsor-lead` dla sponsora. Reguły kodu — sześć cyfr,
       kwadrans ważności, pięć prób, jednorazowość — stoją w bazie i są te same dla obu dróg.

       KAŻDA CZYNNOŚĆ WYMAGA KODU ZE SKRZYNKI. Sam adres wpisany w czacie nie jest dowodem
       niczego: gdyby wystarczał, każdy mógłby wycofać z wyścigu każdego, znając tylko mail.

       Stan jest w przeglądarce, ale nie jest niczym chroniony — i nie musi być. Chroni serwer,
       który przy każdym kroku żąda pary (adres, kod). Zgubiony albo podrobiony stan po stronie
       strony nie daje ani jednej czynności więcej. */
    let flow = null;

    /**
     * Kształt kreatora w jednym miejscu.
     *
     * Pięć pól obsługuje bramkę weryfikacyjną, wspólną dla wszystkich spraw:
     *   `purpose`    cel kodu — kod wystawiony na jedną sprawę nie działa na inną,
     *   `email`      adres, którego dotyczy bramka,
     *   `confirmed`  czy kod na ten adres został sprawdzony,
     *   `code`       te same sześć cyfr, potrzebne końcowemu żądaniu,
     *   `consent`    zgoda na prywatność i regulamin, zbierana przed pytaniami o kontakt.
     *
     * `code` żyje WYŁĄCZNIE tutaj, w pamięci karty. Nie ma na kreatorze ani jednego
     * `storage.set` i nie ma go mieć: zapamiętany kod przeżywałby zamknięcie karty i leżałby
     * w pamięci trwałej długo po tym, jak wygasł.
     */
    const newFlow = (intent, purpose, extra = {}) => ({
      intent,
      step: '',
      purpose,
      email: '',
      confirmed: false,
      code: '',
      consent: false,
      ...extra
    });

    /** Zdanie automatu OD RAZU. Używane wewnątrz jednego zadania kolejki (patrz `sayLater`). */
    const sayNow = (key) => {
      const line = text(key);
      if (line) append({ author: 'ai', body: line, at: '' }, false);
    };

    /* Zdanie kreatora przez kolejkę: najpierw kropki, potem bąbelek. Kreator odpowiada
       z pamięci strony, więc bez tego jego zdania pojawiały się w tej samej milisekundzie,
       w której gość kliknął — patrz komentarz przy `sayLater`. */
    const flowSay = (key) => sayLater(() => sayNow(key));

    /* Koniec kreatora zabiera ze sobą bramkę: pole na kod, adres, potwierdzenie i sam kod.
       Bez tego „rezygnuję" zostawiałoby na ekranie pole, które wysyła cyfry do sprawy, której
       już nie ma — i sześć cyfr w pamięci karty bez powodu. */
    const endFlow = () => {
      gateForget();
      flow = null;
      /* Ostrzeżenie o cyfrze w imieniu należy do kroku, nie do panelu. Bez tego „rezygnuję"
         naciśnięte przy ostrzeżeniu na ekranie zostawiałoby nad kompozytorem zdanie o polu,
         o które już nikt nie pyta. */
      setWarn('');
      paintChips();
    };

    /**
     * Przyciski wyboru w rozmowie. Ten sam rząd i ta sama klasa co podpowiedzi pytań.
     *
     * `variant` dokłada modyfikator do klasy. Pastylki bramki dostają przez niego wyższy cel
     * dotykowy: podpowiedź pytania naciska się z namysłem, a wyjście z bramki naciska ktoś
     * rozdrażniony tym, że kod nie doszedł — i naciska w telefon jedną ręką.
     */
    const flowChoices = (options, variant = '') => {
      if (!chipsList) return;
      chipsList.replaceChildren(...options.map(([label, run, quiet]) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = variant ? `chat__chip ${variant}` : 'chat__chip';
        chip.textContent = text(label) || label;
        chip.addEventListener('click', () => {
          /* NACIŚNIĘTA PASTYLKA ZOSTAWIA ŚLAD — BĄBELEK GOŚCIA, TAK JAK PISANIE
             ---------------------------------------------------------------------------
             Pastylki działały, ale w zapisie rozmowy nie zostawało po nich nic: gość widział
             ciąg zdań automatu bez ani jednej swojej odpowiedzi, a po przewinięciu w górę nie
             dawało się przeczytać, co właściwie wybrał. Naciśnięcie „Chcę zostać sponsorem"
             jest wypowiedzią w tej rozmowie i ma wyglądać jak wypowiedź.

             CO Z PASTYLKAMI BRAMKI — ROZSTRZYGNIĘTE TUTAJ
               „Wyślij ponownie", „zmień adres" i „rezygnuję" TEŻ zostawiają bąbelek. To są
               decyzje gościa, nie stany strony, i ich brak w zapisie był dokładnie tym samym
               brakiem co wyżej. Wolno im, bo pastylka nosi swoją etykietę ze słownika i nigdy
               nie nosi kodu — a jedyne, czego w tym dzienniku być nie może, to sześć cyfr.

             CZEGO TA GAŁĄŹ NIE ROBI I ROBIĆ NIE BĘDZIE
               Kod z bramki NIE przechodzi tędy. Sześciocyfrowy kod wpisuje się w osobne pole
               (`codeField`), które celowo nie tworzy bąbelka i nie dopisuje wiersza do wątku —
               patrz asercja „wpisanie kodu nie tworzy bąbelka ani wiersza w wątku" w
               `tools/probe-chat-gate.mjs`. Kod do cudzej skrzynki w historii czytanej przez
               organizatora to kod w bazie w miejscu, w którym nie ma prawa być.

             Bąbelek jest LOKALNY — nie leci przez `send()` do wątku. Odpowiedzi kreatorowi są
             interfejsem, nie treścią rozmowy; tak samo lokalne są jego własne zdania
             (`flowSay`), więc jedno i drugie znika razem z kartą i nie zaśmieca historii. */
          /* `quiet` — pastylka, która NICZEGO JESZCZE NIE ROZSTRZYGA.
             „Przeczytaj i zaakceptuj” otwiera okno z dokumentem; zgoda pada dopiero po
             doczytaniu go do końca, a okno można zamknąć bez niczego. Zostawiony tu bąbelek
             mówiłby w zapisie rozmowy „zaakceptowałem” w chwili, w której nikt nic nie
             zaakceptował — a przy trzecim otwarciu okna stałyby już trzy takie zdania.
             Bąbelek dopisuje się po przyjęciu zgody, jednym zdaniem i raz. */
          if (!quiet) append({ author: 'visitor', body: chip.textContent || '', at: '' }, false);
          // Fokus przekładany PRZED podmianą rzędu: patrz `keepFocus`.
          keepFocus();
          void run();
        });
        return chip;
      }));
      if (chips) chips.hidden = options.length === 0;
      setChipsOpen(options.length > 0);
    };

    /**
     * POLE NA SZEŚCIOCYFROWY KOD — WIERSZ W DZIENNIKU, NIE POLE WIADOMOŚCI
     * ---------------------------------------------------------------------------
     * Cztery decyzje, każda z powodem:
     *
     * `type="text"` z `inputmode="numeric"`, a nie `type="number"`. Klawiatura na telefonie
     * jest cyfrowa w obu przypadkach, ale liczba dostaje strzałki, gubi wiodące zera i
     * przyjmuje `e` oraz `-` — a kod `004512` to nie cztery tysiące pięćset dwanaście.
     *
     * `autocomplete="one-time-code"` — system podsuwa kod wprost z powiadomienia, jeśli go
     * zobaczy. Nic nie kosztuje, a na iOS oszczędza całe przepisywanie z drugiej aplikacji.
     *
     * Wysyłka po SZÓSTEJ CYFRZE, bez przycisku. Warunek stoi na długości po odsianiu
     * nie-cyfr, nie na zdarzeniu klawiatury — dlatego wklejenie sześciu cyfr wysyła tak samo
     * jak wpisanie ich palcem. Litery i spacje po prostu się nie pojawiają: kto wkleja
     * „kod: 123456" ze skrzynki, ma dostać potwierdzenie, a nie komunikat o błędzie.
     *
     * To pole NIE JEST polem wiadomości czatu i nie tworzy bąbelka gościa. Kod wpisany w
     * kompozytor poleciałby jako wiadomość do wątku i wylądowałby w historii, którą
     * organizator czyta w panelu — a sześciocyfrowy kod do cudzej skrzynki nie ma tam czego
     * robić. Wywołanie zwrotne dostaje same cyfry i nic nie dopisuje do rozmowy.
     *
     * @param {(code: string) => (void | Promise<void>)} onCode wołane raz na komplet sześciu cyfr
     * @returns {{ row: HTMLElement, field: HTMLInputElement, focus: () => void,
     *   clear: () => void, hint: (key?: string) => void, lock: () => void,
     *   unlock: () => void, remove: () => void }}
     */
    function codeField(onCode) {
      const row = document.createElement('div');
      row.className = 'chat__code';

      const field = document.createElement('input');
      field.type = 'text';
      field.inputMode = 'numeric';
      field.autocomplete = 'one-time-code';
      field.maxLength = 6;
      field.pattern = '\\d*';
      field.dataset.chatCode = '';
      /* Klucz z przestrzeni `entry`, użyty w rozmowie świadomie: „sześciocyfrowy kod" jest
         dosłownie tym samym napisem co przy formularzu, a druga kopia w sześciu językach to
         pierwsze miejsce, w którym te dwa teksty się rozjadą. */
      field.setAttribute('aria-label', text('entry.codeLabel'));

      const hint = document.createElement('span');
      hint.className = 'chat__code-hint';
      hint.dataset.chatCodeHint = '';

      row.append(field, hint);

      /* Zamek na czas sprawdzania kodu. Bez niego zdarzenie `input` z podpowiedzi systemowej
         albo drugie wklejenie wysyłałoby ten sam komplet cyfr po raz drugi — a każda próba
         liczy się do limitu pięciu po stronie serwera. */
      let busy = false;

      const handle = {
        row,
        field,
        // preventScroll — wiersz jest w przypiętym dzienniku, a `focus()` bez tej flagi
        // przerzuca stronę do niego zamiast zostawić rozmowę tam, gdzie stoi.
        focus: () => field.focus({ preventScroll: true }),
        clear: () => { field.value = ''; },
        hint: (key) => { hint.textContent = key ? text(key) : ''; },
        lock: () => { busy = true; field.disabled = true; },
        unlock: () => { busy = false; field.disabled = false; },
        remove: () => row.remove()
      };

      field.addEventListener('input', () => {
        const digits = String(field.value || '').replace(/\D/g, '').slice(0, 6);
        // Odsianie w miejscu, bez zdania o błędzie: znak, którego tu nie ma prawa być, po
        // prostu się nie pojawia. Podstawienie tylko przy różnicy, żeby nie ruszać karetki
        // przy każdym poprawnym naciśnięciu.
        if (field.value !== digits) field.value = digits;
        if (busy || digits.length < 6) return;
        handle.lock();
        void (async () => {
          try {
            await onCode(digits);
          } finally {
            handle.unlock();
            /* Puste pole i palec z powrotem w nim, ale tylko dopóki wiersz jest w drzewie:
               po udanym kodzie bramka go zdejmuje i nie ma czego ustawiać ani gdzie wracać. */
            if (row.isConnected) {
              handle.clear();
              handle.focus();
            }
          }
        })();
      });

      field.addEventListener('keydown', (event) => {
        /* Enter nic tu nie robi. Wysyła szósta cyfra, więc naciśnięcie na pięciu jest pomyłką,
           a nie żądaniem — i nie ma prawa dosięgnąć kompozytora ani wysłać czegokolwiek. */
        if (event.key === 'Enter') event.preventDefault();
      });

      addRow(row);
      handle.focus();
      return handle;
    }

    /* ========================================================================
       BRAMKA WERYFIKACYJNA — JEDNA DLA WSZYSTKICH SPRAW
       ========================================================================
       Cztery sprawy potrzebują dowodu dostępu do skrzynki: zgłoszenie sponsora, zmiana danych,
       rezygnacja z wyścigu, wypisanie z powiadomień. Dotąd każda robiła to inaczej — jedna
       w rozmowie, dwie w osobnym formularzu, czwarta wcale. Trzy zachowania dla tej samej
       czynności to trzy miejsca, w których teksty i reguły się rozjadą.

       DWIE KOŃCÓWKI, TRZY ŻĄDANIA
         `verify-start`  wysyła kod na podany adres i nic nie autoryzuje,
         `verify-code`   sprawdza kod i GO NIE ZUŻYWA — `consumed_at` zostaje puste,
         czynność       dostaje parę (adres, kod) w SWOIM żądaniu i tam kod jest zużywany.
       Dopiero to trzecie żądanie autoryzuje. Dwa pierwsze są wygodą rozmowy, nie
       poświadczeniem — dlatego `flow.confirmed` ustawione ręcznie w konsoli nie wykonuje ani
       jednej czynności więcej (O5).

       ŚCIEŻKA, NIE `type` W CIELE
         Router Workera bierze rodzaj ZE ŚCIEŻKI, żeby podrobione `type` w ciele nie przeszło
         między drogami. Żądanie bramki musi więc pójść na własny adres, a nie na adres czatu
         z innym rodzajem w środku.

       KOD TYLKO W PAMIĘCI
         `flow.code` nie idzie do `localStorage` i nie ma tu żadnego `storage.set`. Zapamiętany
         kod przeżywałby zamknięcie karty i leżałby w pamięci trwałej po tym, jak wygasł —
         czyli byłby wyłącznie cudzym poświadczeniem do znalezienia. Kończy się razem
         z kreatorem: patrz `gateForget`.
       ====================================================================== */

    /** Adres końcówki z tej samej rodziny co czat — rodzaj jest w ścieżce, nie w ciele. */
    const gateUrl = (name) => (endpoint.includes('/')
      ? endpoint.replace(/[^/]*$/, name)
      : `/api/carruleddhi/${name}`);

    const gatePost = (name, data) => postJSON(gateUrl(name), eventPayload(name, data));

    /**
     * Odmowy bramki przełożone na zdania. Każda ma swoje: „kod wygasł" i „za dużo prób" to dla
     * gościa dwie różne rzeczy, choć obie znaczą „poproś o nowy".
     *
     * `VERIFY_BAD_EMAIL` i `VERIFY_BAD_CODE` sięgają po klucze z rodziny `chat.data*`, bo
     * zdanie jest dosłownie to samo — druga kopia w sześciu językach byłaby pierwszym miejscem,
     * w którym te dwa napisy się rozjadą. `VERIFY_BAD_PURPOSE` i `VERIFY_SEND_FAILED` wpadają
     * w zdanie ogólne: to pomyłki po naszej stronie i gość nie ma na nie żadnego ruchu.
     */
    const GATE_REFUSALS = {
      VERIFY_WRONG: 'chat.gateWrong',
      VERIFY_EXPIRED: 'chat.gateExpired',
      VERIFY_NO_CODE: 'chat.gateNoCode',
      VERIFY_TOO_MANY_TRIES: 'chat.gateBurnt',
      VERIFY_TOO_OFTEN: 'chat.gateTooOften',
      VERIFY_BAD_EMAIL: 'chat.dataBadEmail',
      VERIFY_BAD_CODE: 'chat.dataBadCode'
    };

    /**
     * Jedno przejście przez bramkę: adres, cel, wiązanie ze zgłoszeniem i pole na kod.
     * `null`, dopóki żadna sprawa nie prosi o potwierdzenie.
     *
     * `gateState`, a nie `gate`: `gate` w tym zasięgu jest kartą z imieniem i adresem sprzed
     * rozmowy (`[data-chat-gate]`), czytaną przez `applyGate`. Dwie bramki w jednym pliku to
     * nie zbieg okoliczności — jedna wpuszcza do rozmowy, druga do czynności.
     */
    let gateState = null;

    /**
     * Zaczepy sprawy stojącej za bramką — co zrobić po potwierdzeniu i gdzie wrócić przy
     * „zmień adres". Osobno od `gateState`, bo przeżywają zdjęcie pola na kod: „zmień adres"
     * zdejmuje pole i wraca do pytania o adres, a po nowym adresie ta sama sprawa ma iść dalej.
     */
    let gateHooks = null;

    /** Zdejmuje samo pole na kod. Bramka zostaje: pastylka „wyślij ponownie" wie, na jaki adres. */
    function gateDropField() {
      gateState?.field?.remove();
      if (gateState) gateState.field = null;
    }

    /** Bramki nie ma: ani pola, ani adresu, ani zaczepów, ani kodu w pamięci. */
    function gateForget() {
      gateDropField();
      gateState = null;
      gateHooks = null;
      if (flow) {
        flow.confirmed = false;
        flow.code = '';
      }
    }

    /**
     * Zdanie bramki jako wiersz systemowy, z podstawieniami.
     *
     * `%EMAIL%` to adres ZAMASKOWANY przez Workera i tylko taki tu trafia. Pełny adres
     * w wątku byłby ujawnieniem bez powodu — ten wątek czyta potem organizator w panelu.
     */
    function gateSystem(key, subs = null) {
      let line = text(key) || '';
      if (subs) {
        for (const token of Object.keys(subs)) line = line.replace(token, String(subs[token]));
      }
      /* Przez kolejkę, jak zdania kreatora: komunikat bramki jest odpowiedzią automatu na to,
         co gość właśnie zrobił, więc też ma się poprzedzić kropkami. Zwracana obietnica jest
         po to, żeby wywołujący mógł POCZEKAĆ — `gateStart` czeka, bo pole na kod nie może
         stanąć nad zdaniem, które o nim mówi. */
      return sayLater(() => noteLine(line));
    }

    /**
     * Zapasowe maskowanie adresu — ten sam kształt co `maskEmail` w Workerze.
     *
     * Używane tylko wtedy, gdy odpowiedź nie przyniosła zamaskowanego adresu: bez Workera
     * `postJSON` oddaje `{ ok: true, demo: true }`, a zdanie z pustym miejscem w środku
     * wygląda jak awaria tłumaczenia. Pełny adres nie idzie do wątku nigdy, także tutaj.
     */
    const gateMask = (address) => {
      const at = String(address).indexOf('@');
      if (at < 1) return '';
      const name = String(address).slice(0, at);
      const head = name.slice(0, 1);
      const tail = name.length > 1 ? name.slice(-1) : '';
      return `${head}${'*'.repeat(Math.max(name.length - 2, 1))}${tail}${String(address).slice(at)}`;
    };

    /**
     * TRZY WYJŚCIA Z BRAMKI, TE SAME PO KAŻDEJ ODMOWIE
     * ---------------------------------------------------------------------------
     * Pokazywane także wtedy, gdy kod właśnie poszedł i bramka czeka. „Kod nie doszedł" jest
     * najczęstszą rzeczą, która się tu zdarza, a dorysowywanie wyjścia dopiero po nieudanej
     * próbie kazałoby wpisać byle sześć cyfr, żeby zobaczyć przycisk. Sufit trzech kodów na
     * kwadrans pilnuje, żeby „wyślij ponownie" nie było kranem.
     */
    function gateChoices() {
      flowChoices([
        ['chat.gateResend', () => gateResend()],
        ['chat.gateChangeEmail', () => gateChangeEmail()],
        ['chat.dataCancel', () => { flowSay('chat.dataStopped'); endFlow(); }]
      ], 'chat__chip--gate');
    }

    /** „Wyślij ponownie": ten sam adres, ten sam cel, nowy kod (2.8). */
    async function gateResend() {
      if (!gateState) return;
      await gateStart(gateState.email, gateState.purpose);
    }

    /**
     * „Zmień adres": z powrotem do pytania o adres i weryfikacja od nowa (2.9).
     *
     * Poprzednie odpowiedzi zostają — wraca się o jeden krok, nie na początek. Potwierdzenie
     * i kod idą do kosza, bo dotyczyły adresu, którego już nie ma w tej sprawie.
     */
    function gateChangeEmail() {
      if (!flow) return;
      const back = gateHooks?.onChangeEmail || null;
      gateDropField();
      gateState = null;
      flow.confirmed = false;
      flow.code = '';
      flow.email = '';
      flow.step = 'email';
      if (back) {
        void back();
        return;
      }
      /* Bez zaczepu: sprawa nie powiedziała, jak pyta o adres, więc pyta bramka. Zdanie jest
         to samo, którego używa kreator na wejściu w sprawę własnych danych. */
      flowSay('chat.dataAskEmail');
      flowChoices([['chat.dataCancel', async () => { flowSay('chat.dataStopped'); endFlow(); }]]);
    }

    /**
     * Odmowa: zdanie po ludzku, trzy wyjścia, kreator ZOSTAJE OTWARTY.
     *
     * Odmowa nie kończy rozmowy — z każdego stanu kodu jest sensowne wyjście, a zamknięcie
     * kreatora na wygasłym kodzie znaczyłoby, że gość zaczyna sprawę od początku po tym, jak
     * przeczytał list piętnaście minut za późno.
     *
     * Pole na kod zostaje TYLKO po błędnej próbie, bo tylko tam wpisanie innych cyfr ma sens.
     * Przy wygasłym, wyczerpanym i nieistniejącym kodzie nie ma czego wpisać — pole, które
     * zawsze odmówi, jest zaproszeniem do zużycia prób na nic.
     */
    function gateRefused(problem) {
      const code = problem?.payload?.code || problem?.message || '';
      const left = problem?.payload?.left;
      if (flow) {
        flow.confirmed = false;
        flow.code = '';
      }

      /* Niepoprawny adres nie jest sprawą kodu: nie ma po co pokazywać pola ani proponować
         ponownej wysyłki na adres, na który nic nie dojdzie. Wracamy do pytania o adres, nie
         tracąc odpowiedzi z poprzednich kroków (5.4). */
      if (code === 'VERIFY_BAD_EMAIL') {
        gateSystem('chat.dataBadEmail');
        gateChangeEmail();
        return;
      }

      const key = GATE_REFUSALS[code] || 'chat.dataFailed';
      gateSystem(key, key === 'chat.gateWrong'
        ? { '%N%': typeof left === 'number' ? left : 0 }
        : null);
      if (code !== 'VERIFY_WRONG') gateDropField();
      /* Pole postawione z powrotem, jeśli błędny kod przyszedł z KOŃCOWEGO żądania: bramka
         zeszła po udanym `verify-code` (patrz `flowGuard`), a bez pola „kod się nie zgadza"
         byłoby zdaniem bez ruchu — jedynym wyjściem zostałby nowy list. */
      else if (gateState && !gateState.field) gateState.field = codeField((digits) => gateCheck(digits));
      gateChoices();
    }

    /**
     * Stawia bramkę z powrotem, żeby uniosła odmowę, która przyszła PO jej zejściu.
     *
     * `gateCheck` zdejmuje bramkę zaraz po poprawnym kodzie i dopiero wtedy idzie żądanie, które
     * czynność wykonuje — a ono odmawia po kodzie, jeśli ten umarł w międzyczasie: wygasł
     * między sprawdzeniem a użyciem, albo został zużyty w drugiej karcie. Wtedy trzy pastylki
     * nie mają na czym stać: „wyślij ponownie" czyta adres i cel z `gateState`, którego już
     * nie ma. Adres i cel są w `flow`, więc bramka odtwarza się z niego — bez pola, bo o tym,
     * czy pole ma wrócić, decyduje rodzaj odmowy w `gateRefused`.
     *
     * @param {string} code kod odmowy w słowniku bramki
     * @returns {boolean} czy bramka jest w stanie unieść tę odmowę
     */
    function gateStandBack(code) {
      if (gateState) return true;
      /* Niepoprawny adres nie potrzebuje bramki: `gateRefused` wraca z nim do pytania o adres
         i weryfikacja zaczyna się od nowa dla adresu, który dopiero powstanie. */
      if (code === 'VERIFY_BAD_EMAIL') return true;
      if (!flow?.email || !flow?.purpose) return false;
      gateState = {
        email: flow.email,
        purpose: flow.purpose,
        entryId: gateHooks?.entryId || null,
        field: null
      };
      return true;
    }

    /**
     * Wysyła kod i prosi o niego w rozmowie.
     *
     * @param {string} email adres podany przez gościa
     * @param {'sponsor'|'unsubscribe'|'edit-entry'|'cancel-entry'} purpose cel kodu; kod
     *   wystawiony na jedną sprawę nie działa na inną
     * @param {{ onConfirmed?: (code: string) => (void | Promise<void>),
     *   onChangeEmail?: () => (void | Promise<void>), entryId?: string }} [hooks]
     *   zapamiętywane na czas bramki; wywołanie z pastylki „wyślij ponownie" ich nie podaje
     *   i korzysta z zapamiętanych
     */
    async function gateStart(email, purpose, hooks = null) {
      // Bramka jest krokiem kreatora, nie osobnym okienkiem: bez kreatora nie ma czego bramkować.
      if (!flow) return;
      const address = String(email || '').trim().toLowerCase();
      if (hooks) gateHooks = { ...hooks };

      /* Adres już potwierdzony w tej samej sprawie nie jest weryfikowany drugi raz (2.6).
         Drugi kod na ten sam adres zjadałby sufit wysyłki i kazałby przepisywać cyfry po to,
         żeby udowodnić rzecz udowodnioną minutę wcześniej. */
      if (flow.confirmed && flow.email === address && flow.purpose === purpose && flow.code) {
        const known = gateHooks?.onConfirmed || null;
        if (known) await known(flow.code);
        return;
      }

      gateDropField();
      gateState = {
        email: address,
        purpose,
        entryId: gateHooks?.entryId || null,
        field: null
      };
      flow.purpose = purpose;
      flow.email = address;
      flow.confirmed = false;
      flow.code = '';
      flow.step = 'gate';

      try {
        const result = await gatePost('verify-start', {
          email: address,
          purpose,
          ...(gateState.entryId ? { entryId: gateState.entryId } : {})
        });
        if (!result?.ok) throw Object.assign(new Error('verify-start'), { payload: result });
        /* Kreator mógł się w tym czasie skończyć — „rezygnuję" jest naciskane także w trakcie
           żądania. Wtedy nie ma czego rysować i nie ma gdzie tego wpisać. */
        if (!gateState || !flow) return;
        /* „Kod poszedł" mówione niezależnie od tego, czy adres jest gdziekolwiek znany: Worker
           odpowiada tak samo w obu przypadkach (O6). Inaczej rozmowa odpowiadałaby na pytanie
           „czy ten człowiek jest u Was zapisany". */
        /* Czekamy na zdanie o wysłanym kodzie, dopiero potem stawiamy pole: inaczej pole
           stanęłoby nad komunikatem, który o nim mówi, i palec trafiałby w nie, zanim gość
           przeczyta, na jaki adres poszedł kod. */
        await gateSystem('chat.gateCodeSent', { '%EMAIL%': result.email || gateMask(address) });
        if (!gateState || !flow) return;
        gateState.field = codeField((code) => gateCheck(code));
        gateChoices();
      } catch (problem) {
        gateRefused(problem);
      }
    }

    /**
     * Sprawdza wpisane sześć cyfr.
     *
     * Przy powodzeniu adres jest potwierdzony i sprawa idzie dalej. Kod zostaje w pamięci, bo
     * końcowe żądanie musi go nieść razem z adresem — `verify-code` go nie zużyło i nie miało
     * prawa: zużycie należy do żądania, które wykonuje czynność.
     *
     * @param {string} code cyfry z pola na kod albo z kompozytora
     * @returns {Promise<boolean>} czy adres został potwierdzony
     */
    async function gateCheck(code) {
      if (!gateState || !flow) return false;
      const digits = String(code || '').replace(/\D/g, '');
      if (digits.length !== 6) return false;

      try {
        const result = await gatePost('verify-code', {
          email: gateState.email,
          purpose: gateState.purpose,
          code: digits,
          ...(gateState.entryId ? { entryId: gateState.entryId } : {})
        });
        if (!result?.ok) throw Object.assign(new Error('verify-code'), { payload: result });
        if (!gateState || !flow) return false;

        flow.confirmed = true;
        flow.code = digits;
        const after = gateHooks?.onConfirmed || null;
        /* Pole zdjęte PRZED zdaniem o potwierdzeniu, żeby „adres potwierdzony" nie stało pod
           polem, które właśnie przestało być potrzebne. Zaczepy zostają: sprawa idzie dalej. */
        gateDropField();
        gateState = null;
        gateSystem('chat.gateConfirmed');
        /* Pastylki bramki schodzą razem z nią. Kolejny krok sprawy ustawi swoje. */
        flowChoices([]);
        if (after) await after(digits);
        return true;
      } catch (problem) {
        gateRefused(problem);
        return false;
      }
    }

    /**
     * Wiadomość napisana w kompozytorze, gdy bramka czeka na kod (2.13).
     *
     * Sześć samych cyfr idzie do bramki BEZ bąbelka gościa. Kod wpisany w pole wiadomości
     * z przyzwyczajenia poleciałby jako wypowiedź do wątku i wylądował w historii, którą
     * organizator czyta w panelu — a sześciocyfrowy kod do cudzej skrzynki nie ma tam czego
     * robić. Cokolwiek innego dostaje bąbelek i wskazanie, gdzie ten kod wpisać: to nadal
     * odpowiedź bramce, a nie nowe pytanie do automatu, więc do modelu nie jedzie nic.
     */
    async function gateTyped(message) {
      const said = String(message || '');
      const digits = said.replace(/\D/g, '');
      // Same cyfry, ewentualnie z odstępami albo łącznikami — tak wygląda kod przepisany ręcznie.
      const bareDigits = digits.length > 0 && !/[^\d\s-]/.test(said);
      if (input) input.value = '';
      sizeInput();

      if (bareDigits && digits.length === 6 && gateState?.field) {
        await gateCheck(digits);
        return true;
      }

      append({ author: 'visitor', body: said, at: '' }, false);
      /* Bez pola nie ma czego wpisywać: po wygasłym albo spalonym kodzie jedyną drogą dalej
         są trzy pastylki, więc zdanie mówi o nich, a nie o sześciu cyfrach. */
      gateSystem(gateState?.field ? 'chat.dataBadCode' : 'chat.dataUseButtons');
      gateState?.field?.focus();
      return true;
    }

    /**
     * Wypisanie z powiadomień — jedyna z czterech spraw, która NIE ma własnego formularza.
     *
     * Zmiana danych i wycofanie ze wyścigu mają go od dawna: `openEntryManager` prowadzi przez
     * wybór zawodnika, kod ze skrzynki i wszystkie kilkanaście pól z walidacją. Przepisywanie
     * tego na wymianę zdań w czacie dałoby czternaście pytań i czternaście okazji do pomyłki w
     * danych, które trafiają potem na podpisany formularz — więc kreator te dwie sprawy do
     * niego ODDAJE, zamiast budować drugą, uboższą drogę o innych regułach.
     *
     * „Nie chcę powiadomień" zostaje tutaj, bo to jedno pytanie i jedna czynność, a jedyną
     * dotychczasową drogą był odsyłacz w stopce listu — czyli trzeba było mieć ten list.
     *
     * PYTANIE O ADRES, POTEM BRAMKA — ŻADNEJ WŁASNEJ OBSŁUGI KODU
     * ---------------------------------------------------------------------------
     * Dotąd ta sprawa miała własne dwa kroki: `notify-code` po adresie i krok `code`, który
     * czytał sześć cyfr z kompozytora. Robiła więc to samo, co bramka, tylko inaczej — bez
     * pola z klawiaturą numeryczną, bez wiersza systemowego, bez „wyślij ponownie" i „zmień
     * adres", i z kodem wpisywanym jako wypowiedź, która lądowała w wątku czytanym potem przez
     * organizatora. Teraz adres oddaje bramce (`verify-start` / `verify-code`) i nic o kodzie
     * nie wie (3.1).
     */
    function notifyAskEmail() {
      if (!flow) return;
      flow.step = 'email';
      flowSay('chat.dataAskEmail');
      flowChoices([['chat.dataCancel', async () => { flowSay('chat.dataStopped'); endFlow(); }]]);
    }

    /**
     * Wypisanie po potwierdzeniu adresu — jedyne żądanie, które cokolwiek zmienia.
     *
     * `code` jedzie razem z adresem, bo TO żądanie autoryzuje czynność i TO ono zużywa wiersz:
     * `verify-code` kodu nie zużyło i nie miało prawa (O5). Bramka nie jest poświadczeniem,
     * więc `flow.confirmed` podrobione w konsoli nie wypisuje nikogo — bez pary (adres, kod)
     * Worker odmawia tak samo jak przed zmianą.
     *
     * Idzie przez `gatePost`, czyli na `/api/carruleddhi/notify-off`, a nie na adres czatu
     * z rodzajem w ciele. Router Workera bierze rodzaj ZE ŚCIEŻKI (patrz komentarz przy
     * `gateUrl`), więc dotychczasowe `notify-off` wysłane na `/chat` trafiało do `chatVisitor`:
     * wypisanie zamieniało się w wiadomość w wątku i nikogo nie wypisywało.
     */
    async function notifyOff(code) {
      const result = await gatePost('notify-off', { email: flow.email, code });
      if (!result?.ok) throw Object.assign(new Error('notify-off'), { payload: result });
      flowSay('chat.dataNotifyOff');
      endFlow();
    }

    /* ========================================================================
       ZMIANA DANYCH I WYCOFANIE — BRAMKA W ROZMOWIE, FORMULARZ DO RESZTY
       ========================================================================
       Te dwie sprawy zostają przy formularzu zarządzania zgłoszeniem i to się nie zmienia:
       kilkanaście pól z walidacją, czytnik regulaminu i podsumowanie z numerem startowym nie
       mają drugiej, uboższej wersji na wymianę zdań w czacie. Zmienia się jedno — KTO PYTA
       O KOD. Dotąd czat prowadził do formularza z samym adresem, a formularz zaczynał swoją
       weryfikację od początku: własny list, własne pole, własne komunikaty. Ktoś, kto poprosił
       o zmianę w rozmowie, przepisywał sześć cyfr w miejscu, o którym nie wiedział, że jest
       osobną drogą.

       Teraz kod bierze bramka rozmowy i oddaje go formularzowi razem z adresem (3.3). Formularz
       nie jest przepisany: dostaje potwierdzenie i pomija JEDEN swój krok — ten, który właśnie
       się odbył.

       DLACZEGO NAJPIERW `entry-lookup`, A DOPIERO POTEM BRAMKA
       ---------------------------------------------------------------------------
       Kod na zmianę danych nosi `entry_id` i musi go nosić: `entryManage` sprawdza go pod
       konkretnym zawodnikiem, a na jednym adresie bywa ich kilku — tak zapisuje się rodzina
       z trójką dzieci. Bramka bez wiązania dostałaby od Workera „najnowsze zgłoszenie na tym
       adresie", czyli kod otwierający kogoś, o kogo nikt nie pytał.

       Dlatego rozmowa pyta o listę tą samą końcówką, którą wola formularz, i rozstrzyga
       PRZED wysłaniem listu:

         jedno zgłoszenie   bramka wie, czego dotyczy kod → weryfikacja w rozmowie,
         kilku zawodników   nie ma czego wiązać → formularz, jego lista zawodników i jego kod,
                            czyli dokładnie to, co było przed tą zmianą,
         zero zgłoszeń      nie ma czego bramkować; formularz otwiera się z wpisanym adresem.

       Wybór zawodnika NIE wraca do czatu. Panel ma go od dawna, z inicjałami i numerami
       startowymi, i przepisywanie tego na pastylki dałoby drugą listę tych samych ludzi
       o innych regułach. Cena jest jedna: przy kilku zawodnikach kod wpisuje się w formularzu.
       Za to nigdy nie idzie list o kimś, kogo gość nie wskazał.
       ======================================================================== */

    /**
     * Adres z rozmowy → lista zgłoszeń → bramka albo od razu formularz.
     *
     * @param {string} email adres z karty czatu albo z „zmień adres"
     */
    /**
     * Wydruk formularza: pokazanie biezacego stanu i dwie pastylki.
     *
     * Stan czytany PRZED pytaniem, a nie zakladany: „czy chcesz, zebysmy wydrukowali" zadane
     * komus, kto juz o to poprosil, brzmi jak zgubiona odpowiedz. Dlatego najpierw `view`,
     * potem zdanie o tym, jak jest teraz, a dopiero potem wybor.
     *
     * Kod zostaje w pamieci kreatora i NIE jest zuzywany po stronie serwera — patrz czynnosc
     * `print` w Workerze. Ktos, kto pomylil pastylke, naciska druga, a nie zaczyna od nowa
     * od listu z kodem.
     */
    async function printDecide(email, entryId, code) {
      const seen = await gatePost('entry-manage', { action: 'view', email, code, id: entryId });
      const wants = Boolean(seen?.entry?.wantsPrint);
      flowSay(wants ? 'chat.printNowYes' : 'chat.printNowNo');

      const set = async (value) => {
        const saved = await gatePost('entry-manage', {
          action: 'print', email, code, id: entryId, wantsPrint: value
        });
        if (!saved?.ok) throw Object.assign(new Error('print'), { payload: saved });
        flowSay(value ? 'chat.printSetYes' : 'chat.printSetNo');
        endFlow();
      };

      /* Kolejnosc odwrotna do biezacego stanu: pierwsza pastylka jest zawsze ta, ktora COS
         zmienia. Ustawienie tego, co juz jest, nie jest bledem, ale nie jest tez powodem,
         dla ktorego ktos zaczal te rozmowe. */
      flowChoices(wants
        ? [
          ['chat.printChooseNo', () => flowGuard(() => set(false))],
          ['chat.printKeep', async () => { flowSay('chat.printKept'); endFlow(); }]
        ]
        : [
          ['chat.printChooseYes', () => flowGuard(() => set(true))],
          ['chat.printKeep', async () => { flowSay('chat.printKept'); endFlow(); }]
        ]);
    }

    async function entryHandover(email) {
      if (!flow) return;
      const intent = flow.intent;
      const purpose = intent === 'withdraw' ? 'cancel-entry' : 'edit-entry';
      flow.step = 'lookup';
      flow.email = email;

      /* Ta sama końcówka i ta sama odpowiedź, którą czyta panel: inicjały, numer startowy,
         `withdrawn` i `minor`. Adres w rozmowie nie jest tu uwierzytelnieniem i nic nie
         otwiera — służy do policzenia zgłoszeń, tak samo jak w formularzu, do którego ten
         adres wpisuje każdy, kto go zna. */
      const found = await gatePost('entry-lookup', { email });
      const entries = Array.isArray(found?.entries) ? found.entries : [];

      /* `only.id` w warunku, nie tylko liczba: bez identyfikatora nie ma czym wiązać kodu,
         a kod bez wiązania nie otworzy w panelu niczego — poszedłby list, po którym formularz
         i tak poprosiłby o drugi. Wtedy lepiej od razu jego drogą. */
      if (entries.length === 1 && entries[0].id) {
        const only = entries[0];

        /* DZISIEJSZA ODMOWA PANELU, POWIEDZIANA O JEDEN LIST WCZEŚNIEJ (3.4)
           ------------------------------------------------------------------------
           Zgłoszenie osoby niepełnoletniej zmienia się przez organizatorów, bo za nim stoi
           podpisana zgoda opiekuna — panel ukrywa oba przyciski i mówi to samo zdanie, tym
           samym kluczem. Wycofane zgłoszenie nie ma czego wycofywać ani poprawiać.

           Powiedziane tutaj, przed bramką, żeby nie wysyłać kodu na czynność, której i tak
           odmówimy: gość przepisywałby sześć cyfr po to, by przeczytać „napisz do
           organizatorów", a jeden z trzech listów na kwadrans byłby zużyty na nic. */
        if (only.minor || only.withdrawn) {
          flowSay(only.minor ? 'entry.minorHelp' : 'entry.alreadyOut');
          endFlow();
          return;
        }

        /* Kod wiązany z TYM zawodnikiem. `flowGuard` wokół zaczepu, bo błąd rzucony z niego
           wpadłby w obsługę odmów bramki i pokazał jej trzy pastylki po tym, jak bramka już
           zeszła — ta sama ostrożność, co przy sponsorze i przy wypisaniu. */
        await gateStart(email, purpose, {
          entryId: only.id,
          /* Wydruk zostaje W ROZMOWIE, a nie idzie do formularza.
             ---------------------------------------------------------------------------
             `edit` i `withdraw` oddaja sprawe formularzowi, bo tam sie widzi i poprawia
             wszystkie pola naraz. Tu jest jedno pytanie o tak/nie — otwieranie dla niego
             calego formularza znaczyloby przewijanie strony do miejsca, w ktorym stoi jeden
             znacznik, po tym jak sie juz przepisalo szesc cyfr z maila. */
          onConfirmed: (code) => flowGuard(() => (intent === 'print'
            ? printDecide(email, only.id, code)
            : entryOpenForm(email, intent, { code, entryId: only.id }))),
          /* „Zmień adres" wraca do pytania o adres — to samo zdanie i ta sama pastylka co przy
             powiadomieniach, a krok `email` rozgałęzia się po `flow.intent`. */
          onChangeEmail: () => notifyAskEmail()
        });
        return;
      }

      await entryOpenForm(email, intent, null);
    }

    /**
     * Oddanie sprawy formularzowi i koniec kreatora.
     *
     * Kreator kończy się TUTAJ, a nie po czynności: dalej prowadzi panel, ma własne komunikaty
     * i własne kroki, a rozmowa, która nadal przechwytywałaby wiadomości, brałaby pytanie
     * zadane w międzyczasie za odpowiedź krokowi, którego już nie ma.
     *
     * `endFlow` zabiera ze sobą kod z pamięci kreatora — panel ma już swoją kopię, wpisaną
     * w pole, którego i tak potrzebuje do końcowego żądania.
     */
    async function entryOpenForm(email, intent, confirmed) {
      if (typeof openEntryManager !== 'function') {
        flowSay('chat.dataNeedGate');
        endFlow();
        return;
      }
      await openEntryManager(email, intent, null, confirmed);
      endFlow();
    }

    /**
     * KOŃCOWE ŻĄDANIA MÓWIĄ WŁASNYM SŁOWNIKIEM ODMÓW — TU JEST PRZEKŁAD NA SŁOWNIK BRAMKI
     * ---------------------------------------------------------------------------
     * `notify-off`, `sponsor-lead` i zarządzanie zgłoszeniem odpowiadają kodami ze swoich
     * rodzin (`NOTIFY_*`, `SPONSOR_*`, `ENTRY_*`), bo są starsze od bramki i mają własnych
     * klientów poza rozmową. Bramka ma jeden zestaw zdań na stany kodu i to on ma tu zostać:
     * druga tablica z tymi samymi znaczeniami rozjechałaby się z `GATE_REFUSALS` przy pierwszej
     * zmianie tekstu. Dlatego tu jest wyłącznie przekład kodu na kod, a zdanie i pastylki
     * dobiera `gateRefused`.
     *
     * `ENTRY_*` są w tablicy nie dla samego `entryManage`, a dla `sponsor-lead`: przy odmowie
     * kodu oddaje `SPONSOR_BAD_CODE` z dokładniejszym powodem w `reason`, i to `reason` mówi,
     * czy kod wygasł, czy próby się wyczerpały.
     */
    const FLOW_CODE_REFUSALS = {
      NOTIFY_CODE_WRONG: 'VERIFY_WRONG',
      NOTIFY_CODE_EXPIRED: 'VERIFY_EXPIRED',
      NOTIFY_NO_CODE: 'VERIFY_NO_CODE',
      NOTIFY_TOO_MANY_TRIES: 'VERIFY_TOO_MANY_TRIES',
      NOTIFY_CODE_TOO_OFTEN: 'VERIFY_TOO_OFTEN',
      NOTIFY_BAD_EMAIL: 'VERIFY_BAD_EMAIL',
      NOTIFY_BAD_CODE: 'VERIFY_BAD_CODE',
      SPONSOR_BAD_EMAIL: 'VERIFY_BAD_EMAIL',
      SPONSOR_BAD_CODE: 'VERIFY_BAD_CODE',
      ENTRY_CODE_WRONG: 'VERIFY_WRONG',
      ENTRY_CODE_EXPIRED: 'VERIFY_EXPIRED',
      ENTRY_NO_CODE: 'VERIFY_NO_CODE',
      ENTRY_TOO_MANY_TRIES: 'VERIFY_TOO_MANY_TRIES',
      ENTRY_CODE_TOO_OFTEN: 'VERIFY_TOO_OFTEN',
      ENTRY_BAD_EMAIL: 'VERIFY_BAD_EMAIL',
      ENTRY_BAD_CODE: 'VERIFY_BAD_CODE'
    };

    /**
     * Jedno miejsce na błędy kreatora: każdy krok mówi to samo zdanie i nie gubi rozmowy.
     *
     * `flowGuard` obejmuje CZYNNOŚĆ, czyli żądanie stojące za bramką — wypisanie, zgłoszenie
     * sponsora, oddanie sprawy formularzowi. Bramka zeszła chwilę wcześniej, więc odmowa
     * dotycząca kodu znaczy tu jedno: kod umarł między sprawdzeniem a użyciem. Wygasł na
     * granicy kwadransa albo został zużyty w drugiej karcie.
     *
     * Z każdego takiego stanu jest sensowne wyjście, więc kreator ZOSTAJE OTWARTY przy każdej
     * odmowie kodu, nie tylko przy błędnym (2.7, 2.11, 2.12). Dotąd kończył się na wszystkim
     * poza `NOTIFY_CODE_WRONG` — czyli wygaśnięcie kodu tuż przed wysłaniem odsyłało gościa na
     * początek sprawy, którą przeszedł w całości, i drugi raz zapytałoby go o wszystko.
     *
     * Odmowa NIE dotycząca kodu kończy kreator jak dotąd: pusty zapis, brak zgody w żądaniu,
     * nieudany zapis w bazie to rzeczy, na które gość nie ma w rozmowie żadnego ruchu.
     */
    async function flowGuard(step) {
      try {
        await step();
      } catch (problem) {
        const payload = problem?.payload || null;
        const said = payload?.code || problem?.message || '';
        /* `reason` przed `code`, bo jest dokładniejszy tam, gdzie występuje: `SPONSOR_BAD_CODE`
           samo w sobie nie mówi, czy kod wygasł, czy zgadywano go pięć razy. */
        const code = FLOW_CODE_REFUSALS[payload?.reason]
          || FLOW_CODE_REFUSALS[said]
          || (GATE_REFUSALS[said] ? said : '');

        if (code && flow && gateStandBack(code)) {
          gateRefused({ payload: { code, left: payload?.left } });
          return;
        }

        flowSay('chat.dataFailed');
        endFlow();
      }
    }

    /**
     * Otwiera właściwą drogę po znaczniku z serwera.
     *
     * Wszystkie cztery zaczynają się w rozmowie i wszystkie przechodzą przez tę samą bramkę.
     * Dwie — zmiana danych i wycofanie — kończą się w formularzu zarządzania zgłoszeniem, temu
     * samemu, który otwierają podpowiedzi „zmień dane" i „wycofaj mnie", i dostają go
     * z potwierdzeniem w ręku (`entryHandover`). Zgłoszenie sponsora i wypisanie z powiadomień
     * zostają w rozmowie do końca.
     */
    /**
     * Sponsoring: oferta, dwie pastylki, potem trzy pytania.
     *
     * Oferta jest wypisana wprost — cena i to, co się za nią dostaje — bo „napisz do nas w
     * sprawie sponsoringu" jest zaproszeniem do zadania pytania, a nie odpowiedzią na nie.
     *
     * „Rezygnuję" jest równie widoczne jak „chcę". Pastylka wyłącznie zgadzająca się jest
     * pytaniem, na które da się odpowiedzieć tylko tak — a wtedy jedynym wyjściem jest
     * zamknięcie czatu i nikt nie wie, że ktoś się rozmyślił.
     */
    function sponsorOffer() {
      flow = newFlow('sponsor', 'sponsor', {
        step: 'decide',
        cartName: '',
        firstName: '',
        lastName: '',
        phone: '',
        /* Dwa pola opcjonalne. Puste znaczy „pominięte" i takie NIE JADĄ w żądaniu — patrz
           `sponsorSubmit`. Zdjęcie jest data URL-em po zmniejszeniu w przeglądarce, nie plikiem:
           w tej postaci przyjmuje je Worker i w tej postaci da się je pokazać w podsumowaniu. */
        logo: '',
        siteUrl: '',
        /* Ustawione na `'summary'`, gdy gość poprawia JEDNO pole z menu poprawek. Wtedy krok po
           odpowiedzi nie idzie dalej w kolejce pytań, a wraca do podsumowania — i to jest cały
           mechanizm „nie, popraw" bez gubienia pozostałych odpowiedzi. */
        after: ''
      });
      flowSay('chat.sponsorOffer');
      flowChoices([
        ['chat.sponsorYes', async () => sponsorAskName()],
        ['chat.sponsorNoThanks', async () => { flowSay('chat.sponsorNo'); endFlow(); }]
      ]);
    }

    /**
     * ODSYŁACZE DO PRYWATNOŚCI I REGULAMINU — NOWA KARTA, NIE NAWIGACJA
     * ---------------------------------------------------------------------------
     * Kreator żyje w pamięci karty i nie ma go w `localStorage`, więc wyjście z tej strony
     * kosztowałoby wszystkie dotychczasowe odpowiedzi. `target="_blank"` otwiera dokument
     * obok, a rozmowa zostaje tam, gdzie stoi — to jest cała treść wymagania „bez utraty
     * stanu kreatora" (4.2).
     *
     * `?lang=` w języku strony: `regolamento.html` czyta ten parametr (`legal-doc.js`) i
     * pokazuje dokument w tym języku, a taki sam kształt odsyłacza mają linki w mailach.
     * `rel="noopener noreferrer"` bo `target="_blank"` bez niego oddaje nowej karcie uchwyt
     * do tej.
     */
    function consentDocs() {
      if (!log) return null;
      /* Malowane BEZ własnego zadania kolejki, bo woła je `sayLater` razem z pytaniem o zgodę
         — dwa zadania znaczyłyby dwie porcje kropek na jedno pytanie i odsyłacze pokazane
         o 280 ms po zdaniu, które o nich mówi. */
      const row = document.createElement('p');
      row.className = 'chat__docs';
      row.dataset.chatDocs = '';
      const links = [
        ['chat.sponsorConsentPrivacy', `privacy.html?lang=${state.lang}`],
        ['chat.sponsorConsentRules', `regolamento.html?lang=${state.lang}`]
      ];
      links.forEach(([key, href], index) => {
        if (index) row.append(document.createTextNode(' · '));
        const link = document.createElement('a');
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = text(key) || href;
        row.append(link);
      });
      addRow(row);
      return row;
    }

    /**
     * ZGODA MIĘDZY NAZWĄ A PYTANIAMI O KONTAKT
     * ---------------------------------------------------------------------------
     * Stoi dokładnie tam, gdzie zaczyna się zbieranie danych osobowych, i ani o krok wcześniej:
     * nazwa na carruleddhi nie jest danymi osobowymi, więc przed nią nie ma na co się zgadzać,
     * a po niej idą już imię, telefon i adres (4.1, 4.3).
     *
     * Dwie pastylki, obie równie widoczne. „Rezygnuję" kończy kreator zdaniem, że rozumiemy,
     * i NIE WYSYŁA niczego — `sponsor-lead` leci dopiero po bramce, więc odmowa zgody zostawia
     * po sobie tylko wiersze w wątku (4.5).
     *
     * Zgoda z pastylki jest zapamiętana w `flow.consent` i pojedzie z żądaniem, ale nie jest
     * dowodem: Worker sprawdza ją po swojej stronie i bez `consent === true` odmawia.
     */
    function sponsorConsent() {
      if (!flow) return;
      flow.step = 'consent';
      flow.consent = false;
      /* Pytanie i oba odsyłacze w JEDNYM zadaniu kolejki: zgoda bez dokumentów pod ręką nie
         jest zgodą, więc te trzy wiersze mają wejść razem, po jednej porcji kropek. */
      sayLater(() => {
        sayNow('chat.sponsorConsentAsk');
        /* ODSYŁACZE TYLKO WTEDY, GDY NIE MA OKNA Z DOKUMENTEM.
           ---------------------------------------------------------------------------
           Stały tu zawsze: dwa fioletowe odsyłacze pod pytaniem o zgodę, a obok pastylka,
           która otwiera ten sam dokument w oknie. Dwie drogi do jednej rzeczy, z czego
           jedna wyprowadza z rozmowy do nowej karty w połowie kreatora — i to ta, która
           wygląda na główną, bo jest napisana kolorem.

           Zdjęte na prośbę, ale nie bezwarunkowo: gdy okna nie ma (starsza przeglądarka,
           nieudane wczytanie dokumentu), pastylka nie ma czego pokazać i odsyłacze zostają
           jedyną drogą do treści, na którą ktoś ma się zgodzić. Zgoda bez możliwości
           przeczytania nie jest zgodą, więc w tym jednym wypadku wracają. */
        if (typeof openConsentDocuments !== 'function') consentDocs();
      });
      /* ZGODA PO PRZECZYTANIU, NIE PO KLIKNIĘCIU.
         ---------------------------------------------------------------------------
         Były tu dwa odsyłacze otwierane w nowej karcie i pastylka „Zgadzam się”, która nie
         wiedziała, czy którykolwiek z nich został otwarty. Zgoda padała więc za jednym
         naciśnięciem obok dokumentów — formalnie zebrana, faktycznie niczyja.

         Teraz otwiera się to samo okno, którego używa formularz zapisu i okno przypomnień:
         dokument w języku gościa (z `assets/legal/regolamento.json`, nie włoska strona dla
         wszystkich), a przycisk „akceptuję” odblokowuje się dopiero, gdy tekst zostanie
         przewinięty do końca. Jedno okno w całym serwisie, więc zgoda znaczy tu dokładnie to
         samo, co przy zapisie.

         Po przyjęciu zgoda wraca do rozmowy zdaniem gościa — „przeczytałem i akceptuję” —
         żeby w zapisie zostało WIDAĆ, na co się zgodził, a nie tylko że kreator poszedł dalej.

         Bez okna (starsza przeglądarka, błąd wczytywania) kreator nie kończy się ślepą uliczką:
         odsyłacze pod pytaniem nadal prowadzą do obu dokumentów, a zgoda pada z pastylki, jak
         wcześniej. Lepiej zgoda słabsza niż kreator, którego nie da się dokończyć. */
      const consentGiven = () => {
        if (!flow) return;
        append({ author: 'visitor', body: text('chat.sponsorConsentDone'), at: '' }, false);
        flow.consent = true;
        sponsorAskPerson();
      };
      flowChoices([
        ['chat.sponsorConsentRead', async () => {
          if (!flow) return;
          if (typeof openConsentDocuments === 'function') openConsentDocuments(consentGiven);
          else consentGiven();
        }, typeof openConsentDocuments === 'function'],
        ['chat.sponsorConsentNo', async () => { flowSay('chat.sponsorConsentNoted'); endFlow(); }]
      ]);
    }

    /** „Rezygnuję" wygląda tak samo w każdym kroku sponsora — jeden opis, nie sześć kopii. */
    const sponsorQuit = () => ['chat.dataCancel', async () => { flowSay('chat.sponsorNo'); endFlow(); }];

    /**
     * Dokąd po zamkniętym kroku: dalej w kolejce pytań albo z powrotem do podsumowania.
     *
     * TO JEST CAŁE „NIE, POPRAW" BEZ GUBIENIA ODPOWIEDZI
     * ---------------------------------------------------------------------------
     * Menu poprawek ustawia `flow.after = 'summary'` i zadaje JEDNO pytanie. Odpowiedź na nie
     * nadpisuje jedno pole w `flow` i wraca do podsumowania — pozostałe pola nikt nie rusza,
     * bo nikt ich nie pyta. Wariant „wracamy na początek kreatora" znaczyłby przepisywanie
     * pięciu poprawnych odpowiedzi po to, żeby zmienić literówkę w szóstej.
     */
    const sponsorNext = (step) => {
      if (!flow) return;
      if (flow.after === 'summary') {
        flow.after = '';
        sponsorSummary();
        return;
      }
      step();
    };

    /**
     * Nazwa na carruleddhi — pierwsze pytanie po przyjęciu oferty.
     *
     * Osobna funkcja, bo wchodzi się tu z dwóch stron: z oferty i z menu poprawek. Za drugim
     * razem `flow.after` odsyła odpowiedź prosto do podsumowania, bez ponownej zgody — ta padła
     * raz i jest w `flow.consent`.
     */
    function sponsorAskName() {
      if (!flow) return;
      flow.step = 'name';
      flowSay('chat.sponsorAskName');
      flowChoices([sponsorQuit()]);
    }

    /**
     * Imię i nazwisko — pierwsze pytanie po zgodzie (5.1).
     *
     * Osobny krok, a nie doklejenie do nazwy carruleddhi: nazwa na wózku to nazwa firmy, a to
     * jest człowiek, do którego się dzwoni. Zgłoszenie bez nazwiska jest zgłoszeniem, na które
     * nie da się odpowiedzieć inaczej niż „dzień dobry".
     *
     * CYFRA JEST BŁĘDEM OD PIERWSZEGO ZNAKU, NIE PO WYSŁANIU
     *   Ostrzeżenie nad kompozytorem (`watchPersonDigits`) staje w chwili, w której cyfra
     *   wchodzi do pola, i schodzi, gdy zniknie. Wysłanie takiej odpowiedzi jest dodatkowo
     *   odrzucane w `sponsorStep` — bo ostrzeżenie da się zignorować, a „Jan1" na podpisanym
     *   formularzu nie da się odkręcić po wydruku.
     */
    function sponsorAskPerson() {
      if (!flow) return;
      flow.step = 'person';
      flowSay('chat.sponsorAskPerson');
      flowChoices([sponsorQuit()]);
      watchPersonDigits();
    }

    /**
     * Telefon — opcjonalny, z pastylką „pomiń" obok pytania (5.3).
     *
     * Pominięcie jest NACIŚNIĘCIEM, nie słowem do napisania. Dotąd pytanie kończyło się
     * zdaniem „jeśli wolisz, napisz «pomiń»" — czyli trzeba było trafić w to słowo w swoim
     * języku, a wszystko inne bez sześciu cyfr było po cichu brane za pominięcie. Widoczna
     * pastylka mówi to samo bez zgadywania i bez cichej straty numeru z literówką.
     */
    function sponsorAskPhone() {
      if (!flow) return;
      flow.step = 'phone';
      flowSay('chat.sponsorAskPhone');
      flowChoices([
        ['chat.sponsorPhoneSkip', async () => {
          if (!flow) return;
          flow.phone = '';
          sponsorNext(sponsorAskLogo);
        }],
        sponsorQuit()
      ]);
    }

    /**
     * ZDJĘCIE ALBO LOGO — KROK OPCJONALNY, POMIJANY JEDNYM NACIŚNIĘCIEM
     * ---------------------------------------------------------------------------
     * DLACZEGO PRZYCISK, A NIE „WYŚLIJ ZDJĘCIE SPINACZEM"
     *   Spinacz w kompozytorze stoi za flagą `features.chatPhotos` i jest dziś wyłączony (powód
     *   przy samej fladze: brak modelu wizyjnego). Ten krok nie jest rozmową ze modelem — to
     *   pole formularza zadane zdaniem, więc ma własny, jawny przycisk i własne ukryte pole
     *   pliku. Dzięki temu logo sponsora działa niezależnie od tego, czy automat kiedykolwiek
     *   będzie umiał patrzeć na zdjęcia.
     *
     * ZMNIEJSZANIE: JEDNA DROGA, TA SAMA CO PRZY SPINACZU
     *   Woła `shrinkPhoto` z tego samego zasięgu (1400 px po dłuższej krawędzi, JPEG 0.8).
     *   Druga funkcja skalująca znaczyłaby dwa różne limity dla dwóch dróg tego samego obrazu
     *   i dwa różne miejsca, w których trafia się na sufit rozmiaru ciała żądania.
     */
    function sponsorAskLogo() {
      if (!flow) return;
      flow.step = 'logo';
      flowSay('chat.sponsorAskLogo');
      flowChoices([
        ['chat.sponsorLogoPick', async () => { logoField.click(); }],
        ['chat.sponsorLogoSkip', async () => {
          if (!flow) return;
          flow.logo = '';
          sponsorNext(sponsorAskLink);
        }],
        sponsorQuit()
      ]);
    }

    /**
     * ODSYŁACZ DO STRONY ALBO PROFILU — TEŻ OPCJONALNY, TYLKO `https://`
     * ---------------------------------------------------------------------------
     * NIC NIE JEST NAPRAWIANE ZA CZŁOWIEKA
     *   Doklejenie `https://` do „trattoria.it" wyglądałoby na uprzejmość, a znaczyłoby, że
     *   strona zgaduje adres, który potem stanie się odsyłaczem na publicznej stronie. Zgadnięty
     *   adres bywa cudzą domeną. Dlatego zdanie o błędzie MÓWI, czego brakuje, i podaje przykład
     *   — a poprawia człowiek, bo tylko on wie, gdzie chciał wskazać.
     *
     * DLACZEGO NIE `http://`
     *   Odsyłacz jedzie na stronę, która chodzi po HTTPS. `http://` z niej to ostrzeżenie
     *   przeglądarki przy każdym naciśnięciu i treść mieszana w raporcie bezpieczeństwa —
     *   za jeden odsyłacz sponsora, którego nikt nie sprawdzi ręcznie.
     */
    /* Adres autora tej strony, nie organizatora wyścigu — i to jest cała różnica.
       `config.contact.email` odpowiada na „mam pytanie o zawody". To odpowiada na „chcę
       taką stronę u siebie", czyli na coś, czego organizator nie robi. Czytany z ustawień,
       jeśli kiedyś tam trafi, żeby zmiana adresu nie znaczyła zmiany w tym pliku. */
    const SITE_AUTHOR_EMAIL = String(config.contact?.webmaster || 'shardananuragici@gmail.com');

    /**
     * STRONA CZY SOCIAL — DWA PYTANIA, NIE JEDNO
     * ---------------------------------------------------------------------------
     * Stało tu jedno pytanie „odsyłacz do strony albo profilu?" i puste pole. To są dwie
     * różne odpowiedzi i dwa różne zdania o tym, co wkleić: adres firmy zaczyna się od
     * własnej domeny, a profil od facebook.com albo instagram.com. Jedno zdanie na oba
     * przypadki nie mówi ani jednego, ani drugiego.
     *
     * Trzecia pastylka jest tą, po której jako jedyni coś dajemy zamiast prosić: kto nie ma
     * ani strony, ani profilu, dostaje zaproszenie do kontaktu w sprawie własnej strony.
     * Zgłoszenie sponsora idzie dalej niezależnie od tego — oferta nie jest warunkiem.
     */
    function sponsorAskLink() {
      if (!flow) return;
      flow.step = 'linkKind';
      flowSay('chat.sponsorAskLink');
      flowChoices([
        ['chat.sponsorLinkHasSite', async () => { if (flow) sponsorAskUrl('site'); }],
        ['chat.sponsorLinkHasSocial', async () => { if (flow) sponsorAskUrl('social'); }],
        ['chat.sponsorLinkNone', async () => {
          if (!flow) return;
          flow.siteUrl = '';
          flow.linkKind = 'none';
          sponsorNoSiteOffer();
          sponsorNext(sponsorAskEmail);
        }],
        sponsorQuit()
      ]);
    }

    /** Wklejenie adresu, już wiedząc czego: strony czy profilu. Sprawdza to samo. */
    function sponsorAskUrl(kind) {
      if (!flow) return;
      flow.step = 'link';
      flow.linkKind = kind;
      flowSay(kind === 'social' ? 'chat.sponsorAskSocialUrl' : 'chat.sponsorAskSiteUrl');
      flowChoices([
        ['chat.sponsorLinkSkip', async () => {
          if (!flow) return;
          flow.siteUrl = '';
          sponsorNext(sponsorAskEmail);
        }],
        sponsorQuit()
      ]);
    }

    /**
     * „Nie mam żadnej" — jedyne miejsce w kreatorze, gdzie coś proponujemy.
     *
     * Adres jest odsyłaczem `mailto:`, a nie napisem do przepisania: to jest rozmowa na
     * telefonie, gdzie przepisanie adresu z ekranu do poczty znaczy zwykle, że nikt nie
     * napisze. Malowane razem ze zdaniem, w jednym zadaniu kolejki — tak samo jak
     * `consentDocs`, i z tego samego powodu: dwa zadania to dwie porcje kropek na jedną myśl.
     */
    function sponsorNoSiteOffer() {
      if (!log) return;
      sayLater(() => {
        sayNow('chat.sponsorNoSiteOffer');
        const row = document.createElement('p');
        row.className = 'chat__docs';
        const link = document.createElement('a');
        link.href = `mailto:${SITE_AUTHOR_EMAIL}`;
        link.textContent = SITE_AUTHOR_EMAIL;
        row.append(link);
        addRow(row);
      });
    }

    /**
     * Adres — OBOWIĄZKOWY (5.2) i pytany na końcu, bo prowadzi wprost do podsumowania.
     *
     * Osobna funkcja, bo wchodzi się tu z trzech stron: po odsyłaczu, z menu poprawek oraz
     * z powrotem z bramki, gdy gość naciśnie „zmień adres". Za każdym razem pozostałe odpowiedzi
     * zostają w `flow` i pytanie jest jedno, nie cała rozmowa od początku.
     */
    function sponsorAskEmail() {
      if (!flow) return;
      flow.step = 'email';
      flowSay('chat.sponsorAskEmail');
      flowChoices([sponsorQuit()]);
    }

    /**
     * PODSUMOWANIE ZGŁOSZENIA — WIERSZ NA POLE, W DZIENNIKU
     * ---------------------------------------------------------------------------
     * `<dl>`, a nie akapit z przecinkami: to jest lista par „co — co podano", i czytnik ekranu
     * ma ją przeczytać jako listę, a nie jako zdanie. Zdjęcie pokazywane jako miniatura, bo
     * „dołączone" nie mówi, KTÓRE zdjęcie się dołączyło — a wybiera się je z galerii telefonu,
     * gdzie łatwo trafić w sąsiedni plik.
     *
     * WSZYSTKIE SZEŚĆ WIERSZY, TAKŻE PUSTE
     *   Pominięty telefon, pominięte zdjęcie i pominięty odsyłacz stoją tu ze zdaniem „nie
     *   podano". Wiersz, którego nie ma, nie odpowiada na pytanie „czy pominięcie się zapisało" —
     *   a to jest pytanie, które ma się rozstrzygnąć TUTAJ, przed wysłaniem, nie po nim.
     *
     * `textContent` na każdej wartości. Wszystko to napisał gość, a ten sam dziennik czyta potem
     * organizator w panelu.
     */
    function sponsorSummaryBlock() {
      if (!log || !flow) return null;
      const none = text('chat.sponsorSummaryNone');
      const rows = [
        ['chat.sponsorSummaryName', flow.cartName],
        ['chat.sponsorSummaryPerson', `${flow.firstName} ${flow.lastName}`.trim()],
        ['chat.sponsorSummaryPhone', flow.phone || none],
        ['chat.sponsorSummaryEmail', flow.email],
        ['chat.sponsorSummaryLogo', flow.logo ? text('chat.sponsorSummaryLogoSet') : none],
        ['chat.sponsorSummaryLink', flow.siteUrl || none]
      ];
      const list = document.createElement('dl');
      list.className = 'chat__summary';
      list.dataset.chatSummary = '';
      rows.forEach(([key, value]) => {
        const label = document.createElement('dt');
        label.textContent = text(key) || key;
        const said = document.createElement('dd');
        said.textContent = value || none;
        list.append(label, said);
      });
      if (flow.logo) {
        const shot = document.createElement('dd');
        shot.className = 'chat__summary-shot';
        const picture = document.createElement('img');
        picture.src = flow.logo;
        picture.alt = text('chat.photoAlt');
        shot.append(picture);
        list.append(shot);
      }
      addRow(list);
      return list;
    }

    /**
     * OSTATNI KROK PRZED WYSŁANIEM: CAŁE ZGŁOSZENIE I PYTANIE „POTWIERDZASZ?"
     * ---------------------------------------------------------------------------
     * DLACZEGO PRZED BRAMKĄ, A NIE PO NIEJ
     *   Za „tak, wyślij" idzie kod na skrzynkę, a za kodem samo zgłoszenie. Gdyby podsumowanie
     *   stanęło po bramce, gość dostawałby list z kodem, przepisywał sześć cyfr — i DOPIERO
     *   wtedy dowiadywał się, że ma jeszcze coś potwierdzić. A gdyby chciał wtedy poprawić
     *   literówkę, kod na stary adres byłby już wysłany. Kolejność „potwierdź, potem kod" znaczy
     *   też, że jedna pomyłka w adresie kosztuje jeden list, nie dwa.
     *
     * DWIE PASTYLKI, NIE TRZY
     *   „Rezygnuję" tu nie stoi z rozmysłu. Pytanie brzmi „wysłać to?", a nie „co dalej z
     *   Twoim życiem": trzecie wyjście obok „tak" i „popraw" jest w tym miejscu zaproszeniem do
     *   przypadkowego zamknięcia sprawy, która jest gotowa do wysłania. Wyjście zostaje w każdym
     *   kroku poprawek i w samej bramce.
     */
    function sponsorSummary() {
      if (!flow) return;
      flow.step = 'summary';
      flow.after = '';
      setWarn('');
      /* Zdanie i tabelka w JEDNYM zadaniu kolejki: podsumowanie bez danych pod nim to zdanie
         „sprawdź, czy się zgadza" o niczym. Ta sama decyzja, co przy zgodzie i jej dokumentach. */
      sayLater(() => {
        sayNow('chat.sponsorSummaryLead');
        sponsorSummaryBlock();
      });
      flowChoices([
        ['chat.sponsorSummaryYes', async () => {
          if (!flow) return;
          /* Dopiero tutaj cokolwiek wychodzi na zewnątrz: bramka wysyła kod na podany adres,
             a `sponsorSubmit` jedzie po poprawnym kodzie. `flowGuard` wokół wysyłki, bo błąd
             rzucony z zaczepu wpadłby w obsługę odmów bramki. */
          await gateStart(flow.email, 'sponsor', {
            onConfirmed: (code) => flowGuard(() => sponsorSubmit(code)),
            onChangeEmail: () => {
              if (!flow) return;
              /* Nowy adres wraca do PODSUMOWANIA, nie prosto do bramki: zmieniony adres jest
                 zmianą zgłoszenia, więc gość ma go jeszcze raz zobaczyć, zanim pójdzie kod. */
              flow.after = 'summary';
              sponsorAskEmail();
            }
          });
        }],
        ['chat.sponsorSummaryFix', async () => sponsorFix()]
      ]);
    }

    /**
     * MENU POPRAWEK: JEDNO POLE, POTEM Z POWROTEM DO PODSUMOWANIA
     * ---------------------------------------------------------------------------
     * Pastylki noszą etykiety Z PODSUMOWANIA (`chat.sponsorSummary*`) — jedna kopia nazw pól na
     * obie listy. Dwie kopiie znaczyłyby, że po poprawce nazwy pole w podsumowaniu nazywa się
     * inaczej niż pastylka, którą się je poprawia, i nikt tego nie zauważy do pierwszego
     * zgłoszenia od kogoś, kto zapyta „które to pole".
     *
     * „Wróć do podsumowania" jest wyjściem dla kogoś, kto otworzył menu przez pomyłkę. Bez niego
     * jedynym wyjściem byłoby poprawienie czegokolwiek — czyli zmiana pola, którego nikt nie
     * chciał zmieniać.
     */
    function sponsorFix() {
      if (!flow) return;
      flow.step = 'fix';
      flowSay('chat.sponsorFixWhich');
      const fix = (ask) => async () => {
        if (!flow) return;
        flow.after = 'summary';
        ask();
      };
      flowChoices([
        ['chat.sponsorSummaryName', fix(sponsorAskName)],
        ['chat.sponsorSummaryPerson', fix(sponsorAskPerson)],
        ['chat.sponsorSummaryPhone', fix(sponsorAskPhone)],
        ['chat.sponsorSummaryEmail', fix(sponsorAskEmail)],
        ['chat.sponsorSummaryLogo', fix(sponsorAskLogo)],
        ['chat.sponsorSummaryLink', fix(sponsorAskLink)],
        ['chat.sponsorSummaryBack', async () => sponsorSummary()]
      ]);
    }

    /**
     * Zgłoszenie po potwierdzeniu adresu — jedyne żądanie, które cokolwiek wysyła.
     *
     * ŚCIEŻKA, NIE `type` W CIELE
     *   Idzie przez `gatePost`, czyli na `/api/carruleddhi/sponsor-lead`, a nie na adres czatu
     *   z rodzajem w ciele. Router Workera bierze rodzaj ZE ŚCIEŻKI (patrz komentarz przy
     *   `gateUrl`), więc `sponsor-lead` wysłany na `/chat` trafiał do `chatVisitor` — zgłoszenie
     *   zamieniało się w wiadomość w wątku i nikt nie dostawał ani WhatsAppa, ani listu.
     *
     * `code` jedzie razem z adresem, bo to TO żądanie autoryzuje czynność: `verify-code` kodu
     * nie zużyło i nie miało prawa. Zgoda też jedzie, choć nie jest dowodem — Worker sprawdza
     * ją po swojej stronie.
     */
    async function sponsorSubmit(code) {
      const result = await gatePost('sponsor-lead', {
        cartName: flow.cartName,
        firstName: flow.firstName,
        lastName: flow.lastName,
        email: flow.email,
        code,
        ...(flow.phone ? { phone: flow.phone } : {}),
        /* DWA POLA OPCJONALNE JADĄ TYLKO WTEDY, GDY COŚ W NICH JEST
           ---------------------------------------------------------------------------
           `logo` to data URL po zmniejszeniu w przeglądarce (`shrinkPhoto`), `siteUrl` to adres
           sprawdzony na `https://`. Nazwy są takie same jak w panelu ustawień (`logo` przy
           sponsorach) i jak `siteUrl` w kształcie ustawień — a nie `photo`/`url`, bo te w tym
           Workerze znaczą już co innego (`photo` to ładowanie pliku w `settings-admin`).

           Puste pole NIE jedzie wcale: `logo: ''` w żądaniu to obietnica obrazu, którego nie ma,
           i jedna gałąź więcej po stronie serwera. Ta sama decyzja, co przy `phone` wyżej.

           Gdyby Worker jeszcze nie znał tych nazw, nic się nie psuje: `FIELD_WHITELIST`
           przepuszcza tylko znane klucze i po cichu odsiewa resztę (patrz komentarz „Anything
           else is dropped, not rejected" przy tej tablicy) — zgłoszenie przechodzi bez logo. */
        ...(flow.logo ? { logo: flow.logo } : {}),
        ...(flow.siteUrl ? { siteUrl: flow.siteUrl } : {}),
        consent: flow.consent === true
      });
      if (!result?.ok) throw Object.assign(new Error('sponsor'), { payload: result });
      flowSay('chat.sponsorThanks');
      endFlow();
    }

    /**
     * Adres wolno tu wpisać tylko przez `https://`.
     *
     * Host musi mieć kropkę i końcówkę z dwóch znaków, bo `https://sklep` jest adresem w sieci
     * lokalnej, a nie stroną, którą otworzy zwiedzający. Ścieżka po hoście przechodzi w całości:
     * profil w mediach społecznościowych to prawie zawsze `https://instagram.com/nazwa`.
     */
    const SPONSOR_LINK = /^https:\/\/[^\s/?#]+\.[^\s/?#]{2,}(?:[/?#]\S*)?$/i;

    /**
     * Kolejne odpowiedzi sponsora, wpisane w kompozytorze.
     *
     * KOLEJNOŚĆ KROKÓW
     *   nazwa → zgoda → imię i nazwisko → telefon → zdjęcie → odsyłacz → adres →
     *   PODSUMOWANIE → bramka → wysyłka.
     *   Zdjęcie i odsyłacz są opcjonalne (każde z własną pastylką pominięcia), a podsumowanie
     *   stoi PRZED bramką z powodu wypisanego przy `sponsorSummary`.
     *
     * Każde `sponsorNext` niżej jest miejscem, w którym poprawka jednego pola wraca do
     * podsumowania, zamiast ciągnąć gościa przez wszystkie pozostałe pytania jeszcze raz.
     */
    async function sponsorStep(message) {
      if (flow.step === 'name') {
        flow.cartName = message.trim().slice(0, 120);
        if (!flow.cartName) { flowSay('chat.sponsorAskName'); return; }
        sponsorNext(sponsorConsent);
        return;
      }

      if (flow.step === 'person') {
        /* Podział na pierwszym odstępie: wszystko po nim jest nazwiskiem. Nazwiska dwuczłonowe
           i przedrostki („de", „van") zostają w całości, bo dzielenie ich po drugim odstępie
           gubiłoby połowę nazwiska w połowie przypadków, w których w ogóle o coś tu chodzi. */
        const said = message.trim().replace(/\s+/g, ' ').slice(0, 120);
        /* CYFRA W NAZWISKU ODBIJA SIĘ OD RAZU, A NIE DOPIERO U ORGANIZATORA.
           ---------------------------------------------------------------------------
           „Na kogo mam pytać” to imię człowieka, a nie nazwa firmy — ta ma własne pytanie
           krok wyżej. Cyfra w tej odpowiedzi znaczy prawie zawsze jedno z dwojga: ktoś
           wkleił tu numer telefonu, albo napisał nazwę wozu drugi raz. Jedno i drugie
           dojechałoby do zgłoszenia i zostało w mailu do organizatorów jako „Jan 512334455”.

           Sprawdzane PRZED podziałem na imię i nazwisko, bo cyfra po odstępie zrobiłaby się
           nazwiskiem i przeszłaby dalej bez słowa.

           `DIGIT_IN_TEXT`, czyli `\p{Nd}` z flagą `u`, a nie `\d` i nie „wszystko poza literami
           łacińskimi": zakazana jest CYFRA w dowolnym piśmie, a apostrofy, łączniki, spacje
           i znaki diakrytyczne przechodzą — D'Angelo, Sanna-Pinna, Niño, Łukasz. Ten sam
           wzorzec pilnuje pól imienia i nazwiska w formularzu zapisu, żeby dwie drogi do tego
           samego pola nie miały dwóch różnych zdań na temat tego, co jest nazwiskiem.

           Ostrzeżenie nad kompozytorem stanęło już przy PIERWSZEJ wpisanej cyfrze
           (`watchPersonDigits`); to jest twardy bezpiecznik dla kogoś, kto je zignorował. */
        if (DIGIT_IN_TEXT.test(said)) { flowSay('chat.sponsorNoDigits'); return; }
        const gap = said.indexOf(' ');
        if (gap < 1) { flowSay('chat.sponsorNeedPerson'); return; }
        flow.firstName = said.slice(0, gap);
        flow.lastName = said.slice(gap + 1);
        setWarn('');
        sponsorNext(sponsorAskPhone);
        return;
      }

      if (flow.step === 'phone') {
        /* Numer albo wygląda na numer, albo go nie ma. Cicha zamiana byle czego na brak numeru
           znaczyłaby, że literówka w prefiksie kończy się zgłoszeniem bez telefonu i nikt tego
           nie widzi — a pominięcie ma tu własną pastylkę i nie trzeba go pisać słowem. */
        const digits = message.replace(/\D/g, '');
        if (digits.length < 6) { flowSay('chat.sponsorBadPhone'); return; }
        flow.phone = message.trim().slice(0, 40);
        sponsorNext(sponsorAskLogo);
        return;
      }

      if (flow.step === 'logo') {
        /* Zdjęcia nie da się napisać. Kto pisze w tym kroku, albo szuka przycisku, albo chce
           pominąć — zdanie wskazuje jedno i drugie, zamiast brać wpisany tekst za nazwę pliku. */
        flowSay('chat.sponsorLogoUseButtons');
        return;
      }

      if (flow.step === 'linkKind') {
        const said = message.trim().slice(0, 300);
        /* Ktoś wkleił adres, zamiast nacisnąć pastylkę. To jest odpowiedź na to samo
           pytanie, tylko od razu — odrzucenie jej znaczyłoby „nie tak, najpierw guzik".
           Bez tego warunku wpisany adres spadał do gałęzi na dole funkcji, gdzie jest
           pytanie o e-mail, i wracał ze zdaniem, że to nie jest poprawny adres e-mail. */
        if (SPONSOR_LINK.test(said)) {
          flow.siteUrl = said;
          flow.linkKind = 'site';
          sponsorNext(sponsorAskEmail);
          return;
        }
        flowSay('chat.sponsorAskLink');
        return;
      }

      if (flow.step === 'link') {
        const said = message.trim().slice(0, 300);
        /* Bez naprawiania adresu za człowieka: „trattoria.it" NIE zamienia się w
           „https://trattoria.it". Domyślony adres bywa cudzą domeną, a ten napis staje się
           potem odsyłaczem na publicznej stronie wydarzenia. Zdanie o błędzie mówi, czego
           brakuje, i podaje przykład — poprawia człowiek, bo tylko on wie, gdzie chciał
           wskazać. */
        if (!SPONSOR_LINK.test(said)) { flowSay('chat.sponsorBadLink'); return; }
        flow.siteUrl = said;
        sponsorNext(sponsorAskEmail);
        return;
      }

      const email = message.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        /* Ponowna prośba o sam adres, bez utraty tego, co już podane (5.4): nazwa, imię,
           nazwisko, telefon, zdjęcie i odsyłacz zostają w `flow`, zmienia się tylko odpowiedź
           na jedno pytanie. */
        flowSay('chat.dataBadEmail');
        return;
      }
      flow.email = email;
      /* Adres jest ostatnią odpowiedzią, więc stąd idzie się do PODSUMOWANIA, nie wprost do
         bramki. Nic nie wychodzi na zewnątrz — ani kod, ani zgłoszenie — dopóki gość nie
         naciśnie „tak, wyślij" (5.5, 5.6). */
      sponsorSummary();
    }

    async function startFlow(intent) {
      if (intent === 'sponsor') {
        sponsorOffer();
        return;
      }
      if (intent === 'edit' || intent === 'withdraw' || intent === 'print') {
        if (!openEntryManager || !visitor.email) {
          flowSay('chat.dataNeedGate');
          return;
        }
        /* Adres z karty czatu NIE jest uwierzytelnieniem i nadal nim nie jest: dowodem jest
           kod ze skrzynki, o który prosi bramka niżej, a przy kilku zawodnikach na jednym
           adresie — formularz. Cel kodu zależy od czynności, bo kod na poprawienie telefonu
           nie ma prawa nikogo wycofać z wyścigu. */
        flow = newFlow(intent, intent === 'withdraw' ? 'cancel-entry' : 'edit-entry', {
          step: 'lookup'
        });
        flowSay(intent === 'withdraw'
          ? 'chat.dataAskWithdraw'
          : intent === 'print' ? 'chat.printAsk' : 'chat.dataAskEdit');
        await flowGuard(() => entryHandover(visitor.email));
        return;
      }

      flow = newFlow(intent, 'unsubscribe', { step: 'email' });
      flowSay('chat.dataAskNotify');
      notifyAskEmail();
    }

    /**
     * Wiadomość przechwycona przez kreator, jeśli ten czeka na adres albo na kod.
     * Zwraca `true`, gdy obsłużył ją sam i nie ma po co jechać do serwera czatu.
     */
    async function flowHandled(message) {
      if (!flow) return false;

      /* Bramka pierwsza i PRZED bąbelkiem gościa — to nie jest kolejność przypadkowa.
         Sześć cyfr wpisanych w kompozytor jest kodem, nie wypowiedzią, więc `gateTyped`
         decyduje o bąbelku sam: kod nie ma trafić do wątku ani do historii w panelu. */
      if (flow.step === 'gate') return gateTyped(message);

      // Bąbelek gościa rysowany tak jak zwykle: to nadal jego wiadomość w rozmowie.
      append({ author: 'visitor', body: message, at: '' }, false);
      if (input) input.value = '';
      sizeInput();

      /* Sponsoring ma własne kroki i własne pola. Osobna gałąź, nie wspólny „email/code":
         tam adres jest tożsamością do potwierdzenia kodem, tu jest kontaktem do oddzwonienia. */
      if (flow.intent === 'sponsor') {
        /* Cztery kroki są WYBOREM, nie odpowiedzią: oferta na wejściu, zgoda po nazwie,
           potwierdzenie podsumowania i menu poprawek. „Tak" napisane w kompozytorze nie jest
           ani zgodą, ani potwierdzeniem wysyłki — jedno i drugie ma być naciśnięte świadomie
           (zgoda przy odsyłaczach do obu dokumentów pod ręką, potwierdzenie przy widocznym
           podsumowaniu), więc kreator odsyła do pastylek (4.3). */
        if (flow.step === 'decide' || flow.step === 'consent'
          || flow.step === 'summary' || flow.step === 'fix') {
          flowSay('chat.dataUseButtons');
          return true;
        }
        await flowGuard(() => sponsorStep(message));
        return true;
      }

      if (flow.step === 'email') {
        const email = message.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
          flowSay('chat.dataBadEmail');
          return true;
        }

        /* Zmiana danych i wycofanie zaczynają od listy zgłoszeń na tym adresie, bo od niej
           zależy, czy bramka ma co wiązać — patrz `entryHandover`. Wchodzi się tu po „zmień
           adres" w bramce, więc adres jest nowy i lista też jest nowa. */
        if (flow.intent === 'edit' || flow.intent === 'withdraw') {
          await flowGuard(() => entryHandover(email));
          return true;
        }

        /* Bramka z celem `unsubscribe`: kod na ten adres i nikt nie jest wypisywany, dopóki nie
           wróci poprawny. „Kod poszedł" mówi bramka i mówi to samo dla adresu znanego i
           nieznanego (O6) — kreator nie ma tu już własnego zdania na ten temat.

           `flowGuard` wokół samego wypisania, bo błąd rzucony z zaczepu wpadłby w obsługę
           odmów bramki i pokazał jej trzy pastylki po tym, jak bramka już zeszła. */
        await gateStart(email, 'unsubscribe', {
          onConfirmed: (code) => flowGuard(() => notifyOff(code)),
          onChangeEmail: () => notifyAskEmail()
        });
        return true;
      }

      /* Innych kroków ta sprawa nie ma: adres, bramka, wypisanie. Wiadomość w kroku, którego
         nie ma, jest pomyłką po naszej stronie — więc kreator wskazuje pastylki, zamiast po
         cichu brać cokolwiek za kod. */
      flowSay('chat.dataUseButtons');
      return true;
    }

    async function send(body) {
      const message = String(body || '').trim();
      /* Samo zdjęcie wystarczy. Ktoś fotografuje koło i pyta jednym obrazkiem — a wymuszanie
         podpisu znaczyłoby, że przeglądarka dopisuje zdanie za użytkownika i w wątku
         organizatora pojawia się treść, której nikt nie napisał. */
      if (!message && !attached) return;
      /* Kreator ma pierwszeństwo: gdy czeka na adres albo na kod, ta wiadomość jest
         odpowiedzią jemu, a nie nowym pytaniem do automatu. Bez tego adres wpisany w rozmowie
         poleciałby do modelu i zapisał się w historii wątku jako zwykła wiadomość.

         `flow &&` PRZED `await`, i to nie jest mikrooptymalizacja.
         ---------------------------------------------------------------------------
         `flowHandled` zaczyna od `if (!flow) return false`, więc bez kreatora nie robi nic —
         ale jest `async`, a `await` na funkcji, która nic nie robi, i tak oddaje sterowanie.
         Skutek: `showTyping()` niżej nie wykonywało się już w tym samym zadaniu co
         naciśnięcie przycisku. Zmierzone sondą: zaraz po kliknięciu `.chat-typing` nie
         istniało, choć w kodzie stoi kilka linijek dalej.

         Dla człowieka to jedno mikrozadanie, czyli nic. Ale to jedna z tych rzeczy, gdzie
         „prawie natychmiast" i „natychmiast" różnią się tym, że pierwsze zależy od kolejki
         zadań, a wystarczy, że coś ją zapcha — i kropki pojawiają się po bąbelku, a nie
         razem z nim. Bez kreatora nie ma tu teraz żadnego oddania sterowania. */
      if (!attached && flow && await flowHandled(message)) return;
      /* One in flight at a time.
         The submit handler and the Enter handler both call this, and a fast double press —
         or a click on the button while Enter is still being processed — used to start two
         requests with the same text. The button being disabled is not enough on its own,
         because Enter does not go through the button. */
      if (sending) return;
      sending = true;

      // Shown before the round trip, greyed until it lands. A chat that waits for the
      // server before showing what you typed feels broken on a slow connection.
      /* Zdjęcie zdejmowane z podglądu od razu, ale trzymane w zmiennej do końca wysyłki:
         inaczej drugie naciśnięcie Enter dołączyłoby je po raz drugi, a to samo zdjęcie
         wysłane dwa razy to dwa pliki w buckecie i dwa bąbelki. */
      const photo = attached;
      attached = null;
      fileField.value = '';
      paintAttach();

      // Miniatura w bąbelku od razu, z lokalnego data URL — bez czekania na podpisany adres.
      const pending = append({ author: 'visitor', body: message, at: '', image: photo || '' }, true);
      if (input) input.value = '';
      sizeInput();
      /* Fokus wraca do pola PRZED zablokowaniem przycisku.
         ---------------------------------------------------------------------------
         `disabled` odbiera fokus wciśniętemu przyciskowi, a fokus nie ma gdzie pójść — więc
         ląduje na `<body>`. Zmierzone dotknięciem przez CDP: po naciśnięciu „wyślij"
         `document.activeElement` był `<body>`. Na telefonie znaczy to zwiniętą klawiaturę
         w połowie rozmowy, a zwinięcie klawiatury zmienia wysokość dokumentu złożonego
         z sekcji mierzonych od wysokości ekranu — czyli stronę, która ucieka pod palcem.
         Pole wiadomości jest miejscem, w którym ten fokus i tak ma być: zaraz piszemy dalej. */
      keepFocus();
      if (sendButton) sendButton.disabled = true;
      showTyping();

      try {
        const result = await postJSON(endpoint, eventPayload('chat', {
          action: 'send',
          token,
          message,
          ...(photo ? { photo } : {}),
          // Sent every time, ignored by the server once the thread already has them.
          name: visitor.name,
          email: visitor.email
        }));
        pending?.classList.remove('is-pending');
        if (!result || result.ok === false) throw new Error(result?.code || 'chat');

        /* Claim the ids the server just assigned.
           ---------------------------------------------------------------------------
           This is the fix for "sending one message posts several". The optimistic bubble and
           the answer are already on screen but have no ids, so the next poll fetched both
           back, found ids it had not seen, and appended a second copy of each.

           Registering them here — and moving `lastAt` past them — means the poll recognises
           them as already shown. `lastAt` matters as much as `seen`: without it every poll
           re-requested the whole thread from the beginning. */
        if (result.messageId) seen.add(result.messageId);
        /* Optymistyczny bąbelek dostaje identyfikator z bazy, więc od tej chwili jest tym
           samym wierszem co ten, który przyniesie odczyt. Bez tego dwie kopie tej samej
           wiadomości potrafiły stanąć obok siebie.

           `replyId` NIE jest tu dopisywany do `seen`: odpowiedź jest rysowana niżej i to
           `append` ma ją zarejestrować. Dopisanie z góry kazałoby jej pominąć samą siebie. */
        if (pending && result.messageId) pending.dataset.mid = result.messageId;
        for (const at of [result.messageAt, result.replyAt]) {
          if (at && at > lastAt) lastAt = at;
        }

        setMode(result.mode || mode);
        /* Odpowiedź z identyfikatorem, nie bez niego: gdyby odczyt zdążył ją dorysować
           pierwszy, kopia bez identyfikatora przeszłaby przez każdy filtr. */
        if (result.reply) {
          append({ id: result.replyId || '', author: 'ai', body: result.reply, at: '' }, false);
        }
        /* Serwer rozpoznał sprawę własnych danych i oddał znacznik zamiast zdania. Kreator
           przejmuje rozmowę od tej chwili — patrz `startFlow`. */
        if (result.selfService) {
          await startFlow(result.selfService);
          return;
        }
        // Fresh suggestions after every answer, so the chips follow the conversation instead
        // of offering the same six openers for ever.
        paintChips();
      } catch (_) {
        pending?.classList.add('is-failed');
        note('chat.sendFailed');
        /* Zdjęcie wraca do podglądu, gdy wysyłka padła. Zniknięcie razem z nieudaną wiadomością
           znaczyłoby, że po zerwanym połączeniu trzeba je wybrać z galerii jeszcze raz — a to
           jest jedyna część tej wiadomości, której nie da się szybko odtworzyć. */
        if (photo) {
          attached = photo;
          paintAttach();
        }
      } finally {
        hideTyping();
        sending = false;
        if (sendButton) sendButton.disabled = false;
      }
    }

    /**
     * NA MYSZY ODBIERAMY FOKUSOWI PRAWO UCIECZKI. NA DOTYKU — NIE, I TO JEST CALA RZECZ.
     * ===========================================================================
     * Stalo tu `preventDefault()` na `mousedown` ORAZ na `touchstart`. Na myszy dziala to tak,
     * jak mialo: przycisk nie zabiera kursora z pola, wiec klawiatura ekranowa nie znika,
     * a uklad nie skacze.
     *
     * Na dotyku robi cos zupelnie innego. `preventDefault()` w `touchstart` kasuje calą
     * sekwencje zdarzen myszy, KTORE PRZEGLADARKA Z NIEGO WYWODZI — razem z `click`. A skoro
     * nie ma `click`, to przycisk `type="submit"` nie wysyla formularza i wiadomosc nie
     * wychodzi WCALE. Zglaszone jako „nie moge nawet wyslac wiadomosci na czacie", i tylko
     * z telefonu: na komputerze ta sama sciezka dziala, bo tam `mousedown` klikniecia nie
     * unieważnia.
     *
     * Fokus na dotyku nie potrzebuje tej zapory, bo pilnuje go `keepFocus()` wolane na samym
     * poczatku `send()` — oddaje kursor polu z `preventScroll: true`, wiec klawiatura zostaje
     * otwarta i nic sie nie przesuwa. To jest ta sama obrona, tyle ze po fakcie zamiast przed,
     * i nie kosztuje klikniecia.
     *
     * `pointerdown` zamiast `mousedown`, zeby jeden warunek rozstrzygal o obu urzadzeniach:
     * `pointerType` mowi wprost, czy to mysz, czy palec.
     */
    const preventFocusLoss = (event) => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      if (document.activeElement === input) event.preventDefault();
    };
    sendButton?.addEventListener('pointerdown', preventFocusLoss);

    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      send(input?.value);
    });

    // Enter sends, Shift+Enter makes a new line. The other way round is how people end up
    // sending half a sentence.
    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        send(input.value);
      }
    });

    /* The composer grows with the text instead of scrolling inside three lines. */
    let lastInputHeight = 0;
    /** Sufit wysokości pola, wzięty z arkusza. Odświeżany tylko przy zmianie układu. */
    let inputCap = 190;
    /** Dolna granica pola, wzięta z arkusza (`min-height`). Patrz komentarz przy `next`. */
    let inputFloor = 58;
    function measureInputCap() {
      if (!input) return;
      const floor = Number.parseFloat(getComputedStyle(input).minHeight);
      if (Number.isFinite(floor) && floor > 0) inputFloor = floor;
      const cap = Number.parseFloat(getComputedStyle(input).maxHeight);
      /* `none` albo wartość, której nie da się odczytać, znaczy „bez sufitu z arkusza" —
         wtedy zostaje ostatnia znana liczba, a nie NaN, po którym pole przestałoby rosnąć. */
      if (Number.isFinite(cap) && cap > 40) inputCap = cap;
    }
    measureInputCap();
    /* Ta sama trójka zdarzeń, na którą reaguje reszta strony: `--screen-h` zmienia się przy
       obrocie i przy prawdziwej zmianie okna, a sufit jest z niej liczony. */
    window.addEventListener('resize', measureInputCap, { passive: true });
    window.addEventListener('orientationchange', measureInputCap, { passive: true });
    window.addEventListener('carruleddhi:relayout', measureInputCap);

    /* ========================================================================
       KLAWIATURA NA TELEFONIE: `--chat-vh`, CZYLI WIDOCZNA WYSOKOŚĆ OKNA
       ========================================================================
       TO JEST NAPRAWA ZGŁOSZENIA „NA TELEFONIE PASTYLKA NAD POLEM ZOSTAJE W ZŁYM MIEJSCU".

       CO BYŁO ZŁE — I DLACZEGO POPRZEDNIA POPRAWKA NIE MOGŁA DZIAŁAĆ
         Sufity czatu (wysokość dziennika, sufit rośnięcia pola, rozwinięty rząd pastylek) były
         liczone z `--screen-h`. Ta zmienna jest ZAMROŻONYM `100svh` — patrz `measureScreenHeight`
         w site-bridge.js — i taka ma zostać, bo od niej zależy wysokość czternastu sekcji i to
         ona naprawiła teleportowanie strony przy przewijaniu palcem. Tylko że klawiatura
         systemowa nie zmienia ani `100svh`, ani `innerHeight`: na Androidzie i w iOS skraca
         WYŁĄCZNIE `visualViewport`. Czyli sufit liczony z `--screen-h` przy otwartej klawiaturze
         zostawał dokładnie taki, jaki był przy zamkniętej — a czat kończył się poniżej dolnej
         krawędzi tego, co widać.

         ZMIERZONE (`tools/probe-chat-flows.mjs`, okno 390x844, klawiatura 400 px):
           widoczna wysokość        749 px -> 349 px
           dolna krawędź kompozytora   470 px -> 428 px   (czyli 79 px POD krawędzią widoku)
           sufit dziennika           284,62 px -> 284,62 px   <-- nie drgnął
         Kompozytor z przyciskiem wysyłki i pasek pastylek nad nim były więc pod klawiaturą.
         Stąd zgłoszenie: pastylka JEST, tylko jej nie widać, a strona pod palcem wygląda na
         zawieszoną.

       CO JEST TERAZ
         Druga zmienna, obok tej pierwszej i nie zamiast niej: `--chat-vh` to wysokość, którą
         NAPRAWDĘ widać. Arkusz czatu liczy z niej sufity (patrz chat.css), a reszta strony jej
         nie widzi i dalej stoi na zamrożonym `--screen-h`. Dzięki temu klawiatura skraca czat,
         a nie przestawia układu sekcji — czyli jedno zgłoszenie jest naprawione bez odkręcania
         drugiego.

       DLACZEGO PODŁOGA I SUFIT NA TEJ LICZBIE
         Podłoga 240 px: przy zupełnie skróconym widoku (klawiatura z podpowiedziami na małym
         telefonie) czat ma zostać czatem, a nie paskiem bez dziennika. Sufit z zamrożonej
         wysokości ekranu: `visualViewport.height` rośnie ponad wysokość ekranu, gdy schowa się
         pasek adresu — i bez tego ograniczenia czat puchłby przy przewijaniu, czyli wracałby
         błąd, dla którego `--screen-h` w ogóle powstało.

       DLACZEGO `scroll` TEŻ, NIE TYLKO `resize`
         iOS przy otwarciu klawiatury wysyła na widoku `resize` ORAZ `scroll`, a przy zwijaniu
         bywa, że tylko `scroll`. Sonda wysyła oba i oba są tu obsłużone: pomiar jest tani
         (jeden odczyt) i zapisuje zmienną tylko wtedy, gdy liczba jest inna.

       CZEGO TA ZMIENNA NIE WOLNO, ŻEBY DOTKNĘŁA — I DLACZEGO
         `--chat-vh` czyta WYŁĄCZNIE arkusz czatu, i to tylko w regułach `.chat*`. Gdyby
         weszła gdziekolwiek indziej — a zwłaszcza w wysokość sekcji, bo one na tej stronie
         liczą się od wysokości ekranu — otwarcie klawiatury zmieniałoby wysokość CAŁEGO
         dokumentu, przewinięcie zostałoby przycięte do nowego maksimum i nikt by go nie
         przywrócił (bezpiecznik w index.html stoi na `resize` OKNA, którego klawiatura przy
         `interactive-widget=resizes-visual` nie wysyła). To był objaw „dotknięcie pola
         przerzuca stronę na górę i zwija klawiaturę".

         Dlatego nawet w samym czacie skracanie dziennika NIE jest już widoczne dla wysokości
         dokumentu: panel trwającej rozmowy ma stałą wysokość liczoną z zamrożonego
         `--screen-h`, a dziennik kurczy się w tej ramce (patrz `.chat[data-chat-ready='yes']`
         i `.chat__log` w chat.css). ZMIERZONE `tools/probe-chat-flows.mjs`, okno 390x844,
         klawiatura 400 px: wysokość dokumentu 12733 -> 12625 -> 12733 px PRZED, a 12791 px
         w każdym z trzech stanów PO. Przewinięcie: 11080 px przed dotknięciem pola, przy
         otwartej klawiaturze i po jej zwinięciu.
       ====================================================================== */
    const CHAT_VH_FLOOR = 240;
    let lastChatVh = 0;
    function measureChatViewport() {
      const view = window.visualViewport;
      const visible = Math.round(view?.height || window.innerHeight || 0);
      if (!visible) return;
      const frozen = frozenScreenHeight() || window.innerHeight || visible;
      const height = Math.max(CHAT_VH_FLOOR, Math.min(visible, frozen));
      if (height === lastChatVh) return;
      /* Przewiń dziennik do dołu, jeśli był na dole przed zmniejszeniem okna (wysunięcie klawiatury).
         Używamy rAF, by poczekać na zastosowanie nowych stylów i przeliczenie wysokości przez CSS. */
      let wasAtBottom = false;
      if (log) {
        wasAtBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 48;
      }

      lastChatVh = height;
      document.documentElement.style.setProperty('--chat-vh', `${height}px`);
      /* Sufit pola jest czytany z arkusza, a arkusz właśnie zmienił zdanie — bez tego
         `sizeInput` trzymałby pole na starej, wyższej liczbie do następnej zmiany okna. */
      measureInputCap();

      if (log && wasAtBottom) {
        requestAnimationFrame(() => {
          log.scrollTop = log.scrollHeight;
        });
      }
    }
    measureChatViewport();
    window.visualViewport?.addEventListener('resize', measureChatViewport, { passive: true });
    window.visualViewport?.addEventListener('scroll', measureChatViewport, { passive: true });
    window.addEventListener('resize', measureChatViewport, { passive: true });
    window.addEventListener('orientationchange', measureChatViewport, { passive: true });
    function sizeInput() {
      if (!input) return;
      /* Measured before anything is written, and written only when it changed.
         ---------------------------------------------------------------------------
         This used to set `height: auto` and then a pixel value on every keystroke. Two
         forced reflows per character is bad enough, but the real damage was downstream:
         #contact is a sticky panel whose height decides whether it pins, so a box that
         resized on every character kept asking the panel layout to reconsider — and the
         page moved under the cursor while somebody was typing. That is the "it jumps when
         I write" report.

         `auto` is still needed to let the box shrink when text is deleted; it just is not
         committed unless the answer differs from what is already there. */
      input.style.height = 'auto';
      /* Sufit CZYTANY z `max-height` w chat.css, a nie wpisany tu drugi raz.
         ---------------------------------------------------------------------------
         Stała 190 była kopią liczby z arkusza i przestała być prawdą w chwili, gdy sufit
         w CSS zaczął zależeć od wysokości ekranu (patrz komentarz przy `.chat__composer
         textarea`): przy otwartej klawiaturze arkusz mówił 106 px, a ten kod nadal 190 px —
         czyli pole rosło ponad swój kadr i wypychało przycisk wysyłki pod klawiaturę.
         Odczyt jest buforowany i odświeżany przy zmianie układu, bo `getComputedStyle`
         w obsłudze każdego naciśnięcia klawisza to wymuszone przeliczenie stylu na znak. */
      /* Podloga TAKZE z arkusza, tak samo jak sufit — zeby ta funkcja nie probowala wpisac
         wysokosci mniejszej niz `min-height`. Sama proba niczego by nie zepsula (arkusz i tak
         wygrywa), ale `lastInputHeight` zapamietywaloby wtedy liczbe, ktorej pole nigdy nie
         mialo, i kolejne porownanie „czy sie zmienilo" bylo by porownaniem z fikcja. */
      const next = Math.max(Math.min(input.scrollHeight, inputCap), inputFloor);
      if (next !== lastInputHeight) {
        lastInputHeight = next;
        input.style.height = `${next}px`;
      } else {
        input.style.height = `${lastInputHeight}px`;
      }
    }
    input?.addEventListener('input', sizeInput);

    /**
     * Rosnace pole zabiera miejsce dziennikowi — wiec dziennik ma zostac przy NAJNOWSZEJ
     * wypowiedzi, a nie przy tej, ktora akurat wypadla na wysokosci oka.
     *
     * Bez tego dwuwierszowa wiadomosc zabiera dziennikowi czterdziesci pikseli u dolu i
     * ostatnia wypowiedz wysuwa sie poza kadr — z boku wyglada to tak, jakby rozmowa
     * uciekala do gory w chwili, w ktorej ktos zaczyna pisac. W kazdym komunikatorze jest
     * odwrotnie: pole rosnie, a koniec rozmowy zostaje na miejscu.
     *
     * Przewijamy TYLKO wtedy, gdy dziennik i tak byl na dole. Ktos, kto cofnal sie do
     * wczesniejszej wypowiedzi i zaczal pisac, ma zostac tam, gdzie czyta.
     */
    input?.addEventListener('input', () => {
      if (!log) return;
      const naDole = log.scrollHeight - log.scrollTop - log.clientHeight < 48;
      if (naDole) log.scrollTop = log.scrollHeight;
    });

    /* Skocz do najnowszej wiadomości przy wejściu w pole (pojawienie się klawiatury),
       zeby uniknąć pisania w ciemno i wymusić pokazanie najnowszej wiadomości. */
    input?.addEventListener('focus', () => {
      if (!log) return;
      requestAnimationFrame(() => {
        log.scrollTop = log.scrollHeight;
      });
    });

    /* --------------------------------------------------------------- chips */
    /* Every question the chips can offer, as i18n keys. The first six are the ones the FAQ
       dictionary answers instantly; the rest go to the model, and `askChange` and `askCancel`
       are the two that deliberately end up with a person. */
    const CHIP_KEYS = [
      'chat.askWho', 'chat.askCost', 'chat.askHelmet', 'chat.askWhen', 'chat.askNumber',
      'chat.askRules', 'chat.askCategories', 'chat.askMinor', 'chat.askBuild', 'chat.askArrive',
      'chat.askChange', 'chat.askCancel'
    ];
    const CHIPS_AT_ONCE = 3;
    const askedKeys = new Set();

    /**
     * Three suggestions, none of them already used.
     *
     * Called after every answer. The point is that the chips follow the conversation: asking
     * about helmets should not be followed by three chips one of which is about helmets.
     * Once everything has been asked the row empties and the toggle hides itself rather than
     * offering repeats.
     */
    function paintChips() {
      if (!chipsList) return;
      const fresh = CHIP_KEYS.filter((key) => !askedKeys.has(key)).slice(0, CHIPS_AT_ONCE);
      chipsList.replaceChildren();
      fresh.forEach((key) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = key === 'chat.askCancel' || key === 'chat.askChange'
          ? 'chat__chip chat__chip--warn'
          : 'chat__chip';
        chip.dataset.chatAsk = key;
        chip.textContent = text(key) || '';
        chip.addEventListener('click', async () => {
          askedKeys.add(key);
          /* Fokus przekładany, zanim rząd podpowiedzi zostanie przemalowany: ten przycisk
             zaraz zniknie z drzewa, a fokus na usuniętym elemencie spada na `<body>`.
             Patrz `keepFocus` — to jest naprawa „kliknięcie przewija stronę". */
          keepFocus();
          setChipsOpen(false);
          if ((key === 'chat.askChange' || key === 'chat.askCancel') && openEntryManager) {
            /* Ta sama droga, co po napisaniu „chcę zmienić dane" — jedna, nie dwie. Naciśnięta
               podpowiedź jest tą samą prośbą co zdanie w kompozytorze, więc idzie przez
               `startFlow`: bramka w rozmowie, a potem formularz z gotowym potwierdzeniem (3.2).
               Wcześniej ta gałąź otwierała formularz z samym adresem i to on zaczynał
               weryfikację od początku — dwa zachowania dla jednej prośby.

               Adres z karty czatu nadal nie jest uwierzytelnieniem: żadna czynność nie dzieje
               się bez kodu ze skrzynki. */
            /* Bąbelek gościa także tutaj. Ta gałąź NIE idzie przez `send()`, więc bez tego
               naciśnięcie „chcę zmienić dane" nie zostawiało w rozmowie żadnego śladu, choć
               napisanie tego samego zdania zostawiało. Jedna prośba, jeden wygląd. */
            append({ author: 'visitor', body: chip.textContent || '', at: '' }, false);
            await startFlow(key === 'chat.askChange' ? 'edit' : 'withdraw');
            return;
          }
          send(chip.textContent.trim());
        });
        chipsList.appendChild(chip);
      });
      if (chips) chips.hidden = !identified() || fresh.length === 0;
    }

    function setChipsOpen(open) {
      chips?.classList.toggle('is-open', open);
      chipsToggle?.setAttribute('aria-expanded', String(open));
      if (chipsLabel) chipsLabel.textContent = text(open ? 'chat.chipsHide' : 'chat.chipsShow') || '';
    }
    chipsToggle?.addEventListener('click', () => {
      setChipsOpen(!chips?.classList.contains('is-open'));
    });
    // Repainted on a language change, because the labels are the questions themselves.
    window.addEventListener('carruleddhi:language', () => {
      paintChips();
      setChipsOpen(chips?.classList.contains('is-open') || false);
    });

    /* --------------------------------------------------------------- poll */
    function startPolling() {
      if (polling) return;
      polling = window.setInterval(async () => {
        // Nothing to poll for behind a hidden tab or a closed panel.
        if (document.hidden || panel.hidden) return;
        /* GŁÓWNA PRZYCZYNA DUBLOWANIA WIADOMOŚCI.
           ---------------------------------------------------------------------------
           Serwer zapisuje wiersz gościa i odpowiedź modelu PRZED odesłaniem odpowiedzi, a samo
           wywołanie modelu trwa kilka sekund. Odczyt wchodzący w tym okienku pobierał oba
           wiersze, nie znał jeszcze ich identyfikatorów — bo `send()` dostaje je dopiero na
           końcu — i dorysowywał drugą kopię. Odczyt czeka więc na zakończenie wysyłki. */
        if (sending) return;
        try {
          const result = await postJSON(endpoint, eventPayload('chat', {
            action: 'poll',
            token,
            since: lastAt
          }));
          if (!result || result.ok === false) return;
          (result.messages || []).forEach((message) => append(message, false));
          /* Tryb po wiadomościach: przekazanie rozmowy widać dopiero pod tym, co organizator
             właśnie napisał, a nie nad tym. */
          setMode(result.mode || mode);
          /* Dots while a person is writing an answer.
             They already appear while the model is thinking, which is a second at most. This is
             the case where they matter: the question went to a human, somebody is typing three
             sentences in the panel, and until now there was nothing on this side saying so.

             Shown after the messages are appended, so if the answer arrived in this same poll
             the dots go up and come straight back down rather than appearing under a message
             that is already there. */
          if (result.theirTyping) showTyping();
          else hideTyping();
        } catch (_) {
          /* A dropped poll is not worth telling anybody about; the next one retries. */
        }
      }, CHAT_POLL_MS);
    }

    function stopPolling() {
      window.clearInterval(polling);
      polling = 0;
    }

    /**
     * ADRES, KTÓRY JUŻ ZNAMY: POTWIERDZENIE ZAMIAST DRUGIEGO PYTANIA
     * ---------------------------------------------------------------------------
     * Brama czatu prosi o imię i adres, i ma po co: to, czego automat nie wie, kończy
     * u człowieka, a człowiek odpisujący za trzy godziny musi mieć dokąd. Ale kto zapisał
     * się na wyścig albo włączył przypomnienia, podał ten adres kwadrans temu — i dostawał
     * dwa puste pola, jakby nikt nie słuchał.
     *
     * Więc: znany adres nie jest wpisywany za gościa po cichu. Jest POKAZANY, zamaskowany
     * tak samo jak w bramce kodu, i potwierdzany jedną pastylką. „Zmień adres" oddaje
     * zwykły formularz — bez tego wyjścia potwierdzenie byłoby pułapką na kogoś, kto pisze
     * z cudzego telefonu.
     *
     * Imię pytane TYLKO wtedy, gdy go nie znamy. Adres bez imienia zdarza się, bo
     * przypomnienia można włączyć samym adresem.
     *
     * Formularz jest chowany, nie usuwany: „zmień adres" ma go oddać w tym samym stanie,
     * a nie odbudować drugą kopię z innymi zdarzeniami.
     */
    function knownGateOffer() {
      if (!gate || identified() || ended) return false;
      const known = knownPerson();
      if (!known.email) return false;
      if ($('[data-chat-gate-known]', gate)) return true;

      const card = document.createElement('div');
      card.className = 'chat-gate__known';
      card.dataset.chatGateKnown = '';

      const lead = document.createElement('p');
      lead.className = 'chat-gate__lead';
      card.append(lead);

      let nameField = null;
      let nameLabel = null;
      if (!known.name) {
        const holder = document.createElement('div');
        holder.className = 'field';
        nameField = document.createElement('input');
        nameField.type = 'text';
        nameField.id = 'chat-gate-known-name';
        nameField.name = 'name';
        nameField.autocomplete = 'given-name';
        nameField.maxLength = 40;
        nameField.placeholder = ' ';
        nameField.required = true;
        nameLabel = document.createElement('label');
        nameLabel.htmlFor = nameField.id;
        holder.append(nameField, nameLabel);
        card.append(holder);
      }

      const row = document.createElement('div');
      row.className = 'chat-gate__choices';
      const chip = (key, onClick) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'chat__chip';
        button.dataset.i18nKey = key;
        button.addEventListener('click', onClick);
        row.append(button);
        return button;
      };

      const yes = chip('chat.gateKnownYes', () => {
        const person = known.name || String(nameField?.value || '').trim();
        /* Bez imienia nie ma kogo zawołać w wątku, więc pastylka nie idzie dalej — ale też
           nie krzyczy: kursor ląduje w polu, które trzeba uzupełnić. */
        if (person.length < 2) { nameField?.focus({ preventScroll: true }); return; }
        visitor.name = person;
        visitor.email = known.email;
        storage.set('carruleddhi.chat.name', person);
        storage.set('carruleddhi.chat.email', known.email);
        rememberPerson(person, known.email);
        card.remove();
        applyGate();
        openThread();
        startPolling();
        input?.focus({ preventScroll: true });
        /* Karta znika, więc sekcja zmienia wysokość — a #contact decyduje o przypięciu
           z własnej wysokości. Ten sam sygnał wysyła zwykła brama. */
        window.dispatchEvent(new Event('carruleddhi:relayout'));
      });

      const change = chip('chat.gateKnownChange', () => {
        card.remove();
        if (gateForm) gateForm.hidden = false;
        $('#chat-gate-name', gate)?.focus({ preventScroll: true });
      });

      card.append(row);

      /* Przelot językowy nie omija karty zbudowanej z kodu: `translateDom` chodzi po
         `data-i18n`, a te trzy napisy powstają tutaj. Bez tego zmiana języka zostawiłaby
         pastylki po włosku nad polską rozmową. */
      const paint = () => {
        lead.textContent = interpolate('chat.gateKnownAsk', { email: gateMask(known.email) });
        yes.textContent = text('chat.gateKnownYes') || 'OK';
        change.textContent = text('chat.gateKnownChange') || '';
        if (nameLabel) nameLabel.textContent = text('chat.gateName') || '';
      };
      paint();
      window.addEventListener('carruleddhi:language', () => {
        if (card.isConnected) paint();
      });

      if (gateForm) {
        gateForm.hidden = true;
        gateForm.before(card);
      } else {
        gate.append(card);
      }
      return true;
    }

    knownGateOffer();
    applyGate();
    paintChips();

    /* Czat jest teraz jedyną drogą, więc jest widoczny od razu.
       ---------------------------------------------------------------------------
       Dotąd stała tu jedna linijka: przełącz na czat, jeśli w adresie jest `#chat` — bo
       domyślną zakładką był formularz. Odkąd formularz zszedł z ekranu (patrz A3 na górze tej
       funkcji), warunek zostawiłby pustą kartę: panel czatu ma w znaczniku atrybut `hidden`,
       a zdejmuje go dopiero selectTab.

       `selectTab` zostaje jedyną drogą do tego stanu — także dlatego, że robi resztę: bramę
       tożsamości, otwarcie wątku i uruchomienie odpytywania. Odsłonięcie panelu przez samo
       `hidden = false` pominęłoby wszystkie trzy. */
    selectTab('chat');
  }

  /**
   * The route photograph grows as you scroll into it, then holds still.
   *
   * WHAT IT IS FOR
   *   #route is one of the pinned panels: it sticks to the top of the viewport and the next
   *   section slides over it. That already happens. What was missing is any sense that the
   *   photograph is the reason to stop there — it arrived at its final size before it was
   *   fully on screen and then sat there while the page moved around it.
   *
   *   So the frame starts slightly small and low, reaches full size around the point where
   *   the section is centred, and then stops. Stopping matters more than moving: a photo
   *   that is still growing while the next card starts covering it reads as two animations
   *   fighting, which is what the earlier attempt looked like.
   *
   * WRITTEN AS A CUSTOM PROPERTY, NOT A TRANSFORM
   *   `--route-progress` goes on the frame and the stylesheet decides what to do with it.
   *   That keeps the scale, the lift and the shadow in the file with the rest of the section
   *   styling, and it means a change to the look needs no JavaScript.
   *
   * COST
   *   One passive scroll listener, throttled to one write per frame, doing two rect reads.
   *   It unhooks itself if the section is not on the page.
   */
  function setupRouteZoom() {
    const frame = $('[data-route-frame]');
    const section = $('#route');
    if (!frame || !section) return;

    // Motion turned down: the photograph is simply at its final size. There is nothing here
    // that carries information, so there is nothing to preserve by animating it slowly.
    if (reducedMotion) {
      frame.style.setProperty('--route-progress', '1');
      document.documentElement.style.setProperty('--route-progress', '1');
      // Parked at the finish rather than hidden: it is a marker for where the descent ends,
      // and that is information whether or not it is allowed to move.
      if (routeCartPlacer) routeCartPlacer(1);
      return;
    }

    /**
     * The section's position in the document, not on the screen.
     *
     * getBoundingClientRect() was the obvious thing to use and it is the wrong thing here.
     * #route is one of the sticky panels: once it pins, `rect.top` stops at 0 and stays
     * there for the whole time the section is on screen. Progress computed from it jumped
     * straight to 1 before the photograph was even fully visible — which is exactly the
     * "it does not zoom, there is no animation" that came back.
     *
     * The offsetTop chain is the layout position, and `position: sticky` does not change
     * layout — it only shifts where the box is painted. So this keeps increasing while the
     * panel is pinned, which is the whole window the animation needs.
     */
    const documentTop = (element) => {
      let top = 0;
      let node = element;
      while (node) {
        top += node.offsetTop;
        node = node.offsetParent;
      }
      return top;
    };

    let queued = false;

    /* GEOMETRIA JEST MIERZONA PRZY ZMIANIE UKŁADU, NIE NA KLATKĘ.
       ---------------------------------------------------------------------------
       `documentTop()` wyżej wspina się po łańcuchu `offsetParent`, czytając `offsetTop` na
       każdym szczeblu, a `section.offsetHeight` to kolejny odczyt tego samego rodzaju. Oba
       WYMUSZAJĄ przeliczenie układu: przeglądarka musi porzucić to, co ma w kolejce, i policzyć
       pozycje od nowa, żeby oddać liczbę. Stały w `measure()`, czyli działy się na każdej
       klatce przewijania przez sekcję trasy — po dwa wymuszone przeliczenia trzynastotysięcznego
       dokumentu o czternastu przypiętych panelach, sześćdziesiąt razy na sekundę.

       Żadna z tych dwóch liczb nie zmienia się w trakcie przewijania. Zmienia je zmiana okna,
       obrót telefonu, `--screen-h` i werdykt `pinned`/`flow` z setupPanels — czyli dokładnie te
       zdarzenia, które są obsłużone niżej. Więc są mierzone tam i pamiętane.

       WYSOKOŚĆ EKRANU Z `--screen-h`, NIE Z `window.innerHeight`
         To ta sama pułapka, która jest opisana przy zmiennej `--screen-h` w experience.css, tu
         w trzecim miejscu. `innerHeight` na telefonie chudnie i puchnie o 60–100 px, gdy pasek
         adresu się chowa. Z niego liczył się `slack`, `roomy`, `start` i `end`, czyli całe okno
         przebiegu — więc chowający się pasek przesuwał okno pod trwającą animacją i progres
         przeskakiwał o kilka procent w jednej klatce, w kierunku niezależnym od ruchu palca.
         `--screen-h` jest zamrożone i wysokość sekcji w CSS jest z niego liczona, więc to jest
         liczba, względem której to okno naprawdę stoi. */
    let geometry = { top: 0, height: 0, viewport: 1 };
    const remeasureGeometry = () => {
      geometry = {
        top: documentTop(section),
        height: section.offsetHeight,
        viewport: frozenScreenHeight() || window.innerHeight || 1
      };
    };

    /* Docelowy element zapisu progresu.
       ---------------------------------------------------------------------------
       `#route`, bo to najbliższy wspólny przodek ramki i tekstu obok niej, a `@property` w
       route-zoom.css sprawia, że dziedziczenie unieważnia zależne `calc()` — czyli robi to, po
       co wcześniej pisało się na korzeniu.

       Bez `@property` (Safari poniżej 16.4, Firefox poniżej 128) dziedziczenie nie unieważnia
       tych `calc()`, co jest zmierzone i opisane w tamtym pliku. Tam i tylko tam wracamy na
       korzeń: strona w starej przeglądarce działa jak przedtem, a nowa nie płaci za jej brak. */
    const propertyRegistered = (() => {
      if (typeof CSS === 'undefined' || typeof CSS.registerProperty !== 'function') return false;
      /* Rejestracja przez CSS.registerProperty tej samej właściwości, którą już zarejestrował
         arkusz, rzuca InvalidModificationError — i to jest odpowiedź „tak, obsługiwane".
         Gdyby arkusz nie doszedł, rejestracja się udaje i zachowanie jest takie samo. */
      try {
        CSS.registerProperty({ name: '--route-progress', syntax: '<number>', inherits: true, initialValue: '1' });
        return true;
      } catch (_) {
        return true;
      }
    })();
    const progressHost = propertyRegistered ? section : document.documentElement;

    const measure = () => {
      queued = false;
      const { top, height, viewport } = geometry;
      const y = window.scrollY || window.pageYOffset || 0;

      /* Efekt zaczyna się, gdy sekcja wypełnia ekran — nie wcześniej.
         ---------------------------------------------------------------------------
         Stało tu `start = top - viewport * 1.1`, czyli powiększanie startowało ekran i jedną
         dziesiątą PRZED pojawieniem się sekcji. Nie było to niedopatrzenie, a konieczność:
         zmierzone na 1440×900 sekcja miała dokładnie jeden ekran wysokości i zapas przewijania
         przy pełnej widoczności równy zeru. W chwili, gdy wypełniała ekran, nie było już czego
         przewijać, więc cały przebieg musiał zmieścić się na drodze do niej.

         Teraz sekcja ma dwa ekrany na każdej szerokości (route-zoom.css, blok „ten sam zapas
         przewijania na szerokim ekranie"), a treść jest przypięta w jej środku. Dzięki temu
         `start` to moment, w którym panel wypełnia ekran, a cały przebieg dzieje się na oczach.

         `end` przy 85% zapasu, nie przy 100%: ostatnie piętnaście procent to czas, w którym
         zdjęcie stoi już nieruchomo, zanim następna karta zacznie wjeżdżać. Zdjęcie wciąż
         rosnące pod nadjeżdżającą kartą czyta się jako dwie kłócące się animacje.

         Zapas mierzony, nie zakładany: gdyby arkusz nie doszedł albo ktoś włączył `prefers-
         reduced-motion` (wtedy blok CSS nie obowiązuje), zapas jest zerowy i wracamy do
         poprzedniego sposobu. Bez tego efekt przeskakiwałby z 0 na 1 w jednym pikselu. */
      const slack = Math.max(height - viewport, 0);
      const roomy = slack > viewport * 0.3;
      const start = roomy ? top : top - viewport * 1.1;
      const end = roomy ? top + slack * 0.85 : top + slack * 0.55;
      const span = Math.max(end - start, 1);

      const linear = clamp((y - start) / span, 0, 1);
      /* Wygładzenie krzywą smoothstep, nie easeOut.
         Symetryczna: łagodnie startuje i łagodnie dochodzi, a w środku przebiegu ma nachylenie
         bliskie liniowemu — czyli nie odkleja obrazu od palca. easeOut wygląda płynnie na
         wykresie i pod palcem czyta się jak opóźnienie, bo najszybsza jest na początku ruchu,
         w którym człowiek jeszcze nie zdążył spojrzeć. */
      const progress = linear * linear * (3 - 2 * linear);

      /* JEDEN ZAPIS NA KLATKĘ, NA `#route`.
         ---------------------------------------------------------------------------
         Były dwa: na ramce i na `:root`. Ten drugi unieważniał styl całego dokumentu na każdej
         klatce — pełne uzasadnienie stoi w route-zoom.css przy `@property --route-progress`,
         razem z powodem, dla którego kiedyś był konieczny.

         Ramka nie dostaje już własnej kopii. Dziedziczy tę z `#route`, a przy zarejestrowanej
         właściwości dziedziczenie unieważnia jej `transform` tak samo pewnie jak zapis własny.
         Dwie kopie tej samej liczby to dwa miejsca, w których mogą się rozjechać. */
      progressHost.style.setProperty('--route-progress', progress.toFixed(3));

      /* The cart rides the road.
         Held back until the photograph has most of its size, because a cart crossing a
         picture that is still visibly growing reads as two things moving at once. From 0.35
         onwards it covers the whole descent, which is the part worth watching. */
      if (routeCartPlacer) routeCartPlacer(clamp((progress - 0.35) / 0.65, 0, 1));

      /* `is-route-copy-gone` used to be set here, to switch off pointer events on copy that had
         been faded to near-invisible. The copy is no longer faded — it shrinks and keeps full
         contrast, so the map button stays visible and stays meant to be pressed. Nothing to
         disable, and a class that only ever mattered because something else was wrong. */
    };

    /**
     * Throttled to one measurement per frame, with a way out if the frame never comes.
     *
     * The obvious version — set a flag, clear it inside requestAnimationFrame — has a failure
     * mode that is worse than the thing it optimises. If the callback is starved, the flag
     * stays raised and every later scroll is discarded: not a dropped frame, a permanently
     * frozen animation. That is the third time on this page that a rendering callback turned
     * out not to be a guarantee (the text effects and the comment wall were the other two),
     * so the pattern is now written with the escape included rather than added after somebody
     * reports it.
     */
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(measure);
      // Only does anything if the frame above never arrived; measure() clears the flag.
      window.setTimeout(() => { if (queued) measure(); }, 120);
    };

    /* Geometria najpierw, progres z niej.
       Odwrotna kolejność dałaby pierwszą klatkę policzoną z zer, czyli progres 1 na wejściu i
       zdjęcie w pełnym rozmiarze, zanim ktokolwiek zaczął przewijać. */
    remeasureGeometry();
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });

    /* Ponowny pomiar geometrii — i tylko tutaj.
       ---------------------------------------------------------------------------
       Sekcja jest przypiętym panelem, więc jej wysokość i pozycja zmieniają się, gdy setupPanels
       rozstrzyga `pinned`/`flow`, gdy zmienia się `--screen-h`, gdy tłumaczenie przestawi tekst o
       linijkę i gdy dojdzie brakujący obrazek. Wszystkie te przypadki kończą się jednym z tych
       trzech zdarzeń, a `carruleddhi:relayout` jest sygnałem, który setupPanels już wysyła i
       nasłuchuje — patrz komentarz przy nim tam.

       `resize` na telefonie to w większości pasek adresu, ale ponowny pomiar jest tu tani i
       bezpieczny: to dwa odczyty, nie czternaście, i nie przestawia niczego w układzie. Wysokość
       ekranu bierze się z zamrożonego `--screen-h`, więc sam pasek adresu nie zmieni wyniku. */
    const remeasure = () => { remeasureGeometry(); onScroll(); };
    window.addEventListener('resize', remeasure, { passive: true });
    window.addEventListener('orientationchange', remeasure, { passive: true });
    window.addEventListener('carruleddhi:relayout', remeasure);
  }

  function setupPanelDepth() {
    const panels = $$('#main > section');
    panels.forEach((section, index) => {
      section.style.zIndex = String(index + 1);
    });
    /* And the footer above all of them. Its stylesheet value has to be a fixed number,
       so it can only ever be above a fixed number of panels; derived from the real count
       it cannot be wrong. */
    const footer = $('.site-footer');
    if (footer) footer.style.zIndex = String(panels.length + 10);
  }

  function initialize() {
    // The intro overlay goes first and is released independently, so a failure
    // further down can never leave the page hidden behind it.
    const steps = [
      ['panelDepth', setupPanelDepth],
      ['language', setupLanguage],
      ['preloader', setupPreloader],
      ['reveal', setupReveal],
      ['navigation', setupNavigation],
      ['panels', setupPanels],
      ['sectionTransition', setupSectionTransition],
      ['cardStack', setupCardStack],
      ['prizeDeck', setupPrizeDeck],
      ['prizePhotos', setupPrizePhotos],
      ['countdown', setupCountdown],
      /* Po `countdown`, bo dokowanie ma sens tylko wtedy, gdy liczby w kopii są już
         przepisane — inaczej pierwsza zadokowana klatka pokazałaby „00" z HTML-a. */
      ['navClock', setupNavClock],
      /* Rezerwa na środku paska liczona z pomiaru, a nie wpisana. Po `navClock`, bo mierzy
         też miejsce dla zadokowanego licznika — powód w całości przy `syncNavCentreReserve`
         w site-bridge.js. Naprawia zmierzone 42 i 71 px nachodzenia chipu na przyciski w
         fazie głosowania. */
      ['navCentreReserve', watchNavCentreReserve],
      ['footerGlow', setupFooterGlow],
      ['headingFit', setupHeadingFit],
      ['wall', setupWall],
      ['attendance', setupAttendance],
      ['liveCounts', setupLiveCounts],
      ['attendanceRings', setupAttendanceRings],
      ['quickActions', setupQuickActions],
      ['reminderModal', setupReminderModal],
      ['consentGate', setupConsentGate],
      ['registrationForm', setupRegistrationForm],
      ['contactForm', setupContactForm],
      ['accordion', setupAccordion],
      ['cookieConsent', setupCookieConsent],
      ['visitBeacon', setupVisitBeacon],
      ['cursor', setupCursor],
      ['magneticButtons', setupMagneticButtons],
      ['heroMotion', setupHeroMotion],
      /* Zaraz po `heroMotion`, bo dotyczy tej samej sekcji i tego samego pytania „czy hero jest
         na ekranie" — tylko z drugiej strony: tamto dodaje ruch pod wskaźnikiem na pulpicie, to
         zabiera ruch, którego na telefonie nikt nie widzi. */
      ['heroAmbient', setupHeroAmbient],
      ['routeDraw', setupRouteDraw],
      ['sponsors', setupSponsors],
      ['gallery3d', setupGalleryCarousel],
      ['footerYear', setupFooterYear],
      ['reminderWindows', setupReminderWindows],
      ['routeZoom', setupRouteZoom],
      ['unsubscribe', setupUnsubscribe],
      ['chat', setupChat],
      ['textEffects', setupTextEffects]
    ];

    // One broken feature must not take the whole page down with it.
    steps.forEach(([name, step]) => {
      try {
        step();
      } catch (error) {
        console.error(`Carruleddhi: "${name}" failed to initialise.`, error);
      }
    });

    /* A page left open crosses a window boundary eventually. Once an hour is often enough
       to catch that and cheap enough to ignore. */
    window.setInterval(() => {
      try {
        setupReminderWindows();
      } catch (_) {
        /* Not worth a console line every hour. */
      }
    }, 3600000);
    window.addEventListener('carruleddhi:language', () => {
      try {
        setupReminderWindows();
      } catch (_) { /* the chips keep whatever they had */ }
    });

    // Last, and not awaited: the page is already finished without it.
    applyServerSettings().catch(() => {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
