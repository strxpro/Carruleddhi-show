/**
 * Głosowanie publiczności: odliczanie, oceny, podium.
 * ===========================================================================
 *
 * Osobny plik, bo app.js ma 270 kB i doklejanie do niego kolejnej sekcji przestało być
 * czytaniem. Wspólne cztery funkcje przychodzą z window.CARRULEDDHI_API — patrz komentarz
 * przy tym szwie w app.js.
 *
 * O FAZIE DECYDUJE SERWER, NIE ZEGAR PRZEGLĄDARKI
 *   Odliczanie na ekranie chodzi lokalnie, bo licznik tykający raz na sekundę nie może być
 *   żądaniem raz na sekundę. Ale o tym, czy głosowanie jest otwarte, mówi wyłącznie `phase`
 *   z odpowiedzi Workera. Zegar w telefonie bywa przestawiony o godziny — czasem przez
 *   właściciela, właśnie po to — a lokalna decyzja „już wolno" znaczyłaby głosy oddane przed
 *   startem i odrzucone przez bazę, czyli formularz, który wygląda na działający i nie działa.
 *   Licznik dobiegający zera nie otwiera głosowania. Odpytuje serwer.
 *
 * DLACZEGO ODPYTYWANIE, A NIE REALTIME
 *   Przeglądarka nigdy nie dostaje kluczy do bazy: RLS jest włączone bez polityk, a wszystko
 *   idzie przez service role w Workerze. Klient Realtime nie miałby się czym uwierzytelnić.
 *   Ta sama decyzja co na czacie — patrz komentarz „POLLING, NOT REALTIME" w app.js.
 */
import { demoVotingState } from './demo-content.js';

