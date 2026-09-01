/**
 * SONDA: COKÓŁ, DWANAŚCIE NAGRÓD, PASEK W TRZECH FAZACH, ZEGAR GŁOSOWANIA.
 * ===========================================================================
 *
 * Cztery pytania, na które nie da się odpowiedzieć czytaniem arkusza:
 *
 *   1. czy w pasku nawigacji COKOLWIEK na siebie nachodzi — w każdej z trzech faz
 *      (`scheduled`, `voting`, `closed`), gdzie różnica polega na tym, ile przycisków w pasku
 *      stoi, i przy każdej pozycji przewinięcia, gdzie różnica polega na tym, co zajmuje
 *      środek paska;
 *   2. czy cokół mieści się w kadrze — nie „czy ma poprawne reguły", tylko czy jego prawa
 *      krawędź jest po lewej stronie krawędzi okna, przy 344, 360 i 390 px szerokości i przy
 *      niemieckich, francuskich i hiszpańskich napisach, które są dłuższe od włoskich;
 *   3. czy dwanaście kategorii jury naprawdę jest na ekranie, razem z tymi, które czekają na
 *      zwycięzcę;
 *   4. czy zegar głosowania jest NIEZADOKOWANY na górze podstrony i ZADOKOWANY po przewinięciu.
 *
 * DLACZEGO SONDA, A NIE PRZEGLĄD KODU
 *   Każdy z tych błędów jest niewidoczny w źródle i widoczny na ekranie. Nachodzenie w pasku
 *   wychodzi z SUMY szerokości marki, chipu, licznika i przycisków — czyli z czterech reguł w
 *   dwóch plikach plus długości napisu w danym języku. Wylewanie się cokołu wychodzi z `clamp()`
 *   pomnożonego przez szerokość kolumny w siatce. Nie ma tu czego przeczytać; jest co zmierzyć.
 *
 * URUCHOMIENIE (konwencja jak tools/probe-c-clock.js — przez cdp.mjs)
 *   node tools/cdp.mjs probe tools/probe-podium-prizes.mjs --w 1440 --h 900 --url "/?demo=1&lang=pl" --origin http://127.0.0.1:4173
 *   node tools/cdp.mjs probe tools/probe-podium-prizes.mjs --w 768  --h 900 --url "/?demo=1&lang=de" --origin http://127.0.0.1:4173
 *   node tools/cdp.mjs probe tools/probe-podium-prizes.mjs --w 390  --h 844 --url "/?demo=1&lang=fr" --origin http://127.0.0.1:4173
 *   node tools/cdp.mjs probe tools/probe-podium-prizes.mjs --w 360  --h 740 --url "/?demo=1&lang=es" --origin http://127.0.0.1:4173
 *   node tools/cdp.mjs probe tools/probe-podium-prizes.mjs --w 344  --h 882 --url "/?demo=1&lang=de" --origin http://127.0.0.1:4173
 *   node tools/cdp.mjs probe tools/probe-podium-prizes.mjs --w 390  --h 844 --url "/votazione.html?demo=1&lang=pl" --origin http://127.0.0.1:4173
 *
 * SZEROKOŚĆ JEST FLAGĄ WIERSZA POLECEŃ, NIE PĘTLĄ W SONDZIE: `Emulation.setDeviceMetricsOverride`
 * ustawia ją raz, przy otwarciu karty, a zmiana rozmiaru w trakcie nie przelicza `clamp()`
 * liczonych z `--screen-h` (zamrożonej wysokości ekranu, patrz measureScreenHeight). Pomiar po
 * takiej zmianie mierzyłby układ w połowie drogi między dwoma stanami.
 *
 * JEDEN PLIK NA DWIE STRONY: sonda rozpoznaje podstronę po `body.vote-page`. Zegar w pasku i
 * cokół to jedna zmiana rozłożona na dwie strony, a dwa pliki rozjechałyby się przy pierwszej
 * poprawce w mierzeniu paska — który jest na obu stronach tym samym elementem.
 */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.documentElement.style.scrollBehavior = 'auto';
  document.documentElement.style.scrollSnapType = 'none';

  const round = (value) => Math.round(value);
  const box = (element) => {
    if (!element) return null;
    const r = element.getBoundingClientRect();
    return { x: round(r.x), right: round(r.right), top: round(r.top), bottom: round(r.bottom), w: round(r.width), h: round(r.height) };
  };

  /* Widoczny NAPRAWDĘ, a nie „ma opacity 1". Zerowa szerokość, `display: none`, `visibility:
     hidden` albo `hidden` znaczą, że w tym miejscu nie ma nic — i element, którego nie ma, nie
     może na nic nachodzić. Bez tego pytania pomiar liczyłby zderzenia elementów wygaszonych. */
  const seen = (element) => {
    if (!element) return { exists: false, visible: false };
    const cs = getComputedStyle(element);
    const b = box(element);
    return {
      exists: true,
      ...b,
      visible: cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05 && b.w > 4 && !element.hidden
    };
  };

  /**
   * NAMALOWANY NAPIS MARKI, NIE JEJ PUDEŁKO.
   * W stanie zwiniętym `.brand` ma `flex: 1`, więc jej prostokąt ciągnie się przez pół paska,
   * choć napis „Carruleddhi" zajmuje w nim około stu pikseli. Porównywanie z pudełkiem
   * pokazywałoby nachodzenie tam, gdzie na ekranie jest pusto — ten sam błąd i to samo
   * rozwiązanie co w probe-c-clock.js.
   */
  const textBox = (selector) => {
    const element = document.querySelector(selector);
    if (!element) return null;
    const range = document.createRange();
    range.selectNodeContents(element);
    const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
    if (!rects.length) return null;
    return {
      exists: true,
      visible: true,
      x: round(Math.min(...rects.map((r) => r.left))),
      right: round(Math.max(...rects.map((r) => r.right)))
    };
  };
  const brandTextBox = () => {
    const parts = ['.brand__name', '.brand__date'].map(textBox).filter(Boolean);
    if (!parts.length) return null;
    return { exists: true, visible: true, x: Math.min(...parts.map((p) => p.x)), right: Math.max(...parts.map((p) => p.right)) };
  };

  /* Zero znaczy „prostokąty się nie stykają". Cokolwiek większego to nachodzenie. Liczone tylko
     w poziomie: pasek jest jednym rzędem, więc wszystko w nim ma tę samą wysokość i pionowe
     przecięcie jest tam zawsze. */
  const overlap = (a, b) => {
    if (!a?.visible || !b?.visible) return 0;
    return Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x));
  };

  /**
   * Stan paska: co w nim stoi, co na co nachodzi i ile rzeczy zajmuje ŚRODEK.
   *
   * `centreCount` jest tu najważniejszą liczbą i musi wynosić 0 albo 1. Środek paska mają do
   * dyspozycji trzy rzeczy — chip z nazwą sekcji, zadokowane odliczanie i zadokowany zegar
   * głosowania — a wszystkie trzy są pozycjonowane bezwzględnie na `left: 50%`. Dwie naraz nie
   * nachodzą „trochę": leżą jedna NA drugiej i obie są nieczytelne. Pierwszeństwo jest opisane
   * przy regułach `[data-clock-docked]` w experience.css.
   */
  const barState = (label) => {
    const header = document.querySelector('.site-header');
    const shell = document.querySelector('.nav-shell');
    if (!header || !shell) return { label, missing: true };

    const parts = {
      brandText: brandTextBox(),
      navCurrent: seen(document.querySelector('.nav-current')),
      navClock: seen(document.querySelector('[data-nav-clock]')),
      voteClock: seen(document.querySelector('[data-vote-timer-dock]')),
      voteCta: seen(document.querySelector('[data-vote-cta]')),
      attend: seen(document.querySelector('.nav-attend')),
      actions: seen(document.querySelector('.nav-actions'))
    };

    const centre = ['navCurrent', 'navClock', 'voteClock'].filter((name) => parts[name]?.visible);
    const pairs = [];
    const names = Object.keys(parts);
    for (let i = 0; i < names.length; i += 1) {
      for (let j = i + 1; j < names.length; j += 1) {
        /* `.nav-actions` jest rodzicem „Zagłosuj" i „Będę tam", więc ich wzajemne przecięcie z
           nim jest z definicji pełne i nic nie znaczy. Mierzone są sąsiedztwa, nie zawierania. */
        const inside = (a, b) => (a === 'actions' && (b === 'voteCta' || b === 'attend'))
          || (b === 'actions' && (a === 'voteCta' || a === 'attend'));
        if (inside(names[i], names[j])) continue;
        const value = overlap(parts[names[i]], parts[names[j]]);
        if (value > 0) pairs.push(`${names[i]}×${names[j]}=${value}`);
      }
    }

    const shellBox = box(shell);
    return {
      label,
      classes: header.className,
      docked: header.hasAttribute('data-clock-docked'),
      atTop: header.hasAttribute('data-nav-at-top'),
      shell: shellBox,
      /* Pasek nie ma prawa wyjść z okna — zmierzone, nie założone: `width: min(1120px,
         calc(100vw - 28px))` z `translateX(-50%)` daje na wąskim ekranie wynik zależny od
         zaokrągleń, a 1 px za krawędzią to poziomy pasek przewijania na całej stronie. */
      shellOutsideWindow: Math.max(0, -shellBox.x) + Math.max(0, shellBox.right - window.innerWidth),
      visible: Object.fromEntries(Object.entries(parts).map(([name, part]) => [name, Boolean(part?.visible)])),
      centreCount: centre.length,
      centreWho: centre.join('+') || 'nic',
      /* Puste znaczy: nic w pasku na siebie nie nachodzi. */
      overlaps: pairs
    };
  };

  /** Ile element wystaje za lewą i prawą krawędź okna. Zero to jedyny dobry wynik. */
  const outside = (element) => {
    const b = box(element);
    if (!b) return null;
    return {
      ...b,
      out: Math.max(0, -b.x) + Math.max(0, b.right - window.innerWidth)
    };
  };

  const out = {
    width: window.innerWidth,
    height: window.innerHeight,
    lang: document.documentElement.lang,
    page: document.body.classList.contains('vote-page') ? 'votazione' : 'index'
  };

  /* Nakładka wstępna schodzi około 900 ms po wczytaniu i do tej chwili jest tym, co leży nad
     wszystkim — pierwszy pomiar mierzyłby ją, a nie stronę. */
  await sleep(1300);
  document.querySelector('[data-cookie-accept]')?.click();
  await sleep(600);

  /**
   * JĘZYK WYBIERANY PRZEŁĄCZNIKIEM, A NIE ZOSTAWIONY `?lang=` W ADRESIE.
   *
   * Strona główna czyta język z pamięci przeglądarki i z `navigator.language`, a nie z adresu —
   * `?lang=de` w URL-u sondy nie zmieniał więc niczego i wszystkie pomiary „po niemiecku"
   * wychodziły po polsku. Sprawdzone: `out.lang` pokazywał `pl` przy `--url "/?demo=1&lang=de"`.
   * A długość napisów w pasku jest tu połową mierzonego problemu.
   *
   * Kliknięcie w przełącznik to ta sama droga, którą wybiera język człowiek — razem z
   * przeliczeniem szerokości nagłówków i z odświeżeniem rezerwy na środku paska.
   */
  const asked = new URLSearchParams(location.search).get('lang');
  if (asked && asked !== document.documentElement.lang) {
    document.querySelector('[data-language-trigger]')?.click();
    await sleep(300);
    document.querySelector(`[data-language-option="${asked}"]`)?.click();
    await sleep(900);
    /* Fokus zostaje po kliknięciu w pasku i `:focus-within` rozwija go — a to jest osobny stan,
       który sonda mierzy dalej z rozmysłu. Tutaj zdejmowany, żeby PIERWSZY pomiar był pomiarem
       paska, którego nikt nie dotknął. */
    document.activeElement?.blur?.();
    await sleep(400);
  }
  out.lang = document.documentElement.lang;

  /* =====================================================================================
     PODSTRONA GŁOSOWANIA: zegar w treści i jego kopia w pasku
     ===================================================================================== */
  if (out.page === 'votazione') {
    const inPage = document.querySelector('.vote-timer[data-vote-timer]');
    const dock = document.querySelector('[data-vote-timer-dock]');

    out.timerInPage = {
      exists: Boolean(inPage),
      /* `position` czytane wprost, bo cała zmiana polega na tym, że NIE jest już `sticky`:
         reguła może wrócić przy pierwszej pomyłce w scalaniu i nikt tego nie zauważy — na
         ekranie „przyklejony" i „na stronie" różnią się tylko po przewinięciu. */
      position: inPage ? getComputedStyle(inPage).position : null,
      ...(inPage ? seen(inPage) : {})
    };

    out.states = [];
    const read = (label) => ({
      label,
      docked: document.querySelector('.site-header').hasAttribute('data-clock-docked'),
      dockVisible: seen(dock).visible,
      dockText: `${dock?.querySelector('[data-vote-timer-label]')?.textContent || ''} ${dock?.querySelector('[data-vote-timer-time]')?.textContent || ''}`.trim(),
      inPageVisible: seen(inPage).visible,
      inPageText: `${inPage?.querySelector('[data-vote-timer-label]')?.textContent || ''} ${inPage?.querySelector('[data-vote-timer-time]')?.textContent || ''}`.trim(),
      bar: barState(label)
    });

    /* (a) na górze strony: zegar w treści widoczny, kopia w pasku nie. */
    out.states.push(read('gora strony'));

    /* (b) po przewinięciu: dokładnie odwrotnie. 1200 px, czyli poniżej nagłówka sekcji i w
       środku listy wozów — tam, gdzie ktoś naprawdę pyta „ile mam czasu". */
    window.scrollTo(0, 1200);
    await sleep(1000);
    out.states.push(read('po przewinieciu (1200)'));

    /* (c) powrót na górę chowa kopię: dwie te same liczby na jednym ekranie to jedna za dużo. */
    window.scrollTo(0, 0);
    await sleep(1000);
    out.states.push(read('powrot na gore'));

    /* (d) menu otwarte przy przewiniętej stronie — kopia nie ma prawa na nic nachodzić. */
    window.scrollTo(0, 1200);
    await sleep(800);
    document.querySelector('[data-menu-toggle]')?.click();
    await sleep(800);
    out.states.push(read('przewiniete + menu otwarte'));
    document.querySelector('[data-menu-toggle]')?.click();
    await sleep(500);

    return out;
  }

  /* =====================================================================================
     STRONA GŁÓWNA: pasek w trzech fazach, cokół, dwanaście nagród, archiwum
     ===================================================================================== */

  /* Faza przestawiana paskiem DEMO, a nie podstawieniem stanu z zewnątrz: przycisk robi
     DOKŁADNIE to, co dzień zawodów — `voting.js` dostaje nową fazę tą samą drogą, przez
     `readState`, i przerysowuje wszystko, co od niej zależy. Podstawienie pola w obiekcie
     pominęłoby połowę tej drogi i sonda potwierdzałaby własne założenie. */
  const setPhase = async (phase) => {
    const bar = document.querySelector('[data-voting-demo]');
    if (!bar) return false;
    if (!bar.classList.contains('is-open')) {
      bar.querySelector('[data-demo-toggle]')?.click();
      await sleep(250);
    }
    const button = bar.querySelector(`[data-demo-phase="${phase}"]`);
    if (!button) return false;
    button.click();
    await sleep(1100);
    return true;
  };

  out.phases = [];
  for (const phase of ['scheduled', 'voting', 'closed']) {
    const ok = await setPhase(phase);
    const entry = { phase, demoBarFound: ok, bar: [] };

    /* Na górze strony i poniżej hero, bo to dwa różne stany paska: na górze chip z nazwą
       sekcji jest wygaszony i nic nie jest zadokowane, niżej środek paska jest zajęty. */
    window.scrollTo(0, 0);
    await sleep(800);
    entry.bar.push(barState(`${phase} / gora`));

    window.scrollTo(0, 1600);
    await sleep(1000);
    entry.bar.push(barState(`${phase} / ponizej hero`));

    /* Ruch w górę rozwija pasek (`is-peeked`) i przywraca w nim „Będę tam" — czyli stan, w
       którym prawa strona jest najszersza, a więc najciaśniej. */
    window.scrollTo(0, 1400);
    await sleep(900);
    entry.bar.push(barState(`${phase} / pasek odslonięty`));

    /* Menu otwarte przywraca chip z nazwą sekcji i pełny wybór języka. */
    window.scrollTo(0, 1600);
    await sleep(700);
    document.querySelector('[data-menu-toggle]')?.click();
    await sleep(900);
    entry.bar.push(barState(`${phase} / menu otwarte`));
    document.querySelector('[data-menu-toggle]')?.click();
    await sleep(600);

    out.phases.push(entry);
  }

  /* --------------------------------------------------------------- cokół i dwanaście nagród
     Mierzone w fazie `closed`, bo tylko wtedy cokół i nagrody w ogóle są na stronie. */
  await setPhase('closed');

  const podium = document.querySelector('[data-podium]');
  if (podium) {
    podium.hidden = false;
    podium.scrollIntoView({ block: 'start' });
    await sleep(700);
  }

  /* Zdrapka zakrywa cokół i nagrody. „Odkryj wszystko" to droga dostępna z klawiatury i to ona
     jest tu użyta — kliknięcie przycisku, nie ustawienie klucza w pamięci przeglądarki, bo
     droga przez pamięć pomijałaby całe odsłanianie razem z odsłonięciem nagród. */
  document.querySelector('[data-podium-scratch-reveal]')?.click();
  await sleep(2600);

  const stage = document.querySelector('[data-podium-stage]');
  const steps = document.querySelector('[data-podium-winners]');
  const cards = Array.from(document.querySelectorAll('.podium-card'));

  out.podium = {
    sectionVisible: Boolean(podium) && !podium.hidden,
    crownVisible: seen(document.querySelector('[data-podium-crown]')).visible,
    stage: outside(stage),
    steps: outside(steps),
    cardCount: cards.length,
    cards: cards.map((card) => ({
      place: card.dataset.podiumPlace,
      ...outside(card),
      /* Podpis na zdjęciu i rząd ocen pod nim: to one wylewały się poza kadr przy dłuższych
         napisach w de/fr/es, bo nazwa wozu nie ma gdzie się złamać. Mierzone osobno, bo karta
         może być w kadrze, a jej wnętrze nie. */
      body: outside(card.querySelector('.podium-card__body')),
      stats: outside(card.querySelector('.podium-card__stats')),
      /* I DRUGIE PYTANIE, KTÓREGO `outside` NIE ZADAJE: czy wnętrze mieści się w SWOJEJ karcie.
         Rząd ocen może być w kadrze okna i jednocześnie wychodzić poza zdjęcie, na którym leży —
         wtedy liczby lądują na białym tle sekcji i przestają być czytelne, a pomiar względem
         okna pokazuje zero. Zmierzone w pikselach wystawania z karty; zero to jedyny dobry
         wynik. */
      insideCard: (() => {
        const cardBox = box(card);
        return ['.podium-card__body', '.podium-card__stats', '.podium-card__tie']
          .map((selector) => {
            const inner = box(card.querySelector(selector));
            if (!inner || !cardBox) return 0;
            return Math.max(0, cardBox.x - inner.x) + Math.max(0, inner.right - cardBox.right);
          })
          .reduce((sum, value) => sum + value, 0);
      })()
    })),
    /* Suma wystawania wszystkiego, co należy do cokołu. Jedna liczba do przeczytania w raporcie. */
    outsideTotal: [stage, steps, ...cards].reduce((sum, element) => sum + (outside(element)?.out || 0), 0),
    field: outside(document.querySelector('[data-podium-field]')),
    /* CAŁA STRONA nie ma prawa przewijać się w poziomie. To jest test, który łapie wylanie się
       czegokolwiek, także tego, o czym sonda nie wie: `scrollWidth` większy od okna znaczy pasek
       przewijania u dołu ekranu telefonu. */
    documentScrollWidth: round(document.scrollingElement.scrollWidth),
    horizontalOverflow: Math.max(0, round(document.scrollingElement.scrollWidth) - window.innerWidth)
  };

  const awardsBox = document.querySelector('[data-podium-awards]');
  const awardCards = Array.from(document.querySelectorAll('[data-podium-awards-list] .award-card'));
  out.awards = {
    /**
     * DWA WYNIKI, KTÓRE TRZEBA CZYTAĆ RAZEM Z ADRESEM SONDY.
     *
     *   `?demo=1`               odpowiedź NIESIE `prizes` → sekcja widoczna, 12 wierszy
     *   `?demo=1&noPrizes=1`    odpowiedź BEZ tego pola  → `sectionVisible: false`, `count: 0`,
     *                           `consoleErrors: []`
     *
     * Drugi przebieg jest tu ważniejszy, choć wygląda na uboższy: sprawdza stan po wdrożeniu
     * strony nowszej od funkcji Workera, w którym dwanaście wierszy „jeszcze nie ogłoszono"
     * byłoby nieprawdą o wyniku ogłoszonym wieczorem na scenie. Do tej pory brak pola i pole
     * puste dawały ten sam wynik na ekranie — czyli różnicy nie dało się zmierzyć.
     */
    sectionVisible: Boolean(awardsBox) && !awardsBox.hidden,
    /* Dwanaście. Nie „tyle, ile przyszło": strona główna obiecuje dwanaście nagród, więc
       kategoria bez zwycięzcy zostaje jako czekająca, a nie znika. */
    count: awardCards.length,
    won: awardCards.filter((card) => card.dataset.awardState === 'won').length,
    pending: awardCards.filter((card) => card.dataset.awardState === 'pending').length,
    /* Nazwy kategorii ze słownika: gdy w danym języku brakuje `prize.N`, wraca włoska nazwa i
       lista wygląda na przetłumaczoną, choć nie jest. Trzy pierwsze do wglądu w raporcie. */
    titles: awardCards.slice(0, 3).map((card) => card.querySelector('.award-card__title')?.textContent?.trim()),
    outsideTotal: awardCards.reduce((sum, card) => sum + (outside(card)?.out || 0), 0),
    /* Wysokość listy: dwanaście kart w jednej kolumnie na telefonie to długo, ale to jest
       świadomy wybór — do wglądu, nie do oceny. */
    listHeight: box(document.querySelector('[data-podium-awards-list]'))?.h ?? null
  };

  /* ------------------------------------------------------------------------- archiwum
     Dwa roczniki z rozmysłu: 2025 ma zapisaną liczbę widowni, 2024 nie ma jej wcale. Rocznik
     bez tej liczby NIE MOŻE pokazać zera — zero znaczy „nikt nie przyszedł", a prawda jest
     „nikt nie policzył". To jedyny sposób sprawdzenia tej różnicy z zewnątrz. */
  const archive = document.querySelector('[data-archive]');
  out.archive = { sectionVisible: Boolean(archive) && !archive.hidden, years: [] };
  if (out.archive.sectionVisible) {
    archive.scrollIntoView({ block: 'start' });
    await sleep(500);
    document.querySelector('[data-archive-open]')?.click();
    await sleep(700);
    const select = document.querySelector('[data-archive-edition]');
    out.archive.options = Array.from(select?.options || []).map((option) => option.value);
    out.archive.panelOpen = !document.querySelector('[data-archive-panel]')?.hidden;

    for (const year of ['2025', '2024']) {
      if (!select || !out.archive.options.includes(year)) continue;
      select.value = year;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(1400);
      const summary = document.querySelector('[data-archive-summary]');
      out.archive.years.push({
        year,
        summaryVisible: Boolean(summary) && !summary.hidden,
        lead: document.querySelector('[data-archive-summary-lead]')?.textContent?.trim() || '',
        count: document.querySelector('[data-archive-summary-count]')?.textContent?.trim() || '',
        label: document.querySelector('[data-archive-summary-label]')?.textContent?.trim() || '',
        podiumRows: document.querySelectorAll('[data-archive-podium] .archive-row').length,
        awardRows: document.querySelectorAll('[data-archive-awards] .award-card').length,
        noAwardsNote: !document.querySelector('[data-archive-note]')?.hidden,
        /* Konfetti: element wstawiany do sceny rocznika po udanym odczycie. Sprawdzane przez
           istnienie, nie przez wygląd — czy spada, widać na zrzucie, a czy JEST, można zmierzyć. */
        confetti: document.querySelectorAll('[data-archive-stage] .podium-confetti').length,
        outsideTotal: (outside(document.querySelector('[data-archive-stage]'))?.out || 0)
      });
    }
  }

  /* --------------------------------------------------- rok i data z jednego źródła (zadanie 1)
     Nie ma tu pomiaru układu: chodzi o to, czy w widocznych miejscach stoi rok z konfiguracji,
     a nie liczba wpisana kiedyś w plik, i czy znaczniki `%DATE%`/`%EVENT%` zostały podstawione.
     Surowy znacznik na ekranie to błąd, którego nie widać w kodzie — bo w kodzie jest poprawny. */
  out.year = {
    heroYear: document.querySelector('.hero__year')?.textContent?.trim() || '',
    yearSlots: Array.from(document.querySelectorAll('[data-config-event-year]')).map((el) => el.textContent.trim()),
    scheduleKicker: document.querySelector('#schedule .eyebrow')?.textContent?.trim() || '',
    scheduleTime: document.querySelector('#schedule time[data-config-schedule-time]')?.getAttribute('datetime') || '',
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.content || '',
    ogTitle: document.querySelector('meta[property="og:title"]')?.content || '',
    jsonLd: (() => {
      try {
        const data = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent);
        return { name: data.name, startDate: data.startDate, endDate: data.endDate };
      } catch (_) {
        return null;
      }
    })(),
    /* Jedna liczba na koniec: ile miejsc na tej stronie nadal pokazuje surowy wzorzec. Musi
       być zero. */
    rawTokensOnPage: (document.body.innerText.match(/%(YEAR|DATE|EVENT|PLACE)%/g) || []).length
  };

  return out;
};
