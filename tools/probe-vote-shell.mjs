/**
 * PODSTRONA GŁOSOWANIA MA BYĆ CZĘŚCIĄ TEJ SAMEJ STRONY, A NIE OSOBNYM SERWISEM.
 * ===========================================================================
 *
 *   node tools/cdp.mjs probe tools/probe-vote-shell.mjs --w 390 --h 844 \
 *        --url "/votazione.html?lang=pl" --origin http://127.0.0.1:4173 \
 *        --inject tools/inject-voting-open.js --wait 3000
 *
 * Cztery pytania, cztery sekcje. Wszystkie z pomiaru, żadne „na oko":
 *
 *   1. SZEW  — czy nagłówek i stopka na podstronie to TE SAME elementy co na stronie
 *              głównej: te same klasy, te same wysokości (z tolerancją), to samo tło.
 *   2. KONTRAST — czy tekst nagłówka i tekst treści da się przeczytać. Liczone wzorem
 *              WCAG na barwach ZŁOŻONYCH przez cały stos tła, nie na deklaracji z arkusza.
 *   3. SIATKA — dokładnie dwie kolumny na 320, 360, 390 i 430 px, bez obcinania kafelka.
 *   4. PIERWSZY EKRAN — ile pikseli zajmuje wszystko NAD pierwszym kafelkiem i czy kafelek
 *              mieści się w pierwszym ekranie.
 *
 * DLACZEGO STRONA GŁÓWNA JEST MIERZONA W RAMCE, A NIE W DRUGIM PRZEBIEGU SONDY
 *   Pytanie brzmi „czy TE SAME", więc obie liczby muszą powstać w jednym pomiarze i w tym
 *   samym oknie. Dwa osobne uruchomienia dałyby dwie tabelki do porównania ręcznie — a
 *   ręczne porównanie jest dokładnie tym, co ta sonda ma zastąpić. Ramka ma szerokość i
 *   wysokość okna, więc zapytania o media w środku odpowiadają tak samo jak na wierzchu.
 *
 * DLACZEGO SZEROKOŚCI 320/360/390/430 TEŻ W RAMKACH
 *   `Emulation.setDeviceMetricsOverride` ustawia jedną szerokość na cały przebieg, więc
 *   sprawdzenie czterech telefonów kosztowałoby cztery uruchomienia przeglądarki i cztery
 *   osobne wyniki. Ramka o zadanej szerokości ma własny widok układu, więc `@media` w
 *   środku działa tak, jak na telefonie tej szerokości — a wszystkie cztery liczby stoją
 *   w jednym raporcie, jedna pod drugą.
 */
