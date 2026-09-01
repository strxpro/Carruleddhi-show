/**
 * WYNIKI NA STRONIE GŁÓWNEJ: NAGRODA PUBLICZNOŚCI, DWANAŚCIE NAGRÓD JURY, ARCHIWUM ROCZNIKÓW.
 * ===========================================================================
 *
 *   TELEFON (dwie szerokości, bo różnią się o czterdzieści pikseli i o jeden zawijany napis):
 *   node tools/cdp.mjs probe tools/probe-podium-results.mjs --w 390 --h 844 \
 *        --url "/index.html?lang=pl&skipIntro=1" --origin http://127.0.0.1:4173 \
 *        --inject tools/inject-podium-awards.js --wait 3000
 *   ...--w 360 --h 740...
 *
 *   MONITOR (żeby wyrównanie telefonu nie zepsuło cokołu na szerokim ekranie):
 *   ...--w 1440 --h 900...
 *
 * CO TU JEST MIERZONE, A CO TYLKO OGLĄDANE
 *   Cokół: środki kart, ich szerokości, nachodzenie i wyjście poza sekcję — LICZBAMI, bo
 *   „wygląda równo" jest zdaniem o zrzucie ekranu, a nie o układzie. Prośba brzmiała
 *   „wyrównane na telefonie" i jedyną odpowiedzią na nią jest zestaw współrzędnych.
 *
 * DLACZEGO ZAŚLEPKA, A NIE `?demo=1`
 *   Wbudowane demo nie zna pól `awards`, `editions` ani `selectedEdition` — to jest przydatny
 *   przypadek („funkcja starsza od strony", sprawdzany na końcu tej sondy przy pomocy
 *   `window.__sent`), ale nie da się na nim zmierzyć ani dwunastu nagród, ani archiwum.
 *   `tools/inject-podium-awards.js` podstawia pełny kontrakt serwera.
 *
 * SKĄD SIĘ BIERZE ZDRAPKA W TEJ SONDZIE
 *   Cokół po zamknięciu głosowania jest zakryty warstwą do zdrapania, a razem z nim czekają
 *   stawka i nagrody jury. Sonda naciska „odkryj wszystko" — tę samą drogę, która istnieje dla
 *   klawiatury i czytnika ekranu. Bez tego wszystkie pomiary niżej mierzyłyby zakrytą stronę.
 */
