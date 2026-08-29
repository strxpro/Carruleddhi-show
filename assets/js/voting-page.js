/**
 * Podstrona głosowania: dwanaście nagród, jeden głos w każdej.
 * ===========================================================================
 *
 * DLACZEGO OSOBNA STRONA, A NIE SEKCJA
 *   Sekcja na stronie głównej stała między licznikiem do dnia wydarzenia, formularzem zapisów
 *   i czternastoma innymi sekcjami. W chwili, w której ktoś głosuje, żadna z tych rzeczy nie
 *   jest już aktualna — wyścig właśnie jedzie. Tu nie ma licznika, nie ma „zapisz się" i nie
 *   ma „będę tam". Jest lista pojazdów i dwanaście nagród.
 *
 * TRZY KROKI NA KAFELKU, A NIE OKNO NA KLIKNIĘCIE ZDJĘCIA
 *   Zdjęcie nie otwiera niczego. Na kafelku stoi przycisk „Zagłosuj"; po naciśnięciu wyrasta
 *   z niego rząd ocen od 3 do 10 i przycisk potwierdzenia; dopiero potwierdzenie otwiera okno
 *   z adresem. Powód jest jeden i policzalny: przy dwunastu nagrodach otwarcie okna, żeby
 *   zobaczyć, że ocena to suwak, znaczy dwanaście okien. Ocena zostaje przy pojazdzie, a okno
 *   pojawia się raz na coś, co naprawdę wymaga pisania.
 *
 * ADRES JEST PAMIĘTANY, ALE NIE JEST ZAKŁADANY
 *   Dwanaście nagród to do dwunastu razy ten sam adres. Przepisywanie go dwanaście razy na
 *   telefonie jest najpewniejszym sposobem, żeby ktoś oddał jeden głos i zamknął stronę. Ale
 *   z jednego telefonu głosuje cała rodzina, więc okno pyta „ten adres czy inny" i nigdy nie
 *   wysyła zapamiętanego bez potwierdzenia.
 *
 * DOCZYTYWANIE PORCJAMI
 *   Kafelki wchodzą po dwanaście. Przy stu uczestnikach pierwsze wejście na stronę nie zaczyna
 *   się od stu podpisanych adresów zdjęć naraz; kolejne porcje dochodzą, gdy dojedzie się do
 *   końca listy. Zdjęcia mają `loading="lazy"`, ale to za mało — leniwy obrazek nadal jest
 *   węzłem w drzewie i nadal ma swój układ do policzenia.
 */
import { AWARDS, awardLabelKey, awardNumber } from './awards.js';
import {
  $, $$, reducedMotion, demoMode, text, toast,
  deviceId, savedVoter, rememberVoter, readState, paintDemoBar
} from './voting-core.js';

