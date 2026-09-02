/**
 * Ocenianie NA ZDJĘCIU: pigułka na środku kadru, morfowanie w suwak, okno z adresem.
 *
 * Uruchamiana przez tools/probe-vote-veil.mjs, wykonywana przez tools/cdp.mjs w prawdziwej
 * przeglądarce i w prawdziwym oknie 390×844 — czyli tam, gdzie `hover: none` jest prawdziwe.
 *
 * PO CO OSOBNA SONDA
 *   `probe-voting-page.js` opisuje poprzedni układ: przycisk POD kafelkiem, osobny krok
 *   „zagłosować na ten wóz?" i oceny jako siatka 4×2. Wszystkie trzy rzeczy zostały zastąpione
 *   nakładką na zdjęciu, więc tamta sonda mierzy stan, którego już nie ma — i wywala się
 *   kaskadowo, zamiast powiedzieć cokolwiek o tym, co jest teraz.
 *
 * CZYM SIĘ RÓŻNI OD probe-voting-mobile.mjs — I DLACZEGO OBIE ZOSTAJĄ
 *   Tamta chodzi PRAWDZIWYMI DOTKNIĘCIAMI przez protokół i mierzy trafialność: czy palec ma
 *   w co uderzyć, czy cele mają 44 px, czy rząd ocen mieści się w kadrze. Ta chodzi
 *   `element.click()`, więc o trafialności nie mówi NIC — za to przechodzi całą drogę razem
 *   z oknem, panelem i paskiem u góry i jest tanim strażnikiem STANÓW: co jest widoczne, co
 *   schowane, co ma jaki napis i jaki kontrast.
 *
 * KONTRAKT, KTÓRY TU JEST SPRAWDZANY (ten sam, co w probe-voting-mobile.mjs):
 *   spoczynek pod palcem   → pigułka „Zagłosuj" WIDOCZNA na zdjęciu, suwak schowany,
 *   jedno kliknięcie       → rząd ocen w miejscu pigułki,
 *   „Wyślij głos"          → okno z adresem.
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

  /* --- stan spoczynku: zdjęcie z widocznym napisem „Zagłosuj" -------------- */
  /**
   * TU JEST CAŁA ZMIANA WZGLĘDEM POPRZEDNIEJ WERSJI TEJ SONDY.
   *
   * Stało tu „nakładka istnieje w drzewie, ale jest NIEWIDOCZNA" — i to była prawda dla obu
   * wskaźników. Pod palcem `:hover` nie istnieje, więc napis „Zagłosuj" nie pojawiał się nigdy,
   * dopóki ktoś nie dotknął zdjęcia w ciemno. Właściciel poprosił, żeby napis BYŁ widoczny, więc
   * arkusz odsłania nakładkę w spoczynku przy `hover: none` (patrz `@media (hover: none)`
   * w voting.css) i to jest teraz mierzone: krycie, pudełko, kontrast napisu do JEGO WŁASNEGO
   * tła (nie do fotografii, bo ta bywa dowolna) i przygaszenie pod pigułką.
   */
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const channels = (value) => {
    const parts = String(value || '').match(/-?[\d.]+/g);
    return parts && parts.length >= 3 ? parts.slice(0, 3).map(Number) : null;
  };
  const luminance = (rgb) => {
    const lin = rgb.map((raw) => {
      const v = raw / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  };
  const contrast = (fg, bg) => {
    const a = channels(fg);
    const b = channels(bg);
    if (!a || !b) return null;
    const la = luminance(a);
    const lb = luminance(b);
    return Math.round(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 100) / 100;
  };

  out.rest = {
    cards: $$('[data-vote-grid] .vote-card').length,
    hasVeil: Boolean(veil),
    hasCta: Boolean(cta),
    hasHit: Boolean(hit) && !hit.hidden,
    hoverNone: window.matchMedia('(hover: none)').matches,
    /* Nakładka z pigułką jest pod palcem WIDOCZNA od razu, ale jej tło nie łapie wskaźnika:
       dotknięcia obok pigułki należą do przezroczystego `.vote-card__hit`, który jest przyciskiem
       z nazwą dla czytnika ekranu. Widoczne tło łapiące wskaźnik i nic nie robiące byłoby martwą
       strefą na całym zdjęciu — to mierzy siatką 5×5 probe-voting-mobile.mjs. */
    veilOpacity: veil ? Number(cs(veil).opacity) : null,
    veilEvents: veil ? cs(veil).pointerEvents : null,
    veilBackdrop: veil ? String(cs(veil).backgroundImage || 'none').slice(0, 120) : '',
    ctaEvents: cta ? cs(cta).pointerEvents : '',
    ctaContrast: cta ? contrast(cs(cta).color, cs(cta).backgroundColor) : null,
    pickHidden: pick ? pick.hidden : null,
    // Żaden przycisk oceny nie stoi POD zdjęciem — o to szła cała zmiana.
    buttonsUnderPhoto: $$('.vote-card__body button', card).length,
    /* Pigułka „Zagłosuj" mierzona TU, w spoczynku, i to jest JEDYNY moment, w którym się da:
       po kliknięciu ustępuje miejsca suwakowi (`display: none`) i jej pudełko jest zerowe.
       Mierzenie jej po kliknięciu zwracało 0 px i wyglądało na zapadnięty przycisk. */
    ctaHeight: cta ? Math.round(box(cta).height) : null,
    ctaWidth: cta ? Math.round(box(cta).width) : null,
    ctaLabel: cta ? cta.textContent.trim() : '',
    ctaInsidePhoto: cta && card
      ? box(cta).top >= box($('.vote-card__photo', card)).top - 1
        && box(cta).bottom <= box($('.vote-card__photo', card)).bottom + 1
      : false
  };

  /* --- jedno kliknięcie: rząd ocen od razu --------------------------------- */
  hit?.click();
  await wait(120);
  out.armed = {
    cardArmed: card.classList.contains('is-armed'),
    veilOpacity: veil ? Number(getComputedStyle(veil).opacity) : null,
    veilEvents: veil ? getComputedStyle(veil).pointerEvents : null,
    hitHidden: hit ? hit.hidden : null,
    ctaLabel: cta ? cta.textContent.trim() : '',
    ctaHeight: cta ? Math.round(box(cta).height) : null,
    pickHidden: pick ? pick.hidden : null
  };

  /* --- to samo kliknięcie w samą pigułkę: skutek musi być ten sam ----------
     Dwa cele, jedna czynność: pigułka i przezroczysta warstwa na całym zdjęciu prowadzą do tego
     samego `toPick()`. Kafelek jest tu już otwarty, więc to kliknięcie sprawdza, że pigułka nie
     ma własnej, innej obsługi — a nie że otwiera cokolwiek po raz drugi. */
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

  /* --- zegar, pasek u góry i szukanie --------------------------------------
     ZEGAR NIE JEST JUŻ PRZYKLEJONY DO GÓRY EKRANU, I TO NIE JEST USTERKA.
     ---------------------------------------------------------------------------
     Stało tu `timerSticky === 'sticky'` — opis układu, którego nie ma od przeniesienia zegara
     w treść strony, pod zdanie, które mówi, o co w tym głosowaniu chodzi. Przy przewijaniu w dół
     jego KOPIA wjeżdża w pasek nawigacji (`.nav-clock--vote`, `[data-clock-docked]`), więc
     `[data-vote-timer]` niosą DWA elementy: ten w treści i ten w pasku. Pytamy więc o oba,
     osobno, po klasach — bez tego `querySelector` łapał kopię w pasku i mierzył jej
     `position: absolute`, ogłaszając usterkę tam, gdzie strona robi to, co ma.

     Pasek postępu i plakietka „%" też są na tej podstronie z powrotem — ta sama nawigacja co na
     stronie głównej, ten sam arkusz. Warunki „progressGone" i „navCurrentGone" opisywały wersję
     bez nich i były po prostu nieprawdą. */
  const timer = $('.vote-timer[data-vote-timer]');
  const dockedTimer = $('[data-vote-timer-dock]');
  out.chrome = {
    timerShown: Boolean(timer) && !timer.hidden,
    timerInFlow: timer ? getComputedStyle(timer).position : '',
    timerDockPresent: Boolean(dockedTimer),
    timerDockReady: Boolean(dockedTimer?.hasAttribute('data-vote-timer-ready')),
    timerText: $('[data-vote-timer-time]')?.textContent.trim() || '',
    ruleGone: !$('[data-vote-rule]'),
    progressPresent: Boolean($('[data-scroll-progress]')),
    navCurrentPresent: Boolean($('[data-nav-current]')),
    searchShown: Boolean($('[data-vote-search]')) && !$('[data-vote-search]').hidden
  };

  return out;
};
