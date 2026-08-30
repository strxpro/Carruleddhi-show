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
  $, $$, demoMode, text, toast,
  deviceId, savedVoter, rememberVoter, readState, paintDemoBar, avatarFor
} from './voting-core.js';

(function () {
  'use strict';

  /** Ile kafelków wchodzi w jednej porcji. */
  const BATCH = 12;

  const state = {
    phase: 'scheduled',
    scoreMin: 3,
    scoreMax: 10,
    categories: [],
    participants: [],
    /** Mój głos albo `null`. Jeden na urządzenie, na cały konkurs. */
    myVote: null,
    /** Filtr kategorii pojazdu. Pusty znaczy „wszystkie". */
    category: '',
    /** Ile kafelków jest już narysowanych. */
    shown: BATCH,
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
      scoreMin: Number(result.scoreMin) || 3,
      scoreMax: Number(result.scoreMax) || 10,
      categories: Array.isArray(result.categories) ? result.categories : [],
      participants,
      myVote: mine ? { participantId: mine.participantId, score: mine.score } : null,
      loaded: true
    });
    if (state.category && !state.categories.includes(state.category)) state.category = '';
    paint();
  }

  async function pull() {
    const result = await readState(demoPhase);
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

  function paint() {
    paintPhase();
    paintMyVote();
    paintFilters();
    paintGrid();
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

    // „Jeden głos na osobę" jest obietnicą, więc znika, gdy nie ma już czego obiecywać.
    const rule = $('[data-vote-rule]');
    if (rule) rule.hidden = !open;
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
    /* Zmiana oceny idzie wyłącznie odsyłaczem z maila: żeton nigdy nie dociera do przeglądarki
       (patrz komentarz nad votingVote w Workerze), więc strona nie ma czym się tu wykazać i
       mówi to wprost, zamiast dawać przycisk, który odpowie odmową. */
    const note = $('[data-vote-mine-note]', panel);
    if (note) {
      note.hidden = state.phase !== 'voting';
      note.textContent = text('voting.changeByEmail');
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

  function rows() {
    const list = state.participants.filter((row) => !state.category || row.category === state.category);
    if (state.phase !== 'closed') return list;
    /* Po zamknięciu ta sama siatka jest rankingiem, więc kolejność jest wynikiem. W trakcie
       głosowania zostaje numer startowy: sortowanie po wyniku pokazywałoby, kto prowadzi, a to
       zamienia ocenianie pojazdów w dopisywanie się do lidera pierwszej godziny.

       Suma punktów, nie średnia — ta sama kolejność, którą Worker liczy dla podium. Gdyby siatka
       sortowała inaczej niż cokół, pierwszy kafelek na liście nie byłby zwycięzcą i nikt by tego
       nie umiał wytłumaczyć. */
    return [...list].sort((a, b) =>
      b.totalScore - a.totalScore ||
      b.voteCount - a.voteCount ||
      b.averageScore - a.averageScore ||
      a.startNumber - b.startNumber);
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
        mine && mine.participantId === row.id ? `mine:${mine.score}` : '',
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
    if (freshIds.has(row.id)) article.classList.add('is-fresh');

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

    const body = document.createElement('div');
    body.className = 'vote-card__body';
    /* Nazwa pojazdu i imię stoją już na zdjęciu, więc tu zostaje to, czego tam nie ma:
       pełne nazwisko i kategoria. Powtórzenie nazwy pod zdjęciem, na którym ta nazwa właśnie
       stoi, zajmowałoby drugi wiersz, żeby nie powiedzieć nic nowego. */
    const rider = document.createElement('span');
    rider.className = 'vote-card__rider';
    rider.textContent = `${riderName(row)} · ${row.category}`;
    body.append(rider);

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
        ? `${text('voting.points')} · ${row.voteCount} ${text('voting.votes')}`
        : text('voting.noVotes');
      stats.append(points, count);
      body.append(stats);
    } else if (isMine) {
      const yours = document.createElement('p');
      yours.className = 'vote-card__yours';
      yours.textContent = `${text('voting.yourScore')} ${mine.score}`;
      body.append(yours);
    } else if (mine) {
      /* Głos jest już oddany na kogoś innego. Kafelek mówi to na miejscu, zamiast zapraszać do
         naciśnięcia przycisku, który odpowie odmową. */
      const used = document.createElement('p');
      used.className = 'vote-card__used';
      used.textContent = text('voting.already');
      body.append(used);
    } else if (state.phase === 'voting') {
      const controls = voteControls(row);
      body.append(controls);

      /* Dotknięcie zdjęcia wchodzi w ten sam przepływ co przycisk pod spodem — nie w skrót
         obok niego. Przezroczysty przycisk NA zdjęciu, a nie obsługa kliknięcia na figurze:
         dostaje fokus i reaguje na enter, więc droga z klawiatury jest ta sama co palcem. */
      const hit = document.createElement('button');
      hit.type = 'button';
      hit.className = 'vote-card__hit';
      hit.setAttribute('aria-label', `${text('voting.cta')} — ${cartLabel(row)}`);
      hit.addEventListener('click', () => controls.openVote());
      figure.append(hit);
      figure.classList.add('is-tappable');
    }
    article.append(body);
    return article;
  }

  /**
   * Dwa kroki przy pojeździe: „Zagłosuj" → oceny 3–10 i potwierdzenie.
   *
   * Potwierdzenie jest osobnym naciśnięciem, mimo że dałoby się wysyłać od razu po wybraniu
   * oceny. Głos jest jeden na cały konkurs i nieodwracalny aż do maila ze żetonem, a rząd ośmiu
   * przycisków na telefonie to osiem sąsiadujących celów — trafienie w ósemkę zamiast w
   * dziewiątkę bez możliwości cofnięcia byłoby oszczędnością jednego naciśnięcia okupioną
   * cudzym wynikiem.
   */
  /**
   * Trzy kroki przy pojeździe: dotknięcie → „zagłosować na ten wóz?" → suwak i potwierdzenie.
   *
   * DLACZEGO PYTANIE JEST OSOBNYM KROKIEM
   *   Całe zdjęcie jest celem dotknięcia, a na telefonie trzymanym w jednej ręce zdarza się
   *   trafić w nie przy przewijaniu. Gdyby dotknięcie od razu otwierało oceny, przypadkowe
   *   muśnięcie stawiałoby człowieka przed rzędem liczb bez wyjaśnienia, w co właśnie wszedł.
   *   Pytanie z nazwą wozu odpowiada na „czy to na pewno ten" zanim padnie „ile punktów".
   *
   * DLACZEGO SUWAK, A NIE OSIEM PRZYCISKÓW
   *   Osiem sąsiadujących celów na szerokości telefonu to osiem okazji do trafienia w ósemkę
   *   zamiast w dziewiątkę. Suwak ma jeden uchwyt, który się CIĄGNIE — pomyłkę widać i
   *   poprawia się ją bez podnoszenia palca, a wartość stoi wypisana wielką liczbą obok.
   *   Zakres bierze się z serwera (`scoreMin`/`scoreMax`), nie z liczby wpisanej tutaj.
   *
   * Potwierdzenie zostaje osobnym naciśnięciem: głos jest jeden na cały konkurs i do maila
   * ze żetonem nieodwracalny.
   */
  function voteControls(row) {
    const wrap = document.createElement('div');
    wrap.className = 'vote-card__act';

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'btn btn--yellow btn--small vote-card__start';
    open.dataset.voteStart = '';
    open.textContent = text('voting.cta');

    /* ---------------------------------------------------------------- krok 1: pytanie */
    const ask = document.createElement('div');
    ask.className = 'vote-ask';
    ask.hidden = true;
    const question = document.createElement('p');
    question.className = 'vote-ask__q';
    question.textContent = `${text('voting.askVote')} ${cartLabel(row)}?`;
    const askYes = document.createElement('button');
    askYes.type = 'button';
    askYes.className = 'btn btn--yellow btn--small';
    askYes.textContent = text('voting.askYes');
    const askNo = document.createElement('button');
    askNo.type = 'button';
    askNo.className = 'vote-picker__cancel';
    askNo.textContent = text('voting.askNo');
    const askRow = document.createElement('div');
    askRow.className = 'vote-ask__actions';
    askRow.append(askYes, askNo);
    ask.append(question, askRow);

    /* ---------------------------------------------------------------- krok 2: suwak */
    const picker = document.createElement('div');
    picker.className = 'vote-picker';
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
    confirm.className = 'btn btn--blue btn--small vote-picker__confirm';
    confirm.textContent = text('voting.confirm');
    confirm.addEventListener('click', () => askIdentity(row, Number(slider.value)));

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'vote-picker__cancel';
    cancel.textContent = text('a11y.close');

    const actions = document.createElement('div');
    actions.className = 'vote-picker__actions';
    actions.append(confirm, cancel);
    picker.append(label, track, scale, actions);

    /* ---------------------------------------------------------------- przechodzenie */
    const reset = () => {
      ask.hidden = true;
      picker.hidden = true;
      open.hidden = false;
    };
    /* Jeden otwarty wybór na całą stronę. Dwa otwarte suwaki na dwóch kafelkach to pytanie
       „który z nich właśnie wysyłam", zadane w chwili wysyłania. */
    const closeOthers = () => {
      $$('[data-vote-start]').forEach((other) => { other.hidden = false; });
      $$('.vote-ask').forEach((other) => { other.hidden = true; });
      $$('.vote-picker').forEach((other) => { other.hidden = true; });
    };

    const toAsk = () => {
      closeOthers();
      open.hidden = true;
      ask.hidden = false;
      askYes.focus();
    };
    open.addEventListener('click', toAsk);
    /* Uchwyt dla dotknięcia w zdjęcie — kafelek woła to zamiast powielać kroki u siebie. */
    wrap.openVote = toAsk;

    askYes.addEventListener('click', () => {
      ask.hidden = true;
      picker.hidden = false;
      slider.focus();
    });
    askNo.addEventListener('click', () => { reset(); open.focus(); });
    cancel.addEventListener('click', () => { reset(); open.focus(); });

    wrap.append(open, ask, picker);
    return wrap;
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
      if (saved) send(saved.name || text('voting.name'), saved.email);
    });
    $('[data-vote-known-other]', known)?.addEventListener('click', () => {
      known.hidden = true;
      form.hidden = false;
      form.elements.namedItem('email')?.focus();
    });

    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = String(form.elements.namedItem('name')?.value || '').trim();
      const email = String(form.elements.namedItem('email')?.value || '').trim();
      // Ta sama para reguł co w formularzu zapisów, żeby komunikat był ten sam.
      if (!name) { markInvalid(form, 'name'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { markInvalid(form, 'email'); return; }
      send(name, email);
    });
  }

  function markInvalid(form, name) {
    const control = form.elements.namedItem(name);
    control?.closest('[data-field]')?.classList.add('is-invalid');
    control?.setAttribute('aria-invalid', 'true');
    control?.focus({ preventScroll: true });
  }

  async function send(name, email) {
    if (!pending) return;
    const dialog = $('[data-vote-dialog]');
    const status = $('[data-vote-status]', dialog);
    const buttons = $$('button', dialog);

    /* Tryb demo nie wysyła niczego. Głos zapisany lokalnie, żeby dało się zobaczyć to, co widzi
       głosujący po wysłaniu: panel „Twój głos" na górze, plakietka na kafelku i pozostałe
       kafelki bez przycisku. Odczyt z serwera odtworzyłby stan wyjściowy i głos by zniknął. */
    if (demoDriven) {
      state.myVote = { participantId: pending.participantId, score: pending.score };
      rememberVoter(name, email);
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
        deviceId: deviceId(),
        score: pending.score
      }));
      if (!result?.ok) throw Object.assign(new Error('vote'), { payload: result });
      rememberVoter(name, email);
      closeDialog();
      toast(text(result.mailed === false ? 'voting.thanksNoMail' : 'voting.thanks'), 'success');
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
