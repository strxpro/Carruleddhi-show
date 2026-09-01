/**
 * NA TELEFONIE NIE DA SIĘ ZAGŁOSOWAĆ — CAŁA DROGA DO GŁOSU SAMYMI DOTKNIĘCIAMI.
 * ===========================================================================
 *
 *   TELEFON (dotyk prawdziwy — poniżej 700 px harness włącza emulację palca):
 *   node tools/cdp.mjs probe tools/probe-voting-mobile.mjs --w 390 --h 844 \
 *        --url "/votazione.html?lang=pl" --origin http://127.0.0.1:4173 \
 *        --inject tools/inject-voting-open.js --wait 3000
 *
 *   TABLET i MONITOR (żeby naprawa telefonu nie zepsuła myszy):
 *   ...--w 768 --h 1024...        ...--w 1440 --h 900...
 *
 *   TA SAMA SONDA NA WBUDOWANYM DEMO (bez zaślepki):
 *   ...--url "/votazione.html?demo=1&lang=pl"...
 *
 * DLACZEGO `--url /votazione.html` SAMO NIE WYSTARCZA
 *   Faza głosowania i stawka uczestników przychodzą z Workera, a podglądowy serwer Workera nie
 *   ma. Bez `?demo=1` albo bez zaślepki `--inject` siatka jest PUSTA i sonda nie ma czego
 *   dotknąć — dlatego pierwszym warunkiem niżej jest „siatka ma kafelki", z jasnym komunikatem
 *   zamiast dwudziestu błędów kaskadowych. Zaślepka jest lepsza od `?demo=1`, bo `demo=1`
 *   ustawia `demoDriven` i wyłącza odpytywanie serwera oraz prawdziwą wysyłkę — czyli połowę
 *   drogi, którą tu mierzymy. Obie muszą być zielone.
 *
 * ZASTĘPUJE tools/probe-voting-touch.js
 *   Tamta sonda powstała przy poprzednim podejściu do tej samej usterki i mierzyła tę samą drogę,
 *   tylko opisaną jako DWA dotknięcia: „dotknięcie odsłania Zagłosuj", potem „dotknięcie Zagłosuj
 *   rozwija oceny". Po naprawie ten stan pośredni nie istnieje pod palcem, więc tamten opis
 *   byłby po prostu nieprawdą. Dwie sondy mierzące tę samą drogę rozjeżdżają się przy pierwszej
 *   zmianie i wtedy nie wiadomo, która kłamie — została jedna. Wszystko, czego tamta pilnowała
 *   dodatkowo (połysk wczytywanego zdjęcia, paski przyklejone nad kafelkami, przeżycie
 *   przerysowania siatki, przeniesienie głosu), jest tutaj.
 *
 * DLACZEGO OSOBNA SONDA, SKORO SĄ JUŻ probe-voting-page.js I probe-vote-veil.js
 *   Obie tamte wołają `element.click()`. To jest wywołanie funkcji, nie dotknięcie: trafia w
 *   WSKAZANY element bez względu na to, czy palec w ogóle by w niego trafił, i bez względu na
 *   to, czy do jego odsłonięcia potrzeba było jednego dotknięcia czy trzech. Dokładnie dlatego
 *   obie były zielone w dniu, w którym przyszło zgłoszenie „klikam w zagłosuj i nic się nie
 *   robi".
 *
 *   Tu każde dotknięcie idzie przez `window.__tap(x, y)` — zaślepkę harnessu, która wysyła
 *   PRAWDZIWE zdarzenie dotknięcia przez protokół (patrz `__tapNative` w tools/cdp.mjs).
 *   Przeglądarka sama trafia w element leżący pod punktem, sama dokłada `pointerdown`,
 *   `pointerup` i `click` z `pointerType: 'touch'`, sama ustawia fokus i sama decyduje, że
 *   dotknięcie zjadła nakładka zamiast przycisku pod nią. Sonda nie wskazuje celu — podaje
 *   współrzędne, tak jak palec.
 *
 * CZEGO PILNUJE NAJWAŻNIEJSZY WARUNEK
 *   JEDNO dotknięcie kafelka musi zrobić to, co JEDNO kliknięcie myszą: rozwinąć rząd ocen.
 *   ZMIERZONE przed naprawą, ta sama strona, ta sama sonda, dwie szerokości:
 *
 *     1440×900 (wskaźnik z hoverem)  jedno dotknięcie → is-picking=true, suwak rozwinięty
 *     390×844  (hover: none)         jedno dotknięcie → is-picking=false, suwaka NIE MA
 *
 *   Na telefonie pierwsze dotknięcie zużywał przezroczysty `.vote-card__hit`, żeby odsłonić
 *   przycisk „Zagłosuj" — czyli żeby pokazać to, co mysz dostaje darmo, samym najechaniem.
 *   Z ekranu wygląda to jak „nacisnąłem i nic się nie stało": zdjęcie przygasa, a przycisk
 *   wyrasta DOKŁADNIE POD KCIUKIEM, który go zasłania. Do rzędu ocen trzeba było drugiego
 *   dotknięcia, a każde, które nie trafiło w pigułkę 159×44 w kadrze 173×173, zjadała nakładka
 *   i nie robiło NIC.
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

  /* Przejścia i animacje wyłączone: mierzone jest POŁOŻENIE i TRAFIENIE, a element w połowie
     drogi ma inne pudełko niż na końcu. Robione PO wejściu, żeby nie zmieniać rozruchu. */
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
  const tap = async (x, y) => { if (typeof window.__tap === 'function') await window.__tap(x, y); };

  /**
   * Dotknięcie w środek elementu, ze sprawdzeniem PRZED dotknięciem, kto w tym punkcie leży.
   *
   * Sprawdzenie musi być przed, nie po: po dotknięciu w tym miejscu bywa już co innego, bo
   * strona właśnie zareagowała. `contains`, a nie `===`: palec może trafić w napis w środku
   * przycisku i to jest w porządku — dotknięcie i tak wypływa do przycisku. Nie w porządku jest
   * wtedy, gdy w punkcie leży coś, co NIE jest częścią celu.
   *
   * Dotykamy TAK CZY INACZEJ, także gdy w punkcie leży co innego: to jest właśnie „dotknięcie
   * w powietrze" i chcemy zobaczyć, co po nim zostaje na ekranie.
   */
  const tapOn = async (element, label) => {
    if (!element) return ok(label, false, 'elementu nie ma w drzewie');
    const box = element.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) {
      return ok(label, false, `cel ma zerowe wymiary ${Math.round(box.width)}x${Math.round(box.height)}`);
    }
    const point = at(element);
    const under = document.elementFromPoint(point.x, point.y);
    const reachable = Boolean(under) && element.contains(under);
    await tap(point.x, point.y);
    return ok(label, reachable, reachable
      ? `punkt ${point.x},${point.y}`
      : `w punkcie ${point.x},${point.y} leży ${describe(under)}`);
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
   * dolna krawędź tego, co przykrywa górę ekranu, plus to, co leży w środku zdjęć pierwszych
   * kafelków. Pozwala odróżnić „przycisk nie działa" od „przycisk jest pod paskiem".
   *
   * SELEKTOR Z KLASĄ, NIE SAM ATRYBUT — I TO JEST POPRAWKA, NIE UPIĘKSZENIE.
   *   Od przeniesienia zegara w treść strony `[data-vote-timer]` niosą DWA elementy: pudełko w
   *   treści i jego kopia zadokowana w pasku. Kopia stoi wcześniej w dokumencie, więc samo
   *   `querySelector('[data-vote-timer]')` mierzyło od tej zmiany wnętrze nagłówka — czyli
   *   liczbę, którą `headerBottom` i tak już podaje. Pomiar nadal wychodził poprawnie i to jest
   *   najgorszy rodzaj takiej pomyłki: sonda była zielona, mierząc coś innego, niż mówi.
   *
   *   Zegar w treści nie jest już `sticky`, więc nie zasłania niczego na stałe — zostaje w
   *   pomiarze dlatego, że stoi nad pierwszym rzędem kafelków i wchodzi w rachunek tego, co
   *   widać po wejściu na stronę.
   */
  const bar = $('.vote-timer[data-vote-timer]');
  const header = $('.site-header');
  out.chrome = {
    headerBottom: header ? Math.round(header.getBoundingClientRect().bottom) : null,
    timerBottom: bar && !bar.hidden ? Math.round(bar.getBoundingClientRect().bottom) : null
  };
  /* TYLKO NAGŁÓWEK, BO TYLKO ON ZOSTAJE NA EKRANIE.
     Do tej pory brany był największy z dwóch: nagłówka i zegara — i miało to sens, dopóki zegar
     był `position: sticky` i jechał pod paskiem przy każdym przewinięciu. Nie jest już: stoi w
     treści, więc odjeżdża razem z nią i po pierwszym przewinięciu nie zasłania niczego.
     Zostawienie go w tej sumie dawałoby „góra ekranu zakryta do 461 px" na stronie, gdzie
     zakryte jest 96 px — czyli liczbę, na którą ktoś kiedyś oprze diagnozę „przycisk jest pod
     paskiem". `timerBottom` zostaje w raporcie osobno, bo mówi, ile treści stoi nad pierwszym
     kafelkiem po wejściu na stronę, i to jest inne, nadal przydatne pytanie. */
  out.chrome.coveredTo = out.chrome.headerBottom || 0;
  out.coverage = cards().slice(0, 4).map((node) => {
    const box = node.getBoundingClientRect();
    const point = { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + 86) };
    return `${Math.round(box.top)}px: ${describe(document.elementFromPoint(point.x, point.y))}`;
  });

  const card = cards()[0];
  /* Kafelek na środek okna: nagłówek jest `fixed`, a zegar `sticky`, więc kafelek stojący pod
     nimi jest zasłonięty niezależnie od tego, czy przyciski działają. Stawiamy go tam, gdzie
     postawiłby go człowiek, który na niego patrzy. */
  card.scrollIntoView({ block: 'center', inline: 'nearest' });
  await wait(280);

  const photo = $('.vote-card__photo', card);
  const hit = $('.vote-card__hit', card);
  const veil = $('.vote-veil', card);
  out.rest = {
    hasHit: Boolean(hit),
    /* Przezroczysty przycisk NIESIE NAZWĘ „Zagłosuj…". Stąd bierze się cała ta sonda: element,
       który ogłasza się czytnikowi ekranu jako „Zagłosuj na uczestnika — Tuono", musi po
       naciśnięciu zrobić to, co robi „Zagłosuj", a nie tylko pokazać drugi przycisk o tej
       samej nazwie. */
    hitLabel: hit?.getAttribute('aria-label') || '',
    veilOpacity: veil ? Number(getComputedStyle(veil).opacity) : null,
    veilEvents: veil ? getComputedStyle(veil).pointerEvents : null,
    atPhotoCentre: photo ? describe(document.elementFromPoint(at(photo).x, at(photo).y)) : ''
  };
  ok('kafelek jest czysty: nakładka niewidoczna i nie łapie wskaźnika',
    out.rest.veilOpacity === 0 && out.rest.veilEvents === 'none',
    `krycie ${out.rest.veilOpacity}, wskaźnik ${out.rest.veilEvents}`);
  ok('w środku zdjęcia leży cel dotknięcia, a nie dekoracja',
    Boolean(hit) && hit.contains(document.elementFromPoint(at(photo).x, at(photo).y)),
    out.rest.atPhotoCentre);
  target44(hit, 'cel dotknięcia zdjęcia');

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
   */
  photo.classList.add('is-loading');
  await wait(90);
  out.loading = {
    atPhotoCentre: describe(document.elementFromPoint(at(photo).x, at(photo).y)),
    shimmerEvents: getComputedStyle(photo, '::after').pointerEvents,
    hitZ: getComputedStyle(hit).zIndex
  };
  ok('szkielet wczytywanego zdjęcia nie zjada dotknięcia',
    Boolean(hit) && hit.contains(document.elementFromPoint(at(photo).x, at(photo).y)),
    out.loading.atPhotoCentre);
  photo.classList.remove('is-loading');
  await wait(60);

  /* ============================================ KROK 1: JEDNO DOTKNIĘCIE = RZĄD OCEN */
  /**
   * TU MIESZKA NAPRAWIANA USTERKA.
   *
   * Jedno dotknięcie zdjęcia ma rozwinąć rząd ocen 3–10 z przyciskiem potwierdzenia, czyli
   * dokładnie to, co na myszy robi jedno kliknięcie w „Zagłosuj". Przed naprawą pierwsze
   * dotknięcie zużywała warstwa odsłaniająca przycisk i sonda widziała `is-picking=false`
   * z pustym miejscem tam, gdzie ma stać suwak.
   */
  await tapOn(hit, 'krok 1: dotknięcie zdjęcia trafia w cel');
  await wait(300);

  const picker = $('.vote-veil__pick', card);
  const slider = $('.vote-slider', card);
  const send = $('.vote-veil__send', card);
  const cancel = $('.vote-veil__cancel', card);
  const cta = $('.vote-veil__cta', card);
  out.oneTap = {
    cardArmed: card.classList.contains('is-armed'),
    cardPicking: card.classList.contains('is-picking'),
    hitHidden: hit ? hit.hidden : null,
    veilOpacity: Number(getComputedStyle(veil).opacity),
    veilEvents: getComputedStyle(veil).pointerEvents,
    pickerShown: Boolean(picker) && !picker.hidden && picker.getBoundingClientRect().height > 1,
    sliderRange: slider ? `${slider.min}-${slider.max}` : '',
    sendLabel: send?.textContent.trim() || '',
    ctaLabel: cta?.textContent.trim() || '',
    atSliderCentre: slider ? describe(document.elementFromPoint(at(slider).x, at(slider).y)) : '',
    atSendCentre: send ? describe(document.elementFromPoint(at(send).x, at(send).y)) : '',
    activeElement: describe(document.activeElement)
  };
  ok('krok 1: nakładka odsłonięta i łapie dotknięcie',
    out.oneTap.cardArmed && out.oneTap.veilOpacity === 1 && out.oneTap.veilEvents === 'auto',
    `is-armed=${out.oneTap.cardArmed}, krycie ${out.oneTap.veilOpacity}, wskaźnik ${out.oneTap.veilEvents}`);
  ok('krok 1: przezroczysta warstwa zeszła z drogi', out.oneTap.hitHidden === true,
    `hidden=${out.oneTap.hitHidden}`);
  ok('KROK 1: JEDNO dotknięcie rozwija rząd ocen — bez drugiego dotknięcia',
    out.oneTap.pickerShown,
    `is-picking=${out.oneTap.cardPicking}, suwak w kadrze=${out.oneTap.pickerShown}`);
  ok('krok 1: zakres ocen przychodzi z serwera', out.oneTap.sliderRange === '3-10', out.oneTap.sliderRange);
  ok('krok 1: potwierdzenie ma napis', Boolean(out.oneTap.sendLabel), out.oneTap.sendLabel);
  ok('krok 1: w środku suwaka leży suwak', Boolean(slider)
    && slider.contains(document.elementFromPoint(at(slider).x, at(slider).y)), out.oneTap.atSliderCentre);
  ok('krok 1: w środku potwierdzenia leży potwierdzenie', Boolean(send)
    && send.contains(document.elementFromPoint(at(send).x, at(send).y)), out.oneTap.atSendCentre);
  target44(slider, 'suwak oceny');
  target44(send, 'przycisk potwierdzenia');
  target44(cancel, 'wyjście z wybierania');

  /* Rząd ocen musi zmieścić się W KADRZE zdjęcia: `overflow: hidden` potrafi schować wysyłkę i
     wyjście pod dolną krawędź, a wtedy nie da się ani oddać głosu, ani się wycofać. */
  const cardBox = card.getBoundingClientRect();
  out.oneTap.insideCard = [slider, send, cancel].filter(Boolean).every((el) => {
    const box = el.getBoundingClientRect();
    return box.top >= cardBox.top - 1 && box.bottom <= cardBox.bottom + 1;
  });
  ok('krok 1: suwak, potwierdzenie i wyjście mieszczą się w kafelku', out.oneTap.insideCard);

  /**
   * PRZYGASZONE TŁO NAKŁADKI NIE MOŻE BYĆ MARTWĄ STREFĄ — SPRAWDZANE DOTKNIĘCIEM.
   *
   * Nakładka kryje CAŁE zdjęcie i przy odsłonięciu łapie wskaźnik, więc każdy punkt, w którym
   * nie leży żadna kontrolka, jest miejscem, gdzie dotknięcie może przepaść bez śladu. Kafelek
   * wygląda przy tym jak jeden wielki przycisk, więc palec ląduje tam często.
   *
   * ZMIERZONE przed naprawą na 390×844: 20 z 25 punktów zdjęcia zwracało `div.vote-veil` i nie
   * robiło NIC — jedynym czynnym celem była pigułka 159×44 w kadrze 173×173.
   *
   * Pytanie nie brzmi „czy pod punktem leży element z listy", bo lista selektorów rozjedzie się
   * przy pierwszej zmianie znacznika i sonda zacznie kłamać w obie strony. Pytanie brzmi: czy po
   * dotknięciu tego punktu STAN SIĘ ZMIENIŁ. Dlatego tło jest tu naprawdę dotykane, a potem
   * kafelek otwierany z powrotem jednym dotknięciem — co przy okazji sprawdza, że droga jest
   * przejezdna także po pomyłce.
   */
  const photoBox = photo.getBoundingClientRect();
  let backdrop = null;
  const sampled = [];
  for (let ix = 0; ix < 5 && !backdrop; ix += 1) {
    for (let iy = 0; iy < 5 && !backdrop; iy += 1) {
      const x = Math.round(photoBox.left + photoBox.width * (0.1 + ix * 0.2));
      const y = Math.round(photoBox.top + photoBox.height * (0.1 + iy * 0.2));
      if (y < 0 || y > window.innerHeight || x < 0 || x > window.innerWidth) continue;
      const under = document.elementFromPoint(x, y);
      sampled.push(`${x},${y}: ${describe(under)}`);
      if (under === veil) backdrop = { x, y };
    }
  }
  out.deadZone = { backdrop, sampledPoints: sampled.length };
  if (backdrop) {
    await tap(backdrop.x, backdrop.y);
    await wait(320);
    out.deadZone.collapsed = !card.classList.contains('is-armed') && !card.classList.contains('is-picking');
    ok('krok 1: dotknięcie przygaszonego tła NIE przepada — kafelek reaguje',
      out.deadZone.collapsed === true, `punkt ${backdrop.x},${backdrop.y}`);
    /* Z powrotem do rzędu ocen jednym dotknięciem — tak jak po pomyłce robi to człowiek. */
    const hitBack = $('.vote-card__hit', card);
    out.deadZone.hitBack = Boolean(hitBack) && !hitBack.hidden;
    ok('krok 1: po złożeniu zdjęcie znowu przyjmuje dotknięcie', out.deadZone.hitBack === true);
    await tapOn(entry(card), 'krok 1: powrót do rzędu ocen jednym dotknięciem');
    await wait(320);
    ok('krok 1: rząd ocen wrócił po jednym dotknięciu',
      Boolean($('.vote-veil__pick', card)) && !$('.vote-veil__pick', card).hidden);
  } else {
    /* Na telefonie rząd ocen zajmuje cały kadr (patrz blok `max-width: 700px` w voting.css),
       więc gołego tła nie ma ani w jednym z dwudziestu pięciu punktów — i to też jest wynik. */
    ok('krok 1: nakładka nie ma gołego tła — rząd ocen wypełnia kadr', true,
      `${sampled.length} punktów, wszystkie na kontrolkach`);
  }

  /**
   * WYJŚCIE Z WYBIERANIA MUSI ODDAĆ ZDJĘCIE PALCOWI.
   *
   * Bez tego pomyłka jest pułapką: rząd ocen zostaje otwarty, przezroczysta warstwa nie wraca i
   * kafelek przestaje przyjmować cokolwiek poza przyciskami w środku nakładki. Mierzone TU, a nie
   * na końcu sondy: po oddaniu i zmianie głosu kafelki nie mają już nakładki (jedna zmiana na
   * głos), więc na końcu nie byłoby czego zamykać — i warunek przechodziłby na pustym zbiorze.
   */
  await tapOn($('.vote-veil__cancel', card), 'wyjście: dotknięcie „zamknij" trafia w przycisk');
  await wait(320);
  const hitAfterCancel = $('.vote-card__hit', card);
  out.cancel = {
    armed: card.classList.contains('is-armed'),
    picking: card.classList.contains('is-picking'),
    hitBack: Boolean(hitAfterCancel) && !hitAfterCancel.hidden,
    atPhotoCentre: describe(document.elementFromPoint(at(photo).x, at(photo).y))
  };
  ok('wyjście: kafelek złożony', out.cancel.armed === false && out.cancel.picking === false,
    `is-armed=${out.cancel.armed}, is-picking=${out.cancel.picking}`);
  ok('wyjście: zdjęcie znowu przyjmuje dotknięcie', out.cancel.hitBack === true, out.cancel.atPhotoCentre);
  await tapOn(entry(card), 'wyjście: po „zamknij" jedno dotknięcie znowu rozwija oceny');
  await wait(320);
  ok('wyjście: rząd ocen wrócił', Boolean($('.vote-veil__pick', card))
    && !$('.vote-veil__pick', card).hidden);

  /* Wybór oceny: ciągnięcia uchwytu nie da się zbudować z jednego dotknięcia, więc wartość idzie
     przez `value` + zdarzenie `input`. To, czy w suwak da się trafić palcem i czy ma 44 px, jest
     zmierzone wyżej — a szerokość jednego stopnia niżej. */
  if (slider) {
    out.measures['suwak: px na stopień oceny'] = String(Math.round(slider.getBoundingClientRect().width
      / Math.max(1, Number(slider.max) - Number(slider.min))));
    slider.value = '9';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(100);
  }
  out.oneTap.readout = $('.vote-slider__value', card)?.textContent.trim() || '';
  ok('krok 1: wybrana ocena widoczna wielką liczbą', out.oneTap.readout === '9', out.oneTap.readout);

  /* ================================ ODPORNOŚĆ NA PRZERYSOWANIE SIATKI POD PALCEM */
  /**
   * Siatka przerysowuje się SAMA: odczyt z serwera chodzi co trzydzieści sekund, a w dniu zjazdu
   * liczba głosów przy każdym wozie rośnie z każdym odczytem, czyli odcisk kafelka się zmienia i
   * kafelek powstaje OD NOWA. Otwarty rząd ocen i wybrana ocena muszą to przeżyć — inaczej
   * człowiek, który wybrał dziewiątkę, po pół minuty patrzy na czyste zdjęcie.
   *
   * Wymuszane zdarzeniem `visibilitychange`, bo na nim wisi ten sam `pull()`, który chodzi z
   * zegara — czekanie trzydziestu sekund w sondzie nie zmierzyłoby nic więcej.
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
    pickerShown: Boolean(pickAfter) && !pickAfter.hidden && pickAfter.getBoundingClientRect().height > 1,
    score: sliderAfter?.value || '',
    atSendCentre: sendAfter ? describe(document.elementFromPoint(at(sendAfter).x, at(sendAfter).y)) : ''
  };
  ok('odczyt z serwera nie składa otwartego wyboru', out.afterPoll.pickerShown,
    `wezel przebudowany=${!out.afterPoll.sameNode}, is-picking=${out.afterPoll.stillPicking}`);
  ok('odczyt z serwera nie cofa wybranej oceny', out.afterPoll.score === '9', out.afterPoll.score);
  ok('po odczycie w środku potwierdzenia nadal leży potwierdzenie', Boolean(sendAfter)
    && sendAfter.contains(document.elementFromPoint(at(sendAfter).x, at(sendAfter).y)),
    out.afterPoll.atSendCentre);

  /* ============================================ KROK 2: POTWIERDZENIE OTWIERA OKNO */
  await tapOn(sendAfter, 'krok 2: dotknięcie potwierdzenia trafia w przycisk');
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
  ok('krok 2: okno z adresem otwarte', out.dialog.open);
  ok('krok 2: okno niesie wybraną ocenę', out.dialog.score === '9', out.dialog.score);
  ok('krok 2: okno mówi, o który wóz chodzi', Boolean(out.dialog.who), out.dialog.who);
  ok('krok 2: tło zablokowane, gdy okno stoi na ekranie', out.dialog.bodyLocked);
  if (!out.dialog.open) return out;
  ok('krok 2: wysyłka mieści się w ekranie', out.dialog.submitInView === true);
  ok('krok 2: w środku wysyłki leży wysyłka', Boolean(submit)
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

  /* ============================================ KROK 3: GŁOS ODDANY */
  await tapOn(submit, 'krok 3: dotknięcie „wyślij głos" trafia w przycisk');
  await wait(950);

  const shown = (el) => Boolean(el) && !el.hidden
    && getComputedStyle(el).display !== 'none' && el.offsetParent !== null;
  out.afterVote = {
    dialogClosed: !dialog.open,
    bodyUnlocked: !document.body.classList.contains('is-locked'),
    minePanelShown: shown($('[data-vote-mine]')),
    mineScore: $('[data-vote-mine-score]')?.textContent.trim() || '',
    votedCards: $$('.vote-card.is-voted').length,
    toast: $('[data-toast-text]')?.textContent.trim() || '',
    toastTone: $('[data-toast]')?.dataset.toastTone || ''
  };
  ok('krok 3: okno zamknięte po wysłaniu', out.afterVote.dialogClosed);
  ok('krok 3: przewijanie odblokowane', out.afterVote.bodyUnlocked);
  ok('krok 3: panel „Twój głos" na górze strony', out.afterVote.minePanelShown);
  ok('krok 3: panel niesie oddaną ocenę', out.afterVote.mineScore === '9', out.afterVote.mineScore);
  ok('krok 3: dokładnie jeden kafelek oznaczony jako mój', out.afterVote.votedCards === 1,
    String(out.afterVote.votedCards));
  ok('krok 3: potwierdzenie na ekranie', Boolean(out.afterVote.toast), out.afterVote.toast);

  /* ==================================== DRUGA DROGA: PRZENIESIENIE GŁOSU JEDNYM DOTKNIĘCIEM */
  /**
   * Głos jest jeden, ale wolno go raz zmienić — i to też musi być przejezdne jednym dotknięciem.
   * Bez tego kroku „na telefonie nie da się zagłosować" byłoby naprawione do połowy: kto trafił
   * w zły kafelek, zostaje z głosem na cudzym wozie i bez wyjścia.
   */
  const second = cards()[1];
  if (second) {
    second.scrollIntoView({ block: 'center', inline: 'nearest' });
    await wait(280);
    if (await tapOn(entry(second), 'zmiana: dotknięcie drugiego kafelka trafia w cel')) {
      await wait(320);
      const pick2 = $('.vote-veil__pick', second);
      out.change = {
        pickerShown: Boolean(pick2) && !pick2.hidden && pick2.getBoundingClientRect().height > 1,
        ctaLabel: $('.vote-veil__cta', second)?.textContent.trim() || ''
      };
      ok('zmiana: JEDNO dotknięcie rozwija rząd ocen na drugim kafelku', out.change.pickerShown);
      ok('zmiana: przycisk zaprasza do przeniesienia głosu', Boolean(out.change.ctaLabel), out.change.ctaLabel);
      const send2 = $('.vote-veil__send', second);
      if (send2) {
        await tapOn(send2, 'zmiana: dotknięcie potwierdzenia trafia w przycisk');
        await wait(800);
        out.change.movedTo = cards()[1]?.classList.contains('is-voted')
          && $$('.vote-card.is-voted').length === 1;
        out.change.toast = $('[data-toast-text]')?.textContent.trim() || '';
        ok('zmiana: głos stoi teraz na drugim kafelku', Boolean(out.change.movedTo), out.change.toast);
      }
    }
  }

  out.notes.push('Ciągnięcia uchwytu suwaka nie da się zbudować z jednego dotknięcia — ocena idzie przez `value` + zdarzenie `input`. Mierzona jest trafialność i wysokość suwaka, nie samo ciągnięcie.');
  out.notes.push('Harness włącza emulację palca poniżej 700 px, więc `hover: none` jest prawdziwe tylko w przebiegu 390 px. Przebiegi 768 i 1440 pilnują, żeby naprawa telefonu nie zepsuła myszy — patrz `pointer` w wyniku.');
  out.notes.push('Odpowiedź serwera jest podstawiona (zaślepka albo demo), więc mierzalne jest wszystko po stronie przeglądarki — nie to, czy Worker zapisze głos.');
  return out;
}
