/**
 * DROGA DO GŁOSU SAMYMI DOTKNIĘCIAMI — TERAZ DWA DOTKNIĘCIA DO RZĘDU OCEN.
 * ===========================================================================
 *
 *   TELEFON (dotyk prawdziwy — poniżej 700 px harness włącza emulację palca):
 *   node tools/cdp.mjs probe tools/probe-voting-mobile.mjs --w 390 --h 844 \
 *        --url "/votazione.html?lang=pl" --origin http://127.0.0.1:4173 \
 *        --inject tools/inject-voting-open.js --wait 3000
 *
 *   TABLET i MONITOR (żeby przepływ pod palcem nie zepsuł myszy):
 *   ...--w 768 --h 1024...        ...--w 1440 --h 900...
 *
 *   TA SAMA SONDA NA WBUDOWANYM DEMO (bez zaślepki):
 *   ...--url "/votazione.html?demo=1&lang=pl"...
 *
 * NOWY KONTRAKT: TRZY KROKI, DWA DOTKNIĘCIA DO OCEN
 * ---------------------------------------------------------------------------
 *   1. dotknięcie zdjęcia            → widoczna pigułka „Zagłosuj", rząd ocen JESZCZE ZAMKNIĘTY,
 *   2. dotknięcie pigułki            → rząd ocen wyrastający Z TEJ pigułki,
 *   3. potwierdzenie oceny           → okno z adresem (tylko gdy głosu jeszcze nie ma).
 *
 *   Do poprzedniego uruchomienia tej sondy kontrakt brzmiał odwrotnie: JEDNO dotknięcie miało
 *   rozwijać oceny od razu. Zmienione na wyraźne życzenie właściciela — „chciałbym żeby pokazał
 *   się tam napis ZAGŁOSUJ, i po kliknięciu wtedy z tego guzika rozsuwa się ten pop-out
 *   z suwakiem". Sonda musi mierzyć to, co zamówione, a nie to, co było wygodniejsze do
 *   napisania: dlatego warunek „JEDNO dotknięcie rozwija oceny" został zamieniony na parę
 *   warunków „pierwsze dotknięcie NIE rozwija ocen, ale pokazuje pigułkę" i „drugie rozwija".
 *
 * TO JEST CZĘŚCIOWY POWRÓT DO STANU, KTÓRY BYŁ ZEPSUTY — I DLATEGO TA SONDA MIERZY ODLEGŁOŚĆ
 * ---------------------------------------------------------------------------
 *   Ten przepływ istniał już kiedyś i wywołał zgłoszenie „klikam w zagłosuj i nic się nie robi,
 *   nie da się zagłosować na telefonie". Trzy przyczyny, ZMIERZONE wtedy na 390×844:
 *
 *     (a) pigułka wyrastała DOKŁADNIE POD KCIUKIEM — odległość jej środka od punktu dotknięcia
 *         0 px, przy pigułce 159×44 w kadrze 173×173. Z ekranu wyglądało to na brak reakcji;
 *     (b) tło odsłoniętej nakładki nie miało obsługi: 20 z 25 punktów zdjęcia zjadało dotknięcie
 *         bez śladu, więc „dotknę jeszcze raz w to samo miejsce" nie robiło nic;
 *     (c) połysk szkieletu wczytywanego zdjęcia (`.vote-card__photo.is-loading::after`)
 *         przechwytywał dotknięcia, dopóki zdjęcie leciało z sieci.
 *
 *   (b) i (c) są naprawione i MUSZĄ zostać naprawione — mają tu własne warunki. (a) jest tym,
 *   co zostało usunięte razem z przywróceniem drugiego dotknięcia: pigułka staje po PRZECIWNEJ
 *   stronie kadru niż palec, a ta sonda liczy tę odległość w pikselach i nie przepuszcza jej
 *   poniżej jednego celu dotykowego (44 px).
 *
 * DLACZEGO PRAWDZIWE DOTKNIĘCIA, A NIE `element.click()`
 *   `.click()` to wywołanie funkcji: trafia w WSKAZANY element bez względu na to, czy palec by
 *   w niego trafił, czy leży pod nim nakładka i czy element jest w ogóle widoczny. Dokładnie
 *   dlatego sondy wołające `.click()` były zielone w dniu tamtego zgłoszenia. Tu każde
 *   dotknięcie idzie przez `window.__tap(x, y)` — zaślepkę harnessu wysyłającą PRAWDZIWE
 *   zdarzenie dotknięcia przez protokół (patrz `__tapNative` w tools/cdp.mjs). Sonda nie
 *   wskazuje celu, podaje współrzędne, tak jak palec.
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

  /**
   * Pamięć przeglądarki czyszczona na wejściu.
   *
   * Mierzone jest PIERWSZE głosowanie z tego telefonu, bo taka jest sytuacja na placu. Gdy
   * w pamięci siedzi zapamiętany adres (`carruleddhi.voter`), okno pokazuje „zagłosuj tym
   * adresem" zamiast pól — inny ekran i inna droga. Sonda, której wynik zależy od poprzedniego
   * uruchomienia, nie mierzy strony, tylko historię własnych uruchomień.
   */
  try { localStorage.removeItem('carruleddhi.voter'); } catch (_) { /* pamięć może być zablokowana */ }

  /* Czekamy na kafelek, nie na stałą liczbę milisekund: stan przychodzi z sieci, a rysowanie
     siatki jest o jedno przerysowanie dalej. */
  for (let i = 0; i < 80 && !$('[data-vote-grid] .vote-card:not(.vote-card--skeleton)'); i += 1) await wait(150);

  /**
   * ANIMACJE WYŁĄCZONE, ALE SPRAWDZONE OSOBNO Z ARKUSZA.
   *
   * Mierzone jest POŁOŻENIE i TRAFIENIE, a element w połowie animacji ma inne pudełko niż na
   * końcu — bez tego rząd ocen mierzyłby się w skali 0.86. Cena jest ta, że `animationName`
   * zwraca wtedy `none` wszędzie, więc wymóg „rząd ocen wyrasta z pigułki" jest sprawdzany
   * DWOMA innymi sposobami: obecnością klatek `vote-morph` w arkuszu i geometrią (krawędź
   * rzędu ocen musi stać tam, gdzie stała krawędź pigułki).
   */
  const kill = document.createElement('style');
  kill.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}';
  document.head.appendChild(kill);
  await wait(80);
  document.documentElement.style.scrollBehavior = 'auto';

  out.viewport = `${window.innerWidth}x${window.innerHeight}`;
  /* Profil wskaźnika podawany WPROST, bo od niego zależy, co ta sonda właściwie mierzy: harness
     włącza emulację palca dopiero poniżej 700 px, więc 768 i 1440 to przebiegi pilnujące myszy,
     a 390 to jedyny przebieg, w którym `hover: none` jest prawdziwe. Bez tej linijki łatwo
     ogłosić „telefon naprawiony" na podstawie pomiaru zrobionego myszą. */
  out.pointer = {
    coarse: window.matchMedia('(pointer: coarse)').matches,
    hoverNone: window.matchMedia('(hover: none)').matches
  };
  out.tapMode = typeof window.__tap === 'function' ? 'prawdziwe dotkniecia (CDP)' : 'BRAK — stary harness';
  ok('harness umie dotykać', typeof window.__tap === 'function', out.tapMode);

  const describe = (el) => {
    if (!el) return 'nic (puste miejsce albo punkt poza ekranem)';
    const cls = String(el.className || '').split(/\s+/).filter(Boolean).slice(0, 3).join('.');
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`;
  };
  const at = (el) => {
    const box = el.getBoundingClientRect();
    return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) };
  };
  const size = (el) => {
    const box = el.getBoundingClientRect();
    return `${Math.round(box.width)}x${Math.round(box.height)}`;
  };
  const tap = async (x, y) => { if (typeof window.__tap === 'function') await window.__tap(x, y); };
  const shownBox = (el) => Boolean(el) && !el.hidden && el.getBoundingClientRect().height > 1;

  /**
   * Dotknięcie w środek elementu, ze sprawdzeniem PRZED dotknięciem, kto w tym punkcie leży.
   *
   * Sprawdzenie musi być przed, nie po: po dotknięciu w tym miejscu bywa już co innego, bo
   * strona właśnie zareagowała. `contains`, a nie `===`: palec może trafić w napis w środku
   * przycisku i to jest w porządku — dotknięcie i tak wypływa do przycisku. Nie w porządku jest
   * wtedy, gdy w punkcie leży coś, co NIE jest częścią celu.
   *
   * Dotykamy TAK CZY INACZEJ, także gdy w punkcie leży co innego: to jest właśnie „dotknięcie
   * w powietrze" i chcemy zobaczyć, co po nim zostaje na ekranie. Zwracany jest punkt, bo
   * odległość pigułki od NIEGO jest tu jednym z najważniejszych pomiarów.
   */
  const tapOn = async (element, label) => {
    if (!element) { ok(label, false, 'elementu nie ma w drzewie'); return null; }
    const box = element.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) {
      ok(label, false, `cel ma zerowe wymiary ${Math.round(box.width)}x${Math.round(box.height)}`);
      return null;
    }
    const point = at(element);
    const under = document.elementFromPoint(point.x, point.y);
    const reachable = Boolean(under) && element.contains(under);
    await tap(point.x, point.y);
    ok(label, reachable, reachable
      ? `punkt ${point.x},${point.y}`
      : `w punkcie ${point.x},${point.y} leży ${describe(under)}`);
    return reachable ? point : null;
  };

  /**
   * WEJŚCIE W KAFELEK: to, co widzi palec, albo to, co widzi kursor.
   *
   * Pod palcem wejściem jest przezroczysta warstwa na całym zdjęciu. Przy wskaźniku z hoverem
   * ta warstwa ZNIKA (`.vote-card:hover .vote-card__hit { display: none }`), bo kursor stojący
   * na kafelku odsłania pigułkę i klika wprost w nią — i wtedy pytanie o warstwę zwraca element
   * o zerowych wymiarach. Sonda musi więc pytać o WIDOCZNE wejście, a nie o jedno z dwóch:
   * inaczej przebieg na monitorze zgłasza usterkę tam, gdzie strona zachowuje się poprawnie.
   */
  const entry = (node) => {
    const hitNow = $('.vote-card__hit', node);
    if (hitNow && !hitNow.hidden && hitNow.getBoundingClientRect().height > 1) return hitNow;
    return $('.vote-veil__cta', node);
  };

  /** Cel dotykowy: 44 px w obu kierunkach, liczone z pudełka, a nie z `min-height` w arkuszu. */
  const target44 = (element, label) => {
    if (!element) return ok(`cel ≥44 px: ${label}`, false, 'elementu nie ma');
    const box = element.getBoundingClientRect();
    const w = Math.round(box.width);
    const h = Math.round(box.height);
    out.measures[label] = `${w}x${h}`;
    return ok(`cel ≥44 px: ${label}`, w >= 44 && h >= 44, `${w}x${h}`);
  };

  /**
   * SIATKA 5×5 PO ZDJĘCIU: KTO LEŻY W DWUDZIESTU PIĘCIU PUNKTACH KADRU.
   *
   * Jedno narzędzie, dwa pytania. W spoczynku: czy CAŁE zdjęcie przyjmuje pierwsze dotknięcie
   * (czyli czy pod każdym punktem leży przezroczysty cel, a nie dekoracja — tu wychodził połysk
   * szkieletu). Po odsłonięciu: czy tło nakładki nie jest martwą strefą (czyli czy każdy punkt
   * należy do nakładki, która ma obsługę, a nie do czegoś, co dotknięcie zje bez śladu).
   */
  const grid5 = (node) => {
    const box = $('.vote-card__photo', node).getBoundingClientRect();
    const points = [];
    for (let ix = 0; ix < 5; ix += 1) {
      for (let iy = 0; iy < 5; iy += 1) {
        const x = Math.round(box.left + box.width * (0.1 + ix * 0.2));
        const y = Math.round(box.top + box.height * (0.1 + iy * 0.2));
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
        points.push({ x, y, el: document.elementFromPoint(x, y) });
      }
    }
    return points;
  };

  /**
   * Czy arkusz nadal umie „rozsunąć" rząd ocen z pigułki.
   *
   * Animacja `vote-morph` jest tym, co z dwóch pudełek robi jedno rozwijające się — i była
   * wprost wymieniona w zamówieniu jako własność do utrzymania. Sonda wyłącza animacje, żeby
   * mierzyć pudełka, więc pytanie idzie do arkusza, nie do `getComputedStyle`. Liczone są
   * WZMIANKI: klatki (`@keyframes vote-morph`) i reguła, która je zakłada na `.vote-veil__pick`.
   */
  const morphMentions = () => {
    let hits = 0;
    /* Pytamy o `style.animation`, a NIE o `cssText`, i wchodzimy w zagnieżdżenia BEZ warunku
       „to nie jest zwykła reguła". Od kiedy Chrome umie zagnieżdżanie CSS, `cssRules` istnieje
       także na zwykłej regule (pusta lista), więc rozgałęzienie „ma cssRules → wejdź i wracaj"
       przeskakiwało wszystkie reguły stylu i liczyło tylko same klatki. Sonda mówiła wtedy
       „animacji nie ma" na arkuszu, w którym stała. */
    const walk = (list) => Array.from(list || []).forEach((rule) => {
      if (rule.name === 'vote-morph') hits += 1;
      const animation = rule.style ? String(rule.style.animation || rule.style.animationName || '') : '';
      if (/vote-morph/.test(animation)) hits += 1;
      if (rule.cssRules && rule.cssRules.length) walk(rule.cssRules);
    });
    Array.from(document.styleSheets).forEach((sheet) => {
      try { walk(sheet.cssRules); } catch (_) { /* arkusz z innego źródła */ }
    });
    return hits;
  };

  /* ------------------------------------------------------------------- stan wyjściowy */

  const cards = () => $$('[data-vote-grid] .vote-card:not(.vote-card--skeleton)');
  out.cards = cards().length;
  if (!ok('siatka ma kafelki (bez zaślepki albo ?demo=1 będzie pusta)', out.cards >= 2, String(out.cards))) {
    return out;
  }

  /**
   * CO ZASŁANIA KAFELKI W POŁOŻENIU, W KTÓRYM SIĘ NA NIE PATRZY.
   *
   * Nagłówek jest `position: fixed` i zostaje na górze ekranu przy każdym przewinięciu. Kafelek,
   * który wjedzie pod niego, wygląda normalnie, a dotknięcia nie przyjmuje. Raport, nie warunek:
   * pozwala odróżnić „przycisk nie działa" od „przycisk jest pod paskiem".
   *
   * SELEKTOR Z KLASĄ, NIE SAM ATRYBUT: `[data-vote-timer]` niosą DWA elementy — pudełko w treści
   * i jego kopia zadokowana w pasku, która stoi wcześniej w dokumencie. Samo
   * `querySelector('[data-vote-timer]')` mierzyło więc wnętrze nagłówka, czyli liczbę, którą
   * `headerBottom` i tak podaje.
   */
  const bar = $('.vote-timer[data-vote-timer]');
  const header = $('.site-header');
  out.chrome = {
    headerBottom: header ? Math.round(header.getBoundingClientRect().bottom) : null,
    timerBottom: bar && !bar.hidden ? Math.round(bar.getBoundingClientRect().bottom) : null
  };
  /* TYLKO NAGŁÓWEK, BO TYLKO ON ZOSTAJE NA EKRANIE. Zegar nie jest już `sticky` — stoi w treści,
     więc odjeżdża razem z nią. `timerBottom` zostaje w raporcie osobno, bo mówi, ile treści stoi
     nad pierwszym kafelkiem po wejściu na stronę, i to jest inne, nadal przydatne pytanie. */
  out.chrome.coveredTo = out.chrome.headerBottom || 0;
  out.coverage = cards().slice(0, 4).map((node) => {
    const box = node.getBoundingClientRect();
    const point = { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + 86) };
    return `${Math.round(box.top)}px: ${describe(document.elementFromPoint(point.x, point.y))}`;
  });

  const card = cards()[0];
  /* Kafelek na środek okna: nagłówek jest `fixed`, więc kafelek stojący pod nim jest zasłonięty
     niezależnie od tego, czy przyciski działają. Stawiamy go tam, gdzie postawiłby go człowiek,
     który na niego patrzy. */
  card.scrollIntoView({ block: 'center', inline: 'nearest' });
  await wait(280);

  const photo = $('.vote-card__photo', card);
  const hit = $('.vote-card__hit', card);
  const veil = $('.vote-veil', card);
  out.rest = {
    hasHit: Boolean(hit),
    /* Przezroczysty przycisk NIESIE NAZWĘ „Zagłosuj…" — ten sam zamiar co pigułka, tylko krok
       wcześniej. Dlatego jego naciśnięcie musi przenieść fokus NA pigułkę: inaczej czytnik
       ekranu ogłasza czynność i zostawia człowieka bez śladu, gdzie ona teraz jest. */
    hitLabel: hit?.getAttribute('aria-label') || '',
    photoBox: photo ? size(photo) : '',
    veilOpacity: veil ? Number(getComputedStyle(veil).opacity) : null,
    veilEvents: veil ? getComputedStyle(veil).pointerEvents : null,
    veilPill: veil ? (veil.dataset.pill || '') : null,
    atPhotoCentre: photo ? describe(document.elementFromPoint(at(photo).x, at(photo).y)) : ''
  };
  out.measures['kadr zdjęcia'] = out.rest.photoBox;
  ok('kafelek jest czysty: nakładka niewidoczna i nie łapie wskaźnika',
    out.rest.veilOpacity === 0 && out.rest.veilEvents === 'none',
    `krycie ${out.rest.veilOpacity}, wskaźnik ${out.rest.veilEvents}`);
  ok('w spoczynku pigułka nie ma jeszcze przypisanej strony kadru', out.rest.veilPill === '',
    `data-pill="${out.rest.veilPill}"`);
  ok('w środku zdjęcia leży cel dotknięcia, a nie dekoracja',
    Boolean(hit) && hit.contains(document.elementFromPoint(at(photo).x, at(photo).y)),
    out.rest.atPhotoCentre);
  target44(hit, 'cel dotknięcia zdjęcia');

  /* CAŁE zdjęcie przyjmuje pierwsze dotknięcie, nie tylko jego środek. */
  const restGrid = grid5(card);
  out.rest.gridDead = restGrid.filter((p) => !hit || !hit.contains(p.el)).map((p) => `${p.x},${p.y}: ${describe(p.el)}`);
  ok('spoczynek: wszystkie 25 punktów zdjęcia przyjmuje dotknięcie',
    out.rest.gridDead.length === 0,
    `${restGrid.length - out.rest.gridDead.length}/${restGrid.length} punktów na celu${out.rest.gridDead.length ? `, martwe: ${out.rest.gridDead.join(' | ')}` : ''}`);

  /**
   * KAFELEK MUSI PRZYJMOWAĆ DOTKNIĘCIA TAKŻE WTEDY, GDY ZDJĘCIE JESZCZE LECI.
   *
   * `is-loading` to ta sama klasa, którą strona zakłada sama na czas pobierania zdjęcia (patrz
   * `card()` w voting-page.js), a pod nią stoi połysk rysowany w `::after`. Zakładana tu ręcznie,
   * bo w podglądzie na localhoście zdjęcia wchodzą w kilka milisekund i tego stanu nie da się
   * złapać — a na placu, przy podpisanych adresach z prywatnego bucketa i sieci obciążonej przez
   * cały tłum, trwa on sekundy na każdym kafelku, czyli dokładnie wtedy, gdy ludzie głosują.
   *
   * ZMIERZONE, gdy połysk nie miał jeszcze `pointer-events: none`: `elementFromPoint` w środku
   * takiego kafelka zwracał `figure.vote-card__photo` i pierwsze dotknięcie nie robiło NIC.
   * To jest jedna z dwóch przyczyn tamtego zgłoszenia, która MA zostać naprawiona.
   */
  photo.classList.add('is-loading');
  await wait(90);
  const loadingGrid = grid5(card);
  out.loading = {
    atPhotoCentre: describe(document.elementFromPoint(at(photo).x, at(photo).y)),
    shimmerEvents: getComputedStyle(photo, '::after').pointerEvents,
    hitZ: getComputedStyle(hit).zIndex,
    gridDead: loadingGrid.filter((p) => !hit.contains(p.el)).map((p) => `${p.x},${p.y}: ${describe(p.el)}`)
  };
  ok('szkielet wczytywanego zdjęcia nie zjada dotknięcia (25 punktów)',
    out.loading.gridDead.length === 0,
    `${out.loading.atPhotoCentre}, połysk wskaźnik=${out.loading.shimmerEvents}, hit z-index=${out.loading.hitZ}`);
  photo.classList.remove('is-loading');
  await wait(60);

  /* ======================= KROK 1: DOTKNIĘCIE ZDJĘCIA ODSŁANIA PIGUŁKĘ, I TO WIDOCZNĄ */
  /**
   * TU MIESZKA PRZYWRACANY KROK — I TU MIESZKAŁA USTERKA.
   *
   * Pierwsze dotknięcie ma pokazać pigułkę „Zagłosuj" i NIE rozwijać jeszcze ocen. Warunek
   * „pigułka jest widoczna" nie wystarcza: poprzednio też była widoczna dla drzewa, tylko stała
   * pod kciukiem. Dlatego pytamy o trzy rzeczy naraz: czy ma pudełko, czy w jej środku leży
   * ona sama, i JAK DALEKO jej środek jest od punktu, w który uderzył palec.
   */
  const tap1 = await tapOn(hit, 'krok 1: dotknięcie zdjęcia trafia w cel');
  await wait(300);

  const cta = $('.vote-veil__cta', card);
  const pickerAfter1 = $('.vote-veil__pick', card);
  const ctaBox = cta ? cta.getBoundingClientRect() : null;
  const photoBox1 = photo.getBoundingClientRect();
  const ctaCentre = cta ? at(cta) : null;
  const gap = tap1 && ctaCentre
    ? {
      dx: Math.abs(ctaCentre.x - tap1.x),
      dy: Math.abs(ctaCentre.y - tap1.y),
      dist: Math.round(Math.hypot(ctaCentre.x - tap1.x, ctaCentre.y - tap1.y))
    }
    : null;

  out.step1 = {
    cardArmed: card.classList.contains('is-armed'),
    cardPicking: card.classList.contains('is-picking'),
    hitHidden: hit ? hit.hidden : null,
    veilOpacity: Number(getComputedStyle(veil).opacity),
    veilEvents: getComputedStyle(veil).pointerEvents,
    veilPill: veil.dataset.pill || '',
    ctaShown: shownBox(cta),
    ctaLabel: cta?.textContent.trim() || '',
    ctaBox: cta ? size(cta) : '',
    ctaVisibility: cta ? getComputedStyle(cta).visibility : '',
    ctaInsidePhoto: ctaBox
      ? ctaBox.top >= photoBox1.top - 1 && ctaBox.bottom <= photoBox1.bottom + 1
      : false,
    atCtaCentre: ctaCentre ? describe(document.elementFromPoint(ctaCentre.x, ctaCentre.y)) : '',
    atTapPoint: tap1 ? describe(document.elementFromPoint(tap1.x, tap1.y)) : '',
    pickerShown: shownBox(pickerAfter1),
    activeElement: describe(document.activeElement),
    gap
  };
  if (gap) {
    out.measures['pigułka: odległość środka od punktu dotknięcia'] =
      `${gap.dist} px (dx ${gap.dx}, dy ${gap.dy})`;
  }

  ok('krok 1: nakładka odsłonięta i łapie dotknięcie',
    out.step1.cardArmed && out.step1.veilOpacity === 1 && out.step1.veilEvents === 'auto',
    `is-armed=${out.step1.cardArmed}, krycie ${out.step1.veilOpacity}, wskaźnik ${out.step1.veilEvents}`);
  ok('krok 1: przezroczysta warstwa zeszła z drogi', out.step1.hitHidden === true,
    `hidden=${out.step1.hitHidden}`);
  ok('KROK 1: pigułka „Zagłosuj" jest NAPRAWDĘ widoczna i ma pudełko',
    out.step1.ctaShown && out.step1.ctaVisibility === 'visible' && Boolean(out.step1.ctaLabel),
    `„${out.step1.ctaLabel}" ${out.step1.ctaBox}, widoczność ${out.step1.ctaVisibility}`);
  ok('krok 1: pigułka stoi NA zdjęciu, nie pod kadrem', out.step1.ctaInsidePhoto === true);
  ok('krok 1: w środku pigułki leży pigułka', Boolean(cta)
    && cta.contains(document.elementFromPoint(ctaCentre.x, ctaCentre.y)), out.step1.atCtaCentre);
  target44(cta, 'pigułka „Zagłosuj"');
  /* NAJWAŻNIEJSZY POMIAR TEJ SONDY.
     Pigułka postawiona w punkcie dotknięcia jest zasłonięta kciukiem i cały przepływ dwóch
     dotknięć wygląda wtedy jak „nacisnąłem i nic się nie stało". Poprzednio: 0 px. Próg 44 px,
     czyli jeden pełny cel dotykowy — tyle mniej więcej zakrywa opuszka. */
  ok('KROK 1: pigułka NIE STOI POD PALCEM — środek dalej niż 44 px od dotknięcia',
    Boolean(gap) && gap.dist >= 44, gap ? `${gap.dist} px (dx ${gap.dx}, dy ${gap.dy})` : 'brak pomiaru');
  ok('krok 1: w punkcie dotknięcia nie leży pigułka',
    Boolean(tap1) && Boolean(cta) && !cta.contains(document.elementFromPoint(tap1.x, tap1.y)),
    out.step1.atTapPoint);
  ok('krok 1: strona kadru wybrana z dotknięcia', ['top', 'bottom'].includes(out.step1.veilPill),
    `data-pill="${out.step1.veilPill}"`);
  ok('KROK 1: rząd ocen JESZCZE zamknięty — o to prosił właściciel',
    out.step1.pickerShown === false && out.step1.cardPicking === false,
    `is-picking=${out.step1.cardPicking}, suwak w kadrze=${out.step1.pickerShown}`);
  ok('krok 1: fokus przeszedł na pigułkę (klawiatura i czytnik ekranu idą dalej)',
    document.activeElement === cta, out.step1.activeElement);

  /**
   * TŁO ODSŁONIĘTEJ NAKŁADKI NIE MOŻE BYĆ MARTWĄ STREFĄ — SIATKA 5×5 PO ZDJĘCIU.
   *
   * Nakładka kryje CAŁE zdjęcie i przy odsłonięciu łapie wskaźnik, więc każdy punkt, w którym
   * nie leży kontrolka, jest miejscem, gdzie dotknięcie może przepaść. ZMIERZONE przed naprawą
   * na 390×844: 20 z 25 punktów zwracało `div.vote-veil` i nie robiło NIC.
   *
   * Warunek jest o PRZYNALEŻNOŚĆ, nie o listę selektorów: każdy punkt musi należeć do nakładki,
   * bo nakładka — razem ze swoim tłem — ma obsługę w `voteOverlay()`. Punkt zwracający cokolwiek
   * spoza niej (figurę, obrazek, podpis) to dotknięcie, które przepada.
   */
  const armedGrid = grid5(card);
  const outsideVeil = armedGrid.filter((p) => !veil.contains(p.el));
  const bareBackdrop = armedGrid.filter((p) => p.el === veil);
  out.deadZone = {
    points: armedGrid.length,
    onVeil: armedGrid.length - outsideVeil.length,
    bareBackdrop: bareBackdrop.length,
    outside: outsideVeil.map((p) => `${p.x},${p.y}: ${describe(p.el)}`),
    map: armedGrid.map((p) => `${p.x},${p.y}: ${describe(p.el)}`)
  };
  out.measures['siatka 5x5 po odsłonięciu: punkty na nakładce'] =
    `${out.deadZone.onVeil}/${out.deadZone.points} (gołe tło: ${out.deadZone.bareBackdrop})`;
  ok('krok 1: żaden z 25 punktów zdjęcia nie jest martwy',
    outsideVeil.length === 0,
    `${out.deadZone.onVeil}/${out.deadZone.points} na nakładce${outsideVeil.length ? `, poza: ${out.deadZone.outside.join(' | ')}` : ''}`);

  /* ======================= KROK 2: DOTKNIĘCIE PIGUŁKI ROZWIJA RZĄD OCEN Z JEJ MIEJSCA */
  const pillBox = cta.getBoundingClientRect();
  const pillSide = out.step1.veilPill;
  await tapOn(cta, 'krok 2: dotknięcie pigułki trafia w pigułkę');
  await wait(320);

  const picker = $('.vote-veil__pick', card);
  const slider = $('.vote-slider', card);
  const send = $('.vote-veil__send', card);
  const cancel = $('.vote-veil__cancel', card);
  const pickBox = picker ? picker.getBoundingClientRect() : null;
  const cardBox = card.getBoundingClientRect();
  const photoBox2 = photo.getBoundingClientRect();

  /* „Wyrasta Z TEJ pigułki" zmierzone geometrycznie: krawędź, przy której stała pigułka, musi
     być krawędzią rzędu ocen. Przy pigułce u góry porównujemy górne krawędzie, przy dolnej —
     dolne, a przy myszy (pigułka na środku) środki. Dwa piksele luzu na zaokrąglenia układu. */
  const morphAnchor = pickBox
    ? (pillSide === 'top' ? Math.abs(pickBox.top - pillBox.top)
      : pillSide === 'bottom' ? Math.abs(pickBox.bottom - pillBox.bottom)
        : Math.abs((pickBox.top + pickBox.height / 2) - (pillBox.top + pillBox.height / 2)))
    : null;

  out.step2 = {
    cardPicking: card.classList.contains('is-picking'),
    pickerShown: shownBox(picker),
    ctaGone: cta ? getComputedStyle(cta).display === 'none' : null,
    veilPill: veil.dataset.pill || '',
    sliderRange: slider ? `${slider.min}-${slider.max}` : '',
    sendLabel: send?.textContent.trim() || '',
    pillBox: `${Math.round(pillBox.width)}x${Math.round(pillBox.height)} @${Math.round(pillBox.top)}`,
    pickBox: pickBox ? `${Math.round(pickBox.width)}x${Math.round(pickBox.height)} @${Math.round(pickBox.top)}` : '',
    morphAnchor,
    morphMentions: morphMentions(),
    atSliderCentre: slider ? describe(document.elementFromPoint(at(slider).x, at(slider).y)) : '',
    atSendCentre: send ? describe(document.elementFromPoint(at(send).x, at(send).y)) : '',
    atCancelCentre: cancel ? describe(document.elementFromPoint(at(cancel).x, at(cancel).y)) : '',
    activeElement: describe(document.activeElement)
  };
  out.measures['pigułka → rząd ocen: przesunięcie krawędzi'] = `${morphAnchor} px (strona ${pillSide || 'środek'})`;

  ok('KROK 2: dotknięcie pigułki rozwija rząd ocen', out.step2.pickerShown && out.step2.cardPicking,
    `is-picking=${out.step2.cardPicking}`);
  ok('krok 2: pigułka ustępuje miejsca rzędowi ocen', out.step2.ctaGone === true);
  ok('krok 2: rząd ocen wyrasta Z MIEJSCA pigułki, a nie skądś indziej',
    morphAnchor !== null && morphAnchor <= 2,
    `pigułka ${out.step2.pillBox} → oceny ${out.step2.pickBox}, przesunięcie ${morphAnchor} px`);
  ok('krok 2: animacja `vote-morph` nadal jest w arkuszu', out.step2.morphMentions >= 2,
    `wzmianek: ${out.step2.morphMentions}`);
  ok('krok 2: zakres ocen przychodzi z serwera', out.step2.sliderRange === '3-10', out.step2.sliderRange);
  ok('krok 2: potwierdzenie ma napis', Boolean(out.step2.sendLabel), out.step2.sendLabel);
  ok('krok 2: w środku suwaka leży suwak', Boolean(slider)
    && slider.contains(document.elementFromPoint(at(slider).x, at(slider).y)), out.step2.atSliderCentre);
  ok('krok 2: w środku potwierdzenia leży potwierdzenie', Boolean(send)
    && send.contains(document.elementFromPoint(at(send).x, at(send).y)), out.step2.atSendCentre);
  ok('krok 2: w środku wyjścia leży wyjście', Boolean(cancel)
    && cancel.contains(document.elementFromPoint(at(cancel).x, at(cancel).y)), out.step2.atCancelCentre);
  target44(slider, 'suwak oceny');
  target44(send, 'przycisk potwierdzenia');
  target44(cancel, 'wyjście z wybierania');

  /* Rząd ocen musi zmieścić się W KADRZE zdjęcia: `overflow: hidden` potrafi schować wysyłkę i
     wyjście pod dolną krawędź, a wtedy nie da się ani oddać głosu, ani się wycofać. Mierzone
     względem kadru ZDJĘCIA, bo to jego obcinanie było usterką, i względem kafelka. */
  const fits = (el, ref) => {
    const box = el.getBoundingClientRect();
    return box.top >= ref.top - 1 && box.bottom <= ref.bottom + 1;
  };
  out.step2.insidePhoto = [slider, send, cancel].filter(Boolean).every((el) => fits(el, photoBox2));
  out.step2.insideCard = [slider, send, cancel].filter(Boolean).every((el) => fits(el, cardBox));
  ok('krok 2: suwak, potwierdzenie i wyjście mieszczą się w kadrze zdjęcia', out.step2.insidePhoto);
  ok('krok 2: … i w kafelku', out.step2.insideCard);

  /* ============================== WYJŚCIE ODDAJE ZDJĘCIE PALCOWI, A TŁO PROWADZI DALEJ */
  /**
   * Mierzone TU, a nie na końcu sondy: po oddaniu i zmianie głosu kafelki nie mają już nakładki
   * (jedna zmiana na głos), więc na końcu nie byłoby czego zamykać — i warunek przechodziłby na
   * pustym zbiorze.
   */
  await tapOn(cancel, 'wyjście: dotknięcie „zamknij" trafia w przycisk');
  await wait(320);
  const hitAfterCancel = $('.vote-card__hit', card);
  out.cancel = {
    armed: card.classList.contains('is-armed'),
    picking: card.classList.contains('is-picking'),
    hitBack: Boolean(hitAfterCancel) && !hitAfterCancel.hidden,
    veilPill: veil.dataset.pill || '',
    atPhotoCentre: describe(document.elementFromPoint(at(photo).x, at(photo).y))
  };
  ok('wyjście: kafelek złożony', out.cancel.armed === false && out.cancel.picking === false,
    `is-armed=${out.cancel.armed}, is-picking=${out.cancel.picking}`);
  ok('wyjście: zdjęcie znowu przyjmuje dotknięcie', out.cancel.hitBack === true, out.cancel.atPhotoCentre);
  ok('wyjście: strona kadru wyczyszczona (mysz dostaje pigułkę na środku)',
    out.cancel.veilPill === '', `data-pill="${out.cancel.veilPill}"`);

  /**
   * DRUGIE DOTKNIĘCIE W TO SAMO MIEJSCE CO PIERWSZE MUSI PROWADZIĆ DALEJ.
   *
   * To jest najczęstszy ruch człowieka, któremu „nic się nie stało": dotyka jeszcze raz tam,
   * gdzie dotknął. Pigułka stoi wtedy po drugiej stronie kadru, więc palec ląduje na przygaszonym
   * tle — i właśnie dlatego tło rozwija oceny, zamiast składać kafelek. Gdyby składało, dwa
   * dotknięcia w to samo miejsce wracałyby do punktu wyjścia, czyli wprost do tamtego zgłoszenia.
   */
  const again = await tapOn(entry(card), 'tło: pierwsze dotknięcie z powrotem odsłania pigułkę');
  await wait(300);
  out.backdrop = { armed: card.classList.contains('is-armed') };
  if (again) {
    const under = document.elementFromPoint(again.x, again.y);
    out.backdrop.atSamePoint = describe(under);
    out.backdrop.bareBackdrop = under === veil;
    await tap(again.x, again.y);
    await wait(320);
    out.backdrop.picking = card.classList.contains('is-picking');
    out.backdrop.pickerShown = shownBox($('.vote-veil__pick', card));
    ok('tło: drugie dotknięcie W TO SAMO MIEJSCE rozwija rząd ocen',
      out.backdrop.pickerShown === true,
      `w punkcie ${again.x},${again.y} leżało ${out.backdrop.atSamePoint}`);
  }

  /* Wybór oceny: ciągnięcia uchwytu nie da się zbudować z jednego dotknięcia, więc wartość idzie
     przez `value` + zdarzenie `input`. To, czy w suwak da się trafić palcem i czy ma 44 px, jest
     zmierzone wyżej — a szerokość jednego stopnia tutaj. */
  const slider2 = $('.vote-slider', card);
  if (slider2) {
    out.measures['suwak: px na stopień oceny'] = String(Math.round(slider2.getBoundingClientRect().width
      / Math.max(1, Number(slider2.max) - Number(slider2.min))));
    slider2.value = '9';
    slider2.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(100);
  }
  out.readout = $('.vote-slider__value', card)?.textContent.trim() || '';
  ok('krok 2: wybrana ocena widoczna wielką liczbą', out.readout === '9', out.readout);

  /* ================================ ODPORNOŚĆ NA PRZERYSOWANIE SIATKI POD PALCEM */
  /**
   * Siatka przerysowuje się SAMA: odczyt z serwera chodzi co trzydzieści sekund, a w dniu zjazdu
   * liczba głosów przy każdym wozie rośnie z każdym odczytem, czyli odcisk kafelka się zmienia i
   * kafelek powstaje OD NOWA. Otwarty rząd ocen, wybrana ocena I STRONA KADRU muszą to przeżyć —
   * ta ostatnia dlatego, że przeskok pigułki na środek po przerysowaniu postawiłby ją pod palcem,
   * czyli cofnąłby całą naprawę bez zmiany ani jednej linijki.
   *
   * Wymuszane zdarzeniem `visibilitychange`, bo na nim wisi ten sam `pull()`, który chodzi
   * z zegara — czekanie trzydziestu sekund w sondzie nie zmierzyłoby nic więcej.
   */
  document.dispatchEvent(new Event('visibilitychange'));
  await wait(900);
  const same = cards().find((node) => node.dataset.participant === card.dataset.participant);
  const pickAfter = same ? $('.vote-veil__pick', same) : null;
  const sliderAfter = same ? $('.vote-slider', same) : null;
  const sendAfter = same ? $('.vote-veil__send', same) : null;
  out.afterPoll = {
    sameNode: same === card,
    stillPicking: Boolean(same?.classList.contains('is-picking')),
    pickerShown: shownBox(pickAfter),
    veilPill: same ? ($('.vote-veil', same)?.dataset.pill || '') : '',
    score: sliderAfter?.value || '',
    atSendCentre: sendAfter ? describe(document.elementFromPoint(at(sendAfter).x, at(sendAfter).y)) : ''
  };
  ok('odczyt z serwera nie składa otwartego wyboru', out.afterPoll.pickerShown,
    `wezel przebudowany=${!out.afterPoll.sameNode}, is-picking=${out.afterPoll.stillPicking}`);
  ok('odczyt z serwera nie cofa wybranej oceny', out.afterPoll.score === '9', out.afterPoll.score);
  ok('odczyt z serwera nie przenosi pigułki pod palec',
    out.afterPoll.veilPill === out.step1.veilPill,
    `data-pill="${out.afterPoll.veilPill}" (było "${out.step1.veilPill}")`);
  ok('po odczycie w środku potwierdzenia nadal leży potwierdzenie', Boolean(sendAfter)
    && sendAfter.contains(document.elementFromPoint(at(sendAfter).x, at(sendAfter).y)),
    out.afterPoll.atSendCentre);

  /* ============================================ KROK 3: POTWIERDZENIE OTWIERA OKNO */
  await tapOn(sendAfter, 'krok 3: dotknięcie potwierdzenia trafia w przycisk');
  await wait(560);

  const dialog = $('[data-vote-dialog]');
  const form = dialog ? $('[data-vote-form]', dialog) : null;
  const submit = form ? $('button[type="submit"]', form) : null;
  const close = dialog ? $('[data-vote-close]', dialog) : null;
  out.dialog = {
    open: Boolean(dialog?.open),
    score: $('[data-vote-dialog-score]', dialog)?.textContent.trim() || '',
    who: $('[data-vote-dialog-who]', dialog)?.textContent.trim() || '',
    bodyLocked: document.body.classList.contains('is-locked'),
    formShown: Boolean(form) && !form.hidden,
    /* Okno „otwarte" nie znaczy „widoczne": `dialog.open` bywa prawdą przy panelu stojącym poza
       oknem. Pytamy więc, czy przycisk wysyłki mieści się w ekranie i czy da się w niego trafić. */
    submitInView: submit
      ? (() => {
          const box = submit.getBoundingClientRect();
          return box.top >= 0 && box.bottom <= window.innerHeight;
        })()
      : null,
    atSubmitCentre: submit ? describe(document.elementFromPoint(at(submit).x, at(submit).y)) : ''
  };
  ok('krok 3: okno z adresem otwarte', out.dialog.open);
  ok('krok 3: okno niesie wybraną ocenę', out.dialog.score === '9', out.dialog.score);
  ok('krok 3: okno mówi, o który wóz chodzi', Boolean(out.dialog.who), out.dialog.who);
  ok('krok 3: tło zablokowane, gdy okno stoi na ekranie', out.dialog.bodyLocked);
  if (!out.dialog.open) return out;
  ok('krok 3: wysyłka mieści się w ekranie', out.dialog.submitInView === true);
  ok('krok 3: w środku wysyłki leży wysyłka', Boolean(submit)
    && submit.contains(document.elementFromPoint(at(submit).x, at(submit).y)), out.dialog.atSubmitCentre);
  target44(close, 'zamknięcie okna');
  target44(submit, 'wyślij głos w oknie');

  /* Adres wpisany, bo dalej sprawdzamy panel „Twój głos" — droga anonimowa ma inne teksty i
     własną sondę. Klawiatury systemowej nie ma czym udawać, a pole reaguje na to samo zdarzenie,
     które przychodzi od klawiatury. */
  const setField = (name, value) => {
    const field = form.elements.namedItem(name);
    if (!field) return;
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  };
  setField('name', 'Marco');
  setField('email', 'marco@example.com');
  await wait(150);

  /* ============================================ KROK 4: GŁOS ODDANY */
  await tapOn(submit, 'krok 4: dotknięcie „wyślij głos" trafia w przycisk');
  await wait(950);

  const shown = (el) => Boolean(el) && !el.hidden
    && getComputedStyle(el).display !== 'none' && el.offsetParent !== null;
  out.afterVote = {
    dialogClosed: !dialog.open,
    bodyUnlocked: !document.body.classList.contains('is-locked'),
    votedCards: $$('.vote-card.is-voted').length,
    toast: $('[data-toast-text]')?.textContent.trim() || '',
    toastTone: $('[data-toast]')?.dataset.toastTone || '',
    minePanelShown: shown($('[data-vote-mine]'))
  };
  ok('krok 4: okno zamknięte po wysłaniu', out.afterVote.dialogClosed);
  ok('krok 4: przewijanie odblokowane', out.afterVote.bodyUnlocked);
  ok('krok 4: dokładnie jeden kafelek oznaczony jako mój', out.afterVote.votedCards === 1,
    String(out.afterVote.votedCards));
  ok('krok 4: potwierdzenie na ekranie', Boolean(out.afterVote.toast), out.afterVote.toast);

  /* ==================================== DRUGA DROGA: PRZENIESIENIE GŁOSU, TEŻ DWOMA DOTKNIĘCIAMI */
  /**
   * Głos jest jeden, ale wolno go raz zmienić — i to też musi być przejezdne pod palcem. Bez tego
   * kroku „na telefonie nie da się zagłosować" byłoby naprawione do połowy: kto trafił w zły
   * kafelek, zostaje z głosem na cudzym wozie i bez wyjścia.
   *
   * DRUGI WARUNEK TEGO BLOKU: zmiana idzie BEZ okna z adresem. Adres jest już znany, a pytanie
   * o niego dawałoby możliwość podania cudzego i zamiany poprawki w drugi głos (patrz
   * `changeVote` w voting-page.js).
   */
  const second = cards()[1];
  if (second) {
    second.scrollIntoView({ block: 'center', inline: 'nearest' });
    await wait(280);
    const tapB = await tapOn(entry(second), 'zmiana: pierwsze dotknięcie drugiego kafelka trafia w cel');
    await wait(320);
    const ctaB = $('.vote-veil__cta', second);
    const ctaBcentre = ctaB && shownBox(ctaB) ? at(ctaB) : null;
    out.change = {
      pillShown: shownBox(ctaB),
      ctaLabel: ctaB?.textContent.trim() || '',
      pickerAfterFirst: shownBox($('.vote-veil__pick', second)),
      gap: tapB && ctaBcentre
        ? Math.round(Math.hypot(ctaBcentre.x - tapB.x, ctaBcentre.y - tapB.y))
        : null
    };
    ok('zmiana: pierwsze dotknięcie pokazuje pigułkę i nie rozwija ocen',
      out.change.pillShown === true && out.change.pickerAfterFirst === false,
      `„${out.change.ctaLabel}"`);
    if (out.change.gap !== null) {
      out.measures['pigułka na drugim kafelku: odległość od dotknięcia'] = `${out.change.gap} px`;
      ok('zmiana: pigułka drugiego kafelka też nie stoi pod palcem', out.change.gap >= 44,
        `${out.change.gap} px`);
    }
    await tapOn(ctaB || entry(second), 'zmiana: dotknięcie pigułki rozwija rząd ocen');
    await wait(320);
    out.change.pickerShown = shownBox($('.vote-veil__pick', second));
    ok('zmiana: rząd ocen otwarty na drugim kafelku', out.change.pickerShown === true);

    const sendB = $('.vote-veil__send', second);
    if (sendB) {
      await tapOn(sendB, 'zmiana: dotknięcie potwierdzenia trafia w przycisk');
      await wait(850);
      out.change.dialogOpened = Boolean($('[data-vote-dialog]')?.open);
      out.change.movedTo = cards()[1]?.classList.contains('is-voted')
        && $$('.vote-card.is-voted').length === 1;
      out.change.toast = $('[data-toast-text]')?.textContent.trim() || '';
      ok('zmiana: głos stoi teraz na drugim kafelku', Boolean(out.change.movedTo), out.change.toast);
      ok('zmiana: okno z adresem NIE wstaje przy zmianie istniejącego głosu',
        out.change.dialogOpened === false);
    }
  }

  out.notes.push('KONTRAKT: dwa dotknięcia do rzędu ocen (zdjęcie → pigułka → oceny). Życzenie właściciela; warunkiem jego działania jest to, że pigułka nie stoi pod palcem — dlatego odległość jej środka od punktu dotknięcia jest tu warunkiem, nie ozdobą.');
  out.notes.push('Ciągnięcia uchwytu suwaka nie da się zbudować z jednego dotknięcia — ocena idzie przez `value` + zdarzenie `input`. Mierzona jest trafialność i wysokość suwaka, nie samo ciągnięcie.');
  out.notes.push('Harness włącza emulację palca poniżej 700 px, więc `hover: none` jest prawdziwe tylko w przebiegu 390 px. Przebiegi 768 i 1440 pilnują, żeby przepływ pod palcem nie zepsuł myszy — patrz `pointer` w wyniku.');
  out.notes.push('Animacje są wyłączone, żeby mierzyć pudełka, więc `vote-morph` jest sprawdzana z arkusza (obecność klatek) i z geometrii (krawędź rzędu ocen = krawędź pigułki), nie z `animationName`.');
  out.notes.push('Odpowiedź serwera jest podstawiona (zaślepka albo demo), więc mierzalne jest wszystko po stronie przeglądarki — nie to, czy Worker zapisze głos.');
  return out;
}
