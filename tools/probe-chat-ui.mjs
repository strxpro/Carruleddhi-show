/**
 * Czat: bramka, podpowiedzi, brak duplikatów, brak przeskoków przy pisaniu.
 *
 *     node tools/probe-chat-ui.mjs http://127.0.0.1:4173
 *
 * PO CO
 *   Duplikaty wiadomości były niewidoczne z kodu: optymistyczny bąbel nie miał id, więc
 *   polling po kilku sekundach dokładał wersję z bazy. Żeby to zobaczyć, trzeba wysłać
 *   wiadomość i poczekać dłużej niż jeden cykl pollingu — czego żaden test jednostkowy nie
 *   zrobi, bo tam nie ma ani bazy, ani zegara.
 *
 *   Endpoint w podglądzie nie odpowiada (brak backendu), więc część rzeczy jest sprawdzana
 *   przez sam interfejs: czy log i pole są zasłonięte przed podaniem danych, czy po podaniu
 *   się odsłaniają, czy podpowiedzi są schowane i rozwijają się, i czy pisanie w polu nie
 *   zmienia pozycji przewijania strony.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.argv[2] || 'http://127.0.0.1:4173';

function chromePath() {
  const candidates = [
    join(process.env.ProgramFiles || '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env['ProgramFiles(x86)'] || '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env.ProgramFiles || '', 'Microsoft/Edge/Application/msedge.exe')
  ];
  const found = candidates.find((path) => path && existsSync(path));
  if (!found) throw new Error('Nie znalazłem Chrome ani Edge.');
  return found;
}

const probe = `
<script>
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { errors: [] };
  window.addEventListener('error', (e) => out.errors.push(String(e.message)));

  // Czyste wejscie: bramka ma sie pokazac, wiec zapamietane dane trzeba usunac.
  try {
    localStorage.removeItem('carruleddhi.chat.name');
    localStorage.removeItem('carruleddhi.chat.email');
  } catch (_) {}

  await sleep(2400);

  const kill = document.createElement('style');
  kill.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}';
  document.head.appendChild(kill);

  const tab = document.querySelector('[data-contact-tab="chat"]');
  const panel = document.querySelector('[data-chat]');
  if (!tab || !panel) {
    out.errors.push('brak zakladki albo panelu czatu');
  } else {
    document.getElementById('contact')?.scrollIntoView();
    await sleep(300);
    tab.click();
    await sleep(500);

    const gate = document.querySelector('[data-chat-gate]');
    const log = document.querySelector('[data-chat-log]');
    const form = document.querySelector('[data-chat-form]');
    const chips = document.querySelector('[data-chat-chips]');

    out.beforeGate = {
      gateVisible: gate ? !gate.hidden : null,
      logHidden: log ? log.hidden : null,
      formHidden: form ? form.hidden : null,
      chipsHidden: chips ? chips.hidden : null,
      ready: panel.dataset.chatReady || ''
    };

    // Zla walidacja: pusty formularz nie ma przepuscic.
    document.querySelector('[data-chat-gate-form] button[type=submit]')?.click();
    await sleep(250);
    out.emptySubmit = {
      stillGated: gate ? !gate.hidden : null,
      errors: [...document.querySelectorAll('[data-chat-gate] [data-error]')]
        .map((e) => e.textContent.trim()).filter(Boolean)
    };

    // Zly adres.
    const nameField = document.getElementById('chat-gate-name');
    const emailField = document.getElementById('chat-gate-email');
    nameField.value = 'Marco';
    emailField.value = 'nie-adres';
    document.querySelector('[data-chat-gate-form] button[type=submit]').click();
    await sleep(250);
    out.badEmail = {
      stillGated: gate ? !gate.hidden : null,
      errors: [...document.querySelectorAll('[data-chat-gate] [data-error]')]
        .map((e) => e.textContent.trim()).filter(Boolean)
    };

    // Poprawne dane.
    emailField.value = 'marco@example.com';
    document.querySelector('[data-chat-gate-form] button[type=submit]').click();
    await sleep(600);
    out.afterGate = {
      gateHidden: gate ? gate.hidden : null,
      logHidden: log ? log.hidden : null,
      formHidden: form ? form.hidden : null,
      chipsHidden: chips ? chips.hidden : null,
      ready: panel.dataset.chatReady || '',
      stored: {
        name: localStorage.getItem('carruleddhi.chat.name'),
        email: localStorage.getItem('carruleddhi.chat.email')
      }
    };

    // Podpowiedzi: schowane, rozwijaja sie, ile ich jest.
    const toggle = document.querySelector('[data-chat-chips-toggle]');
    const list = document.querySelector('[data-chat-chips-list]');
    out.chips = {
      count: list ? list.querySelectorAll('.chat__chip').length : 0,
      closedHeight: list ? Math.round(list.getBoundingClientRect().height) : null,
      labels: list ? [...list.querySelectorAll('.chat__chip')].map((c) => c.textContent.trim()) : []
    };
    toggle?.click();
    await sleep(300);
    out.chips.openHeight = list ? Math.round(list.getBoundingClientRect().height) : null;
    // Czy ktorykolwiek chip jest przyciety: szerokosc tekstu wieksza niz pudelko.
    out.chips.clipped = list
      ? [...list.querySelectorAll('.chat__chip')].filter((c) => c.scrollWidth > c.clientWidth + 1).length
      : 0;

    // Pisanie nie moze przesuwac strony.
    const input = document.querySelector('[data-chat-input]');
    if (input) {
      window.scrollTo(0, Math.round(document.body.scrollHeight * 0.55));
      await sleep(300);
      const before = Math.round(window.scrollY);
      const panelBefore = document.getElementById('contact')?.dataset.panel || '';
      for (const chunk of ['Dzien dobry, ', 'mam pytanie o kask ', 'i o numer startowy, ',
                           'bo chcialbym zapisac sie z kolega ', 'i nie wiem jak to zrobic.']) {
        input.value += chunk;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(120);
      }
      await sleep(500);
      out.typing = {
        scrollBefore: before,
        scrollAfter: Math.round(window.scrollY),
        panelBefore,
        panelAfter: document.getElementById('contact')?.dataset.panel || '',
        inputHeight: Math.round(input.getBoundingClientRect().height),
        // Pasek przewijania w polu: ma go nie byc widac.
        inputOverflow: getComputedStyle(input).scrollbarWidth || '(nieznane)'
      };
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Wysylka: endpoint w podgladzie nie odpowiada, wiec sprawdzamy dwie rzeczy, ktore
    // dzialaja bez serwera - czy pojawia sie wskaznik pisania i czy jedno kliknieciem nie
    // powstaja dwie banki.
    if (input) {
      input.value = 'test jednej wiadomosci';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const sendBtn = document.querySelector('[data-chat-send]');
      sendBtn.click();
      /* Odczyt natychmiast, bez sleep. Wskaznik jest dodawany synchronicznie, jeszcze przed
         await na zapytaniu, i zdejmowany w finally — a w podgladzie nie ma backendu, wiec
         zapytanie odbija sie w kilka milisekund. Kazde czekanie tutaj mierzyloby juz stan po
         nieudanej wysylce, nie sam wskaznik. */
      const typingShown = Boolean(document.querySelector('.chat-typing'));
      // Drugie kliknięcie w trakcie pierwszego: tego ma nie przepuscic blokada.
      sendBtn.click();
      await sleep(120);
      out.doubleSend = {
        typingShown,
        visitorBubbles: document.querySelectorAll('.chat-msg--visitor').length
      };
      await sleep(2500);
      out.doubleSend.visitorBubblesLater = document.querySelectorAll('.chat-msg--visitor').length;
      out.doubleSend.typingGone = !document.querySelector('.chat-typing');
    }

    /* ====================================================================
       POZYCJA PRZEWINIĘCIA PO KAŻDYM RODZAJU KLIKNIĘCIA
       ====================================================================
       Zgłoszone jako „kliknięcie CZEGOKOLWIEK w czacie przewija stronę na samą górę".
       Mierzone jest to, co zgłoszono: window.scrollY przed i po każdej kontrolce.

       Razem z pozycją zapisywany jest ELEMENT Z FOKUSEM. To nie jest ciekawostka: fokus
       spadający na body — bo kliknięta pastylka została usunięta z drzewa albo przycisk
       wysyłki został zablokowany — jest jedynym mechanizmem w tym panelu, który potrafi ruszyć
       stronę na telefonie (zwinięta klawiatura zmienia wysokość dokumentu złożonego z sekcji
       mierzonych od wysokości ekranu). Zmierzone przed poprawką: po naciśnięciu pastylki
       i po naciśnięciu „wyślij" document.activeElement był body.
       ==================================================================== */
    out.clicks = [];
    const focusName = () => {
      const el = document.activeElement;
      if (!el || el === document.body) return 'BODY';
      return el.tagName + (el.className ? '.' + String(el.className).split(' ')[0] : '');
    };
    const clickAt = async (label, selector, prepare) => {
      const node = document.querySelector(selector);
      if (!node) { out.clicks.push({ label, missing: true }); return; }
      window.scrollTo(0, Math.round(document.body.scrollHeight * 0.55));
      await sleep(300);
      if (prepare) prepare();
      const before = Math.round(window.scrollY);
      node.click();
      await sleep(80);
      const mid = Math.round(window.scrollY);
      const focus = focusName();
      await sleep(700);
      out.clicks.push({ label, before, mid, after: Math.round(window.scrollY), focus });
    };

    const writeInput = (value) => {
      const field = document.querySelector('[data-chat-input]');
      if (!field) return;
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    };

    await clickAt('podpowiedzi (rozwiń)', '[data-chat-chips-toggle]');
    await clickAt('pastylka', '[data-chat-chips-list] .chat__chip');
    await clickAt('wyślij', '[data-chat-send]', () => writeInput('pomiar przewinięcia'));
    await clickAt('pole tekstowe', '[data-chat-input]');
    await clickAt('zakończ rozmowę (zbrojenie)', '[data-chat-end]');
    await clickAt('zakończ rozmowę (potwierdzenie)', '[data-chat-end]');
    await clickAt('nowa rozmowa', '[data-chat-restart]');

    /* ====================================================================
       KROPKI PRZY ODPOWIEDZI AUTOMATU I BĄBELEK PO PASTYLCE
       ====================================================================
       Podstawiona JEDNA rzecz — odpowiedź czatu ze znacznikiem selfService — dokładnie tak
       jak w tools/probe-chat-gate.mjs i z tego samego powodu: kreator sponsora otwiera
       serwer, a bez tego jednego skoku nie ma czego mierzyć. Reszta żądań leci dalej.
       ==================================================================== */
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = String(typeof input === 'string' ? input : input?.url || '');
      if (url.includes('/api/carruleddhi/chat')) {
        let payload = {};
        try { payload = JSON.parse(init?.body || '{}'); } catch (_) {}
        if (payload.action === 'send') {
          return new Response(
            JSON.stringify({ ok: true, mode: 'ai', reply: null, selfService: 'sponsor' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ ok: true, mode: 'ai', messages: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return realFetch(input, init);
    };

    // Po „nowej rozmowie" bramka stoi znowu — wchodzimy tak jak człowiek.
    const nameAgain = document.getElementById('chat-gate-name');
    const emailAgain = document.getElementById('chat-gate-email');
    if (nameAgain && emailAgain) {
      nameAgain.value = 'Marco';
      emailAgain.value = 'marco@example.com';
      document.querySelector('[data-chat-gate-form] button[type=submit]').click();
      await sleep(700);
    }

    const T = (key) => String(window.CARRULEDDHI_API?.text(key) || '');
    const chipByKey = (key) => [...document.querySelectorAll('[data-chat-chips-list] .chat__chip')]
      .find((c) => c.textContent.trim() === T(key).trim());
    const bubbles = () => document.querySelectorAll('.chat-msg--visitor').length;
    const lastVisitor = () => {
      const all = document.querySelectorAll('.chat-msg--visitor .chat-msg__body');
      return all.length ? all[all.length - 1].textContent.trim() : '';
    };
    const say = async (message) => {
      writeInput(message);
      document.querySelector('[data-chat-send]')?.click();
      await sleep(600);
    };

    await say('Chcialbym zostac sponsorem Carruleddhi Show.');

    const yes = chipByKey('chat.sponsorYes');
    if (!yes) {
      out.errors.push('kreator sponsora sie nie otworzyl');
    } else {
      const bubblesBefore = bubbles();
      const label = yes.textContent.trim();
      yes.click();
      /* Odczyt po 60 ms, nie natychmiast: kolejka wypowiedzi automatu jest obietnicą, więc
         kropki wchodzą w następnym zadaniu mikrokolejki, a nie w tym samym co kliknięcie.
         Przed 280 ms (THINK_MS w app.js) mają jeszcze stać. */
      await sleep(60);
      out.pill = {
        typingShown: Boolean(document.querySelector('.chat-typing')),
        bubbleAdded: bubbles() - bubblesBefore,
        bubbleText: lastVisitor(),
        label
      };
      await sleep(900);
      out.pill.typingGone = !document.querySelector('.chat-typing');
      out.pill.answered = String(document.querySelector('[data-chat-log]')?.textContent || '')
        .includes(T('chat.sponsorAskName').slice(0, 24));
    }

    // Do bramki: nazwa, zgoda, imię i nazwisko, pominięty telefon, adres.
    await say('Trattoria Probe');
    chipByKey('chat.sponsorConsentYes')?.click();
    await sleep(500);
    await say('Mario Rossi');
    chipByKey('chat.sponsorPhoneSkip')?.click();
    await sleep(500);
    await say('probe@example.com');
    await sleep(900);

    const codeField = document.querySelector('[data-chat-code]');
    out.codeBubble = { fieldThere: Boolean(codeField) };
    if (codeField) {
      const before = bubbles();
      codeField.value = '123456';
      codeField.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(900);
      out.codeBubble.bubblesDelta = bubbles() - before;
      out.codeBubble.codeInLog = String(document.querySelector('[data-chat-log]')?.textContent || '')
        .includes('123456');
    }

    /* ====================================================================
       KLAWIATURA NA TELEFONIE: NIC NIE NACHODZI I WSZYSTKO SIĘ MIEŚCI
       ====================================================================
       Klawiatura zabiera na 390x844 mniej więcej połowę ekranu. Strona ma jedno źródło prawdy
       o wysokości ekranu — zmienną --screen-h, mierzoną w site-bridge.js jako 100svh
       i przepisywaną przy każdej zmianie okna — więc podstawienie tu 380 px jest dokładnie tym
       stanem, w którym CSS czatu jest przy otwartej klawiaturze. Dlatego pomiar nie potrzebuje
       drugiego okna przeglądarki i mierzy to samo.

       Zmierzone przed poprawką (okno 390x844 skrócone do 444 px przez CDP): sufit dziennika
       schodził do 168,72 px, a dziennik zostawał na 180 px, bo minimalna wysokość WYGRYWA
       z maksymalną. Cały czat miał 469 px przy 444 px widocznego obszaru — rząd pastylek
       i kompozytor z przyciskiem wysyłki były pod klawiaturą.
       ==================================================================== */
    /* PODSTAWIANE JEST --chat-vh, NIE --screen-h, I TO NIE JEST DROBIAZG.
       ---------------------------------------------------------------------------
       Klawiatura systemowa NIE zmienia 100svh ani innerHeight — skraca wyłącznie
       visualViewport. Dlatego arkusz czatu liczy sufity z --chat-vh, którą app.js wpisuje
       z widocznej wysokości okna (patrz measureChatViewport), a --screen-h zostaje zamrożona
       dla układu sekcji. Podstawienie tu --screen-h mierzyłoby więc stan, który na telefonie
       nigdy nie zachodzi; ta sonda sprawdza kaskadę, a pomiar przy prawdziwej zmianie widoku
       robi tools/probe-chat-flows.mjs na oknie 390x844. */
    const root = document.documentElement;
    const realScreen = root.style.getPropertyValue('--chat-vh');
    root.style.setProperty('--chat-vh', '380px');
    // Rząd podpowiedzi zwinięty: to jest stan, w którym się pisze wiadomość.
    document.querySelector('[data-chat-chips]')?.classList.remove('is-open');
    writeInput('Chcialbym zapytac o kask, o numer startowy i o to, czy moge zapisac sie z kolega '
      + 'oraz czy wozek musi miec hamulec z linka, bo buduje go z tata w garazu.');
    await sleep(400);

    {
      const box = (selector) => {
        const el = document.querySelector(selector);
        if (!el || el.hidden) return null;
        const r = el.getBoundingClientRect();
        return {
          top: Math.round(r.top), bottom: Math.round(r.bottom),
          height: Math.round(r.height), width: Math.round(r.width)
        };
      };
      const overlap = (a, b) => (a && b
        ? Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
        : 0);
      const logBox = box('[data-chat-log]');
      const chipsBox = box('[data-chat-chips]');
      const composerBox = box('[data-chat-form]');
      const sendBox = box('[data-chat-send]');
      const noteBox = box('[data-chat-note]');
      out.keyboard = {
        screen: 380,
        log: logBox,
        chips: chipsBox,
        composer: composerBox,
        send: sendBox,
        note: noteBox,
        logCap: getComputedStyle(document.querySelector('[data-chat-log]')).maxHeight,
        inputCap: getComputedStyle(document.querySelector('[data-chat-input]')).maxHeight,
        inputHeight: Math.round(document.querySelector('[data-chat-input]').getBoundingClientRect().height),
        overlaps: {
          logChips: overlap(logBox, chipsBox),
          chipsComposer: overlap(chipsBox, composerBox),
          composerNote: overlap(composerBox, noteBox)
        },
        // Od góry dziennika do dołu notki: tyle miejsca czat potrzebuje przy otwartej klawiaturze.
        total: (logBox && noteBox) ? noteBox.bottom - logBox.top : -1
      };
    }
    if (realScreen) root.style.setProperty('--chat-vh', realScreen);
    else root.style.removeProperty('--chat-vh');
    writeInput('');

    /* ====================================================================
       ROZMOWA PRZEKAZANA CZŁOWIEKOWI I POWRÓT DO AUTOMATU
       ====================================================================
       Tu podstawiony jest drugi skok: odpowiedź czatu z trybem human, czyli to, co Worker
       oddaje po prośbie o człowieka. Sprawdzana jest POŁOWA PO STRONIE STRONY — czy stan
       widać i czy da się z niego wyjść jednym przyciskiem. Cisza automatu jest decyzją
       Workera i tu jej nie ma czym zmierzyć: podglądowy serwer nie ma backendu.
       ==================================================================== */
    let botCalls = 0;
    /* Podstawiony serwer TRZYMA STAN, tak jak prawdziwy: po żądaniu powrotu oddaje już tryb
       automatu. Bez tego odczyt, który wypada cztery sekundy później, przywracałby tryb
       człowieka — i sonda mierzyłaby kłamstwo atrapy, nie zachowanie strony. */
    let stubMode = 'human';
    window.fetch = async (input, init) => {
      const url = String(typeof input === 'string' ? input : input?.url || '');
      if (url.includes('/api/carruleddhi/chat')) {
        let payload = {};
        try { payload = JSON.parse(init?.body || '{}'); } catch (_) {}
        if (payload.action === 'bot') {
          botCalls += 1;
          stubMode = 'ai';
          return new Response(JSON.stringify({ ok: true, mode: 'ai' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (payload.action === 'send') {
          stubMode = 'human';
          return new Response(
            JSON.stringify({ ok: true, mode: 'human', handedOver: true, reply: 'Przekazuję to organizatorom.' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ ok: true, mode: stubMode, messages: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return realFetch(input, init);
    };

    await say('Chcialbym porozmawiac z czlowiekiem.');
    const toBot = document.querySelector('[data-chat-to-bot]');
    out.handover = {
      buttonThere: Boolean(toBot),
      buttonVisible: Boolean(toBot) && toBot.hidden === false,
      buttonLabel: toBot ? toBot.textContent.trim() : '',
      expectedLabel: T('chat.toBot').trim(),
      panelMode: document.querySelector('[data-chat]')?.dataset.chatMode || '',
      noticeShown: String(document.querySelector('[data-chat-log]')?.textContent || '')
        .includes(T('chat.handedOver').slice(0, 24)),
      scrollBefore: Math.round(window.scrollY)
    };
    if (toBot && !toBot.hidden) {
      toBot.click();
      await sleep(900);
      out.handover.botCalls = botCalls;
      out.handover.buttonGone = toBot.hidden === true;
      out.handover.panelModeAfter = document.querySelector('[data-chat]')?.dataset.chatMode || '';
      out.handover.backLine = String(document.querySelector('[data-chat-log]')?.textContent || '')
        .includes(T('chat.toBotDone').slice(0, 24));
      out.handover.scrollAfter = Math.round(window.scrollY);
      out.handover.focus = focusName();
    }
  }

  const marker = document.createElement('pre');
  marker.id = 'probe-result';
  marker.textContent = JSON.stringify(out, null, 1);
  document.body.appendChild(marker);
})();
</script>
`;

const profile = mkdtempSync(join(tmpdir(), 'car-chatui-'));
const response = await fetch(`${base}/`);
if (!response.ok) throw new Error(`preview odpowiedział ${response.status}`);
const html = (await response.text()).replace('</body>', `${probe}</body>`);

const probeFile = 'dist/__chatuiprobe.html';
writeFileSync(probeFile, html, 'utf8');

try {
  const dom = execFileSync(chromePath(), [
    '--headless=new',
    '--disable-gpu',
    '--window-size=1280,900',
    '--virtual-time-budget=45000',
    `--user-data-dir=${profile}`,
    '--dump-dom',
    `${base}/__chatuiprobe.html?skipIntro=1`
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  const match = /<pre id="probe-result">([\s\S]*?)<\/pre>/.exec(dom);
  if (!match) {
    console.log('Sonda nie wystartowała. Pierwsze 400 znaków:');
    console.log(dom.slice(0, 400));
    process.exit(1);
  }
  const r = JSON.parse(match[1]
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));

  let fails = 0;
  const check = (pass, line) => {
    if (!pass) fails += 1;
    console.log(`${pass ? 'ok  ' : 'FAIL'}  ${line}`);
  };

  console.log(`błędy JS: ${r.errors.length ? r.errors.join(' | ') : 'brak'}\n`);

  if (r.beforeGate) {
    check(r.beforeGate.gateVisible === true, 'bramka widoczna przed podaniem danych');
    check(r.beforeGate.logHidden === true && r.beforeGate.formHidden === true,
      `log i pole zasłonięte (log ${r.beforeGate.logHidden}, pole ${r.beforeGate.formHidden})`);
  }
  if (r.emptySubmit) {
    check(r.emptySubmit.stillGated === true && r.emptySubmit.errors.length > 0,
      `pusty formularz nie przechodzi: "${r.emptySubmit.errors.join(' / ')}"`);
  }
  if (r.badEmail) {
    check(r.badEmail.stillGated === true && r.badEmail.errors.length > 0,
      `zły adres nie przechodzi: "${r.badEmail.errors.join(' / ')}"`);
  }
  if (r.afterGate) {
    check(r.afterGate.gateHidden === true, 'bramka schodzi po poprawnych danych');
    check(r.afterGate.logHidden === false && r.afterGate.formHidden === false, 'log i pole odsłonięte');
    check(r.afterGate.stored.email === 'marco@example.com',
      `dane zapamiętane: ${r.afterGate.stored.name} / ${r.afterGate.stored.email}`);
  }

  if (r.chips) {
    console.log('');
    check(r.chips.count === 3, `trzy podpowiedzi, nie sześć: ${r.chips.count}`);
    check(r.chips.closedHeight === 0, `schowane na start (wysokość ${r.chips.closedHeight} px)`);
    check((r.chips.openHeight || 0) > 20, `rozwijają się (wysokość ${r.chips.openHeight} px)`);
    check(r.chips.clipped === 0, `żadna nie jest przycięta: ${r.chips.clipped}`);
    console.log(`      treść: ${r.chips.labels.join(' | ')}`);
  }

  if (r.typing) {
    console.log('');
    check(Math.abs(r.typing.scrollAfter - r.typing.scrollBefore) <= 2,
      `pisanie nie przesuwa strony: ${r.typing.scrollBefore} -> ${r.typing.scrollAfter} px`);
    check(r.typing.panelBefore === r.typing.panelAfter,
      `sekcja kontaktu nie przeskakuje pinned/flow: ${r.typing.panelBefore} -> ${r.typing.panelAfter}`);
    console.log(`      pole ma ${r.typing.inputHeight} px, scrollbar: ${r.typing.inputOverflow}`);
  }

  if (r.doubleSend) {
    console.log('');
    check(r.doubleSend.typingShown === true, 'wskaźnik pisania pokazuje się po wysłaniu');
    check(r.doubleSend.visitorBubbles === 1,
      `dwa kliknięcia = jedna wiadomość: ${r.doubleSend.visitorBubbles}`);
    check(r.doubleSend.visitorBubblesLater === 1,
      `i po cyklu pollingu nadal jedna: ${r.doubleSend.visitorBubblesLater}`);
    check(r.doubleSend.typingGone === true, 'wskaźnik pisania znika po odpowiedzi');
  }

  /* --------------------------------------------------- 1. pozycja przewinięcia */
  if (r.clicks) {
    console.log('');
    const missing = r.clicks.filter((c) => c.missing).map((c) => c.label);
    check(missing.length === 0, `wszystkie kontrolki znalezione${missing.length ? `, brakuje: ${missing.join(', ')}` : ''}`);
    for (const c of r.clicks.filter((one) => !one.missing)) {
      check(c.before === c.mid && c.before === c.after,
        `${c.label}: przewinięcie bez zmian (${c.before} -> ${c.mid} -> ${c.after} px)`);
    }
    const lost = r.clicks.filter((c) => !c.missing && c.focus === 'BODY').map((c) => c.label);
    check(lost.length === 0,
      `po żadnym kliknięciu fokus nie spada na <body>${lost.length ? `: ${lost.join(', ')}` : ''}`);
    console.log(`      fokus po kliknięciach: ${r.clicks.filter((c) => !c.missing).map((c) => `${c.label}=${c.focus}`).join(' | ')}`);
  }

  /* ------------------------------------- 2. i 3. kropki i bąbelek po pastylce */
  if (r.pill) {
    console.log('');
    check(r.pill.typingShown === true,
      'kropki pokazują się przy odpowiedzi automatu po naciśnięciu pastylki');
    check(r.pill.typingGone === true, 'i gasną, gdy odpowiedź wejdzie');
    check(r.pill.answered === true, 'odpowiedź kreatora naprawdę weszła do rozmowy');
    check(r.pill.bubbleAdded === 1,
      `naciśnięcie pastylki tworzy dokładnie jeden bąbelek gościa: ${r.pill.bubbleAdded}`);
    check(r.pill.bubbleText === r.pill.label,
      `bąbelek nosi treść pastylki: "${r.pill.bubbleText}" wobec "${r.pill.label}"`);
  } else {
    check(false, 'pomiar pastylki się nie wykonał');
  }

  if (r.codeBubble) {
    console.log('');
    check(r.codeBubble.fieldThere === true, 'pole na kod stoi w rozmowie');
    check(r.codeBubble.bubblesDelta === 0,
      `wpisanie kodu NIE tworzy bąbelka: ${r.codeBubble.bubblesDelta}`);
    check(r.codeBubble.codeInLog === false, 'sześciu cyfr nie ma w treści rozmowy');
  } else {
    check(false, 'pomiar pola na kod się nie wykonał');
  }

  /* --------------------------------------------- 5. klawiatura na telefonie */
  if (r.keyboard && r.keyboard.log && r.keyboard.composer) {
    console.log('');
    const k = r.keyboard;
    console.log(`      przy ekranie ${k.screen} px: dziennik ${k.log.height} px (sufit ${k.logCap}),`
      + ` pole ${k.inputHeight} px (sufit ${k.inputCap}), razem ${k.total} px`);
    const cap = Number.parseFloat(k.logCap);
    check(Number.isFinite(cap) && k.log.height <= cap + 1,
      `dziennik trzyma się sufitu, a nie własnego minimum: ${k.log.height} px wobec ${k.logCap}`);
    check(k.overlaps.logChips === 0 && k.overlaps.chipsComposer === 0 && k.overlaps.composerNote === 0,
      `nic nie nachodzi na siebie (dziennik/podpowiedzi ${k.overlaps.logChips},`
      + ` podpowiedzi/kompozytor ${k.overlaps.chipsComposer},`
      + ` kompozytor/notka ${k.overlaps.composerNote} px)`);
    check(k.total > 0 && k.total <= k.screen,
      `cały czat mieści się nad klawiaturą: ${k.total} px przy ${k.screen} px ekranu`);
    check(k.send !== null && k.composer !== null && k.send.bottom <= k.composer.bottom + 1,
      'przycisk wysyłki jest w kompozytorze, nie pod nim');
    const inputCap = Number.parseFloat(k.inputCap);
    check(Number.isFinite(inputCap) && k.inputHeight <= inputCap + 1,
      `pole nie rośnie ponad swój sufit: ${k.inputHeight} px wobec ${k.inputCap}`);
  } else {
    check(false, 'pomiar klawiatury się nie wykonał');
  }

  /* ------------------------------- 4a. przekazanie człowiekowi i powrót do automatu */
  if (r.handover) {
    console.log('');
    const h = r.handover;
    check(h.buttonVisible === true,
      `w rozmowie przekazanej człowiekowi widać wyjście do automatu (jest: ${h.buttonThere})`);
    check(h.buttonLabel === h.expectedLabel && h.buttonLabel.length > 0,
      `przycisk nosi napis ze słownika: "${h.buttonLabel}"`);
    check(h.panelMode === 'human', `panel wie, że rozmowę prowadzi człowiek: "${h.panelMode}"`);
    check(h.noticeShown === true, 'rozmowa mówi wprost, dlaczego automat milczy');
    check(h.botCalls === 1, `naciśnięcie wysyła dokładnie jedno żądanie powrotu: ${h.botCalls}`);
    check(h.buttonGone === true, 'po powrocie przycisk schodzi');
    check(h.panelModeAfter === 'ai', `panel wraca do automatu: "${h.panelModeAfter}"`);
    check(h.backLine === true, 'i mówi to w rozmowie');
    check(h.scrollBefore === h.scrollAfter,
      `powrót do automatu nie przesuwa strony: ${h.scrollBefore} -> ${h.scrollAfter} px`);
    check(h.focus !== 'BODY', `fokus po naciśnięciu: ${h.focus}`);
  } else {
    check(false, 'pomiar przekazania rozmowy się nie wykonał');
  }

  console.log(`\n${fails ? `${fails} niezaliczonych` : 'wszystko zaliczone'}`);
  process.exitCode = fails ? 1 : 0;
} finally {
  rmSync(probeFile, { force: true });
  rmSync(profile, { recursive: true, force: true });
}
