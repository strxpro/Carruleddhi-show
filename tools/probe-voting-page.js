/**
 * Podstrona głosowania: nagroda publiczności, dwie kolumny, porcje, oddany głos, klasyfikacja.
 *
 * Uruchamiana przez tools/probe-voting.mjs, wykonywana przez tools/cdp.mjs w prawdziwej
 * przeglądarce i w prawdziwym czasie.
 *
 * PRZEPISANA NA NAKŁADKĘ NA ZDJĘCIU.
 * ===========================================================================
 * Poprzednia wersja opisywała układ, którego już nie ma: przycisk „Zagłosuj" POD zdjęciem,
 * osobny krok „zagłosować na ten wóz?" i oceny jako siatka 4×2. Wszystkie trzy zostały
 * zastąpione nakładką, więc sonda mierzyła stan sprzed zmiany i przewracała się kaskadowo —
 * trzydzieści jeden błędów, z których żaden nie był błędem strony. Sonda, która krzyczy
 * zawsze, nie mówi nic w dniu, w którym coś naprawdę pęknie.
 *
 * PODZIAŁ PRACY Z tools/probe-vote-veil.mjs
 *   Tamta sonda mierzy SAMĄ interakcję na kafelku: krycie nakładki, morfowanie przycisku
 *   w suwak, cele dotykowe, jeden odsłonięty kafelek na stronę. Tu jej nie powtarzamy.
 *   Ta sonda przechodzi ten przepływ najkrótszą drogą i pyta o to, czego tamta nie dotyka:
 *   nagłówek, filtr kategorii, doczytywanie porcjami, stan PO oddaniu głosu i klasyfikację
 *   po zamknięciu.
 */