(function () {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * Tryb demo: `?demo=1`, tak jak sponsorzy i tablica.
   *
   * Ta sekcja jest widoczna w jednym dniu w roku i w trzech różnych postaciach, z których
   * ostatniej — podium — nie da się zobaczyć, dopóki ktoś nie zagłosuje. Bez tego przełącznika
   * jedynym sposobem obejrzenia projektu byłoby wgranie bazy, przestawienie godziny startu i
   * oddanie kilkudziesięciu głosów.
   *
   * Nie jest to obejście serwera. Gdy Worker odpowiada, faza pochodzi wyłącznie od niego i
   * przełącznika nie ma na ekranie — patrz `demoPhase` niżej. Parametr w adresie nie da się
   * zapomnieć, bo nie jest nigdzie zapisywany, a baner na górze strony mówi wprost, co widać.
   */
  const demoMode = new URLSearchParams(window.location.search).get('demo') === '1';
  /** Ustawiane, gdy odczyt potwierdził, że Workera nie ma — wtedy demo ma czym zastąpić dane. */
  let demoDriven = false;

  const api = () => window.CARRULEDDHI_API || null;
  const config = () => window.CARRULEDDHI_ACTIVE_CONFIG || null;

  /** Ten sam słownik co reszta strony, z tym samym zapasem na włoski. */
  function text(key) {
    const bridge = api();
    if (bridge) return bridge.text(key);
    const all = window.CARRULEDDHI_I18N || {};
    const dict = all[document.documentElement.lang] || all.it || {};
    return dict[key] || (all.it || {})[key] || key;
  }

  /* Dłużej niż domyślne 4,2 s: komunikaty głosowania są zdaniami, nie jednym słowem, i część
     z nich odsyła do maila — trzeba je zdążyć przeczytać. */
  const toast = (message, tone = 'info') => api()?.toast?.(message, 5200, tone);

  /* ------------------------------------------------------------------ tożsamość urządzenia */

  /**
   * Identyfikator urządzenia, wymagany przez limit „jeden głos w kategorii".
   *
   * Najpierw ten, którym strona już się posługuje przy „ci sarò" — jedno urządzenie ma mieć
   * jedną tożsamość, a nie dwie zależnie od tego, co robi. Ale tamten ma zapasową postać
   * `visitor-<czas>-<losowe>` dla przeglądarek bez crypto.randomUUID, a baza wymaga 32–36
   * znaków (migracja 0022), więc taka wartość zostałaby odrzucona dopiero przy oddawaniu
   * głosu. Sprawdzany jest więc kształt, nie samo istnienie.
   */
  function deviceId() {
    const shaped = (value) => /^[0-9a-f-]{32,36}$/.test(String(value || '').toLowerCase());
    const read = (key) => {
      try { return localStorage.getItem(key); } catch (_) { return null; }
    };
    const write = (key, value) => {
      try { localStorage.setItem(key, value); } catch (_) { /* Storage may be blocked. */ }
    };

    const shared = read('carruleddhi.visitorId');
    if (shaped(shared)) return String(shared).toLowerCase();

    const own = read('carruleddhi.voteDevice');
    if (shaped(own)) return String(own).toLowerCase();

    /* Zapas z getRandomValues, nie z Date.now(): 32 znaki szesnastkowe zawsze spełniają
       warunek z bazy, a znacznik czasu z losową końcówką raz spełnia, raz nie. */
    const fresh = globalThis.crypto?.randomUUID?.()
      || [...globalThis.crypto.getRandomValues(new Uint8Array(16))]
        .map((byte) => byte.toString(16).padStart(2, '0')).join('');
    write('carruleddhi.voteDevice', fresh);
    return fresh.toLowerCase();
  }

  /* ------------------------------------------------------------------------------- stan */

  const state = {
    phase: 'scheduled',
    raceStartsAt: null,
    votingEndsAt: null,
    scoreMin: 3,
    scoreMax: 10,
    categories: [],
    participants: [],
    podium: [],
    myVotes: [],
    category: '',
    /** Uczestnik otwarty w oknie oceny. */
    voting: null,
    loaded: false
  };

  const scoreOf = (participantId) =>
    state.myVotes.find((vote) => vote.participantId === participantId)?.score ?? null;
  const votedInCategory = (category) =>
    state.myVotes.some((vote) => vote.category === category);

  /** Faza wybrana ręcznie w trybie demo. Poza demo nie ma na to żadnej drogi. */
  let demoPhase = 'scheduled';

  function absorb(result) {
    Object.assign(state, {
        phase: result.phase,
        raceStartsAt: result.raceStartsAt || null,
        votingEndsAt: result.votingEndsAt || null,
        scoreMin: Number(result.scoreMin) || 3,
        scoreMax: Number(result.scoreMax) || 10,
        categories: Array.isArray(result.categories) ? result.categories : [],
        participants: Array.isArray(result.participants) ? result.participants : [],
        podium: Array.isArray(result.podium) ? result.podium : [],
      myVotes: Array.isArray(result.myVotes) ? result.myVotes : [],
      loaded: true
    });
    if (!state.category || !state.categories.includes(state.category)) {
      state.category = state.categories[0] || '';
    }
    paint();
  }

  /** Podstawia odpowiedź, którą dałby Worker, i dokłada przełącznik faz. */
  function paintDemo() {
    demoDriven = true;
    absorb(demoVotingState(demoPhase));
    paintDemoSwitch();
  }

  async function pull() {
    const bridge = api();
    const endpoint = config()?.endpoints?.voting;
    if (!bridge || !endpoint) {
      if (demoMode) paintDemo();
      return;
    }
    try {
      const result = await bridge.post(endpoint, bridge.payload('voting', {
        action: 'state',
        deviceId: deviceId()
      }));
      /* Brak Workera odpowiada `{ ok, demo }` bez fazy — patrz postJSON w app.js. Poza trybem
         demo nie ma wtedy czego pokazywać i nie ma powodu niczego psuć: sekcje zostają ukryte,
         dokładnie jak przed odczytem. W trybie demo to jest właśnie chwila, w której demo
         przejmuje ekran. */
      if (!result?.ok || !result.phase) {
        if (demoMode) paintDemo();
        return;
      }
      demoDriven = false;
      absorb(result);
      // Prawdziwa odpowiedź zdejmuje przełącznik: dwie prawdy o fazie na jednym ekranie to
      // jedna prawda za dużo.
      $('[data-voting-demo]')?.remove();
    } catch (error) {
      /* Cicho. Nieudany odczyt zostawia stronę taką, jaka była — a przed pierwszym udanym
         odczytem znaczy to stronę bez sekcji głosowania, czyli dokładnie to, co widać przez
         cały rok poza dniem wyścigu. Komunikat o błędzie w tym miejscu byłby ostrzeżeniem o
         nieistnieniu czegoś, czego nikt jeszcze nie szukał. */
      console.warn('Voting state unavailable:', error);
      if (demoMode) paintDemo();
    }
  }

  /**
   * Trzy przyciski faz, tylko w trybie demo.
   *
   * Budowane z JavaScriptu, a nie wpisane w index.html — z tego samego powodu co baner DEMO:
   * czego nie ma w znaczniku, to nie może pojawić się bez parametru w adresie. Wstawiane raz.
   */
  function paintDemoSwitch() {
    const existing = $('[data-voting-demo]');
    if (existing) {
      $$('button[data-demo-phase]', existing).forEach((button) => {
        const active = button.dataset.demoPhase === demoPhase;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      // Skrót „zakończ odliczanie" ma sens tylko wtedy, gdy jest co kończyć.
      const skip = $('[data-demo-skip]', existing);
      if (skip) skip.hidden = demoPhase !== 'scheduled';
      return;
    }

    /* Wąski ekran sprawdzany przy każdym pytaniu, nie raz przy budowie: obrót telefonu zmienia
       odpowiedź, a pasek żyje tyle, ile strona. */
    const isWide = () => window.matchMedia('(min-width: 761px)').matches;

    const setPhase = (phase) => {
      demoPhase = phase;
      /* Rysunek podium rysuje się raz, więc przy powrocie do tej fazy trzeba zdjąć klasę,
         inaczej drugie wejście pokazuje gotowy cokół bez animacji. */
      $('[data-podium-art]')?.classList.remove('is-drawn');
      paintDemo();
      /* Na telefonie zwija się po wyborze. Faza jest wybierana po to, żeby ZOBACZYĆ, co się
         zmieniło, a rozwinięta lista zasłania dolną trzecią ekranu. Na szerokim zostaje
         otwarta — tam nie zasłania niczego. */
      if (!isWide()) {
        open = false;
        paintOpen();
      }
    };

    /* Przypięty do okna, nie wstawiony w sekcję głosowania.
       ---------------------------------------------------------------------------
       Wstawiony w sekcję był nieosiągalny dokładnie wtedy, gdy jest potrzebny: licznik stoi w
       hero, a przełącznik leżał ekran niżej, więc nie dało się przejść z odliczania do
       głosowania patrząc na to, co się przy tym zmienia — a to jest jedyny powód, dla którego
       ten przełącznik istnieje.

       Lewy dolny róg, bo prawy zajmuje czat. */
    const bar = document.createElement('div');
    bar.className = 'voting-demo';
    bar.dataset.votingDemo = '';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'DEMO');

    /**
     * Zwijany, bo na telefonie inaczej się nie da.
     * ---------------------------------------------------------------------------
     * ZMIERZONE 390×844, gdy pasek był zawsze rozwinięty:
     *   — przyciski miały 29 px wysokości. Zalecane minimum celu dotykowego to 44;
     *   — cztery napisy zawijały się do TRZECH rzędów i zabierały 90 px, czyli 11% ekranu;
     *   — baner cookies stoi w tym samym miejscu: 375 px wysokości, od 459 do 834 px, czyli
     *     dolna połowa ekranu. Pasek leżał na nim i oba były nieczytelne.
     *
     * Domyślnie zwinięty do jednej pigułki z napisem DEMO — zajmuje tyle, ile zajmuje słowo, i
     * nie ma z czym kolidować. Naciśnięcie rozwija listę faz nad nią, w kolumnie, z celami po
     * 44 px. Na szerokim ekranie startuje rozwinięty, bo tam miejsca nie brakuje i schowanie
     * czegokolwiek byłoby utrudnieniem bez powodu.
     */
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'voting-demo__toggle';
    toggle.dataset.demoToggle = '';
    toggle.textContent = 'DEMO';
    toggle.setAttribute('aria-controls', 'voting-demo-phases');

    const phases = document.createElement('div');
    phases.className = 'voting-demo__phases';
    phases.dataset.demoPhases = '';
    phases.id = 'voting-demo-phases';

    let open = isWide();
    const paintOpen = () => {
      bar.classList.toggle('is-open', open);
      /* `hidden` zamiast samego CSS-a: zwinięte przyciski wypadają wtedy też z kolejności
         czytania i z wędrówki tabulatorem, a nie tylko z widoku. */
      phases.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.addEventListener('click', () => {
      open = !open;
      paintOpen();
    });

    bar.append(toggle, phases);

    for (const [phase, key] of [
      ['scheduled', 'voting.demoScheduled'],
      ['voting', 'voting.demoVoting'],
      ['closed', 'voting.demoClosed']
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.demoPhase = phase;
      button.textContent = text(key);
      button.addEventListener('click', () => setPhase(phase));
      phases.append(button);
    }

    /* Osobny przycisk na „licznik doszedł do zera".
       Trzy przyciski faz przestawiają stan skokowo, a to jest inne pytanie: co widzi ktoś, kto
       PATRZY na odliczanie w chwili, gdy dobiega końca. Ustawia start na dwie sekundy w przód,
       więc przejście dzieje się na oczach, tą samą drogą co w dniu zawodów — przez watchStart. */
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.dataset.demoSkip = '';
    skip.className = 'voting-demo__skip';
    skip.textContent = text('voting.demoSkip');
    skip.addEventListener('click', () => {
      state.raceStartsAt = new Date(Date.now() + 2000).toISOString();
      paintClock();
      if (!isWide()) {
        open = false;
        paintOpen();
      }
    });
    /* Wewnątrz zwijanej części, nie obok pigułki: zwinięty pasek ma być SZEROKOŚCIĄ słowa DEMO,
       a ten napis jest najdłuższy z wszystkich („Zakończ odliczanie") i sam zawinąłby pasek do
       dwóch rzędów. */
    phases.append(skip);

    paintOpen();
    document.body.append(bar);
    paintDemoSwitch();
  }

  /* ------------------------------------------------------------------------- rysowanie */

  function paintPhase() {
    const voting = state.phase === 'voting';
    const closed = state.phase === 'closed';

    // Sekcja głosowania stoi otwarta w obu tych fazach: w drugiej ta sama lista jest rankingiem.
    // W trybie demo zostaje widoczna także przed startem — inaczej przełącznik faz zniknąłby
    // razem z sekcją i nie byłoby czym wrócić.
    const section = $('[data-voting]');
    if (section) {
      section.hidden = !(voting || closed || demoDriven);
      section.classList.toggle('is-closed', closed);
    }
    const podium = $('[data-podium]');
    if (podium) podium.hidden = !(closed && state.podium.length > 0);

    $$('[data-vote-cta]').forEach((cta) => { cta.hidden = !voting; });

    // Nagłówek sekcji mówi co innego, gdy głosowanie się skończyło.
    const kicker = $('[data-voting-kicker]');
    const lead = $('[data-voting-lead]');
    if (kicker) kicker.textContent = text(closed ? 'voting.resultsKicker' : 'voting.kicker');
    if (lead) lead.textContent = text(closed ? 'voting.resultsLead' : 'voting.lead');

    paintSignupLock(voting);
  }

  /**
   * Zapisy w trakcie wyścigu.
   *
   * Zjazd już się odbywa, więc zgłoszenie wysłane teraz nie ma jak wziąć udziału — ale
   * blokada jest z premedytacją miękka i zdejmowalna: dorysowana wstążka i wyłączony przycisk
   * wysyłki, bez ruszania samego formularza. Wpisane dane zostają na miejscu.
   *
   * Warunkiem jest wyłącznie faza `voting` odczytana z serwera. Nieudany odczyt daje
   * `scheduled` i nie blokuje niczego — awaria tej sekcji nie ma prawa zamknąć zapisów.
   */
  function paintSignupLock(locked) {
    const section = $('#signup');
    if (section) {
      section.classList.toggle('is-race-locked', locked);
      const notice = $('[data-signup-locked]', section);
      if (notice) notice.hidden = !locked;
    }

    const submit = $('[data-registration-form] button[type="submit"]');
    if (submit) {
      submit.disabled = locked;
      submit.setAttribute('aria-disabled', String(locked));
    }

    /* Odsyłacze „Zapisz się" — w hero, w nagłówku i w menu — też przestają prowadzić.
       ---------------------------------------------------------------------------
       Wyłączony przycisk wysyłki na dole formularza jest za późno: człowiek klika „Zapisz się"
       w hero, zjeżdża do formularza, wypełnia trzy kroki i dopiero tam dowiaduje się, że
       zapisy są wstrzymane. Wiadomość musi stać w tym samym miejscu co zaproszenie.

       `aria-disabled` plus przechwycony klik, nie `pointer-events: none`: wyłączony przez CSS
       odsyłacz nadal jest w kolejności tabulacji i czytnik ekranu nadal go czyta jako
       działający. Tutaj klawiatura i lektor dowiadują się tego samego co mysz. */
    $$('a[href="#signup"], a[data-feature-link="registration"]').forEach((link) => {
      if (link.dataset.voteCta !== undefined) return;
      link.classList.toggle('is-race-locked', locked);
      link.setAttribute('aria-disabled', String(locked));
      if (locked) link.setAttribute('tabindex', '-1');
      else link.removeAttribute('tabindex');
    });
  }

  /**
   * Klik w „Zapisz się" w trakcie wyścigu prowadzi do głosowania, nie do formularza.
   *
   * Podpięte raz, na dokumencie, a nie na każdym odsyłaczu — odsyłacze w menu i w stopce
   * istnieją od początku, ale sekcja głosowania dokłada swoje, a nasłuch na fazie jest
   * jeden. Zamiast martwego kliknięcia człowiek trafia tam, gdzie w tej chwili coś się dzieje.
   */
  function guardSignupLinks() {
    document.addEventListener('click', (event) => {
      if (state.phase !== 'voting') return;
      const link = event.target.closest?.('a[href="#signup"], a[data-feature-link="registration"]');
      if (!link || link.dataset.voteCta !== undefined) return;
      event.preventDefault();
      toast(text('voting.signupLockedLead'), 'info');
      $('#voting')?.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
    });
  }

  function paintFilters() {
    const wrap = $('[data-voting-filters]');
    if (!wrap) return;
    // Jedna kategoria to nie wybór, a filtr z jednym przyciskiem to element do kliknięcia,
    // który nic nie zmienia.
    wrap.hidden = state.categories.length < 2;
    wrap.replaceChildren(...state.categories.map((category) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'voting-filter';
      button.dataset.votingCategory = category;
      const active = category === state.category;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
      const label = document.createElement('strong');
      label.textContent = category;
      button.append(label);
      if (votedInCategory(category)) {
        const done = document.createElement('small');
        done.textContent = text('voting.voted');
        button.append(done);
      }
      button.addEventListener('click', () => {
        state.category = category;
        paintFilters();
        paintGrid();
      });
      return button;
    }));
  }

  function paintGrid() {
    const grid = $('[data-voting-grid]');
    const empty = $('[data-voting-empty]');
    if (!grid) return;

    const closed = state.phase === 'closed';
    let rows = state.participants.filter((row) => !state.category || row.category === state.category);
    /* Po zamknięciu ta sama siatka jest rankingiem, więc kolejność jest wynikiem. W trakcie
       głosowania zostaje numer startowy: sortowanie po średniej pokazywałoby, kto prowadzi, a
       to zamienia ocenianie pojazdów w dopisywanie się do lidera pierwszej godziny. */
    if (closed) {
      rows = [...rows].sort((a, b) =>
        b.averageScore - a.averageScore || b.voteCount - a.voteCount || a.startNumber - b.startNumber);
    }

    if (empty) empty.hidden = rows.length > 0;
    grid.replaceChildren(...rows.map((row, index) => card(row, closed ? index + 1 : 0)));
  }

  function card(row, rank) {
    const mine = scoreOf(row.id);
    const article = document.createElement('article');
    article.className = 'cart-card';
    article.dataset.participant = row.id;
    if (mine !== null) article.classList.add('is-voted');

    /* Cały kafelek jest przyciskiem, nie samo zdjęcie: cel wielkości kciuka, a nie cel
       wielkości ikony. Po zamknięciu przestaje być klikalny, bo nie ma już czego otworzyć. */
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'cart-card__open';
    open.disabled = state.phase !== 'voting';
    open.setAttribute('aria-label', `${row.projectName || row.firstName} — ${text('voting.cta')}`);

    const figure = document.createElement('figure');
    figure.className = 'cart-card__photo';
    if (row.photo) {
      const image = document.createElement('img');
      image.src = row.photo;
      image.alt = row.projectName || `${row.firstName} ${row.lastName}`.trim();
      image.loading = 'lazy';
      image.decoding = 'async';
      figure.append(image);
    } else {
      // Zastępnik, nie puste miejsce: kafelek bez zdjęcia ma mieć ten sam kształt co reszta,
      // inaczej siatka rozjeżdża się na jednym brakującym pliku.
      const blank = document.createElement('span');
      blank.className = 'cart-card__blank';
      blank.setAttribute('aria-hidden', 'true');
      blank.textContent = String(row.startNumber).padStart(3, '0');
      figure.append(blank);
    }
    const badge = document.createElement('span');
    badge.className = 'cart-card__number';
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = String(row.startNumber).padStart(3, '0');
    figure.append(badge);
    if (rank) {
      const place = document.createElement('span');
      place.className = 'cart-card__rank';
      place.textContent = `#${rank}`;
      figure.append(place);
    }
    open.append(figure);

    const body = document.createElement('div');
    body.className = 'cart-card__body';
    const project = document.createElement('strong');
    project.textContent = row.projectName || text('voting.noProject');
    const rider = document.createElement('span');
    rider.className = 'cart-card__rider';
    rider.textContent = `${row.firstName} ${row.lastName}`.trim();
    body.append(project, rider);

    if (state.phase === 'closed') {
      const stats = document.createElement('p');
      stats.className = 'cart-card__stats';
      const average = document.createElement('b');
      average.textContent = row.averageScore ? row.averageScore.toFixed(2) : '—';
      const count = document.createElement('small');
      count.textContent = `${row.voteCount} ${text('voting.votes')}`;
      stats.append(average, count);
      body.append(stats);
    } else if (mine !== null) {
      const yours = document.createElement('p');
      yours.className = 'cart-card__yours';
      yours.textContent = `${text('voting.yourScore')} ${mine}`;
      body.append(yours);
    }
    open.append(body);

    if (state.phase === 'voting') open.addEventListener('click', () => openVote(row));
    article.append(open);
    return article;
  }

  function paintPodium() {
    const list = $('[data-podium-winners]');
    if (!list) return;
    // Kolejność w rysunku to 2, 1, 3 — tak stoi podium. Kolejność w liście to 1, 2, 3, bo
    // czytnik ekranu czyta wynik, nie patrzy na cokół; CSS ustawia je na właściwych schodkach.
    list.replaceChildren(...state.podium.map((row, index) => {
      const item = document.createElement('li');
      item.className = 'podium-card';
      item.dataset.podiumPlace = String(index + 1);

      const figure = document.createElement('figure');
      figure.className = 'podium-card__photo';
      if (row.photo) {
        const image = document.createElement('img');
        image.src = row.photo;
        image.alt = row.projectName || `${row.firstName} ${row.lastName}`.trim();
        image.loading = 'lazy';
        figure.append(image);
      } else {
        const blank = document.createElement('span');
        blank.setAttribute('aria-hidden', 'true');
        blank.textContent = String(row.startNumber).padStart(3, '0');
        figure.append(blank);
      }
      const place = document.createElement('span');
      place.className = 'podium-card__place';
      place.textContent = String(index + 1);
      figure.append(place);

      const body = document.createElement('div');
      body.className = 'podium-card__body';
      const project = document.createElement('strong');
      project.textContent = row.projectName || text('voting.noProject');
      const rider = document.createElement('span');
      rider.textContent = `${row.firstName} ${row.lastName}`.trim();
      const stats = document.createElement('p');
      const average = document.createElement('b');
      average.textContent = row.averageScore ? row.averageScore.toFixed(2) : '—';
      const count = document.createElement('small');
      count.textContent = `${row.voteCount} ${text('voting.votes')}`;
      stats.append(average, count);
      body.append(project, rider, stats);

      item.append(figure, body);
      return item;
    }));

    if (!reducedMotion) $('[data-podium-art]')?.classList.add('is-drawn');
  }

  /* ------------------------------------------------------------------------- odliczanie */

  const stamp = (value) => {
    const time = Date.parse(String(value || ''));
    return Number.isNaN(time) ? null : time;
  };

  /** Ile zostało, po ludzku. Godziny pomijane, gdy ich nie ma — „00 h 04 m" to nie zdanie. */
  function remaining(milliseconds) {
    const total = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const pad = (value) => String(value).padStart(2, '0');
    return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
  }

  /** Ustawiane, gdy licznik dobiegł zera i wysłano po nowy stan — żeby nie wysłać dziesięć razy. */
  let awaitingPhase = false;

  function paintClock() {
    const clock = $('[data-voting-clock]');
    if (!clock) return;

    if (state.phase === 'voting') {
      const ends = stamp(state.votingEndsAt);
      if (!ends) {
        clock.textContent = text('voting.openNoLimit');
        return;
      }
      const left = ends - Date.now();
      if (left <= 0) {
        clock.textContent = text('voting.closing');
        // Zamyka serwer, nie ta linijka. Tu tylko pytamy, czy już zamknął.
        if (!awaitingPhase) {
          awaitingPhase = true;
          pull().finally(() => { awaitingPhase = false; });
        }
        return;
      }
      clock.textContent = `${text('voting.timeLeft')} ${remaining(left)}`;
      return;
    }

    if (state.phase === 'closed') {
      clock.textContent = text('voting.closed');
      return;
    }

    /* Przed startem: ile zostało do zjazdu.
       Główny licznik w hero odlicza do dnia wydarzenia i to zostaje bez zmian — tu chodzi o
       godzinę, na którą organizator ustawił start, czyli o rzecz istotną w samym dniu zawodów.
       Doba jako granica: „start za 284:15:02" nie jest informacją, a przez jedenaście miesięcy
       w roku byłoby jedynym, co ta linijka mówi. */
    const opens = stamp(state.raceStartsAt);
    const until = opens ? opens - Date.now() : 0;
    clock.textContent = until > 0 && until < 86400000
      ? `${text('voting.startsIn')} ${remaining(until)}`
      : '';
  }

  /**
   * Odliczanie do startu wyścigu, poza sekcją głosowania.
   *
   * Główny licznik na stronie odlicza do daty wydarzenia i to zostaje bez zmian. Tu chodzi o
   * moment, w którym organizator ustawił start zjazdu: gdy minie, pytamy serwer o fazę.
   * Sekunda po sekundzie sprawdzana jest lokalnie, ale otwarcie ogłasza wyłącznie serwer.
   */
  function watchStart() {
    if (state.phase !== 'scheduled' || awaitingPhase) return;
    const opens = stamp(state.raceStartsAt);
    if (!opens || Date.now() < opens) return;
    /* W trybie demo nie ma kogo zapytać, a przejście przez zero jest jedną z rzeczy, które
       trzeba dać obejrzeć — więc demo robi tu to, co zrobiłby serwer, i przechodzi do
       głosowania. Bez tego licznik dobiegłby zera i zostałby na nim. */
    if (demoDriven) {
      demoPhase = 'voting';
      paintDemo();
      return;
    }
    awaitingPhase = true;
    pull().finally(() => { awaitingPhase = false; });
  }

  function paint() {
    paintPhase();
    paintFilters();
    paintGrid();
    paintPodium();
    paintClock();
  }

  /* ---------------------------------------------------------------------- okno oceny */

  function setupDialog() {
    const dialog = $('[data-vote-dialog]');
    const form = $('[data-vote-form]');
    if (!dialog || !form) return;

    const slider = $('[data-vote-score]', dialog);
    const value = $('[data-vote-score-value]', dialog);
    const status = $('[data-vote-status]', dialog);
    const send = $('[data-vote-send]', dialog);

    if (slider) {
      slider.min = String(state.scoreMin);
      slider.max = String(state.scoreMax);
      const show = () => { if (value) value.textContent = slider.value; };
      slider.addEventListener('input', show);
      show();
    }

    /**
     * Sprzątanie po zamkniętym oknie: odblokowanie tła i zapomnienie, co było oceniane.
     *
     * Wołane z `close()`, a nie tylko ze zdarzenia `close` — i to jest różnica, która się
     * liczy. Sonda w headless Chrome pokazała `dialog.close()` wykonane raz, okno zamknięte i
     * ani jednego zdarzenia `close`: strona zostawała z `is-locked` na `body`, czyli z
     * zablokowanym przewijaniem i bez żadnego okna, które by to tłumaczyło. Najgorszy możliwy
     * objaw, bo wygląda na zawieszoną stronę.
     *
     * Niezależnie od tego, czy to właściwość tej przeglądarki, czy tego trybu: sprzątanie po
     * czynności należy do tej czynności. Zdarzenie zostaje podpięte jako siatka na przypadki,
     * których nie wywołuje ten kod — Escape i kliknięcie w tło. Funkcja jest bezpieczna przy
     * dwukrotnym wywołaniu, więc oba tory mogą się spokojnie nałożyć.
     */
    const release = () => {
      document.body.classList.remove('is-locked');
      state.voting = null;
      if (status) status.textContent = '';
    };

    const close = () => {
      if (dialog.open) dialog.close();
      release();
    };
    $('[data-vote-close]', dialog)?.addEventListener('click', close);
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
    dialog.addEventListener('close', release);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const target = state.voting;
      if (!target) return;

      const name = String(form.elements.namedItem('name')?.value || '').trim();
      const email = String(form.elements.namedItem('email')?.value || '').trim();
      const score = Number(slider?.value);
      // Ta sama para reguł co w formularzu zapisów, żeby komunikat był ten sam.
      if (!name) { markInvalid(form, 'name'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { markInvalid(form, 'email'); return; }

      const bridge = api();
      const endpoint = config()?.endpoints?.voting;
      if (!bridge || !endpoint) return;

      send.disabled = true;
      if (status) status.textContent = text('voting.sending');
      try {
        const result = await bridge.post(endpoint, bridge.payload('voting', {
          action: target.editToken ? 'edit' : 'vote',
          participantId: target.id,
          editToken: target.editToken,
          name,
          email,
          deviceId: deviceId(),
          score
        }));
        if (!result?.ok) throw Object.assign(new Error('vote'), { payload: result });
        close();
        toast(text(result.mailed === false ? 'voting.thanksNoMail' : 'voting.thanks'), 'success');
        /* W trybie demo nie ma czego odczytać ponownie — `pull()` odtworzyłby stan wyjściowy i
           oddany głos zniknąłby z ekranu. Zapisany lokalnie, żeby dało się zobaczyć to, co
           widzi głosujący po wysłaniu: znacznik na kafelku i własną ocenę. */
        if (demoDriven) {
          const row = state.participants.find((entry) => entry.id === target.id);
          if (row) state.myVotes = [...state.myVotes, { participantId: row.id, category: row.category, score }];
          paint();
        } else {
          await pull();
        }
      } catch (error) {
        const code = error.payload?.code || '';
        const key = {
          VOTING_ALREADY_VOTED: 'voting.already',
          VOTING_NOT_OPEN: 'voting.notOpen',
          VOTING_BAD_SCORE: 'voting.badScore',
          VOTING_BAD_EMAIL: 'validation.email',
          VOTING_NO_VOTE: 'voting.tokenGone',
          VOTING_BAD_TOKEN: 'voting.tokenGone'
        }[code] || (error.status === 429 ? 'form.tooMany' : 'form.sendError');
        if (status) status.textContent = text(key);
        // „Już głosowałeś" nie jest błędem do poprawienia, więc lista jest odświeżana:
        // kafelek dostanie znacznik i przestanie zachęcać do drugiej próby.
        if (code === 'VOTING_ALREADY_VOTED' || code === 'VOTING_NOT_OPEN') await pull();
      } finally {
        send.disabled = false;
      }
    });
  }

  function markInvalid(form, name) {
    const control = form.elements.namedItem(name);
    control?.closest('[data-field]')?.classList.add('is-invalid');
    control?.setAttribute('aria-invalid', 'true');
    control?.focus({ preventScroll: true });
  }

  function fillDialog({ category, projectName, riderName, startNumber, photo, score }) {
    const dialog = $('[data-vote-dialog]');
    if (!dialog) return;
    const image = $('[data-vote-photo]', dialog);
    if (image) {
      image.hidden = !photo;
      if (photo) {
        image.src = photo;
        image.alt = projectName || riderName || '';
      }
    }
    const number = $('[data-vote-number]', dialog);
    if (number) number.textContent = startNumber ? String(startNumber).padStart(3, '0') : '';
    const categoryLabel = $('[data-vote-category]', dialog);
    if (categoryLabel) categoryLabel.textContent = category || '';
    const project = $('[data-vote-project]', dialog);
    if (project) project.textContent = projectName || text('voting.noProject');
    const rider = $('[data-vote-rider]', dialog);
    if (rider) rider.textContent = riderName || '';

    const slider = $('[data-vote-score]', dialog);
    const value = $('[data-vote-score-value]', dialog);
    if (slider) {
      slider.min = String(state.scoreMin);
      slider.max = String(state.scoreMax);
      // Środek skali jako punkt wyjścia, nie maksimum: suwak ustawiony na 10 to podpowiedź,
      // żeby nic nie ruszać i wysłać dziesiątkę.
      slider.value = String(score ?? Math.round((state.scoreMin + state.scoreMax) / 2));
      if (value) value.textContent = slider.value;
    }
    $$('[data-field]', dialog).forEach((field) => field.classList.remove('is-invalid'));
    dialog.showModal();
    document.body.classList.add('is-locked');
  }

  function openVote(row) {
    const mine = scoreOf(row.id);
    if (mine !== null) {
      /* Zmiana oceny idzie przez odsyłacz z maila, nie przez ten kafelek. Żeton do zmiany
         nigdy nie dociera do przeglądarki — patrz komentarz nad votingVote w Workerze — więc
         strona nie ma czym się tu wykazać i mówi to wprost. */
      toast(text('voting.changeByEmail'), 'info');
      return;
    }
    state.voting = { id: row.id, editToken: '' };
    fillDialog({
      category: row.category,
      projectName: row.projectName,
      riderName: `${row.firstName} ${row.lastName}`.trim(),
      startNumber: row.startNumber,
      photo: row.photo
    });
  }

  /**
   * Zmiana decyzji z odsyłacza w mailu: `#vote=<żeton>`.
   *
   * Fragment, nie parametr zapytania — fragment nie jedzie do serwera ani w nagłówku Referer,
   * a to jest zdolność do zmiany cudzej oceny. Ten sam wzorzec co `#unsub=` przy rezygnacji z
   * powiadomień. Zdejmowany z adresu natychmiast po odczytaniu, żeby nie został w historii
   * przeglądarki ani w zakładce.
   */
  async function openFromToken() {
    const match = /#vote=([0-9a-f]{64})/i.exec(location.hash || '');
    if (!match) return;
    const editToken = match[1].toLowerCase();
    history.replaceState(null, '', `${location.pathname}${location.search}`);

    const bridge = api();
    const endpoint = config()?.endpoints?.voting;
    if (!bridge || !endpoint) return;
    try {
      const result = await bridge.post(endpoint, bridge.payload('voting', { action: 'peek', editToken }));
      if (!result?.ok || !result.vote) throw Object.assign(new Error('peek'), { payload: result });
      state.voting = { id: '', editToken };
      $('#voting')?.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
      fillDialog({
        category: result.vote.category,
        projectName: result.vote.projectName,
        riderName: result.vote.participantName,
        startNumber: result.vote.startNumber,
        photo: '',
        score: result.vote.score
      });
    } catch (_) {
      toast(text('voting.tokenGone'), 'error');
    }
  }

  /* ------------------------------------------------------------------------------ start */

  function start() {
    if (!$('[data-voting]')) return;
    setupDialog();
    guardSignupLinks();

    /* Jeden tik na sekundę dla licznika i jeden odczyt na trzydzieści sekund dla wyników — i
       oba tylko wtedy, gdy karta jest z przodu. Odliczanie w karcie schowanej za innymi to
       praca, której nikt nie widzi, a przeglądarki i tak dławią takie liczniki do raz na
       minutę; po powrocie ekran jest odświeżany, więc nic nie zostaje nieaktualne. */
    let ticker = 0;
    let poller = 0;
    const running = () => document.visibilityState === 'visible';

    const stop = () => {
      window.clearInterval(ticker);
      window.clearInterval(poller);
      ticker = 0;
      poller = 0;
    };
    const go = () => {
      if (ticker) return;
      ticker = window.setInterval(() => { paintClock(); watchStart(); }, 1000);
      // W trybie demo nie ma kogo odpytywać, a odliczanie ma dalej tykać, żeby dało się
      // zobaczyć licznik.
      poller = window.setInterval(() => {
        if (state.phase === 'voting' && !demoDriven) pull();
      }, 30000);
    };

    document.addEventListener('visibilitychange', () => {
      if (running()) { pull(); go(); } else stop();
    });
    if (running()) go();

    // Etykiety w słowniku, więc przełączenie języka przerysowuje wszystko, co je nosi.
    window.addEventListener('carruleddhi:language', () => { if (state.loaded) paint(); });

    pull().then(openFromToken);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
