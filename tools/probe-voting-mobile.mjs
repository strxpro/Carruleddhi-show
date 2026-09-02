/**
 * DROGA DO GŁOSU SAMYMI DOTKNIĘCIAMI — PIGUŁKA WIDOCZNA W SPOCZYNKU, JEDNO DOTKNIĘCIE DO OCEN.
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
 * KONTRAKT: TRZY KROKI, A NAPIS „ZAGŁOSUJ" JEST NA ZDJĘCIU OD RAZU
 * ---------------------------------------------------------------------------
 *   1. spoczynek                     → pigułka „Zagłosuj" WIDOCZNA na zdjęciu, bez najeżdżania
 *                                      i bez dotykania, z własnym tłem i przygaszeniem pod nią,
 *   2. dotknięcie pigułki            → rząd ocen wyrastający Z JEJ MIEJSCA (jedno dotknięcie),
 *                                      i to samo po dotknięciu zdjęcia OBOK pigułki,
 *   3. potwierdzenie oceny           → okno z adresem (tylko gdy głosu jeszcze nie ma).
 *
 *   Zamówienie, dosłownie: „jak klikam w zdjęcie żeby zagłosować to chciałbym żeby pokazał się
 *   tam napis zagłosuj i po kliknięciu wtedy z tego guzika rozsuwa się ten pop out z suwakiem
 *   i jak się klika zagłosuj to wtedy pokazuje się to z e-mailem".
 *
 * CO TA SONDA MIERZYŁA PRZEDTEM I DLACZEGO TO NIEPRAWDA
 * ---------------------------------------------------------------------------
 *   Do poprzedniego uruchomienia kontrakt brzmiał „DWA dotknięcia": pierwsze miało odsłonić
 *   pigułkę (ukrytą do tej chwili), drugie rozwinąć oceny. Sonda pilnowała wtedy dwóch rzeczy,
 *   których dziś nie ma i nie może być:
 *
 *     — „krok 1: rząd ocen JESZCZE zamknięty" — dziś pierwsze dotknięcie MA go rozwinąć;
 *     — „pigułka nie stoi pod palcem, środek dalej niż 44 px od dotknięcia" — pigułka nigdzie
 *       nie wyrasta, bo stoi na zdjęciu, zanim ktokolwiek go dotknie. Odległość od punktu
 *       dotknięcia przestała cokolwiek znaczyć: to człowiek celuje w pigułkę, nie pigułka
 *       zjawia się pod nim. Razem z tym warunkiem zniknęły asercje o `data-pill`.
 *
 *   W ich miejsce weszły warunki na STAN SPOCZYNKU, bo tam przeniosła się cała ta usterka:
 *   napis musi być widoczny, musi mieć własne tło (kontrast liczony z barw, nie oceniany
 *   na oko), musi mieć 44 px i musi dać się w niego trafić palcem BEZ żadnego wcześniejszego
 *   dotknięcia. Kto ukryje pigułkę z powrotem, wywali te warunki, a nie „poprawi wygląd".
 *
 * CZEGO SONDA NIE ODDAŁA, MIMO ZMIANY KONTRAKTU
 *   Trzy warunki zostają nietknięte, bo opisują usterki, które MAJĄ zostać naprawione:
 *   cele dotykowe po 44 px, mieszczenie się rzędu ocen w kadrze zdjęcia (`overflow: hidden`
 *   potrafi schować wysyłkę pod krawędź) i to, że przygaszone tło nakładki nie jest martwą
 *   strefą — ZMIERZONE przed naprawą: 20 z 25 punktów zdjęcia zjadało dotknięcie bez śladu.
 *   Zostaje też warunek o połysku wczytywanego zdjęcia, który przechwytywał dotknięcia.
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
   * DWOMA innymi sposobami: obecnością klatek `vote-morph` w arkuszu i geometrią (środek
   * rzędu ocen musi stać tam, gdzie stał środek pigułki).
   *
   * `transition` gaszony razem z animacjami, ale NIE `opacity`: krycie nakładki w spoczynku
   * jest tu jednym z mierzonych wyników (pod palcem 1, pod myszą 0), więc arkusz musi je
   * wyliczyć sam.
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
  /* CAŁY BLOK „PIGUŁKA W SPOCZYNKU" DOTYCZY WYŁĄCZNIE PALCA.
     Pod myszą kafelek MA zostać czysty do najechania — to jest wprost zamówione („na myszy
     zachowanie zostaje takie, jakie jest dziś") i tam pigułka pojawia się na `:hover`. Sonda
     nie umie najechać kursorem z wnętrza strony, więc na 768 i 1440 mierzy to, co da się
     zmierzyć bez hovera: że nakładka jest wygaszona, że pigułka ma już swoje pudełko (czyli
     wjedzie na ekran w rozmiarze, nie rozwinie się z zera) i że jedno dotknięcie dowozi
     do ocen tak samo jak pod palcem. */
  const touch = out.pointer.hoverNone;
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
   * KONTRAST LICZONY Z BARW, A NIE OCENIANY NA OKO.
   *
   * Zamówienie mówiło wprost: „z czytelnym kontrastem na fotografii (przyciemnienie pod
   * napisem, nie sam biały tekst)". Biały tekst rzucony na zdjęcie jest czytelny na jednym
   * kadrze i niewidoczny na drugim, więc jedyną odpowiedzią, która nie zależy od zdjęcia, jest
   * własne tło pigułki. Tu liczony jest stosunek jasności napisu do tego tła wzorem z WCAG —
   * to jest liczba, którą można wpisać do raportu, a nie wrażenie.
   */
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

  /**
   * Dotknięcie w PODANY PUNKT, ze sprawdzeniem PRZED dotknięciem, kto w tym punkcie leży.
   *
   * Sprawdzenie musi być przed, nie po: po dotknięciu w tym miejscu bywa już co innego, bo
   * strona właśnie zareagowała. Warunek trafienia podaje wołający (`accept`), bo „w porządku"
   * znaczy tu różne rzeczy: przy pigułce pod palcem musi to być sama pigułka, a pod myszą —
   * gdzie pigułka jest wygaszona — wystarczy, że w punkcie leży cokolwiek z drogi do głosu.
   *
   * Dotykamy TAK CZY INACZEJ, także gdy w punkcie leży co innego: to jest właśnie „dotknięcie
   * w powietrze" i chcemy zobaczyć, co po nim zostaje na ekranie.
   */
  const tapPoint = async (point, label, accept) => {
    if (!point) { ok(label, false, 'nie ma czego dotknąć'); return null; }
    const under = document.elementFromPoint(point.x, point.y);
    const good = accept ? Boolean(under) && accept(under) : true;
    await tap(point.x, point.y);
    ok(label, good, good
      ? `punkt ${point.x},${point.y} → ${describe(under)}`
      : `w punkcie ${point.x},${point.y} leży ${describe(under)}`);
    return good ? point : null;
  };

  /** Dotknięcie w środek elementu; trafienie musi należeć do niego samego albo do jego wnętrza. */
  const tapOn = async (element, label) => {
    if (!element) { ok(label, false, 'elementu nie ma w drzewie'); return null; }
    const box = element.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) {
      ok(label, false, `cel ma zerowe wymiary ${Math.round(box.width)}x${Math.round(box.height)}`);
      return null;
    }
    return tapPoint(at(element), label, (under) => element.contains(under));
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
   * Jedno narzędzie, trzy pytania. W spoczynku: czy CAŁE zdjęcie przyjmuje dotknięcie (czyli
   * czy pod każdym punktem leży cel — przezroczysta warstwa albo sama pigułka; tu wychodził
   * połysk szkieletu). Po odsłonięciu bez rzędu ocen: czy tło nakładki nie jest martwą strefą.
   * Przy otwartym rzędzie ocen: czy dotknięcie obok suwaka ma dokąd trafić.
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
   * wprost wymieniona w zamówieniu jako własność do utrzymania („z tego guzika rozsuwa się ten
   * pop out z suwakiem"). Sonda wyłącza animacje, żeby mierzyć pudełka, więc pytanie idzie do
   * arkusza, nie do `getComputedStyle`. Liczone są WZMIANKI: klatki (`@keyframes vote-morph`)
   * i reguła, która je zakłada na `.vote-veil__pick`.
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
  const cta = $('.vote-veil__cta', card);

  /* ======================= KROK 1: NAPIS „ZAGŁOSUJ" WIDAĆ, ZANIM KTOŚ CZEGOKOLWIEK DOTKNIE */
  /**
   * TU MIESZKA CAŁA TA ZMIANA — I TU MIESZKAŁA USTERKA.
   *
   * Pigułka ma być na zdjęciu w spoczynku: widoczna, z własnym tłem, wielkości celu dotykowego
   * i trafialna palcem BEZ żadnego wcześniejszego dotknięcia. Warunek „istnieje w drzewie" nie
   * wystarcza — poprzednio też istniała, tylko była wygaszona i pierwsze dotknięcie szło na jej
   * odsłonięcie. Dlatego pytamy o pięć rzeczy naraz: krycie nakładki, pudełko pigułki, jej
   * położenie w kadrze, kto leży w jej środku i jaki jest kontrast napisu do jej tła.
   */
  const ctaStyle = cta ? getComputedStyle(cta) : null;
  const veilStyle = veil ? getComputedStyle(veil) : null;
  const pillRest = cta ? cta.getBoundingClientRect() : null;
  const pillCentre = cta && pillRest && pillRest.height > 1 ? at(cta) : null;
  const photoRest = photo.getBoundingClientRect();

  out.rest = {
    hasHit: Boolean(hit),
    /* Przezroczysty przycisk NIESIE NAZWĘ „Zagłosuj…" — ten sam zamiar co pigułka i ta sama
       czynność, bo prowadzi do tego samego rzędu ocen. Dwa cele, jedna droga: człowiek celujący
       w napis wielkości ćwiartki kafelka raz trafia w napis, a raz dwa piksele obok. */
    hitLabel: hit?.getAttribute('aria-label') || '',
    photoBox: size(photo),
    veilOpacity: veilStyle ? Number(veilStyle.opacity) : null,
    veilEvents: veilStyle ? veilStyle.pointerEvents : null,
    /* Przygaszenie POD napisem, nie sam napis na fotografii — patrz komentarz przy
       `@media (hover: none)` w voting.css. Pod myszą w spoczynku nakładki nie widać w ogóle,
       więc gradient jest tam bez znaczenia. */
    veilBackdrop: veilStyle ? String(veilStyle.backgroundImage || 'none').slice(0, 140) : '',
    pillShown: shownBox(cta) && Number(ctaStyle?.opacity ?? 1) > 0,
    pillLabel: cta?.textContent.trim() || '',
    pillBox: cta ? size(cta) : '',
    pillEvents: ctaStyle ? ctaStyle.pointerEvents : '',
    pillColor: ctaStyle ? ctaStyle.color : '',
    pillBackground: ctaStyle ? ctaStyle.backgroundColor : '',
    pillContrast: ctaStyle ? contrast(ctaStyle.color, ctaStyle.backgroundColor) : null,
    pillInsidePhoto: pillRest
      ? pillRest.top >= photoRest.top - 1 && pillRest.bottom <= photoRest.bottom + 1
      : false,
    /* Ile kadru zabiera napis stojący na nim na stałe. Nie warunek, tylko liczba do rozmowy
       „czy to jeszcze galeria wozów": przy 173×173 pigułka 159×44 to jedna czwarta zdjęcia. */
    pillShareOfPhoto: pillRest
      ? Math.round((pillRest.width * pillRest.height) / (photoRest.width * photoRest.height) * 100)
      : null,
    atPillCentre: pillCentre ? describe(document.elementFromPoint(pillCentre.x, pillCentre.y)) : '',
    atPhotoCentre: describe(document.elementFromPoint(at(photo).x, at(photo).y)),
    /* Ile dolnej części kadru zajmuje podpis zdjęcia (imię, nazwa wozu, nazwisko, kategoria).
       To ta liczba rozstrzyga, dlaczego pigułka stoi na ŚRODKU, a nie przy dolnej krawędzi
       bliżej kciuka: przy dolnej zakryłaby nazwę wozu, na który ma się głosować. Raport, nie
       warunek — ale komentarz w voting.css powołuje się właśnie na ten pomiar. */
    captionFromBottom: (() => {
      const caption = $('.vote-card__caption', card);
      if (!caption) return null;
      const box = caption.getBoundingClientRect();
      return Math.round(photoRest.bottom - box.top);
    })(),
    /**
     * CZEGO PIGUŁKA NIE MOŻE ZAKRYĆ: NAZWY WOZU.
     *
     * Napis stojący na zdjęciu na stałe zabiera miejsce czemuś, co tam już jest. Podpis ma trzy
     * wiersze: plakietkę z imieniem, NAZWĘ WOZU (największy napis na kafelku) i wiersz
     * „nazwisko · kategoria". Nachodzenie na plakietkę z imieniem jest do przyjęcia, bo to samo
     * imię stoi w trzecim wierszu — nachodzenie na nazwę wozu nie jest, bo to jedyne miejsce,
     * w którym ona jest, a głosuje się właśnie na nią.
     */
    pillOverTitle: (() => {
      const title = $('.vote-card__title', card);
      if (!title || !pillRest) return null;
      const box = title.getBoundingClientRect();
      return Math.round(Math.max(0, Math.min(pillRest.bottom, box.bottom) - Math.max(pillRest.top, box.top)));
    })(),
    pillOverCaption: (() => {
      const caption = $('.vote-card__caption', card);
      if (!caption || !pillRest) return null;
      const box = caption.getBoundingClientRect();
      return Math.round(Math.max(0, Math.min(pillRest.bottom, box.bottom) - Math.max(pillRest.top, box.top)));
    })()
  };
  out.measures['kadr zdjęcia'] = out.rest.photoBox;
  out.measures['pigułka „Zagłosuj" w spoczynku'] = out.rest.pillBox;
  out.measures['pigułka: kontrast napisu do jej tła'] =
    `${out.rest.pillContrast}:1 (${out.rest.pillColor} na ${out.rest.pillBackground})`;
  out.measures['pigułka: udział w kadrze'] = `${out.rest.pillShareOfPhoto}%`;
  out.measures['podpis zdjęcia: ile zajmuje od dolnej krawędzi kadru'] =
    `${out.rest.captionFromBottom} px`;
  out.measures['pigułka nachodzi na podpis / na nazwę wozu'] =
    `${out.rest.pillOverCaption} px / ${out.rest.pillOverTitle} px`;

  /* Pudełko pigułki jest mierzalne w KAŻDYM wskaźniku, także pod myszą, gdzie nakładka ma
     `opacity: 0`: wygaszenie nie zabiera układu. To jest jedyny moment, w którym da się je
     zmierzyć — po dotknięciu pigułka ustępuje miejsca suwakowi (`display: none`) i zwraca 0×0. */
  target44(cta, 'pigułka „Zagłosuj"');
  ok('spoczynek: pigułka ma napis', Boolean(out.rest.pillLabel), `„${out.rest.pillLabel}"`);
  ok('spoczynek: pigułka stoi NA zdjęciu, nie pod kadrem', out.rest.pillInsidePhoto === true,
    `pigułka ${out.rest.pillBox} w kadrze ${out.rest.photoBox}`);
  /* Napis stojący na zdjęciu na stałe NIE MOŻE zakryć nazwy wozu — to jedyne miejsce, w którym
     ona jest, a głosuje się właśnie na nią. Plakietka z imieniem jest wyjątkiem: to samo imię
     stoi w wierszu „nazwisko · kategoria" pod nią, więc nachodzenie na nią nic nie zabiera. */
  ok('spoczynek: pigułka nie zakrywa nazwy wozu', out.rest.pillOverTitle === 0,
    `nachodzi na podpis ${out.rest.pillOverCaption} px, na nazwę wozu ${out.rest.pillOverTitle} px`);
  /* KONTRAST: liczba, nie wrażenie. 4.5:1 to próg WCAG dla zwykłego tekstu; napis na pigułce
     jest pogrubiony i wersalikami, więc formalnie wystarczyłoby 3:1 — próg zostaje wyższy,
     bo to jedyny napis, od którego zależy, czy ktoś w ogóle zagłosuje. */
  ok('spoczynek: napis na pigułce ma kontrast na własnym tle (≥4.5:1)',
    Number(out.rest.pillContrast) >= 4.5, `${out.rest.pillContrast}:1`);
  target44(hit, 'cel dotknięcia zdjęcia');
  ok('spoczynek: przezroczysty cel na zdjęciu niesie nazwę dla czytnika ekranu',
    Boolean(out.rest.hitLabel), out.rest.hitLabel);

  if (touch) {
    ok('KROK 1: pod palcem nakładka z pigułką jest WIDOCZNA bez dotykania i bez najeżdżania',
      out.rest.veilOpacity === 1 && out.rest.pillShown === true,
      `krycie nakładki ${out.rest.veilOpacity}, pigułka ${out.rest.pillBox}`);
    /* Tło nakładki w spoczynku NIE łapie dotknięcia, choć jest widoczne: dotknięcia obok
       pigułki należą do `.vote-card__hit`, który jest przyciskiem z nazwą. Gdyby tło je
       przechwytywało, byłaby to martwa strefa na całym zdjęciu — ta sama, którą mierzy
       siatka 5×5 niżej. */
    ok('krok 1: widoczne tło nakładki nie odbiera dotknięć przezroczystemu celowi',
      out.rest.veilEvents === 'none', `wskaźnik nakładki ${out.rest.veilEvents}`);
    ok('KROK 1: w środku pigułki leży pigułka — palec trafia w napis, nie w warstwę pod nim',
      Boolean(cta) && Boolean(pillCentre)
      && cta.contains(document.elementFromPoint(pillCentre.x, pillCentre.y)),
      `${out.rest.atPillCentre}, wskaźnik pigułki ${out.rest.pillEvents}`);
    ok('krok 1: pod napisem leży przygaszenie, a nie goła fotografia',
      /gradient/.test(out.rest.veilBackdrop), out.rest.veilBackdrop);
  } else {
    ok('MYSZ: kafelek zostaje czysty do najechania (nakładka wygaszona)',
      out.rest.veilOpacity === 0 && out.rest.veilEvents === 'none',
      `krycie ${out.rest.veilOpacity}, wskaźnik ${out.rest.veilEvents}`);
    out.notes.push('Wskaźnik z hoverem: pigułka pojawia się na najechanie, więc w spoczynku jest wygaszona — i tak ma być. Zmierzone tu jest jej pudełko i kontrast, bo one nie zależą od hovera.');
  }

  /* CAŁE zdjęcie przyjmuje dotknięcie, nie tylko sama pigułka: kafelek wygląda jak jeden wielki
     przycisk i tak jest dotykany. Punkt należy do celu, gdy leży w przezroczystej warstwie albo
     w samej pigułce — obie prowadzą do rzędu ocen. */
  const restGrid = grid5(card);
  const restDead = restGrid.filter((p) => {
    const onHit = hit && !hit.hidden && hit.contains(p.el);
    const onPill = cta && cta.contains(p.el);
    return !onHit && !onPill;
  });
  out.rest.gridDead = restDead.map((p) => `${p.x},${p.y}: ${describe(p.el)}`);
  ok('spoczynek: wszystkie 25 punktów zdjęcia przyjmuje dotknięcie',
    restDead.length === 0,
    `${restGrid.length - restDead.length}/${restGrid.length} punktów na celu${restDead.length ? `, martwe: ${out.rest.gridDead.join(' | ')}` : ''}`);
  out.measures['siatka 5x5 w spoczynku: punkty na celu'] =
    `${restGrid.length - restDead.length}/${restGrid.length}`;

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
   * takiego kafelka zwracał `figure.vote-card__photo` i dotknięcie nie robiło NIC.
   * To jest jedna z przyczyn tamtego zgłoszenia, która MA zostać naprawiona.
   */
  photo.classList.add('is-loading');
  await wait(90);
  const loadingGrid = grid5(card);
  const loadingDead = loadingGrid.filter((p) => !(hit.contains(p.el) || (cta && cta.contains(p.el))));
  out.loading = {
    atPhotoCentre: describe(document.elementFromPoint(at(photo).x, at(photo).y)),
    shimmerEvents: getComputedStyle(photo, '::after').pointerEvents,
    hitZ: getComputedStyle(hit).zIndex,
    gridDead: loadingDead.map((p) => `${p.x},${p.y}: ${describe(p.el)}`)
  };
  ok('szkielet wczytywanego zdjęcia nie zjada dotknięcia (25 punktów)',
    out.loading.gridDead.length === 0,
    `${out.loading.atPhotoCentre}, połysk wskaźnik=${out.loading.shimmerEvents}, hit z-index=${out.loading.hitZ}`);
  photo.classList.remove('is-loading');
  await wait(60);

  /* ======================= KROK 2: JEDNO DOTKNIĘCIE PIGUŁKI ROZWIJA Z NIEJ RZĄD OCEN */
  /**
   * Dotykamy DOKŁADNIE w środek pigułki, tak jak człowiek celujący w napis.
   *
   * Warunek trafienia jest luźniejszy niż w `tapOn`, i to jest świadome: pod myszą pigułka jest
   * w spoczynku wygaszona, więc w tym punkcie leży przezroczysta warstwa nad nią. Jedno i
   * drugie prowadzi do tego samego `toPick()`. Strict warunek „leży tam pigułka" jest wyżej,
   * w bloku dla palca, gdzie ma znaczenie.
   */
  const tap1 = await tapPoint(pillCentre, 'krok 2: dotknięcie w środek napisu „Zagłosuj"',
    (under) => (cta && cta.contains(under)) || (hit && hit.contains(under)) || (veil && veil.contains(under)));
  await wait(320);

  const picker = $('.vote-veil__pick', card);
  const slider = $('.vote-slider', card);
  const send = $('.vote-veil__send', card);
  const cancel = $('.vote-veil__cancel', card);
  const pickBox = picker ? picker.getBoundingClientRect() : null;
  const cardBox = card.getBoundingClientRect();
  const photoBox2 = photo.getBoundingClientRect();

  /**
   * „Wyrasta Z TEJ pigułki" zmierzone geometrycznie: środek rzędu ocen musi stać tam, gdzie stał
   * środek pigułki. Oba są ustawiane JEDNĄ własnością na wspólnym rodzicu (`align-content` na
   * `.vote-veil`), więc rozjechanie się tych dwóch liczb znaczy, że ktoś rozdzielił
   * pozycjonowanie pigułki i suwaka — i „rozsuwanie się z guzika" zamieniło się w przyjazd
   * pudełka z innego miejsca kadru.
   *
   * LICZONE WZGLĘDEM ŚRODKA KADRU, A NIE WE WSPÓŁRZĘDNYCH OKNA. Kafelek pod kursorem podnosi
   * się o kilka pikseli (`transform` w sekcji „siatka" w voting.css), a te dwa pomiary są
   * z dwóch różnych chwil: pigułka w spoczynku, rząd ocen po naciśnięciu. ZMIERZONE na
   * 768×1024: samo podniesienie kafelka dawało 4 px różnicy i wyglądało jak przesunięcie
   * rzędu ocen, choć oba stały dokładnie na środku swojego kadru. Odjęcie środka kadru w tej
   * samej chwili, w której mierzone jest pudełko, znosi to podniesienie.
   */
  const offsetInPhoto = (box, frame) => ({
    dx: (box.left + box.width / 2) - (frame.left + frame.width / 2),
    dy: (box.top + box.height / 2) - (frame.top + frame.height / 2)
  });
  const morphAnchor = pickBox && pillRest
    ? (() => {
      const pill = offsetInPhoto(pillRest, photoRest);
      const pick = offsetInPhoto(pickBox, photoBox2);
      return { dx: Math.round(Math.abs(pick.dx - pill.dx)), dy: Math.round(Math.abs(pick.dy - pill.dy)) };
    })()
    : null;

  out.step2 = {
    cardArmed: card.classList.contains('is-armed'),
    cardPicking: card.classList.contains('is-picking'),
    hitHidden: hit ? hit.hidden : null,
    veilOpacity: Number(getComputedStyle(veil).opacity),
    veilEvents: getComputedStyle(veil).pointerEvents,
    pickerShown: shownBox(picker),
    ctaGone: cta ? getComputedStyle(cta).display === 'none' : null,
    sliderRange: slider ? `${slider.min}-${slider.max}` : '',
    sendLabel: send?.textContent.trim() || '',
    pillBox: pillRest ? `${Math.round(pillRest.width)}x${Math.round(pillRest.height)} @${Math.round(pillRest.top)}` : '',
    pickBox: pickBox ? `${Math.round(pickBox.width)}x${Math.round(pickBox.height)} @${Math.round(pickBox.top)}` : '',
    morphAnchor,
    morphMentions: morphMentions(),
    atSliderCentre: slider ? describe(document.elementFromPoint(at(slider).x, at(slider).y)) : '',
    atSendCentre: send ? describe(document.elementFromPoint(at(send).x, at(send).y)) : '',
    atCancelCentre: cancel ? describe(document.elementFromPoint(at(cancel).x, at(cancel).y)) : '',
    activeElement: describe(document.activeElement)
  };
  out.measures['pigułka → rząd ocen: przesunięcie środka'] =
    morphAnchor ? `dx ${morphAnchor.dx}, dy ${morphAnchor.dy} px` : 'brak pomiaru';

  ok('KROK 2: JEDNO dotknięcie pigułki rozwija rząd ocen — bez drugiego',
    out.step2.pickerShown === true && out.step2.cardPicking === true,
    `is-picking=${out.step2.cardPicking}, suwak w kadrze=${out.step2.pickerShown}`);
  ok('krok 2: pigułka ustępuje miejsca rzędowi ocen', out.step2.ctaGone === true);
  ok('krok 2: nakładka łapie wskaźnik, gdy stoi na niej wybór',
    out.step2.veilOpacity === 1 && out.step2.veilEvents === 'auto',
    `krycie ${out.step2.veilOpacity}, wskaźnik ${out.step2.veilEvents}`);
  ok('krok 2: przezroczysta warstwa zeszła z drogi suwakowi', out.step2.hitHidden === true,
    `hidden=${out.step2.hitHidden}`);
  ok('krok 2: rząd ocen wyrasta Z MIEJSCA pigułki, a nie skądś indziej',
    Boolean(morphAnchor) && morphAnchor.dx <= 2 && morphAnchor.dy <= 2,
    `pigułka ${out.step2.pillBox} → oceny ${out.step2.pickBox}, przesunięcie środka dx ${morphAnchor?.dx} dy ${morphAnchor?.dy}`);
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
  ok('krok 2: fokus przeszedł na suwak (klawiatura i czytnik ekranu idą dalej)',
    document.activeElement === slider, out.step2.activeElement);
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

  /* Przy otwartym rzędzie ocen tło nakładki nadal nie może być martwe: tam dotknięcie SKŁADA
     kafelek, czyli jest wyjściem, i musi mieć obsługę. */
  const pickingGrid = grid5(card);
  const pickingOutside = pickingGrid.filter((p) => !veil.contains(p.el));
  out.step2.gridOutside = pickingOutside.map((p) => `${p.x},${p.y}: ${describe(p.el)}`);
  ok('krok 2: przy otwartym wyborze żaden z 25 punktów zdjęcia nie jest martwy',
    pickingOutside.length === 0,
    `${pickingGrid.length - pickingOutside.length}/${pickingGrid.length} na nakładce${pickingOutside.length ? `, poza: ${out.step2.gridOutside.join(' | ')}` : ''}`);

  /* ============================== WYJŚCIE ODDAJE ZDJĘCIE PALCOWI, A NAPIS WRACA NA KADR */
  /**
   * Mierzone TU, a nie na końcu sondy: po oddaniu i zmianie głosu kafelki nie mają już nakładki
   * (jedna zmiana na głos), więc na końcu nie byłoby czego zamykać — i warunek przechodziłby na
   * pustym zbiorze.
   */
  await tapOn(cancel, 'wyjście: dotknięcie „zamknij" trafia w przycisk');
  await wait(320);
  const hitAfterCancel = $('.vote-card__hit', card);
  const ctaAfterCancel = $('.vote-veil__cta', card);
  out.cancel = {
    armed: card.classList.contains('is-armed'),
    picking: card.classList.contains('is-picking'),
    hitBack: Boolean(hitAfterCancel) && !hitAfterCancel.hidden,
    pillBack: shownBox(ctaAfterCancel),
    pillBox: ctaAfterCancel ? size(ctaAfterCancel) : '',
    atPhotoCentre: describe(document.elementFromPoint(at(photo).x, at(photo).y))
  };
  ok('wyjście: kafelek złożony', out.cancel.armed === false && out.cancel.picking === false,
    `is-armed=${out.cancel.armed}, is-picking=${out.cancel.picking}`);
  ok('wyjście: zdjęcie znowu przyjmuje dotknięcie', out.cancel.hitBack === true, out.cancel.atPhotoCentre);
  /* Napis wraca na kadr, bo stan spoczynku jest jeden: kto się wycofał, ma znowu widzieć, że
     da się zagłosować. Pod myszą pigułka jest po wyjściu wygaszona, więc pytanie brzmi „ma
     pudełko", a nie „jest widoczna". */
  ok('wyjście: pigułka „Zagłosuj" wraca na zdjęcie', out.cancel.pillBack === true, out.cancel.pillBox);

  /* ================= DOTKNIĘCIE ZDJĘCIA OBOK NAPISU ROBI TO SAMO CO DOTKNIĘCIE NAPISU */
  /**
   * Pigułka zajmuje jedną czwartą kadru. Trzy czwarte pozostałe to miejsca, w które ludzie
   * naciskają równie chętnie — kafelek wygląda jak jeden wielki przycisk i tak jest dotykany.
   * Dotykamy więc W GÓRNĄ CZĘŚĆ zdjęcia, wyraźnie poza pigułką, i wymagamy tego samego skutku.
   * Gdyby to nie prowadziło do ocen, zostałaby usterka „naciskam zdjęcie i nic się nie dzieje" —
   * tylko przesunięta z napisu na tło.
   */
  const asideBox = photo.getBoundingClientRect();
  const aside = { x: Math.round(asideBox.left + asideBox.width / 2), y: Math.round(asideBox.top + asideBox.height * 0.14) };
  const asidePill = ctaAfterCancel ? ctaAfterCancel.getBoundingClientRect() : null;
  out.aside = {
    point: `${aside.x},${aside.y}`,
    outsidePill: asidePill ? aside.y < asidePill.top - 4 : null,
    under: describe(document.elementFromPoint(aside.x, aside.y))
  };
  ok('obok napisu: punkt do dotknięcia leży POZA pigułką', out.aside.outsidePill === true,
    `${out.aside.point} → ${out.aside.under}, pigułka od ${Math.round(asidePill?.top || 0)} px`);
  await tapPoint(aside, 'obok napisu: dotknięcie zdjęcia obok pigułki trafia w cel',
    (under) => (hitAfterCancel && hitAfterCancel.contains(under)) || (veil && veil.contains(under)));
  await wait(320);
  out.aside.picking = card.classList.contains('is-picking');
  out.aside.pickerShown = shownBox($('.vote-veil__pick', card));
  ok('OBOK NAPISU: jedno dotknięcie zdjęcia obok pigułki też rozwija rząd ocen',
    out.aside.pickerShown === true && out.aside.picking === true,
    `is-picking=${out.aside.picking}`);

  /* ================= POWRÓT KLAWISZEM ESCAPE: TŁO ODSŁONIĘTEJ NAKŁADKI PROWADZI DALEJ */
  /**
   * Jedyny stan, w którym kafelek stoi odsłonięty BEZ rzędu ocen, to powrót z ocen klawiszem
   * Escape (na myszy jeszcze samo najechanie). Tło nakładki łapie wtedy wskaźnik na CAŁYM
   * zdjęciu i musi prowadzić DALEJ — ZMIERZONE przed naprawą: 20 z 25 punktów zwracało
   * `div.vote-veil` i dotknięcie przepadało bez śladu, na kafelku wyglądającym jak przycisk.
   *
   * Escape wysyłany zdarzeniem, a nie przez protokół: harness ma zaślepkę na dotknięcia, nie na
   * klawiaturę, a obsługa tego klawisza jest nasza własna (nasłuch `keydown` na nakładce), więc
   * nie ma tu zachowania domyślnego przeglądarki, które mogłoby uciec.
   */
  veil.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(220);
  const armedGrid = grid5(card);
  const outsideVeil = armedGrid.filter((p) => !veil.contains(p.el));
  const bareBackdrop = armedGrid.filter((p) => p.el === veil);
  out.backdrop = {
    armed: card.classList.contains('is-armed'),
    picking: card.classList.contains('is-picking'),
    points: armedGrid.length,
    onVeil: armedGrid.length - outsideVeil.length,
    bareBackdrop: bareBackdrop.length,
    outside: outsideVeil.map((p) => `${p.x},${p.y}: ${describe(p.el)}`)
  };
  out.measures['siatka 5x5 po odsłonięciu bez ocen: punkty na nakładce'] =
    `${out.backdrop.onVeil}/${out.backdrop.points} (gołe tło: ${out.backdrop.bareBackdrop})`;
  ok('Escape: rząd ocen zwinięty, kafelek nadal odsłonięty',
    out.backdrop.armed === true && out.backdrop.picking === false,
    `is-armed=${out.backdrop.armed}, is-picking=${out.backdrop.picking}`);
  ok('tło odsłoniętej nakładki: żaden z 25 punktów zdjęcia nie jest martwy',
    outsideVeil.length === 0,
    `${out.backdrop.onVeil}/${out.backdrop.points} na nakładce${outsideVeil.length ? `, poza: ${out.backdrop.outside.join(' | ')}` : ''}`);
  if (bareBackdrop.length) {
    const point = bareBackdrop[0];
    await tapPoint({ x: point.x, y: point.y }, 'tło: dotknięcie gołego tła trafia w nakładkę',
      (under) => under === veil);
    await wait(320);
    out.backdrop.pickerAfterTap = shownBox($('.vote-veil__pick', card));
    ok('tło: dotknięcie gołego tła prowadzi DALEJ (rozwija oceny), a nie wstecz',
      out.backdrop.pickerAfterTap === true,
      `dotknięto ${point.x},${point.y}`);
  } else {
    /* Gołego tła nie ma, gdy rząd ocen zajmuje cały kadr — wtedy nie ma czego mierzyć i nie ma
       martwej strefy. Warunek na pustym zbiorze byłby zielony bez powodu, więc zamiast niego
       zostaje wpis w raporcie. */
    out.notes.push('Po odsłonięciu bez ocen żaden z 25 punktów nie trafił w gołe tło — nie było czego dotknąć, warunek pominięty.');
    await tapOn($('.vote-veil__cta', card), 'tło: powrót do ocen przez pigułkę');
    await wait(320);
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
   * kafelek powstaje OD NOWA. Otwarty rząd ocen i wybrana ocena muszą to przeżyć — inaczej suwak
   * sam się zamyka albo cofa na środek skali w połowie wybierania.
   *
   * Nie ma tu już warunku o „stronie kadru": pigułka i rząd ocen stoją na środku kadru w każdym
   * wskaźniku, więc po przerysowaniu wracają tam same i nie ma czego zapamiętywać. Poprzednio
   * pilnowane było `data-pill`, bo przeskok pigułki na środek stawiał ją pod palcem.
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
    score: sliderAfter?.value || '',
    atSendCentre: sendAfter ? describe(document.elementFromPoint(at(sendAfter).x, at(sendAfter).y)) : ''
  };
  ok('odczyt z serwera nie składa otwartego wyboru', out.afterPoll.pickerShown,
    `wezel przebudowany=${!out.afterPoll.sameNode}, is-picking=${out.afterPoll.stillPicking}`);
  ok('odczyt z serwera nie cofa wybranej oceny', out.afterPoll.score === '9', out.afterPoll.score);
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
  ok('KROK 3: okno z adresem otwarte', out.dialog.open);
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

  /* ==================================== DRUGA DROGA: PRZENIESIENIE GŁOSU, TEŻ JEDNYM DOTKNIĘCIEM */
  /**
   * Głos jest jeden, ale wolno go raz zmienić — i to też musi być przejezdne pod palcem. Bez tego
   * kroku „na telefonie nie da się zagłosować" byłoby naprawione do połowy: kto trafił w zły
   * kafelek, zostaje z głosem na cudzym wozie i bez wyjścia.
   *
   * Napis na pigułce jest tu INNY („Przenieś tu swój głos" na cudzym kafelku, „Zmień ocenę" na
   * własnym) i to jest sprawdzane wprost: ta pigułka ma mówić, co się stanie, a nie zapraszać do
   * drugiego głosu, którego nie da się oddać.
   *
   * DRUGI WARUNEK TEGO BLOKU: zmiana idzie BEZ okna z adresem. Adres jest już znany, a pytanie
   * o niego dawałoby możliwość podania cudzego i zamiany poprawki w drugi głos (patrz
   * `changeVote` w voting-page.js).
   */
  const second = cards()[1];
  if (second) {
    second.scrollIntoView({ block: 'center', inline: 'nearest' });
    await wait(280);
    const ctaB = $('.vote-veil__cta', second);
    const hitB = $('.vote-card__hit', second);
    out.change = {
      pillShown: shownBox(ctaB),
      pillLabel: ctaB?.textContent.trim() || '',
      pillBox: ctaB ? size(ctaB) : '',
      atPillCentre: ctaB && shownBox(ctaB) ? describe(document.elementFromPoint(at(ctaB).x, at(ctaB).y)) : ''
    };
    ok('zmiana: pigułka drugiego kafelka ma pudełko i mówi, co zrobi',
      out.change.pillShown === true && Boolean(out.change.pillLabel),
      `„${out.change.pillLabel}" ${out.change.pillBox}`);
    if (touch) {
      ok('zmiana: pod palcem w środku tej pigułki leży ta pigułka',
        Boolean(ctaB) && ctaB.contains(document.elementFromPoint(at(ctaB).x, at(ctaB).y)),
        out.change.atPillCentre);
    }
    await tapPoint(ctaB && shownBox(ctaB) ? at(ctaB) : null, 'zmiana: dotknięcie pigułki drugiego kafelka',
      (under) => (ctaB && ctaB.contains(under)) || (hitB && hitB.contains(under)) || Boolean($('.vote-veil', second)?.contains(under)));
    await wait(320);
    out.change.pickerShown = shownBox($('.vote-veil__pick', second));
    ok('ZMIANA: jedno dotknięcie rozwija rząd ocen na drugim kafelku',
      out.change.pickerShown === true);

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

  out.notes.push('KONTRAKT: pigułka „Zagłosuj" widoczna na zdjęciu w spoczynku (pod palcem), JEDNO dotknięcie rozwija z niej rząd ocen, potwierdzenie otwiera okno z adresem. Życzenie właściciela, dosłownie: „pokazał się tam napis zagłosuj i po kliknięciu wtedy z tego guzika rozsuwa się ten pop out z suwakiem".');
  out.notes.push('Warunkiem, żeby jedno dotknięcie nie było usterką, jest WIDOCZNOŚĆ pigułki w spoczynku — dlatego krycie nakładki, pudełko pigułki, kontrast napisu do jej tła i trafialność jej środka są tu warunkami, nie ozdobą. Kto ukryje pigułkę, wywali te warunki.');
  out.notes.push('Ciągnięcia uchwytu suwaka nie da się zbudować z jednego dotknięcia — ocena idzie przez `value` + zdarzenie `input`. Mierzona jest trafialność i wysokość suwaka, nie samo ciągnięcie.');
  out.notes.push('Harness włącza emulację palca poniżej 700 px, więc `hover: none` jest prawdziwe tylko w przebiegu 390 px. Przebiegi 768 i 1440 pilnują, żeby przepływ pod palcem nie zepsuł myszy: tam pigułka MA być w spoczynku wygaszona (pojawia się na najechanie), a jedno dotknięcie ma dowieźć do ocen tak samo — patrz `pointer` w wyniku.');
  out.notes.push('Animacje są wyłączone, żeby mierzyć pudełka, więc `vote-morph` jest sprawdzana z arkusza (obecność klatek) i z geometrii (środek rzędu ocen = środek pigułki), nie z `animationName`.');
  out.notes.push('Odpowiedź serwera jest podstawiona (zaślepka albo demo), więc mierzalne jest wszystko po stronie przeglądarki — nie to, czy Worker zapisze głos.');
  return out;
}
