/**
 * Ocenianie NA ZDJĘCIU: nakładka, przycisk na środku, morfowanie w suwak.
 *
 * Uruchamiana przez tools/probe-vote-veil.mjs, wykonywana przez tools/cdp.mjs w prawdziwej
 * przeglądarce i w prawdziwym oknie 390×844.
 *
 * PO CO OSOBNA SONDA
 *   `probe-voting-page.js` opisuje poprzedni układ: przycisk POD kafelkiem, osobny krok
 *   „zagłosować na ten wóz?" i oceny jako siatka 4×2. Wszystkie trzy rzeczy zostały zastąpione
 *   nakładką na zdjęciu, więc tamta sonda mierzy stan, którego już nie ma — i wywala się
 *   kaskadowo, zamiast powiedzieć cokolwiek o tym, co jest teraz.
 *
 *   Ta sonda sprawdza dokładnie to, co zamówiono: kafelek jest czysty, dotknięcie odsłania
 *   jedno zaproszenie, kliknięcie zamienia je w suwak, a wysyłka otwiera okno z adresem.
 */
async (document, window) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

  // Kafelki wchodzą po odczycie stanu; bez tego sonda mierzy pustą siatkę.
  for (let i = 0; i < 80 && !$('[data-vote-grid] .vote-card'); i += 1) await wait(150);

  const kill = document.createElement('style');
  kill.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}';
  document.head.appendChild(kill);
  await wait(150);

  const out = { consoleErrors: [] };
  window.addEventListener('error', (e) => out.consoleErrors.push(String(e.message)));

  const card = $('[data-vote-grid] .vote-card');
  const veil = $('.vote-veil', card);
  const cta = $('.vote-veil__cta', card);
  const pick = $('.vote-veil__pick', card);
  const hit = $('.vote-card__hit', card);
  const box = (el) => (el ? el.getBoundingClientRect() : null);

  /* --- stan spoczynku: kafelek jest samym zdjęciem ------------------------- */
  out.rest = {
    cards: $$('[data-vote-grid] .vote-card').length,
    hasVeil: Boolean(veil),
    hasCta: Boolean(cta),
    hasHit: Boolean(hit) && !hit.hidden,
    // Nakładka istnieje w drzewie, ale jest niewidoczna i nie łapie wskaźnika.
    veilOpacity: veil ? Number(getComputedStyle(veil).opacity) : null,
    veilEvents: veil ? getComputedStyle(veil).pointerEvents : null,
    pickHidden: pick ? pick.hidden : null,
    // Żaden przycisk oceny nie stoi POD zdjęciem — o to szła cała zmiana.
    buttonsUnderPhoto: $$('.vote-card__body button', card).length
  };

  /* --- dotknięcie: nakładka odsłonięta, jedno zaproszenie na środku -------- */
  hit?.click();
  await wait(120);
  out.armed = {
    cardArmed: card.classList.contains('is-armed'),
    veilOpacity: veil ? Number(getComputedStyle(veil).opacity) : null,
    veilEvents: veil ? getComputedStyle(veil).pointerEvents : null,
    hitHidden: hit ? hit.hidden : null,
    ctaLabel: cta ? cta.textContent.trim() : '',
    ctaHeight: cta ? Math.round(box(cta).height) : null,
    // Zaproszenie ma stać NA zdjęciu, nie pod nim.
    ctaInsidePhoto: cta && card
      ? box(cta).top >= box($('.vote-card__photo', card)).top - 1
        && box(cta).bottom <= box($('.vote-card__photo', card)).bottom + 1
      : false,
    pickHidden: pick ? pick.hidden : null
  };

  /* --- kliknięcie: przycisk przeistacza się w suwak ------------------------ */
  cta?.click();
  await wait(160);
  const slider = $('.vote-slider', card);
  out.picking = {
    cardPicking: card.classList.contains('is-picking'),
    ctaGone: cta ? getComputedStyle(cta).display === 'none' : null,
    pickShown: pick ? !pick.hidden : null,
    hasSlider: Boolean(slider),
    sliderMin: slider ? slider.min : '',
    sliderMax: slider ? slider.max : '',
    sliderHeight: slider ? Math.round(box(slider).height) : null,
    // Suwak wyrasta w tym samym miejscu, w którym stał przycisk.
    pickInsidePhoto: pick && card
      ? box(pick).top >= box($('.vote-card__photo', card)).top - 1
      : false,
    sendLabel: $('.vote-veil__send', card)?.textContent.trim() || '',
    sendHeight: $('.vote-veil__send', card) ? Math.round(box($('.vote-veil__send', card)).height) : null,
    // Kontrast: podpis nad suwakiem na białym tle nie może być biały.
    labelColor: $('.vote-picker__label', card)
      ? getComputedStyle($('.vote-picker__label', card)).color
      : ''
  };

  /* --- jeden odsłonięty kafelek na stronę --------------------------------- */
  const second = $$('[data-vote-grid] .vote-card')[1];
  $('.vote-card__hit', second)?.click();
  await wait(120);
  out.single = {
    firstStillPicking: card.classList.contains('is-picking'),
    firstStillArmed: card.classList.contains('is-armed'),
    secondArmed: second ? second.classList.contains('is-armed') : null,
    armedCount: $$('.vote-card.is-armed').length,
    pickingCount: $$('.vote-card.is-picking').length
  };

  /* --- wysyłka otwiera okno z adresem ------------------------------------- */
  $('.vote-card__hit', card)?.click();
  await wait(100);
  $('.vote-veil__cta', card)?.click();
  await wait(140);
  const slider2 = $('.vote-slider', card);
  if (slider2) {
    slider2.value = '9';
    slider2.dispatchEvent(new Event('input', { bubbles: true }));
  }
  await wait(80);
  $('.vote-veil__send', card)?.click();
  await wait(320);
  const dialog = $('[data-vote-dialog]');
  out.dialog = {
    open: Boolean(dialog?.open),
    score: $('[data-vote-dialog-score]')?.textContent.trim() || '',
    who: $('[data-vote-dialog-who]')?.textContent.trim() || '',
    // Imię i adres są opcjonalne — pola nie mogą być wymagane.
    nameRequired: Boolean($('#vote-name')?.required),
    emailRequired: Boolean($('#vote-email')?.required),
    notifyPresent: Boolean($('[data-vote-notify]')),
    notifyDisabled: $('[data-vote-notify]') ? $('[data-vote-notify]').disabled : null,
    bodyLocked: document.body.classList.contains('is-locked')
  };

  /* --- zegar w pasku i szukanie ------------------------------------------- */
  const timer = $('[data-vote-timer]');
  out.chrome = {
    timerShown: Boolean(timer) && !timer.hidden,
    timerSticky: timer ? getComputedStyle(timer).position : '',
    timerText: $('[data-vote-timer-time]')?.textContent.trim() || '',
    ruleGone: !$('[data-vote-rule]'),
    progressGone: !$('[data-scroll-progress]'),
    navCurrentGone: !$('[data-nav-current]'),
    searchShown: Boolean($('[data-vote-search]')) && !$('[data-vote-search]').hidden
  };

  return out;
};
