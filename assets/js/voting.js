/**
 * Głosowanie — część na stronie głównej.
 * ===========================================================================
 *
 * Od wyniesienia ocen na `votazione.html` ten plik nie rysuje już kafelków ani okna oceny.
 * Robi trzy rzeczy, których nie da się zrobić z podstrony:
 *
 *   1. odsłania zaproszenie „Zagłosuj na uczestnika" i CHOWA dwa pozostałe przyciski w hero —
 *      w trakcie wyścigu zapisy i „będę tam" nie mają czego dotyczyć, a trzy przyciski obok
 *      siebie znaczą trzy równorzędne propozycje w chwili, gdy sensowna jest jedna;
 *   2. pokazuje podium nagrody publiczności pod hero po zamknięciu głosowania;
 *   3. wstrzymuje zapisy na czas zjazdu.
 *
 * Samo ocenianie stoi na podstronie, bo tam nie ma licznika do dnia wydarzenia, formularza
 * zapisów ani czternastu innych sekcji — jest lista pojazdów i jedna nagroda.
 *
 * JEDNA NAGRODA, NIE DWANAŚCIE
 *   Publiczność przyznaje własną nagrodę i tylko ją. Stała tu wcześniej zwijana lista
 *   zwycięzców dwunastu nagród; zdjęta razem z przejściem na nagrodę publiczności (migracja
 *   0026), bo tamtych dwanaście rozstrzyga jury i stoper — lista „zwycięzców" wyliczona z
 *   głosów publiczności mówiłaby o nich coś, czego z tych głosów wyliczyć nie można.
 *
 * O FAZIE DECYDUJE SERWER. Patrz voting-core.js.
 */
import {
  $, $$, reducedMotion, demoMode, text, toast,
  stamp, remaining, readState, paintDemoBar, avatarFor
} from './voting-core.js';

