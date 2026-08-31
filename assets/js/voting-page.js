/**
 * Podstrona głosowania: Nagroda publiczności.
 * ===========================================================================
 *
 * JEDNA NAGRODA, JEDEN GŁOS
 *   Publiczność przyznaje własną nagrodę i tylko ją. Dwanaście nagród z sekcji „Dodici modi per
 *   vincere" rozstrzyga jury i stoper — publiczność nie wybiera najszybszego, bo najszybszego
 *   pokazuje pomiar czasu. Kategoria głosu jest stałą po stronie Workera i nie da się jej
 *   podać z przeglądarki; patrz PUBLIC_AWARD w worker/index.js i migracja 0026.
 *
 * DLACZEGO OSOBNA STRONA
 *   Sekcja na stronie głównej stała między licznikiem do dnia wydarzenia, formularzem zapisów i
 *   czternastoma innymi sekcjami. W chwili, w której ktoś głosuje, żadna z tych rzeczy nie jest
 *   już aktualna — wyścig właśnie jedzie. Tu nie ma licznika, „zapisz się" ani „będę tam".
 *
 * TRZY KROKI PRZY POJEŹDZIE, A NIE OKNO NA KLIKNIĘCIE ZDJĘCIA
 *   Zdjęcie nie otwiera niczego. Na kafelku stoi przycisk „Zagłosuj"; po naciśnięciu wyrasta z
 *   niego rząd ocen od 3 do 10 i przycisk potwierdzenia; dopiero potwierdzenie otwiera okno z
 *   adresem. Ocena zostaje przy pojeździe, a okno pojawia się raz — na to, co naprawdę wymaga
 *   pisania.
 *
 * DOCZYTYWANIE PORCJAMI
 *   Kafelki wchodzą po dwanaście. Przy stu uczestnikach pierwsze wejście nie zaczyna się od stu
 *   podpisanych adresów zdjęć naraz. `loading="lazy"` samo nie wystarcza: leniwy obrazek nadal
 *   jest węzłem w drzewie i nadal ma swój układ do policzenia.
 */
import {
  $, $$, demoMode, text, toast, stamp, remaining,
  deviceId, savedVoter, rememberVoter, readState, paintDemoBar, avatarFor, votesLabel, tieNotes
} from './voting-core.js';

