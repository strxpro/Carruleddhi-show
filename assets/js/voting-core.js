/**
 * Wspólny spód głosowania: strona główna i podstrona.
 * ===========================================================================
 *
 * Powstał przy wyniesieniu głosowania na `votazione.html`. Dwie strony robią z tych samych
 * danych dwie różne rzeczy — główna pokazuje podium i zaproszenie, podstrona pozwala ocenić
 * dwanaście nagród — ale tożsamość urządzenia, słownik, odczyt stanu i pasek DEMO są jedne.
 * Drugi egzemplarz `deviceId()` znaczyłby dwie tożsamości tej samej przeglądarki, czyli
 * podwójny limit „jednego głosu".
 *
 * O FAZIE DECYDUJE SERWER, NIE ZEGAR PRZEGLĄDARKI — tak samo jak przed podziałem. Odliczanie
 * chodzi lokalnie, bo licznik tykający raz na sekundę nie może być żądaniem raz na sekundę,
 * ale „już wolno głosować" mówi wyłącznie `phase` z odpowiedzi Workera.
 */
import { demoVotingState } from './demo-content.js';

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Tryb demo: `?demo=1`.
 *
 * Wygrywa z serwerem i nie wysyła odczytu wcale. Parametr wpisuje człowiek i wpisuje go po
 * to, żeby zobaczyć demo — patrz komentarz przy `readState` niżej.
 */
export const demoMode = new URLSearchParams(window.location.search).get('demo') === '1';

export const api = () => window.CARRULEDDHI_API || null;
export const config = () => window.CARRULEDDHI_ACTIVE_CONFIG || null;

/** Ten sam słownik co reszta strony, z tym samym zapasem na włoski. */
export function text(key) {
  const bridge = api();
  if (bridge) return bridge.text(key);
  const all = window.CARRULEDDHI_I18N || {};
  const dict = all[document.documentElement.lang] || all.it || {};
  return dict[key] || (all.it || {})[key] || key;
}

/* Dłużej niż domyślne 4,2 s: komunikaty głosowania są zdaniami, nie jednym słowem, i część
   z nich odsyła do maila — trzeba je zdążyć przeczytać. */
export const toast = (message, tone = 'info') => api()?.toast?.(message, 5200, tone);

/* ------------------------------------------------------------------ tożsamość urządzenia */

/**
 * Identyfikator urządzenia, wymagany przez limit „jeden głos na nagrodę".
 *
 * Najpierw ten, którym strona już się posługuje przy „ci sarò" — jedno urządzenie ma mieć
 * jedną tożsamość, a nie dwie zależnie od tego, co robi. Ale tamten ma zapasową postać
 * `visitor-<czas>-<losowe>` dla przeglądarek bez crypto.randomUUID, a baza wymaga 32–36
 * znaków (migracja 0022), więc taka wartość zostałaby odrzucona dopiero przy oddawaniu
 * głosu. Sprawdzany jest więc kształt, nie samo istnienie.
 */
let sessionDeviceId = '';

export function deviceId() {
  const shaped = (value) => /^[0-9a-f-]{32,36}$/.test(String(value || '').toLowerCase());

  const shared = readStore('carruleddhi.visitorId');
  if (shaped(shared)) return String(shared).toLowerCase();

  const own = readStore('carruleddhi.voteDevice');
  if (shaped(own)) return String(own).toLowerCase();
  if (shaped(sessionDeviceId)) return sessionDeviceId;

  /* Keep one identity in memory when storage is blocked. Web Crypto is preferred, but the
     final fallback still has the exact 32-hex shape required by the database. */
  const cryptoApi = globalThis.crypto;
  const fresh = cryptoApi?.randomUUID?.()
    || (cryptoApi?.getRandomValues
      ? [...cryptoApi.getRandomValues(new Uint8Array(16))]
        .map((byte) => byte.toString(16).padStart(2, '0')).join('')
      : Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join(''));
  sessionDeviceId = fresh.toLowerCase();
  writeStore('carruleddhi.voteDevice', sessionDeviceId);
  return sessionDeviceId;
}

