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
  stamp, remaining, readState, paintDemoBar, avatarFor, votesLabel, tieNotes
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
          /* Cokół wznosi się raz, więc przy powrocie do tej fazy trzeba zdjąć klasę,
             inaczej drugie wejście pokazuje gotowy cokół bez animacji. */
          $('[data-podium-stage]')?.classList.remove('is-drawn');
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
    paintField();
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

  /**
   * Pozostała stawka: od czwartego miejsca w dół, cała, od razu.
   *
   * Zastępuje `paintStandings()` — listę rozwijaną przyciskiem i doczytywaną po pięć. Dwie
   * decyzje do podjęcia, żeby zobaczyć wynik, po który wszyscy tu przyszli. Teraz wyróżnienie
   * robi ROZMIAR zdjęcia: cokół ma trzy największe, ta siatka najmniejsze.
   *
   * Te same posortowane wiersze co cokół (`standingsRows`), więc kolejność nie może się
   * rozjechać z trzema kartami nad nią.
   */
  function paintField() {
    const box = $('[data-podium-field]');
    const list = $('[data-podium-field-list]');
    const title = $('[data-podium-field-title]');
    if (!box || !list) return;

    // Pierwsza trójka stoi na cokole; ta siatka zaczyna się od czwartego miejsca.
    const rest = standingsRows().slice(3);
    if (!rest.length) {
      box.hidden = true;
      list.replaceChildren();
      return;
    }

    /* Reszta stawki czeka na zdrapkę razem z cokołem.
       `paintField()` biegnie w `paint()` PO `paintPodium()`, więc bez tego warunku odsłaniałby
       miejsca od czwartego w dół nad zakrytym cokołem — a wtedy niespodzianka jest już
       zepsuta: kto zna czwarte miejsce, zna też stawkę, z której zostały trzy nazwy. */
    box.hidden = !scratchRevealed();
    /* Ile tego jest, powiedziane nad listą. Bez tego długość stawki jest niespodzianką po
       przewinięciu — a przy kilkudziesięciu wozach to długie przewijanie. */
    if (title) {
      title.textContent = `${text('voting.restTitle')} · ${rest.length}`;
    }

    /* Ta sama mapa remisów co na cokole. Liczy się ją tu drugi raz, a nie przekazuje z
       paintPodium(), bo obie funkcje są wołane niezależnie z paint() i wiązanie ich jedną
       zmienną znaczyłoby, że kolejność tych dwóch wywołań staje się nagle istotna. */
    const ties = tieNotes(standingsRows());

    /* Ile wierszy jest odsłoniętych. Rośnie przyciskiem, nie przewijaniem: przewijanie
       wewnątrz tabeli dotyczy tego, co JUŻ jest, a doczytywanie jest osobną decyzją. */
    const shown = Math.min(fieldShown, rest.length);

    list.replaceChildren(...rest.slice(0, shown).map((row, index) => {
      const tr = document.createElement('tr');

      const rank = document.createElement('th');
      rank.scope = 'row';
      rank.className = 'podium__table-rank';
      // Numeracja od czwartego, nie od pierwszego wiersza tej tabeli.
      rank.textContent = String(index + 4);

      /* Zdjęcie zostaje, tylko jako miniatura w wierszu. Bez niego tabela jest listą nazw, a
         cała ta strona jest o tym, jak te wozy wyglądają. */
      const who = document.createElement('td');
      who.className = 'podium__table-who';
      const image = document.createElement('img');
      image.src = row.photo || avatarFor(row);
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      const identity = document.createElement('span');
      const project = document.createElement('strong');
      project.textContent = row.projectName || text('voting.noProject');
      const rider = document.createElement('small');
      rider.textContent = `${row.firstName} ${row.lastName}`.trim();
      identity.append(project, rider);
      if (ties.get(row.id)) {
        const tie = document.createElement('em');
        tie.className = 'podium__table-tie';
        tie.textContent = ties.get(row.id);
        identity.append(tie);
      }
      who.append(image, identity);

      /* `data-label` na każdej liczbie: na telefonie tabela rozkłada się na wiersze bez
         nagłówka, a goła liczba nie mówi, czy to punkty, średnia, czy głosy. */
      const points = document.createElement('td');
      points.className = 'podium__table-number podium__table-points';
      points.dataset.label = text('voting.points');
      points.textContent = String(row.totalScore);

      const average = document.createElement('td');
      average.className = 'podium__table-number';
      average.dataset.label = text('voting.avgShort');
      average.textContent = row.voteCount ? row.averageScore.toFixed(1) : '—';

      const votes = document.createElement('td');
      votes.className = 'podium__table-number';
      votes.dataset.label = text('voting.votes');
      votes.textContent = String(row.voteCount || 0);

      tr.append(rank, who, points, average, votes);
      return tr;
    }));

    const more = $('[data-podium-field-more]');
    if (more) {
      const left = rest.length - shown;
      more.hidden = left <= 0;
      const label = $('[data-podium-field-more-label]', more) || more;
      label.textContent = `${text('voting.loadMore')} (${left})`;
    }
  }

  /** Ile wierszy pozostałej stawki jest widocznych. Dziesięć, potem po dziesięć więcej. */
  const FIELD_BATCH = 10;
  let fieldShown = FIELD_BATCH;

  function showMoreField() {
    fieldShown += FIELD_BATCH;
    paintField();
  }

  /**
   * NIEUŻYWANA OD PRZEJŚCIA NA JEDNĄ LISTĘ — zostaje wyłącznie dlatego, że wołają ją dwa
   * nasłuchy niżej, podpięte do przycisków, których w znaczniku już nie ma. Kończy się na
   * pierwszym `return`, bo `[data-podium-standings]` nie istnieje.
   *
   * Do usunięcia razem z nasłuchami i regułami `.standings__*` w voting.css przy następnej
   * zmianie w tym pliku. Zostawione na jedno przejście, nie na zawsze.
   */
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
      /* Średnia dopisywana dopiero od DRUGIEGO głosu. Przy jednym jest co do joty równa sumie
         punktów stojącej obok — „10 punktów · 1 głos · śr. 10.0" podaje tę samą liczbę dwa
         razy i wygląda na usterkę, a nie na wynik. */
      note.textContent = `${text('voting.points')} · ${row.voteCount} ${votesLabel(row.voteCount)}`
        + (row.voteCount > 1 ? ` · ${text('voting.avgShort')} ${row.averageScore.toFixed(1)}` : '');
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

    /* `[data-hero-vote-go]` już nie istnieje: drugi przycisk „zagłosuj" obok tego samego
       przycisku w hero został usunięty ze znacznika. Zostaje przejście na cokół. */
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
    /* Liczone z pełnej stawki, nie z tych trzech wierszy — patrz tieNotes(). Remis trzeciego
       z czwartym jest jedynym, o który ktoś zapyta, a z samej trójki go nie widać. */
    const ties = tieNotes(standingsRows());
    // Kolejność w rysunku to 2, 1, 3 — tak stoi podium. Kolejność w liście to 1, 2, 3, bo
    // czytnik ekranu czyta wynik, nie patrzy na cokół; CSS ustawia je na właściwych schodkach.
    list.replaceChildren(...state.podium.map((row, index) => {
      const item = document.createElement('li');
      item.className = 'podium-card';
      item.dataset.podiumPlace = String(index + 1);

      /* KAFELEK TO SAMO ZDJĘCIE. CAŁY PODPIS LEŻY NA NIM.
         ---------------------------------------------------------------------------
         Było tu białe pudełko z obwódką, w środku zdjęcie, a pod zdjęciem drugie pudełko z
         tekstem. Trzy prostokąty na jednego zwycięzcę, z czego dwa nie niosły nic poza
         własną ramką — a fotografia wozu, jedyna rzecz, na którą tego dnia patrzy plac,
         była najmniejszą z nich.

         Teraz jest jedno zaokrąglone zdjęcie z przyciemnieniem u dołu i napisami na nim.
         Ta sama zasada, co na kafelkach na podstronie głosowania: kto na to patrzy, widzi
         wóz, a nie kartę z wozem w środku. */
      const top = document.createElement('div');
      top.className = 'podium-card__top';

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

      /* Przyciemnienie osobnym elementem, nie tłem figury: leży NAD zdjęciem i POD
         napisami, więc biały tekst trzyma kontrast także na jasnym niebie w kadrze. */
      const scrim = document.createElement('span');
      scrim.className = 'podium-card__scrim';
      scrim.setAttribute('aria-hidden', 'true');
      figure.append(scrim);

      const place = document.createElement('span');
      place.className = 'podium-card__place';
      place.textContent = String(index + 1);
      figure.append(place);

      // Numer startowy w prawym rogu; miejsce na cokole zostaje w lewym.
      const start = document.createElement('span');
      start.className = 'podium-card__start';
      start.textContent = String(row.startNumber).padStart(3, '0');
      figure.append(start);

      const body = document.createElement('figcaption');
      body.className = 'podium-card__body';
      const project = document.createElement('strong');
      project.textContent = row.projectName || text('voting.noProject');
      const rider = document.createElement('span');
      rider.className = 'podium-card__rider';
      rider.textContent = `${row.firstName} ${row.lastName}`.trim();
      const stats = document.createElement('p');
      stats.className = 'podium-card__stats';
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
        ? `${text('voting.points')} · ${row.voteCount} ${votesLabel(row.voteCount)}`
          + (row.voteCount > 1 ? ` · ${text('voting.avgShort')} ${row.averageScore.toFixed(1)}` : '')
        : text('voting.noVotes');
      stats.append(points, count);
      body.append(project, rider, stats);

      /* Remis dostaje własną linijkę pod statystykami, nie plakietkę w rogu: to jest zdanie
         do przeczytania, a nie etykieta do rozpoznania. Stoi tylko na kafelkach, które
         naprawdę z kimś remisują — patrz tieNotes(). */
      if (ties.get(row.id)) {
        const tie = document.createElement('span');
        tie.className = 'podium-card__tie';
        tie.textContent = ties.get(row.id);
        body.append(tie);
      }

      figure.append(body);
      top.append(figure);

      /* Blok cokołu. Wysokość, kolor i opóźnienie animacji bierze z CSS po
         `data-podium-place` na kolumnie — tutaj powstaje tylko element i cyfra w nim, bo
         wysokość stopnia jest decyzją wyglądu, nie danych. */
      const block = document.createElement('div');
      block.className = 'podium-card__block';
      const place2 = document.createElement('b');
      place2.textContent = String(index + 1);
      block.append(place2);

      item.append(top, block);
      return item;
    }));

    /* Ilu ich faktycznie stoi na cokole — dla CSS, nie dla ozdoby.
       ---------------------------------------------------------------------------
       Cokół zaprojektowany jest na trójkę: trzy szerokości, trzy wysokości bloków, złoto
       w środku. Przy jednym uczestniku z głosem zostawała z tego jedna wąska kolumna na
       wysokim złotym słupku — czyli kształt, który obiecuje porównanie, i nie ma z czym.
       Zmierzone na produkcji przy pierwszym prawdziwym głosie.

       Liczba idzie na listę, a nie warunek do JS: to jest decyzja wyglądu i cała mieści się
       w CSS, obok szerokości, które i tak trzeba wtedy zmienić. */
    list.dataset.podiumCount = String(state.podium.length);

    /* Klasa na scenie, nie na rysunku: rysunku SVG już nie ma, a wznoszenie bloków i
       lądowanie kart są animacjami potomków tej scenki. */
    if (!reducedMotion) $('[data-podium-stage]')?.classList.add('is-drawn');
    setupScratch();
  }

  /* ===========================================================================
     ZDRAPKA NAD COKOŁEM
     ===========================================================================
     Wynik był gotowy w chwili zamknięcia głosowania i pojawiał się na ekranie sam — czyli
     największa niespodzianka dnia była kolejną sekcją do przewinięcia. Warstwa zakrywa cokół
     i prosi o jeden ruch palcem.

     Trzy decyzje, które są tu treścią, nie ozdobą:

     ZAPAMIĘTANE. Klucz zawiera rocznik edycji, więc odsłonięcie przeżywa odświeżenie strony i
     powrót następnego dnia, a nowa edycja dostaje własną zdrapkę. Warstwa wracająca po każdym
     wejściu przestaje być niespodzianką i zaczyna być przeszkodą.

     CANVAS, NIE MASKA CSS. Ścieranie palcem to zamalowywanie w `destination-out`, a próg
     „starczy, odsłaniamy resztę" wymaga policzenia przezroczystych pikseli.

     PRZYCISK OBOK. Zdrapywanie nie istnieje na klawiaturze ani w czytniku ekranu, a wynik nie
     może być zdolnością dostępną tylko dla palca. */
  /* Pędzel szeroki i próg niski, żeby cztery ruchy palcem wystarczyły.
     Przy promieniu 26 px i progu 42% zdrapywanie trwało kilkanaście przeciągnięć — a to jest
     niespodzianka, nie zadanie. 64 px to szerokość opuszki na telefonie, 22% odsłoniętej
     powierzchni wypada mniej więcej po czterech przejazdach przez kadr. */
  const SCRATCH_RADIUS = 64;
  const SCRATCH_DONE = 0.22;

  function scratchKey() {
    const when = stamp(state.raceStartsAt) || stamp(state.votingEndsAt);
    const year = when ? new Date(when).getFullYear() : 'current';
    return `carruleddhi.podiumRevealed.${year}`;
  }

  function scratchRevealed() {
    try { return localStorage.getItem(scratchKey()) === '1'; } catch (_) { return true; }
  }

  function rememberReveal() {
    try { localStorage.setItem(scratchKey(), '1'); } catch (_) { /* prywatne okno */ }
  }

  let scratchWired = false;

  function setupScratch() {
    const layer = $('[data-podium-scratch]');
    if (!layer) return;

    // Nie ma czego zakrywać, dopóki cokół jest pusty.
    if (!state.podium.length) {
      layer.hidden = true;
      return;
    }
    if (scratchRevealed()) {
      layer.hidden = true;
      return;
    }

    layer.hidden = false;
    if (scratchWired) return;
    scratchWired = true;

    const canvas = $('[data-podium-scratch-canvas]', layer);
    const context = canvas?.getContext('2d', { willReadFrequently: true }) || null;

    const reveal = () => {
      if (layer.hidden) return;
      layer.hidden = true;
      rememberReveal();
      paintField();
      confetti();
      // Ogłoszone, bo dla czytnika ekranu nic się nie zmieniło poza zniknięciem warstwy.
      toast(text('voting.scratchDone'), 'success');
    };

    $('[data-podium-scratch-reveal]', layer)?.addEventListener('click', reveal);

    /* Bez canvasu zostaje sam przycisk. Zdrapka jest przyjemnością, wynik jest treścią —
       więc brak jednej nie ma prawa zabrać drugiej. */
    if (!context || reducedMotion) return;

    const paintCover = () => {
      const rect = layer.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, '#ffd75e');
      gradient.addColorStop(0.45, '#ff83ae');
      gradient.addColorStop(1, '#8d76ff');
      context.globalCompositeOperation = 'source-over';
      context.fillStyle = gradient;
      context.fillRect(0, 0, canvas.width, canvas.height);
      /* Kropki na wierzchu, żeby powierzchnia wyglądała na zdrapywalną, a nie na kolorowy
         prostokąt: to jedyna podpowiedź, że da się ją w ogóle ruszyć. */
      context.fillStyle = 'rgba(255,255,255,.22)';
      for (let y = 0; y < canvas.height; y += 26 * ratio) {
        for (let x = 0; x < canvas.width; x += 26 * ratio) {
          context.beginPath();
          context.arc(x, y, 3 * ratio, 0, Math.PI * 2);
          context.fill();
        }
      }
      context.globalCompositeOperation = 'destination-out';
      /* PEŁNA KRYCIE PRZED ŚCIERANIEM, I TO JEST CAŁA NAPRAWA ZDRAPKI.
         ---------------------------------------------------------------------------
         `fillStyle` zostawał tu `rgba(255,255,255,.22)` — kolorem kropek malowanych linijkę
         wyżej. W trybie `destination-out` liczy się wyłącznie ALFA pędzla: 0.22 znaczy „zetrzyj
         dwadzieścia dwa procent tego, co tu jest", a nie „zetrzyj". Powłoka więc bladła zamiast
         znikać, a próg niżej liczy piksele o alfie DOKŁADNIE zero — do których taki pędzel
         dochodzi po kilkunastu przejściach po tym samym miejscu.

         Z zewnątrz wyglądało to jak zdrapka, która nie działa: palec jedzie, kolor ledwo
         mętnieje, wynik nie odsłania się nigdy. Kolor jest tu bez znaczenia, alfa musi być 1. */
      context.fillStyle = 'rgba(0,0,0,1)';
    };

    paintCover();
    window.addEventListener('resize', () => { if (!layer.hidden) paintCover(); });

    let scratching = false;
    let checked = 0;

    const erase = (event) => {
      const rect = canvas.getBoundingClientRect();
      const ratio = canvas.width / (rect.width || 1);
      context.beginPath();
      context.arc(
        (event.clientX - rect.left) * ratio,
        (event.clientY - rect.top) * ratio,
        SCRATCH_RADIUS * ratio,
        0,
        Math.PI * 2
      );
      context.fill();

      /* Próg liczony co dwudzieste zamalowanie, nie co ruch palca: `getImageData` na całym
         obrazie przy każdym `pointermove` to jedyna rzecz w tej sekcji, która potrafiłaby
         zająć klatkę. Próbka co czwarty piksel wystarcza do progu 42%. */
      checked += 1;
      // Co szóste zamalowanie, nie co dwudzieste: przy szerokim pędzlu próg wypada tak szybko,
      // że rzadsze sprawdzanie przegapiałoby moment i kazało zdrapywać już odsłonięte miejsca.
      if (checked % 6) return;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let clear = 0;
      for (let at = 3; at < pixels.length; at += 16) {
        if (pixels[at] === 0) clear += 1;
      }
      if (clear / (pixels.length / 16) > SCRATCH_DONE) reveal();
    };

    canvas.addEventListener('pointerdown', (event) => {
      scratching = true;
      canvas.setPointerCapture?.(event.pointerId);
      /* Zaproszenie schodzi z drogi przy pierwszym dotknięciu. Leży NAD powłoką, żeby w ogóle
         było widać, że tu się zdrapuje — ale gdy zdrapywanie się zaczęło, wisi już nad
         odsłanianym zdjęciem i przeszkadza w jedynej rzeczy, po którą tu ktoś przyszedł. */
      layer.classList.add('is-scratching');
      erase(event);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!scratching) return;
      // Bez tego przeglądarka przewija stronę zamiast zdrapywać — na telefonie to cała różnica.
      event.preventDefault();
      erase(event);
    });
    const stop = () => { scratching = false; };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
    canvas.addEventListener('pointerleave', stop);
  }

  /**
   * Konfetti na odsłonięcie wyniku.
   *
   * Własne, bez biblioteki: to trzydzieści rozpędzonych prostokątów, a każda zewnętrzna
   * zależność w tym miejscu to kilkadziesiąt kilobajtów wciągane na stronę, która ma je
   * pokazać raz w roku. Elementy sprzątają się same po animacji, żeby nie zostawić trzydziestu
   * węzłów w drzewie do końca wizyty.
   */
  function confetti() {
    if (reducedMotion) return;
    const host = $('[data-podium-stage]');
    if (!host) return;
    const colors = ['#ffd75e', '#ff83ae', '#8d76ff', '#37c9a5', '#9ad9ff'];
    const box = document.createElement('div');
    box.className = 'podium-confetti';
    box.setAttribute('aria-hidden', 'true');
    for (let piece = 0; piece < 30; piece += 1) {
      const bit = document.createElement('i');
      bit.style.setProperty('--x', `${Math.round(Math.random() * 100)}%`);
      bit.style.setProperty('--tilt', `${Math.round(Math.random() * 260 - 130)}px`);
      bit.style.setProperty('--spin', `${Math.round(Math.random() * 900 - 450)}deg`);
      bit.style.setProperty('--wait', `${(Math.random() * 0.35).toFixed(2)}s`);
      bit.style.background = colors[piece % colors.length];
      box.append(bit);
    }
    host.append(box);
    window.setTimeout(() => box.remove(), 2600);
  }

  /**
   * Reszta stawki jednym zdaniem, drobnym drukiem pod cokołem.
   *
   * Pierwsze pytanie po „kto wygrał" brzmi „a gdzie reszta", i jest zadawane w tej samej
   * sekundzie. Pełna klasyfikacja jest pod przyciskiem niżej, ale jej rozwinięcie to decyzja —
   * a to zdanie odpowiada od razu i nie zabiera miejsca.
   *
   * Bierze te same, już posortowane wiersze co pełna lista (`standingsRows`), więc kolejność
   * nie może się z nią rozjechać. Pokazuje najwyżej sześć pozycji: siedem i więcej to już
   * lista udająca zdanie, a na to jest przycisk.
   */
  const REST_SHOWN = 6;

  /**
   * NIEUŻYWANA. Zastąpiła ją `paintField()`, która pokazuje całą pozostałą stawkę w siatce
   * zamiast sześciu pozycji w jednym zdaniu. `[data-podium-rest]` nie istnieje w znaczniku,
   * więc kończy się na pierwszym `return`. Do usunięcia przy następnej zmianie w tym pliku.
   */
  function paintRest() {
    const box = $('[data-podium-rest]');
    if (!box) return;

    // Pierwsza trójka stoi na cokole; to zdanie zaczyna się od czwartego miejsca.
    const rest = standingsRows().slice(3, 3 + REST_SHOWN);
    if (!rest.length) {
      box.hidden = true;
      box.replaceChildren();
      return;
    }

    box.hidden = false;
    box.replaceChildren(...rest.map((row, index) => {
      const entry = document.createElement('span');
      /* Miejsce liczone od czwartego, a nie od pierwszego wiersza tej listy — inaczej
         czwarty wóz byłby podpisany jedynką. */
      const place = index + 4;
      const who = row.projectName || `${row.firstName} ${row.lastName}`.trim() || text('voting.noProject');
      const score = document.createElement('b');
      score.textContent = String(row.totalScore);
      entry.append(`${place}. ${who} `, score);
      return entry;
    }));
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

    /* Kolejne dziesięć wierszy pozostałej stawki. Przewijanie wewnątrz tabeli pokazuje to, co
       już jest; ten przycisk dokłada więcej — dwie różne czynności, dwa różne elementy. */
    $('[data-podium-field-more]')?.addEventListener('click', showMoreField);

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