async (document, window) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

  const out = { steps: [], fail: [], measures: {}, notes: [] };
  const ok = (label, pass, extra = '') => {
    out.steps.push(`${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? ` -> ${extra}` : ''}`);
    if (!pass) out.fail.push(`${label}${extra ? ` (${extra})` : ''}`);
    return pass;
  };

  /* Czekamy na kafelek, nie na stałą liczbę milisekund: faza i stawka przychodzą z sieci.
     Brak kafelków nie przerywa sondy — sekcje 1, 2 i 3 mają wtedy nadal co mierzyć, a
     sekcja 4 mówi wprost, że nie było czego mierzyć. */
  for (let i = 0; i < 60 && !$('[data-vote-grid] .vote-card:not(.vote-card--skeleton)'); i += 1) await wait(150);

  /* Przejścia i animacje wyłączone: mierzone są POŁOŻENIA i WYSOKOŚCI, a element w połowie
     przejścia ma inne pudełko niż na końcu. Dokładane po rozruchu, żeby go nie zmieniać. */
  const kill = document.createElement('style');
  kill.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}';
  document.head.appendChild(kill);
  await wait(120);
  document.documentElement.style.scrollBehavior = 'auto';

  out.viewport = `${window.innerWidth}x${window.innerHeight}`;

  /* ======================================================================= barwy */

  /**
   * Kontrast liczony na barwie ZŁOŻONEJ, bo tylko taką widzi oko.
   *
   * Deklaracja z arkusza nie wystarcza: pasek nawigacji ma `rgba(7,26,61,.9)`, czyli
   * dziewięćdziesiąt procent granatu NA TYM, co leży pod nim. Sonda pytająca o samo
   * `background-color` policzyłaby kontrast względem koloru, którego na ekranie nie ma.
   *
   * GRADIENTY LICZONE ŚREDNIĄ, I TO JEST PRZYBLIŻENIE — ŚWIADOME.
   *   Nagłówek sekcji i kafelki mają tło z `linear-gradient`, więc pod jednym napisem leży
   *   nie jedna barwa, a przejście. Sonda bierze średnią z przystanków gradientu i składa ją
   *   jak zwykłą warstwę. To nie jest pomiar najgorszego punktu — jest po to, żeby wyłapać
   *   pomyłkę rzędu „granat na granacie", a nie żeby rozstrzygać spory o dziesiąte części.
   *   Miejsca, w których takie przybliżenie weszło do rachunku, są wypisane w `notes`.
   */
  const parseColor = (value) => {
    const text = String(value || '');
    let m = text.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.%]+))?\s*\)/);
    if (m) {
      const alpha = m[4] === undefined ? 1 : (String(m[4]).endsWith('%') ? parseFloat(m[4]) / 100 : Number(m[4]));
      return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: alpha };
    }
    m = text.match(/^#([0-9a-f]{3,8})$/i);
    if (m) {
      const hex = m[1].length === 3
        ? m[1].split('').map((c) => c + c).join('')
        : m[1];
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
      };
    }
    return null;
  };
  const over = (top, bottom) => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1
  });
  /** Średnia z przystanków gradientu — patrz komentarz wyżej. */
  const imageLayer = (image) => {
    const found = String(image || '').match(/(rgba?\([^)]*\)|#[0-9a-f]{3,8})/gi) || [];
    const colors = found.map(parseColor).filter(Boolean);
    if (!colors.length) return null;
    const sum = colors.reduce((acc, c) => ({
      r: acc.r + c.r * c.a, g: acc.g + c.g * c.a, b: acc.b + c.b * c.a, a: acc.a + c.a
    }), { r: 0, g: 0, b: 0, a: 0 });
    if (sum.a <= 0) return null;
    return { r: sum.r / sum.a, g: sum.g / sum.a, b: sum.b / sum.a, a: sum.a / colors.length };
  };
  const effectiveBg = (el, view = window) => {
    const layers = [];
    const gradients = [];
    for (let node = el; node; node = node.parentElement) {
      const cs = view.getComputedStyle(node);
      const image = imageLayer(cs.backgroundImage);
      if (image) {
        layers.push(image);
        gradients.push(node.className || node.tagName.toLowerCase());
      }
      const solid = parseColor(cs.backgroundColor);
      if (solid && solid.a > 0) {
        layers.push(solid);
        if (solid.a >= 1) break;
      }
    }
    /* Płótno przeglądarki jest białe, gdy żadna warstwa nie kryje w stu procentach. */
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i -= 1) base = over(layers[i], base);
    return { color: base, gradients };
  };
  const luminance = ({ r, g, b }) => {
    const channel = (value) => {
      const v = value / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const hex = ({ r, g, b }) => '#' + [r, g, b]
    .map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  /**
   * Kontrast napisu względem tego, na czym leży.
   *
   * `min` podawane osobno dla każdego napisu, bo WCAG ma dwa progi: 4.5 dla zwykłego pisma
   * i 3.0 dla dużego (18.66 px pogrubione albo 24 px). Próg dobierany z faktycznego rozmiaru
   * i grubości, nie z domysłu — inaczej wielki napis w nagłówku byłby zgłaszany jako błąd,
   * a drobny podpis przechodziłby.
   */
  const contrast = (selector, label, root = document, view = window) => {
    const el = typeof selector === 'string' ? $(selector, root) : selector;
    if (!el) {
      out.measures[`kontrast: ${label}`] = 'elementu nie ma';
      return null;
    }
    const cs = view.getComputedStyle(el);
    const fore = parseColor(cs.color);
    const { color: back, gradients } = effectiveBg(el, view);
    if (!fore) return null;
    const solidFore = fore.a >= 1 ? fore : over(fore, back);
    const l1 = luminance(solidFore);
    const l2 = luminance(back);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const size = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    out.measures[`kontrast: ${label}`] =
      `${ratio.toFixed(2)}:1 (${hex(solidFore)} na ${hex(back)}, ${Math.round(size)}px/${weight}, próg ${need})`;
    if (gradients.length) out.notes.push(`kontrast „${label}": w stosie tła są gradienty (${gradients.slice(0, 2).join(', ')}) — barwa uśredniona`);
    ok(`kontrast ≥ ${need}: ${label}`, ratio >= need, `${ratio.toFixed(2)}:1`);
    return ratio;
  };

  /* ============================================================ 1. NAGŁÓWEK I STOPKA */

  /**
   * Opis szwu zdejmowany z dokumentu, nie z pamięci.
   *
   * Ta sama funkcja chodzi po tej stronie i po stronie głównej wczytanej w ramce, więc
   * różnica w wyniku jest różnicą w znaczniku, a nie różnicą w sposobie mierzenia.
   */
  const shell = (root, view) => {
    const header = $('.site-header', root);
    const navShell = header ? $('.nav-shell', header) : null;
    const footer = $('.site-footer', root);
    const box = (el) => (el ? Math.round(el.getBoundingClientRect().height) : null);
    return {
      header: {
        present: Boolean(header),
        classes: header ? Array.from(header.classList).sort().join(' ') : '',
        hasDataHeader: Boolean(header && header.hasAttribute('data-header')),
        height: box(header),
        navShellHeight: box(navShell),
        bottom: header ? Math.round(header.getBoundingClientRect().bottom) : null,
        position: header ? view.getComputedStyle(header).position : '',
        navShellBg: navShell ? view.getComputedStyle(navShell).backgroundColor : '',
        navShellRadius: navShell ? view.getComputedStyle(navShell).borderTopLeftRadius : '',
        brandName: $('.brand__name', root)?.textContent.trim() || '',
        brandDate: $('[data-header-date]', root)?.textContent.trim() || '',
        navCurrent: Boolean($('.nav-current', root)),
        navClock: Boolean($('[data-nav-clock], [data-vote-timer-dock]', root)),
        languageOptions: $$('[data-language-option]', root).length,
        menuToggle: Boolean($('[data-menu-toggle]', root)),
        menuBackdrop: Boolean($('[data-menu-backdrop]', root)),
        mobileMenu: Boolean($('[data-mobile-menu]', root)),
        menuLinks: $$('[data-mobile-menu] .menu-panel__links a', root).length,
        menuLangs: $$('[data-menu-language]', root).length
      },
      footer: {
        present: Boolean(footer),
        classes: footer ? Array.from(footer.classList).sort().join(' ') : '',
        height: box(footer),
        background: footer ? view.getComputedStyle(footer).backgroundColor : '',
        paddingTop: footer ? view.getComputedStyle(footer).paddingTop : '',
        brand: $('.footer__brand', root)?.textContent.replace(/\s+/g, ' ').trim() || '',
        groups: $$('.site-footer .footer__group', root).length,
        groupTitles: $$('.site-footer .footer__group h3', root).map((h) => h.textContent.trim()),
        links: $$('.site-footer .footer__links a', root).map((a) => a.getAttribute('href')),
        legalLinks: $$('.site-footer .footer__links a[href*="privacy"], .site-footer .footer__links a[href*="cookies"], .site-footer .footer__links a[href*="regolamento"]', root).length,
        patron: Boolean($('.site-footer .patron--footer', root)),
        bottom: Boolean($('.site-footer .footer__bottom', root)),
        glow: Boolean($('.site-footer [data-footer-glow]', root)),
        glowColumns: $$('.site-footer .footer-glow__col', root).length
      }
    };
  };

  out.vote = shell(document, window);

  /**
   * Strona główna w ramce tej samej wielkości co okno.
   *
   * `?probe=shell` niczego nie włącza — jest po to, żeby w dzienniku serwera dało się
   * odróżnić wejście sondy od wejścia człowieka.
   */
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = `position:fixed;left:0;top:0;border:0;opacity:0;pointer-events:none;z-index:-1;width:${window.innerWidth}px;height:${window.innerHeight}px`;
  frame.src = '/index.html?probe=shell';
  document.body.append(frame);
  await new Promise((done) => {
    frame.addEventListener('load', done, { once: true });
    setTimeout(done, 12000);
  });
  /* Strona główna ma ekran wstępny i odsłania pasek po nim — dajemy jej na to czas, a potem
     wyłączamy w niej przejścia tym samym sposobem co u siebie. */
  await wait(2600);
  let home = null;
  try {
    const doc = frame.contentDocument;
    const style = doc.createElement('style');
    style.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}';
    doc.head.appendChild(style);
    await wait(150);
    home = shell(doc, frame.contentWindow);
    out.homeConsole = doc.querySelector('.preloader') && !doc.querySelector('.preloader').hidden
      ? 'ekran wstępny nadal w drzewie (nie przeszkadza w pomiarze paska)'
      : '';
  } catch (error) {
    out.notes.push(`strony głównej nie dało się zmierzyć w ramce: ${error.message}`);
  }
  out.home = home;

  if (home) {
    const near = (a, b, tol) => a !== null && b !== null && Math.abs(a - b) <= tol;
    out.measures['pasek: wysokość podstrona/strona główna'] =
      `${out.vote.header.navShellHeight} / ${home.header.navShellHeight} px`;
    out.measures['stopka: wysokość podstrona/strona główna'] =
      `${out.vote.footer.height} / ${home.footer.height} px`;

    ok('nagłówek: ta sama klasa `site-header` na obu stronach',
      out.vote.header.present && home.header.present && out.vote.header.classes === home.header.classes,
      `"${out.vote.header.classes}" vs "${home.header.classes}"`);
    ok('nagłówek: ten sam atrybut `data-header`',
      out.vote.header.hasDataHeader === home.header.hasDataHeader,
      `${out.vote.header.hasDataHeader} vs ${home.header.hasDataHeader}`);
    ok('nagłówek: ta sama wysokość paska (±4 px)',
      near(out.vote.header.navShellHeight, home.header.navShellHeight, 4),
      `${out.vote.header.navShellHeight} vs ${home.header.navShellHeight}`);
    ok('nagłówek: ta sama dolna krawędź (±4 px)',
      near(out.vote.header.bottom, home.header.bottom, 4),
      `${out.vote.header.bottom} vs ${home.header.bottom}`);
    ok('nagłówek: to samo tło paska',
      out.vote.header.navShellBg === home.header.navShellBg,
      `${out.vote.header.navShellBg} vs ${home.header.navShellBg}`);
    ok('nagłówek: to samo zaokrąglenie paska',
      out.vote.header.navShellRadius === home.header.navShellRadius,
      `${out.vote.header.navShellRadius} vs ${home.header.navShellRadius}`);
    ok('nagłówek: marka z datą wydarzenia',
      out.vote.header.brandName === home.header.brandName && Boolean(out.vote.header.brandDate),
      `${out.vote.header.brandName} / ${out.vote.header.brandDate}`);
    ok('nagłówek: chip z nazwą sekcji jest na obu stronach',
      out.vote.header.navCurrent && home.header.navCurrent,
      `podstrona ${out.vote.header.navCurrent}, główna ${home.header.navCurrent}`);
    ok('nagłówek: zadokowany licznik jest na obu stronach',
      out.vote.header.navClock && home.header.navClock,
      `podstrona ${out.vote.header.navClock}, główna ${home.header.navClock}`);
    ok('nagłówek: ten sam wybór języka (sześć pozycji)',
      out.vote.header.languageOptions === home.header.languageOptions && out.vote.header.languageOptions === 6,
      `${out.vote.header.languageOptions} vs ${home.header.languageOptions}`);
    ok('nagłówek: przycisk menu, tło menu i panel menu',
      out.vote.header.menuToggle && out.vote.header.menuBackdrop && out.vote.header.mobileMenu,
      `toggle=${out.vote.header.menuToggle}, backdrop=${out.vote.header.menuBackdrop}, panel=${out.vote.header.mobileMenu}`);
    ok('menu: wybór języka także w rozwiniętym panelu, jak na stronie głównej',
      out.vote.header.menuLangs === home.header.menuLangs && out.vote.header.menuLangs === 6,
      `${out.vote.header.menuLangs} vs ${home.header.menuLangs}`);

    ok('stopka: ta sama klasa `site-footer` na obu stronach',
      out.vote.footer.present && home.footer.present && out.vote.footer.classes === home.footer.classes,
      `"${out.vote.footer.classes}" vs "${home.footer.classes}"`);
    ok('stopka: to samo tło', out.vote.footer.background === home.footer.background,
      `${out.vote.footer.background} vs ${home.footer.background}`);
    ok('stopka: ten sam odstęp górny', out.vote.footer.paddingTop === home.footer.paddingTop,
      `${out.vote.footer.paddingTop} vs ${home.footer.paddingTop}`);
    ok('stopka: ta sama liczba grup odsyłaczy', out.vote.footer.groups === home.footer.groups,
      `${out.vote.footer.groups} vs ${home.footer.groups}`);
    ok('stopka: te same nagłówki grup',
      out.vote.footer.groupTitles.join('|') === home.footer.groupTitles.join('|'),
      `${out.vote.footer.groupTitles.join('|')} vs ${home.footer.groupTitles.join('|')}`);
    ok('stopka: ta sama liczba odsyłaczy', out.vote.footer.links.length === home.footer.links.length,
      `${out.vote.footer.links.length} vs ${home.footer.links.length}`);
    ok('stopka: wszystkie trzy dokumenty prawne', out.vote.footer.legalLinks === 3,
      String(out.vote.footer.legalLinks));
    ok('stopka: blok sponsora, stopka dolna i tęcza',
      out.vote.footer.patron && out.vote.footer.bottom && out.vote.footer.glow
      && out.vote.footer.glowColumns === home.footer.glowColumns,
      `patron=${out.vote.footer.patron}, bottom=${out.vote.footer.bottom}, tęcza=${out.vote.footer.glowColumns}/${home.footer.glowColumns}`);
    /**
     * Tolerancja 56 px ma jedną, ZMIERZONĄ przyczynę, a nie „jakiś zapas".
     *
     * W stopce strony głównej stoi obok trzech odsyłaczy prawnych przycisk „Impostazioni
     * cookie", który otwiera baner zgody. Baner i jego obsługa mieszkają w index.html i
     * app.js — na tej podstronie nie ma ani jednego, ani drugiego, więc przycisk byłby
     * kontrolką bez działania. Nie ma go, a `@media (pointer: coarse)` daje każdej pozycji w
     * stopce 46 px wysokości plus odstęp. Stąd różnica i stąd ta liczba: gdyby stopka
     * rozjechała się o cokolwiek WIĘCEJ, znaczyłoby to zmianę, o której nikt nie wie.
     */
    ok('stopka: ta sama wysokość (±56 px, patrz komentarz)',
      near(out.vote.footer.height, home.footer.height, 56),
      `${out.vote.footer.height} vs ${home.footer.height}`);
    /* Odsyłacze podstrony muszą prowadzić do sekcji strony głównej, a nie do zakotwiczeń,
       których na tej stronie nie ma — `#route` byłby skokiem w to samo miejsce. */
    const danglers = out.vote.footer.links.filter((href) => href && href.startsWith('#'));
    ok('stopka: żaden odsyłacz nie prowadzi do zakotwiczenia, którego tu nie ma',
      danglers.length === 0, danglers.join(', '));

    /* Paleta strony: podstrona ma czytać się jak ta sama witryna, więc tło dokumentu nie może
       być z innego świata niż tło strony głównej. Porównywana JASNOŚĆ, nie barwa — hero ma
       gradient, więc równość co do bajta byłaby warunkiem, którego nie da się spełnić. */
    const voteBody = effectiveBg(document.body).color;
    const homeBody = effectiveBg(frame.contentDocument.body, frame.contentWindow).color;
    out.measures['tło dokumentu podstrona/strona główna'] =
      `${hex(voteBody)} (L ${luminance(voteBody).toFixed(3)}) / ${hex(homeBody)} (L ${luminance(homeBody).toFixed(3)})`;
    ok('paleta: tło podstrony z tej samej jasności co strona główna (±0.18 luminancji)',
      Math.abs(luminance(voteBody) - luminance(homeBody)) <= 0.18,
      `${luminance(voteBody).toFixed(3)} vs ${luminance(homeBody).toFixed(3)}`);
  }

  /* ============================================== 1b. NAGŁÓWEK MA DZIAŁAĆ, NIE TYLKO WYGLĄDAĆ */

  /**
   * Wspólny znacznik to połowa roboty — druga połowa to zachowanie.
   *
   * Na stronie głównej menu i wybór języka obsługuje app.js, którego ta podstrona nie wciąga.
   * Znacznik przeniesiony bez obsługi daje przycisk „Menu", który nic nie otwiera, i rząd kodów
   * języka, który nic nie zmienia — czyli nagłówek wyglądający jak tam i niedziałający jak tam.
   * Dlatego sonda naciska, a nie ogląda: otwiera panel, wybiera język i pyta, co się zmieniło.
   */
  const toggle = $('[data-menu-toggle]');
  const menu = $('[data-mobile-menu]');
  const backdrop = $('[data-menu-backdrop]');
  toggle?.click();
  await wait(220);
  const langRow = $('[data-menu-langs]');
  out.menu = {
    opened: Boolean(menu?.classList.contains('is-open')),
    ariaExpanded: toggle?.getAttribute('aria-expanded') || '',
    ariaHidden: menu?.getAttribute('aria-hidden') || '',
    backdropOpen: Boolean(backdrop?.classList.contains('is-open')),
    bodyLocked: document.body.classList.contains('is-locked'),
    langRowVisible: Boolean(langRow) && langRow.getBoundingClientRect().height > 1,
    langBefore: document.documentElement.lang
  };
  ok('menu: przycisk otwiera panel', out.menu.opened && out.menu.ariaExpanded === 'true',
    `is-open=${out.menu.opened}, aria-expanded=${out.menu.ariaExpanded}`);
  ok('menu: tło menu zasłania stronę i przewijanie jest zablokowane',
    out.menu.backdropOpen && out.menu.bodyLocked,
    `backdrop=${out.menu.backdropOpen}, is-locked=${out.menu.bodyLocked}`);
  ok('menu: rząd języków jest widoczny w otwartym panelu', out.menu.langRowVisible);

  /* Wybór z panelu musi zmienić język CAŁEJ strony i zamknąć panel — po to się go otwiera.
     Kliknięcie w kod, nie wywołanie funkcji: chodzi o to, czy droga jest przejezdna. */
  $('[data-menu-language="en"]')?.click();
  await wait(320);
  out.menu.langAfter = document.documentElement.lang;
  out.menu.closedAfterPick = !menu?.classList.contains('is-open');
  out.menu.flagAfter = $('[data-language-code]')?.textContent.trim() || '';
  out.menu.pressed = $('[data-menu-language="en"]')?.getAttribute('aria-pressed') || '';
  ok('menu: wybór języka z panelu przełącza całą stronę',
    out.menu.langAfter === 'en' && out.menu.flagAfter === 'EN',
    `lang=${out.menu.langAfter}, flaga=${out.menu.flagAfter}`);
  ok('menu: po wyborze języka panel się zamyka', out.menu.closedAfterPick === true);
  ok('menu: wybrany kod jest oznaczony jako wciśnięty', out.menu.pressed === 'true', out.menu.pressed);

  /* Z powrotem na polski, żeby dalsze pomiary szły w tym języku, w którym sonda została
     uruchomiona — inaczej długości napisów w pasku i w stopce byłyby z innego słownika. */
  $('[data-menu-language="pl"]')?.click();
  await wait(320);

  /* Chip z nazwą sekcji: na górze strony wygaszony, po przewinięciu widoczny — dokładnie jak
     na stronie głównej w hero. Sprawdzane krycie, nie `display`: pasek nie ma powodu
     przeskakiwać, a chip jest pozycjonowany bezwzględnie i nie zajmuje miejsca w układzie. */
  window.scrollTo(0, 0);
  await wait(260);
  const chip = $('.nav-current');
  const header = $('.site-header');
  out.chip = {
    atTopAttr: Boolean(header?.hasAttribute('data-nav-at-top')),
    opacityAtTop: chip ? getComputedStyle(chip).opacity : '',
    section: $('[data-current-section]')?.textContent.trim() || ''
  };
  window.scrollTo(0, 600);
  await wait(320);
  out.chip.atTopAfterScroll = Boolean(header?.hasAttribute('data-nav-at-top'));
  out.chip.opacityScrolled = chip ? getComputedStyle(chip).opacity : '';
  out.chip.progress = $('[data-nav-progress]')?.textContent.trim() || '';
  ok('chip: na samej górze wygaszony, tak jak w hero strony głównej',
    out.chip.atTopAttr === true && out.chip.opacityAtTop === '0',
    `data-nav-at-top=${out.chip.atTopAttr}, krycie ${out.chip.opacityAtTop}`);
  ok('chip: po przewinięciu widoczny i niesie nazwę sekcji w bieżącym języku',
    out.chip.atTopAfterScroll === false && Boolean(out.chip.section),
    `sekcja „${out.chip.section}", krycie ${out.chip.opacityScrolled}`);
  /* Napis wpisany w znacznik to „100%". Po przewinięciu o 600 px musi być inny — i musi być
     MNIEJSZY, bo ten chip mówi „ile strony zostało", tak samo jak na stronie głównej. */
  ok('chip: procent przewinięcia jest liczony i odlicza w dół, jak na stronie głównej',
    /^\d{2,3}%$/.test(out.chip.progress) && Number.parseInt(out.chip.progress, 10) < 100,
    out.chip.progress);
  window.scrollTo(0, 0);
  await wait(260);

  /* ==================================================================== 2. KONTRAST */

  contrast('.site-header .brand__name', 'marka w pasku');
  contrast('.site-header .brand__date', 'data w pasku');
  contrast('.site-header .nav-current__progress', 'procent w pasku');
  contrast('.site-header .nav-clock--vote .nav-clock__number', 'zegar zadokowany w pasku');
  contrast('.vote-head h1', 'tytuł strony');
  contrast('[data-vote-lead]', 'zdanie wiodące');
  contrast('[data-vote-kicker]', 'nadtytuł');
  contrast('.vote-timer__label', 'podpis zegara w treści');
  contrast('.vote-count', 'licznik pozycji nad siatką');
  /* `:not(.is-active)`, bo pierwszy filtr w rzędzie to „wszystkie" i jest wybrany od wejścia —
     samo `.vote-filter` mierzyło więc dwa razy ten sam, wybrany przycisk i nie widziało
     pozostałych, które mają inne tło i inny kolor napisu. */
  contrast('.vote-filter:not(.is-active)', 'filtr kategorii (nieaktywny)');
  contrast('.vote-filter.is-active', 'filtr kategorii (aktywny)');
  contrast('.vote-search input', 'pole szukania');
  contrast('.vote-card__title', 'nazwa pojazdu na zdjęciu');
  contrast('.vote-card__rider', 'podpis pod nazwą na zdjęciu');
  /**
   * DWA NAPISY, KTÓRYCH NIE MA, DOPÓKI KTOŚ NIE ZAGŁOSUJE — A ZMIERZYĆ TRZEBA JE TERAZ.
   *
   * `.vote-card__yours` („twoja ocena: 9") pojawia się tylko na kafelku z oddanym głosem, a
   * `.vote-card__used` tylko wtedy, gdy jedyna dozwolona zmiana jest już zużyta. Oba leżą POD
   * zdjęciem, czyli na powierzchni kafelka — jedynym miejscu na tej stronie, gdzie tekst leży
   * wprost na tle, które ta tura zmieniła z granatu na jasną szybkę. Przeoczenie ich znaczyłoby
   * powtórzenie dokładnie tej pomyłki, którą ta tura naprawia.
   *
   * Sonda nie oddaje więc głosu — to droga probe-voting-mobile.mjs i nie ma sensu przechodzić
   * jej dwa razy. Wstawia napis o tej klasie w prawdziwy kafelek, mierzy barwy złożone i
   * natychmiast go zdejmuje. Mierzone jest to samo, co zobaczy człowiek: ta klasa na tej
   * powierzchni. `is-voted` dokładane na czas pomiaru, bo to ono zmienia tło kafelka na zielony
   * nalot i to na nim ten napis naprawdę stanie.
   */
  const contrastOnCard = (className, label, voted) => {
    const card = $('[data-vote-grid] .vote-card:not(.vote-card--skeleton)');
    const body = card ? $('.vote-card__body', card) : null;
    if (!body) {
      out.measures[`kontrast: ${label}`] = 'nie ma kafelka, w którym dałoby się to zmierzyć';
      return;
    }
    if (voted) card.classList.add('is-voted');
    const node = document.createElement('p');
    node.className = className;
    node.textContent = 'x';
    body.append(node);
    contrast(node, label);
    node.remove();
    if (voted) card.classList.remove('is-voted');
  };
  contrastOnCard('vote-card__yours', 'ocena na moim kafelku (wstawiona do pomiaru)', true);
  contrastOnCard('vote-card__used', 'komunikat o zużytej zmianie (wstawiony do pomiaru)', false);
  /* Te dwa napisy leżą WPROST na tle strony i wprost na panelu z oddanym głosem, czyli w
     miejscach, w których zmiana tła najłatwiej zjada tekst. Mierzone także wtedy, gdy stan
     strony ich nie pokazuje: barwa i stos tła są policzone, a to wystarcza do rachunku. */
  contrast('.vote-empty', 'zdanie o braku stawki (na tle strony)');
  contrast('.vote-mine__rider', 'podpis w panelu „Twój głos"');
  contrast('.vote-notice', 'komunikat o zamkniętym głosowaniu');

  /* ====================================================================== 3. SIATKA */

  /**
   * Cztery szerokości telefonu, każda we własnej ramce.
   *
   * Liczba kolumn brana z DWÓCH źródeł, bo każde z nich osobno potrafi skłamać:
   *   — `grid-template-columns` po obliczeniu daje użyte ścieżki i działa nawet na pustej
   *     siatce, ale nie wie nic o tym, czy kafelki się w te ścieżki mieszczą;
   *   — pierwszy rząd kafelków liczony z ich górnych krawędzi mówi, co naprawdę stanęło
   *     obok siebie, ale wymaga danych, których podglądowy serwer sam z siebie nie ma.
   * Zgodne — wynik jest pewny. Rozjechane — sonda mówi, które i o ile.
   */
  const gridAt = async (width) => {
    const probe = document.createElement('iframe');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = `position:fixed;left:0;top:0;border:0;opacity:0;pointer-events:none;z-index:-1;width:${width}px;height:${window.innerHeight}px`;
    probe.src = '/votazione.html?probe=grid';
    document.body.append(probe);
    await new Promise((done) => {
      probe.addEventListener('load', done, { once: true });
      setTimeout(done, 12000);
    });
    let result = { width, error: null };
    try {
      const doc = probe.contentDocument;
      const view = probe.contentWindow;
      for (let i = 0; i < 50 && !doc.querySelector('[data-vote-grid] .vote-card:not(.vote-card--skeleton)'); i += 1) {
        await wait(150);
      }
      const style = doc.createElement('style');
      style.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}';
      doc.head.appendChild(style);
      await wait(120);
      const grid = doc.querySelector('[data-vote-grid]');
      const tracks = grid
        ? view.getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean)
        : [];
      const cards = Array.from(doc.querySelectorAll('[data-vote-grid] .vote-card:not(.vote-card--skeleton)'));
      const top = cards.length ? Math.round(cards[0].getBoundingClientRect().top) : null;
      const inFirstRow = cards.filter((el) => Math.round(el.getBoundingClientRect().top) === top).length;
      const first = cards[0] || null;
      const title = first ? first.querySelector('.vote-card__title') : null;
      const rider = first ? first.querySelector('.vote-card__rider') : null;
      const caption = first ? first.querySelector('.vote-card__caption') : null;
      const photo = first ? first.querySelector('.vote-card__photo') : null;
      result = {
        width,
        innerWidth: view.innerWidth,
        tracks: tracks.length,
        trackSizes: tracks.map((t) => Math.round(parseFloat(t))).join(' / '),
        cards: cards.length,
        firstRow: cards.length ? inFirstRow : null,
        cardWidth: first ? Math.round(first.getBoundingClientRect().width) : null,
        cardHeight: first ? Math.round(first.getBoundingClientRect().height) : null,
        /* Obcięcie kafelka: cokolwiek w środku wystaje poza jego pudełko albo poza ekran. */
        overflowsSelf: first ? first.scrollWidth > first.clientWidth + 1 : null,
        gridOverflows: grid ? grid.scrollWidth > grid.clientWidth + 1 : null,
        docOverflows: doc.documentElement.scrollWidth > view.innerWidth + 1,
        captionInsidePhoto: caption && photo
          ? Math.round(caption.getBoundingClientRect().bottom) <= Math.round(photo.getBoundingClientRect().bottom) + 1
          : null,
        titleFont: title ? Math.round(parseFloat(view.getComputedStyle(title).fontSize) * 10) / 10 : null,
        riderFont: rider ? Math.round(parseFloat(view.getComputedStyle(rider).fontSize) * 10) / 10 : null,
        /* Podpis nie może być ucięty w poziomie: nazwa wozu ma się zawijać, nie chować. */
        titleClipped: title ? title.scrollWidth > title.clientWidth + 1 : null,
        riderClipped: rider ? rider.scrollWidth > rider.clientWidth + 1 : null
      };
    } catch (error) {
      result.error = error.message;
    }
    probe.remove();
    return result;
  };

  out.grid = [];
  for (const width of [320, 360, 390, 430]) {
    const measured = await gridAt(width);
    out.grid.push(measured);
    out.measures[`siatka ${width} px`] = measured.error
      ? `błąd: ${measured.error}`
      : `${measured.tracks} kolumn(y) ${measured.trackSizes}, kafelek ${measured.cardWidth}x${measured.cardHeight}, pierwszy rząd ${measured.firstRow}, nazwa ${measured.titleFont}px, podpis ${measured.riderFont}px`;
    ok(`siatka ${width} px: dokładnie dwie kolumny`, measured.tracks === 2, `${measured.tracks}`);
    if (measured.cards) {
      ok(`siatka ${width} px: dwa kafelki w pierwszym rzędzie`, measured.firstRow === 2, `${measured.firstRow}`);
      ok(`siatka ${width} px: kafelek nic nie obcina`,
        measured.overflowsSelf === false && measured.titleClipped === false && measured.riderClipped === false,
        `kafelek=${measured.overflowsSelf}, nazwa=${measured.titleClipped}, podpis=${measured.riderClipped}`);
      ok(`siatka ${width} px: podpis leży w kadrze zdjęcia`, measured.captionInsidePhoto === true);
      /* Dolna granica czytelności podpisu: 13 px na nazwę pojazdu i 10 px na wiersz pod nią.
         Niżej nazwa wozu przestaje być nazwą, a staje się szarym paskiem na zdjęciu. */
      ok(`siatka ${width} px: nazwa pojazdu ≥ 13 px`, (measured.titleFont || 0) >= 13, `${measured.titleFont}px`);
      ok(`siatka ${width} px: podpis ≥ 10 px`, (measured.riderFont || 0) >= 10, `${measured.riderFont}px`);
    } else {
      out.notes.push(`siatka ${width} px: ramka nie dostała stawki (zaślepka nie weszła do ramki) — mierzone same ścieżki siatki`);
    }
    ok(`siatka ${width} px: strona nie przewija się w bok`, measured.docOverflows === false,
      `${measured.docOverflows}`);
  }

  /* ============================================================= 4. PIERWSZY EKRAN */

  /**
   * ILE ZAJMUJE WSZYSTKO NAD PIERWSZYM KAFELKIEM.
   *
   * Po wejściu na podstronę w fazie głosowania to, po co ktoś przyszedł, to siatka wozów.
   * Mierzone jest więc nie „czy siatka istnieje", a jej odległość od górnej krawędzi
   * dokumentu — i to samo w rozbiciu na bloki, żeby dało się powiedzieć, KTÓRY z nich ile
   * kosztuje, zamiast szukać po omacku.
   */
  window.scrollTo(0, 0);
  await wait(200);
  const gridHere = $('[data-vote-grid]');
  const cardsHere = $$('[data-vote-grid] .vote-card:not(.vote-card--skeleton)');
  const rect = (el) => (el ? el.getBoundingClientRect() : null);
  const blocks = [
    ['nagłówek (fixed)', $('.site-header')],
    ['nadtytuł + tytuł + zdanie', $('.vote-head')],
    ['zegar w treści', $('.vote-timer[data-vote-timer]')],
    ['wybór edycji', $('[data-vote-editions]')],
    ['panel „Twój głos"', $('[data-vote-mine]')],
    ['szukanie', $('[data-vote-search]')],
    ['filtr kategorii', $('[data-vote-filters]')],
    ['licznik pozycji', $('[data-vote-count]')]
  ];
  out.fold = {
    viewportHeight: window.innerHeight,
    headerBottom: Math.round(rect($('.site-header'))?.bottom || 0),
    mainPaddingTop: gridHere ? getComputedStyle($('.vote-main')).paddingTop : '',
    above: blocks.map(([label, el]) => {
      if (!el) return `${label}: brak`;
      const box = el.getBoundingClientRect();
      if (box.height < 1) return `${label}: schowany`;
      return `${label}: ${Math.round(box.height)} px`;
    }),
    gridTop: gridHere ? Math.round(rect(gridHere).top) : null,
    firstCardTop: cardsHere.length ? Math.round(rect(cardsHere[0]).top) : null,
    firstCardBottom: cardsHere.length ? Math.round(rect(cardsHere[0]).bottom) : null,
    firstCardHeight: cardsHere.length ? Math.round(rect(cardsHere[0]).height) : null
  };
  out.measures['nad pierwszym kafelkiem'] = `${out.fold.firstCardTop} px z ${window.innerHeight} px ekranu`;

  if (cardsHere.length) {
    /* Sam górny brzeg kafelka w ekranie nie wystarcza: pasek widocznego zdjęcia wysokości
       dziesięciu pikseli nie jest „widać, na co głosować". Warunek jest więc taki, że w
       pierwszym ekranie stoi co najmniej POŁOWA pierwszego kafelka. */
    const visible = Math.min(window.innerHeight, out.fold.firstCardBottom) - Math.max(0, out.fold.firstCardTop);
    out.fold.visibleShare = Math.round((visible / out.fold.firstCardHeight) * 100);
    /**
     * PRÓG ZALEŻY OD SZEROKOŚCI, BO ZALEŻY OD NIEJ WYSOKOŚĆ KAFELKA.
     *
     * Prośba dotyczyła telefonu: „dobrze pokazują od razu to do głosowania na telefonie".
     * Poniżej 700 px kafelek jest kwadratem na pół szerokości ekranu (179 px na 390) i cały
     * pierwszy rząd MUSI się zmieścić — to jest warunek niżej. Na monitorze siatka ma trzy
     * kolumny, więc kafelek ma 444 px wysokości i całego rzędu nie da się zmieścić w 900 px
     * ekranu nawet przy zerowym nagłówku. Twardy warunek postawiony tam byłby wymaganiem
     * niewykonalnym, czyli sondą, która krzyczy zawsze; miękki na telefonie byłby sondą, która
     * przepuściła stan sprzed tej tury. Stąd dwa progi i jedna liczba w raporcie dla obu.
     */
    const phone = window.innerWidth <= 700;
    ok('pierwszy ekran: górna krawędź pierwszego kafelka jest widoczna',
      out.fold.firstCardTop < window.innerHeight,
      `${out.fold.firstCardTop} < ${window.innerHeight}`);
    ok(`pierwszy ekran: widać co najmniej ${phone ? 50 : 33}% pierwszego kafelka`,
      out.fold.visibleShare >= (phone ? 50 : 33), `${out.fold.visibleShare}%`);
    ok('pierwszy ekran: pierwszy kafelek nie wjeżdża pod pasek nawigacji',
      out.fold.firstCardTop >= out.fold.headerBottom,
      `kafelek ${out.fold.firstCardTop}, pasek do ${out.fold.headerBottom}`);
    /**
     * CAŁY PIERWSZY RZĄD, NIE „GÓRNY BRZEG PIERWSZEGO KAFELKA".
     *
     * Warunek postawiony wyżej — „widać połowę" — przechodził już PRZED tą turą, przy kafelku
     * zaczynającym się na 594 px z 844 px ekranu. Formalnie prawda, praktycznie: dolne
     * pięćdziesiąt pikseli ekranu z jednym rzędem wciśniętym w krawędź. Prośba brzmiała
     * „dobrze pokazują od razu to do głosowania", więc miarą jest cały rząd: dwa wozy w
     * pierwszym spojrzeniu, bo dopiero wtedy widać, że to jest lista, po której się przewija.
     */
    const rowBottom = Math.max(...cardsHere
      .filter((el) => Math.round(el.getBoundingClientRect().top) === out.fold.firstCardTop)
      .map((el) => Math.round(el.getBoundingClientRect().bottom)));
    out.fold.firstRowBottom = rowBottom;
    /**
     * DWA WARUNKI, BO DWIE RÓŻNE RZECZY.
     *
     * PIERWSZY mierzy to, co da się skrócić: wysokość wszystkiego, co stoi nad siatką. Jest
     * bezwzględny i nie zależy od ekranu, bo nagłówek sekcji, zegar, szukanie i filtry mają na
     * telefonie tę samą wysokość przy 320 i przy 430 px. 500 px to pomiar plus zapas na jeden
     * dodatkowy wiersz zdania wiodącego w najdłuższym z sześciu języków; przed tą turą było 595.
     *
     * DRUGI mierzy skutek — czy cały rząd staje w ekranie — i wymaga ekranu, który ma na to
     * wysokość. Kafelek na telefonie jest kwadratem o boku pół szerokości ekranu, więc na
     * 320×568 sam rząd to 144 px z 490 px pozostałych po pasku: przy tak ciasnym budżecie
     * jedyną drogą byłoby zdjęcie pola szukania albo zdania wiodącego, czyli oddanie treści za
     * układ. Tam warunkiem jest połowa kafelka (warunek wyżej), a dokładne liczby idą do
     * raportu, żeby nie zginęły.
     */
    if (phone) {
      ok('pierwszy ekran: nad siatką stoi nie więcej niż 500 px',
        out.fold.firstCardTop <= 500, `${out.fold.firstCardTop} px`);
    } else {
      out.notes.push(`nad siatką ${out.fold.firstCardTop} px — próg 500 px dotyczy telefonu; tu nagłówek sekcji jest większy razem z pismem i kafelkami`);
    }
    if (phone && window.innerHeight >= 700) {
      ok('pierwszy ekran: CAŁY pierwszy rząd kafelków mieści się w ekranie',
        rowBottom <= window.innerHeight, `rząd kończy się na ${rowBottom} z ${window.innerHeight}`);
    } else {
      out.notes.push(`pierwszy ekran ${window.innerWidth}×${window.innerHeight}: rząd kończy się na ${rowBottom} px, kafelek ${out.fold.firstCardHeight} px — cały rząd nie ma jak się zmieścić, warunkiem jest połowa kafelka`);
    }
    /* Zegar i filtry zostają — o to była wyraźna prośba. Sonda pilnuje, że nie zniknęły
       przy skracaniu drogi do siatki. */
    ok('pierwszy ekran: zegar głosowania nadal jest na stronie',
      Boolean($('.vote-timer[data-vote-timer]')) && !$('.vote-timer[data-vote-timer]').hidden);
    ok('pierwszy ekran: filtr kategorii nadal jest na stronie',
      Boolean($('[data-vote-filters]')) && !$('[data-vote-filters]').hidden);
  } else {
    out.notes.push('pierwszy ekran: bez stawki (uruchom z --inject tools/inject-voting-open.js)');
  }

  frame.remove();
  out.score = `${out.steps.filter((s) => s.startsWith('ok')).length}/${out.steps.length}`;
  return out;
}