async (document, window) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

  const out = { steps: [], fail: [], measures: {} };
  const ok = (label, pass, extra = '') => {
    out.steps.push(`${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? ` -> ${extra}` : ''}`);
    if (!pass) out.fail.push(`${label}${extra ? ` (${extra})` : ''}`);
    return pass;
  };

  const shown = (el) => Boolean(el) && !el.hidden
    && getComputedStyle(el).display !== 'none' && el.offsetParent !== null;

  /** Pudełko w całych pikselach. Setne części piksela są tu szumem układu, nie informacją. */
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return {
      l: Math.round(r.left), r: Math.round(r.right),
      t: Math.round(r.top), b: Math.round(r.bottom),
      w: Math.round(r.width), h: Math.round(r.height),
      cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2)
    };
  };
  const spread = (values) => (values.length ? Math.max(...values) - Math.min(...values) : 0);

  out.viewport = `${window.innerWidth}x${window.innerHeight}`;
  const narrow = window.innerWidth <= 700;
  out.layout = narrow ? 'telefon (kolumna)' : 'szeroki (cokol w rzedzie)';

  /* Czekamy na sekcję wyniku, nie na stałą liczbę milisekund: faza przychodzi z sieci, a
     rysowanie cokołu jest o jedno przerysowanie dalej. */
  for (let i = 0; i < 80 && !shown($('[data-podium]')); i += 1) await wait(150);
  if (!ok('sekcja wyniku pokazala sie po zamknieciu glosowania', shown($('[data-podium]')),
    'bez tego nizej nie ma czego mierzyc — sprawdz zaslepke')) return out;

  /* Zdrapka: naciskamy przycisk, nie ścieramy palcem. Ścieranie jest przyjemnością, a mierzymy
     wynik — i to jest zarazem jedyna droga dostępna z klawiatury, więc musi działać. */
  const scratch = $('[data-podium-scratch]');
  if (shown(scratch)) {
    $('[data-podium-scratch-reveal]', scratch)?.click();
    await wait(400);
  }
  ok('zdrapka zeszla z cokolu', !shown($('[data-podium-scratch]')));

  /* Przejścia i animacje wyłączone PO wejściu: mierzone jest położenie końcowe, a element w
     połowie wznoszenia ma inne pudełko niż na stopniu. Konfetti liczymy po sztukach, więc
     wyłączona animacja mu nie przeszkadza. */
  const kill = document.createElement('style');
  /* Dwie linijki obok wyłączenia animacji, i to nie jest kosmetyka pomiaru.
     ---------------------------------------------------------------------------
     Cokół wznosi się animacją: stan SPOCZYNKOWY stopnia to `transform: scaleY(0)`, a dopiero
     klatka końcowa `podium-rise` ustawia go na 1. `animation: none` zabiera tę klatkę końcową,
     więc stopnie zostają ściśnięte do zera — a `getBoundingClientRect` liczy przekształcenia,
     więc ZMIERZONE bez tych linijek wysokości stopni to „0 / 0 / 0" na stronie, na której
     stoją i są widoczne. Pierwszy przebieg tej sondy oblał się dokładnie na tym.

     Wpisane są tu te same wartości, które sam arkusz podaje dla `prefers-reduced-motion:
     reduce` — czyli mierzymy układ, który naprawdę widzi ktoś, kto prosi o mniej ruchu, a nie
     wymyślony stan. */
  kill.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}'
    + '.podium-card__block{transform:none !important}'
    + '.podium-card__top{opacity:1 !important;transform:var(--lean) !important}';
  document.head.appendChild(kill);
  document.documentElement.style.scrollBehavior = 'auto';
  await wait(200);

  /* ------------------------------------------------------------------ 1. WYRÓWNANIE COKOŁU */

  const section = $('[data-podium]');
  const steps = $('[data-podium-winners]');
  const cards = $$('.podium-card');
  ok('cokol ma trzy karty', cards.length === 3, `${cards.length}`);
  ok('kazda karta stoi na swoim stopniu', $$('.podium-card__block').length === cards.length,
    `${$$('.podium-card__block').length} stopni`);
  ok('liczba zwyciezcow podana CSS-owi', steps?.dataset.podiumCount === String(cards.length),
    `data-podium-count=${steps?.dataset.podiumCount}`);

  const boxes = cards.map((card) => ({ place: card.dataset.podiumPlace, ...box(card) }));
  out.measures.cards = boxes;

  const sectionBox = box(section);
  out.measures.section = sectionBox;

  /* Nachodzenie liczone parami, w obu osiach naraz: dwa pudełka nachodzą tylko wtedy, gdy
     zachodzą i w poziomie, i w pionie. Tolerancja jednego piksela, bo zaokrąglanie układu
     potrafi zetknąć krawędzie. */
  const overlaps = [];
  for (let a = 0; a < boxes.length; a += 1) {
    for (let b = a + 1; b < boxes.length; b += 1) {
      const x = Math.min(boxes[a].r, boxes[b].r) - Math.max(boxes[a].l, boxes[b].l);
      const y = Math.min(boxes[a].b, boxes[b].b) - Math.max(boxes[a].t, boxes[b].t);
      if (x > 1 && y > 1) overlaps.push(`${boxes[a].place}x${boxes[b].place}: ${x}x${y} px`);
    }
  }
  ok('zadna karta nie nachodzi na druga', overlaps.length === 0, overlaps.join('; '));

  const outside = boxes.filter((card) => card.l < sectionBox.l - 1 || card.r > sectionBox.r + 1
    || card.t < sectionBox.t - 1 || card.b > sectionBox.b + 1);
  ok('zadna karta nie wychodzi poza sekcje', outside.length === 0,
    outside.map((card) => `miejsce ${card.place}`).join(', '));

  ok('cokol nie rozpycha sie w poziomie', steps.scrollWidth <= steps.clientWidth + 1,
    `${steps.scrollWidth} / ${steps.clientWidth}`);

  const byTop = [...boxes].sort((a, b) => a.t - b.t).map((card) => card.place).join(',');
  const byLeft = [...boxes].sort((a, b) => a.l - b.l).map((card) => card.place).join(',');
  out.measures.orderTopDown = byTop;
  out.measures.orderLeftRight = byLeft;
  out.measures.centres = boxes.map((card) => `${card.place}:${card.cx}`);
  out.measures.widths = boxes.map((card) => `${card.place}:${card.w}`);
  out.measures.spread = {
    centre: spread(boxes.map((card) => card.cx)),
    width: spread(boxes.map((card) => card.w)),
    left: spread(boxes.map((card) => card.l)),
    bottom: spread(boxes.map((card) => card.b))
  };

  /* Kolejność w TREŚCI jest zawsze 1, 2, 3 — to ona niesie wynik dla czytnika ekranu. Obraz
     ustawia CSS i wolno mu być inny; tego, co w znaczniku, ruszać nie wolno. */
  ok('w tresci kolejnosc to 1,2,3', cards.map((card) => card.dataset.podiumPlace).join(',') === '1,2,3',
    cards.map((card) => card.dataset.podiumPlace).join(','));

  if (narrow) {
    /* NA TELEFONIE „WYRÓWNANE" ZNACZY TRZY LICZBY RÓWNE ZERU: ten sam środek, ta sama
       szerokość, ta sama lewa krawędź. Wcześniej stopień był paskiem 10 px z lewej strony
       zdjęcia, więc żadna z tych trzech nie wychodziła zero. */
    ok('wszystkie karty maja ten sam srodek', out.measures.spread.centre <= 1,
      `rozrzut ${out.measures.spread.centre} px`);
    ok('wszystkie karty maja te sama szerokosc', out.measures.spread.width <= 1,
      `rozrzut ${out.measures.spread.width} px`);
    ok('wszystkie karty maja te sama lewa krawedz', out.measures.spread.left <= 1,
      `rozrzut ${out.measures.spread.left} px`);
    ok('od gory ida 1, 2, 3', byTop === '1,2,3', byTop);

    /* Stopień jest teraz pod kartą i na pełną szerokość, a nie paskiem z boku. Mierzone przez
       szerokość bloku względem karty: pasek 10 px dawał tu 3%. */
    const first = cards[0];
    const blockBox = box($('.podium-card__block', first));
    const cardBox = box(first);
    out.measures.stepWidthRatio = Math.round((blockBox.w / cardBox.w) * 100);
    ok('stopien jest pod karta na pelna szerokosc', out.measures.stepWidthRatio >= 96,
      `${out.measures.stepWidthRatio}% szerokosci karty`);
    ok('stopien lezy PONIZEJ zdjecia, nie obok', blockBox.t >= box($('.podium-card__top', first)).b - 1,
      `stopien od ${blockBox.t}, zdjecie do ${box($('.podium-card__top', first)).b}`);
    /* Wysokość stopnia dalej mówi miejsce — inaczej kolumna traci ranking, który cokół na
       szerokim ekranie niesie wzrostem. */
    const stepHeights = cards.map((card) => box($('.podium-card__block', card)).h);
    out.measures.stepHeights = stepHeights;
    ok('stopnie maja trzy rozne wysokosci', new Set(stepHeights).size === 3, stepHeights.join(' / '));
    ok('najwyzszy stopien nalezy do zwyciezcy', Math.max(...stepHeights) === stepHeights[0],
      stepHeights.join(' / '));
  } else {
    /* Na szerokim ekranie zwycięzca stoi w ŚRODKU — to `order` w CSS, nie kolejność w treści. */
    ok('w obrazie kolejnosc to 2,1,3 (zwyciezca w srodku)', byLeft === '2,1,3', byLeft);
    const winner = boxes.find((card) => card.place === '1');
    const stepsBox = box(steps);
    out.measures.winnerOffCentre = winner.cx - stepsBox.cx;
    ok('zwyciezca wysrodkowany w cokole', Math.abs(out.measures.winnerOffCentre) <= 2,
      `${out.measures.winnerOffCentre} px`);
    ok('karty stoja na jednej linii (dolne krawedzie rowne)', out.measures.spread.bottom <= 2,
      `rozrzut ${out.measures.spread.bottom} px`);
    ok('zwyciezca ma najszersza karte',
      Math.max(...boxes.map((card) => card.w)) === winner.w,
      out.measures.widths.join(' '));
  }

  /* ------------------------------------------------- 2. NAGRODA PUBLICZNOŚCI NAD NAGRODAMI JURY */

  const crown = $('[data-podium-crown]');
  const awardsBox = $('[data-podium-awards]');
  ok('nagroda publicznosci jest wyrozniona wstazka', shown(crown),
    crown?.textContent.replace(/\s+/g, ' ').trim().slice(0, 48) || 'brak');
  if (shown(crown) && shown(awardsBox)) {
    out.measures.crownAboveAwards = box(awardsBox).t - box(crown).b;
    ok('wstazka stoi NAD dwunastoma nagrodami jury', out.measures.crownAboveAwards > 0,
      `${out.measures.crownAboveAwards} px odstepu`);
    ok('wstazka stoi NAD cokolem', box(crown).b <= box($('[data-podium-stage]')).t + 1,
      `wstazka do ${box(crown).b}, cokol od ${box($('[data-podium-stage]')).t}`);
  }

  /* --------------------------------------------------------------- 3. DWANAŚCIE NAGRÓD JURY */

  ok('sekcja nagrod jury widoczna', shown(awardsBox));
  const awardCards = $$('[data-podium-awards-list] .award-card');
  const won = awardCards.filter((card) => card.dataset.awardState === 'won');
  const pending = awardCards.filter((card) => card.dataset.awardState === 'pending');
  out.measures.awards = { all: awardCards.length, won: won.length, pending: pending.length };

  ok('dwanascie kategorii na liscie', awardCards.length === 12, `${awardCards.length}`);
  ok('kategoria bez zwyciezcy NIE znika', pending.length > 0 && won.length > 0,
    `przypisane ${won.length}, nieprzypisane ${pending.length}`);
  ok('kazda kategoria ma jeden z dwoch stanow', won.length + pending.length === awardCards.length,
    `${won.length} + ${pending.length}`);
  ok('klucze nagrod to prize-1..prize-12',
    awardCards.map((card) => card.dataset.awardKey).join(',')
      === Array.from({ length: 12 }, (_, i) => `prize-${i + 1}`).join(','),
    awardCards.map((card) => card.dataset.awardKey).join(','));

  /* Nazwy kategorii ze słownika, w wybranym języku. Sprawdzane przez to, że NIE są kluczami
     (`text()` oddaje klucz, gdy napisu nie ma) i że nie ma wśród nich roku. */
  const titles = awardCards.map((card) => $('.award-card__title', card)?.textContent.trim() || '');
  out.measures.awardTitles = titles;
  ok('kazda kategoria ma nazwe ze slownika', titles.every((title) => title && !title.startsWith('prize.')),
    titles.filter((title) => !title || title.startsWith('prize.')).join('; ') || 'wszystkie');
  ok('w nazwach kategorii nie ma wpisanego roku', !titles.some((title) => /\b20\d\d\b/.test(title)),
    titles.filter((title) => /\b20\d\d\b/.test(title)).join('; '));

  /* DWA STANY MUSZĄ SIĘ RÓŻNIĆ BEZ CZYTANIA. Mierzone stylem wyliczonym, nie klasą: klasa
     istnieje także wtedy, gdy reguła jej nie dotyczy. */
  const wonStyle = getComputedStyle(won[0]);
  const pendingStyle = getComputedStyle(pending[0]);
  out.measures.stateLook = {
    wonBorder: wonStyle.borderTopStyle,
    pendingBorder: pendingStyle.borderTopStyle,
    wonShadow: wonStyle.boxShadow !== 'none',
    pendingShadow: pendingStyle.boxShadow !== 'none',
    wonBackground: wonStyle.backgroundColor,
    pendingBackground: pendingStyle.backgroundColor
  };
  ok('nieprzypisana kategoria ma inna obwodke',
    wonStyle.borderTopStyle !== pendingStyle.borderTopStyle,
    `${wonStyle.borderTopStyle} vs ${pendingStyle.borderTopStyle}`);
  ok('nieprzypisana kategoria ma inne tlo',
    wonStyle.backgroundColor !== pendingStyle.backgroundColor,
    `${wonStyle.backgroundColor} vs ${pendingStyle.backgroundColor}`);

  ok('przypisana kategoria pokazuje zwyciezce',
    won.every((card) => $('.award-card__photo', card) && $('.award-card__identity strong', card)));
  ok('przypisana kategoria pokazuje numer startowy',
    won.every((card) => /^\d{3}$/.test($('.award-card__start', card)?.textContent.trim() || '')),
    won.map((card) => $('.award-card__start', card)?.textContent.trim()).join(' '));
  const results = won.map((card) => $('.award-card__result b', card)?.textContent.trim() || '');
  out.measures.awardResults = results;
  ok('wynik (note) pokazany tam, gdzie jest', results.filter(Boolean).length > 0,
    results.filter(Boolean).join(' | '));
  ok('nieprzypisana kategoria mowi, ze wyniku jeszcze nie ma',
    pending.every((card) => ($('.award-card__pending', card)?.textContent.trim() || '').length > 0),
    $('.award-card__pending', pending[0])?.textContent.trim() || 'brak');
  ok('nieprzypisana kategoria nie udaje zwyciezcy',
    pending.every((card) => !$('.award-card__photo', card) && !$('.award-card__result', card)));
  ok('lista nagrod nie rozpycha sie w poziomie',
    awardsBox.scrollWidth <= awardsBox.clientWidth + 1,
    `${awardsBox.scrollWidth} / ${awardsBox.clientWidth}`);

  /* Cała sekcja wyniku w poziomie, nie tylko cokół: karta nagrody z długą nazwą kategorii
     („Najzabawniejszy Carruleddhu" po polsku, „Sympathischster Carruleddhu" po niemiecku) jest
     najdłuższym nieprzerwanym napisem w tej sekcji i to ona pierwsza wypchnęłaby ją za ekran. */
  ok('sekcja wyniku nie wystaje w poziomie',
    section.scrollWidth <= section.clientWidth + 1,
    `${section.scrollWidth} / ${section.clientWidth}`);

  /* --------------------------------------------------------------------- 4. ARCHIWUM ROCZNIKÓW */

  const archive = $('[data-archive]');
  ok('sekcja archiwum pokazala sie', shown(archive));
  const openButton = $('[data-archive-open]');
  ok('przycisk „zobacz wczesniejsze wyniki" ma napis',
    (openButton?.textContent.replace(/\s+/g, ' ').trim() || '').length > 3,
    openButton?.textContent.replace(/\s+/g, ' ').trim());
  ok('panel jest zwiniety do nacisniecia', $('[data-archive-panel]')?.hidden === true);

  openButton?.click();
  await wait(250);
  ok('nacisniecie rozwija panel', shown($('[data-archive-panel]')));
  ok('przycisk oglasza stan czytnikowi ekranu',
    openButton?.getAttribute('aria-expanded') === 'true');

  const select = $('[data-archive-edition]');
  const options = $$('option', select).map((option) => option.value);
  out.measures.editionOptions = options;
  ok('do wyboru sa TYLKO zarchiwizowane roczniki',
    options.includes('2025') && options.includes('2024') && !options.includes('2026'),
    options.join(','));
  ok('pole wyboru jest celem dotykowym', box(select).h >= 44, `${box(select).h} px`);

  /**
   * Wybór rocznika i odczekanie na odpowiedź zaślepki.
   *
   * Konfetti z POPRZEDNIEGO wyboru jest usuwane przed dotknięciem pola: skrawki sprzątają się
   * same po 2,6 s, a ta sonda wybiera rocznik częściej. ZMIERZONE przed tą poprawką: przebieg
   * „bez zgody na ruch" widział 60 skrawków, wszystkie z dwóch wcześniejszych wyborów, i
   * ogłaszał usterkę tam, gdzie nowe konfetti nie powstało ani razu. Sonda liczy teraz to, co
   * dołożył TEN wybór.
   */
  const pick = async (key) => {
    $$('[data-archive-stage] .podium-confetti').forEach((piece) => piece.remove());
    select.value = key;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(700);
    const summary = $('[data-archive-summary]');
    return {
      shown: shown(summary),
      lead: $('[data-archive-summary-lead]')?.textContent.trim() || '',
      count: $('[data-archive-summary-count]')?.textContent.trim() || '',
      label: $('[data-archive-summary-label]')?.textContent.trim() || '',
      meta: $('[data-archive-meta]')?.textContent.trim() || '',
      rows: $$('[data-archive-podium] .archive-row').length,
      awards: $$('[data-archive-awards] .award-card').length,
      note: shown($('[data-archive-note]')),
      confetti: $$('[data-archive-stage] .podium-confetti i').length
    };
  };

  /* 2025: rocznik Z liczbą widowni. To jest ten przypadek, o który prosił właściciel —
     „było nas wtedy tyle". */
  const y2025 = await pick('2025');
  out.measures.edition2025 = y2025;
  ok('wejscie w rocznik pokazuje podsumowanie', y2025.shown);
  ok('podsumowanie mowi, ilu nas bylo', y2025.count === '1240', `„${y2025.lead} ${y2025.count} ${y2025.label}"`);
  ok('podsumowanie podpisuje liczbe widownia', /osób|osob|persone|people|Menschen|personas|personnes/i.test(y2025.label),
    y2025.label);
  ok('rocznik podpisany data i miejscem', y2025.meta.length > 0, y2025.meta);
  ok('rocznik pokazuje trojke nagrody publicznosci', y2025.rows === 3, `${y2025.rows} wierszy`);
  ok('rocznik pokazuje dwanascie nagrod jury', y2025.awards === 12, `${y2025.awards}`);
  ok('scena rocznika nie rozpycha sie w poziomie',
    $('[data-archive-stage]').scrollWidth <= $('[data-archive-stage]').clientWidth + 1,
    `${$('[data-archive-stage]').scrollWidth} / ${$('[data-archive-stage]').clientWidth}`);
  ok('konfetti spadlo na scene rocznika', y2025.confetti > 0, `${y2025.confetti} skrawkow`);
  ok('do serwera poszedl odczyt z polem edition',
    window.__sent.some((sent) => sent.body?.data?.edition === '2025' || sent.body?.edition === '2025'),
    JSON.stringify(window.__sent.at(-1)?.body || {}).slice(0, 120));

  /* 2024: rocznik BEZ `attendeeCount`. Liczba widowni nie jest wtedy podstawiana z niczego —
     na ekranie staje liczba uczestników, podpisana uczestnikami, w innym zdaniu. */
  const y2024 = await pick('2024');
  out.measures.edition2024 = y2024;
  ok('rocznik bez liczby widowni tez ma podsumowanie', y2024.shown);
  ok('bez attendeeCount pokazana jest liczba uczestnikow', y2024.count === '12',
    `„${y2024.lead} ${y2024.count} ${y2024.label}"`);
  ok('zapasowa liczba NIE jest podpisana widownia', y2024.label !== y2025.label,
    `${y2024.label} vs ${y2025.label}`);
  ok('zapasowe zdanie mowi, czego nie wiemy', y2024.lead !== y2025.lead, y2024.lead);
  ok('rocznik bez zapisanych nagrod jury mowi to wprost', y2024.note && y2024.awards === 0,
    `nagrod ${y2024.awards}, zdanie ${y2024.note}`);

  /* ------------------------------------------------------- 5. KONFETTI TYLKO ZA ZGODĄ NA RUCH */

  /* Preferencja podstawiana tak samo jak odpowiedź serwera: `Emulation.setEmulatedMedia` nie jest
     w tym harnessie, a przełączenie ustawienia systemu w trakcie przebiegu nie istnieje. Podmiana
     `matchMedia` mierzy TĘ SAMĄ drogę, którą idzie prawdziwa preferencja — `confetti()` pyta o nią
     w chwili puszczania, nie raz przy wczytaniu modułu. */
  const nativeMatchMedia = window.matchMedia.bind(window);
  window.matchMedia = (query) => (String(query).includes('prefers-reduced-motion')
    ? { matches: true, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }
    : nativeMatchMedia(query));

  const quiet = await pick('2025');
  out.measures.reducedMotion = quiet;
  ok('bez zgody na ruch podsumowanie zostaje', quiet.shown && quiet.count === '1240',
    `„${quiet.lead} ${quiet.count} ${quiet.label}"`);
  ok('bez zgody na ruch NIE ma konfetti', quiet.confetti === 0, `${quiet.confetti} skrawkow`);
  window.matchMedia = nativeMatchMedia;

  /* ------------------------------------------- 6. STARSZA WDROŻONA FUNKCJA: BEZ `awards` I BEZ BŁĘDU */

  /* Kontrakt mówi, że `awards` może nie przyjść — statyczne pliki i Worker wdrażane są osobno,
     więc odpowiedź bez tego pola jest stanem normalnym, nie awarią. Sprawdzane przez podmianę
     zaślepki na odpowiedź obciętą do pól, które istniały wcześniej. */
  const sent = window.__sent.length;
  const before = window.fetch;
  window.fetch = async (url, options = {}) => {
    const response = await before(url, options);
    if (!String(url).includes('/voting')) return response;
    const data = await response.clone().json().catch(() => null);
    if (!data) return response;
    const { awards: _dropped, ...older } = data;
    return new Response(JSON.stringify(older), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const older = await pick('2025');
  out.measures.withoutAwards = older;
  ok('odpowiedz bez pola awards nie psuje rocznika', older.shown && older.rows === 3,
    `wierszy ${older.rows}`);
  ok('bez pola awards strona nie udaje dwunastu wynikow', older.awards === 0 && older.note,
    `nagrod ${older.awards}`);
  ok('zaslepka byla naprawde odpytywana', window.__sent.length > sent,
    `${window.__sent.length - sent} zadan`);
  window.fetch = before;

  out.summary = out.fail.length ? `${out.fail.length} niezaliczonych` : 'wszystko zaliczone';
  return out;
}