(function () {
  'use strict';

  /** Ile kafelków wchodzi w jednej porcji. */
  const BATCH = 12;

  const state = {
    phase: 'scheduled',
    scoreMin: 3,
    scoreMax: 10,
    awards: [...AWARDS],
    participants: [],
    results: [],
    myVotes: [],
    /** Wybrana nagroda — to ona jest kategorią głosu. */
    award: AWARDS[0],
    /** Ile kafelków wybranej nagrody jest już narysowanych. */
    shown: BATCH,
    loaded: false
  };

  let demoPhase = 'voting';
  let demoDriven = false;

  const api = () => window.CARRULEDDHI_API || null;
  const config = () => window.CARRULEDDHI_ACTIVE_CONFIG || null;

  const awardLabel = (award) => text(awardLabelKey(award));
  const myVote = (award) => state.myVotes.find((vote) => vote.award === award) || null;
  const resultFor = (award, participantId) =>
    state.results.find((row) => row.award === award && row.participantId === participantId) || null;

  /* ---------------------------------------------------------------------------- odczyt */

  function absorb(result) {
    Object.assign(state, {
      phase: result.phase,
      scoreMin: Number(result.scoreMin) || 3,
      scoreMax: Number(result.scoreMax) || 10,
      /* Lista nagród z serwera, z zapasem na stałą listę. Zapas nie jest ostrożnością bez
         powodu: starszy Worker odpowie bez pola `awards`, a strona bez nagród to strona, na
         której nie da się zagłosować. */
      awards: Array.isArray(result.awards) && result.awards.length ? result.awards : [...AWARDS],
      participants: Array.isArray(result.participants) ? result.participants : [],
      results: Array.isArray(result.results) ? result.results : [],
      myVotes: Array.isArray(result.myVotes) ? result.myVotes : [],
      loaded: true
    });
    if (!state.awards.includes(state.award)) state.award = state.awards[0];
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
    paintAwards();
    paintGrid();
  }

  function paintPhase() {
    const open = state.phase === 'voting';
    const closed = state.phase === 'closed';

    const shell = $('[data-vote-shell]');
    if (shell) {
      shell.hidden = !(open || closed);
      shell.classList.toggle('is-closed', closed);
    }

    const notice = $('[data-vote-notice]');
    if (notice) {
      notice.hidden = open || closed;
      notice.textContent = state.loaded || demoDriven ? text('voting.notOpenYet') : '';
    }

    const lead = $('[data-vote-lead]');
    if (lead) lead.textContent = text(closed ? 'voting.resultsLead' : 'voting.pageLead');
  }

  /**
   * Dwanaście nagród jako rząd zakładek.
   *
   * Zakładki, nie lista rozwijana: wybór nagrody jest tu głównym ruchem, a lista rozwijana
   * ukrywa jedenaście z dwunastu możliwości za jednym dodatkowym naciśnięciem. Oddane głosy
   * są zaznaczone, bo „ile mi jeszcze zostało" to pierwsze pytanie po drugim głosie.
   */
  function paintAwards() {
    const wrap = $('[data-vote-awards]');
    if (!wrap) return;
    wrap.replaceChildren(...state.awards.map((award) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'award-tab';
      button.dataset.awardTab = award;
      const active = award === state.award;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));

      const number = document.createElement('span');
      number.className = 'award-tab__number';
      number.setAttribute('aria-hidden', 'true');
      number.textContent = awardNumber(award);
      const label = document.createElement('strong');
      label.textContent = awardLabel(award);
      button.append(number, label);

      const mine = myVote(award);
      if (mine) {
        button.classList.add('is-done');
        const done = document.createElement('small');
        done.textContent = `${text('voting.awardDone')} ${mine.score}`;
        button.append(done);
      }

      button.addEventListener('click', () => {
        state.award = award;
        state.shown = BATCH;
        paintAwards();
        paintGrid();
        $('[data-vote-grid]')?.scrollIntoView({
          block: 'start',
          behavior: reducedMotion ? 'auto' : 'smooth'
        });
      });
      return button;
    }));

    const counter = $('[data-vote-progress]');
    if (counter) {
      counter.textContent = `${state.myVotes.length} / ${state.awards.length}`;
    }
  }

  function rowsForAward() {
    const closed = state.phase === 'closed';
    const rows = [...state.participants];
    if (!closed) return rows;
    /* Po zamknięciu ta sama siatka jest rankingiem TEJ nagrody, więc kolejność jest wynikiem.
       W trakcie głosowania zostaje numer startowy: sortowanie po średniej pokazywałoby, kto
       prowadzi, a to zamienia ocenianie pojazdów w dopisywanie się do lidera. */
    return rows.sort((a, b) => {
      const left = resultFor(state.award, a.id);
      const right = resultFor(state.award, b.id);
      return (right?.averageScore || 0) - (left?.averageScore || 0)
        || (right?.voteCount || 0) - (left?.voteCount || 0)
        || a.startNumber - b.startNumber;
    });
  }

  function paintGrid() {
    const grid = $('[data-vote-grid]');
    const empty = $('[data-vote-empty]');
    if (!grid) return;

    const rows = rowsForAward();
    if (empty) empty.hidden = rows.length > 0;

    const visible = rows.slice(0, state.shown);
    grid.replaceChildren(...visible.map((row, index) => card(row, state.phase === 'closed' ? index + 1 : 0)));

    paintMore(rows.length);
  }

  /**
   * „Pokaż więcej" plus czujka doczytująca sama.
   *
   * Oba, nie jedno: czujka jest wygodniejsza, ale IntersectionObserver nie odpali, gdy ktoś
   * skacze po stronie klawiszem End albo gdy przeglądarka go nie ma. Przycisk jest tym, co
   * działa zawsze; czujka tym, co sprawia, że przycisku zwykle nie trzeba nacisnąć.
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
      if (!entries.some((entry) => entry.isIntersecting)) return;
      showMore();
    }, { rootMargin: '400px 0px' });
    watcher.observe(sentinel);
  }

  function showMore() {
    const total = rowsForAward().length;
    if (state.shown >= total) return;
    state.shown = Math.min(total, state.shown + BATCH);
    paintGrid();
  }

  /* ----------------------------------------------------------------------------- kafelek */

  function card(row, rank) {
    const mine = myVote(state.award);
    const isMine = mine && mine.participantId === row.id;

    const article = document.createElement('article');
    article.className = 'vote-card';
    article.dataset.participant = row.id;
    if (isMine) article.classList.add('is-voted');

    /* Zdjęcie NIE jest przyciskiem. Zgłoszone wprost: klik w zdjęcie nie ma otwierać okna.
       Kafelek pokazuje pojazd, a czynność ma własny przycisk pod spodem. */
    const figure = document.createElement('figure');
    figure.className = 'vote-card__photo';
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
      blank.className = 'vote-card__blank';
      blank.setAttribute('aria-hidden', 'true');
      blank.textContent = String(row.startNumber).padStart(3, '0');
      figure.append(blank);
    }
    const badge = document.createElement('span');
    badge.className = 'vote-card__number';
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = String(row.startNumber).padStart(3, '0');
    figure.append(badge);
    if (rank) {
      const place = document.createElement('span');
      place.className = 'vote-card__rank';
      place.textContent = `#${rank}`;
      figure.append(place);
    }
    article.append(figure);

    const body = document.createElement('div');
    body.className = 'vote-card__body';
    const project = document.createElement('strong');
    project.textContent = row.projectName || text('voting.noProject');
    const rider = document.createElement('span');
    rider.className = 'vote-card__rider';
    rider.textContent = `${row.firstName} ${row.lastName}`.trim();
    body.append(project, rider);

    if (state.phase === 'closed') {
      const stats = document.createElement('p');
      stats.className = 'vote-card__stats';
      const found = resultFor(state.award, row.id);
      const average = document.createElement('b');
      average.textContent = found?.averageScore ? found.averageScore.toFixed(2) : '—';
      const count = document.createElement('small');
      count.textContent = `${found?.voteCount || 0} ${text('voting.votes')}`;
      stats.append(average, count);
      body.append(stats);
    } else if (isMine) {
      const yours = document.createElement('p');
      yours.className = 'vote-card__yours';
      yours.textContent = `${text('voting.yourScore')} ${mine.score}`;
      body.append(yours);
    } else if (mine) {
      /* Głos w tej nagrodzie jest już oddany na kogoś innego. Kafelek mówi to na miejscu,
         zamiast zapraszać do naciśnięcia przycisku, który odpowie odmową. */
      const used = document.createElement('p');
      used.className = 'vote-card__used';
      used.textContent = text('voting.already');
      body.append(used);
    } else if (state.phase === 'voting') {
      body.append(voteControls(row));
    }
    article.append(body);
    return article;
  }

  /**
   * Dwa kroki przy pojeździe: „Zagłosuj" → oceny 3–10 i potwierdzenie.
   *
   * Potwierdzenie jest osobnym naciśnięciem, mimo że dałoby się wysyłać od razu po wybraniu
   * oceny. Ocena jest nieodwracalna aż do maila ze żetonem, a rząd ośmiu przycisków na
   * telefonie to osiem sąsiadujących celów — trafienie w ósemkę zamiast w dziewiątkę bez
   * możliwości cofnięcia byłoby oszczędnością jednego naciśnięcia okupioną cudzym wynikiem.
   */
  function voteControls(row) {
    const wrap = document.createElement('div');
    wrap.className = 'vote-card__act';

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'btn btn--yellow btn--small vote-card__start';
    open.dataset.voteStart = '';
    open.textContent = text('voting.cta');

    const picker = document.createElement('div');
    picker.className = 'vote-picker';
    picker.hidden = true;

    const label = document.createElement('span');
    label.className = 'vote-picker__label';
    label.textContent = text('voting.pickScore');

    const scores = document.createElement('div');
    scores.className = 'vote-picker__scores';
    scores.setAttribute('role', 'group');
    scores.setAttribute('aria-label', text('voting.pickScore'));

    let picked = 0;
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'btn btn--blue btn--small vote-picker__confirm';
    confirm.textContent = text('voting.confirm');
    confirm.disabled = true;

    for (let score = state.scoreMin; score <= state.scoreMax; score += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'vote-picker__score';
      button.dataset.voteScore = String(score);
      button.textContent = String(score);
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        picked = score;
        $$('[data-vote-score]', scores).forEach((other) => {
          const active = other === button;
          other.classList.toggle('is-picked', active);
          other.setAttribute('aria-pressed', String(active));
        });
        confirm.disabled = false;
      });
      scores.append(button);
    }

    confirm.addEventListener('click', () => {
      if (!picked) return;
      askIdentity(row, picked);
    });

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'vote-picker__cancel';
    cancel.textContent = text('a11y.close');
    cancel.addEventListener('click', () => {
      picker.hidden = true;
      open.hidden = false;
      open.focus();
    });

    const actions = document.createElement('div');
    actions.className = 'vote-picker__actions';
    actions.append(confirm, cancel);
    picker.append(label, scores, actions);

    open.addEventListener('click', () => {
      /* Jeden otwarty wybór na całą stronę. Dwa otwarte rzędy ocen na dwóch kafelkach to
         pytanie „którą z nich właśnie wysyłam", zadane w chwili wysyłania. */
      $$('[data-vote-start]').forEach((other) => { other.hidden = false; });
      $$('.vote-picker').forEach((other) => { other.hidden = true; });
      open.hidden = true;
      picker.hidden = false;
      scores.querySelector('button')?.focus();
    });

    wrap.append(open, picker);
    return wrap;
  }

  /* ------------------------------------------------------------------- okno z adresem */

  /** Co jest w tej chwili wysyłane. Trzymane poza oknem, bo okno jest jedno na całą stronę. */
  let pending = null;

  function askIdentity(row, score) {
    const dialog = $('[data-vote-dialog]');
    if (!dialog) return;
    pending = { participantId: row.id, award: state.award, score, editToken: '' };

    $('[data-vote-dialog-award]', dialog).textContent = awardLabel(state.award);
    $('[data-vote-dialog-who]', dialog).textContent =
      `${row.projectName || text('voting.noProject')} · ${String(row.startNumber).padStart(3, '0')}`;
    $('[data-vote-dialog-score]', dialog).textContent = String(score);

    const saved = savedVoter();
    const known = $('[data-vote-known]', dialog);
    const form = $('[data-vote-form]', dialog);

    /* Zapamiętany adres jest propozycją, nie domysłem. Widać go w całości — bez tego „zagłosuj
       jako zapisany adres" jest prośbą o zaufanie w czymś, czego nie da się sprawdzić. */
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
    const status = $('[data-vote-status]', dialog);

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
      if (!saved) return;
      send(saved.name || text('voting.name'), saved.email);
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

    if (status) status.textContent = '';
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

    /* Tryb demo nie wysyła niczego. Głos zapisany lokalnie, żeby dało się zobaczyć to, co
       widzi głosujący po wysłaniu: plakietka na kafelku, zakładka odhaczona, licznik nagród
       o jeden dalej. Odczyt z serwera odtworzyłby stan wyjściowy i głos by zniknął. */
    if (demoDriven) {
      state.myVotes = [...state.myVotes, {
        participantId: pending.participantId,
        award: pending.award,
        score: pending.score
      }];
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
        award: pending.award,
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
        VOTING_BAD_AWARD: 'voting.badAward',
        VOTING_BAD_EMAIL: 'validation.email',
        VOTING_NO_VOTE: 'voting.tokenGone',
        VOTING_BAD_TOKEN: 'voting.tokenGone'
      }[code] || (error.status === 429 ? 'form.tooMany' : 'form.sendError');
      if (status) status.textContent = text(key);
      // „Już głosowałeś" nie jest błędem do poprawienia, więc lista jest odświeżana: kafelek
      // dostanie plakietkę i przestanie zachęcać do drugiej próby.
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
   * to jest zdolność do zmiany cudzej oceny. Zdejmowany z adresu natychmiast po odczytaniu,
   * żeby nie został w historii przeglądarki ani w zakładce.
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
      if (result.vote.award && state.awards.includes(result.vote.award)) {
        state.award = result.vote.award;
        state.shown = BATCH;
        paintAwards();
        paintGrid();
      }
      openEdit(result.vote, editToken);
    } catch (_) {
      toast(text('voting.tokenGone'), 'error');
    }
  }

  /**
   * Okno zmiany oceny. Bez adresu — żeton już mówi, czyj to głos.
   *
   * Pytanie o adres przy zmianie byłoby pytaniem o coś, co jest już znane, i dawałoby
   * możliwość podania cudzego. Zmienia się wyłącznie ocena.
   */
  function openEdit(vote, editToken) {
    const dialog = $('[data-vote-dialog]');
    if (!dialog) return;
    pending = { participantId: '', award: vote.award || state.award, score: vote.score, editToken };

    $('[data-vote-dialog-award]', dialog).textContent = awardLabel(pending.award);
    $('[data-vote-dialog-who]', dialog).textContent =
      `${vote.projectName || vote.participantName || ''} · ${String(vote.startNumber || '').padStart(3, '0')}`;
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
      button.textContent = String(score);
      button.classList.toggle('is-picked', score === Number(vote.score));
      button.setAttribute('aria-pressed', String(score === Number(vote.score)));
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

    // Etykiety nagród są w słowniku, więc przełączenie języka przerysowuje wszystko.
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
