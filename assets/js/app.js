import { DEFAULT_SITE_CONFIG, getPublicSiteConfig } from './site-config.js';
import { DEMO_SPONSORS, demoComments, demoRating } from './demo-content.js';
import { ROUTE_VIEWBOX, buildDashPathData, buildRoutePathData } from './route-path.js';
import { flagSvg } from './flags.js';

(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;
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

  function text(key) {
    const dict = dictionary();
    return dict[key] || (window.CARRULEDDHI_I18N?.it || {})[key] || key;
  }

  function formatHeaderDate(value) {
    const parts = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return parts ? `${parts[3]} · ${parts[2]} · ${parts[1]}` : config.dateLabel;
  }

  function applyPublicConfig() {
    $$('[data-config-event-name]').forEach((element) => { element.textContent = config.eventName; });
    $$('[data-header-date]').forEach((element) => { element.textContent = formatHeaderDate(config.eventDate); });
    const configurableText = [
      ['[data-config-date-label]', config.dateLabel, DEFAULT_SITE_CONFIG.dateLabel],
      ['[data-config-tagline]', config.tagline, DEFAULT_SITE_CONFIG.tagline],
      ['[data-config-route-distance]', config.route.distance, DEFAULT_SITE_CONFIG.route.distance],
      ['[data-config-route-road]', config.route.road, DEFAULT_SITE_CONFIG.route.road]
    ];
    configurableText.forEach(([selector, value, defaultValue]) => {
      if (value === defaultValue) return;
      $$(selector).forEach((element) => { element.textContent = value; });
    });
    if (config.eventName !== DEFAULT_SITE_CONFIG.eventName) document.title = config.eventName;

    $$('[data-contact-email]').forEach((link) => {
      link.textContent = config.contact.email;
      link.href = `mailto:${config.contact.email}`;
    });
    $$('[data-contact-phone]').forEach((link) => {
      link.textContent = config.contact.phone;
      link.href = `tel:${config.contact.phone.replace(/[^+\d]/g, '')}`;
    });
    $$('[data-route-map-link]').forEach((link) => { link.href = config.route.mapUrl; });

    const routeImage = $('[data-route-image]');
    if (routeImage) routeImage.src = config.media.routeImage;
    $$('[data-gallery-image]').forEach((image) => {
      const index = Number.parseInt(image.dataset.galleryImage, 10);
      if (config.media.galleryImages[index]) image.src = config.media.galleryImages[index];
    });

    Object.entries(config.features).forEach(([feature, enabled]) => {
      $$(`[data-feature="${feature}"]`).forEach((element) => { element.hidden = !enabled; });
      $$(`[data-feature-link="${feature}"]`).forEach((element) => { element.hidden = !enabled; });
    });

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

  function showToast(message, duration = 4200) {
    const toast = $('[data-toast]');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove('is-visible'), duration);
  }

  async function postJSON(endpoint, payload) {
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

  function eventPayload(type, data = {}) {
    return {
      type,
      event: config.eventName,
      eventDate: config.eventDate,
      locale: state.lang,
      source: config.preview ? 'website-preview' : 'website',
      submittedAt: new Date().toISOString(),
      ...data
    };
  }

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

  function setTranslatedText(element, value) {
    if (element.textContent === value) return;

    if (reducedMotion || value.length > LETTER_LIMIT || !element.isConnected
      || !element.matches(FLIP_SELECTOR)) {
      element.textContent = value;
      return;
    }
    const box = element.getBoundingClientRect();
    const onScreen = box.bottom > 0 && box.top < window.innerHeight && box.width > 0;
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
   * bisect downwards until scrollWidth fits clientWidth.
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
   * Fits one heading. Always measures — no shortcuts.
   *
   * An earlier version skipped when the element's width had not changed since the
   * last run, which looked like a sensible optimisation and was a bug: the *content*
   * width also changes without the box moving. When the webfont landed, Bungee's
   * wider glyphs pushed "Carruleddhi Classic" 139 px past its box, but the box was
   * still 424 px, so the guard skipped it and the heading stayed too big. The guard
   * belongs in the ResizeObserver, where the loop it was protecting against
   * actually lives.
   */
  function fitOne(element) {
    // Remember the size the stylesheet wants, so repeated runs never ratchet down.
    if (!element.dataset.fitBase) {
      element.style.removeProperty('font-size');
      element.dataset.fitBase = String(parseFloat(getComputedStyle(element).fontSize) || 0);
    }
    const base = Number(element.dataset.fitBase);
    if (!base) return;
    if (element.clientWidth < 8) return;

    element.style.fontSize = `${base}px`;
    if (element.scrollWidth <= element.clientWidth + 1) return;

    // Bisect between 45% and 100% of the intended size. Eight rounds lands within a
    // fraction of a pixel, and stopping at 45% means a pathological string makes the
    // heading small rather than making it silently unreadable.
    let low = base * 0.45;
    let high = base;
    for (let round = 0; round < 8; round += 1) {
      const middle = (low + high) / 2;
      element.style.fontSize = `${middle}px`;
      if (element.scrollWidth <= element.clientWidth + 1) low = middle;
      else high = middle;
    }
    element.style.fontSize = `${low.toFixed(2)}px`;
  }

  function fitHeadings() {
    for (const element of $$(FIT_SELECTOR)) fitOne(element);
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
          fitOne(entry.target);
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
          fitOne(entry.target);
        }
      }, { rootMargin: '200px 0px' });
      $$(FIT_SELECTOR).forEach((element) => seen.observe(element));
    }

    schedule();
    // The webfont changes every measurement, so this has to run again once it lands.
    document.fonts?.ready?.then(schedule).catch(() => {});
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('orientationchange', schedule, { passive: true });
    // New text, new widths: everything has to be measured again.
    window.addEventListener('carruleddhi:language', schedule);
  }

  function applyLanguage(language, persist = true) {
    const available = Object.keys(window.CARRULEDDHI_I18N || {});
    const lang = available.includes(language) ? language : 'it';
    state.lang = lang;
    const dict = dictionary();

    $$('[data-i18n]').forEach((element) => {
      const key = element.dataset.i18n;
      if (typeof dict[key] === 'string') setTranslatedText(element, dict[key]);
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

    document.documentElement.lang = lang;
    document.title = dict['meta.title'] || config.eventName;
    const description = $('meta[name="description"]');
    if (description && dict['meta.description']) description.content = dict['meta.description'];

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
      setPickerOpen(false, true);
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

  function setupNavigation() {
    const header = $('[data-header]');
    const menuToggle = $('[data-menu-toggle]');
    const menu = $('[data-mobile-menu]');
    const backdrop = $('[data-menu-backdrop]');
    const currentLabel = $('[data-current-section]');
    const currentProgress = $('[data-nav-progress]');
    const sections = $$('main section[id]').filter((section) => !section.hidden);
    const labelKeys = {
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
      header?.classList.toggle('is-compact', !open && window.scrollY > 120);
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
      if (currentProgress) currentProgress.textContent = `${String(Math.round(ratio * 100)).padStart(2, '0')}%`;

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
        const goingUp = y < updateHeaderPeek.lastY - 3;
        const goingDown = y > updateHeaderPeek.lastY + 3;
        if (goingUp) header.classList.add('is-peeked');
        else if (goingDown || y < 120) header.classList.remove('is-peeked');
        if (goingUp || goingDown) updateHeaderPeek.lastY = y;
      }
      header?.classList.toggle('is-compact', y > 120 && !menu?.classList.contains('is-open'));
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
      card.style.filter = `brightness(${(1 - eased * 0.26).toFixed(3)})`;
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
    scheduleUpdate();
  }

  function setupPrizeDeck() {
    const deck = $('[data-prize-deck]');
    const cards = $$('[data-prize-card]', deck || document);
    if (!deck || !cards.length) return;
    deck.tabIndex = 0;
    deck.setAttribute('aria-label', 'Interactive prize cards');

    function layout() {
      const total = cards.length;
      cards.forEach((card, index) => {
        const relative = (index - state.deckIndex + total) % total;
        card.style.setProperty('--deck-i', String(Math.min(relative, 7)));
        card.style.zIndex = String(total - relative);
        card.style.opacity = relative > 7 ? '0' : String(Math.max(0.55, 1 - relative * 0.055));
        // `filter: saturate()` used to be set here on seven stacked cards. Every
        // frame of the floating artwork then forced each of them to re-filter a
        // 440x540 surface, and that is what made the deck judder. Opacity and
        // transform composite; filter does not.
        card.style.pointerEvents = relative === 0 ? 'auto' : 'none';
        card.setAttribute('aria-hidden', relative === 0 ? 'false' : 'true');
      });
      const current = $('[data-deck-current]');
      if (current) current.textContent = String(state.deckIndex + 1).padStart(2, '0');
    }

    /**
     * @param {number} direction  1 sends the top card away to the left and brings
     *                            the next one up, -1 goes back.
     */
    function advance(direction = 1) {
      if (state.deckLocked) return;
      state.deckLocked = true;
      const outgoing = cards[state.deckIndex];
      outgoing.style.removeProperty('transform');
      outgoing.style.removeProperty('transition');
      void outgoing.offsetWidth;
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
        return;
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
      window.setTimeout(once, 460);
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

    const paint = () => {
      dragFrame = 0;
      if (!drag) return;
      const { dx, dy } = drag;
      drag.card.style.transform =
        `translate(-50%, -50%) translate(${dx.toFixed(1)}px, ${(dy * 0.22).toFixed(1)}px)`
        + ` rotate(${(dx * 0.03).toFixed(2)}deg)`;
    };

    deck.addEventListener('pointerdown', (event) => {
      const card = event.target.closest('[data-prize-card]');
      if (!card || card !== cards[state.deckIndex] || state.deckLocked) return;
      drag = { card, startX: event.clientX, startY: event.clientY, dx: 0, dy: 0, moved: false };
      card.setPointerCapture?.(event.pointerId);
      card.style.transition = 'none';
      // Stops the page from scrolling under a sideways drag on a touchscreen, and
      // freezes the floating artwork so the card feels like a solid object.
      deck.classList.add('is-dragging');
    });

    deck.addEventListener('pointermove', (event) => {
      if (!drag) return;
      drag.dx = event.clientX - drag.startX;
      drag.dy = event.clientY - drag.startY;
      drag.moved ||= Math.abs(drag.dx) > 4 || Math.abs(drag.dy) > 4;
      if (!dragFrame) dragFrame = requestAnimationFrame(paint);
    });

    const release = () => {
      if (!drag) return;
      const { card, dx, moved } = drag;
      drag = null;
      cancelAnimationFrame(dragFrame);
      dragFrame = 0;
      deck.classList.remove('is-dragging');
      card.style.removeProperty('transition');
      card.style.removeProperty('transform');
      if (!moved) { advance(1); return; }
      if (dx <= -52) advance(1);
      else if (dx >= 52) advance(-1);
    };

    deck.addEventListener('pointerup', release);
    deck.addEventListener('pointercancel', release);
    deck.addEventListener('lostpointercapture', release);
    deck.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight' || event.key === ' ') { event.preventDefault(); advance(1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); advance(-1); }
    });
    $('[data-deck-next]')?.addEventListener('click', () => advance(1));
    $('[data-deck-prev]')?.addEventListener('click', () => advance(-1));
    layout();
  }

  function setupCountdown() {
    const target = new Date(config.eventDate).getTime();
    const units = {
      days: $('[data-days]'), hours: $('[data-hours]'),
      minutes: $('[data-minutes]'), seconds: $('[data-seconds]')
    };
    function update() {
      const difference = Math.max(0, target - Date.now());
      const days = Math.floor(difference / 86400000);
      const hours = Math.floor((difference % 86400000) / 3600000);
      const minutes = Math.floor((difference % 3600000) / 60000);
      const seconds = Math.floor((difference % 60000) / 1000);
      if (units.days) units.days.textContent = String(days).padStart(2, '0');
      if (units.hours) units.hours.textContent = String(hours).padStart(2, '0');
      if (units.minutes) units.minutes.textContent = String(minutes).padStart(2, '0');
      if (units.seconds) units.seconds.textContent = String(seconds).padStart(2, '0');
    }
    update();
    window.setInterval(update, 1000);
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
    last.textContent = `+${formatNumber(rest)}`;
    last.hidden = rest <= 0;
  }

  function paintCounters(animate = false, previousAttendance = attendeeTotal()) {
    $$('[data-attendee-count]').forEach((element) => {
      if (animate) animateNumber(element, previousAttendance, attendeeTotal());
      else element.textContent = formatNumber(attendeeTotal());
    });
    $$('[data-pilots-count]').forEach((element) => {
      element.textContent = formatNumber(pilotTotal());
    });
    paintAvatars();
  }

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
    const previous = attendeeTotal();
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
    const previous = attendeeTotal();
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
        const optimistic = attendeeTotal();
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

    showToast(text('attendance.seeYou'));

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

  async function loadGlobalCounts() {
    if (!config.endpoints.counts) return;
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
      paintCounters(true);
    } catch (error) {
      console.warn('Global counters are temporarily unavailable:', error);
    }
  }

  /**
   * Live counters.
   *
   * Polling only runs while a counter is actually on screen and the tab is in
   * the foreground. That keeps the numbers current without hammering the
   * backend: every poll costs Make credits, so an always-on 5 second timer
   * would drain a free plan in a day.
   */
  function setupLiveCounts() {
    if (!config.endpoints.counts) return;
    const targets = $$('[data-attendee-count], [data-pilots-count]');
    if (!targets.length) return;

    const intervalMs = 45000;
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

    const measure = () => {
      frame = 0;
      const height = band.offsetHeight || 1;
      const left = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      const progress = clamp((height - left) / height, 0, 1);
      band.style.setProperty(
        '--footer-glow-progress',
        (minimum + (1 - minimum) * progress).toFixed(4)
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(schedule).observe(document.body);
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
          // Focus the first field, but only after the panel has somewhere to put it —
          // focusing inside a zero-height box scrolls the page to the wrong place.
          window.setTimeout(() => $('#wall-name', section)?.focus(), 260);
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
        item.style.setProperty('--tilt', `${(Math.random() * 2.4 - 1.2).toFixed(2)}deg`);

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
      const submit = $('button[type="submit"]', form);
      if (submit) submit.disabled = true;
      if (status) status.textContent = text('wall.sending');

      const rating = currentRating();
      const result = await ask({
        type: 'wall-post',
        name,
        place: String(form.elements.namedItem('place').value || '').trim(),
        message,
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
        if (!result.pending) load(false);
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
    const rivals = [
      ...$$('a[href="#signup"]'),
      ...$$('[data-open-reminder]'),
      $('#signup'),
      $('#contact')
    ].filter(Boolean).filter((element) => !dock.contains(element));

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
    };
    const expand = (sticky) => {
      dock.classList.remove('is-mini');
      window.clearTimeout(expandTimer);
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
        return;
      }
      if (!goingDown) return;
      if (!downSince) { downSince = performance.now(); return; }
      if (performance.now() - downSince > SHRINK_DELAY) dock.classList.add('is-mini');
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
    window.setTimeout(() => modalFocusable(modal)[0]?.focus(), 30);
  }

  function closeReminder() {
    const modal = $('[data-reminder-modal]');
    if (!modal) return;
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
    focusTarget?.focus?.();
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

  function validateControl(control) {
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
        $('[data-reminder-form-view]', modal)?.classList.add('is-hidden');
        $('[data-reminder-success]', modal)?.classList.add('is-visible');
        if (!state.attended) registerAttendance(false);
        if (result.demo) showToast(text('common.webhookDemo'));
      } catch (error) {
        console.error('Reminder webhook failed:', error);
        showToast(text('contact.error'));
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
      riderAge: years === null ? '' : String(years)
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
    let loaded = false;
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

    async function loadDocuments() {
      if (loaded) return;
      loaded = true;
      const sources = [
        ['consent.rulesHeading', 'regolamento.html'],
        ['consent.privacyHeading', 'privacy.html']
      ];
      const parts = [];
      for (const [headingKey, url] of sources) {
        try {
          /* `same-origin`, not `omit`.
             These are two pages of this same site, and `omit` meant the request went
             without the cookie the visitor is already holding — so the password gate
             answered 401 and the dialogue showed "could not load the document, open it
             in a new tab" for both. Omitting credentials is the right default for the
             API, which is a public endpoint with its own authentication; it is the
             wrong one for fetching a page of the site you are standing on. */
          const response = await fetch(url, { credentials: 'same-origin' });
          if (!response.ok) throw new Error(String(response.status));
          const markup = await response.text();
          const parsed = new DOMParser().parseFromString(markup, 'text/html');
          const article = parsed.querySelector('.legal-content');
          if (!article) throw new Error('no .legal-content');
          article.querySelectorAll('script, style, iframe, form, object, embed').forEach((node) => node.remove());
          article.querySelectorAll('a[href]').forEach((link) => {
            link.setAttribute('target', '_blank');
            link.setAttribute('rel', 'noopener noreferrer');
          });
          const block = document.createElement('section');
          block.className = 'consent-doc';
          const heading = document.createElement('h3');
          heading.textContent = text(headingKey);
          block.append(heading, article);
          parts.push(block);
        } catch (error) {
          console.warn(`Consent document ${url} could not be inlined:`, error);
          const fallback = document.createElement('p');
          fallback.className = 'consent-doc__fallback';
          fallback.innerHTML = `${text('consent.error')} <a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
          parts.push(fallback);
        }
      }
      if (loading) loading.remove();
      if (content) {
        content.hidden = false;
        content.append(...parts);
      }
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

    function close() {
      if (dialog.open) dialog.close();
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
        showToast(text('consent.savedToast'));
      }, reducedMotion ? 0 : 520);
    });

    dialog.addEventListener('close', () => {
      externalAccept = null;
      // The reminder pop-up is a `.modal`, and it is still open underneath, so the
      // lock has to stay on when the dialog closes back onto it.
      document.body.classList.toggle('is-locked', Boolean($('.modal.is-open')));
    });
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

  function setupExistingEntry(form) {
    const panel = $('[data-entry-found]', form);
    if (!panel) return;

    const choices = $('[data-entry-choices]', panel);
    const codeStep = $('[data-entry-code-step]', panel);
    const editStep = $('[data-entry-edit-step]', panel);
    const status = $('[data-entry-status]', panel);
    const codeField = $('#entry-code', panel);
    const codeError = $('[data-entry-code-error]', panel);
    const emailOf = () => String(form.elements.namedItem('email')?.value || '').trim().toLowerCase();

    const show = (which) => {
      if (choices) choices.hidden = which !== 'choices';
      if (codeStep) codeStep.hidden = which !== 'code';
      if (editStep) editStep.hidden = which !== 'edit';
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
        ENTRY_NO_CODE: 'entry.codeExpired',
        ENTRY_BAD_CODE: 'entry.codeShort',
        ENTRY_NOT_FOUND: 'entry.gone',
        ENTRY_MAIL_FAILED: 'entry.mailFailed'
      };
      return map[result?.code] || 'entry.failed';
    };

    /* ---------------------------------------------------------------- other address */
    $('[data-entry-action="other"]', panel)?.addEventListener('click', () => {
      panel.hidden = true;
      show('choices');
      say('');
      const field = form.elements.namedItem('email');
      field.value = '';
      markField(field, true);
      field.focus();
      window.dispatchEvent(new Event('carruleddhi:relayout'));
    });

    /* ------------------------------------------------------- edit / withdraw: send code */
    const askForCode = async (intent, button) => {
      entryIntent = intent;
      const email = emailOf();
      const original = button.textContent;
      button.disabled = true;
      say('entry.sending');
      try {
        const result = await postJSON(config.endpoints.entryCode, eventPayload('entry-code', { email }));
        if (!result?.ok) throw Object.assign(new Error('code'), { payload: result });
        const sent = $('[data-entry-sent]', panel);
        // The masked address comes from the server, so it is the address the letter went to
        // rather than the one on screen — which is the same thing right up until it is not.
        if (sent) sent.textContent = `${text('entry.codeSent') || ''} ${result.email || ''}`.trim();
        say('');
        show('code');
        codeField?.focus();
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

    /* ------------------------------------------------------------- code confirmed */
    $('[data-entry-confirm]', panel)?.addEventListener('click', async (event) => {
      const code = String(codeField?.value || '').replace(/\D/g, '');
      if (codeError) codeError.textContent = '';
      if (code.length !== 6) {
        if (codeError) codeError.textContent = text('entry.codeShort') || '';
        codeField?.focus();
        return;
      }

      const button = event.currentTarget;
      button.disabled = true;
      say('entry.checking');
      try {
        if (entryIntent === 'withdraw') {
          const result = await postJSON(config.endpoints.entryManage, eventPayload('entry-manage', {
            email: emailOf(),
            code,
            action: 'withdraw'
          }));
          if (!result?.ok) throw Object.assign(new Error('withdraw'), { payload: result });
          show('choices');
          if (choices) choices.hidden = true;
          say('entry.withdrawn');
          return;
        }

        /* Edit: fetch first, then show the fields filled in.
           An empty form would be a form that silently blanks everything somebody does not
           re-type — `view` returns the current values and they go straight into the inputs,
           so leaving a field alone leaves the data alone. */
        const result = await postJSON(config.endpoints.entryManage, eventPayload('entry-manage', {
          email: emailOf(),
          code,
          action: 'view'
        }));
        if (!result?.ok) throw Object.assign(new Error('view'), { payload: result });
        const entry = result.entry || {};
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
      } catch (error) {
        const key = explain(error.payload);
        if (codeError && key.startsWith('entry.code')) codeError.textContent = text(key) || '';
        else say(key);
        if (error.payload?.left !== undefined && codeError) {
          codeError.textContent = `${text('entry.codeWrong') || ''} ${error.payload.left}`;
        }
      } finally {
        button.disabled = false;
      }
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
          phone: $('#entry-phone', panel)?.value || '',
          postalCode: $('#entry-postal', panel)?.value || '',
          address: $('#entry-address', panel)?.value || '',
          cartName: $('#entry-cart', panel)?.value || '',
          teamName: $('#entry-team', panel)?.value || '',
          cartNotes: $('#entry-notes', panel)?.value || ''
        }));
        if (!result?.ok) throw Object.assign(new Error('update'), { payload: result });
        show('choices');
        if (choices) choices.hidden = true;
        say('entry.saved');
      } catch (error) {
        say(explain(error.payload));
      } finally {
        button.disabled = false;
      }
    });
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

    const original = button.textContent;
    button.disabled = true;
    button.textContent = text('form.checking') || original;
    try {
      const result = await postJSON(endpoint, eventPayload('entry-lookup', { email }));
      if (!result?.ok || !result.exists) return false;

      const initials = $('[data-entry-initials]', panel);
      if (initials) {
        // Two letters, not the name. Enough to tell "that is mine" from "somebody else uses
        // this address"; not enough to be worth harvesting.
        initials.textContent = result.initials
          ? `${text('entry.initials') || ''} ${result.initials}`.trim()
          : '';
        initials.hidden = !result.initials;
      }

      /* An entry that is already withdrawn, or a minor's.
         Both are dead ends for self-service and for different reasons: there is nothing to
         withdraw from, and a minor's entry rests on a signed guardian authorisation that a
         six-digit code cannot stand in for. Saying so and offering the other address is more
         use than three buttons of which two will fail. */
      const blocked = result.withdrawn || result.minor;
      const choices = $('[data-entry-choices]', panel);
      $$('[data-entry-action]', panel).forEach((choice) => {
        choice.hidden = blocked && choice.dataset.entryAction !== 'other';
      });
      if (choices) choices.hidden = false;
      $('[data-entry-code-step]', panel).hidden = true;
      $('[data-entry-edit-step]', panel).hidden = true;
      const status = $('[data-entry-status]', panel);
      if (status) {
        status.textContent = result.withdrawn
          ? text('entry.alreadyOut') || ''
          : (result.minor ? text('entry.minorHelp') || '' : '');
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
        const proposed = Number(config.pilotsBase) + state.registrations + 1;
        const raceNumber = String(result.raceNumber || proposed).padStart(3, '0');
        state.registrations += 1;
        if (Number.isFinite(state.remotePilots)) state.remotePilots += 1;
        state.lastRegistration = { ...data, raceNumber, submittedAt: new Date().toISOString() };
        storage.set('carruleddhi.registrations', String(state.registrations));
        const number = $('[data-race-number]');
        if (number) number.textContent = raceNumber;
        form.hidden = true;
        $('[data-form-success]')?.classList.add('is-active');
        paintCounters(false);
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
        showToast(text(key), 7000);
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
    let pointerX = -100;
    let pointerY = -100;
    let ringX = -100;
    let ringY = -100;

    window.addEventListener('pointermove', (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      dot.style.left = `${pointerX}px`;
      dot.style.top = `${pointerY}px`;
      dot.style.opacity = '1';
      ring.style.opacity = '1';
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

    function animate() {
      ringX += (pointerX - ringX) * 0.16;
      ringY += (pointerY - ringY) * 0.16;
      ring.style.left = `${ringX}px`;
      ring.style.top = `${ringY}px`;
      requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
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

    /**
     * The viewBox height tracks the frame's real aspect ratio. With a matching
     * aspect and preserveAspectRatio="none", one user unit is the same length on
     * both axes, so the ribbon normals are not skewed.
     */
    function layout() {
      const box = frame.getBoundingClientRect();
      if (!box.width || !box.height) return false;
      viewHeight = Math.round((box.height / box.width) * ROUTE_VIEWBOX);
      svg.setAttribute('viewBox', `0 0 ${ROUTE_VIEWBOX} ${viewHeight}`);

      const data = buildRoutePathData(config.route.path, ROUTE_VIEWBOX, viewHeight);
      if (!data) return false;
      core.setAttribute('d', data);
      mask.setAttribute('d', data);
      dash.setAttribute('d', data);
      total = core.getTotalLength();

      const near = clamp(Number(config.route.width?.near) || 26, 4, 80);
      const far = clamp(Number(config.route.width?.far) || 5, 1, 40);
      mask.setAttribute('stroke-width', String(Math.max(24, near * 3.2)));
      // Road markings: an outlined dash run instead of one solid ribbon.
      // Both passes share the dash rhythm; only the outline is padded outwards.
      const dashOptions = { near, far, height: viewHeight };
      ribbonCasing.setAttribute('d', buildDashPathData(core, { ...dashOptions, widthScale: 1, widthPad: 2.6 }));
      ribbonFill.setAttribute('d', buildDashPathData(core, dashOptions));
      return true;
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
      place(startPin, 0, 22);
      place(finishPin, total, 22);
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

    if (!layout()) {
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
        if (!layout()) return;
        mask.style.strokeDasharray = `${total}`;
        mask.style.strokeDashoffset = drawn || reducedMotion ? '0' : `${total}`;
        placeMarkers();
      });
    };
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
       accurate one taken repeatedly. */
    const alwaysFlow = new Set(['categories', 'prizes', 'signup', 'contact']);

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

    function measure() {
      selfInflicted = true;
      const viewport = window.innerHeight;
      const routeFlows = window.innerWidth <= routeFlowsBelow;
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
        const previous = panel.dataset.panel;
        panel.dataset.panel = 'measure';
        const needed = panel.scrollHeight;
        panel.dataset.panel = needed > viewport + 4 ? 'flow' : 'pinned';
        if (previous === panel.dataset.panel) return;
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
    const schedule = () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(fallback);
      frame = requestAnimationFrame(run);
      fallback = window.setTimeout(run, 80);
    };

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
    const onResize = () => {
      const width = window.innerWidth;
      if (width === lastWidth) return;
      lastWidth = width;
      schedule();
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
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(() => {
        if (selfInflicted) return;
        schedule();
      });
      panels.forEach((panel) => observer.observe(panel));
    }

    measure();
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', () => {
      lastWidth = window.innerWidth;
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
      const image = document.createElement('img');
      image.src = sponsor.image;
      image.alt = duplicate ? '' : (sponsor.name || 'Sponsor');
      image.loading = 'lazy';
      image.decoding = 'async';
      item.appendChild(image);
      return item;
    };

    sponsors.forEach((sponsor) => track.appendChild(build(sponsor, false)));
    sponsors.forEach((sponsor) => track.appendChild(build(sponsor, true)));

    band.hidden = false;
    band.style.setProperty('--sponsor-speed', `${Math.max(18, sponsors.length * 6)}s`);

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
  function setupGalleryCarousel() {
    const section = $('[data-gallery3d]');
    if (!section) return;
    // Lifecycle marker: makes it obvious in DevTools whether this step ran,
    // whether the lazy chunk was requested, and whether it initialised.
    section.dataset.g3dState = 'init';
    if (!config.features.gallery) {
      section.hidden = true;
      section.dataset.g3dState = 'feature-off';
      return;
    }

    const captions = [1, 2, 3, 4, 5].map((number) => text(`gallery.caption${number}`));
    const start = () => {
      section.dataset.g3dState = 'loading';
      import('./gallery-3d.js')
        .then(({ setupGallery3D }) => {
          section.dataset.g3dState = 'module-ready';
          const instance = setupGallery3D({
            images: config.media.galleryImages,
            captions,
            reducedMotion
          });
          if (instance) {
            document.querySelector('[data-gallery-fallback]')?.setAttribute('hidden', '');
            section.dataset.ready = '1';
            section.dataset.g3dState = 'ready';
          } else {
            section.dataset.g3dState = 'declined';
          }
        })
        .catch((error) => {
          console.warn('3D gallery unavailable, keeping the grid:', error);
          section.dataset.g3dState = `failed: ${error?.message || error}`;
          section.hidden = true;
        });
    };

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
      window.removeEventListener('scroll', onFirstScroll);
      window.clearTimeout(fallbackTimer);
      start();
    };

    function onFirstScroll() {
      const box = section.getBoundingClientRect();
      if (box.top < window.innerHeight * 2.2) kickOff();
    }

    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) kickOff();
      }, { rootMargin: '700px 0px' });
      observer.observe(section);
    }
    window.addEventListener('scroll', onFirstScroll, { passive: true });
    fallbackTimer = window.setTimeout(kickOff, 2600);
    onFirstScroll();
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

    /* Sponsors. The panel stores a bucket path and the function hands back a signed URL,
       so what arrives here is ready to put in a src. `image` is the name the renderer
       already uses; renaming it there would touch the CSS as well for no gain. */
    if (Array.isArray(settings.sponsors)) {
      const usable = settings.sponsors
        .filter((sponsor) => sponsor && sponsor.name && sponsor.logo)
        .map((sponsor) => ({
          name: String(sponsor.name),
          url: String(sponsor.url || ''),
          image: String(sponsor.logo)
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

    const play = (element) => {
      element.classList.add('is-playing');
      window.clearTimeout(Number(element.dataset.fxTimer) || 0);
      delete element.dataset.fxTimer;
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
      played.forEach((element) => element.classList.add('is-playing'));
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
        codeField?.focus();
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

    const token = chatToken();
    let opened = false;
    let polling = 0;
    let lastAt = '';
    let mode = 'ai';
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
          input?.focus();
        } else {
          $('#chat-gate-name', panel)?.focus();
        }
      } else {
        stopPolling();
      }
    };

    /* ---------------------------------------------------------------- gate */
    /** Shows either the two fields or the conversation, never both. */
    function applyGate() {
      const done = identified();
      if (gate) gate.hidden = done;
      if (log) log.hidden = !done;
      if (form) form.hidden = !done;
      if (chips) chips.hidden = !done;
      panel.dataset.chatReady = done ? 'yes' : 'no';
    }

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
        field?.focus();
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
      applyGate();
      openThread();
      startPolling();
      input?.focus();
      // The card disappearing changes the section's height, and #contact is a sticky panel
      // that decides whether to pin from its own height.
      window.dispatchEvent(new Event('carruleddhi:relayout'));
    });

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => selectTab(tab.dataset.contactTab));
    });

    /* -------------------------------------------------------------- render */
    const bubble = (author, body, pending) => {
      const row = document.createElement('div');
      row.className = `chat-msg chat-msg--${author}${pending ? ' is-pending' : ''}`;
      const who = document.createElement('span');
      who.className = 'chat-msg__who';
      who.textContent = author === 'visitor'
        ? (text('chat.you') || 'Ty')
        : author === 'organiser'
          ? (text('chat.them') || 'Organizator')
          : (text('chat.bot') || 'Automat');
      const said = document.createElement('p');
      said.className = 'chat-msg__body';
      // textContent, not innerHTML: this string came from a stranger, and the organiser's
      // half came out of a database that a stranger can write to.
      said.textContent = body;
      row.append(who, said);
      return row;
    };

    /* Scrolled to the bottom only when the reader was already there. Yanking somebody back
       down while they are reading further up is the thing every chat gets wrong. */
    const atBottom = () => !log || log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    const toBottom = () => { if (log) log.scrollTop = log.scrollHeight; };

    const append = (message, pending) => {
      if (!log) return null;
      if (message.id && seen.has(message.id)) return null;
      if (message.id) seen.add(message.id);
      const stick = atBottom();
      const node = bubble(message.author, message.body, pending);
      log.appendChild(node);
      if (stick) toBottom();
      if (message.at && message.at > lastAt) lastAt = message.at;
      return node;
    };

    const note = (key) => {
      if (!log) return;
      const line = document.createElement('p');
      line.className = 'chat__system';
      line.textContent = text(key) || '';
      log.appendChild(line);
      toBottom();
    };

    /* ---------------------------------------------------------------- open */
    async function openThread() {
      if (opened) return;
      opened = true;
      try {
        const result = await postJSON(endpoint, eventPayload('chat', { action: 'open', token }));
        if (!result || result.ok === false) throw new Error(result?.code || 'chat');
        mode = result.mode || 'ai';
        (result.messages || []).forEach((message) => append(message, false));
        // A thread with no history opens with a greeting rather than a blank box: an empty
        // chat looks broken, and nobody types the first message into a void.
        if (!(result.messages || []).length) {
          append({ author: 'ai', body: text('chat.greeting') || '', at: '' }, false);
        }
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
      const stick = atBottom();
      log.appendChild(typingRow);
      if (stick) toBottom();
    };
    const hideTyping = () => {
      typingRow?.remove();
      typingRow = null;
    };

    /* ---------------------------------------------------------------- send */
    let sending = false;

    async function send(body) {
      const message = String(body || '').trim();
      if (!message) return;
      /* One in flight at a time.
         The submit handler and the Enter handler both call this, and a fast double press —
         or a click on the button while Enter is still being processed — used to start two
         requests with the same text. The button being disabled is not enough on its own,
         because Enter does not go through the button. */
      if (sending) return;
      sending = true;

      // Shown before the round trip, greyed until it lands. A chat that waits for the
      // server before showing what you typed feels broken on a slow connection.
      const pending = append({ author: 'visitor', body: message, at: '' }, true);
      if (input) input.value = '';
      sizeInput();
      if (sendButton) sendButton.disabled = true;
      showTyping();

      try {
        const result = await postJSON(endpoint, eventPayload('chat', {
          action: 'send',
          token,
          message,
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
        if (result.replyId) seen.add(result.replyId);
        for (const at of [result.messageAt, result.replyAt]) {
          if (at && at > lastAt) lastAt = at;
        }

        mode = result.mode || mode;
        if (result.reply) append({ author: 'ai', body: result.reply, at: '' }, false);
        if (mode === 'human') panel.dataset.chatMode = 'human';
        // Fresh suggestions after every answer, so the chips follow the conversation instead
        // of offering the same six openers for ever.
        paintChips();
      } catch (_) {
        pending?.classList.add('is-failed');
        note('chat.sendFailed');
      } finally {
        hideTyping();
        sending = false;
        if (sendButton) sendButton.disabled = false;
      }
    }

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
      const next = Math.min(input.scrollHeight, 140);
      if (next !== lastInputHeight) {
        lastInputHeight = next;
        input.style.height = `${next}px`;
      } else {
        input.style.height = `${lastInputHeight}px`;
      }
    }
    input?.addEventListener('input', sizeInput);

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
        chip.addEventListener('click', () => {
          askedKeys.add(key);
          // Sent as the question it reads as, so it takes the same path as anything typed.
          send(chip.textContent.trim());
          setChipsOpen(false);
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
        try {
          const result = await postJSON(endpoint, eventPayload('chat', {
            action: 'poll',
            token,
            since: lastAt
          }));
          if (!result || result.ok === false) return;
          mode = result.mode || mode;
          (result.messages || []).forEach((message) => append(message, false));
        } catch (_) {
          /* A dropped poll is not worth telling anybody about; the next one retries. */
        }
      }, CHAT_POLL_MS);
    }

    function stopPolling() {
      window.clearInterval(polling);
      polling = 0;
    }

    applyGate();
    paintChips();

    /* Somebody arriving at #contact from the chat link in an e-mail wants the chat, not the
       form. Also how the unsubscribe card hands over once that flow moves in here. */
    if (/(?:^|[#&])chat\b/.test(window.location.hash)) selectTab('chat');
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

    const measure = () => {
      queued = false;
      const viewport = window.innerHeight || 1;
      const top = documentTop(section);
      const height = section.offsetHeight;
      const y = window.scrollY || window.pageYOffset || 0;

      /* Two thirds of the travel happens while the section is arriving, the rest while it is
         pinned. `end` stops short of the point where the next panel begins covering this
         one, so the photograph has finished growing before anything slides over it —
         a picture still expanding under an incoming card reads as two animations arguing. */
      /* Measured: with this layout the section is exactly one viewport tall, so `height -
         viewport` is zero and the whole animation has to happen on the way in. Starting a
         screen and a tenth early gives it enough scroll to be seen; finishing as the panel
         pins means the photograph is already at rest when the next card begins sliding over
         it, which is the order asked for. */
      const start = top - viewport * 1.1;
      const end = top + Math.max(height - viewport, 0) * 0.55;
      const span = Math.max(end - start, 1);

      const progress = clamp((y - start) / span, 0, 1);
      frame.style.setProperty('--route-progress', progress.toFixed(3));
      /* And on the root, for everything outside the frame that follows the same number — the
         heading and the facts beside the photograph.
         ---------------------------------------------------------------------------
         Setting it on `#route` and letting it inherit down to `.route__copy` was the obvious
         thing and it does not work. Measured: the copy read `--route-progress` as 0.091 while
         its own `opacity: calc(1 - var(--route-progress) * .58)` stayed pinned at the value
         for 1. The variable inherited; the properties that depend on it were never recomputed.
         Removing `will-change` from the element did not change it either.

         On the root it invalidates reliably, which is the whole reason `:root` is where custom
         properties usually live. The frame keeps its own copy because it already had one and a
         self-declared property was never the part that misbehaved. */
      document.documentElement.style.setProperty('--route-progress', progress.toFixed(3));

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

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    // The section is a sticky panel whose own height changes when app.js decides between
    // `pinned` and `flow`, so a resize needs a fresh measurement rather than the old one.
    window.addEventListener('resize', onScroll, { passive: true });
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
      ['countdown', setupCountdown],
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
      ['cursor', setupCursor],
      ['magneticButtons', setupMagneticButtons],
      ['heroMotion', setupHeroMotion],
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