export function readStore(key) {
  try { return localStorage.getItem(key); } catch (_) { return null; }
}
export function writeStore(key, value) {
  try { localStorage.setItem(key, value); } catch (_) { /* Storage may be blocked. */ }
}

/* --------------------------------------------------------------- zapamiętany głosujący */

const VOTER_KEY = 'carruleddhi.voter';

/**
 * Imię i adres z poprzedniego głosu na tym urządzeniu.
 *
 * Dwanaście nagród znaczy do dwunastu razy to samo pole e-mail. Przepisywanie adresu
 * dwanaście razy na telefonie jest głównym powodem, dla którego ktoś odda jeden głos i
 * zamknie stronę — więc adres jest podpowiadany, ale NIE jest wysyłany po cichu: podstrona
 * pyta „ten adres czy inny", bo z jednego telefonu głosuje cała rodzina.
 *
 * W localStorage, nie w ciasteczku: nie jedzie z każdym żądaniem i nie wymaga zgody na
 * ciasteczka niekonieczne — to jest zapamiętane wypełnienie formularza, nie ślad.
 */
export function savedVoter() {
  try {
    const raw = JSON.parse(readStore(VOTER_KEY) || 'null');
    const email = String(raw?.email || '').trim().toLowerCase();
    const name = String(raw?.name || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
    return { name, email };
  } catch (_) {
    return null;
  }
}

export function rememberVoter(name, email) {
  writeStore(VOTER_KEY, JSON.stringify({
    name: String(name || '').trim(),
    email: String(email || '').trim().toLowerCase()
  }));
}

export function forgetVoter() {
  try { localStorage.removeItem(VOTER_KEY); } catch (_) { /* Storage may be blocked. */ }
}

/* ------------------------------------------------------------------------- odliczanie */

export const stamp = (value) => {
  const time = Date.parse(String(value || ''));
  return Number.isNaN(time) ? null : time;
};

/** Ile zostało, po ludzku. Godziny pomijane, gdy ich nie ma — „00 h 04 m" to nie zdanie. */
export function remaining(milliseconds) {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value) => String(value).padStart(2, '0');
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/* ---------------------------------------------------------------------- odczyt stanu */

/**
 * Stan głosowania: z Workera albo z demo.
 *
 * `?demo=1` WYGRYWA Z SERWEREM i nie wysyła odczytu wcale.
 *   Wcześniej demo wchodziło na ekran tylko wtedy, gdy odczyt się nie udał — a na produkcji
 *   Worker odpowiada `{"ok":true,"phase":"scheduled","participants":[]}`, więc odczyt się
 *   udawał, demo było zdejmowane i na stronie z `?demo=1` nie było DOKŁADNIE NIC. Parametr
 *   wpisuje człowiek po to, żeby zobaczyć demo; nie ma tu dwóch prawd do pogodzenia.
 *
 * Zwraca `null`, gdy nie ma czego pokazać. `null` znaczy „zostaw ekran taki, jaki był" —
 * przed pierwszym udanym odczytem to jest strona bez głosowania, czyli dokładnie to, co widać
 * przez cały rok poza dniem wyścigu.
 */
export async function readState(demoPhase = 'scheduled', edition = '') {
  if (demoMode) return demoVotingState(demoPhase);

  const bridge = api();
  const endpoint = config()?.endpoints?.voting;
  if (!bridge || !endpoint) return null;
  try {
    const result = await bridge.post(endpoint, bridge.payload('voting', {
      action: 'state',
      deviceId: deviceId(),
      ...(edition ? { edition } : {})
    }));
    // Brak Workera odpowiada `{ ok, demo }` bez fazy — patrz postJSON w app.js.
    if (!result?.ok || !result.phase) return null;
    return result;
  } catch (error) {
    console.warn('Voting state unavailable:', error);
    return null;
  }
}

/* ------------------------------------------------------------------------- pasek DEMO */

/**
 * Przełącznik faz, tylko w trybie demo. Jeden na stronę, budowany z JavaScriptu.
 *
 * Z JS, a nie ze znacznika — czego nie ma w znaczniku, to nie może pojawić się bez parametru
 * w adresie. Zwijany do jednej pigułki, bo zmierzone na 390×844: przyciski miały 29 px
 * wysokości przy zalecanym minimum 44, napisy zawijały się do trzech rzędów zabierając 90 px,
 * a baner cookies zajmuje ten sam dolny róg (375 px wysokości).
 *
 * @param {object} options
 * @param {() => string} options.phase       aktualna faza demo
 * @param {(phase: string) => void} options.onPhase  wybrano fazę
 * @param {() => void} [options.onSkip]      „zakończ odliczanie"; bez tego przycisku nie ma
 */
export function paintDemoBar({ phase, onPhase, onSkip }) {
  const existing = $('[data-voting-demo]');
  if (existing) {
    $$('button[data-demo-phase]', existing).forEach((button) => {
      const active = button.dataset.demoPhase === phase();
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    // Skrót „zakończ odliczanie" ma sens tylko wtedy, gdy jest co kończyć.
    const skip = $('[data-demo-skip]', existing);
    if (skip) skip.hidden = phase() !== 'scheduled';
    return;
  }

  const bar = document.createElement('div');
  bar.className = 'voting-demo';
  bar.dataset.votingDemo = '';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'DEMO');

  const isWide = () => window.matchMedia('(min-width: 761px)').matches;

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
  toggle.addEventListener('click', () => { open = !open; paintOpen(); });
  bar.append(toggle, phases);

  for (const [value, key] of [
    ['scheduled', 'voting.demoScheduled'],
    ['voting', 'voting.demoVoting'],
    ['closed', 'voting.demoClosed']
  ]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.demoPhase = value;
    button.textContent = text(key);
    button.addEventListener('click', () => {
      onPhase(value);
      /* Na telefonie zwija się po wyborze: fazę wybiera się po to, żeby ZOBACZYĆ, co się
         zmieniło, a rozwinięta lista zasłania dolną trzecią ekranu. */
      if (!isWide()) { open = false; paintOpen(); }
    });
    phases.append(button);
  }

  if (onSkip) {
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.dataset.demoSkip = '';
    skip.className = 'voting-demo__skip';
    skip.textContent = text('voting.demoSkip');
    skip.addEventListener('click', () => {
      onSkip();
      if (!isWide()) { open = false; paintOpen(); }
    });
    /* Wewnątrz zwijanej części: zwinięty pasek ma być szerokością słowa DEMO, a ten napis
       jest najdłuższy z wszystkich i sam zawinąłby pasek do dwóch rzędów. */
    phases.append(skip);
  }

  /**
   * Podniesienie nad baner cookies, liczone z pomiaru.
   *
   * Baner zajmuje na telefonie 375 px — 44% ekranu — i stoi w tym samym dolnym rogu. Nie da
   * się tego rozstrzygnąć regułą z wpisaną liczbą, bo wysokość zależy od języka i od tego, czy
   * rozwinięto ustawienia. Przenoszenie paska pod nagłówek było błędem: nagłówek na telefonie
   * stoi od 30 do 96 px, a pasek trafiał na 74 px, czyli na nagłówek.
   */
  const lift = () => {
    const banner = document.querySelector('[data-cookie-banner]');
    const shown = banner && getComputedStyle(banner).display !== 'none';
    const height = shown ? Math.ceil(banner.getBoundingClientRect().height) + 12 : 0;
    bar.style.setProperty('--demo-lift', `${height}px`);
  };
  lift();

  const banner = document.querySelector('[data-cookie-banner]');
  if (banner) {
    /* Dwa różne zdarzenia, bo to dwie różne zmiany: klasa `is-visible` decyduje, CZY baner
       jest, a rozmiar zmienia się przy rozwinięciu ustawień i przy zmianie języka. */
    new MutationObserver(lift).observe(banner, { attributes: true, attributeFilter: ['class', 'style'] });
    if (window.ResizeObserver) new ResizeObserver(lift).observe(banner);
  }
  window.addEventListener('resize', lift, { passive: true });

  paintOpen();
  document.body.append(bar);
  paintDemoBar({ phase, onPhase, onSkip });
}

/* ===========================================================================
   Zastępcze zdjęcie uczestnika
   ===========================================================================
   Nie każdy wóz ma fotografię: organizator dopisuje ludzi w dniu zawodów z telefonu na
   zboczu i zdjęcie bywa ostatnią rzeczą, na którą jest czas. Pusty prostokąt w liście
   wyników wygląda jak błąd wczytywania, a nie jak brak zdjęcia.

   RYSUNEK, NIE FOTOGRAFIA Z BANKU
   Ta sama reguła co w demo: plaża udająca czyjś carruleddhu wprowadza w błąd. To jest
   jawnie rysowany kafelek z numerem startowym — nikt nie weźmie go za zdjęcie.

   „LOSOWY", ALE STAŁY
   Kolor bierze się z numeru startowego, nie z Math.random(). Losowy przy każdym rysowaniu
   znaczyłby inny awatar po każdym doczytaniu listy i przy przejściu z siatki na cokół —
   czyli migotanie tam, gdzie ma być rozpoznawalność. Ten sam wóz ma zawsze ten sam kafelek.

   Mnożnik 137 to liczba obrotów blisko złotego kąta: kolejne numery startowe dostają przez
   to kolory odległe na kole barw, więc 007 i 008 nie są dwoma odcieniami tego samego. */
export function avatarFor(row) {
  const number = String(row?.startNumber ?? '').padStart(3, '0');
  const hue = (Number(row?.startNumber) || 0) * 137 % 360;
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90">',
    '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">',
    `<stop offset="0" stop-color="hsl(${hue} 72% 82%)"/>`,
    `<stop offset="1" stop-color="hsl(${hue} 58% 64%)"/>`,
    '</linearGradient></defs>',
    '<rect width="120" height="90" fill="url(#g)"/>',
    /* Wózek jednym konturem: buda, dwa koła. Tyle wystarczy, żeby kafelek czytał się jako
       carruleddhu, a nie jako brakujący obrazek. */
    `<path d="M26 58h68l-8-18H34z" fill="hsl(${hue} 45% 32%)" opacity=".28"/>`,
    `<circle cx="40" cy="64" r="8" fill="hsl(${hue} 45% 32%)" opacity=".38"/>`,
    `<circle cx="80" cy="64" r="8" fill="hsl(${hue} 45% 32%)" opacity=".38"/>`,
    `<text x="60" y="40" text-anchor="middle" font-family="system-ui,sans-serif" font-size="30" font-weight="900" fill="hsl(${hue} 50% 26%)" opacity=".55">${number}</text>`,
    '</svg>'
  ].join('');
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Odmiana słowa „głos" przez liczbę.
 * ---------------------------------------------------------------------------
 * Zmierzone na produkcji przy pierwszym prawdziwym głosie: „10 PUNTI · 1 VOTI · MEDIA 10.0".
 * „1 voti" to po włosku błąd, a nie skrót — i stoi na cokole, czyli w jedynym miejscu, na
 * które tego dnia patrzy cały plac.
 *
 * Nie da się tego załatwić jedną formą w słowniku, bo języki nie zgadzają się co do tego, ile
 * ich mają: włoski, angielski, niemiecki, hiszpański i francuski dwie, a polski trzy —
 * 1 głos, 2–4 głosy, 5+ głosów. Ręczne `if (n === 1)` dałoby więc „5 głosy".
 *
 * `Intl.PluralRules` zna te reguły dla każdego z sześciu języków i jest w każdej przeglądarce,
 * która obsługuje resztę tej strony. Kategoria `many` (polskie 5+) spada na `voting.votes`,
 * czyli formę, która już w słowniku była — dlatego istniejące tłumaczenia zostają nietknięte.
 */
/* ===========================================================================
   REMIS PUNKTOWY: POWIEDZIEĆ, CO ROZSTRZYGNĘŁO
   ===========================================================================
   Dwa wozy z tą samą sumą punktów stoją jeden nad drugim i do tej pory nic na ekranie nie
   mówiło dlaczego. Z zewnątrz wygląda to na losowe albo na błąd — a jest to najstarszy
   sposób, w jaki wynik traci zaufanie: nie przez pomyłkę, tylko przez brak wyjaśnienia.

   Kolejność rozstrzyga zawsze ten sam łańcuch, w bazie (migracja 0030), w Workerze
   (votingAdminWinners) i tutaj: suma punktów → liczba głosów → średnia → numer startowy.
   Ta funkcja szuka PIERWSZEGO ogniwa, które w danej grupie remisujących naprawdę je
   rozdzieliło, i zwraca jego nazwę. Nie zgaduje i nie tłumaczy całego łańcucha: mówi to
   jedno, co zadecydowało tutaj.

   Grupa, nie para. Trzy wozy po 268 punktów to jedna grupa i jedno kryterium na wszystkie
   trzy — inaczej sąsiednie kafelki nosiłyby dwa różne wyjaśnienia tego samego remisu.

   CAŁA STAWKA, NIE SAMA TRÓJKA, I TO JEST TU NAJWAŻNIEJSZE
     Remis, który naprawdę wymaga wyjaśnienia, wypada na GRANICY cokołu: trzeci i czwarty
     z tą samą sumą punktów, jeden na podium i drugi pod nim. Liczony po samym
     `state.podium` taki remis jest niewidoczny, bo czwartego w tej tablicy nie ma — czyli
     jedyny przypadek, o który ktoś naprawdę zapyta, byłby jedynym, którego nie widać.
     W danych demonstracyjnych ta para stoi na trzecim i czwartym miejscu z rozmysłu.

     Dlatego wejściem jest pełna posortowana stawka, a wyjściem mapa po `id`: cokół i
     siatka pod nim biorą z niej to, co dotyczy ich własnych wierszy.

   @param {Array} rows  CAŁA stawka posortowana tak, jak stoi na ekranie
   @returns {Map<string, string>} id wiersza → gotowa linijka; remisujący tylko
*/
export function tieNotes(rows) {
  const notes = new Map();
  let start = 0;

  while (start < rows.length) {
    let end = start;
    while (end + 1 < rows.length
      && Number(rows[end + 1].totalScore) === Number(rows[start].totalScore)) end += 1;

    // Remis liczy się tylko wtedy, gdy ktoś w ogóle zagłosował: wozy po zero punktów nie są
    // remisem do rozstrzygnięcia, tylko wozami bez głosów.
    if (end > start && Number(rows[start].voteCount) > 0) {
      const group = rows.slice(start, end + 1);
      const varies = (pick) => new Set(group.map((row) => Number(pick(row)))).size > 1;
      const key = varies((row) => row.voteCount) ? 'voting.tieVotes'
        : varies((row) => row.averageScore) ? 'voting.tieAvg'
          : 'voting.tieNumber';
      /* Ostatnie ogniwo nie ma warunku: numery startowe są unikalne, więc jeśli łańcuch
         doszedł aż tutaj, to one rozdzieliły grupę i nic innego nie mogło. */
      const line = `${text('voting.tie')} · ${text('voting.tieAhead')}: ${text(key)}`;
      for (const row of group) notes.set(row.id, line);
    }
    start = end + 1;
  }
  return notes;
}

export function votesLabel(count) {
  const lang = document.documentElement.lang || 'it';
  let form = 'other';
  try {
    form = new Intl.PluralRules(lang).select(Number(count) || 0);
  } catch (_) {
    /* Nieznany język albo brak Intl — zostaje forma mnoga, czyli to, co było wcześniej. */
  }
  if (form === 'one') return text('voting.voteOne');
  if (form === 'few') return text('voting.voteFew');
  return text('voting.votes');
}
