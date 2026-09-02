/**
 * TOR C — PAMIĘĆ I WARSTWY KOMPOZYTORA W OKOLICY SEKCJI DWUNASTU NAGRÓD.
 * ===========================================================================
 * OBJAW, KTÓREGO TO DOTYCZY
 *   „Strona na telefonie sama się odświeża" w okolicy talii nagród. Sonda błędów
 *   (probe-c-errors.js) przechodzi tę okolicę bez ani jednego wyjątku i bez odrzuconej
 *   obietnicy, a licznik klatek nie siada. Czyli to nie jest awaria JavaScriptu — to jest
 *   przeglądarka mobilna ubijająca proces renderujący z braku pamięci i wczytująca dokument
 *   od nowa. Takie zabicie NIE ZOSTAWIA ŚLADU W KONSOLI, więc jedyne, co można zmierzyć, to
 *   ZUŻYCIE, które do niego prowadzi.
 *
 * DLACZEGO PRZYROST, A NIE WARTOŚĆ BEZWZGLĘDNA
 *   Headless Chrome na pulpicie ma pamięć, której telefon nie ma, więc samego zabicia karty
 *   nie da się tu odtworzyć. Da się natomiast zmierzyć, ILE strona dokłada, gdy wejdzie się w
 *   sekcję nagród i przejdzie całą talią — i to jest liczba, którą można obniżyć i porównać
 *   przed i po. Dlatego każdy punkt pomiaru jest raportowany osobno, a na końcu jest różnica.
 *
 * CO SIĘ LICZY JAKO WARSTWA
 *   Liczby warstw kompozytora nie da się odczytać z JS. Da się jednak policzyć elementy, które
 *   PROSZĄ o własną warstwę, i to jest to, co decyduje o rachunku pamięci graficznej:
 *     - `will-change` z transform/opacity/filter — jawna prośba o promocję,
 *     - `filter` i `backdrop-filter` różne od `none` — wymuszają własną teksturę,
 *     - `transform` w postaci `matrix3d` (czyli translate3d/translateZ) — to samo,
 *     - `position: fixed` i `position: sticky` — kandydat na warstwę przy przewijaniu,
 *     - trwająca animacja transform/opacity.
 *   Do każdej kategorii idzie SUMA POWIERZCHNI pudełek, bo tekstura kosztuje tyle, ile ma
 *   pikseli — dwanaście kart wysokości ekranu to inny rachunek niż dwanaście ikonek.
 *
 *     node tools/cdp.mjs probe tools/probe-c-prizes-memory.js --w 390 --h 844 \
 *          --origin http://127.0.0.1:4173 --inject tools/inject-voting-open.js
 */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.documentElement.style.scrollBehavior = 'auto';
  document.documentElement.style.scrollSnapType = 'none';

  /* Kategorie rozdzielone, a nie zsumowane w jedną liczbę: „warstw jest 40" nie mówi, co
     obniżyć. Rozbicie mówi, czy płaci talia nagród, czy przypięte sekcje, czy karuzela. */
  const layerReport = () => {
    const all = document.querySelectorAll('*');
    const buckets = {
      willChange: [], filter: [], backdropFilter: [], blend: [],
      transform3d: [], fixed: [], sticky: [], animating: []
    };
    for (const el of all) {
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      /* Element o zerowym pudełku nie ma tekstury, choćby miał wypisane wszystkie
         właściwości świata — `display: none` i zamknięte okna modalne wpadają tutaj. */
      const area = Math.round(rect.width * rect.height);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const entry = () => ({
        sel: el.tagName.toLowerCase()
          + (el.id ? '#' + el.id : '')
          + (el.className && typeof el.className === 'string'
            ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''),
        w: Math.round(rect.width), h: Math.round(rect.height), area
      });
      const wc = cs.willChange || 'auto';
      if (wc !== 'auto' && /transform|opacity|filter/.test(wc)) buckets.willChange.push(entry());
      if (cs.filter && cs.filter !== 'none') buckets.filter.push(entry());
      const bf = cs.backdropFilter || cs.webkitBackdropFilter;
      if (bf && bf !== 'none') buckets.backdropFilter.push(entry());
      /* `mix-blend-mode` inne niż `normal` jest w tym rachunku tym samym co `backdrop-filter`:
         przeglądarka musi mieć TO, CO POD SPODEM, jako gotową teksturę, żeby móc to zmieszać —
         więc oba wymuszają dodatkową warstwę i odczyt wsteczny przy każdej klatce, w której
         cokolwiek się rusza. Na stronie o przypiętych sekcjach „cokolwiek się rusza" znaczy
         zawsze. Liczone osobno, bo pełnoekranowy element z mieszaniem jest inną wagą niż
         dwudziestopikselowa ikonka z tym samym zapisem. */
      if (cs.mixBlendMode && cs.mixBlendMode !== 'normal') buckets.blend.push(entry());
      if (/matrix3d|translate3d|translateZ/.test(cs.transform || '')) buckets.transform3d.push(entry());
      if (cs.position === 'fixed') buckets.fixed.push(entry());
      if (cs.position === 'sticky') buckets.sticky.push(entry());
    }
    /* Animacje przez `document.getAnimations()`, NIE przez `animationPlayState`.
       ---------------------------------------------------------------------------
       Pierwsza wersja tej sondy czytała `getComputedStyle(el).animationPlayState` i liczyła
       każde `running`. To jest fałszywy pomiar: animacja CSS z `forwards`, która już się
       skończyła, ma w stylu obliczonym dalej swoją nazwę, a `paused` przychodzi wyłącznie z
       jawnego `animation-play-state`. Sonda raportowała 218 „animowanych" elementów tam, gdzie
       Web Animations API pokazuje 174 naprawdę biegnące — reszta to skończone wejścia liter.
       Trwająca animacja transform/opacity dostaje w Chrome własną warstwę kompozytora, więc ta
       liczba jest pozycją na rachunku pamięci i musi być prawdziwa. */
    for (const animation of document.getAnimations()) {
      if (animation.playState !== 'running') continue;
      const target = animation.effect && animation.effect.target;
      if (!target || !target.getBoundingClientRect) continue;
      const r = target.getBoundingClientRect();
      buckets.animating.push({
        sel: (animation.animationName || 'js') + ' @ ' + target.tagName.toLowerCase()
          + (typeof target.className === 'string' && target.className
            ? '.' + target.className.trim().split(/\s+/)[0] : ''),
        w: Math.round(r.width), h: Math.round(r.height), area: Math.round(r.width * r.height)
      });
    }
    const out = { domNodes: all.length, layers: {} };
    let total = 0;
    let totalArea = 0;
    for (const [key, list] of Object.entries(buckets)) {
      const area = list.reduce((sum, item) => sum + item.area, 0);
      total += list.length;
      totalArea += area;
      out.layers[key] = {
        count: list.length,
        areaMpx: +(area / 1e6).toFixed(2),
        biggest: list.sort((a, b) => b.area - a.area).slice(0, 3)
      };
    }
    out.layerCandidates = total;
    out.layerAreaMpx = +(totalArea / 1e6).toFixed(2);
    return out;
  };

  const mem = () => {
    const m = window.performance && window.performance.memory;
    return m ? Math.round(m.usedJSHeapSize / 1024) : null;
  };

  /* Ile kart talii ma naprawdę narysowany rysunek. `<use>` na wspólny plik SVG nie jest
     darmowe: każde wystąpienie to osobne poddrzewo do złożenia i osobna powierzchnia do
     pomalowania, a w talii jest ich dwanaście przy siedmiu widocznych. */
  const deckReport = () => {
    const deck = document.querySelector('[data-prize-deck]');
    if (!deck) return { fatal: 'brak talii' };
    const cards = [...deck.querySelectorAll('[data-prize-card]')];
    let artAreaPx = 0;
    const drawnArt = cards.filter((card) => {
      const svg = card.querySelector('.prize-card__art svg');
      if (!svg) return false;
      const cs = getComputedStyle(svg);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const r = svg.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return false;
      artAreaPx += Math.round(r.width * r.height);
      return true;
    });
    /* Karta malowana to karta, która NIE jest `visibility: hidden`. `opacity: 0` nie zwalnia
       malowania — element dalej ma teksturę, tylko składa się z wagą zero. To jest dokładnie
       ta różnica, o którą chodzi w naprawie, więc obie liczby są raportowane osobno. */
    const painted = cards.filter((card) => getComputedStyle(card).visibility !== 'hidden');
    const useNodes = deck.querySelectorAll('.prize-card__art use').length;
    /* `content-visibility: auto` na karcie spoza wierzchu znaczy, że przeglądarka pomija jej
       układ i malowanie. Sprawdzane wprost, żeby raport mówił, ile kart faktycznie jest
       pominiętych, a nie ile ma wypisaną właściwość. */
    const skipped = cards.filter((card) => {
      const cs = getComputedStyle(card);
      return cs.contentVisibility === 'auto' || cs.contentVisibility === 'hidden';
    }).length;
    const withWillChange = cards.filter((card) => {
      const wc = getComputedStyle(card).willChange;
      return wc && wc !== 'auto';
    }).length;
    const visible = cards.filter((card) => +getComputedStyle(card).opacity > 0.02).length;
    const box = cards[0].getBoundingClientRect();
    return {
      cards: cards.length,
      paintedCards: painted.length,
      visibleByOpacity: visible,
      drawnArtSvg: drawnArt.length,
      drawnArtAreaPx: artAreaPx,
      useNodes,
      contentVisibilityAuto: skipped,
      cardsWithWillChange: withWillChange,
      cardBox: { w: Math.round(box.width), h: Math.round(box.height) },
      counter: document.querySelector('[data-deck-current]')?.textContent || '?'
    };
  };

  const snap = (label) => ({ label, y: Math.round(window.scrollY), heapKb: mem(), ...layerReport(), deck: deckReport() });

  const out = { width: window.innerWidth, height: window.innerHeight, points: [] };
  out.heapAvailable = mem() !== null;

  /* 1. Góra strony. Punkt odniesienia: talia jeszcze nie była w widoku. */
  window.scrollTo(0, 0);
  await sleep(600);
  out.points.push(snap('gora strony'));

  /* 2. Sekcja nagród w widoku. */
  const prizes = document.querySelector('#prizes');
  window.scrollTo(0, prizes.getBoundingClientRect().top + window.scrollY);
  await sleep(1000);
  out.points.push(snap('sekcja nagrod w widoku'));

  /* 3. Cała talia przewinięta strzałkami. Dwanaście kroków w przód, dwanaście w tył: talia
        wraca na kartę 01, więc licznik na końcu jest jednocześnie sprawdzeniem, że
        obniżanie pamięci nie zepsuło zawijania indeksu. */
  const next = document.querySelector('[data-deck-next]');
  const prev = document.querySelector('[data-deck-prev]');
  for (let i = 0; i < 12; i += 1) { next?.click(); await sleep(650); }
  out.counterAfterForward = document.querySelector('[data-deck-current]')?.textContent || '?';
  for (let i = 0; i < 12; i += 1) { prev?.click(); await sleep(650); }
  out.counterAfterBack = document.querySelector('[data-deck-current]')?.textContent || '?';
  out.points.push(snap('po przejsciu calej talii'));

  /* 4. Karuzela 3D, czyli sekcja tuż obok na tym samym dokumencie. Bez tego punktu nie da
        się powiedzieć, czy warstwy talii ustępują, gdy schodzi z widoku. */
  const gallery = document.querySelector('[data-gallery3d]');
  if (gallery) {
    window.scrollTo(0, gallery.getBoundingClientRect().top + window.scrollY);
    await sleep(1200);
    out.points.push(snap('karuzela 3D w widoku'));
  }

  /* 5. Powrót do nagród: czy zużycie wraca do poziomu z punktu 2, czy rośnie dalej. */
  window.scrollTo(0, prizes.getBoundingClientRect().top + window.scrollY);
  await sleep(1000);
  out.points.push(snap('powrot do nagrod'));

  const first = out.points[0];
  const last = out.points[out.points.length - 1];
  out.delta = {
    heapKb: first.heapKb === null ? null : last.heapKb - first.heapKb,
    domNodes: last.domNodes - first.domNodes,
    layerCandidates: last.layerCandidates - first.layerCandidates,
    layerAreaMpx: +(last.layerAreaMpx - first.layerAreaMpx).toFixed(2)
  };
  /* Szczyt, nie koniec: kartę ubija chwila, w której pamięci brakuje, a nie stan po
     wszystkim. Sekcja, która zwolniła warstwy po zejściu z widoku, nie unieważnia szczytu. */
  out.peak = {
    heapKb: Math.max(...out.points.map((p) => p.heapKb || 0)),
    layerCandidates: Math.max(...out.points.map((p) => p.layerCandidates)),
    layerAreaMpx: Math.max(...out.points.map((p) => p.layerAreaMpx))
  };
  return out;
};
