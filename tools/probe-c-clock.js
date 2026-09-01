/**
 * TOR C — odliczanie zadokowane w pasku: czy w ogole sie pokazuje, czy stoi na srodku
 * paska, czy nie nachodzi na marke i przyciski, czy pokazuje te same liczby co licznik
 * w hero i czy znika po powrocie na gore.
 *
 *     node tools/cdp.mjs probe tools/probe-c-clock.js --w 1440 --h 900 --origin http://127.0.0.1:4173
 *     node tools/cdp.mjs probe tools/probe-c-clock.js --w 390  --h 844 --origin http://127.0.0.1:4173
 */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.documentElement.style.scrollBehavior = 'auto';
  document.documentElement.style.scrollSnapType = 'none';

  const header = document.querySelector('.site-header');
  const shell = document.querySelector('.nav-shell');
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) };
  };

  /* Widoczny naprawde, a nie tylko „ma opacity 1": zerowa szerokosc, display: none albo
     visibility: hidden znaczy, ze w tym miejscu paska nie ma nic. */
  const seen = (el) => {
    if (!el) return { exists: false, reallyVisible: false };
    const cs = getComputedStyle(el);
    const b = box(el);
    return {
      exists: true,
      ...b,
      display: cs.display,
      opacity: Number(cs.opacity).toFixed(2),
      visibility: cs.visibility,
      reallyVisible: cs.display !== 'none' && cs.visibility === 'visible' && +cs.opacity > 0.05 && b.w > 4
    };
  };

  /* Cyfry z widoku licznika. Pierwszy [data-days] to hero (stoi wyzej w dokumencie),
     drugi to kopia w pasku — porownanie pilnuje, ze oba widoki karmi jeden timer. */
  const digits = (root) => ['days', 'hours', 'minutes', 'seconds']
    .map((unit) => root.querySelector(`[data-${unit}]`)?.textContent?.trim() ?? '??')
    .join(':');

  const overlap = (a, b) => {
    if (!a || !b || !a.exists || !b.exists) return null;
    return Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x));
  };

  /* Duzy licznik w hero jest widoczny naprawde tylko wtedy, gdy JEST NA EKRANIE i nie lezy
     pod paskiem. Sam `opacity`/`display` tego nie powie: hero jest panelem `position: sticky`
     i geometrycznie nie wychodzi z widoku nigdy — przykrywa go nastepny panel. Dlatego
     „widoczny" znaczy tu: prostokat miesci sie w oknie ponizej paska I zaden pozniejszy panel
     nie zaslonil jego srodka (sprawdzone przez `elementFromPoint`). */
  const heroClockOnScreen = () => {
    const el = document.querySelector('[data-countdown]');
    if (!el) return { exists: false, onScreen: false };
    const r = el.getBoundingClientRect();
    const bar = document.querySelector('.site-header').getBoundingClientRect();
    const cx = Math.round(r.x + r.width / 2);
    const cy = Math.round(r.y + r.height / 2);
    const inWindow = r.bottom > bar.bottom && r.top < window.innerHeight && r.width > 4;
    const hit = inWindow ? document.elementFromPoint(cx, cy) : null;
    const covered = Boolean(hit) && !el.contains(hit) && hit !== el;
    return {
      exists: true,
      hidden: el.hidden,
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      inWindow,
      /* Co naprawde jest w srodku licznika: on sam, czy panel, ktory na niego wjechal. */
      hitBy: hit ? `${hit.tagName.toLowerCase()}${hit.id ? '#' + hit.id : ''}.${hit.className || ''}`.slice(0, 60) : 'nic',
      onScreen: inWindow && !covered
    };
  };

  /* NAMALOWANY NAPIS MARKI, NIE JEJ PUDELKO.
     W stanie zwinietym `.site-header.is-compact .brand` ma `flex: 1`, wiec jej prostokat
     ciagnie sie przez pol paska (zmierzone na 1440: od 453 do 878, czyli 425 px), choc sam
     napis „Carruleddhi" zajmuje okolo stu. Ten sam `.brand` w tym samym stanie zachodzi dzis
     na chip z nazwa sekcji, wiec porownywanie z pudelkiem nie mowiloby nic o tym, czy cokolwiek
     na siebie NACHODZI na ekranie. `Range` nad tekstem daje prostokat glifow, i to on jest tym,
     co ktos widzi. Dla `.nav-actions` pudelko jest w porzadku: to rzad przyciskow, ktore
     wypelniaja je w calosci. */
  const textBox = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
    if (!rects.length) return null;
    return {
      x: Math.round(Math.min(...rects.map((r) => r.left))),
      right: Math.round(Math.max(...rects.map((r) => r.right))),
      exists: true
    };
  };
  const brandTextBox = () => {
    const parts = ['.brand__name', '.brand__date'].map(textBox).filter(Boolean);
    if (!parts.length) return null;
    return { exists: true, x: Math.min(...parts.map((p) => p.x)), right: Math.max(...parts.map((p) => p.right)) };
  };

  const read = (label) => {
    const s = box(shell);
    const clock = seen(document.querySelector('[data-nav-clock]'));
    const current = seen(document.querySelector('.nav-current'));
    const brand = seen(document.querySelector('.brand'));
    const actions = seen(document.querySelector('.nav-actions'));
    const heroClock = heroClockOnScreen();
    const brandText = brandTextBox();
    return {
      label,
      classes: header.className,
      docked: header.hasAttribute('data-clock-docked'),
      atTop: header.hasAttribute('data-nav-at-top'),
      shellX: s.x,
      shellW: s.w,
      clock,
      /* Ile brakuje zadokowanemu licznikowi do srodka paska. Zero znaczy wysrodkowany. */
      clockOffCentre: clock.reallyVisible ? Math.round((clock.x + clock.w / 2) - (s.x + s.w / 2)) : 'niewidoczny',
      /* Zero znaczy: prostokaty sie nie stykaja. Cokolwiek wiekszego to nachodzenie. */
      overlapBrandText: clock.reallyVisible ? overlap(clock, brandText) : 0,
      overlapActions: clock.reallyVisible ? overlap(clock, actions) : 0,
      /* Pudelko marki podane osobno i tylko do wgladu — patrz komentarz przy `textBox`. */
      overlapBrandBox: clock.reallyVisible ? overlap(clock, brand) : 0,
      navCurrentVisible: current.reallyVisible,
      heroClock,
      brandText: brandText ? { x: brandText.x, right: brandText.right } : null,
      brandBox: { x: brand.x, right: brand.right },
      actions: { x: actions.x, right: actions.right },
      digitsHero: digits(document.querySelector('.hero__aside') || document),
      digitsDocked: digits(document.querySelector('[data-nav-clock]') || document)
    };
  };

  const out = { width: window.innerWidth, states: [] };

  /* Nakladka wstepna schodzi z ekranu okolo 900 ms po wczytaniu i az do tej chwili jest tym,
     co `elementFromPoint` znajduje nad licznikiem w hero — pierwszy pomiar wychodzil wtedy
     „licznik w hero zakryty przez div.preloader", co bylo prawda o nakladce, a nie o liczniku. */
  await sleep(1200);

  /* To samo z banerem cookie: na 390x844 lezy on nad licznikiem w hero, wiec pomiar „czy duzy
     licznik jest widoczny" mierzyl baner. Klikniecie „Akceptuj" to stan, w ktorym strone widzi
     kazdy, kto byl tu wczesniej niz raz. */
  document.querySelector('[data-cookie-accept]')?.click();
  await sleep(700);

  /* (a) na gorze strony: duzy licznik w hero widoczny, kopia w pasku nie. */
  out.states.push(read('gora strony'));

  /* (b,c,d,e) ponizej hero: kopia zadokowana, chip z nazwa sekcji wygaszony. */
  window.scrollTo(0, 1600);
  await sleep(1100);
  out.states.push(read('ponizej hero (scrollY 1600)'));

  /* Dalej w dol — „i tam zostaje". */
  window.scrollTo(0, 4200);
  await sleep(1100);
  out.states.push(read('gleboko (scrollY 4200)'));

  /* Pasek rozwinie sie sam przy ruchu w gore (`is-peeked`) — stan, w ktorym w pasku
     wracaja „Bede tam" i pelny wybor jezyka. */
  window.scrollTo(0, 3900);
  await sleep(1100);
  out.states.push(read('ruch w gore, pasek odslonięty'));

  /* Menu otwarte: zadokowany licznik nie ma prawa na nic nachodzic. */
  window.scrollTo(0, 4200);
  await sleep(900);
  document.querySelector('[data-menu-toggle]')?.click();
  await sleep(1000);
  out.states.push(read('gleboko + menu otwarte'));
  document.querySelector('[data-menu-toggle]')?.click();
  await sleep(900);

  /* (f) powrot na gore chowa kopie. */
  window.scrollTo(0, 0);
  await sleep(1200);
  out.states.push(read('powrot na gore'));

  /* Dzien zjazdu: voting.js ustawia [data-countdown].hidden i na miejsce odliczania
     wchodzi zegar glosowania. Kopia w pasku MUSI wtedy zniknac, a nie stac na zerach.
     Czytane po 250 ms, nie po 700: `paintHeroVote` w voting.js chodzi raz na sekunde i
     przepisuje `countdown.hidden` z fazy odczytanej z serwera, wiec dluzsze czekanie mierzy
     stan przywrocony przez tamten timer, a nie skutek ukrycia. Pole `heroClock.hidden` w
     wyniku jest dowodem, ze w chwili pomiaru symulacja jeszcze obowiazywala. */
  window.scrollTo(0, 1600);
  await sleep(1000);
  const hero = document.querySelector('[data-countdown]');
  if (hero) hero.hidden = true;
  await sleep(250);
  out.states.push(read('ponizej hero + licznik hero ukryty'));
  if (hero) hero.hidden = false;
  await sleep(700);
  out.states.push(read('ponizej hero + licznik hero wrocil'));

  return out;
};