(function () {
  'use strict';

  const state = {
    phase: 'scheduled',
    raceStartsAt: null,
    votingEndsAt: null,
    podium: [],
    participants: [],
    /** Ile wierszy klasyfikacji jest już narysowanych. Zero znaczy „lista zwinięta". */
    shown: 0,
    loaded: false
  };

  /** Porcja klasyfikacji. Pięć, bo tyle mieści się pod cokołem bez spychania stopki z ekranu. */
  const STANDINGS_BATCH = 5;

  /** Faza wybrana ręcznie w trybie demo. Poza demo nie ma na to żadnej drogi. */
  let demoPhase = 'scheduled';
  /** Ustawiane, gdy dane na ekranie pochodzą z demo, a nie z serwera. */
  let demoDriven = false;
  /** Ustawiane, gdy licznik dobiegł zera i wysłano po nowy stan — żeby nie wysłać dziesięć razy. */
  let awaitingPhase = false;

  function absorb(result) {
    Object.assign(state, {
      phase: result.phase,
      raceStartsAt: result.raceStartsAt || null,
      votingEndsAt: result.votingEndsAt || null,
      podium: Array.isArray(result.podium) ? result.podium : [],
      /* Pełna stawka, nie tylko trójka z cokołu. Potrzebna do rozwijanej klasyfikacji pod
         przyciskiem — ta sama odpowiedź serwera, więc ani jednego żądania więcej. */
      participants: Array.isArray(result.participants) ? result.participants : [],
      loaded: true
    });
    paint();
  }

  async function pull() {
    const result = await readState(demoPhase);
    if (!result) return;
    demoDriven = Boolean(result.demo);
    absorb(result);
    if (demoMode) {
      paintDemoBar({
        phase: () => demoPhase,
        onPhase: (phase) => {
          demoPhase = phase;
          /* Rysunek podium rysuje się raz, więc przy powrocie do tej fazy trzeba zdjąć klasę,
             inaczej drugie wejście pokazuje gotowy cokół bez animacji. */
          $('[data-podium-art]')?.classList.remove('is-drawn');
          pull();
        },
        onSkip: () => {
          /* „Licznik doszedł do zera" — inne pytanie niż przestawienie fazy: co widzi ktoś,
             kto PATRZY na odliczanie w chwili, gdy dobiega końca. Start dwie sekundy w przód,
             więc przejście dzieje się na oczach, tą samą drogą co w dniu zawodów. */
          state.raceStartsAt = new Date(Date.now() + 2000).toISOString();
          paintClock();
        }
      });
    }
  }

  /* ------------------------------------------------------------------------- rysowanie */

  function paint() {
    paintPhase();
    paintPodium();
    paintClock();
    paintHeroVote();
    paintStandings();
  }

  /**
   * Pełna klasyfikacja pod cokołem, porcjami po pięć.
   *
   * Kolejność jest DOKŁADNIE ta sama co na cokole i w Workerze: suma punktów, przy remisie
   * liczba głosów, potem średnia, na końcu numer startowy. Gdyby lista sortowała inaczej niż
   * cokół, pierwsze trzy wiersze nie zgadzałyby się z trzema kartami tuż nad nimi — i nikt by
   * tego nie umiał wytłumaczyć.
   *
   * Rysowana wyłącznie po zamknięciu: w trakcie głosowania byłaby tablicą wyników na żywo,
   * czyli zaproszeniem do dopisania się do lidera zamiast do oceniania wozów.
   */
  function standingsRows() {
    return [...state.participants]
      .filter((row) => row.voteCount > 0)
      .sort((a, b) =>
        b.totalScore - a.totalScore ||
        b.voteCount - a.voteCount ||
        b.averageScore - a.averageScore ||
        a.startNumber - b.startNumber);
  }

  function paintStandings() {
    const box = $('[data-podium-standings]');
    const list = $('[data-standings-list]');
    const more = $('[data-standings-more]');
    const toggle = $('[data-podium-toggle]');
    if (!box || !list || !toggle) return;

    // Przycisk pojawia się tylko wtedy, gdy jest co rozwinąć.
    const all = standingsRows();
    toggle.hidden = all.length === 0;
    if (!state.shown) {
      box.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      return;
    }

    box.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');

    const visible = all.slice(0, state.shown);
    list.replaceChildren(...visible.map((row, index) => {
      const item = document.createElement('li');
      item.className = 'standings__row';
      if (index < 3) item.dataset.standingsTop = String(index + 1);

      const rank = document.createElement('span');
      rank.className = 'standings__rank';
      rank.textContent = String(index + 1);

      /* Zdjęcie w rogu wiersza; brak zdjęcia dostaje rysowany kafelek z numerem, a nie pustkę
         — ten sam awatar co na cokole, więc ten sam wóz wygląda tak samo w obu miejscach. */
      const photo = document.createElement('img');
      photo.className = 'standings__photo';
      photo.src = row.photo || avatarFor(row);
      photo.alt = '';
      photo.loading = 'lazy';

      const who = document.createElement('span');
      who.className = 'standings__who';
      const name = document.createElement('strong');
      name.textContent = row.projectName || text('voting.noProject');
      const meta = document.createElement('span');
      meta.textContent = `${String(row.startNumber).padStart(3, '0')} · `
        + `${`${row.firstName} ${row.lastName}`.trim()} · ${row.category}`;
      who.append(name, meta);

      const score = document.createElement('span');
      score.className = 'standings__score';
      const points = document.createElement('b');
      points.textContent = String(row.totalScore);
      const note = document.createElement('small');
      note.textContent = `${text('voting.points')} · ${row.voteCount} ${text('voting.votes')}`
        + ` · ${text('voting.avgShort')} ${row.averageScore.toFixed(1)}`;
      score.append(points, note);

      item.append(rank, photo, who, score);
      return item;
    }));

    if (more) {
      const left = all.length - visible.length;
      more.hidden = left === 0;
      const label = $('[data-standings-more-label]', more) || more;
      label.textContent = `${text('voting.loadMore')} (${left})`;
    }
  }

  /**
   * Zegar w hero: odliczanie do wydarzenia albo zegar głosowania, nigdy oba naraz.
   *
   * Trzy stany, bo trzy różne pytania zadaje w tych chwilach człowiek patrzący na stronę:
   *   przed startem — „ile zostało do zjazdu" (odliczanie zostaje bez zmian);
   *   głosowanie    — „ile mam czasu, żeby zagłosować";
   *   po zamknięciu — „kto wygrał".
   *
   * Odliczanie do wydarzenia jest CHOWANE, nie zerowane: w dniu zjazdu pokazywałoby same zera
   * w najbardziej widocznym miejscu strony, czyli zajmowałoby ekran, nie mówiąc niczego.
   *
   * Odsyłacz na cokół pojawia się wyłącznie wtedy, gdy cokół faktycznie ma co pokazać —
   * `state.podium.length`. Przycisk „zobacz zwycięzców" prowadzący do pustej sekcji byłby
   * gorszy niż brak przycisku.
   */
  function paintHeroVote() {
    const voting = state.phase === 'voting';
    const closed = state.phase === 'closed';
    const hasPodium = closed && state.podium.length > 0;

    const countdown = $('[data-countdown]');
    const box = $('[data-hero-vote]');
    if (countdown) countdown.hidden = voting || hasPodium;
    if (box) box.hidden = !(voting || hasPodium);

    const go = $('[data-hero-vote-go]');
    if (go) go.hidden = !voting;
    const toPodium = $('[data-hero-vote-podium]');
    if (toPodium) toPodium.hidden = !hasPodium;

    const label = $('[data-hero-vote-label]');
    const time = $('[data-hero-vote-time]');
    if (!label || !time) return;

    if (hasPodium) {
      label.textContent = text('voting.podiumKicker');
      time.textContent = text('voting.closed');
      return;
    }
    if (!voting) return;

    const ends = stamp(state.votingEndsAt);
    const left = ends ? ends - Date.now() : 0;
    if (ends && left > 0) {
      label.textContent = text('voting.timeLeft');
      time.textContent = remaining(left);
    } else {
      label.textContent = text('voting.pageKicker');
      time.textContent = text('voting.openNoLimit');
    }
  }

  function paintPhase() {
    const voting = state.phase === 'voting';
    const closed = state.phase === 'closed';

    const podium = $('[data-podium]');
    if (podium) podium.hidden = !(closed && state.podium.length > 0);

    // Zaproszenie do głosowania — w nagłówku i w hero. Prowadzi na podstronę.
    $$('[data-vote-cta]').forEach((cta) => { cta.hidden = !voting; });

    /* Dwa pozostałe przyciski w hero schodzą z ekranu na czas wyścigu.
       ---------------------------------------------------------------------------
       Nie wyłączone, nie wyszarzone — schowane. Wyłączony przycisk jest zaproszeniem, które
       nie działa, i człowiek naciska go dwa razy, zanim uwierzy. „Zapisz się" w chwili, gdy
       wózki już jadą, oraz „będę tam" w chwili, gdy trzeba już tam być, nie mają czego
       dotyczyć. Zostaje jedno zdanie: zagłosuj.

       `hidden`, więc wypadają też z kolejności tabulacji i z czytnika ekranu. */
    $$('[data-race-hide]').forEach((element) => { element.hidden = voting; });

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

    /* Odsyłacze „Zapisz się" w menu i w stopce — te, których nie schowaliśmy.
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
   * Podpięte raz, na dokumencie, a nie na każdym odsyłaczu — odsyłaczy jest kilka i powstają
   * w różnych chwilach, a nasłuch na fazie jest jeden. Zamiast martwego kliknięcia człowiek
   * trafia tam, gdzie w tej chwili coś się dzieje.
   */
  function guardSignupLinks() {
    document.addEventListener('click', (event) => {
      if (state.phase !== 'voting') return;
      const link = event.target.closest?.('a[href="#signup"], a[data-feature-link="registration"]');
      if (!link || link.dataset.voteCta !== undefined) return;
      event.preventDefault();
      toast(text('voting.signupLockedLead'), 'info');
      $('[data-vote-cta]:not([hidden])')?.focus?.();
    });
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
      /* Brak zdjęcia dostaje rysowany kafelek z numerem, nie pusty prostokąt — patrz
         avatarFor() w voting-core.js. Na cokole widać to najmocniej: to trzy jedyne karty,
         na które tego dnia patrzy cały plac. */
      const image = document.createElement('img');
      image.src = row.photo || avatarFor(row);
      image.alt = row.projectName || `${row.firstName} ${row.lastName}`.trim();
      image.loading = 'lazy';
      figure.append(image);

      const place = document.createElement('span');
      place.className = 'podium-card__place';
      place.textContent = String(index + 1);
      figure.append(place);

      // Numer startowy w prawym rogu; miejsce na cokole zostaje w lewym.
      const start = document.createElement('span');
      start.className = 'podium-card__start';
      start.textContent = String(row.startNumber).padStart(3, '0');
      figure.append(start);

      const body = document.createElement('div');
      body.className = 'podium-card__body';
      const project = document.createElement('strong');
      project.textContent = row.projectName || text('voting.noProject');
      const rider = document.createElement('span');
      rider.textContent = `${row.firstName} ${row.lastName}`.trim();
      const stats = document.createElement('p');
      /* Suma punktów, bo to ona ustawiła kolejność na cokole. Ze średnią na pierwszym planie
         zwycięzca pokazywałby 9.12 obok 9.47 u wicemistrza i cokół czytałoby się jako pomyłka
         — a to jedyne trzy kafelki, na które tego dnia patrzy cały plac. */
      const points = document.createElement('b');
      points.textContent = row.voteCount ? String(row.totalScore) : '—';
      const count = document.createElement('small');
      /* Średnia do JEDNEGO miejsca po przecinku. 9.47 obok 9.12 to dwie liczby, których
         nikt nie porównuje w biegu — a to i tak nie ona ustawia kolejność, tylko suma
         punktów obok. Setne udawały precyzję, której ten wynik nie ma. */
      count.textContent = row.voteCount
        ? `${text('voting.points')} · ${row.voteCount} ${text('voting.votes')}`
          + ` · ${text('voting.avgShort')} ${row.averageScore.toFixed(1)}`
        : text('voting.noVotes');
      stats.append(points, count);
      body.append(project, rider, stats);

      item.append(figure, body);
      return item;
    }));

    if (!reducedMotion) $('[data-podium-art]')?.classList.add('is-drawn');
  }

  /* ------------------------------------------------------------------------- odliczanie */

  function paintClock() {
    const clock = $('[data-voting-clock]');
    if (!clock) return;

    if (state.phase === 'closed') {
      clock.textContent = text('voting.closed');
      return;
    }
    if (state.phase === 'voting') {
      const ends = stamp(state.votingEndsAt);
      const left = ends ? ends - Date.now() : 0;
      clock.textContent = ends && left > 0
        ? `${text('voting.timeLeft')} ${remaining(left)}`
        : text('voting.openNoLimit');
      return;
    }

    /* Przed startem: ile zostało do zjazdu.
       Główny licznik w hero odlicza do dnia wydarzenia i to zostaje bez zmian — tu chodzi o
       godzinę, na którą organizator ustawił start. Doba jako granica: „start za 284:15:02" nie
       jest informacją, a przez jedenaście miesięcy w roku byłoby jedynym, co ta linijka mówi. */
    const opens = stamp(state.raceStartsAt);
    const until = opens ? opens - Date.now() : 0;
    clock.textContent = until > 0 && until < 86400000
      ? `${text('voting.startsIn')} ${remaining(until)}`
      : '';
  }

  /**
   * Odliczanie do startu wyścigu.
   *
   * Gdy godzina startu minie, pytamy serwer o fazę. Sekunda po sekundzie sprawdzana jest
   * lokalnie, ale otwarcie ogłasza wyłącznie serwer.
   */
  function watchStart() {
    if (state.phase !== 'scheduled' || awaitingPhase) return;
    const opens = stamp(state.raceStartsAt);
    if (!opens || Date.now() < opens) return;
    /* W trybie demo nie ma kogo zapytać, a przejście przez zero jest jedną z rzeczy, które
       trzeba dać obejrzeć — więc demo robi tu to, co zrobiłby serwer. */
    if (demoDriven) {
      demoPhase = 'voting';
      pull();
      return;
    }
    awaitingPhase = true;
    pull().finally(() => { awaitingPhase = false; });
  }

  /* ------------------------------------------------------------------------------ start */

  function start() {
    // Bez podium i bez zaproszenia nie ma tu czego robić — na przykład na podstronach prawnych.
    if (!$('[data-podium]') && !$('[data-vote-cta]')) return;
    guardSignupLinks();

    /* Rozwijanie klasyfikacji.
       `shown` trzyma liczbę wierszy, nie flagę „otwarte": zwinięcie to zero, otwarcie to
       pierwsza porcja, a „pokaż więcej" dokłada kolejną. Jedna liczba zamiast flagi i licznika
       znaczy, że nie da się doprowadzić do stanu „zwinięte, ale z ośmioma wierszami". */
    $('[data-podium-toggle]')?.addEventListener('click', () => {
      state.shown = state.shown ? 0 : STANDINGS_BATCH;
      paintStandings();
      /* Po rozwinięciu sekcja jest wyższa. Przewijamy do listy dopiero po przerysowaniu,
         inaczej cel skoku liczony jest ze starej wysokości. */
      if (state.shown) {
        requestAnimationFrame(() => {
          $('[data-podium-standings]')?.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
        });
      }
    });

    $('[data-standings-more]')?.addEventListener('click', () => {
      state.shown += STANDINGS_BATCH;
      paintStandings();
    });

    /* Jeden tik na sekundę dla licznika i jeden odczyt na trzydzieści sekund dla fazy — i oba
       tylko wtedy, gdy karta jest z przodu. Odliczanie w karcie schowanej za innymi to praca,
       której nikt nie widzi, a przeglądarki i tak dławią takie liczniki do raz na minutę. */
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
      ticker = window.setInterval(() => { paintClock(); paintHeroVote(); watchStart(); }, 1000);
      poller = window.setInterval(() => {
        if (!demoDriven) pull();
      }, 30000);
    };

    document.addEventListener('visibilitychange', () => {
      if (running()) { pull(); go(); } else stop();
    });
    if (running()) go();

    // Etykiety w słowniku, więc przełączenie języka przerysowuje wszystko, co je nosi.
    window.addEventListener('carruleddhi:language', () => { if (state.loaded) paint(); });

    pull();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
