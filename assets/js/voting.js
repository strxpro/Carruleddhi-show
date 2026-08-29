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
 *   2. pokazuje podium pod hero po zamknięciu głosowania;
 *   3. wstrzymuje zapisy na czas zjazdu.
 *
 * Samo ocenianie stoi na podstronie, bo tam nie ma licznika do dnia wydarzenia, formularza
 * zapisów ani czternastu innych sekcji — jest dwanaście nagród i lista pojazdów. To była
 * wprost zgłoszona potrzeba: „to jest w innej zakładce, podstronie".
 *
 * O FAZIE DECYDUJE SERWER. Patrz voting-core.js.
 */
import {
  $, $$, reducedMotion, demoMode, text, toast,
  stamp, remaining, readState, paintDemoBar
} from './voting-core.js';
import { AWARDS, awardLabelKey, awardNumber } from './awards.js';

(function () {
  'use strict';

  const state = {
    phase: 'scheduled',
    raceStartsAt: null,
    votingEndsAt: null,
    podium: [],
    /* Trzy pola pod „resztę głosów". Serwer odsyłał je od początku — ten plik po prostu
       czytał z odpowiedzi wyłącznie podium i wyrzucał resztę. */
    awards: [],
    results: [],
    participants: [],
    loaded: false
  };

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
      /* Starszy Worker odpowie bez `awards` — wtedy lokalna lista, tak samo jak na podstronie
         głosowania. Strona bez nazw nagród jest stroną, na której nie widać, co się wygrało. */
      awards: Array.isArray(result.awards) && result.awards.length ? result.awards : [...AWARDS],
      results: Array.isArray(result.results) ? result.results : [],
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
    paintRest();
    paintClock();
  }

  function paintPhase() {
    const voting = state.phase === 'voting';
    const closed = state.phase === 'closed';

    const podium = $('[data-podium]');
    if (podium) podium.hidden = !(closed && state.podium.length > 0);

    /* Reszta głosów chowa się razem z cokołem, ale ma własny warunek: bez `results` nie ma
       czego rozwijać, a zwijka otwierająca się na pustkę jest gorsza niż jej brak. */
    const rest = $('[data-podium-rest]');
    if (rest) {
      rest.hidden = !(closed && state.results.length > 0);
      // Zamknięta przy każdym wejściu w tę fazę: pierwsze, co ma być widać, to zwycięzca.
      if (rest.hidden) rest.open = false;
    }

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

  /**
   * Reszta głosów: dwanaście nagród, w każdej zwycięzca.
   *
   * Zwycięzca nagrody, nie pełna lista. Pełna stoi na `votazione.html` i tam ma zakładki —
   * tutaj chodzi o to, żeby ktoś, kto zobaczył cokół, zobaczył też, że nagród było dwanaście,
   * a nie jedna. Dwanaście list po dziesięć pozycji pod podium to strona, na której podium
   * przestaje być widoczne.
   *
   * Liczy się z `results` (średnia i liczba głosów na nagrodę) złączonych z `participants`
   * (nazwa i zdjęcie). Serwer nie skleja tego za nas, bo płaska lista nie powtarza uczestnika
   * dwanaście razy — patrz komentarz przy `results` w workerze.
   */
  function paintRest() {
    const list = $('[data-podium-awards]');
    if (!list) return;

    const byId = new Map(state.participants.map((row) => [row.id, row]));

    list.replaceChildren(...state.awards.map((award) => {
      const item = document.createElement('li');
      item.className = 'award-row';

      const number = document.createElement('span');
      number.className = 'award-row__number';
      number.textContent = awardNumber(award);

      const body = document.createElement('div');
      body.className = 'award-row__body';
      const name = document.createElement('strong');
      name.textContent = text(awardLabelKey(award));
      body.append(name);

      /* Najlepszy w tej nagrodzie. Ta sama reguła co na cokole: średnia, a przy remisie liczba
         głosów — inaczej jedna dziesiątka od jednej osoby biłaby osiem dziewiątek. */
      const best = state.results
        .filter((row) => row.award === award && row.voteCount > 0)
        .sort((a, b) => b.averageScore - a.averageScore || b.voteCount - a.voteCount)[0];

      if (!best) {
        const empty = document.createElement('span');
        empty.className = 'award-row__empty';
        empty.textContent = text('voting.restEmpty');
        body.append(empty);
        item.append(number, body);
        return item;
      }

      const winner = byId.get(best.participantId);
      const who = document.createElement('span');
      who.textContent = winner
        ? (winner.projectName || text('voting.noProject'))
        : text('voting.noProject');
      body.append(who);

      const stats = document.createElement('p');
      const average = document.createElement('b');
      average.textContent = best.averageScore ? best.averageScore.toFixed(2) : '—';
      const count = document.createElement('small');
      count.textContent = `${best.voteCount} ${text('voting.votes')}`;
      stats.append(average, count);

      item.append(number, body, stats);
      return item;
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
      ticker = window.setInterval(() => { paintClock(); watchStart(); }, 1000);
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