(function () {
  'use strict';

  /** Ile kafelków wchodzi w jednej porcji. */
  const BATCH = 12;

  const state = {
    phase: 'scheduled',
    /** Termin startu i koniec okna — dla zegara w pasku na górze strony. */
    raceStartsAt: null,
    votingEndsAt: null,
    scoreMin: 3,
    scoreMax: 10,
    categories: [],
    participants: [],
    /** Mój głos albo `null`. Jeden na urządzenie, na cały konkurs. */
    myVote: null,
    /** Filtr kategorii pojazdu. Pusty znaczy „wszystkie". */
    category: '',
    /** Szukana fraza: numer startowy, nazwa wózka, imię, nazwisko albo kategoria. */
    query: '',
    /** Ile kafelków jest już narysowanych. */
    shown: BATCH,
    editions: [],
    selectedEdition: null,
    requestedEdition: new URLSearchParams(location.search).get('edition') || '',
    isArchive: false,
    loaded: false
  };

  let demoPhase = 'voting';
  let demoDriven = false;

  const api = () => window.CARRULEDDHI_API || null;
  const config = () => window.CARRULEDDHI_ACTIVE_CONFIG || null;

  const participantById = (id) => state.participants.find((row) => row.id === id) || null;
  const riderName = (row) => `${row.firstName} ${row.lastName}`.trim();
  const cartLabel = (row) => row.projectName || text('voting.noProject');
  const startBadge = (row) => String(row.startNumber).padStart(3, '0');

  /**
   * Samo imię na plakietce — a nazwisko dopiero wtedy, gdy imię przestaje wystarczać.
   * ---------------------------------------------------------------------------
   * Na kafelku liczy się nazwa pojazdu; imię jest podpisem, kto go zbudował, i „Claudio"
   * czyta się szybciej niż „Claudio Taras". Ale w wiosce, w której startuje kilkadziesiąt
   * wozów, dwóch Salvatore to sytuacja normalna, a dwie identyczne plakietki znaczą, że
   * głosujący nie wie, na kogo patrzy.
   *
   * Dokładany jest więc NAJKRÓTSZY przedrostek nazwiska, który rozróżnia tych, co dzielą imię.
   * Jedna litera dla „Salvatore Mannu" i „Salvatore Pinna"; przy „Taras" i „Tarantino" jedna
   * litera nie wystarcza, więc rośnie do „Taras" i „Taran" — dopiero to są dwie różne
   * plakietki. Stały przedrostek jednoliterowy dawałby dwa razy „Salvatore T." i wyglądałby
   * na działający dokładnie do dnia, w którym przestaje.
   *
   * Liczone raz na przerysowanie listy, nie raz na kafelek: to jest porównanie każdego z
   * każdym w obrębie imienia, a lista bywa kilkudziesięcioelementowa.
   */
  function nameBadges(rows) {
    const byFirst = new Map();
    rows.forEach((row) => {
      const key = String(row.firstName || '').trim().toLowerCase();
      if (!byFirst.has(key)) byFirst.set(key, []);
      byFirst.get(key).push(row);
    });

    const badges = new Map();
    byFirst.forEach((group) => {
      const first = String(group[0].firstName || '').trim();
      if (group.length === 1) {
        badges.set(group[0].id, first);
        return;
      }
      const surnames = group.map((row) => String(row.lastName || '').trim());
      const longest = Math.max(...surnames.map((name) => name.length));
      /* Rośnie, dopóki którekolwiek dwa nazwiska w grupie dają ten sam przedrostek. */
      let cut = 1;
      while (cut < longest) {
        const seen = surnames.map((name) => name.slice(0, cut).toLowerCase());
        if (new Set(seen).size === seen.length) break;
        cut += 1;
      }
      group.forEach((row, index) => {
        const surname = surnames[index];
        /* Kropka tylko wtedy, gdy nazwisko zostało faktycznie skrócone — „Salvatore Mannu."
           z kropką po pełnym nazwisku wygląda na literówkę. */
        const short = surname.slice(0, cut);
        badges.set(row.id, surname
          ? `${first} ${short}${short.length < surname.length ? '.' : ''}`
          : first);
      });
    });
    return badges;
  }

  /** Wypełniane przy każdym przerysowaniu siatki — patrz paintGrid(). */
  let badgeByParticipant = new Map();

  /**
   * Narysowane kafelki, po identyfikatorze uczestnika: `id -> { key, node }`.
   * `key` to odcisk wszystkiego, co kafelek pokazuje — patrz paintGrid().
   */
  let cardCache = new Map();

  /* ---------------------------------------------------------------------------- odczyt */

  /**
   * Adresy zdjęć, które już raz przyszły — klucz to identyfikator uczestnika.
   *
   * TO JEST PIERWSZA POŁOWA NAPRAWY MIGOTANIA ZDJĘĆ.
   * ---------------------------------------------------------------------------
   * Zdjęcia leżą w prywatnym buckecie i Worker podaje je jako adresy podpisane na godzinę
   * (`signPhotos`, `expiresIn: 3600`). Podpis to token z własnym znacznikiem czasu, więc ten
   * sam plik dostaje INNY adres przy każdym odczycie — a odczyt chodzi co trzydzieści sekund.
   * Dla przeglądarki nowy adres to nowy obrazek: pobiera go od zera, a przez ten czas kafelek
   * jest pusty. Stąd zgłoszenie „zdjęcia co chwilę się przeładowują".
   *
   * Adres raz zapamiętany zostaje więc użyty ponownie, dopóki trwa ta wizyta. Podpis żyje
   * godzinę, a strona głosowania jest otwarta przez kilkanaście minut wyścigu, więc nie ma
   * praktycznej możliwości, żeby wygasł na oczach patrzącego.
   *
   * Nowy adres wchodzi tylko wtedy, gdy poprzedniego nie było — czyli gdy organizator dopiero
   * teraz wgrał zdjęcie. Wtedy zmiana JEST pożądana i ma się pokazać.
   */
  const photoById = new Map();

  /** Identyfikatory znane z poprzedniego odczytu — po nich poznajemy nowego uczestnika. */
  let knownIds = null;
  /** Świeżo dopisani, wyróżnieni animacją wejścia na kilka sekund. */
  let freshIds = new Set();
  let freshTimer = 0;

  function absorb(result) {
    const mine = Array.isArray(result.myVotes) ? result.myVotes[0] : null;
    const incoming = Array.isArray(result.participants) ? result.participants : [];
    const nextEditionKey = result.selectedEdition?.key || '';
    if (state.selectedEdition?.key !== nextEditionKey) {
      knownIds = null;
      freshIds = new Set();
      cardCache = new Map();
      state.shown = BATCH;
    }

    /* Adres zdjęcia przepisywany z pamięci, jeśli już go mamy. Podmieniany jest obiekt
       uczestnika, a nie tablica w miejscu: `state.participants` jest czytane w kilku miejscach
       i mutowanie cudzego wiersza w trakcie rysowania byłoby zmianą pod ręką. */
    const participants = incoming.map((row) => {
      const remembered = photoById.get(row.id);
      if (row.photo && !remembered) photoById.set(row.id, row.photo);
      return remembered ? { ...row, photo: remembered } : row;
    });

    /* Nowy uczestnik rozpoznany z RÓŻNICY zbiorów identyfikatorów, a nie z odpowiedzi na
       zapis: ten sam sposób łapie też wóz dopisany w panelu z drugiego urządzenia w trakcie
       odpytywania. Przy pierwszym odczycie `knownIds` jest `null`, więc cała stawka nie jest
       „nowa" — inaczej pierwsze wejście animowałoby kilkadziesiąt kafelków naraz. */
    const ids = new Set(participants.map((row) => row.id));
    if (knownIds) {
      const added = [...ids].filter((id) => !knownIds.has(id));
      if (added.length) {
        freshIds = new Set(added);
        window.clearTimeout(freshTimer);
        freshTimer = window.setTimeout(() => { freshIds = new Set(); paintGrid(); }, 6000);
      }
    }
    knownIds = ids;

    Object.assign(state, {
      phase: result.phase,
      raceStartsAt: result.raceStartsAt || null,
      votingEndsAt: result.votingEndsAt || null,
      scoreMin: Number(result.scoreMin) || 3,
      scoreMax: Number(result.scoreMax) || 10,
      categories: Array.isArray(result.categories) ? result.categories : [],
      participants,
      editions: Array.isArray(result.editions) ? result.editions : [],
      selectedEdition: result.selectedEdition || null,
      isArchive: Boolean(result.isArchive),
      myVote: mine
        ? {
          participantId: mine.participantId,
          score: mine.score,
          /* Ile zmian jeszcze zostało. Limit to jedna i pilnuje go baza — patrz `edit_count`
             w migracji 0030. Tutaj służy do tego, żeby nie pokazywać przycisku, który i tak
             dostanie odmowę: zaproszenie do czynności zakończonej błędem jest gorsze niż
             brak zaproszenia. */
          editsLeft: mine.editsLeft === undefined ? 1 : Number(mine.editsLeft) || 0,
          /* Czy ten głos wolno w ogóle zmieniać. Wymaga imienia i adresu — patrz `votingEdit`
             w Workerze. Anonimowy głos jest ostateczny i strona ma to powiedzieć wprost,
             zamiast pokazywać przycisk, który dostanie odmowę. */
          identified: Boolean(mine.identified),
          canChange: mine.canChange === undefined
            ? Boolean(mine.identified)
            : Boolean(mine.canChange)
        }
        : null,
      loaded: true
    });
    if (state.category && !state.categories.includes(state.category)) state.category = '';
    paint();
  }

  async function pull() {
    const result = await readState(demoPhase, state.requestedEdition);
    if (!result) {
      paintPhase();
      return;
    }
    demoDriven = Boolean(result.demo);
    absorb(result);
    if (demoMode) {
      paintDemoBar({
        phase: () => demoPhase,
        onPhase: (phase) => { demoPhase = phase; pull(); }
      });
    }
  }

  /* -------------------------------------------------------------------------- rysowanie */

  function paintEditions() {
    const section = $('[data-vote-editions]');
    const select = $('[data-vote-edition]');
    const meta = $('[data-vote-edition-meta]');
    if (!section || !select) return;
    section.hidden = state.editions.length < 2;
    const options = state.editions.map((edition) => {
      const option = document.createElement('option');
      option.value = edition.key;
      option.textContent = `${edition.name} · ${edition.key}`;
      option.selected = edition.key === state.selectedEdition?.key;
      return option;
    });
    select.replaceChildren(...options);
    const edition = state.selectedEdition;
    if (meta && edition) {
      let date = edition.date;
      try {
        date = new Intl.DateTimeFormat(document.documentElement.lang || 'it', {
          day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome'
        }).format(new Date(edition.date));
      } catch (_) { /* raw ISO is still understandable */ }
      meta.textContent = `${state.isArchive ? text('voting.editionArchive') : text('voting.editionCurrent')} · ${date} · ${edition.location}`;
    }
  }

  function paint() {
    paintEditions();
    paintPhase();
    paintMyVote();
    paintSearch();
    paintFilters();
    paintResults();
    paintGrid();
  }

  /**
   * Pole szukania i licznik trafień.
   *
   * Ukryte, gdy stawka jest krótsza niż osiem pozycji: przy sześciu wózkach szuka się wzrokiem,
   * a pole nad listą byłoby wtedy tylko elementem do zignorowania. Znika też po zamknięciu
   * głosowania, bo wynik ma wtedy własny widok — podium i pełną tabelę.
   */
  function paintSearch() {
    const box = $('[data-vote-search]');
    const input = $('[data-vote-query]');
    const clear = $('[data-vote-query-clear]');
    const count = $('[data-vote-count]');
    const usable = state.loaded && state.phase !== 'closed' && state.participants.length >= 8;

    if (box) box.hidden = !usable;
    if (clear) clear.hidden = !state.query;
    if (input && input.value !== state.query) input.value = state.query;

    if (count) {
      const shown = rows().length;
      const filtering = Boolean(state.query || state.category);
      count.hidden = !usable || !filtering;
      count.textContent = shown
        ? `${shown} / ${state.participants.length}`
        : text('voting.searchEmpty');
    }
  }

  function paintPhase() {
    const open = state.phase === 'voting';
    const closed = state.phase === 'closed';

    const shell = $('[data-vote-shell]');
    if (shell) {
      /* Powłoka odsłonięta także PRZED pierwszym odczytem, żeby było gdzie pokazać szkielet.
         Wcześniej warunek brzmiał „otwarte albo zamknięte", więc przez cały czas oczekiwania na
         odpowiedź strona była pusta — a to jest ten moment, w którym ktoś zamyka kartę. Po
         odczycie warunek wraca do swojego: powłoki nie ma, gdy głosowanie jeszcze nie ruszyło. */
      shell.hidden = state.loaded && !(open || closed);
      shell.classList.toggle('is-closed', closed);
    }

    const openContent = $('[data-vote-open-content]');
    if (openContent) openContent.hidden = closed;
    const results = $('[data-vote-results]');
    if (results) results.hidden = !closed;

    const notice = $('[data-vote-notice]');
    if (notice) {
      // Przed pierwszym odczytem nie wiadomo jeszcze, czy głosowanie jest zamknięte — a zdanie
      // „jeszcze nie otwarte" postawione zawczasu bywałoby nieprawdą przez dwie sekundy.
      notice.hidden = !state.loaded || open || closed;
      notice.textContent = state.loaded || demoDriven ? text('voting.notOpenYet') : '';
    }

    // Nagłówek mówi co innego, gdy głosowanie się skończyło: wtedy to jest wynik, nie zaproszenie.
    const kicker = $('[data-vote-kicker]');
    if (kicker) kicker.textContent = text(closed ? 'voting.resultsKicker' : 'voting.pageKicker');
    const lead = $('[data-vote-lead]');
    if (lead) lead.textContent = text(closed ? 'voting.resultsLead' : 'voting.pageLead');

    /* Plakietki `[data-vote-rule]` już nie ma — reguła stoi w akapicie nagłówka i w oknie
       oceny. Zostaje zegar, który jest jedyną liczbą pilną w tej fazie. */
    paintTimer();
  }

  /**
   * Zegar w pasku na samej górze strony.
   *
   * Trzy stany, bo trzy różne pytania: przed startem „ile do startu", w trakcie „ile mam czasu
   * na głos", po zamknięciu „koniec". Tyka co sekundę tylko wtedy, gdy jest co pokazywać —
   * przy zamkniętym głosowaniu licznik sekundowy nie ma czego odliczać, więc go nie ma.
   */
  function paintTimer() {
    const box = $('[data-vote-timer]');
    if (!box) return;
    const label = $('[data-vote-timer-label]', box);
    const time = $('[data-vote-timer-time]', box);
    if (!state.loaded) {
      box.hidden = true;
      return;
    }

    box.hidden = false;
    box.dataset.phase = state.phase;

    if (state.phase === 'closed') {
      if (label) label.textContent = text('voting.resultsKicker');
      if (time) time.textContent = text('voting.closed');
      return;
    }

    const target = state.phase === 'voting' ? stamp(state.votingEndsAt) : stamp(state.raceStartsAt);
    const left = target ? target - Date.now() : 0;
    if (!target || left <= 0) {
      if (label) label.textContent = text('voting.pageKicker');
      if (time) time.textContent = text(state.phase === 'voting' ? 'voting.openNoLimit' : 'voting.notOpenYet');
      return;
    }
    if (label) label.textContent = text(state.phase === 'voting' ? 'voting.timeLeft' : 'voting.startsIn');
    if (time) time.textContent = remaining(left);
  }

  /**
   * Panel „Twój głos" nad listą.
   *
   * Bez niego jedyną informacją o oddanym głosie była plakietka na jednym z osiemnastu
   * kafelków — czyli trzeba było go najpierw znaleźć. Głos jest jeden na cały konkurs, więc
   * odpowiedź na „czy ja już głosowałem" należy na górę strony, a nie do siatki.
   */
  function paintMyVote() {
    const panel = $('[data-vote-mine]');
    if (!panel) return;
    const mine = state.myVote;
    const row = mine ? participantById(mine.participantId) : null;

    panel.hidden = !mine;
    if (!mine) return;

    const photo = $('[data-vote-mine-photo]', panel);
    if (photo) {
      const src = row?.photo || '';
      photo.hidden = !src;
      if (src) {
        photo.src = src;
        photo.alt = row ? cartLabel(row) : '';
      }
    }
    const blank = $('[data-vote-mine-blank]', panel);
    if (blank) {
      blank.hidden = Boolean(row?.photo);
      blank.textContent = row ? startBadge(row) : '—';
    }
    $('[data-vote-mine-cart]', panel).textContent = row ? cartLabel(row) : '';
    $('[data-vote-mine-rider]', panel).textContent = row
      ? `${riderName(row)} · ${startBadge(row)}`
      : '';
    $('[data-vote-mine-score]', panel).textContent = String(mine.score);
    /* Zmiana jest możliwa na miejscu — i to zdanie musiało się zmienić razem z tym.
       Stało tu „zmianę zrobisz odsyłaczem z maila", co było prawdą, dopóki żeton był jedyną
       drogą. Od teraz z tego urządzenia wystarczy przycisk na kafelku, a mail zostaje drogą z
       każdego innego. Zdanie mówi jedno i drugie, bo obie sytuacje się zdarzają: głosowanie z
       telefonu na placu i poprawianie wieczorem z laptopa. */
    const note = $('[data-vote-mine-note]', panel);
    if (note) {
      note.hidden = state.phase !== 'voting';
      // Jedna zmiana na głos: dopóki jest niezużyta, zdanie mówi jak jej użyć; potem mówi,
      // że została już wykorzystana. Zgadywanie, dlaczego przycisk zniknął, nie jest potrzebne.
      /* Trzy stany, trzy zdania: zmiana możliwa, zmiana zużyta, głos anonimowy i ostateczny.
         Zgadywanie, dlaczego przycisk zniknął, nie jest częścią głosowania. */
      note.textContent = text(
        mine.canChange ? 'voting.changeHere'
          : mine.identified ? 'voting.editUsedMine'
            : 'voting.editNeedsContact'
      );
    }
  }

  /**
   * Filtr kategorii pojazdu: Wszystkie / Classic / ART.
   *
   * To NIE są kategorie głosowania — głos jest jeden. To sposób na znalezienie pojazdu w
   * liście, która w dniu zawodów ma kilkadziesiąt pozycji. Ukrywany, gdy kategoria jest jedna:
   * filtr z jednym przyciskiem to element do kliknięcia, który nic nie zmienia.
   */
  function paintFilters() {
    const wrap = $('[data-vote-filters]');
    if (!wrap) return;
    wrap.hidden = state.categories.length < 2;
    if (wrap.hidden) return;

    const make = (value, label) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'vote-filter';
      button.dataset.voteFilter = value;
      button.textContent = label;
      const active = value === state.category;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
      button.addEventListener('click', () => {
        state.category = value;
        state.shown = BATCH;
        paintFilters();
        paintGrid();
      });
      return button;
    };

    wrap.replaceChildren(
      make('', text('voting.allCategories')),
      ...state.categories.map((category) => make(category, category))
    );
  }

  function standingsRows() {
    return [...state.participants].sort((a, b) =>
      b.totalScore - a.totalScore ||
      b.voteCount - a.voteCount ||
      b.averageScore - a.averageScore ||
      a.startNumber - b.startNumber);
  }

  /**
   * Remisy punktowe w bieżącej klasyfikacji, po `id`.
   *
   * Ta sama funkcja co na stronie głównej — mieszka w voting-core.js właśnie dlatego, że
   * odpowiada tu i tam na to samo pytanie, a dwie kopie tej reguły to dwa miejsca, w których
   * cokół i tabela mogą zacząć tłumaczyć ten sam remis inaczej.
   *
   * Liczone z PEŁNEJ posortowanej stawki, nie z widocznej porcji ani z samej trójki: remis,
   * o który ktoś zapyta, wypada na granicy podium.
   */
  function closedTies() {
    return state.phase === 'closed' ? tieNotes(standingsRows()) : new Map();
  }

  /**
   * Widoczna stawka: filtr kategorii i szukana fraza.
   *
   * Numer dopasowywany na dwa sposoby, bo tak go ludzie wpisują: „7" i „007" mają znaleźć ten
   * sam wózek. Reszta to zwykłe zawieranie tekstu bez rozróżniania wielkości liter i bez
   * znaków diakrytycznych — „Nino" ma znaleźć „Niño", bo na placu nikt nie przełącza
   * klawiatury, żeby wpisać nazwisko.
   */
  const fold = (value) => String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  function matchesQuery(row) {
    const needle = fold(state.query);
    if (!needle) return true;
    const number = String(row.startNumber || '');
    const haystack = [
      row.projectName, row.firstName, row.lastName, row.category,
      number, number.padStart(3, '0')
    ].map(fold);
    return haystack.some((value) => value.includes(needle));
  }

  function rows() {
    return state.participants
      .filter((row) => !state.category || row.category === state.category)
      .filter(matchesQuery);
  }

  function formattedAverage(row) {
    if (!row.voteCount) return '—';
    return new Intl.NumberFormat(document.documentElement.lang || 'it', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(row.averageScore) || 0);
  }

  /** Osobny finał: podium i pełna tabela istnieją wyłącznie po zamknięciu głosowania. */
  function paintResults() {
    const section = $('[data-vote-results]');
    const podium = $('[data-vote-podium]');
    const standings = $('[data-vote-standings]');
    if (!section || !podium || !standings) return;

    const closed = state.loaded && state.phase === 'closed';
    section.hidden = !closed;
    if (!closed) {
      podium.replaceChildren();
      standings.replaceChildren();
      return;
    }

    const ranked = standingsRows();
    const ties = closedTies();
    const podiumRows = ranked.filter((row) => row.voteCount > 0).slice(0, 3);
    const podiumNodes = podiumRows.map((row, index) => {
      const place = index + 1;
      const item = document.createElement('li');
      item.className = 'vote-podium__item';
      item.dataset.place = String(place);

      const winner = document.createElement('article');
      winner.className = 'vote-podium__winner';
      const photo = document.createElement('figure');
      photo.className = 'vote-podium__photo';
      const image = document.createElement('img');
      image.src = row.photo || avatarFor(row);
      image.alt = cartLabel(row);
      image.loading = 'eager';
      image.decoding = 'async';
      const medal = document.createElement('span');
      medal.className = 'vote-podium__medal';
      medal.textContent = String(place);
      medal.setAttribute('aria-hidden', 'true');
      photo.append(image, medal);

      const copy = document.createElement('div');
      copy.className = 'vote-podium__copy';
      const title = document.createElement('strong');
      title.textContent = cartLabel(row);
      const rider = document.createElement('span');
      rider.textContent = `${riderName(row)} · ${startBadge(row)}`;
      const score = document.createElement('p');
      const points = document.createElement('b');
      points.textContent = row.voteCount ? String(row.totalScore) : '—';
      const scoreLabel = document.createElement('small');
      scoreLabel.textContent = row.voteCount
        ? `${text('voting.points')} · ${row.voteCount} ${votesLabel(row.voteCount)}`
        : text('voting.noVotes');
      score.append(points, scoreLabel);
      copy.append(title, rider, score);

      const tie = ties.get(row.id);
      if (tie) {
        const chip = document.createElement('span');
        chip.className = 'vote-podium__tie';
        chip.textContent = tie;
        copy.append(chip);
      }
      winner.append(photo, copy);

      const step = document.createElement('div');
      step.className = 'vote-podium__step';
      step.setAttribute('aria-hidden', 'true');
      const numeral = document.createElement('b');
      numeral.textContent = String(place);
      step.append(numeral);
      item.append(winner, step);
      return item;
    });
    if (!podiumNodes.length) {
      const empty = document.createElement('li');
      empty.className = 'vote-podium__empty';
      empty.textContent = text('voting.noVotes');
      podiumNodes.push(empty);
    }
    podium.replaceChildren(...podiumNodes);

    const tableRows = ranked.map((row, index) => {
      const tr = document.createElement('tr');
      if (row.voteCount > 0 && index < 3) tr.dataset.place = String(index + 1);

      const rank = document.createElement('th');
      rank.scope = 'row';
      rank.className = 'vote-standings__rank';
      rank.textContent = String(index + 1);

      const who = document.createElement('td');
      who.className = 'vote-standings__who';
      const image = document.createElement('img');
      image.src = row.photo || avatarFor(row);
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      const identity = document.createElement('span');
      const cart = document.createElement('strong');
      cart.textContent = cartLabel(row);
      const rider = document.createElement('small');
      rider.textContent = `${riderName(row)} · ${row.category} · ${startBadge(row)}`;
      identity.append(cart, rider);
      who.append(image, identity);

      const points = document.createElement('td');
      points.className = 'vote-standings__number vote-standings__points';
      points.dataset.label = text('voting.points');
      points.textContent = row.voteCount ? String(row.totalScore) : '—';
      const average = document.createElement('td');
      average.className = 'vote-standings__number';
      average.dataset.label = text('voting.avgShort');
      average.textContent = formattedAverage(row);
      const votes = document.createElement('td');
      votes.className = 'vote-standings__number';
      votes.dataset.label = text('voting.votes');
      votes.textContent = String(row.voteCount || 0);
      tr.append(rank, who, points, average, votes);
      return tr;
    });
    standings.replaceChildren(...tableRows);
  }

  /**
   * Szkielet: sześć kafelków w kształcie tych prawdziwych, dopóki nie ma danych.
   *
   * Bez tego pierwsze wejście i zerwany odczyt wyglądały identycznie — jak pusta strona. A
   * pierwsze wejście zdarza się w dniu wyścigu, na telefonie, na sieci obciążonej przez cały
   * plac: te dwie sekundy pustki są dokładnie tym momentem, w którym ktoś zamyka kartę.
   *
   * Sześć, nie dwanaście: szkielet ma powiedzieć „to się wczytuje", a nie udawać zawartości.
   * `aria-hidden`, bo czytnikowi ekranu mówi to `aria-busy` na siatce — sześć pustych kafelków
   * odczytanych na głos jest szumem.
   */
  const SKELETON_TILES = 6;

  function paintSkeleton(grid) {
    grid.setAttribute('aria-busy', 'true');
    grid.replaceChildren(...Array.from({ length: SKELETON_TILES }, () => {
      const tile = document.createElement('div');
      tile.className = 'vote-card vote-card--skeleton';
      tile.setAttribute('aria-hidden', 'true');
      const photo = document.createElement('span');
      photo.className = 'vote-card__photo';
      const line = document.createElement('span');
      line.className = 'vote-skeleton__line';
      const short = document.createElement('span');
      short.className = 'vote-skeleton__line vote-skeleton__line--short';
      tile.append(photo, line, short);
      return tile;
    }));
  }

  function paintGrid() {
    const grid = $('[data-vote-grid]');
    const empty = $('[data-vote-empty]');
    if (!grid) return;

    /* Dopóki pierwszy odczyt nie wrócił, nie ma czym rysować siatki ani czym twierdzić, że
       jest pusta — „lista nie jest jeszcze opublikowana" przy nieudanym odczycie byłoby
       zdaniem nieprawdziwym. */
    if (!state.loaded) {
      if (empty) empty.hidden = true;
      paintSkeleton(grid);
      return;
    }
    grid.removeAttribute('aria-busy');

    /* Po zamknięciu nie budujemy równolegle ukrytej siatki kart. Wynik ma jeden widok:
       podium i pełną tabelę, a ta gałąź dodatkowo gwarantuje, że ranking nie istnieje w DOM
       przed fazą `closed`. */
    if (state.phase === 'closed') {
      grid.replaceChildren();
      if (empty) empty.hidden = true;
      paintMore(0);
      return;
    }

    const all = rows();
    if (empty) empty.hidden = all.length > 0;

    /* Plakietki liczone z CAŁEJ stawki, nie z widocznej porcji: gdyby liczyć z dwunastu
       narysowanych, trzynasty Salvatore doczytany przyciskiem „pokaż więcej" zmieniłby
       podpisy pod kafelkami, które już stoją na ekranie. */
    badgeByParticipant = nameBadges(state.participants);

    const closed = state.phase === 'closed';

    /* DRUGA POŁOWA NAPRAWY MIGOTANIA: kafelek, który się nie zmienił, nie jest budowany od nowa.
       ---------------------------------------------------------------------------
       `replaceChildren` z nowymi węzłami znaczyło nowy `<img>` co trzydzieści sekund — a nowy
       element pobiera obrazek nawet wtedy, gdy adres jest ten sam, bo nie ma jeszcze czego
       ponownie użyć. Stabilny adres (patrz `photoById`) załatwia połowę sprawy; ta druga połowa
       to nietykanie węzła, dopóki nie ma po co.

       Klucz obejmuje wszystko, co kafelek rysuje. Cokolwiek się zmieni — wynik, plakietka,
       miejsce w rankingu, mój głos — klucz się różni i kafelek powstaje na nowo. Gdy nic się
       nie zmieniło, do siatki wraca ten sam węzeł, razem z już wczytanym zdjęciem. */
    const cache = cardCache;
    const next = new Map();
    const nodes = all.slice(0, state.shown).map((row, index) => {
      const rank = closed ? index + 1 : 0;
      const mine = state.myVote;
      const key = [
        row.photo, row.voteCount, row.totalScore, row.averageScore,
        rank, badgeByParticipant.get(row.id) || '',
        /* CAŁY mój głos, nie tylko „czy to mój kafelek".
           ---------------------------------------------------------------------------
           Stało tu `mine.participantId === row.id ? 'mine:'+score : ''`, czyli dla CUDZYCH
           kafelków klucz był pustym napisem i przed oddaniem głosu, i po. A one też się wtedy
           zmieniają: przycisk przechodzi z „zagłosuj" na „przenieś tu swój głos", pytanie na
           „przenieść Twój głos na…", a suwak startuje od oceny już oddanej.

           Zmierzone: po oddaniu głosu sąsiednie kafelki nadal mówiły „Zagłosuj", a suwak
           wracał do środka skali — bo z cache'u wracał węzeł zbudowany, gdy głosu nie było.

           Cały głos w kluczu znaczy, że zmiana czegokolwiek w nim przebudowuje KAŻDY kafelek.
           Kosztuje to jedno przerysowanie siatki na oddany głos, czyli raz na wizytę. */
        mine ? `vote:${mine.participantId}:${mine.score}:${mine.canChange ? 'open' : 'final'}` : 'novote',
        state.phase, freshIds.has(row.id) ? 'fresh' : ''
      ].join('|');

      const previous = cache.get(row.id);
      const node = previous && previous.key === key ? previous.node : card(row, rank);
      next.set(row.id, { key, node });
      return node;
    });
    cardCache = next;

    grid.replaceChildren(...nodes);
    paintMore(all.length);
  }

  /**
   * „Pokaż więcej" plus czujka doczytująca sama.
   *
   * Oba, nie jedno: czujka jest wygodniejsza, ale IntersectionObserver nie odpali, gdy ktoś
   * skoczy na koniec strony klawiszem End albo gdy przeglądarka go nie ma. Przycisk jest tym,
   * co działa zawsze; czujka tym, co sprawia, że przycisku zwykle nie trzeba nacisnąć.
   */
  let watcher = null;
  function paintMore(total) {
    const more = $('[data-vote-more]');
    const sentinel = $('[data-vote-sentinel]');
    const left = Math.max(0, total - state.shown);

    if (more) {
      more.hidden = left === 0;
      const label = $('[data-vote-more-label]', more) || more;
      label.textContent = `${text('voting.loadMore')} (${left})`;
    }
    if (sentinel) sentinel.hidden = left === 0;

    if (!sentinel || !window.IntersectionObserver) return;
    if (watcher) watcher.disconnect();
    if (left === 0) return;
    watcher = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) showMore();
    }, { rootMargin: '400px 0px' });
    watcher.observe(sentinel);
  }

  function showMore() {
    const total = rows().length;
    if (state.shown >= total) return;
    state.shown = Math.min(total, state.shown + BATCH);
    paintGrid();
  }

  /* ----------------------------------------------------------------------------- kafelek */

  function card(row, rank) {
    const mine = state.myVote;
    const isMine = mine && mine.participantId === row.id;

    const article = document.createElement('article');
    article.className = 'vote-card';
    article.dataset.participant = row.id;
    if (isMine) article.classList.add('is-voted');
    if (rank && rank <= 3) article.classList.add(`is-place-${rank}`);
    /* Nowy wóz wjeżdża, a nie pojawia się.
       Kafelek dopisany w panelu w trakcie wyścigu doszedłby inaczej bez śladu — siatka
       przeskakuje, bo doszedł jeden element, i trzeba go odnaleźć wzrokiem między
       kilkudziesięcioma innymi. Klasa gaśnie po sześciu sekundach; patrz `freshIds`. */
    if (freshIds.has(row.id)) {
      article.classList.add('is-fresh');
      const magic = document.createElement('span');
      magic.className = 'vote-card__magic';
      magic.setAttribute('aria-hidden', 'true');
      const wand = document.createElement('b');
      wand.textContent = '🪄';
      const label = document.createElement('span');
      const newLabel = { it: 'NUOVO', pl: 'NOWY', en: 'NEW', de: 'NEU', es: 'NUEVO', fr: 'NOUVEAU' };
      label.textContent = newLabel[document.documentElement.lang] || newLabel.it;
      magic.append(wand);
      for (let spark = 0; spark < 6; spark += 1) {
        const star = document.createElement('i');
        star.style.setProperty('--spark', String(spark));
        magic.append(star);
      }
      magic.append(label);
      article.append(magic);
    }

    /* CAŁE zdjęcie jest teraz celem dotknięcia.
       ---------------------------------------------------------------------------
       Wcześniej stała tu reguła odwrotna — „klik w zdjęcie nie ma otwierać okna" — i osobny
       przycisk pod kafelkiem. Zmienione na wyraźną prośbę: na telefonie zdjęcie jest wielkim
       celem, a przycisk pod nim małym, więc naturalny ruch kciuka trafiał w miejsce, które
       nic nie robiło. Zdjęcie prowadzi teraz do pytania „zagłosować na ten wóz?", a nie do
       wysłania głosu — potwierdzenie zostaje osobnym krokiem.

       `button`, a nie `div` z obsługą kliknięcia: dostaje fokus, reaguje na spację i enter i
       ogłasza się czytnikowi jako czynność, bez ani jednego atrybutu ARIA. */
    const figure = document.createElement('figure');
    figure.className = 'vote-card__photo';

    const image = document.createElement('img');
    /* Brak zdjęcia dostaje rysowany kafelek z numerem — ten sam awatar co na cokole strony
       głównej, więc ten sam wóz wygląda tak samo w obu miejscach. Wcześniej był tu goły numer
       na jednolitym tle, na którym przyciemnienie i podpis nie miały się na czym położyć. */
    image.src = row.photo || avatarFor(row);
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    /* SZKIELET, DOPÓKI ZDJĘCIE SIĘ NIE WCZYTA.
       ---------------------------------------------------------------------------
       Zdjęcia wózków to fotografie z telefonu, podpisane adresy z prywatnego bucketa, wczytywane
       w dniu zjazdu na sieci obciążonej przez cały plac. Do tej pory na ich miejscu stał
       ciemny prostokąt — nieodróżnialny od kafelka, który się nie wczytał. Teraz w tym miejscu
       przesuwa się połysk, a klasa schodzi po `load` albo po `error`, więc zepsuty adres nie
       zostawia migającego szkieletu na zawsze.

       `complete` sprawdzane od razu: obrazek z pamięci przeglądarki bywa gotowy, zanim zdąży
       się podpiąć nasłuch, i wtedy `load` już nie przyjdzie. */
    figure.classList.add('is-loading');
    const settled = () => figure.classList.remove('is-loading');
    if (image.complete) settled();
    else {
      image.addEventListener('load', settled, { once: true });
      image.addEventListener('error', settled, { once: true });
    }
    figure.append(image);

    /* Przyciemnienie od dołu. Osobny element, nie `background` na figurze: leży NAD zdjęciem,
       a pod podpisem, więc biały tekst trzyma kontrast także na jasnym niebie w tle. */
    const scrim = document.createElement('span');
    scrim.className = 'vote-card__scrim';
    scrim.setAttribute('aria-hidden', 'true');
    figure.append(scrim);

    const badge = document.createElement('span');
    badge.className = 'vote-card__number';
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = startBadge(row);
    figure.append(badge);

    /* Podpis na zdjęciu: pigułka z imieniem nad nazwą pojazdu, nazwa największa. */
    const caption = document.createElement('figcaption');
    caption.className = 'vote-card__caption';
    const who = document.createElement('span');
    who.className = 'vote-card__who';
    who.textContent = badgeByParticipant.get(row.id) || row.firstName || '';
    const title = document.createElement('strong');
    title.className = 'vote-card__title';
    title.textContent = cartLabel(row);
    caption.append(who, title);

    /* Nazwisko i kategoria leżą teraz NA zdjęciu, razem z resztą podpisu.
       ---------------------------------------------------------------------------
       Stały pod nim, w osobnym pasku, który razem z obwódką kafelka był jedynym powodem, dla
       którego kafelek musiał być pudełkiem. Jedna linijka tekstu nie jest wart własnego
       prostokąta — a odkąd zeszła na zdjęcie, kafelek jest zdjęciem i niczym więcej. */
    const rider = document.createElement('span');
    rider.className = 'vote-card__rider';
    rider.textContent = `${riderName(row)} · ${row.category}`;
    caption.append(rider);
    figure.append(caption);

    if (rank) {
      const place = document.createElement('span');
      place.className = 'vote-card__rank';
      place.textContent = `#${rank}`;
      figure.append(place);
    }
    if (isMine) {
      const flag = document.createElement('span');
      flag.className = 'vote-card__mine';
      flag.textContent = text('voting.voted');
      figure.append(flag);
    }
    article.append(figure);

    /* Pod zdjęciem zostają WYŁĄCZNIE rzeczy, które się naciska: ocena, przycisk, komunikat o
       zużytej poprawce. Wszystko, co się czyta, jest w kadrze. */
    const body = document.createElement('div');
    body.className = 'vote-card__body';

    if (state.phase === 'closed') {
      const stats = document.createElement('p');
      stats.className = 'vote-card__stats';
      /* Dużą liczbą jest suma punktów, bo to ona ustawia kolejność kafelków i cokół. Wcześniej
         stała tu średnia — czyli kafelek numer jeden pokazywał liczbę, po której wcale nie był
         pierwszy, i przy dwóch sąsiednich kafelkach 9.47 nad 9.12 kolejność wyglądała na błąd. */
      const points = document.createElement('b');
      points.textContent = row.voteCount ? String(row.totalScore) : '—';
      const count = document.createElement('small');
      /* Bez „punktów" gołe 374 nie znaczy nic — ani to ocena, ani liczba głosujących. */
      count.textContent = row.voteCount
        ? `${text('voting.points')} · ${row.voteCount} ${votesLabel(row.voteCount)}`
        : text('voting.noVotes');
      stats.append(points, count);
      caption.append(stats);

      /* Remis: to samo zdanie i ta sama zasada, co na cokole strony głównej. Tutaj jest
         potrzebne bardziej niż tam, bo ta siatka pokazuje CAŁĄ stawkę naraz — dwa sąsiednie
         kafelki z tą samą sumą punktów i bez wyjaśnienia to najczęstsze miejsce, w którym
         wynik zaczyna wyglądać na wymyślony. */
      const tie = closedTies().get(row.id);
      if (tie) {
        const chip = document.createElement('span');
        chip.className = 'vote-card__tie';
        chip.textContent = tie;
        caption.append(chip);
      }
    } else if (state.phase === 'voting') {
      /* GŁOS DA SIĘ ZMIENIĆ Z TEGO SAMEGO URZĄDZENIA, WIĘC KAFELEK NIE MÓWI JUŻ „NIE".
         ---------------------------------------------------------------------------
         Stały tu dwie ślepe uliczki: na własnym kafelku sama ocena bez możliwości jej
         poprawienia, a na cudzym zdanie „już głosowałeś". Oba były prawdą, dopóki zmiana
         wymagała żetonu z maila — a od teraz nie wymaga (patrz votingEdit w Workerze).

         Każdy kafelek dostaje więc te same kontrolki, a różni się tylko napis na przycisku:
         „zagłosuj" bez głosu, „zmień ocenę" na własnym, „przenieś tu swój głos" na cudzym. */
      if (isMine) {
        const yours = document.createElement('p');
        yours.className = 'vote-card__yours';
        yours.textContent = `${text('voting.yourScore')} ${mine.score}`;
        body.append(yours);
      }

      /* KIEDY KAFELEK NIE PROSI JUŻ O NIC.
         ---------------------------------------------------------------------------
         Dwa różne powody, dwa różne zdania i żaden z nich nie jest błędem do poprawienia:

           — głos był anonimowy, więc jest ostateczny (zmiana wymaga imienia i adresu),
           — jedyna zmiana została już zużyta.

         Rozstrzyga to serwer; tutaj chodzi o to, żeby nie stawiać na ekranie suwaka, który
         dostanie odmowę. */
      const canEdit = !mine || mine.canChange;
      if (!canEdit) {
        const used = document.createElement('p');
        used.className = 'vote-card__used';
        used.textContent = text(mine.identified ? 'voting.editUsedMine' : 'voting.editNeedsContact');
        body.append(used);
        article.append(body);
        return article;
      }

      /* Ocenianie odbywa się NA zdjęciu — patrz voteOverlay(). Kafelek zostaje czysty,
         dopóki ktoś nie najedzie kursorem albo nie dotknie go palcem. */
      const overlay = voteOverlay(row);
      figure.append(overlay.veil, overlay.hit);
      figure.classList.add('is-tappable');
    }
    article.append(body);
    return article;
  }

  /**
   * Ocenianie ODBYWA SIĘ NA ZDJĘCIU, a nie pod nim.
   * ===========================================================================
   *
   * Poprzednia wersja stawiała pod każdym kafelkiem żółty przycisk „Zagłosuj", a pod nim
   * wyrastało pytanie i suwak. Przy dwóch kolumnach na telefonie znaczyło to dwa rzędy
   * przycisków krzyczących to samo w kółko — siatka wyglądała jak formularz, nie jak galeria
   * wózków, po którą ktoś tu przyszedł.
   *
   * Teraz kafelek jest czysty: samo zdjęcie z podpisem. Zaproszenie pojawia się DOPIERO wtedy,
   * gdy ktoś wykaże zainteresowanie tym konkretnym wozem:
   *
   *   MYSZ — najechanie przygasza zdjęcie i wynosi na jego środek jeden przycisk;
   *   PALEC — dotknięcie robi to samo, bo `:hover` na telefonie nie istnieje;
   *   KLIK  — przycisk PRZEISTACZA SIĘ w suwak z oceną i przyciskiem wysyłki, w miejscu,
   *           w którym stał, więc wzrok nie musi nigdzie skakać.
   *
   * DLACZEGO SUWAK, A NIE OSIEM PRZYCISKÓW
   *   Osiem sąsiadujących celów na szerokości pół telefonu to osiem okazji do trafienia w
   *   ósemkę zamiast w dziewiątkę. Suwak ma jeden uchwyt, który się ciągnie — pomyłkę widać i
   *   poprawia się ją bez podnoszenia palca, a wartość stoi obok wielką liczbą. Zakres bierze
   *   się z serwera (`scoreMin`/`scoreMax`), nie z liczby wpisanej tutaj.
   *
   * DLACZEGO WYSYŁKA JEST OSOBNYM NACIŚNIĘCIEM
   *   Głos jest jeden, a jego zmiana wymaga imienia i adresu. Wysyłanie od razu po puszczeniu
   *   suwaka znaczyłoby, że muśnięcie ekranu przy przewijaniu oddaje cudzy głos bez odwrotu.
   *
   * Zwraca `{ veil, hit }`: nakładkę na zdjęcie i przezroczysty przycisk, który ją odsłania na
   * dotknięcie. Dwa elementy, nie jeden, bo przycisk w przycisku jest niepoprawnym HTML-em.
   */
  function voteOverlay(row) {
    const mine = state.myVote;
    const isMine = Boolean(mine && mine.participantId === row.id);
    /* Trzy stany, trzy napisy, jedna ścieżka pod nimi. Napis jest tu jedyną różnicą, bo
       czynność jest ta sama: powiedz, na który wóz i ile punktów. */
    const startLabel = isMine
      ? text('voting.changeScore')
      : mine ? text('voting.moveVote') : text('voting.cta');

    const flowId = `vote-flow-${String(row.id).replace(/[^a-z0-9_-]/gi, '-')}`;

    /* Nakładka: przygaszenie zdjęcia plus to, co na nim staje. Jeden element na oba stany,
       bo przejście „przycisk → suwak" ma być morfowaniem w miejscu, a nie zniknięciem jednego
       pudełka i pojawieniem się drugiego kilka pikseli dalej. */
    const veil = document.createElement('div');
    veil.className = 'vote-veil';

    const cta = document.createElement('button');
    cta.type = 'button';
    cta.className = 'vote-veil__cta';
    cta.dataset.voteStart = '';
    cta.textContent = startLabel;
    cta.setAttribute('aria-expanded', 'false');
    cta.setAttribute('aria-controls', `${flowId}-picker`);

    /* ---------------------------------------------------------------- suwak z oceną */
    const picker = document.createElement('div');
    picker.id = `${flowId}-picker`;
    picker.className = 'vote-veil__pick';
    picker.hidden = true;

    const label = document.createElement('span');
    label.className = 'vote-picker__label';
    label.textContent = text('voting.pickScore');

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'vote-slider';
    slider.min = String(state.scoreMin);
    slider.max = String(state.scoreMax);
    slider.step = '1';
    /* Start w środku skali, nie na minimum: suwak ustawiony na 3 podpowiada trójkę i trzeba
       go przeciągnąć, żeby powiedzieć cokolwiek innego. Środek nie podpowiada niczego. */
    slider.value = String(Math.round((state.scoreMin + state.scoreMax) / 2));
    /* Przy zmianie suwak startuje od oceny już oddanej, nie od środka skali: kto poprawia
       ósemkę na dziewiątkę, ma przesunąć uchwyt o jedno, a nie ustawiać go od nowa. */
    if (mine) slider.value = String(mine.score);
    slider.setAttribute('aria-label', text('voting.pickScore'));

    const value = document.createElement('b');
    value.className = 'vote-slider__value';
    const paintValue = () => {
      value.textContent = slider.value;
      /* Wypełnienie toru do uchwytu — `input[type=range]` nie umie tego samo w każdej
         przeglądarce, więc procent idzie zmienną CSS. */
      const span = Number(slider.max) - Number(slider.min);
      const at = span ? (Number(slider.value) - Number(slider.min)) / span : 0;
      slider.style.setProperty('--at', Math.round(at * 100) + '%');
    };
    paintValue();
    slider.addEventListener('input', paintValue);

    const scale = document.createElement('div');
    scale.className = 'vote-slider__scale';
    const low = document.createElement('span');
    low.textContent = String(state.scoreMin);
    const high = document.createElement('span');
    high.textContent = String(state.scoreMax);
    scale.append(low, high);

    const track = document.createElement('div');
    track.className = 'vote-slider__row';
    track.append(slider, value);

    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'btn btn--yellow btn--small vote-veil__send';
    // „Wyślij głos", nie „Potwierdź": po tym naciśnięciu głos jedzie na serwer.
    confirm.textContent = text('voting.send');
    /* Głos już oddany idzie inną drogą: bez okna z adresem. Adres jest znany — leży w wierszu,
       który właśnie poprawiamy — a pytanie o niego dawałoby możliwość podania cudzego i zamiany
       zmiany oceny w drugi głos. */
    confirm.addEventListener('click', () => {
      const score = Number(slider.value);
      if (state.myVote) void changeVote(row, score);
      else askIdentity(row, score);
    });

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'vote-veil__cancel';
    cancel.textContent = text('a11y.close');

    const actions = document.createElement('div');
    actions.className = 'vote-veil__actions';
    actions.append(confirm, cancel);
    picker.append(label, track, scale, actions);
    veil.append(cta, picker);

    /* Przezroczysty przycisk na całym zdjęciu. Na telefonie to on odsłania nakładkę — bez
       niego nie byłoby jak jej wywołać, bo `:hover` nie istnieje. Na myszy jest niewidoczny
       i nieużywany: CSS zdejmuje go, gdy kursor wejdzie na kafelek. */
    const hit = document.createElement('button');
    hit.type = 'button';
    hit.className = 'vote-card__hit';
    hit.setAttribute('aria-label', `${startLabel} — ${cartLabel(row)}`);

    /* ---------------------------------------------------------------- przechodzenie */
    const card = () => veil.closest('.vote-card');

    /* Jeden odsłonięty kafelek na całą stronę. Dwa otwarte suwaki to pytanie „który z nich
       właśnie wysyłam", zadane w chwili wysyłania. */
    const closeOthers = () => {
      $$('.vote-card.is-armed, .vote-card.is-picking').forEach((other) => {
        if (other === card()) return;
        other.classList.remove('is-armed', 'is-picking');
        const otherPick = $('.vote-veil__pick', other);
        if (otherPick) otherPick.hidden = true;
        const otherCta = $('.vote-veil__cta', other);
        if (otherCta) otherCta.setAttribute('aria-expanded', 'false');
        const otherHit = $('.vote-card__hit', other);
        if (otherHit) otherHit.hidden = false;
      });
    };

    const disarm = () => {
      const node = card();
      if (!node) return;
      node.classList.remove('is-armed', 'is-picking');
      picker.hidden = true;
      cta.setAttribute('aria-expanded', 'false');
      hit.hidden = false;
    };

    const arm = () => {
      closeOthers();
      const node = card();
      if (node) node.classList.add('is-armed');
      // Przycisk dotknięcia schodzi z drogi, żeby następne dotknięcie trafiło w „Zagłosuj".
      hit.hidden = true;
      cta.focus({ preventScroll: true });
    };

    const toPick = () => {
      closeOthers();
      const node = card();
      if (node) node.classList.add('is-armed', 'is-picking');
      hit.hidden = true;
      picker.hidden = false;
      cta.setAttribute('aria-expanded', 'true');
      slider.focus({ preventScroll: true });
    };

    hit.addEventListener('click', arm);
    cta.addEventListener('click', toPick);
    cancel.addEventListener('click', () => { disarm(); hit.focus({ preventScroll: true }); });

    /* Escape wychodzi z wyboru, nie z całej strony — a wychodzi krok po kroku: z suwaka do
       przycisku, z przycisku do czystego kafelka. */
    veil.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (!picker.hidden) {
        picker.hidden = true;
        card()?.classList.remove('is-picking');
        cta.setAttribute('aria-expanded', 'false');
        cta.focus({ preventScroll: true });
        return;
      }
      disarm();
    });

    /* Zejście fokusem poza kafelek składa go z powrotem. Bez tego na klawiaturze zostawał
       otwarty suwak na kafelku, którego już nie widać. */
    veil.addEventListener('focusout', (event) => {
      if (veil.contains(event.relatedTarget)) return;
      if (!picker.hidden) return;
      disarm();
    });

    return { veil, hit };
  }

  /* --------------------------------------------------------------- zmiana własnego głosu */

  /**
   * Przeniesienie głosu na inny wóz albo poprawienie oceny — z tego samego urządzenia.
   *
   * Bez okna i bez adresu. Serwer rozpoznaje głos po identyfikatorze urządzenia, bo para
   * (urządzenie, kategoria) ma indeks unikalny, czyli z tej przeglądarki istnieje co najwyżej
   * jeden głos i nie ma czego rozstrzygać. Szczegóły i świadomy koszt tego wyboru — przy
   * `votingEdit` w worker/index.js.
   *
   * Żeton z maila nadal działa i nadal jest jedyną drogą z INNEGO urządzenia.
   */
  /**
   * Żeton z odsyłacza w mailu, jeśli ktoś nim wszedł. Puste znaczy „to samo urządzenie".
   *
   * Trzymany, a nie zużywany od razu: od kiedy zmiana obejmuje też przeniesienie głosu na inny
   * wóz, jedno okno z suwakiem nie wystarcza — trzeba móc wskazać kafelek. Żeton zostaje więc
   * na czas tej wizyty i jedzie z każdą zmianą, dzięki czemu wejście z maila na CUDZYM
   * urządzeniu daje dokładnie te same możliwości co wejście na własnym.
   */
  let mailToken = '';

  async function changeVote(row, score) {
    if (demoDriven) {
      state.myVote = { participantId: row.id, score };
      toast(text('voting.changed'), 'success');
      paint();
      return;
    }

    const bridge = api();
    const endpoint = config()?.endpoints?.voting;
    if (!bridge || !endpoint) return;

    try {
      /* Żeton wygrywa z urządzeniem, gdy jest. Kto wszedł z maila na obcym laptopie, nie ma
         tam swojego głosu przypisanego do przeglądarki — i to jest cały powód, dla którego
         żeton istnieje. Serwer sprawdza jedno albo drugie, nigdy oba naraz. */
      const result = await bridge.post(endpoint, bridge.payload('voting', {
        action: 'edit',
        participantId: row.id,
        score,
        ...(mailToken ? { editToken: mailToken } : { deviceId: deviceId() })
      }));
      if (!result?.ok) throw Object.assign(new Error('edit'), { payload: result });
      toast(text('voting.changed'), 'success');
      /* Stan lokalny przestawiony od razu, nie dopiero po odczycie: `pull()` idzie do serwera i
         na wolnej sieci kafelki jeszcze kilka sekund pokazywałyby stary głos, mimo że
         potwierdzenie już wyskoczyło. Razem z głosem zużywa się jedyna zmiana. */
      state.myVote = { participantId: row.id, score, editsLeft: 0 };
      paint();
      await pull();
    } catch (error) {
      const code = error.payload?.code || '';
      const key = {
        VOTING_NOT_OPEN: 'voting.notOpen',
        VOTING_BAD_SCORE: 'voting.badScore',
        VOTING_NO_VOTE: 'voting.tokenGone',
        VOTING_NO_PARTICIPANT: 'voting.notOpen',
        VOTING_BAD_TOKEN: 'voting.tokenGone',
        VOTING_EDIT_USED: 'voting.editUsedMine',
        VOTING_EDIT_NEEDS_CONTACT: 'voting.editNeedsContact'
      }[code] || 'form.sendError';
      toast(text(key), 'error');
      /* Zamknięte głosowanie, zużyta zmiana i głos anonimowy to nie błędy do poprawienia, tylko
         stan, którego strona jeszcze nie znała — po każdym lista jest odczytywana, żeby
         kontrolki zniknęły same. */
      if (['VOTING_NOT_OPEN', 'VOTING_EDIT_USED', 'VOTING_EDIT_NEEDS_CONTACT'].includes(code)) {
        await pull();
      }
    }
  }

  /* ------------------------------------------------------------------- okno z adresem */

  /** Co jest w tej chwili wysyłane. Trzymane poza oknem, bo okno jest jedno na całą stronę. */
  let pending = null;

  function askIdentity(row, score) {
    const dialog = $('[data-vote-dialog]');
    if (!dialog) return;
    pending = { participantId: row.id, score, editToken: '' };

    $('[data-vote-dialog-who]', dialog).textContent = `${cartLabel(row)} · ${startBadge(row)}`;
    $('[data-vote-dialog-rider]', dialog).textContent = riderName(row);
    $('[data-vote-dialog-score]', dialog).textContent = String(score);

    const saved = savedVoter();
    const known = $('[data-vote-known]', dialog);
    const form = $('[data-vote-form]', dialog);
    $('[data-vote-edit]', dialog).hidden = true;

    /* Zapamiętany adres jest propozycją, nie domysłem. Widać go w całości — bez tego „zagłosuj
       zapisanym adresem" jest prośbą o zaufanie w czymś, czego nie da się sprawdzić. */
    if (saved) {
      known.hidden = false;
      $('[data-vote-known-email]', known).textContent = saved.email;
      const knownNotify = $('[data-vote-known-notify]', known);
      if (knownNotify) knownNotify.checked = false;
      form.hidden = true;
    } else {
      known.hidden = true;
      form.hidden = false;
    }
    $('[data-vote-status]', dialog).textContent = '';
    $$('[data-field]', dialog).forEach((field) => field.classList.remove('is-invalid'));

    dialog.showModal();
    document.body.classList.add('is-locked');
  }

  function closeDialog() {
    const dialog = $('[data-vote-dialog]');
    if (dialog?.open) dialog.close();
    document.body.classList.remove('is-locked');
    pending = null;
  }

  function setupDialog() {
    const dialog = $('[data-vote-dialog]');
    if (!dialog) return;
    const form = $('[data-vote-form]', dialog);
    const known = $('[data-vote-known]', dialog);

    $('[data-vote-close]', dialog)?.addEventListener('click', closeDialog);
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeDialog(); });
    /* Sprzątanie wołane też ze `close()`, nie tylko ze zdarzenia: sonda w headless Chrome
       pokazała `dialog.close()` wykonane raz, okno zamknięte i ani jednego zdarzenia `close` —
       strona zostawała z `is-locked` na `body`, czyli z zablokowanym przewijaniem i bez okna,
       które by to tłumaczyło. Najgorszy objaw, bo wygląda na zawieszoną stronę. */
    dialog.addEventListener('close', () => {
      document.body.classList.remove('is-locked');
      pending = null;
    });

    $('[data-vote-known-send]', known)?.addEventListener('click', () => {
      const saved = savedVoter();
      const notifyResults = Boolean($('[data-vote-known-notify]', known)?.checked);
      if (saved) send(saved.name || '', saved.email, notifyResults);
    });
    $('[data-vote-known-other]', known)?.addEventListener('click', () => {
      known.hidden = true;
      form.hidden = false;
      form.elements.namedItem('email')?.focus();
    });

    const emailInput = form?.elements.namedItem('email');
    const notifyInput = form?.elements.namedItem('notifyResults');
    const syncNotify = () => {
      if (!notifyInput) return;
      notifyInput.disabled = !String(emailInput?.value || '').trim();
      if (notifyInput.disabled) notifyInput.checked = false;
    };
    emailInput?.addEventListener('input', syncNotify);
    syncNotify();

    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = String(form.elements.namedItem('name')?.value || '').trim();
      const email = String(form.elements.namedItem('email')?.value || '').trim();
      const notifyResults = Boolean(form.elements.namedItem('notifyResults')?.checked && email);
      // Imię i e-mail są dobrowolne. Niepusty adres nadal musi być poprawny.
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { markInvalid(form, 'email'); return; }
      send(name, email, notifyResults);
    });
  }

  function markInvalid(form, name) {
    const control = form.elements.namedItem(name);
    control?.closest('[data-field]')?.classList.add('is-invalid');
    control?.setAttribute('aria-invalid', 'true');
    control?.focus({ preventScroll: true });
  }

  async function send(name, email, notifyResults = false) {
    if (!pending) return;
    const dialog = $('[data-vote-dialog]');
    const status = $('[data-vote-status]', dialog);
    const buttons = $$('button', dialog);

    /* Tryb demo nie wysyła niczego. Głos zapisany lokalnie, żeby dało się zobaczyć to, co widzi
       głosujący po wysłaniu: panel „Twój głos" na górze, plakietka na kafelku i pozostałe
       kafelki bez przycisku. Odczyt z serwera odtworzyłby stan wyjściowy i głos by zniknął. */
    if (demoDriven) {
      state.myVote = { participantId: pending.participantId, score: pending.score };
      if (email) rememberVoter(name, email);
      closeDialog();
      toast(text('voting.thanks'), 'success');
      paint();
      return;
    }

    const bridge = api();
    const endpoint = config()?.endpoints?.voting;
    if (!bridge || !endpoint) return;

    buttons.forEach((button) => { button.disabled = true; });
    if (status) status.textContent = text('voting.sending');
    try {
      const result = await bridge.post(endpoint, bridge.payload('voting', {
        action: pending.editToken ? 'edit' : 'vote',
        participantId: pending.participantId,
        editToken: pending.editToken,
        name,
        email,
        notifyResults,
        deviceId: deviceId(),
        score: pending.score
      }));
      if (!result?.ok) throw Object.assign(new Error('vote'), { payload: result });
      if (email) rememberVoter(name, email);
      closeDialog();
      const thanksKey = result.anonymous
        ? 'voting.thanksAnonymous'
        : result.mailed === false ? 'voting.thanksNoMail' : 'voting.thanks';
      toast(text(thanksKey), 'success');
      await pull();
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
      // „Już głosowałeś" nie jest błędem do poprawienia, więc lista jest odświeżana: kafelki
      // dostaną plakietki i przestaną zachęcać do drugiej próby.
      if (code === 'VOTING_ALREADY_VOTED' || code === 'VOTING_NOT_OPEN') await pull();
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
    }
  }

  /* --------------------------------------------------------------- zmiana głosu z maila */

  /**
   * `#vote=<żeton>` — zmiana decyzji z odsyłacza w mailu.
   *
   * Fragment, nie parametr zapytania: fragment nie jedzie do serwera ani w nagłówku Referer, a
   * to jest zdolność do zmiany cudzej oceny. Zdejmowany z adresu natychmiast po odczytaniu, żeby
   * nie został w historii przeglądarki ani w zakładce.
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

      /* Żeton zostaje na czas wizyty i od tej chwili jedzie z każdą zmianą — patrz `mailToken`.
         Bez tego odsyłacz z maila dawał tylko suwak w oknie: dało się poprawić ocenę, ale nie
         zagłosować na inny wóz, bo okno nie ma listy kafelków, a lista nie miała żetonu. */
      mailToken = editToken;

      /* Głos wpisany w stan strony, więc kafelki od razu wiedzą, który jest jego: własny mówi
         „zmień ocenę", pozostałe „przenieś tu swój głos". To ta sama droga, którą ma osoba
         siedząca na własnym telefonie — a nie druga, osobna. */
      if (result.vote.participantId) {
        state.myVote = { participantId: result.vote.participantId, score: Number(result.vote.score) };
        paint();
      }

      openEdit(result.vote, editToken);
    } catch (_) {
      toast(text('voting.tokenGone'), 'error');
    }
  }

  /**
   * Okno zmiany oceny. Bez adresu — żeton już mówi, czyj to głos.
   *
   * Pytanie o adres przy zmianie byłoby pytaniem o coś, co jest już znane, i dawałoby możliwość
   * podania cudzego. Zmienia się wyłącznie ocena.
   */
  function openEdit(vote, editToken) {
    const dialog = $('[data-vote-dialog]');
    if (!dialog) return;
    pending = { participantId: '', score: vote.score, editToken };

    $('[data-vote-dialog-who]', dialog).textContent =
      `${vote.projectName || vote.participantName || ''} · ${String(vote.startNumber || '').padStart(3, '0')}`;
    $('[data-vote-dialog-rider]', dialog).textContent = vote.participantName || '';
    $('[data-vote-dialog-score]', dialog).textContent = String(vote.score);

    const edit = $('[data-vote-edit]', dialog);
    $('[data-vote-known]', dialog).hidden = true;
    $('[data-vote-form]', dialog).hidden = true;
    edit.hidden = false;

    const scores = $('[data-vote-edit-scores]', edit);
    scores.replaceChildren();
    for (let score = state.scoreMin; score <= state.scoreMax; score += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'vote-picker__score';
      button.dataset.voteScore = String(score);
      button.textContent = String(score);
      const picked = score === Number(vote.score);
      button.classList.toggle('is-picked', picked);
      button.setAttribute('aria-pressed', String(picked));
      button.addEventListener('click', () => {
        pending.score = score;
        $$('button', scores).forEach((other) => {
          const active = other === button;
          other.classList.toggle('is-picked', active);
          other.setAttribute('aria-pressed', String(active));
        });
        $('[data-vote-dialog-score]', dialog).textContent = String(score);
      });
      scores.append(button);
    }

    $('[data-vote-edit-send]', edit).onclick = () => send('', '');
    $('[data-vote-status]', dialog).textContent = '';
    dialog.showModal();
    document.body.classList.add('is-locked');
  }

  /* ------------------------------------------------------------------------------ start */

  function start() {
    if (!$('[data-vote-shell]')) return;
    setupDialog();
    $('[data-vote-more]')?.addEventListener('click', showMore);

    /* Szukanie bez przycisku „szukaj": lista jest już w przeglądarce, więc filtrowanie jest
       darmowe i ma się dziać w trakcie pisania. Porcja wraca do dwunastu przy każdej zmianie
       frazy — inaczej po wyczyszczeniu pola zostawałaby rozwinięta na sto kafelków. */
    const query = $('[data-vote-query]');
    query?.addEventListener('input', () => {
      state.query = String(query.value || '');
      state.shown = BATCH;
      paintSearch();
      paintGrid();
    });
    $('[data-vote-query-clear]')?.addEventListener('click', () => {
      state.query = '';
      state.shown = BATCH;
      if (query) query.value = '';
      paintSearch();
      paintGrid();
      query?.focus();
    });
    $('[data-vote-edition]')?.addEventListener('change', (event) => {
      const key = String(event.target.value || '');
      state.requestedEdition = key;
      const url = new URL(location.href);
      if (key) url.searchParams.set('edition', key);
      else url.searchParams.delete('edition');
      history.replaceState(null, '', url);
      knownIds = null;
      freshIds = new Set();
      state.loaded = false;
      paint();
      pull();
    });

    /* Kliknięcie POZA kafelkiem składa go z powrotem.
       Bez tego odsłonięty suwak zostawał na ekranie po odejściu palca gdzie indziej, a przy
       dwóch kolumnach na telefonie łatwo wtedy wysłać ocenę nie tego wozu, o którym się myśli.
       Nasłuch jeden, na dokumencie: kafelki powstają i giną przy każdym odczycie. */
    document.addEventListener('click', (event) => {
      const inside = event.target.closest?.('.vote-card');
      $$('.vote-card.is-armed, .vote-card.is-picking').forEach((card) => {
        if (card === inside) return;
        card.classList.remove('is-armed', 'is-picking');
        const pick = $('.vote-veil__pick', card);
        if (pick) pick.hidden = true;
        const cta = $('.vote-veil__cta', card);
        if (cta) cta.setAttribute('aria-expanded', 'false');
        const hit = $('.vote-card__hit', card);
        if (hit) hit.hidden = false;
      });
    });

    /* Zegar w pasku tyka co sekundę. Osobno od odczytu z serwera, który chodzi co pół minuty:
       licznik przeskakujący raz na trzydzieści sekund nie jest licznikiem. */
    window.setInterval(paintTimer, 1000);

    /* Szkielet od pierwszej klatki, nie po pierwszej odpowiedzi.
       `paint()` był wołany wyłącznie z `absorb()`, czyli już PO odczycie — więc przez cały czas
       oczekiwania nie było na ekranie niczego, także szkieletu. Jedno wywołanie tutaj rysuje go,
       zanim cokolwiek poleci do serwera. */
    paint();

    // Etykiety są w słowniku, więc przełączenie języka przerysowuje wszystko, co je nosi.
    window.addEventListener('carruleddhi:language', () => { if (state.loaded) paint(); });

    /* Odczyt na trzydzieści sekund, tylko gdy karta jest z przodu. Bez licznika sekundowego —
       na tej stronie nie ma czego odliczać, a to była jedna z rzeczy, o które chodziło. */
    let poller = 0;
    const go = () => {
      if (poller) return;
      poller = window.setInterval(() => { if (!demoDriven) pull(); }, 30000);
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') { pull(); go(); }
      else { window.clearInterval(poller); poller = 0; }
    });
    if (document.visibilityState === 'visible') go();

    pull().then(openFromToken);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