async (document, window) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  /* Czekamy na kafelek, nie na `[data-vote-start]` — tego przycisku nie ma od czasu, gdy
     ocenianie przeniosło się na zdjęcie. Poprzednia wersja czekała na coś, co nigdy nie
     wchodzi, przez pełne dziewięć sekund, i dopiero potem zaczynała mierzyć puste drzewo. */
  for (let i = 0; i < 80 && !$('[data-vote-grid] .vote-card'); i += 1) await wait(150);

  const kill = document.createElement('style');
  kill.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}';
  document.head.appendChild(kill);

  const shown = (el) => Boolean(el) && !el.hidden
    && getComputedStyle(el).display !== 'none' && el.offsetParent !== null;
  const cards = () => $$('[data-vote-grid] > *');
  const firstRow = () => {
    const all = cards();
    if (!all.length) return 0;
    const top = Math.round(all[0].getBoundingClientRect().top);
    return all.filter((el) => Math.round(el.getBoundingClientRect().top) === top).length;
  };

  const out = {};

  out.head = {
    lang: document.documentElement.lang,
    title: document.title,
    h1: $('.vote-head h1')?.textContent.trim() || '',
    kicker: $('[data-vote-kicker]')?.textContent.trim() || '',
    /* Plakietki `[data-vote-rule]` nie ma — powtarzala akapit nad soba i zajmowala osobny
       prostokat z kreska przez pol szerokosci naglowka. Regula stoi teraz w akapicie
       (`voting.pageLead`) i w oknie oceny, wiec pytamy o akapit. */
    ruleBadgeGone: !$('[data-vote-rule]'),
    lead: $('[data-vote-lead]')?.textContent.replace(/\s+/g, ' ').trim() || '',
    /* `[data-language-option]`, nie `[data-vote-lang]`. Podstrona dostala ten sam wybor jezyka
       co strona glowna — jedna rozwijana lista w pasku, a nie wlasny rzad przyciskow. Sonda
       celujaca w stary znacznik zwracala zero i wygladalo to na brakujacy przelacznik. */
    languageButtons: $$('[data-language-option]').length,
    /* Nie ma juz zakladek nagrod: publicznosc przyznaje JEDNA nagrode. */
    awardTabs: $$('[data-award-tab]').length,
    /* Dwie rzeczy, ktorych na tej stronie NIE ma byc — zgloszone wprost: „te guziki zapisz
       sie albo ze bede tam". Licznik odliczania do wydarzenia tez nie, ale zegar glosowania
       JEST, i to osobny element: `[data-vote-timer]` w przyklejonym pasku. */
    eventClock: Boolean($('[data-voting-clock]')),
    signupLinks: $$('a[href="#signup"]').length,
    attendButtons: $$('[data-open-reminder]').length,
    timerShown: Boolean($('[data-vote-timer]')) && !$('[data-vote-timer]').hidden,
    /* Zdjecie JEST celem dotkniecia — na tym polegala cala zmiana. Przezroczysty
       `.vote-card__hit` lezy na zdjeciu i odslania nakladke. */
    photoIsTarget: Boolean($('.vote-card__hit')),
    mineShown: shown($('[data-vote-mine]'))
  };

  out.filters = {
    shown: shown($('[data-vote-filters]')),
    labels: $$('[data-vote-filter]').map((b) => b.textContent.trim()),
    activeFirst: $$('[data-vote-filter]')[0]?.classList.contains('is-active') || false,
    smallestTarget: $$('[data-vote-filter]').length
      ? Math.min(...$$('[data-vote-filter]').map((b) => Math.round(b.getBoundingClientRect().height)))
      : null
  };

  out.batch = {
    first: cards().length,
    columns: firstRow(),
    gridWidth: Math.round($('[data-vote-grid]')?.getBoundingClientRect().width || 0),
    moreShown: shown($('[data-vote-more]')),
    moreLabel: $('[data-vote-more-label]')?.textContent.trim() || ''
  };
  $('[data-vote-more]')?.click();
  await wait(500);
  out.batch.after = cards().length;
  out.batch.moreShownAfter = shown($('[data-vote-more]'));

  /* Filtr kategorii POJAZDU zawęża listę. To nie są kategorie głosowania — głos jest jeden. */
  const second = $$('[data-vote-filter]')[1];
  if (second) {
    second.click();
    await wait(450);
    out.filters.afterPick = {
      label: second.textContent.trim(),
      cards: cards().length,
      allSameCategory: (() => {
        const wanted = second.textContent.trim().toLowerCase();
        return cards().every((card) => (card.querySelector('.vote-card__rider')?.textContent || '')
          .toLowerCase().includes(wanted));
      })()
    };
    $$('[data-vote-filter]')[0].click();
    await wait(450);
    out.filters.afterReset = cards().length;
  }

  /* Głos oddany przez nakładkę: dotknięcie zdjęcia, przycisk na środku, suwak, wysyłka.
     Mierzymy tu tylko to, że droga jest przejezdna i co niesie okno — geometrię nakładki,
     morfowanie i cele dotykowe mierzy probe-vote-veil.mjs i nie ma sensu robić tego dwa razy. */
  const card = $('[data-vote-grid] .vote-card');
  $('.vote-card__hit', card)?.click();
  await wait(160);
  out.armed = {
    cardArmed: Boolean(card?.classList.contains('is-armed')),
    ctaLabel: $('.vote-veil__cta', card)?.textContent.trim() || ''
  };

  $('.vote-veil__cta', card)?.click();
  await wait(200);
  const slider = $('.vote-slider', card);
  out.picking = {
    cardPicking: Boolean(card?.classList.contains('is-picking')),
    /* Zakres bierzemy z suwaka, nie z listy przycisków: oceny to teraz jeden `input[type=range]`
       o granicach podanych przez serwer, a nie osiem osobnych przycisków. */
    range: slider ? `${slider.min}-${slider.max}` : '',
    /* Jeden otwarty wybór na całą stronę — dwa naraz to pytanie „którą właśnie wysyłam",
       zadane w chwili wysyłania. */
    openPickers: $$('.vote-card.is-picking').length,
    sendLabel: $('.vote-veil__send', card)?.textContent.trim() || ''
  };

  if (slider) {
    slider.value = '8';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  }
  await wait(120);
  /* `.vote-slider__value`, nie `.vote-picker__score`. Ta druga klasa nadal istnieje, ale to
     przyciski ocen w oknie zmiany głosu z odsyłacza w mailu — inny widok i inny element.
     Sonda celująca w nią zwracała pusty napis i wyglądało to na zepsuty odczyt suwaka. */
  out.picking.readout = $('.vote-slider__value', card)?.textContent.trim() || '';

  $('.vote-veil__send', card)?.click();
  await wait(450);
  const dialog = $('[data-vote-dialog]');
  out.step3 = {
    open: Boolean(dialog?.open),
    bodyLocked: document.body.classList.contains('is-locked'),
    who: $('[data-vote-dialog-who]')?.textContent.trim() || '',
    rider: $('[data-vote-dialog-rider]')?.textContent.trim() || '',
    score: $('[data-vote-dialog-score]')?.textContent.trim() || '',
    knownShown: shown($('[data-vote-known]')),
    formShown: shown($('[data-vote-form]')),
    /* Odwrotnie niż w poprzedniej wersji tej sondy, i to jest zmiana zamówiona wprost:
       imię i adres są OPCJONALNE. Głos bez adresu przechodzi — kosztem jest to, że nie da
       się go potem zmienić ani dowiedzieć się o wyniku, i okno o tym mówi. */
    nameRequired: Boolean($('#vote-name')?.required),
    emailRequired: Boolean($('#vote-email')?.required),
    notifyDisabled: $('[data-vote-notify]') ? $('[data-vote-notify]').disabled : null
  };

  const form = $('[data-vote-form]');
  const fill = (name, value) => {
    const field = form?.elements.namedItem(name);
    if (field) {
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  /* Z adresem, bo dalej sprawdzamy panel „Twój głos" i obietnicę jednej zmiany — a ta
     istnieje tylko dla podpisanych. Ścieżka anonimowa ma własne teksty i własną sondę. */
  fill('name', 'Marco');
  fill('email', 'marco@example.com');
  await wait(120);
  out.step3.notifyEnabledWithEmail = $('[data-vote-notify]')
    ? !$('[data-vote-notify]').disabled
    : null;
  form?.querySelector('button[type="submit"]')?.click();
  await wait(900);
  out.afterVote = {
    dialogClosed: !dialog?.open,
    bodyUnlocked: !document.body.classList.contains('is-locked'),
    bodyClasses: document.body.className,
    /* Panel „Twój głos" nad listą — to jest odpowiedź na „czy ja już głosowałem", której nie
       trzeba szukać w siatce. */
    mineShown: shown($('[data-vote-mine]')),
    mineCart: $('[data-vote-mine-cart]')?.textContent.trim() || '',
    mineScore: $('[data-vote-mine-score]')?.textContent.trim() || '',
    mineNoteShown: shown($('[data-vote-mine-note]')),
    votedCards: $$('.vote-card.is-voted').length,
    mineBadges: $$('.vote-card__mine').length,
    yourScore: $('.vote-card__yours')?.textContent.trim() || '',
    usedOnOthers: $$('.vote-card__used').length,
    /* Jeden glos na urzadzenie, wiec po oddaniu nie ma juz na co dotknac NIGDZIE. Liczymy
       przezroczyste cele na zdjeciach, a nie przyciski `[data-vote-start]` — tych nie ma
       od czasu, gdy ocenianie przenioslo sie na zdjecie, i pusty zbior przechodzilby ten
       warunek zawsze, nie mierzac niczego. */
    hitsLeft: $$('.vote-card__hit:not([hidden])').length,
    armedLeft: $$('.vote-card.is-armed, .vote-card.is-picking').length,
    toast: $('[data-toast-text]')?.textContent.trim() || '',
    toastTone: $('[data-toast]')?.dataset.toastTone || ''
  };

  /* Faza trzecia: wynik ma JEDEN widok — podium i pełna tabela.
     ---------------------------------------------------------------------------
     Poprzednia wersja tej sekcji szukała rankingu na kafelkach (`.vote-card__rank`,
     `.vote-card__stats`, `.vote-card.is-place-1`) i wychodziło jej zero. To nie był błąd
     strony: `paintGrid` po zamknięciu celowo opróżnia siatkę, żeby ranking nie istniał
     w dwóch miejscach naraz — jest to napisane w komentarzu przy tej gałęzi.

     Gorsze niż same błędy było to, co przechodziło. Przy pustej siatce `ranks === cards`
     i „po zamknieciu nie da sie glosowac" dawały prawdę, bo zero równa się zero. Sonda
     mówiła „ok" o stronie, na której nie było niczego. */
  const bar = $('[data-voting-demo]');
  if (bar && !bar.classList.contains('is-open')) bar.querySelector('[data-demo-toggle]').click();
  $$('[data-demo-phase]').find((b) => b.dataset.demoPhase === 'closed')?.click();
  // Czekamy na WYNIK przełączenia, nie na stałą liczbę milisekund: zmiana fazy czyta stan od nowa.
  for (let i = 0; i < 40 && !$('[data-vote-standings] tr'); i += 1) await wait(150);
  await wait(200);

  const standings = $$('[data-vote-standings] tr');
  const points = standings.map((tr) => tr.querySelector('.vote-standings__points')?.textContent.trim() || '');
  const moreButton = $('[data-vote-standings-more]');
  out.closed = {
    // Siatka kart ma zniknąć — ranking mieszka w tabeli i na podium, nie w trzech miejscach.
    gridCards: cards().length,
    hits: $$('.vote-card__hit:not([hidden])').length,
    /* Zegar zostaje w pasku i po zamknieciu — mowi wtedy, ze glosowanie jest zamkniete,
       zamiast znikac i zostawiac pytanie bez odpowiedzi. */
    timerShown: Boolean($('[data-vote-timer]')) && !$('[data-vote-timer]').hidden,
    resultsShown: shown($('[data-vote-results]')),
    podiumPlaces: $$('[data-vote-podium] .vote-podium__item').map((li) => li.dataset.place),
    podiumEmpty: $$('[data-vote-podium] .vote-podium__empty').length,
    standingsRows: standings.length,
    firstRank: standings[0]?.querySelector('.vote-standings__rank')?.textContent.trim() || '',
    scrollFocusable: $('.vote-standings__scroll')?.tabIndex === 0,
    /* Na telefonie tabela NIE przewija się w środku — rozkłada się na kartki, po jednej na
       zawodnika, bo pięć kolumn na 390 px to pięć nieczytelnych kolumn. Sonda chodzi w oknie
       390×844, więc pytamy o to, co tam faktycznie ma być.
       ---------------------------------------------------------------------------
       Punkty, średnia i liczba głosów muszą stać KAŻDE w swojej kolumnie. To był mój własny
       błąd w poprzedniej turze: trzy liczby wpadały do jednej komórki i przy dwucyfrowej
       sumie nachodziły na siebie. Trzy różne pozycje w poziomie i rosnące lewe krawędzie to
       dokładnie ten warunek, i dlatego jest tu na stałe. */
    numberColumns: (() => {
      const first = standings[0];
      if (!first) return null;
      const lefts = Array.from(first.querySelectorAll('.vote-standings__number'))
        .map((td) => Math.round(td.getBoundingClientRect().left));
      return {
        count: lefts.length,
        distinct: new Set(lefts).size,
        ascending: lefts.every((value, i) => i === 0 || value > lefts[i - 1]),
        overlap: Array.from(first.querySelectorAll('.vote-standings__number')).some((td, i, list) => {
          const next = list[i + 1];
          return next && td.getBoundingClientRect().right > next.getBoundingClientRect().left + 1;
        })
      };
    })(),
    kicker: $('[data-vote-kicker]')?.textContent.trim() || '',
    /* Porcje po dziesięć, tak jak w cokole na stronie głównej. Do tej zmiany tabela rysowała
       CAŁĄ stawkę od razu i przy osiemdziesięciu wozach zjeżdżała na trzy ekrany, wypychając
       podium poza widok. */
    moreShown: Boolean(moreButton) && !moreButton.hidden,
    moreLabel: $('[data-vote-standings-more-label]')?.textContent.trim() || '',
    points
  };
  /* Kolejność ma być wynikiem: punkty nierosnąco. Kreska znaczy „zero głosów" i stoi na
     końcu, więc do porównania idzie jako minus nieskończoność, a nie jako NaN. */
  const asNumber = (value) => (value === '—' ? -Infinity : Number(value));
  out.closed.sorted = points
    .map(asNumber)
    .every((value, index, list) => index === 0 || list[index - 1] >= value);

  /* Doczytanie kolejnej dziesiątki. Numeracja liczona od PEŁNEJ klasyfikacji, nie od porcji —
     inaczej jedenasty wiersz dostawałby numer 1, bo jest pierwszy w swojej dziesiątce. */
  moreButton?.click();
  await wait(400);
  const grown = $$('[data-vote-standings] tr');
  out.closed.after = {
    rows: grown.length,
    /* Pudełko przewija się w sobie i nie rozpycha sekcji — na monitorze, bo na telefonie
       tabela rozkłada się na kartki i celowo przewija razem ze stroną. */
    innerScroll: (() => {
      const box = $('.vote-standings__scroll');
      if (!box) return null;
      return getComputedStyle(box).overflowY === 'visible'
        ? 'unfolded'
        : box.scrollHeight > box.clientHeight + 1;
    })(),
    lastRank: grown[grown.length - 1]?.querySelector('.vote-standings__rank')?.textContent.trim() || '',
    moreShown: Boolean(moreButton) && !moreButton.hidden
  };

  return out;
}
