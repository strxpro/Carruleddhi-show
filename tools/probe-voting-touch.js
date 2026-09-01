/**
 * CAŁA DROGA DO ODDANEGO GŁOSU, SAMYMI DOTKNIĘCIAMI, NA 390×844.
 * ===========================================================================
 *
 *   DROGA PRAWDZIWA — bez trybu demo, z podstawioną odpowiedzią serwera:
 *   node tools/cdp.mjs probe tools/probe-voting-touch.js --w 390 --h 844 \
 *        --url "/votazione.html?lang=pl" --origin http://127.0.0.1:4173 \
 *        --inject tools/inject-voting-open.js --wait 3000
 *
 *   DROGA POKAZOWA — ta sama sonda na wbudowanym demo:
 *   node tools/cdp.mjs probe tools/probe-voting-touch.js --w 390 --h 844 \
 *        --url "/votazione.html?demo=1&lang=pl" --origin http://127.0.0.1:4173 --wait 3000
 *
 * Faza głosowania przychodzi z serwera, więc trzeba ją czymś podać. `?demo=1` włącza
 * `demoVotingState` w voting-core.js i tak robią probe-voting-home.js oraz probe-vote-veil.js —
 * ale ustawia też `demoDriven`, czyli wyłącza odpytywanie co trzydzieści sekund i prawdziwą
 * wysyłkę. Dlatego pierwszym sposobem jest zaślepka `tools/inject-voting-open.js`: strona nie
 * wie, że jest badana, i wykonuje CAŁĄ swoją ścieżkę. Obie muszą być zielone.
 *
 * Szerokość poniżej 700 px włącza w harnessie emulację dotyku, więc `pointer: coarse`
 * i `hover: none` są tu prawdziwe, a nie udawane.
 *
 * DLACZEGO OSOBNA SONDA, SKORO SĄ JUŻ probe-voting-page.js I probe-vote-veil.js
 *   Obie tamte wołają `element.click()`. To jest wywołanie funkcji, nie dotknięcie: trafia w
 *   element BEZ WZGLĘDU na to, czy palec w ogóle by w niego trafił. Przycisk przykryty
 *   nakładką, o zerowej wysokości albo schowany pod przyklejonym paskiem przechodzi `click()`
 *   bez mrugnięcia. Dokładnie dlatego obie tamte sondy były zielone w dniu, w którym przyszło
 *   zgłoszenie „klikam w zagłosuj i nic się nie robi".
 *
 *   Tutaj każde dotknięcie idzie przez `window.__tap(x, y)` — zaślepkę harnessu, która wysyła
 *   PRAWDZIWE zdarzenie dotknięcia przez protokół (patrz komentarz przy `__tapNative`
 *   w tools/cdp.mjs). Przeglądarka sama trafia w element leżący pod punktem, sama dokłada
 *   `click` i sama ustawia fokus. Sonda nie wskazuje celu — podaje współrzędne, tak jak palec.
 *
 *   Przed każdym dotknięciem pytamy jeszcze `elementFromPoint`, KTO tam naprawdę leży. To
 *   zamienia „nic się nie stało" w liczbę i nazwę elementu, który zjadł dotknięcie.
 *
 * CO ZNACZY „ZIELONA"
 *   Kafelek → ocena → potwierdzenie → okno z adresem → oddany głos, przy każdym kroku
 *   dotknięcie trafiło w to, w co miało trafić, każdy cel ma co najmniej 44 px w obu
 *   kierunkach i nie ma ani jednego błędu JavaScriptu.
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
   * Pamięć przeglądarki czyszczona na starcie.
   *
   * Mierzone jest PIERWSZE głosowanie z tego telefonu, bo taka jest sytuacja na placu. Gdy
   * w pamięci siedzi zapamiętany adres (`carruleddhi.voter` — zapisuje go każde wcześniejsze
   * głosowanie), okno pokazuje przycisk „zagłosuj tym adresem" zamiast pól, a to inny ekran
   * i inna droga. Zdarzyło się to naprawdę: harness bywa podłączony do przeglądarki, która
   * została po poprzednim uruchomieniu, i wynik sondy zależał wtedy od tego, co robiła
   * poprzednia. Sonda, której wynik zależy od historii, nie mierzy niczego.
   */
  try {
    localStorage.removeItem('carruleddhi.voter');
  } catch (_) { /* pamięć może być zablokowana — wtedy i tak jest pusta */ }

  /* Czekamy na kafelek, a nie na stałą liczbę milisekund: stan przychodzi z serwera (w demo
     z `demoVotingState`), a rysowanie siatki jest o jedno przerysowanie dalej. */
  for (let i = 0; i < 80 && !$('[data-vote-grid] .vote-card:not(.vote-card--skeleton)'); i += 1) await wait(150);

  /* Przejścia i animacje wyłączone: sonda mierzy POŁOŻENIE i TRAFIENIE, a element w połowie
     drogi ma inne pudełko niż na końcu. Bez tego pomiary rozjeżdżają się o kilka pikseli. */
  const kill = document.createElement('style');
  kill.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}';
  document.head.appendChild(kill);
  await wait(60);

  out.viewport = `${window.innerWidth}x${window.innerHeight}`;
  out.coarse = window.matchMedia('(pointer: coarse)').matches;
  out.hoverNone = window.matchMedia('(hover: none)').matches;
  out.tapMode = typeof window.__tap === 'function' ? 'prawdziwe dotkniecia (CDP)' : 'zdarzenia z skryptu';

  /* --------------------------------------------------------------------- dotknięcie */

  const at = (element, dx = 0.5, dy = 0.5) => {
    const box = element.getBoundingClientRect();
    return { x: Math.round(box.left + box.width * dx), y: Math.round(box.top + box.height * dy) };
  };

  const describe = (element) => {
    if (!element) return 'nic (punkt poza ekranem albo puste miejsce)';
    const cls = String(element.className || '').split(/\s+/).filter(Boolean).slice(0, 3).join('.');
    return `${element.tagName.toLowerCase()}${cls ? '.' + cls : ''}`;
  };

  /**
   * Dotknięcie w PUNKT, nie w element.
   *
   * Droga pierwsza i właściwa: `window.__tap` z harnessu, czyli prawdziwe zdarzenie dotknięcia.
   * Droga druga istnieje tylko po to, żeby sonda odpalona starszym harnessem powiedziała, co
   * mierzy — a nie żeby udawała, że mierzy to samo. Tryb jest w wyniku, w `tapMode`.
   */
  const tap = async (x, y) => {
    if (typeof window.__tap === 'function') {
      await window.__tap(x, y);
      return;
    }
    const target = document.elementFromPoint(x, y);
    if (!target) return;
    const common = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y };
    const touch = new Touch({ identifier: 1, target, clientX: x, clientY: y, radiusX: 12, radiusY: 12, force: 1 });
    target.dispatchEvent(new PointerEvent('pointerdown', { ...common, pointerId: 1, pointerType: 'touch', isPrimary: true }));
    target.dispatchEvent(new TouchEvent('touchstart', { ...common, touches: [touch], targetTouches: [touch], changedTouches: [touch] }));
    target.dispatchEvent(new TouchEvent('touchend', { ...common, touches: [], targetTouches: [], changedTouches: [touch] }));
    target.dispatchEvent(new PointerEvent('pointerup', { ...common, pointerId: 1, pointerType: 'touch', isPrimary: true }));
    if (typeof target.focus === 'function') target.focus({ preventScroll: true });
    target.dispatchEvent(new MouseEvent('mousedown', { ...common, button: 0, detail: 1 }));
    target.dispatchEvent(new MouseEvent('mouseup', { ...common, button: 0, detail: 1 }));
    target.dispatchEvent(new MouseEvent('click', { ...common, button: 0, detail: 1 }));
  };

  /**
   * Dotknięcie w środek elementu, ze sprawdzeniem PRZED dotknięciem, kto w tym punkcie leży.
   *
   * Sprawdzenie musi być przed, nie po: po dotknięciu w tym miejscu bywa już coś innego, bo
   * strona właśnie zareagowała. Pierwsza wersja tej sondy pytała po i zgłaszała fałszywe błędy
   * na krokach, które przechodziły.
   */
  const tapOn = async (element, label) => {
    if (!element) return ok(label, false, 'elementu nie ma w drzewie');
    const box = element.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) {
      await tap(...Object.values(at(element)));
      return ok(label, false, `cel ma zerowe wymiary ${Math.round(box.width)}x${Math.round(box.height)}`);
    }
    const point = at(element);
    const under = document.elementFromPoint(point.x, point.y);
    /* `contains`, a nie `===`: palec może trafić w napis albo w `<span>` w środku przycisku i to
       jest w porządku — dotknięcie i tak wypływa do przycisku. Nie w porządku jest wtedy, gdy w
       tym punkcie leży coś, co NIE jest częścią celu. */
    const reachable = Boolean(under) && element.contains(under);
    /* Dotykamy TAK CZY INAcZEJ, także gdy w punkcie leży co innego: to jest właśnie „kliknięcie
       w powietrze" i chcemy zobaczyć, co po nim zostaje na ekranie. */
    await tap(point.x, point.y);
    return ok(label, reachable, reachable
      ? `punkt ${point.x},${point.y}`
      : `w punkcie ${point.x},${point.y} leży ${describe(under)}`);
  };

  /**
   * Cel dotykowy: 44 px w obu kierunkach.
   *
   * Mierzone z `getBoundingClientRect`, więc liczy się to, co widzi palec, a nie `min-height`
   * z arkusza. Zapisywane ZAWSZE, także gdy przechodzi, bo raport ma podawać liczby.
   */
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
  ok('siatka ma kafelki', out.cards >= 2, String(out.cards));
  if (!out.cards) return out;

  /**
   * CO ZASŁANIA KAFELKI W POŁOŻENIU, W KTÓRYM SIĘ NA NIE PATRZY.
   *
   * Nagłówek jest `position: fixed`, a zegar `sticky` — czyli oba zostają na górze ekranu przy
   * każdym przewinięciu. Kafelek, który wjedzie pod nie, wygląda normalnie, a dotknięcia nie
   * przyjmuje. Sprawdzamy więc KAŻDY widoczny kafelek: gdzie ma środek zdjęcia i kto tam leży.
   */
  const bar = $('[data-vote-timer]');
  const header = $('.site-header');
  out.chrome = {
    headerBottom: header ? Math.round(header.getBoundingClientRect().bottom) : null,
    timerBottom: bar && !bar.hidden ? Math.round(bar.getBoundingClientRect().bottom) : null,
    coveredTo: 0
  };
  out.chrome.coveredTo = Math.max(out.chrome.headerBottom || 0, out.chrome.timerBottom || 0);
  out.coverage = cards().slice(0, 6).map((node) => {
    const box = node.getBoundingClientRect();
    const point = { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + 86) };
    return `${Math.round(box.top)}px: ${describe(document.elementFromPoint(point.x, point.y))}`;
  });

  const card = cards()[0];
  /* Kafelek na środek okna: pasek nagłówka i zegar są przyklejone u góry, więc kafelek stojący
     pod nimi jest zasłonięty. Ustawiamy go tam, gdzie postawiłby go człowiek, który na niego
     patrzy — a to, co dzieje się pod paskiem, mierzy `out.coverage` wyżej. */
  card.scrollIntoView({ block: 'center', inline: 'nearest' });
  await wait(250);

  const hit = $('.vote-card__hit', card);
  const veil = $('.vote-veil', card);
  out.rest = {
    hasHit: Boolean(hit),
    veilOpacity: Number(getComputedStyle(veil).opacity),
    veilEvents: getComputedStyle(veil).pointerEvents,
    atPhotoCentre: describe(document.elementFromPoint(at(card).x, at(card).y))
  };
  ok('kafelek ma przezroczysty cel dotknięcia', Boolean(hit));
  target44(hit, 'cel dotknięcia zdjęcia');

  /* ---------------------------------------------------------- szkielet wczytywanego zdjęcia */
  /**
   * KAFELEK MUSI PRZYJMOWAĆ DOTKNIĘCIA TAKŻE WTEDY, GDY ZDJĘCIE JESZCZE LECI.
   *
   * `is-loading` to ta sama klasa, którą strona zakłada sama na czas pobierania zdjęcia (patrz
   * `card()` w voting-page.js), a pod nią stoi połysk rysowany w `::after`. Zakładana tu ręcznie,
   * bo w podglądzie na localhoście zdjęcia wchodzą w kilka milisekund i tego stanu nie da się
   * złapać — a na placu, przy podpisanych adresach z prywatnego bucketa i sieci obciążonej przez
   * cały tłum, trwa on sekundy na każdym kafelku, czyli dokładnie wtedy, gdy ludzie głosują.
   *
   * ZMIERZONE przed naprawą: `elementFromPoint` w środku takiego kafelka zwracał
   * `figure.vote-card__photo`, bo połysk miał `z-index: 1` przy `z-index: auto` na przycisku.
   * Dotknięcie nie robiło NIC i pierwszy krok całej drogi był nieprzejezdny.
   */
  const photo = $('.vote-card__photo', card);
  const photoPoint = at(photo);
  photo.classList.add('is-loading');
  await wait(90);
  out.loading = {
    atPhotoCentre: describe(document.elementFromPoint(photoPoint.x, photoPoint.y)),
    shimmerEvents: getComputedStyle(photo, '::after').pointerEvents,
    hitZ: getComputedStyle(hit).zIndex
  };
  ok('szkielet wczytywanego zdjęcia nie zjada dotknięcia',
    Boolean(hit) && hit.contains(document.elementFromPoint(photoPoint.x, photoPoint.y)),
    out.loading.atPhotoCentre);
  photo.classList.remove('is-loading');
  await wait(60);

  /* KROK 1 — dotknięcie kafelka odsłania nakładkę z przyciskiem. */
  await tapOn(hit, 'krok 1: dotknięcie zdjęcia trafia w cel');
  await wait(260);

  const cta = $('.vote-veil__cta', card);
  out.armed = {
    cardArmed: card.classList.contains('is-armed'),
    hitHidden: hit ? hit.hidden : null,
    veilOpacity: Number(getComputedStyle(veil).opacity),
    veilEvents: getComputedStyle(veil).pointerEvents,
    ctaLabel: cta?.textContent.trim() || '',
    /* Kto NAPRAWDĘ leży w środku przycisku. To jest pomiar, o który cała ta sonda chodzi. */
    atCtaCentre: cta ? describe(document.elementFromPoint(at(cta).x, at(cta).y)) : '',
    activeElement: describe(document.activeElement)
  };
  ok('krok 1: kafelek odsłonięty', out.armed.cardArmed);
  ok('krok 1: nakładka widoczna i łapie dotknięcie',
    out.armed.veilOpacity === 1 && out.armed.veilEvents === 'auto',
    `krycie ${out.armed.veilOpacity}, wskaźnik ${out.armed.veilEvents}`);
  ok('krok 1: przycisk „Zagłosuj" ma napis', Boolean(out.armed.ctaLabel), out.armed.ctaLabel);
  target44(cta, 'przycisk Zagłosuj');
  ok('krok 1: w środku „Zagłosuj" leży „Zagłosuj", a nie coś nad nim',
    Boolean(cta) && cta.contains(document.elementFromPoint(at(cta).x, at(cta).y)),
    out.armed.atCtaCentre);

  /* --------------------------------------------- przerysowanie siatki w trakcie wybierania */
  /**
   * ODSŁONIĘTY KAFELEK MUSI PRZEŻYĆ PRZERYSOWANIE SIATKI.
   *
   * Siatka przerysowuje się sama: czujka doczytuje kolejną porcję z zapasem 400 px, czyli po
   * samym przewinięciu, a odczyt z serwera chodzi co pół minuty. Przed naprawą `replaceChildren`
   * gubił fokus, `focusout` na nakładce składał kafelek i w miejscu przycisku „Zagłosuj" znowu
   * leżał przezroczysty `.vote-card__hit` — więc kolejne dotknięcie tylko odsłaniało nakładkę na
   * nowo. To jest dokładnie to, co zgłoszono jako „klikam w zagłosuj i nic się nie robi".
   *
   * Sprawdzane dotknięciem prawdziwego przycisku „pokaż więcej", a nie wywołaniem `showMore()`:
   * chodzi o to, co robi palec.
   */
  const more = $('[data-vote-more]');
  if (more && !more.hidden) {
    /* Przycisk stoi pod całą siatką, więc trzeba do niego zjechać — i to jest część pomiaru, nie
       obejście: zjechanie na dół samo w sobie doczytuje porcję (czujka ma zapas 400 px), czyli
       przerysowuje siatkę bez ani jednego dotknięcia. Potem wracamy do kafelka, dokładnie tak
       jak człowiek, który przewinął listę i wrócił do wozu, który mu się spodobał. */
    more.scrollIntoView({ block: 'center', inline: 'nearest' });
    await wait(400);
    if (!more.hidden) {
      await tapOn(more, 'doczytanie porcji: dotknięcie „pokaż więcej" trafia w przycisk');
      await wait(450);
    } else {
      ok('doczytanie porcji: czujka doczytała sama przy przewinięciu', true, `${cards().length} kafelków`);
    }
    card.scrollIntoView({ block: 'center', inline: 'nearest' });
    await wait(300);
    out.afterMore = {
      stillArmed: card.classList.contains('is-armed'),
      armedCount: $$('.vote-card.is-armed').length,
      hitHidden: $('.vote-card__hit', card)?.hidden,
      atCtaCentre: cta ? describe(document.elementFromPoint(at(cta).x, at(cta).y)) : '',
      cards: cards().length
    };
    ok('doczytanie porcji nie składa odsłoniętego kafelka', out.afterMore.stillArmed);
    ok('po doczytaniu w miejscu „Zagłosuj" nadal leży „Zagłosuj"',
      Boolean(cta) && cta.contains(document.elementFromPoint(at(cta).x, at(cta).y)),
      out.afterMore.atCtaCentre);
  }

  /* KROK 2 — dotknięcie „Zagłosuj" rozwija suwak w miejscu przycisku. */
  await tapOn(cta, 'krok 2: dotknięcie „Zagłosuj" trafia w przycisk');
  await wait(320);

  const picker = $('.vote-veil__pick', card);
  const slider = $('.vote-slider', card);
  const send = $('.vote-veil__send', card);
  out.picking = {
    cardPicking: card.classList.contains('is-picking'),
    cardStillArmed: card.classList.contains('is-armed'),
    pickerHidden: picker ? picker.hidden : null,
    pickerShown: Boolean(picker) && !picker.hidden && picker.getBoundingClientRect().height > 1,
    sliderRange: slider ? `${slider.min}-${slider.max}` : '',
    sendLabel: send?.textContent.trim() || '',
    activeElement: describe(document.activeElement)
  };
  ok('krok 2: suwak rozwinięty po dotknięciu „Zagłosuj"', out.picking.pickerShown,
    `is-armed=${out.picking.cardStillArmed}, is-picking=${out.picking.cardPicking}, hidden=${out.picking.pickerHidden}`);
  target44(slider, 'suwak oceny');
  target44(send, 'przycisk wyślij');
  const cancel = $('.vote-veil__cancel', card);
  target44(cancel, 'wyjście z wybierania');
  if (slider) {
    out.picking.atSliderCentre = describe(document.elementFromPoint(at(slider).x, at(slider).y));
    ok('krok 2: w środku suwaka leży suwak',
      slider.contains(document.elementFromPoint(at(slider).x, at(slider).y)), out.picking.atSliderCentre);
    /* Ile pikseli wypada na jeden stopień oceny. Suwak może mieć 44 px wysokości i nadal być
       nie do trafienia: przy siedmiu odcinkach na 61 px różnica między ósemką a dziewiątką to
       dziewięć pikseli, czyli mniej niż ćwierć szerokości palca. */
    out.picking.pxPerStep = Math.round(slider.getBoundingClientRect().width
      / Math.max(1, Number(slider.max) - Number(slider.min)));
    out.measures['suwak: px na stopień oceny'] = String(out.picking.pxPerStep);
    ok('krok 2: stopień oceny szerszy niż 15 px', out.picking.pxPerStep >= 15,
      `${out.picking.pxPerStep} px`);
  }

  /* Nic z otwartego wyboru nie może być obcięte ani leżeć poza kafelkiem: `overflow: hidden`
     na zdjęciu potrafi schować wysyłkę i wyjście, a wtedy nie da się ani oddać głosu, ani
     wycofać. Zmierzone przed naprawą: okno oceny 200 px w kadrze 173 px, „zamknij" 21 px POD
     dolną krawędzią i `elementFromPoint` zwracający siatkę. */
  const cardBox = card.getBoundingClientRect();
  out.picking.insideCard = [slider, send, cancel].filter(Boolean).every((el) => {
    const box = el.getBoundingClientRect();
    return box.top >= cardBox.top - 1 && box.bottom <= cardBox.bottom + 1;
  });
  ok('krok 2: suwak, wysyłka i wyjście mieszczą się w kafelku', out.picking.insideCard);
  if (cancel) {
    out.picking.atCancelCentre = describe(document.elementFromPoint(at(cancel).x, at(cancel).y));
    ok('krok 2: w środku wyjścia leży wyjście',
      cancel.contains(document.elementFromPoint(at(cancel).x, at(cancel).y)),
      out.picking.atCancelCentre);
  }

  /* Ocena ustawiana tak, jak ustawia ją palec: przeciągnięciem uchwytu. Ciągnięcia nie da się
     zbudować z jednego dotknięcia, więc wartość idzie przez `value` + zdarzenie `input` — a to,
     czy da się w suwak trafić i czy ma 44 px, jest zmierzone wyżej. */
  if (slider) {
    slider.value = '9';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(90);
  }
  out.picking.readout = $('.vote-slider__value', card)?.textContent.trim() || '';
  ok('krok 2: wybrana ocena widoczna wielką liczbą', out.picking.readout === '9', out.picking.readout);

  /* KROK 3 — potwierdzenie otwiera okno z adresem. */
  await tapOn(send, 'krok 3: dotknięcie „wyślij" trafia w przycisk');
  await wait(520);

  const dialog = $('[data-vote-dialog]');
  const form = $('[data-vote-form]', dialog);
  const submit = form ? $('button[type="submit"]', form) : null;
  const close = $('[data-vote-close]', dialog);
  out.dialog = {
    open: Boolean(dialog?.open),
    score: $('[data-vote-dialog-score]', dialog)?.textContent.trim() || '',
    who: $('[data-vote-dialog-who]', dialog)?.textContent.trim() || '',
    bodyLocked: document.body.classList.contains('is-locked'),
    formShown: Boolean(form) && !form.hidden
  };
  ok('krok 4: okno z adresem otwarte', out.dialog.open);
  ok('krok 4: okno niesie wybraną ocenę', out.dialog.score === '9', out.dialog.score);
  if (!out.dialog.open) return out;

  target44(close, 'zamknięcie okna');
  target44(submit, 'wyślij głos w oknie');

  /* Adres wpisany, bo dalej sprawdzamy panel „Twój głos" — anonimowy ma inne teksty. Wpisywanie
     przez `value` + `input`: klawiatury systemowej nie ma czym udawać, a pole reaguje na to samo
     zdarzenie, które przychodzi od klawiatury. */
  const setField = (name, value) => {
    const field = form.elements.namedItem(name);
    if (!field) return;
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  };
  setField('name', 'Marco');
  setField('email', 'marco@example.com');
  await wait(140);

  /* KROK 5 — wysyłka głosu z okna. */
  await tapOn(submit, 'krok 5: dotknięcie „wyślij głos" w oknie trafia w przycisk');
  await wait(900);

  const mine = $('[data-vote-mine]');
  const shown = (el) => Boolean(el) && !el.hidden
    && getComputedStyle(el).display !== 'none' && el.offsetParent !== null;
  out.afterVote = {
    dialogClosed: !dialog.open,
    bodyUnlocked: !document.body.classList.contains('is-locked'),
    minePanelShown: shown(mine),
    mineScore: $('[data-vote-mine-score]')?.textContent.trim() || '',
    votedCards: $$('.vote-card.is-voted').length,
    toast: $('[data-toast-text]')?.textContent.trim() || '',
    toastTone: $('[data-toast]')?.dataset.toastTone || ''
  };
  ok('krok 5: okno zamknięte po wysłaniu', out.afterVote.dialogClosed);
  ok('krok 5: przewijanie odblokowane', out.afterVote.bodyUnlocked);
  ok('krok 5: panel „Twój głos" na górze', out.afterVote.minePanelShown);
  ok('krok 5: panel niesie oddaną ocenę', out.afterVote.mineScore === '9', out.afterVote.mineScore);
  ok('krok 5: kafelek oznaczony jako mój', out.afterVote.votedCards === 1, String(out.afterVote.votedCards));
  ok('krok 5: potwierdzenie na ekranie', Boolean(out.afterVote.toast), out.afterVote.toast);

  /* ------------------------------------------- druga droga: zmiana głosu tym samym palcem */
  /* Głos jest jeden, ale wolno go raz zmienić — i to też ma być przejezdne dotknięciami. Bez
     tego kroku „nie da się głosować na telefonie" byłoby naprawione do połowy: kto trafił w zły
     kafelek, zostaje z głosem oddanym na cudzy wóz i bez wyjścia. */
  const second = cards()[1];
  out.change = { cardsWithHit: $$('.vote-card__hit:not([hidden])').length };
  if (second) {
    second.scrollIntoView({ block: 'center', inline: 'nearest' });
    await wait(250);
    const hit2 = $('.vote-card__hit', second);
    out.change.hasHit = Boolean(hit2);
    if (await tapOn(hit2, 'zmiana: dotknięcie drugiego kafelka trafia w cel')) {
      await wait(260);
      const cta2 = $('.vote-veil__cta', second);
      out.change.ctaLabel = cta2?.textContent.trim() || '';
      ok('zmiana: przycisk zaprasza do przeniesienia głosu', Boolean(out.change.ctaLabel), out.change.ctaLabel);
      target44(cta2, 'przycisk przenieś głos');
      await tapOn(cta2, 'zmiana: dotknięcie przycisku trafia w przycisk');
      await wait(320);
      const pick2 = $('.vote-veil__pick', second);
      out.change.pickerShown = Boolean(pick2) && !pick2.hidden;
      ok('zmiana: suwak rozwinięty', out.change.pickerShown);
      const send2 = $('.vote-veil__send', second);
      if (send2) {
        await tapOn(send2, 'zmiana: dotknięcie „wyślij" trafia w przycisk');
        await wait(760);
        out.change.movedTo = $$('.vote-card.is-voted').length === 1
          && cards()[1]?.classList.contains('is-voted');
        out.change.toast = $('[data-toast-text]')?.textContent.trim() || '';
        ok('zmiana: głos stoi teraz na drugim kafelku', Boolean(out.change.movedTo), out.change.toast);
      }
    }
  }

  out.notes.push('Przeciągnięcia uchwytu suwaka nie da się zbudować z jednego dotknięcia — ocena ustawiana przez `value` + zdarzenie `input`; mierzona jest trafialność i wysokość suwaka, nie samo ciągnięcie.');
  out.notes.push('Odpowiedź serwera jest podstawiona (zaślepka albo demo), więc mierzalne jest wszystko po stronie przeglądarki — nie to, czy Worker zapisze głos.');
  out.notes.push('Emulacja dotyku w Chrome nie jest telefonem: nie ma paska adresu zmieniającego wysokość okna, klawiatury systemowej ani opóźnienia sieci. Cele dotykowe, trafienia i przepływ są mierzone; wygoda przewijania nie.');
  return out;
}
